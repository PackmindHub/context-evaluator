// Evaluator issue type categorization
// Errors: Issues in the current state of AGENTS.md files (problems that need fixing)
// Suggestions: Missing content or opportunities for improvement (things that could be added)

export type IssueType = "error" | "suggestion";

/**
 * Configuration for each evaluator including issue type and execution behavior.
 */
export interface EvaluatorConfig {
	issueType: IssueType;
	/** Whether to execute this evaluator when no AGENTS.md file exists */
	executeIfNoFile: boolean;
}

/**
 * Centralized configuration for all evaluators.
 *
 * Issue Types:
 * - error: Issues with existing content that need fixing
 * - suggestion: Missing content or opportunities for improvement
 *
 * executeIfNoFile:
 * - true: Run even when no AGENTS.md exists (can suggest what to create)
 * - false: Skip when no AGENTS.md exists (needs content to evaluate)
 */
export const EVALUATOR_CONFIGS: Record<string, EvaluatorConfig> = {
	"file-consistency.md": { issueType: "error", executeIfNoFile: false }, // Built-in validator, not an LLM prompt
	"content-quality.md": { issueType: "error", executeIfNoFile: false },
	"structure-formatting.md": { issueType: "error", executeIfNoFile: false },
	"command-completeness.md": { issueType: "error", executeIfNoFile: false },
	"testing-validation.md": { issueType: "error", executeIfNoFile: false },
	"code-style.md": { issueType: "error", executeIfNoFile: false },
	"language-clarity.md": { issueType: "error", executeIfNoFile: false },
	"git-workflow.md": { issueType: "error", executeIfNoFile: false },
	"project-structure.md": { issueType: "error", executeIfNoFile: false },
	"security.md": { issueType: "error", executeIfNoFile: false },
	"completeness.md": { issueType: "error", executeIfNoFile: false },
	"subdirectory-coverage.md": {
		issueType: "suggestion",
		executeIfNoFile: false,
	},
	"context-gaps.md": { issueType: "suggestion", executeIfNoFile: true }, // Can scan codebase and suggest what docs to create
	"contradictory-instructions.md": {
		issueType: "error",
		executeIfNoFile: false,
	},
	"test-patterns-coverage.md": {
		issueType: "suggestion",
		executeIfNoFile: true,
	}, // Can scan codebase for undocumented testing patterns
	"database-patterns-coverage.md": {
		issueType: "suggestion",
		executeIfNoFile: true,
	}, // Can scan codebase for undocumented database patterns
	"markdown-validity.md": { issueType: "error", executeIfNoFile: false },
	"outdated-documentation.md": {
		issueType: "error",
		executeIfNoFile: false,
	}, // Verifies documented paths/commands exist in codebase
};

/**
 * Mapping of evaluator filenames to their issue type category.
 * Derived from EVALUATOR_CONFIGS for backward compatibility.
 *
 * Errors - Issues with existing content:
 * - content-quality: Vague, human-focused content issues
 * - structure-formatting: Problems with current formatting/structure
 * - command-completeness: Unclear commands, missing prerequisites, env var docs, version constraints
 * - testing-validation: Missing/vague testing guidance
 * - code-style: Conflicting/absent style guidelines
 * - language-clarity: Ambiguous language in existing content
 * - git-workflow: Missing/vague git workflow guidance
 * - project-structure: Missing project structure explanation
 * - security: Security issues (exposed secrets, no guidance)
 * - completeness: Content too short/too long, inappropriate hierarchical placement
 * - contradictory-instructions: Conflicting instructions across files
 * - markdown-validity: Markdown syntax errors and broken links
 * - outdated-documentation: Documented paths/commands that no longer exist
 *
 * Suggestions - Opportunities for improvement:
 * - subdirectory-coverage: Opportunities to add AGENTS.md in subdirs
 * - context-gaps: Missing framework/language guidelines
 * - test-patterns-coverage: Undocumented testing conventions
 * - database-patterns-coverage: Undocumented database/ORM patterns
 */
export const EVALUATOR_ISSUE_TYPES: Record<string, IssueType> =
	Object.fromEntries(
		Object.entries(EVALUATOR_CONFIGS).map(([key, config]) => [
			key,
			config.issueType,
		]),
	);

