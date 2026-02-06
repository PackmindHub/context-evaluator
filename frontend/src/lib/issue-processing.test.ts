import { describe, expect, test } from "bun:test";
import type { FilterState } from "../components/FilterPanel";
import type {
	ErrorIssue,
	IndependentEvaluationOutput,
	Issue,
	SuggestionIssue,
	UnifiedEvaluationOutput,
} from "../types/evaluation";
import {
	buildNestedGrouping,
	calculateIssueLocationCounts,
	calculateIssueTypeCounts,
	calculateSeverityCounts,
	extractCategories,
	filterIssues,
	groupIssuesByFile,
	parseAllIssues,
	sortGroupedIssues,
	sortNestedFileGroups,
	splitIssuesByType,
} from "./issue-processing";

// ============================================================================
// Test Fixtures
// ============================================================================

const createErrorIssue = (
	overrides: Partial<ErrorIssue & { evaluatorName?: string }> = {},
): ErrorIssue & { evaluatorName?: string } => ({
	issueType: "error",
	category: "Test Category",
	severity: 8,
	location: { start: 1, end: 10 },
	description: "Test error description",
	evaluatorName: "test-evaluator",
	...overrides,
});

const createSuggestionIssue = (
	overrides: Partial<SuggestionIssue & { evaluatorName?: string }> = {},
): SuggestionIssue & { evaluatorName?: string } => ({
	issueType: "suggestion",
	category: "Test Category",
	impactLevel: "Medium",
	location: { start: 1, end: 10 },
	description: "Test suggestion description",
	evaluatorName: "11-subdirectory-coverage",
	...overrides,
});

const createEmptyFilters = (): FilterState => ({
	severities: new Set(),
	categories: new Set(),
	evaluators: new Set(),
	searchText: "",
	bookmarkedOnly: false,
});

const createUnifiedOutput = (
	overrides: Partial<UnifiedEvaluationOutput> = {},
): UnifiedEvaluationOutput => ({
	metadata: {
		generatedAt: new Date().toISOString(),
		agent: "claude",
		evaluationMode: "unified",
		totalFiles: 1,
	},
	results: [],
	...overrides,
});

const createIndependentOutput = (
	overrides: Partial<IndependentEvaluationOutput> = {},
): IndependentEvaluationOutput => ({
	metadata: {
		generatedAt: new Date().toISOString(),
		agent: "claude",
		evaluationMode: "independent",
		totalFiles: 1,
	},
	files: {},
	crossFileIssues: [],
	...overrides,
});

// ============================================================================
// parseAllIssues Tests
// ============================================================================

