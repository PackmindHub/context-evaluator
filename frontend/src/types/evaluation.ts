// Type definitions for evaluation results
// Based on src/commands/evaluate.ts and src/lib/results-processor.ts

// Evaluator filter type
export type EvaluatorFilter = "all" | "errors" | "suggestions";

// Error severity levels
export type ErrorSeverity = "fatal" | "partial" | "warning";

// Error categories
export type ErrorCategory =
	| "provider" // AI provider errors
	| "parsing" // Response parsing failures
	| "repository" // Git/repo access
	| "file_system" // File operations
	| "timeout" // Operation timeouts
	| "internal"; // Unexpected errors

export interface StructuredError {
	message: string;
	category: ErrorCategory;
	severity: ErrorSeverity;
	context?: Record<string, unknown>;
	evaluatorName?: string;
	filePath?: string;
	timestamp: Date;
	retryable: boolean;
	technicalDetails?: string; // Stack trace or detailed error info
}

// Context Score types - New "Base + Setup Bonus - Issue Penalty" Algorithm
export interface IContextScoreBreakdown {
	// New algorithm components
	baseScore: number; // Always 6.0 (supportive starting point)
	setupBonus: {
		agentsFilesBonus: number; // 0-2.0 based on number of AGENTS.md files
		skillsBonus: number; // 0-0.75 based on skills count
		linkedDocsBonus: number; // 0-0.75 based on linked docs count
		total: number; // Sum of all setup bonuses (max 3.5)
	};
	issuePenalty: {
		weightedIssueCount: number; // Raw weighted issue count before normalization
		issueAllowance: number; // "Free" issues based on project size
		excessIssues: number; // Issues beyond allowance
		penalty: number; // Final penalty (0-3.0, soft cap)
	};
	context: {
		projectSizeTier: "small" | "medium" | "large" | "enterprise";
		totalLOC: number; // Lines of code from cloc
		agentsFileCount: number;
		skillsCount: number;
		linkedDocsCount: number;
		// Issue breakdown (3-level system: High 8-10, Medium 6-7, Low ≤5)
		highIssues: number;
		mediumIssues: number;
		lowIssues: number;
		errorCount: number;
		suggestionCount: number;
	};
	// Legacy fields for backward compatibility
	coveragePenalty?: number;
	categoryDiversityPenalty?: number;
	totalPenalty?: number;
}

export type ContextScoreGrade =
	| "Excellent"
	| "Good"
	| "Fair"
	| "Developing"
	| "Getting Started";

export interface IContextScore {
	score: number;
	grade: ContextScoreGrade;
	summary: string;
	breakdown?: IContextScoreBreakdown; // Optional - may be missing in some evaluation results
	recommendations: string[];
	explanation: string; // User-friendly one-liner explaining the score
}

// Skill interface for SKILL.md files
export interface ISkill {
	name: string; // Name from YAML frontmatter
	description: string; // Description from YAML frontmatter
	path: string; // Relative path to SKILL.md file
	directory: string; // Parent directory name
	summary?: string; // AI-generated summary (more detailed than description)
	duplicatePaths?: string[]; // Other paths with identical content (if any)
	content?: string; // Raw SKILL.md file content (for display in browser)
}

// Context file interface for AGENTS.md, CLAUDE.md, .claude/rules/*.md, .cursor/rules/*.md/.mdc, copilot-instructions.md, SKILL.md
export interface IContextFile {
	path: string; // Relative path from repository root
	type: "agents" | "claude" | "copilot" | "rules" | "cursor-rules" | "skills"; // File type for categorization
	content: string; // Raw file content
	summary: string; // AI-generated 2-sentence summary
	globs?: string; // Globs from frontmatter (for rules files, UI display only)
	description?: string; // Description from frontmatter (for cursor rules)
	alwaysApply?: boolean; // Whether the rule is always applied (for cursor rules)
}

// Linked documentation summary
export interface ILinkedDocSummary {
	path: string; // Relative path from repository root
	summary: string; // AI-generated 2-sentence summary
	linkedFrom: string; // Source AGENTS.md file that contains the link
	content?: string; // Raw file content for preview (optional for backward compatibility)
}

// Project context types
export interface IProjectContext {
	languages: string;
	frameworks: string;
	architecture: string;
	patterns: string;
	raw: string; // Full text for prompt injection
	agentsFilePaths?: string[]; // Paths to AGENTS.md and CLAUDE.md files
	contextFiles?: IContextFile[]; // Context files with content and summaries for browsing
	skills?: ISkill[]; // Skills from SKILL.md files
	linkedDocs?: ILinkedDocSummary[]; // AI-summarized documentation linked from AGENTS.md
}

