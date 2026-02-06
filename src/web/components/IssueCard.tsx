import React, { useState } from "react";
import type { Issue } from "../types/evaluation";
import {
	formatLocation,
	getSeverityColor,
	getSeverityEmoji,
	getSeverityLevel,
} from "../types/evaluation";

interface IssueCardProps {
	issue: Issue;
	evaluatorName?: string;
}

export const IssueCard: React.FC<IssueCardProps> = ({
	issue,
	evaluatorName,
}) => {
	const [isExpanded, setIsExpanded] = useState(false);

	const severityLevel = getSeverityLevel(issue.severity);
	const severityColor = getSeverityColor(issue.severity);
	const severityEmoji = getSeverityEmoji(issue.severity);

	const title = issue.title || issue.category;
	const description = issue.problem || issue.description || "";
	const fix = issue.fix || issue.recommendation || issue.suggestion || "";

	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text);
	};

	return (
		<div
			className="card card-hover border-l-4 transition-all"
			style={{
				borderLeftColor:
					severityLevel === "high"
						? "#ef4444"
						: severityLevel === "medium"
							? "#f59e0b"
							: "#eab308",
			}}
		>
			{/* Header */}
			<div className="flex items-start justify-between mb-3">
				<div className="flex items-start flex-1">
					<span className="text-2xl mr-3 mt-0.5">{severityEmoji}</span>
					<div className="flex-1">
						<div className="flex items-center gap-2 mb-2">
							<span className={`badge ${severityColor}`}>
								Severity {issue.severity}
							</span>
							{evaluatorName && (
								<span className="badge bg-slate-700 text-slate-300 font-mono text-xs">
									{evaluatorName}
								</span>
							)}
						</div>
						<h4 className="text-lg font-semibold text-slate-100 mb-2">
							{title}
						</h4>
					</div>
				</div>
				<button
					onClick={() => setIsExpanded(!isExpanded)}
					className="ml-2 text-slate-500 hover:text-slate-400 transition-colors"
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

			{/* Description */}
			{description && (
				<div className="mb-3">
					<p className="text-sm text-slate-300 leading-relaxed">
						{description}
					</p>
				</div>
			)}

			{/* Location */}
			{issue.location && (
				<div className="mb-3 flex items-start">
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
						<p className="text-xs font-medium text-slate-400 mb-1">Location:</p>
						<code className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-200">
							{formatLocation(issue.location)}
						</code>
						<button
							onClick={() => copyToClipboard(formatLocation(issue.location))}
							className="ml-2 text-xs text-blue-400 hover:text-blue-300"
							title="Copy to clipboard"
						>
							📋
						</button>
					</div>
				</div>
			)}

			{/* Affected Files (for cross-file issues) */}
			{issue.affectedFiles && issue.affectedFiles.length > 0 && (
				<div className="mb-3">
					<p className="text-xs font-medium text-slate-400 mb-2">
						Affected Files:
					</p>
					<div className="flex flex-wrap gap-1">
						{issue.affectedFiles.map((file, idx) => (
							<span
								key={idx}
								className="text-xs bg-purple-900/30 text-purple-300 px-2 py-1 rounded border border-purple-700"
							>
								{file}
							</span>
						))}
					</div>
				</div>
			)}

			{/* Expanded Content */}
			{isExpanded && (
				<div className="mt-4 pt-4 border-t border-slate-700 space-y-3">
					{/* Impact */}
					{issue.impact && (
						<div>
							<p className="text-sm font-semibold text-slate-100 mb-1">
								Impact:
							</p>
							<p className="text-sm text-slate-300">{issue.impact}</p>
						</div>
					)}

					{/* Fix/Recommendation */}
					{fix && (
						<div>
							<p className="text-sm font-semibold text-slate-100 mb-1">
								Recommendation:
							</p>
							<p className="text-sm text-slate-300 whitespace-pre-wrap">
								{fix}
							</p>
						</div>
					)}

					{/* Context */}
					{issue.context && (
						<div>
							<p className="text-sm font-semibold text-slate-100 mb-1">
								Context:
							</p>
							<p className="text-sm text-slate-300">{issue.context}</p>
						</div>
					)}

					{/* Quote */}
					{issue.quote && (
						<div>
							<p className="text-sm font-semibold text-slate-100 mb-1">
								Quote:
							</p>
							<blockquote className="text-sm text-slate-300 border-l-4 border-slate-600 pl-4 italic">
								{issue.quote}
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
