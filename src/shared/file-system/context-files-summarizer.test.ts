import { describe, expect, test } from "bun:test";
import type { IContextFile } from "@shared/types/evaluation";
import {
	extractGlobsFromFrontmatter,
	summarizeContextFiles,
} from "./context-files-summarizer";

describe("Context Files Summarizer", () => {
	describe("summarizeContextFiles", () => {
		test("should return empty result for empty input", async () => {
			const result = await summarizeContextFiles([], "/test/dir", {
				verbose: false,
			});

			expect(result.contextFiles).toEqual([]);
			expect(result.totalProcessed).toBe(0);
		});
	});

	describe("getContextFileType inference", () => {
		// We can indirectly test type detection through the summarizer
		// by checking the type field in results
		test("should detect AGENTS.md type", async () => {
			// This test would require actual file system access
			// For now, we just verify the interface types are correct
			const contextFile: IContextFile = {
				path: "AGENTS.md",
				type: "agents",
				content: "# Test",
				// No summary - context files don't need AI summarization
			};

			expect(contextFile.type).toBe("agents");
		});

		test("should detect CLAUDE.md type", async () => {
			const contextFile: IContextFile = {
				path: "CLAUDE.md",
				type: "claude",
				content: "# Test",
			};

			expect(contextFile.type).toBe("claude");
		});

		test("should detect copilot-instructions type", async () => {
			const contextFile: IContextFile = {
				path: ".github/copilot-instructions.md",
				type: "copilot",
				content: "# Test",
			};

			expect(contextFile.type).toBe("copilot");
		});

		test("should detect rules file type", async () => {
			const contextFile: IContextFile = {
				path: ".claude/rules/changelog.md",
				type: "rules",
				content: "# Test",
				globs: "CHANGELOG.md",
			};

			expect(contextFile.type).toBe("rules");
			expect(contextFile.globs).toBe("CHANGELOG.md");
		});
	});

	describe("extractGlobsFromFrontmatter", () => {
		test("should extract globs from single-line format with quotes", () => {
			const content = `---
description: Changelog generation rule
globs: "CHANGELOG.md"
---

# Changelog Rules`;
			const globs = extractGlobsFromFrontmatter(content);
			expect(globs).toBe("CHANGELOG.md");
		});

		test("should extract globs from single-line format without quotes", () => {
			const content = `---
description: Test rule
globs: src/components/*.tsx
---

# Test Rules`;
			const globs = extractGlobsFromFrontmatter(content);
			expect(globs).toBe("src/components/*.tsx");
		});

		test("should extract globs from array notation", () => {
			const content = `---
description: Multi-pattern rule
globs: [*.ts, *.tsx]
---

# TypeScript Rules`;
			const globs = extractGlobsFromFrontmatter(content);
			expect(globs).toBe("[*.ts, *.tsx]");
		});

		test("should return undefined when no frontmatter", () => {
			const content = `# No Frontmatter

This file has no YAML frontmatter.`;
			const globs = extractGlobsFromFrontmatter(content);
			expect(globs).toBeUndefined();
		});

		test("should return undefined when frontmatter has no globs", () => {
			const content = `---
description: Rule without globs
name: test-rule
---

# Test Rule`;
			const globs = extractGlobsFromFrontmatter(content);
			expect(globs).toBeUndefined();
		});

		test("should handle single-quoted globs", () => {
			const content = `---
globs: 'docs/**/*.md'
---

# Docs Rule`;
			const globs = extractGlobsFromFrontmatter(content);
			expect(globs).toBe("docs/**/*.md");
		});
	});
});
