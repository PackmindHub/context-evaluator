import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	ProviderName,
	RemediationPromptsResponse,
	TargetAgent,
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
	IRemediationProgressState,
	RemediationHistoryItem,
	RemediationResult,
} from "../types/remediation";
import {
	countPackmindArtifacts,
	formatArtifactCount,
} from "../utils/packmind-artifacts";
import { AGENT_GENERATED_FILES, agentLogoMap } from "./AgentLogos";
import { RemediationHistory } from "./RemediationHistory";
import { RemediationProgress } from "./RemediationProgress";
import { CopyButton } from "./shared/CopyButton";
import { Modal } from "./shared/Modal";
import { PackmindLogo } from "./shared/PackmindLogo";
import { PackmindProductTourModal } from "./shared/PackmindProductTourModal";

type Phase = "idle" | "progress";

interface RemediateTabProps {
	evaluationId: string | null;
	evaluationData: EvaluationOutput | null;
	selectedIssueKeys: Set<string>;
	issueKeyMap: Map<string, Issue>;
	onRemoveIssue: (key: string) => void;
	onClearAll: () => void;
	cloudMode?: boolean;
	repositoryUrl?: string | null;
}

export function RemediateTab({
	evaluationId,
	evaluationData,
	selectedIssueKeys,
	issueKeyMap,
	onRemoveIssue,
	onClearAll,
	cloudMode = false,
	repositoryUrl,
}: RemediateTabProps) {
	const api = useEvaluationApi();
	const providerDetection = useProviderDetection();

	const [showTourModal, setShowTourModal] = useState(false);

	// Phase: idle (config visible) or progress (SSE running)
	const [phase, setPhase] = useState<Phase>("idle");
	const [targetAgent, setTargetAgent] = useState<TargetAgent>("agents-md");
	const [selectedProvider, setSelectedProvider] =
		useState<ProviderName>("claude");
	const [isExecuting, setIsExecuting] = useState(false);
	const [showConfirmModal, setShowConfirmModal] = useState(false);
	const [executeError, setExecuteError] = useState<string | null>(null);

	// History state
	const [remediations, setRemediations] = useState<RemediationHistoryItem[]>(
		[],
	);

	// SSE state
	const [sseUrl, setSseUrl] = useState<string | null>(null);
	const [, setActiveRemediationId] = useState<string | null>(null);
	const activeRemediationIdRef = useRef<string | null>(null);
	const [autoExpandRemediationId, setAutoExpandRemediationId] = useState<
		string | null
	>(null);
	const [progressState, setProgressState] = useState<IRemediationProgressState>(
		{
			status: "queued",
			logs: [],
		},
	);

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

	// Load remediation history on mount / evaluationId change
	const refreshHistory = useCallback(async () => {
		if (!evaluationId) return;
		const data = await api.getRemediationsForEvaluation(evaluationId);
		setRemediations(data.remediations);
		return data;
	}, [evaluationId, api]);

	useEffect(() => {
		if (!evaluationId) return;

		let cancelled = false;

		async function loadRemediations() {
			const data = await api.getRemediationsForEvaluation(evaluationId!);
			if (cancelled) return;

			setRemediations(data.remediations);

			// If there's an active job, connect SSE
			if (data.activeJob) {
				activeRemediationIdRef.current = data.activeJob.id;
				setActiveRemediationId(data.activeJob.id);
				setSseUrl(
					`${window.location.origin}/api/remediation/${data.activeJob.id}/progress`,
				);
				setProgressState({
					status: data.activeJob.status as "queued" | "running",
					logs: [],
				});
				setPhase("progress");
			}
		}

		loadRemediations();

		return () => {
			cancelled = true;
		};
	}, [evaluationId, api]);

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

	// Aggregate Packmind artifact totals across all remediations
	const packmindTotals = useMemo(() => {
		let standards = 0;
		let skills = 0;
		for (const r of remediations) {
			const allActions = [
				...(r.summary?.errorFixActions ?? []),
				...(r.summary?.suggestionEnrichActions ?? []),
			];
			const counts = countPackmindArtifacts(allActions);
			standards += counts.standards;
			skills += counts.skills;
		}
		return { standards, skills };
	}, [remediations]);

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

				case "remediation.progress": {
					const d = event.data ?? {};
					setProgressState((prev) => ({
						...prev,
						...(d.errorCount !== undefined && {
							errorCount: d.errorCount as number,
						}),
						...(d.suggestionCount !== undefined && {
							suggestionCount: d.suggestionCount as number,
						}),
						...(d.totalBatches !== undefined && {
							totalBatches: d.totalBatches as number,
						}),
						...(d.completedBatches !== undefined && {
							completedBatches: d.completedBatches as number,
						}),
						...(d.phase !== undefined && {
							currentPhase: d.phase as "errors" | "suggestions",
						}),
						...(d.runningTotalCostUsd !== undefined && {
							runningTotalCostUsd: d.runningTotalCostUsd as number,
						}),
						...(d.runningTotalDurationMs !== undefined && {
							runningTotalDurationMs: d.runningTotalDurationMs as number,
						}),
						...(d.runningTotalInputTokens !== undefined && {
							runningTotalInputTokens: d.runningTotalInputTokens as number,
						}),
						...(d.runningTotalOutputTokens !== undefined && {
							runningTotalOutputTokens: d.runningTotalOutputTokens as number,
						}),
					}));
					break;
				}

				case "remediation.step.started": {
					const bi = event.data?.batchInfo as
						| { batchNumber: number; totalBatches: number }
						| undefined;
					const batchLabel = bi
						? ` (batch ${bi.batchNumber}/${bi.totalBatches})`
						: "";
					const issueSummaries = event.data?.issuesSummary as
						| string[]
						| undefined;
					setProgressState((prev) => ({
						...prev,
						currentStep: event.data?.step,
						batchInfo: bi,
						...(issueSummaries && {
							currentBatchIssues: issueSummaries,
						}),
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
					const step = event.data?.step as string | undefined;
					const batchDurationMs = event.data?.batchDurationMs as
						| number
						| undefined;
					const batchCostUsd = event.data?.batchCostUsd as number | undefined;
					const batchInputTokens = event.data?.batchInputTokens as
						| number
						| undefined;
					const batchOutputTokens = event.data?.batchOutputTokens as
						| number
						| undefined;

					const hasBatchStats =
						batchDurationMs !== undefined && batchCostUsd !== undefined;
					let logMessage = `Step completed: ${step}${batchLabel2}`;
					if (hasBatchStats) {
						const phaseName =
							step === "executing_error_fix"
								? "Error fix"
								: "Suggestion enrich";
						const label = bi2
							? `${phaseName} batch ${bi2.batchNumber}/${bi2.totalBatches}`
							: phaseName;
						logMessage = `${label} completed: ${Math.round(batchDurationMs / 1000)}s, $${batchCostUsd.toFixed(4)}`;
					}

					setProgressState((prev) => ({
						...prev,
						batchInfo: undefined,
						currentBatchIssues: undefined,
						...(hasBatchStats && {
							lastBatchStats: {
								durationMs: batchDurationMs!,
								costUsd: batchCostUsd!,
								inputTokens: batchInputTokens ?? 0,
								outputTokens: batchOutputTokens ?? 0,
							},
						}),
						logs: [...prev.logs, { timestamp, message: logMessage }],
					}));
					break;
				}

				case "remediation.completed": {
					setProgressState((prev) => ({
						...prev,
						status: "completed",
						result: event.data?.result as RemediationResult | undefined,
						logs: [
							...prev.logs,
							{ timestamp, message: "Remediation completed" },
						],
					}));
					// Reset to idle, refresh history, clear selection
					// Capture completed remediation ID for auto-expand
					if (activeRemediationIdRef.current) {
						setAutoExpandRemediationId(activeRemediationIdRef.current);
					}
					activeRemediationIdRef.current = null;
					setActiveRemediationId(null);
					setSseUrl(null);
					setPhase("idle");
					onClearAll();
					refreshHistory();
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
					setSseUrl(null);
					activeRemediationIdRef.current = null;
					setActiveRemediationId(null);
					setPhase("idle");
					refreshHistory();
					break;
			}
		},
		[onClearAll, refreshHistory],
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
				targetAgent,
				selectedProvider,
			);

			activeRemediationIdRef.current = response.remediationId;
			setActiveRemediationId(response.remediationId);
			setSseUrl(response.sseUrl);
			setProgressState({ status: "queued", logs: [] });
			setPhase("progress");
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to start remediation";
			setExecuteError(message);
		} finally {
			setIsExecuting(false);
		}
	}, [
		evaluationId,
		totalSelected,
		errorEntries,
		suggestionEntries,
		targetAgent,
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
				targetAgent,
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
		targetAgent,
		api,
	]);

	// Delete a remediation from history
	const handleDeleteRemediation = useCallback(
		async (remediationId: string) => {
			await api.deleteRemediation(remediationId);
			setRemediations((prev) => prev.filter((r) => r.id !== remediationId));
		},
		[api],
	);

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

	// ─── PROGRESS PHASE ────────────────────────────────────────────────
	if (phase === "progress") {
		return (
			<div className="space-y-6">
				<div className="card">
					<h2 className="text-heading text-slate-100">Executing Remediation</h2>
					<p className="text-body-muted mt-1">
						Running {selectedProvider} agent to fix{" "}
						{totalSelected > 0 ? totalSelected : "selected"} issue
						{totalSelected !== 1 ? "s" : ""}...
					</p>
				</div>
				<RemediationProgress
					currentStep={progressState.currentStep}
					batchInfo={progressState.batchInfo}
					logs={progressState.logs}
					errorCount={progressState.errorCount}
					suggestionCount={progressState.suggestionCount}
					totalBatches={progressState.totalBatches}
					completedBatches={progressState.completedBatches}
					currentPhase={progressState.currentPhase}
					runningTotalCostUsd={progressState.runningTotalCostUsd}
					runningTotalDurationMs={progressState.runningTotalDurationMs}
					runningTotalInputTokens={progressState.runningTotalInputTokens}
					runningTotalOutputTokens={progressState.runningTotalOutputTokens}
					currentBatchIssues={progressState.currentBatchIssues}
				/>
			</div>
		);
	}

	// ─── IDLE PHASE (config + history) ─────────────────────────────────
	return (
		<div className="space-y-6">
			<div className="card">
				<h2 className="text-heading text-slate-100">Remediation</h2>
				<p className="text-body-muted mt-1">
					Execute remediation to fix issues automatically, or generate
					copy-paste prompts
				</p>
			</div>

			{/* Past Remediations History */}
			<RemediationHistory
				remediations={remediations}
				onDelete={handleDeleteRemediation}
				onRefresh={refreshHistory}
				cloudMode={cloudMode}
				autoExpandId={autoExpandRemediationId}
				onAutoExpandHandled={() => setAutoExpandRemediationId(null)}
				parentScore={evaluationData?.metadata?.contextScore?.score}
				parentGrade={evaluationData?.metadata?.contextScore?.grade}
				defaultOpen={selectedIssueKeys.size === 0}
				hasRepoUrl={
					!!repositoryUrl &&
					repositoryUrl !== "unknown" &&
					(repositoryUrl.startsWith("http") || repositoryUrl.startsWith("git@"))
				}
			/>

			{/* Packmind persistent promotion section */}
			<div className="card border-2 packmind-section">
				<div className="flex items-start gap-4">
					<PackmindLogo className="h-8 flex-shrink-0 mt-0.5" />
					<div className="flex-1 min-w-0">
						<h3 className="text-subheading text-slate-100 mb-1">
							What's next with your playbook?
						</h3>
						{packmindTotals.standards + packmindTotals.skills > 0 && (
							<p className="text-base text-slate-300 mb-1">
								Your remediations have created{" "}
								<span className="font-bold text-blue-400 bg-blue-500/15 px-1.5 py-0.5 rounded">
									{formatArtifactCount(
										packmindTotals.standards,
										packmindTotals.skills,
									)}
								</span>{" "}
								so far.
							</p>
						)}
						<p className="text-body text-slate-400">
							Your team's AI agent playbook is taking shape. Packmind helps you
							centralize coding standards and skills, distribute them across
							repos, and add governance workflows.
						</p>
						<div className="flex gap-3 mt-3">
							<a
								href="https://packmind.com"
								target="_blank"
								rel="noopener noreferrer"
								className="btn-secondary"
							>
								Explore Packmind
							</a>
							<button
								onClick={() => setShowTourModal(true)}
								className="btn-secondary"
							>
								Get product tour
							</button>
						</div>
					</div>
				</div>
				<PackmindProductTourModal
					isOpen={showTourModal}
					onClose={() => setShowTourModal(false)}
				/>
			</div>

			{/* Empty state when no issues selected */}
			{totalSelected === 0 ? (
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
			) : (
				<div className="card space-y-5">
					{/* Target Agent */}
					<div>
						<label className="text-label text-slate-300 block mb-2">
							Target for markdown file rendering
						</label>
						<div className="flex gap-2">
							{(
								[
									["agents-md", "AGENTS.md"],
									["claude-code", "Claude Code"],
									["github-copilot", "GitHub Copilot"],
									["cursor", "Cursor"],
								] as const
							).map(([value, label]) => (
								<button
									key={value}
									onClick={() => setTargetAgent(value)}
									className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
										targetAgent === value
											? "bg-blue-600 text-white"
											: "bg-slate-700 text-slate-300 hover:bg-slate-600"
									}`}
								>
									{agentLogoMap[value] && (
										<span className="w-4 h-4 flex items-center">
											{agentLogoMap[value]}
										</span>
									)}
									{label}
								</button>
							))}
						</div>
						{AGENT_GENERATED_FILES[targetAgent] && (
							<p className="text-xs text-slate-500 mt-1">
								Generates: {AGENT_GENERATED_FILES[targetAgent].join(", ")}
							</p>
						)}
					</div>

					{/* Provider Selector */}
					<div>
						<label className="text-label text-slate-300 block mb-2">
							Pick the AI agent to execute the remediation
						</label>
						{providerDetection.status === "detecting" ? (
							<div className="text-sm text-slate-400">
								Detecting providers...
							</div>
						) : availableProviders.length > 0 ? (
							<div className="flex flex-wrap gap-2">
								{availableProviders.map((p) => (
									<button
										key={p.name}
										onClick={() => setSelectedProvider(p.name)}
										className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
											selectedProvider === p.name
												? "bg-blue-600 text-white"
												: "bg-slate-700 text-slate-300 hover:bg-slate-600"
										}`}
									>
										{agentLogoMap[p.name] && (
											<span className="w-4 h-4 flex items-center">
												{agentLogoMap[p.name]}
											</span>
										)}
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
								{totalSelected} issue
								{totalSelected !== 1 ? "s" : ""} selected
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
							onClick={() => setShowConfirmModal(true)}
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
			)}

			{/* Confirmation Modal */}
			<Modal
				isOpen={showConfirmModal}
				onClose={() => setShowConfirmModal(false)}
				title="Confirm Remediation"
				maxWidth="max-w-md"
			>
				<div className="space-y-4">
					<p className="text-sm text-slate-300">
						This will run the AI provider to remediate the selected issues.
						Please confirm the details below.
					</p>
					<div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-3 space-y-2 text-sm">
						{errorEntries.length > 0 && (
							<div className="flex justify-between text-slate-300">
								<span>Errors</span>
								<span className="font-semibold">{errorEntries.length}</span>
							</div>
						)}
						{suggestionEntries.length > 0 && (
							<div className="flex justify-between text-slate-300">
								<span>Suggestions</span>
								<span className="font-semibold">
									{suggestionEntries.length}
								</span>
							</div>
						)}
						<div className="flex justify-between text-slate-300">
							<span>Target for markdown file rendering</span>
							<span className="font-semibold">
								{targetAgent === "agents-md"
									? "AGENTS.md"
									: targetAgent === "claude-code"
										? "Claude Code"
										: "GitHub Copilot"}
							</span>
						</div>
						<div className="flex justify-between text-slate-300">
							<span>Provider</span>
							<span className="font-semibold">{selectedProvider}</span>
						</div>
					</div>
					<div className="flex justify-end gap-3 pt-2">
						<button
							onClick={() => setShowConfirmModal(false)}
							className="btn-secondary"
						>
							Cancel
						</button>
						<button
							onClick={() => {
								setShowConfirmModal(false);
								handleExecute();
							}}
							className="btn-primary"
						>
							Confirm
						</button>
					</div>
				</div>
			</Modal>

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
