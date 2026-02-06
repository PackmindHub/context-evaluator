import { describe, expect, test } from "bun:test";
import type { IAIProvider, IProviderResponse } from "@shared/providers";
import type { Issue } from "@shared/types/evaluation";
import {
	deduplicateIssuesSemantic,
	formatIssuesForDeduplication,
} from "./semantic-deduplicator";

/**
 * Mock AI provider for testing
 */
class MockAIProvider implements IAIProvider {
	name = "claude" as const;
	displayName = "Mock Provider";
	private response: string;

	constructor(response: string) {
		this.response = response;
	}

	async isAvailable(): Promise<boolean> {
		return true;
	}

	async invoke(): Promise<IProviderResponse> {
		return {
			result: this.response,
			cost_usd: 0.001,
		};
	}

	async invokeWithRetry(): Promise<IProviderResponse> {
		return this.invoke();
	}
}

describe("Semantic Deduplicator", () => {
	describe("deduplicateIssuesSemantic", () => {
		test("should return empty result for empty input", async () => {
			const result = await deduplicateIssuesSemantic([]);
			expect(result.originalCount).toBe(0);
			expect(result.finalCount).toBe(0);
			expect(result.kept).toHaveLength(0);
			expect(result.removed).toHaveLength(0);
			expect(result.groups).toHaveLength(0);
		});

		test("should keep all issues when AI returns no duplicates", async () => {
			const issues: Issue[] = [
				{
					issueType: "error",
					category: "Command Clarity",
					problem: "Build command missing",
					severity: 8,
					location: { file: "AGENTS.md", start: 10, end: 15 },
				},
				{
					issueType: "error",
					category: "Command Clarity",
					problem: "Test command missing",
					severity: 7,
					location: { file: "AGENTS.md", start: 20, end: 25 },
				},
			];

			// Mock provider returns empty groups (no duplicates found)
			const mockProvider = new MockAIProvider('{"groups": []}');

			const result = await deduplicateIssuesSemantic(issues, {
				provider: mockProvider,
			});

			expect(result.originalCount).toBe(2);
			expect(result.finalCount).toBe(2);
			expect(result.kept).toHaveLength(2);
			expect(result.removed).toHaveLength(0);
			expect(result.groups).toHaveLength(0);
		});

		test("should remove duplicates when AI detects them", async () => {
			const issues: Issue[] = [
				{
					issueType: "error",
					category: "Command Clarity",
					problem: "Build command is not documented",
					severity: 8,
					location: { file: "AGENTS.md", start: 10, end: 15 },
				},
				{
					issueType: "error",
					category: "Content Quality",
					problem: "Missing compilation instructions",
					severity: 7,
					location: { file: "AGENTS.md", start: 12, end: 17 },
				},
				{
					issueType: "error",
					category: "Setup Clarity",
					problem: "No build command specified",
					severity: 9,
					location: { file: "AGENTS.md", start: 11, end: 16 },
				},
			];

			// Mock provider detects issues 0 and 2 are duplicates (keep 0, remove 1 and 2)
			const mockProvider = new MockAIProvider(
				'{"groups": [{"representativeIndex": 0, "duplicateIndices": [1, 2], "reason": "All report missing build command"}]}',
			);

			const result = await deduplicateIssuesSemantic(issues, {
				provider: mockProvider,
			});

			expect(result.originalCount).toBe(3);
			expect(result.finalCount).toBe(1);
			expect(result.kept).toHaveLength(1);
			expect(result.removed).toHaveLength(2);
			expect(result.groups).toHaveLength(1);
			expect(result.groups[0]!.representativeIndex).toBe(0);
			expect(result.groups[0]!.duplicateIndices).toEqual([1, 2]);
		});

		test("should handle AI provider errors gracefully", async () => {
			const issues: Issue[] = [
				{
					issueType: "error",
					category: "Command Clarity",
					problem: "Build command missing",
					severity: 8,
					location: { file: "AGENTS.md", start: 10, end: 15 },
				},
				{
					issueType: "error",
					category: "Content Quality",
					problem: "No compilation instructions",
					severity: 7,
					location: { file: "AGENTS.md", start: 10, end: 15 },
				},
			];

			// Mock provider that throws error
			const errorProvider: IAIProvider = {
				name: "claude",
				displayName: "Error Provider",
				isAvailable: async () => true,
				invoke: async () => {
					throw new Error("AI provider failed");
				},
				invokeWithRetry: async () => {
					throw new Error("AI provider failed");
				},
			};

			const result = await deduplicateIssuesSemantic(issues, {
				provider: errorProvider,
			});

			// Should return all issues unchanged on error
			expect(result.originalCount).toBe(2);
			expect(result.finalCount).toBe(2);
			expect(result.kept).toHaveLength(2);
			expect(result.removed).toHaveLength(0);
		});

		test("should handle malformed AI response", async () => {
			const issues: Issue[] = [
				{
					issueType: "error",
					category: "Command Clarity",
					problem: "Build command missing",
					severity: 8,
					location: { file: "AGENTS.md", start: 10, end: 15 },
				},
			];

			// Mock provider returns invalid JSON
			const mockProvider = new MockAIProvider("not valid json");

			const result = await deduplicateIssuesSemantic(issues, {
				provider: mockProvider,
			});

			// Should handle gracefully and keep all issues
			expect(result.originalCount).toBe(1);
			expect(result.finalCount).toBe(1);
			expect(result.kept).toHaveLength(1);
		});

		test("should handle multiple duplicate groups", async () => {
			const issues: Issue[] = [
				{
					issueType: "error",
					category: "Command Clarity",
					problem: "Build command missing",
					severity: 8,
					location: { file: "AGENTS.md", start: 10, end: 15 },
				},
				{
					issueType: "error",
					category: "Content Quality",
					problem: "No build instructions",
					severity: 7,
					location: { file: "AGENTS.md", start: 12, end: 17 },
				},
				{
					issueType: "error",
					category: "Command Clarity",
					problem: "Test command unclear",
					severity: 6,
					location: { file: "AGENTS.md", start: 20, end: 25 },
				},
				{
					issueType: "error",
					category: "Testing",
					problem: "Testing instructions vague",
					severity: 7,
					location: { file: "AGENTS.md", start: 22, end: 27 },
				},
			];

			// Mock provider detects two groups of duplicates
			const mockProvider = new MockAIProvider(
				'{"groups": [' +
					'{"representativeIndex": 0, "duplicateIndices": [1], "reason": "Build command duplicates"},' +
					'{"representativeIndex": 2, "duplicateIndices": [3], "reason": "Test command duplicates"}' +
					"]}",
			);

			const result = await deduplicateIssuesSemantic(issues, {
				provider: mockProvider,
			});

			expect(result.originalCount).toBe(4);
			expect(result.finalCount).toBe(2);
			expect(result.kept).toHaveLength(2);
			expect(result.removed).toHaveLength(2);
			expect(result.groups).toHaveLength(2);
		});

		test("should include cost and duration metadata", async () => {
			const issues: Issue[] = [
				{
					issueType: "error",
					category: "Command Clarity",
					problem: "Build command missing",
					severity: 8,
					location: { file: "AGENTS.md", start: 10, end: 15 },
				},
			];

			const mockProvider = new MockAIProvider('{"groups": []}');

			const result = await deduplicateIssuesSemantic(issues, {
				provider: mockProvider,
			});

			// Should have duration_ms and cost_usd
			expect(typeof result.duration_ms).toBe("number");
			expect(result.duration_ms).toBeGreaterThanOrEqual(0);
			expect(typeof result.cost_usd).toBe("number");
			expect(result.cost_usd).toBeGreaterThanOrEqual(0);
		});

		test("should handle issues with minimal fields", async () => {
			const issues: Issue[] = [
				{
					issueType: "error",
					category: "Test",
					severity: 7,
					location: { file: "test.md", start: 1, end: 2 },
					// No problem, description, or title
				},
				{
					issueType: "suggestion",
					category: "Test",
					impactLevel: "High",
					location: { file: "test.md", start: 3, end: 4 },
					description: "Some description",
				},
			];

			const mockProvider = new MockAIProvider('{"groups": []}');

			// Should not crash with minimal fields
			const result = await deduplicateIssuesSemantic(issues, {
				provider: mockProvider,
			});

			expect(result.originalCount).toBe(2);
			expect(result.finalCount).toBe(2);
		});

		test("should handle both error and suggestion issues", async () => {
			const issues: Issue[] = [
				{
					issueType: "error",
					category: "Command Clarity",
					problem: "Build command missing",
					severity: 8,
					location: { file: "AGENTS.md", start: 10, end: 15 },
				},
				{
					issueType: "suggestion",
					category: "Testing Patterns",
					problem: "Consider adding test documentation",
					impactLevel: "High",
					location: { file: "AGENTS.md", start: 20, end: 25 },
				},
			];

			const mockProvider = new MockAIProvider('{"groups": []}');

			const result = await deduplicateIssuesSemantic(issues, {
				provider: mockProvider,
			});

			expect(result.originalCount).toBe(2);
			expect(result.finalCount).toBe(2);
		});

		test("should handle multi-file issues", async () => {
			const issues: Issue[] = [
				{
					issueType: "error",
					category: "Consistency",
					problem: "Inconsistent naming across files",
					severity: 7,
					location: [
						{ file: "file1.md", start: 10, end: 15 },
						{ file: "file2.md", start: 20, end: 25 },
					],
					isMultiFile: true,
				},
				{
					issueType: "error",
					category: "Consistency",
					problem: "Naming conventions vary",
					severity: 8,
					location: [
						{ file: "file1.md", start: 12, end: 17 },
						{ file: "file2.md", start: 22, end: 27 },
					],
					isMultiFile: true,
				},
			];

			// Mock provider detects these as duplicates
			const mockProvider = new MockAIProvider(
				'{"groups": [{"representativeIndex": 0, "duplicateIndices": [1], "reason": "Same naming inconsistency issue"}]}',
			);

			const result = await deduplicateIssuesSemantic(issues, {
				provider: mockProvider,
			});

			expect(result.originalCount).toBe(2);
			expect(result.finalCount).toBe(1);
			expect(result.kept).toHaveLength(1);
			expect(result.removed).toHaveLength(1);
		});
	});

	describe("Location candidates in semantic deduplication", () => {
		test("should mark location candidates in formatted issues", () => {
			const issue1: Issue = {
				issueType: "error",
				category: "Code Style",
				problem: "Vague code style",
				location: { file: "test.md", start: 10, end: 15 },
				evaluatorName: "code-style",
				severity: 8,
			};
			const issue2: Issue = {
				issueType: "error",
				category: "Language",
				problem: "Different wording same problem",
				location: { file: "test.md", start: 12, end: 14 },
				evaluatorName: "06-language",
				severity: 7,
			};

			const locationCandidates = [[issue1, issue2]];
			const formatted = formatIssuesForDeduplication(
				[issue1, issue2],
				locationCandidates,
			);

			expect(formatted[0]!.locationCandidate).toBe(true);
			expect(formatted[1]!.locationCandidate).toBe(true);
		});

		test("should not mark issues that are not location candidates", () => {
			const issue1: Issue = {
				issueType: "error",
				category: "Code Style",
				problem: "Code style issue",
				location: { file: "test.md", start: 10, end: 15 },
				evaluatorName: "code-style",
				severity: 8,
			};
			const issue2: Issue = {
				issueType: "error",
				category: "Language",
				problem: "Language issue",
				location: { file: "other.md", start: 50, end: 55 },
				evaluatorName: "06-language",
				severity: 7,
			};

			// No location candidates provided
			const formatted = formatIssuesForDeduplication([issue1, issue2], []);

			expect(formatted[0]!.locationCandidate).toBe(false);
			expect(formatted[1]!.locationCandidate).toBe(false);
		});

		test("should mark only issues that are in location candidate clusters", () => {
			const candidate1: Issue = {
				issueType: "error",
				category: "Code Style",
				problem: "Vague code style",
				location: { file: "test.md", start: 10, end: 15 },
				evaluatorName: "code-style",
				severity: 8,
			};
			const candidate2: Issue = {
				issueType: "error",
				category: "Language",
				problem: "Different wording same problem",
				location: { file: "test.md", start: 12, end: 14 },
				evaluatorName: "06-language",
				severity: 7,
			};
			const nonCandidate: Issue = {
				issueType: "error",
				category: "Testing",
				problem: "Separate issue",
				location: { file: "other.md", start: 50, end: 55 },
				evaluatorName: "14-testing",
				severity: 6,
			};

			const locationCandidates = [[candidate1, candidate2]];
			const formatted = formatIssuesForDeduplication(
				[candidate1, candidate2, nonCandidate],
				locationCandidates,
			);

			expect(formatted[0]!.locationCandidate).toBe(true);
			expect(formatted[1]!.locationCandidate).toBe(true);
			expect(formatted[2]!.locationCandidate).toBe(false);
		});

		test("should handle empty location candidates array", () => {
			const issue: Issue = {
				issueType: "error",
				category: "Test",
				problem: "Test issue",
				location: { file: "test.md", start: 1, end: 5 },
				evaluatorName: "test-eval",
				severity: 5,
			};

			const formatted = formatIssuesForDeduplication([issue], []);

			expect(formatted[0]!.locationCandidate).toBe(false);
		});
	});

	describe("Entity candidates in semantic deduplication", () => {
		test("should mark entity candidates with shared database names", () => {
			const issue1: Issue = {
				issueType: "error",
				category: "Outdated Documentation",
				problem:
					"Documentation says MySQL but codebase uses PostgreSQL at 10.0.0.99",
				location: { file: "AGENTS.md", start: 45, end: 48 },
				evaluatorName: "19-outdated",
				severity: 10,
			};
			const issue2: Issue = {
				issueType: "error",
				category: "Command Completeness",
				problem: "Database mismatch - MySQL vs PostgreSQL configuration",
				location: { file: "AGENTS.md", start: 80, end: 82 },
				evaluatorName: "03-command",
				severity: 8,
			};

			const entityCandidates = [[issue1, issue2]];
			const formatted = formatIssuesForDeduplication(
				[issue1, issue2],
				[],
				entityCandidates,
			);

			expect(formatted[0]!.entityCandidate).toBe(true);
			expect(formatted[1]!.entityCandidate).toBe(true);
			expect(formatted[0]!.sharedEntities).toBeDefined();
			expect(formatted[0]!.sharedEntities).toContain("mysql");
			expect(formatted[0]!.sharedEntities).toContain("postgresql");
		});

		test("should mark entity candidates with shared ORM names", () => {
			const issue1: Issue = {
				issueType: "error",
				category: "Contradictory Instructions",
				problem: "Uses TypeORM with PostgreSQL instead of documented Mongoose",
				location: { file: "AGENTS.md", start: 30, end: 35 },
				evaluatorName: "13-contradictory",
				severity: 8,
			};
			const issue2: Issue = {
				issueType: "error",
				category: "Outdated Documentation",
				problem: "Mongoose documented but TypeORM found in codebase",
				location: { file: "AGENTS.md", start: 60, end: 65 },
				evaluatorName: "19-outdated",
				severity: 9,
			};

			const entityCandidates = [[issue1, issue2]];
			const formatted = formatIssuesForDeduplication(
				[issue1, issue2],
				[],
				entityCandidates,
			);

			expect(formatted[0]!.entityCandidate).toBe(true);
			expect(formatted[1]!.entityCandidate).toBe(true);
			expect(formatted[0]!.sharedEntities).toContain("typeorm");
			expect(formatted[0]!.sharedEntities).toContain("mongoose");
		});

		test("should not mark issues that are not entity candidates", () => {
			const issue1: Issue = {
				issueType: "error",
				category: "Code Style",
				problem: "Vague code style documentation",
				location: { file: "AGENTS.md", start: 10, end: 15 },
				evaluatorName: "05-code-style",
				severity: 7,
			};
			const issue2: Issue = {
				issueType: "error",
				category: "Testing",
				problem: "Missing test patterns",
				location: { file: "AGENTS.md", start: 50, end: 55 },
				evaluatorName: "14-testing",
				severity: 6,
			};

			// No entity candidates provided
			const formatted = formatIssuesForDeduplication([issue1, issue2], [], []);

			expect(formatted[0]!.entityCandidate).toBe(false);
			expect(formatted[1]!.entityCandidate).toBe(false);
			expect(formatted[0]!.sharedEntities).toBeUndefined();
			expect(formatted[1]!.sharedEntities).toBeUndefined();
		});

		test("should handle both location and entity candidates", () => {
			const issue1: Issue = {
				issueType: "error",
				category: "Outdated Documentation",
				problem: "MySQL documented but PostgreSQL used",
				location: { file: "AGENTS.md", start: 10, end: 15 },
				evaluatorName: "19-outdated",
				severity: 9,
			};
			const issue2: Issue = {
				issueType: "error",
				category: "Command Completeness",
				problem: "Database configuration mismatch - MySQL vs PostgreSQL",
				location: { file: "AGENTS.md", start: 12, end: 14 },
				evaluatorName: "03-command",
				severity: 8,
			};

			const locationCandidates = [[issue1, issue2]];
			const entityCandidates = [[issue1, issue2]];
			const formatted = formatIssuesForDeduplication(
				[issue1, issue2],
				locationCandidates,
				entityCandidates,
			);

			// Both should be marked as location AND entity candidates
			expect(formatted[0]!.locationCandidate).toBe(true);
			expect(formatted[0]!.entityCandidate).toBe(true);
			expect(formatted[0]!.sharedEntities).toBeDefined();
			expect(formatted[1]!.locationCandidate).toBe(true);
			expect(formatted[1]!.entityCandidate).toBe(true);
			expect(formatted[1]!.sharedEntities).toBeDefined();
		});

		test("should extract entities that appear in 2+ issues in cluster", () => {
			const issue1: Issue = {
				issueType: "error",
				category: "Outdated",
				problem:
					"Uses TypeORM, PostgreSQL, and Redis instead of documented Mongoose",
				location: { file: "AGENTS.md", start: 10, end: 15 },
				evaluatorName: "19-outdated",
				severity: 9,
			};
			const issue2: Issue = {
				issueType: "error",
				category: "Command",
				problem:
					"Database contradiction: TypeORM + PostgreSQL vs Mongoose + MongoDB",
				location: { file: "AGENTS.md", start: 50, end: 55 },
				evaluatorName: "03-command",
				severity: 8,
			};

			const entityCandidates = [[issue1, issue2]];
			const formatted = formatIssuesForDeduplication(
				[issue1, issue2],
				[],
				entityCandidates,
			);

			// sharedEntities should only include entities in 2+ issues (not redis)
			const sharedEntities = formatted[0]!.sharedEntities || [];
			expect(sharedEntities).toContain("typeorm");
			expect(sharedEntities).toContain("mongoose");
			expect(sharedEntities).not.toContain("redis"); // Only in issue1
		});

		test("should handle IP addresses as entities", () => {
			const issue1: Issue = {
				issueType: "error",
				category: "Outdated",
				problem: "AGENTS.md specifies MySQL at 10.0.0.160:3306",
				location: { file: "AGENTS.md", start: 32, end: 32 },
				evaluatorName: "19-outdated",
				severity: 9,
			};
			const issue2: Issue = {
				issueType: "error",
				category: "Command",
				problem: "Database host 10.0.0.160 differs from actual 10.0.0.99",
				location: { file: "CLAUDE.md", start: 185, end: 186 },
				evaluatorName: "03-command",
				severity: 8,
			};

			const entityCandidates = [[issue1, issue2]];
			const formatted = formatIssuesForDeduplication(
				[issue1, issue2],
				[],
				entityCandidates,
			);

			// Should extract shared IP address as entity
			const sharedEntities = formatted[0]!.sharedEntities || [];
			expect(sharedEntities).toContain("10.0.0.160");
		});
	});
});