describe("parseAllIssues", () => {
	test("returns empty array for empty unified output", () => {
		const output = createUnifiedOutput({ results: [] });
		expect(parseAllIssues(output)).toEqual([]);
	});

	test("returns empty array for empty independent output", () => {
		const output = createIndependentOutput({ files: {}, crossFileIssues: [] });
		expect(parseAllIssues(output)).toEqual([]);
	});

	test("parses issues from unified format with output.result", () => {
		const issues = [createErrorIssue({ description: "Issue 1" })];
		const output = createUnifiedOutput({
			results: [
				{
					evaluator: "01-content-quality",
					output: {
						type: "result",
						subtype: "success",
						is_error: false,
						duration_ms: 1000,
						num_turns: 1,
						result: JSON.stringify(issues),
						session_id: "test",
						total_cost_usd: 0.01,
						usage: {
							input_tokens: 100,
							output_tokens: 50,
							cache_creation_input_tokens: 0,
							cache_read_input_tokens: 0,
						},
						uuid: "test-uuid",
					},
				},
			],
		});

		const result = parseAllIssues(output);
		expect(result).toHaveLength(1);
		expect(result[0].evaluatorName).toBe("01-content-quality");
	});

	test("parses cross-file issues from unified format", () => {
		const crossFileIssues = [createErrorIssue({ description: "Cross-file" })];
		const output = createUnifiedOutput({
			results: [],
			crossFileIssues,
		});

		const result = parseAllIssues(output);
		expect(result).toHaveLength(1);
		expect(result[0].evaluatorName).toBe("cross-file");
	});

	test("parses issues from independent format with issues array (API format)", () => {
		const output = createIndependentOutput({
			files: {
				"AGENTS.md": {
					evaluations: [
						{
							evaluator: "01-content-quality",
							issues: [createErrorIssue({ description: "API issue" })],
						},
					],
					totalIssues: 1,
					highCount: 1,
					mediumCount: 0,
					lowCount: 0,
				},
			},
		});

		const result = parseAllIssues(output);
		expect(result).toHaveLength(1);
		expect(result[0].description).toBe("API issue");
		expect(result[0].evaluatorName).toBe("01-content-quality");
	});

	test("parses issues from independent format with output.result (JSON format)", () => {
		const issues = [createErrorIssue({ description: "JSON issue" })];
		const output = createIndependentOutput({
			files: {
				"AGENTS.md": {
					evaluations: [
						{
							evaluator: "01-content-quality",
							output: {
								type: "result",
								subtype: "success",
								is_error: false,
								duration_ms: 1000,
								num_turns: 1,
								result: JSON.stringify(issues),
								session_id: "test",
								total_cost_usd: 0.01,
								usage: {
									input_tokens: 100,
									output_tokens: 50,
									cache_creation_input_tokens: 0,
									cache_read_input_tokens: 0,
								},
								uuid: "test-uuid",
							},
						},
					],
					totalIssues: 1,
					highCount: 1,
					mediumCount: 0,
					lowCount: 0,
				},
			},
		});

		const result = parseAllIssues(output);
		expect(result).toHaveLength(1);
		expect(result[0].description).toBe("JSON issue");
	});

	test("parses cross-file issues from independent format", () => {
		const output = createIndependentOutput({
			files: {},
			crossFileIssues: [createErrorIssue({ description: "Cross-file" })],
		});

		const result = parseAllIssues(output);
		expect(result).toHaveLength(1);
		expect(result[0].evaluatorName).toBe("cross-file");
	});

	test("combines issues from multiple files", () => {
		const output = createIndependentOutput({
			files: {
				"AGENTS.md": {
					evaluations: [
						{
							evaluator: "01-content-quality",
							issues: [createErrorIssue({ description: "Issue 1" })],
						},
					],
					totalIssues: 1,
					highCount: 1,
					mediumCount: 0,
					lowCount: 0,
				},
				"CLAUDE.md": {
					evaluations: [
						{
							evaluator: "03-command-completeness",
							issues: [createErrorIssue({ description: "Issue 2" })],
						},
					],
					totalIssues: 1,
					highCount: 1,
					mediumCount: 0,
					lowCount: 0,
				},
			},
		});

		const result = parseAllIssues(output);
		expect(result).toHaveLength(2);
	});
});

// ============================================================================
// filterIssues Tests
// ============================================================================

