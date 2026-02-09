/**
 * Stats routes - Evaluator hit rates across all evaluations
 */

import type {
	ICostStatsResponse,
	IEvaluatorStat,
	IEvaluatorStatsResponse,
} from "@shared/types/api";
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
}
