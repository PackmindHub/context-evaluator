import React from "react";
import { useNavigate } from "react-router-dom";
import { useFeatureFlags } from "../contexts/FeatureFlagContext";
import { useActiveJobs } from "../hooks/useActiveJobs";
import { useEvaluationHistory } from "../hooks/useEvaluationHistory";
import { useVersion } from "../hooks/useVersion";
import {
	extractRepoName,
	formatDuration,
	formatRelativeDate,
	getGradeBadgeClass,
} from "../lib/formatters";
import type { IEvaluationHistoryItem } from "../types/evaluation";
import { ActiveJobCard } from "./ActiveJobCard";
import { AppHeader } from "./AppHeader";

export function RecentEvaluationsPage() {
	const navigate = useNavigate();
	const { cloudMode } = useFeatureFlags();
	const { version } = useVersion();
	const {
		history,
		isLoading: isLoadingHistory,
		deleteEvaluation,
		clearAllEvaluations,
		refresh: refreshHistory,
	} = useEvaluationHistory();
	const {
		activeJobs,
		isLoading: isLoadingActive,
		refresh: refreshActive,
	} = useActiveJobs();
	const [searchQuery, setSearchQuery] = React.useState("");
	const [sortField, setSortField] = React.useState<
		"date" | "name" | "grade" | "errors"
	>("date");
	const [sortDirection, setSortDirection] = React.useState<"asc" | "desc">(
		"desc",
	);

	// Combined loading state
	const isLoading = isLoadingHistory || isLoadingActive;

	// Combined refresh function
	const refresh = async () => {
		await Promise.all([refreshHistory(), refreshActive()]);
	};

	// Filter history based on search query
	const filteredHistory = history.filter((item) => {
		if (!searchQuery.trim()) return true;
		const repoName = extractRepoName(item.repositoryUrl).toLowerCase();
		return repoName.includes(searchQuery.toLowerCase());
	});

	const handleSort = (field: "date" | "name" | "grade" | "errors") => {
		if (sortField === field) {
			setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
		} else {
			setSortField(field);
			const defaults: Record<string, "asc" | "desc"> = {
				date: "desc",
				name: "asc",
				grade: "desc",
				errors: "desc",
			};
			setSortDirection(defaults[field]);
		}
	};

	const sortedHistory = React.useMemo(() => {
		const sorted = [...filteredHistory].sort((a, b) => {
			const dir = sortDirection === "asc" ? 1 : -1;

			if (sortField === "date") {
				return (
					dir *
					(new Date(a.completedAt).getTime() -
						new Date(b.completedAt).getTime())
				);
			}

			if (sortField === "name") {
				const nameA = extractRepoName(a.repositoryUrl).toLowerCase();
				const nameB = extractRepoName(b.repositoryUrl).toLowerCase();
				const cmp = nameA.localeCompare(nameB);
				if (cmp !== 0) return dir * cmp;
				// Secondary sort: newest first
				return (
					new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
				);
			}

			if (sortField === "grade") {
				// Failed evaluations and null scores always sort last
				const scoreA =
					a.status === "failed" || a.contextScore == null
						? null
						: a.contextScore;
				const scoreB =
					b.status === "failed" || b.contextScore == null
						? null
						: b.contextScore;
				if (scoreA == null && scoreB == null)
					return (
						new Date(b.completedAt).getTime() -
						new Date(a.completedAt).getTime()
					);
				if (scoreA == null) return 1;
				if (scoreB == null) return -1;
				const cmp = scoreA - scoreB;
				if (cmp !== 0) return dir * cmp;
				return (
					new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
				);
			}

			// errors
			const isFailed = (item: IEvaluationHistoryItem) =>
				item.status === "failed";
			if (isFailed(a) && isFailed(b))
				return (
					new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
				);
			if (isFailed(a)) return 1;
			if (isFailed(b)) return -1;
			const cmp = a.totalIssues - b.totalIssues;
			if (cmp !== 0) return dir * cmp;
			return (
				new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
			);
		});
		return sorted;
	}, [filteredHistory, sortField, sortDirection]);

	const handleSelect = (item: IEvaluationHistoryItem) => {
		if (item.status === "completed") {
			navigate(`/evaluation/${item.id}?tab=summary`);
		}
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 animate-fade-in">
			{/* Header */}
			<AppHeader
				currentPage="recent"
				logoNavigatesHome={true}
				historyCount={history.length}
			/>

			{/* Main Content */}
			<main className="max-w-[1400px] mx-auto px-6 py-6">
				<div className="glass-card">
					{/* Header */}
					<div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
						<div className="flex items-center gap-3">
							<svg
								className="w-6 h-6 text-slate-300"
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
							<h2 className="text-xl font-semibold text-slate-100">
								Latest Evaluations
							</h2>
							{history.length > 0 && (
								<span className="bg-indigo-600 text-white text-sm font-medium px-2.5 py-0.5 rounded-full">
									{history.length}
								</span>
							)}
						</div>
						<div className="flex items-center gap-3">
							{/* Search input */}
							{history.length > 0 && (
								<div className="flex items-center bg-slate-700/50 border border-slate-600 rounded-lg focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent">
									<svg
										className="w-4 h-4 text-slate-400 ml-3 flex-shrink-0"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
										/>
									</svg>
									<input
										type="text"
										placeholder="Search repositories..."
										value={searchQuery}
										onChange={(e) => setSearchQuery(e.target.value)}
										className="pl-2 pr-3 py-1.5 bg-transparent text-sm text-slate-200 placeholder-slate-500 focus:outline-none w-56"
									/>
								</div>
							)}
							{/* Sort controls */}
							{history.length > 0 && (
								<div className="flex items-center gap-1">
									{(
										[
											{ field: "date", label: "Date" },
											{ field: "name", label: "Name" },
											{ field: "grade", label: "Grade" },
											{ field: "errors", label: "Errors" },
										] as const
									).map(({ field, label }) => (
										<button
											key={field}
											onClick={() => handleSort(field)}
											className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
												sortField === field
													? "bg-indigo-600/80 text-white"
													: "text-slate-400 hover:text-slate-200 hover:bg-slate-700"
											}`}
										>
											{label}
											{sortField === field && (
												<span className="ml-1">
													{sortDirection === "asc" ? "↑" : "↓"}
												</span>
											)}
										</button>
									))}
								</div>
							)}
							{!cloudMode && history.length > 0 && (
								<button
									onClick={() => {
										if (
											confirm(
												`Delete all ${history.length} evaluation${history.length > 1 ? "s" : ""} from history?`,
											)
										) {
											clearAllEvaluations();
										}
									}}
									className="px-3 py-1.5 text-sm text-slate-400 hover:text-red-300 hover:bg-slate-700 rounded-lg transition-colors"
								>
									Clear All
								</button>
							)}
							<button
								onClick={refresh}
								className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
								title="Refresh"
							>
								<svg
									className={`w-5 h-5 ${isLoading ? "animate-spin" : ""}`}
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
							</button>
						</div>
					</div>

					{/* Content */}
					<div className="min-h-[400px]">
						{/* In Progress Section */}
						{activeJobs.length > 0 && (
							<div className="border-b border-slate-700/50">
								{/* Section header */}
								<div className="flex items-center gap-3 px-6 py-3 bg-slate-800/50">
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
											d="M13 10V3L4 14h7v7l9-11h-7z"
										/>
									</svg>
									<span className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
										In Progress
									</span>
									<span className="bg-indigo-600 text-white text-xs font-medium px-2 py-0.5 rounded-full">
										{activeJobs.length}
									</span>
								</div>
								{/* Active job list */}
								<div className="divide-y divide-slate-700/30">
									{activeJobs.map((job) => (
										<ActiveJobCard
											key={job.jobId}
											jobId={job.jobId}
											status={job.status}
											repositoryUrl={job.repositoryUrl}
											createdAt={job.createdAt}
											startedAt={job.startedAt}
											progress={job.progress}
										/>
									))}
								</div>
							</div>
						)}

						{/* Loading state */}
						{isLoading && history.length === 0 && activeJobs.length === 0 ? (
							<div className="flex items-center justify-center py-16 text-slate-400">
								<svg
									className="w-6 h-6 animate-spin mr-3"
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
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
									/>
								</svg>
								Loading evaluations...
							</div>
						) : history.length === 0 && activeJobs.length === 0 ? (
							<div className="py-16 text-center text-slate-400">
								<svg
									className="w-16 h-16 mx-auto mb-4 opacity-50"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
										d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
									/>
								</svg>
								<p className="text-lg">No evaluations yet</p>
								<p className="text-sm mt-2 text-slate-500">
									Run an evaluation to see it here
								</p>
								<button
									onClick={() => navigate("/")}
									className="btn-primary mt-6 px-6 py-2"
								>
									Start New Evaluation
								</button>
							</div>
						) : sortedHistory.length === 0 && searchQuery ? (
							<div className="py-16 text-center text-slate-400">
								<svg
									className="w-16 h-16 mx-auto mb-4 opacity-50"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
										d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
									/>
								</svg>
								<p className="text-lg">No evaluations match "{searchQuery}"</p>
								<p className="text-sm mt-2 text-slate-500">
									Try a different search term
								</p>
								<button
									onClick={() => setSearchQuery("")}
									className="mt-4 px-4 py-2 text-sm text-slate-300 hover:text-slate-100 hover:bg-slate-700 rounded-lg transition-colors"
								>
									Clear search
								</button>
							</div>
						) : (
							<>
								{/* History section header - only show when there are active jobs */}
								{activeJobs.length > 0 && sortedHistory.length > 0 && (
									<div className="flex items-center gap-3 px-6 py-3 bg-slate-800/30 border-b border-slate-700/50">
										<svg
											className="w-4 h-4 text-slate-400"
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
										<span className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
											History
										</span>
									</div>
								)}
								<ul className="divide-y divide-slate-700/50">
									{sortedHistory.map((item) => (
										<li key={item.id}>
											<div
												role="button"
												tabIndex={0}
												onClick={() => handleSelect(item)}
												onKeyDown={(e) => {
													if (e.key === "Enter" || e.key === " ") {
														e.preventDefault();
														handleSelect(item);
													}
												}}
												className="w-full px-6 py-4 text-left hover:bg-slate-700/30 transition-colors group cursor-pointer"
											>
												<div className="flex items-center justify-between gap-4">
													{/* Left side: Status + Repo name */}
													<div className="flex-1 min-w-0">
														<div className="flex items-center gap-3">
															{/* Status indicator */}
															{item.status === "completed" ? (
																<span
																	className="w-3 h-3 bg-green-500 rounded-full flex-shrink-0"
																	title="Completed"
																/>
															) : (
																<span
																	className="w-3 h-3 bg-red-500 rounded-full flex-shrink-0"
																	title="Failed"
																/>
															)}
															{/* Repo name */}
															<span className="text-lg font-medium text-slate-100 truncate">
																{extractRepoName(item.repositoryUrl)}
															</span>
														</div>

														{/* Metadata row */}
														<div className="flex items-center gap-4 mt-2 text-sm text-slate-400">
															<span>
																{formatRelativeDate(item.completedAt)}
															</span>
															{item.status === "completed" && (
																<>
																	<span className="text-slate-600">|</span>
																	<span>{item.totalFiles} files</span>
																	<span className="text-slate-600">|</span>
																	<span>
																		{formatDuration(item.totalDurationMs)}
																	</span>
																</>
															)}
														</div>
													</div>

													{/* Right side: Issue counts or error */}
													<div className="flex items-center gap-4">
														{item.status === "completed" ? (
															<div className="flex items-center gap-2">
																{/* Context Score Badge */}
																{item.contextScore != null &&
																	item.contextGrade && (
																		<span
																			className={`px-2 py-1 text-sm font-medium rounded-lg ${getGradeBadgeClass(item.contextGrade)}`}
																			title={`Context Score: ${item.contextScore.toFixed(1)}/10`}
																		>
																			{item.contextScore.toFixed(1)}{" "}
																			{item.contextGrade}
																		</span>
																	)}
																{/* Imported Badge */}
																{item.isImported && (
																	<span className="px-2 py-1 text-sm font-medium bg-slate-700/50 text-slate-300 border border-slate-600/50 rounded-lg">
																		Imported
																	</span>
																)}
																{/* Failed Evaluators Badge */}
																{item.failedEvaluatorCount > 0 && (
																	<span
																		className="px-2 py-1 text-sm font-medium bg-amber-900/50 text-amber-300 border border-amber-700/50 rounded-lg flex items-center gap-1.5"
																		title={`${item.failedEvaluatorCount} evaluator${item.failedEvaluatorCount > 1 ? "s" : ""} failed during evaluation`}
																	>
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
																				d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
																			/>
																		</svg>
																		{item.failedEvaluatorCount} failed
																	</span>
																)}
																{item.highCount > 0 && (
																	<span className="px-2 py-1 text-sm font-medium bg-orange-900/50 text-orange-300 rounded-lg">
																		{item.highCount} high
																	</span>
																)}
																{item.mediumCount > 0 && (
																	<span className="px-2 py-1 text-sm font-medium bg-yellow-900/50 text-yellow-300 rounded-lg">
																		{item.mediumCount} medium
																	</span>
																)}
																{item.totalIssues === 0 &&
																	item.contextScore == null && (
																		<span className="text-sm text-green-400">
																			No issues found
																		</span>
																	)}
															</div>
														) : (
															<span className="text-sm text-red-400 truncate max-w-[200px]">
																{item.errorMessage || "Failed"}
															</span>
														)}

														{/* Delete button (only in non-cloud mode) */}
														{!cloudMode && (
															<button
																onClick={(e) => {
																	e.stopPropagation();
																	if (
																		confirm(
																			"Delete this evaluation from history?",
																		)
																	) {
																		deleteEvaluation(item.id);
																	}
																}}
																className="opacity-0 group-hover:opacity-100 p-2 text-slate-500 hover:text-red-400 hover:bg-slate-600/50 rounded-lg transition-all"
																title="Delete"
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
																		d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
																	/>
																</svg>
															</button>
														)}
													</div>
												</div>
											</div>
										</li>
									))}
								</ul>
							</>
						)}
					</div>
				</div>
			</main>

			{/* Footer */}
			<footer className="bg-slate-800 border-t border-slate-700 mt-20">
				<div className="max-w-[1400px] mx-auto px-6 py-12">
					<div className="flex flex-col md:flex-row items-center justify-between gap-6">
						<div className="flex items-center gap-3">
							<div>
								<p className="text-sm font-semibold text-slate-50">
									context-evaluator
								</p>
								<p className="text-xs text-slate-400">v{version}</p>
							</div>
						</div>
						<div className="flex flex-wrap items-center justify-center gap-8 text-sm text-slate-300">
							<a
								href="https://packmind.com?utm_source=context-evaluator"
								target="_blank"
								rel="noopener noreferrer"
								className="hover:text-slate-100 transition-colors font-medium text-slate-200"
							>
								Powered by Packmind
							</a>
						</div>
					</div>
				</div>
			</footer>
		</div>
	);
}
