/**
 * Issue processing logic extracted from App.tsx
 * Pure functions for parsing, filtering, grouping, and sorting issues
 */

import type { FilterState } from "../components/FilterPanel";
import type {
	CategoryGroup,
	EvaluationOutput,
	IndependentEvaluationOutput,
	Issue,
	UnifiedEvaluationOutput,
} from "../types/evaluation";
import {
	getIssueFile,
	getIssueSeverity,
	getIssueType,
	getMaxCategoryGroupSeverity,
	getMaxIssueSeverity,
	getSeverityLevel,
	isIndependentFormat,
	isUnifiedFormat,
	parseEvaluatorResult,
} from "../types/evaluation";
import { generateIssueHash } from "./issue-hash";

/**
 * Parse all issues from evaluation data (both unified and independent formats)
 * Adds evaluatorName to each issue for tracking
 */
export function parseAllIssues(evaluationData: EvaluationOutput): Issue[] {
	const issues: Array<Issue & { evaluatorName?: string }> = [];

	if (isUnifiedFormat(evaluationData)) {
		// Unified format: results array
		const unifiedData = evaluationData as UnifiedEvaluationOutput;
		for (const result of unifiedData.results) {
			if (result.output && result.output.result) {
				const parsedIssues = parseEvaluatorResult(result.output.result);
				for (const issue of parsedIssues) {
					issues.push({ ...issue, evaluatorName: result.evaluator });
				}
			}
		}

		// Add top-level cross-file issues for unified format
		if (unifiedData.crossFileIssues) {
			issues.push(
				...unifiedData.crossFileIssues.map((issue) => ({
					...issue,
					evaluatorName: "cross-file",
				})),
			);
		}
	} else if (isIndependentFormat(evaluationData)) {
		// Independent format: files object
		const independentData = evaluationData as IndependentEvaluationOutput;
		for (const fileResult of Object.values(independentData.files)) {
			for (const evaluation of fileResult.evaluations) {
				const evalWithIssues = evaluation as {
					issues?: Issue[];
					evaluator: string;
					output?: { result: string };
				};
				// Handle both formats:
				// 1. Backend API format: issues array directly on evaluation
				// 2. JSON file format: output.result as a string to parse
				if ("issues" in evaluation && Array.isArray(evalWithIssues.issues)) {
					// Backend API format - issues are already parsed
					for (const issue of evalWithIssues.issues) {
						issues.push({ ...issue, evaluatorName: evaluation.evaluator });
					}
				} else if (evaluation.output && evaluation.output.result) {
					// JSON file format - need to parse result string
					const parsedIssues = parseEvaluatorResult(evaluation.output.result);
					for (const issue of parsedIssues) {
						issues.push({ ...issue, evaluatorName: evaluation.evaluator });
					}
				}
			}
		}

		// Add cross-file issues
		if (independentData.crossFileIssues) {
			issues.push(
				...independentData.crossFileIssues.map((issue) => ({
					...issue,
					evaluatorName: "cross-file",
				})),
			);
		}
	}

	return issues;
}

/**
 * Filter issues based on active filters
 */
export function filterIssues(
	issues: Issue[],
	filters: FilterState,
	bookmarkSet: Set<string>,
): Issue[] {
	return issues.filter((issue) => {
		// Bookmark filter (check first for early return)
		if (filters.bookmarkedOnly) {
			const issueHash = generateIssueHash(issue);
			if (!bookmarkSet.has(issueHash)) {
				return false;
			}
		}

		// Severity filter
		if (filters.severities.size > 0) {
			const numericSeverity = getIssueSeverity(issue);
			const severityLevel = getSeverityLevel(numericSeverity);
			if (!filters.severities.has(severityLevel)) {
				return false;
			}
		}

		// Category filter
		if (filters.categories.size > 0 && issue.category) {
			if (!filters.categories.has(issue.category)) {
				return false;
			}
		}

		// Search text filter
		if (filters.searchText) {
			const searchLower = filters.searchText.toLowerCase();
			const searchableText = [
				issue.description, // Primary issue description
				issue.problem, // Fallback issue description
				issue.title, // Secondary title field
			]
				.filter(Boolean)
				.join(" ")
				.toLowerCase();

			if (!searchableText.includes(searchLower)) {
				return false;
			}
		}

		return true;
	});
}

/**
 * Group issues by file path
 * Cross-file or no-file issues go into __cross_file__ group
 */
export function groupIssuesByFile(issues: Issue[]): Record<string, Issue[]> {
	const grouped: Record<string, Issue[]> = {
		__cross_file__: [], // Special key for cross-file issues
	};

	for (const issue of issues) {
		const file = getIssueFile(issue);

		if (file === null) {
			// Cross-file or no-file issue
			grouped.__cross_file__.push(issue);
		} else {
			if (!grouped[file]) {
				grouped[file] = [];
			}
			grouped[file].push(issue);
		}
	}

	// Remove cross-file section if empty
	if (grouped.__cross_file__.length === 0) {
		delete grouped.__cross_file__;
	}

	return grouped;
}

/**
 * Sort grouped issues: cross-file first, then by max severity, then alphabetically
 */
