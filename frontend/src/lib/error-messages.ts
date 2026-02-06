/**
 * User-friendly error message utilities
 *
 * Maps technical error messages to human-readable messages with suggestions.
 */

export interface FriendlyError {
	title: string;
	description: string;
	suggestion: string;
}

/**
 * Converts technical error messages to user-friendly messages
 *
 * @param errorMessage - The raw error message from the API
 * @param _errorCode - Optional error code (reserved for future use)
 * @returns An object with title, description, and suggestion
 */
export function getUserFriendlyError(
	errorMessage: string,
	_errorCode?: string,
): FriendlyError {
	const message = errorMessage.toLowerCase();

	// Claude CLI not found
	if (
		message.includes("executable not found") ||
		message.includes("not found in $path") ||
		message.includes("claude cli not found")
	) {
		return {
			title: "Claude CLI Not Available",
			description:
				"The evaluation service could not access the Claude CLI tool required for analysis.",
			suggestion:
				"This is a server-side configuration issue. Please try again later or contact support if the problem persists.",
		};
	}

	// Timeout errors
	if (message.includes("timeout") || message.includes("timed out")) {
		return {
			title: "Evaluation Timed Out",
			description:
				"The evaluation took too long to complete and was cancelled.",
			suggestion: "Try evaluating a smaller repository or fewer files.",
		};
	}

	// Repository access errors
	if (
		message.includes("clone failed") ||
		message.includes("repository not found") ||
		message.includes("access denied")
	) {
		return {
			title: "Repository Access Failed",
			description: "Could not access the specified repository.",
			suggestion:
				"Make sure the repository URL is correct and the repository is public.",
		};
	}

	// No context files
	if (
		message.includes("no agents.md") ||
		message.includes("no files found") ||
		message.includes("no context file")
	) {
		return {
			title: "No Context Files Found",
			description:
				"The repository does not contain any AGENTS.md, CLAUDE.md, or copilot-instructions.md files to evaluate.",
			suggestion:
				"Make sure your repository has context files (AGENTS.md, CLAUDE.md, or .github/copilot-instructions.md) in the expected locations.",
		};
	}

	// API/Rate limit errors
	if (message.includes("rate limit") || message.includes("quota exceeded")) {
		return {
			title: "Service Temporarily Unavailable",
			description: "The evaluation service has reached its rate limit.",
			suggestion: "Please wait a few minutes and try again.",
		};
	}

	// Default fallback
	return {
		title: "Evaluation Failed",
		description: errorMessage,
		suggestion:
			"Please try again. If the problem persists, check your repository URL and try later.",
	};
}