describe("filterIssues", () => {
	// Test fixtures use the 3-level severity system:
	// High: 7-10, Medium: 5-6, Low: 1-4
	const createIssues = (): Issue[] => [
		createErrorIssue({
			severity: 10,
			category: "Content Quality",
			description: "High content issue (10)",
		}),
		createErrorIssue({
			severity: 8,
			category: "Command Completeness",
			description: "High severity command issue (8)",
		}),
		createErrorIssue({
			severity: 6,
			category: "Content Quality",
			description: "Medium content issue",
		}),
		createErrorIssue({
			severity: 3,
			category: "Context Gaps",
			description: "Low severity issue",
		}),
	];

	test("returns all issues when no filters are active", () => {
		const issues = createIssues();
		const filters = createEmptyFilters();
		const result = filterIssues(issues, filters, new Set());
		expect(result).toHaveLength(4);
	});

	test("filters by high severity (7-10)", () => {
		const issues = createIssues();
		const filters = createEmptyFilters();
		filters.severities.add("high");
		const result = filterIssues(issues, filters, new Set());
		// severity 8 and 10 are both high
		expect(result).toHaveLength(2);
	});

	test("filters by medium severity (5-6)", () => {
		const issues = createIssues();
		const filters = createEmptyFilters();
		filters.severities.add("medium");
		const result = filterIssues(issues, filters, new Set());
		// severity 6 is medium
		expect(result).toHaveLength(1);
		expect(result[0].description).toBe("Medium content issue");
	});

	test("filters by low severity (≤4)", () => {
		const issues = createIssues();
		const filters = createEmptyFilters();
		filters.severities.add("low");
		const result = filterIssues(issues, filters, new Set());
		// severity 3 is low
		expect(result).toHaveLength(1);
		expect(result[0].description).toBe("Low severity issue");
	});

	test("filters by multiple severities", () => {
		const issues = createIssues();
		const filters = createEmptyFilters();
		filters.severities.add("high");
		filters.severities.add("medium");
		const result = filterIssues(issues, filters, new Set());
		expect(result).toHaveLength(3); // 2 high + 1 medium
	});

	test("filters by category", () => {
		const issues = createIssues();
		const filters = createEmptyFilters();
		filters.categories.add("Content Quality");
		const result = filterIssues(issues, filters, new Set());
		expect(result).toHaveLength(2);
	});

	test("filters by multiple categories", () => {
		const issues = createIssues();
		const filters = createEmptyFilters();
		filters.categories.add("Content Quality");
		filters.categories.add("Context Gaps");
		const result = filterIssues(issues, filters, new Set());
		expect(result).toHaveLength(3);
	});

	test("filters by search text in description", () => {
		const issues = createIssues();
		const filters = createEmptyFilters();
		filters.searchText = "content";
		const result = filterIssues(issues, filters, new Set());
		expect(result).toHaveLength(2);
	});

	test("search is case insensitive", () => {
		const issues = createIssues();
		const filters = createEmptyFilters();
		filters.searchText = "CONTENT";
		const result = filterIssues(issues, filters, new Set());
		expect(result).toHaveLength(2);
	});

	test("search matches problem field", () => {
		const issues = [
			createErrorIssue({
				description: "Some description",
				problem: "Unique problem text",
			}),
		];
		const filters = createEmptyFilters();
		filters.searchText = "unique problem";
		const result = filterIssues(issues, filters, new Set());
		expect(result).toHaveLength(1);
	});

	test("search matches title field", () => {
		const issues = [
			createErrorIssue({
				description: "Some description",
				title: "Special title here",
			}),
		];
		const filters = createEmptyFilters();
		filters.searchText = "special title";
		const result = filterIssues(issues, filters, new Set());
		expect(result).toHaveLength(1);
	});

	test("filters by bookmarked only", () => {
		const issues = createIssues();
		const filters = createEmptyFilters();
		filters.bookmarkedOnly = true;

		// Create bookmark for one issue
		const bookmarkSet = new Set<string>();
		// We need to generate the hash for the first issue
		// For testing, we'll use a simplified approach
		const result = filterIssues(issues, filters, bookmarkSet);
		expect(result).toHaveLength(0); // No bookmarks = no results
	});

	test("combines multiple filters", () => {
		const issues = createIssues();
		const filters = createEmptyFilters();
		filters.severities.add("high");
		filters.categories.add("Content Quality");
		filters.searchText = "content";
		const result = filterIssues(issues, filters, new Set());
		expect(result).toHaveLength(1);
		expect(result[0].description).toBe("High content issue (10)");
	});

	test("returns empty when no issues match filters", () => {
		const issues = createIssues();
		const filters = createEmptyFilters();
		filters.searchText = "nonexistent text that matches nothing";
		const result = filterIssues(issues, filters, new Set());
		expect(result).toHaveLength(0);
	});
});

// ============================================================================
// groupIssuesByFile Tests
// ============================================================================

