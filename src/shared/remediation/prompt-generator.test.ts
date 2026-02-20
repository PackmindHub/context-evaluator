import { describe, expect, test } from "bun:test";
import {
	buildErrorExecutionPrompt,
	buildErrorPlanPrompt,
	buildSuggestionExecutionPrompt,
	buildSuggestionPlanPrompt,
	generatePlanFirstPrompts,
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

		test("cursor target includes .cursor/rules/ path instructions", () => {
			const input: RemediationInput = {
				...baseInput,
				targetAgent: "cursor",
				suggestions: [makeSuggestion()],
			};

			const result = generateRemediationPrompts(input);

			expect(result.suggestionEnrichPrompt).toContain(
				"Cursor uses `.cursor/rules/`",
			);
			expect(result.suggestionEnrichPrompt).toContain(
				"### Standard (Cursor Rule)",
			);
			expect(result.suggestionEnrichPrompt).toContain(
				".cursor/rules/<standard-slug>.mdc",
			);
			expect(result.suggestionEnrichPrompt).toContain("alwaysApply: true");
			expect(result.suggestionEnrichPrompt).toContain("Auto-attached");
			expect(result.suggestionEnrichPrompt).toContain("Glob-scoped");
			expect(result.suggestionEnrichPrompt).toContain(
				".cursor/skills/<skill-name>/",
			);
		});

		test("suggestion prompt includes decision criteria for all targets", () => {
			for (const target of [
				"agents-md",
				"claude-code",
				"github-copilot",
				"cursor",
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
				cursor: "**Cursor**",
			};

			for (const [target, expectedName] of Object.entries(expectations)) {
				const input: RemediationInput = {
					...baseInput,
					targetAgent: target as
						| "agents-md"
						| "claude-code"
						| "github-copilot"
						| "cursor",
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
				cursor: ".cursor/rules/general.mdc",
			};

			for (const [target, expectedFile] of Object.entries(expectations)) {
				const input: RemediationInput = {
					...baseInput,
					targetAgent: target as
						| "agents-md"
						| "claude-code"
						| "github-copilot"
						| "cursor",
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

	describe("error prompt - target agent routing and output types", () => {
		test("error fix prompt includes target agent context", () => {
			const expectations: Record<
				string,
				{ displayName: string; description: string }
			> = {
				"agents-md": {
					displayName: "**AGENTS.md**",
					description: "AGENTS.md is a universal",
				},
				"claude-code": {
					displayName: "**Claude Code**",
					description: "Claude Code uses CLAUDE.md",
				},
				"github-copilot": {
					displayName: "**GitHub Copilot**",
					description: "GitHub Copilot uses",
				},
				cursor: {
					displayName: "**Cursor**",
					description: "Cursor uses `.cursor/rules/`",
				},
			};

			for (const [target, expected] of Object.entries(expectations)) {
				const input: RemediationInput = {
					...baseInput,
					targetAgent: target as
						| "agents-md"
						| "claude-code"
						| "github-copilot"
						| "cursor",
					errors: [makeError()],
				};

				const result = generateRemediationPrompts(input);

				expect(result.errorFixPrompt).toContain(
					`for the target: ${expected.displayName}`,
				);
				expect(result.errorFixPrompt).toContain(expected.description);
			}
		});

		test("error fix prompt includes output type instructions", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [makeError()],
			};

			const result = generateRemediationPrompts(input);

			expect(result.errorFixPrompt).toContain("### Output Types");
			expect(result.errorFixPrompt).toContain("### Decision Criteria");
			expect(result.errorFixPrompt).toContain("For each issue");
		});

		test("error fix prompt includes outputType in JSON example", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [makeError()],
			};

			const result = generateRemediationPrompts(input);

			expect(result.errorFixPrompt).toContain('"outputType"');
			expect(result.errorFixPrompt).toContain('"standard"');
			expect(result.errorFixPrompt).toContain('"generic"');
		});

		test("error fix prompt includes output type guidance for errors", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [makeError()],
			};

			const result = generateRemediationPrompts(input);

			expect(result.errorFixPrompt).toContain(
				"**Choosing the right type for error fixes:**",
			);
			expect(result.errorFixPrompt).toContain(
				"Use the evaluator category in each issue header as a signal:",
			);
			expect(result.errorFixPrompt).toContain(
				"**Note:** The **Fix** text for each issue was generated without knowledge of standards or skills",
			);
		});

		test("error fix prompt includes annotated directory tree guidance for project-structure issues", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [makeError()],
			};

			const result = generateRemediationPrompts(input);

			expect(result.errorFixPrompt).toContain("`project-structure`");
			expect(result.errorFixPrompt).toContain(
				"annotated directory tree where each entry includes a brief description",
			);
			expect(result.errorFixPrompt).toContain(
				"Bare folder listings without descriptions have no value for AI agents",
			);
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

		test("error fix prompt includes consolidation guidance", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [makeError()],
			};

			const result = generateRemediationPrompts(input);

			expect(result.errorFixPrompt).toContain(
				"consolidate them into well-organized sections",
			);
		});
	});

	describe("colocatedPairs support", () => {
		const colocatedPairs = [
			{
				directory: ".",
				agentsPath: "AGENTS.md",
				claudePath: "CLAUDE.md",
			},
		];

		test("getGenericUpdateFile returns AGENTS.md when colocatedPairs exist (even for claude-code target)", () => {
			const input: RemediationInput = {
				...baseInput,
				targetAgent: "claude-code",
				contextFilePaths: ["AGENTS.md", "CLAUDE.md"],
				errors: [makeError()],
				colocatedPairs,
			};

			const result = generateRemediationPrompts(input);

			// Generic update should reference AGENTS.md, not CLAUDE.md
			expect(result.errorFixPrompt).toContain(
				"Generic Update** — A direct addition or edit to `AGENTS.md`",
			);
		});

		test("prompt includes consolidation notice when pairs exist", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [makeError()],
				colocatedPairs,
			};

			const result = generateRemediationPrompts(input);

			expect(result.errorFixPrompt).toContain("CRITICAL FILE RULE");
			expect(result.errorFixPrompt).toContain(
				"AGENTS.md is the ONLY source of truth",
			);
			expect(result.errorFixPrompt).toContain("Never add content to CLAUDE.md");
		});

		test("suggestion prompt includes consolidation notice", () => {
			const input: RemediationInput = {
				...baseInput,
				suggestions: [makeSuggestion()],
				colocatedPairs,
			};

			const result = generateRemediationPrompts(input);

			expect(result.suggestionEnrichPrompt).toContain("CRITICAL FILE RULE");
		});

		test("prompt excludes CLAUDE.md from context files list when pairs exist", () => {
			const input: RemediationInput = {
				...baseInput,
				contextFilePaths: ["AGENTS.md", "CLAUDE.md"],
				errors: [makeError()],
				colocatedPairs,
			};

			const result = generateRemediationPrompts(input);

			// Context Files section should list AGENTS.md but not CLAUDE.md
			expect(result.errorFixPrompt).toContain("- AGENTS.md");
			expect(result.errorFixPrompt).not.toContain("- CLAUDE.md");
		});

		test("prompt has no consolidation notice when no pairs", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [makeError()],
			};

			const result = generateRemediationPrompts(input);

			expect(result.errorFixPrompt).not.toContain("CRITICAL FILE RULE");
		});
	});
});

