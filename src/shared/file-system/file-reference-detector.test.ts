import { describe, expect, test } from "bun:test";
import {
	detectCrossReference,
	isFileReference,
} from "./file-reference-detector";

describe("File Reference Detector", () => {
	describe("isFileReference", () => {
		test("should detect @CLAUDE.md as reference", () => {
			const result = isFileReference("@CLAUDE.md");
			expect(result.isReference).toBe(true);
			expect(result.referencedFile).toBe("CLAUDE.md");
		});

		test("should detect @AGENTS.md as reference", () => {
			const result = isFileReference("@AGENTS.md");
			expect(result.isReference).toBe(true);
			expect(result.referencedFile).toBe("AGENTS.md");
		});

		test("should detect @./CLAUDE.md (relative path prefix)", () => {
			const result = isFileReference("@./CLAUDE.md");
			expect(result.isReference).toBe(true);
			expect(result.referencedFile).toBe("CLAUDE.md");
		});

		test("should detect @./AGENTS.md (relative path prefix)", () => {
			const result = isFileReference("@./AGENTS.md");
			expect(result.isReference).toBe(true);
			expect(result.referencedFile).toBe("AGENTS.md");
		});

		test("should detect with leading/trailing whitespace", () => {
			const result = isFileReference("  @CLAUDE.md  \n");
			expect(result.isReference).toBe(true);
			expect(result.referencedFile).toBe("CLAUDE.md");
		});

		test("should detect with trailing newlines", () => {
			const result = isFileReference("@AGENTS.md\n\n");
			expect(result.isReference).toBe(true);
			expect(result.referencedFile).toBe("AGENTS.md");
		});

		test("should detect case-insensitively", () => {
			const result = isFileReference("@claude.md");
			expect(result.isReference).toBe(true);
			expect(result.referencedFile).toBe("claude.md");
		});

		test("should NOT detect reference with additional text after", () => {
			const result = isFileReference("@CLAUDE.md\nSome extra content");
			expect(result.isReference).toBe(false);
			expect(result.referencedFile).toBeNull();
		});

		test("should NOT detect content before reference", () => {
			const result = isFileReference("# Title\n\n@CLAUDE.md");
			expect(result.isReference).toBe(false);
			expect(result.referencedFile).toBeNull();
		});

		test("should NOT detect unknown context file", () => {
			const result = isFileReference("@README.md");
			expect(result.isReference).toBe(false);
			expect(result.referencedFile).toBeNull();
		});

		test("should NOT detect empty content", () => {
			const result = isFileReference("");
			expect(result.isReference).toBe(false);
			expect(result.referencedFile).toBeNull();
		});

		test("should NOT detect whitespace-only content", () => {
			const result = isFileReference("   \n\n  ");
			expect(result.isReference).toBe(false);
			expect(result.referencedFile).toBeNull();
		});

		test("should NOT detect reference without .md extension", () => {
			const result = isFileReference("@CLAUDE");
			expect(result.isReference).toBe(false);
			expect(result.referencedFile).toBeNull();
		});

		test("should NOT detect parent path reference", () => {
			const result = isFileReference("@../CLAUDE.md");
			expect(result.isReference).toBe(false);
			expect(result.referencedFile).toBeNull();
		});

		test("should NOT detect subdirectory path reference", () => {
			const result = isFileReference("@subdir/CLAUDE.md");
			expect(result.isReference).toBe(false);
			expect(result.referencedFile).toBeNull();
		});
	});

	describe("detectCrossReference", () => {
		test("should detect AGENTS.md referencing CLAUDE.md", () => {
			const result = detectCrossReference(
				"@CLAUDE.md",
				"# Real CLAUDE.md content\n\nWith actual instructions.",
			);
			expect(result.hasReference).toBe(true);
			expect(result.referenceFile).toBe("agents");
			expect(result.contentFile).toBe("claude");
		});

		test("should detect CLAUDE.md referencing AGENTS.md", () => {
			const result = detectCrossReference(
				"# Real AGENTS.md content\n\nWith actual instructions.",
				"@AGENTS.md",
			);
			expect(result.hasReference).toBe(true);
			expect(result.referenceFile).toBe("claude");
			expect(result.contentFile).toBe("agents");
		});

		test("should return false when both have real content", () => {
			const result = detectCrossReference(
				"# Real AGENTS.md content",
				"# Real CLAUDE.md content",
			);
			expect(result.hasReference).toBe(false);
			expect(result.referenceFile).toBeNull();
			expect(result.contentFile).toBeNull();
		});

		test("should return false for AGENTS.md self-reference", () => {
			const result = detectCrossReference(
				"@AGENTS.md",
				"# Real CLAUDE.md content",
			);
			expect(result.hasReference).toBe(false);
			expect(result.referenceFile).toBeNull();
			expect(result.contentFile).toBeNull();
		});

		test("should return false for CLAUDE.md self-reference", () => {
			const result = detectCrossReference(
				"# Real AGENTS.md content",
				"@CLAUDE.md",
			);
			expect(result.hasReference).toBe(false);
			expect(result.referenceFile).toBeNull();
			expect(result.contentFile).toBeNull();
		});

		test("should handle both being references - AGENTS.md takes priority", () => {
			const result = detectCrossReference("@CLAUDE.md", "@AGENTS.md");
			expect(result.hasReference).toBe(true);
			expect(result.referenceFile).toBe("agents");
			expect(result.contentFile).toBe("claude");
		});
	});
});
