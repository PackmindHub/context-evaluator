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
	colocatedPairs?: Array<{
		directory: string;
		agentsPath: string;
		claudePath: string;
	}>;
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
function getGenericUpdateFile(
	targetAgent: TargetAgent,
	colocatedPairs?: RemediationInput["colocatedPairs"],
): string {
	// When colocated pairs exist, AGENTS.md is always the source of truth
	if (colocatedPairs && colocatedPairs.length > 0) {
		return "AGENTS.md";
	}
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
	colocatedPairs?: RemediationInput["colocatedPairs"],
): string {
	const genericFile = getGenericUpdateFile(targetAgent, colocatedPairs);
	const itemLabel = context === "error" ? "issue" : "suggestion";

	const standardInstructions = getStandardInstructions(targetAgent);
	const skillInstructions = getSkillInstructions(targetAgent);

	const errorDefaultGuidance =
		context === "error"
			? `\n\n**Choosing the right type for error fixes:**
- Factual corrections (wrong paths, outdated names, incorrect references) → **generic update**
- New procedural workflows (commit steps, CI/CD procedures, deployment flows) → **skill**
- New constraints or guardrails (security rules, coding conventions) → **standard**

Use the evaluator category in each issue header as a signal:
- \`outdated-documentation\`, \`structure-formatting\` → usually **generic update** (factual corrections: wrong paths, outdated names)
- \`project-structure\` → **generic update**; produce an annotated directory tree where each entry includes a brief description of its purpose (e.g., \`src/components/  # React UI components\`). Bare folder listings without descriptions have no value for AI agents — every directory must explain what it contains.
- \`completeness\` (missing workflow or process documentation) → usually **skill**
- \`completeness\` (missing constraints, conventions, or rules) → usually **standard**
- \`git-workflow\`, \`testing\`, \`deployment\` → usually **skill** (procedural)
- \`security\`, \`code-style\`, \`language-clarity\` → usually **standard** (constraints)
- Missing environment variable or setup documentation → usually **generic update**

When multiple issues share the same evaluator category and topic, consolidate them into a single output rather than creating many small separate additions.`
			: "";

	return `### Output Types

For each ${itemLabel}, decide on ONE output type. **Strongly prefer standards and skills over generic updates.** Generic updates are for static reference content only — not for documenting behaviors, constraints, or processes.

**Standard** — A short, declarative rule file always loaded into context. Defines constraints, naming conventions, code style guidelines, and non-negotiables the agent must follow at all times.

**Skill** — A folder with a SKILL.md file loaded on-demand via progressive disclosure. Provides procedural knowledge activated when a task matches its description. Skills are ideal for repeatable workflows, multi-step processes, and tasks requiring project-specific context (file paths, patterns, templates). Skills can contain richer instructional content — references, examples, and supporting resources — beyond the bullet-point rules of standards.

**Generic Update** — A direct addition or edit to \`${genericFile}\`. Use only for static reference content that doesn't fit standards or skills (e.g., project structure, setup steps, architecture notes, environment variable documentation).

### Decision Criteria

1. **Must the agent always know this?** If yes → standard. If only relevant during a specific task → skill.
2. **Is it a constraint or a capability?** Constraints, guardrails, naming conventions, code style rules → standard. Capabilities, workflows, repeatable processes → skill.
3. **Is it short and declarative?** Bullet-point rules → standard. Procedural paragraphs with sequenced steps → skill.
4. **Would it need project-specific resources to execute?** File paths, patterns, templates, or context specific to a task → skill.
5. **Is it static reference information?** Setup instructions, architecture overviews, project structure → generic update.

**Bias toward creating standards and skills.** A single ${itemLabel} can produce both a standard (rules) and a skill (procedures). Only fall back to generic update when the content is clearly static reference material with no behavioral or procedural dimension.${errorDefaultGuidance}

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

/** Build a consolidation notice when colocated pairs exist. */
function buildConsolidationNotice(
	colocatedPairs?: RemediationInput["colocatedPairs"],
): string {
	if (!colocatedPairs || colocatedPairs.length === 0) return "";

	const pairList = colocatedPairs
		.map(
			(p) =>
				`- \`${p.directory}/\`: \`${p.agentsPath}\` is the canonical file — \`${p.claudePath}\` contains only \`@AGENTS.md\``,
		)
		.join("\n");

	return `
## ⚠ CRITICAL FILE RULE — CLAUDE.md IS READ-ONLY
In the following directories, AGENTS.md is the ONLY source of truth.
CLAUDE.md contains a single line: \`@AGENTS.md\`. This MUST NOT change.

${pairList}

STRICT RULES:
1. Never add content to CLAUDE.md. It must remain as the single line \`@AGENTS.md\`.
2. If issues mention CLAUDE.md, fix them by editing AGENTS.md instead.
3. If both files have duplicate or conflicting content, consolidate into AGENTS.md.
4. Never make CLAUDE.md the canonical file — even if AGENTS.md has quality problems.

`;
}

