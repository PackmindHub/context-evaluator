/**
 * Report formatters for CLI output modes
 * - RAW: Minimal JSON output to stdout (machine-readable, pipeable)
 * - JSON: Comprehensive report to file matching all UI data
 */

import type {
	EvaluatorResult,
	FileEvaluationResult,
} from "@shared/evaluation/runner";
import type {
	EvaluationOutput,
	IContextScore,
	ICurationOutput,
	IProjectContext,
	Issue,
	Metadata,
} from "@shared/types/evaluation";
import { formatLocation, getSeverityLevel } from "@shared/types/issues";

// =============================================================================
// RAW Report - Minimal structure for stdout piping
// =============================================================================

export interface IRawReport {
	summary: {
		totalFiles: number;
		totalIssues: number;
		highCount: number;
		mediumCount: number;
		lowCount: number;
		contextScore?: number;
		contextGrade?: string;
	};
	issues: Array<{
		severity: number;
		severityLevel: string;
		issueType: string;
		category: string;
		title: string;
		location: string;
		evaluator: string;
	}>;
}

// =============================================================================
// JSON Report - Complete UI data
// =============================================================================

export interface IJsonReport {
	metadata: Metadata;
	contextScore?: IContextScore;
	projectContext?: IProjectContext;
	statistics: {
		totalIssues: number;
		perFileIssues: number;
		crossFileIssues: number;
		severity: {
			high: number;
			medium: number;
			low: number;
		};
		issueTypes: {
			errors: number;
			suggestions: number;
		};
	};
	issues: Array<
		Issue & {
			// Enriched fields for easier consumption
			severityLevel: string;
			formattedLocation: string;
		}
	>;
	curation?: ICurationOutput;
	costAnalysis: {
		tokenUsage: {
			input: number;
			output: number;
			cacheCreation: number;
			cacheRead: number;
			total: number;
		};
		cost: {
			totalUsd: number;
			contextAnalysisUsd: number;
			curationUsd: number;
		};
		performance: {
			totalDurationMs: number;
			contextAnalysisDurationMs: number;
			curationDurationMs: number;
		};
	};
}

// =============================================================================
// Helper: Extract all issues from evaluation output
// =============================================================================

export function extractAllIssues(output: EvaluationOutput): Issue[] {
	const allIssues: Issue[] = [];

	// Check if unified format (has 'results' array)
	if ("results" in output && Array.isArray(output.results)) {
		// Unified format: extract from results array
		for (const result of output.results) {
			if (result.output?.result) {
				try {
					const jsonMatch = result.output.result.match(/\[[\s\S]*\]/);
					if (jsonMatch) {
						const issues = JSON.parse(jsonMatch[0]) as Issue[];
						if (Array.isArray(issues)) {
							for (const issue of issues) {
								allIssues.push({
									...issue,
									evaluatorName: issue.evaluatorName || result.evaluator,
								});
							}
						}
					}
				} catch {
					// Skip unparseable results
				}
			}
		}
	} else if ("files" in output && typeof output.files === "object") {
		// Independent format: extract from files map
		for (const [_filePath, fileResult] of Object.entries(output.files)) {
			const typedResult = fileResult as FileEvaluationResult;
			if (typedResult.evaluations) {
				for (const evaluation of typedResult.evaluations) {
					const typedEval = evaluation as EvaluatorResult;
					if (typedEval.issues) {
						for (const issue of typedEval.issues) {
							allIssues.push({
								...issue,
								evaluatorName: issue.evaluatorName || typedEval.evaluator,
							});
						}
					}
				}
			}
		}

		// Also include cross-file issues
		if ("crossFileIssues" in output && Array.isArray(output.crossFileIssues)) {
			for (const issue of output.crossFileIssues) {
				allIssues.push(issue);
			}
		}
	}

	// Sort by severity (highest first)
	allIssues.sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0));

	return allIssues;
}

// =============================================================================
// Build RAW Report
// =============================================================================

