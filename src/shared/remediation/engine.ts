/**
 * Remediation execution engine.
 * Orchestrates: prompt generation → provider execution → diff capture → reset.
 */

import { buildTechnicalInventorySection } from "@shared/claude/prompt-builder";
import { cloneRepository } from "@shared/file-system/git-cloner";
import { getProvider } from "@shared/providers/registry";
import type { ProviderName } from "@shared/providers/types";
import {
	type IFileChange,
	type IPromptExecutionStats,
	type IRemediationAction,
	type IRemediationRequest,
	type IRemediationResult,
	type IRemediationSummary,
	type RemediationProgressEvent,
	type RemediationStep,
} from "@shared/types/remediation";
import { evaluationRepository } from "../../api/db/evaluation-repository";
import type { JobManager } from "../../api/jobs/job-manager";
import { consolidateColocatedFiles } from "./file-consolidator";
import {
	captureGitDiff,
	checkCleanWorkingTree,
	parseUnifiedDiff,
	resetWorkingDirectory,
} from "./git-operations";
import {
	buildErrorExecutionPrompt,
	buildErrorPlanPrompt,
	buildSuggestionExecutionPrompt,
	buildSuggestionPlanPrompt,
	type RemediationInput,
	type RemediationIssue,
} from "./prompt-generator";
import { parseActionSummary } from "./summary-parser";

const REMEDIATION_TIMEOUT_MS = 600_000; // 10 minutes per prompt

type ProgressCallback = (event: RemediationProgressEvent) => void;

function emitStep(
	onProgress: ProgressCallback | undefined,
	step: RemediationStep,
	status: "started" | "completed",
	batchInfo?: { batchNumber: number; totalBatches: number },
	extraData?: Record<string, unknown>,
) {
	onProgress?.({
		type:
			status === "started"
				? "remediation.step.started"
				: "remediation.step.completed",
		data: {
			step,
			...(batchInfo && { batchInfo }),
			...(extraData && extraData),
		},
	});
}

function issueToRemediationIssue(
	issue: IRemediationRequest["issues"][number],
): RemediationIssue {
	const loc = Array.isArray(issue.location)
		? issue.location?.[0]
		: issue.location;
	return {
		evaluatorName: issue.evaluatorName || "unknown",
		category: issue.category,
		title: issue.title,
		problem: issue.problem,
		description: issue.description,
		severity: issue.issueType === "error" ? issue.severity : undefined,
		impactLevel:
			issue.issueType === "suggestion" ? issue.impactLevel : undefined,
		location: {
			file: loc?.file,
			start: loc?.start ?? 0,
			end: loc?.end ?? 0,
		},
		snippet: issue.snippet,
		fix: issue.fix,
		recommendation: issue.recommendation,
		isPhantomFile: issue.isPhantomFile,
	};
}

/**
 * Enrich parsed actions with issue titles from the original sorted issues.
 * The issueIndex (1-based) maps to the sorted array order used in the prompt.
 */
function enrichActionsWithIssueTitles(
	actions: IRemediationAction[],
	sortedIssues: RemediationIssue[],
): void {
	for (const action of actions) {
		const issue = sortedIssues[action.issueIndex - 1];
		if (issue) {
			action.issueTitle = `${issue.evaluatorName}: ${issue.category}`;
		}
	}
}

/**
 * Build a human-readable summary of error-fix actions for cross-phase context.
 */
function buildErrorFixSummaryText(
	actions: IRemediationAction[],
	sortedErrors: RemediationIssue[],
): string {
	const lines: string[] = [];
	for (const action of actions) {
		if (action.status === "skipped") continue;
		const issue = sortedErrors[action.issueIndex - 1];
		const issueLabel = issue
			? `${issue.evaluatorName}: ${issue.category}`
			: `Issue #${action.issueIndex}`;
		const filePart = action.file ? ` in \`${action.file}\`` : "";
		lines.push(`- **${issueLabel}**${filePart}: ${action.summary}`);
	}
	return lines.length > 0 ? lines.join("\n") : "No error fixes were applied.";
}

/**
 * Execute remediation: plan-first 4-phase pipeline.
 * Phase 1: Plan error fixes → Phase 2: Execute error fixes →
 * Phase 3: Plan suggestion enrichment → Phase 4: Execute suggestions
 */
