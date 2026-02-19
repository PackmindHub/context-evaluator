/**
 * Progress display during remediation execution.
 * Shows summary header, progress bar, running totals, batch detail, and activity log.
 */

import { useEffect, useRef, useState } from "react";

const STEP_LABELS: Record<string, string> = {
	cloning: "Cloning repository...",
	checking_git: "Checking git status...",
	planning_error_fix: "Planning error fixes...",
	executing_error_fix: "Fixing errors...",
	capturing_error_diff: "Capturing error changes...",
	planning_suggestion_enrich: "Planning enrichment...",
	executing_suggestion_enrich: "Enriching documentation...",
	capturing_diff: "Capturing changes...",
	resetting: "Resetting working directory...",
};

interface RemediationProgressProps {
	currentStep?: string;
	batchInfo?: { batchNumber: number; totalBatches: number };
	logs: Array<{ timestamp: string; message: string }>;
	errorCount?: number;
	suggestionCount?: number;
	totalBatches?: number;
	completedBatches?: number;
	currentPhase?: "errors" | "suggestions";
	runningTotalCostUsd?: number;
	runningTotalDurationMs?: number;
	runningTotalInputTokens?: number;
	runningTotalOutputTokens?: number;
	currentBatchIssues?: string[];
}

export function RemediationProgress({
	currentStep,
	batchInfo,
	logs,
	errorCount,
	suggestionCount,
	totalBatches,
	completedBatches,
	currentPhase,
	runningTotalCostUsd,
	runningTotalDurationMs,
	runningTotalInputTokens,
	runningTotalOutputTokens,
	currentBatchIssues,
}: RemediationProgressProps) {
	const [elapsed, setElapsed] = useState(0);
	const logEndRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const start = Date.now();
		const interval = setInterval(() => {
			setElapsed(Math.floor((Date.now() - start) / 1000));
		}, 1000);
		return () => clearInterval(interval);
	}, []);

	// Auto-scroll log to bottom when new entries are added
	const logCount = logs.length;
	// biome-ignore lint/correctness/useExhaustiveDependencies: logCount triggers scroll on new log entries
	useEffect(() => {
		logEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [logCount]);

	const formatTime = (seconds: number) => {
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return m > 0 ? `${m}m ${s}s` : `${s}s`;
	};

	const stepLabel = currentStep
		? STEP_LABELS[currentStep] || currentStep
		: "Initializing...";

	const hasPlan = totalBatches !== undefined && totalBatches > 0;
	const hasProgress = completedBatches !== undefined && completedBatches > 0;
	const progressPercent =
		hasPlan && completedBatches !== undefined
			? Math.round((completedBatches / totalBatches) * 100)
			: 0;

	return (
		<div className="card space-y-4">
			{/* Summary header */}
			{hasPlan && (
				<div className="text-sm text-slate-300">
					{errorCount !== undefined && errorCount > 0 && (
						<span>
							Fixing{" "}
							<span className="text-slate-100 font-medium">
								{errorCount} error{errorCount !== 1 ? "s" : ""}
							</span>
						</span>
					)}
					{errorCount !== undefined &&
						errorCount > 0 &&
						suggestionCount !== undefined &&
						suggestionCount > 0 && <span>, then enriching </span>}
					{suggestionCount !== undefined && suggestionCount > 0 && (
						<span>
							{errorCount === undefined || errorCount === 0 ? "Enriching " : ""}
							<span className="text-slate-100 font-medium">
								{suggestionCount} suggestion
								{suggestionCount !== 1 ? "s" : ""}
							</span>
						</span>
					)}
					<span className="text-slate-500">
						{" "}
						({totalBatches} AI invocation
						{totalBatches !== 1 ? "s" : ""})
					</span>
				</div>
			)}

			{/* Current step with spinner */}
			<div className="flex items-center gap-3">
				<svg
					className="animate-spin h-5 w-5 text-blue-400 flex-shrink-0"
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
				<span className="text-sm text-slate-200 font-medium">{stepLabel}</span>
				<span className="text-xs text-slate-500 ml-auto">
					{formatTime(elapsed)}
				</span>
			</div>

			{/* Progress bar */}
			{hasPlan && (
				<div className="space-y-1">
					<div className="flex items-center justify-between">
						<span className="text-xs text-slate-400">
							Phase {completedBatches ?? 0}/{totalBatches}
							{currentPhase && (
								<span className="text-slate-500 ml-1">
									({currentPhase === "errors" ? "errors" : "suggestions"})
								</span>
							)}
						</span>
						<span className="text-xs text-slate-500">{progressPercent}%</span>
					</div>
					<div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
						<div
							className="h-full bg-blue-500 rounded-full transition-all duration-500"
							style={{ width: `${progressPercent}%` }}
						/>
					</div>
				</div>
			)}

			{/* Running totals strip */}
			{hasProgress && (
				<div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
					{runningTotalCostUsd !== undefined && runningTotalCostUsd > 0 && (
						<span>
							Cost:{" "}
							<span className="text-slate-300">
								${runningTotalCostUsd.toFixed(4)}
							</span>
						</span>
					)}
					{runningTotalInputTokens !== undefined &&
						runningTotalOutputTokens !== undefined &&
						(runningTotalInputTokens > 0 || runningTotalOutputTokens > 0) && (
							<span>
								Tokens:{" "}
								<span className="text-slate-300">
									{runningTotalInputTokens.toLocaleString()} in /{" "}
									{runningTotalOutputTokens.toLocaleString()} out
								</span>
							</span>
						)}
					{runningTotalDurationMs !== undefined &&
						runningTotalDurationMs > 0 && (
							<span>
								Time:{" "}
								<span className="text-slate-300">
									{formatTime(Math.round(runningTotalDurationMs / 1000))}
								</span>
							</span>
						)}
				</div>
			)}

			{/* Current batch detail */}
			{currentBatchIssues && currentBatchIssues.length > 0 && (
				<div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-2.5">
					<div className="text-xs text-slate-500 mb-1.5">
						Current batch ({currentBatchIssues.length} issue
						{currentBatchIssues.length !== 1 ? "s" : ""})
					</div>
					<div className="space-y-0.5">
						{currentBatchIssues.map((summary) => (
							<div key={summary} className="text-xs text-slate-400 truncate">
								{summary}
							</div>
						))}
					</div>
				</div>
			)}

			{/* Activity log */}
			{logs.length > 0 && (
				<div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50 max-h-40 overflow-y-auto custom-scrollbar">
					{logs.map((log, i) => (
						<div key={i} className="text-xs text-slate-400 py-0.5">
							<span className="text-slate-600 mr-2">
								{new Date(log.timestamp).toLocaleTimeString()}
							</span>
							{log.message}
						</div>
					))}
					<div ref={logEndRef} />
				</div>
			)}
		</div>
	);
}
