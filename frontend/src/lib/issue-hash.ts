import type { Issue } from "../types/evaluation";

/**
 * Generate a deterministic hash for an issue
 * Uses same fields as backend to ensure consistency
 *
 * The hash is used to uniquely identify issues across evaluations
 * for feedback tracking purposes.
 */
export function generateIssueHash(issue: Issue): string {
	const key = [
		issue.evaluatorName || "",
		issue.category || "",
		issue.title || "",
		issue.problem || "",
		issue.location || "",
	].join("|");

	// Simple hash function (djb2 algorithm)
	let hash = 5381;
	for (let i = 0; i < key.length; i++) {
		hash = (hash * 33) ^ key.charCodeAt(i);
	}

	return Math.abs(hash).toString(36);
}