/** Filter CLAUDE.md paths from context file list for consolidated pairs. */
function filterColocatedClaudePaths(
	contextFilePaths: string[],
	colocatedPairs?: RemediationInput["colocatedPairs"],
): string[] {
	if (!colocatedPairs || colocatedPairs.length === 0) return contextFilePaths;

	const claudePaths = new Set(colocatedPairs.map((p) => p.claudePath));
	return contextFilePaths.filter((p) => !claudePaths.has(p));
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
	const effectiveContextFiles = filterColocatedClaudePaths(
		input.contextFilePaths,
		input.colocatedPairs,
	);
	const contextFilesList = effectiveContextFiles
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
		input.colocatedPairs,
	);

	const consolidationNotice = buildConsolidationNotice(input.colocatedPairs);

	return `# Fix Documentation Issues

## Role
You are fixing documentation quality issues for the target: **${agentDisplayName}**.
${agentDescription}
These files guide AI coding agents. Fixes must be precise and concise.
${consolidationNotice}
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
3. **Note:** The **Fix** text for each issue was generated without knowledge of standards or skills — it may describe inline edits even when a skill or standard would be more appropriate. Use the output type decision criteria and the evaluator category to override the suggested approach when warranted.
4. For each remaining issue, decide the output type (standard, skill, or generic update) using the decision criteria above
5. When multiple issues target the same file and related topics, consolidate them into well-organized sections rather than creating many small isolated additions
6. Fix each remaining issue, highest severity first
7. Preserve all correct existing content
8. Keep changes minimal — only fix what's genuinely flagged
9. Format all added or edited content with concise bullet point lists — avoid dense prose paragraphs; each distinct fact, rule, step, or constraint should be its own bullet
10. Do not add commentary, headers, or sections beyond what's needed
11. After making all changes, output a JSON summary:
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
	const effectiveContextFiles = filterColocatedClaudePaths(
		input.contextFilePaths,
		input.colocatedPairs,
	);
	const contextFilesList = effectiveContextFiles
		.map((p) => `- ${p}`)
		.join("\n");
	const issueBlocks = sorted
		.map((issue, i) => formatSuggestionIssueBlock(issue, i, snippetIndex))
		.join("\n\n");
	const refSection = buildReferencedContentSection(snippetIndex);

	const agentDisplayName = TARGET_AGENTS[input.targetAgent];
	const agentDescription = getAgentContextDescription(input.targetAgent);
	const outputTypeInstructions = getOutputTypeInstructions(
		input.targetAgent,
		"suggestion",
		input.colocatedPairs,
	);

	const consolidationNotice = buildConsolidationNotice(input.colocatedPairs);

	return `# Enrich Documentation

## Role
You are enriching AI agent documentation for the target: **${agentDisplayName}**.
${agentDescription}
${consolidationNotice}
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
9. Format all added content with concise bullet point lists — avoid dense prose paragraphs; each distinct fact, rule, step, or constraint should be its own bullet
10. After making all changes, output a JSON summary:
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

// ---------------------------------------------------------------------------
// Plan-first pipeline prompts
// ---------------------------------------------------------------------------

export interface PlanFirstPrompts {
	errorPlanPrompt: string;
	errorExecutionPrompt: string;
	suggestionPlanPrompt: string;
	suggestionExecutionPrompt: string;
	errorCount: number;
	suggestionCount: number;
}

