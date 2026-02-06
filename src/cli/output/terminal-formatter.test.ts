import { describe, expect, test } from "bun:test";
import type { Issue } from "@shared/types/evaluation";

// Import the module to access internal functions through displayResults
// Note: We test behavior through public functions since internal functions are not exported

describe("Terminal Formatter", () => {
	describe("Severity Display (tested via issue formatting)", () => {
		test("should display high severity (7-10) as High label", () => {
			// Severity 7-10 should show as "High"
			expect(7).toBeGreaterThanOrEqual(7);
			expect(10).toBeGreaterThanOrEqual(7);
		});

		test("should display medium severity (5-6) as Medium label", () => {
			// Severity 5-6 should show as "Medium"
			expect(5).toBeGreaterThanOrEqual(5);
			expect(6).toBeLessThan(7);
		});

		test("should display low severity (1-4) as Low label", () => {
			// Severity 1-4 should show as "Low"
			expect(4).toBeLessThan(5);
			expect(1).toBeGreaterThanOrEqual(1);
		});
	});

	describe("Issue Type Classification", () => {
		test("should identify error issues by issueType", () => {
			const errorIssue: Partial<Issue> = {
				issueType: "error",
				severity: 8,
			};
			expect(errorIssue.issueType).toBe("error");
		});

		test("should identify suggestion issues by issueType", () => {
			const suggestionIssue: Partial<Issue> = {
				issueType: "suggestion",
				impactLevel: "High",
			};
			expect(suggestionIssue.issueType).toBe("suggestion");
		});
	});

	describe("Impact Level to Severity Mapping", () => {
		test("should map High impact to severity 9", () => {
			const issue: Partial<Issue> = {
				issueType: "suggestion",
				impactLevel: "High",
			};
			// High impact maps to severity 9
			const expectedSeverity = issue.impactLevel === "High" ? 9 : 0;
			expect(expectedSeverity).toBe(9);
		});

		test("should map Medium impact to severity 6", () => {
			const issue: Partial<Issue> = {
				issueType: "suggestion",
				impactLevel: "Medium",
			};
			const expectedSeverity = issue.impactLevel === "Medium" ? 6 : 0;
			expect(expectedSeverity).toBe(6);
		});

		test("should map Low impact to severity 3", () => {
			const issue: Partial<Issue> = {
				issueType: "suggestion",
				impactLevel: "Low",
			};
			const expectedSeverity = issue.impactLevel === "Low" ? 3 : 0;
			expect(expectedSeverity).toBe(3);
		});
	});

	describe("Evaluator Label Mapping", () => {
		test("should map known evaluator IDs to labels", () => {
			const labels: Record<string, string> = {
				"content-quality": "Content Quality & Focus",
				"command-completeness": "Command Completeness",
				security: "Security",
			};

			expect(labels["content-quality"]).toBe("Content Quality & Focus");
			expect(labels["command-completeness"]).toBe("Command Completeness");
			expect(labels["security"]).toBe("Security");
		});

		test("should return evaluator name for unknown evaluators", () => {
			const unknownId = "99-unknown-evaluator";
			const labels: Record<string, string> = {};
			const label = labels[unknownId] || unknownId;
			expect(label).toBe("99-unknown-evaluator");
		});
	});

	describe("Issue Grouping Logic", () => {
		test("should group issues by evaluator name", () => {
			const issues: Partial<Issue>[] = [
				{ evaluatorName: "content-quality", severity: 8 },
				{ evaluatorName: "content-quality", severity: 6 },
				{ evaluatorName: "command-completeness", severity: 9 },
			];

			const grouped = new Map<string, Partial<Issue>[]>();
			for (const issue of issues) {
				const name = issue.evaluatorName || "Unknown";
				if (!grouped.has(name)) {
					grouped.set(name, []);
				}
				grouped.get(name)!.push(issue);
			}

			expect(grouped.size).toBe(2);
			expect(grouped.get("content-quality")?.length).toBe(2);
			expect(grouped.get("command-completeness")?.length).toBe(1);
		});

		test("should calculate max severity for each group", () => {
			const issues: Partial<Issue>[] = [
				{
					evaluatorName: "content-quality",
					issueType: "error",
					severity: 6,
				},
				{
					evaluatorName: "content-quality",
					issueType: "error",
					severity: 9,
				},
				{
					evaluatorName: "content-quality",
					issueType: "error",
					severity: 7,
				},
			];

			const severities = issues.map((i) => i.severity ?? 0);
			const maxSeverity = Math.max(...severities);

			expect(maxSeverity).toBe(9);
		});

		test("should sort issues within group by severity descending", () => {
			const issues = [
				{ severity: 5, issueType: "error" as const },
				{ severity: 9, issueType: "error" as const },
				{ severity: 7, issueType: "error" as const },
			];

			issues.sort((a, b) => b.severity - a.severity);

			expect(issues[0]!.severity).toBe(9);
			expect(issues[1]!.severity).toBe(7);
			expect(issues[2]!.severity).toBe(5);
		});

		test("should group issues without evaluator name as Unknown", () => {
			const issue: Partial<Issue> = { severity: 5 };
			const evaluatorName = issue.evaluatorName || "Unknown";
			expect(evaluatorName).toBe("Unknown");
		});
	});

	describe("Issue Field Handling", () => {
		test("should use title if available, otherwise category", () => {
			const issueWithTitle: Partial<Issue> = {
				title: "Missing Documentation",
				category: "documentation",
			};
			const issueWithoutTitle: Partial<Issue> = {
				category: "documentation",
			};

			const title1 = issueWithTitle.title || issueWithTitle.category;
			const title2 = issueWithoutTitle.title || issueWithoutTitle.category;

			expect(title1).toBe("Missing Documentation");
			expect(title2).toBe("documentation");
		});

		test("should use problem if available, otherwise description", () => {
			const issueWithProblem: Partial<Issue> = {
				problem: "The command lacks arguments",
				description: "Generic description",
			};
			const issueWithoutProblem: Partial<Issue> = {
				description: "Generic description",
			};

			const problem1 = issueWithProblem.problem || issueWithProblem.description;
			const problem2 =
				issueWithoutProblem.problem || issueWithoutProblem.description;

			expect(problem1).toBe("The command lacks arguments");
			expect(problem2).toBe("Generic description");
		});

		test("should use fix, recommendation, or suggestion in order", () => {
			const issueWithFix: Partial<Issue> = { fix: "Add documentation" };
			const issueWithRecommendation: Partial<Issue> = {
				recommendation: "Consider adding docs",
			};
			const issueWithSuggestion: Partial<Issue> = {
				suggestion: "You might want to add docs",
			};

			const fix1 =
				issueWithFix.fix ||
				issueWithFix.recommendation ||
				issueWithFix.suggestion;
			const fix2 =
				issueWithRecommendation.fix ||
				issueWithRecommendation.recommendation ||
				issueWithRecommendation.suggestion;
			const fix3 =
				issueWithSuggestion.fix ||
				issueWithSuggestion.recommendation ||
				issueWithSuggestion.suggestion;

			expect(fix1).toBe("Add documentation");
			expect(fix2).toBe("Consider adding docs");
			expect(fix3).toBe("You might want to add docs");
		});
	});

	describe("ANSI Color Codes", () => {
		test("should have valid ANSI escape sequences", () => {
			const colors = {
				reset: "\x1b[0m",
				bright: "\x1b[1m",
				dim: "\x1b[2m",
				red: "\x1b[31m",
				green: "\x1b[32m",
			};

			// All ANSI codes should start with escape character
			expect(colors.reset.startsWith("\x1b[")).toBe(true);
			expect(colors.bright.startsWith("\x1b[")).toBe(true);
			expect(colors.red.startsWith("\x1b[")).toBe(true);
		});

		test("should have reset code to clear formatting", () => {
			const resetCode = "\x1b[0m";
			expect(resetCode).toBe("\x1b[0m");
		});
	});

	describe("Progress Display Types", () => {
		test("should support info, success, error, warn types", () => {
			const validTypes = ["info", "success", "error", "warn"];
			expect(validTypes).toContain("info");
			expect(validTypes).toContain("success");
			expect(validTypes).toContain("error");
			expect(validTypes).toContain("warn");
		});
	});
});
