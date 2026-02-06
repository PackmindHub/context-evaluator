import fs from "node:fs/promises";
import path from "node:path";
import type {
	IAIProvider,
	IProviderInvokeOptions,
	IProviderResponse,
} from "@shared/providers/types";

/**
 * Options for isolated prompt execution
 */
export interface IIsolatedPromptOptions
	extends Omit<IProviderInvokeOptions, "cwd"> {}

/**
 * Invokes an AI provider from an empty temporary directory to prevent
 * the provider from exploring the filesystem.
 *
 * This is useful for simple LLM calls (like summarization) where the prompt
 * contains all necessary context and file exploration would be wasteful.
 *
 * @param provider - AI provider to invoke
 * @param prompt - Prompt to send
 * @param options - Invoke options (cwd is handled internally)
 * @returns Provider response
 */
export async function invokeIsolated(
	provider: IAIProvider,
	prompt: string,
	options: IIsolatedPromptOptions = {},
): Promise<IProviderResponse> {
	const projectRoot = path.resolve(process.cwd());
	const tempBaseDir = path.join(projectRoot, "tmp", "isolated-prompts");

	// Create base directory if it doesn't exist
	await fs.mkdir(tempBaseDir, { recursive: true });

	// Create unique temp directory
	const tempDir = await fs.mkdtemp(path.join(tempBaseDir, "prompt-"));

	try {
		return await provider.invoke(prompt, {
			...options,
			cwd: tempDir,
		});
	} finally {
		// Clean up temp directory
		try {
			await fs.rm(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors - cleanup manager will handle orphaned dirs
		}
	}
}
