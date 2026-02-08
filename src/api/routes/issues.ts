/**
 * Issues routes - Aggregated issues across all evaluations
 */

import type {
	IAggregatedIssue,
	IAggregatedIssuesResponse,
} from "@shared/types/api";
import { getIssueSeverity } from "@shared/types/evaluation";
import { getSeverityLevel } from "@shared/types/issues";
import { evaluationRepository } from "../db/evaluation-repository";
import { extractIssuesFromEvaluation } from "../utils/issue-extractor";
import { internalErrorResponse, okResponse } from "../utils/response-builder";

export class IssuesRoutes {
	/**
	 * GET /api/issues - Paginated, filtered list of all issues across evaluations
	 */
	async list(req: Request): Promise<Response> {
		try {
			const url = new URL(req.url);

			// Parse query parameters
			const page = Math.max(
				1,
				parseInt(url.searchParams.get("page") || "1", 10),
			);
			const pageSize = Math.min(
				100,
				Math.max(1, parseInt(url.searchParams.get("pageSize") || "25", 10)),
			);
			const evaluatorFilter = url.searchParams.get("evaluator") || undefined;
			const severityFilter = url.searchParams.get("severity") || undefined;
			const repositoryFilter = url.searchParams.get("repository") || undefined;
			const issueTypeFilter = url.searchParams.get("issueType") || undefined;
			const searchFilter = url.searchParams.get("search") || undefined;

			// Load all completed evaluations with results
			const evaluations =
				evaluationRepository.getAllCompletedEvaluationsWithResults();

			// Extract and enrich all issues
			const allAggregatedIssues: IAggregatedIssue[] = [];
			const evaluatorSet = new Set<string>();
			const repositorySet = new Set<string>();

			for (const evaluation of evaluations) {
				const issues = extractIssuesFromEvaluation(evaluation.result);
				repositorySet.add(evaluation.repositoryUrl);

				for (const issue of issues) {
					const evaluatorName = issue.evaluatorName || "unknown";
					evaluatorSet.add(evaluatorName);

					allAggregatedIssues.push({
						issue,
						evaluationId: evaluation.id,
						repositoryUrl: evaluation.repositoryUrl,
						evaluationDate: evaluation.completedAt,
						evaluatorName,
					});
				}
			}

			// Apply filters
			let filtered = allAggregatedIssues;

			if (evaluatorFilter) {
				filtered = filtered.filter(
					(ai) => ai.evaluatorName === evaluatorFilter,
				);
			}

			if (severityFilter) {
				filtered = filtered.filter((ai) => {
					const numericSeverity = getIssueSeverity(ai.issue);
					const level = getSeverityLevel(numericSeverity);
					return level === severityFilter;
				});
			}

			if (repositoryFilter) {
				filtered = filtered.filter(
					(ai) => ai.repositoryUrl === repositoryFilter,
				);
			}

			if (issueTypeFilter) {
				filtered = filtered.filter(
					(ai) => ai.issue.issueType === issueTypeFilter,
				);
			}

			if (searchFilter) {
				const searchLower = searchFilter.toLowerCase();
				filtered = filtered.filter((ai) => {
					const searchableText = [
						ai.issue.description,
						ai.issue.problem,
						ai.issue.title,
						ai.issue.category,
					]
						.filter(Boolean)
						.join(" ")
						.toLowerCase();
					return searchableText.includes(searchLower);
				});
			}

			// Paginate
			const totalItems = filtered.length;
			const totalPages = Math.ceil(totalItems / pageSize);
			const startIndex = (page - 1) * pageSize;
			const paginatedIssues = filtered.slice(startIndex, startIndex + pageSize);

			const response: IAggregatedIssuesResponse = {
				issues: paginatedIssues,
				pagination: {
					page,
					pageSize,
					totalItems,
					totalPages,
				},
				availableFilters: {
					evaluators: Array.from(evaluatorSet).sort(),
					repositories: Array.from(repositorySet).sort(),
				},
			};

			return okResponse(response);
		} catch (err: unknown) {
			console.error("[IssuesRoutes] Error in GET /api/issues:", err);
			return internalErrorResponse("Failed to fetch aggregated issues");
		}
	}
}
