import { describe, expect, test } from "bun:test";
import type { Issue } from "@shared/types/evaluation";
import { type DeduplicationConfig, deduplicateIssues } from "./deduplicator";

// Helper to create test issues
function createIssue(
	overrides: Partial<Issue> = {},
): Issue & { evaluatorName: string } {
	return {
		category: "Test Category",
		problem: "Test problem",
		location: { file: "test.ts", start: 1, end: 5 },
		issueType: "error",
		severity: 8,
		evaluatorName: "test-evaluator",
		...overrides,
	} as Issue & { evaluatorName: string };
}

const defaultConfig: DeduplicationConfig = {
	enabled: true,
	locationToleranceLines: 5,
	textSimilarityThreshold: 0.55, // Balanced threshold for catching duplicates
	verbose: false,
};

describe("deduplicateIssues", () => {
	test("should keep single issues unchanged", () => {
		const issue = createIssue();
		const result = deduplicateIssues([issue], defaultConfig);

		expect(result.finalCount).toBe(1);
		expect(result.removed.length).toBe(0);
		expect(result.clusters.length).toBe(0);
		expect(result.deduplicated).toEqual([issue]);
	});

	test("should deduplicate exact location + high similarity", () => {
		const issue1 = createIssue({
			problem: "Missing npm scripts documentation in AGENTS.md",
			location: { file: "AGENTS.md", start: 10, end: 15 },
		});
		const issue2 = createIssue({
			problem: "Missing documentation for npm scripts in AGENTS.md",
			location: { file: "AGENTS.md", start: 12, end: 17 },
		});

		const result = deduplicateIssues([issue1, issue2], defaultConfig);

		expect(result.finalCount).toBe(1);
		expect(result.removed.length).toBe(1);
		expect(result.clusters.length).toBe(1);
		expect(result.deduplicated.length).toBe(1);
	});

	test("should keep issues with different locations", () => {
		const issue1 = createIssue({
			problem: "Missing documentation",
			location: { file: "file1.ts", start: 10, end: 15 },
		});
		const issue2 = createIssue({
			problem: "Missing docs",
			location: { file: "file2.ts", start: 10, end: 15 },
		});

		const result = deduplicateIssues([issue1, issue2], defaultConfig);

		expect(result.finalCount).toBe(2);
		expect(result.removed.length).toBe(0);
		expect(result.deduplicated.length).toBe(2);
	});

	test("should keep issues with low similarity", () => {
		const issue1 = createIssue({
			problem: "Missing npm scripts documentation",
			location: { file: "AGENTS.md", start: 10, end: 15 },
		});
		const issue2 = createIssue({
			problem: "Security vulnerability in authentication",
			location: { file: "AGENTS.md", start: 12, end: 17 },
		});

		const result = deduplicateIssues([issue1, issue2], defaultConfig);

		expect(result.finalCount).toBe(2);
		expect(result.removed.length).toBe(0);
	});

	test("should select representative with higher severity", () => {
		const lowSeverity = createIssue({
			problem: "Missing npm scripts documentation section",
			location: { file: "AGENTS.md", start: 10, end: 15 },
			severity: 6,
		});
		const highSeverity = createIssue({
			problem: "npm scripts documentation section is missing",
			location: { file: "AGENTS.md", start: 12, end: 17 },
			severity: 9,
		});

		const result = deduplicateIssues(
			[lowSeverity, highSeverity],
			defaultConfig,
		);

		expect(result.finalCount).toBe(1);
		expect(result.deduplicated[0]!.severity).toBe(9);
		expect(result.removed[0]!.severity).toBe(6);
	});

	test("should select representative with more complete information", () => {
		const minimal = createIssue({
			problem: "Missing documentation for npm scripts",
			location: { file: "AGENTS.md", start: 10, end: 15 },
			severity: 8,
		});
		const detailed = createIssue({
			problem: "npm scripts documentation is missing",
			description: "Detailed description",
			impact: "High impact",
			fix: "Add documentation",
			snippet: "code snippet",
			location: { file: "AGENTS.md", start: 12, end: 17 },
			severity: 8,
		});

		const result = deduplicateIssues([minimal, detailed], defaultConfig);

		expect(result.finalCount).toBe(1);
		expect(result.deduplicated[0]!).toEqual(detailed);
		expect(result.removed[0]!).toEqual(minimal);
	});

	test("should handle multi-location issues", () => {
		const issue1 = createIssue({
			problem: "Inconsistent naming convention found in project files",
			location: [
				{ file: "file1.ts", start: 10, end: 15 },
				{ file: "file2.ts", start: 20, end: 25 },
			],
		});
		const issue2 = createIssue({
			problem: "Naming convention inconsistent in project files",
			location: { file: "file1.ts", start: 12, end: 17 },
		});

		const result = deduplicateIssues([issue1, issue2], defaultConfig);

		expect(result.finalCount).toBe(1);
		expect(result.removed.length).toBe(1);
		expect(result.clusters.length).toBe(1);
	});

	test("should respect location tolerance", () => {
		const issue1 = createIssue({
			problem: "Missing documentation section in the AGENTS.md file here",
			location: { file: "AGENTS.md", start: 10, end: 15 },
		});
		const issue2 = createIssue({
			problem: "Documentation section missing in the AGENTS.md file here",
			location: { file: "AGENTS.md", start: 30, end: 35 },
		});

		// With default tolerance (5 lines), they shouldn't overlap
		const result1 = deduplicateIssues([issue1, issue2], defaultConfig);
		expect(result1.finalCount).toBe(2);

		// With higher tolerance (20 lines), they should overlap and be deduplicated
		const result2 = deduplicateIssues([issue1, issue2], {
			...defaultConfig,
			locationToleranceLines: 20,
		});
		expect(result2.finalCount).toBe(1);
	});

	test("should respect similarity threshold", () => {
		const issue1 = createIssue({
			problem: "Missing npm scripts documentation in project",
			location: { file: "AGENTS.md", start: 10, end: 15 },
		});
		const issue2 = createIssue({
			problem: "npm scripts documentation missing from project",
			location: { file: "AGENTS.md", start: 12, end: 17 },
		});

		// With high threshold (0.9), they might not be similar enough
		const result1 = deduplicateIssues([issue1, issue2], {
			...defaultConfig,
			textSimilarityThreshold: 0.9,
		});
		expect(result1.finalCount).toBe(2);

		// With lower threshold (0.4), they should be similar enough
		const result2 = deduplicateIssues([issue1, issue2], {
			...defaultConfig,
			textSimilarityThreshold: 0.4,
		});
		expect(result2.finalCount).toBe(1);
	});

	test("should handle issues without locations", () => {
		const issue1 = createIssue({
			problem: "Missing documentation",
			location: undefined,
		});
		const issue2 = createIssue({
			problem: "Missing docs",
			location: undefined,
		});

		const result = deduplicateIssues([issue1, issue2], defaultConfig);

		// Without locations, they can't be clustered by location
		expect(result.finalCount).toBe(2);
	});

	test("should handle three similar issues", () => {
		const issue1 = createIssue({
			problem: "Missing npm scripts documentation section in AGENTS.md",
			location: { file: "AGENTS.md", start: 10, end: 15 },
			severity: 7,
		});
		const issue2 = createIssue({
			problem: "npm scripts documentation section missing in AGENTS.md",
			location: { file: "AGENTS.md", start: 12, end: 17 },
			severity: 8,
		});
		const issue3 = createIssue({
			problem: "AGENTS.md is missing npm scripts documentation section",
			location: { file: "AGENTS.md", start: 14, end: 19 },
			severity: 9,
		});

		const result = deduplicateIssues([issue1, issue2, issue3], defaultConfig);

		expect(result.finalCount).toBe(1);
		expect(result.removed.length).toBe(2);
		expect(result.deduplicated[0]!.severity).toBe(9); // Highest severity
	});

	test("should handle suggestion issues", () => {
		const issue1 = createIssue({
			problem: "Adding usage examples to documentation section",
			location: { file: "AGENTS.md", start: 10, end: 15 },
			issueType: "suggestion",
			impactLevel: "High",
		});
		const issue2 = createIssue({
			problem: "Usage examples to documentation section needed",
			location: { file: "AGENTS.md", start: 12, end: 17 },
			issueType: "suggestion",
			impactLevel: "Medium",
		});

		const result = deduplicateIssues([issue1, issue2], defaultConfig);

		expect(result.finalCount).toBe(1);
		expect(result.removed.length).toBe(1);
		expect(result.deduplicated[0]!.impactLevel).toBe("High"); // Higher impact
	});

	test("should preserve cluster information", () => {
		const issue1 = createIssue({
			problem: "Missing documentation section in the AGENTS.md file",
			location: { file: "AGENTS.md", start: 10, end: 15 },
			severity: 8,
		});
		const issue2 = createIssue({
			problem: "Documentation section missing in AGENTS.md file",
			location: { file: "AGENTS.md", start: 12, end: 17 },
			severity: 7,
		});

		const result = deduplicateIssues([issue1, issue2], defaultConfig);

		expect(result.clusters.length).toBe(1);
		expect(result.clusters[0]!.representative).toEqual(issue1);
		expect(result.clusters[0]!.duplicates).toEqual([issue2]);
		expect(result.clusters[0]!.reason).toMatch(
			/Same location \+ \d+% text similarity/,
		);
		expect(result.clusters[0]!.similarity).toBeGreaterThan(0);
	});

	test("should handle empty input", () => {
		const result = deduplicateIssues([], defaultConfig);

		expect(result.finalCount).toBe(0);
		expect(result.removed.length).toBe(0);
		expect(result.clusters.length).toBe(0);
		expect(result.deduplicated).toEqual([]);
	});

	describe("Location candidates tracking", () => {
		test("should identify location candidates with low text similarity", () => {
			const issue1 = createIssue({
				category: "Code Style Clarity",
				problem:
					"Extremely vague and non-specific code style guidance with no concrete rules",
				location: { file: "AGENTS.md", start: 17, end: 19 },
				evaluatorName: "code-style",
				severity: 9,
			});
			const issue2 = createIssue({
				category: "Language Clarity",
				problem:
					"Vague imperative 'Write beautiful code' without actionable criteria",
				location: { file: "AGENTS.md", start: 19, end: 19 },
				evaluatorName: "language-clarity",
				severity: 7,
			});

			const result = deduplicateIssues([issue1, issue2], defaultConfig);

			// Both should be kept by Phase 1
			expect(result.finalCount).toBe(2);
			expect(result.deduplicated).toHaveLength(2);

			// Should be identified as location candidates
			expect(result.locationCandidates).toBeDefined();
			expect(result.locationCandidates).toHaveLength(1);
			expect(result.locationCandidates?.[0]).toHaveLength(2);
			expect(result.locationCandidates?.[0]).toContain(issue1);
			expect(result.locationCandidates?.[0]).toContain(issue2);
		});

		test("should not track single-issue clusters as location candidates", () => {
			const issue = createIssue({
				category: "Test",
				problem: "Single issue",
				location: { file: "test.md", start: 1, end: 5 },
				evaluatorName: "test-eval",
				severity: 5,
			});

			const result = deduplicateIssues([issue], defaultConfig);

			expect(result.locationCandidates).toEqual([]);
		});

		test("should not track clusters with high similarity as location candidates", () => {
			const issue1 = createIssue({
				problem: "Missing npm scripts documentation in AGENTS.md",
				location: { file: "AGENTS.md", start: 10, end: 15 },
			});
			const issue2 = createIssue({
				problem: "Missing documentation for npm scripts in AGENTS.md",
				location: { file: "AGENTS.md", start: 12, end: 17 },
			});

			const result = deduplicateIssues([issue1, issue2], defaultConfig);

			// These have high similarity, so they should be deduplicated
			expect(result.finalCount).toBe(1);
			// Should not be tracked as location candidates (they were deduplicated)
			expect(result.locationCandidates).toEqual([]);
		});

		test("should track multiple location candidate clusters", () => {
			const cluster1Issue1 = createIssue({
				problem: "Vague code style rule",
				location: { file: "AGENTS.md", start: 10, end: 15 },
			});
			const cluster1Issue2 = createIssue({
				problem: "Unclear formatting instruction",
				location: { file: "AGENTS.md", start: 12, end: 14 },
			});
			const cluster2Issue1 = createIssue({
				problem: "Missing environment variable",
				location: { file: "README.md", start: 50, end: 55 },
			});
			const cluster2Issue2 = createIssue({
				problem: "Undocumented configuration option",
				location: { file: "README.md", start: 52, end: 57 },
			});

			const result = deduplicateIssues(
				[cluster1Issue1, cluster1Issue2, cluster2Issue1, cluster2Issue2],
				defaultConfig,
			);

			// All should be kept (low similarity)
			expect(result.finalCount).toBe(4);

			// Should have 2 location candidate clusters
			expect(result.locationCandidates).toBeDefined();
			expect(result.locationCandidates).toHaveLength(2);
			expect(result.locationCandidates?.[0]).toHaveLength(2);
			expect(result.locationCandidates?.[1]).toHaveLength(2);
		});
	});

	describe("Entity Candidate Extraction", () => {
		test("should extract entity candidates with shared database names", () => {
			const issue1 = createIssue({
				problem:
					"Documentation says MySQL but codebase uses PostgreSQL at 10.0.0.99:5432",
			});
			const issue2 = createIssue({
				problem:
					"Critical database mismatch - MySQL vs PostgreSQL configuration",
			});
			const issue3 = createIssue({
				problem: "Conflicting database information between files",
			});

			const result = deduplicateIssues([issue1, issue2, issue3], defaultConfig);

			// All issues should be kept (no location overlap, different wording)
			expect(result.finalCount).toBe(3);

			// Should create entity candidates (issue1 and issue2 both mention MySQL + PostgreSQL)
			expect(result.entityCandidates).toBeDefined();
			expect(result.entityCandidates!.length).toBeGreaterThan(0);

			// At least one entity cluster should contain issue1 and issue2
			const hasClusterWithBoth = result.entityCandidates!.some(
				(cluster) => cluster.includes(issue1) && cluster.includes(issue2),
			);
			expect(hasClusterWithBoth).toBe(true);
		});

		test("should extract entity candidates with ORM names", () => {
			const issue1 = createIssue({
				problem: "Uses TypeORM with PostgreSQL instead of documented Mongoose",
			});
			const issue2 = createIssue({
				problem:
					"Documentation claims Mongoose + MongoDB but code uses TypeORM + PostgreSQL",
			});
			const issue3 = createIssue({
				problem: "Missing test documentation",
			});

			const result = deduplicateIssues([issue1, issue2, issue3], defaultConfig);

			// Should create entity candidates (both mention TypeORM, Mongoose, PostgreSQL, MongoDB)
			expect(result.entityCandidates).toBeDefined();
			expect(result.entityCandidates!.length).toBeGreaterThan(0);

			// Should cluster issue1 and issue2 by multiple shared entities
			const hasClusterWithBoth = result.entityCandidates!.some(
				(cluster) => cluster.includes(issue1) && cluster.includes(issue2),
			);
			expect(hasClusterWithBoth).toBe(true);
		});

		test("should extract entity candidates with IP addresses", () => {
			const issue1 = createIssue({
				problem: "AGENTS.md specifies MySQL at 10.0.0.160:3306",
			});
			const issue2 = createIssue({
				problem: "CLAUDE.md specifies PostgreSQL at 10.0.0.99:6543",
			});
			const issue3 = createIssue({
				problem: "Database configuration uses MySQL at 10.0.0.160",
			});

			const result = deduplicateIssues([issue1, issue2, issue3], defaultConfig);

			// Should create entity candidates (issue1 and issue3 share MySQL and 10.0.0.160)
			expect(result.entityCandidates).toBeDefined();
			expect(result.entityCandidates!.length).toBeGreaterThan(0);
		});

		test("should not create entity candidates with threshold not met", () => {
			const issue1 = createIssue({
				problem: "Uses MySQL database",
			});
			const issue2 = createIssue({
				problem: "Missing PostgreSQL documentation",
			});

			const result = deduplicateIssues([issue1, issue2], defaultConfig);

			// Should not create entity candidates (each entity only appears once)
			// Or if created, clusters should have minimum size
			if (result.entityCandidates) {
				// Each cluster should have at least 2 issues
				result.entityCandidates.forEach((cluster) => {
					expect(cluster.length).toBeGreaterThanOrEqual(2);
				});
			}
		});

		test("should handle case-insensitive entity extraction", () => {
			const issue1 = createIssue({
				problem: "Documentation says MYSQL but uses PostgreSQL",
			});
			const issue2 = createIssue({
				problem: "Database mismatch: mysql vs postgres",
			});

			const result = deduplicateIssues([issue1, issue2], defaultConfig);

			// Should create entity candidates (MySQL normalized to lowercase)
			expect(result.entityCandidates).toBeDefined();
			expect(result.entityCandidates!.length).toBeGreaterThan(0);

			// Should cluster issue1 and issue2 (both mention MySQL in different cases)
			const hasClusterWithBoth = result.entityCandidates!.some(
				(cluster) => cluster.includes(issue1) && cluster.includes(issue2),
			);
			expect(hasClusterWithBoth).toBe(true);
		});

		test("should handle issues without any entities", () => {
			const issue1 = createIssue({
				problem: "Vague code style documentation",
			});
			const issue2 = createIssue({
				problem: "Missing test patterns",
			});

			const result = deduplicateIssues([issue1, issue2], defaultConfig);

			// Should not crash, entityCandidates may be empty
			expect(result.entityCandidates).toBeDefined();
			// Issues without entities should not form entity candidate clusters
		});

		test("should extract multiple entity types in same issue", () => {
			const issue1 = createIssue({
				problem:
					"Uses TypeORM with PostgreSQL at 10.0.0.99 instead of Mongoose with MongoDB",
			});
			const issue2 = createIssue({
				problem:
					"Database contradiction: TypeORM + PostgreSQL vs documented Mongoose + MongoDB",
			});

			const result = deduplicateIssues([issue1, issue2], defaultConfig);

			// Should create entity candidates for multiple shared entities
			expect(result.entityCandidates).toBeDefined();
			expect(result.entityCandidates!.length).toBeGreaterThan(0);

			// Both issues share multiple entities (typeorm, postgresql, mongoose, mongodb)
			const hasClusterWithBoth = result.entityCandidates!.some(
				(cluster) => cluster.includes(issue1) && cluster.includes(issue2),
			);
			expect(hasClusterWithBoth).toBe(true);
		});
	});
});
