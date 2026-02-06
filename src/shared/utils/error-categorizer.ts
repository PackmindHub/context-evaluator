/**
 * Error categorization utility
 *
 * Provides structured error categorization for evaluation errors.
 * Extracted from runner.ts for reusability.
 */

import type { ErrorCategory, StructuredError } from "@shared/types/evaluation";

/**
 * Determine error category from an error instance
 *
 * Categories:
 * - timeout: Operation exceeded time limit
 * - parsing: JSON/response parsing failed
 * - file_system: File read/write operations failed
 * - provider: AI provider (Claude, etc.) issues
 * - repository: Git/repo operations failed
 * - internal: Unknown/unexpected errors
 */
export function determineErrorCategory(error: unknown): ErrorCategory {
	const errorMessage = error instanceof Error ? error.message : String(error);
	const lowerMessage = errorMessage.toLowerCase();

	if (lowerMessage.includes("timeout") || lowerMessage.includes("timed out")) {
		return "timeout";
	}
	if (
		lowerMessage.includes("parse") ||
		lowerMessage.includes("json") ||
		lowerMessage.includes("invalid")
	) {
		return "parsing";
	}
	if (
		lowerMessage.includes("file") ||
		lowerMessage.includes("read") ||
		lowerMessage.includes("write")
	) {
		return "file_system";
	}
	if (
		lowerMessage.includes("provider") ||
		lowerMessage.includes("claude") ||
		lowerMessage.includes("api")
	) {
		return "provider";
	}
	if (
		lowerMessage.includes("git") ||
		lowerMessage.includes("repository") ||
		lowerMessage.includes("clone")
	) {
		return "repository";
	}

	return "internal";
}

/**
 * Create a structured error from an exception
 */
export function createStructuredError(
	error: unknown,
	context: {
		evaluatorName?: string;
		filePath?: string;
		retryable?: boolean;
		severity?: "fatal" | "partial" | "warning";
	} = {},
): StructuredError {
	const errorMessage = error instanceof Error ? error.message : String(error);

	return {
		message: errorMessage,
		category: determineErrorCategory(error),
		severity: context.severity ?? "partial",
		evaluatorName: context.evaluatorName,
		filePath: context.filePath,
		timestamp: new Date(),
		retryable: context.retryable ?? false,
		technicalDetails: error instanceof Error ? error.stack : undefined,
	};
}
