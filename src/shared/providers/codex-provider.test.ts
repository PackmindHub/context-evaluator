import { describe, expect, test } from "bun:test";
import { CodexProvider } from "./codex-provider";
import { providerRegistry } from "./registry";

describe("CodexProvider", () => {
	const provider = new CodexProvider();

	describe("Basic Properties", () => {
		test("should have correct name", () => {
			expect(provider.name).toBe("codex");
		});

		test("should have correct display name", () => {
			expect(provider.displayName).toBe("OpenAI Codex");
		});
	});

	describe("NDJSON Parsing", () => {
		test("should extract text from agent_message items", () => {
			const ndjsonLines = [
				'{"type":"thread.started","thread_id":"thread-123"}',
				'{"type":"item.completed","item":{"type":"agent_message","text":"Hello "}}',
				'{"type":"item.completed","item":{"type":"agent_message","text":"world!"}}',
				'{"type":"turn.completed","usage":{"input_tokens":100,"output_tokens":50}}',
			];

			const result = provider["parseNdjsonResponse"](ndjsonLines, false);

			expect(result.result).toBe("Hello world!");
			expect(result.session_id).toBe("thread-123");
			expect(result.usage).toEqual({
				input_tokens: 100,
				output_tokens: 50,
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 0,
			});
		});

		test("should extract thread_id as session_id", () => {
			const ndjsonLines = [
				'{"type":"thread.started","thread_id":"thread-456"}',
				'{"type":"item.completed","item":{"type":"agent_message","text":"test"}}',
			];

			const result = provider["parseNdjsonResponse"](ndjsonLines, false);

			expect(result.session_id).toBe("thread-456");
		});

		test("should extract usage from turn.completed", () => {
			const ndjsonLines = [
				'{"type":"item.completed","item":{"type":"agent_message","text":"test"}}',
				'{"type":"turn.completed","usage":{"input_tokens":200,"output_tokens":75,"cached_input_tokens":50}}',
			];

			const result = provider["parseNdjsonResponse"](ndjsonLines, false);

			expect(result.usage).toEqual({
				input_tokens: 200,
				output_tokens: 75,
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 50,
			});
		});

		test("should ignore non-agent_message items", () => {
			const ndjsonLines = [
				'{"type":"item.completed","item":{"type":"reasoning","text":"thinking..."}}',
				'{"type":"item.completed","item":{"type":"command","text":"run test"}}',
				'{"type":"item.completed","item":{"type":"agent_message","text":"actual response"}}',
			];

			const result = provider["parseNdjsonResponse"](ndjsonLines, false);

			expect(result.result).toBe("actual response");
		});

		test("should handle malformed JSON gracefully", () => {
			const ndjsonLines = [
				'{"type":"item.completed","item":{"type":"agent_message","text":"valid"}}',
				"{invalid json",
				'{"type":"item.completed","item":{"type":"agent_message","text":" message"}}',
			];

			const result = provider["parseNdjsonResponse"](ndjsonLines, false);

			expect(result.result).toBe("valid message");
		});

		test("should handle empty event stream", () => {
			const ndjsonLines: string[] = [];

			const result = provider["parseNdjsonResponse"](ndjsonLines, false);

			expect(result.result).toBe("");
			expect(result.session_id).toBeUndefined();
			expect(result.usage).toBeUndefined();
		});

		test("should log error events but continue parsing", () => {
			const ndjsonLines = [
				'{"type":"item.completed","item":{"type":"agent_message","text":"before error"}}',
				'{"type":"error","error":{"message":"something went wrong","code":"ERR_001"}}',
				'{"type":"item.completed","item":{"type":"agent_message","text":" after error"}}',
			];

			const result = provider["parseNdjsonResponse"](ndjsonLines, false);

			expect(result.result).toBe("before error after error");
		});

		test("should handle missing optional fields in events", () => {
			const ndjsonLines = [
				'{"type":"thread.started"}',
				'{"type":"item.completed","item":{"type":"agent_message"}}',
				'{"type":"turn.completed"}',
			];

			const result = provider["parseNdjsonResponse"](ndjsonLines, false);

			expect(result.result).toBe("");
			expect(result.session_id).toBeUndefined();
			expect(result.usage).toBeUndefined();
		});
	});

	describe("Response Normalization", () => {
		test("should handle array response", () => {
			const input = [{ file: "test.md", section: "1.1", issue: "test issue" }];

			const normalized = provider["normalizeResponse"](input);
			expect(normalized.result).toBe(JSON.stringify(input));
		});

		test("should handle string response", () => {
			const input = "plain text response";

			const normalized = provider["normalizeResponse"](input);
			expect(normalized.result).toBe("plain text response");
		});

		test("should handle object response", () => {
			const input = { key: "value", nested: { data: 123 } };

			const normalized = provider["normalizeResponse"](input);
			expect(normalized.result).toBe(JSON.stringify(input));
		});
	});

	describe("Integration with Registry", () => {
		test("should be registered in provider registry", () => {
			const providers = providerRegistry.list();
			expect(providers).toContain("codex");
		});

		test("should be retrievable from registry", () => {
			const registeredProvider = providerRegistry.get("codex");
			expect(registeredProvider).toBeDefined();
			expect(registeredProvider.name).toBe("codex");
		});

		test("should validate as valid provider name", () => {
			expect(providerRegistry.isValidProvider("codex")).toBe(true);
		});
	});
});
