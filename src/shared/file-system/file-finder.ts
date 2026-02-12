import { lstat, readFile, realpath } from "fs/promises";
import { glob } from "glob";
import { basename, dirname, resolve } from "path";
import { detectCrossReference } from "./file-reference-detector";

/**
 * Find all Claude Code rules files (.claude/rules/ *.md) recursively.
 * Excludes hidden directories within .claude/rules (e.g., .archived/, .backup/).
 * @param baseDir - The base directory to search in
 * @param maxDepth - Maximum directory depth. undefined = unlimited
 * @param verbose - If true, log debug information
 * @returns Array of absolute paths to rules files
 */
export async function findClaudeRulesFiles(
	baseDir: string = process.cwd(),
	maxDepth?: number,
	verbose?: boolean,
): Promise<string[]> {
	const globOptions = {
		cwd: baseDir,
		absolute: true,
		nocase: true,
		dot: true, // Include .claude directory
		ignore: [
			"**/node_modules/**",
			"**/dist/**",
			"**/build/**",
			"**/.git/**",
			"**/vendor/**",
			"**/coverage/**",
		],
	};

	// Search for .claude/rules/**/*.md at any depth
	const rulesFiles = await glob("**/.claude/rules/**/*.md", globOptions);

	// Filter out hidden directories within .claude/rules
	// Pattern: /.claude/rules/.<hidden>/
	const filteredFiles = rulesFiles.filter((file) => {
		// Check if any path segment after ".claude/rules/" starts with a dot
		const rulesIndex = file.indexOf(".claude/rules/");
		if (rulesIndex === -1) return true; // Safety check

		const afterRulesPath = file.slice(rulesIndex + ".claude/rules/".length);
		const segments = afterRulesPath.split("/");

		// Check all segments except the last one (the filename)
		for (let i = 0; i < segments.length - 1; i++) {
			if (segments[i]!.startsWith(".")) {
				if (verbose) {
					console.log(
						`[FileFinder] Excluded hidden directory: ${file} (segment: ${segments[i]})`,
					);
				}
				return false;
			}
		}
		return true;
	});

	// Filter by depth if maxDepth is specified
	let result = filteredFiles;
	if (maxDepth !== undefined) {
		const normalizedBaseDir = resolve(baseDir);
		result = filteredFiles.filter((file) => {
			const relativePath = file.slice(normalizedBaseDir.length + 1);
			const depth = relativePath.split("/").length - 1;
			return depth <= maxDepth;
		});
	}

	if (verbose && result.length > 0) {
		console.log(
			`[FileFinder] Found ${result.length} Claude Code rules file(s)`,
		);
	}

	return result;
}

/**
 * Resolve symlinks and deduplicate files that point to the same target.
 * Handles circular symlinks, broken symlinks, and permission errors gracefully.
 * @param files - List of absolute file paths (may include symlinks)
 * @param verbose - If true, log symlink relationships and errors
 * @returns Deduplicated list of file paths (symlinks resolved to unique targets)
 */
async function resolveSymlinks(
	files: string[],
	verbose: boolean = false,
): Promise<string[]> {
	const canonicalMap = new Map<string, string>(); // canonical path → first discovered file
	const result: string[] = [];

	for (const file of files) {
		try {
			const stats = await lstat(file);

			if (!stats.isSymbolicLink()) {
				// Regular file - track its canonical path for deduplication against symlinks
				const canonical = await realpath(file);
				if (!canonicalMap.has(canonical)) {
					canonicalMap.set(canonical, file);
					result.push(file);
				} else if (verbose) {
					console.log(
						`[FileFinder] Deduplicated: ${file} (same target as ${canonicalMap.get(canonical)})`,
					);
				}
				continue;
			}

			// Symlink detected - resolve to canonical path
			try {
				const canonical = await realpath(file);

				if (canonicalMap.has(canonical)) {
					// Duplicate - skip this symlink as we already have a file pointing to this target
					if (verbose) {
						console.log(
							`[FileFinder] Deduplicated symlink: ${file} → ${canonical} (same target as ${canonicalMap.get(canonical)})`,
						);
					}
					continue;
				}

				// New target - keep this symlink
				if (verbose) {
					console.log(`[FileFinder] Symlink: ${file} → ${canonical}`);
				}
				result.push(file);
				canonicalMap.set(canonical, file);
			} catch (error) {
				// Handle symlink-specific errors
				const nodeError = error as NodeJS.ErrnoException;
				if (nodeError.code === "ELOOP") {
					if (verbose) {
						console.warn(`[FileFinder] Circular symlink detected: ${file}`);
					}
				} else if (nodeError.code === "ENOENT") {
					if (verbose) {
						console.warn(
							`[FileFinder] Broken symlink: ${file} (target not found)`,
						);
					}
				} else if (nodeError.code === "EACCES") {
					if (verbose) {
						console.warn(`[FileFinder] Permission denied for symlink: ${file}`);
					}
				} else {
					if (verbose) {
						console.warn(
							`[FileFinder] Error resolving symlink ${file}:`,
							error,
						);
					}
				}
				// Skip problematic symlinks
				continue;
			}
		} catch (error) {
			// lstat failed - include file anyway (graceful degradation)
			if (verbose) {
				console.warn(`[FileFinder] Error checking ${file}:`, error);
			}
			result.push(file);
		}
	}

	return result;
}

