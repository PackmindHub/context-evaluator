import React from "react";

interface EmptyStateProps {
	onExampleLoad?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onExampleLoad }) => {
	return (
		<div className="flex flex-col items-center justify-center min-h-[60vh] px-4 animate-fade-in">
			<div className="text-center max-w-2xl">
				{/* Icon with gradient background */}
				<div className="mb-8 relative">
					<div className="absolute inset-0 bg-gradient-to-r from-blue-500/30 to-indigo-500/30 blur-3xl rounded-full"></div>
					<div className="relative bg-gradient-to-br from-blue-900/50 to-indigo-900/50 w-32 h-32 rounded-2xl mx-auto flex items-center justify-center shadow-soft">
						<svg
							className="h-16 w-16 text-blue-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={1.5}
								d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
							/>
						</svg>
					</div>
				</div>

				{/* Content */}
				<h2 className="text-3xl font-bold text-slate-100 mb-3">
					Ready to analyze your codebase
				</h2>
				<p className="text-lg text-slate-300 mb-3">
					Upload your evaluation results to get started with powerful insights
				</p>
				<p className="text-sm text-slate-400 mb-8">
					Drop your{" "}
					<code className="px-2.5 py-1 bg-slate-700/80 border border-slate-600 rounded-md text-sm font-mono text-slate-200">
						evaluator-results.json
					</code>{" "}
					file above to view detailed analysis
				</p>

				{/* Features grid */}
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12 text-left">
					<div className="card card-hover">
						<div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mb-3">
							<svg
								className="w-5 h-5 text-white"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
								/>
							</svg>
						</div>
						<h3 className="font-semibold text-slate-100 mb-1">
							Comprehensive Analysis
						</h3>
						<p className="text-sm text-slate-300">
							Deep insights into your AGENTS.md structure and quality
						</p>
					</div>

					<div className="card card-hover">
						<div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center mb-3">
							<svg
								className="w-5 h-5 text-white"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
								/>
							</svg>
						</div>
						<h3 className="font-semibold text-slate-100 mb-1">
							Smart Filtering
						</h3>
						<p className="text-sm text-slate-300">
							Filter by severity, category, and evaluator type
						</p>
					</div>

					<div className="card card-hover">
						<div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-violet-600 rounded-lg flex items-center justify-center mb-3">
							<svg
								className="w-5 h-5 text-white"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M13 10V3L4 14h7v7l9-11h-7z"
								/>
							</svg>
						</div>
						<h3 className="font-semibold text-slate-100 mb-1">
							Lightning Fast
						</h3>
						<p className="text-sm text-slate-300">
							Instant loading and real-time filtering
						</p>
					</div>
				</div>

				{onExampleLoad && (
					<button onClick={onExampleLoad} className="btn-primary mt-8">
						Load example results →
					</button>
				)}
			</div>
		</div>
	);
};
