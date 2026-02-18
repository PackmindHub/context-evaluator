/**
 * Remediation prompt generator.
 *
 * Generates copy-paste-ready AI agent prompts from evaluation results:
 * - Error fix prompt: instructs an agent to fix documentation issues
 * - Suggestion enrich prompt: instructs an agent to add missing documentation
 *   with structured output routing (standard, skill, or generic update)
 */

import { TARGET_AGENTS, type TargetAgent } from "@shared/types/remediation";

export interface RemediationIssue {
	evaluatorName: string;
	category: string;
	title?: string;
	problem?: string;
	description?: string;
	severity?: number;
	impactLevel?: string;
	location: { file?: string; start: number; end: number };
	snippet?: string;
	fix?: string;
	recommendation?: string;
	isPhantomFile?: boolean;
}

export interface RemediationInput {
	targetAgent: TargetAgent;
	contextFilePaths: string[];
	errors: RemediationIssue[];
	suggestions: RemediationIssue[];
	technicalInventorySection: string;
	projectSummary: {
		languages?: string;
		frameworks?: string;
		architecture?: string;
	};
}

export interface RemediationPrompts {
	errorFixPrompt: string;
	suggestionEnrichPrompt: string;
	errorCount: number;
	suggestionCount: number;
}

function formatIssueDescription(issue: RemediationIssue): string {
	return issue.problem || issue.description || issue.title || "No description";
}

function formatIssueFix(issue: RemediationIssue): string {
	const raw = issue.fix || issue.recommendation || "Review and fix this issue";
	return raw
		.replace(/\s*You can use Packmind to achieve this\.?\s*$/i, "")
		.trimEnd();
}

interface SnippetEntry {
	label: string;
	file?: string;
	snippet: string;
}

/**
 * Builds an index of snippets that appear 2+ times across issues.
 * Returns a map keyed by `file + "\n" + snippet` with assigned labels [A], [B], etc.
 */
function buildSnippetIndex(
	issues: RemediationIssue[],
): Map<string, SnippetEntry> {
	// Count occurrences
	const counts = new Map<string, { file?: string; snippet: string }>();
	for (const issue of issues) {
		if (!issue.snippet) continue;
		const key = `${issue.location.file ?? ""}\n${issue.snippet}`;
		if (!counts.has(key)) {
			counts.set(key, { file: issue.location.file, snippet: issue.snippet });
		}
	}

	// Count actual occurrences
	const occurrences = new Map<string, number>();
	for (const issue of issues) {
		if (!issue.snippet) continue;
		const key = `${issue.location.file ?? ""}\n${issue.snippet}`;
		occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
	}

	// Only index snippets appearing 2+ times
	const index = new Map<string, SnippetEntry>();
	let labelIdx = 0;
	for (const [key, entry] of counts) {
		if ((occurrences.get(key) ?? 0) >= 2) {
			const label = String.fromCharCode(65 + labelIdx); // A, B, C...
			index.set(key, { label, file: entry.file, snippet: entry.snippet });
			labelIdx++;
		}
	}

	return index;
}

/** Renders the `## Referenced Content` section for deduplicated snippets. */
function buildReferencedContentSection(
	index: Map<string, SnippetEntry>,
): string {
	if (index.size === 0) return "";
	const blocks: string[] = [];
	for (const entry of index.values()) {
		const fileLabel = entry.file ? ` (${entry.file})` : "";
		blocks.push(
			`**[${entry.label}]**${fileLabel}:\n> ${entry.snippet.split("\n").join("\n> ")}`,
		);
	}
	return `## Referenced Content\n\n${blocks.join("\n\n")}`;
}

/**
 * Returns the snippet rendering for an issue block.
 * If the snippet is deduplicated, returns a "See [X]" reference; otherwise returns the inline block.
 */
function getSnippetRef(
	issue: RemediationIssue,
	index: Map<string, SnippetEntry>,
): string | null {
	if (!issue.snippet) return null;
	const key = `${issue.location.file ?? ""}\n${issue.snippet}`;
	const entry = index.get(key);
	if (entry) {
		return `**Current content**: See [${entry.label}]`;
	}
	return `**Current content**:\n> ${issue.snippet.split("\n").join("\n> ")}`;
}