export function sortGroupedIssues(
	groupedIssues: Record<string, Issue[]>,
): Array<[string, Issue[]]> {
	const entries = Object.entries(groupedIssues);

	// Separate cross-file from regular files
	const crossFileEntry = entries.find(([key]) => key === "__cross_file__");
	const fileEntries = entries.filter(([key]) => key !== "__cross_file__");

	// Sort file entries by max severity desc, then alphabetically
	fileEntries.sort(([fileA, issuesA], [fileB, issuesB]) => {
		const maxSeverityA = getMaxIssueSeverity(issuesA);
		const maxSeverityB = getMaxIssueSeverity(issuesB);

		if (maxSeverityA !== maxSeverityB) {
			return maxSeverityB - maxSeverityA;
		}

		return fileA.localeCompare(fileB);
	});

	// Return cross-file first, then sorted files
	return crossFileEntry ? [crossFileEntry, ...fileEntries] : fileEntries;
}

/**
 * Build nested grouping: file -> category -> issues
 * Returns null if nested grouping should not be used
 */
export function buildNestedGrouping(
	issues: Issue[],
): Record<string, CategoryGroup[]> {
	const grouped: Record<string, CategoryGroup[]> = {};

	// First, group by file
	for (const issue of issues) {
		const file = getIssueFile(issue);
		const fileKey = file === null ? "__cross_file__" : file;

		if (!grouped[fileKey]) {
			grouped[fileKey] = [];
		}
	}

	// Then, within each file, group by category
	for (const issue of issues) {
		const file = getIssueFile(issue);
		const fileKey = file === null ? "__cross_file__" : file;
		const categoryName = issue.category || "Unknown";

		// Find or create category group
		let categoryGroup = grouped[fileKey].find(
			(g) => g.categoryName === categoryName,
		);

		if (!categoryGroup) {
			categoryGroup = {
				categoryName,
				issues: [],
				maxSeverity: 0,
			};
			grouped[fileKey].push(categoryGroup);
		}

		categoryGroup.issues.push(issue);
	}

	// Calculate max severity for each category group and sort issues
	for (const fileKey in grouped) {
		for (const group of grouped[fileKey]) {
			group.maxSeverity = getMaxIssueSeverity(group.issues);
			// Sort issues within category group by severity (descending)
			group.issues.sort((a, b) => getIssueSeverity(b) - getIssueSeverity(a));
		}

		// Sort category groups by max severity (descending)
		grouped[fileKey].sort((a, b) => b.maxSeverity - a.maxSeverity);
	}

	// Remove cross-file section if empty
	if (grouped.__cross_file__ && grouped.__cross_file__.length === 0) {
		delete grouped.__cross_file__;
	}

	return grouped;
}

/**
 * Sort file groups by max severity across all categories
 */
export function sortNestedFileGroups(
	nestedGrouping: Record<string, CategoryGroup[]>,
): Array<[string, CategoryGroup[]]> {
	const entries = Object.entries(nestedGrouping);

	// Separate cross-file from regular files
	const crossFileEntry = entries.find(([key]) => key === "__cross_file__");
	const fileEntries = entries.filter(([key]) => key !== "__cross_file__");

	// Sort file entries by max severity across all categories
	fileEntries.sort(([fileA, groupsA], [fileB, groupsB]) => {
		const maxSeverityA = getMaxCategoryGroupSeverity(groupsA);
		const maxSeverityB = getMaxCategoryGroupSeverity(groupsB);

		if (maxSeverityA !== maxSeverityB) {
			return maxSeverityB - maxSeverityA;
		}

		return fileA.localeCompare(fileB);
	});

	// Return cross-file first, then sorted files
	return crossFileEntry ? [crossFileEntry, ...fileEntries] : fileEntries;
}

/**
 * Extract unique categories from issues
 */
export function extractCategories(issues: Issue[]): string[] {
	const categories = new Set<string>();

	for (const issue of issues) {
		if (issue.category) {
			categories.add(issue.category);
		}
	}

	return Array.from(categories).sort();
}

/**
 * Calculate severity counts from issues (3-level system: high, medium, low)
 */
export function calculateSeverityCounts(issues: Issue[]): {
	high: number;
	medium: number;
	low: number;
} {
	const counts = { high: 0, medium: 0, low: 0 };

	for (const issue of issues) {
		const numericSeverity = getIssueSeverity(issue);
		const level = getSeverityLevel(numericSeverity);
		counts[level]++;
	}

	return counts;
}

/**
 * Calculate issue type counts (errors vs suggestions)
 */
export function calculateIssueTypeCounts(issues: Issue[]): {
	error: number;
	suggestion: number;
} {
	const counts = { error: 0, suggestion: 0 };

	for (const issue of issues) {
		const type = getIssueType(issue);
		counts[type]++;
	}

	return counts;
}

/**
 * Split issues by type (errors vs suggestions)
 */
export function splitIssuesByType(issues: Issue[]): {
	errors: Issue[];
	suggestions: Issue[];
} {
	const errors: Issue[] = [];
	const suggestions: Issue[] = [];

	for (const issue of issues) {
		const type = getIssueType(issue);
		if (type === "error") {
			errors.push(issue);
		} else {
			suggestions.push(issue);
		}
	}

	return { errors, suggestions };
}

/**
 * Calculate per-file vs cross-file issue counts from evaluation data
 */
export function calculateIssueLocationCounts(
	evaluationData: EvaluationOutput,
	allIssues: Issue[],
): {
	perFileIssueCount: number;
	crossFileIssueCount: number;
} {
	if (isIndependentFormat(evaluationData)) {
		const independentData = evaluationData as IndependentEvaluationOutput;
		const crossFile = independentData.crossFileIssues?.length || 0;
		const perFile = allIssues.length - crossFile;
		return { perFileIssueCount: perFile, crossFileIssueCount: crossFile };
	}

	// For unified format, all issues are considered per-file
	return { perFileIssueCount: allIssues.length, crossFileIssueCount: 0 };
}
