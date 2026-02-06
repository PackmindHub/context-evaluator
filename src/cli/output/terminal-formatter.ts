import type { FileEvaluationResult } from "@shared/evaluation/runner";
import type {
	EvaluationOutput,
	Issue,
	Metadata,
} from "@shared/types/evaluation";
import { getIssueSeverity } from "@shared/types/evaluation";
import {
	formatCost,
	formatDuration,
	formatLocation,
	formatTokenUsage,
} from "@shared/types/issues";
import {
	colors,
	getEvaluatorLabel,
	getSeverityDisplay,
	impactLevelToSeverity,
	PROGRESS_CONFIG,
	type ProgressType,
} from "./terminal-colors";

/**
 * Display box header
 */
function displayBoxHeader(title: string): void {
	const width = 80;
	const line = "═".repeat(width);
	const padding = Math.max(0, Math.floor((width - title.length - 2) / 2));
	const titleLine =
		"═".repeat(padding) +
		` ${title} ` +
		"═".repeat(width - padding - title.length - 2);

	console.log(`${colors.bright}${colors.cyan}╔${line}╗${colors.reset}`);
	console.log(`${colors.bright}${colors.cyan}║${titleLine}║${colors.reset}`);
	console.log(`${colors.bright}${colors.cyan}╚${line}╝${colors.reset}`);
}

/**
 * Display section header
 */
function displaySectionHeader(title: string): void {
	console.log(
		`\n${colors.bright}${colors.brightCyan}▓▓▓ ${title} ▓▓▓${colors.reset}\n`,
	);
}

/**
 * Format an individual issue with proper indentation
 */
function formatIssue(issue: Issue, indent: string): string {
	const severity = getIssueSeverity(issue);
	const { color, emoji } = getSeverityDisplay(severity);
	const lines: string[] = [];

	// Handle title or category display
	const title = issue.title || issue.category;
	const { label } = getSeverityDisplay(severity);
	lines.push(
		`${indent}${color}${emoji} ${label}${colors.reset} - ${colors.bright}${title}${colors.reset}`,
	);

	// Problem/Description
	const problem = issue.problem || issue.description;
	if (problem) {
		lines.push(`${indent}  ${colors.bright}Problem:${colors.reset} ${problem}`);
	}

	// Location
	if (issue.location) {
		lines.push(
			`${indent}  ${colors.bright}Location:${colors.reset} ${formatLocation(issue.location)}`,
		);
	}

	// Impact
	if (issue.impact) {
		lines.push(
			`${indent}  ${colors.bright}Impact:${colors.reset} ${issue.impact}`,
		);
	}

	// Fix/Recommendation/Suggestion
	const fix = issue.fix || issue.recommendation || issue.suggestion;
	if (fix) {
		lines.push(`${indent}  ${colors.bright}Fix:${colors.reset} ${fix}`);
	}

	return lines.join("\n");
}

/**
 * Display metadata section
 */
function displayMetadata(metadata: Metadata): void {
	displayBoxHeader("EVALUATION RESULTS");

	console.log(
		`\n${colors.bright}Generated:${colors.reset} ${metadata.generatedAt}`,
	);
	console.log(`${colors.bright}Agent:${colors.reset} ${metadata.agent}`);
	console.log(
		`${colors.bright}Mode:${colors.reset} ${metadata.evaluationMode}`,
	);
	console.log(
		`${colors.bright}Total Files:${colors.reset} ${metadata.totalFiles}`,
	);
}

/**
 * Display summary statistics
 */
