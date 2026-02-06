import { describe, expect, it } from "bun:test";
import {
	buildMultiFilePrompt,
	buildSingleFilePrompt,
	type FileContext,
	isEmptyContent,
} from "./prompt-builder";

describe("prompt-builder", () => {
	describe("Multi-file content presentation", () => {
		const mockEvaluatorPrompt = "# Test Evaluator\nTest prompt content";
		const mockEvaluatorName = "test";

		it("should add prominent file separators", async () => {
			const files: FileContext[] = [
				{
					filePath: "/test/AGENTS.md",
					relativePath: "AGENTS.md",
					content: "Root content",
				},
				{
					filePath: "/test/frontend/AGENTS.md",
					relativePath: "frontend/AGENTS.md",
					content: "Frontend content",
				},
			];

			const prompt = await buildMultiFilePrompt(
				mockEvaluatorPrompt,
				files,
				undefined,
				mockEvaluatorName,
			);

			// Check for prominent separators (80 equal signs)
			const separator = "=".repeat(80);
			expect(prompt).toContain(separator);

			// Check for file headers
			expect(prompt).toContain("FILE 1: AGENTS.md");
			expect(prompt).toContain("FILE 2: frontend/AGENTS.md");

			// Check for file footers
			expect(prompt).toContain("END OF FILE 1: AGENTS.md");
			expect(prompt).toContain("END OF FILE 2: frontend/AGENTS.md");
		});

		it("should add periodic file reminders for long files", async () => {
			// Create a file with 100 lines
			const longContent = Array(100).fill("line content").join("\n");

			const files: FileContext[] = [
				{
					filePath: "/test/AGENTS.md",
					relativePath: "AGENTS.md",
					content: longContent,
				},
			];

			const prompt = await buildMultiFilePrompt(
				mockEvaluatorPrompt,
				files,
				undefined,
				mockEvaluatorName,
			);

			// Check for reminder at line 50
			expect(prompt).toContain("--- Still in file: AGENTS.md ---");

			// Count how many reminders appear (should be at line 50 only for 100 lines)
			const reminderCount = (prompt.match(/--- Still in file:/g) || []).length;
			expect(reminderCount).toBe(1);
		});

		it("should include file path in end separator", async () => {
			const files: FileContext[] = [
				{
					filePath: "/test/frontend/AGENTS.md",
					relativePath: "frontend/AGENTS.md",
					content: "content",
				},
			];

			const prompt = await buildMultiFilePrompt(
				mockEvaluatorPrompt,
				files,
				undefined,
				mockEvaluatorName,
			);

			expect(prompt).toContain("END OF FILE 1: frontend/AGENTS.md");
		});

		it("should handle empty files in multi-file context", async () => {
			const files: FileContext[] = [
				{
					filePath: "/test/AGENTS.md",
					relativePath: "AGENTS.md",
					content: "Root content",
				},
				{
					filePath: "/test/empty/AGENTS.md",
					relativePath: "empty/AGENTS.md",
					content: "",
				},
			];

			const prompt = await buildMultiFilePrompt(
				mockEvaluatorPrompt,
				files,
				undefined,
				mockEvaluatorName,
			);

			expect(prompt).toContain("FILE 1: AGENTS.md");
			expect(prompt).toContain("FILE 2: empty/AGENTS.md");
			expect(prompt).toContain("*File does not exist or is empty*");
		});

		it("should add multiple reminders for very long files", async () => {
			// Create a file with 150 lines (should have reminders at 50 and 100)
			const veryLongContent = Array(150).fill("line content").join("\n");

			const files: FileContext[] = [
				{
					filePath: "/test/AGENTS.md",
					relativePath: "AGENTS.md",
					content: veryLongContent,
				},
			];

			const prompt = await buildMultiFilePrompt(
				mockEvaluatorPrompt,
				files,
				undefined,
				mockEvaluatorName,
			);

			// Should have reminders at lines 50 and 100
			const reminderCount = (prompt.match(/--- Still in file:/g) || []).length;
			expect(reminderCount).toBe(2);
		});

		it("should format file blocks with proper line numbers", async () => {
			const files: FileContext[] = [
				{
					filePath: "/test/AGENTS.md",
					relativePath: "AGENTS.md",
					content: "Line 1\nLine 2\nLine 3",
				},
			];

			const prompt = await buildMultiFilePrompt(
				mockEvaluatorPrompt,
				files,
				undefined,
				mockEvaluatorName,
			);

			// Check that line numbers are present
			expect(prompt).toContain("1 | Line 1");
			expect(prompt).toContain("2 | Line 2");
			expect(prompt).toContain("3 | Line 3");
		});
	});

	describe("JSON output reminder", () => {
		const mockEvaluatorPrompt = "# Test Evaluator\nTest prompt content";
		const mockEvaluatorName = "test";
		const jsonReminder =
			"REMINDER: Your ENTIRE response must be ONLY a valid JSON array";

		it("should append reminder at end of single-file prompt", async () => {
			const prompt = await buildSingleFilePrompt(
				mockEvaluatorPrompt,
				"# Some AGENTS.md content",
				undefined,
				mockEvaluatorName,
			);

			expect(prompt).toContain(jsonReminder);
			// Verify it's at the very end
			expect(prompt.indexOf(jsonReminder)).toBeGreaterThan(prompt.length - 200);
		});

		it("should append reminder at end of multi-file prompt", async () => {
			const files: FileContext[] = [
				{
					filePath: "/test/AGENTS.md",
					relativePath: "AGENTS.md",
					content: "Root content",
				},
			];

			const prompt = await buildMultiFilePrompt(
				mockEvaluatorPrompt,
				files,
				undefined,
				mockEvaluatorName,
			);

			expect(prompt).toContain(jsonReminder);
			expect(prompt.indexOf(jsonReminder)).toBeGreaterThan(prompt.length - 200);
		});

		it("should append reminder for empty content prompts", async () => {
			const prompt = await buildSingleFilePrompt(
				mockEvaluatorPrompt,
				"",
				undefined,
				mockEvaluatorName,
			);

			expect(prompt).toContain(jsonReminder);
			expect(prompt.indexOf(jsonReminder)).toBeGreaterThan(prompt.length - 200);
		});
	});

	describe("isEmptyContent", () => {
		it("should detect empty strings", () => {
			expect(isEmptyContent("")).toBe(true);
			expect(isEmptyContent("   ")).toBe(true);
			expect(isEmptyContent("\n\n")).toBe(true);
		});

		it("should detect non-empty content", () => {
			expect(isEmptyContent("content")).toBe(false);
			expect(isEmptyContent("  content  ")).toBe(false);
		});

		it("should handle null and undefined", () => {
			expect(isEmptyContent(null)).toBe(true);
			expect(isEmptyContent(undefined)).toBe(true);
		});
	});
});
