import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	filterConsolidatedPaths,
	identifyColocatedPairs,
} from "./colocated-file-consolidator";

describe("identifyColocatedPairs", () => {
	const baseDir = "/repo";

	test("returns empty for a single file", () => {
		const files = [join(baseDir, "AGENTS.md")];
		const result = identifyColocatedPairs(files, baseDir);
		expect(result).toEqual([]);
	});

	test("returns empty when only AGENTS.md exists", () => {
		const files = [
			join(baseDir, "AGENTS.md"),
			join(baseDir, "packages", "api", "AGENTS.md"),
		];
		const result = identifyColocatedPairs(files, baseDir);
		expect(result).toEqual([]);
	});

	test("detects pair in root directory", () => {
		const files = [join(baseDir, "AGENTS.md"), join(baseDir, "CLAUDE.md")];
		const result = identifyColocatedPairs(files, baseDir);
		expect(result).toEqual([
			{
				directory: ".",
				agentsPath: "AGENTS.md",
				claudePath: "CLAUDE.md",
			},
		]);
	});

	test("detects pairs across multiple directories", () => {
		const files = [
			join(baseDir, "AGENTS.md"),
			join(baseDir, "CLAUDE.md"),
			join(baseDir, "packages", "api", "AGENTS.md"),
			join(baseDir, "packages", "api", "CLAUDE.md"),
			join(baseDir, "packages", "web", "AGENTS.md"), // standalone
		];
		const result = identifyColocatedPairs(files, baseDir);
		expect(result).toHaveLength(2);
		expect(result).toContainEqual({
			directory: ".",
			agentsPath: "AGENTS.md",
			claudePath: "CLAUDE.md",
		});
		expect(result).toContainEqual({
			directory: join("packages", "api"),
			agentsPath: join("packages", "api", "AGENTS.md"),
			claudePath: join("packages", "api", "CLAUDE.md"),
		});
	});

	test("does not detect pair when only CLAUDE.md exists", () => {
		const files = [join(baseDir, "CLAUDE.md")];
		const result = identifyColocatedPairs(files, baseDir);
		expect(result).toEqual([]);
	});
});

describe("filterConsolidatedPaths", () => {
	const baseDir = "/repo";

	test("returns files unchanged when no pairs", () => {
		const files = [join(baseDir, "AGENTS.md"), join(baseDir, "CLAUDE.md")];
		const result = filterConsolidatedPaths(files, [], baseDir);
		expect(result).toEqual(files);
	});

	test("removes CLAUDE.md for paired directories", () => {
		const files = [join(baseDir, "AGENTS.md"), join(baseDir, "CLAUDE.md")];
		const pairs = [
			{
				directory: ".",
				agentsPath: "AGENTS.md",
				claudePath: "CLAUDE.md",
			},
		];
		const result = filterConsolidatedPaths(files, pairs, baseDir);
		expect(result).toEqual([join(baseDir, "AGENTS.md")]);
	});

	test("preserves standalone CLAUDE.md in unpaired directories", () => {
		const files = [
			join(baseDir, "AGENTS.md"),
			join(baseDir, "CLAUDE.md"),
			join(baseDir, "packages", "web", "CLAUDE.md"),
		];
		const pairs = [
			{
				directory: ".",
				agentsPath: "AGENTS.md",
				claudePath: "CLAUDE.md",
			},
		];
		const result = filterConsolidatedPaths(files, pairs, baseDir);
		expect(result).toEqual([
			join(baseDir, "AGENTS.md"),
			join(baseDir, "packages", "web", "CLAUDE.md"),
		]);
	});
});
