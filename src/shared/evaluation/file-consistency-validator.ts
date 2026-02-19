// File Consistency Validator Module
// Detects when AGENTS.md and CLAUDE.md coexist in the same directory with different content

import {
	findColocatedMdFiles,
	getRelativePath,
} from "@shared/file-system/file-finder";
import { detectCrossReference } from "@shared/file-system/file-reference-detector";
import type { Issue, Location } from "@shared/types/evaluation";
import { createTwoFilesPatch } from "diff";
import { readFile } from "fs/promises";

/**
 * Strip Packmind standards section from content
 * Removes content between <!-- start: Packmind standards --> and <!-- end: Packmind standards --> tags
 * including the tags themselves
 */
function stripPackmindStandards(content: string): string {
	const startTag = "<!-- start: Packmind standards -->";
	const endTag = "<!-- end: Packmind standards -->";

	const startIndex = content.indexOf(startTag);
	if (startIndex === -1) {
		return content;
	}

	const endIndex = content.indexOf(endTag, startIndex);
	if (endIndex === -1) {
		return content; // No closing tag found, return original
	}

	// Remove the section including tags
	const before = content.slice(0, startIndex);
	const after = content.slice(endIndex + endTag.length);

	return before + after;
}

/**
 * Normalize trailing newlines in content.
 * Ensures consistent trailing newline behavior to prevent false positives
 * when files differ only in trailing whitespace at EOF.
 *
 * Behavior:
 * - Multiple trailing newlines -> single newline ("content\n\n\n" -> "content\n")
 * - Single trailing newline -> preserved ("content\n" -> "content\n")
 * - No trailing newline -> adds one ("content" -> "content\n")
 */
function normalizeTrailingNewlines(content: string): string {
	return content.replace(/\n*$/, "\n");
}

/**
 * Options for file consistency validation
 */
export interface ConsistencyValidationOptions {
	verbose?: boolean;
	agentsFiles?: string[]; // Optional: pre-discovered paths (not directly used but for consistency)
}

/**
 * Result of consistency validation
 */
export interface ConsistencyValidationResult {
	issues: Issue[];
	pairsChecked: number;
	conflictsFound: number;
}

/**
 * Validate file consistency for colocated AGENTS.md and CLAUDE.md files
 * @param baseDir - Base directory to search in
 * @param options - Validation options
 * @returns Validation result with issues found
 */
export async function validateFileConsistency(
	baseDir: string,
	options: ConsistencyValidationOptions = {},
): Promise<ConsistencyValidationResult> {
	const { verbose = false } = options;

	try {
		// Find pairs of colocated files
		const pairs = await findColocatedMdFiles(baseDir);

		if (verbose) {
			console.log(
				`[FileConsistencyValidator] Found ${pairs.length} colocated AGENTS.md/CLAUDE.md pairs`,
			);
		}

		const issues: Issue[] = [];
		let conflictsFound = 0;

		// Check each pair for consistency
		for (const pair of pairs) {
			try {
				const [agentsContent, claudeContent] = await Promise.all([
					readFile(pair.agentsPath, "utf-8"),
					readFile(pair.claudePath, "utf-8"),
				]);

				// Check for @ file reference annotations (e.g., @CLAUDE.md pointing to companion file)
				const crossRef = detectCrossReference(agentsContent, claudeContent);
				if (crossRef.hasReference) {
					if (verbose) {
						console.log(
							`[FileConsistencyValidator] Skipped pair in ${getRelativePath(pair.directory, baseDir)}: ${crossRef.referenceFile === "agents" ? "AGENTS.md" : "CLAUDE.md"} is a file reference annotation`,
						);
					}
					continue;
				}

				// Strip Packmind standards sections before comparison
				const agentsContentStripped = stripPackmindStandards(agentsContent);
				const claudeContentStripped = stripPackmindStandards(claudeContent);

				// Normalize trailing newlines (ignore differences in empty lines at EOF)
				const agentsNormalized = normalizeTrailingNewlines(
					agentsContentStripped,
				);
				const claudeNormalized = normalizeTrailingNewlines(
					claudeContentStripped,
				);

				// Byte-for-byte comparison (with Packmind sections excluded and trailing newlines normalized)
				if (agentsNormalized !== claudeNormalized) {
					conflictsFound++;

					// Generate unified diff using NORMALIZED content
					const agentsRelPath = getRelativePath(pair.agentsPath, baseDir);
					const claudeRelPath = getRelativePath(pair.claudePath, baseDir);

					const diff = createTwoFilesPatch(
						agentsRelPath,
						claudeRelPath,
						agentsNormalized,
						claudeNormalized,
						"AGENTS.md",
						"CLAUDE.md",
						{ context: 1 },
					);

					// Count lines for location data
					const agentsLines = agentsContent.split("\n").length;
					const claudeLines = claudeContent.split("\n").length;

					const locations: Location[] = [
						{
							file: agentsRelPath,
							start: 1,
							end: agentsLines,
						},
						{
							file: claudeRelPath,
							start: 1,
							end: claudeLines,
						},
					];

					const issue: Issue = {
						category: "File Consistency",
						severity: 9,
						problem: "AGENTS.md and CLAUDE.md coexist with different content",
						description: `Found colocated AGENTS.md and CLAUDE.md files with different content in ${getRelativePath(pair.directory, baseDir)}. AI agents may receive inconsistent instructions.`,
						title: "Conflicting AGENTS.md and CLAUDE.md files",
						location: locations,
						affectedFiles: [agentsRelPath, claudeRelPath],
						isMultiFile: true,
						impact:
							"AI agents may receive inconsistent instructions depending on which file they reference, leading to unpredictable behavior.",
						fix: "Merge unique CLAUDE.md content into AGENTS.md, then replace CLAUDE.md content with `@AGENTS.md` to create a reference pointer. AGENTS.md should be the single source of truth.",
						context: `Unified Diff:\n\n${diff}`,
						issueType: "error",
						evaluatorName: "file-consistency",
					};

					issues.push(issue);

					if (verbose) {
						console.log(
							`[FileConsistencyValidator] Conflict found: ${agentsRelPath} vs ${claudeRelPath}`,
						);
					}
				} else {
					if (verbose) {
						const agentsRelPath = getRelativePath(pair.agentsPath, baseDir);
						console.log(
							`[FileConsistencyValidator] Files identical (no conflict): ${agentsRelPath}`,
						);
					}
				}
			} catch (error) {
				if (verbose) {
					console.error(
						`[FileConsistencyValidator] Error reading files in ${pair.directory}:`,
						error,
					);
				}
				// Continue with next pair even if one fails
			}
		}

		return {
			issues,
			pairsChecked: pairs.length,
			conflictsFound,
		};
	} catch (error) {
		if (verbose) {
			console.error(
				"[FileConsistencyValidator] Error during validation:",
				error,
			);
		}
		// Return empty result on error
		return {
			issues: [],
			pairsChecked: 0,
			conflictsFound: 0,
		};
	}
}
