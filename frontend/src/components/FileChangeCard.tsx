/**
 * Card for a single changed file with expandable diff viewer.
 */

import { useState } from "react";
import type { FileChange, RemediationAction } from "../types/remediation";
import { DiffViewer } from "./DiffViewer";

interface FileChangeCardProps {
	file: FileChange;
	defaultExpanded?: boolean;
	summaries?: RemediationAction[];
}

export function FileChangeCard({
	file,
	defaultExpanded = false,
	summaries,
}: FileChangeCardProps) {
	const [expanded, setExpanded] = useState(defaultExpanded);

	const badgeClass =
		file.status === "added"
			? "change-badge-added"
			: file.status === "deleted"
				? "change-badge-deleted"
				: "change-badge-modified";

	return (
		<div className="card">
			<button
				onClick={() => setExpanded(!expanded)}
				className="w-full flex items-center gap-3 text-left"
			>
				{/* Expand/collapse indicator */}
				<svg
					className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${expanded ? "rotate-90" : ""}`}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M9 5l7 7-7 7"
					/>
				</svg>

				{/* File path */}
				<span className="font-mono text-sm text-slate-200 flex-1 min-w-0 truncate">
					{file.path}
				</span>

				{/* Status badge */}
				<span
					className={`text-xs px-2 py-0.5 rounded font-medium ${badgeClass}`}
				>
					{file.status}
				</span>

				{/* Stats */}
				<span className="flex-shrink-0 flex items-center gap-2 text-xs">
					{file.additions > 0 && (
						<span className="text-green-400">+{file.additions}</span>
					)}
					{file.deletions > 0 && (
						<span className="text-red-400">-{file.deletions}</span>
					)}
				</span>
			</button>

			{expanded && (
				<div className="mt-3 border-t border-slate-700/50 pt-3">
					{summaries && summaries.length > 0 && (
						<p className="text-xs text-slate-400 mb-2 px-1">
							{summaries
								.map(
									(s) =>
										`${s.status === "fixed" ? "Fixed" : "Added"}: ${s.summary}`,
								)
								.join(" | ")}
						</p>
					)}
					<DiffViewer diff={file.diff} />
				</div>
			)}
		</div>
	);
}
