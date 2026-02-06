import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import type { IAIProvider, IProviderResponse } from "@shared/providers/types";
import { invokeIsolated } from "./isolated-prompt";

// Mock provider factory
function createMockProvider(
	response: IProviderResponse,
	capturedCwd?: { value: string | undefined },
): IAIProvider {
	return {
		name: "random",
		displayName: "Mock Provider",
		isAvailable: async () => true,
		invoke: mock(async (_prompt, options) => {
			if (capturedCwd) {
				capturedCwd.value = options?.cwd;
			}
			return response;
		}),
		invokeWithRetry: mock(async (_prompt, options) => {
			if (capturedCwd) {
				capturedCwd.value = options?.cwd;
			}
			return response;
		}),
	};
}

describe("invokeIsolated", () => {
	const projectRoot = process.cwd();
	const tempBaseDir = path.join(projectRoot, "tmp", "isolated-prompts");

	// Clean up temp directory before and after tests
	beforeEach(async () => {
		try {
			await fs.rm(tempBaseDir, { recursive: true, force: true });
		} catch {
			// Ignore if doesn't exist
		}
	});

	afterEach(async () => {
		try {
			await fs.rm(tempBaseDir, { recursive: true, force: true });
		} catch {
			// Ignore if doesn't exist
		}
	});

	test("should invoke provider with isolated cwd", async () => {
		const capturedCwd = { value: undefined as string | undefined };
		const mockResponse: IProviderResponse = { result: "test response" };
		const provider = createMockProvider(mockResponse, capturedCwd);

		await invokeIsolated(provider, "test prompt");

		// cwd should be a temp directory under tmp/isolated-prompts/
		expect(capturedCwd.value).toBeDefined();
		expect(capturedCwd.value).toContain("tmp/isolated-prompts/prompt-");
	});

	test("should return provider response", async () => {
		const mockResponse: IProviderResponse = {
			result: "summarized content",
			cost_usd: 0.001,
			duration_ms: 500,
		};
		const provider = createMockProvider(mockResponse);

		const result = await invokeIsolated(provider, "summarize this");

		expect(result).toEqual(mockResponse);
	});

	test("should pass through options except cwd", async () => {
		const mockResponse: IProviderResponse = { result: "test" };
		const provider = createMockProvider(mockResponse);

		await invokeIsolated(provider, "test prompt", {
			timeout: 30000,
			verbose: true,
		});

		expect(provider.invoke).toHaveBeenCalledWith(
			"test prompt",
			expect.objectContaining({
				timeout: 30000,
				verbose: true,
			}),
		);
	});

	test("should clean up temp directory after successful execution", async () => {
		const mockResponse: IProviderResponse = { result: "test" };
		const capturedCwd = { value: undefined as string | undefined };
		const provider = createMockProvider(mockResponse, capturedCwd);

		await invokeIsolated(provider, "test prompt");

		// The specific temp directory should be cleaned up
		expect(capturedCwd.value).toBeDefined();
		const tempDirExists = await fs
			.stat(capturedCwd.value!)
			.then(() => true)
			.catch(() => false);
		expect(tempDirExists).toBe(false);
	});

	test("should clean up temp directory after error", async () => {
		const capturedCwd = { value: undefined as string | undefined };
		const provider: IAIProvider = {
			name: "random",
			displayName: "Failing Provider",
			isAvailable: async () => true,
			invoke: mock(async (_prompt, options) => {
				capturedCwd.value = options?.cwd;
				throw new Error("Provider error");
			}),
			invokeWithRetry: mock(async () => {
				throw new Error("Provider error");
			}),
		};

		await expect(invokeIsolated(provider, "test prompt")).rejects.toThrow(
			"Provider error",
		);

		// The specific temp directory should still be cleaned up
		expect(capturedCwd.value).toBeDefined();
		const tempDirExists = await fs
			.stat(capturedCwd.value!)
			.then(() => true)
			.catch(() => false);
		expect(tempDirExists).toBe(false);
	});

	test("should create unique temp directories for concurrent calls", async () => {
		const capturedCwds: string[] = [];
		const provider: IAIProvider = {
			name: "random",
			displayName: "Slow Provider",
			isAvailable: async () => true,
			invoke: mock(async (_prompt, options) => {
				capturedCwds.push(options?.cwd ?? "");
				// Simulate some processing time
				await new Promise((resolve) => setTimeout(resolve, 50));
				return { result: "test" };
			}),
			invokeWithRetry: mock(async () => ({ result: "test" })),
		};

		// Run two concurrent calls
		await Promise.all([
			invokeIsolated(provider, "prompt 1"),
			invokeIsolated(provider, "prompt 2"),
		]);

		// Should have created two different temp directories
		expect(capturedCwds.length).toBe(2);
		expect(capturedCwds[0]).not.toBe(capturedCwds[1]);
	});
});
