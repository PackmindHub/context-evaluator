/**
 * Remediation prompt generator.
 *
 * Generates copy-paste-ready AI agent prompts from evaluation results:
 * - Error fix prompt: instructs an agent to fix documentation issues
 * - Suggestion enrich prompt: instructs an agent to add missing documentation
 *   with structured output routing (standard, skill, or generic update)
 */

import type { TargetAgent } from "@shared/types/remediation";

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
	return issue.fix || issue.recommendation || "Review and fix this issue";
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

function formatErrorIssueBlock(issue: RemediationIssue, index: number): string {
	const lines: string[] = [];
	lines.push(`### ${index + 1}. ${issue.evaluatorName}: ${issue.category}`);
	lines.push(`**Severity**: ${issue.severity ?? "N/A"}/10`);

	if (issue.location.file) {
		lines.push(
			`**File**: ${issue.location.file}, lines ${issue.location.start}-${issue.location.end}`,
		);
	}

	lines.push(`**Problem**: ${formatIssueDescription(issue)}`);

	if (issue.snippet) {
		lines.push("**Current content**:");
		lines.push(`> ${issue.snippet.split("\n").join("\n> ")}`);
	}

	lines.push(`**Fix**: ${formatIssueFix(issue)}`);

	return lines.join("\n");
}

function formatSuggestionIssueBlock(
	issue: RemediationIssue,
	index: number,
): string {
	const lines: string[] = [];
	lines.push(`### ${index + 1}. ${issue.evaluatorName}: ${issue.category}`);
	lines.push(`**Impact**: ${issue.impactLevel ?? "N/A"}`);

	if (issue.isPhantomFile && issue.location.file) {
		lines.push(`**Action**: Create new file at \`${issue.location.file}\``);
	} else if (issue.location.file) {
		lines.push(
			`**File**: ${issue.location.file}, lines ${issue.location.start}-${issue.location.end}`,
		);
	}

	lines.push(`**Gap**: ${formatIssueDescription(issue)}`);

	if (issue.snippet) {
		lines.push("**Current content**:");
		lines.push(`> ${issue.snippet.split("\n").join("\n> ")}`);
	}

	lines.push(`**Recommendation**: ${formatIssueFix(issue)}`);

	return lines.join("\n");
}

/** Short context description for each target agent. */
function getAgentContextDescription(targetAgent: TargetAgent): string {
	switch (targetAgent) {
		case "agents-md":
			return "AGENTS.md is a universal AI agent documentation file. Standards are added as inline sections. Skills are placed in `.agent/skills/<skill-name>/`.";
		case "claude-code":
			return "Claude Code uses CLAUDE.md as its main documentation file. Standards are stored as rule files in `.claude/rules/<standard-slug>.md` with YAML frontmatter. Skills are placed in `.agent/skills/<skill-name>/`.";
		case "github-copilot":
			return "GitHub Copilot uses `.github/copilot-instructions.md` as its main documentation file. Standards are stored as instruction files in `.github/instructions/<standard-slug>.md` with YAML frontmatter. Skills are placed in `.github/skills/<skill-name>/`.";
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
	}
}

/** Per-agent output type instructions for standards, skills, and generic updates. */
function getOutputTypeInstructions(targetAgent: TargetAgent): string {
	const genericFile = getGenericUpdateFile(targetAgent);

	const standardInstructions = getStandardInstructions(targetAgent);
	const skillInstructions = getSkillInstructions(targetAgent);

	return `### Output Types

For each suggestion, decide on ONE output type based on the decision criteria below.

**Standard** — A short, declarative rule file always loaded into context. Defines constraints and conventions the agent must follow at all times.

**Skill** — A folder with instructions, scripts, and resources loaded on-demand via progressive disclosure. Provides procedural knowledge activated when a task matches its description.

**Generic Update** — A direct addition or edit to \`${genericFile}\`. Use for content that doesn't fit standards or skills (e.g., project structure, setup steps, architecture notes).

### Decision Criteria

1. **Must the agent always know this?** If yes -> standard. If only relevant during a specific task -> skill.
2. **Is it a constraint or a capability?** Constraints and guardrails -> standard. Capabilities and workflows -> skill.
3. **Does it need bundled resources?** If it requires scripts, templates, or assets -> skill. If a single file of rules suffices -> standard.
4. **Is it short and declarative?** Bullet-point rules -> standard. Procedural paragraphs with sequenced steps -> skill.

When in doubt, prefer a standard. A single suggestion can produce both a standard (rules) and a skill (procedures).

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

Create a rule file at \`.claude/rules/<standard-slug>.md\`:

\`\`\`md
---
name: <Standard Name>
alwaysApply: true
description: <When to apply this standard>
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
	}
}

function getSkillInstructions(targetAgent: TargetAgent): string {
	const skillDir =
		targetAgent === "github-copilot" ? ".github/skills" : ".agent/skills";

	return `### Skill

Create the skill folder at \`${skillDir}/<skill-name>/\`:

\`\`\`
${skillDir}/<skill-name>/
├── SKILL.md (required - YAML frontmatter with name + description, then markdown instructions)
└── Optional: scripts/, references/, assets/ directories
\`\`\`

The SKILL.md must include YAML frontmatter with \`name\` and \`description\` fields, followed by markdown instructions written in imperative/infinitive form.`;
}

