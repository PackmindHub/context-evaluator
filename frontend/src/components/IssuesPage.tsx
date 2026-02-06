import React, { useCallback } from "react";
import {
	useAggregatedIssues,
	type IssuesPageFilters,
} from "../hooks/useAggregatedIssues";
import { useEvaluationHistory } from "../hooks/useEvaluationHistory";
import { extractRepoName, formatRelativeDate } from "../lib/formatters";
import { AppHeader } from "./AppHeader";
import { IssueCard } from "./IssueCard";

const NO_OP_FEEDBACK = () => {};

export function IssuesPage() {
	const { history } = useEvaluationHistory();
	const {
		issues,
		pagination,
		availableFilters,
		isLoading,
		error,
		filters,
		setFilters,
		setPage,
	} = useAggregatedIssues();

	const updateFilter = useCallback(
		(key: keyof IssuesPageFilters, value: string) => {
			setFilters({ ...filters, [key]: value });
		},
		[filters, setFilters],
	);

	const clearFilters = useCallback(() => {
		setFilters({
			evaluator: "",
			severity: "",
			repository: "",
			issueType: "",
			search: "",
		});
	}, [setFilters]);

	const hasActiveFilters =
		filters.evaluator ||
		filters.severity ||
		filters.repository ||
		filters.issueType ||
		filters.search;

	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 animate-fade-in">
			<AppHeader currentPage="issues" historyCount={history.length} />

			<main className="max-w-[1400px] mx-auto px-6 py-6">
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
									d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
								/>
							</svg>
							<h2 className="text-heading">All Issues</h2>
						</div>
						<span className="text-body-muted">
							{pagination.totalItems} total issue
							{pagination.totalItems !== 1 ? "s" : ""}
						</span>
					</div>

					<div className="grid grid-cols-1 lg:grid-cols-5 gap-6 p-6">
						{/* Filters sidebar */}
						<div className="lg:col-span-1 space-y-4">
							<div className="flex items-center justify-between">
								<h3 className="text-card-title">Filters</h3>
								{hasActiveFilters && (
									<button
										onClick={clearFilters}
										className="text-xs text-indigo-400 hover:text-indigo-300"
									>
										Clear all
									</button>
								)}
							</div>

							{/* Search */}
							<div>
								<label className="text-label block mb-1">Search</label>
								<input
									type="text"
									value={filters.search}
									onChange={(e) => updateFilter("search", e.target.value)}
									placeholder="Search issues..."
									className="input-field w-full"
								/>
							</div>

							{/* Repository */}
							<div>
								<label className="text-label block mb-1">Repository</label>
								<select
									value={filters.repository}
									onChange={(e) => updateFilter("repository", e.target.value)}
									className="input-field w-full"
								>
									<option value="">All repositories</option>
									{availableFilters.repositories.map((repo) => (
										<option key={repo} value={repo}>
											{extractRepoName(repo)}
										</option>
									))}
								</select>
							</div>

							{/* Evaluator */}
							<div>
								<label className="text-label block mb-1">Evaluator</label>
								<select
									value={filters.evaluator}
									onChange={(e) => updateFilter("evaluator", e.target.value)}
									className="input-field w-full"
								>
									<option value="">All evaluators</option>
									{availableFilters.evaluators.map((evaluator) => (
										<option key={evaluator} value={evaluator}>
											{evaluator}
										</option>
									))}
								</select>
							</div>

							{/* Severity */}
							<div>
								<label className="text-label block mb-1">Severity</label>
								<select
									value={filters.severity}
									onChange={(e) => updateFilter("severity", e.target.value)}
									className="input-field w-full"
								>
									<option value="">All severities</option>
									<option value="high">High</option>
									<option value="medium">Medium</option>
									<option value="low">Low</option>
								</select>
							</div>

							{/* Issue Type */}
							<div>
								<label className="text-label block mb-1">Issue Type</label>
								<select
									value={filters.issueType}
									onChange={(e) => updateFilter("issueType", e.target.value)}
									className="input-field w-full"
								>
									<option value="">All types</option>
									<option value="error">Errors</option>
									<option value="suggestion">Suggestions</option>
								</select>
							</div>
						</div>

						{/* Issue list */}
						<div className="lg:col-span-4 space-y-3">
							{isLoading && issues.length === 0 && (
								<div className="text-center py-12 text-body-muted">
									Loading issues...
								</div>
							)}

							{error && (
								<div className="text-center py-12 text-red-400">
									Failed to load issues: {error}
								</div>
							)}

							{!isLoading && !error && issues.length === 0 && (
								<div className="text-center py-12">
									<p className="text-body-muted">
										{hasActiveFilters
											? "No issues match the selected filters."
											: "No issues found. Run an evaluation to see results here."}
									</p>
								</div>
							)}

							{issues.map((aggregatedIssue, idx) => (
								<div
									key={`${aggregatedIssue.evaluationId}-${idx}`}
									className="space-y-1"
								>
									{/* Evaluation context */}
									<div className="flex items-center gap-2 text-xs text-slate-400 pl-1">
										<a
											href={`/evaluation/${aggregatedIssue.evaluationId}?tab=errors`}
											className="text-indigo-400 hover:text-indigo-300 hover:underline"
										>
											{extractRepoName(aggregatedIssue.repositoryUrl)}
										</a>
										<span className="text-slate-600">|</span>
										<span>
											{formatRelativeDate(aggregatedIssue.evaluationDate)}
										</span>
										<span className="text-slate-600">|</span>
										<span>{aggregatedIssue.evaluatorName}</span>
									</div>
									<IssueCard
										issue={aggregatedIssue.issue}
										onFeedback={NO_OP_FEEDBACK}
										cloudMode={true}
									/>
								</div>
							))}

							{/* Pagination */}
							{pagination.totalPages > 1 && (
								<div className="flex items-center justify-center gap-3 pt-4">
									<button
										disabled={pagination.page <= 1}
										onClick={() => setPage(pagination.page - 1)}
										className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-40"
									>
										Previous
									</button>
									<span className="text-body-muted text-sm">
										Page {pagination.page} of {pagination.totalPages}
									</span>
									<button
										disabled={pagination.page >= pagination.totalPages}
										onClick={() => setPage(pagination.page + 1)}
										className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-40"
									>
										Next
									</button>
								</div>
							)}
						</div>
					</div>
				</div>
			</main>
		</div>
	);
}
