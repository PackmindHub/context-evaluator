import { describe, expect, test } from "bun:test";
import type { Issue } from "@shared/types/evaluation";
import {
	addDeduplicationIds,
	createDeduplicationIdSet,
	executeDeduplicationPipeline,
} from "./deduplication-pipeline";

// Helper to create test issues
function createIssue(overrides: Partial<Issue> = {}): Issue {
	return {
		category: "Test Category",
		problem: "Test problem",
		location: { file: "test.ts", start: 1, end: 5 },
		issueType: "error",
		severity: 8,
		...overrides,
	} as Issue;
}

describe("Deduplication Pipeline", () => {
	describe("executeDeduplicationPipeline", () => {
		test("should return issues unchanged when disabled", async () => {
			const issues = [
				createIssue({ problem: "Issue 1" }),
				createIssue({ problem: "Issue 2" }),
			];

			const result = await executeDeduplicationPipeline(issues, {
				enabled: false,
			});

			expect(result.deduplicated).toHaveLength(2);
			expect(result.phase1).toBeNull();
			expect(result.phase2).toBeNull();
			expect(result.totalRemoved).toBe(0);
			expect(result.totalClusters).toBe(0);
		});

		test("should handle empty issues array", async () => {
			const result = await executeDeduplicationPipeline([]);

			expect(result.deduplicated).toHaveLength(0);
			expect(result.phase1).not.toBeNull();
			expect(result.phase1?.originalCount).toBe(0);
			expect(result.phase1?.finalCount).toBe(0);
		});

		test("should handle single issue", async () => {
			const issues = [createIssue()];

			const result = await executeDeduplicationPipeline(issues);

			expect(result.deduplicated).toHaveLength(1);
			expect(result.totalRemoved).toBe(0);
		});

		test("should run Phase 1 rule-based deduplication", async () => {
			// Create duplicate issues (same location, similar text)
			const issues = [
				createIssue({
					problem: "Missing documentation for npm scripts",
					location: { file: "AGENTS.md", start: 10, end: 15 },
				}),
				createIssue({
					problem: "Missing npm script documentation",
					location: { file: "AGENTS.md", start: 12, end: 17 },
				}),
			];

			const result = await executeDeduplicationPipeline(issues, {
				aiEnabled: false, // Disable AI for this test
			});

			expect(result.phase1).not.toBeNull();
			expect(result.phase1?.originalCount).toBe(2);
			// Phase 1 should identify these as duplicates due to similarity and location
		});

		test("should skip Phase 2 when aiEnabled is false", async () => {
			const issues = [createIssue()];

			const result = await executeDeduplicationPipeline(issues, {
				aiEnabled: false,
			});

			expect(result.phase2).toBeNull();
		});

		test("should skip Phase 2 when no provider is provided", async () => {
			const issues = [createIssue()];

			const result = await executeDeduplicationPipeline(issues, {
				aiEnabled: true,
				provider: undefined,
			});

			expect(result.phase2).toBeNull();
		});

		test("should use custom locationTolerance", async () => {
			const issues = [
				createIssue({
					problem: "Issue A",
					location: { file: "test.ts", start: 10, end: 15 },
				}),
				createIssue({
					problem: "Issue B - related",
					location: { file: "test.ts", start: 30, end: 35 },
				}),
			];

			// With tight tolerance, issues are far apart
			const tightResult = await executeDeduplicationPipeline(issues, {
				locationTolerance: 3,
				aiEnabled: false,
			});

			// With loose tolerance, issues might be grouped
			const looseResult = await executeDeduplicationPipeline(issues, {
				locationTolerance: 20,
				aiEnabled: false,
			});

			expect(tightResult.phase1).not.toBeNull();
			expect(looseResult.phase1).not.toBeNull();
		});

		test("should use custom similarityThreshold", async () => {
			const issues = [
				createIssue({ problem: "Missing docs" }),
				createIssue({ problem: "Documentation is missing" }),
			];

			// With high threshold, texts might not be similar enough
			const highThresholdResult = await executeDeduplicationPipeline(issues, {
				similarityThreshold: 0.95,
				aiEnabled: false,
			});

			// With low threshold, texts are more likely to be grouped
			const lowThresholdResult = await executeDeduplicationPipeline(issues, {
				similarityThreshold: 0.3,
				aiEnabled: false,
			});

			expect(highThresholdResult.phase1).not.toBeNull();
			expect(lowThresholdResult.phase1).not.toBeNull();
		});

		test("should calculate totalRemoved correctly", async () => {
			// Create issues that will be deduplicated
			const issues = [
				createIssue({
					problem: "Missing npm script documentation",
					location: { file: "AGENTS.md", start: 10, end: 15 },
				}),
				createIssue({
					problem: "npm script not documented",
					location: { file: "AGENTS.md", start: 12, end: 17 },
				}),
				createIssue({
					problem: "Unique issue",
					location: { file: "different.md", start: 1, end: 5 },
				}),
			];

			const result = await executeDeduplicationPipeline(issues, {
				aiEnabled: false,
			});

			const expectedRemoved = issues.length - result.deduplicated.length;
			expect(result.totalRemoved).toBe(expectedRemoved);
		});

		test("should calculate totalClusters correctly", async () => {
			const issues = [createIssue(), createIssue()];

			const result = await executeDeduplicationPipeline(issues, {
				aiEnabled: false,
			});

			// totalClusters should be sum of all phase clusters
			const expectedClusters =
				(result.phase1?.clusters ?? 0) + (result.phase2?.groups ?? 0);
			expect(result.totalClusters).toBe(expectedClusters);
		});

		test("should use default options when not specified", async () => {
			const issues = [createIssue()];

			// Should not throw with minimal options
			const result = await executeDeduplicationPipeline(issues);

			expect(result.deduplicated).toBeDefined();
			expect(result.phase1).not.toBeNull(); // Phase 1 always runs when enabled
		});
	});

	describe("addDeduplicationIds", () => {
		test("should add _deduplicationId to all issues", () => {
			const issues = [createIssue(), createIssue(), createIssue()];

			addDeduplicationIds(issues);

			expect(issues[0]!._deduplicationId).toBe("issue_0");
			expect(issues[1]!._deduplicationId).toBe("issue_1");
			expect(issues[2]!._deduplicationId).toBe("issue_2");
		});

		test("should handle empty array", () => {
			const issues: Issue[] = [];

			addDeduplicationIds(issues);

			expect(issues).toHaveLength(0);
		});

		test("should overwrite existing _deduplicationId", () => {
			const issues = [createIssue({ _deduplicationId: "old_id" })];

			addDeduplicationIds(issues);

			expect(issues[0]!._deduplicationId).toBe("issue_0");
		});

		test("should mutate original array", () => {
			const issues = [createIssue()];
			const original = issues[0]!;

			addDeduplicationIds(issues);

			expect(original._deduplicationId).toBe("issue_0");
		});
	});

	describe("createDeduplicationIdSet", () => {
		test("should create Set of deduplication IDs", () => {
			const issues = [
				createIssue({ _deduplicationId: "issue_0" }),
				createIssue({ _deduplicationId: "issue_1" }),
				createIssue({ _deduplicationId: "issue_2" }),
			];

			const idSet = createDeduplicationIdSet(issues);

			expect(idSet.size).toBe(3);
			expect(idSet.has("issue_0")).toBe(true);
			expect(idSet.has("issue_1")).toBe(true);
			expect(idSet.has("issue_2")).toBe(true);
		});

		test("should handle empty array", () => {
			const idSet = createDeduplicationIdSet([]);

			expect(idSet.size).toBe(0);
		});

		test("should filter out undefined IDs", () => {
			const issues = [
				createIssue({ _deduplicationId: "issue_0" }),
				createIssue(), // No _deduplicationId
				createIssue({ _deduplicationId: "issue_2" }),
			];

			const idSet = createDeduplicationIdSet(issues);

			expect(idSet.size).toBe(2);
			expect(idSet.has("issue_0")).toBe(true);
			expect(idSet.has("issue_2")).toBe(true);
		});

		test("should handle duplicate IDs", () => {
			const issues = [
				createIssue({ _deduplicationId: "issue_0" }),
				createIssue({ _deduplicationId: "issue_0" }), // Duplicate
				createIssue({ _deduplicationId: "issue_1" }),
			];

			const idSet = createDeduplicationIdSet(issues);

			expect(idSet.size).toBe(2); // Set removes duplicates
		});
	});

	describe("Integration scenarios", () => {
		test("should support typical engine workflow", async () => {
			// Simulate the workflow in engine.ts
			const allIssues = [
				createIssue({
					problem: "Missing docs",
					location: { file: "AGENTS.md", start: 10, end: 15 },
					_deduplicationId: undefined,
				}),
				createIssue({
					problem: "Documentation missing",
					location: { file: "AGENTS.md", start: 12, end: 17 },
					_deduplicationId: undefined,
				}),
				createIssue({
					problem: "Unique issue",
					location: { file: "other.md", start: 1, end: 5 },
					_deduplicationId: undefined,
				}),
			];

			// Step 1: Add tracking IDs
			addDeduplicationIds(allIssues);
			expect(allIssues[0]!._deduplicationId).toBe("issue_0");

			// Step 2: Run deduplication
			const result = await executeDeduplicationPipeline(allIssues, {
				aiEnabled: false,
			});

			// Step 3: Filter original issues using the ID set
			const deduplicatedIds = createDeduplicationIdSet(result.deduplicated);
			const filtered = allIssues.filter((issue) =>
				deduplicatedIds.has(issue._deduplicationId!),
			);

			expect(filtered.length).toBe(result.deduplicated.length);
		});

		test("should preserve issue properties through pipeline", async () => {
			const originalIssue = createIssue({
				category: "Security",
				problem: "Exposed credentials",
				severity: 10,
				issueType: "error",
				location: { file: "AGENTS.md", start: 1, end: 5 },
			});

			addDeduplicationIds([originalIssue]);

			const result = await executeDeduplicationPipeline([originalIssue], {
				aiEnabled: false,
			});

			expect(result.deduplicated).toHaveLength(1);
			const processedIssue = result.deduplicated[0]!;

			// All original properties should be preserved
			expect(processedIssue.category).toBe("Security");
			expect(processedIssue.problem).toBe("Exposed credentials");
			expect(processedIssue.severity).toBe(10);
			expect(processedIssue.issueType).toBe("error");
		});

		test("should generate entity candidates for database contradictions", async () => {
			const issues = [
				createIssue({
					category: "Contradictory Instructions",
					problem:
						"Database type contradiction: AGENTS.md references MySQL while CLAUDE.md specifies PostgreSQL",
					severity: 8,
					location: { file: "AGENTS.md", start: 30, end: 35 },
				}),
				createIssue({
					category: "Outdated Documentation",
					problem:
						"Critical database configuration mismatch - MySQL at 10.0.0.160:3306 vs PostgreSQL at 10.0.0.99:6543",
					severity: 10,
					location: { file: "AGENTS.md", start: 60, end: 65 },
				}),
				createIssue({
					category: "Command Completeness",
					problem: "Contradictory database host information between files",
					severity: 8,
					location: { file: "AGENTS.md", start: 32, end: 32 },
				}),
				createIssue({
					category: "Code Style Documentation",
					problem: "Conflicting database host information between files",
					severity: 8,
					location: { file: "AGENTS.md", start: 32, end: 32 },
				}),
			];

			addDeduplicationIds(issues);

			const result = await executeDeduplicationPipeline(issues, {
				enabled: true,
				aiEnabled: false, // Phase 2 disabled to test Phase 1 entity extraction
				verbose: false,
			});

			// Phase 1 should generate entity candidates
			expect(result.phase1).toBeDefined();
			expect(result.phase1!.finalCount).toBe(3); // Location duplicates should be removed

			// Verify entity candidates were generated (this would be passed to Phase 2 if enabled)
			// We can't directly access entityCandidates here, but we can verify Phase 1 worked
			expect(result.phase1!.removed).toBeGreaterThanOrEqual(1);
		});

		test("REGRESSION: unified mode cross-file issues copies must have _deduplicationId for dedup filtering", async () => {
			/**
			 * Bug: In unified mode, the runner creates copies of evaluator cross-file issues
			 * BEFORE the engine assigns _deduplicationId. When allCrossFileIssues uses these
			 * stale copies, they lack IDs. After dedup, createDeduplicationIdSet skips items
			 * without IDs, causing the dedup filter to silently drop cross-file issues.
			 * Fix: Rebuild allCrossFileIssues from originals AFTER ID assignment.
			 */
			// Simulate evaluator results with cross-file issues (originals)
			const originalCrossFileIssues = [
				createIssue({
					problem: "Conflicting setup commands across files",
					location: [
						{ file: "AGENTS.md", start: 10, end: 15 },
						{ file: "CLAUDE.md", start: 20, end: 25 },
					],
				}),
			];

			// Simulate per-file issues (originals, shared via reference)
			const perFileIssues = [
				createIssue({
					problem: "Missing docs",
					location: { file: "AGENTS.md", start: 1, end: 5 },
				}),
				createIssue({
					problem: "Vague command",
					location: { file: "AGENTS.md", start: 30, end: 35 },
				}),
			];

			// Simulate consistency issues
			const consistencyIssues = [
				createIssue({
					problem: "Conflicting AGENTS.md and CLAUDE.md",
					location: [
						{ file: "AGENTS.md", start: 1, end: 5 },
						{ file: "CLAUDE.md", start: 1, end: 5 },
					],
				}),
			];

			// Step 1: Assign IDs to ALL originals (simulating engine lines 1281-1294)
			let idx = 0;
			for (const issue of perFileIssues)
				issue._deduplicationId = `issue_${idx++}`;
			for (const issue of originalCrossFileIssues)
				issue._deduplicationId = `issue_${idx++}`;
			for (const issue of consistencyIssues)
				issue._deduplicationId = `issue_${idx++}`;

			// Step 2: Build allCrossFileIssues from originals AFTER ID assignment (the FIX)
			// This ensures copies inherit _deduplicationId via spread
			const allCrossFileIssues = [
				...originalCrossFileIssues.map((issue) => ({
					...issue,
					evaluatorName: "test-evaluator",
				})),
				...consistencyIssues,
			];

			const allPerFileIssues = perFileIssues.map((issue) => ({
				...issue,
				evaluatorName: "test-evaluator",
			}));
			const allIssues = [...allPerFileIssues, ...allCrossFileIssues];

			// Step 3: Run dedup pipeline
			const result = await executeDeduplicationPipeline(allIssues, {
				aiEnabled: false,
			});

			// Step 4: Create ID set and filter
			const deduplicatedIds = createDeduplicationIdSet(result.deduplicated);

			// Step 5: Filter cross-file issues using dedup IDs (simulating engine line 1362-1364)
			const filteredCrossFile = allCrossFileIssues.filter((issue) =>
				deduplicatedIds.has(issue._deduplicationId!),
			);

			// ALL cross-file issues should survive (none were duplicates)
			expect(filteredCrossFile.length).toBe(allCrossFileIssues.length);
			expect(deduplicatedIds.size).toBe(result.deduplicated.length);
		});

		test("REGRESSION: copies made before ID assignment lose _deduplicationId", () => {
			/**
			 * Documents the root cause: if copies are made before IDs are assigned to originals,
			 * the copies don't have _deduplicationId and filtering silently drops them.
			 */
			const original = createIssue({ problem: "Cross-file conflict" });

			// Copy made BEFORE ID assignment (the bug scenario)
			const copyBeforeId = { ...original };

			// Assign ID to original
			original._deduplicationId = "issue_0";

			// Copy made AFTER ID assignment (the fix scenario)
			const copyAfterId = { ...original };

			// Verify: copy before has no ID, copy after has ID
			expect(copyBeforeId._deduplicationId).toBeUndefined();
			expect(copyAfterId._deduplicationId).toBe("issue_0");

			// Verify: createDeduplicationIdSet skips undefined IDs
			const idSet = createDeduplicationIdSet([
				copyBeforeId as Issue,
				copyAfterId,
			]);
			expect(idSet.size).toBe(1); // Only copyAfterId's ID is captured
			expect(idSet.has("issue_0")).toBe(true);
		});

		test("should pass entity candidates through to Phase 2", async () => {
			const issues = [
				createIssue({
					category: "Outdated Documentation",
					problem:
						"Documentation says MySQL with Mongoose but codebase uses TypeORM with PostgreSQL",
					severity: 9,
					location: { file: "AGENTS.md", start: 45, end: 48 },
				}),
				createIssue({
					category: "Command Completeness",
					problem:
						"Critical database/ORM mismatch - documentation claims MongoDB but uses TypeORM",
					severity: 8,
					location: { file: "AGENTS.md", start: 80, end: 82 },
				}),
			];

			addDeduplicationIds(issues);

			// Mock provider for Phase 2
			class MockAIProvider {
				async invokeWithRetry(prompt: string) {
					// Verify the prompt includes entityCandidate and sharedEntities
					const hasEntityCandidate = prompt.includes('"entityCandidate"');
					const hasSharedEntities = prompt.includes('"sharedEntities"');

					if (!hasEntityCandidate || !hasSharedEntities) {
						throw new Error(
							"Entity candidates not properly passed to Phase 2 prompt",
						);
					}

					// Return duplicate grouping
					return {
						result:
							'{"groups": [{"representativeIndex": 0, "duplicateIndices": [1], "reason": "Same database/ORM technology mismatch"}]}',
						cost_usd: 0.01,
					};
				}

				get displayName() {
					return "MockAI";
				}
			}

			const result = await executeDeduplicationPipeline(issues, {
				enabled: true,
				aiEnabled: true,
				verbose: false,
				provider: new MockAIProvider() as never,
			});

			// Phase 2 should have received entity candidates and deduplicated
			expect(result.phase2).toBeDefined();
			expect(result.phase2!.finalCount).toBeLessThanOrEqual(1);
		});
	});
});
