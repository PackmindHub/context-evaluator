import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, symlink, writeFile } from "fs/promises";
import { join, resolve } from "path";
import {
	findAgentsFiles,
	findClaudeFiles,
	findClaudeRulesFiles,
	getRelativePath,
} from "./file-finder";

describe("File Finder", () => {
	describe("getRelativePath", () => {
		test("should convert absolute path to relative path", () => {
			const baseDir = "/Users/test/project";
			const filePath = "/Users/test/project/src/AGENTS.md";

			const result = getRelativePath(filePath, baseDir);

			expect(result).toBe("src/AGENTS.md");
		});

		test("should handle file in base directory root", () => {
			const baseDir = "/Users/test/project";
			const filePath = "/Users/test/project/AGENTS.md";

			const result = getRelativePath(filePath, baseDir);

			expect(result).toBe("AGENTS.md");
		});

		test("should handle nested subdirectories", () => {
			const baseDir = "/Users/test/project";
			const filePath = "/Users/test/project/src/components/ui/AGENTS.md";

			const result = getRelativePath(filePath, baseDir);

			expect(result).toBe("src/components/ui/AGENTS.md");
		});

		test("should return unchanged path if not under base directory", () => {
			const baseDir = "/Users/test/project";
			const filePath = "/Users/other/project/AGENTS.md";

			const result = getRelativePath(filePath, baseDir);

			expect(result).toBe(filePath);
		});

		test("should handle relative base directory", () => {
			const baseDir = ".";
			const filePath = resolve(".") + "/AGENTS.md";

			const result = getRelativePath(filePath, baseDir);

			expect(result).toBe("AGENTS.md");
		});

		test("should normalize paths with different separators", () => {
			const baseDir = "/Users/test/project";
			const filePath = "/Users/test/project/src/AGENTS.md";

			const result = getRelativePath(filePath, baseDir);

			expect(result).toBe("src/AGENTS.md");
		});

		test("should handle paths with trailing slashes in base directory", () => {
			const baseDir = "/Users/test/project/";
			const filePath = "/Users/test/project/src/AGENTS.md";

			// resolve() will normalize the trailing slash
			const result = getRelativePath(filePath, baseDir);

			expect(result).toBe("src/AGENTS.md");
		});

		test("should use process.cwd() as default base directory", () => {
			const filePath = resolve(process.cwd(), "AGENTS.md");

			const result = getRelativePath(filePath);

			expect(result).toBe("AGENTS.md");
		});

		test("should handle case-sensitive paths", () => {
			const baseDir = "/Users/Test/Project";
			const filePath = "/Users/Test/Project/src/AGENTS.md";

			const result = getRelativePath(filePath, baseDir);

			expect(result).toBe("src/AGENTS.md");
		});

		test("should handle Windows-style paths if on Windows", () => {
			// This test is platform-agnostic - it just verifies the function works with the platform's path separator
			const baseDir = resolve("/test/project");
			const filePath = resolve("/test/project/src/AGENTS.md");

			const result = getRelativePath(filePath, baseDir);

			// On Unix: 'src/AGENTS.md'
			// On Windows: 'src\\AGENTS.md' (but resolve normalizes to the platform separator)
			expect(result).toContain("AGENTS.md");
			expect(result).toContain("src");
		});

		test("should handle empty file path", () => {
			const baseDir = "/Users/test/project";
			const filePath = "";

			const result = getRelativePath(filePath, baseDir);

			expect(result).toBe("");
		});

		test("should handle base directory same as file path", () => {
			const baseDir = "/Users/test/project";
			const filePath = "/Users/test/project";

			const result = getRelativePath(filePath, baseDir);

			// When paths are the same, slice will return empty string after the trailing slash
			expect(result).toBe("");
		});
	});

	describe("Hidden Directory Discovery", () => {
		let testDir: string;

		beforeEach(async () => {
			// Create a unique temporary directory for each test
			testDir = join(
				process.cwd(),
				"test-temp",
				`test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			);
			await mkdir(testDir, { recursive: true });
		});

		afterEach(async () => {
			// Clean up test directory
			await rm(testDir, { recursive: true, force: true });
		});

		test("should find AGENTS.md in hidden directories", async () => {
			const hiddenDir = join(testDir, ".claude");
			await mkdir(hiddenDir, { recursive: true });
			await writeFile(join(hiddenDir, "AGENTS.md"), "# Hidden AGENTS.md");

			const files = await findAgentsFiles(testDir);

			expect(files.some((f) => f.includes(".claude/AGENTS.md"))).toBe(true);
		});

		test("should find CLAUDE.md in hidden directories", async () => {
			const hiddenDir = join(testDir, ".config");
			await mkdir(hiddenDir, { recursive: true });
			await writeFile(join(hiddenDir, "CLAUDE.md"), "# Hidden CLAUDE.md");

			const files = await findClaudeFiles(testDir);

			expect(files.some((f) => f.includes(".config/CLAUDE.md"))).toBe(true);
		});
	});

	describe("Symlink Handling", () => {
		let testDir: string;

		beforeEach(async () => {
			// Create a unique temporary directory for each test
			testDir = join(
				process.cwd(),
				"test-temp",
				`test-symlink-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			);
			await mkdir(testDir, { recursive: true });
		});

		afterEach(async () => {
			// Clean up test directory
			await rm(testDir, { recursive: true, force: true });
		});

		test("should deduplicate symlink pointing to same file", async () => {
			// Create real AGENTS.md
			const agentsPath = join(testDir, "AGENTS.md");
			await writeFile(agentsPath, "# Real AGENTS.md");

			// Create a symlink CLAUDE.md → AGENTS.md
			const claudePath = join(testDir, "CLAUDE.md");
			await symlink(agentsPath, claudePath);

			const files = await findAgentsFiles(testDir);

			// Should only return one file (the first discovered)
			expect(files.length).toBe(1);
		});

		test("should deduplicate symlink in subdirectory pointing to root file", async () => {
			// Create real AGENTS.md in root
			const rootAgentsPath = join(testDir, "AGENTS.md");
			await writeFile(rootAgentsPath, "# Root AGENTS.md");

			// Create subdirectory with symlink
			const subDir = join(testDir, "subdir");
			await mkdir(subDir);
			const symlinkPath = join(subDir, "AGENTS.md");
			await symlink(rootAgentsPath, symlinkPath);

			const files = await findAgentsFiles(testDir);

			// Should only return the root file (shallower = discovered first after sorting)
			expect(files.length).toBe(1);
			expect(files[0]).toBe(rootAgentsPath);
		});

		test("should handle symlink chains (A → B → C)", async () => {
			// Create the real file
			const realFile = join(testDir, "real-agents.md");
			await writeFile(realFile, "# Real content");

			// Create AGENTS.md as symlink to real file
			const agentsPath = join(testDir, "AGENTS.md");
			await symlink(realFile, agentsPath);

			// Create CLAUDE.md as symlink to AGENTS.md (chain: CLAUDE.md → AGENTS.md → real-agents.md)
			const claudePath = join(testDir, "CLAUDE.md");
			await symlink(agentsPath, claudePath);

			const files = await findAgentsFiles(testDir);

			// Should deduplicate - both symlinks point to same canonical target
			expect(files.length).toBe(1);
		});

		test("should skip broken symlinks gracefully", async () => {
			// Create a real AGENTS.md
			const agentsPath = join(testDir, "AGENTS.md");
			await writeFile(agentsPath, "# Real AGENTS.md");

			// Create a broken symlink (points to non-existent file)
			const brokenSymlink = join(testDir, "CLAUDE.md");
			await symlink(join(testDir, "nonexistent.md"), brokenSymlink);

			const files = await findAgentsFiles(testDir);

			// Should only return the real file, not the broken symlink
			expect(files.length).toBe(1);
			expect(files[0]).toBe(agentsPath);
		});

		test("should skip circular symlinks gracefully", async () => {
			// Create a real AGENTS.md first
			const agentsPath = join(testDir, "AGENTS.md");
			await writeFile(agentsPath, "# Real AGENTS.md");

			// Create circular symlinks: A.md → B.md → A.md
			const circularA = join(testDir, "circularA.md");
			const circularB = join(testDir, "circularB.md");

			// Note: We can't actually create true circular symlinks with AGENTS.md/CLAUDE.md names
			// because they'd need to exist before linking. This test verifies the error handling
			// for ELOOP scenarios which occur with more complex circular references.

			// Create a symlink that points to itself (simpler circular case)
			// Note: On most systems, creating a symlink to itself isn't directly possible,
			// but we can test with indirect circularity
			try {
				// Create circularB pointing to where circularA will be
				await symlink(circularA, circularB);
				// Create circularA pointing to circularB (circular reference)
				await symlink(circularB, circularA);
			} catch {
				// Some systems may reject this - that's fine for this test
			}

			// Should not throw, should return at least the real file
			const files = await findAgentsFiles(testDir);
			expect(files.length).toBeGreaterThanOrEqual(1);
			expect(files.some((f) => f.endsWith("AGENTS.md"))).toBe(true);
		});

		test("should handle multiple symlinks to same target", async () => {
			// Create subdirectory with real CLAUDE.md
			const subDir = join(testDir, ".github");
			await mkdir(subDir);
			const realFile = join(subDir, "copilot-instructions.md");
			await writeFile(realFile, "# Instructions");

			// Create both AGENTS.md and CLAUDE.md as symlinks to the same target
			const agentsPath = join(testDir, "AGENTS.md");
			const claudePath = join(testDir, "CLAUDE.md");
			await symlink(realFile, agentsPath);
			await symlink(realFile, claudePath);

			const files = await findAgentsFiles(testDir);

			// Should only return one (first discovered symlink)
			expect(files.length).toBe(1);
		});

		test("should handle mix of regular files and symlinks", async () => {
			// Create real AGENTS.md
			const agentsPath = join(testDir, "AGENTS.md");
			await writeFile(agentsPath, "# AGENTS content");

			// Create real CLAUDE.md with different content
			const claudePath = join(testDir, "CLAUDE.md");
			await writeFile(claudePath, "# CLAUDE content - different");

			// Create subdirectory with symlink to AGENTS.md
			const subDir = join(testDir, "subdir");
			await mkdir(subDir);
			const subSymlink = join(subDir, "AGENTS.md");
			await symlink(agentsPath, subSymlink);

			const files = await findAgentsFiles(testDir);

			// Should return both root files (different content), but not the subdirectory symlink
			expect(files.length).toBe(2);
			expect(files.some((f) => f.endsWith("/AGENTS.md"))).toBe(true);
			expect(files.some((f) => f.endsWith("/CLAUDE.md"))).toBe(true);
		});

		test("should log symlink relationships in verbose mode", async () => {
			// Create real AGENTS.md
			const agentsPath = join(testDir, "AGENTS.md");
			await writeFile(agentsPath, "# Real content");

			// Create symlink CLAUDE.md → AGENTS.md
			const claudePath = join(testDir, "CLAUDE.md");
			await symlink(agentsPath, claudePath);

			// Capture console output
			const logs: string[] = [];
			const originalLog = console.log;
			console.log = (...args: unknown[]) => {
				logs.push(args.join(" "));
			};

			try {
				await findAgentsFiles(testDir, undefined, true);

				// Should have logged symlink relationship
				const hasSymlinkLog = logs.some(
					(log) =>
						log.includes("[FileFinder]") &&
						(log.includes("Symlink:") || log.includes("Deduplicated symlink:")),
				);
				expect(hasSymlinkLog).toBe(true);
			} finally {
				console.log = originalLog;
			}
		});

		test("should preserve order with symlinks (shallower files first)", async () => {
			// Create nested structure
			const deepDir = join(testDir, "level1", "level2");
			await mkdir(deepDir, { recursive: true });

			// Create real file in deep directory
			const deepFile = join(deepDir, "AGENTS.md");
			await writeFile(deepFile, "# Deep AGENTS.md");

			// Create different file in root
			const rootFile = join(testDir, "CLAUDE.md");
			await writeFile(rootFile, "# Root CLAUDE.md");

			const files = await findAgentsFiles(testDir);

			// Root file should come first (shallower)
			expect(files.length).toBe(2);
			expect(files[0]).toBe(rootFile);
			expect(files[1]).toBe(deepFile);
		});
	});

	describe("Github Copilot Instructions Discovery", () => {
		let testDir: string;

		beforeEach(async () => {
			// Create a unique temporary directory for each test
			testDir = join(
				process.cwd(),
				"test-temp",
				`test-copilot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			);
			await mkdir(testDir, { recursive: true });
		});

		afterEach(async () => {
			// Clean up test directory
			await rm(testDir, { recursive: true, force: true });
		});

		test("should find copilot-instructions.md in .github directory", async () => {
			const githubDir = join(testDir, ".github");
			await mkdir(githubDir, { recursive: true });
			await writeFile(
				join(githubDir, "copilot-instructions.md"),
				"# Copilot Instructions",
			);

			const files = await findAgentsFiles(testDir);

			expect(files.length).toBe(1);
			expect(files[0]).toContain(".github/copilot-instructions.md");
		});

		test("should find copilot-instructions.md in nested .github subdirectories", async () => {
			const nestedGithubDir = join(testDir, ".github", "copilot");
			await mkdir(nestedGithubDir, { recursive: true });
			await writeFile(
				join(nestedGithubDir, "copilot-instructions.md"),
				"# Nested Copilot Instructions",
			);

			const files = await findAgentsFiles(testDir);

			expect(files.length).toBe(1);
			expect(files[0]).toContain(".github/copilot/copilot-instructions.md");
		});

		test("should NOT find copilot-instructions.md outside .github directory", async () => {
			// Create copilot-instructions.md in root (should not be found)
			await writeFile(
				join(testDir, "copilot-instructions.md"),
				"# Root Copilot Instructions",
			);

			const files = await findAgentsFiles(testDir);

			// Should not find the root copilot-instructions.md
			expect(files.length).toBe(0);
		});

		test("should find all three context file types together", async () => {
			// Create AGENTS.md in root
			await writeFile(join(testDir, "AGENTS.md"), "# AGENTS content");

			// Create CLAUDE.md in root
			await writeFile(
				join(testDir, "CLAUDE.md"),
				"# CLAUDE content - different",
			);

			// Create copilot-instructions.md in .github
			const githubDir = join(testDir, ".github");
			await mkdir(githubDir, { recursive: true });
			await writeFile(
				join(githubDir, "copilot-instructions.md"),
				"# Copilot Instructions - unique",
			);

			const files = await findAgentsFiles(testDir);

			// Should find all three files (all have different content)
			expect(files.length).toBe(3);
			expect(files.some((f) => f.endsWith("AGENTS.md"))).toBe(true);
			expect(files.some((f) => f.endsWith("CLAUDE.md"))).toBe(true);
			expect(files.some((f) => f.endsWith("copilot-instructions.md"))).toBe(
				true,
			);
		});
	});

	describe("GitHub Copilot Instructions Files Discovery", () => {
		let testDir: string;

		beforeEach(async () => {
			testDir = join(
				process.cwd(),
				"test-temp",
				`test-instructions-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			);
			await mkdir(testDir, { recursive: true });
		});

		afterEach(async () => {
			await rm(testDir, { recursive: true, force: true });
		});

		test("should find *.instructions.md files in .github/instructions directory", async () => {
			const instructionsDir = join(testDir, ".github", "instructions");
			await mkdir(instructionsDir, { recursive: true });
			await writeFile(
				join(instructionsDir, "typescript.instructions.md"),
				"# TypeScript Instructions",
			);

			const files = await findAgentsFiles(testDir);

			expect(files.length).toBe(1);
			expect(files[0]).toContain(
				".github/instructions/typescript.instructions.md",
			);
		});

		test("should find *.instructions.md files in nested subdirectories", async () => {
			const nestedDir = join(testDir, ".github", "instructions", "frontend");
			await mkdir(nestedDir, { recursive: true });
			await writeFile(
				join(nestedDir, "react.instructions.md"),
				"# React Instructions",
			);

			const files = await findAgentsFiles(testDir);

			expect(files.length).toBe(1);
			expect(files[0]).toContain(
				".github/instructions/frontend/react.instructions.md",
			);
		});

		test("should find multiple *.instructions.md files", async () => {
			const instructionsDir = join(testDir, ".github", "instructions");
			await mkdir(instructionsDir, { recursive: true });
			await writeFile(
				join(instructionsDir, "typescript.instructions.md"),
				"# TypeScript Instructions",
			);
			await writeFile(
				join(instructionsDir, "testing.instructions.md"),
				"# Testing Instructions",
			);

			const files = await findAgentsFiles(testDir);

			expect(files.length).toBe(2);
			expect(files.some((f) => f.includes("typescript.instructions.md"))).toBe(
				true,
			);
			expect(files.some((f) => f.includes("testing.instructions.md"))).toBe(
				true,
			);
		});

		test("should NOT find *.instructions.md outside .github/instructions/", async () => {
			// Create .instructions.md in root (should not be found)
			await writeFile(
				join(testDir, "custom.instructions.md"),
				"# Root Instructions",
			);

			const files = await findAgentsFiles(testDir);

			expect(files.length).toBe(0);
		});

		test("should NOT find *.instructions.md in .github root (without instructions subdir)", async () => {
			const githubDir = join(testDir, ".github");
			await mkdir(githubDir, { recursive: true });
			await writeFile(
				join(githubDir, "custom.instructions.md"),
				"# GitHub Root Instructions",
			);

			const files = await findAgentsFiles(testDir);

			// Should not find .github/custom.instructions.md (not in instructions/ subdir)
			expect(files.length).toBe(0);
		});

		test("should find both copilot-instructions.md and *.instructions.md together", async () => {
			// Create copilot-instructions.md in .github
			const githubDir = join(testDir, ".github");
			await mkdir(githubDir, { recursive: true });
			await writeFile(
				join(githubDir, "copilot-instructions.md"),
				"# Copilot Instructions",
			);

			// Create *.instructions.md in .github/instructions
			const instructionsDir = join(githubDir, "instructions");
			await mkdir(instructionsDir, { recursive: true });
			await writeFile(
				join(instructionsDir, "typescript.instructions.md"),
				"# TypeScript Instructions",
			);

			const files = await findAgentsFiles(testDir);

			expect(files.length).toBe(2);
			expect(files.some((f) => f.endsWith("copilot-instructions.md"))).toBe(
				true,
			);
			expect(files.some((f) => f.endsWith("typescript.instructions.md"))).toBe(
				true,
			);
		});

		test("should find all context file types together", async () => {
			// Create AGENTS.md in root
			await writeFile(join(testDir, "AGENTS.md"), "# AGENTS content");

			// Create CLAUDE.md in root with different content
			await writeFile(
				join(testDir, "CLAUDE.md"),
				"# CLAUDE content - different",
			);

			// Create copilot-instructions.md in .github
			const githubDir = join(testDir, ".github");
			await mkdir(githubDir, { recursive: true });
			await writeFile(
				join(githubDir, "copilot-instructions.md"),
				"# Copilot Instructions",
			);

			// Create *.instructions.md in .github/instructions
			const instructionsDir = join(githubDir, "instructions");
			await mkdir(instructionsDir, { recursive: true });
			await writeFile(
				join(instructionsDir, "typescript.instructions.md"),
				"# TypeScript Instructions",
			);

			const files = await findAgentsFiles(testDir);

			expect(files.length).toBe(4);
			expect(files.some((f) => f.endsWith("AGENTS.md"))).toBe(true);
			expect(files.some((f) => f.endsWith("CLAUDE.md"))).toBe(true);
			expect(files.some((f) => f.endsWith("copilot-instructions.md"))).toBe(
				true,
			);
			expect(files.some((f) => f.endsWith("typescript.instructions.md"))).toBe(
				true,
			);
		});
	});

	describe("Instructions Files Global Deduplication", () => {
		let testDir: string;

		beforeEach(async () => {
			testDir = join(
				process.cwd(),
				"test-temp",
				`test-instr-dedup-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			);
			await mkdir(testDir, { recursive: true });
		});

		afterEach(async () => {
			await rm(testDir, { recursive: true, force: true });
		});

		test("should deduplicate *.instructions.md if identical to root AGENTS.md", async () => {
			const content = "# Same content";

			// Create AGENTS.md in root
			await writeFile(join(testDir, "AGENTS.md"), content);

			// Create *.instructions.md in .github/instructions with identical content
			const instructionsDir = join(testDir, ".github", "instructions");
			await mkdir(instructionsDir, { recursive: true });
			await writeFile(
				join(instructionsDir, "typescript.instructions.md"),
				content,
			);

			const files = await findAgentsFiles(testDir);

			// Should only return AGENTS.md (instructions file deduplicated)
			expect(files.length).toBe(1);
			expect(files[0]).toContain("AGENTS.md");
		});

		test("should keep *.instructions.md if content differs", async () => {
			// Create AGENTS.md in root
			await writeFile(join(testDir, "AGENTS.md"), "# AGENTS unique content");

			// Create *.instructions.md in .github/instructions with different content
			const instructionsDir = join(testDir, ".github", "instructions");
			await mkdir(instructionsDir, { recursive: true });
			await writeFile(
				join(instructionsDir, "typescript.instructions.md"),
				"# TypeScript unique content",
			);

			const files = await findAgentsFiles(testDir);

			// Should return both files (different content)
			expect(files.length).toBe(2);
			expect(files.some((f) => f.endsWith("AGENTS.md"))).toBe(true);
			expect(files.some((f) => f.endsWith("typescript.instructions.md"))).toBe(
				true,
			);
		});
	});

	describe("Copilot Instructions Global Deduplication", () => {
		let testDir: string;

		beforeEach(async () => {
			testDir = join(
				process.cwd(),
				"test-temp",
				`test-copilot-dedup-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			);
			await mkdir(testDir, { recursive: true });
		});

		afterEach(async () => {
			await rm(testDir, { recursive: true, force: true });
		});

		test("should deduplicate copilot-instructions.md if identical to root AGENTS.md", async () => {
			const content = "# Same content";

			// Create AGENTS.md in root
			await writeFile(join(testDir, "AGENTS.md"), content);

			// Create copilot-instructions.md in .github with identical content
			const githubDir = join(testDir, ".github");
			await mkdir(githubDir, { recursive: true });
			await writeFile(join(githubDir, "copilot-instructions.md"), content);

			const files = await findAgentsFiles(testDir);

			// Should only return AGENTS.md (copilot-instructions.md deduplicated)
			expect(files.length).toBe(1);
			expect(files[0]).toContain("AGENTS.md");
		});

		test("should deduplicate copilot-instructions.md if identical to CLAUDE.md", async () => {
			const content = "# Same content";

			// Create CLAUDE.md in root
			await writeFile(join(testDir, "CLAUDE.md"), content);

			// Create copilot-instructions.md in .github with identical content
			const githubDir = join(testDir, ".github");
			await mkdir(githubDir, { recursive: true });
			await writeFile(join(githubDir, "copilot-instructions.md"), content);

			const files = await findAgentsFiles(testDir);

			// Should only return CLAUDE.md (copilot-instructions.md deduplicated)
			expect(files.length).toBe(1);
			expect(files[0]).toContain("CLAUDE.md");
		});

		test("should deduplicate copilot-instructions.md if identical to subdirectory AGENTS.md", async () => {
			const content = "# Same content in subdirectory";

			// Create AGENTS.md in a subdirectory
			const subDir = join(testDir, "packages", "core");
			await mkdir(subDir, { recursive: true });
			await writeFile(join(subDir, "AGENTS.md"), content);

			// Create copilot-instructions.md in .github with identical content
			const githubDir = join(testDir, ".github");
			await mkdir(githubDir, { recursive: true });
			await writeFile(join(githubDir, "copilot-instructions.md"), content);

			const files = await findAgentsFiles(testDir);

			// Should only return the subdirectory AGENTS.md (copilot-instructions.md deduplicated)
			expect(files.length).toBe(1);
			expect(files[0]).toContain("AGENTS.md");
		});

		test("should keep copilot-instructions.md if content differs from all other files", async () => {
			// Create AGENTS.md in root
			await writeFile(join(testDir, "AGENTS.md"), "# AGENTS unique content");

			// Create copilot-instructions.md in .github with different content
			const githubDir = join(testDir, ".github");
			await mkdir(githubDir, { recursive: true });
			await writeFile(
				join(githubDir, "copilot-instructions.md"),
				"# Copilot unique content",
			);

			const files = await findAgentsFiles(testDir);

			// Should return both files (different content)
			expect(files.length).toBe(2);
			expect(files.some((f) => f.endsWith("AGENTS.md"))).toBe(true);
			expect(files.some((f) => f.endsWith("copilot-instructions.md"))).toBe(
				true,
			);
		});

		test("should handle whitespace differences in deduplication", async () => {
			// Create AGENTS.md with trailing whitespace
			await writeFile(join(testDir, "AGENTS.md"), "# Content  \n\n");

			// Create copilot-instructions.md without trailing whitespace
			const githubDir = join(testDir, ".github");
			await mkdir(githubDir, { recursive: true });
			await writeFile(join(githubDir, "copilot-instructions.md"), "# Content");

			const files = await findAgentsFiles(testDir);

			// Should deduplicate (content is same after trimming)
			expect(files.length).toBe(1);
		});

		test("should log deduplication in verbose mode", async () => {
			const content = "# Same content";

			// Create AGENTS.md in root
			await writeFile(join(testDir, "AGENTS.md"), content);

			// Create copilot-instructions.md in .github with identical content
			const githubDir = join(testDir, ".github");
			await mkdir(githubDir, { recursive: true });
			await writeFile(join(githubDir, "copilot-instructions.md"), content);

			// Capture console output
			const logs: string[] = [];
			const originalLog = console.log;
			console.log = (...args: unknown[]) => {
				logs.push(args.join(" "));
			};

			try {
				await findAgentsFiles(testDir, undefined, true);

				// Should have logged deduplication
				const hasDeduplicationLog = logs.some(
					(log) =>
						log.includes("[FileFinder]") &&
						log.includes("Deduplicated") &&
						log.includes("copilot-instructions.md"),
				);
				expect(hasDeduplicationLog).toBe(true);
			} finally {
				console.log = originalLog;
			}
		});
	});

	describe("File Reference Deduplication", () => {
		let testDir: string;

		beforeEach(async () => {
			testDir = join(
				process.cwd(),
				"test-temp",
				`test-fileref-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			);
			await mkdir(testDir, { recursive: true });
		});

		afterEach(async () => {
			await rm(testDir, { recursive: true, force: true });
		});

		test("should keep only CLAUDE.md when AGENTS.md is @CLAUDE.md reference", async () => {
			await writeFile(join(testDir, "AGENTS.md"), "@CLAUDE.md\n");
			await writeFile(
				join(testDir, "CLAUDE.md"),
				"# Real Content\n\nActual instructions here.\n",
			);

			const files = await findAgentsFiles(testDir);

			expect(files.length).toBe(1);
			expect(files[0]).toContain("CLAUDE.md");
			expect(files[0]).not.toContain("AGENTS.md");
		});

		test("should keep only AGENTS.md when CLAUDE.md is @AGENTS.md reference", async () => {
			await writeFile(
				join(testDir, "AGENTS.md"),
				"# Real Content\n\nActual instructions here.\n",
			);
			await writeFile(join(testDir, "CLAUDE.md"), "@AGENTS.md\n");

			const files = await findAgentsFiles(testDir);

			expect(files.length).toBe(1);
			expect(files[0]).toContain("AGENTS.md");
		});

		test("should keep only CLAUDE.md for dotslash variant @./CLAUDE.md", async () => {
			await writeFile(join(testDir, "AGENTS.md"), "@./CLAUDE.md");
			await writeFile(
				join(testDir, "CLAUDE.md"),
				"# Real Content\n\nActual instructions here.\n",
			);

			const files = await findAgentsFiles(testDir);

			expect(files.length).toBe(1);
			expect(files[0]).toContain("CLAUDE.md");
		});

		test("should keep both files when reference has extra content", async () => {
			await writeFile(
				join(testDir, "AGENTS.md"),
				"@CLAUDE.md\n# Extra content",
			);
			await writeFile(join(testDir, "CLAUDE.md"), "# Different content here\n");

			const files = await findAgentsFiles(testDir);

			expect(files.length).toBe(2);
			expect(files.some((f) => f.endsWith("AGENTS.md"))).toBe(true);
			expect(files.some((f) => f.endsWith("CLAUDE.md"))).toBe(true);
		});
	});

	describe("Claude Code Rules Files Discovery", () => {
		let testDir: string;

		beforeEach(async () => {
			testDir = join(
				process.cwd(),
				"test-temp",
				`test-rules-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
			);
			await mkdir(testDir, { recursive: true });
		});

		afterEach(async () => {
			await rm(testDir, { recursive: true, force: true });
		});

		test("should find .claude/rules/*.md files", async () => {
			const rulesDir = join(testDir, ".claude", "rules");
			await mkdir(rulesDir, { recursive: true });
			await writeFile(join(rulesDir, "changelog.md"), "# Changelog Rules");

			const files = await findClaudeRulesFiles(testDir);

			expect(files.length).toBe(1);
			expect(files[0]).toContain(".claude/rules/changelog.md");
		});

		test("should find nested .claude/rules/ files", async () => {
			const nestedDir = join(testDir, ".claude", "rules", "frontend");
			await mkdir(nestedDir, { recursive: true });
			await writeFile(join(nestedDir, "react.md"), "# React Rules");

			const files = await findClaudeRulesFiles(testDir);

			expect(files.length).toBe(1);
			expect(files[0]).toContain(".claude/rules/frontend/react.md");
		});

		test("should find multiple .claude/rules/ files", async () => {
			const rulesDir = join(testDir, ".claude", "rules");
			await mkdir(rulesDir, { recursive: true });
			await writeFile(join(rulesDir, "changelog.md"), "# Changelog Rules");
			await writeFile(join(rulesDir, "commit.md"), "# Commit Rules");

			const files = await findClaudeRulesFiles(testDir);

			expect(files.length).toBe(2);
			expect(files.some((f) => f.includes("changelog.md"))).toBe(true);
			expect(files.some((f) => f.includes("commit.md"))).toBe(true);
		});

		test("should exclude hidden directories within .claude/rules", async () => {
			const rulesDir = join(testDir, ".claude", "rules");
			await mkdir(rulesDir, { recursive: true });
			await writeFile(join(rulesDir, "active.md"), "# Active Rules");

			// Create hidden directory that should be excluded
			const hiddenDir = join(rulesDir, ".archived");
			await mkdir(hiddenDir, { recursive: true });
			await writeFile(join(hiddenDir, "old-rule.md"), "# Old Rules");

			const files = await findClaudeRulesFiles(testDir);

			expect(files.length).toBe(1);
			expect(files[0]).toContain("active.md");
			expect(files.some((f) => f.includes(".archived"))).toBe(false);
		});

		test("should find .claude/rules in nested packages", async () => {
			// Create rules in nested package
			const nestedRulesDir = join(
				testDir,
				"packages",
				"api",
				".claude",
				"rules",
			);
			await mkdir(nestedRulesDir, { recursive: true });
			await writeFile(join(nestedRulesDir, "api-rules.md"), "# API Rules");

			const files = await findClaudeRulesFiles(testDir);

			expect(files.length).toBe(1);
			expect(files[0]).toContain("packages/api/.claude/rules/api-rules.md");
		});

		test("should only find .md files in rules directory", async () => {
			const rulesDir = join(testDir, ".claude", "rules");
			await mkdir(rulesDir, { recursive: true });
			await writeFile(join(rulesDir, "valid.md"), "# Valid Rule");
			await writeFile(join(rulesDir, "notvalid.txt"), "Not a markdown file");
			await writeFile(join(rulesDir, "also-not-valid"), "No extension");

			const files = await findClaudeRulesFiles(testDir);

			expect(files.length).toBe(1);
			expect(files[0]).toContain("valid.md");
		});

		test("should integrate rules files into findAgentsFiles", async () => {
			// Create AGENTS.md in root
			await writeFile(join(testDir, "AGENTS.md"), "# AGENTS content");

			// Create CLAUDE.md in root
			await writeFile(join(testDir, "CLAUDE.md"), "# CLAUDE content different");

			// Create rules file
			const rulesDir = join(testDir, ".claude", "rules");
			await mkdir(rulesDir, { recursive: true });
			await writeFile(join(rulesDir, "changelog.md"), "# Changelog Rules");

			const files = await findAgentsFiles(testDir);

			expect(files.length).toBe(3);
			expect(files.some((f) => f.endsWith("AGENTS.md"))).toBe(true);
			expect(files.some((f) => f.endsWith("CLAUDE.md"))).toBe(true);
			expect(files.some((f) => f.includes(".claude/rules/changelog.md"))).toBe(
				true,
			);
		});

		test("should respect maxDepth for rules files", async () => {
			// Create rules at root level
			const rootRulesDir = join(testDir, ".claude", "rules");
			await mkdir(rootRulesDir, { recursive: true });
			await writeFile(join(rootRulesDir, "root-rule.md"), "# Root Rule");

			// Create rules at nested level (depth 3)
			const nestedRulesDir = join(
				testDir,
				"packages",
				"api",
				".claude",
				"rules",
			);
			await mkdir(nestedRulesDir, { recursive: true });
			await writeFile(join(nestedRulesDir, "nested-rule.md"), "# Nested Rule");

			// With maxDepth=2, should only find root rules
			const filesDepth2 = await findClaudeRulesFiles(testDir, 2);
			expect(filesDepth2.length).toBe(1);
			expect(filesDepth2[0]).toContain("root-rule.md");

			// With maxDepth=5, should find both
			const filesDepth5 = await findClaudeRulesFiles(testDir, 5);
			expect(filesDepth5.length).toBe(2);
		});

		test("should log verbose output for rules discovery", async () => {
			const rulesDir = join(testDir, ".claude", "rules");
			await mkdir(rulesDir, { recursive: true });
			await writeFile(join(rulesDir, "test.md"), "# Test Rule");

			// Capture console output
			const logs: string[] = [];
			const originalLog = console.log;
			console.log = (...args: unknown[]) => {
				logs.push(args.join(" "));
			};

			try {
				await findClaudeRulesFiles(testDir, undefined, true);

				// Should have logged rules discovery
				const hasRulesLog = logs.some(
					(log) =>
						log.includes("[FileFinder]") &&
						log.includes("Claude Code rules file"),
				);
				expect(hasRulesLog).toBe(true);
			} finally {
				console.log = originalLog;
			}
		});
	});
});
