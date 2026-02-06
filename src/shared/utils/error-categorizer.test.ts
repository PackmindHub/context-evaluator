import { describe, expect, test } from "bun:test";
import {
	createStructuredError,
	determineErrorCategory,
} from "./error-categorizer";

describe("Error Categorizer", () => {
	describe("determineErrorCategory", () => {
		test("should categorize timeout errors", () => {
			expect(determineErrorCategory(new Error("Operation timeout"))).toBe(
				"timeout",
			);
			expect(
				determineErrorCategory(new Error("Request timed out after 30s")),
			).toBe("timeout");
			expect(determineErrorCategory("Connection timeout")).toBe("timeout");
		});

		test("should categorize parsing errors", () => {
			expect(determineErrorCategory(new Error("JSON parse error"))).toBe(
				"parsing",
			);
			expect(determineErrorCategory(new Error("Invalid JSON response"))).toBe(
				"parsing",
			);
			expect(determineErrorCategory("Failed to parse result")).toBe("parsing");
		});

		test("should categorize file system errors", () => {
			expect(determineErrorCategory(new Error("ENOENT: no such file"))).toBe(
				"file_system",
			);
			expect(
				determineErrorCategory(new Error("Failed to read configuration")),
			).toBe("file_system");
			expect(determineErrorCategory("Write permission denied")).toBe(
				"file_system",
			);
		});

		test("should categorize provider errors", () => {
			expect(determineErrorCategory(new Error("Claude API error"))).toBe(
				"provider",
			);
			expect(determineErrorCategory(new Error("Provider unavailable"))).toBe(
				"provider",
			);
			expect(determineErrorCategory("API rate limit exceeded")).toBe(
				"provider",
			);
		});

		test("should categorize repository errors", () => {
			expect(determineErrorCategory(new Error("Git clone failed"))).toBe(
				"repository",
			);
			expect(determineErrorCategory(new Error("Repository not found"))).toBe(
				"repository",
			);
			expect(determineErrorCategory("Failed to fetch repository")).toBe(
				"repository",
			);
		});

		test("should default to internal for unknown errors", () => {
			expect(determineErrorCategory(new Error("Something went wrong"))).toBe(
				"internal",
			);
			expect(determineErrorCategory("Unexpected error")).toBe("internal");
			expect(determineErrorCategory(null)).toBe("internal");
			expect(determineErrorCategory(undefined)).toBe("internal");
		});

		test("should be case insensitive", () => {
			expect(determineErrorCategory("TIMEOUT")).toBe("timeout");
			expect(determineErrorCategory("JSON PARSE ERROR")).toBe("parsing");
			expect(determineErrorCategory("FILE NOT FOUND")).toBe("file_system");
		});
	});

	describe("createStructuredError", () => {
		test("should create structured error from Error instance", () => {
			const error = new Error("Test error message");
			const structured = createStructuredError(error);

			expect(structured.message).toBe("Test error message");
			expect(structured.category).toBe("internal");
			expect(structured.severity).toBe("partial");
			expect(structured.timestamp).toBeInstanceOf(Date);
			expect(structured.technicalDetails).toContain("Test error message");
		});

		test("should create structured error from string", () => {
			const structured = createStructuredError("String error");

			expect(structured.message).toBe("String error");
			expect(structured.category).toBe("internal");
			expect(structured.technicalDetails).toBeUndefined();
		});

		test("should include context when provided", () => {
			const structured = createStructuredError(new Error("API timeout"), {
				evaluatorName: "content-quality",
				filePath: "/path/to/AGENTS.md",
				retryable: true,
				severity: "warning",
			});

			expect(structured.evaluatorName).toBe("content-quality");
			expect(structured.filePath).toBe("/path/to/AGENTS.md");
			expect(structured.retryable).toBe(true);
			expect(structured.severity).toBe("warning");
			expect(structured.category).toBe("timeout");
		});

		test("should use default values when context not provided", () => {
			const structured = createStructuredError(new Error("Test"));

			expect(structured.evaluatorName).toBeUndefined();
			expect(structured.filePath).toBeUndefined();
			expect(structured.retryable).toBe(false);
			expect(structured.severity).toBe("partial");
		});
	});
});
