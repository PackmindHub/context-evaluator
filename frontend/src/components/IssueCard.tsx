import React, { useState } from "react";
import type { ICuratedIssue, Issue } from "../types/evaluation";
import {
	formatLocation,
	getImpactBadgeClass,
	getImpactLabel,
	getIssueSeverity,
	getSeverityColor,
	getSeverityLevel,
} from "../types/evaluation";
import { CodeSnippet, DiffViewer } from "./issues";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { CopyButton } from "./shared";

// Type guard to check if issue is a curated issue
function isCuratedIssue(issue: Issue): issue is ICuratedIssue {
	return "curationReason" in issue;
}

// Check if context contains unified diff content
function isDiffContext(context: string): boolean {
	return context.startsWith("Unified Diff:");
}

interface IssueCardProps {
	issue: Issue | ICuratedIssue;
	isSelected?: boolean;
	issueKey?: string;
	onToggleSelection?: (key: string, issue: Issue) => void;
	// Feedback props
	feedback?: "like" | "dislike";
	onFeedback: (type: "like" | "dislike" | null) => void;
	// Bookmark props
	isBookmarked?: boolean;
	onBookmarkToggle?: () => void;
	// Feature flags
	assessmentEnabled?: boolean;
	cloudMode?: boolean;
}

export const IssueCard: React.FC<IssueCardProps> = ({
	issue,
	isSelected = false,
	issueKey = "",
	onToggleSelection,
	feedback,
	onFeedback,
	isBookmarked = false,
	onBookmarkToggle,
	assessmentEnabled = false,
	cloudMode = false,
}) => {
	const [isExpanded, setIsExpanded] = useState(false);

	// Get numeric severity for styling (works for both error and suggestion issues)
	const numericSeverity = getIssueSeverity(issue);
	const severityLevel = getSeverityLevel(numericSeverity);

	// Prioritize actual issue message over category (evaluator name)
	const title =
		issue.title || issue.problem || issue.description || issue.category;
	const fix = issue.fix || issue.recommendation || issue.suggestion || "";

	// Get frequency badge if curated
	const frequencyBadge =
		isCuratedIssue(issue) && issue.frequencyCategory ? (
			<span className="text-xs px-2.5 py-1 bg-slate-700/60 text-slate-400 border border-slate-600/50 rounded-md whitespace-nowrap">
				{issue.frequencyCategory === "daily"
					? "Daily Impact"
					: issue.frequencyCategory === "weekly"
						? "Weekly Impact"
						: "Monthly Impact"}
			</span>
		) : null;

	return (
		<div
			className={`group relative p-4 rounded-lg border border-slate-700/50 transition-all duration-200 hover:border-slate-600/50 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30 issue-card-severity-border issue-card-severity-${severityLevel} ${
				isSelected ? "issue-card-selected" : ""
			}`}
			style={{
				background: "rgba(30, 41, 59, 0.6)",
				backdropFilter: "blur(8px)",
			}}
		>
			{/* Single-row layout with title and controls */}
			<div className="flex items-center gap-3">
				{/* Severity dot on left */}
				<div
					className={`severity-dot severity-dot-${severityLevel} flex-shrink-0`}
				/>

				{/* Severity/Impact badge - fixed width for alignment */}
				<div className="flex-shrink-0 w-[72px]">
					{issue.issueType === "error" ? (
						<span className={getSeverityColor(issue.severity)}>
							{severityLevel.charAt(0).toUpperCase() + severityLevel.slice(1)}
						</span>
					) : (
						<span className={getImpactBadgeClass(issue.impactLevel)}>
							{getImpactLabel(issue.impactLevel)}
						</span>
					)}
				</div>

				{/* Frequency badge (if curated) */}
				{frequencyBadge}

				{/* Title - fills available space */}
				<div className="flex-1 min-w-0">
					<span className="text-sm font-medium text-slate-200">{title}</span>
				</div>

				{/* Action buttons - show on hover */}
				<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
					{/* Bookmark button */}
					{!cloudMode && onBookmarkToggle && (
						<button
							onClick={(e) => {
								e.stopPropagation();
								onBookmarkToggle();
							}}
							className={`action-btn ${
								isBookmarked
									? "action-btn-bookmark-active"
									: "action-btn-bookmark"
							}`}
							title={isBookmarked ? "Remove bookmark" : "Bookmark this issue"}
						>
							<svg
								className="h-4 w-4"
								fill={isBookmarked ? "currentColor" : "none"}
								stroke="currentColor"
								strokeWidth={isBookmarked ? 0 : 2}
								viewBox="0 0 24 24"
							>
								<path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
							</svg>
						</button>
					)}

					{/* Feedback buttons */}
					{assessmentEnabled && (
						<>
							<button
								onClick={(e) => {
									e.stopPropagation();
									onFeedback(feedback === "like" ? null : "like");
								}}
								className={`action-btn ${
									feedback === "like"
										? "action-btn-like-active"
										: "action-btn-like"
								}`}
								title={feedback === "like" ? "Remove like" : "Like this issue"}
							>
								<svg
									className="h-4 w-4"
									fill="currentColor"
									viewBox="0 0 24 24"
								>
									<path d="M7 22V11M2 13v6a2 2 0 002 2h12.764a2 2 0 001.789-1.106l3.5-7A2 2 0 0020.264 11H16V5a3 3 0 00-3-3v0a3 3 0 00-3 3v6H7a2 2 0 00-2 2z" />
								</svg>
							</button>

							<button
								onClick={(e) => {
									e.stopPropagation();
									onFeedback(feedback === "dislike" ? null : "dislike");
								}}
								className={`action-btn ${
									feedback === "dislike"
										? "action-btn-dislike-active"
										: "action-btn-dislike"
								}`}
								title={
									feedback === "dislike"
										? "Remove dislike"
										: "Dislike this issue"
								}
							>
								<svg
									className="h-4 w-4"
									fill="currentColor"
									viewBox="0 0 24 24"
								>
									<path d="M17 2V13M22 11V5a2 2 0 00-2-2H7.236a2 2 0 00-1.789 1.106l-3.5 7A2 2 0 003.736 13H8v6a3 3 0 003 3v0a3 3 0 003-3v-6h3a2 2 0 002-2z" />
								</svg>
							</button>
						</>
					)}
				</div>

				{/* Add/Select button */}
				{onToggleSelection && (
					<button
						onClick={() => onToggleSelection(issueKey, issue)}
						className={`flex-shrink-0 ${
							isSelected ? "issue-add-button-selected" : "issue-add-button"
						}`}
						aria-label={
							isSelected
								? "Remove from remediation queue"
								: "Add to remediation queue"
						}
						title={
							isSelected
								? "Remove from remediation queue"
								: "Add to remediation queue"
						}
					>
						{isSelected ? (
							<svg
								className="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M5 13l4 4L19 7"
								/>
							</svg>
						) : (
							<svg
								className="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M12 4v16m8-8H4"
								/>
							</svg>
						)}
					</button>
				)}

				{/* Expand button */}
				<button
					onClick={() => setIsExpanded(!isExpanded)}
					className="flex-shrink-0 text-slate-500 hover:text-slate-400 transition-colors"
					aria-label={isExpanded ? "Collapse" : "Expand"}
				>
					<svg
						className={`h-5 w-5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M19 9l-7 7-7-7"
						/>
					</svg>
				</button>
			</div>

			{/* Expanded Content - Full details with animation */}
			{isExpanded && (
				<div className="mt-4 pt-4 border-t border-slate-700/50 space-y-3 animate-fade-in">
					{/* Location */}
					{issue.location && (
						<div className="flex items-start">
							<svg
								className="h-4 w-4 text-slate-500 mr-2 mt-0.5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
								/>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
								/>
							</svg>
							<div className="flex-1">
								<p className="text-xs font-medium text-slate-400 mb-1">
									Location:
								</p>
								<code className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-200">
									{formatLocation(issue.location)}
								</code>
								<CopyButton
									text={formatLocation(issue.location)}
									variant="emoji"
									className="ml-2"
								/>
							</div>
						</div>
					)}

					{/* Curation Reason - Why this was prioritized */}
					{isCuratedIssue(issue) && issue.curationReason && (
						<div className="info-section">
							<div className="flex items-start gap-2">
								<svg
									className="info-section-icon"
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
								<div>
									<p className="info-section-header">Why this matters</p>
									<div className="info-section-content">
										<MarkdownRenderer
											content={issue.curationReason}
											variant="compact"
										/>
									</div>
								</div>
							</div>
						</div>
					)}

					{/* Impact */}
					{issue.impact && (
						<div className="info-section">
							<div className="flex items-start gap-2">
								<svg
									className="info-section-icon"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
									/>
								</svg>
								<div>
									<p className="info-section-header">Impact</p>
									<div className="info-section-content">
										<MarkdownRenderer
											content={issue.impact}
											variant="compact"
										/>
									</div>
								</div>
							</div>
						</div>
					)}

					{/* Fix/Recommendation */}
					{fix && (
						<div className="info-section">
							<div className="flex items-start gap-2">
								<svg
									className="info-section-icon"
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
								<div>
									<p className="info-section-header">Recommendation</p>
									<div className="info-section-content">
										<MarkdownRenderer content={fix} variant="compact" />
									</div>
								</div>
							</div>
						</div>
					)}

					{/* Snippet - Content at the location with context */}
					{/* Single-file snippet */}
					{issue.snippetInfo && !issue.snippets && (
						<CodeSnippet snippetInfo={issue.snippetInfo} />
					)}

					{/* Cross-file snippets */}
					{issue.snippets && issue.snippets.length > 0 && (
						<div className="space-y-3">
							<p className="text-xs font-medium text-slate-400">
								Code from {issue.snippets.length} affected file
								{issue.snippets.length > 1 ? "s" : ""}:
							</p>
							{issue.snippets.map((snippetInfo, idx) => (
								<div key={idx}>
									{snippetInfo.file && (
										<p className="text-xs text-indigo-400 mb-2 font-mono">
											{snippetInfo.file}
										</p>
									)}
									<CodeSnippet snippetInfo={snippetInfo} />
								</div>
							))}
						</div>
					)}

					{/* Error message when code is not available */}
					{!issue.snippetInfo && !issue.snippets && issue.snippetError && (
						<div
							className={`rounded-lg border p-3 ${
								issue.isPhantomFile
									? "border-indigo-500/50 bg-slate-800/10"
									: "border-slate-700 bg-slate-800/50"
							}`}
						>
							<div className="flex items-start gap-2">
								<svg
									className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
										issue.isPhantomFile ? "text-indigo-400" : "text-slate-400"
									}`}
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									{issue.isPhantomFile ? (
										// Document plus icon for phantom files
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
										/>
									) : (
										// Info icon for regular errors
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									)}
								</svg>
								<div>
									<p
										className={`text-xs font-medium mb-1 ${
											issue.isPhantomFile ? "text-purple-300" : "text-slate-400"
										}`}
									>
										{issue.isPhantomFile
											? "Suggested file location"
											: "Code not available"}
									</p>
									<p
										className={`text-xs ${
											issue.isPhantomFile
												? "text-indigo-400/80"
												: "text-slate-500"
										}`}
									>
										{issue.snippetError}
									</p>
								</div>
							</div>
						</div>
					)}

					{/* Validation Warnings - Potential false positives */}
					{issue.validationWarnings && issue.validationWarnings.length > 0 && (
						<div className="rounded-lg border border-amber-600/50 bg-amber-500/10 p-3">
							<div className="flex items-start gap-2">
								<svg
									className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500"
									fill="currentColor"
									viewBox="0 0 24 24"
								>
									<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" />
								</svg>
								<div className="flex-1">
									<p className="text-xs font-medium mb-2 text-amber-400">
										Validation Warning
									</p>
									<ul className="text-xs text-amber-300/90 space-y-1">
										{issue.validationWarnings.map((warning, idx) => (
											<li key={idx} className="flex gap-2">
												<span className="flex-shrink-0">•</span>
												<span>{warning}</span>
											</li>
										))}
									</ul>
								</div>
							</div>
						</div>
					)}

					{/* Affected Files (for cross-file issues) */}
					{issue.affectedFiles && issue.affectedFiles.length > 0 && (
						<div>
							<p className="text-xs font-medium text-slate-400 mb-2">
								Affected Files:
							</p>
							<div className="flex flex-wrap gap-1">
								{issue.affectedFiles.map((file, idx) => (
									<span
										key={idx}
										className="text-xs bg-slate-700/60 text-slate-300 px-2 py-1 rounded border border-slate-600/50"
									>
										{file}
									</span>
								))}
							</div>
						</div>
					)}

					{/* Context */}
					{issue.context && (
						<div>
							<p className="text-sm font-semibold text-slate-100 mb-1">
								Context:
							</p>
							{isDiffContext(issue.context) ? (
								<DiffViewer content={issue.context} />
							) : (
								<MarkdownRenderer content={issue.context} variant="compact" />
							)}
						</div>
					)}

					{/* Quote */}
					{issue.quote && (
						<div>
							<p className="text-sm font-semibold text-slate-100 mb-1">
								Quote:
							</p>
							<blockquote className="border-l-4 border-indigo-500 pl-4 py-2 my-4 bg-slate-800/50 rounded-r-lg">
								<MarkdownRenderer content={issue.quote} variant="compact" />
							</blockquote>
						</div>
					)}

					{/* Pattern */}
					{issue.pattern && (
						<div>
							<p className="text-sm font-semibold text-slate-100 mb-1">
								Pattern:
							</p>
							<code className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-200 block">
								{issue.pattern}
							</code>
						</div>
					)}
				</div>
			)}
		</div>
	);
};