describe("groupIssuesByFile", () => {
	test("returns empty object for empty issues array", () => {
		const result = groupIssuesByFile([]);
		expect(result).toEqual({});
	});

	test("groups issues by file path", () => {
		const issues: Issue[] = [
			createErrorIssue({
				location: { file: "AGENTS.md", start: 1, end: 10 },
			}),
			createErrorIssue({
				location: { file: "AGENTS.md", start: 20, end: 30 },
			}),
			createErrorIssue({
				location: { file: "CLAUDE.md", start: 1, end: 5 },
			}),
		];

		const result = groupIssuesByFile(issues);
		expect(Object.keys(result)).toHaveLength(2);
		expect(result["AGENTS.md"]).toHaveLength(2);
		expect(result["CLAUDE.md"]).toHaveLength(1);
	});

	test("puts cross-file issues in __cross_file__ group", () => {
		const issues: Issue[] = [
			createErrorIssue({
				affectedFiles: ["AGENTS.md", "CLAUDE.md"],
				location: { start: 1, end: 10 },
			}),
		];

		const result = groupIssuesByFile(issues);
		expect(result.__cross_file__).toHaveLength(1);
	});

	test("puts issues without file in __cross_file__ group", () => {
		const issues: Issue[] = [
			createErrorIssue({
				location: { start: 1, end: 10 }, // No file
			}),
		];

		const result = groupIssuesByFile(issues);
		expect(result.__cross_file__).toHaveLength(1);
	});

	test("removes __cross_file__ group when empty", () => {
		const issues: Issue[] = [
			createErrorIssue({
				location: { file: "AGENTS.md", start: 1, end: 10 },
			}),
		];

		const result = groupIssuesByFile(issues);
		expect(result.__cross_file__).toBeUndefined();
	});
});

// ============================================================================
// sortGroupedIssues Tests
// ============================================================================

describe("sortGroupedIssues", () => {
	test("puts __cross_file__ first", () => {
		const grouped: Record<string, Issue[]> = {
			"AGENTS.md": [createErrorIssue({ severity: 10 })],
			__cross_file__: [createErrorIssue({ severity: 5 })],
			"CLAUDE.md": [createErrorIssue({ severity: 7 })],
		};

		const result = sortGroupedIssues(grouped);
		expect(result[0][0]).toBe("__cross_file__");
	});

	test("sorts by max severity descending", () => {
		const grouped: Record<string, Issue[]> = {
			"low-file.md": [createErrorIssue({ severity: 5 })],
			"high-file.md": [createErrorIssue({ severity: 9 })],
			"medium-file.md": [createErrorIssue({ severity: 7 })],
		};

		const result = sortGroupedIssues(grouped);
		expect(result[0][0]).toBe("high-file.md");
		expect(result[1][0]).toBe("medium-file.md");
		expect(result[2][0]).toBe("low-file.md");
	});

	test("sorts alphabetically when severity is equal", () => {
		const grouped: Record<string, Issue[]> = {
			"z-file.md": [createErrorIssue({ severity: 8 })],
			"a-file.md": [createErrorIssue({ severity: 8 })],
			"m-file.md": [createErrorIssue({ severity: 8 })],
		};

		const result = sortGroupedIssues(grouped);
		expect(result[0][0]).toBe("a-file.md");
		expect(result[1][0]).toBe("m-file.md");
		expect(result[2][0]).toBe("z-file.md");
	});

	test("uses max severity from multiple issues", () => {
		const grouped: Record<string, Issue[]> = {
			"low-max.md": [
				createErrorIssue({ severity: 3 }),
				createErrorIssue({ severity: 5 }),
			],
			"high-max.md": [
				createErrorIssue({ severity: 2 }),
				createErrorIssue({ severity: 9 }),
			],
		};

		const result = sortGroupedIssues(grouped);
		expect(result[0][0]).toBe("high-max.md");
	});
});

// ============================================================================
// buildNestedGrouping Tests
// ============================================================================