function displaySummary(metadata: Metadata): void {
	displaySectionHeader("SUMMARY STATISTICS");

	// Issue counts
	if (metadata.totalIssues !== undefined) {
		console.log(
			`${colors.bright}Total Issues:${colors.reset} ${metadata.totalIssues}`,
		);

		if (metadata.highCount && metadata.highCount > 0) {
			console.log(
				`  ${colors.yellow}🟠 High:${colors.reset} ${metadata.highCount}`,
			);
		}
		if (metadata.mediumCount && metadata.mediumCount > 0) {
			console.log(
				`  ${colors.blue}🟡 Medium:${colors.reset} ${metadata.mediumCount}`,
			);
		}
		if (metadata.lowCount && metadata.lowCount > 0) {
			console.log(`  ${colors.dim}⚪ Low:${colors.reset} ${metadata.lowCount}`);
		}

		console.log(`\n${colors.bright}Issue Breakdown:${colors.reset}`);
		console.log(`  Per-file issues: ${metadata.perFileIssues ?? 0}`);
		console.log(`  Cross-file issues: ${metadata.crossFileIssues ?? 0}`);
	}

	// Token usage
	if (metadata.totalInputTokens || metadata.totalOutputTokens) {
		console.log(`\n${colors.bright}Token Usage:${colors.reset}`);
		if (metadata.totalInputTokens) {
			console.log(`  Input: ${formatTokenUsage(metadata.totalInputTokens)}`);
		}
		if (metadata.totalOutputTokens) {
			console.log(`  Output: ${formatTokenUsage(metadata.totalOutputTokens)}`);
		}
		if (metadata.totalCacheCreationTokens) {
			console.log(
				`  Cache creation: ${formatTokenUsage(metadata.totalCacheCreationTokens)}`,
			);
		}
		if (metadata.totalCacheReadTokens) {
			console.log(
				`  Cache read: ${formatTokenUsage(metadata.totalCacheReadTokens)}`,
			);
		}
	}

	// Cost and duration
	if (metadata.totalCostUsd) {
		console.log(
			`\n${colors.bright}Total Cost:${colors.reset} ${formatCost(metadata.totalCostUsd)}`,
		);
	}

	if (metadata.totalDurationMs) {
		console.log(
			`${colors.bright}Total Duration:${colors.reset} ${formatDuration(metadata.totalDurationMs)}`,
		);
	}

	// Curation info
	if (metadata.curationEnabled !== undefined) {
		console.log(
			`\n${colors.bright}Impact Curation:${colors.reset} ${metadata.curationEnabled ? "Enabled" : "Disabled"}`,
		);
		if (metadata.curationEnabled && metadata.curatedCount !== undefined) {
			console.log(`  Curated issues: ${metadata.curatedCount}`);
			if (metadata.curationCostUsd) {
				console.log(`  Curation cost: ${formatCost(metadata.curationCostUsd)}`);
			}
			if (metadata.curationDurationMs) {
				console.log(
					`  Curation duration: ${formatDuration(metadata.curationDurationMs)}`,
				);
			}
		}
	}
}

/**
 * Evaluator group with aggregated data
 */
interface EvaluatorGroup {
	evaluatorName: string;
	evaluatorLabel: string;
	issues: Issue[];
	maxSeverity: number;
}

/**
 * Group issues by evaluator and sort by severity
 */
function groupIssuesByEvaluator(issues: Issue[]): EvaluatorGroup[] {
	// Group by evaluator
	const grouped = new Map<string, Issue[]>();

	for (const issue of issues) {
		const evaluatorName = issue.evaluatorName || "Unknown";
		if (!grouped.has(evaluatorName)) {
			grouped.set(evaluatorName, []);
		}
		grouped.get(evaluatorName)!.push(issue);
	}

	// Helper to get issue severity (handles both error and suggestion types)
	const getIssueSortSeverity = (issue: Issue): number => {
		if (issue.issueType === "error") {
			return issue.severity;
		}
		return impactLevelToSeverity(issue.impactLevel);
	};

	// Convert to EvaluatorGroup array with calculated max severity
	const groups: EvaluatorGroup[] = [];
	for (const [evaluatorName, groupIssues] of grouped.entries()) {
		const severities = groupIssues.map(getIssueSortSeverity);
		const maxSeverity = Math.max(...severities);

		// Sort issues within group by severity (descending)
		groupIssues.sort(
			(a, b) => getIssueSortSeverity(b) - getIssueSortSeverity(a),
		);

		groups.push({
			evaluatorName,
			evaluatorLabel: getEvaluatorLabel(evaluatorName),
			issues: groupIssues,
			maxSeverity,
		});
	}

	// Sort groups by max severity (descending)
	groups.sort((a, b) => b.maxSeverity - a.maxSeverity);

	return groups;
}

/**
 * Display evaluator group header
 */
function displayEvaluatorHeader(
	evaluatorLabel: string,
	issueCount: number,
	maxSeverity: number,
	indent: string,
): void {
	const { color, emoji, label } = getSeverityDisplay(maxSeverity);
	console.log(
		`${indent}${color}${emoji} ${evaluatorLabel}${colors.reset} ${colors.dim}(${issueCount} ${issueCount === 1 ? "issue" : "issues"}, ${label} severity)${colors.reset}`,
	);
}

/**
 * Display file-specific issues
 */
function displayFileIssues(output: EvaluationOutput): void {
	// Check if this is independent mode with files property
	if (
		!("files" in output) ||
		!output.files ||
		Object.keys(output.files).length === 0
	) {
		return;
	}

	displaySectionHeader("FILE-SPECIFIC ISSUES");

	for (const [filePath, fileResult] of Object.entries(
		output.files as Record<string, FileEvaluationResult>,
	)) {
		if (fileResult.totalIssues === 0) continue;

		console.log(
			`\n${colors.bright}${colors.brightCyan}📄 ${filePath}${colors.reset}`,
		);
		console.log(
			`   ${colors.dim}${fileResult.totalIssues} issue(s) found${colors.reset}`,
		);

		// Collect all issues
		const issues: Issue[] = [];
		for (const evaluation of fileResult.evaluations) {
			issues.push(...evaluation.issues);
		}

		// Group issues by evaluator
		const evaluatorGroups = groupIssuesByEvaluator(issues);

		// Display each evaluator group
		for (const group of evaluatorGroups) {
			console.log(); // Blank line before evaluator header
			displayEvaluatorHeader(
				group.evaluatorLabel,
				group.issues.length,
				group.maxSeverity,
				"   ",
			);

			// Display issues in this evaluator group
			for (const issue of group.issues) {
				console.log(formatIssue(issue, "      "));
				console.log(); // Blank line between issues
			}
		}
	}
}

