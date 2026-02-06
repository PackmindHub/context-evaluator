// Type definitions for evaluation results
// Based on src/commands/evaluate.ts and src/lib/results-processor.ts

export interface Location {
	file?: string;
	start: number;
	end: number;
}

export interface Issue {
	category: string;
	severity: number;
	problem?: string;
	description?: string;
	title?: string;
	location: Location | Location[];
	impact?: string;
	fix?: string;
	recommendation?: string;
	suggestion?: string;
	affectedFiles?: string[];
	isMultiFile?: boolean;
	context?: string;
	quote?: string;
	pattern?: string;
	issue?: string;
}

export interface Usage {
	input_tokens: number;
	output_tokens: number;
	cache_creation_input_tokens: number;
	cache_read_input_tokens: number;
	server_tool_use?: {
		web_search_requests: number;
		web_fetch_requests: number;
	};
	service_tier?: string;
	cache_creation?: {
		ephemeral_1h_input_tokens: number;
		ephemeral_5m_input_tokens: number;
	};
}

export interface ModelUsage {
	[model: string]: {
		inputTokens: number;
		outputTokens: number;
		cacheReadInputTokens: number;
		cacheCreationInputTokens: number;
		webSearchRequests: number;
		costUSD: number;
		contextWindow: number;
		maxOutputTokens: number;
	};
}

export interface EvaluatorOutput {
	type: string;
	subtype: string;
	is_error: boolean;
	duration_ms: number;
	duration_api_ms?: number;
	num_turns: number;
	result: string;
	session_id: string;
	total_cost_usd: number;
	usage: Usage;
	modelUsage?: ModelUsage;
	permission_denials?: unknown[];
	uuid: string;
}

export interface FileEvaluation {
	evaluator: string;
	output?: EvaluatorOutput;
	error?: string;
}

export interface FileResult {
	evaluations: FileEvaluation[];
	totalIssues: number;
	highCount: number;
	mediumCount: number;
	totalInputTokens?: number;
	totalOutputTokens?: number;
	totalCacheCreationTokens?: number;
	totalCacheReadTokens?: number;
	totalCostUsd?: number;
	totalDuration?: number;
}

export interface Metadata {
	generatedAt: string;
	agent: string;
	evaluationMode: string;
	totalFiles: number;
	totalIssues?: number;
	perFileIssues?: number;
	crossFileIssues?: number;
	highCount?: number;
	mediumCount?: number;
	totalInputTokens?: number;
	totalOutputTokens?: number;
	totalCacheCreationTokens?: number;
	totalCacheReadTokens?: number;
	totalCostUsd?: number;
	totalDurationMs?: number;
	filesEvaluated?: string[];
}

// Independent evaluation mode format
export interface IndependentEvaluationOutput {
	metadata: Metadata;
	files: Record<string, FileResult>;
	crossFileIssues: Issue[];
}

// Unified evaluation mode format
export interface UnifiedEvaluatorResult {
	evaluator: string;
	output?: EvaluatorOutput;
	error?: string;
}

export interface UnifiedEvaluationOutput {
	metadata: Metadata;
	results: UnifiedEvaluatorResult[];
}

// Union type for both formats
export type EvaluationOutput =
	| IndependentEvaluationOutput
	| UnifiedEvaluationOutput;

// Type guards
export function isUnifiedFormat(
	output: EvaluationOutput,
): output is UnifiedEvaluationOutput {
	return "results" in output && Array.isArray(output.results);
}

export function isIndependentFormat(
	output: EvaluationOutput,
): output is IndependentEvaluationOutput {
	return "files" in output && typeof output.files === "object";
}

// Severity helpers
// Thresholds: High (8-10), Medium (6-7), Low (5)
export function getSeverityLevel(severity: number): "high" | "medium" | "low" {
	if (severity >= 8) return "high";
	if (severity >= 6) return "medium";
	return "low";
}

export function getSeverityColor(severity: number): string {
	if (severity >= 8) return "text-red-600 bg-red-50 border-red-200";
	if (severity >= 6) return "text-orange-600 bg-orange-50 border-orange-200";
	return "text-yellow-600 bg-yellow-50 border-yellow-200";
}

export function getSeverityEmoji(severity: number): string {
	if (severity >= 8) return "🔴";
	if (severity >= 6) return "🟠";
	return "🟡";
}

// Parse evaluator result string to extract issues
export function parseEvaluatorResult(resultString: string): Issue[] {
	try {
		// First, try to parse as JSON directly
		const parsed = JSON.parse(resultString);

		// Handle unified format: {perFileIssues: {...}, crossFileIssues: [...]}
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			const allIssues: Issue[] = [];

			// Extract per-file issues
			if (parsed.perFileIssues && typeof parsed.perFileIssues === "object") {
				for (const fileIssues of Object.values(parsed.perFileIssues)) {
					if (Array.isArray(fileIssues)) {
						allIssues.push(...(fileIssues as Issue[]));
					}
				}
			}

			// Extract cross-file issues
			if (Array.isArray(parsed.crossFileIssues)) {
				allIssues.push(...parsed.crossFileIssues);
			}

			return allIssues;
		}

		// Handle array format directly
		if (Array.isArray(parsed)) {
			return parsed as Issue[];
		}

		return [];
	} catch {
		// If JSON parse fails, try to find JSON array in the result
		// The result might contain markdown or other text before the JSON array
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

// Format location for display
export function formatLocation(location: Location | Location[]): string {
	if (Array.isArray(location)) {
		return location
			.map((loc) => {
				if (loc.file) {
					return `${loc.file}:${loc.start}-${loc.end}`;
				}
				return `Lines ${loc.start}-${loc.end}`;
			})
			.join(", ");
	} else {
		if (location.file) {
			return `${location.file}:${location.start}-${location.end}`;
		}
		return `Lines ${location.start}-${location.end}`;
	}
}

// Format token usage
export function formatTokenUsage(tokens: number): string {
	return tokens.toLocaleString();
}

// Format cost
export function formatCost(usd: number): string {
	return `$${usd.toFixed(4)}`;
}

// Format duration
export function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${ms}ms`;
	}
	return `${(ms / 1000).toFixed(1)}s`;
}
