import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { IAIProvider, IProviderResponse } from "@shared/providers/types";
import { consolidateColocatedFilesWithAI } from "./ai-file-consolidator";

function createMockProvider(
	response: Partial<IProviderResponse> | Error,
): IAIProvider {
	return {
		name: "claude",
		displayName: "Claude",
		isAvailable: mock(() => Promise.resolve(true)),
		invoke: mock(() => Promise.resolve({} as IProviderResponse)),
		invokeWithRetry: mock(() => {
			if (response instanceof Error) {
				return Promise.reject(response);
			}
			return Promise.resolve({
				result: "",
				...response,
			} as IProviderResponse);
		}),
	};
}

describe("consolidateColocatedFilesWithAI", () => {
	const testDir = join(
		process.cwd(),
		"test",
		"temp",
		"ai-file-consolidator-test",
	);

	beforeAll(async () => {
		await mkdir(testDir, { recursive: true });
	});

	afterAll(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	test("happy path: AI returns merged content", async () => {
		const dir = join(testDir, "happy");
		await mkdir(dir, { recursive: true });

		await writeFile(
			join(dir, "AGENTS.md"),
			"# Project Setup\n\nRun `npm install`\n",
		);
		await writeFile(
			join(dir, "CLAUDE.md"),
			"# Architecture\n\nUses React + Express\n",
		);

		const mergedOutput =
			"# Project Setup\n\nRun `npm install`\n\n# Architecture\n\nUses React + Express";
		const provider = createMockProvider({
			result: mergedOutput,
			cost_usd: 0.01,
			usage: {
				input_tokens: 500,
				output_tokens: 200,
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 0,
			},
		});

		const { results, stats } = await consolidateColocatedFilesWithAI(
			testDir,
			[
				{
					directory: "happy",
					agentsPath: "happy/AGENTS.md",
					claudePath: "happy/CLAUDE.md",
				},
			],
			provider,
		);

		expect(results).toHaveLength(1);
		expect(results[0]!.skipped).toBe(false);

		const agentsContent = await readFile(join(dir, "AGENTS.md"), "utf-8");
		expect(agentsContent).toBe(mergedOutput);

		const claudeContent = await readFile(join(dir, "CLAUDE.md"), "utf-8");
		expect(claudeContent.trim()).toBe("@AGENTS.md");

		expect(stats).toBeDefined();
		expect(stats!.costUsd).toBe(0.01);
		expect(stats!.inputTokens).toBe(500);
		expect(stats!.outputTokens).toBe(200);
	});

	test("AI returns empty: falls back to naive concatenation", async () => {
		const dir = join(testDir, "empty-ai");
		await mkdir(dir, { recursive: true });

		await writeFile(join(dir, "AGENTS.md"), "# Agents content\n");
		await writeFile(join(dir, "CLAUDE.md"), "# Claude content\n");

		const provider = createMockProvider({ result: "" });

		const { results, stats } = await consolidateColocatedFilesWithAI(
			testDir,
			[
				{
					directory: "empty-ai",
					agentsPath: "empty-ai/AGENTS.md",
					claudePath: "empty-ai/CLAUDE.md",
				},
			],
			provider,
		);

		expect(results).toHaveLength(1);
		expect(results[0]!.skipped).toBe(false);

		// Should have naive merge marker
		const agentsContent = await readFile(join(dir, "AGENTS.md"), "utf-8");
		expect(agentsContent).toContain("<!-- Merged from CLAUDE.md -->");

		// Stats should be undefined since no AI was successfully used
		expect(stats).toBeUndefined();
	});

	test("AI throws error: falls back to naive concatenation", async () => {
		const dir = join(testDir, "error-ai");
		await mkdir(dir, { recursive: true });

		await writeFile(join(dir, "AGENTS.md"), "# Agents content\n");
		await writeFile(join(dir, "CLAUDE.md"), "# Claude content\n");

		const provider = createMockProvider(new Error("Provider timeout"));

		const { results, stats } = await consolidateColocatedFilesWithAI(
			testDir,
			[
				{
					directory: "error-ai",
					agentsPath: "error-ai/AGENTS.md",
					claudePath: "error-ai/CLAUDE.md",
				},
			],
			provider,
		);

		expect(results).toHaveLength(1);
		expect(results[0]!.skipped).toBe(false);

		// Should have naive merge marker
		const agentsContent = await readFile(join(dir, "AGENTS.md"), "utf-8");
		expect(agentsContent).toContain("<!-- Merged from CLAUDE.md -->");

		expect(stats).toBeUndefined();
	});

	test("already-referenced pair: skips without invoking AI", async () => {
		const dir = join(testDir, "already-ref");
		await mkdir(dir, { recursive: true });

		await writeFile(join(dir, "AGENTS.md"), "# Agents content\n");
		await writeFile(join(dir, "CLAUDE.md"), "@AGENTS.md\n");

		const provider = createMockProvider({ result: "should not be called" });

		const { results } = await consolidateColocatedFilesWithAI(
			testDir,
			[
				{
					directory: "already-ref",
					agentsPath: "already-ref/AGENTS.md",
					claudePath: "already-ref/CLAUDE.md",
				},
			],
			provider,
		);

		expect(results).toHaveLength(1);
		expect(results[0]!.skipped).toBe(true);
		expect(results[0]!.reason).toContain("already a reference");

		// Provider should not have been called
		expect(provider.invokeWithRetry).not.toHaveBeenCalled();
	});

	test("multiple pairs with partial failure: first AI, second fallback", async () => {
		const dir1 = join(testDir, "multi-partial", "a");
		const dir2 = join(testDir, "multi-partial", "b");
		await mkdir(dir1, { recursive: true });
		await mkdir(dir2, { recursive: true });

		await writeFile(
			join(dir1, "AGENTS.md"),
			"# A agents content with enough text\n",
		);
		await writeFile(
			join(dir1, "CLAUDE.md"),
			"# A claude content with enough text\n",
		);
		await writeFile(join(dir2, "AGENTS.md"), "# B agents\n");
		await writeFile(join(dir2, "CLAUDE.md"), "# B claude\n");

		let callCount = 0;
		const provider: IAIProvider = {
			name: "claude",
			displayName: "Claude",
			isAvailable: mock(() => Promise.resolve(true)),
			invoke: mock(() => Promise.resolve({} as IProviderResponse)),
			invokeWithRetry: mock(() => {
				callCount++;
				if (callCount === 1) {
					return Promise.resolve({
						result:
							"# A agents content with enough text\n\n# A claude content with enough text\n",
						cost_usd: 0.005,
						usage: {
							input_tokens: 300,
							output_tokens: 100,
							cache_creation_input_tokens: 0,
							cache_read_input_tokens: 0,
						},
					} as IProviderResponse);
				}
				return Promise.reject(new Error("Rate limited"));
			}),
		};

		const { results } = await consolidateColocatedFilesWithAI(
			testDir,
			[
				{
					directory: "multi-partial/a",
					agentsPath: "multi-partial/a/AGENTS.md",
					claudePath: "multi-partial/a/CLAUDE.md",
				},
				{
					directory: "multi-partial/b",
					agentsPath: "multi-partial/b/AGENTS.md",
					claudePath: "multi-partial/b/CLAUDE.md",
				},
			],
			provider,
		);

		expect(results).toHaveLength(2);
		expect(results[0]!.skipped).toBe(false);
		expect(results[1]!.skipped).toBe(false);

		// First pair: AI merge (no naive marker)
		const a1 = await readFile(join(dir1, "AGENTS.md"), "utf-8");
		expect(a1).not.toContain("<!-- Merged from CLAUDE.md -->");

		// Second pair: naive fallback
		const a2 = await readFile(join(dir2, "AGENTS.md"), "utf-8");
		expect(a2).toContain("<!-- Merged from CLAUDE.md -->");
	});
});
