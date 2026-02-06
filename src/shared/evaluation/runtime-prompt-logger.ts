import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Options for logging a runtime evaluator prompt.
 */
export interface LogPromptOptions {
	/** Evaluator name (e.g., "evaluator-01-content-quality") */
	evaluatorName: string;
	/** The full prompt text to save */
	prompt: string;
	/** Evaluation mode: unified or independent */
	mode: "unified" | "independent";
	/** If true, log console output on success/failure */
	verbose?: boolean;
}

/**
 * Logs an evaluator prompt to the persistent debug folder at project root.
 *
 * **Always-On System**:
 * - Saves to `prompts/debug/` at project root (uses `process.cwd()`)
 * - Persists forever (NOT cleaned up automatically)
 * - Separate from `--debug` flag (which saves to `{workingDir}/debug-output/`)
 *
 * **Filename Format**:
 * - Independent: `{evaluator-name}-{timestamp}.md`
 * - Unified: `{evaluator-name}-unified-{timestamp}.md`
 * - Timestamp: ISO-8601 format (e.g., `2026-01-26T15-30-45`)
 *
 * **Critical Behavior**:
 * - **Blocking write**: Uses `await writeFile()` to ensure file is written before returning
 * - **Must run BEFORE AI provider invocation** to preserve prompts even if evaluation crashes
 * - **Graceful degradation**: Logs warnings on error but never throws (doesn't break evaluations)
 *
 * @param options - Prompt logging configuration
 * @returns File path on success, null on error
 *
 * @example
 * ```typescript
 * // Log prompt BEFORE calling provider
 * await logRuntimePrompt({
 *   evaluatorName: 'evaluator-01-content-quality',
 *   prompt: fullPrompt,
 *   mode: 'independent',
 *   verbose: true,
 * });
 * // ← Prompt is now safely on disk before provider call
 * const response = await provider.invokeWithRetry(fullPrompt);
 * ```
 */
export async function logRuntimePrompt(
	options: LogPromptOptions,
): Promise<string | null> {
	try {
		// Path resolution - always use project root (where evaluator is installed)
		const projectRoot = process.cwd();
		const debugDir = resolve(projectRoot, "prompts", "debug");

		// Ensure directory exists (auto-creates if missing)
		await mkdir(debugDir, { recursive: true });

		// Timestamp format: YYYY-MM-DDTHH-MM-SS (e.g., 2026-01-26T15-30-45)
		// Windows-compatible (no colons in filename), 1-second granularity
		const timestamp = new Date()
			.toISOString()
			.replace(/:/g, "-") // Replace colons with hyphens
			.replace(/\..+/, ""); // Remove fractional seconds (.123Z)

		// Build filename with optional unified mode suffix
		const modeSuffix = options.mode === "unified" ? "-unified" : "";
		const filename = `${options.evaluatorName}${modeSuffix}-${timestamp}.md`;
		const filePath = resolve(debugDir, filename);

		// CRITICAL: Blocking write - wait for file to be written to disk
		// This ensures the prompt is preserved even if the evaluation crashes
		await writeFile(filePath, options.prompt, "utf-8");

		// Log success if verbose mode enabled
		if (options.verbose) {
			console.log(`[RuntimeDebug] ✓ Saved prompt to: ${filePath}`);
		}

		return filePath;
	} catch (error) {
		// Log warning but don't throw - logging failures must NEVER break evaluations
		const errorMsg = error instanceof Error ? error.message : String(error);
		console.warn(
			`[RuntimeDebug] ⚠ Failed to save prompt for ${options.evaluatorName}: ${errorMsg}`,
		);
		return null;
	}
}
