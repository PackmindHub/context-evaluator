import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { glob } from "glob";
import { basename, dirname, resolve } from "path";
import { getRelativePath } from "./file-finder";

/**
 * Represents an Agent Skill found in a SKILL.md file.
 * Skills provide specialized capabilities that can fill documentation gaps.
 */
export interface ISkill {
	name: string; // Name from YAML frontmatter
	description: string; // Description from YAML frontmatter
	path: string; // Relative path to SKILL.md file (e.g., "skills/react-patterns/SKILL.md")
	directory: string; // Parent directory name (e.g., "react-patterns")
	summary?: string; // AI-generated summary (more detailed than description)
	contentHash?: string; // SHA-256 hash of content (for deduplication)
	duplicatePaths?: string[]; // Other paths with identical content (if any)
	content?: string; // Raw SKILL.md file content (for display in browser)
}

/**
 * Parse YAML frontmatter from SKILL.md content.
 * Uses simple regex-based parsing for key: value format.
 *
 * @param content - Raw file content
 * @returns Parsed name and description, or null if parsing fails
 */
function parseSkillFrontmatter(
	content: string,
): { name: string; description: string } | null {
	// Extract YAML frontmatter between --- markers
	const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---/;
	const match = content.match(frontmatterRegex);

	if (!match || !match[1]) {
		return null; // No frontmatter found
	}

	// Parse YAML fields manually (simple key: value format)
	const yamlContent = match[1];
	const nameMatch = yamlContent.match(/^name:\s*["']?(.+?)["']?\s*$/m);
	const descMatch = yamlContent.match(/^description:\s*["']?(.+?)["']?\s*$/m);

	const name = nameMatch?.[1]?.trim();
	const description = descMatch?.[1]?.trim();

	if (!name || !description) {
		return null; // Missing required fields
	}

	return { name, description };
}

/**
 * Find all SKILL.md files recursively in a directory.
 * Follows the Agent Skills specification where skills are located in
 * `skill-name/SKILL.md` files.
 *
 * @param baseDir - The base directory to search in
 * @param maxDepth - Maximum directory depth (0 = root only, 1 = root + 1 level, etc.). undefined = unlimited
 * @param verbose - If true, log debug information about discovery
 * @returns Array of ISkill objects sorted by path depth (shallower first)
 */
export async function findSkillsFiles(
	baseDir: string = process.cwd(),
	maxDepth?: number,
	verbose?: boolean,
): Promise<ISkill[]> {
	const globOptions = {
		cwd: baseDir,
		absolute: true,
		nocase: true, // Match SKILL.md, skill.md, Skill.md, etc.
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

	// Search for SKILL.md files
	const skillFiles = await glob("**/SKILL.md", globOptions);

	// Filter by depth if maxDepth is specified
	let filteredFiles = skillFiles;
	if (maxDepth !== undefined) {
		const normalizedBaseDir = resolve(baseDir);

		filteredFiles = skillFiles.filter((file) => {
			const relativePath = file.slice(normalizedBaseDir.length + 1);
			const depth = relativePath.split("/").length - 1;
			return depth <= maxDepth;
		});
	}

	// Parse each SKILL.md file and extract metadata
	const skills: ISkill[] = [];

	for (const filePath of filteredFiles) {
		try {
			const content = await readFile(filePath, "utf-8");
			const parsed = parseSkillFrontmatter(content);

			if (!parsed) {
				if (verbose) {
					console.log(
						`[SkillsFinder] Skipping ${filePath}: invalid or missing YAML frontmatter`,
					);
				}
				continue;
			}

			const relativePath = getRelativePath(filePath, baseDir);
			const directory = basename(dirname(filePath));

			skills.push({
				name: parsed.name,
				description: parsed.description,
				path: relativePath,
				directory,
			});
		} catch (error) {
			if (verbose) {
				console.log(`[SkillsFinder] Error reading ${filePath}:`, error);
			}
			// Continue processing other skills if one fails
		}
	}

	// Sort by path depth (shallower files first)
	return skills.sort((a, b) => {
		const depthA = a.path.split("/").length;
		const depthB = b.path.split("/").length;
		return depthA - depthB;
	});
}

/**
 * Skill data with raw content and content hash for deduplication.
 * Used by the summarizer to detect duplicate SKILL.md files.
 */
export interface ISkillWithContent extends ISkill {
	content: string; // Raw file content
	contentHash: string; // SHA-256 hash of content
}

/**
 * Compute SHA-256 hash of content for deduplication.
 */
function hashContent(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

/**
 * Find all SKILL.md files recursively, returning content and hash for deduplication.
 * This is used by the summarizer to detect duplicate skills before AI summarization.
 *
 * @param baseDir - The base directory to search in
 * @param maxDepth - Maximum directory depth (0 = root only, 1 = root + 1 level, etc.). undefined = unlimited
 * @param verbose - If true, log debug information about discovery
 * @returns Array of ISkillWithContent objects sorted by path depth (shallower first)
 */
export async function findSkillsFilesWithContent(
	baseDir: string = process.cwd(),
	maxDepth?: number,
	verbose?: boolean,
): Promise<ISkillWithContent[]> {
	const globOptions = {
		cwd: baseDir,
		absolute: true,
		nocase: true, // Match SKILL.md, skill.md, Skill.md, etc.
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

	// Search for SKILL.md files
	const skillFiles = await glob("**/SKILL.md", globOptions);

	// Filter by depth if maxDepth is specified
	let filteredFiles = skillFiles;
	if (maxDepth !== undefined) {
		const normalizedBaseDir = resolve(baseDir);

		filteredFiles = skillFiles.filter((file) => {
			const relativePath = file.slice(normalizedBaseDir.length + 1);
			const depth = relativePath.split("/").length - 1;
			return depth <= maxDepth;
		});
	}

	// Parse each SKILL.md file and extract metadata with content
	const skills: ISkillWithContent[] = [];

	for (const filePath of filteredFiles) {
		try {
			const content = await readFile(filePath, "utf-8");
			const parsed = parseSkillFrontmatter(content);

			if (!parsed) {
				if (verbose) {
					console.log(
						`[SkillsFinder] Skipping ${filePath}: invalid or missing YAML frontmatter`,
					);
				}
				continue;
			}

			const relativePath = getRelativePath(filePath, baseDir);
			const directory = basename(dirname(filePath));
			const contentHash = hashContent(content);

			skills.push({
				name: parsed.name,
				description: parsed.description,
				path: relativePath,
				directory,
				content,
				contentHash,
			});
		} catch (error) {
			if (verbose) {
				console.log(`[SkillsFinder] Error reading ${filePath}:`, error);
			}
			// Continue processing other skills if one fails
		}
	}

	// Sort by path depth (shallower files first)
	return skills.sort((a, b) => {
		const depthA = a.path.split("/").length;
		const depthB = b.path.split("/").length;
		return depthA - depthB;
	});
}