export interface Location {
	file?: string;
	start: number;
	end: number;
}

export interface SnippetInfo {
	content: string; // Full snippet with context lines
	startLine: number; // First line number of snippet (1-indexed)
	highlightStart: number; // Line number where highlight starts (1-indexed)
	highlightEnd: number; // Line number where highlight ends (1-indexed)
	file?: string; // File path for cross-file snippets
}

// Common fields shared by both error and suggestion issues
interface BaseIssue {
	category: string;
	problem?: string;
	description?: string;
	title?: string;
	location: Location | Location[];
	impact?: string; // Explanation text (why it matters)
	fix?: string;
	recommendation?: string;
	suggestion?: string;
	affectedFiles?: string[];
	isMultiFile?: boolean;
	context?: string;
	quote?: string;
	pattern?: string;
	issue?: string;
	snippet?: string; // Actual content at the location (extracted from file)
	snippetInfo?: SnippetInfo; // Snippet with context and line number metadata
	snippets?: SnippetInfo[]; // Multiple snippets for cross-file issues
	snippetError?: string; // Reason why snippet is not available (e.g., "File not found", "Line exceeds file length")
	isPhantomFile?: boolean; // Indicates this references a suggested file location that doesn't exist yet (e.g., subdirectory AGENTS.md)
	evaluatorName?: string; // Name of the evaluator that found this issue
	issueType: "error" | "suggestion"; // Whether this is an error (problem to fix) or suggestion (opportunity to improve)
	validationWarnings?: string[]; // Warnings about potential false positives (e.g., hallucinated pronouns)
}

// Error issues have severity only
export interface ErrorIssue extends BaseIssue {
	issueType: "error";
	severity: number; // 6-10 scale
	impactLevel?: never; // Explicitly forbidden
}

// Suggestion issues have impactLevel only
export interface SuggestionIssue extends BaseIssue {
	issueType: "suggestion";
	impactLevel: "High" | "Medium" | "Low"; // Impact level for suggestions
	severity?: never; // Explicitly forbidden
}

// Union type for all issues
export type Issue = ErrorIssue | SuggestionIssue;

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
	// Backend API format: issues are already parsed
	issues?: Issue[];
	// JSON file format: output.result is a string to parse
	output?: EvaluatorOutput;
	error?: string;
	// Backend API format: usage, cost, duration
	usage?: Usage;
	cost_usd?: number;
	duration_ms?: number;
}

export interface FileResult {
	// Backend API format includes file paths
	filePath?: string;
	relativePath?: string;
	evaluations: FileEvaluation[];
	totalIssues: number;
	highCount: number;
	mediumCount: number;
	lowCount?: number;
	totalInputTokens?: number;
	totalOutputTokens?: number;
	totalCacheCreationTokens?: number;
	totalCacheReadTokens?: number;
	totalCostUsd?: number;
	totalDuration?: number;
	// Backend API format uses different names
	totalUsage?: Usage;
	totalCost?: number;
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
	lowCount?: number;
	totalInputTokens?: number;
	totalOutputTokens?: number;
	totalCacheCreationTokens?: number;
	totalCacheReadTokens?: number;
	totalCostUsd?: number;
	totalDurationMs?: number;
	filesEvaluated?: string[];
	// Context identification metadata
	projectContext?: IProjectContext;
	contextIdentificationDurationMs?: number;
	contextIdentificationCostUsd?: number;
	// Curation metadata (legacy single-pass)
	curationEnabled?: boolean;
	curatedCount?: number;
	curationCostUsd?: number;
	curationDurationMs?: number;
	// Dual curation metadata (separate error/suggestion curation)
	errorsCuratedCount?: number;
	suggestionsCuratedCount?: number;
	errorCurationCostUsd?: number;
	suggestionCurationCostUsd?: number;
	errorCurationDurationMs?: number;
	suggestionCurationDurationMs?: number;
	totalCuratedCount?: number;
	totalCurationCostUsd?: number;
	totalCurationDurationMs?: number;
	// Deduplication metadata (three-phase)
	deduplicationEnabled?: boolean;
	duplicatesRemoved?: number;
	deduplicationClusters?: number;
	// Phase 1 (rule-based) metadata
	deduplicationPhase1Removed?: number;
	deduplicationPhase1Clusters?: number;
	// Phase 2 (AI semantic) metadata
	deduplicationPhase2Removed?: number;
	deduplicationPhase2Groups?: number;
	deduplicationPhase2CostUsd?: number;
	deduplicationPhase2DurationMs?: number;
	// Phase 3 (entity-based clustering) metadata
	deduplicationPhase3Removed?: number;
	deduplicationPhase3Clusters?: number;
	// Context score metadata
	contextScore?: IContextScore;
	// Error tracking metadata
	hasErrors?: boolean;
	hasPartialFailures?: boolean;
	failedEvaluators?: Array<{
		evaluatorName: string;
		error: StructuredError;
		filePath?: string;
	}>;
	warnings?: StructuredError[];
}