function formatProjectLine(
	summary: RemediationInput["projectSummary"],
): string {
	const parts: string[] = [];
	if (summary.languages) parts.push(`Languages: ${summary.languages}`);
	if (summary.frameworks) parts.push(`Frameworks: ${summary.frameworks}`);
	if (summary.architecture) parts.push(`Architecture: ${summary.architecture}`);
	return parts.length > 0 ? parts.join(" | ") : "Not identified";
}

function formatErrorIssueBlock(
	issue: RemediationIssue,
	idx: number,
	snippetIndex: Map<string, SnippetEntry>,
): string {
	const lines: string[] = [];
	lines.push(`### ${idx + 1}. ${issue.evaluatorName}: ${issue.category}`);
	lines.push(`**Severity**: ${issue.severity ?? "N/A"}/10`);

	if (issue.location.file) {
		lines.push(
			`**File**: ${issue.location.file}, lines ${issue.location.start}-${issue.location.end}`,
		);
	}

	lines.push(`**Problem**: ${formatIssueDescription(issue)}`);

	const ref = getSnippetRef(issue, snippetIndex);
	if (ref) lines.push(ref);

	lines.push(`**Fix**: ${formatIssueFix(issue)}`);

	return lines.join("\n");
}

function formatSuggestionIssueBlock(
	issue: RemediationIssue,
	idx: number,
	snippetIndex: Map<string, SnippetEntry>,
): string {
	const lines: string[] = [];
	lines.push(`### ${idx + 1}. ${issue.evaluatorName}: ${issue.category}`);
	lines.push(`**Impact**: ${issue.impactLevel ?? "N/A"}`);

	if (issue.isPhantomFile && issue.location.file) {
		lines.push(`**Action**: Create new file at \`${issue.location.file}\``);
	} else if (issue.location.file) {
		lines.push(
			`**File**: ${issue.location.file}, lines ${issue.location.start}-${issue.location.end}`,
		);
	}

	lines.push(`**Gap**: ${formatIssueDescription(issue)}`);

	const ref = getSnippetRef(issue, snippetIndex);
	if (ref) lines.push(ref);

	lines.push(`**Recommendation**: ${formatIssueFix(issue)}`);

	return lines.join("\n");
}

/** Short context description for each target agent. */
function getAgentContextDescription(targetAgent: TargetAgent): string {
	switch (targetAgent) {
		case "agents-md":
			return "AGENTS.md is a universal AI agent documentation file. Standards are added as inline sections. Skills are placed in `.agents/skills/<skill-name>/`.";
		case "claude-code":
			return "Claude Code uses CLAUDE.md as its main documentation file. Standards are stored as rule files in `.claude/rules/<standard-slug>.md` with YAML frontmatter. Skills are placed in `.claude/skills/<skill-name>/`.";
		case "github-copilot":
			return "GitHub Copilot uses `.github/copilot-instructions.md` as its main documentation file. Standards are stored as instruction files in `.github/instructions/<standard-slug>.md` with YAML frontmatter. Skills are placed in `.github/skills/<skill-name>/`.";
		case "cursor":
			return "Cursor uses `.cursor/rules/` for rule files (.md or .mdc) with optional YAML frontmatter. Rules support 4 modes: alwaysApply, auto-attached (description-based), glob-scoped, and manual. Skills are placed in `.cursor/skills/<skill-name>/`.";
	}
}

/** Returns the generic update file path for a given target agent. */
function getGenericUpdateFile(targetAgent: TargetAgent): string {
	switch (targetAgent) {
		case "agents-md":
			return "AGENTS.md";
		case "claude-code":
			return "CLAUDE.md";
		case "github-copilot":
			return ".github/copilot-instructions.md";
		case "cursor":
			return ".cursor/rules/general.mdc";
	}
}

