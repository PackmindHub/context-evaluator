import { useCallback, useEffect, useMemo, useState } from "react";
import type {
	ProviderName,
	RemediationPromptsResponse,
} from "../hooks/useEvaluationApi";
import { useEvaluationApi } from "../hooks/useEvaluationApi";
import {
	type ProviderStatus,
	useProviderDetection,
} from "../hooks/useProviderDetection";
import { useSSE } from "../hooks/useSSE";
import type { EvaluationOutput, Issue } from "../types/evaluation";
import {
	getImpactBadgeClass,
	getImpactLabel,
	getIssueSeverity,
	getIssueType,
	getSeverityColor,
	getSeverityLevel,
} from "../types/evaluation";
import type {
	FileChange,
	IRemediationProgressState,
	RemediationAction,
	RemediationResult,
} from "../types/remediation";
import { FileChangeCard } from "./FileChangeCard";
import { PatchDownload } from "./PatchDownload";
import { RemediationProgress } from "./RemediationProgress";
import { CopyButton } from "./shared/CopyButton";

type Phase = "config" | "progress" | "results";

interface RemediateTabProps {
	evaluationId: string | null;
	evaluationData: EvaluationOutput | null;
	selectedIssueKeys: Set<string>;
	issueKeyMap: Map<string, Issue>;
	onRemoveIssue: (key: string) => void;
	onClearAll: () => void;
}