/**
 * Display cross-file issues
 */
function displayCrossFileIssues(output: EvaluationOutput): void {
	const crossFileIssues =
		"crossFileIssues" in output ? output.crossFileIssues : [];

	if (!crossFileIssues || crossFileIssues.length === 0) {
		return;
	}

	displaySectionHeader("CROSS-FILE ISSUES");

	console.log(`${colors.dim}Issues that span multiple files${colors.reset}\n`);

	// Group issues by evaluator
	const evaluatorGroups = groupIssuesByEvaluator(crossFileIssues);

	// Display each evaluator group
	for (const group of evaluatorGroups) {
		displayEvaluatorHeader(
			group.evaluatorLabel,
			group.issues.length,
			group.maxSeverity,
			"",
		);

		// Display issues in this evaluator group
		for (const issue of group.issues) {
			console.log(formatIssue(issue, "   "));

			// Display affected files if available
			if (issue.affectedFiles && issue.affectedFiles.length > 0) {
				console.log(`     ${colors.bright}Affected Files:${colors.reset}`);
				for (const file of issue.affectedFiles) {
					console.log(`       • ${file}`);
				}
			}

			console.log(); // Blank line between issues
		}

		console.log(); // Blank line between evaluator groups
	}
}

/**
 * Display curated top issues
 */
function displayCuratedIssues(output: EvaluationOutput): void {
	const curation = "curation" in output ? output.curation : undefined;

	if (
		!curation ||
		!curation.curatedIssues ||
		curation.curatedIssues.length === 0
	) {
		return;
	}

	displaySectionHeader(
		`TOP ${curation.curatedIssues.length} MOST IMPACTFUL ISSUES`,
	);

	console.log(
		`${colors.dim}Most impactful issues for AI agent workflows (from ${curation.summary?.totalIssuesReviewed ?? 0} reviewed)${colors.reset}\n`,
	);

	// Display each curated issue
	for (let i = 0; i < curation.curatedIssues.length; i++) {
		const issue = curation.curatedIssues[i];
		if (!issue) continue;

		const rank = i + 1;

		// Get severity display
		const { color: severityColor, emoji } = getSeverityDisplay(
			issue.severity ?? 0,
		);

		// Header line with rank
		console.log(
			`${colors.bright}#${rank}${colors.reset} ${severityColor}${emoji} [${issue.category}]${colors.reset} ${colors.bright}${issue.title || issue.problem || issue.description || "Issue"}${colors.reset}`,
		);

		// Problem/Description
		const problem = issue.problem || issue.description;
		if (problem && problem !== issue.title) {
			console.log(`    ${colors.bright}Problem:${colors.reset} ${problem}`);
		}

		// Location
		if (issue.location) {
			console.log(
				`    ${colors.bright}Location:${colors.reset} ${formatLocation(issue.location)}`,
			);
		}

		// Curation reason
		if (issue.curationReason) {
			console.log(
				`    ${colors.cyan}Why impactful:${colors.reset} ${issue.curationReason}`,
			);
		}

		// Fix/Recommendation
		const fix = issue.fix || issue.recommendation || issue.suggestion;
		if (fix) {
			console.log(`    ${colors.bright}Fix:${colors.reset} ${fix}`);
		}

		console.log(); // Blank line between issues
	}
}

/**
 * Display complete evaluation results to terminal
 */
export function displayResults(output: EvaluationOutput): void {
	// Clear screen for better readability
	console.log("\n");

	// Display metadata
	displayMetadata(output.metadata);

	// Display summary
	displaySummary(output.metadata);

	// Display curated top issues (shown first as a summary)
	displayCuratedIssues(output);

	// Display file-specific issues
	displayFileIssues(output);

	// Display cross-file issues
	displayCrossFileIssues(output);

	// Final summary
	console.log(
		`\n${colors.bright}${colors.green}✓ Evaluation complete!${colors.reset}\n`,
	);
}

/**
 * Display progress update during evaluation
 */
export function displayProgress(
	message: string,
	type: ProgressType = "info",
): void {
	const config = PROGRESS_CONFIG[type];
	console.log(`${config.color}${config.symbol} ${message}${colors.reset}`);
}