/** Build a minimal context block reused by all plan-first prompts. */
function buildMinimalContext(input: RemediationInput): string {
	const effectiveContextFiles = filterColocatedClaudePaths(
		input.contextFilePaths,
		input.colocatedPairs,
	);
	const contextFilesList = effectiveContextFiles
		.map((p) => `- ${p}`)
		.join("\n");
	const agentDisplayName = TARGET_AGENTS[input.targetAgent];
	const agentDescription = getAgentContextDescription(input.targetAgent);
	const consolidationNotice = buildConsolidationNotice(input.colocatedPairs);

	return `## Target: **${agentDisplayName}**
${agentDescription}
${consolidationNotice}
## Context Files
${contextFilesList}

${input.technicalInventorySection ? `## Technical Context\n${input.technicalInventorySection}\n` : ""}## Project
${formatProjectLine(input.projectSummary)}`;
}

/**
 * Build a prompt that asks the AI to produce a **markdown plan** for fixing errors.
 * The plan should group related issues, decide output types, and describe the fix strategy.
 */
export function buildErrorPlanPrompt(input: RemediationInput): string {
	if (input.errors.length === 0) return "";

	const sorted = [...input.errors].sort(
		(a, b) => (b.severity ?? 0) - (a.severity ?? 0),
	);

	const snippetIndex = buildSnippetIndex(sorted);
	const issueBlocks = sorted
		.map((issue, i) => formatErrorIssueBlock(issue, i, snippetIndex))
		.join("\n\n");
	const refSection = buildReferencedContentSection(snippetIndex);
	const outputTypeInstructions = getOutputTypeInstructions(
		input.targetAgent,
		"error",
		input.colocatedPairs,
	);

	return `# Plan Error Fixes

## Role
You are an expert documentation planner. Analyze the issues below and produce a **markdown plan** describing how to fix them. Do NOT make any file changes — only output the plan.

${buildMinimalContext(input)}

${refSection ? `${refSection}\n\n` : ""}## Issues to Fix (${input.errors.length})

${issueBlocks}

${outputTypeInstructions}

## Planning Instructions
1. Read the target files from disk to understand the current content
2. Assess each issue: flag any that appear to be false positives after reading the file
3. Group related issues into consolidated tasks (issues targeting the same file and topic)
4. For each task, decide the output type (standard, skill, or generic update)
5. Describe the fix strategy: what will change, where, and why
6. NEVER plan to add content to CLAUDE.md files that contain \`@AGENTS.md\`
7. If both AGENTS.md and CLAUDE.md exist in the same directory, all fixes go to AGENTS.md

## Output Format
Produce a markdown plan with this structure:

\`\`\`
## Task 1: <Short title>
**Issues:** #1, #3 (grouped because ...)
**Output type:** generic | standard | skill
**Target file:** <path>
**Strategy:** <What to change and why>

## Task 2: ...

## Skipped Issues
- #4: <reason for skipping>
\`\`\`

Note: **Target file:** must never be CLAUDE.md when a consolidation notice applies above.

Keep the plan concise. Focus on WHAT to do, not HOW to write the code.`;
}

/**
 * Build an execution prompt that receives the error plan + minimal context.
 * Instructs the AI to execute the plan and output a JSON action summary.
 */
export function buildErrorExecutionPrompt(
	input: RemediationInput,
	errorPlan: string,
): string {
	if (input.errors.length === 0) return "";

	const outputTypeInstructions = getOutputTypeInstructions(
		input.targetAgent,
		"error",
		input.colocatedPairs,
	);

	return `# Execute Error Fix Plan

## Role
You are executing a pre-approved plan to fix documentation issues.

${buildMinimalContext(input)}

${outputTypeInstructions}

## Plan to Execute

${errorPlan}

## Execution Instructions
1. Read the target files from disk before making changes
2. Execute each task in the plan above, in order
3. For tasks marked as skipped in the plan, skip them
4. Preserve all correct existing content
5. Keep changes minimal — only fix what the plan specifies
6. Format all added or edited content with concise bullet point lists — avoid dense prose paragraphs; each distinct fact, rule, step, or constraint should be its own bullet
7. Do not add commentary, headers, or sections beyond what's needed
8. After making all changes, output a JSON summary:
\`\`\`json
{
  "actions": [
    { "issueIndex": 1, "status": "fixed", "file": "AGENTS.md", "summary": "Replaced vague setup instructions with exact commands", "outputType": "generic" },
    { "issueIndex": 2, "status": "added", "file": ".claude/rules/git-conventions.md", "summary": "Created git conventions standard", "outputType": "standard" },
    { "issueIndex": 3, "status": "skipped", "summary": "Not a real issue after reading the file" }
  ]
}
\`\`\`
Use original issue numbers from the plan. Status: "fixed", "added", or "skipped". Use "fixed" for inline edits and "added" for new files. Include \`outputType\` ("standard", "skill", or "generic") for non-skipped actions. Keep summaries under 15 words.`;
}

/**
 * Build a prompt that asks the AI to produce a **markdown plan** for suggestion enrichment.
 * Optionally includes a summary of recent error fixes so suggestions don't duplicate work.
 */