/** Per-agent output type instructions for standards, skills, and generic updates. */
function getOutputTypeInstructions(
	targetAgent: TargetAgent,
	context: "suggestion" | "error" = "suggestion",
): string {
	const genericFile = getGenericUpdateFile(targetAgent);
	const itemLabel = context === "error" ? "issue" : "suggestion";

	const standardInstructions = getStandardInstructions(targetAgent);
	const skillInstructions = getSkillInstructions(targetAgent);

	const errorDefaultGuidance =
		context === "error"
			? `\n\n**Default for error fixes:** Most errors should be fixed inline as a **generic update** (editing the existing documentation file directly). Only choose "standard" or "skill" when the fix genuinely requires creating a new standalone file — for example, when the issue is about missing conventions that belong in a dedicated rule file, or missing procedural workflows that belong in a skill.`
			: "";

	return `### Output Types

For each ${itemLabel}, decide on ONE output type based on the decision criteria below.

**Standard** — A short, declarative rule file always loaded into context. Defines constraints and conventions the agent must follow at all times.

**Skill** — A folder with a SKILL.md file loaded on-demand via progressive disclosure. Provides procedural knowledge activated when a task matches its description. Skills can contain additional documentation about project structure, context, and resources that go beyond the bullet-point rules of standards.

**Generic Update** — A direct addition or edit to \`${genericFile}\`. Use for content that doesn't fit standards or skills (e.g., project structure, setup steps, architecture notes).

### Decision Criteria

1. **Must the agent always know this?** If yes -> standard. If only relevant during a specific task -> skill.
2. **Is it a constraint or a capability?** Constraints and guardrails -> standard. Capabilities and workflows -> skill.
3. **Is it short and declarative?** Bullet-point rules -> standard. Procedural paragraphs with sequenced steps -> skill.

When in doubt, prefer a standard. A single ${itemLabel} can produce both a standard (rules) and a skill (procedures).${errorDefaultGuidance}

${standardInstructions}

${skillInstructions}

### Generic Update

Add or edit content directly in \`${genericFile}\`. Preserve existing content. Add new sections at the most relevant location.`;
}

function getStandardInstructions(targetAgent: TargetAgent): string {
	switch (targetAgent) {
		case "agents-md":
			return `### Standard (AGENTS.md)

Append a section specific to the coding standards and guidelines in AGENTS.md, at the location where it is most relevant:

\`\`\`md
## Standard: <Standard Name>

<One-sentence summary describing the purpose and rationale of these rules.>

- <Rule 1, starting with a verb>
- <Rule 2, starting with a verb>
\`\`\``;

		case "claude-code":
			return `### Standard (Claude Code Rule)

Create a rule file at \`.claude/rules/<standard-slug>.md\`.

Choose one of two scoping modes in the YAML frontmatter:
- **Path-scoped** (\`paths: [...]\`): Rule applies only when working with files matching the glob patterns. Prefer this when the suggestions target specific file types or directories.
- **Always apply** (\`alwaysApply: true\`): Rule is loaded unconditionally. Use for universal constraints.

Supported glob patterns: \`**/*.ts\`, \`src/**/*\`, \`src/**/*.{ts,tsx}\`, \`{src,lib}/**/*.ts\`.

Path-scoped example:
\`\`\`md
---
paths:
  - "<glob pattern, e.g. src/**/*.ts>"
---

## Standard: <Standard Name>

<One-sentence summary describing the purpose and rationale of these rules.>

- <Rule 1, starting with a verb>
- <Rule 2, starting with a verb>
\`\`\`

Always-apply example:
\`\`\`md
---
alwaysApply: true
---

## Standard: <Standard Name>

<One-sentence summary describing the purpose and rationale of these rules.>

- <Rule 1, starting with a verb>
- <Rule 2, starting with a verb>
\`\`\``;

		case "github-copilot":
			return `### Standard (GitHub Copilot Instruction)

Create an instruction file at \`.github/instructions/<standard-slug>.md\`:

\`\`\`md
---
applyTo: '<glob pattern, e.g. **/*.ts>'
---

## Standard: <Standard Name>

<One-sentence summary describing the purpose and rationale of these rules.>

- <Rule 1, starting with a verb>
- <Rule 2, starting with a verb>
\`\`\``;

		case "cursor":
			return `### Standard (Cursor Rule)

Create a rule file at \`.cursor/rules/<standard-slug>.mdc\`.

Choose one of four rule modes in the YAML frontmatter:

- **Always apply** (\`alwaysApply: true\`): Rule is loaded unconditionally. Use for universal constraints.
- **Auto-attached** (\`description: "..."\` only, no globs, no alwaysApply): Cursor's AI decides when to include the rule based on the description. Prefer this when the rule targets a concept rather than specific files.
- **Glob-scoped** (\`globs: "pattern"\`): Rule applies only when working with files matching the glob patterns. Prefer this when the rule targets specific file types or directories.
- **Manual** (\`alwaysApply: false\`, no description, no globs): User must explicitly reference the rule with @ruleName.

Supported glob patterns: \`**/*.ts\`, \`src/**/*\`, \`src/**/*.{ts,tsx}\`, \`{src,lib}/**/*.ts\`.

Always-apply example:
\`\`\`md
---
alwaysApply: true
---

## Standard: <Standard Name>

<One-sentence summary describing the purpose and rationale of these rules.>

- <Rule 1, starting with a verb>
- <Rule 2, starting with a verb>
\`\`\`

Auto-attached example:
\`\`\`md
---
description: <When this rule should be activated. Be specific.>
---

## Standard: <Standard Name>

<One-sentence summary describing the purpose and rationale of these rules.>

- <Rule 1, starting with a verb>
- <Rule 2, starting with a verb>
\`\`\`

Glob-scoped example:
\`\`\`md
---
globs: "<glob pattern, e.g. src/**/*.ts>"
---

## Standard: <Standard Name>

<One-sentence summary describing the purpose and rationale of these rules.>

- <Rule 1, starting with a verb>
- <Rule 2, starting with a verb>
\`\`\``;
	}
}

