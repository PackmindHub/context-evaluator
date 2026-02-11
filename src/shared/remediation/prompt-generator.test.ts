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
	targetFileType: "AGENTS.md",
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

		test("handles CLAUDE.md target file type", () => {
			const input: RemediationInput = {
				...baseInput,
				targetFileType: "CLAUDE.md",
				errors: [makeError()],
				suggestions: [makeSuggestion()],
			};

			const result = generateRemediationPrompts(input);

			expect(result.errorFixPrompt).toContain("CLAUDE.md files");
			expect(result.suggestionEnrichPrompt).toContain("CLAUDE.md files");
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
	});
});