/**
 * Find all AGENTS.md, CLAUDE.md, and Copilot instruction files recursively in a directory.
 * These are "context files" - all serve the same purpose of providing AI agent instructions.
 * - AGENTS.md and CLAUDE.md: General AI agent instructions
 * - copilot-instructions.md: Github Copilot instructions (in .github/ directory)
 * - *.instructions.md: Github Copilot instructions (in .github/instructions/ directory)
 * Excludes node_modules and other common ignore patterns.
 * @param baseDir - The base directory to search in
 * @param maxDepth - Maximum directory depth (0 = root only, 1 = root + 1 level, etc.). undefined = unlimited
 * @param verbose - If true, log debug information about deduplication
 */
export async function findAgentsFiles(
	baseDir: string = process.cwd(),
	maxDepth?: number,
	verbose?: boolean,
): Promise<string[]> {
	const globOptions = {
		cwd: baseDir,
		absolute: true,
		nocase: true, // Match AGENTS.md, agents.md, Agents.md, CLAUDE.md, claude.md, etc.
		dot: true, // Include hidden directories (e.g., .claude/, .github/)
		ignore: [
			"**/node_modules/**",
			"**/dist/**",
			"**/build/**",
			"**/.git/**",
			"**/vendor/**",
			"**/coverage/**",
		],
	};

	// Search for AGENTS.md, CLAUDE.md, copilot-instructions.md, *.instructions.md, and .claude/rules/*.md patterns
	const [agentsFiles, claudeFiles, copilotFiles, instructionFiles, rulesFiles] =
		await Promise.all([
			glob("**/AGENTS.md", globOptions),
			glob("**/CLAUDE.md", globOptions),
			glob("**/.github/**/copilot-instructions.md", globOptions),
			glob("**/.github/instructions/**/*.instructions.md", globOptions),
			findClaudeRulesFiles(baseDir, maxDepth, verbose),
		]);

	// Combine results
	const allFiles = [
		...agentsFiles,
		...claudeFiles,
		...copilotFiles,
		...instructionFiles,
		...rulesFiles,
	];

	// Filter by depth if maxDepth is specified
	let filteredFiles = allFiles;
	if (maxDepth !== undefined) {
		// Normalize base directory path
		const normalizedBaseDir = resolve(baseDir);

		filteredFiles = allFiles.filter((file) => {
			// Get the relative path from baseDir
			const relativePath = file.slice(normalizedBaseDir.length + 1);

			// Count directory separators to determine depth
			// depth 0 = file at root (AGENTS.md)
			// depth 1 = file one level down (subdir/AGENTS.md)
			const depth = relativePath.split("/").length - 1;

			return depth <= maxDepth;
		});
	}

	// Resolve symlinks and deduplicate files that point to the same target
	const symlinkResolvedFiles = await resolveSymlinks(filteredFiles, verbose);

	// Deduplicate files in the same directory with identical content (AGENTS.md vs CLAUDE.md)
	const deduplicatedFiles = await deduplicateContextFiles(
		symlinkResolvedFiles,
		verbose,
	);

	// Global deduplication for copilot-instructions.md files
	// If a copilot-instructions.md has identical content to any AGENTS.md or CLAUDE.md, exclude it
	const globallyDeduplicatedFiles = await deduplicateCopilotInstructions(
		deduplicatedFiles,
		verbose,
	);

	// Sort by path depth (shallower files first)
	return globallyDeduplicatedFiles.sort((a, b) => {
		const depthA = a.split("/").length;
		const depthB = b.split("/").length;
		return depthA - depthB;
	});
}

/**
 * Deduplicate context files (AGENTS.md and CLAUDE.md) in the same directory.
 * If both files exist in the same directory with identical content (after trimming whitespace),
 * keep only AGENTS.md to avoid redundant evaluation.
 * @param files - List of absolute file paths
 * @param verbose - If true, log debug information about deduplication
 * @returns Deduplicated list of file paths
 */
