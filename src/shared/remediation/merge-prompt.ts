/**
 * Builds the prompt for AI-powered intelligent merge of AGENTS.md and CLAUDE.md.
 */

export function buildMergePrompt(
	agentsContent: string,
	claudeContent: string,
): string {
	return `You are merging two AI agent instruction files from the same directory into a single consolidated file.

## Rules

1. Use **AGENTS.md** as the base skeleton. Preserve its section ordering and structure.
2. For sections that exist in both files, keep the **more complete and detailed** version. Do NOT concatenate both versions — pick one and supplement with unique details from the other.
3. Insert sections from CLAUDE.md that have **no equivalent** in AGENTS.md at the most relevant location (e.g., testing sections near development workflow, deployment near architecture).
4. **Never duplicate information.** If the same command, path, or instruction appears in both files, include it exactly once.
5. Preserve all code blocks, command examples, and configuration snippets exactly as written.
6. Keep markdown formatting consistent (heading levels, list styles).
7. Output **only** the merged markdown content. No preamble, no explanation, no code fences wrapping the output.

## AGENTS.md Content

${agentsContent}

## CLAUDE.md Content

${claudeContent}

## Merged Output
`;
}
