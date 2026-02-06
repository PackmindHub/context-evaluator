/**
 * Utility functions for evaluator-related operations
 */

import { readdir, readFile } from "fs/promises";
import { resolve } from "path";
import {
	getEvaluator,
	getEvaluatorList,
	hasEmbeddedPrompts,
} from "../../embedded/prompt-server";

/**
 * Evaluator metadata
 */
export interface EvaluatorInfo {
	id: string;
	name: string;
}

/**
 * Evaluator with content
 */
export interface EvaluatorWithContent extends EvaluatorInfo {
	content: string;
}

/**
 * Extract human-readable name from evaluator markdown content
 * Looks for a heading like "# Content Quality Evaluator" and extracts "Content Quality"
 */
export function extractEvaluatorName(content: string): string {
	const match = content.match(/^#\s+(.+?)(?:\s+Evaluator)?\s*$/m);
	if (match && match[1]) {
		return match[1].replace(/\s+Evaluator$/, "").trim();
	}
	return "Unknown";
}

/**
 * Check if running in embedded mode (prompts bundled in binary)
 */
export function isEmbeddedPromptMode(): boolean {
	return hasEmbeddedPrompts();
}

/**
 * Get list of all evaluators
 * Uses embedded prompts if available, otherwise reads from filesystem
 */
export async function getEvaluators(
	evaluatorsDir: string,
): Promise<EvaluatorInfo[]> {
	let evaluators: EvaluatorInfo[];

	if (isEmbeddedPromptMode()) {
		evaluators = getEvaluatorList();
	} else {
		const files = await readdir(evaluatorsDir);
		const mdFiles = files.filter(
			(file) => file.endsWith(".md") && file !== "file-consistency.md",
		);

		evaluators = await Promise.all(
			mdFiles.map(async (file) => {
				const id = file.replace(".md", "");
				const filePath = resolve(evaluatorsDir, file);
				const content = await readFile(filePath, "utf-8");
				const name = extractEvaluatorName(content);
				return { id, name };
			}),
		);
	}

	// Sort by ID to maintain order (both embedded and filesystem)
	evaluators.sort((a, b) => a.id.localeCompare(b.id));

	return evaluators;
}

/**
 * Get a single evaluator by ID
 * Uses embedded prompts if available, otherwise reads from filesystem
 */
export async function getEvaluatorById(
	evaluatorId: string,
	evaluatorsDir: string,
): Promise<EvaluatorWithContent | null> {
	if (isEmbeddedPromptMode()) {
		const evaluator = getEvaluator(evaluatorId);
		if (evaluator) {
			return evaluator as EvaluatorWithContent;
		}
		return null;
	}

	const filename = `${evaluatorId}.md`;
	const filePath = resolve(evaluatorsDir, filename);

	try {
		const content = await readFile(filePath, "utf-8");
		const name = extractEvaluatorName(content);
		return { id: evaluatorId, name, content };
	} catch (error) {
		// Check if it's a file not found error
		const isNotFound =
			error instanceof Error && "code" in error && error.code === "ENOENT";

		if (isNotFound) {
			return null;
		}
		throw error;
	}
}
