/**
 * Remediation execution engine.
 * Orchestrates: prompt generation → provider execution → diff capture → reset.
 */

import { buildTechnicalInventorySection } from "@shared/claude/prompt-builder";
import { cloneRepository } from "@shared/file-system/git-cloner";
import { getProvider } from "@shared/providers/registry";
import type { ProviderName } from "@shared/providers/types";
import {
	type IPromptExecutionStats,
	type IRemediationAction,
	type IRemediationRequest,
	type IRemediationResult,
	type IRemediationSummary,
	REMEDIATION_BATCH_SIZE,
	type RemediationProgressEvent,
	type RemediationStep,
} from "@shared/types/remediation";
import { evaluationRepository } from "../../api/db/evaluation-repository";
import type { JobManager } from "../../api/jobs/job-manager";
import {
	captureGitDiff,
	checkCleanWorkingTree,
	parseUnifiedDiff,
	resetWorkingDirectory,
} from "./git-operations";
import {
	generateRemediationPrompts,
	type RemediationInput,
	type RemediationIssue,
} from "./prompt-generator";
import { parseActionSummary } from "./summary-parser";

const REMEDIATION_TIMEOUT_MS = 600_000; // 10 minutes per prompt

type ProgressCallback = (event: RemediationProgressEvent) => void;

function chunkArray<T>(arr: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < arr.length; i += size) {
		chunks.push(arr.slice(i, i + size));
	}
	return chunks;
}

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

/** Build brief issue summaries for a batch (evaluatorName: category). */
function buildBatchIssueSummaries(batch: RemediationIssue[]): string[] {
	return batch.map((issue) => `${issue.evaluatorName}: ${issue.category}`);
}

