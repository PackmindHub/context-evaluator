import React from "react";
import { generateIssueHash } from "../lib/issue-hash";
import { generateIssueKey } from "../lib/issue-utils";
import type { CategoryGroup, Issue } from "../types/evaluation";
import { IssueCard } from "./IssueCard";

/** Find an issue's key by reference equality in the pre-built issueKeyMap (uses global allIssues indices). */
function findIssueKey(
	issue: Issue,
	issueKeyMap?: Map<string, Issue>,
): string | null {
	if (!issueKeyMap) return null;
	for (const [key, mappedIssue] of issueKeyMap) {
		if (mappedIssue === issue) return key;
	}
	return null;
}

interface IssuesListProps {
	issues: Issue[];
	groupedByFile?: Record<string, Issue[]>;
	nestedGrouping?: Record<string, CategoryGroup[]>;
	title?: string;
	emptyStateMessage?: string;
	selectedKeys?: Set<string>;
	issueKeyMap?: Map<string, Issue>;
	onToggleSelection?: (key: string, issue: Issue) => void;
	onSelectAllInGroup?: (issues: Issue[]) => void;
	// Feedback props
	feedbackMap?: Map<string, "like" | "dislike">;
	onFeedback?: (issueHash: string, type: "like" | "dislike" | null) => void;
	// Bookmark props
	bookmarkSet?: Set<string>;
	onBookmarkToggle?: (issueHash: string) => void;
	// Feature flags
	assessmentEnabled?: boolean;
	groupSelectEnabled?: boolean;
	cloudMode?: boolean;
}

