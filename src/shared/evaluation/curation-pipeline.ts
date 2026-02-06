/**
 * Curation pipeline - dual curation for errors and suggestions
 *
 * Extracted from engine.ts to eliminate code duplication between
 * runUnifiedMode() and runIndependentMode()
 */

import type { IAIProvider } from "@shared/providers";
import type {
	ICurationOutput,
	ICurationResult,
	Issue,
	ProgressCallback,
} from "@shared/types/evaluation";
import { getIssueTypeFromEvaluatorName } from "./evaluator-types";
import {
	curateIssuesByImpact,
	mapCuratedToOriginalIssues,
} from "./impact-curator";

/**
 * Options for curation pipeline
 */
export interface CurationOptions {
	/** Whether curation is enabled (default: true) */
	enabled?: boolean;
	/** Maximum errors to keep after curation (default: 30) */
	errorTopN?: number;
	/** Maximum suggestions to keep after curation (default: 30) */
	suggestionTopN?: number;
	/** Verbose logging */
	verbose?: boolean;
	/** Working directory for curation context */
	workingDir?: string;
	/** AI provider for curation */
	provider?: IAIProvider;
	/** Progress callback for UI updates */
	progressCallback?: ProgressCallback;
}

/**
 * Result from curation pipeline
 */
export interface CurationPipelineResult {
	/** Curation output for the result */
	curationOutput?: ICurationOutput;
	/** Error curation result (if performed) */
	errorCurationResult: ICurationResult | null;
	/** Suggestion curation result (if performed) */
	suggestionCurationResult: ICurationResult | null;
}

/**
 * Separate issues into errors and suggestions based on evaluator type
 */
export function separateIssuesByType(issues: Issue[]): {
	errors: Issue[];
	suggestions: Issue[];
} {
	const errors = issues.filter(
		(issue) =>
			getIssueTypeFromEvaluatorName(
				(issue as Issue & { evaluatorName?: string }).evaluatorName || "",
			) === "error",
	);
	const suggestions = issues.filter(
		(issue) =>
			getIssueTypeFromEvaluatorName(
				(issue as Issue & { evaluatorName?: string }).evaluatorName || "",
			) === "suggestion",
	);

	return { errors, suggestions };
}

/**
 * Execute the curation pipeline for errors and suggestions
 *
 * Curation is performed separately for errors and suggestions:
 * - Errors are curated if count > errorTopN (default 30)
 * - Suggestions are curated if count > suggestionTopN (default 30)
 */
export async function executeCurationPipeline(
	issues: Issue[],
	options: CurationOptions = {},
): Promise<CurationPipelineResult> {
	const {
		enabled = true,
		errorTopN = 30,
		suggestionTopN = 30,
		verbose = false,
		workingDir,
		provider,
		progressCallback,
	} = options;

	// If disabled, return empty result
	if (!enabled) {
		return {
			curationOutput: undefined,
			errorCurationResult: null,
			suggestionCurationResult: null,
		};
	}

	// Separate issues by type
	const { errors, suggestions } = separateIssuesByType(issues);

	let errorCurationResult: ICurationResult | null = null;
	let suggestionCurationResult: ICurationResult | null = null;

	// Curate errors if threshold met
	if (errors.length > errorTopN) {
		if (progressCallback) {
			progressCallback({
				type: "curation.started",
				data: { totalIssues: errors.length, issueType: "error" },
			});
		}

		if (verbose) {
			console.log(
				`[Curation] Starting error curation (${errors.length} errors > ${errorTopN} threshold)...`,
			);
		}

		errorCurationResult = await curateIssuesByImpact(errors, {
			topN: errorTopN,
			verbose,
			cwd: workingDir,
			issueTypeFilter: "error",
			provider,
		});

		if (progressCallback && errorCurationResult) {
			progressCallback({
				type: "curation.completed",
				data: {
					curatedCount: errorCurationResult.curatedIssues.length,
					issueType: "error",
				},
			});
		}

		if (verbose) {
			console.log(
				`[Curation] Error curation completed: ${errorCurationResult?.curatedIssues.length ?? 0} selected`,
			);
		}
	}

	// Curate suggestions if threshold met
	if (suggestions.length > suggestionTopN) {
		if (progressCallback) {
			progressCallback({
				type: "curation.started",
				data: { totalIssues: suggestions.length, issueType: "suggestion" },
			});
		}

		if (verbose) {
			console.log(
				`[Curation] Starting suggestion curation (${suggestions.length} suggestions > ${suggestionTopN} threshold)...`,
			);
		}

		suggestionCurationResult = await curateIssuesByImpact(suggestions, {
			topN: suggestionTopN,
			verbose,
			cwd: workingDir,
			issueTypeFilter: "suggestion",
			provider,
		});

		if (progressCallback && suggestionCurationResult) {
			progressCallback({
				type: "curation.completed",
				data: {
					curatedCount: suggestionCurationResult.curatedIssues.length,
					issueType: "suggestion",
				},
			});
		}

		if (verbose) {
			console.log(
				`[Curation] Suggestion curation completed: ${suggestionCurationResult?.curatedIssues.length ?? 0} selected`,
			);
		}
	}

	// Build curation output
	const curationOutput = buildCurationOutput(
		errorCurationResult,
		errors,
		suggestionCurationResult,
		suggestions,
	);

	return {
		curationOutput,
		errorCurationResult,
		suggestionCurationResult,
	};
}

