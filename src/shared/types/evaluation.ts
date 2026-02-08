// Core evaluation type definitions
// Consolidates types from frontend and CLI

import type { ISkill } from "@shared/file-system/skills-finder";
import type { ProviderName } from "@shared/providers/types";

// Re-export ISkill for convenience
export type { ISkill } from "@shared/file-system/skills-finder";

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
		// Documentation maturity metrics (optional for backward compatibility)
		issuesPerFile?: number; // Total issues / AGENTS.md file count
		documentationMaturityFactor?: number; // Penalty reduction factor (0.7-1.0)
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
	breakdown: IContextScoreBreakdown;
	recommendations: string[];
	explanation: string; // User-friendly one-liner explaining the score
}

// Folder description for key folders analysis
export interface IFolderDescription {
	path: string; // Relative path (e.g., "src/components")
	description: string; // Brief description (e.g., "React UI components")
}

/**
 * Represents a context file (AGENTS.md, CLAUDE.md, .claude/rules/*.md, or copilot-instructions.md)
 * with its content for browsing (no AI summarization needed)
 */
export interface IContextFile {
	/** Relative path from repository root */
	path: string;
	/** File type for categorization */
	type: "agents" | "claude" | "copilot" | "rules";
	/** Raw file content */
	content: string;
	/** Optional summary (unused - context files don't need AI summaries) */
	summary?: string;
	/** Globs from frontmatter (for rules files, UI display only) */
	globs?: string;
}

/**
 * Represents a linked Markdown documentation file discovered in AGENTS.md
 */
export interface ILinkedDocSummary {
	/** Relative path from repository root */
	path: string;
	/** AI-generated 2-sentence summary */
	summary: string;
	/** Source AGENTS.md file that contains the link */
	linkedFrom: string;
	/** Raw file content for preview (optional for backward compatibility) */
	content?: string;
}

// Technical inventory collected programmatically from the codebase
export interface ITechnicalInventory {
	dependencies?: string[];
	devDependencies?: string[];
	scripts?: Record<string, string>;
	dockerServices?: string[];
	fileCountsByExtension?: Record<string, number>;
	configFiles?: string[];
	envVarNames?: string[];
	// Database patterns (from evaluator 15 scanning)
	migrationFileCount?: number;
	ormRelationshipCount?: number;
	seedFileCount?: number;
	repositoryFileCount?: number;
	// Testing patterns (from evaluator 14 scanning)
	mockUsageCount?: number;
	fixtureDirectories?: string[];
	testUtilityFiles?: string[];
	testOrganization?: "co-located" | "separate" | "mixed";
	// Architecture patterns (from evaluator 12 scanning)
	detectedDirectoryLayers?: string[];
}

// Project context types
export interface IProjectContext {
	languages: string;
	frameworks: string;
	architecture: string;
	patterns: string;
	raw: string; // Full text for prompt injection
	clocSummary?: string; // Formatted lines of code per language
	keyFolders?: IFolderDescription[]; // ~20 most important folders
	agentsFilePaths?: string[]; // Paths to all context files (AGENTS.md and CLAUDE.md)
	contextFiles?: IContextFile[]; // Context files with content and summaries for browsing
	skills?: ISkill[]; // Agent Skills cartography (from SKILL.md files)
	linkedDocs?: ILinkedDocSummary[]; // AI-summarized documentation linked from AGENTS.md
	technicalInventory?: ITechnicalInventory; // Pre-computed technical data from codebase
}

export interface IContextIdentifierResult {
	context: IProjectContext;
	clocAvailable: boolean;
	clocOutput?: string;
	usage?: Usage;
	cost_usd?: number;
	duration_ms?: number;
}

export interface IContextIdentifierOptions {
	verbose?: boolean;
	timeout?: number;
	clocTimeout?: number;
	agentsFilePaths?: string[]; // Discovered context file paths (AGENTS.md / CLAUDE.md) to include in context
	/** AI provider to use (defaults to claude) */
	provider?: ProviderName;
	/** Progress callback for emitting context sub-step events */
	progressCallback?: ProgressCallback;
}