describe("buildNestedGrouping", () => {
	test("groups issues by file then by category", () => {
		const issues: Issue[] = [
			createErrorIssue({
				location: { file: "AGENTS.md", start: 1, end: 10 },
				category: "Category A",
				severity: 8,
			}),
			createErrorIssue({
				location: { file: "AGENTS.md", start: 20, end: 30 },
				category: "Category B",
				severity: 5,
			}),
			createErrorIssue({
				location: { file: "AGENTS.md", start: 40, end: 50 },
				category: "Category A",
				severity: 9,
			}),
		];

		const result = buildNestedGrouping(issues);
		expect(result["AGENTS.md"]).toHaveLength(2); // Two categories

		const categoryA = result["AGENTS.md"].find(
			(g) => g.categoryName === "Category A",
		);
		expect(categoryA?.issues).toHaveLength(2);
		expect(categoryA?.maxSeverity).toBe(9);
	});

	test("sorts category groups by max severity descending", () => {
		const issues: Issue[] = [
			createErrorIssue({
				location: { file: "AGENTS.md", start: 1, end: 10 },
				category: "Low Category",
				severity: 5,
			}),
			createErrorIssue({
				location: { file: "AGENTS.md", start: 20, end: 30 },
				category: "High Category",
				severity: 9,
			}),
		];

		const result = buildNestedGrouping(issues);
		expect(result["AGENTS.md"][0].categoryName).toBe("High Category");
		expect(result["AGENTS.md"][1].categoryName).toBe("Low Category");
	});

	test("sorts issues within category by severity descending", () => {
		const issues: Issue[] = [
			createErrorIssue({
				location: { file: "AGENTS.md", start: 1, end: 10 },
				category: "Test",
				severity: 5,
			}),
			createErrorIssue({
				location: { file: "AGENTS.md", start: 20, end: 30 },
				category: "Test",
				severity: 9,
			}),
			createErrorIssue({
				location: { file: "AGENTS.md", start: 40, end: 50 },
				category: "Test",
				severity: 7,
			}),
		];

		const result = buildNestedGrouping(issues);
		const testCategory = result["AGENTS.md"][0];
		expect((testCategory.issues[0] as ErrorIssue).severity).toBe(9);
		expect((testCategory.issues[1] as ErrorIssue).severity).toBe(7);
		expect((testCategory.issues[2] as ErrorIssue).severity).toBe(5);
	});

	test("handles issues without category as Unknown", () => {
		const issues: Issue[] = [
			{
				...createErrorIssue({
					location: { file: "AGENTS.md", start: 1, end: 10 },
				}),
				category: undefined,
			} as unknown as Issue,
		];

		const result = buildNestedGrouping(issues);
		expect(result["AGENTS.md"][0].categoryName).toBe("Unknown");
	});
});

// ============================================================================
// sortNestedFileGroups Tests
// ============================================================================