async function deduplicateContextFiles(
	files: string[],
	verbose?: boolean,
): Promise<string[]> {
	// Group files by directory
	const filesByDir = new Map<string, string[]>();
	for (const file of files) {
		const dir = dirname(file);
		if (!filesByDir.has(dir)) {
			filesByDir.set(dir, []);
		}
		filesByDir.get(dir)!.push(file);
	}

	const result: string[] = [];

	for (const [dir, filesInDir] of filesByDir) {
		// If only one file in directory, keep it
		if (filesInDir.length === 1) {
			result.push(filesInDir[0]!);
			continue;
		}

		// Find AGENTS.md and CLAUDE.md files (case-insensitive)
		const agentsFile = filesInDir.find(
			(f) => basename(f).toLowerCase() === "agents.md",
		);
		const claudeFile = filesInDir.find(
			(f) => basename(f).toLowerCase() === "claude.md",
		);

		// If both exist in same directory, compare contents
		if (agentsFile && claudeFile) {
			try {
				const [agentsContent, claudeContent] = await Promise.all([
					readFile(agentsFile, "utf-8"),
					readFile(claudeFile, "utf-8"),
				]);

				// Exact match after trimming whitespace
				if (agentsContent.trim() === claudeContent.trim()) {
					// Keep only AGENTS.md (preferred)
					if (verbose) {
						console.log(
							`[FileFinder] Deduplicated: ${claudeFile} (identical to ${agentsFile})`,
						);
					}
					result.push(agentsFile);
				} else {
					// Different content - check for @ file reference annotations
					const crossRef = detectCrossReference(agentsContent, claudeContent);
					if (crossRef.hasReference) {
						// One file is just a pointer, keep only the content file
						const contentFile =
							crossRef.contentFile === "agents" ? agentsFile : claudeFile;
						const pointerFile =
							crossRef.referenceFile === "agents" ? agentsFile : claudeFile;
						if (verbose) {
							console.log(
								`[FileFinder] Deduplicated: ${pointerFile} (file reference to ${contentFile})`,
							);
						}
						result.push(contentFile);
					} else {
						// Different content, keep both
						if (verbose) {
							console.log(
								`[FileFinder] Keeping both files in ${dir} (different content)`,
							);
						}
						result.push(agentsFile, claudeFile);
					}
				}
			} catch (error) {
				// If we can't read files, keep both to be safe
				if (verbose) {
					console.log(
						`[FileFinder] Error reading files in ${dir}, keeping both:`,
						error,
					);
				}
				result.push(agentsFile, claudeFile);
			}
		} else {
			// Only one type exists, add all files
			result.push(...filesInDir);
		}
	}

	return result;
}

/**
 * Check if a file is a Copilot instructions file (case-insensitive).
 * Matches both patterns:
 * - copilot-instructions.md (in .github/ directory)
 * - *.instructions.md (in .github/instructions/ directory)
 */
function isCopilotInstructionsFile(filePath: string): boolean {
	const filename = basename(filePath).toLowerCase();

	// Original pattern: copilot-instructions.md
	if (filename === "copilot-instructions.md") {
		return true;
	}

	// New pattern: *.instructions.md in .github/instructions/ directory
	if (
		filename.endsWith(".instructions.md") &&
		filePath.includes(".github/instructions/")
	) {
		return true;
	}

	return false;
}

/**
 * Global deduplication for copilot-instructions.md files.
 * If a copilot-instructions.md has identical content to ANY AGENTS.md or CLAUDE.md
 * in the repository (not just same directory), exclude it.
 * @param files - List of absolute file paths (already deduplicated within directories)
 * @param verbose - If true, log debug information about deduplication
 * @returns Deduplicated list of file paths
 */
async function deduplicateCopilotInstructions(
	files: string[],
	verbose?: boolean,
): Promise<string[]> {
	// Separate copilot-instructions.md files from others
	const copilotFiles = files.filter(isCopilotInstructionsFile);
	const otherFiles = files.filter((f) => !isCopilotInstructionsFile(f));

	// If no copilot files, nothing to deduplicate
	if (copilotFiles.length === 0) {
		return files;
	}

	// Read content of all AGENTS.md and CLAUDE.md files
	const otherContents = new Map<string, string>();
	await Promise.all(
		otherFiles.map(async (file) => {
			try {
				const content = await readFile(file, "utf-8");
				otherContents.set(file, content.trim());
			} catch {
				// Ignore read errors
			}
		}),
	);

	// Filter copilot files, excluding those with identical content to any other file
	const uniqueCopilotFiles: string[] = [];
	for (const copilotFile of copilotFiles) {
		try {
			const copilotContent = (await readFile(copilotFile, "utf-8")).trim();

			// Check if content matches any AGENTS.md or CLAUDE.md
			let isDuplicate = false;
			for (const [otherFile, otherContent] of otherContents) {
				if (copilotContent === otherContent) {
					if (verbose) {
						console.log(
							`[FileFinder] Deduplicated: ${copilotFile} (identical content to ${otherFile})`,
						);
					}
					isDuplicate = true;
					break;
				}
			}

			if (!isDuplicate) {
				uniqueCopilotFiles.push(copilotFile);
			}
		} catch {
			// If we can't read the copilot file, keep it to be safe
			uniqueCopilotFiles.push(copilotFile);
		}
	}

	return [...otherFiles, ...uniqueCopilotFiles];
}