export async function executeRemediation(
	request: IRemediationRequest,
	jobManager: JobManager,
	onProgress?: ProgressCallback,
): Promise<IRemediationResult> {
	const startTime = Date.now();

	// 1. Determine working directory
	let workDir: string;
	let cleanup: (() => Promise<void>) | undefined;
	let isClone = false;

	// Look up evaluation to find repository URL or local path
	const evaluationData = getEvaluationData(request.evaluationId, jobManager);
	if (!evaluationData) {
		throw new Error("Evaluation not found or has no results");
	}

	const repoUrl = evaluationData.repositoryUrl;
	const localPath = evaluationData.localPath;

	if (repoUrl && (repoUrl.startsWith("http") || repoUrl.startsWith("git"))) {
		emitStep(onProgress, "cloning", "started");
		const cloneResult = await cloneRepository(repoUrl, {
			branch: evaluationData.gitBranch,
			commitSha: evaluationData.gitCommitSha,
		});
		workDir = cloneResult.path;
		cleanup = cloneResult.cleanup;
		isClone = true;
		emitStep(onProgress, "cloning", "completed");
	} else if (localPath) {
		workDir = localPath;
	} else {
		throw new Error(
			"Cannot determine working directory: evaluation has no repository URL or local path",
		);
	}

	console.log(
		`[Remediation] Working directory: ${workDir} (${isClone ? "clone" : "local"})`,
	);

	try {
		// 2. Check git status (local paths only; clones are always clean)
		if (!isClone) {
			emitStep(onProgress, "checking_git", "started");
			const gitStatus = await checkCleanWorkingTree(workDir);
			if (!gitStatus.clean) {
				throw new Error(
					`Working directory has uncommitted changes. Please commit or stash changes before running remediation.\n${gitStatus.status}`,
				);
			}
			emitStep(onProgress, "checking_git", "completed");
		}

		// 2.5. Consolidate colocated AGENTS.md/CLAUDE.md pairs
		const pc = evaluationData.result?.metadata?.projectContext;
		const colocatedPairs: Array<{
			directory: string;
			agentsPath: string;
			claudePath: string;
		}> = pc?.colocatedPairs ?? [];

		if (colocatedPairs.length > 0) {
			emitStep(onProgress, "consolidating_files", "started");
			console.log(
				`[Remediation] Consolidating ${colocatedPairs.length} colocated AGENTS.md/CLAUDE.md pair(s)`,
			);
			const consolidationResults = await consolidateColocatedFiles(
				workDir,
				colocatedPairs,
			);
			for (const result of consolidationResults) {
				if (result.skipped) {
					console.log(
						`[Remediation] Skipped ${result.claudePath}: ${result.reason}`,
					);
				} else {
					console.log(
						`[Remediation] Consolidated ${result.claudePath} → @AGENTS.md`,
					);
				}
			}
			emitStep(onProgress, "consolidating_files", "completed");
		}

		// 3. Generate prompts
		const errors: RemediationIssue[] = [];
		const suggestions: RemediationIssue[] = [];

		for (const issue of request.issues) {
			const remIssue = issueToRemediationIssue(issue);
			if (issue.issueType === "suggestion") {
				suggestions.push(remIssue);
			} else {
				errors.push(remIssue);
			}
		}

		// Remap issue locations from CLAUDE.md → AGENTS.md for consolidated pairs
		if (colocatedPairs.length > 0) {
			const claudeToAgents = new Map<string, string>(
				colocatedPairs.map((p) => [p.claudePath, p.agentsPath]),
			);
			for (const issue of [...errors, ...suggestions]) {
				const file = issue.location?.file;
				if (file && claudeToAgents.has(file)) {
					issue.location.file = claudeToAgents.get(file)!;
				}
			}
		}

		console.log(
			`[Remediation] Issues: ${errors.length} errors, ${suggestions.length} suggestions`,
		);

		const technicalInventorySection = buildTechnicalInventorySection(
			evaluationData.result?.metadata?.projectContext?.technicalInventory,
		);

		let contextFilePaths = pc?.agentsFilePaths ?? [];
		const projectSummary = {
			languages: pc?.languages,
			frameworks: pc?.frameworks,
			architecture: pc?.architecture,
		};

		// Filter consolidated CLAUDE.md paths from context file list
		if (colocatedPairs.length > 0) {
			const claudePaths = new Set(
				colocatedPairs.map((p: { claudePath: string }) => p.claudePath),
			);
			contextFilePaths = contextFilePaths.filter(
				(p: string) => !claudePaths.has(p),
			);
		}

		const input: RemediationInput = {
			targetAgent: request.targetAgent,
			contextFilePaths,
			errors,
			suggestions,
			technicalInventorySection,
			projectSummary,
			colocatedPairs: colocatedPairs.length > 0 ? colocatedPairs : undefined,
		};

		// 4. Plan-first 4-phase pipeline
		const provider = getProvider(request.provider as ProviderName);
		let errorPlanStats: IPromptExecutionStats | undefined;
		let errorFixStats: IPromptExecutionStats | undefined;
		let suggestionPlanStats: IPromptExecutionStats | undefined;
		let suggestionEnrichStats: IPromptExecutionStats | undefined;
		let errorPlan: string | undefined;
		let suggestionPlan: string | undefined;
		let errorPlanPrompt: string | undefined;
		let suggestionPlanPrompt: string | undefined;
		let errorFixDiff: string | undefined;
		let errorFixFileChanges: IFileChange[] | undefined;
		let errorFixResponseText: string | undefined;
		let suggestionEnrichResponseText: string | undefined;

		// Sort arrays the same way the prompt generator does to match issueIndex
		const sortedErrors = [...errors].sort(
			(a, b) => (b.severity ?? 0) - (a.severity ?? 0),
		);
		const impactOrder: Record<string, number> = {
			High: 0,
			Medium: 1,
			Low: 2,
		};
		const sortedSuggestions = [...suggestions].sort(
			(a, b) =>
				(impactOrder[a.impactLevel ?? "Low"] ?? 2) -
				(impactOrder[b.impactLevel ?? "Low"] ?? 2),
		);

		// Compute total phases for progress (2 per type: plan + execute)
		const totalPhases =
			(errors.length > 0 ? 2 : 0) + (suggestions.length > 0 ? 2 : 0);
		let completedPhases = 0;

		// Running totals across all phases
		let runningTotalDurationMs = 0;
		let runningTotalCostUsd = 0;
		let runningTotalInputTokens = 0;
		let runningTotalOutputTokens = 0;

		console.log(
			`[Remediation] Plan-first pipeline: ${errors.length} errors, ${suggestions.length} suggestions, ${totalPhases} AI invocations, provider: ${request.provider}`,
		);

		// Emit initial plan event
		onProgress?.({
			type: "remediation.progress",
			data: {
				errorCount: errors.length,
				suggestionCount: suggestions.length,
				totalBatches: totalPhases,
				completedBatches: 0,
				provider: request.provider,
				targetAgent: request.targetAgent,
				phase: errors.length > 0 ? "errors" : "suggestions",
				runningTotalDurationMs: 0,
				runningTotalCostUsd: 0,
				runningTotalInputTokens: 0,
				runningTotalOutputTokens: 0,
			},
		});

		// --- Phase 1: Plan error fixes ---
		if (errors.length > 0) {
			errorPlanPrompt = buildErrorPlanPrompt(input);

			emitStep(onProgress, "planning_error_fix", "started");
			console.log(
				`[Remediation] Phase 1: Planning error fixes (${errors.length} issues)`,
			);

			const planStart = Date.now();
			const planResponse = await provider.invokeWithRetry(errorPlanPrompt, {
				cwd: workDir,
				writeMode: false,
				timeout: REMEDIATION_TIMEOUT_MS,
			});
			const planDurationMs = Date.now() - planStart;
			const planCost = planResponse.cost_usd ?? 0;
			const planInputTokens = planResponse.usage?.input_tokens ?? 0;
			const planOutputTokens = planResponse.usage?.output_tokens ?? 0;

			errorPlan = planResponse.result || "";
			errorPlanStats = {
				prompt: errorPlanPrompt,
				durationMs: planDurationMs,
				costUsd: planCost || undefined,
				inputTokens: planInputTokens || undefined,
				outputTokens: planOutputTokens || undefined,
			};

			completedPhases++;
			runningTotalDurationMs += planDurationMs;
			runningTotalCostUsd += planCost;
			runningTotalInputTokens += planInputTokens;
			runningTotalOutputTokens += planOutputTokens;

			console.log(
				`[Remediation] Phase 1 completed: ${planDurationMs}ms, $${planCost.toFixed(4)}`,
			);
			emitStep(onProgress, "planning_error_fix", "completed");

			onProgress?.({
				type: "remediation.progress",
				data: {
					completedBatches: completedPhases,
					totalBatches: totalPhases,
					phase: "errors",
					runningTotalDurationMs,
					runningTotalCostUsd,
					runningTotalInputTokens,
					runningTotalOutputTokens,
				},
			});

			// --- Phase 2: Execute error fixes ---
			const execPrompt = buildErrorExecutionPrompt(input, errorPlan);

			emitStep(onProgress, "executing_error_fix", "started");
			console.log("[Remediation] Phase 2: Executing error fixes");

			const execStart = Date.now();
			const execResponse = await provider.invokeWithRetry(execPrompt, {
				cwd: workDir,
				writeMode: true,
				timeout: REMEDIATION_TIMEOUT_MS,
			});
			const execDurationMs = Date.now() - execStart;
			const execCost = execResponse.cost_usd ?? 0;
			const execInputTokens = execResponse.usage?.input_tokens ?? 0;
			const execOutputTokens = execResponse.usage?.output_tokens ?? 0;

			errorFixResponseText = execResponse.result || undefined;
			errorFixStats = {
				prompt: execPrompt,
				durationMs: execDurationMs,
				costUsd: execCost || undefined,
				inputTokens: execInputTokens || undefined,
				outputTokens: execOutputTokens || undefined,
			};

			completedPhases++;
			runningTotalDurationMs += execDurationMs;
			runningTotalCostUsd += execCost;
			runningTotalInputTokens += execInputTokens;
			runningTotalOutputTokens += execOutputTokens;

			console.log(
				`[Remediation] Phase 2 completed: ${execDurationMs}ms, $${execCost.toFixed(4)}`,
			);
			emitStep(onProgress, "executing_error_fix", "completed");

			onProgress?.({
				type: "remediation.progress",
				data: {
					completedBatches: completedPhases,
					totalBatches: totalPhases,
					phase: "errors",
					runningTotalDurationMs,
					runningTotalCostUsd,
					runningTotalInputTokens,
					runningTotalOutputTokens,
				},
			});

			// --- Phase 2.5: Capture intermediate error diff ---
			emitStep(onProgress, "capturing_error_diff", "started");
			errorFixDiff = await captureGitDiff(workDir);
			errorFixFileChanges = parseUnifiedDiff(errorFixDiff);
			console.log(
				`[Remediation] Error fix diff: ${errorFixFileChanges.length} files changed`,
			);
			emitStep(onProgress, "capturing_error_diff", "completed");
			// Do NOT reset — leave working directory dirty for suggestions to build on
		}

		// --- Phase 3: Plan suggestion enrichment ---
		if (suggestions.length > 0) {
			// Build error-fix summary for cross-phase context
			let errorFixSummaryText: string | undefined;
			if (errorFixResponseText) {
				const errorFixParsed = parseActionSummary(
					errorFixResponseText,
					"error_fix",
				);
				if (errorFixParsed.parsed) {
					enrichActionsWithIssueTitles(errorFixParsed.actions, sortedErrors);
					errorFixSummaryText = buildErrorFixSummaryText(
						errorFixParsed.actions,
						sortedErrors,
					);
				}
			}

			suggestionPlanPrompt = buildSuggestionPlanPrompt(
				input,
				errorFixSummaryText,
			);

			emitStep(onProgress, "planning_suggestion_enrich", "started");
			console.log(
				`[Remediation] Phase 3: Planning suggestion enrichment (${suggestions.length} gaps)`,
			);

			const planStart = Date.now();
			const planResponse = await provider.invokeWithRetry(
				suggestionPlanPrompt,
				{
					cwd: workDir,
					writeMode: false,
					timeout: REMEDIATION_TIMEOUT_MS,
				},
			);
			const planDurationMs = Date.now() - planStart;
			const planCost = planResponse.cost_usd ?? 0;
			const planInputTokens = planResponse.usage?.input_tokens ?? 0;
			const planOutputTokens = planResponse.usage?.output_tokens ?? 0;

			suggestionPlan = planResponse.result || "";
			suggestionPlanStats = {
				prompt: suggestionPlanPrompt,
				durationMs: planDurationMs,
				costUsd: planCost || undefined,
				inputTokens: planInputTokens || undefined,
				outputTokens: planOutputTokens || undefined,
			};

			completedPhases++;
			runningTotalDurationMs += planDurationMs;
			runningTotalCostUsd += planCost;
			runningTotalInputTokens += planInputTokens;
			runningTotalOutputTokens += planOutputTokens;

			console.log(
				`[Remediation] Phase 3 completed: ${planDurationMs}ms, $${planCost.toFixed(4)}`,
			);
			emitStep(onProgress, "planning_suggestion_enrich", "completed");

			onProgress?.({
				type: "remediation.progress",
				data: {
					completedBatches: completedPhases,
					totalBatches: totalPhases,
					phase: "suggestions",
					runningTotalDurationMs,
					runningTotalCostUsd,
					runningTotalInputTokens,
					runningTotalOutputTokens,
				},
			});

			// --- Phase 4: Execute suggestions ---
			const execPrompt = buildSuggestionExecutionPrompt(input, suggestionPlan);

			emitStep(onProgress, "executing_suggestion_enrich", "started");
			console.log("[Remediation] Phase 4: Executing suggestion enrichment");

			const execStart = Date.now();
			const execResponse = await provider.invokeWithRetry(execPrompt, {
				cwd: workDir,
				writeMode: true,
				timeout: REMEDIATION_TIMEOUT_MS,
			});
			const execDurationMs = Date.now() - execStart;
			const execCost = execResponse.cost_usd ?? 0;
			const execInputTokens = execResponse.usage?.input_tokens ?? 0;
			const execOutputTokens = execResponse.usage?.output_tokens ?? 0;

			suggestionEnrichResponseText = execResponse.result || undefined;
			suggestionEnrichStats = {
				prompt: execPrompt,
				durationMs: execDurationMs,
				costUsd: execCost || undefined,
				inputTokens: execInputTokens || undefined,
				outputTokens: execOutputTokens || undefined,
			};

			completedPhases++;
			runningTotalDurationMs += execDurationMs;
			runningTotalCostUsd += execCost;
			runningTotalInputTokens += execInputTokens;
			runningTotalOutputTokens += execOutputTokens;

			console.log(
				`[Remediation] Phase 4 completed: ${execDurationMs}ms, $${execCost.toFixed(4)}`,
			);
			emitStep(onProgress, "executing_suggestion_enrich", "completed");

			onProgress?.({
				type: "remediation.progress",
				data: {
					completedBatches: completedPhases,
					totalBatches: totalPhases,
					phase: "suggestions",
					runningTotalDurationMs,
					runningTotalCostUsd,
					runningTotalInputTokens,
					runningTotalOutputTokens,
				},
			});
		}

		// 5. Capture final combined diff (includes both error + suggestion changes)
		emitStep(onProgress, "capturing_diff", "started");
		const fullPatch = await captureGitDiff(workDir);
		const fileChanges = parseUnifiedDiff(fullPatch);
		emitStep(onProgress, "capturing_diff", "completed");

		const totalAdditions = fileChanges.reduce((s, f) => s + f.additions, 0);
		const totalDeletions = fileChanges.reduce((s, f) => s + f.deletions, 0);

		console.log(
			`[Remediation] Diff: ${fileChanges.length} files changed, +${totalAdditions}/-${totalDeletions} lines`,
		);

		// 6. Reset working directory
		emitStep(onProgress, "resetting", "started");
		await resetWorkingDirectory(workDir);
		emitStep(onProgress, "resetting", "completed");

		console.log("[Remediation] Working directory reset");

		// 7. Parse action summaries from AI responses
		const allErrorActions: IRemediationAction[] = [];
		let anyErrorParsed = false;
		if (errorFixResponseText) {
			const parsed = parseActionSummary(errorFixResponseText, "error_fix");
			if (parsed.parsed) anyErrorParsed = true;
			allErrorActions.push(...parsed.actions);
		}

		const allSuggestionActions: IRemediationAction[] = [];
		let anySuggestionParsed = false;
		if (suggestionEnrichResponseText) {
			const parsed = parseActionSummary(
				suggestionEnrichResponseText,
				"suggestion_enrich",
			);
			if (parsed.parsed) anySuggestionParsed = true;
			allSuggestionActions.push(...parsed.actions);
		}

		enrichActionsWithIssueTitles(allErrorActions, sortedErrors);
		enrichActionsWithIssueTitles(allSuggestionActions, sortedSuggestions);

		const allActions = [...allErrorActions, ...allSuggestionActions];
		const summary: IRemediationSummary = {
			errorFixActions: allErrorActions,
			suggestionEnrichActions: allSuggestionActions,
			addressedCount: allActions.filter((a) => a.status !== "skipped").length,
			skippedCount: allActions.filter((a) => a.status === "skipped").length,
			parsed: anyErrorParsed || anySuggestionParsed,
		};

		console.log(
			`[Remediation] Summary: ${summary.addressedCount} addressed, ${summary.skippedCount} skipped, parsed=${summary.parsed}`,
		);

		// 8. Build result
		const totalCostUsd =
			(errorPlanStats?.costUsd ?? 0) +
			(errorFixStats?.costUsd ?? 0) +
			(suggestionPlanStats?.costUsd ?? 0) +
			(suggestionEnrichStats?.costUsd ?? 0);
		const totalInputTokens =
			(errorPlanStats?.inputTokens ?? 0) +
			(errorFixStats?.inputTokens ?? 0) +
			(suggestionPlanStats?.inputTokens ?? 0) +
			(suggestionEnrichStats?.inputTokens ?? 0);
		const totalOutputTokens =
			(errorPlanStats?.outputTokens ?? 0) +
			(errorFixStats?.outputTokens ?? 0) +
			(suggestionPlanStats?.outputTokens ?? 0) +
			(suggestionEnrichStats?.outputTokens ?? 0);
		const totalDurationMs = Date.now() - startTime;

		console.log(
			`[Remediation] Complete: ${fileChanges.length} files, +${totalAdditions}/-${totalDeletions} lines, ${totalDurationMs}ms total, $${totalCostUsd.toFixed(4)}`,
		);

		return {
			errorFixStats,
			suggestionEnrichStats,
			errorPlanStats,
			suggestionPlanStats,
			fullPatch,
			fileChanges,
			totalAdditions,
			totalDeletions,
			filesChanged: fileChanges.length,
			totalDurationMs,
			totalCostUsd,
			totalInputTokens,
			totalOutputTokens,
			summary,
			errorPlan,
			suggestionPlan,
			errorPlanPrompt,
			suggestionPlanPrompt,
			errorFixDiff,
			errorFixFileChanges,
		};
	} finally {
		// Always reset and cleanup
		try {
			await resetWorkingDirectory(workDir);
		} catch {
			// Best-effort reset
		}
		if (cleanup) {
			try {
				await cleanup();
			} catch {
				// Best-effort cleanup
			}
		}
	}
}

