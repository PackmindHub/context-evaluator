import React from "react";
import { useEvaluationHistory } from "../hooks/useEvaluationHistory";
import { AppHeader } from "./AppHeader";

export const HowItWorksPage: React.FC = () => {
	const { history } = useEvaluationHistory();

	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100">
			<AppHeader currentPage="how-it-works" historyCount={history.length} />
			<div className="max-w-4xl mx-auto px-6 py-8">
				{/* Header */}
				<div className="mb-12">
					<h1 className="text-title mb-2">How It Works</h1>
					<p className="text-body-muted">
						From repository analysis to actionable recommendations — and
						automatic fixes
					</p>
				</div>

				{/* Workflow Steps */}
				<div className="space-y-8">
					{/* Step 1: Context Generation */}
					<div className="card">
						<div className="flex items-start gap-4">
							<div className="flex-shrink-0">
								<div className="w-12 h-12 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
									<svg
										className="w-6 h-6 text-indigo-400"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
										/>
									</svg>
								</div>
							</div>
							<div className="flex-1">
								<div className="flex items-center gap-2 mb-2">
									<span className="badge bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
										Step 1
									</span>
									<h2 className="text-heading">Repository Analysis</h2>
								</div>
								<p className="text-body mb-3">
									Your repository is analyzed to generate comprehensive context
									about the codebase.
								</p>
								<div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
									<p className="text-body-muted text-sm mb-2">
										What's detected:
									</p>
									<ul className="space-y-1 text-body text-sm">
										<li className="flex items-baseline gap-2">
											<span className="text-indigo-400">•</span>
											<span>
												Programming languages and their distribution (lines of
												code)
											</span>
										</li>
										<li className="flex items-baseline gap-2">
											<span className="text-indigo-400">•</span>
											<span>Project structure and directory organization</span>
										</li>
										<li className="flex items-baseline gap-2">
											<span className="text-indigo-400">•</span>
											<span>
												Frameworks, libraries, and architectural patterns
											</span>
										</li>
										<li className="flex items-baseline gap-2">
											<span className="text-indigo-400">•</span>
											<span>Configuration files and build tools</span>
										</li>
									</ul>
								</div>
							</div>
						</div>
					</div>

					{/* Step 2: Evaluation */}
					<div className="card">
						<div className="flex items-start gap-4">
							<div className="flex-shrink-0">
								<div className="w-12 h-12 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
									<svg
										className="w-6 h-6 text-indigo-400"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
										/>
									</svg>
								</div>
							</div>
							<div className="flex-1">
								<div className="flex items-center gap-2 mb-2">
									<span className="badge bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
										Step 2
									</span>
									<h2 className="text-heading">AI Agent Evaluation</h2>
								</div>
								<p className="text-body mb-3">
									An AI agent runs locally on the cloned repository, executing
									17 specialized evaluators in CLI mode.
								</p>
								<div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 space-y-3">
									<div>
										<p className="text-body-muted text-sm mb-2">
											What's evaluated:
										</p>
										<ul className="space-y-1 text-body text-sm">
											<li className="flex items-baseline gap-2">
												<span className="text-indigo-400">•</span>
												<span>
													<strong>13 error evaluators</strong> identify issues
													with existing documentation
												</span>
											</li>
											<li className="flex items-baseline gap-2">
												<span className="text-indigo-400">•</span>
												<span>
													<strong>4 suggestion evaluators</strong> discover
													opportunities for improvement
												</span>
											</li>
										</ul>
									</div>
									<div className="border-t border-slate-700 pt-3">
										<a
											href="/evaluators"
											className="text-sm text-indigo-400 hover:text-purple-300 transition-colors inline-flex items-center gap-1"
										>
											View all 17 evaluators
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
													d="M9 5l7 7-7 7"
												/>
											</svg>
										</a>
									</div>
								</div>
							</div>
						</div>
					</div>

					{/* Step 3: Curation */}
					<div className="card">
						<div className="flex items-start gap-4">
							<div className="flex-shrink-0">
								<div className="w-12 h-12 rounded-lg bg-green-500/20 border border-green-500/30 flex items-center justify-center">
									<svg
										className="w-6 h-6 text-green-400"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4"
										/>
									</svg>
								</div>
							</div>
							<div className="flex-1">
								<div className="flex items-center gap-2 mb-2">
									<span className="badge bg-green-500/20 text-green-400 border border-green-500/30">
										Step 3
									</span>
									<h2 className="text-heading">
										Smart Sorting & Deduplication
									</h2>
								</div>
								<p className="text-body mb-3">
									Findings are intelligently processed to provide the most
									valuable insights.
								</p>
								<div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
									<p className="text-body-muted text-sm mb-2">
										Processing steps:
									</p>
									<ul className="space-y-1 text-body text-sm">
										<li className="flex items-baseline gap-2">
											<span className="text-green-400">•</span>
											<span>
												Duplicate issues are identified and removed using
												semantic analysis
											</span>
										</li>
										<li className="flex items-baseline gap-2">
											<span className="text-green-400">•</span>
											<span>
												Issues are ranked by impact using AI-powered curation
											</span>
										</li>
										<li className="flex items-baseline gap-2">
											<span className="text-green-400">•</span>
											<span>
												Severity levels are assigned (High, Medium, Low)
											</span>
										</li>
										<li className="flex items-baseline gap-2">
											<span className="text-green-400">•</span>
											<span>
												Cross-file issues are detected when documentation
												conflicts
											</span>
										</li>
									</ul>
								</div>
							</div>
						</div>
					</div>

					{/* Step 4: Results */}
					<div className="card">
						<div className="flex items-start gap-4">
							<div className="flex-shrink-0">
								<div className="w-12 h-12 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
									<svg
										className="w-6 h-6 text-amber-400"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
								</div>
							</div>
							<div className="flex-1">
								<div className="flex items-center gap-2 mb-2">
									<span className="badge bg-amber-500/20 text-amber-400 border border-amber-500/30">
										Step 4
									</span>
									<h2 className="text-heading">Actionable Results</h2>
								</div>
								<p className="text-body mb-3">
									Results are presented with clear priorities and
									recommendations for improvement.
								</p>
								<div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
									<p className="text-body-muted text-sm mb-2">What you get:</p>
									<ul className="space-y-1 text-body text-sm">
										<li className="flex items-baseline gap-2">
											<span className="text-amber-400">•</span>
											<span>
												Organized issues grouped by file and evaluator
											</span>
										</li>
										<li className="flex items-baseline gap-2">
											<span className="text-amber-400">•</span>
											<span>
												Context score and quality grade for your documentation
											</span>
										</li>
										<li className="flex items-baseline gap-2">
											<span className="text-amber-400">•</span>
											<span>
												Specific recommendations with file locations and line
												numbers
											</span>
										</li>
										<li className="flex items-baseline gap-2">
											<span className="text-amber-400">•</span>
											<span>
												Filtering and search capabilities to focus on what
												matters
											</span>
										</li>
									</ul>
								</div>
							</div>
						</div>
					</div>

					{/* Step 5: Remediation */}
					<div className="card">
						<div className="flex items-start gap-4">
							<div className="flex-shrink-0">
								<div className="w-12 h-12 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
									<svg
										className="w-6 h-6 text-purple-400"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
										/>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
										/>
									</svg>
								</div>
							</div>
							<div className="flex-1">
								<div className="flex items-center gap-2 mb-2">
									<span className="badge bg-purple-500/20 text-purple-400 border border-purple-500/30">
										Step 5
									</span>
									<h2 className="text-heading">Automatic Remediation</h2>
								</div>
								<p className="text-body mb-3">
									Select the issues you want to fix and let an AI agent update
									your documentation automatically.
								</p>
								<div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
									<p className="text-body-muted text-sm mb-2">
										How to remediate:
									</p>
									<ul className="space-y-1 text-body text-sm">
										<li className="flex items-baseline gap-2">
											<span className="text-purple-400">•</span>
											<span>
												Select issues using the + button on issue cards
											</span>
										</li>
										<li className="flex items-baseline gap-2">
											<span className="text-purple-400">•</span>
											<span>
												Choose your target file (AGENTS.md or CLAUDE.md) and AI
												provider
											</span>
										</li>
										<li className="flex items-baseline gap-2">
											<span className="text-purple-400">•</span>
											<span>
												Execute — errors are fixed first by severity, then
												suggestions are added
											</span>
										</li>
										<li className="flex items-baseline gap-2">
											<span className="text-purple-400">•</span>
											<span>
												Review per-file diffs and download a .patch file
											</span>
										</li>
									</ul>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};
