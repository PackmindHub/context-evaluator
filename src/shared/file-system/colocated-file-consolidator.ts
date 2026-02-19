import { basename, dirname, relative } from "node:path";

export interface ColocatedPair {
	directory: string;
	agentsPath: string;
	claudePath: string;
}

/**
 * Identify directories where both AGENTS.md and CLAUDE.md coexist with different content.
 * These pairs have already survived deduplication (identical content and cross-references removed),
 * so any remaining pairs contain genuinely different content.
 *
 * @param files - Absolute paths to discovered context files (post-deduplication)
 * @param baseDir - Base directory for computing relative paths
 * @returns Array of colocated pairs with relative paths
 */
export function identifyColocatedPairs(
	files: string[],
	baseDir: string,
): ColocatedPair[] {
	const filesByDir = new Map<string, string[]>();
	for (const file of files) {
		const dir = dirname(file);
		if (!filesByDir.has(dir)) {
			filesByDir.set(dir, []);
		}
		filesByDir.get(dir)!.push(file);
	}

	const pairs: ColocatedPair[] = [];

	for (const [dir, filesInDir] of filesByDir) {
		const agentsFile = filesInDir.find(
			(f) => basename(f).toLowerCase() === "agents.md",
		);
		const claudeFile = filesInDir.find(
			(f) => basename(f).toLowerCase() === "claude.md",
		);

		if (agentsFile && claudeFile) {
			const relDir = relative(baseDir, dir) || ".";
			pairs.push({
				directory: relDir,
				agentsPath: relative(baseDir, agentsFile),
				claudePath: relative(baseDir, claudeFile),
			});
		}
	}

	return pairs;
}

/**
 * Filter out CLAUDE.md entries from a file list for directories that have a colocated pair.
 * AGENTS.md becomes the sole source of truth for evaluation.
 *
 * @param files - Absolute paths to context files
 * @param pairs - Colocated pairs identified by identifyColocatedPairs
 * @param baseDir - Base directory for computing relative paths
 * @returns Filtered list of absolute paths with colocated CLAUDE.md files removed
 */
export function filterConsolidatedPaths(
	files: string[],
	pairs: ColocatedPair[],
	baseDir: string,
): string[] {
	if (pairs.length === 0) return files;

	const claudeRelPaths = new Set(pairs.map((p) => p.claudePath));

	return files.filter((f) => {
		const relPath = relative(baseDir, f);
		return !claudeRelPaths.has(relPath);
	});
}