/**
 * Get relative path from base directory
 */
export function getRelativePath(
	filePath: string,
	baseDir: string = process.cwd(),
): string {
	const resolved = resolve(baseDir);
	if (filePath.startsWith(resolved)) {
		return filePath.slice(resolved.length + 1);
	}
	return filePath;
}

/**
 * Find all CLAUDE.md files recursively in a directory.
 * @param baseDir - The base directory to search in
 * @param maxDepth - Maximum directory depth (0 = root only, 1 = root + 1 level, etc.). undefined = unlimited
 * @returns Array of absolute paths to CLAUDE.md files
 */
export async function findClaudeFiles(
	baseDir: string = process.cwd(),
	maxDepth?: number,
): Promise<string[]> {
	const globOptions = {
		cwd: baseDir,
		absolute: true,
		nocase: true,
		dot: true, // Include hidden directories (e.g., .claude/)
		ignore: [
			"**/node_modules/**",
			"**/dist/**",
			"**/build/**",
			"**/.git/**",
			"**/vendor/**",
			"**/coverage/**",
		],
	};

	const claudeFiles = await glob("**/CLAUDE.md", globOptions);

	// Filter by depth if maxDepth is specified
	let filteredFiles = claudeFiles;
	if (maxDepth !== undefined) {
		const normalizedBaseDir = resolve(baseDir);

		filteredFiles = claudeFiles.filter((file) => {
			const relativePath = file.slice(normalizedBaseDir.length + 1);
			const depth = relativePath.split("/").length - 1;
			return depth <= maxDepth;
		});
	}

	// Sort by path depth
	return filteredFiles.sort((a, b) => {
		const depthA = a.split("/").length;
		const depthB = b.split("/").length;
		return depthA - depthB;
	});
}

/**
 * Find pairs of AGENTS.md and CLAUDE.md in the same directory
 * @param baseDir - The base directory to search in
 * @param maxDepth - Maximum directory depth. undefined = unlimited
 * @returns Array of {directory, agentsPath, claudePath} for each colocated pair
 */
export async function findColocatedMdFiles(
	baseDir: string = process.cwd(),
	maxDepth?: number,
): Promise<
	Array<{
		directory: string;
		agentsPath: string;
		claudePath: string;
	}>
> {
	// Get both types of files
	const globOptions = {
		cwd: baseDir,
		absolute: true,
		nocase: true,
		dot: true, // Include hidden directories (e.g., .claude/)
		ignore: [
			"**/node_modules/**",
			"**/dist/**",
			"**/build/**",
			"**/.git/**",
			"**/vendor/**",
			"**/coverage/**",
		],
	};

	const [agentsFiles, claudeFiles] = await Promise.all([
		glob("**/AGENTS.md", globOptions),
		glob("**/CLAUDE.md", globOptions),
	]);

	// Apply depth filtering if specified
	const allFiles = [...agentsFiles, ...claudeFiles];
	let filteredFiles = allFiles;

	if (maxDepth !== undefined) {
		const normalizedBaseDir = resolve(baseDir);
		filteredFiles = allFiles.filter((file) => {
			const relativePath = file.slice(normalizedBaseDir.length + 1);
			const depth = relativePath.split("/").length - 1;
			return depth <= maxDepth;
		});
	}

	// Group by directory
	const filesByDir = new Map<string, string[]>();
	for (const file of filteredFiles) {
		const dir = dirname(file);
		if (!filesByDir.has(dir)) {
			filesByDir.set(dir, []);
		}
		filesByDir.get(dir)!.push(file);
	}

	// Find pairs where both exist
	const pairs: Array<{
		directory: string;
		agentsPath: string;
		claudePath: string;
	}> = [];

	for (const [dir, filesInDir] of filesByDir) {
		const agentsFile = filesInDir.find(
			(f) => basename(f).toLowerCase() === "agents.md",
		);
		const claudeFile = filesInDir.find(
			(f) => basename(f).toLowerCase() === "claude.md",
		);

		if (agentsFile && claudeFile) {
			pairs.push({
				directory: dir,
				agentsPath: agentsFile,
				claudePath: claudeFile,
			});
		}
	}

	return pairs;
}
