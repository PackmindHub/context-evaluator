import React, { useState } from "react";
import type { SnippetInfo } from "../../types/evaluation";

interface CodeSnippetProps {
	snippetInfo: SnippetInfo;
}

/**
 * Code snippet component with GitHub-style line highlighting
 *
 * Displays code with line numbers and highlights specific lines
 * based on the snippet's highlightStart and highlightEnd properties.
 */
export const CodeSnippet: React.FC<CodeSnippetProps> = ({ snippetInfo }) => {
	const [isExpanded, setIsExpanded] = useState(false);
	const lines = snippetInfo.content.split("\n");

	const isHighlightedLine = (lineNumber: number) => {
		return (
			lineNumber >= snippetInfo.highlightStart &&
			lineNumber <= snippetInfo.highlightEnd
		);
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
				<span>{isExpanded ? "Hide code" : "Show code"}</span>
			</button>

			{isExpanded && (
				<div className="rounded-lg overflow-hidden border border-slate-700 bg-slate-900">
					<div className="overflow-x-auto">
						<table className="w-full text-xs font-mono">
							<tbody>
								{lines.map((line, index) => {
									const lineNumber = snippetInfo.startLine + index;
									const isHighlighted = isHighlightedLine(lineNumber);

									return (
										<tr
											key={index}
											className={
												isHighlighted ? "bg-yellow-900/30" : "bg-transparent"
											}
										>
											{/* Line number gutter */}
											<td
												className={`select-none text-right pr-3 pl-2 py-0.5 border-r ${
													isHighlighted
														? "text-yellow-400 border-yellow-600 bg-yellow-900/40"
														: "text-slate-500 border-slate-700"
												}`}
											>
												{lineNumber}
											</td>
											{/* Highlight indicator */}
											<td
												className={`w-1 ${isHighlighted ? "bg-yellow-500" : ""}`}
											></td>
											{/* Code content */}
											<td
												className={`pl-3 pr-4 py-0.5 whitespace-pre ${
													isHighlighted ? "text-slate-100" : "text-slate-400"
												}`}
											>
												{line || " "}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	);
};