export function RemediateTab({
	evaluationId,
	evaluationData,
	selectedIssueKeys,
	issueKeyMap,
	onRemoveIssue,
	onClearAll,
}: RemediateTabProps) {
	const api = useEvaluationApi();
	const providerDetection = useProviderDetection();

	const [phase, setPhase] = useState<Phase>("config");
	const [targetFileType, setTargetFileType] = useState<
		"AGENTS.md" | "CLAUDE.md"
	>("AGENTS.md");
	const [selectedProvider, setSelectedProvider] =
		useState<ProviderName>("claude");
	const [isExecuting, setIsExecuting] = useState(false);
	const [executeError, setExecuteError] = useState<string | null>(null);

	// SSE state
	const [sseUrl, setSseUrl] = useState<string | null>(null);
	const [remediationId, setRemediationId] = useState<string | null>(null);
	const [progressState, setProgressState] = useState<IRemediationProgressState>(
		{
			status: "queued",
			logs: [],
		},
	);

	// Results state
	const [result, setResult] = useState<RemediationResult | null>(null);

	// Legacy prompt generation state
	const [isGenerating, setIsGenerating] = useState(false);
	const [generateError, setGenerateError] = useState<string | null>(null);
	const [prompts, setPrompts] = useState<RemediationPromptsResponse | null>(
		null,
	);

	// Detect providers on mount
	useEffect(() => {
		if (providerDetection.status === "idle") {
			providerDetection.detectProviders();
		}
	}, [providerDetection]);

	// Available providers for the selector
	const availableProviders = useMemo(() => {
		const providers: ProviderStatus[] = [];
		for (const p of providerDetection.providers.values()) {
			if (p.available && p.name !== "random") {
				providers.push(p);
			}
		}
		return providers;
	}, [providerDetection.providers]);

	// Resolve selected issue keys to actual issues, split by type
	const { errorEntries, suggestionEntries } = useMemo(() => {
		const errors: { key: string; issue: Issue }[] = [];
		const suggestions: { key: string; issue: Issue }[] = [];

		for (const key of selectedIssueKeys) {
			const issue = issueKeyMap.get(key);
			if (!issue) continue;
			const type = getIssueType(issue);
			if (type === "error") {
				errors.push({ key, issue });
			} else {
				suggestions.push({ key, issue });
			}
		}

		errors.sort(
			(a, b) => getIssueSeverity(b.issue) - getIssueSeverity(a.issue),
		);
		const impactOrder: Record<string, number> = {
			High: 0,
			Medium: 1,
			Low: 2,
		};
		suggestions.sort(
			(a, b) =>
				(impactOrder[a.issue.impactLevel ?? "Low"] ?? 2) -
				(impactOrder[b.issue.impactLevel ?? "Low"] ?? 2),
		);

		return { errorEntries: errors, suggestionEntries: suggestions };
	}, [selectedIssueKeys, issueKeyMap]);

	const totalSelected = errorEntries.length + suggestionEntries.length;

	// SSE message handler
	const handleSSEMessage = useCallback(
		// biome-ignore lint/suspicious/noExplicitAny: SSE event data varies by type
		(event: any) => {
			const timestamp = new Date().toISOString();

			switch (event.type) {
				case "remediation.started":
					setProgressState((prev) => ({
						...prev,
						status: "running",
						logs: [...prev.logs, { timestamp, message: "Remediation started" }],
					}));
					break;

				case "remediation.step.started": {
					const bi = event.data?.batchInfo as
						| { batchNumber: number; totalBatches: number }
						| undefined;
					const batchLabel = bi
						? ` (batch ${bi.batchNumber}/${bi.totalBatches})`
						: "";
					setProgressState((prev) => ({
						...prev,
						currentStep: event.data?.step,
						batchInfo: bi,
						logs: [
							...prev.logs,
							{
								timestamp,
								message: `Step started: ${event.data?.step}${batchLabel}`,
							},
						],
					}));
					break;
				}

				case "remediation.step.completed": {
					const bi2 = event.data?.batchInfo as
						| { batchNumber: number; totalBatches: number }
						| undefined;
					const batchLabel2 = bi2
						? ` (batch ${bi2.batchNumber}/${bi2.totalBatches})`
						: "";
					setProgressState((prev) => ({
						...prev,
						batchInfo: undefined,
						logs: [
							...prev.logs,
							{
								timestamp,
								message: `Step completed: ${event.data?.step}${batchLabel2}`,
							},
						],
					}));
					break;
				}

				case "remediation.completed": {
					const remResult = event.data?.result as RemediationResult | undefined;
					setProgressState((prev) => ({
						...prev,
						status: "completed",
						result: remResult,
						logs: [
							...prev.logs,
							{ timestamp, message: "Remediation completed" },
						],
					}));
					if (remResult) {
						setResult(remResult);
					}
					setPhase("results");
					setSseUrl(null);
					break;
				}

				case "remediation.failed":
					setProgressState((prev) => ({
						...prev,
						status: "failed",
						error: event.data?.error,
						logs: [
							...prev.logs,
							{
								timestamp,
								message: `Failed: ${event.data?.error?.message || "Unknown error"}`,
							},
						],
					}));
					setExecuteError(event.data?.error?.message || "Remediation failed");
					setPhase("config");
					setSseUrl(null);
					break;
			}
		},
		[],
	);

	useSSE({
		url: sseUrl,
		onMessage: handleSSEMessage,
	});

	// Execute remediation
	const handleExecute = useCallback(async () => {
		if (!evaluationId || totalSelected === 0) return;

		setIsExecuting(true);
		setExecuteError(null);
		setPrompts(null);

		try {
			const issues = [
				...errorEntries.map((e) => e.issue),
				...suggestionEntries.map((e) => e.issue),
			];

			const response = await api.executeRemediation(
				evaluationId,
				issues,
				targetFileType,
				selectedProvider,
			);

			setRemediationId(response.remediationId);
			setSseUrl(response.sseUrl);
			setProgressState({ status: "queued", logs: [] });
			setPhase("progress");
		} catch (err) {
			setExecuteError(
				err instanceof Error ? err.message : "Failed to start remediation",
			);
		} finally {
			setIsExecuting(false);
		}
	}, [
		evaluationId,
		totalSelected,
		errorEntries,
		suggestionEntries,
		targetFileType,
		selectedProvider,
		api,
	]);

	// Generate prompts (legacy copy-paste mode)
	const handleGeneratePrompts = useCallback(async () => {
		if (!evaluationId || totalSelected === 0) return;

		setIsGenerating(true);
		setGenerateError(null);

		try {
			const issues = [
				...errorEntries.map((e) => e.issue),
				...suggestionEntries.map((e) => e.issue),
			];
			const result = await api.generateRemediationPrompts(
				evaluationId,
				issues,
				targetFileType,
			);
			setPrompts(result);
		} catch (err) {
			setGenerateError(
				err instanceof Error ? err.message : "Failed to generate prompts",
			);
		} finally {
			setIsGenerating(false);
		}
	}, [
		evaluationId,
		totalSelected,
		errorEntries,
		suggestionEntries,
		targetFileType,
		api,
	]);

	const handleBackToConfig = useCallback(() => {
		setPhase("config");
		setResult(null);
		setRemediationId(null);
		setSseUrl(null);
		setProgressState({ status: "queued", logs: [] });
	}, []);

	if (!evaluationData) {
		return (
			<div className="card text-center py-12">
				<p className="text-body-muted">
					No evaluation data. Run an evaluation first to generate remediation
					prompts.
				</p>
			</div>
		);
	}

	if (totalSelected === 0) {
		return (
			<div className="space-y-6">
				<div className="card">
					<h2 className="text-heading text-slate-100">Remediation</h2>
					<p className="text-body-muted mt-1">
						Execute remediation to fix issues automatically
					</p>
				</div>
				<div className="card text-center py-12">
					<svg
						className="w-12 h-12 text-slate-600 mx-auto mb-4"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={1.5}
							d="M12 4v16m8-8H4"
						/>
					</svg>
					<p className="text-body-muted">
						No issues selected. Use the{" "}
						<span className="inline-flex items-center justify-center w-5 h-5 rounded bg-slate-700 text-slate-300 text-xs align-middle mx-0.5">
							+
						</span>{" "}
						button on issue cards in the Errors and Suggestions tabs.
					</p>
				</div>
			</div>
		);
	}

	// ─── PROGRESS PHASE ────────────────────────────────────────────────
	if (phase === "progress") {
		return (
			<div className="space-y-6">
				<div className="card">
					<h2 className="text-heading text-slate-100">Executing Remediation</h2>
					<p className="text-body-muted mt-1">
						Running {selectedProvider} agent to fix {totalSelected} issue
						{totalSelected !== 1 ? "s" : ""}...
					</p>
				</div>
				<RemediationProgress
					currentStep={progressState.currentStep}
					batchInfo={progressState.batchInfo}
					logs={progressState.logs}
				/>
			</div>
		);
	}

	// ─── RESULTS PHASE ─────────────────────────────────────────────────
	if (phase === "results" && result) {
		const hasPerPromptStats =
			result.errorFixStats || result.suggestionEnrichStats;

		return (
			<div className="space-y-6">
				<div className="card">
					<div className="flex items-center justify-between">
						<div>
							<h2 className="text-heading text-slate-100">
								Remediation Complete
							</h2>
							<p className="text-body-muted mt-1">
								{result.filesChanged} file
								{result.filesChanged !== 1 ? "s" : ""} changed
								<span className="text-green-400 ml-2">
									+{result.totalAdditions}
								</span>
								<span className="text-red-400 ml-1">
									-{result.totalDeletions}
								</span>
								{result.totalDurationMs > 0 && (
									<span className="text-slate-500 ml-2">
										in {Math.round(result.totalDurationMs / 1000)}s
									</span>
								)}
								{result.totalCostUsd > 0 && (
									<span className="text-slate-500 ml-2">
										(${result.totalCostUsd.toFixed(4)})
									</span>
								)}
							</p>
							{(result.totalInputTokens > 0 ||
								result.totalOutputTokens > 0) && (
								<p className="text-caption mt-1">
									{result.totalInputTokens.toLocaleString()} input /{" "}
									{result.totalOutputTokens.toLocaleString()} output tokens
									{hasPerPromptStats && (
										<span className="text-slate-500">
											{" "}
											&mdash;{" "}
											{result.errorFixStats && (
												<span>
													Error fix: $
													{(result.errorFixStats.costUsd ?? 0).toFixed(4)}
													{result.suggestionEnrichStats && " | "}
												</span>
											)}
											{result.suggestionEnrichStats && (
												<span>
													Enrich: $
													{(result.suggestionEnrichStats.costUsd ?? 0).toFixed(
														4,
													)}
												</span>
											)}
										</span>
									)}
								</p>
							)}
						</div>
						<div className="flex items-center gap-2">
							{remediationId && <PatchDownload remediationId={remediationId} />}
							<button onClick={handleBackToConfig} className="btn-secondary">
								Back
							</button>
						</div>
					</div>
				</div>

				{result.summary?.parsed && (
					<ActionSummarySection summary={result.summary} />
				)}

				{result.fileChanges.length === 0 ? (
					<div className="card text-center py-8">
						<p className="text-body-muted">
							No file changes were made by the agent.
						</p>
					</div>
				) : (
					<div className="space-y-3">
						{result.fileChanges.map((file: FileChange) => {
							const fileSummaries = getFileSummaries(file.path, result);
							return (
								<FileChangeCard
									key={file.path}
									file={file}
									defaultExpanded={result.fileChanges.length <= 3}
									summaries={fileSummaries}
								/>
							);
						})}
					</div>
				)}
			</div>
		);
	}

	// ─── CONFIG PHASE ──────────────────────────────────────────────────
	return (
		<div className="space-y-6">
			<div className="card">
				<h2 className="text-heading text-slate-100">Remediation</h2>
				<p className="text-body-muted mt-1">
					Execute remediation to fix issues automatically, or generate
					copy-paste prompts
				</p>
			</div>

			<div className="card space-y-5">
				{/* Target File Type */}
				<div>
					<label className="text-label text-slate-300 block mb-2">
						Target file type
					</label>
					<div className="flex gap-2">
						<button
							onClick={() => setTargetFileType("AGENTS.md")}
							className={`px-3 py-1.5 rounded text-sm transition-colors ${
								targetFileType === "AGENTS.md"
									? "bg-blue-600 text-white"
									: "bg-slate-700 text-slate-300 hover:bg-slate-600"
							}`}
						>
							AGENTS.md
						</button>
						<button
							onClick={() => setTargetFileType("CLAUDE.md")}
							className={`px-3 py-1.5 rounded text-sm transition-colors ${
								targetFileType === "CLAUDE.md"
									? "bg-blue-600 text-white"
									: "bg-slate-700 text-slate-300 hover:bg-slate-600"
							}`}
						>
							CLAUDE.md
						</button>
					</div>
				</div>

				{/* Provider Selector */}
				<div>
					<label className="text-label text-slate-300 block mb-2">
						AI Provider
					</label>
					{providerDetection.status === "detecting" ? (
						<div className="text-sm text-slate-400">Detecting providers...</div>
					) : availableProviders.length > 0 ? (
						<div className="flex flex-wrap gap-2">
							{availableProviders.map((p) => (
								<button
									key={p.name}
									onClick={() => setSelectedProvider(p.name)}
									className={`px-3 py-1.5 rounded text-sm transition-colors ${
										selectedProvider === p.name
											? "bg-blue-600 text-white"
											: "bg-slate-700 text-slate-300 hover:bg-slate-600"
									}`}
								>
									{p.displayName}
								</button>
							))}
						</div>
					) : (
						<div className="text-sm text-slate-400">
							No providers detected. Defaulting to Claude.
						</div>
					)}
				</div>

				{/* Selected Issues */}
				<div className="space-y-4">
					{errorEntries.length > 0 && (
						<IssueSection
							title="Errors"
							count={errorEntries.length}
							entries={errorEntries}
							onRemove={onRemoveIssue}
						/>
					)}
					{suggestionEntries.length > 0 && (
						<IssueSection
							title="Suggestions"
							count={suggestionEntries.length}
							entries={suggestionEntries}
							onRemove={onRemoveIssue}
						/>
					)}
					<div className="flex items-center justify-between">
						<span className="text-caption">
							{totalSelected} issue{totalSelected !== 1 ? "s" : ""} selected
						</span>
						<button
							onClick={onClearAll}
							className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
						>
							Clear all
						</button>
					</div>
				</div>

				{/* Action Buttons */}
				<div className="flex flex-wrap gap-3">
					<button
						onClick={handleExecute}
						disabled={isExecuting || isGenerating}
						className="btn-primary"
					>
						{isExecuting ? (
							<span className="flex items-center gap-2">
								<svg
									className="animate-spin h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
								>
									<circle
										className="opacity-25"
										cx="12"
										cy="12"
										r="10"
										stroke="currentColor"
										strokeWidth="4"
									/>
									<path
										className="opacity-75"
										fill="currentColor"
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
									/>
								</svg>
								Starting...
							</span>
						) : (
							`Execute Remediation (${totalSelected})`
						)}
					</button>
					<button
						onClick={handleGeneratePrompts}
						disabled={isExecuting || isGenerating}
						className="btn-secondary"
					>
						{isGenerating ? "Generating..." : "Generate Prompts"}
					</button>
				</div>

				{executeError && (
					<p className="text-sm text-red-400 mt-2">{executeError}</p>
				)}
				{generateError && (
					<p className="text-sm text-red-400 mt-2">{generateError}</p>
				)}
			</div>

			{/* Generated Prompts (legacy mode) */}
			{prompts && (
				<div className="space-y-6">
					{prompts.errorFixPrompt && (
						<PromptDisplay
							title={`Fix Errors Prompt (${prompts.errorCount} issues)`}
							content={prompts.errorFixPrompt}
						/>
					)}
					{prompts.suggestionEnrichPrompt && (
						<PromptDisplay
							title={`Enrich Suggestions Prompt (${prompts.suggestionCount} issues)`}
							content={prompts.suggestionEnrichPrompt}
						/>
					)}
				</div>
			)}
		</div>
	);
}

