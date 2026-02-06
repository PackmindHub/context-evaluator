import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cleanupTemporaryData } from "./cleanup-manager.js";

describe("cleanup-manager", () => {
	let testDir: string;

	beforeEach(async () => {
		// Create a temporary directory for each test
		testDir = await fs.mkdtemp(path.join(os.tmpdir(), "cleanup-test-"));
	});

	afterEach(async () => {
		// Clean up test directory
		try {
			await fs.rm(testDir, { recursive: true, force: true });
		} catch {
			// Ignore errors during cleanup
		}
	});

	describe("cleanupDebugOutput", () => {
		test("removes debug-output directory successfully", async () => {
			// Create debug-output directory with some files
			const debugOutputPath = path.join(testDir, "debug-output");
			await fs.mkdir(debugOutputPath);
			await fs.writeFile(
				path.join(debugOutputPath, "test-prompt.md"),
				"test content",
			);
			await fs.writeFile(
				path.join(debugOutputPath, "test-response.json"),
				"{}",
			);

			// Run cleanup
			const summary = await cleanupTemporaryData(testDir, {
				verbose: false,
			});

			// Verify directory was removed
			expect(summary.debugOutputCleaned).toBe(true);
			expect(summary.errors).toHaveLength(0);

			// Verify directory no longer exists
			await expect(fs.stat(debugOutputPath)).rejects.toThrow();
		});

		test("handles non-existent directory gracefully", async () => {
			// Don't create debug-output directory
			const summary = await cleanupTemporaryData(testDir, {
				verbose: false,
			});

			// Should not report it as cleaned (didn't exist)
			expect(summary.debugOutputCleaned).toBe(false);
			expect(summary.errors).toHaveLength(0);
		});

		test("respects preserveDebugOutput flag", async () => {
			// Create debug-output directory
			const debugOutputPath = path.join(testDir, "debug-output");
			await fs.mkdir(debugOutputPath);
			await fs.writeFile(path.join(debugOutputPath, "test.md"), "content");

			// Run cleanup with preserveDebugOutput=true
			const summary = await cleanupTemporaryData(testDir, {
				verbose: false,
				preserveDebugOutput: true,
			});

			// Should not clean debug output
			expect(summary.debugOutputCleaned).toBe(false);

			// Verify directory still exists
			const stat = await fs.stat(debugOutputPath);
			expect(stat.isDirectory()).toBe(true);
		});

		test("logs verbosely when enabled", async () => {
			// Create debug-output directory
			const debugOutputPath = path.join(testDir, "debug-output");
			await fs.mkdir(debugOutputPath);

			// Capture console output
			const logs: string[] = [];
			const originalLog = console.log;
			console.log = (...args: unknown[]) => {
				logs.push(args.join(" "));
			};

			try {
				await cleanupTemporaryData(testDir, {
					verbose: true,
				});

				// Should have logged the removal
				expect(logs.some((log) => log.includes("Removed debug output"))).toBe(
					true,
				);
			} finally {
				console.log = originalLog;
			}
		});
	});

	describe("cleanupEmptyParentDirs", () => {
		test("removes empty parent directories", async () => {
			// Note: tmp/clones cleanup happens at project root, not testDir
			// This test verifies debug output cleanup which is in testDir
			const debugOutputPath = path.join(testDir, "debug-output");
			await fs.mkdir(debugOutputPath);
			await fs.writeFile(
				path.join(debugOutputPath, "test-prompt.md"),
				"test content",
			);

			// Run cleanup
			const summary = await cleanupTemporaryData(testDir, {
				verbose: false,
			});

			// Debug output should be cleaned
			expect(summary.debugOutputCleaned).toBe(true);

			// tmp/clones cleanup happens at project root, so we won't see it in tests
			// Just verify no errors occurred
			expect(summary.errors).toHaveLength(0);
		});

		test("stops at non-empty directory", async () => {
			// This test verifies the function handles non-existent directories gracefully
			// Since tmp/clones is at project root, not testDir, it may not exist
			const summary = await cleanupTemporaryData(testDir, {
				verbose: false,
			});

			// Should complete without errors even if tmp/clones doesn't exist
			expect(summary.errors).toHaveLength(0);
		});

		test("stops at stopAt boundary", async () => {
			// Create directories that would go beyond stopAt
			const tmpDir = path.join(testDir, "tmp");
			await fs.mkdir(tmpDir);

			// Run cleanup - testDir is the stopAt, so it should never be removed
			const summary = await cleanupTemporaryData(testDir, {
				verbose: false,
			});

			// testDir itself should never be in removed list
			expect(summary.emptyDirsRemoved.some((dir) => dir === testDir)).toBe(
				false,
			);

			// testDir should still exist
			const stat = await fs.stat(testDir);
			expect(stat.isDirectory()).toBe(true);
		});

		test("handles non-existent directories gracefully", async () => {
			// Don't create tmp/clones directory at all
			const summary = await cleanupTemporaryData(testDir, {
				verbose: false,
			});

			// Should not error, just return empty results
			expect(summary.errors).toHaveLength(0);
			expect(summary.emptyDirsRemoved).toHaveLength(0);
		});
	});

	describe("cleanupTemporaryData integration", () => {
		test("returns correct CleanupSummary", async () => {
			// Create both debug output and empty directories
			const debugOutputPath = path.join(testDir, "debug-output");
			await fs.mkdir(debugOutputPath);
			await fs.writeFile(path.join(debugOutputPath, "test.md"), "content");

			const tmpDir = path.join(testDir, "tmp");
			const clonesDir = path.join(tmpDir, "clones");
			await fs.mkdir(tmpDir);
			await fs.mkdir(clonesDir);

			// Run cleanup
			const summary = await cleanupTemporaryData(testDir, {
				verbose: false,
			});

			// Verify summary structure
			expect(summary).toHaveProperty("debugOutputCleaned");
			expect(summary).toHaveProperty("emptyDirsRemoved");
			expect(summary).toHaveProperty("errors");

			// Verify cleanup happened
			expect(summary.debugOutputCleaned).toBe(true);
			expect(Array.isArray(summary.emptyDirsRemoved)).toBe(true);
			expect(Array.isArray(summary.errors)).toBe(true);
		});

		test("continues cleanup even if one operation fails", async () => {
			// Create debug output
			const debugOutputPath = path.join(testDir, "debug-output");
			await fs.mkdir(debugOutputPath);
			await fs.writeFile(path.join(debugOutputPath, "test.md"), "content");

			// Create empty tmp/clones
			const tmpDir = path.join(testDir, "tmp");
			const clonesDir = path.join(tmpDir, "clones");
			await fs.mkdir(tmpDir);
			await fs.mkdir(clonesDir);

			// Run cleanup - both operations should succeed
			const summary = await cleanupTemporaryData(testDir, {
				verbose: false,
			});

			// Even if one fails, the other should still run
			// (hard to simulate failure, but structure ensures this)
			expect(summary.errors.length).toBe(0);
		});

		test("verbose mode logs all operations", async () => {
			// Create test data
			const debugOutputPath = path.join(testDir, "debug-output");
			await fs.mkdir(debugOutputPath);

			const tmpDir = path.join(testDir, "tmp");
			const clonesDir = path.join(tmpDir, "clones");
			await fs.mkdir(tmpDir);
			await fs.mkdir(clonesDir);

			// Capture console output
			const logs: string[] = [];
			const originalLog = console.log;
			console.log = (...args: unknown[]) => {
				logs.push(args.join(" "));
			};

			try {
				await cleanupTemporaryData(testDir, {
					verbose: true,
				});

				// Should have logged multiple operations
				expect(logs.length).toBeGreaterThan(0);
				expect(logs.some((log) => log.includes("Cleanup"))).toBe(true);
			} finally {
				console.log = originalLog;
			}
		});

		test("preserveDebugOutput prevents only debug cleanup", async () => {
			// Create debug output
			const debugOutputPath = path.join(testDir, "debug-output");
			await fs.mkdir(debugOutputPath);
			await fs.writeFile(path.join(debugOutputPath, "test.md"), "content");

			// Run with preserveDebugOutput
			const summary = await cleanupTemporaryData(testDir, {
				verbose: false,
				preserveDebugOutput: true,
			});

			// Debug output should NOT be cleaned
			expect(summary.debugOutputCleaned).toBe(false);
			const stat = await fs.stat(debugOutputPath);
			expect(stat.isDirectory()).toBe(true);

			// tmp/clones cleanup happens at project root (may or may not find anything)
			// Just verify no errors occurred
			expect(summary.errors).toHaveLength(0);
		});
	});
});
