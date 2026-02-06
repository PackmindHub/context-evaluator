/**
 * Embedded Prompt Server
 *
 * Provides evaluator and shared prompts from embedded content
 */

import {
	evaluatorPrompts,
	getEvaluatorIds,
	getEvaluatorPrompt,
	getSharedPrompt,
	sharedPrompts,
} from "./prompts-assets";

/**
 * Check if embedded prompts are available
 */
export function hasEmbeddedPrompts(): boolean {
	return Object.keys(evaluatorPrompts).length > 0;
}

/**
 * Get all evaluator metadata
 */
export function getEvaluatorList(): Array<{ id: string; name: string }> {
	return getEvaluatorIds().map((id) => ({
		id,
		name: extractEvaluatorName(evaluatorPrompts[id] || ""),
	}));
}

/**
 * Get evaluator content by ID
 */
export function getEvaluator(
	id: string,
): { id: string; name: string; content: string } | null {
	const content = getEvaluatorPrompt(id);
	if (!content) {
		return null;
	}

	return {
		id,
		name: extractEvaluatorName(content),
		content,
	};
}

/**
 * Get shared prompt content by ID
 */
export function getShared(id: string): string | null {
	return getSharedPrompt(id) || null;
}

/**
 * Get all evaluator prompts (for evaluation engine)
 */
export function getAllEvaluatorPrompts(): Record<string, string> {
	return evaluatorPrompts;
}

/**
 * Get all shared prompts (for evaluation engine)
 */
export function getAllSharedPrompts(): Record<string, string> {
	return sharedPrompts;
}

/**
 * Extract human-readable name from evaluator markdown content
 */
function extractEvaluatorName(content: string): string {
	const match = content.match(/^#\s+(.+?)(?:\s+Evaluator)?\s*$/m);
	if (match && match[1]) {
		return match[1].replace(/\s+Evaluator$/, "").trim();
	}
	return "Unknown";
}

// Re-export for convenience
export { getEvaluatorPrompt, getSharedPrompt, getEvaluatorIds };
