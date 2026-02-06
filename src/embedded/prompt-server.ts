/**
 * Embedded Prompt Server
 *
 * Provides evaluator and shared prompts from embedded content
 */

let evaluatorPrompts: Record<string, string> = {};
let sharedPrompts: Record<string, string> = {};
let getEvaluatorPrompt: (id: string) => string | undefined = () => undefined;
let getSharedPrompt: (id: string) => string | undefined = () => undefined;
let getEvaluatorIds: () => string[] = () => [];

try {
	const mod = await import("./prompts-assets");
	evaluatorPrompts = mod.evaluatorPrompts;
	sharedPrompts = mod.sharedPrompts;
	getEvaluatorPrompt = mod.getEvaluatorPrompt;
	getSharedPrompt = mod.getSharedPrompt;
	getEvaluatorIds = mod.getEvaluatorIds;
} catch {
	// Generated module not available - running in dev/CI mode without build
}

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
export { getEvaluatorIds, getEvaluatorPrompt, getSharedPrompt };