export function buildSuggestionPlanPrompt(
	input: RemediationInput,
	errorFixSummary?: string,
): string {
	if (input.suggestions.length === 0) return "";

	const impactOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
	const sorted = [...input.suggestions].sort(
		(a, b) =>
			(impactOrder[a.impactLevel ?? "Low"] ?? 2) -
			(impactOrder[b.impactLevel ?? "Low"] ?? 2),
	);

	const snippetIndex = buildSnippetIndex(sorted);
	const issueBlocks = sorted
		.map((issue, i) => formatSuggestionIssueBlock(issue, i, snippetIndex))
		.join("\n\n");
	const refSection = buildReferencedContentSection(snippetIndex);
	const outputTypeInstructions = getOutputTypeInstructions(
		input.targetAgent,
		"suggestion",
		input.colocatedPairs,
	);

	const errorFixSection = errorFixSummary
		? `## Recent Error Fixes
The following error fixes have already been applied to the repository. Do NOT duplicate this work — your suggestions should complement, not repeat, these changes.

${errorFixSummary}
`
		: "";

	return `# Plan Documentation Enrichment

## Role
You are an expert documentation planner. Analyze the documentation gaps below and produce a **markdown plan** describing how to enrich the documentation. Do NOT make any file changes — only output the plan.

${buildMinimalContext(input)}

${errorFixSection}${refSection ? `${refSection}\n\n` : ""}## Documentation Gaps (${input.suggestions.length})

${issueBlocks}

${outputTypeInstructions}

## Phantom File Remapping
Evaluator-suggested file paths (e.g., \`packages/api/AGENTS.md\`) may not match the target agent's conventions. Ignore evaluator-suggested paths for new files and create files at the correct location per the output type instructions above.

## Planning Instructions
1. Read the target files and scan the codebase to understand the current state
2. Assess each gap: flag any that appear to be false positives or already documented
3. Group related gaps into consolidated tasks (gaps targeting the same topic or file)
4. For each task, decide the output type (standard, skill, or generic update)
5. Describe the enrichment strategy: what to add, where, and why
6. Sort tasks by impact (highest first)
7. NEVER plan to add content to CLAUDE.md files that contain \`@AGENTS.md\`
8. If both AGENTS.md and CLAUDE.md exist in the same directory, all additions go to AGENTS.md

## Output Format
Produce a markdown plan with this structure:

\`\`\`
## Task 1: <Short title>
**Gaps:** #1, #3 (grouped because ...)
**Output type:** generic | standard | skill
**Target file:** <path>
**Strategy:** <What to add and why>

## Task 2: ...

## Skipped Gaps
- #4: <reason for skipping>
\`\`\`

Note: **Target file:** must never be CLAUDE.md when a consolidation notice applies above.

Keep the plan concise. Focus on WHAT to do, not HOW to write the code.`;
}

/**
 * Build an execution prompt that receives the suggestion plan + minimal context.
 * Instructs the AI to execute the plan and output a JSON action summary.
 */
export function buildSuggestionExecutionPrompt(
	input: RemediationInput,
	suggestionPlan: string,
): string {
	if (input.suggestions.length === 0) return "";

	const outputTypeInstructions = getOutputTypeInstructions(
		input.targetAgent,
		"suggestion",
		input.colocatedPairs,
	);

	return `# Execute Documentation Enrichment Plan

## Role
You are executing a pre-approved plan to enrich AI agent documentation.

${buildMinimalContext(input)}

${outputTypeInstructions}

## Phantom File Remapping
Evaluator-suggested file paths (e.g., \`packages/api/AGENTS.md\`) may not match the target agent's conventions. Ignore evaluator-suggested paths for new files and create files at the correct location per the output type instructions above.

## Plan to Execute

${suggestionPlan}

## Execution Instructions
1. Read the target files and scan the codebase before making changes
2. Execute each task in the plan above, in order
3. For tasks marked as skipped in the plan, skip them
4. Add concise, accurate documentation based on actual codebase analysis
5. Preserve all correct existing content
6. Keep additions minimal — only add what the plan specifies
7. Format all added content with concise bullet point lists — avoid dense prose paragraphs; each distinct fact, rule, step, or constraint should be its own bullet
8. After making all changes, output a JSON summary:
\`\`\`json
{
  "actions": [
    { "issueIndex": 1, "status": "added", "file": ".claude/rules/testing.md", "summary": "Created testing conventions standard", "outputType": "standard" },
    { "issueIndex": 2, "status": "added", "file": "AGENTS.md", "summary": "Added architecture overview section", "outputType": "generic" },
    { "issueIndex": 3, "status": "skipped", "summary": "Already documented in existing section" }
  ]
}
\`\`\`
Use original gap numbers from the plan. Status: "added" or "skipped". Keep summaries under 15 words. Include \`outputType\` ("standard", "skill", or "generic") for non-skipped actions.`;
}

/**
 * Generate all 4 plan-first prompts incrementally.
 * Call with no plans to get plan prompts, then call again with plans to get execution prompts.
 */
export function generatePlanFirstPrompts(
	input: RemediationInput,
	plans?: { errorPlan?: string; suggestionPlan?: string },
	errorFixSummary?: string,
): PlanFirstPrompts {
	return {
		errorPlanPrompt: buildErrorPlanPrompt(input),
		errorExecutionPrompt: plans?.errorPlan
			? buildErrorExecutionPrompt(input, plans.errorPlan)
			: "",
		suggestionPlanPrompt: buildSuggestionPlanPrompt(input, errorFixSummary),
		suggestionExecutionPrompt: plans?.suggestionPlan
			? buildSuggestionExecutionPrompt(input, plans.suggestionPlan)
			: "",
		errorCount: input.errors.length,
		suggestionCount: input.suggestions.length,
	};
}
