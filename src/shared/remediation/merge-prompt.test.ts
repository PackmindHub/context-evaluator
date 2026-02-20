import { describe, expect, test } from "bun:test";
import { buildMergePrompt } from "./merge-prompt";

describe("buildMergePrompt", () => {
	test("includes both file contents in the prompt", () => {
		const prompt = buildMergePrompt(
			"# AGENTS.md content here",
			"# CLAUDE.md content here",
		);

		expect(prompt).toContain("# AGENTS.md content here");
		expect(prompt).toContain("# CLAUDE.md content here");
	});

	test("contains merge rules about deduplication", () => {
		const prompt = buildMergePrompt("agents", "claude");

		expect(prompt).toContain("Never duplicate information");
		expect(prompt).toContain("AGENTS.md");
		expect(prompt).toContain("CLAUDE.md");
	});

	test("instructs to use AGENTS.md as base skeleton", () => {
		const prompt = buildMergePrompt("agents", "claude");

		expect(prompt).toContain("base skeleton");
	});

	test("instructs raw output with no code fences", () => {
		const prompt = buildMergePrompt("agents", "claude");

		expect(prompt).toContain("no code fences");
	});
});