function IssueSection({
	title,
	count,
	entries,
	onRemove,
}: {
	title: string;
	count: number;
	entries: { key: string; issue: Issue }[];
	onRemove: (key: string) => void;
}) {
	return (
		<div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-3">
			<div className="flex items-center justify-between mb-2">
				<span className="text-sm font-semibold text-slate-200">
					{title} ({count})
				</span>
			</div>
			<div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
				{entries.map(({ key, issue }) => {
					const numericSeverity = getIssueSeverity(issue);
					const severityLevel = getSeverityLevel(numericSeverity);
					const issueTitle =
						issue.title || issue.problem || issue.description || issue.category;

					return (
						<div
							key={key}
							className="flex items-center gap-2 py-1 px-1 rounded hover:bg-slate-700/30 group"
						>
							<div
								className={`severity-dot severity-dot-${severityLevel} flex-shrink-0`}
							/>
							<div className="flex-shrink-0 w-[72px]">
								{issue.issueType === "error" ? (
									<span className={getSeverityColor(issue.severity)}>
										{severityLevel.charAt(0).toUpperCase() +
											severityLevel.slice(1)}
									</span>
								) : (
									<span className={getImpactBadgeClass(issue.impactLevel)}>
										{getImpactLabel(issue.impactLevel)}
									</span>
								)}
							</div>
							<span className="flex-1 min-w-0 text-sm text-slate-300 truncate">
								{issueTitle}
							</span>
							{issue.evaluatorName && (
								<span className="flex-shrink-0 text-xs text-slate-500 hidden sm:block">
									{issue.evaluatorName}
								</span>
							)}
							<button
								onClick={() => onRemove(key)}
								className="flex-shrink-0 text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
								title="Remove from remediation"
							>
								<svg
									className="h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function PromptDisplay({ title, content }: { title: string; content: string }) {
	return (
		<div className="card">
			<div className="flex items-center justify-between mb-3">
				<h3 className="text-subheading text-slate-200">{title}</h3>
				<CopyButton text={content} variant="text" />
			</div>
			<div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50 font-mono text-xs text-slate-300 max-h-96 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
				{content}
			</div>
		</div>
	);
}

function ActionSummarySection({
	summary,
}: {
	summary: NonNullable<RemediationResult["summary"]>;
}) {
	const allActions = [
		...summary.errorFixActions,
		...summary.suggestionEnrichActions,
	];

	return (
		<div className="card">
			<div className="flex items-center justify-between mb-3">
				<h3 className="text-subheading text-slate-200">Action Summary</h3>
				<span className="text-caption">
					{summary.addressedCount} addressed
					{summary.skippedCount > 0 && (
						<span className="text-slate-500">
							, {summary.skippedCount} skipped
						</span>
					)}
				</span>
			</div>
			<div className="space-y-1">
				{allActions.map((action) => (
					<div
						key={`${action.issueIndex}-${action.status}`}
						className="flex items-start gap-2 py-1 px-1"
					>
						{action.status === "skipped" ? (
							<span className="text-slate-500 flex-shrink-0 mt-0.5">
								<svg
									className="w-4 h-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M20 12H4"
									/>
								</svg>
							</span>
						) : (
							<span className="text-green-400 flex-shrink-0 mt-0.5">
								<svg
									className="w-4 h-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M5 13l4 4L19 7"
									/>
								</svg>
							</span>
						)}
						<span className="text-sm text-slate-300 flex-1">
							{action.issueTitle ? (
								<span className="text-slate-400 text-xs mr-1.5">
									{action.issueTitle}
								</span>
							) : (
								<span className="text-slate-400 font-mono text-xs mr-1.5">
									#{action.issueIndex}
								</span>
							)}
							{action.summary}
						</span>
						{action.file && (
							<span className="text-xs text-slate-500 font-mono flex-shrink-0">
								{action.file}
							</span>
						)}
					</div>
				))}
			</div>
		</div>
	);
}

/**
 * Get action summaries relevant to a specific file path.
 */
function getFileSummaries(
	filePath: string,
	result: RemediationResult,
): RemediationAction[] {
	if (!result.summary?.parsed) return [];

	const allActions = [
		...result.summary.errorFixActions,
		...result.summary.suggestionEnrichActions,
	];

	return allActions.filter(
		(a) => a.file && a.status !== "skipped" && filePath.endsWith(a.file),
	);
}