/**
 * Execute remediation: run prompts via a CLI provider, capture diff, reset.
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

		console.log(
			`[Remediation] Issues: ${errors.length} errors, ${suggestions.length} suggestions`,
		);

		const technicalInventorySection = buildTechnicalInventorySection(
			evaluationData.result?.metadata?.projectContext?.technicalInventory,
		);

		const pc = evaluationData.result?.metadata?.projectContext;
		const contextFilePaths = pc?.agentsFilePaths ?? [];
		const projectSummary = {
			languages: pc?.languages,
			frameworks: pc?.frameworks,
			architecture: pc?.architecture,
		};

		const input: RemediationInput = {
			targetFileType: request.targetFileType,
			contextFilePaths,
			errors,
			suggestions,
			technicalInventorySection,
			projectSummary,
		};

		const prompts = generateRemediationPrompts(input);

		// 4. Execute prompts via provider (batched, max REMEDIATION_BATCH_SIZE issues per prompt)
		const provider = getProvider(request.provider as ProviderName);
		let errorFixStats: IPromptExecutionStats | undefined;
		let suggestionEnrichStats: IPromptExecutionStats | undefined;
		const errorFixResponseTexts: string[] = [];
		const suggestionEnrichResponseTexts: string[] = [];

		// Compute batch counts for the plan event
		const errorBatches =
			errors.length > 0 ? chunkArray(errors, REMEDIATION_BATCH_SIZE) : [];
		const suggestionBatches =
			suggestions.length > 0
				? chunkArray(suggestions, REMEDIATION_BATCH_SIZE)
				: [];
		const totalGlobalBatches = errorBatches.length + suggestionBatches.length;

		console.log(
			`[Remediation] Plan: ${errorBatches.length} error batch(es) + ${suggestionBatches.length} suggestion batch(es), provider: ${request.provider}`,
		);

		// Emit initial plan event
		onProgress?.({
			type: "remediation.progress",
			data: {
				errorCount: errors.length,
				suggestionCount: suggestions.length,
				errorBatchCount: errorBatches.length,
				suggestionBatchCount: suggestionBatches.length,
				totalBatches: totalGlobalBatches,
				completedBatches: 0,
				provider: request.provider,
				targetFileType: request.targetFileType,
				phase: errors.length > 0 ? "errors" : "suggestions",
				runningTotalDurationMs: 0,
				runningTotalCostUsd: 0,
				runningTotalInputTokens: 0,
				runningTotalOutputTokens: 0,
			},
		});

		// Global running totals across all batches
		let globalCompletedBatches = 0;
		let globalTotalDurationMs = 0;
		let globalTotalCostUsd = 0;
		let globalTotalInputTokens = 0;
		let globalTotalOutputTokens = 0;

		// Execute error fix prompts in batches
		if (errors.length > 0) {
			const totalBatches = errorBatches.length;
			let totalDurationMs = 0;
			let totalCostUsd = 0;
			let totalInputTokens = 0;
			let totalOutputTokens = 0;

			for (let batchIdx = 0; batchIdx < errorBatches.length; batchIdx++) {
				const batch = errorBatches[batchIdx];
				if (!batch) continue;
				const batchInfo =
					totalBatches > 1
						? { batchNumber: batchIdx + 1, totalBatches }
						: undefined;

				const batchInput: RemediationInput = {
					...input,
					errors: batch,
					suggestions: [],
				};
				const batchPrompts = generateRemediationPrompts(batchInput);

				if (batchPrompts.errorFixPrompt) {
					const issueSummaries = buildBatchIssueSummaries(batch);

					console.log(
						`[Remediation] Invoking ${request.provider} for error fix batch ${batchIdx + 1}/${totalBatches} (${batch.length} issues)`,
					);

					emitStep(onProgress, "executing_error_fix", "started", batchInfo, {
						issuesSummary: issueSummaries,
						batchIssueCount: batch.length,
					});
					const fixStart = Date.now();
					const response = await provider.invokeWithRetry(
						batchPrompts.errorFixPrompt,
						{
							cwd: workDir,
							writeMode: true,
							timeout: REMEDIATION_TIMEOUT_MS,
						},
					);
					const durationMs = Date.now() - fixStart;
					const batchCostUsd = response.cost_usd ?? 0;
					const batchInputTokens = response.usage?.input_tokens ?? 0;
					const batchOutputTokens = response.usage?.output_tokens ?? 0;

					totalDurationMs += durationMs;
					totalCostUsd += batchCostUsd;
					totalInputTokens += batchInputTokens;
					totalOutputTokens += batchOutputTokens;

					// Update global running totals
					globalCompletedBatches++;
					globalTotalDurationMs += durationMs;
					globalTotalCostUsd += batchCostUsd;
					globalTotalInputTokens += batchInputTokens;
					globalTotalOutputTokens += batchOutputTokens;

					console.log(
						`[Remediation] Batch ${batchIdx + 1}/${totalBatches} completed: ${durationMs}ms, $${batchCostUsd.toFixed(4)}, ${batchInputTokens} in / ${batchOutputTokens} out`,
					);

					if (response.result) {
						errorFixResponseTexts.push(response.result);
					}
					emitStep(onProgress, "executing_error_fix", "completed", batchInfo, {
						batchDurationMs: durationMs,
						batchCostUsd,
						batchInputTokens,
						batchOutputTokens,
					});

					// Emit running totals
					onProgress?.({
						type: "remediation.progress",
						data: {
							completedBatches: globalCompletedBatches,
							totalBatches: totalGlobalBatches,
							phase: "errors",
							runningTotalDurationMs: globalTotalDurationMs,
							runningTotalCostUsd: globalTotalCostUsd,
							runningTotalInputTokens: globalTotalInputTokens,
							runningTotalOutputTokens: globalTotalOutputTokens,
						},
					});
				}
			}

			errorFixStats = {
				prompt:
					totalBatches > 1
						? `[${totalBatches} batches]`
						: prompts.errorFixPrompt || "",
				durationMs: totalDurationMs,
				costUsd: totalCostUsd || undefined,
				inputTokens: totalInputTokens || undefined,
				outputTokens: totalOutputTokens || undefined,
			};
		}

		// Execute suggestion enrich prompts in batches (cumulative on top of error fixes)
		if (suggestions.length > 0) {
			const totalBatches = suggestionBatches.length;
			let totalDurationMs = 0;
			let totalCostUsd = 0;
			let totalInputTokens = 0;
			let totalOutputTokens = 0;

			for (let batchIdx = 0; batchIdx < suggestionBatches.length; batchIdx++) {
				const batch = suggestionBatches[batchIdx];
				if (!batch) continue;
				const batchInfo =
					totalBatches > 1
						? { batchNumber: batchIdx + 1, totalBatches }
						: undefined;

				const batchInput: RemediationInput = {
					...input,
					errors: [],
					suggestions: batch,
				};
				const batchPrompts = generateRemediationPrompts(batchInput);

				if (batchPrompts.suggestionEnrichPrompt) {
					const issueSummaries = buildBatchIssueSummaries(batch);

					console.log(
						`[Remediation] Invoking ${request.provider} for suggestion enrich batch ${batchIdx + 1}/${totalBatches} (${batch.length} issues)`,
					);

					emitStep(
						onProgress,
						"executing_suggestion_enrich",
						"started",
						batchInfo,
						{
							issuesSummary: issueSummaries,
							batchIssueCount: batch.length,
						},
					);
					const enrichStart = Date.now();
					const response = await provider.invokeWithRetry(
						batchPrompts.suggestionEnrichPrompt,
						{
							cwd: workDir,
							writeMode: true,
							timeout: REMEDIATION_TIMEOUT_MS,
						},
					);
					const durationMs = Date.now() - enrichStart;
					const batchCostUsd = response.cost_usd ?? 0;
					const batchInputTokens = response.usage?.input_tokens ?? 0;
					const batchOutputTokens = response.usage?.output_tokens ?? 0;

					totalDurationMs += durationMs;
					totalCostUsd += batchCostUsd;
					totalInputTokens += batchInputTokens;
					totalOutputTokens += batchOutputTokens;

					// Update global running totals
					globalCompletedBatches++;
					globalTotalDurationMs += durationMs;
					globalTotalCostUsd += batchCostUsd;
					globalTotalInputTokens += batchInputTokens;
					globalTotalOutputTokens += batchOutputTokens;

					console.log(
						`[Remediation] Batch ${batchIdx + 1}/${totalBatches} completed: ${durationMs}ms, $${batchCostUsd.toFixed(4)}, ${batchInputTokens} in / ${batchOutputTokens} out`,
					);

					if (response.result) {
						suggestionEnrichResponseTexts.push(response.result);
					}
					emitStep(
						onProgress,
						"executing_suggestion_enrich",
						"completed",
						batchInfo,
						{
							batchDurationMs: durationMs,
							batchCostUsd,
							batchInputTokens,
							batchOutputTokens,
						},
					);

					// Emit running totals
					onProgress?.({
						type: "remediation.progress",
						data: {
							completedBatches: globalCompletedBatches,
							totalBatches: totalGlobalBatches,
							phase: "suggestions",
							runningTotalDurationMs: globalTotalDurationMs,
							runningTotalCostUsd: globalTotalCostUsd,
							runningTotalInputTokens: globalTotalInputTokens,
							runningTotalOutputTokens: globalTotalOutputTokens,
						},
					});
				}
			}

			suggestionEnrichStats = {
				prompt:
					totalBatches > 1
						? `[${totalBatches} batches]`
						: prompts.suggestionEnrichPrompt || "",
				durationMs: totalDurationMs,
				costUsd: totalCostUsd || undefined,
				inputTokens: totalInputTokens || undefined,
				outputTokens: totalOutputTokens || undefined,
			};
		}

		// 5. Capture diff
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

		// 7. Parse action summaries from AI responses (per-batch) and remap indices
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

		// Parse each error batch response and remap issueIndex to global index
		const allErrorActions: IRemediationAction[] = [];
		let anyErrorParsed = false;
		for (
			let batchIdx = 0;
			batchIdx < errorFixResponseTexts.length;
			batchIdx++
		) {
			const parsed = parseActionSummary(
				errorFixResponseTexts[batchIdx],
				"error_fix",
			);
			if (parsed.parsed) anyErrorParsed = true;
			const offset = batchIdx * REMEDIATION_BATCH_SIZE;
			for (const action of parsed.actions) {
				allErrorActions.push({
					...action,
					issueIndex: action.issueIndex + offset,
				});
			}
		}

		// Parse each suggestion batch response and remap issueIndex to global index
		const allSuggestionActions: IRemediationAction[] = [];
		let anySuggestionParsed = false;
		for (
			let batchIdx = 0;
			batchIdx < suggestionEnrichResponseTexts.length;
			batchIdx++
		) {
			const parsed = parseActionSummary(
				suggestionEnrichResponseTexts[batchIdx],
				"suggestion_enrich",
			);
			if (parsed.parsed) anySuggestionParsed = true;
			const offset = batchIdx * REMEDIATION_BATCH_SIZE;
			for (const action of parsed.actions) {
				allSuggestionActions.push({
					...action,
					issueIndex: action.issueIndex + offset,
				});
			}
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
			(errorFixStats?.costUsd ?? 0) + (suggestionEnrichStats?.costUsd ?? 0);
		const totalInputTokens =
			(errorFixStats?.inputTokens ?? 0) +
			(suggestionEnrichStats?.inputTokens ?? 0);
		const totalOutputTokens =
			(errorFixStats?.outputTokens ?? 0) +
			(suggestionEnrichStats?.outputTokens ?? 0);
		const totalDurationMs = Date.now() - startTime;

		console.log(
			`[Remediation] Complete: ${fileChanges.length} files, +${totalAdditions}/-${totalDeletions} lines, ${totalDurationMs}ms total, $${totalCostUsd.toFixed(4)}`,
		);

		return {
			errorFixStats,
			suggestionEnrichStats,
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