function getSkillInstructions(targetAgent: TargetAgent): string {
	const skillDirMap: Record<TargetAgent, string> = {
		"agents-md": ".agents/skills",
		"claude-code": ".claude/skills",
		"github-copilot": ".github/skills",
		cursor: ".cursor/skills",
	};
	const skillDir = skillDirMap[targetAgent];

	return `### Skill

Create a \`SKILL.md\` file at \`${skillDir}/<skill-name>/SKILL.md\`:

\`\`\`md
---
name: <Skill Name>
description: <When the agent should activate this skill. Be specific. Use third-person voice.>
---

## Purpose

<One or two sentences explaining what the skill does and why it exists.>

## When to Use

<Describe the triggers: what task, file type, or user request should activate this skill.>

## Instructions

<Step-by-step procedural instructions in imperative/infinitive form (verb-first, not second person). Keep concise, under 5k words.>
\`\`\``;
}

function buildErrorFixPrompt(input: RemediationInput): string {
	if (input.errors.length === 0) {
		return "";
	}

	// Sort by severity descending
	const sorted = [...input.errors].sort(
		(a, b) => (b.severity ?? 0) - (a.severity ?? 0),
	);

	const snippetIndex = buildSnippetIndex(sorted);
	const contextFilesList = input.contextFilePaths
		.map((p) => `- ${p}`)
		.join("\n");
	const issueBlocks = sorted
		.map((issue, i) => formatErrorIssueBlock(issue, i, snippetIndex))
		.join("\n\n");
	const refSection = buildReferencedContentSection(snippetIndex);

	const agentDisplayName = TARGET_AGENTS[input.targetAgent];
	const agentDescription = getAgentContextDescription(input.targetAgent);
	const outputTypeInstructions = getOutputTypeInstructions(
		input.targetAgent,
		"error",
	);

	return `# Fix Documentation Issues

## Role
You are fixing documentation quality issues for the target: **${agentDisplayName}**.
${agentDescription}
These files guide AI coding agents. Fixes must be precise and concise.

## Context Files
${contextFilesList}

${input.technicalInventorySection ? `## Technical Context\n${input.technicalInventorySection}\n` : ""}## Project
${formatProjectLine(input.projectSummary)}

${refSection ? `${refSection}\n\n` : ""}## Issues to Fix (${input.errors.length})

${issueBlocks}

${outputTypeInstructions}

## Instructions
1. Read the target files from disk before making changes
2. Use your own judgment to assess each issue: these were produced by an automated evaluator and some may be false positives or irrelevant given the actual file content. Skip any issue that is not a real problem after reading the file
3. For each remaining issue, decide the output type (standard, skill, or generic update) using the decision criteria above
4. When multiple issues target the same file and related topics, consolidate them into well-organized sections rather than creating many small isolated additions
5. Fix each remaining issue, highest severity first
6. Preserve all correct existing content
7. Keep changes minimal — only fix what's genuinely flagged
8. Do not add commentary, headers, or sections beyond what's needed
9. After making all changes, output a JSON summary:
\`\`\`json
{
  "actions": [
    { "issueIndex": 1, "status": "fixed", "file": "AGENTS.md", "summary": "Replaced vague setup instructions with exact commands", "outputType": "generic" },
    { "issueIndex": 2, "status": "added", "file": ".claude/rules/git-conventions.md", "summary": "Created git conventions standard", "outputType": "standard" },
    { "issueIndex": 3, "status": "skipped", "summary": "Not a real issue after reading the file" }
  ]
}
\`\`\`
Use issue numbers from above. Status: "fixed", "added", or "skipped". Use "fixed" for inline edits and "added" for new files. Include \`outputType\` ("standard", "skill", or "generic") for non-skipped actions. Keep summaries under 15 words.`;
}

