import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ColocatedPair } from "@shared/file-system/colocated-file-consolidator";
import { isFileReference } from "@shared/file-system/file-reference-detector";

export interface ConsolidationResult {
	directory: string;
	agentsPath: string;
	claudePath: string;
	skipped: boolean;
	reason?: string;
}

/**
 * Consolidate colocated AGENTS.md/CLAUDE.md pairs during remediation.
 * For each pair:
 * 1. Skip if CLAUDE.md is already `@AGENTS.md`
 * 2. Append CLAUDE.md content to AGENTS.md with a separator
 * 3. Rewrite CLAUDE.md to `@AGENTS.md`
 */
export async function consolidateColocatedFiles(
	workDir: string,
	pairs: ColocatedPair[],
): Promise<ConsolidationResult[]> {
	const results: ConsolidationResult[] = [];

	for (const pair of pairs) {
		const agentsAbsPath = join(workDir, pair.agentsPath);
		const claudeAbsPath = join(workDir, pair.claudePath);

		try {
			const claudeContent = await readFile(claudeAbsPath, "utf-8");

			// Skip if CLAUDE.md is already a reference pointer
			const refResult = isFileReference(claudeContent);
			if (refResult.isReference) {
				results.push({
					...pair,
					skipped: true,
					reason: `CLAUDE.md is already a reference to ${refResult.referencedFile}`,
				});
				continue;
			}

			// Read AGENTS.md content
			const agentsContent = await readFile(agentsAbsPath, "utf-8");

			// Append CLAUDE.md content to AGENTS.md
			const mergedContent = `${agentsContent.trimEnd()}\n\n<!-- Merged from CLAUDE.md -->\n\n${claudeContent.trimStart()}`;
			await writeFile(agentsAbsPath, mergedContent, "utf-8");

			// Rewrite CLAUDE.md to reference pointer
			await writeFile(claudeAbsPath, "@AGENTS.md\n", "utf-8");

			results.push({
				...pair,
				skipped: false,
			});
		} catch (error) {
			results.push({
				...pair,
				skipped: true,
				reason: `Error: ${error instanceof Error ? error.message : String(error)}`,
			});
		}
	}

	return results;
}
