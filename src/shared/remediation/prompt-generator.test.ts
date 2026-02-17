import { describe, expect, test } from "bun:test";
import {
	generateRemediationPrompts,
	type RemediationInput,
	type RemediationIssue,
} from "./prompt-generator";

function makeError(
	overrides: Partial<RemediationIssue> = {},
): RemediationIssue {
	return {
		evaluatorName: "content-quality",
		category: "Content Quality",
		problem: "Contains marketing language",
		severity: 8,
		location: { file: "AGENTS.md", start: 10, end: 15 },
		snippet: "Welcome to our amazing project!",
		fix: "Replace with technical instructions",
		...overrides,
	};
}

function makeSuggestion(
	overrides: Partial<RemediationIssue> = {},
): RemediationIssue {
	return {
		evaluatorName: "context-gaps",
		category: "Context Gaps",
		description: "Missing testing framework documentation",
		impactLevel: "High",
		location: { file: "AGENTS.md", start: 0, end: 0 },
		recommendation: "Document Jest testing patterns",
		...overrides,
	};
}

const baseInput: RemediationInput = {
	targetAgent: "agents-md",
	contextFilePaths: ["AGENTS.md", "packages/api/AGENTS.md"],
	errors: [],
	suggestions: [],
	technicalInventorySection:
		"**Dependencies:** react, express\n**Scripts:** test, build",
	projectSummary: {
		languages: "TypeScript",
		frameworks: "React, Express",
		architecture: "Monorepo",
	},
};