interface EvaluationData {
	// biome-ignore lint/suspicious/noExplicitAny: EvaluationOutput shape varies
	result: any;
	repositoryUrl?: string;
	localPath?: string;
	gitBranch?: string;
	gitCommitSha?: string;
}

/**
 * Look up evaluation data from in-memory job store or database.
 * Returns structured data with git metadata for remediation re-cloning.
 */
function getEvaluationData(
	evaluationId: string,
	jobManager: JobManager,
): EvaluationData | null {
	// Check in-memory job store first
	const job = jobManager.getJob(evaluationId);
	if (job?.result) {
		const metadata = job.result.metadata;
		return {
			result: job.result,
			repositoryUrl: metadata?.repositoryUrl || job.request?.repositoryUrl,
			localPath: metadata?.localPath || job.request?.localPath,
			gitBranch: metadata?.gitBranch,
			gitCommitSha: metadata?.gitCommitSha,
		};
	}

	// Fallback to database (handles old evaluations)
	const record = evaluationRepository.getEvaluationById(evaluationId);
	if (record?.result) {
		const metadata = record.result.metadata;
		return {
			result: record.result,
			repositoryUrl: metadata?.repositoryUrl || record.repositoryUrl,
			localPath: metadata?.localPath,
			gitBranch: metadata?.gitBranch || record.gitBranch,
			gitCommitSha: metadata?.gitCommitSha || record.gitCommitSha,
		};
	}

	return null;
}
