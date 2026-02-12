/**
 * Remediation prompt generator.
 *
 * Generates copy-paste-ready AI agent prompts from evaluation results:
 * - Error fix prompt: instructs an agent to fix documentation issues
 * - Suggestion enrich prompt: instructs an agent to add missing documentation
 */

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
}

export interface RemediationInput {
	targetFileType: "AGENTS.md" | "CLAUDE.md";
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

	if (issue.location.file) {
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
You are fixing documentation quality issues in ${input.targetFileType} files.
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

	return `# Enrich Documentation

## Role
You are enriching AI agent documentation in ${input.targetFileType} files.
These files guide AI coding agents. Additions must be accurate and concise.

## Context Files
${contextFilesList}

${input.technicalInventorySection ? `## Technical Context\n${input.technicalInventorySection}\n` : ""}## Project
${formatProjectLine(input.projectSummary)}

## Documentation Gaps (${input.suggestions.length})

${issueBlocks}

## Instructions
1. Read the target files and scan the codebase before making changes
2. Use your own judgment to assess each gap: these were produced by an automated evaluator and some may be false positives or irrelevant given the actual codebase. Skip any suggestion that is not genuinely useful after reviewing the code
3. Address each remaining gap, highest impact first
4. Add concise, accurate documentation based on actual codebase analysis
5. Create new ${input.targetFileType} files in subdirectories if recommended
6. Preserve all correct existing content
7. Keep additions minimal — only add what's needed to close the gap
8. After making all changes, output a JSON summary:
\`\`\`json
{
  "actions": [
    { "issueIndex": 1, "status": "added", "file": "AGENTS.md", "summary": "Added testing patterns section with Jest conventions" },
    { "issueIndex": 2, "status": "skipped", "summary": "Already documented in existing section" }
  ]
}
\`\`\`
Use gap numbers from above. Status: "added" or "skipped". Keep summaries under 15 words.`;
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
