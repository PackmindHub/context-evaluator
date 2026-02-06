import type { IAIProvider } from "@shared/providers/types";
import type { ILinkedDocSummary } from "@shared/types/evaluation";
import { runWithConcurrencyLimit } from "@shared/utils/concurrency-limiter";
import { invokeIsolated } from "@shared/utils/isolated-prompt";
import { readFile } from "fs/promises";
import { dirname, isAbsolute, resolve } from "path";
import { getRelativePath } from "./file-finder";

/**
 * Represents an extracted Markdown link
 */
export interface IExtractedLink {
	/** Raw link target as written in the source */
	rawPath: string;
	/** Resolved absolute path */
	absolutePath: string;
	/** Link text/label */
	linkText: string;
	/** Source file containing the link */
	sourcePath: string;
}

/**
 * Options for linked docs discovery
 */
export interface IDocDiscoveryOptions {
	/** AI provider for summarization */
	provider: IAIProvider;
	/** Enable verbose logging */
	verbose?: boolean;
	/** Maximum number of docs to summarize (default: 30) */
	maxDocs?: number;
	/** Maximum content length per file before truncation (default: 8000) */
	maxContentLength?: number;
	/** Concurrency for summarization calls (default: 3) */
	concurrency?: number;
	/** Timeout in milliseconds for AI provider calls (default: 60000) */
	timeout?: number;
}

/**
 * Result of linked docs discovery
 */
export interface ILinkedDocsResult {
	/** Discovered and summarized documentation */
	docs: ILinkedDocSummary[];
	/** Total links found before filtering */
	totalLinksFound: number;
	/** Links that couldn't be resolved (file not found) */
	unresolvedLinks: string[];
}

