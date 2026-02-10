/**
 * Stats routes - Evaluator hit rates across all evaluations
 */

import type {
	ICostStatsResponse,
	IEvaluatorStat,
	IEvaluatorStatsResponse,
	IEvaluatorTokenStat,
	ITokenStatsResponse,
} from "@shared/types/api";
import {
	type EvaluationOutput,
	isIndependentFormat,
	isUnifiedFormat,
} from "@shared/types/evaluation";
import { evaluationRepository } from "../db/evaluation-repository";
import { getEvaluators } from "../utils/evaluator-utils";
import { extractIssuesFromEvaluation } from "../utils/issue-extractor";
import { internalErrorResponse, okResponse } from "../utils/response-builder";

export class StatsRoutes {
	private evaluatorsDir: string;

	constructor(evaluatorsDir: string) {
		this.evaluatorsDir = evaluatorsDir;
	}

	/**
	 * GET /api/stats - Evaluator stats across all evaluations
	 */
	async get(_req: Request): Promise<Response> {
		try {
			// Load evaluator metadata for display names and issue types
			const evaluatorInfos = await getEvaluators(this.evaluatorsDir);

			// Load all completed evaluations
			const evaluations =
				evaluationRepository.getAllCompletedEvaluationsWithResults();

			// Track per-evaluator stats
			const repoSets = new Map<string, Set<string>>(); // evaluatorName -> Set<repoUrl>
			const issueCounts = new Map<string, number>(); // evaluatorName -> total issues
			const allRepos = new Set<string>();

			for (const evaluation of evaluations) {
				const issues = extractIssuesFromEvaluation(evaluation.result);
				allRepos.add(evaluation.repositoryUrl);

				for (const issue of issues) {
					const evaluatorName = issue.evaluatorName || "unknown";

					// Skip the pseudo-evaluator
					if (evaluatorName === "cross-file") continue;

					if (!repoSets.has(evaluatorName)) {
						repoSets.set(evaluatorName, new Set());
					}
					repoSets.get(evaluatorName)!.add(evaluation.repositoryUrl);

					issueCounts.set(
						evaluatorName,
						(issueCounts.get(evaluatorName) || 0) + 1,
					);
				}
			}

			// Build response: merge with evaluator metadata
			const stats: IEvaluatorStat[] = [];

			for (const info of evaluatorInfos) {
				const strippedId = info.id.replace(/^\d+-/, "");
				const repoCount = repoSets.get(strippedId)?.size ?? 0;
				const totalIssueCount = issueCounts.get(strippedId) ?? 0;

				stats.push({
					evaluatorId: strippedId,
					evaluatorName: info.name,
					issueType: info.issueType,
					repoCount,
					totalIssueCount,
				});
			}

			// Sort by repoCount descending, then by totalIssueCount descending
			stats.sort((a, b) => {
				if (b.repoCount !== a.repoCount) return b.repoCount - a.repoCount;
				return b.totalIssueCount - a.totalIssueCount;
			});

			const response: IEvaluatorStatsResponse = {
				evaluators: stats,
				totalReposEvaluated: allRepos.size,
			};

			return okResponse(response);
		} catch (err: unknown) {
			console.error("[StatsRoutes] Error in GET /api/stats:", err);
			return internalErrorResponse("Failed to fetch evaluator stats");
		}
	}

	/**
	 * GET /api/stats/costs - Cost overview stats
	 */
	async getCosts(_req: Request): Promise<Response> {
		try {
			const topReposByCost = evaluationRepository.getTopReposByCost(10);
			const costByAgent = evaluationRepository.getCostByAgent();

			const response: ICostStatsResponse = {
				topReposByCost,
				costByAgent,
			};

			return okResponse(response);
		} catch (err: unknown) {
			console.error("[StatsRoutes] Error in GET /api/stats/costs:", err);
			return internalErrorResponse("Failed to fetch cost stats");
		}
	}

