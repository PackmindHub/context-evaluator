import React, { useState } from "react";

interface DiffViewerProps {
	content: string;
}

/**
 * Unified diff viewer component with syntax highlighting
 *
 * Renders diff content as preformatted text with color-coded lines:
 * - Added lines (+): green
 * - Removed lines (-): red
 * - Hunk headers (@@): cyan
 * - File headers (---/+++): muted
 */
export const DiffViewer: React.FC<DiffViewerProps> = ({ content }) => {
	const [isExpanded, setIsExpanded] = useState(false);
	const lines = content.split("\n");

	const getLineStyle = (line: string): string => {
		if (line.startsWith("@@") && line.includes("@@")) {
			return "text-cyan-400";
		}
		if (line.startsWith("+++") || line.startsWith("---")) {
			return "text-slate-500";
		}
		if (line.startsWith("+")) {
			return "text-green-400";
		}
		if (line.startsWith("-")) {
			return "text-red-400";
		}
		return "text-slate-400";
	};

	return (
		<div className="mb-3">
			<button
				onClick={() => setIsExpanded(!isExpanded)}
				className="flex items-center gap-2 text-xs text-indigo-400 hover:text-purple-300 transition-colors mb-2"
			>
				<svg
					className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
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
				<span>{isExpanded ? "Hide diff" : "Show diff"}</span>
			</button>

			{isExpanded && (
				<div className="rounded-lg overflow-hidden border border-slate-700 bg-slate-900">
					<div className="overflow-x-auto p-3">
						<pre className="text-xs font-mono whitespace-pre">
							{lines.map((line, index) => (
								<div key={index} className={getLineStyle(line)}>
									{line || " "}
								</div>
							))}
						</pre>
					</div>
				</div>
			)}
		</div>
	);
};
