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

/**
 * Parse a single evaluator `output.result` string.
 *
 * Unified mode stores `JSON.stringify({ perFileIssues, crossFileIssues })`,
 * not a bare issue array. Matching only `\[[\s\S]*\]` drops those findings and
 * produced empty `issues[]` in CLI JSON reports / UI imports.
 */
export function parseIssuesFromResultString(resultString: string): Issue[] {
	try {
		const parsed = JSON.parse(resultString);

		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			const allIssues: Issue[] = [];
			if (parsed.perFileIssues && typeof parsed.perFileIssues === "object") {
				for (const fileIssues of Object.values(parsed.perFileIssues)) {
					if (Array.isArray(fileIssues)) {
						allIssues.push(...(fileIssues as Issue[]));
					}
				}
			}
			if (Array.isArray(parsed.crossFileIssues)) {
				allIssues.push(...parsed.crossFileIssues);
			}
			return allIssues;
		}

		if (Array.isArray(parsed)) {
			return parsed as Issue[];
		}

		return [];
	} catch {
		try {
			const jsonMatch = resultString.match(/\[[\s\S]*\]/);
			if (!jsonMatch) {
				return [];
			}
			const issues = JSON.parse(jsonMatch[0]) as Issue[];
			return Array.isArray(issues) ? issues : [];
		} catch {
			return [];
		}
	}
}

export function extractAllIssues(output: EvaluationOutput): Issue[] {
	const allIssues: Issue[] = [];

	// Check if unified format (has 'results' array)
	if ("results" in output && Array.isArray(output.results)) {
		for (const result of output.results) {
			if (result.output?.result) {
				const parsedIssues = parseIssuesFromResultString(result.output.result);
				for (const issue of parsedIssues) {
					allIssues.push({
						...issue,
						evaluatorName: issue.evaluatorName || result.evaluator,
					});
				}
			}
		}

		if ("crossFileIssues" in output && Array.isArray(output.crossFileIssues)) {
			for (const issue of output.crossFileIssues) {
				allIssues.push({
					...issue,
					evaluatorName: issue.evaluatorName || "cross-file",
				});
			}
		}
	} else if ("files" in output && typeof output.files === "object") {
		// Independent format: extract from files map
		for (const [_filePath, fileResult] of Object.entries(output.files)) {
			const typedResult = fileResult as FileEvaluationResult;
			if (typedResult.evaluations) {
				for (const evaluation of typedResult.evaluations) {
					const typedEval = evaluation as EvaluatorResult;
					if (typedEval.issues && typedEval.issues.length > 0) {
						for (const issue of typedEval.issues) {
							allIssues.push({
								...issue,
								evaluatorName: issue.evaluatorName || typedEval.evaluator,
							});
						}
					} else if (
						"output" in evaluation &&
						evaluation.output &&
						typeof evaluation.output === "object" &&
						"result" in evaluation.output &&
						typeof evaluation.output.result === "string"
					) {
						const parsedIssues = parseIssuesFromResultString(
							evaluation.output.result,
						);
						for (const issue of parsedIssues) {
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
				allIssues.push({
					...issue,
					evaluatorName: issue.evaluatorName || "cross-file",
				});
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
// Convert JSON Report back to EvaluationOutput (for import)
// =============================================================================

export function convertJsonReportToEvaluationOutput(
	report: IJsonReport,
): EvaluationOutput {
	// Group issues by evaluator name
	const issuesByEvaluator = new Map<string, Issue[]>();
	const crossFileIssues: Issue[] = [];

	for (const issue of report.issues) {
		// Strip enriched fields (severityLevel, formattedLocation) that don't belong in Issue
		const {
			severityLevel: _sl,
			formattedLocation: _fl,
			...baseIssue
		} = issue as Issue & {
			severityLevel?: string;
			formattedLocation?: string;
		};
		const cleaned = baseIssue as Issue;
		const evaluator = cleaned.evaluatorName || "unknown";

		// Keep consistency-validator issues on the top-level list only
		if (evaluator === "cross-file") {
			crossFileIssues.push(cleaned);
			continue;
		}

		const existing = issuesByEvaluator.get(evaluator) || [];
		existing.push(cleaned);
		issuesByEvaluator.set(evaluator, existing);
	}

	// Build unified results array (array format — frontend/API parse both shapes)
	const results = Array.from(issuesByEvaluator.entries()).map(
		([evaluator, issues]) => ({
			evaluator,
			output: {
				type: "result" as const,
				subtype: "imported" as const,
				is_error: false,
				duration_ms: 0,
				num_turns: 0,
				result: JSON.stringify(issues),
				session_id: "",
				total_cost_usd: 0,
				usage: {
					input_tokens: 0,
					output_tokens: 0,
					cache_creation_input_tokens: 0,
					cache_read_input_tokens: 0,
				},
				uuid: "",
			},
		}),
	);

	return {
		metadata: report.metadata,
		results,
		crossFileIssues,
		curation: report.curation,
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
