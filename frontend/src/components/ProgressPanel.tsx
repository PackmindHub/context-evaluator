import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getUserFriendlyError } from "../lib/error-messages";
import { extractRepoNameOnly, formatElapsedTime } from "../lib/formatters";
import type { IProgressState } from "../types/job";
import { ProgressBar } from "./ProgressBar";

interface IProgressPanelProps {
	progress: IProgressState;
	jobId?: string;
	onCancel: () => void;
	onDismiss?: () => void;
}

export const ProgressPanel: React.FC<IProgressPanelProps> = ({
	progress,
	jobId,
	onCancel,
	onDismiss,
}) => {
	const [copied, setCopied] = useState(false);
	const [elapsedTime, setElapsedTime] = useState(0);

	// Update elapsed time every second while job is running
	useEffect(() => {
		if (!progress.startTime) {
			setElapsedTime(0);
			return;
		}

		// Initial calculation
		setElapsedTime(Date.now() - progress.startTime.getTime());

		// Only run interval while job is running or queued
		if (progress.status !== "running" && progress.status !== "queued") {
			return;
		}

		const intervalId = setInterval(() => {
			setElapsedTime(Date.now() - progress.startTime!.getTime());
		}, 1000);

		return () => clearInterval(intervalId);
	}, [progress.startTime, progress.status]);

	const reportUrl = useMemo(() => {
		if (!jobId) return null;
		return `${window.location.origin}/evaluation/${jobId}`;
	}, [jobId]);

	const handleCopyLink = useCallback(async () => {
		if (!reportUrl) return;
		try {
			await navigator.clipboard.writeText(reportUrl);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Fallback for older browsers
			const textArea = document.createElement("textarea");
			textArea.value = reportUrl;
			document.body.appendChild(textArea);
			textArea.select();
			document.execCommand("copy");
			document.body.removeChild(textArea);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	}, [reportUrl]);

	const repoName = useMemo(
		() => extractRepoNameOnly(progress.repositoryUrl),
		[progress.repositoryUrl],
	);

	const statusText = useMemo(() => {
		switch (progress.status) {
			case "queued":
				return "Waiting in queue...";
			case "running":
				if (progress.currentEvaluator) {
					return `Running ${progress.currentEvaluator}`;
				}
				if (progress.currentFile) {
					return `Processing ${progress.currentFile}`;
				}
				return "Evaluating...";
			case "completed":
				return "Evaluation complete!";
			case "failed":
				return "Evaluation failed";
			default:
				return "Processing...";
		}
	}, [progress.status, progress.currentEvaluator, progress.currentFile]);

	// Get user-friendly error message for failed state
	const friendlyError = useMemo(() => {
		if (progress.status !== "failed" || !progress.errorMessage) return null;
		return getUserFriendlyError(progress.errorMessage, progress.errorCode);
	}, [progress.status, progress.errorMessage, progress.errorCode]);

	// Render failed state UI
	if (progress.status === "failed" && friendlyError) {
		return (
			<div className="glass-card p-6 border border-red-700/40 animate-fade-in">
				{/* Header */}
				<div className="flex items-center justify-between mb-6">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 bg-gradient-to-br from-red-500 to-rose-600 rounded-lg flex items-center justify-center shadow-lg">
							<svg
								className="w-5 h-5 text-white"
								fill="currentColor"
								viewBox="0 0 20 20"
							>
								<path
									fillRule="evenodd"
									d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
									clipRule="evenodd"
								/>
							</svg>
						</div>
						<div>
							<h2 className="text-lg font-semibold text-red-200">
								{friendlyError.title}
							</h2>
							<p className="text-sm text-slate-400">{repoName}</p>
						</div>
					</div>
				</div>

				{/* Error Details */}
				<div className="mb-6 space-y-4">
					{/* Description */}
					<div className="bg-slate-800/50 rounded-lg p-4 border border-red-800/30">
						<p className="text-sm text-slate-200 mb-3">
							{friendlyError.description}
						</p>
						<p className="text-xs text-slate-400">{friendlyError.suggestion}</p>
					</div>

					{/* Technical Details (collapsible) */}
					<details className="group">
						<summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400 transition-colors">
							Technical details
						</summary>
						<div className="mt-2 bg-slate-900/50 rounded-lg p-3 text-xs text-slate-400 font-mono break-all">
							{progress.errorMessage}
							{progress.errorCode && (
								<span className="block mt-1 text-slate-500">
									Code: {progress.errorCode}
								</span>
							)}
						</div>
					</details>
				</div>

				{/* Elapsed Time */}
				<div className="mb-6">
					<div className="bg-slate-800/50 rounded-lg p-3 inline-block">
						<div className="text-xs text-slate-400 mb-1">
							Duration before failure
						</div>
						<div className="text-sm text-slate-200 font-medium">
							{formatElapsedTime(elapsedTime)}
						</div>
					</div>
				</div>

				{/* Activity Log */}
				{progress.logs.length > 0 && (
					<div className="mb-6">
						<div className="text-xs text-slate-400 mb-2 font-medium">
							Activity Log
						</div>
						<div className="bg-slate-900/50 rounded-lg p-3 max-h-32 overflow-y-auto custom-scrollbar">
							<div className="space-y-1.5">
								{progress.logs
									.slice(-20)
									.reverse()
									.map((log, index) => (
										<div key={index} className="flex items-start gap-2 text-xs">
											<span className="text-slate-500 shrink-0">
												{log.timestamp.toLocaleTimeString()}
											</span>
											<span
												className={`
                      ${log.type === "success" ? "log-success" : ""}
                      ${log.type === "error" ? "log-error" : ""}
                      ${log.type === "warning" ? "log-warning" : ""}
                      ${log.type === "info" ? "log-info" : ""}
                    `}
											>
												{log.message}
											</span>
										</div>
									))}
							</div>
						</div>
					</div>
				)}

				{/* Action Buttons */}
				<div className="flex items-center gap-3">
					{onDismiss && (
						<button onClick={onDismiss} className="btn-primary">
							<div className="flex items-center gap-2">
								<svg
									className="w-4 h-4"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
									/>
								</svg>
								<span>Try Again</span>
							</div>
						</button>
					)}
				</div>
			</div>
		);
	}

	// Render normal progress state UI
	return (
		<div className="glass-card relative overflow-hidden border border-slate-600/40">
			{/* Scan line effect during analysis */}
			{(progress.status === "running" || progress.status === "queued") && (
				<div className="scan-line" />
			)}

			{/* Header */}
			<div className="flex items-center justify-between mb-6 p-6 pb-0">
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center shadow-lg">
						{progress.status === "running" || progress.status === "queued" ? (
							<svg
								className="w-5 h-5 text-white animate-spin"
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
								></circle>
								<path
									className="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								></path>
							</svg>
						) : progress.status === "completed" ? (
							<svg
								className="w-5 h-5 text-white"
								fill="currentColor"
								viewBox="0 0 20 20"
							>
								<path
									fillRule="evenodd"
									d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
									clipRule="evenodd"
								/>
							</svg>
						) : (
							<svg
								className="w-5 h-5 text-white"
								fill="currentColor"
								viewBox="0 0 20 20"
							>
								<path
									fillRule="evenodd"
									d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
									clipRule="evenodd"
								/>
							</svg>
						)}
					</div>
					<div>
						<h2 className="text-lg font-semibold text-slate-100">
							Evaluating Repository
						</h2>
						<p className="text-sm text-slate-400">{repoName}</p>
					</div>
				</div>
				{(progress.status === "running" || progress.status === "queued") && (
					<button onClick={onCancel} className="btn-secondary text-sm">
						<div className="flex items-center gap-1.5">
							<svg
								className="w-4 h-4"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
							<span>Cancel</span>
						</div>
					</button>
				)}
			</div>

			{/* Time Estimate Info - shown only during active evaluation */}
			{(progress.status === "running" || progress.status === "queued") && (
				<div className="px-6 pb-4">
					<div className="info-section">
						<div className="flex items-center gap-2">
							<svg
								className="info-section-icon"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							<p className="text-caption">
								The analysis can take from 2 to 8 minutes, depending on the
								codebase size.
							</p>
						</div>
					</div>
				</div>
			)}

			{/* Progress Bar */}
			<div className="mb-6 px-6">
				<ProgressBar
					percentage={progress.percentage}
					size="lg"
					color={progress.status === "failed" ? "purple" : "blue"}
				/>
			</div>

			{/* Status Row */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 px-6">
				{/* Current Status */}
				<div className="bg-slate-800/50 rounded-lg p-3">
					<div className="text-xs text-slate-400 mb-1">Status</div>
					<div className="text-sm text-slate-200 font-medium truncate">
						{statusText}
					</div>
				</div>

				{/* Evaluator Progress */}
				<div className="bg-slate-800/50 rounded-lg p-3">
					<div className="text-xs text-slate-400 mb-1">Evaluator</div>
					<div className="text-sm text-slate-200 font-medium">
						{progress.totalEvaluators > 0
							? `${progress.completedEvaluators} of ${progress.totalEvaluators}`
							: "Initializing..."}
					</div>
				</div>

				{/* Elapsed Time */}
				<div className="bg-slate-800/50 rounded-lg p-3">
					<div className="text-xs text-slate-400 mb-1">Elapsed Time</div>
					<div className="text-sm text-slate-200 font-medium">
						{formatElapsedTime(elapsedTime)}
					</div>
				</div>
			</div>

			{/* Activity Log */}
			{progress.logs.length > 0 && (
				<div className="px-6 pb-6">
					<div className="text-xs text-slate-400 mb-2 font-medium">
						Activity Log
					</div>
					<div className="bg-slate-900/50 rounded-lg p-3 max-h-40 overflow-y-auto custom-scrollbar border border-slate-700/30">
						<div className="space-y-1.5 stagger-children">
							{progress.logs
								.slice(-20)
								.reverse()
								.map((log, index) => (
									<div key={index} className="flex items-start gap-2 text-xs">
										<span className="text-slate-500 shrink-0 font-mono">
											{log.timestamp.toLocaleTimeString()}
										</span>
										<span
											className={`
                    ${log.type === "success" ? "log-success" : ""}
                    ${log.type === "error" ? "log-error" : ""}
                    ${log.type === "warning" ? "log-warning" : ""}
                    ${log.type === "info" ? "log-info" : ""}
                  `}
										>
											{log.message}
										</span>
									</div>
								))}
						</div>
					</div>
				</div>
			)}

			{/* Shareable Link Card */}
			{reportUrl && (
				<div className="px-6 pb-6">
					<div className="bg-indigo-950/30 rounded-lg p-4 border border-indigo-500/30">
						<div className="flex items-start gap-3">
							<div className="w-8 h-8 bg-indigo-600/20 rounded-lg flex items-center justify-center shrink-0">
								<svg
									className="w-4 h-4 text-indigo-400"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
									/>
								</svg>
							</div>
							<div className="flex-1 min-w-0">
								<p className="text-xs text-slate-400 mb-1">
									Share or bookmark this report
								</p>
								<div className="flex items-center gap-2">
									<code className="text-xs text-slate-300 bg-indigo-950/50 px-2 py-1 rounded border border-indigo-500/20 truncate flex-1">
										{reportUrl}
									</code>
									<button
										type="button"
										onClick={handleCopyLink}
										className="shrink-0 px-3 py-1 text-xs font-medium text-indigo-100 bg-indigo-600/80 hover:bg-indigo-500 rounded transition-colors flex items-center gap-1.5"
									>
										{copied ? (
											<>
												<svg
													className="w-3.5 h-3.5 text-green-400"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={2}
														d="M5 13l4 4L19 7"
													/>
												</svg>
												<span>Copied</span>
											</>
										) : (
											<>
												<svg
													className="w-3.5 h-3.5"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={2}
														d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
													/>
												</svg>
												<span>Copy</span>
											</>
										)}
									</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
