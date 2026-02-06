import fs from "node:fs/promises";
import path from "node:path";

export interface CleanupOptions {
	verbose?: boolean;
	preserveDebugOutput?: boolean;
}

export interface CleanupSummary {
	debugOutputCleaned: boolean;
	emptyDirsRemoved: string[];
	errors: string[];
}

/**
 * Main cleanup function - removes temporary data after successful evaluation
 * @param workingDir The working directory used for the evaluation
 * @param options Cleanup options
 * @returns Summary of what was cleaned up
 */
export async function cleanupTemporaryData(
	workingDir: string,
	options: CleanupOptions = {},
): Promise<CleanupSummary> {
	const summary: CleanupSummary = {
		debugOutputCleaned: false,
		emptyDirsRemoved: [],
		errors: [],
	};

	// Clean up debug output directory if not preserving
	if (!options.preserveDebugOutput) {
		try {
			summary.debugOutputCleaned = await cleanupDebugOutput(
				workingDir,
				options,
			);
		} catch (error) {
			const errorMsg = `Failed to cleanup debug output: ${error instanceof Error ? error.message : String(error)}`;
			summary.errors.push(errorMsg);
			if (options.verbose) {
				console.warn(`[Cleanup] ${errorMsg}`);
			}
		}
	}

	// Clean up empty parent directories (e.g., tmp/clones/, tmp/isolated-prompts/)
	// This runs for all evaluation types, including cloned repos
	const projectRoot = path.resolve(process.cwd());
	const tmpClonesPath = path.join(projectRoot, "tmp", "clones");
	const tmpIsolatedPromptsPath = path.join(
		projectRoot,
		"tmp",
		"isolated-prompts",
	);

	// Clean up tmp/clones/ directory
	try {
		const removedDirs = await cleanupEmptyParentDirs(
			tmpClonesPath,
			projectRoot,
			options,
		);
		summary.emptyDirsRemoved.push(...removedDirs);
	} catch (error) {
		const errorMsg = `Failed to cleanup empty directories: ${error instanceof Error ? error.message : String(error)}`;
		summary.errors.push(errorMsg);
		if (options.verbose) {
			console.warn(`[Cleanup] ${errorMsg}`);
		}
	}

	// Clean up tmp/isolated-prompts/ directory
	try {
		const removedDirs = await cleanupEmptyParentDirs(
			tmpIsolatedPromptsPath,
			projectRoot,
			options,
		);
		summary.emptyDirsRemoved.push(...removedDirs);
	} catch (error) {
		const errorMsg = `Failed to cleanup isolated prompts directories: ${error instanceof Error ? error.message : String(error)}`;
		summary.errors.push(errorMsg);
		if (options.verbose) {
			console.warn(`[Cleanup] ${errorMsg}`);
		}
	}

	return summary;
}

/**
 * Removes the debug-output directory from the working directory
 * @param workingDir The working directory
 * @param options Cleanup options
 * @returns true if directory was cleaned, false otherwise
 */
async function cleanupDebugOutput(
	workingDir: string,
	options: CleanupOptions = {},
): Promise<boolean> {
	const debugOutputPath = path.join(workingDir, "debug-output");

	try {
		// Check if directory exists
		await fs.stat(debugOutputPath);

		// Directory exists, remove it
		await fs.rm(debugOutputPath, { recursive: true, force: true });

		if (options.verbose) {
			console.log(
				`[Cleanup] Removed debug output directory: ${debugOutputPath}`,
			);
		}

		return true;
	} catch (error) {
		// If ENOENT, directory doesn't exist - that's fine
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			if (options.verbose) {
				console.log(
					`[Cleanup] Debug output directory does not exist: ${debugOutputPath}`,
				);
			}
			return false;
		}

		// Other errors should be logged but not thrown
		if (options.verbose) {
			console.warn(
				`[Cleanup] Failed to remove debug output: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		return false;
	}
}

/**
 * Removes empty parent directories walking up the tree until hitting a non-empty directory or stopAt path
 * @param startPath The starting path to check
 * @param stopAt The root path to stop at (won't be deleted)
 * @param options Cleanup options
 * @returns Array of removed directory paths
 */
async function cleanupEmptyParentDirs(
	startPath: string,
	stopAt: string,
	options: CleanupOptions = {},
): Promise<string[]> {
	const removed: string[] = [];
	let currentPath = startPath;

	// Normalize paths for comparison
	const normalizedStopAt = path.resolve(stopAt);

	while (true) {
		const normalizedCurrent = path.resolve(currentPath);

		// Stop if we've reached the stopAt boundary
		if (normalizedCurrent === normalizedStopAt) {
			break;
		}

		// Stop if we've reached the parent of stopAt (safety check)
		if (!normalizedCurrent.startsWith(normalizedStopAt)) {
			break;
		}

		try {
			// Check if directory exists
			const stat = await fs.stat(currentPath);

			if (!stat.isDirectory()) {
				break;
			}

			// Check if directory is empty
			const entries = await fs.readdir(currentPath);

			if (entries.length === 0) {
				// Directory is empty, remove it
				await fs.rmdir(currentPath);
				removed.push(currentPath);

				if (options.verbose) {
					console.log(`[Cleanup] Removed empty directory: ${currentPath}`);
				}

				// Move up to parent directory
				const parentPath = path.dirname(currentPath);
				if (parentPath === currentPath) {
					// Reached filesystem root
					break;
				}
				currentPath = parentPath;
			} else {
				// Directory is not empty, stop here
				if (options.verbose) {
					console.log(
						`[Cleanup] Directory not empty, stopping: ${currentPath}`,
					);
				}
				break;
			}
		} catch (error) {
			// If ENOENT, directory doesn't exist - move to parent
			if (
				error instanceof Error &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				const parentPath = path.dirname(currentPath);
				if (parentPath === currentPath) {
					break;
				}
				currentPath = parentPath;
				continue;
			}

			// Other errors - log and stop
			if (options.verbose) {
				console.warn(
					`[Cleanup] Error checking directory ${currentPath}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
			break;
		}
	}

	return removed;
}
