/**
 * Progress display during remediation execution.
 */

import { useEffect, useState } from "react";

const STEP_LABELS: Record<string, string> = {
	cloning: "Cloning repository...",
	checking_git: "Checking git status...",
	executing_error_fix: "Fixing errors...",
	executing_suggestion_enrich: "Enriching documentation...",
	capturing_diff: "Capturing changes...",
	resetting: "Resetting working directory...",
};

interface RemediationProgressProps {
	currentStep?: string;
	batchInfo?: { batchNumber: number; totalBatches: number };
	logs: Array<{ timestamp: string; message: string }>;
}

export function RemediationProgress({
	currentStep,
	batchInfo,
	logs,
}: RemediationProgressProps) {
	const [elapsed, setElapsed] = useState(0);

	useEffect(() => {
		const start = Date.now();
		const interval = setInterval(() => {
			setElapsed(Math.floor((Date.now() - start) / 1000));
		}, 1000);
		return () => clearInterval(interval);
	}, []);

	const formatTime = (seconds: number) => {
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return m > 0 ? `${m}m ${s}s` : `${s}s`;
	};

	const baseLabel = currentStep
		? STEP_LABELS[currentStep] || currentStep
		: "Initializing...";
	const stepLabel =
		batchInfo &&
		batchInfo.totalBatches > 1 &&
		(currentStep === "executing_error_fix" ||
			currentStep === "executing_suggestion_enrich")
			? `${baseLabel} (batch ${batchInfo.batchNumber}/${batchInfo.totalBatches})`
			: baseLabel;

	return (
		<div className="card space-y-4">
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
				</div>
			)}
		</div>
	);
}
