/**
 * AI-powered intelligent merge for colocated AGENTS.md/CLAUDE.md pairs.
 * Falls back to naive concatenation on AI failure.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ColocatedPair } from "@shared/file-system/colocated-file-consolidator";
import { isFileReference } from "@shared/file-system/file-reference-detector";
import type { IAIProvider } from "@shared/providers/types";
import type { IPromptExecutionStats } from "@shared/types/remediation";
import type { ConsolidationResult } from "./file-consolidator";
import { consolidateColocatedFiles } from "./file-consolidator";
import { buildMergePrompt } from "./merge-prompt";

const MERGE_TIMEOUT_MS = 120_000; // 2 minutes per merge

export interface AIConsolidationResult {
	results: ConsolidationResult[];
	stats?: IPromptExecutionStats;
}

/**
 * Consolidate colocated AGENTS.md/CLAUDE.md pairs using AI-powered intelligent merge.
 * For each pair:
 * 1. Skip if CLAUDE.md is already `@AGENTS.md`
 * 2. Read both files, build merge prompt, invoke AI provider
 * 3. Validate AI output (non-empty, reasonable length)
 * 4. Write merged content to AGENTS.md, write `@AGENTS.md` to CLAUDE.md
 * 5. On AI failure: fall back to naive concatenation for that pair only
 */
export async function consolidateColocatedFilesWithAI(
	workDir: string,
	pairs: ColocatedPair[],
	provider: IAIProvider,
): Promise<AIConsolidationResult> {
	const results: ConsolidationResult[] = [];
	let totalDurationMs = 0;
	let totalCostUsd = 0;
	let totalInputTokens = 0;
	let totalOutputTokens = 0;
	let mergePromptText = "";
	let anyAIUsed = false;

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

			const agentsContent = await readFile(agentsAbsPath, "utf-8");
			const prompt = buildMergePrompt(agentsContent, claudeContent);
			mergePromptText = prompt;

			// Attempt AI-powered merge
			const startMs = Date.now();
			const response = await provider.invokeWithRetry(prompt, {
				writeMode: false,
				timeout: MERGE_TIMEOUT_MS,
			});
			const durationMs = Date.now() - startMs;

			const mergedContent = response.result?.trim() || "";

			// Validate: non-empty and at least 20% of the smaller file's length
			const minLen = Math.min(agentsContent.length, claudeContent.length);
			if (mergedContent.length === 0 || mergedContent.length < minLen * 0.2) {
				console.warn(
					`[AI Consolidation] AI output too short for ${pair.claudePath} (${mergedContent.length} chars), falling back to naive merge`,
				);
				const fallbackResults = await consolidateColocatedFiles(workDir, [
					pair,
				]);
				results.push(...fallbackResults);
				continue;
			}

			// Write merged content
			await writeFile(agentsAbsPath, mergedContent, "utf-8");
			await writeFile(claudeAbsPath, "@AGENTS.md\n", "utf-8");

			anyAIUsed = true;
			totalDurationMs += durationMs;
			totalCostUsd += response.cost_usd ?? 0;
			totalInputTokens += response.usage?.input_tokens ?? 0;
			totalOutputTokens += response.usage?.output_tokens ?? 0;

			results.push({
				...pair,
				skipped: false,
			});
		} catch (error) {
			console.warn(
				`[AI Consolidation] AI merge failed for ${pair.claudePath}: ${error instanceof Error ? error.message : String(error)}. Falling back to naive merge.`,
			);

			// Fall back to naive concatenation for this pair
			try {
				const fallbackResults = await consolidateColocatedFiles(workDir, [
					pair,
				]);
				results.push(...fallbackResults);
			} catch (fallbackError) {
				results.push({
					...pair,
					skipped: true,
					reason: `AI and naive merge both failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
				});
			}
		}
	}

	return {
		results,
		stats: anyAIUsed
			? {
					prompt: mergePromptText,
					durationMs: totalDurationMs,
					costUsd: totalCostUsd || undefined,
					inputTokens: totalInputTokens || undefined,
					outputTokens: totalOutputTokens || undefined,
				}
			: undefined,
	};
}
