/**
 * Centralized formatting utilities
 * Consolidates duplicated functions from Summary.tsx, ProgressPanel.tsx, and types/evaluation.ts
 */

import type { ContextScoreGrade, EvaluatorFilter } from "../types/evaluation";

/**
 * Extract repository name from URL for display
 * Handles any Git repository URL: GitHub, GitLab, Bitbucket, self-hosted
 * Supports HTTPS and SSH formats
 * Returns: "owner/repo" format
 *
 * Examples:
 * - https://github.com/owner/repo -> "owner/repo"
 * - git@gitlab.com:owner/repo.git -> "owner/repo"
 * - https://git.company.com/owner/repo -> "owner/repo"
 */
export function extractRepoName(url: string): string {
	try {
		// Handle SSH format: git@domain:owner/repo.git
		if (url.startsWith("git@")) {
			const sshMatch = url.match(/git@[^:]+:(.+?)(?:\.git)?$/);
			if (sshMatch) {
				const path = sshMatch[1];
				const pathParts = path.split("/");
				// For nested paths (e.g., group/subgroup/project), take first and last
				if (pathParts.length >= 2) {
					return `${pathParts[0]}/${pathParts[pathParts.length - 1]}`;
				}
			}
		}

		// Handle HTTPS format: https://domain.com/owner/repo
		if (url.startsWith("http://") || url.startsWith("https://")) {
			const urlObj = new URL(url);
			const pathParts = urlObj.pathname.split("/").filter(Boolean);

			// Remove .git suffix from last part if present
			if (pathParts.length >= 2) {
				const lastPart = pathParts[pathParts.length - 1].replace(/\.git$/, "");
				return `${pathParts[0]}/${lastPart}`;
			}
		}

		// Fallback: try to extract pathname
		const urlObj = new URL(url);
		return urlObj.pathname.replace(/^\//, "").replace(/\.git$/, "") || url;
	} catch {
		return url;
	}
}

/**
 * Extract just the repository name (without owner) from URL
 * Handles any Git repository URL: GitHub, GitLab, Bitbucket, self-hosted
 * Returns: "repo" format only (without owner)
 *
 * Examples:
 * - https://github.com/owner/repo -> "repo"
 * - git@gitlab.com:owner/repo.git -> "repo"
 * - https://git.company.com/owner/repo -> "repo"
 */
export function extractRepoNameOnly(url: string): string {
	try {
		// Handle SSH format: git@domain:owner/repo.git
		if (url.startsWith("git@")) {
			const sshMatch = url.match(/git@[^:]+:.*\/(.+?)(?:\.git)?$/);
			if (sshMatch) {
				return sshMatch[1];
			}
		}

		// Handle HTTPS format: https://domain.com/owner/repo
		if (url.startsWith("http://") || url.startsWith("https://")) {
			const urlObj = new URL(url);
			const pathParts = urlObj.pathname.split("/").filter(Boolean);

			if (pathParts.length >= 2) {
				// Get last part and remove .git suffix
				return pathParts[pathParts.length - 1].replace(/\.git$/, "");
			}
		}

		return url;
	} catch {
		return url;
	}
}

/**
 * Format duration for display - short format
 * Used for: displaying total evaluation time in summaries
 * Returns: "123ms", "45.5s", or "9m 29s"
 */
export function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${ms}ms`;
	}
	const totalSeconds = ms / 1000;
	if (totalSeconds < 60) {
		return `${totalSeconds.toFixed(1)}s`;
	}
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = Math.round(totalSeconds % 60);
	return `${minutes}m ${seconds}s`;
}

/**
 * Format elapsed time for display - human readable format
 * Used for: showing elapsed time during evaluation progress
 * Returns: "5m 30s" or "45s"
 */
export function formatElapsedTime(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;

	if (minutes > 0) {
		return `${minutes}m ${remainingSeconds}s`;
	}
	return `${seconds}s`;
}

/**
 * Format relative date for display
 * Used for: showing when evaluations were created in history
 * Returns: "Just now", "5m ago", "2h ago", "3d ago", or "Jan 15"
 */
export function formatRelativeDate(isoString: string): string {
	const date = new Date(isoString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return "Just now";
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;

	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
	});
}

/**
 * Format token usage for display
 * Returns: "1,234" with locale formatting
 */
export function formatTokenUsage(tokens: number): string {
	return tokens.toLocaleString();
}

/**
 * Format cost for display
 * Returns: "$0.0123"
 */
export function formatCost(usd: number): string {
	return `$${usd.toFixed(4)}`;
}

/**
 * Get the filtered evaluator count based on evaluatorFilter
 * This mirrors the backend logic in src/shared/evaluation/evaluator-types.ts
 * - "all": 17 evaluators total
 * - "errors": 13 error evaluators (01-10, 13, 17, 19)
 * - "suggestions": 4 suggestion evaluators (11, 12, 14, 15)
 */
export function getFilteredEvaluatorCount(
	filter: EvaluatorFilter,
	maxCount: number = 17,
): number {
	// Total counts by filter type
	const COUNTS = {
		all: 17,
		errors: 13,
		suggestions: 4,
	};

	const filteredCount = COUNTS[filter];

	// Apply maxCount limit (in case user sets a lower limit)
	return Math.min(filteredCount, maxCount);
}

/**
 * Get badge class for context score grade (compact version for lists)
 * Uses consistent color scheme with ContextScoreCard
 */
export function getGradeBadgeClass(grade: ContextScoreGrade): string {
	switch (grade) {
		case "Excellent":
			return "bg-emerald-900/50 text-emerald-300";
		case "Good":
			return "bg-green-900/50 text-green-300";
		case "Fair":
			return "bg-yellow-900/50 text-yellow-300";
		case "Developing":
			return "bg-orange-900/50 text-orange-300";
		case "Getting Started":
			return "bg-red-900/50 text-red-300";
		default:
			return "bg-slate-700/50 text-slate-400";
	}
}