	/**
	 * GET /api/stats/tokens - Per-evaluator token consumption stats
	 */
	async getTokenStats(_req: Request): Promise<Response> {
		try {
			const evaluations =
				evaluationRepository.getAllCompletedEvaluationsWithResults();

			// Load evaluator metadata for display names
			const evaluatorInfos = await getEvaluators(this.evaluatorsDir);
			const evaluatorNameMap = new Map<string, string>();
			for (const info of evaluatorInfos) {
				const strippedId = info.id.replace(/^\d+-/, "");
				evaluatorNameMap.set(strippedId, info.name);
			}

			// Accumulators per evaluator
			const evaluatorAccum = new Map<
				string,
				{
					totalInput: number;
					totalOutput: number;
					totalCost: number;
					count: number;
				}
			>();

			// Context identification accumulators
			let ctxTotalInput = 0;
			let ctxTotalOutput = 0;
			let ctxTotalCost = 0;
			let ctxCount = 0;

			for (const evaluation of evaluations) {
				const result = evaluation.result;

				// Extract context identification tokens from metadata
				const meta = result.metadata;
				if (
					meta.contextIdentificationInputTokens != null &&
					meta.contextIdentificationOutputTokens != null
				) {
					ctxTotalInput += meta.contextIdentificationInputTokens;
					ctxTotalOutput += meta.contextIdentificationOutputTokens;
					ctxTotalCost += meta.contextIdentificationCostUsd ?? 0;
					ctxCount++;
				}

				// Extract per-evaluator tokens
				this.extractEvaluatorTokens(result, evaluatorAccum);
			}

			// Build per-evaluator stats sorted by total tokens descending
			const evaluatorStats: IEvaluatorTokenStat[] = [];
			for (const [evaluatorId, accum] of evaluatorAccum) {
				if (accum.count === 0) continue;
				evaluatorStats.push({
					evaluatorId,
					evaluatorName: evaluatorNameMap.get(evaluatorId) ?? evaluatorId,
					avgInputTokens: Math.round(accum.totalInput / accum.count),
					avgOutputTokens: Math.round(accum.totalOutput / accum.count),
					avgCostUsd: accum.totalCost / accum.count,
					sampleCount: accum.count,
				});
			}

			evaluatorStats.sort((a, b) => {
				const totalA = a.avgInputTokens + a.avgOutputTokens;
				const totalB = b.avgInputTokens + b.avgOutputTokens;
				return totalB - totalA;
			});

			const response: ITokenStatsResponse = {
				evaluators: evaluatorStats,
				contextIdentification:
					ctxCount > 0
						? {
								avgInputTokens: Math.round(ctxTotalInput / ctxCount),
								avgOutputTokens: Math.round(ctxTotalOutput / ctxCount),
								avgCostUsd: ctxTotalCost / ctxCount,
								sampleCount: ctxCount,
							}
						: null,
				totalEvaluationsAnalyzed: evaluations.length,
			};

			return okResponse(response);
		} catch (err: unknown) {
			console.error("[StatsRoutes] Error in GET /api/stats/tokens:", err);
			return internalErrorResponse("Failed to fetch token stats");
		}
	}

	/**
	 * Extract per-evaluator token usage from an evaluation result
	 */
	private extractEvaluatorTokens(
		result: EvaluationOutput,
		accum: Map<
			string,
			{
				totalInput: number;
				totalOutput: number;
				totalCost: number;
				count: number;
			}
		>,
	): void {
		if (isUnifiedFormat(result)) {
			for (const entry of result.results) {
				if (!entry.output?.usage) continue;
				const evaluatorId = entry.evaluator;
				const existing = accum.get(evaluatorId) ?? {
					totalInput: 0,
					totalOutput: 0,
					totalCost: 0,
					count: 0,
				};
				existing.totalInput += entry.output.usage.input_tokens ?? 0;
				existing.totalOutput += entry.output.usage.output_tokens ?? 0;
				existing.totalCost += entry.output.total_cost_usd ?? 0;
				existing.count++;
				accum.set(evaluatorId, existing);
			}
		} else if (isIndependentFormat(result)) {
			for (const fileData of Object.values(result.files)) {
				const fileResult = fileData as {
					evaluations?: Array<{
						evaluator: string;
						usage?: { input_tokens?: number; output_tokens?: number };
						cost_usd?: number;
					}>;
				};
				if (!fileResult.evaluations) continue;
				for (const evalEntry of fileResult.evaluations) {
					if (!evalEntry.usage) continue;
					const evaluatorId = evalEntry.evaluator;
					const existing = accum.get(evaluatorId) ?? {
						totalInput: 0,
						totalOutput: 0,
						totalCost: 0,
						count: 0,
					};
					existing.totalInput += evalEntry.usage.input_tokens ?? 0;
					existing.totalOutput += evalEntry.usage.output_tokens ?? 0;
					existing.totalCost += evalEntry.cost_usd ?? 0;
					existing.count++;
					accum.set(evaluatorId, existing);
				}
			}
		}
	}
}
