import React from "react";
import type { Issue } from "../types/evaluation";
import { IssueCard } from "./IssueCard";

interface IssuesListProps {
	issues: Issue[];
	groupedByEvaluator?: Record<string, Issue[]>;
	title?: string;
}

export const IssuesList: React.FC<IssuesListProps> = ({
	issues,
	groupedByEvaluator,
	title = "Issues",
}) => {
	if (issues.length === 0) {
		return (
			<div className="card text-center py-12">
				<svg
					className="mx-auto h-12 w-12 text-slate-500 mb-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<h3 className="text-lg font-medium text-slate-100 mb-2">
					No Issues Found
				</h3>
				<p className="text-slate-300">
					All checks passed or no issues match your current filters.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="text-2xl font-bold text-slate-100">{title}</h2>
				<span className="text-sm text-slate-300">
					{issues.length} {issues.length === 1 ? "issue" : "issues"}
				</span>
			</div>

			{/* Grouped by evaluator */}
			{groupedByEvaluator ? (
				<div className="space-y-8">
					{Object.entries(groupedByEvaluator).map(([evaluator, evalIssues]) => (
						<div key={evaluator}>
							<div className="mb-4 flex items-center">
								<h3 className="text-lg font-semibold text-slate-100 font-mono">
									{evaluator}
								</h3>
								<span className="ml-3 badge bg-blue-900/40 text-blue-300">
									{evalIssues.length}{" "}
									{evalIssues.length === 1 ? "issue" : "issues"}
								</span>
							</div>
							<div className="space-y-4">
								{evalIssues.map((issue, idx) => (
									<IssueCard
										key={idx}
										issue={issue}
										evaluatorName={evaluator}
									/>
								))}
							</div>
						</div>
					))}
				</div>
			) : (
				/* Flat list */
				<div className="space-y-4">
					{issues.map((issue, idx) => (
						<IssueCard key={idx} issue={issue} />
					))}
				</div>
			)}
		</div>
	);
};