describe("sortNestedFileGroups", () => {
	test("puts __cross_file__ first", () => {
		const nested: Record<string, CategoryGroup[]> = {
			"AGENTS.md": [{ categoryName: "A", issues: [], maxSeverity: 10 }],
			__cross_file__: [{ categoryName: "B", issues: [], maxSeverity: 5 }],
		};

		const result = sortNestedFileGroups(nested);
		expect(result[0][0]).toBe("__cross_file__");
	});

	test("sorts by max severity across all categories", () => {
		const nested: Record<string, CategoryGroup[]> = {
			"low-file.md": [{ categoryName: "A", issues: [], maxSeverity: 5 }],
			"high-file.md": [
				{ categoryName: "A", issues: [], maxSeverity: 3 },
				{ categoryName: "B", issues: [], maxSeverity: 9 },
			],
		};

		const result = sortNestedFileGroups(nested);
		expect(result[0][0]).toBe("high-file.md");
	});
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe("extractCategories", () => {
	test("returns empty array for empty issues", () => {
		expect(extractCategories([])).toEqual([]);
	});

	test("extracts unique categories and sorts them", () => {
		const issues: Issue[] = [
			createErrorIssue({ category: "Zebra" }),
			createErrorIssue({ category: "Apple" }),
			createErrorIssue({ category: "Zebra" }),
			createErrorIssue({ category: "Banana" }),
		];

		const result = extractCategories(issues);
		expect(result).toEqual(["Apple", "Banana", "Zebra"]);
	});

	test("ignores issues without category", () => {
		const issues: Issue[] = [
			createErrorIssue({ category: "Test" }),
			{ ...createErrorIssue(), category: undefined } as unknown as Issue,
		];

		const result = extractCategories(issues);
		expect(result).toEqual(["Test"]);
	});
});

describe("calculateSeverityCounts", () => {
	test("returns zeros for empty issues", () => {
		expect(calculateSeverityCounts([])).toEqual({
			high: 0,
			medium: 0,
			low: 0,
		});
	});

	test("counts severities correctly (3-level system)", () => {
		const issues: Issue[] = [
			createErrorIssue({ severity: 10 }), // high (8-10)
			createErrorIssue({ severity: 9 }), // high
			createErrorIssue({ severity: 8 }), // high
			createErrorIssue({ severity: 7 }), // medium (6-7)
			createErrorIssue({ severity: 6 }), // medium
			createErrorIssue({ severity: 5 }), // low (≤5)
			createErrorIssue({ severity: 4 }), // low
			createErrorIssue({ severity: 2 }), // low
		];

		const result = calculateSeverityCounts(issues);
		expect(result).toEqual({ high: 3, medium: 2, low: 3 });
	});

	test("handles suggestion issues", () => {
		const issues: Issue[] = [
			createSuggestionIssue({ impactLevel: "High" }), // severity 9 = high
			createSuggestionIssue({ impactLevel: "Medium" }), // severity 6 = medium
			createSuggestionIssue({ impactLevel: "Low" }), // severity 3 = low
		];

		const result = calculateSeverityCounts(issues);
		expect(result).toEqual({ high: 1, medium: 1, low: 1 });
	});
});

describe("calculateIssueTypeCounts", () => {
	test("returns zeros for empty issues", () => {
		expect(calculateIssueTypeCounts([])).toEqual({ error: 0, suggestion: 0 });
	});

	test("counts issue types correctly", () => {
		const issues: Issue[] = [
			createErrorIssue(),
			createErrorIssue(),
			createSuggestionIssue(),
		];

		const result = calculateIssueTypeCounts(issues);
		expect(result).toEqual({ error: 2, suggestion: 1 });
	});
});

describe("splitIssuesByType", () => {
	test("splits issues into errors and suggestions", () => {
		const issues: Issue[] = [
			createErrorIssue({ description: "Error 1" }),
			createSuggestionIssue({ description: "Suggestion 1" }),
			createErrorIssue({ description: "Error 2" }),
		];

		const result = splitIssuesByType(issues);
		expect(result.errors).toHaveLength(2);
		expect(result.suggestions).toHaveLength(1);
	});

	test("handles all errors", () => {
		const issues: Issue[] = [createErrorIssue(), createErrorIssue()];

		const result = splitIssuesByType(issues);
		expect(result.errors).toHaveLength(2);
		expect(result.suggestions).toHaveLength(0);
	});

	test("handles all suggestions", () => {
		const issues: Issue[] = [createSuggestionIssue(), createSuggestionIssue()];

		const result = splitIssuesByType(issues);
		expect(result.errors).toHaveLength(0);
		expect(result.suggestions).toHaveLength(2);
	});
});

describe("calculateIssueLocationCounts", () => {
	test("calculates counts for independent format", () => {
		const output = createIndependentOutput({
			crossFileIssues: [createErrorIssue(), createErrorIssue()],
		});
		const allIssues = [
			createErrorIssue(),
			createErrorIssue(),
			createErrorIssue(),
			createErrorIssue(),
			createErrorIssue(),
		];

		const result = calculateIssueLocationCounts(output, allIssues);
		expect(result).toEqual({ perFileIssueCount: 3, crossFileIssueCount: 2 });
	});

	test("treats all unified format issues as per-file", () => {
		const output = createUnifiedOutput();
		const allIssues = [createErrorIssue(), createErrorIssue()];

		const result = calculateIssueLocationCounts(output, allIssues);
		expect(result).toEqual({ perFileIssueCount: 2, crossFileIssueCount: 0 });
	});
});
