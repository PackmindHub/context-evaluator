import { describe, expect, test } from "bun:test";
import { GitHubCopilotProvider } from "./github-copilot-provider";
import { providerRegistry } from "./registry";

describe("GitHubCopilotProvider", () => {
	const provider = new GitHubCopilotProvider();

	describe("Basic Properties", () => {
		test("should have correct name", () => {
			expect(provider.name).toBe("github-copilot");
		});

		test("should have correct display name", () => {
			expect(provider.displayName).toBe("GitHub Copilot");
		});
	});

	describe("Prompt Size Validation", () => {
		test("should reject prompts exceeding maximum argument size", async () => {
			// Create a prompt larger than 200KB
			const largePrompt = "x".repeat(201_000);

			await expect(provider.invoke(largePrompt)).rejects.toThrow(
				"Prompt too large for GitHub Copilot CLI argument",
			);
		});

		test("should include helpful guidance in size error message", async () => {
			const largePrompt = "x".repeat(201_000);

			await expect(provider.invoke(largePrompt)).rejects.toThrow(
				"Consider using --agent claude instead",
			);
		});
	});

	describe("Response Normalization", () => {
		test("should handle string response", () => {
			const normalized = provider["normalizeResponse"]("raw text response");
			expect(normalized.result).toBe("raw text response");
		});

		test("should handle object with result field", () => {
			const input = { result: "test response" };
			const normalized = provider["normalizeResponse"](input);
			expect(normalized.result).toBe("test response");
		});

		test("should stringify non-string, non-result objects", () => {
			const input = { key: "value", data: 123 };
			const normalized = provider["normalizeResponse"](input);
			expect(normalized.result).toBe(JSON.stringify(input));
		});

		test("should stringify array responses", () => {
			const input = [{ file: "test.md", section: "1.1", issue: "test issue" }];
			const normalized = provider["normalizeResponse"](input);
			expect(normalized.result).toBe(JSON.stringify(input));
		});
	});

	describe("Integration with Registry", () => {
		test("should be registered in provider registry", () => {
			const providers = providerRegistry.list();
			expect(providers).toContain("github-copilot");
		});

		test("should be retrievable from registry", () => {
			const registeredProvider = providerRegistry.get("github-copilot");
			expect(registeredProvider).toBeDefined();
			expect(registeredProvider.name).toBe("github-copilot");
		});

		test("should validate as valid provider name", () => {
			expect(providerRegistry.isValidProvider("github-copilot")).toBe(true);
		});
	});
});
