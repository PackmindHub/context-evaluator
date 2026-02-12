// File Reference Detector
// Detects when an AGENTS.md or CLAUDE.md file contains only a `@` reference
// pointing to its companion file (e.g., `@CLAUDE.md` in AGENTS.md).
// This is a convention used by coding agents that only support one file type.

/**
 * Result of checking if content is a file reference
 */
export interface FileReferenceResult {
	isReference: boolean;
	referencedFile: string | null;
}

/**
 * Result of checking cross-references between colocated files
 */
export interface CrossReferenceResult {
	hasReference: boolean;
	/** Which file is the pointer: "agents" or "claude" */
	referenceFile: "agents" | "claude" | null;
	/** Which file has real content: "agents" or "claude" */
	contentFile: "agents" | "claude" | null;
}

/** Valid context file names that can be referenced */
const VALID_CONTEXT_FILES = ["agents.md", "claude.md"];

/**
 * Check if file content is purely a `@` file reference annotation.
 *
 * Matches: `@CLAUDE.md`, `@AGENTS.md`, `@./CLAUDE.md`, `@./AGENTS.md`
 * Case-insensitive. Allows leading/trailing whitespace and newlines.
 *
 * Does NOT match if there is any other content besides the reference.
 */
export function isFileReference(content: string): FileReferenceResult {
	const trimmed = content.trim();

	if (!trimmed || !trimmed.startsWith("@")) {
		return { isReference: false, referencedFile: null };
	}

	// Extract the referenced path (everything after @)
	const referencedPath = trimmed.slice(1);

	// Strip optional leading "./" prefix
	const normalizedPath = referencedPath.startsWith("./")
		? referencedPath.slice(2)
		: referencedPath;

	// Reject paths with directory separators (parent or subdirectory references)
	if (normalizedPath.includes("/") || normalizedPath.includes("\\")) {
		return { isReference: false, referencedFile: null };
	}

	// Check if it's a known context file (case-insensitive)
	if (VALID_CONTEXT_FILES.includes(normalizedPath.toLowerCase())) {
		return { isReference: true, referencedFile: normalizedPath };
	}

	return { isReference: false, referencedFile: null };
}

/**
 * Detect if one file in a colocated AGENTS.md/CLAUDE.md pair is a cross-reference
 * to the other (not a self-reference).
 *
 * Returns which file is the pointer and which has real content.
 * If both are references, AGENTS.md reference takes priority.
 */
export function detectCrossReference(
	agentsContent: string,
	claudeContent: string,
): CrossReferenceResult {
	const agentsRef = isFileReference(agentsContent);
	const claudeRef = isFileReference(claudeContent);

	// Check if AGENTS.md references CLAUDE.md (cross-reference, not self-reference)
	if (
		agentsRef.isReference &&
		agentsRef.referencedFile &&
		agentsRef.referencedFile.toLowerCase() === "claude.md"
	) {
		return {
			hasReference: true,
			referenceFile: "agents",
			contentFile: "claude",
		};
	}

	// Check if CLAUDE.md references AGENTS.md (cross-reference, not self-reference)
	if (
		claudeRef.isReference &&
		claudeRef.referencedFile &&
		claudeRef.referencedFile.toLowerCase() === "agents.md"
	) {
		return {
			hasReference: true,
			referenceFile: "claude",
			contentFile: "agents",
		};
	}

	// No cross-reference (both have real content, or self-references)
	return { hasReference: false, referenceFile: null, contentFile: null };
}