export const IssuesList: React.FC<IssuesListProps> = ({
	issues,
	groupedByFile,
	nestedGrouping,
	title = "Issues",
	emptyStateMessage,
	selectedKeys,
	issueKeyMap,
	onToggleSelection,
	onSelectAllInGroup,
	feedbackMap,
	onFeedback,
	bookmarkSet,
	onBookmarkToggle,
	assessmentEnabled = false,
	groupSelectEnabled = false,
	cloudMode = false,
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
					{emptyStateMessage ||
						"All checks passed or no issues match your current filters."}
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

			{/* Nested grouping: File -> Evaluator -> Issues */}
			{nestedGrouping ? (
				<div className="space-y-8">
					{Object.entries(nestedGrouping).map(([file, categoryGroups]) => {
						const isCrossFile = file === "__cross_file__";
						const displayName = isCrossFile ? "Cross-File Issues" : file;

						// Calculate total issues for this file
						const totalIssues = categoryGroups.reduce(
							(sum, group) => sum + group.issues.length,
							0,
						);

						return (
							<div key={file} className="file-section">
								{/* File header */}
								<div className="file-section-header">
									{isCrossFile && (
										<svg
											className="h-5 w-5 text-indigo-400 flex-shrink-0"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
											/>
										</svg>
									)}
									<h3
										className={`text-lg font-semibold text-slate-100 ${isCrossFile ? "" : "font-mono break-all"}`}
									>
										{displayName}
									</h3>
									<span className="ml-auto badge badge-info">
										{totalIssues} {totalIssues === 1 ? "issue" : "issues"}
									</span>
								</div>

								{/* Category groups */}
								<div className="evaluator-groups-container">
									{categoryGroups.map((group) => {
										// Calculate group selection state
										const groupKeys = group.issues.map(
											(issue, idx) =>
												findIssueKey(issue, issueKeyMap) ??
												generateIssueKey(issue, idx),
										);
										const allSelected =
											selectedKeys &&
											groupKeys.every((key) => selectedKeys.has(key));
										const noneSelected =
											selectedKeys &&
											groupKeys.every((key) => !selectedKeys.has(key));

										return (
											<div key={group.categoryName} className="space-y-4">
												{/* Category header */}
												<div className="evaluator-group-header">
													<div
														className={`severity-dot severity-dot-${
															group.maxSeverity >= 7
																? "high"
																: group.maxSeverity >= 5
																	? "medium"
																	: "low"
														}`}
													/>
													<span className="evaluator-group-name">
														{group.categoryName}
													</span>
													<span className="evaluator-group-badge">
														{group.issues.length}{" "}
														{group.issues.length === 1 ? "issue" : "issues"}
													</span>
													{onSelectAllInGroup && groupSelectEnabled && (
														<button
															onClick={() => onSelectAllInGroup(group.issues)}
															className="text-xs px-3 py-1.5 bg-slate-700/60 text-slate-300 border border-slate-600/50 rounded-md hover:bg-slate-700 hover:text-indigo-400 transition-colors"
															aria-label={
																allSelected
																	? "Deselect all in group"
																	: "Select all in group"
															}
														>
															{allSelected
																? "Deselect All"
																: noneSelected
																	? "Select All"
																	: "Select All"}
														</button>
													)}
												</div>

												{/* Issues in this category group */}
												{group.issues.map((issue, idx) => {
													const issueKey =
														findIssueKey(issue, issueKeyMap) ??
														generateIssueKey(issue, idx);
													const isSelected =
														selectedKeys?.has(issueKey) || false;
													const issueHash = generateIssueHash(issue);
													const feedback = feedbackMap?.get(issueHash);
													return (
														<IssueCard
															key={idx}
															issue={issue}
															isSelected={isSelected}
															issueKey={issueKey}
															onToggleSelection={onToggleSelection}
															feedback={feedback}
															onFeedback={(type) =>
																onFeedback?.(issueHash, type)
															}
															isBookmarked={bookmarkSet?.has(issueHash)}
															onBookmarkToggle={() =>
																onBookmarkToggle?.(issueHash)
															}
															assessmentEnabled={assessmentEnabled}
															cloudMode={cloudMode}
														/>
													);
												})}
											</div>
										);
									})}
								</div>
							</div>
						);
					})}
				</div>
			) : /* Grouped by file */
			groupedByFile ? (
				<div className="space-y-8">
					{Object.entries(groupedByFile).map(([file, fileIssues]) => {
						const isCrossFile = file === "__cross_file__";
						const displayName = isCrossFile ? "Cross-File Issues" : file;

						// Calculate group selection state
						const groupKeys = fileIssues.map(
							(issue, idx) =>
								findIssueKey(issue, issueKeyMap) ??
								generateIssueKey(issue, idx),
						);
						const allSelected =
							selectedKeys && groupKeys.every((key) => selectedKeys.has(key));
						const noneSelected =
							selectedKeys && groupKeys.every((key) => !selectedKeys.has(key));

						return (
							<div key={file} className="file-section">
								<div className="mb-4 flex items-center gap-3">
									{isCrossFile && (
										<svg
											className="h-5 w-5 text-indigo-400 flex-shrink-0"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
											/>
										</svg>
									)}
									<h3
										className={`text-lg font-semibold text-slate-100 ${isCrossFile ? "" : "font-mono break-all"}`}
									>
										{displayName}
									</h3>
									<span className="ml-auto badge badge-info">
										{fileIssues.length}{" "}
										{fileIssues.length === 1 ? "issue" : "issues"}
									</span>
									{onSelectAllInGroup && groupSelectEnabled && (
										<button
											onClick={() => onSelectAllInGroup(fileIssues)}
											className="text-xs px-3 py-1.5 bg-slate-700/60 text-slate-300 border border-slate-600/50 rounded-md hover:bg-slate-700 hover:text-indigo-400 transition-colors"
											aria-label={
												allSelected
													? "Deselect all in group"
													: "Select all in group"
											}
										>
											{allSelected
												? "Deselect All"
												: noneSelected
													? "Select All"
													: "Select All"}
										</button>
									)}
								</div>
								<div className="space-y-6">
									{/* Group issues by category within this file */}
									{Object.entries(
										fileIssues.reduce(
											(acc, issue) => {
												const category = issue.category || "Uncategorized";
												if (!acc[category]) acc[category] = [];
												acc[category].push(issue);
												return acc;
											},
											{} as Record<string, Issue[]>,
										),
									).map(([category, categoryIssues]) => (
										<div key={category}>
											{/* Category label - subtle, not a full header */}
											<div className="flex items-center gap-2 mb-3 text-xs text-slate-400 uppercase tracking-wide font-medium">
												<div className="h-px flex-1 bg-slate-700/50" />
												<span>{category}</span>
												<div className="h-px flex-1 bg-slate-700/50" />
											</div>
											<div className="space-y-4">
												{categoryIssues.map((issue, idx) => {
													const issueKey =
														findIssueKey(issue, issueKeyMap) ??
														generateIssueKey(issue, idx);
													const isSelected =
														selectedKeys?.has(issueKey) || false;
													const issueHash = generateIssueHash(issue);
													const feedback = feedbackMap?.get(issueHash);
													return (
														<IssueCard
															key={idx}
															issue={issue}
															isSelected={isSelected}
															issueKey={issueKey}
															onToggleSelection={onToggleSelection}
															feedback={feedback}
															onFeedback={(type) =>
																onFeedback?.(issueHash, type)
															}
															isBookmarked={bookmarkSet?.has(issueHash)}
															onBookmarkToggle={() =>
																onBookmarkToggle?.(issueHash)
															}
															assessmentEnabled={assessmentEnabled}
															cloudMode={cloudMode}
														/>
													);
												})}
											</div>
										</div>
									))}
								</div>
							</div>
						);
					})}
				</div>
			) : (
				/* Flat list */
				<div className="space-y-4">
					{issues.map((issue, idx) => {
						const issueKey =
							findIssueKey(issue, issueKeyMap) ?? generateIssueKey(issue, idx);
						const isSelected = selectedKeys?.has(issueKey) || false;
						const issueHash = generateIssueHash(issue);
						const feedback = feedbackMap?.get(issueHash);
						return (
							<IssueCard
								key={idx}
								issue={issue}
								isSelected={isSelected}
								issueKey={issueKey}
								onToggleSelection={onToggleSelection}
								feedback={feedback}
								onFeedback={(type) => onFeedback?.(issueHash, type)}
								isBookmarked={bookmarkSet?.has(issueHash)}
								onBookmarkToggle={() => onBookmarkToggle?.(issueHash)}
								assessmentEnabled={assessmentEnabled}
								cloudMode={cloudMode}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
};