describe("prompt-generator", () => {
	describe("generateRemediationPrompts", () => {
		test("returns empty prompts when no issues", () => {
			const result = generateRemediationPrompts(baseInput);

			expect(result.errorFixPrompt).toBe("");
			expect(result.suggestionEnrichPrompt).toBe("");
			expect(result.errorCount).toBe(0);
			expect(result.suggestionCount).toBe(0);
		});

		test("generates error fix prompt with correct structure", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [
					makeError({ severity: 9 }),
					makeError({ severity: 7, category: "Security" }),
				],
			};

			const result = generateRemediationPrompts(input);

			expect(result.errorCount).toBe(2);
			expect(result.errorFixPrompt).toContain("# Fix Documentation Issues");
			expect(result.errorFixPrompt).toContain("AGENTS.md");
			expect(result.errorFixPrompt).toContain("packages/api/AGENTS.md");
			expect(result.errorFixPrompt).toContain("Dependencies:** react, express");
			expect(result.errorFixPrompt).toContain("Languages: TypeScript");
			expect(result.errorFixPrompt).toContain("Issues to Fix (2)");
		});

		test("error fix prompt is target-agnostic", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [makeError()],
			};

			const result = generateRemediationPrompts(input);

			expect(result.errorFixPrompt).toContain(
				"AI agent documentation files listed below",
			);
			expect(result.errorFixPrompt).not.toContain("AGENTS.md files");
			expect(result.errorFixPrompt).not.toContain("CLAUDE.md files");
		});

		test("sorts errors by severity descending", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [
					makeError({ severity: 6, category: "Low" }),
					makeError({ severity: 10, category: "Critical" }),
					makeError({ severity: 8, category: "High" }),
				],
			};

			const result = generateRemediationPrompts(input);
			const criticalIdx = result.errorFixPrompt.indexOf("Critical");
			const highIdx = result.errorFixPrompt.indexOf("High");
			const lowIdx = result.errorFixPrompt.indexOf("Low");

			expect(criticalIdx).toBeLessThan(highIdx);
			expect(highIdx).toBeLessThan(lowIdx);
		});

		test("generates suggestion enrich prompt with correct structure", () => {
			const input: RemediationInput = {
				...baseInput,
				suggestions: [makeSuggestion()],
			};

			const result = generateRemediationPrompts(input);

			expect(result.suggestionCount).toBe(1);
			expect(result.suggestionEnrichPrompt).toContain("# Enrich Documentation");
			expect(result.suggestionEnrichPrompt).toContain("Documentation Gaps (1)");
			expect(result.suggestionEnrichPrompt).toContain("Impact**: High");
		});

		test("sorts suggestions by impact level", () => {
			const input: RemediationInput = {
				...baseInput,
				suggestions: [
					makeSuggestion({ impactLevel: "Low", category: "Low" }),
					makeSuggestion({ impactLevel: "High", category: "High" }),
					makeSuggestion({ impactLevel: "Medium", category: "Medium" }),
				],
			};

			const result = generateRemediationPrompts(input);
			const highIdx =
				result.suggestionEnrichPrompt.indexOf("context-gaps: High");
			const medIdx = result.suggestionEnrichPrompt.indexOf(
				"context-gaps: Medium",
			);
			const lowIdx = result.suggestionEnrichPrompt.indexOf("context-gaps: Low");

			expect(highIdx).toBeLessThan(medIdx);
			expect(medIdx).toBeLessThan(lowIdx);
		});

		test("includes snippet in error prompt", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [
					makeError({
						snippet: "Some problematic content\nwith multiple lines",
					}),
				],
			};

			const result = generateRemediationPrompts(input);

			expect(result.errorFixPrompt).toContain("> Some problematic content");
			expect(result.errorFixPrompt).toContain("> with multiple lines");
		});

		test("handles missing optional fields", () => {
			const input: RemediationInput = {
				...baseInput,
				technicalInventorySection: "",
				projectSummary: {},
				errors: [
					{
						evaluatorName: "test",
						category: "Test",
						location: { start: 0, end: 0 },
					},
				],
			};

			const result = generateRemediationPrompts(input);

			expect(result.errorFixPrompt).toContain("Not identified");
			expect(result.errorFixPrompt).not.toContain("## Technical Context");
		});

		test("includes relevance-checking instruction in both prompts", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [makeError()],
				suggestions: [makeSuggestion()],
			};

			const result = generateRemediationPrompts(input);

			expect(result.errorFixPrompt).toContain("false positives");
			expect(result.errorFixPrompt).toContain("own judgment");
			expect(result.suggestionEnrichPrompt).toContain("false positives");
			expect(result.suggestionEnrichPrompt).toContain("own judgment");
		});

		test("generates both prompts simultaneously", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [makeError()],
				suggestions: [makeSuggestion()],
			};

			const result = generateRemediationPrompts(input);

			expect(result.errorCount).toBe(1);
			expect(result.suggestionCount).toBe(1);
			expect(result.errorFixPrompt).toContain("# Fix Documentation Issues");
			expect(result.suggestionEnrichPrompt).toContain("# Enrich Documentation");
		});

		test("phantom file suggestion shows create action instead of file lines", () => {
			const input: RemediationInput = {
				...baseInput,
				suggestions: [
					makeSuggestion({
						isPhantomFile: true,
						location: {
							file: "packages/frontend/AGENTS.md",
							start: 1,
							end: 1,
						},
					}),
				],
			};

			const result = generateRemediationPrompts(input);

			expect(result.suggestionEnrichPrompt).toContain(
				"**Action**: Create new file at `packages/frontend/AGENTS.md`",
			);
			expect(result.suggestionEnrichPrompt).not.toContain("lines 1-1");
		});

		test("regular suggestion shows file and lines", () => {
			const input: RemediationInput = {
				...baseInput,
				suggestions: [
					makeSuggestion({
						location: { file: "AGENTS.md", start: 5, end: 20 },
					}),
				],
			};

			const result = generateRemediationPrompts(input);

			expect(result.suggestionEnrichPrompt).toContain(
				"**File**: AGENTS.md, lines 5-20",
			);
			expect(result.suggestionEnrichPrompt).not.toContain(
				"**Action**: Create new file at",
			);
		});

		test("mixed phantom and regular suggestions format correctly", () => {
			const input: RemediationInput = {
				...baseInput,
				suggestions: [
					makeSuggestion({
						impactLevel: "High",
						category: "Regular Gap",
						location: { file: "AGENTS.md", start: 10, end: 25 },
					}),
					makeSuggestion({
						impactLevel: "Medium",
						category: "Phantom Gap",
						isPhantomFile: true,
						location: {
							file: "packages/api/AGENTS.md",
							start: 1,
							end: 1,
						},
					}),
				],
			};

			const result = generateRemediationPrompts(input);

			expect(result.suggestionEnrichPrompt).toContain(
				"**File**: AGENTS.md, lines 10-25",
			);
			expect(result.suggestionEnrichPrompt).toContain(
				"**Action**: Create new file at `packages/api/AGENTS.md`",
			);
		});
	});

	describe("suggestion prompt - target agent routing", () => {
		test("agents-md target includes AGENTS.md standard instructions", () => {
			const input: RemediationInput = {
				...baseInput,
				targetAgent: "agents-md",
				suggestions: [makeSuggestion()],
			};

			const result = generateRemediationPrompts(input);

			expect(result.suggestionEnrichPrompt).toContain(
				"AGENTS.md is a universal",
			);
			expect(result.suggestionEnrichPrompt).toContain(
				"### Standard (AGENTS.md)",
			);
			expect(result.suggestionEnrichPrompt).toContain(
				"Append a section specific to the coding standards",
			);
			expect(result.suggestionEnrichPrompt).toContain(
				".agents/skills/<skill-name>/",
			);
		});

		test("claude-code target includes .claude/rules/ path instructions", () => {
			const input: RemediationInput = {
				...baseInput,
				targetAgent: "claude-code",
				suggestions: [makeSuggestion()],
			};

			const result = generateRemediationPrompts(input);

			expect(result.suggestionEnrichPrompt).toContain(
				"Claude Code uses CLAUDE.md",
			);
			expect(result.suggestionEnrichPrompt).toContain(
				"### Standard (Claude Code Rule)",
			);
			expect(result.suggestionEnrichPrompt).toContain(
				".claude/rules/<standard-slug>.md",
			);
			expect(result.suggestionEnrichPrompt).toContain("paths:");
			expect(result.suggestionEnrichPrompt).toContain("alwaysApply: true");
			expect(result.suggestionEnrichPrompt).toContain(
				".claude/skills/<skill-name>/",
			);
		});

		test("github-copilot target includes .github/instructions/ for standards and .github/skills/ for skills", () => {
			const input: RemediationInput = {
				...baseInput,
				targetAgent: "github-copilot",
				suggestions: [makeSuggestion()],
			};

			const result = generateRemediationPrompts(input);

			expect(result.suggestionEnrichPrompt).toContain(
				"GitHub Copilot uses `.github/copilot-instructions.md`",
			);
			expect(result.suggestionEnrichPrompt).toContain(
				"### Standard (GitHub Copilot Instruction)",
			);
			expect(result.suggestionEnrichPrompt).toContain(
				".github/instructions/<standard-slug>.md",
			);
			expect(result.suggestionEnrichPrompt).toContain(
				".github/skills/<skill-name>/",
			);
		});

		test("suggestion prompt includes decision criteria for all targets", () => {
			for (const target of [
				"agents-md",
				"claude-code",
				"github-copilot",
			] as const) {
				const input: RemediationInput = {
					...baseInput,
					targetAgent: target,
					suggestions: [makeSuggestion()],
				};

				const result = generateRemediationPrompts(input);

				expect(result.suggestionEnrichPrompt).toContain(
					"### Decision Criteria",
				);
				expect(result.suggestionEnrichPrompt).toContain(
					"Must the agent always know this?",
				);
				expect(result.suggestionEnrichPrompt).toContain(
					"Is it a constraint or a capability?",
				);
				expect(result.suggestionEnrichPrompt).toContain(
					"Is it short and declarative?",
				);
			}
		});

		test("phantom file remapping instruction is present", () => {
			const input: RemediationInput = {
				...baseInput,
				suggestions: [makeSuggestion()],
			};

			const result = generateRemediationPrompts(input);

			expect(result.suggestionEnrichPrompt).toContain(
				"## Phantom File Remapping",
			);
			expect(result.suggestionEnrichPrompt).toContain(
				"Ignore evaluator-suggested paths",
			);
		});

		test("suggestion prompt includes outputType in JSON example", () => {
			const input: RemediationInput = {
				...baseInput,
				suggestions: [makeSuggestion()],
			};

			const result = generateRemediationPrompts(input);

			expect(result.suggestionEnrichPrompt).toContain('"outputType"');
			expect(result.suggestionEnrichPrompt).toContain('"standard"');
			expect(result.suggestionEnrichPrompt).toContain('"generic"');
		});

		test("role line uses clean display name per target agent", () => {
			const expectations: Record<string, string> = {
				"agents-md": "**AGENTS.md**",
				"claude-code": "**Claude Code**",
				"github-copilot": "**GitHub Copilot**",
			};

			for (const [target, expectedName] of Object.entries(expectations)) {
				const input: RemediationInput = {
					...baseInput,
					targetAgent: target as "agents-md" | "claude-code" | "github-copilot",
					suggestions: [makeSuggestion()],
				};

				const result = generateRemediationPrompts(input);

				expect(result.suggestionEnrichPrompt).toContain(
					`for the target: ${expectedName}`,
				);
				// Should NOT contain a sentence fragment from split(".")
				expect(result.suggestionEnrichPrompt).not.toMatch(
					/for the target: \*\*[^*]+uses [A-Z]/,
				);
			}
		});

		test("generic update references correct file per target agent", () => {
			const expectations: Record<string, string> = {
				"agents-md": "AGENTS.md",
				"claude-code": "CLAUDE.md",
				"github-copilot": ".github/copilot-instructions.md",
			};

			for (const [target, expectedFile] of Object.entries(expectations)) {
				const input: RemediationInput = {
					...baseInput,
					targetAgent: target as "agents-md" | "claude-code" | "github-copilot",
					suggestions: [makeSuggestion()],
				};

				const result = generateRemediationPrompts(input);

				expect(result.suggestionEnrichPrompt).toContain(`### Generic Update`);
				expect(result.suggestionEnrichPrompt).toContain(`\`${expectedFile}\``);
			}
		});
	});

	describe("Packmind boilerplate stripping", () => {
		test("strips 'You can use Packmind to achieve this.' from fix field", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [
					makeError({
						fix: "Add testing commands to the documentation. You can use Packmind to achieve this.",
					}),
				],
			};

			const result = generateRemediationPrompts(input);

			expect(result.errorFixPrompt).toContain(
				"Add testing commands to the documentation",
			);
			expect(result.errorFixPrompt).not.toContain("Packmind");
		});

		test("strips 'You can use Packmind to achieve this' from recommendation field", () => {
			const input: RemediationInput = {
				...baseInput,
				suggestions: [
					makeSuggestion({
						recommendation:
							"Document the testing patterns. You can use Packmind to achieve this.",
					}),
				],
			};

			const result = generateRemediationPrompts(input);

			expect(result.suggestionEnrichPrompt).toContain(
				"Document the testing patterns",
			);
			expect(result.suggestionEnrichPrompt).not.toContain("Packmind");
		});

		test("handles Packmind text without trailing period", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [
					makeError({
						fix: "Fix the issue. You can use Packmind to achieve this",
					}),
				],
			};

			const result = generateRemediationPrompts(input);

			expect(result.errorFixPrompt).toContain("Fix the issue");
			expect(result.errorFixPrompt).not.toContain("Packmind");
		});
	});

	describe("snippet deduplication", () => {
		test("deduplicates snippets appearing in 3+ suggestions", () => {
			const sharedSnippet = "# Project Setup\nRun npm install";
			const input: RemediationInput = {
				...baseInput,
				suggestions: [
					makeSuggestion({
						category: "Gap A",
						snippet: sharedSnippet,
						location: { file: "AGENTS.md", start: 1, end: 5 },
					}),
					makeSuggestion({
						category: "Gap B",
						snippet: sharedSnippet,
						location: { file: "AGENTS.md", start: 1, end: 5 },
					}),
					makeSuggestion({
						category: "Gap C",
						snippet: sharedSnippet,
						location: { file: "AGENTS.md", start: 1, end: 5 },
					}),
				],
			};

			const result = generateRemediationPrompts(input);

			// Referenced Content section should appear
			expect(result.suggestionEnrichPrompt).toContain("## Referenced Content");
			// Label [A] should be used
			expect(result.suggestionEnrichPrompt).toContain("**[A]**");
			// Issue blocks should reference the label
			expect(result.suggestionEnrichPrompt).toContain("See [A]");
			// The actual snippet text should appear only once (in Referenced Content)
			const snippetOccurrences =
				result.suggestionEnrichPrompt.split("# Project Setup").length - 1;
			expect(snippetOccurrences).toBe(1);
		});

		test("deduplicates snippets in error fix prompt", () => {
			const sharedSnippet = "Bad content here";
			const input: RemediationInput = {
				...baseInput,
				errors: [
					makeError({
						category: "Issue A",
						snippet: sharedSnippet,
						severity: 9,
					}),
					makeError({
						category: "Issue B",
						snippet: sharedSnippet,
						severity: 8,
					}),
				],
			};

			const result = generateRemediationPrompts(input);

			expect(result.errorFixPrompt).toContain("## Referenced Content");
			expect(result.errorFixPrompt).toContain("See [A]");
		});

		test("keeps snippets inline when all are unique", () => {
			const input: RemediationInput = {
				...baseInput,
				suggestions: [
					makeSuggestion({
						category: "Gap A",
						snippet: "Unique snippet 1",
						location: { file: "AGENTS.md", start: 1, end: 5 },
					}),
					makeSuggestion({
						category: "Gap B",
						snippet: "Unique snippet 2",
						location: { file: "AGENTS.md", start: 10, end: 15 },
					}),
					makeSuggestion({
						category: "Gap C",
						snippet: "Unique snippet 3",
						location: { file: "AGENTS.md", start: 20, end: 25 },
					}),
				],
			};

			const result = generateRemediationPrompts(input);

			// No Referenced Content section
			expect(result.suggestionEnrichPrompt).not.toContain(
				"## Referenced Content",
			);
			// Snippets appear inline
			expect(result.suggestionEnrichPrompt).toContain("> Unique snippet 1");
			expect(result.suggestionEnrichPrompt).toContain("> Unique snippet 2");
			expect(result.suggestionEnrichPrompt).toContain("> Unique snippet 3");
			// No "See [X]" references
			expect(result.suggestionEnrichPrompt).not.toContain("See [");
		});
	});

	describe("consolidation instruction", () => {
		test("suggestion prompt includes consolidation guidance", () => {
			const input: RemediationInput = {
				...baseInput,
				suggestions: [makeSuggestion()],
			};

			const result = generateRemediationPrompts(input);

			expect(result.suggestionEnrichPrompt).toContain(
				"consolidate them into well-organized sections",
			);
		});

		test("error fix prompt does not include consolidation guidance", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [makeError()],
			};

			const result = generateRemediationPrompts(input);

			expect(result.errorFixPrompt).not.toContain("consolidate");
		});
	});
});
