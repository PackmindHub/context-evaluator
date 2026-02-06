import { describe, expect, test } from "bun:test";
import type {
	CategoryGroup,
	ErrorIssue,
	EvaluationOutput,
	IndependentEvaluationOutput,
	Issue,
	Location,
	SuggestionIssue,
	UnifiedEvaluationOutput,
} from "./evaluation";
import {
	formatLocation,
	getImpactBadgeClass,
	getImpactLabel,
	getIssueFile,
	getIssueSeverity,
	getIssueType,
	getMaxCategoryGroupSeverity,
	getMaxIssueSeverity,
	getSeverityBorderColor,
	getSeverityColor,
	getSeverityEmoji,
	getSeverityLevel,
	impactToSeverity,
	isCrossFileIssue,
	isIndependentFormat,
	isUnifiedFormat,
	parseEvaluatorResult,
} from "./evaluation";

// ============================================================================
// Test Fixtures
// ============================================================================

const createErrorIssue = (overrides: Partial<ErrorIssue> = {}): ErrorIssue => ({
	issueType: "error",
	category: "Test Category",
	severity: 8,
	location: { start: 1, end: 10 },
	description: "Test error description",
	...overrides,
});

const createSuggestionIssue = (
	overrides: Partial<SuggestionIssue> = {},
): SuggestionIssue => ({
	issueType: "suggestion",
	category: "Test Category",
	impactLevel: "Medium",
	location: { start: 1, end: 10 },
	description: "Test suggestion description",
	...overrides,
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
// Type Guards Tests
// ============================================================================

describe("isUnifiedFormat", () => {
	test("returns true for unified format output", () => {
		const output = createUnifiedOutput({ results: [] });
		expect(isUnifiedFormat(output)).toBe(true);
	});

	test("returns true when results is an array with items", () => {
		const output = createUnifiedOutput({
			results: [{ evaluator: "test-evaluator" }],
		});
		expect(isUnifiedFormat(output)).toBe(true);
	});

	test("returns false for independent format output", () => {
		const output = createIndependentOutput();
		expect(isUnifiedFormat(output)).toBe(false);
	});

	test("returns false when results property is missing", () => {
		const output = { metadata: {}, files: {} } as EvaluationOutput;
		expect(isUnifiedFormat(output)).toBe(false);
	});
});

describe("isIndependentFormat", () => {
	test("returns true for independent format output", () => {
		const output = createIndependentOutput({ files: {} });
		expect(isIndependentFormat(output)).toBe(true);
	});

	test("returns true when files object has entries", () => {
		const output = createIndependentOutput({
			files: {
				"test.md": {
					evaluations: [],
					totalIssues: 0,
					highCount: 0,
					mediumCount: 0,
					lowCount: 0,
				},
			},
		});
		expect(isIndependentFormat(output)).toBe(true);
	});

	test("returns false for unified format output", () => {
		const output = createUnifiedOutput();
		expect(isIndependentFormat(output)).toBe(false);
	});

	test("returns false when files property is missing", () => {
		const output = { metadata: {}, results: [] } as EvaluationOutput;
		expect(isIndependentFormat(output)).toBe(false);
	});
});

// ============================================================================
// Severity Helpers Tests
// ============================================================================

describe("getSeverityLevel", () => {
	test("returns high for severity >= 8", () => {
		expect(getSeverityLevel(8)).toBe("high");
		expect(getSeverityLevel(9)).toBe("high");
		expect(getSeverityLevel(10)).toBe("high");
	});

	test("returns medium for severity >= 6 and < 8", () => {
		expect(getSeverityLevel(6)).toBe("medium");
		expect(getSeverityLevel(7)).toBe("medium");
	});

	test("returns low for severity < 6", () => {
		expect(getSeverityLevel(0)).toBe("low");
		expect(getSeverityLevel(1)).toBe("low");
		expect(getSeverityLevel(4)).toBe("low");
		expect(getSeverityLevel(5)).toBe("low");
	});
});

describe("getSeverityColor", () => {
	test("returns high badge class for severity >= 8", () => {
		expect(getSeverityColor(8)).toBe("severity-badge severity-high");
		expect(getSeverityColor(9)).toBe("severity-badge severity-high");
		expect(getSeverityColor(10)).toBe("severity-badge severity-high");
	});

	test("returns medium badge class for severity >= 6", () => {
		expect(getSeverityColor(6)).toBe("severity-badge severity-medium");
		expect(getSeverityColor(7)).toBe("severity-badge severity-medium");
	});

	test("returns low badge class for severity < 6", () => {
		expect(getSeverityColor(1)).toBe("severity-badge severity-low");
		expect(getSeverityColor(4)).toBe("severity-badge severity-low");
		expect(getSeverityColor(5)).toBe("severity-badge severity-low");
	});
});

describe("getSeverityBorderColor", () => {
	test("returns orange for high severity (8-10)", () => {
		expect(getSeverityBorderColor(8)).toBe("rgb(249, 115, 22)");
		expect(getSeverityBorderColor(9)).toBe("rgb(249, 115, 22)");
		expect(getSeverityBorderColor(10)).toBe("rgb(249, 115, 22)");
	});

	test("returns yellow for medium severity (6-7)", () => {
		expect(getSeverityBorderColor(6)).toBe("rgb(234, 179, 8)");
		expect(getSeverityBorderColor(7)).toBe("rgb(234, 179, 8)");
	});

	test("returns slate for low severity (≤5)", () => {
		expect(getSeverityBorderColor(1)).toBe("rgb(148, 163, 184)");
		expect(getSeverityBorderColor(4)).toBe("rgb(148, 163, 184)");
		expect(getSeverityBorderColor(5)).toBe("rgb(148, 163, 184)");
	});
});

describe("getSeverityEmoji", () => {
	test("returns orange circle for high severity (8-10)", () => {
		expect(getSeverityEmoji(8)).toBe("🟠");
		expect(getSeverityEmoji(9)).toBe("🟠");
		expect(getSeverityEmoji(10)).toBe("🟠");
	});

	test("returns yellow circle for medium severity (6-7)", () => {
		expect(getSeverityEmoji(6)).toBe("🟡");
		expect(getSeverityEmoji(7)).toBe("🟡");
	});

	test("returns white circle for low severity (≤5)", () => {
		expect(getSeverityEmoji(1)).toBe("⚪");
		expect(getSeverityEmoji(4)).toBe("⚪");
		expect(getSeverityEmoji(5)).toBe("⚪");
	});
});

// ============================================================================
// Impact Level Helpers Tests
// ============================================================================

describe("getImpactLabel", () => {
	test("returns capitalized impact levels", () => {
		expect(getImpactLabel("High")).toBe("High");
		expect(getImpactLabel("Medium")).toBe("Medium");
		expect(getImpactLabel("Low")).toBe("Low");
	});
});

describe("getImpactBadgeClass", () => {
	test("returns high severity badge for High impact", () => {
		expect(getImpactBadgeClass("High")).toBe("severity-badge severity-high");
	});

	test("returns medium severity badge for Medium impact", () => {
		expect(getImpactBadgeClass("Medium")).toBe(
			"severity-badge severity-medium",
		);
	});

	test("returns low severity badge for Low impact", () => {
		expect(getImpactBadgeClass("Low")).toBe("severity-badge severity-low");
	});
});

describe("impactToSeverity", () => {
	test("converts High impact to severity 9 (high)", () => {
		expect(impactToSeverity("High")).toBe(9);
	});

	test("converts Medium impact to severity 6 (medium)", () => {
		expect(impactToSeverity("Medium")).toBe(6);
	});

	test("converts Low impact to severity 3 (low)", () => {
		expect(impactToSeverity("Low")).toBe(3);
	});
});

describe("getIssueSeverity", () => {
	test("returns severity directly for error issues", () => {
		const errorIssue = createErrorIssue({ severity: 8 });
		expect(getIssueSeverity(errorIssue)).toBe(8);
	});

	test("converts impactLevel to severity for suggestion issues", () => {
		const highImpact = createSuggestionIssue({ impactLevel: "High" });
		expect(getIssueSeverity(highImpact)).toBe(9);

		const mediumImpact = createSuggestionIssue({ impactLevel: "Medium" });
		expect(getIssueSeverity(mediumImpact)).toBe(6);

		const lowImpact = createSuggestionIssue({ impactLevel: "Low" });
		expect(getIssueSeverity(lowImpact)).toBe(3);
	});
});

// ============================================================================
// parseEvaluatorResult Tests (CRITICAL)
// ============================================================================

describe("parseEvaluatorResult", () => {
	test("parses JSON array format directly", () => {
		const result = JSON.stringify([
			createErrorIssue({ description: "Issue 1" }),
			createErrorIssue({ description: "Issue 2" }),
		]);
		const parsed = parseEvaluatorResult(result);
		expect(parsed).toHaveLength(2);
		expect(parsed[0].description).toBe("Issue 1");
	});

	test("parses unified format with perFileIssues and crossFileIssues", () => {
		const result = JSON.stringify({
			perFileIssues: {
				"AGENTS.md": [createErrorIssue({ description: "Per-file issue" })],
			},
			crossFileIssues: [createErrorIssue({ description: "Cross-file issue" })],
		});
		const parsed = parseEvaluatorResult(result);
		expect(parsed).toHaveLength(2);
		expect(parsed[0].description).toBe("Per-file issue");
		expect(parsed[1].description).toBe("Cross-file issue");
	});

	test("handles unified format with only perFileIssues", () => {
		const result = JSON.stringify({
			perFileIssues: {
				"AGENTS.md": [createErrorIssue()],
				"CLAUDE.md": [createErrorIssue(), createErrorIssue()],
			},
		});
		const parsed = parseEvaluatorResult(result);
		expect(parsed).toHaveLength(3);
	});

	test("handles unified format with only crossFileIssues", () => {
		const result = JSON.stringify({
			crossFileIssues: [createErrorIssue(), createErrorIssue()],
		});
		const parsed = parseEvaluatorResult(result);
		expect(parsed).toHaveLength(2);
	});

	test("extracts JSON array from mixed content (markdown with JSON)", () => {
		const result = `Here are the issues found:

		\`\`\`json
		[{"issueType": "error", "category": "Test", "severity": 8, "location": {"start": 1, "end": 5}, "description": "Found in markdown"}]
		\`\`\`

		Summary: 1 issue found`;
		const parsed = parseEvaluatorResult(result);
		expect(parsed).toHaveLength(1);
		expect(parsed[0].description).toBe("Found in markdown");
	});

	test("returns empty array for invalid JSON", () => {
		expect(parseEvaluatorResult("not json at all")).toEqual([]);
		expect(parseEvaluatorResult("{invalid")).toEqual([]);
	});

	test("returns empty array for empty string", () => {
		expect(parseEvaluatorResult("")).toEqual([]);
	});

	test("returns empty array for JSON that is neither array nor unified format", () => {
		expect(parseEvaluatorResult('{"someKey": "someValue"}')).toEqual([]);
	});

	test("returns empty array when perFileIssues contains non-array values", () => {
		const result = JSON.stringify({
			perFileIssues: {
				"AGENTS.md": "not an array",
			},
		});
		const parsed = parseEvaluatorResult(result);
		expect(parsed).toEqual([]);
	});

	test("handles real-world evaluator response format", () => {
		const realWorldResult = JSON.stringify({
			perFileIssues: {
				"AGENTS.md": [
					{
						issueType: "error",
						category: "Content Quality",
						severity: 7,
						location: { start: 15, end: 25 },
						description: "Vague instruction found",
						problem: "The instructions lack specificity",
						fix: "Be more specific about expectations",
					},
				],
			},
			crossFileIssues: [],
		});
		const parsed = parseEvaluatorResult(realWorldResult);
		expect(parsed).toHaveLength(1);
		expect(parsed[0].category).toBe("Content Quality");
		expect(parsed[0].problem).toBe("The instructions lack specificity");
	});
});

// ============================================================================
// formatLocation Tests
// ============================================================================

describe("formatLocation", () => {
	test("formats single location without file", () => {
		const location: Location = { start: 10, end: 20 };
		expect(formatLocation(location)).toBe("Lines 10-20");
	});

	test("formats single location with file", () => {
		const location: Location = { file: "AGENTS.md", start: 10, end: 20 };
		expect(formatLocation(location)).toBe("AGENTS.md:10-20");
	});

	test("formats array of locations without files", () => {
		const locations: Location[] = [
			{ start: 10, end: 20 },
			{ start: 30, end: 40 },
		];
		expect(formatLocation(locations)).toBe("Lines 10-20, Lines 30-40");
	});

	test("formats array of locations with files", () => {
		const locations: Location[] = [
			{ file: "AGENTS.md", start: 10, end: 20 },
			{ file: "CLAUDE.md", start: 30, end: 40 },
		];
		expect(formatLocation(locations)).toBe("AGENTS.md:10-20, CLAUDE.md:30-40");
	});

	test("formats mixed array of locations (some with files, some without)", () => {
		const locations: Location[] = [
			{ file: "AGENTS.md", start: 10, end: 20 },
			{ start: 30, end: 40 },
		];
		expect(formatLocation(locations)).toBe("AGENTS.md:10-20, Lines 30-40");
	});

	test("handles single-line location", () => {
		const location: Location = { start: 5, end: 5 };
		expect(formatLocation(location)).toBe("Lines 5-5");
	});
});

// ============================================================================
// Issue Type Helpers Tests
// ============================================================================

describe("getIssueType", () => {
	test("returns issueType when explicitly set to error", () => {
		const issue = createErrorIssue();
		expect(getIssueType(issue)).toBe("error");
	});

	test("returns issueType when explicitly set to suggestion", () => {
		const issue = createSuggestionIssue();
		expect(getIssueType(issue)).toBe("suggestion");
	});

	test("infers suggestion type from evaluator name 11-subdirectory-coverage", () => {
		const issue = {
			category: "Test",
			location: { start: 1, end: 5 },
			evaluatorName: "11-subdirectory-coverage",
		} as unknown as Issue;
		expect(getIssueType(issue)).toBe("suggestion");
	});

	test("infers suggestion type from evaluator name 12-context-gaps", () => {
		const issue = {
			category: "Test",
			location: { start: 1, end: 5 },
			evaluatorName: "12-context-gaps",
		} as unknown as Issue;
		expect(getIssueType(issue)).toBe("suggestion");
	});

	test("defaults to error for unknown evaluator names", () => {
		const issue = {
			category: "Test",
			location: { start: 1, end: 5 },
			evaluatorName: "01-content-quality",
		} as unknown as Issue;
		expect(getIssueType(issue)).toBe("error");
	});

	test("defaults to error when no evaluatorName", () => {
		const issue = {
			category: "Test",
			location: { start: 1, end: 5 },
		} as unknown as Issue;
		expect(getIssueType(issue)).toBe("error");
	});
});

describe("isCrossFileIssue", () => {
	test("returns true when affectedFiles has multiple files", () => {
		const issue = createErrorIssue({
			affectedFiles: ["AGENTS.md", "CLAUDE.md"],
		});
		expect(isCrossFileIssue(issue)).toBe(true);
	});

	test("returns true when isMultiFile is true", () => {
		const issue = createErrorIssue({ isMultiFile: true });
		expect(isCrossFileIssue(issue)).toBe(true);
	});

	test("returns true when location array has multiple different files", () => {
		const issue = createErrorIssue({
			location: [
				{ file: "AGENTS.md", start: 1, end: 10 },
				{ file: "CLAUDE.md", start: 5, end: 15 },
			],
		});
		expect(isCrossFileIssue(issue)).toBe(true);
	});

	test("returns false when location array has same file", () => {
		const issue = createErrorIssue({
			location: [
				{ file: "AGENTS.md", start: 1, end: 10 },
				{ file: "AGENTS.md", start: 20, end: 30 },
			],
		});
		expect(isCrossFileIssue(issue)).toBe(false);
	});

	test("returns false for single file issue", () => {
		const issue = createErrorIssue({
			location: { file: "AGENTS.md", start: 1, end: 10 },
		});
		expect(isCrossFileIssue(issue)).toBe(false);
	});

	test("returns false when affectedFiles has single file", () => {
		const issue = createErrorIssue({
			affectedFiles: ["AGENTS.md"],
		});
		expect(isCrossFileIssue(issue)).toBe(false);
	});
});

describe("getIssueFile", () => {
	test("returns null for cross-file issues", () => {
		const issue = createErrorIssue({
			affectedFiles: ["AGENTS.md", "CLAUDE.md"],
		});
		expect(getIssueFile(issue)).toBeNull();
	});

	test("returns file from single location", () => {
		const issue = createErrorIssue({
			location: { file: "AGENTS.md", start: 1, end: 10 },
		});
		expect(getIssueFile(issue)).toBe("AGENTS.md");
	});

	test("returns first file from location array", () => {
		const issue = createErrorIssue({
			location: [
				{ file: "AGENTS.md", start: 1, end: 10 },
				{ file: "AGENTS.md", start: 20, end: 30 },
			],
		});
		expect(getIssueFile(issue)).toBe("AGENTS.md");
	});

	test("returns file from single-item affectedFiles", () => {
		const issue = createErrorIssue({
			affectedFiles: ["CLAUDE.md"],
			location: { start: 1, end: 10 }, // No file in location
		});
		expect(getIssueFile(issue)).toBe("CLAUDE.md");
	});

	test("returns null when no file information available", () => {
		const issue = createErrorIssue({
			location: { start: 1, end: 10 }, // No file
		});
		expect(getIssueFile(issue)).toBeNull();
	});
});

// ============================================================================
// Max Severity Helpers Tests
// ============================================================================

describe("getMaxIssueSeverity", () => {
	test("returns 0 for empty array", () => {
		expect(getMaxIssueSeverity([])).toBe(0);
	});

	test("returns max severity from error issues", () => {
		const issues: Issue[] = [
			createErrorIssue({ severity: 5 }),
			createErrorIssue({ severity: 9 }),
			createErrorIssue({ severity: 7 }),
		];
		expect(getMaxIssueSeverity(issues)).toBe(9);
	});

	test("returns max severity from suggestion issues", () => {
		const issues: Issue[] = [
			createSuggestionIssue({ impactLevel: "Low" }),
			createSuggestionIssue({ impactLevel: "High" }),
			createSuggestionIssue({ impactLevel: "Medium" }),
		];
		expect(getMaxIssueSeverity(issues)).toBe(9); // High = 9
	});

	test("returns max severity from mixed issues", () => {
		const issues: Issue[] = [
			createErrorIssue({ severity: 6 }),
			createSuggestionIssue({ impactLevel: "High" }), // 9
			createErrorIssue({ severity: 8 }),
		];
		expect(getMaxIssueSeverity(issues)).toBe(9);
	});
});

describe("getMaxCategoryGroupSeverity", () => {
	test("returns 0 for empty array", () => {
		expect(getMaxCategoryGroupSeverity([])).toBe(0);
	});

	test("returns max severity across category groups", () => {
		const groups: CategoryGroup[] = [
			{
				categoryName: "Category A",
				issues: [createErrorIssue({ severity: 5 })],
				maxSeverity: 5,
			},
			{
				categoryName: "Category B",
				issues: [createErrorIssue({ severity: 9 })],
				maxSeverity: 9,
			},
			{
				categoryName: "Category C",
				issues: [createErrorIssue({ severity: 7 })],
				maxSeverity: 7,
			},
		];
		expect(getMaxCategoryGroupSeverity(groups)).toBe(9);
	});

	test("uses maxSeverity field from groups", () => {
		const groups: CategoryGroup[] = [
			{
				categoryName: "Category A",
				issues: [],
				maxSeverity: 10,
			},
		];
		expect(getMaxCategoryGroupSeverity(groups)).toBe(10);
	});
});