export function buildRawReport(output: EvaluationOutput): IRawReport {
	const { metadata } = output;
	const allIssues = extractAllIssues(output);

	// Count low severity issues
	const lowCount = allIssues.filter((i) => (i.severity ?? 0) < 4).length;

	return {
		summary: {
			totalFiles: metadata.totalFiles,
			totalIssues: metadata.totalIssues ?? 0,
			highCount: metadata.highCount ?? 0,
			mediumCount: metadata.mediumCount ?? 0,
			lowCount,
			contextScore: metadata.contextScore?.score,
			contextGrade: metadata.contextScore?.grade,
		},
		issues: allIssues.map((issue) => ({
			severity: issue.severity ?? 0,
			severityLevel: getSeverityLevel(issue.severity ?? 0),
			issueType: issue.issueType ?? "error",
			category: issue.category,
			title:
				issue.title || issue.problem || issue.description || "Unnamed issue",
			location: formatLocation(issue.location),
			evaluator: issue.evaluatorName ?? "unknown",
		})),
	};
}

// =============================================================================
// Build JSON Report
// =============================================================================

export function buildJsonReport(output: EvaluationOutput): IJsonReport {
	const { metadata } = output;
	const allIssues = extractAllIssues(output);

	// Count issue types
	const errorCount = allIssues.filter(
		(i) => i.issueType === "error" || !i.issueType,
	).length;
	const suggestionCount = allIssues.filter(
		(i) => i.issueType === "suggestion",
	).length;

	// Count low severity issues
	const lowCount = allIssues.filter((i) => (i.severity ?? 0) < 4).length;

	// Get curation data
	const curation = "curation" in output ? output.curation : undefined;

	// Calculate total curation cost and duration
	const curationCostUsd =
		(metadata.curationCostUsd ?? 0) +
		(metadata.errorCurationCostUsd ?? 0) +
		(metadata.suggestionCurationCostUsd ?? 0);

	const curationDurationMs =
		(metadata.curationDurationMs ?? 0) +
		(metadata.errorCurationDurationMs ?? 0) +
		(metadata.suggestionCurationDurationMs ?? 0);

	return {
		metadata,
		contextScore: metadata.contextScore,
		projectContext: metadata.projectContext,
		statistics: {
			totalIssues: metadata.totalIssues ?? 0,
			perFileIssues: metadata.perFileIssues ?? 0,
			crossFileIssues: metadata.crossFileIssues ?? 0,
			severity: {
				high: metadata.highCount ?? 0,
				medium: metadata.mediumCount ?? 0,
				low: lowCount,
			},
			issueTypes: {
				errors: errorCount,
				suggestions: suggestionCount,
			},
		},
		issues: allIssues.map((issue) => ({
			...issue,
			severityLevel: getSeverityLevel(issue.severity ?? 0),
			formattedLocation: formatLocation(issue.location),
		})),
		curation,
		costAnalysis: {
			tokenUsage: {
				input: metadata.totalInputTokens ?? 0,
				output: metadata.totalOutputTokens ?? 0,
				cacheCreation: metadata.totalCacheCreationTokens ?? 0,
				cacheRead: metadata.totalCacheReadTokens ?? 0,
				total:
					(metadata.totalInputTokens ?? 0) +
					(metadata.totalOutputTokens ?? 0) +
					(metadata.totalCacheCreationTokens ?? 0) +
					(metadata.totalCacheReadTokens ?? 0),
			},
			cost: {
				totalUsd: metadata.totalCostUsd ?? 0,
				contextAnalysisUsd: metadata.contextIdentificationCostUsd ?? 0,
				curationUsd: curationCostUsd,
			},
			performance: {
				totalDurationMs: metadata.totalDurationMs ?? 0,
				contextAnalysisDurationMs:
					metadata.contextIdentificationDurationMs ?? 0,
				curationDurationMs: curationDurationMs,
			},
		},
	};
}
