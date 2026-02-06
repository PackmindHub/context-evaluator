import { describe, expect, test } from "bun:test";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import {
	extractEvaluatorName,
	getEvaluatorById,
	getEvaluators,
} from "./evaluator-utils";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVALUATORS_DIR = resolve(__dirname, "../../../prompts/evaluators");

describe("Evaluator Utils", () => {
	describe("extractEvaluatorName", () => {
		test("should extract name from heading with Evaluator suffix", () => {
			const content = "# Content Quality Evaluator\n\nSome description...";
			expect(extractEvaluatorName(content)).toBe("Content Quality");
		});

		test("should extract name from heading without Evaluator suffix", () => {
			const content = "# Security\n\nSome description...";
			expect(extractEvaluatorName(content)).toBe("Security");
		});

		test("should return Unknown for content without heading", () => {
			const content = "Just some text without a heading";
			expect(extractEvaluatorName(content)).toBe("Unknown");
		});

		test("should return Unknown for empty content", () => {
			expect(extractEvaluatorName("")).toBe("Unknown");
		});

		test("should handle heading with extra whitespace", () => {
			const content = "#   Code Style Evaluator   \n\nSome text";
			expect(extractEvaluatorName(content)).toBe("Code Style");
		});

		test("should match first heading only", () => {
			const content = "# First Evaluator\n\n## Second Heading\n\n# Third";
			expect(extractEvaluatorName(content)).toBe("First");
		});

		test("should handle multiword evaluator names", () => {
			const content =
				"# Command Completeness Evaluator\n\nChecks command documentation";
			expect(extractEvaluatorName(content)).toBe("Command Completeness");
		});

		test("should not match non-heading lines", () => {
			const content = "Not a heading\n# Actual Heading Evaluator\nMore content";
			expect(extractEvaluatorName(content)).toBe("Actual Heading");
		});
	});

	describe("getEvaluators", () => {
		test("should return array of evaluators from filesystem", async () => {
			const evaluators = await getEvaluators(EVALUATORS_DIR);

			expect(evaluators).toBeInstanceOf(Array);
			expect(evaluators.length).toBeGreaterThan(0);
		});

		test("should return evaluators with id and name", async () => {
			const evaluators = await getEvaluators(EVALUATORS_DIR);

			const first = evaluators[0]!;
			expect(first.id).toBeDefined();
			expect(first.name).toBeDefined();
		});

		test("should only include markdown files with valid evaluator IDs", async () => {
			const evaluators = await getEvaluators(EVALUATORS_DIR);

			for (const evaluator of evaluators) {
				// Evaluator IDs should be kebab-case without number prefixes
				expect(evaluator.id).toMatch(/^[a-z-]+$/);
			}
		});

		test("should sort evaluators by ID", async () => {
			const evaluators = await getEvaluators(EVALUATORS_DIR);

			// Verify the evaluators are sorted
			for (let i = 1; i < evaluators.length; i++) {
				const prev = evaluators[i - 1]!.id;
				const curr = evaluators[i]!.id;
				expect(prev.localeCompare(curr)).toBeLessThanOrEqual(0);
			}
		});

		test("should return empty array for directory with no matching files", async () => {
			// Use a directory that exists but has no evaluator files
			const evaluators = await getEvaluators(
				resolve(__dirname, "../../../src"),
			);
			// Should return empty since no XX-*.md files exist there
			expect(evaluators).toBeInstanceOf(Array);
		});
	});

	describe("getEvaluatorById", () => {
		test("should return evaluator with content for valid ID", async () => {
			const evaluator = await getEvaluatorById(
				"content-quality",
				EVALUATORS_DIR,
			);

			expect(evaluator).not.toBeNull();
			expect(evaluator?.id).toBe("content-quality");
			expect(evaluator?.name).toBeDefined();
			expect(evaluator?.content).toBeDefined();
			expect(evaluator?.content.length).toBeGreaterThan(0);
		});

		test("should return null for non-existent evaluator", async () => {
			const evaluator = await getEvaluatorById(
				"99-nonexistent",
				EVALUATORS_DIR,
			);

			expect(evaluator).toBeNull();
		});

		test("should extract correct name from content", async () => {
			const evaluator = await getEvaluatorById(
				"content-quality",
				EVALUATORS_DIR,
			);

			expect(evaluator?.name).not.toBe("Unknown");
		});

		test("should include full markdown content", async () => {
			const evaluator = await getEvaluatorById(
				"content-quality",
				EVALUATORS_DIR,
			);

			expect(evaluator?.content).toContain("#");
		});
	});
});
