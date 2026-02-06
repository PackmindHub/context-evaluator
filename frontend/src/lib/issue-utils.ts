import type { Issue } from "../types/evaluation";

/**
 * Simple hash function for generating stable keys from strings
 * Using djb2 algorithm for reasonable distribution and speed
 */
export function simpleHash(content: string): string {
	let hash = 5381;
	for (let i = 0; i < content.length; i++) {
		hash = (hash * 33) ^ content.charCodeAt(i);
	}
	// Convert to unsigned 32-bit integer and then to base-36 string
	return (hash >>> 0).toString(36);
}

/**
 * Generate a stable, deterministic key for an issue
 * Uses content-based hashing to ensure the same issue always gets the same key
 * Falls back to index for truly identical issues
 *
 * @param issue - The issue object
 * @param index - Fallback index for truly identical issues
 * @returns A stable string key for the issue
 */
export function generateIssueKey(issue: Issue, index: number): string {
	// Build a content string from the issue's identifying properties
	const contentParts = [
		issue.category || "",
		issue.problem || issue.description || "",
		issue.location || "",
		issue.evaluatorName || "",
	];

	const contentString = contentParts.join("||");
	const hash = simpleHash(contentString);

	// Include index as fallback for truly identical issues
	return `issue_${hash}_${index}`;
}