/**
 * Get the issue type for a given evaluator name.
 * Supports both with and without .md extension.
 * Strips numbering prefix if present (e.g., "01-content-quality.md" -> "content-quality.md").
 * Defaults to 'error' for unknown evaluators.
 */
export function getIssueTypeFromEvaluatorName(name: string): IssueType {
	// Handle evaluator name with or without .md extension
	let filename = name.endsWith(".md") ? name : `${name}.md`;

	// Strip numbering prefix if present (e.g., "01-", "11-", etc.)
	filename = filename.replace(/^\d+-/, "");

	return EVALUATOR_ISSUE_TYPES[filename] ?? "error";
}

/**
 * Check if an evaluator should execute when no AGENTS.md file exists.
 * Supports both with and without .md extension.
 * Strips numbering prefix if present (e.g., "01-content-quality.md" -> "content-quality.md").
 * Defaults to false for unknown evaluators.
 */
export function shouldExecuteIfNoFile(name: string): boolean {
	let filename = name.endsWith(".md") ? name : `${name}.md`;

	// Strip numbering prefix if present (e.g., "01-", "11-", etc.)
	filename = filename.replace(/^\d+-/, "");

	return EVALUATOR_CONFIGS[filename]?.executeIfNoFile ?? false;
}

// Import EvaluatorFilter type from shared types
import type { EvaluatorFilter } from "@shared/types/evaluation";

/**
 * Filter evaluator files by type
 * @param evaluatorFiles - Array of evaluator filenames
 * @param filter - Type filter to apply
 * @returns Filtered array in original order
 */
export function filterEvaluatorsByType(
	evaluatorFiles: readonly string[],
	filter: EvaluatorFilter = "all",
): string[] {
	if (filter === "all") {
		return [...evaluatorFiles];
	}

	return evaluatorFiles.filter((filename) => {
		const config = EVALUATOR_CONFIGS[filename];
		if (!config) return false;
		const issueType = config.issueType;
		return filter === "errors"
			? issueType === "error"
			: issueType === "suggestion";
	});
}

/**
 * Filter evaluator files by specific IDs.
 * IDs are filenames without .md extension (e.g., "content-quality", "security").
 * Returns filtered array preserving original order.
 */
export function filterEvaluatorsByIds(
	evaluatorFiles: readonly string[],
	selectedIds: string[],
): string[] {
	const idSet = new Set(selectedIds.map((id) => `${id}.md`));
	return evaluatorFiles.filter((filename) => idSet.has(filename));
}

/**
 * Get count of evaluators by type
 * Note: This counts actual evaluator files, not all EVALUATOR_CONFIGS entries
 * (e.g., excludes internal validators like 00-file-consistency.md)
 */
export function getEvaluatorCountByType(filter: EvaluatorFilter): number {
	// Import EVALUATOR_FILES dynamically to avoid circular dependency
	const evaluatorFiles = [
		"content-quality.md",
		"structure-formatting.md",
		"command-completeness.md",
		"testing-validation.md",
		"code-style.md",
		"language-clarity.md",
		"git-workflow.md",
		"project-structure.md",
		"security.md",
		"completeness.md",
		"subdirectory-coverage.md",
		"context-gaps.md",
		"contradictory-instructions.md",
		"test-patterns-coverage.md",
		"database-patterns-coverage.md",
		"markdown-validity.md",
		"outdated-documentation.md",
	];

	if (filter === "all") {
		return evaluatorFiles.length;
	}

	return evaluatorFiles.filter((filename) => {
		const config = EVALUATOR_CONFIGS[filename];
		if (!config) return false;
		return config.issueType === (filter === "errors" ? "error" : "suggestion");
	}).length;
}

/**
 * Get filter metadata for API/UI
 */
export function getEvaluatorFilterMetadata() {
	return [
		{
			value: "all" as const,
			label: "All Evaluators",
			count: getEvaluatorCountByType("all"),
			description: "Run all evaluators (errors + suggestions)",
		},
		{
			value: "errors" as const,
			label: "Errors Only",
			count: getEvaluatorCountByType("errors"),
			description: "Issues in existing content that need fixing",
		},
		{
			value: "suggestions" as const,
			label: "Suggestions Only",
			count: getEvaluatorCountByType("suggestions"),
			description: "Opportunities for improvement and additions",
		},
	];
}
