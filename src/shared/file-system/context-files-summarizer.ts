import type { IContextFile } from "@shared/types/evaluation";
import { readFile } from "fs/promises";
import { basename } from "path";
import { getRelativePath } from "./file-finder";

/**
 * Options for context file summarization
 */
export interface IContextFilesSummaryOptions {
	/** Enable verbose logging */
	verbose?: boolean;
	/** Maximum content length per file before truncation (default: 50000) */
	maxContentLength?: number;
}

/**
 * Result of context file summarization
 */
export interface IContextFilesSummaryResult {
	/** Context files with content and AI summaries */
	contextFiles: IContextFile[];
	/** Total files processed */
	totalProcessed: number;
}

/**
 * Determine the type of context file based on its path and filename
 */
export function getContextFileType(
	filePath: string,
): "agents" | "claude" | "copilot" | "rules" | "cursor-rules" | "skills" {
	// Check for cursor rules first (path-based detection)
	if (filePath.includes(".cursor/rules/")) {
		return "cursor-rules";
	}

	// Check for skills files (path-based detection across all agent directories)
	if (
		filePath.includes(".cursor/skills/") ||
		filePath.includes(".claude/skills/") ||
		filePath.includes(".agents/skills/") ||
		filePath.includes(".github/skills/")
	) {
		return "skills";
	}

	// Check for Claude Code rules files (path-based detection)
	if (filePath.includes(".claude/rules/")) {
		return "rules";
	}

	const filename = basename(filePath).toLowerCase();

	if (filename.includes("agents")) {
		return "agents";
	}
	if (filename.includes("claude")) {
		return "claude";
	}
	if (filename.includes("copilot")) {
		return "copilot";
	}

	// New pattern: *.instructions.md in .github/instructions/ directory
	if (
		filename.endsWith(".instructions.md") &&
		filePath.includes(".github/instructions/")
	) {
		return "copilot";
	}

	// Default to agents for unknown types
	return "agents";
}

/**
 * Extract globs field from YAML frontmatter in rules files.
 * Returns the raw globs string for UI display.
 * Supports both single-line and multi-line YAML array formats.
 */
export function extractGlobsFromFrontmatter(
	content: string,
): string | undefined {
	// Match YAML frontmatter block
	const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
	if (!frontmatterMatch) return undefined;

	const yaml = frontmatterMatch[1];
	if (!yaml) return undefined;

	// Try single-line format first: globs: "pattern" or globs: pattern
	const singleLineMatch = yaml.match(/^globs:\s*(.+)/m);
	if (singleLineMatch) {
		const value = singleLineMatch[1]!.trim();
		// Remove surrounding quotes if present
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			return value.slice(1, -1);
		}
		// Handle array notation on single line: [pattern1, pattern2]
		if (value.startsWith("[") && value.endsWith("]")) {
			return value;
		}
		return value;
	}

	return undefined;
}

/**
 * Extract description field from YAML frontmatter.
 * Returns the raw description string for UI display.
 */
export function extractDescriptionFromFrontmatter(
	content: string,
): string | undefined {
	const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
	if (!frontmatterMatch) return undefined;

	const yaml = frontmatterMatch[1];
	if (!yaml) return undefined;

	const match = yaml.match(/^description:\s*(.+)/m);
	if (!match) return undefined;

	const value = match[1]!.trim();
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}
	return value;
}

/**
 * Extract alwaysApply boolean field from YAML frontmatter.
 */
export function extractAlwaysApplyFromFrontmatter(
	content: string,
): boolean | undefined {
	const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
	if (!frontmatterMatch) return undefined;

	const yaml = frontmatterMatch[1];
	if (!yaml) return undefined;

	const match = yaml.match(/^alwaysApply:\s*(.+)/m);
	if (!match) return undefined;

	const value = match[1]!.trim().toLowerCase();
	if (value === "true") return true;
	if (value === "false") return false;
	return undefined;
}

/**
 * Read file content with optional truncation
 */
async function readFileWithLimit(
	filePath: string,
	maxLength: number,
): Promise<string | null> {
	try {
		const content = await readFile(filePath, "utf-8");

		if (content.length > maxLength) {
			// Truncate at a newline boundary if possible
			const truncated = content.slice(0, maxLength);
			const lastNewline = truncated.lastIndexOf("\n");

			return lastNewline > maxLength * 0.8
				? `${truncated.slice(0, lastNewline)}\n\n[Content truncated...]`
				: `${truncated}\n\n[Content truncated...]`;
		}

		return content;
	} catch {
		return null; // File not found or read error
	}
}

/**
 * Load context files (AGENTS.md, CLAUDE.md, copilot-instructions.md).
 * Reads content from each file without AI summarization.
 * Context files don't need AI summaries since their content is already
 * structured for AI agents to consume directly.
 *
 * @param agentsFiles - Absolute paths to context files
 * @param baseDir - Repository base directory
 * @param options - Load options
 * @returns Result with context files (no AI summaries)
 */
export async function summarizeContextFiles(
	agentsFiles: string[],
	baseDir: string,
	options: IContextFilesSummaryOptions,
): Promise<IContextFilesSummaryResult> {
	const { verbose = false, maxContentLength = 50000 } = options;

	if (agentsFiles.length === 0) {
		return {
			contextFiles: [],
			totalProcessed: 0,
		};
	}

	if (verbose) {
		console.log(
			`[ContextFilesSummarizer] Loading ${agentsFiles.length} context file(s)`,
		);
	}

	const contextFiles: IContextFile[] = [];

	// Process files sequentially (no AI calls, just file reads)
	for (const filePath of agentsFiles) {
		const relativePath = getRelativePath(filePath, baseDir);
		const content = await readFileWithLimit(filePath, maxContentLength);

		if (content === null) {
			if (verbose) {
				console.log(
					`[ContextFilesSummarizer] Could not read file: ${relativePath}`,
				);
			}
			continue;
		}

		const type = getContextFileType(filePath);

		// Extract globs from frontmatter for rules files and cursor rules
		const globs =
			type === "rules" || type === "cursor-rules"
				? extractGlobsFromFrontmatter(content)
				: undefined;

		// Extract cursor-rules specific frontmatter fields
		const description =
			type === "cursor-rules"
				? extractDescriptionFromFrontmatter(content)
				: undefined;
		const alwaysApply =
			type === "cursor-rules"
				? extractAlwaysApplyFromFrontmatter(content)
				: undefined;

		contextFiles.push({
			path: relativePath,
			type,
			content,
			globs,
			description,
			alwaysApply,
			// No AI summary - context files are structured for direct consumption
		});
	}

	// Sort by path depth (shallower first)
	contextFiles.sort((a, b) => {
		const depthA = a.path.split("/").length;
		const depthB = b.path.split("/").length;
		return depthA - depthB;
	});

	if (verbose) {
		console.log(
			`[ContextFilesSummarizer] Loaded ${contextFiles.length} context file(s)`,
		);
	}

	return {
		contextFiles,
		totalProcessed: agentsFiles.length,
	};
}