/**
 * Build curation output from curation results
 */
export function buildCurationOutput(
	errorCurationResult: ICurationResult | null,
	errors: Issue[],
	suggestionCurationResult: ICurationResult | null,
	suggestions: Issue[],
): ICurationOutput | undefined {
	if (!errorCurationResult && !suggestionCurationResult) {
		return undefined;
	}

	const curationOutput: ICurationOutput = {};

	if (errorCurationResult) {
		curationOutput.errors = {
			curatedIssues:
				mapCuratedToOriginalIssues(errorCurationResult, errors).curatedIssues ??
				[],
			summary: {
				totalIssuesReviewed: errorCurationResult.totalIssuesReviewed,
			},
		};
	}

	if (suggestionCurationResult) {
		curationOutput.suggestions = {
			curatedIssues:
				mapCuratedToOriginalIssues(suggestionCurationResult, suggestions)
					.curatedIssues ?? [],
			summary: {
				totalIssuesReviewed: suggestionCurationResult.totalIssuesReviewed,
			},
		};
	}

	return curationOutput;
}

/**
 * Calculate curation metadata for inclusion in evaluation results
 */
export function calculateCurationMetadata(
	errorCurationResult: ICurationResult | null,
	suggestionCurationResult: ICurationResult | null,
	enabled: boolean,
): {
	curationEnabled: boolean;
	errorsCuratedCount?: number;
	suggestionsCuratedCount?: number;
	errorCurationCostUsd?: number;
	suggestionCurationCostUsd?: number;
	errorCurationDurationMs?: number;
	suggestionCurationDurationMs?: number;
	totalCuratedCount: number;
	totalCurationCostUsd: number;
	totalCurationDurationMs: number;
} {
	return {
		curationEnabled: enabled,
		errorsCuratedCount: errorCurationResult?.curatedIssues.length,
		suggestionsCuratedCount: suggestionCurationResult?.curatedIssues.length,
		errorCurationCostUsd: errorCurationResult?.cost_usd,
		suggestionCurationCostUsd: suggestionCurationResult?.cost_usd,
		errorCurationDurationMs: errorCurationResult?.duration_ms,
		suggestionCurationDurationMs: suggestionCurationResult?.duration_ms,
		totalCuratedCount:
			(errorCurationResult?.curatedIssues.length ?? 0) +
			(suggestionCurationResult?.curatedIssues.length ?? 0),
		totalCurationCostUsd:
			(errorCurationResult?.cost_usd ?? 0) +
			(suggestionCurationResult?.cost_usd ?? 0),
		totalCurationDurationMs:
			(errorCurationResult?.duration_ms ?? 0) +
			(suggestionCurationResult?.duration_ms ?? 0),
	};
}
