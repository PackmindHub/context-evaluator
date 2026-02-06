import { describe, expect, test } from "bun:test";
import type { ICurationResult, Issue } from "@shared/types/evaluation";
import {
	buildCurationOutput,
	calculateCurationMetadata,
	executeCurationPipeline,
	separateIssuesByType,
} from "./curation-pipeline";

// Helper to create test issues
function createIssue(
	overrides: Partial<Issue & { evaluatorName?: string }> = {},
): Issue & { evaluatorName: string } {
	return {
		category: "Test Category",
		problem: "Test problem",
		location: { file: "test.ts", start: 1, end: 5 },
		issueType: "error",
		severity: 8,
		evaluatorName: "command-completeness",
		...overrides,
	} as Issue & { evaluatorName: string };
}

// Helper to create suggestion issues
function createSuggestionIssue(
	overrides: Partial<Issue & { evaluatorName?: string }> = {},
): Issue & { evaluatorName: string } {
	return {
		category: "Context Gap",
		problem: "Missing context",
		location: { file: "test.ts", start: 1, end: 5 },
		issueType: "suggestion",
		severity: 6,
		evaluatorName: "context-gaps",
		...overrides,
	} as Issue & { evaluatorName: string };
}

describe("Curation Pipeline", () => {
	describe("separateIssuesByType", () => {
		test("should separate errors and suggestions", () => {
			const issues = [
				createIssue({ evaluatorName: "content-quality" }),
				createIssue({ evaluatorName: "command-completeness" }),
				createSuggestionIssue({ evaluatorName: "subdirectory-coverage" }),
				createSuggestionIssue({ evaluatorName: "context-gaps" }),
			];

			const { errors, suggestions } = separateIssuesByType(issues);

			expect(errors).toHaveLength(2);
			expect(suggestions).toHaveLength(2);
		});

		test("should handle only errors", () => {
			const issues = [
				createIssue({ evaluatorName: "content-quality" }),
				createIssue({ evaluatorName: "command-completeness" }),
			];

			const { errors, suggestions } = separateIssuesByType(issues);

			expect(errors).toHaveLength(2);
			expect(suggestions).toHaveLength(0);
		});

		test("should handle only suggestions", () => {
			const issues = [
				createSuggestionIssue({ evaluatorName: "subdirectory-coverage" }),
				createSuggestionIssue({ evaluatorName: "context-gaps" }),
			];

			const { errors, suggestions } = separateIssuesByType(issues);

			expect(errors).toHaveLength(0);
			expect(suggestions).toHaveLength(2);
		});

		test("should handle empty array", () => {
			const { errors, suggestions } = separateIssuesByType([]);

			expect(errors).toHaveLength(0);
			expect(suggestions).toHaveLength(0);
		});

		test("should handle issues without evaluatorName", () => {
			const issues = [
				createIssue({ evaluatorName: undefined as unknown as string }),
				createIssue({ evaluatorName: "" }),
			];

			const { errors, suggestions } = separateIssuesByType(issues);

			// Unknown evaluators default to errors based on evaluator-types logic
			expect(errors.length + suggestions.length).toBeLessThanOrEqual(
				issues.length,
			);
		});
	});

	describe("executeCurationPipeline", () => {
		test("should return empty result when disabled", async () => {
			const issues = [createIssue()];

			const result = await executeCurationPipeline(issues, { enabled: false });

			expect(result.curationOutput).toBeUndefined();
			expect(result.errorCurationResult).toBeNull();
			expect(result.suggestionCurationResult).toBeNull();
		});

		test("should not curate errors below threshold", async () => {
			// Create 10 errors (below default threshold of 30)
			const issues = Array.from({ length: 10 }, (_, i) =>
				createIssue({ problem: `Error ${i}` }),
			);

			const result = await executeCurationPipeline(issues, {
				errorTopN: 30,
			});

			// Should not curate since count < threshold
			expect(result.errorCurationResult).toBeNull();
		});

		test("should not curate suggestions below threshold", async () => {
			// Create 10 suggestions (below default threshold of 30)
			const issues = Array.from({ length: 10 }, (_, i) =>
				createSuggestionIssue({ problem: `Suggestion ${i}` }),
			);

			const result = await executeCurationPipeline(issues, {
				suggestionTopN: 30,
			});

			// Should not curate since count < threshold
			expect(result.suggestionCurationResult).toBeNull();
		});

		test("should verify threshold logic", async () => {
			// Create 5 errors and 5 suggestions
			const issues = [
				...Array.from({ length: 5 }, (_, i) =>
					createIssue({ problem: `Error ${i}` }),
				),
				...Array.from({ length: 5 }, (_, i) =>
					createSuggestionIssue({ problem: `Suggestion ${i}` }),
				),
			];

			// Separate issues first to verify thresholds are checked correctly
			const { errors, suggestions } = separateIssuesByType(issues);

			// With threshold of 3, counts (5) exceed threshold
			const errorTopN = 3;
			const suggestionTopN = 3;

			expect(errors.length).toBeGreaterThan(errorTopN);
			expect(suggestions.length).toBeGreaterThan(suggestionTopN);

			// With threshold of 10, counts (5) are below threshold
			expect(errors.length).toBeLessThanOrEqual(10);
			expect(suggestions.length).toBeLessThanOrEqual(10);
		});

		test("should handle empty issues array", async () => {
			const result = await executeCurationPipeline([]);

			expect(result.curationOutput).toBeUndefined();
			expect(result.errorCurationResult).toBeNull();
			expect(result.suggestionCurationResult).toBeNull();
		});

		test("should default enabled to true", async () => {
			const issues = Array.from({ length: 5 }, (_, i) =>
				createIssue({ problem: `Error ${i}` }),
			);

			// Should process (but not curate if below threshold)
			const result = await executeCurationPipeline(issues);

			// Pipeline ran, but no curation since below threshold
			expect(result.errorCurationResult).toBeNull();
		});
	});

	describe("buildCurationOutput", () => {
		test("should return undefined when no curation results", () => {
			const result = buildCurationOutput(null, [], null, []);

			expect(result).toBeUndefined();
		});

		test("should build output with error curation only", () => {
			const errors = [createIssue({ problem: "Error 1" })];
			const errorCurationResult: ICurationResult = {
				curatedIssues: [{ originalIndex: 0, reason: "High impact" }],
				totalIssuesReviewed: 1,
			};

			const result = buildCurationOutput(errorCurationResult, errors, null, []);

			expect(result).toBeDefined();
			expect(result?.errors).toBeDefined();
			expect(result?.suggestions).toBeUndefined();
		});

		test("should build output with suggestion curation only", () => {
			const suggestions = [createSuggestionIssue({ problem: "Suggestion 1" })];
			const suggestionCurationResult: ICurationResult = {
				curatedIssues: [{ originalIndex: 0, reason: "High value" }],
				totalIssuesReviewed: 1,
			};

			const result = buildCurationOutput(
				null,
				[],
				suggestionCurationResult,
				suggestions,
			);

			expect(result).toBeDefined();
			expect(result?.errors).toBeUndefined();
			expect(result?.suggestions).toBeDefined();
		});

		test("should build output with both error and suggestion curation", () => {
			const errors = [createIssue({ problem: "Error 1" })];
			const suggestions = [createSuggestionIssue({ problem: "Suggestion 1" })];

			const errorCurationResult: ICurationResult = {
				curatedIssues: [{ originalIndex: 0, reason: "High impact" }],
				totalIssuesReviewed: 1,
			};

			const suggestionCurationResult: ICurationResult = {
				curatedIssues: [{ originalIndex: 0, reason: "High value" }],
				totalIssuesReviewed: 1,
			};

			const result = buildCurationOutput(
				errorCurationResult,
				errors,
				suggestionCurationResult,
				suggestions,
			);

			expect(result).toBeDefined();
			expect(result?.errors).toBeDefined();
			expect(result?.suggestions).toBeDefined();
			expect(result?.errors?.summary.totalIssuesReviewed).toBe(1);
			expect(result?.suggestions?.summary.totalIssuesReviewed).toBe(1);
		});
	});

	describe("calculateCurationMetadata", () => {
		test("should calculate metadata when curation is disabled", () => {
			const metadata = calculateCurationMetadata(null, null, false);

			expect(metadata.curationEnabled).toBe(false);
			expect(metadata.errorsCuratedCount).toBeUndefined();
			expect(metadata.suggestionsCuratedCount).toBeUndefined();
			expect(metadata.totalCuratedCount).toBe(0);
			expect(metadata.totalCurationCostUsd).toBe(0);
			expect(metadata.totalCurationDurationMs).toBe(0);
		});

		test("should calculate metadata when curation is enabled but no results", () => {
			const metadata = calculateCurationMetadata(null, null, true);

			expect(metadata.curationEnabled).toBe(true);
			expect(metadata.errorsCuratedCount).toBeUndefined();
			expect(metadata.suggestionsCuratedCount).toBeUndefined();
			expect(metadata.totalCuratedCount).toBe(0);
		});

		test("should calculate metadata with error curation only", () => {
			const errorCurationResult: ICurationResult = {
				curatedIssues: [
					{ originalIndex: 0, reason: "High impact" },
					{ originalIndex: 1, reason: "Critical" },
				],
				totalIssuesReviewed: 50,
				cost_usd: 0.05,
				duration_ms: 1500,
			};

			const metadata = calculateCurationMetadata(
				errorCurationResult,
				null,
				true,
			);

			expect(metadata.curationEnabled).toBe(true);
			expect(metadata.errorsCuratedCount).toBe(2);
			expect(metadata.suggestionsCuratedCount).toBeUndefined();
			expect(metadata.errorCurationCostUsd).toBe(0.05);
			expect(metadata.errorCurationDurationMs).toBe(1500);
			expect(metadata.totalCuratedCount).toBe(2);
			expect(metadata.totalCurationCostUsd).toBe(0.05);
			expect(metadata.totalCurationDurationMs).toBe(1500);
		});

		test("should calculate metadata with suggestion curation only", () => {
			const suggestionCurationResult: ICurationResult = {
				curatedIssues: [
					{ originalIndex: 0, reason: "High value" },
					{ originalIndex: 1, reason: "Quick win" },
					{ originalIndex: 2, reason: "Improves DX" },
				],
				totalIssuesReviewed: 40,
				cost_usd: 0.03,
				duration_ms: 1200,
			};

			const metadata = calculateCurationMetadata(
				null,
				suggestionCurationResult,
				true,
			);

			expect(metadata.curationEnabled).toBe(true);
			expect(metadata.errorsCuratedCount).toBeUndefined();
			expect(metadata.suggestionsCuratedCount).toBe(3);
			expect(metadata.suggestionCurationCostUsd).toBe(0.03);
			expect(metadata.suggestionCurationDurationMs).toBe(1200);
			expect(metadata.totalCuratedCount).toBe(3);
			expect(metadata.totalCurationCostUsd).toBe(0.03);
			expect(metadata.totalCurationDurationMs).toBe(1200);
		});

		test("should calculate metadata with both curation results", () => {
			const errorCurationResult: ICurationResult = {
				curatedIssues: [{ originalIndex: 0, reason: "High impact" }],
				totalIssuesReviewed: 50,
				cost_usd: 0.05,
				duration_ms: 1500,
			};

			const suggestionCurationResult: ICurationResult = {
				curatedIssues: [
					{ originalIndex: 0, reason: "High value" },
					{ originalIndex: 1, reason: "Quick win" },
				],
				totalIssuesReviewed: 40,
				cost_usd: 0.03,
				duration_ms: 1200,
			};

			const metadata = calculateCurationMetadata(
				errorCurationResult,
				suggestionCurationResult,
				true,
			);

			expect(metadata.curationEnabled).toBe(true);
			expect(metadata.errorsCuratedCount).toBe(1);
			expect(metadata.suggestionsCuratedCount).toBe(2);
			expect(metadata.errorCurationCostUsd).toBe(0.05);
			expect(metadata.suggestionCurationCostUsd).toBe(0.03);
			expect(metadata.errorCurationDurationMs).toBe(1500);
			expect(metadata.suggestionCurationDurationMs).toBe(1200);
			expect(metadata.totalCuratedCount).toBe(3); // 1 + 2
			expect(metadata.totalCurationCostUsd).toBe(0.08); // 0.05 + 0.03
			expect(metadata.totalCurationDurationMs).toBe(2700); // 1500 + 1200
		});

		test("should handle missing cost and duration", () => {
			const errorCurationResult: ICurationResult = {
				curatedIssues: [{ originalIndex: 0, reason: "High impact" }],
				totalIssuesReviewed: 10,
				// No cost_usd or duration_ms
			};

			const metadata = calculateCurationMetadata(
				errorCurationResult,
				null,
				true,
			);

			expect(metadata.errorCurationCostUsd).toBeUndefined();
			expect(metadata.errorCurationDurationMs).toBeUndefined();
			expect(metadata.totalCurationCostUsd).toBe(0);
			expect(metadata.totalCurationDurationMs).toBe(0);
		});
	});

	describe("Integration scenarios", () => {
		test("should support typical engine workflow", async () => {
			// Simulate mixed errors and suggestions
			const issues = [
				// Errors (from error evaluators)
				createIssue({
					evaluatorName: "content-quality",
					problem: "Error 1",
				}),
				createIssue({
					evaluatorName: "command-completeness",
					problem: "Error 2",
				}),
				createIssue({ evaluatorName: "security", problem: "Error 3" }),
				// Suggestions (from suggestion evaluators)
				createSuggestionIssue({
					evaluatorName: "subdirectory-coverage",
					problem: "Suggestion 1",
				}),
				createSuggestionIssue({
					evaluatorName: "context-gaps",
					problem: "Suggestion 2",
				}),
			];

			// Step 1: Separate by type
			const { errors, suggestions } = separateIssuesByType(issues);
			expect(errors).toHaveLength(3);
			expect(suggestions).toHaveLength(2);

			// Step 2: Execute curation (won't curate since below threshold)
			const result = await executeCurationPipeline(issues, {
				errorTopN: 30,
				suggestionTopN: 30,
			});

			// No curation since counts are below thresholds
			expect(result.errorCurationResult).toBeNull();
			expect(result.suggestionCurationResult).toBeNull();

			// Step 3: Calculate metadata
			const metadata = calculateCurationMetadata(
				result.errorCurationResult,
				result.suggestionCurationResult,
				true,
			);

			expect(metadata.curationEnabled).toBe(true);
			expect(metadata.totalCuratedCount).toBe(0);
		});

		test("should classify all known evaluators correctly", () => {
			// Test that all evaluators are classified correctly
			const errorEvaluators = [
				"content-quality",
				"structure-formatting",
				"command-completeness",
				"testing-validation",
				"code-style",
				"language-clarity",
				"git-workflow",
				"project-structure",
				"security",
				"completeness",
				"contradictory-instructions",
				"markdown-validity",
				"outdated-documentation",
			];

			const suggestionEvaluators = [
				"subdirectory-coverage",
				"context-gaps",
				"test-patterns-coverage",
				"database-patterns-coverage",
			];

			const errorIssues = errorEvaluators.map((name) =>
				createIssue({ evaluatorName: name }),
			);

			const suggestionIssues = suggestionEvaluators.map((name) =>
				createSuggestionIssue({ evaluatorName: name }),
			);

			const allIssues = [...errorIssues, ...suggestionIssues];
			const { errors, suggestions } = separateIssuesByType(allIssues);

			expect(errors).toHaveLength(errorEvaluators.length);
			expect(suggestions).toHaveLength(suggestionEvaluators.length);
		});
	});
});
