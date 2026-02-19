import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { consolidateColocatedFiles } from "./file-consolidator";

describe("consolidateColocatedFiles", () => {
	const testDir = join(process.cwd(), "test", "temp", "file-consolidator-test");

	beforeAll(async () => {
		await mkdir(testDir, { recursive: true });
	});

	afterAll(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	test("appends content and rewrites CLAUDE.md to reference", async () => {
		const dir = join(testDir, "basic");
		await mkdir(dir, { recursive: true });

		await writeFile(join(dir, "AGENTS.md"), "# Agents content\n");
		await writeFile(join(dir, "CLAUDE.md"), "# Claude content\n");

		const results = await consolidateColocatedFiles(testDir, [
			{
				directory: "basic",
				agentsPath: "basic/AGENTS.md",
				claudePath: "basic/CLAUDE.md",
			},
		]);

		expect(results).toHaveLength(1);
		expect(results[0]!.skipped).toBe(false);

		const agentsContent = await readFile(join(dir, "AGENTS.md"), "utf-8");
		expect(agentsContent).toContain("# Agents content");
		expect(agentsContent).toContain("<!-- Merged from CLAUDE.md -->");
		expect(agentsContent).toContain("# Claude content");

		const claudeContent = await readFile(join(dir, "CLAUDE.md"), "utf-8");
		expect(claudeContent.trim()).toBe("@AGENTS.md");
	});

	test("skips if CLAUDE.md is already @AGENTS.md", async () => {
		const dir = join(testDir, "already-ref");
		await mkdir(dir, { recursive: true });

		await writeFile(join(dir, "AGENTS.md"), "# Agents content\n");
		await writeFile(join(dir, "CLAUDE.md"), "@AGENTS.md\n");

		const results = await consolidateColocatedFiles(testDir, [
			{
				directory: "already-ref",
				agentsPath: "already-ref/AGENTS.md",
				claudePath: "already-ref/CLAUDE.md",
			},
		]);

		expect(results).toHaveLength(1);
		expect(results[0]!.skipped).toBe(true);
		expect(results[0]!.reason).toContain("already a reference");

		// AGENTS.md should be unchanged
		const agentsContent = await readFile(join(dir, "AGENTS.md"), "utf-8");
		expect(agentsContent).toBe("# Agents content\n");
	});

	test("handles multiple pairs", async () => {
		const dir1 = join(testDir, "multi", "a");
		const dir2 = join(testDir, "multi", "b");
		await mkdir(dir1, { recursive: true });
		await mkdir(dir2, { recursive: true });

		await writeFile(join(dir1, "AGENTS.md"), "# A agents\n");
		await writeFile(join(dir1, "CLAUDE.md"), "# A claude\n");
		await writeFile(join(dir2, "AGENTS.md"), "# B agents\n");
		await writeFile(join(dir2, "CLAUDE.md"), "@AGENTS.md\n");

		const results = await consolidateColocatedFiles(testDir, [
			{
				directory: "multi/a",
				agentsPath: "multi/a/AGENTS.md",
				claudePath: "multi/a/CLAUDE.md",
			},
			{
				directory: "multi/b",
				agentsPath: "multi/b/AGENTS.md",
				claudePath: "multi/b/CLAUDE.md",
			},
		]);

		expect(results).toHaveLength(2);
		expect(results[0]!.skipped).toBe(false);
		expect(results[1]!.skipped).toBe(true);

		// Verify dir1 was consolidated
		const a1 = await readFile(join(dir1, "AGENTS.md"), "utf-8");
		expect(a1).toContain("<!-- Merged from CLAUDE.md -->");
		const c1 = await readFile(join(dir1, "CLAUDE.md"), "utf-8");
		expect(c1.trim()).toBe("@AGENTS.md");

		// Verify dir2 was not modified
		const a2 = await readFile(join(dir2, "AGENTS.md"), "utf-8");
		expect(a2).toBe("# B agents\n");
	});
});