// Curation types
export interface ICuratedIssue {
	originalIndex: number;
	reason: string;
}

export interface ICurationSummary {
	totalIssuesReviewed: number;
}

export interface ICurationResult {
	curatedIssues: ICuratedIssue[];
	totalIssuesReviewed: number;
	usage?: Usage;
	cost_usd?: number;
	duration_ms?: number;
}

export interface ICurationOutput {
	// New dual format
	errors?: {
		curatedIssues: (Issue & { curationReason: string })[];
		summary: ICurationSummary;
	};
	suggestions?: {
		curatedIssues: (Issue & { curationReason: string })[];
		summary: ICurationSummary;
	};
	// Legacy fields (backward compatibility)
	curatedIssues?: (Issue & { curationReason: string })[];
	summary?: ICurationSummary;
}

export interface ICurationOptions {
	enabled?: boolean;
	errorTopN?: number; // New: threshold for errors (default 20)
	suggestionTopN?: number; // New: threshold for suggestions (default 20)
	topN?: number; // Deprecated (backward compatibility)
}

/**
 * Deduplication options (Phase 1: rule-based + Phase 2: AI semantic + Phase 3: entity clustering)
 */
export interface IDeduplicationOptions {
	/** Enable deduplication (default: true) */
	enabled?: boolean;
	/** Location overlap tolerance in lines (default: 5) */
	locationTolerance?: number;
	/** Text similarity threshold 0-1 (default: 0.55) */
	similarityThreshold?: number;
	/** Enable AI semantic deduplication (Phase 2, default: true) */
	aiEnabled?: boolean;
	/** Maximum issues to send to AI (default: 500, token limit safety) */
	maxIssuesForAI?: number;
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

// Metadata for clustered issues (Phase 3 entity-based deduplication)
export interface ClusteredIssueMetadata {
	category: string;
	evaluatorName?: string;
	problem?: string;
	severity?: number;
	impactLevel?: "High" | "Medium" | "Low";
	issueType: "error" | "suggestion";
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
	_deduplicationId?: string; // Internal tracking ID for deduplication
	validationWarnings?: string[]; // Warnings about potential false positives (e.g., hallucinated pronouns)
	// Phase 3 entity-based deduplication metadata (optional, only present on clustered issues)
	clusteredEntity?: string; // The entity (command, term, file) that all issues reference
	clusteredCount?: number; // Total number of issues clustered together
	clusteredIssues?: ClusteredIssueMetadata[]; // Metadata for all issues in the cluster
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
	output?: EvaluatorOutput;
	error?: string | StructuredError; // Support both for backward compatibility
	/** Whether this evaluator was skipped (e.g., no file mode) */
	skipped?: boolean;
	/** Reason why this evaluator was skipped */
	skipReason?: string;
}

export interface FileResult {
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
	// Curation metadata
	curationEnabled?: boolean;
	curatedCount?: number;
	curationCostUsd?: number;
	curationDurationMs?: number;
	// Dual curation metadata
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

// Independent evaluation mode format
// Note: Uses FileEvaluationResult from runner (not FileResult) for consistency
export interface IndependentEvaluationOutput {
	metadata: Metadata;
	files: Record<string, unknown>; // FileEvaluationResult from runner.ts
	crossFileIssues: Issue[];
	curation?: ICurationOutput;
	finalPrompts?: Record<string, string>; // evaluator ID -> final prompt used
}

// Unified evaluation mode format
export interface UnifiedEvaluatorResult {
	evaluator: string;
	output?: EvaluatorOutput;
	error?: string;
	/** Whether this evaluator was skipped (e.g., no file mode) */
	skipped?: boolean;
	/** Reason why this evaluator was skipped */
	skipReason?: string;
}

export interface UnifiedEvaluationOutput {
	metadata: Metadata;
	results: UnifiedEvaluatorResult[];
	crossFileIssues: Issue[];
	curation?: ICurationOutput;
	finalPrompts?: Record<string, string>; // evaluator ID -> final prompt used
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

// Evaluation engine interfaces
export interface IEvaluationOptions {
	evaluationMode?: "unified" | "independent";
	concurrency?: number;
	depth?: number;
	evaluators?: number;
	maxTokens?: number;
	debug?: boolean;
	verbose?: boolean;
	curation?: ICurationOptions;
	deduplication?: IDeduplicationOptions;
	/** AI provider to use (defaults to 'claude') */
	provider?: ProviderName;
	/**
	 * Preserve debug output files after successful evaluation
	 * Default: false (debug output is cleaned up on success)
	 * Set to true to keep debug files for inspection
	 */
	preserveDebugOutput?: boolean;
	/**
	 * Filter evaluators by type
	 * - "all": Run all evaluators (default)
	 * - "errors": Run only error evaluators (issues in existing content)
	 * - "suggestions": Run only suggestion evaluators (improvement opportunities)
	 */
	evaluatorFilter?: EvaluatorFilter;
	/**
	 * Specific evaluator IDs to run (filenames without .md extension).
	 * When set and non-empty, overrides evaluatorFilter.
	 * Example: ["content-quality", "security", "context-gaps"]
	 */
	selectedEvaluators?: string[];
	/**
	 * Enable assessment features (feedback buttons, selection basket, assessment page)
	 * - Default: false (features hidden)
	 * - Set to true to enable like/dislike buttons, issue selection, and assessment page
	 */
	enableAssessmentFeatures?: boolean;
	/**
	 * Number of parallel AI calls for linked documentation summarization
	 * - Default: 3
	 * - Range: 1-10
	 * - Higher values speed up summarization but may hit rate limits
	 */
	linkedDocsConcurrency?: number;
	/**
	 * Evaluation timeout in milliseconds per evaluator
	 * - Default: 300000 (5 minutes)
	 */
	timeout?: number;
}

export interface IEvaluationRequest {
	repositoryUrl?: string;
	localPath?: string;
	options?: IEvaluationOptions;
}

export interface ProgressEvent {
	type:
		| "job.queued"
		| "file.started"
		| "file.completed"
		| "evaluator.progress"
		| "evaluator.completed"
		| "evaluator.retry"
		| "evaluator.timeout"
		| "job.started"
		| "job.completed"
		| "job.failed"
		| "curation.started"
		| "curation.completed"
		| "context.started"
		| "context.completed"
		| "evaluation.warning"
		// Clone events
		| "clone.started"
		| "clone.completed"
		| "clone.warning"
		// Discovery events
		| "discovery.started"
		| "discovery.completed"
		// Context sub-step events
		| "context.cloc"
		| "context.folders"
		| "context.analysis"
		| "context.warning";
	data: unknown;
}

export type ProgressCallback = (event: ProgressEvent) => void;

// Type guard for StructuredError
export function isStructuredError(error: unknown): error is StructuredError {
	return (
		typeof error === "object" &&
		error !== null &&
		"message" in error &&
		"category" in error &&
		"severity" in error &&
		"timestamp" in error &&
		"retryable" in error
	);
}

// Convert impact level to numeric severity for sorting
// High: 7-10, Medium: 5-6, Low: 1-4
export function impactToSeverity(
	impactLevel: "High" | "Medium" | "Low",
): number {
	if (impactLevel === "High") return 9;
	if (impactLevel === "Medium") return 6;
	return 3;
}

// Helper to get sortable severity value from any issue
export function getIssueSeverity(issue: Issue): number {
	if (issue.issueType === "error") {
		return issue.severity;
	}
	return impactToSeverity(issue.impactLevel);
}
