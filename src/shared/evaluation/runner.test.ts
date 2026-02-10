import { describe, expect, test } from "bun:test";
import type { ErrorIssue, SuggestionIssue } from "@shared/types/evaluation";
import {
	EVALUATOR_CONFIGS,
	filterEvaluatorsByType,
	shouldExecuteIfNoFile,
} from "./evaluator-types";
import { countBySeverity, EVALUATOR_FILES } from "./runner";

describe("Runner - Evaluator Filter Integration", () => {
	describe("EVALUATOR_FILES filtering", () => {
		test("should filter to only error evaluators when evaluatorFilter is 'errors'", () => {
			const filtered = filterEvaluatorsByType(EVALUATOR_FILES, "errors");

			// Should have 13 error evaluators (after merging 03+16)
			expect(filtered.length).toBe(13);

			// Verify specific error evaluators are included
			expect(filtered).toContain("content-quality.md");
			expect(filtered).toContain("structure-formatting.md");
			expect(filtered).toContain("command-completeness.md");
			expect(filtered).toContain("completeness.md");
			expect(filtered).toContain("contradictory-instructions.md");
			expect(filtered).toContain("outdated-documentation.md");

			// Verify suggestion evaluators are excluded
			expect(filtered).not.toContain("subdirectory-coverage.md");
			expect(filtered).not.toContain("context-gaps.md");
			expect(filtered).not.toContain("test-patterns-coverage.md");
			expect(filtered).not.toContain("database-patterns-coverage.md");
			expect(filtered).not.toContain("git-history-suggestions.md");
		});

		test("should filter to only suggestion evaluators when evaluatorFilter is 'suggestions'", () => {
			const filtered = filterEvaluatorsByType(EVALUATOR_FILES, "suggestions");

			// Should have 4 suggestion evaluators
			expect(filtered.length).toBe(4);

			// Verify all suggestion evaluators are included
			expect(filtered).toContain("subdirectory-coverage.md");
			expect(filtered).toContain("context-gaps.md");
			expect(filtered).toContain("test-patterns-coverage.md");
			expect(filtered).toContain("database-patterns-coverage.md");

			// Verify error evaluators are excluded
			expect(filtered).not.toContain("content-quality.md");
			expect(filtered).not.toContain("structure-formatting.md");
			expect(filtered).not.toContain("outdated-documentation.md");
		});

		test("should return all evaluators when evaluatorFilter is 'all'", () => {
			const filtered = filterEvaluatorsByType(EVALUATOR_FILES, "all");

			// Should have all 17 evaluators (after merging 03+16)
			expect(filtered.length).toBe(17);
			expect(filtered).toEqual([...EVALUATOR_FILES]);
		});

		test("should default to 'all' when evaluatorFilter is undefined", () => {
			const filtered = filterEvaluatorsByType(EVALUATOR_FILES);

			// Should have all 17 evaluators (after merging 03+16)
			expect(filtered.length).toBe(17);
		});

		/**
		 * REGRESSION TEST for bug where evaluatorFilter was not passed from engine to runner
		 *
		 * Bug description: When user selected "Suggestions Only" in the UI, the frontend
		 * correctly sent evaluatorFilter: "suggestions" to the API, but the evaluation engine
		 * did not pass this option to runAllEvaluators() or runUnifiedEvaluation(), causing
		 * all evaluators to run instead of just the 4 suggestion evaluators.
		 *
		 * Fix: Added evaluatorFilter: options.evaluatorFilter to both function calls in engine.ts
		 * - src/shared/evaluation/engine.ts:496 (runUnifiedEvaluation call)
		 * - src/shared/evaluation/engine.ts:834 (runAllEvaluators call)
		 */
		test("REGRESSION: evaluatorFilter should reduce evaluator count from 17 to 4 when set to 'suggestions'", () => {
			// This test documents the regression that was fixed
			const allEvaluators = filterEvaluatorsByType(EVALUATOR_FILES, "all");
			const suggestionEvaluators = filterEvaluatorsByType(
				EVALUATOR_FILES,
				"suggestions",
			);

			// Before fix: would run all evaluators regardless of filter
			// After fix: correctly runs only 4 suggestion evaluators
			expect(allEvaluators.length).toBe(17);
			expect(suggestionEvaluators.length).toBe(4);

			// Verify the reduction
			expect(suggestionEvaluators.length).toBeLessThan(allEvaluators.length);
			expect(allEvaluators.length - suggestionEvaluators.length).toBe(13);
		});

		test("REGRESSION: evaluatorFilter should reduce evaluator count from 17 to 13 when set to 'errors'", () => {
			// This test documents the regression that was fixed
			const allEvaluators = filterEvaluatorsByType(EVALUATOR_FILES, "all");
			const errorEvaluators = filterEvaluatorsByType(EVALUATOR_FILES, "errors");

			// Before fix: would run all evaluators regardless of filter
			// After fix: correctly runs only 13 error evaluators
			expect(allEvaluators.length).toBe(17);
			expect(errorEvaluators.length).toBe(13);

			// Verify the reduction
			expect(errorEvaluators.length).toBeLessThan(allEvaluators.length);
			expect(allEvaluators.length - errorEvaluators.length).toBe(4);
		});
	});

	describe("countBySeverity", () => {
		test("should count error issues by severity correctly", () => {
			const errorIssues: ErrorIssue[] = [
				{
					issueType: "error",
					evaluatorName: "content-quality",
					title: "Critical error",
					severity: 10,
					description: "Test",
					category: "Content Quality",
					location: { file: "AGENTS.md", start: 1, end: 5 },
				},
				{
					issueType: "error",
					evaluatorName: "content-quality",
					title: "High error",
					severity: 8,
					description: "Test",
					category: "Content Quality",
					location: { file: "AGENTS.md", start: 1, end: 5 },
				},
				{
					issueType: "error",
					evaluatorName: "content-quality",
					title: "Medium error",
					severity: 6,
					description: "Test",
					category: "Content Quality",
					location: { file: "AGENTS.md", start: 1, end: 5 },
				},
			];

			const counts = countBySeverity(errorIssues);

			expect(counts.high).toBe(2); // severity >= 8 (includes 10 and 8)
			expect(counts.medium).toBe(1); // severity >= 6 && < 8 (includes 6)
			expect(counts.low).toBe(0); // severity < 6
		});

		test("should count suggestion issues by impact level correctly", () => {
			const suggestionIssues: SuggestionIssue[] = [
				{
					issueType: "suggestion",
					evaluatorName: "context-gaps",
					title: "High impact suggestion",
					impactLevel: "High",
					description: "Test",
					category: "Context Gaps",
					location: { file: "AGENTS.md", start: 1, end: 5 },
				},
				{
					issueType: "suggestion",
					evaluatorName: "context-gaps",
					title: "Medium impact suggestion",
					impactLevel: "Medium",
					description: "Test",
					category: "Context Gaps",
					location: { file: "AGENTS.md", start: 1, end: 5 },
				},
				{
					issueType: "suggestion",
					evaluatorName: "context-gaps",
					title: "Low impact suggestion",
					impactLevel: "Low",
					description: "Test",
					category: "Context Gaps",
					location: { file: "AGENTS.md", start: 1, end: 5 },
				},
			];

			const counts = countBySeverity(suggestionIssues);

			// High impact → severity 9 (high category: >= 8)
			// Medium impact → severity 6 (medium category: >= 6 && < 8)
			// Low impact → severity 3 (low category: < 6)
			expect(counts.high).toBe(1);
			expect(counts.medium).toBe(1);
			expect(counts.low).toBe(1);
		});

		test("should count mixed error and suggestion issues correctly", () => {
			const mixedIssues = [
				// 2 high errors (severity 9-10)
				{
					issueType: "error" as const,
					evaluatorName: "content-quality",
					title: "High error 1",
					severity: 10,
					description: "Test",
					category: "Content Quality",
					location: { file: "AGENTS.md", start: 1, end: 5 },
				},
				{
					issueType: "error" as const,
					evaluatorName: "content-quality",
					title: "High error 2",
					severity: 9,
					description: "Test",
					category: "Content Quality",
					location: { file: "AGENTS.md", start: 1, end: 5 },
				},
				// 1 high suggestion (High impact → severity 9)
				{
					issueType: "suggestion" as const,
					evaluatorName: "context-gaps",
					title: "High impact suggestion",
					impactLevel: "High" as const,
					description: "Test",
					category: "Context Gaps",
					location: { file: "AGENTS.md", start: 1, end: 5 },
				},
				// 1 high error (severity 8)
				{
					issueType: "error" as const,
					evaluatorName: "content-quality",
					title: "High error 3",
					severity: 8,
					description: "Test",
					category: "Content Quality",
					location: { file: "AGENTS.md", start: 1, end: 5 },
				},
				// 1 medium suggestion (Medium impact → severity 6)
				{
					issueType: "suggestion" as const,
					evaluatorName: "context-gaps",
					title: "Medium impact suggestion",
					impactLevel: "Medium" as const,
					description: "Test",
					category: "Context Gaps",
					location: { file: "AGENTS.md", start: 1, end: 5 },
				},
				// 1 medium error (severity 6)
				{
					issueType: "error" as const,
					evaluatorName: "content-quality",
					title: "Medium error",
					severity: 6,
					description: "Test",
					category: "Content Quality",
					location: { file: "AGENTS.md", start: 1, end: 5 },
				},
				// 1 low suggestion (Low impact → severity 3)
				{
					issueType: "suggestion" as const,
					evaluatorName: "context-gaps",
					title: "Low impact suggestion",
					impactLevel: "Low" as const,
					description: "Test",
					category: "Context Gaps",
					location: { file: "AGENTS.md", start: 1, end: 5 },
				},
			];

			const counts = countBySeverity(mixedIssues);

			// High (>= 7): 2 errors (10, 9) + 1 High suggestion (9) + 1 error (8) = 4
			expect(counts.high).toBe(4);
			// Medium (>= 5 && < 7): 1 error (6) + 1 Medium suggestion (6) = 2
			expect(counts.medium).toBe(2);
			// Low (< 5): 1 Low suggestion (3) = 1
			expect(counts.low).toBe(1);
		});

		test("should return zero counts for empty array", () => {
			const counts = countBySeverity([]);

			expect(counts.high).toBe(0);
			expect(counts.medium).toBe(0);
			expect(counts.low).toBe(0);
		});

		/**
		 * REGRESSION TEST for bug where suggestion issues were not counted
		 *
		 * Bug description: The countBySeverity function was directly accessing i.severity,
		 * which doesn't exist on SuggestionIssue objects (they use impactLevel instead).
		 * This caused all suggestion issues to be ignored in severity counts, leading to
		 * inconsistent counts between:
		 * - Recent Evaluations list (using database counts from countBySeverity)
		 * - Detail view tabs (correctly filtering by issueType)
		 *
		 * Fix: Updated countBySeverity to use getIssueSeverity(i) which correctly
		 * handles both ErrorIssue (severity field) and SuggestionIssue (impactLevel field)
		 */
		test("REGRESSION: suggestion issues should be included in severity counts", () => {
			// Before fix: suggestion issues were ignored (undefined >= 9 is false)
			// After fix: suggestion issues are correctly counted based on impactLevel

			const onlySuggestions: SuggestionIssue[] = [
				{
					issueType: "suggestion",
					evaluatorName: "context-gaps",
					title: "High impact",
					impactLevel: "High",
					description: "Test",
					category: "Context Gaps",
					location: { file: "AGENTS.md", start: 1, end: 5 },
				},
			];

			const counts = countBySeverity(onlySuggestions);

			// Before fix: counts.high would be 0
			// After fix: counts.high is 1 (High impact maps to severity 9, which is high)
			expect(counts.high).toBe(1);
			expect(counts.high).toBeGreaterThan(0);
		});
	});

	describe("noFileMode", () => {
		test("only evaluators with executeIfNoFile: true should run in no-file mode", () => {
			// These are the 3 evaluators that should run when no AGENTS.md exists
			const noFileEvaluators = Object.entries(EVALUATOR_CONFIGS)
				.filter(([_, config]) => config.executeIfNoFile)
				.map(([name]) => name);

			expect(noFileEvaluators).toEqual([
				"context-gaps.md",
				"test-patterns-coverage.md",
				"database-patterns-coverage.md",
			]);
			expect(noFileEvaluators.length).toBe(3);
		});

		test("shouldExecuteIfNoFile returns true only for suggestion scanners", () => {
			// Should return true for the 3 codebase-scanning suggestion evaluators
			expect(shouldExecuteIfNoFile("context-gaps.md")).toBe(true);
			expect(shouldExecuteIfNoFile("test-patterns-coverage.md")).toBe(true);
			expect(shouldExecuteIfNoFile("database-patterns-coverage.md")).toBe(true);

			// Should return false for error evaluators
			expect(shouldExecuteIfNoFile("content-quality.md")).toBe(false);
			expect(shouldExecuteIfNoFile("command-completeness.md")).toBe(false);
			expect(shouldExecuteIfNoFile("outdated-documentation.md")).toBe(false);

			// Should return false for subdirectory-coverage (needs existing file)
			expect(shouldExecuteIfNoFile("subdirectory-coverage.md")).toBe(false);
		});

		test("shouldExecuteIfNoFile handles numeric-prefixed filenames", () => {
			// Evaluator files may have numeric prefixes stripped
			expect(shouldExecuteIfNoFile("12-context-gaps.md")).toBe(true);
			expect(shouldExecuteIfNoFile("14-test-patterns-coverage.md")).toBe(true);
			expect(shouldExecuteIfNoFile("15-database-patterns-coverage.md")).toBe(
				true,
			);
			expect(shouldExecuteIfNoFile("01-content-quality.md")).toBe(false);
		});

		test("all noFileMode evaluators are suggestion type", () => {
			const noFileEvaluators = Object.entries(EVALUATOR_CONFIGS).filter(
				([_, config]) => config.executeIfNoFile,
			);

			for (const [_name, config] of noFileEvaluators) {
				expect(config.issueType).toBe("suggestion");
			}
		});

		test("evaluatorFilter 'errors' should filter out all noFileMode evaluators", () => {
			// When filter is 'errors', all 3 noFileMode evaluators (which are suggestions)
			// should be filtered out, resulting in zero evaluators running
			const noFileEvaluatorNames = Object.entries(EVALUATOR_CONFIGS)
				.filter(([_, config]) => config.executeIfNoFile)
				.map(([name]) => name);

			const errorFiltered = filterEvaluatorsByType(
				noFileEvaluatorNames,
				"errors",
			);
			expect(errorFiltered.length).toBe(0);
		});
	});
});