function buildErrorFixPrompt(input: RemediationInput): string {
	if (input.errors.length === 0) {
		return "";
	}

	// Sort by severity descending
	const sorted = [...input.errors].sort(
		(a, b) => (b.severity ?? 0) - (a.severity ?? 0),
	);

	const contextFilesList = input.contextFilePaths
		.map((p) => `- ${p}`)
		.join("\n");
	const issueBlocks = sorted
		.map((issue, i) => formatErrorIssueBlock(issue, i))
		.join("\n\n");

	return `# Fix Documentation Issues

## Role
You are fixing documentation quality issues in the AI agent documentation files listed below.
These files guide AI coding agents. Fixes must be precise and concise.

## Context Files
${contextFilesList}

${input.technicalInventorySection ? `## Technical Context\n${input.technicalInventorySection}\n` : ""}## Project
${formatProjectLine(input.projectSummary)}

## Issues to Fix (${input.errors.length})

${issueBlocks}

## Instructions
1. Read the target files from disk before making changes
2. Use your own judgment to assess each issue: these were produced by an automated evaluator and some may be false positives or irrelevant given the actual file content. Skip any issue that is not a real problem after reading the file
3. Fix each remaining issue, highest severity first
4. Preserve all correct existing content
5. Keep changes minimal — only fix what's genuinely flagged
6. Do not add commentary, headers, or sections beyond what's needed
7. After making all changes, output a JSON summary:
\`\`\`json
{
  "actions": [
    { "issueIndex": 1, "status": "fixed", "file": "AGENTS.md", "summary": "Replaced vague setup instructions with exact commands" },
    { "issueIndex": 2, "status": "skipped", "summary": "Not a real issue after reading the file" }
  ]
}
\`\`\`
Use issue numbers from above. Status: "fixed" or "skipped". Keep summaries under 15 words.`;
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

	const contextFilesList = input.contextFilePaths
		.map((p) => `- ${p}`)
		.join("\n");
	const issueBlocks = sorted
		.map((issue, i) => formatSuggestionIssueBlock(issue, i))
		.join("\n\n");

	const agentDescription = getAgentContextDescription(input.targetAgent);
	const outputTypeInstructions = getOutputTypeInstructions(input.targetAgent);

	return `# Enrich Documentation

## Role
You are enriching AI agent documentation for the target: **${agentDescription.split(".")[0]}**.
${agentDescription}

## Context Files
${contextFilesList}

${input.technicalInventorySection ? `## Technical Context\n${input.technicalInventorySection}\n` : ""}## Project
${formatProjectLine(input.projectSummary)}

## Documentation Gaps (${input.suggestions.length})

${issueBlocks}

${outputTypeInstructions}

## Phantom File Remapping
Evaluator-suggested file paths (e.g., \`packages/api/AGENTS.md\`) may not match the target agent's conventions. Ignore evaluator-suggested paths for new files and create files at the correct location per the output type instructions above.

## Instructions
1. Read the target files and scan the codebase before making changes
2. Use your own judgment to assess each gap: these were produced by an automated evaluator and some may be false positives or irrelevant given the actual codebase. Skip any suggestion that is not genuinely useful after reviewing the code
3. For each remaining gap, decide the output type (standard, skill, or generic update) using the decision criteria above
4. Address each gap, highest impact first
5. Add concise, accurate documentation based on actual codebase analysis
6. Preserve all correct existing content
7. Keep additions minimal — only add what's needed to close the gap
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