// Regex patterns for Markdown links
// Inline: [text](path/to/file.md) or [text](path/to/file.md#anchor)
const INLINE_LINK_REGEX = /\[([^\]]+)\]\(([^)]+\.md(?:#[^)]*)?)\)/gi;

// Reference definition: [ref]: path/to/file.md
const REFERENCE_DEF_REGEX = /^\[([^\]]+)\]:\s*(\S+\.md(?:#\S*)?)\s*$/gim;

/**
 * Check if a path is an external URL
 */
function isExternalUrl(path: string): boolean {
	return (
		path.startsWith("http://") ||
		path.startsWith("https://") ||
		path.startsWith("//")
	);
}

/**
 * Check if a path is an anchor-only link
 */
function isAnchorOnly(path: string): boolean {
	return path.startsWith("#");
}

/**
 * Check if a path is a self-reference to AGENTS.md, CLAUDE.md, copilot-instructions.md,
 * or *.instructions.md files in .github/instructions/
 */
function isSelfReference(path: string): boolean {
	const filename = path.split("/").pop()?.split("#")[0]?.toLowerCase() ?? "";

	// Original patterns
	if (
		filename === "agents.md" ||
		filename === "claude.md" ||
		filename === "copilot-instructions.md"
	) {
		return true;
	}

	// New pattern: *.instructions.md in .github/instructions/ directory
	if (
		filename.endsWith(".instructions.md") &&
		path.includes(".github/instructions/")
	) {
		return true;
	}

	return false;
}

/**
 * Remove anchor fragment from path
 */
function removeAnchor(path: string): string {
	return path.split("#")[0] ?? path;
}

/**
 * Extract Markdown links to .md files from content.
 * Handles: [text](path.md), [text](path.md#anchor), [ref]: path.md
 * Excludes: external URLs, anchor-only links, self-references
 *
 * @param content - Markdown content to parse
 * @param sourcePath - Absolute path to the source file
 * @returns Array of extracted links with resolved paths
 */
export function extractMarkdownLinks(
	content: string,
	sourcePath: string,
): IExtractedLink[] {
	const links: IExtractedLink[] = [];
	const sourceDir = dirname(sourcePath);
	const seenPaths = new Set<string>();

	// Process inline links: [text](path.md)
	let match: RegExpExecArray | null;
	INLINE_LINK_REGEX.lastIndex = 0;
	while ((match = INLINE_LINK_REGEX.exec(content)) !== null) {
		const linkText = match[1] ?? "";
		const rawPath = match[2] ?? "";

		if (!rawPath || isExternalUrl(rawPath) || isAnchorOnly(rawPath)) {
			continue;
		}

		const cleanPath = removeAnchor(rawPath);

		if (isSelfReference(cleanPath)) {
			continue;
		}

		// Resolve relative path
		const absolutePath = isAbsolute(cleanPath)
			? cleanPath
			: resolve(sourceDir, cleanPath);

		// Deduplicate
		if (seenPaths.has(absolutePath)) {
			continue;
		}
		seenPaths.add(absolutePath);

		links.push({
			rawPath: cleanPath,
			absolutePath,
			linkText,
			sourcePath,
		});
	}

	// Process reference definitions: [ref]: path.md
	REFERENCE_DEF_REGEX.lastIndex = 0;
	while ((match = REFERENCE_DEF_REGEX.exec(content)) !== null) {
		const linkText = match[1] ?? "";
		const rawPath = match[2] ?? "";

		if (!rawPath || isExternalUrl(rawPath) || isAnchorOnly(rawPath)) {
			continue;
		}

		const cleanPath = removeAnchor(rawPath);

		if (isSelfReference(cleanPath)) {
			continue;
		}

		const absolutePath = isAbsolute(cleanPath)
			? cleanPath
			: resolve(sourceDir, cleanPath);

		if (seenPaths.has(absolutePath)) {
			continue;
		}
		seenPaths.add(absolutePath);

		links.push({
			rawPath: cleanPath,
			absolutePath,
			linkText,
			sourcePath,
		});
	}

	return links;
}

/**
 * Build the summarization prompt for a documentation file.
 * Note: File path is intentionally omitted to prevent AI agents from
 * attempting to explore/read the file instead of just summarizing the content.
 */
function buildSummarizationPrompt(content: string): string {
	return `You are a documentation summarizer for AI coding agents.

Given the following Markdown documentation, provide a single detailed sentence that describes both the document's purpose and the key information it contains for developers/AI agents.

IMPORTANT:
- Respond with ONLY 1 detailed sentence, nothing else
- Be specific and actionable, avoid vague statements
- Focus on information useful for coding tasks

---

\`\`\`markdown
${content}
\`\`\``;
}

/**
 * Generate a single detailed sentence summary for a documentation file.
 *
 * Uses isolated prompt execution to prevent AI agents from exploring
 * the filesystem instead of just summarizing the provided content.
 *
 * @param relativePath - Relative path for display (used in fallback message only)
 * @param content - File content to summarize
 * @param provider - AI provider for summarization
 * @param timeout - Timeout in milliseconds (default: 60000)
 * @returns Summary string (1 detailed sentence)
 */
export async function summarizeDocFile(
	relativePath: string,
	content: string,
	provider: IAIProvider,
	timeout?: number,
): Promise<string> {
	const prompt = buildSummarizationPrompt(content);

	try {
		// Use isolated execution to prevent file exploration
		const response = await invokeIsolated(provider, prompt, {
			timeout: timeout ?? 60000,
		});

		// Clean up the response - remove any extra whitespace/newlines
		const summary = response.result.trim();

		// Validate it looks like a summary (has some content)
		if (summary.length < 10) {
			return `Documentation file at ${relativePath}. Summary unavailable.`;
		}

		return summary;
	} catch (_error) {
		// Fallback on error
		return `Documentation file at ${relativePath}. Summary unavailable.`;
	}
}

/**
 * Read file content with optional truncation
 */
async function readFileWithLimit(
	filePath: string,
	maxLength: number,
): Promise<string | null> {
	try {
		const content = await readFile(filePath, "utf-8");

		if (content.length > maxLength) {
			// Truncate at a newline boundary if possible
			const truncated = content.slice(0, maxLength);
			const lastNewline = truncated.lastIndexOf("\n");

			return lastNewline > maxLength * 0.8
				? `${truncated.slice(0, lastNewline)}\n\n[Content truncated...]`
				: `${truncated}\n\n[Content truncated...]`;
		}

		return content;
	} catch {
		return null; // File not found or read error
	}
}

/**
 * Discover and summarize linked documentation from AGENTS.md files.
 * Finds all .md files linked from the provided AGENTS.md files,
 * reads their content, and generates AI summaries.
 *
 * @param agentsFiles - Absolute paths to AGENTS.md/CLAUDE.md files
 * @param baseDir - Repository base directory
 * @param options - Discovery options
 * @returns Discovery result with summarized docs
 */
export async function discoverLinkedDocs(
	agentsFiles: string[],
	baseDir: string,
	options: IDocDiscoveryOptions,
): Promise<ILinkedDocsResult> {
	const {
		provider,
		verbose = false,
		maxDocs = 30,
		maxContentLength = 8000,
		concurrency = 2,
	} = options;

	const allLinks: IExtractedLink[] = [];
	const unresolvedLinks: string[] = [];

	// Step 1: Extract links from all AGENTS.md files
	for (const agentsFile of agentsFiles) {
		try {
			const content = await readFile(agentsFile, "utf-8");
			const links = extractMarkdownLinks(content, agentsFile);

			if (verbose && links.length > 0) {
				console.log(
					`[DocsFinder] Found ${links.length} link(s) in ${getRelativePath(agentsFile, baseDir)}`,
				);
			}

			allLinks.push(...links);
		} catch (error) {
			if (verbose) {
				console.log(`[DocsFinder] Error reading ${agentsFile}:`, error);
			}
		}
	}

	// Step 2: Deduplicate links (same target from different sources)
	const uniqueLinks = new Map<string, IExtractedLink>();
	for (const link of allLinks) {
		// Keep the first occurrence (typically from root AGENTS.md)
		if (!uniqueLinks.has(link.absolutePath)) {
			uniqueLinks.set(link.absolutePath, link);
		}
	}

	const deduplicatedLinks = Array.from(uniqueLinks.values());
	const totalLinksFound = deduplicatedLinks.length;

	if (verbose) {
		console.log(
			`[DocsFinder] ${totalLinksFound} unique linked doc(s) found after deduplication`,
		);
	}

	// Step 3: Limit to maxDocs (prioritize links from root AGENTS.md)
	// Links are already ordered by source file, so we just take the first N
	const linksToProcess = deduplicatedLinks.slice(0, maxDocs);

	if (verbose && totalLinksFound > maxDocs) {
		console.log(
			`[DocsFinder] Limiting to ${maxDocs} docs (${totalLinksFound - maxDocs} skipped)`,
		);
	}

	// Step 4: Read and summarize each linked doc
	const docs: ILinkedDocSummary[] = [];

	const summarizeLink = async (link: IExtractedLink): Promise<void> => {
		const content = await readFileWithLimit(
			link.absolutePath,
			maxContentLength,
		);

		if (content === null) {
			unresolvedLinks.push(link.rawPath);
			if (verbose) {
				console.log(`[DocsFinder] File not found: ${link.rawPath}`);
			}
			return;
		}

		const relativePath = getRelativePath(link.absolutePath, baseDir);
		const linkedFrom = getRelativePath(link.sourcePath, baseDir);

		if (verbose) {
			console.log(`[DocsFinder] Summarizing: ${relativePath}`);
		}

		const summary = await summarizeDocFile(
			relativePath,
			content,
			provider,
			options.timeout,
		);

		docs.push({
			path: relativePath,
			summary,
			linkedFrom,
			content, // Include content for preview in browser modal
		});
	};

	// Process links with concurrency control
	await runWithConcurrencyLimit(linksToProcess, concurrency, (link) =>
		summarizeLink(link),
	);

	if (verbose) {
		console.log(
			`[DocsFinder] Successfully summarized ${docs.length} doc(s), ${unresolvedLinks.length} unresolved`,
		);
	}

	return {
		docs,
		totalLinksFound,
		unresolvedLinks,
	};
}
