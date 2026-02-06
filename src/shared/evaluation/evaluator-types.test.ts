import { describe, expect, test } from "bun:test";
import {
	filterEvaluatorsByType,
	getEvaluatorCountByType,
	getEvaluatorFilterMetadata,
	getIssueTypeFromEvaluatorName,
	shouldExecuteIfNoFile,
} from "./evaluator-types";
import { EVALUATOR_FILES } from "./runner";

describe("Evaluator Types", () => {
	describe("getIssueTypeFromEvaluatorName", () => {
		test("should return error for content quality evaluator", () => {
			expect(getIssueTypeFromEvaluatorName("content-quality.md")).toBe("error");
		});

		test("should return error for structure formatting evaluator", () => {
			expect(getIssueTypeFromEvaluatorName("structure-formatting.md")).toBe(
				"error",
			);
		});

		test("should return error for command completeness evaluator", () => {
			expect(getIssueTypeFromEvaluatorName("command-completeness.md")).toBe(
				"error",
			);
		});

		test("should return error for testing validation evaluator", () => {
			expect(getIssueTypeFromEvaluatorName("testing-validation.md")).toBe(
				"error",
			);
		});

		test("should return error for code style evaluator", () => {
			expect(getIssueTypeFromEvaluatorName("code-style.md")).toBe("error");
		});

		test("should return error for language clarity evaluator", () => {
			expect(getIssueTypeFromEvaluatorName("language-clarity.md")).toBe(
				"error",
			);
		});

		test("should return error for git workflow evaluator", () => {
			expect(getIssueTypeFromEvaluatorName("git-workflow.md")).toBe("error");
		});

		test("should return error for project structure evaluator", () => {
			expect(getIssueTypeFromEvaluatorName("project-structure.md")).toBe(
				"error",
			);
		});

		test("should return error for security evaluator", () => {
			expect(getIssueTypeFromEvaluatorName("security.md")).toBe("error");
		});

		test("should return error for completeness evaluator", () => {
			expect(getIssueTypeFromEvaluatorName("completeness.md")).toBe("error");
		});

		test("should return suggestion for subdirectory coverage evaluator", () => {
			expect(getIssueTypeFromEvaluatorName("subdirectory-coverage.md")).toBe(
				"suggestion",
			);
		});

		test("should return suggestion for context gaps evaluator", () => {
			expect(getIssueTypeFromEvaluatorName("context-gaps.md")).toBe(
				"suggestion",
			);
		});

		test("should return error for contradictory instructions evaluator", () => {
			expect(
				getIssueTypeFromEvaluatorName("contradictory-instructions.md"),
			).toBe("error");
		});

		test("should return error for outdated documentation evaluator", () => {
			expect(getIssueTypeFromEvaluatorName("outdated-documentation.md")).toBe(
				"error",
			);
		});

		test("should handle evaluator name without .md extension", () => {
			expect(getIssueTypeFromEvaluatorName("content-quality")).toBe("error");
			expect(getIssueTypeFromEvaluatorName("subdirectory-coverage")).toBe(
				"suggestion",
			);
		});

		test("should default to error for unknown evaluators", () => {
			expect(getIssueTypeFromEvaluatorName("99-unknown-evaluator.md")).toBe(
				"error",
			);
			expect(getIssueTypeFromEvaluatorName("custom-evaluator")).toBe("error");
		});

		test("should handle empty string", () => {
			expect(getIssueTypeFromEvaluatorName("")).toBe("error");
		});
	});

	describe("shouldExecuteIfNoFile", () => {
		test("should return false for content quality evaluator", () => {
			expect(shouldExecuteIfNoFile("content-quality.md")).toBe(false);
		});

		test("should return false for structure formatting evaluator", () => {
			expect(shouldExecuteIfNoFile("structure-formatting.md")).toBe(false);
		});

		test("should return false for command completeness evaluator", () => {
			expect(shouldExecuteIfNoFile("command-completeness.md")).toBe(false);
		});

		test("should return false for testing validation evaluator", () => {
			expect(shouldExecuteIfNoFile("testing-validation.md")).toBe(false);
		});

		test("should return false for code style evaluator", () => {
			expect(shouldExecuteIfNoFile("code-style.md")).toBe(false);
		});

		test("should return false for language clarity evaluator", () => {
			expect(shouldExecuteIfNoFile("language-clarity.md")).toBe(false);
		});

		test("should return false for git workflow evaluator", () => {
			expect(shouldExecuteIfNoFile("git-workflow.md")).toBe(false);
		});

		test("should return false for project structure evaluator", () => {
			expect(shouldExecuteIfNoFile("project-structure.md")).toBe(false);
		});

		test("should return false for security evaluator", () => {
			expect(shouldExecuteIfNoFile("security.md")).toBe(false);
		});

		test("should return false for completeness evaluator", () => {
			expect(shouldExecuteIfNoFile("completeness.md")).toBe(false);
		});

		test("should return false for subdirectory coverage evaluator", () => {
			expect(shouldExecuteIfNoFile("subdirectory-coverage.md")).toBe(false);
		});

		test("should return true for context gaps evaluator", () => {
			expect(shouldExecuteIfNoFile("context-gaps.md")).toBe(true);
		});

		test("should return false for contradictory instructions evaluator", () => {
			expect(shouldExecuteIfNoFile("contradictory-instructions.md")).toBe(
				false,
			);
		});

		test("should return false for outdated documentation evaluator", () => {
			expect(shouldExecuteIfNoFile("outdated-documentation.md")).toBe(false);
		});

		test("should handle evaluator name without .md extension", () => {
			expect(shouldExecuteIfNoFile("context-gaps")).toBe(true);
			expect(shouldExecuteIfNoFile("content-quality")).toBe(false);
		});

		test("should default to false for unknown evaluators", () => {
			expect(shouldExecuteIfNoFile("99-unknown-evaluator.md")).toBe(false);
			expect(shouldExecuteIfNoFile("custom-evaluator")).toBe(false);
		});

		test("should handle empty string", () => {
			expect(shouldExecuteIfNoFile("")).toBe(false);
		});
	});

	describe("filterEvaluatorsByType", () => {
		test("should return all 17 evaluators when filter is 'all'", () => {
			const result = filterEvaluatorsByType(EVALUATOR_FILES, "all");
			expect(result).toHaveLength(17);
			expect(result).toEqual([...EVALUATOR_FILES]);
		});

		test("should return 13 error evaluators when filter is 'errors'", () => {
			const result = filterEvaluatorsByType(EVALUATOR_FILES, "errors");
			expect(result).toHaveLength(13);
			// Verify each returned evaluator is an error type
			for (const file of result) {
				expect(getIssueTypeFromEvaluatorName(file)).toBe("error");
			}
		});

		test("should return 4 suggestion evaluators when filter is 'suggestions'", () => {
			const result = filterEvaluatorsByType(EVALUATOR_FILES, "suggestions");
			expect(result).toHaveLength(4);
			// Verify each returned evaluator is a suggestion type
			for (const file of result) {
				expect(getIssueTypeFromEvaluatorName(file)).toBe("suggestion");
			}
		});

		test("should preserve order of evaluators", () => {
			const errors = filterEvaluatorsByType(EVALUATOR_FILES, "errors");
			expect(errors[0]).toBe("content-quality.md");

			const suggestions = filterEvaluatorsByType(
				EVALUATOR_FILES,
				"suggestions",
			);
			expect(suggestions[0]).toBe("subdirectory-coverage.md");
		});

		test("should default to 'all' when filter is undefined", () => {
			const result = filterEvaluatorsByType(EVALUATOR_FILES);
			expect(result).toHaveLength(17);
		});

		test("should handle empty array", () => {
			const result = filterEvaluatorsByType([], "errors");
			expect(result).toHaveLength(0);
		});
	});

	describe("getEvaluatorCountByType", () => {
		test("should return 18 for 'all' filter", () => {
			expect(getEvaluatorCountByType("all")).toBe(17);
		});

		test("should return 13 for 'errors' filter", () => {
			expect(getEvaluatorCountByType("errors")).toBe(13);
		});

		test("should return 5 for 'suggestions' filter", () => {
			expect(getEvaluatorCountByType("suggestions")).toBe(4);
		});
	});

	describe("getEvaluatorFilterMetadata", () => {
		test("should return metadata for all three filter types", () => {
			const metadata = getEvaluatorFilterMetadata();
			expect(metadata).toHaveLength(3);
		});

		test("should have correct structure for each filter", () => {
			const metadata = getEvaluatorFilterMetadata();

			const allFilter = metadata.find((m) => m.value === "all");
			expect(allFilter).toBeDefined();
			expect(allFilter?.label).toBe("All Evaluators");
			expect(allFilter?.count).toBe(17);
			expect(allFilter?.description).toContain("all evaluators");

			const errorsFilter = metadata.find((m) => m.value === "errors");
			expect(errorsFilter).toBeDefined();
			expect(errorsFilter?.label).toBe("Errors Only");
			expect(errorsFilter?.count).toBe(13);
			expect(errorsFilter?.description).toContain("existing content");

			const suggestionsFilter = metadata.find((m) => m.value === "suggestions");
			expect(suggestionsFilter).toBeDefined();
			expect(suggestionsFilter?.label).toBe("Suggestions Only");
			expect(suggestionsFilter?.count).toBe(4);
			expect(suggestionsFilter?.description).toContain("improvement");
		});
	});
});
