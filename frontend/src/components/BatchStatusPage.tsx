import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useEvaluationApi } from "../hooks/useEvaluationApi";
import { parseGitUrl } from "../lib/url-validation";
import type { BatchEntryStatus, IBatchStatusResponse } from "../types/job";

const POLL_INTERVAL_MS = 3000;

function getStatusBadge(status: BatchEntryStatus) {
	switch (status) {
		case "completed":
			return (
				<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
					<svg
						className="w-3 h-3"
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
					Completed
				</span>
			);
		case "failed":
			return (
				<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
					<svg
						className="w-3 h-3"
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
					Failed
				</span>
			);
		case "running":
			return (
				<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
					<svg
						className="w-3 h-3 animate-spin"
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
					Running
				</span>
			);
		case "queued":
			return (
				<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
					Queued
				</span>
			);
		case "pending":
			return (
				<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
					Pending
				</span>
			);
	}
}

function getRepoName(url: string): string {
	const parsed = parseGitUrl(url);
	if (parsed) {
		return `${parsed.owner}/${parsed.repo}`;
	}
	// Fallback: extract last two path segments
	try {
		const urlObj = new URL(url);
		const parts = urlObj.pathname.split("/").filter(Boolean);
		if (parts.length >= 2) {
			return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
		}
	} catch {
		// ignore
	}
	return url;
}

export function BatchStatusPage() {
	const { batchId } = useParams<{ batchId: string }>();
	const api = useEvaluationApi();
	const [batchStatus, setBatchStatus] = useState<IBatchStatusResponse | null>(
		null,
	);
	const [loadError, setLoadError] = useState<string | null>(null);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// Store api.getBatchStatus in a ref to avoid re-creating fetchStatus on every render.
	// useEvaluationApi() returns a new object reference each render, which would
	// cause the useEffect to clear and recreate the interval continuously.
	const getBatchStatusRef = useRef(api.getBatchStatus);
	getBatchStatusRef.current = api.getBatchStatus;

	const fetchStatus = useCallback(async () => {
		if (!batchId) return;
		try {
			const status = await getBatchStatusRef.current(batchId);
			setBatchStatus(status);
			setLoadError(null);

			// Stop polling when finished
			if (status.isFinished && pollRef.current) {
				clearInterval(pollRef.current);
				pollRef.current = null;
			}
		} catch (err) {
			setLoadError(
				err instanceof Error ? err.message : "Failed to load batch status",
			);
		}
	}, [batchId]);

	// Initial fetch and polling
	useEffect(() => {
		fetchStatus();
		pollRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);

		return () => {
			if (pollRef.current) {
				clearInterval(pollRef.current);
				pollRef.current = null;
			}
		};
	}, [fetchStatus]);

	if (loadError) {
		return (
			<div className="max-w-4xl mx-auto p-6">
				<div className="glass-card p-6">
					<div className="flex items-center gap-3 text-red-400">
						<svg
							className="w-6 h-6"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
							/>
						</svg>
						<div>
							<p className="font-medium">Error loading batch</p>
							<p className="text-sm text-red-400/80">{loadError}</p>
						</div>
					</div>
				</div>
			</div>
		);
	}

	if (!batchStatus) {
		return (
			<div className="max-w-4xl mx-auto p-6">
				<div className="glass-card p-6 text-center">
					<svg
						className="w-8 h-8 animate-spin text-indigo-400 mx-auto mb-3"
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
					<p className="text-sm text-slate-400">Loading batch status...</p>
				</div>
			</div>
		);
	}

	const completedOrFailed = batchStatus.completed + batchStatus.failed;
	const progressPercent =
		batchStatus.totalUrls > 0
			? Math.round((completedOrFailed / batchStatus.totalUrls) * 100)
			: 0;

	return (
		<div className="max-w-4xl mx-auto p-6">
			{/* Header */}
			<div className="mb-6">
				<div className="flex items-center gap-3 mb-2">
					<Link
						to="/"
						className="text-slate-400 hover:text-slate-200 transition-colors"
					>
						<svg
							className="w-5 h-5"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M10 19l-7-7m0 0l7-7m-7 7h18"
							/>
						</svg>
					</Link>
					<h1 className="text-heading">Batch Evaluation</h1>
				</div>
				<p className="text-body-muted">
					{batchStatus.totalUrls} repositories &mdash;{" "}
					{batchStatus.isFinished
						? `Finished (${batchStatus.completed} completed, ${batchStatus.failed} failed)`
						: `Processing sequentially...`}
				</p>
			</div>

			{/* Progress Bar */}
			<div className="glass-card p-4 mb-4">
				<div className="flex items-center justify-between mb-2">
					<span className="text-sm text-slate-300">Overall Progress</span>
					<span className="text-sm text-slate-400">
						{completedOrFailed} / {batchStatus.totalUrls}
					</span>
				</div>
				<div className="w-full bg-slate-700/50 rounded-full h-2">
					<div
						className={`h-2 rounded-full transition-all duration-500 ${
							batchStatus.isFinished && batchStatus.failed === 0
								? "bg-green-500"
								: batchStatus.isFinished
									? "bg-yellow-500"
									: "bg-indigo-500"
						}`}
						style={{ width: `${progressPercent}%` }}
					/>
				</div>
			</div>

			{/* Stats Row */}
			<div className="grid grid-cols-5 gap-3 mb-4">
				<div className="glass-card p-3 text-center">
					<p className="text-stat text-green-400">{batchStatus.completed}</p>
					<p className="text-caption">Completed</p>
				</div>
				<div className="glass-card p-3 text-center">
					<p className="text-stat text-red-400">{batchStatus.failed}</p>
					<p className="text-caption">Failed</p>
				</div>
				<div className="glass-card p-3 text-center">
					<p className="text-stat text-indigo-400">{batchStatus.running}</p>
					<p className="text-caption">Running</p>
				</div>
				<div className="glass-card p-3 text-center">
					<p className="text-stat text-yellow-400">{batchStatus.queued}</p>
					<p className="text-caption">Queued</p>
				</div>
				<div className="glass-card p-3 text-center">
					<p className="text-stat text-slate-400">{batchStatus.pending}</p>
					<p className="text-caption">Pending</p>
				</div>
			</div>

			{/* Jobs List */}
			<div className="glass-card overflow-hidden">
				<div className="px-4 py-3 border-b border-slate-700/50">
					<p className="text-sm font-medium text-slate-300">Repositories</p>
				</div>
				<div className="divide-y divide-slate-700/30">
					{batchStatus.jobs.map((job, index) => (
						<div
							key={job.jobId}
							className="flex items-center justify-between px-4 py-3 hover:bg-slate-800/30 transition-colors"
						>
							<div className="flex items-center gap-3 min-w-0">
								<span className="text-xs text-slate-500 w-6 text-right flex-shrink-0">
									{index + 1}
								</span>
								<div className="min-w-0">
									<p className="text-sm text-slate-200 truncate">
										{getRepoName(job.url)}
									</p>
									<p className="text-xs text-slate-500 truncate">{job.url}</p>
								</div>
							</div>
							<div className="flex items-center gap-3 flex-shrink-0 ml-4">
								{getStatusBadge(job.status)}
								{job.status === "completed" && (
									<Link
										to={`/evaluation/${job.jobId}`}
										className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
									>
										View Results
									</Link>
								)}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