function buildSuggestionEnrichPrompt(input: RemediationInput): string {
	if (input.suggestions.length === 0) {
		return "";
	}

	// Sort by impact level: High > Medium > Low
	const impactOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
	const sorted = [...input.suggestions].sort(
		(a, b) =>
			(impactOrder[a.impactLevel ?? "Low"] ?? 2) -
			(impactOrder[b.impactLevel ?? "Low"] ?? 2),
	);

	const snippetIndex = buildSnippetIndex(sorted);
	const contextFilesList = input.contextFilePaths
		.map((p) => `- ${p}`)
		.join("\n");
	const issueBlocks = sorted
		.map((issue, i) => formatSuggestionIssueBlock(issue, i, snippetIndex))
		.join("\n\n");
	const refSection = buildReferencedContentSection(snippetIndex);

	const agentDisplayName = TARGET_AGENTS[input.targetAgent];
	const agentDescription = getAgentContextDescription(input.targetAgent);
	const outputTypeInstructions = getOutputTypeInstructions(input.targetAgent);

	return `# Enrich Documentation

## Role
You are enriching AI agent documentation for the target: **${agentDisplayName}**.
${agentDescription}

## Context Files
${contextFilesList}

${input.technicalInventorySection ? `## Technical Context\n${input.technicalInventorySection}\n` : ""}## Project
${formatProjectLine(input.projectSummary)}

${refSection ? `${refSection}\n\n` : ""}## Documentation Gaps (${input.suggestions.length})

${issueBlocks}

${outputTypeInstructions}

## Phantom File Remapping
Evaluator-suggested file paths (e.g., \`packages/api/AGENTS.md\`) may not match the target agent's conventions. Ignore evaluator-suggested paths for new files and create files at the correct location per the output type instructions above.

## Instructions
1. Read the target files and scan the codebase before making changes
2. Use your own judgment to assess each gap: these were produced by an automated evaluator and some may be false positives or irrelevant given the actual codebase. Skip any suggestion that is not genuinely useful after reviewing the code
3. For each remaining gap, decide the output type (standard, skill, or generic update) using the decision criteria above
4. When multiple gaps target the same file and related topics, consolidate them into well-organized sections rather than creating many small isolated additions
5. Address each gap, highest impact first
6. Add concise, accurate documentation based on actual codebase analysis
7. Preserve all correct existing content
8. Keep additions minimal — only add what's needed to close the gap
9. After making all changes, output a JSON summary:
\`\`\`json
{
  "actions": [
    { "issueIndex": 1, "status": "added", "file": ".claude/rules/testing.md", "summary": "Created testing conventions standard", "outputType": "standard" },
    { "issueIndex": 2, "status": "added", "file": "AGENTS.md", "summary": "Added architecture overview section", "outputType": "generic" },
    { "issueIndex": 3, "status": "skipped", "summary": "Already documented in existing section" }
  ]
}
\`\`\`
Use gap numbers from above. Status: "added" or "skipped". Keep summaries under 15 words. Include \`outputType\` ("standard", "skill", or "generic") for non-skipped actions.`;
}

export function generateRemediationPrompts(
	input: RemediationInput,
): RemediationPrompts {
	return {
		errorFixPrompt: buildErrorFixPrompt(input),
		suggestionEnrichPrompt: buildSuggestionEnrichPrompt(input),
		errorCount: input.errors.length,
		suggestionCount: input.suggestions.length,
	};
}