describe("plan-first prompts", () => {
	describe("buildErrorPlanPrompt", () => {
		test("returns empty string when no errors", () => {
			expect(buildErrorPlanPrompt(baseInput)).toBe("");
		});

		test("generates plan prompt with correct structure", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [
					makeError({ severity: 9 }),
					makeError({ severity: 7, category: "Security" }),
				],
			};

			const result = buildErrorPlanPrompt(input);

			expect(result).toContain("# Plan Error Fixes");
			expect(result).toContain("Do NOT make any file changes");
			expect(result).toContain("## Planning Instructions");
			expect(result).toContain("## Output Format");
			expect(result).toContain("## Task 1:");
			expect(result).toContain("Issues to Fix (2)");
		});

		test("includes issue blocks sorted by severity", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [
					makeError({ severity: 5, category: "Low" }),
					makeError({ severity: 10, category: "Critical" }),
				],
			};

			const result = buildErrorPlanPrompt(input);
			const criticalIdx = result.indexOf("Critical");
			const lowIdx = result.indexOf("Low");

			expect(criticalIdx).toBeLessThan(lowIdx);
		});

		test("includes output type instructions", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [makeError()],
			};

			const result = buildErrorPlanPrompt(input);

			expect(result).toContain("### Output Types");
			expect(result).toContain("### Decision Criteria");
		});

		test("includes minimal context block", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [makeError()],
			};

			const result = buildErrorPlanPrompt(input);

			expect(result).toContain("## Target: **AGENTS.md**");
			expect(result).toContain("- AGENTS.md");
			expect(result).toContain("Languages: TypeScript");
		});
	});

	describe("buildErrorExecutionPrompt", () => {
		test("returns empty string when no errors", () => {
			expect(buildErrorExecutionPrompt(baseInput, "some plan")).toBe("");
		});

		test("includes plan content and execution instructions", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [makeError()],
			};
			const plan =
				"## Task 1: Fix marketing language\n**Issues:** #1\n**Strategy:** Replace with technical content";

			const result = buildErrorExecutionPrompt(input, plan);

			expect(result).toContain("# Execute Error Fix Plan");
			expect(result).toContain("## Plan to Execute");
			expect(result).toContain("Fix marketing language");
			expect(result).toContain("## Execution Instructions");
			expect(result).toContain('"actions"');
		});

		test("does NOT include issue blocks (only plan)", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [makeError()],
			};
			const plan = "## Task 1: Fix it\n**Strategy:** Just fix it";

			const result = buildErrorExecutionPrompt(input, plan);

			expect(result).not.toContain("Issues to Fix");
			expect(result).not.toContain("**Severity**: 8/10");
		});
	});

	describe("buildSuggestionPlanPrompt", () => {
		test("returns empty string when no suggestions", () => {
			expect(buildSuggestionPlanPrompt(baseInput)).toBe("");
		});

		test("generates plan prompt with correct structure", () => {
			const input: RemediationInput = {
				...baseInput,
				suggestions: [makeSuggestion()],
			};

			const result = buildSuggestionPlanPrompt(input);

			expect(result).toContain("# Plan Documentation Enrichment");
			expect(result).toContain("Do NOT make any file changes");
			expect(result).toContain("Documentation Gaps (1)");
			expect(result).toContain("## Phantom File Remapping");
		});

		test("includes error fix summary when provided", () => {
			const input: RemediationInput = {
				...baseInput,
				suggestions: [makeSuggestion()],
			};
			const summary =
				"- Fixed marketing language in AGENTS.md\n- Created git-conventions standard";

			const result = buildSuggestionPlanPrompt(input, summary);

			expect(result).toContain("## Recent Error Fixes");
			expect(result).toContain("Fixed marketing language");
			expect(result).toContain("Do NOT duplicate this work");
		});

		test("omits error fix section when no summary provided", () => {
			const input: RemediationInput = {
				...baseInput,
				suggestions: [makeSuggestion()],
			};

			const result = buildSuggestionPlanPrompt(input);

			expect(result).not.toContain("## Recent Error Fixes");
		});
	});

	describe("buildSuggestionExecutionPrompt", () => {
		test("returns empty string when no suggestions", () => {
			expect(buildSuggestionExecutionPrompt(baseInput, "some plan")).toBe("");
		});

		test("includes plan content and execution instructions", () => {
			const input: RemediationInput = {
				...baseInput,
				suggestions: [makeSuggestion()],
			};
			const plan =
				"## Task 1: Add testing docs\n**Gaps:** #1\n**Strategy:** Document Jest patterns";

			const result = buildSuggestionExecutionPrompt(input, plan);

			expect(result).toContain("# Execute Documentation Enrichment Plan");
			expect(result).toContain("## Plan to Execute");
			expect(result).toContain("Add testing docs");
			expect(result).toContain("## Phantom File Remapping");
			expect(result).toContain('"actions"');
		});
	});

	describe("generatePlanFirstPrompts", () => {
		test("returns all prompts when both errors and suggestions present", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [makeError()],
				suggestions: [makeSuggestion()],
			};

			const result = generatePlanFirstPrompts(input);

			expect(result.errorPlanPrompt).toContain("# Plan Error Fixes");
			expect(result.suggestionPlanPrompt).toContain(
				"# Plan Documentation Enrichment",
			);
			expect(result.errorExecutionPrompt).toBe("");
			expect(result.suggestionExecutionPrompt).toBe("");
			expect(result.errorCount).toBe(1);
			expect(result.suggestionCount).toBe(1);
		});

		test("returns execution prompts when plans provided", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [makeError()],
				suggestions: [makeSuggestion()],
			};
			const plans = {
				errorPlan: "## Task 1: Fix errors",
				suggestionPlan: "## Task 1: Add docs",
			};

			const result = generatePlanFirstPrompts(input, plans);

			expect(result.errorExecutionPrompt).toContain("# Execute Error Fix Plan");
			expect(result.errorExecutionPrompt).toContain("Fix errors");
			expect(result.suggestionExecutionPrompt).toContain(
				"# Execute Documentation Enrichment Plan",
			);
			expect(result.suggestionExecutionPrompt).toContain("Add docs");
		});

		test("passes error fix summary to suggestion plan", () => {
			const input: RemediationInput = {
				...baseInput,
				suggestions: [makeSuggestion()],
			};
			const summary = "- Fixed issue in AGENTS.md";

			const result = generatePlanFirstPrompts(input, undefined, summary);

			expect(result.suggestionPlanPrompt).toContain("## Recent Error Fixes");
			expect(result.suggestionPlanPrompt).toContain("Fixed issue in AGENTS.md");
		});

		test("handles errors-only case", () => {
			const input: RemediationInput = {
				...baseInput,
				errors: [makeError()],
			};

			const result = generatePlanFirstPrompts(input);

			expect(result.errorPlanPrompt).toContain("# Plan Error Fixes");
			expect(result.suggestionPlanPrompt).toBe("");
			expect(result.suggestionExecutionPrompt).toBe("");
		});

		test("handles suggestions-only case", () => {
			const input: RemediationInput = {
				...baseInput,
				suggestions: [makeSuggestion()],
			};

			const result = generatePlanFirstPrompts(input);

			expect(result.errorPlanPrompt).toBe("");
			expect(result.errorExecutionPrompt).toBe("");
			expect(result.suggestionPlanPrompt).toContain(
				"# Plan Documentation Enrichment",
			);
		});
	});
});
