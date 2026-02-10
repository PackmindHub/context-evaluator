import { useFeatureFlags } from "../contexts/FeatureFlagContext";
import { useEvaluationHistory } from "../hooks/useEvaluationHistory";
import { useStats } from "../hooks/useStats";
import type { IRepoCostStat } from "../types/evaluation";
import { AppHeader } from "./AppHeader";

function formatRepoName(url: string): string {
	try {
		const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
		if (match) return match[1].replace(/\.git$/, "");
	} catch {
		// fall through
	}
	return url;
}

function formatCost(cost: number): string {
	return `$${cost.toFixed(4)}`;
}

function formatLOC(repo: IRepoCostStat): { value: string; missing: boolean } {
	if (repo.totalLOC == null || repo.totalLOC === 0)
		return { value: "missing", missing: true };
	return { value: repo.totalLOC.toLocaleString(), missing: false };
}

export function StatsPage() {
	const { cloudMode } = useFeatureFlags();
	const { history } = useEvaluationHistory();
	const {
		evaluators,
		totalReposEvaluated,
		topReposByCost,
		costByAgent,
		tokenStats,
		contextIdTokenStats,
		totalEvaluationsForTokens,
		isLoading,
		error,
	} = useStats();

	const showCostSection =
		!cloudMode &&
		!isLoading &&
		!error &&
		totalReposEvaluated > 0 &&
		(topReposByCost.length > 0 || costByAgent.length > 0);

	const showTokenSection =
		!cloudMode &&
		!isLoading &&
		!error &&
		totalEvaluationsForTokens > 0 &&
		(tokenStats.length > 0 || contextIdTokenStats != null);

	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 animate-fade-in">
			<AppHeader currentPage="stats" historyCount={history.length} />

			<main className="max-w-[1400px] mx-auto px-6 py-6">
				{/* Evaluator Stats */}
				<div className="glass-card">
					{/* Header */}
					<div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
						<div className="flex items-center gap-3">
							<svg
								className="w-5 h-5 text-slate-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
								/>
							</svg>
							<h2 className="text-heading">Evaluator Stats</h2>
						</div>
						<span className="text-body-muted">
							{totalReposEvaluated} repositor
							{totalReposEvaluated !== 1 ? "ies" : "y"} evaluated
						</span>
					</div>

					<div className="p-6">
						{/* Loading state */}
						{isLoading && (
							<div className="text-center py-12">
								<div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4" />
								<p className="text-body-muted">Loading stats...</p>
							</div>
						)}

						{/* Error state */}
						{error && (
							<div className="text-center py-12">
								<p className="text-red-400">{error}</p>
							</div>
						)}

						{/* Empty state */}
						{!isLoading && !error && totalReposEvaluated === 0 && (
							<div className="text-center py-12">
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
										d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
									/>
								</svg>
								<p className="text-body-muted">
									No evaluations found. Run an evaluation to see stats here.
								</p>
							</div>
						)}

						{/* Stats table */}
						{!isLoading &&
							!error &&
							evaluators.length > 0 &&
							totalReposEvaluated > 0 && (
								<div className="overflow-x-auto">
									<table className="w-full text-left">
										<thead>
											<tr className="border-b border-slate-700">
												<th className="text-label-upper py-3 px-4">
													Evaluator
												</th>
												<th className="text-label-upper py-3 px-4">Type</th>
												<th className="text-label-upper py-3 px-4 text-right">
													Repos with Issues
												</th>
												<th className="text-label-upper py-3 px-4 text-right">
													Total Issues
												</th>
												<th className="text-label-upper py-3 px-4 text-right">
													Hit Rate
												</th>
											</tr>
										</thead>
										<tbody>
											{evaluators.map((evaluator) => {
												const hitRate =
													totalReposEvaluated > 0
														? (evaluator.repoCount / totalReposEvaluated) * 100
														: 0;

												return (
													<tr
														key={evaluator.evaluatorId}
														className="border-b border-slate-700/50 hover:bg-slate-800/50 transition-colors"
													>
														<td className="py-3 px-4">
															<span className="text-body text-slate-200">
																{evaluator.evaluatorName}
															</span>
														</td>
														<td className="py-3 px-4">
															<span
																className={`badge ${
																	evaluator.issueType === "error"
																		? "severity-badge severity-high"
																		: "severity-badge severity-medium"
																}`}
															>
																{evaluator.issueType}
															</span>
														</td>
														<td className="py-3 px-4 text-right">
															<span className="text-body text-slate-200">
																{evaluator.repoCount}
															</span>
															<span className="text-caption ml-1">
																/ {totalReposEvaluated}
															</span>
														</td>
														<td className="py-3 px-4 text-right text-body text-slate-200">
															{evaluator.totalIssueCount}
														</td>
														<td className="py-3 px-4 text-right">
															<div className="flex items-center justify-end gap-2">
																<div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
																	<div
																		className="h-full bg-indigo-500 rounded-full transition-all"
																		style={{
																			width: `${Math.min(hitRate, 100)}%`,
																		}}
																	/>
																</div>
																<span className="text-body text-slate-200 w-12 text-right">
																	{hitRate.toFixed(0)}%
																</span>
															</div>
														</td>
													</tr>
												);
											})}
										</tbody>
									</table>
								</div>
							)}
					</div>
				</div>

				{/* Token Consumption */}
				{showTokenSection && (
					<div className="glass-card mt-6">
						<div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
							<div className="flex items-center gap-3">
								<svg
									className="w-5 h-5 text-slate-400"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
									/>
								</svg>
								<h2 className="text-heading">Token Consumption</h2>
							</div>
							<span className="text-body-muted">
								Based on {totalEvaluationsForTokens} evaluation
								{totalEvaluationsForTokens !== 1 ? "s" : ""}
							</span>
						</div>

						<div className="p-6 space-y-8">
							{/* Context Identification summary */}
							{contextIdTokenStats && (
								<div>
									<h3 className="text-subheading mb-4">
										Context Identification
									</h3>
									<p className="text-caption mb-3">
										Based on {contextIdTokenStats.sampleCount} evaluation
										{contextIdTokenStats.sampleCount !== 1 ? "s" : ""} with
										token data
									</p>
									<div className="grid grid-cols-3 gap-4">
										<div className="info-section">
											<p className="text-label-upper">Avg Input Tokens</p>
											<p className="text-stat mt-1">
												{contextIdTokenStats.avgInputTokens.toLocaleString()}
											</p>
										</div>
										<div className="info-section">
											<p className="text-label-upper">Avg Output Tokens</p>
											<p className="text-stat mt-1">
												{contextIdTokenStats.avgOutputTokens.toLocaleString()}
											</p>
										</div>
										<div className="info-section">
											<p className="text-label-upper">Avg Cost</p>
											<p className="text-stat mt-1">
												{formatCost(contextIdTokenStats.avgCostUsd)}
											</p>
										</div>
									</div>
								</div>
							)}

							{/* Per-Evaluator table */}
							{tokenStats.length > 0 && (
								<div>
									<h3 className="text-subheading mb-4">Per-Evaluator Usage</h3>
									<div className="overflow-x-auto">
										<table className="w-full text-left">
											<thead>
												<tr className="border-b border-slate-700">
													<th className="text-label-upper py-3 px-4">
														Evaluator
													</th>
													<th className="text-label-upper py-3 px-4 text-right">
														Avg Input Tokens
													</th>
													<th className="text-label-upper py-3 px-4 text-right">
														Avg Output Tokens
													</th>
													<th className="text-label-upper py-3 px-4 text-right">
														Avg Cost
													</th>
													<th className="text-label-upper py-3 px-4 text-right">
														Samples
													</th>
												</tr>
											</thead>
											<tbody>
												{tokenStats.map((stat) => (
													<tr
														key={stat.evaluatorId}
														className="border-b border-slate-700/50 hover:bg-slate-800/50 transition-colors"
													>
														<td className="py-3 px-4">
															<span className="text-body text-slate-200">
																{stat.evaluatorName}
															</span>
														</td>
														<td className="py-3 px-4 text-right text-body text-slate-200">
															{stat.avgInputTokens.toLocaleString()}
														</td>
														<td className="py-3 px-4 text-right text-body text-slate-200">
															{stat.avgOutputTokens.toLocaleString()}
														</td>
														<td className="py-3 px-4 text-right text-body text-slate-200">
															{formatCost(stat.avgCostUsd)}
														</td>
														<td className="py-3 px-4 text-right text-body text-slate-200">
															{stat.sampleCount}
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</div>
							)}
						</div>
					</div>
				)}

				{/* Cost Overview */}
				{showCostSection && (
					<div className="glass-card mt-6">
						<div className="flex items-center gap-3 px-6 py-4 border-b border-slate-700">
							<svg
								className="w-5 h-5 text-slate-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							<h2 className="text-heading">Cost Overview</h2>
						</div>

						<div className="p-6 space-y-8">
							{/* Top Repositories by Cost */}
							{topReposByCost.length > 0 && (
								<div>
									<h3 className="text-subheading mb-4">
										Top {topReposByCost.length} Most Expensive Repositories
									</h3>
									<div className="overflow-x-auto">
										<table className="w-full text-left">
											<thead>
												<tr className="border-b border-slate-700">
													<th className="text-label-upper py-3 px-4">
														Repository
													</th>
													<th className="text-label-upper py-3 px-4 text-right">
														Total Cost
													</th>
													<th className="text-label-upper py-3 px-4 text-right">
														Lines of Code
													</th>
												</tr>
											</thead>
											<tbody>
												{topReposByCost.map((repo) => (
													<tr
														key={repo.repositoryUrl}
														className="border-b border-slate-700/50 hover:bg-slate-800/50 transition-colors"
													>
														<td className="py-3 px-4">
															<span className="text-body text-slate-200">
																{formatRepoName(repo.repositoryUrl)}
															</span>
														</td>
														<td className="py-3 px-4 text-right text-body text-slate-200">
															{formatCost(repo.totalCostUsd)}
														</td>
														<td className="py-3 px-4 text-right text-body">
															{(() => {
																const loc = formatLOC(repo);
																return loc.missing ? (
																	<span className="text-slate-500 italic">
																		{loc.value}
																	</span>
																) : (
																	<span className="text-slate-200">
																		{loc.value}
																	</span>
																);
															})()}
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</div>
							)}

							{/* Cost by Agent */}
							{costByAgent.length > 0 && (
								<div>
									<h3 className="text-subheading mb-4">Cost by AI Agent</h3>
									<div className="overflow-x-auto">
										<table className="w-full text-left">
											<thead>
												<tr className="border-b border-slate-700">
													<th className="text-label-upper py-3 px-4">Agent</th>
													<th className="text-label-upper py-3 px-4 text-right">
														Total Cost
													</th>
												</tr>
											</thead>
											<tbody>
												{costByAgent.map((agent) => (
													<tr
														key={agent.agent}
														className="border-b border-slate-700/50 hover:bg-slate-800/50 transition-colors"
													>
														<td className="py-3 px-4">
															<span className="text-body text-slate-200">
																{agent.agent}
															</span>
														</td>
														<td className="py-3 px-4 text-right text-body text-slate-200">
															{formatCost(agent.totalCostUsd)}
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</div>
							)}
						</div>
					</div>
				)}
			</main>
		</div>
	);
}
