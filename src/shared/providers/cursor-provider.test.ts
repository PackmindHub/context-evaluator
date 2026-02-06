import { describe, expect, test } from "bun:test";
import { CursorProvider } from "./cursor-provider";
import { providerRegistry } from "./registry";

describe("CursorProvider", () => {
	const provider = new CursorProvider();

	describe("Basic Properties", () => {
		test("should have correct name", () => {
			expect(provider.name).toBe("cursor");
		});

		test("should have correct display name", () => {
			expect(provider.displayName).toBe("Cursor Agent");
		});
	});

	describe("Response Normalization", () => {
		test("should normalize standard format with all fields", () => {
			const input = {
				result: "test response",
				session_id: "session-123",
				cost_usd: 0.001,
				duration_ms: 1500,
				usage: {
					input_tokens: 100,
					output_tokens: 50,
				},
			};

			const normalized = provider["normalizeResponse"](input);

			expect(normalized.result).toBe("test response");
			expect(normalized.session_id).toBe("session-123");
			expect(normalized.cost_usd).toBe(0.001);
			expect(normalized.duration_ms).toBe(1500);
			expect(normalized.usage).toEqual({
				input_tokens: 100,
				output_tokens: 50,
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 0,
			});
		});

		test("should handle alternative field name: output instead of result", () => {
			const input = {
				output: "test output",
			};

			const normalized = provider["normalizeResponse"](input);
			expect(normalized.result).toBe("test output");
		});

		test("should handle alternative field name: response instead of result", () => {
			const input = {
				response: "test response",
			};

			const normalized = provider["normalizeResponse"](input);
			expect(normalized.result).toBe("test response");
		});

		test("should handle alternative field name: content instead of result", () => {
			const input = {
				content: "test content",
			};

			const normalized = provider["normalizeResponse"](input);
			expect(normalized.result).toBe("test content");
		});

		test("should prefer result over other field names", () => {
			const input = {
				result: "preferred result",
				output: "alternative output",
				response: "alternative response",
			};

			const normalized = provider["normalizeResponse"](input);
			expect(normalized.result).toBe("preferred result");
		});

		test("should handle alternative session ID field: sessionId", () => {
			const input = {
				result: "test",
				sessionId: "session-456",
			};

			const normalized = provider["normalizeResponse"](input);
			expect(normalized.session_id).toBe("session-456");
		});

		test("should prefer session_id over sessionId", () => {
			const input = {
				result: "test",
				session_id: "preferred-session",
				sessionId: "alternative-session",
			};

			const normalized = provider["normalizeResponse"](input);
			expect(normalized.session_id).toBe("preferred-session");
		});

		test("should handle alternative cost field: cost instead of cost_usd", () => {
			const input = {
				result: "test",
				cost: 0.002,
			};

			const normalized = provider["normalizeResponse"](input);
			expect(normalized.cost_usd).toBe(0.002);
		});

		test("should handle alternative cost field: total_cost", () => {
			const input = {
				result: "test",
				total_cost: 0.003,
			};

			const normalized = provider["normalizeResponse"](input);
			expect(normalized.cost_usd).toBe(0.003);
		});

		test("should prefer cost_usd over other cost field names", () => {
			const input = {
				result: "test",
				cost_usd: 0.001,
				cost: 0.002,
				total_cost: 0.003,
			};

			const normalized = provider["normalizeResponse"](input);
			expect(normalized.cost_usd).toBe(0.001);
		});

		test("should handle alternative duration field: duration instead of duration_ms", () => {
			const input = {
				result: "test",
				duration: 2000,
			};

			const normalized = provider["normalizeResponse"](input);
			expect(normalized.duration_ms).toBe(2000);
		});

		test("should handle OpenAI-style token field names", () => {
			const input = {
				result: "test",
				usage: {
					prompt_tokens: 100,
					completion_tokens: 50,
				},
			};

			const normalized = provider["normalizeResponse"](input);
			expect(normalized.usage).toEqual({
				input_tokens: 100,
				output_tokens: 50,
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 0,
			});
		});

		test("should handle missing optional fields gracefully", () => {
			const input = {
				result: "minimal response",
			};

			const normalized = provider["normalizeResponse"](input);

			expect(normalized.result).toBe("minimal response");
			expect(normalized.session_id).toBeUndefined();
			expect(normalized.cost_usd).toBeUndefined();
			expect(normalized.duration_ms).toBeUndefined();
			expect(normalized.usage).toBeUndefined();
		});

		test("should handle array response for evaluator results", () => {
			const input = [{ file: "test.md", section: "1.1", issue: "test issue" }];

			const normalized = provider["normalizeResponse"](input);
			expect(normalized.result).toBe(JSON.stringify(input));
		});

		test("should handle empty result field", () => {
			const input = {};

			const normalized = provider["normalizeResponse"](input);
			expect(normalized.result).toBe("");
		});
	});

	describe("Integration with Registry", () => {
		test("should be registered in provider registry", () => {
			const providers = providerRegistry.list();
			expect(providers).toContain("cursor");
		});

		test("should be retrievable from registry", () => {
			const registeredProvider = providerRegistry.get("cursor");
			expect(registeredProvider).toBeDefined();
			expect(registeredProvider.name).toBe("cursor");
		});

		test("should validate as valid provider name", () => {
			expect(providerRegistry.isValidProvider("cursor")).toBe(true);
		});
	});
});
