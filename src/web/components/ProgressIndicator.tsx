import type { IJobProgress } from "@shared/types/api";
import { useMemo } from "react";
import type { SSEState } from "../hooks/useSSE";

interface IProgressIndicatorProps {
	progress?: IJobProgress;
	status: "queued" | "running" | "completed" | "failed";
	sseState?: SSEState;
	error?: { message: string; code: string } | null;
}

/**
 * Progress indicator component for real-time evaluation updates
 *
 * Shows:
 * - Job status with color-coded badges
 * - Progress bars for files and evaluators
 * - Current file and evaluator being processed
 * - SSE connection status
 * - Error messages
 */
export function ProgressIndicator({
	progress,
	status,
	sseState,
	error,
}: IProgressIndicatorProps) {
	/**
	 * Calculate progress percentages
	 */
	const { filesPercent, evaluatorsPercent } = useMemo(() => {
		if (!progress) {
			return { filesPercent: 0, evaluatorsPercent: 0 };
		}

		const filesPercent =
			progress.totalFiles > 0
				? Math.round((progress.completedFiles / progress.totalFiles) * 100)
				: 0;

		const evaluatorsPercent =
			progress.totalEvaluators > 0
				? Math.round(
						(progress.completedEvaluators / progress.totalEvaluators) * 100,
					)
				: 0;

		return { filesPercent, evaluatorsPercent };
	}, [progress]);

	/**
	 * Get status badge styling
	 */
	const getStatusBadge = () => {
		switch (status) {
			case "queued":
				return (
					<span className="px-3 py-1 text-sm font-medium bg-blue-100 text-blue-800 rounded-full">
						⏱️ Queued
					</span>
				);
			case "running":
				return (
					<span className="px-3 py-1 text-sm font-medium bg-yellow-100 text-yellow-800 rounded-full animate-pulse">
						⚡ Running
					</span>
				);
			case "completed":
				return (
					<span className="px-3 py-1 text-sm font-medium bg-green-100 text-green-800 rounded-full">
						✅ Completed
					</span>
				);
			case "failed":
				return (
					<span className="px-3 py-1 text-sm font-medium bg-red-100 text-red-800 rounded-full">
						❌ Failed
					</span>
				);
		}
	};

	/**
	 * Get SSE status indicator
	 */
	const getSSEStatusIndicator = () => {
		if (!sseState) return null;

		switch (sseState) {
			case "connecting":
				return <span className="text-xs text-gray-500">🔄 Connecting...</span>;
			case "connected":
				return <span className="text-xs text-green-600">🟢 Live</span>;
			case "disconnected":
				return <span className="text-xs text-gray-500">⚪ Disconnected</span>;
			case "error":
				return (
					<span className="text-xs text-red-600">🔴 Connection Error</span>
				);
		}
	};

	return (
		<div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 space-y-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<h3 className="text-lg font-semibold text-gray-900">
					Evaluation Progress
				</h3>
				<div className="flex items-center gap-3">
					{getSSEStatusIndicator()}
					{getStatusBadge()}
				</div>
			</div>

			{/* Progress bars */}
			{progress && status === "running" && (
				<div className="space-y-4">
					{/* Files progress */}
					<div>
						<div className="flex justify-between items-center mb-2">
							<span className="text-sm font-medium text-gray-700">Files</span>
							<span className="text-sm text-gray-600">
								{progress.completedFiles} / {progress.totalFiles} (
								{filesPercent}%)
							</span>
						</div>
						<div className="w-full bg-gray-200 rounded-full h-2.5">
							<div
								className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
								style={{ width: `${filesPercent}%` }}
							/>
						</div>
						{progress.currentFile && (
							<p
								className="mt-1 text-xs text-gray-500 truncate"
								title={progress.currentFile}
							>
								Current: {progress.currentFile}
							</p>
						)}
					</div>

					{/* Evaluators progress */}
					<div>
						<div className="flex justify-between items-center mb-2">
							<span className="text-sm font-medium text-gray-700">
								Evaluators
							</span>
							<span className="text-sm text-gray-600">
								{progress.completedEvaluators} / {progress.totalEvaluators} (
								{evaluatorsPercent}%)
							</span>
						</div>
						<div className="w-full bg-gray-200 rounded-full h-2.5">
							<div
								className="bg-green-600 h-2.5 rounded-full transition-all duration-300"
								style={{ width: `${evaluatorsPercent}%` }}
							/>
						</div>
						{progress.currentEvaluator && (
							<p className="mt-1 text-xs text-gray-500">
								Current: {progress.currentEvaluator}
							</p>
						)}
					</div>
				</div>
			)}

			{/* Queued state */}
			{status === "queued" && (
				<div className="flex items-center justify-center py-8 text-gray-500">
					<div className="text-center">
						<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-3" />
						<p className="text-sm">Waiting for available worker...</p>
					</div>
				</div>
			)}

			{/* Completed state */}
			{status === "completed" && (
				<div className="flex items-center justify-center py-8 text-green-600">
					<div className="text-center">
						<div className="text-5xl mb-3">✅</div>
						<p className="text-sm font-medium">
							Evaluation completed successfully!
						</p>
					</div>
				</div>
			)}

			{/* Failed state */}
			{status === "failed" && error && (
				<div className="bg-red-50 border border-red-200 rounded-lg p-4">
					<div className="flex items-start">
						<span className="text-2xl mr-3">❌</span>
						<div className="flex-1">
							<h4 className="text-sm font-semibold text-red-800 mb-1">
								Evaluation Failed
							</h4>
							<p className="text-sm text-red-700">{error.message}</p>
							{error.code && (
								<p className="text-xs text-red-600 mt-1">
									Error code: {error.code}
								</p>
							)}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
