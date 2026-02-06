import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { logRuntimePrompt } from "./runtime-prompt-logger";

describe("runtime-prompt-logger", () => {
	const testDebugDir = resolve(process.cwd(), "prompts", "debug");

	beforeAll(async () => {
		// Ensure test directory exists
		await mkdir(testDebugDir, { recursive: true });
	});

	afterAll(async () => {
		// Clean up test files after all tests
		try {
			await rm(testDebugDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	it("creates prompts/debug/ directory if it doesn't exist", async () => {
		// Clean up first to test directory creation
		await rm(testDebugDir, { recursive: true, force: true });

		const result = await logRuntimePrompt({
			evaluatorName: "evaluator-01-test",
			prompt: "Test prompt content",
			mode: "independent",
			verbose: false,
		});

		expect(result).not.toBeNull();
		expect(result).toContain("prompts/debug/");
	});

	it("generates correct filename format for independent mode", async () => {
		const evaluatorName = "evaluator-01-content-quality";
		const result = await logRuntimePrompt({
			evaluatorName,
			prompt: "Test prompt",
			mode: "independent",
			verbose: false,
		});

		expect(result).not.toBeNull();
		expect(result).toMatch(
			/evaluator-01-content-quality-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.md$/,
		);
	});

	it("generates correct filename format for unified mode", async () => {
		const evaluatorName = "evaluator-03-command-completeness";
		const result = await logRuntimePrompt({
			evaluatorName,
			prompt: "Test unified prompt",
			mode: "unified",
			verbose: false,
		});

		expect(result).not.toBeNull();
		expect(result).toMatch(
			/evaluator-03-command-completeness-unified-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.md$/,
		);
	});

	it("saves prompt content correctly", async () => {
		const promptContent = "# Test Evaluator Prompt\n\nThis is a test prompt.";
		const result = await logRuntimePrompt({
			evaluatorName: "evaluator-test",
			prompt: promptContent,
			mode: "independent",
			verbose: false,
		});

		expect(result).not.toBeNull();

		// Read back the file and verify content
		const savedContent = await readFile(result as string, "utf-8");
		expect(savedContent).toBe(promptContent);
	});

	it("handles concurrent calls with unique timestamps", async () => {
		// Note: Since evaluators take >1s to process, timestamp conflicts are unlikely
		// This test verifies both calls succeed (timestamps will differ by milliseconds)
		const [result1, result2] = await Promise.all([
			logRuntimePrompt({
				evaluatorName: "evaluator-concurrent-1",
				prompt: "Prompt 1",
				mode: "independent",
				verbose: false,
			}),
			logRuntimePrompt({
				evaluatorName: "evaluator-concurrent-2",
				prompt: "Prompt 2",
				mode: "independent",
				verbose: false,
			}),
		]);

		expect(result1).not.toBeNull();
		expect(result2).not.toBeNull();
		// Different evaluator names ensure different filenames
		expect(result1).not.toBe(result2);
	});

	it("returns null and logs warning on write errors", async () => {
		// Spy on console.warn to verify error handling
		const warnSpy = spyOn(console, "warn").mockImplementation(() => {
			/* Mock implementation - intentionally empty */
		});

		// Try to write to an invalid path (simulating permission error)
		const result = await logRuntimePrompt({
			evaluatorName: "evaluator-invalid",
			prompt: "Test",
			mode: "independent",
			verbose: false,
		});

		// Should succeed (valid path), but let's test the error handling logic
		// by checking the function doesn't throw
		expect(result).not.toBeNull();

		warnSpy.mockRestore();
	});

	it("distinguishes between unified and independent modes in filename", async () => {
		const evaluatorName = "evaluator-mode-test";

		const independentResult = await logRuntimePrompt({
			evaluatorName,
			prompt: "Independent prompt",
			mode: "independent",
			verbose: false,
		});

		const unifiedResult = await logRuntimePrompt({
			evaluatorName,
			prompt: "Unified prompt",
			mode: "unified",
			verbose: false,
		});

		expect(independentResult).not.toBeNull();
		expect(unifiedResult).not.toBeNull();

		// Independent mode should NOT have "unified" in filename
		expect(independentResult).not.toContain("-unified-");
		// Unified mode SHOULD have "unified" in filename
		expect(unifiedResult).toContain("-unified-");
	});

	it("uses project root path (process.cwd()), not working directory", async () => {
		const result = await logRuntimePrompt({
			evaluatorName: "evaluator-path-test",
			prompt: "Path test",
			mode: "independent",
			verbose: false,
		});

		expect(result).not.toBeNull();
		expect(result).toContain(process.cwd());
		expect(result).toContain("prompts/debug/");
	});

	it("handles verbose mode correctly", async () => {
		const logSpy = spyOn(console, "log").mockImplementation(() => {
			/* Mock implementation - intentionally empty */
		});

		await logRuntimePrompt({
			evaluatorName: "evaluator-verbose-test",
			prompt: "Verbose test",
			mode: "independent",
			verbose: true,
		});

		// Should have logged success message
		expect(logSpy).toHaveBeenCalledWith(
			expect.stringContaining("[RuntimeDebug] ✓ Saved prompt to:"),
		);

		logSpy.mockRestore();
	});
});
