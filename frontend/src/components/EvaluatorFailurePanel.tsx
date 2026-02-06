import { useState } from "react";

interface StructuredError {
	message: string;
	category: string;
	severity: string;
	evaluatorName?: string;
	filePath?: string;
	timestamp: Date;
	retryable: boolean;
	technicalDetails?: string;
}

interface EvaluatorFailurePanelProps {
	failures: Array<{
		evaluatorName: string;
		error: StructuredError;
		filePath?: string;
	}>;
}

export function EvaluatorFailurePanel({
	failures,
}: EvaluatorFailurePanelProps) {
	const [expandedFailures, setExpandedFailures] = useState<Set<number>>(
		new Set(),
	);

	const toggleExpanded = (index: number) => {
		const newExpanded = new Set(expandedFailures);
		if (newExpanded.has(index)) {
			newExpanded.delete(index);
		} else {
			newExpanded.add(index);
		}
		setExpandedFailures(newExpanded);
	};

	if (failures.length === 0) {
		return null;
	}

	return (
		<div className="mb-6 rounded-lg border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-orange-500/5 p-6">
			<div className="flex items-start gap-3">
				<svg
					className="mt-1 h-6 w-6 flex-shrink-0 text-amber-500"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<title>Warning icon</title>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/>
				</svg>

				<div className="flex-1">
					<h3 className="text-lg font-semibold text-slate-200 mb-2">
						Partial Evaluation Failure
					</h3>

					<p className="text-sm text-slate-300 mb-4">
						{failures.length} evaluator(s) encountered errors during execution.
						The results below may be incomplete. Issues from failed evaluators
						are not included.
					</p>

					<div className="space-y-3">
						{failures.map((failure, index) => {
							const isExpanded = expandedFailures.has(index);

							return (
								<div
									key={index}
									className="rounded-md bg-slate-800/50 border border-amber-500/20 p-3"
								>
									<div className="flex items-start justify-between gap-3">
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2 flex-wrap">
												<span className="font-medium text-slate-200">
													{failure.evaluatorName}
												</span>
												<span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
													{failure.error.category}
												</span>
												{failure.filePath && (
													<span className="text-xs text-slate-400 truncate">
														{failure.filePath}
													</span>
												)}
											</div>

											<p className="mt-1 text-sm text-slate-300">
												{failure.error.message}
											</p>

											{isExpanded && failure.error.technicalDetails && (
												<div className="mt-3 p-3 rounded bg-slate-900/50 border border-slate-700">
													<p className="text-xs font-mono text-slate-400 whitespace-pre-wrap overflow-x-auto">
														{failure.error.technicalDetails}
													</p>
												</div>
											)}
										</div>

										{failure.error.technicalDetails && (
											<button
												type="button"
												onClick={() => toggleExpanded(index)}
												className="flex-shrink-0 text-xs px-2 py-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
											>
												{isExpanded ? "Hide Details" : "Show Details"}
											</button>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
}
