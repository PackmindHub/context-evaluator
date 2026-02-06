import { describe, expect, test } from "bun:test";
import type { IProjectContext, Issue } from "@shared/types/evaluation";
import {
	calculateAgentsFilesBonus,
	calculateLinkedDocsBonus,
	calculateScore,
	calculateSkillsBonus,
	computeContextScore,
	createNoFilesContextScore,
	generateExplanation,
	getDocumentationMaturityFactor,
	getGradeFromScore,
	getProjectSizeTier,
	type IContextScorerInput,
	parseTotalLOC,
} from "./context-scorer";

describe("Context Scorer", () => {
	describe("getGradeFromScore", () => {
		test("should return Excellent for score >= 8.5", () => {
			expect(getGradeFromScore(10)).toBe("Excellent");
			expect(getGradeFromScore(9.0)).toBe("Excellent");
			expect(getGradeFromScore(8.5)).toBe("Excellent");
		});

		test("should return Good for score >= 6.5 and < 8.5", () => {
			expect(getGradeFromScore(8.4)).toBe("Good");
			expect(getGradeFromScore(7.5)).toBe("Good");
			expect(getGradeFromScore(6.5)).toBe("Good");
		});

		test("should return Fair for score >= 4.5 and < 6.5", () => {
			expect(getGradeFromScore(6.4)).toBe("Fair");
			expect(getGradeFromScore(5.5)).toBe("Fair");
			expect(getGradeFromScore(4.5)).toBe("Fair");
		});

		test("should return Developing for score >= 3.0 and < 4.5", () => {
			expect(getGradeFromScore(4.4)).toBe("Developing");
			expect(getGradeFromScore(3.5)).toBe("Developing");
			expect(getGradeFromScore(3.0)).toBe("Developing");
		});

		test("should return Getting Started for score < 3.0", () => {
			expect(getGradeFromScore(2.9)).toBe("Getting Started");
			expect(getGradeFromScore(2.0)).toBe("Getting Started");
			expect(getGradeFromScore(1.0)).toBe("Getting Started");
		});
	});

	describe("parseTotalLOC", () => {
		test("should parse cloc summary with multiple languages", () => {
			const clocSummary = "TypeScript: 15,234\nJavaScript: 3,421\nCSS: 500";
			expect(parseTotalLOC(clocSummary)).toBe(19155);
		});

		test("should handle numbers without commas", () => {
			const clocSummary = "TypeScript: 1500\nJavaScript: 500";
			expect(parseTotalLOC(clocSummary)).toBe(2000);
		});

		test("should return 0 for undefined", () => {
			expect(parseTotalLOC(undefined)).toBe(0);
		});

		test("should return 0 for empty string", () => {
			expect(parseTotalLOC("")).toBe(0);
		});
	});

	describe("getProjectSizeTier", () => {
		test("should return small for < 5K LOC", () => {
			expect(getProjectSizeTier(0)).toBe("small");
			expect(getProjectSizeTier(4999)).toBe("small");
		});

		test("should return medium for 5K-25K LOC", () => {
			expect(getProjectSizeTier(5000)).toBe("medium");
			expect(getProjectSizeTier(24999)).toBe("medium");
		});

		test("should return large for 25K-100K LOC", () => {
			expect(getProjectSizeTier(25000)).toBe("large");
			expect(getProjectSizeTier(99999)).toBe("large");
		});

		test("should return enterprise for > 100K LOC", () => {
			expect(getProjectSizeTier(100000)).toBe("enterprise");
			expect(getProjectSizeTier(500000)).toBe("enterprise");
		});
	});

	describe("calculateAgentsFilesBonus", () => {
		test("should return 0 for no files", () => {
			expect(calculateAgentsFilesBonus(0)).toBe(0);
		});

		test("should return 1.5 for 1 file", () => {
			expect(calculateAgentsFilesBonus(1)).toBe(1.5);
		});

		test("should use logarithmic scaling for multiple files", () => {
			// 2 files: 1.5 + 0.4 * log2(2) = 1.5 + 0.4 = 1.9
			expect(calculateAgentsFilesBonus(2)).toBe(1.9);
			// 3 files: 1.5 + 0.4 * log2(3) ≈ 1.5 + 0.63 = 2.13
			expect(calculateAgentsFilesBonus(3)).toBeCloseTo(2.13, 1);
		});

		test("should continue to reward more files up to cap", () => {
			// 5 files: 1.5 + 0.4 * log2(5) ≈ 2.43
			expect(calculateAgentsFilesBonus(5)).toBeCloseTo(2.43, 1);
			// 10 files should hit the max cap of 2.5
			expect(calculateAgentsFilesBonus(10)).toBe(2.5);
			// More files should also be capped at 2.5
			expect(calculateAgentsFilesBonus(20)).toBe(2.5);
		});
	});

	describe("calculateSkillsBonus", () => {
		test("should return 0 for no skills", () => {
			expect(calculateSkillsBonus(0)).toBe(0);
		});

		test("should use logarithmic scaling for skills", () => {
			// 1 skill: 0.2 * log2(2) = 0.2
			expect(calculateSkillsBonus(1)).toBe(0.2);
			// 3 skills: 0.2 * log2(4) = 0.4
			expect(calculateSkillsBonus(3)).toBe(0.4);
			// 7 skills: 0.2 * log2(8) = 0.6
			expect(calculateSkillsBonus(7)).toBe(0.6);
		});

		test("should continue to reward more skills up to cap", () => {
			// 8 skills: 0.2 * log2(9) ≈ 0.63
			expect(calculateSkillsBonus(8)).toBeCloseTo(0.63, 1);
			// 20 skills: 0.2 * log2(21) ≈ 0.88
			expect(calculateSkillsBonus(20)).toBeCloseTo(0.88, 1);
			// Many skills should hit the max cap of 1.0
			expect(calculateSkillsBonus(50)).toBe(1.0);
		});
	});

	describe("calculateLinkedDocsBonus", () => {
		test("should return 0 for no linked docs", () => {
			expect(calculateLinkedDocsBonus(0)).toBe(0);
		});

		test("should use logarithmic scaling for linked docs", () => {
			// 1 doc: 0.2 * log2(2) = 0.2
			expect(calculateLinkedDocsBonus(1)).toBe(0.2);
			// 3 docs: 0.2 * log2(4) = 0.4
			expect(calculateLinkedDocsBonus(3)).toBe(0.4);
			// 7 docs: 0.2 * log2(8) = 0.6
			expect(calculateLinkedDocsBonus(7)).toBe(0.6);
		});

		test("should continue to reward more docs up to cap", () => {
			// 15 docs: 0.2 * log2(16) = 0.8
			expect(calculateLinkedDocsBonus(15)).toBe(0.8);
			// Many docs should hit the max cap of 1.0
			expect(calculateLinkedDocsBonus(50)).toBe(1.0);
		});
	});

	describe("getDocumentationMaturityFactor", () => {
		test("should return 0.7 (30% reduction) for 1 or fewer issues per file", () => {
			expect(getDocumentationMaturityFactor(0)).toBe(0.7);
			expect(getDocumentationMaturityFactor(0.5)).toBe(0.7);
			expect(getDocumentationMaturityFactor(1)).toBe(0.7);
		});

		test("should return 0.85 (15% reduction) for 1-2 issues per file", () => {
			expect(getDocumentationMaturityFactor(1.5)).toBe(0.85);
			expect(getDocumentationMaturityFactor(2)).toBe(0.85);
		});

		test("should return 1.0 (no reduction) for more than 2 issues per file", () => {
			expect(getDocumentationMaturityFactor(2.1)).toBe(1.0);
			expect(getDocumentationMaturityFactor(5)).toBe(1.0);
			expect(getDocumentationMaturityFactor(10)).toBe(1.0);
		});
	});

	describe("computeContextScore", () => {
		test("should compute score with 1 AGENTS.md file and no issues", () => {
			const input: IContextScorerInput = {
				issues: [],
				filesFound: 1,
			};

			const result = computeContextScore(input);

			// Base (6) + AGENTS.md bonus (1.5) - no penalty = 7.5
			expect(result.baseScore).toBe(6);
			expect(result.setupBonus.agentsFilesBonus).toBe(1.5);
			expect(result.setupBonus.total).toBe(1.5);
			expect(result.issuePenalty.penalty).toBe(0);
			expect(result.context.agentsFileCount).toBe(1);
		});

		test("should apply setup bonuses from project context with progressive scaling", () => {
			const projectContext: IProjectContext = {
				languages: "TypeScript",
				frameworks: "React",
				architecture: "monorepo",
				patterns: "",
				raw: "",
				agentsFilePaths: ["AGENTS.md", "src/AGENTS.md", "lib/AGENTS.md"],
				skills: [
					{ name: "s1", description: "", path: "", directory: "" },
					{ name: "s2", description: "", path: "", directory: "" },
					{ name: "s3", description: "", path: "", directory: "" },
					{ name: "s4", description: "", path: "", directory: "" },
				],
				linkedDocs: [
					{ path: "docs/1.md", summary: "", linkedFrom: "" },
					{ path: "docs/2.md", summary: "", linkedFrom: "" },
					{ path: "docs/3.md", summary: "", linkedFrom: "" },
				],
			};

			const input: IContextScorerInput = {
				issues: [],
				filesFound: 3,
				projectContext,
			};

			const result = computeContextScore(input);

			// AGENTS.md bonus: 3 files = 1.5 + 0.4 * log2(3) ≈ 2.13
			expect(result.setupBonus.agentsFilesBonus).toBeCloseTo(2.13, 1);
			// Skills bonus: 4 skills = 0.2 * log2(5) ≈ 0.46
			expect(result.setupBonus.skillsBonus).toBeCloseTo(0.46, 1);
			// Linked docs bonus: 3 docs = 0.2 * log2(4) = 0.4
			expect(result.setupBonus.linkedDocsBonus).toBe(0.4);
			// Total should be sum of above
			expect(result.setupBonus.total).toBeCloseTo(2.99, 1);
		});

		test("should cap setup bonus at 4.5", () => {
			const projectContext: IProjectContext = {
				languages: "TypeScript",
				frameworks: "React",
				architecture: "monorepo",
				patterns: "",
				raw: "",
				agentsFilePaths: Array(20).fill("AGENTS.md"),
				skills: Array(50).fill({
					name: "s",
					description: "",
					path: "",
					directory: "",
				}),
				linkedDocs: Array(50).fill({
					path: "doc.md",
					summary: "",
					linkedFrom: "",
				}),
			};

			const input: IContextScorerInput = {
				issues: [],
				filesFound: 20,
				projectContext,
			};

			const result = computeContextScore(input);

			// Files: 2.5 (capped), Skills: 1.0 (capped), Docs: 1.0 (capped) = 4.5
			expect(result.setupBonus.total).toBe(4.5);
		});

		test("should count high severity issues (8-10)", () => {
			const issues: Issue[] = [
				{
					category: "test",
					severity: 9,
					location: { start: 1, end: 1 },
					evaluatorName: "01-content-quality.md",
					issueType: "error",
				},
			];

			const input: IContextScorerInput = {
				issues,
				filesFound: 1,
			};

			const result = computeContextScore(input);

			expect(result.context.highIssues).toBe(1);
			expect(result.context.mediumIssues).toBe(0);
			expect(result.context.lowIssues).toBe(0);
			expect(result.context.errorCount).toBe(1);
		});

		test("should count medium severity issues (6-7)", () => {
			const issues: Issue[] = [
				{
					category: "test",
					severity: 6,
					location: { start: 1, end: 1 },
					evaluatorName: "01-content-quality.md",
					issueType: "error",
				},
				{
					category: "test2",
					severity: 7,
					location: { start: 1, end: 1 },
					evaluatorName: "01-content-quality.md",
					issueType: "error",
				},
			];

			const input: IContextScorerInput = {
				issues,
				filesFound: 1,
			};

			const result = computeContextScore(input);

			expect(result.context.highIssues).toBe(0);
			expect(result.context.mediumIssues).toBe(2);
			expect(result.context.errorCount).toBe(2);
		});

		test("should count suggestions separately with low weight", () => {
			const issues: Issue[] = [
				{
					category: "test",
					impactLevel: "High",
					location: { start: 1, end: 1 },
					evaluatorName: "11-subdirectory-coverage.md",
					issueType: "suggestion",
				},
			];

			const input: IContextScorerInput = {
				issues,
				filesFound: 1,
			};

			const result = computeContextScore(input);

			expect(result.context.suggestionCount).toBe(1);
			expect(result.context.errorCount).toBe(0);
			// Suggestions are mapped to low severity
			expect(result.context.lowIssues).toBe(1);
		});

		test("should apply LOC-based issue allowance", () => {
			const projectContext: IProjectContext = {
				languages: "TypeScript",
				frameworks: "",
				architecture: "",
				patterns: "",
				raw: "",
				clocSummary: "TypeScript: 50,000", // Large project
				agentsFilePaths: ["AGENTS.md"],
			};

			const input: IContextScorerInput = {
				issues: [],
				filesFound: 1,
				projectContext,
			};

			const result = computeContextScore(input);

			expect(result.context.projectSizeTier).toBe("large");
			expect(result.issuePenalty.issueAllowance).toBe(15); // Large = 15 free issues
		});

		test("should calculate penalty for excess issues", () => {
			// Create issues that will exceed the small project allowance
			const issues: Issue[] = Array(20)
				.fill(null)
				.map((_, i) => ({
					category: `test${i}`,
					severity: 9, // High severity = 0.45 weight
					location: { start: 1, end: 1 },
					evaluatorName: "01-content-quality.md",
					issueType: "error" as const,
				}));

			const input: IContextScorerInput = {
				issues,
				filesFound: 1,
			};

			const result = computeContextScore(input);

			// 20 high-severity errors * 0.45 weight = 9 weighted issues
			// Small project allowance = 5, so excess = 9 - 2.5 = 6.5
			expect(result.issuePenalty.weightedIssueCount).toBe(9);
			expect(result.issuePenalty.excessIssues).toBeGreaterThan(0);
			expect(result.issuePenalty.penalty).toBeGreaterThan(0);
			// Penalty should be capped at 3.0
			expect(result.issuePenalty.penalty).toBeLessThanOrEqual(3.0);
		});
	});

	describe("calculateScore", () => {
		test("should calculate score using new formula", () => {
			const breakdown = {
				baseScore: 6,
				setupBonus: {
					agentsFilesBonus: 1.5,
					skillsBonus: 0.5,
					linkedDocsBonus: 0.25,
					total: 2.25,
				},
				issuePenalty: {
					weightedIssueCount: 1.0,
					issueAllowance: 5,
					excessIssues: 0,
					penalty: 0.5,
				},
				context: {
					projectSizeTier: "small" as const,
					totalLOC: 3000,
					agentsFileCount: 1,
					skillsCount: 5,
					linkedDocsCount: 2,
					highIssues: 0,
					mediumIssues: 1,
					lowIssues: 0,
					errorCount: 1,
					suggestionCount: 0,
				},
			};

			const score = calculateScore(breakdown);

			// 6 + 2.25 - 0.5 = 7.75
			expect(score).toBe(7.8); // Rounded to 1 decimal
		});

		test("should clamp score at minimum 1", () => {
			const breakdown = {
				baseScore: 6,
				setupBonus: {
					agentsFilesBonus: 0,
					skillsBonus: 0,
					linkedDocsBonus: 0,
					total: 0,
				},
				issuePenalty: {
					weightedIssueCount: 20,
					issueAllowance: 5,
					excessIssues: 17.5,
					penalty: 3.0,
				},
				context: {
					projectSizeTier: "small" as const,
					totalLOC: 0,
					agentsFileCount: 0,
					skillsCount: 0,
					linkedDocsCount: 0,
					highIssues: 20,
					mediumIssues: 0,
					lowIssues: 0,
					errorCount: 20,
					suggestionCount: 0,
				},
			};

			const score = calculateScore(breakdown);

			// 6 + 0 - 3.0 = 3.0, but floor would be 1 if penalty could exceed limits
			expect(score).toBeGreaterThanOrEqual(1);
		});

		test("should clamp score at maximum 10", () => {
			const breakdown = {
				baseScore: 6,
				setupBonus: {
					agentsFilesBonus: 2.5,
					skillsBonus: 1.0,
					linkedDocsBonus: 1.0,
					total: 4.5,
				},
				issuePenalty: {
					weightedIssueCount: 0,
					issueAllowance: 5,
					excessIssues: 0,
					penalty: 0,
				},
				context: {
					projectSizeTier: "small" as const,
					totalLOC: 3000,
					agentsFileCount: 20,
					skillsCount: 50,
					linkedDocsCount: 50,
					highIssues: 0,
					mediumIssues: 0,
					lowIssues: 0,
					errorCount: 0,
					suggestionCount: 0,
				},
			};

			const score = calculateScore(breakdown);

			// 6 + 4.5 - 0 = 10.5, should be capped at 10
			expect(score).toBeLessThanOrEqual(10);
			expect(score).toBe(10);
		});
	});

	describe("createNoFilesContextScore", () => {
		test("should return score of 3.5 with Developing grade", () => {
			const result = createNoFilesContextScore();

			expect(result.score).toBe(3.5);
			expect(result.grade).toBe("Developing");
		});

		test("should have appropriate summary for no files", () => {
			const result = createNoFilesContextScore();

			expect(result.summary).toContain("No AGENTS.md files found");
		});

		test("should have explanation field", () => {
			const result = createNoFilesContextScore();

			expect(result.explanation).toBeDefined();
			expect(result.explanation).toContain("No AGENTS.md");
		});

		test("should have zero setup bonuses", () => {
			const result = createNoFilesContextScore();

			expect(result.breakdown.setupBonus.total).toBe(0);
			expect(result.breakdown.setupBonus.agentsFilesBonus).toBe(0);
			expect(result.breakdown.setupBonus.skillsBonus).toBe(0);
			expect(result.breakdown.setupBonus.linkedDocsBonus).toBe(0);
		});

		test("should have penalty for no files", () => {
			const result = createNoFilesContextScore();

			expect(result.breakdown.issuePenalty.penalty).toBe(2.5);
		});

		test("should have agentsFileCount: 0", () => {
			const result = createNoFilesContextScore();

			expect(result.breakdown.context.agentsFileCount).toBe(0);
		});

		test("should have 3 bootstrap recommendations", () => {
			const result = createNoFilesContextScore();

			expect(result.recommendations).toHaveLength(3);
			expect(result.recommendations[0]).toContain("Bootstrap");
		});
	});

	describe("generateExplanation", () => {
		test("should generate explanation for no files", () => {
			const explanation = generateExplanation(3.5, "Developing", 0, 2.5, 0);
			expect(explanation).toContain("No AGENTS.md");
		});

		test("should generate explanation for Excellent grade", () => {
			const explanation = generateExplanation(9.0, "Excellent", 3.0, 0, 2);
			expect(explanation).toContain("Great job");
			expect(explanation).toContain("2 context files");
		});

		test("should generate explanation for Good grade with issues", () => {
			const explanation = generateExplanation(7.5, "Good", 2.0, 1.0, 1);
			expect(explanation).toContain("Good foundation");
		});

		test("should generate explanation for Fair grade", () => {
			const explanation = generateExplanation(5.5, "Fair", 1.5, 1.5, 1);
			expect(explanation).toContain("basic guidance");
		});

		test("should generate explanation for Developing grade", () => {
			const explanation = generateExplanation(4.0, "Developing", 1.0, 2.0, 1);
			expect(explanation).toContain("developing");
		});

		test("should generate explanation for Getting Started grade", () => {
			const explanation = generateExplanation(
				2.5,
				"Getting Started",
				0.5,
				2.5,
				1,
			);
			expect(explanation).toContain("significant improvement");
		});
	});

	describe("integration scenarios", () => {
		test("perfect setup should score 10 (Excellent) with max bonuses", () => {
			const projectContext: IProjectContext = {
				languages: "TypeScript",
				frameworks: "React",
				architecture: "monorepo",
				patterns: "",
				raw: "",
				agentsFilePaths: Array(20).fill("AGENTS.md"), // Max files bonus (2.5)
				skills: Array(50).fill({
					name: "s",
					description: "",
					path: "",
					directory: "",
				}), // Max skills bonus (1.0)
				linkedDocs: Array(50).fill({
					path: "doc.md",
					summary: "",
					linkedFrom: "",
				}), // Max linked docs bonus (1.0)
			};

			const input: IContextScorerInput = {
				issues: [],
				filesFound: 20,
				projectContext,
			};

			const result = computeContextScore(input);
			const score = calculateScore(result);

			// 6 + 4.5 (capped) - 0 = 10.5 -> clamped to 10
			expect(score).toBe(10);
			expect(getGradeFromScore(score)).toBe("Excellent");
		});

		test("single AGENTS.md with no issues should score 7.5 (Good)", () => {
			const input: IContextScorerInput = {
				issues: [],
				filesFound: 1,
			};

			const result = computeContextScore(input);
			const score = calculateScore(result);

			// 6 + 1.5 - 0 = 7.5
			expect(score).toBe(7.5);
			expect(getGradeFromScore(score)).toBe("Good");
		});

		test("10 files with 20 skills should score higher than before (user scenario)", () => {
			const projectContext: IProjectContext = {
				languages: "TypeScript",
				frameworks: "React",
				architecture: "monorepo",
				patterns: "",
				raw: "",
				agentsFilePaths: Array(10).fill("AGENTS.md"),
				skills: Array(20).fill({
					name: "s",
					description: "",
					path: "",
					directory: "",
				}),
				linkedDocs: [],
			};

			// 10 high-severity issues across 10 files (1 issue per file)
			const issues: Issue[] = Array(10)
				.fill(null)
				.map((_, i) => ({
					category: `test${i}`,
					severity: 9,
					location: { start: 1, end: 1 },
					evaluatorName: "01-content-quality.md",
					issueType: "error" as const,
				}));

			const input: IContextScorerInput = {
				issues,
				filesFound: 10,
				projectContext,
			};

			const result = computeContextScore(input);
			const score = calculateScore(result);

			// Files bonus: 2.5 (10 files hits max)
			// Skills bonus: ~0.88 (20 skills)
			// Total setup: ~3.38
			// Issues: 10 * 0.45 = 4.5 weighted, excess = ~2
			// Raw penalty: log2(3) * 1.2 ≈ 1.9
			// Maturity factor: 1.0 issues/file → 0.7
			// Adjusted penalty: 1.9 * 0.7 ≈ 1.33
			// Score: 6 + 3.38 - 1.33 ≈ 8.05
			expect(score).toBeGreaterThanOrEqual(7.0);
			expect(result.context.issuesPerFile).toBe(1);
			expect(result.context.documentationMaturityFactor).toBe(0.7);
		});

		test("suggestions-only should have minimal impact on score", () => {
			const issues: Issue[] = Array(10)
				.fill(null)
				.map((_, i) => ({
					category: `suggestion-cat${i}`,
					impactLevel: "Medium" as const,
					location: { start: 1, end: 1 },
					evaluatorName: "11-subdirectory-coverage.md",
					issueType: "suggestion" as const,
				}));

			const input: IContextScorerInput = {
				issues,
				filesFound: 1,
			};

			const result = computeContextScore(input);
			const score = calculateScore(result);

			// Suggestions have very low weight (0.05 * 0.2 = 0.01 each)
			// So 10 suggestions = 0.1 weighted issues, well under allowance
			expect(score).toBeGreaterThanOrEqual(7);
		});

		test("large project with many issues should use higher allowance", () => {
			const projectContext: IProjectContext = {
				languages: "TypeScript",
				frameworks: "",
				architecture: "",
				patterns: "",
				raw: "",
				clocSummary: "TypeScript: 150,000",
				agentsFilePaths: ["AGENTS.md"],
			};

			// 10 medium severity errors
			const issues: Issue[] = Array(10)
				.fill(null)
				.map((_, i) => ({
					category: `test${i}`,
					severity: 6,
					location: { start: 1, end: 1 },
					evaluatorName: "01-content-quality.md",
					issueType: "error" as const,
				}));

			const input: IContextScorerInput = {
				issues,
				filesFound: 1,
				projectContext,
			};

			const result = computeContextScore(input);

			// Enterprise project (150K LOC) gets 20 free issues
			expect(result.context.projectSizeTier).toBe("enterprise");
			expect(result.issuePenalty.issueAllowance).toBe(20);
			// 10 medium errors * 0.15 = 1.5 weighted issues, under 10 (20*0.5) allowance
			expect(result.issuePenalty.excessIssues).toBe(0);
		});
	});
});