// Curation types
export interface ICurationSummary {
	totalIssuesReviewed: number;
}

export interface ICuratedIssue extends Issue {
	curationReason: string;
}

export interface ICurationOutput {
	curatedIssues: ICuratedIssue[];
	summary: ICurationSummary;
}

// Independent evaluation mode format
export interface IndependentEvaluationOutput {
	metadata: Metadata;
	files: Record<string, FileResult>;
	crossFileIssues: Issue[];
	curation?: ICurationOutput;
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
	crossFileIssues?: Issue[];
	curation?: ICurationOutput;
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
// Note: Evaluator prompts instruct AI to not report issues with severity ≤4
export function getSeverityLevel(severity: number): "high" | "medium" | "low" {
	if (severity >= 8) return "high";
	if (severity >= 6) return "medium";
	return "low";
}

export function getSeverityColor(severity: number): string {
	// Returns CSS class names defined in styles.css
	if (severity >= 8) return "severity-badge severity-high";
	if (severity >= 6) return "severity-badge severity-medium";
	return "severity-badge severity-low";
}

export function getSeverityBorderColor(severity: number): string {
	// Returns just the border color for card left borders
	if (severity >= 8) return "rgb(249, 115, 22)"; // orange-500
	if (severity >= 6) return "rgb(234, 179, 8)"; // yellow-500
	return "rgb(148, 163, 184)"; // slate-400
}

export function getSeverityEmoji(severity: number): string {
	if (severity >= 8) return "🟠";
	if (severity >= 6) return "🟡";
	return "⚪";
}

// Impact level helpers for suggestions
export function getImpactLabel(impactLevel: "High" | "Medium" | "Low"): string {
	return impactLevel; // Return capitalized: "High", "Medium", "Low"
}

export function getImpactBadgeClass(
	impactLevel: "High" | "Medium" | "Low",
): string {
	// Reuse existing severity classes for consistent styling
	if (impactLevel === "High") return "severity-badge severity-high"; // ORANGE
	if (impactLevel === "Medium") return "severity-badge severity-medium"; // YELLOW
	return "severity-badge severity-low"; // GRAY
}

// For sorting/filtering - convert impact to numeric value
// Updated to align with 3-level severity thresholds:
// High: 7-10, Medium: 5-6, Low: 1-4
export function impactToSeverity(
	impactLevel: "High" | "Medium" | "Low",
): number {
	if (impactLevel === "High") return 9; // Maps to high (7-10)
	if (impactLevel === "Medium") return 6; // Maps to medium (5-6)
	return 3; // Maps to low (1-4)
}

// Helper to get sortable severity value from any issue
export function getIssueSeverity(issue: Issue): number {
	if (issue.issueType === "error") {
		return issue.severity;
	}
	return impactToSeverity(issue.impactLevel);
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

// Evaluation history types (for listing past evaluations)
export interface IEvaluationHistoryItem {
	id: string;
	repositoryUrl: string;
	evaluationMode: "unified" | "independent" | null;
	evaluatorsCount: number;
	status: "completed" | "failed";
	totalFiles: number;
	totalIssues: number;
	highCount: number;
	mediumCount: number;
	lowCount: number;
	curatedCount: number;
	totalCostUsd: number;
	totalDurationMs: number;
	contextScore?: number;
	contextGrade?: ContextScoreGrade;
	failedEvaluatorCount: number;
	isImported?: boolean;
	parentEvaluationId?: string;
	sourceRemediationId?: string;
	errorMessage?: string;
	errorCode?: string;
	createdAt: string;
	completedAt: string;
}

// Full evaluation record (includes result data)
export interface IEvaluationRecord extends IEvaluationHistoryItem {
	result?: EvaluationOutput;
}

// Issue type helpers

/**
 * Evaluators categorized as "suggestions" (opportunities for improvement).
 * All other evaluators are categorized as "errors" (problems to fix).
 */
const SUGGESTION_EVALUATORS = new Set([
	"11-subdirectory-coverage",
	"12-context-gaps",
]);

/**
 * Get the issue type for a given issue, with backward compatibility.
 * If the issue has an explicit issueType, use that.
 * Otherwise, infer from the evaluator name.
 */
export function getIssueType(issue: Issue): "error" | "suggestion" {
	// Use explicit issueType if available
	if (issue.issueType) {
		return issue.issueType;
	}
	// Infer from evaluator name for backward compatibility
	if (issue.evaluatorName && SUGGESTION_EVALUATORS.has(issue.evaluatorName)) {
		return "suggestion";
	}
	return "error";
}

/**
 * Determines if an issue affects multiple files or has no specific file
 */
export function isCrossFileIssue(issue: Issue): boolean {
	if (issue.affectedFiles && issue.affectedFiles.length > 1) return true;
	if (issue.isMultiFile) return true;

	if (Array.isArray(issue.location)) {
		const files = issue.location
			.map((loc) => loc.file)
			.filter((f): f is string => f !== undefined);
		if (new Set(files).size > 1) return true;
	}

	return false;
}

/**
 * Gets the primary file path for an issue (null for cross-file issues)
 */
export function getIssueFile(issue: Issue): string | null {
	if (isCrossFileIssue(issue)) return null;

	if (!Array.isArray(issue.location) && issue.location.file) {
		return issue.location.file;
	}

	if (Array.isArray(issue.location) && issue.location[0]?.file) {
		return issue.location[0].file;
	}

	if (issue.affectedFiles && issue.affectedFiles.length === 1) {
		return issue.affectedFiles[0];
	}

	return null;
}

/**
 * Gets the maximum severity from a group of issues
 */
export function getMaxIssueSeverity(issues: Issue[]): number {
	if (issues.length === 0) return 0;
	return Math.max(...issues.map(getIssueSeverity));
}

/**
 * Category group for nested display
 */
export interface CategoryGroup {
	categoryName: string;
	issues: Issue[];
	maxSeverity: number;
}

/**
 * File group with category sub-groups
 */
export interface FileGroupWithCategories {
	file: string;
	categoryGroups: CategoryGroup[];
	totalIssues: number;
}

/**
 * Gets the maximum severity across all category groups
 */
export function getMaxCategoryGroupSeverity(groups: CategoryGroup[]): number {
	if (groups.length === 0) return 0;
	return Math.max(...groups.map((g) => g.maxSeverity));
}

// Aggregated issues types (cross-evaluation)
export interface IAggregatedIssue {
	issue: Issue;
	evaluationId: string;
	repositoryUrl: string;
	evaluationDate: string;
	evaluatorName: string;
}

export interface IAggregatedIssuesResponse {
	issues: IAggregatedIssue[];
	pagination: {
		page: number;
		pageSize: number;
		totalItems: number;
		totalPages: number;
	};
	availableFilters: {
		evaluators: string[];
		repositories: string[];
	};
}

// Evaluator stats types
export interface IEvaluatorStat {
	evaluatorId: string;
	evaluatorName: string;
	issueType: "error" | "suggestion";
	repoCount: number;
	totalIssueCount: number;
}

export interface IEvaluatorStatsResponse {
	evaluators: IEvaluatorStat[];
	totalReposEvaluated: number;
}

// Cost stats types
export interface IRepoCostStat {
	repositoryUrl: string;
	totalCostUsd: number;
	totalLOC: number | null;
}

export interface IAgentCostStat {
	agent: string;
	totalCostUsd: number;
}

export interface ICostStatsResponse {
	topReposByCost: IRepoCostStat[];
	costByAgent: IAgentCostStat[];
}

// Token consumption stats types
export interface IEvaluatorTokenStat {
	evaluatorId: string;
	evaluatorName: string;
	avgInputTokens: number;
	avgOutputTokens: number;
	avgCostUsd: number;
	sampleCount: number;
}

export interface IContextIdentificationTokenStat {
	avgInputTokens: number;
	avgOutputTokens: number;
	avgCostUsd: number;
	sampleCount: number;
}

export interface ITokenStatsResponse {
	evaluators: IEvaluatorTokenStat[];
	contextIdentification: IContextIdentificationTokenStat | null;
	totalEvaluationsAnalyzed: number;
}
