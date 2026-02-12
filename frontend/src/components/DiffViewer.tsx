/**
 * Renders parsed unified diff with syntax-colored lines.
 */

import { useMemo } from "react";
import { parseDiff } from "../lib/diff-parser";

interface DiffViewerProps {
	diff: string;
}

export function DiffViewer({ diff }: DiffViewerProps) {
	const hunks = useMemo(() => parseDiff(diff), [diff]);

	if (hunks.length === 0) {
		return (
			<div className="diff-viewer">
				<span className="text-slate-500 text-xs italic">No changes</span>
			</div>
		);
	}

	return (
		<div className="diff-viewer">
			{hunks.map((hunk, hi) => (
				<div key={hi}>
					{hunk.lines.map((line, li) => {
						let lineClass = "diff-line";
						let prefixClass = "diff-line-prefix";
						let prefix = " ";

						switch (line.type) {
							case "header":
								lineClass += " diff-line-header";
								return (
									<div key={li} className={lineClass}>
										<span className="diff-line-number" />
										<span className="diff-line-number" />
										<span className="diff-line-content">{line.content}</span>
									</div>
								);
							case "addition":
								lineClass += " diff-line-addition";
								prefixClass += " text-green-400";
								prefix = "+";
								break;
							case "deletion":
								lineClass += " diff-line-deletion";
								prefixClass += " text-red-400";
								prefix = "-";
								break;
							case "context":
								break;
						}

						return (
							<div key={li} className={lineClass}>
								<span className="diff-line-number">
									{line.oldLineNumber ?? ""}
								</span>
								<span className="diff-line-number">
									{line.newLineNumber ?? ""}
								</span>
								<span className={prefixClass}>{prefix}</span>
								<span className="diff-line-content">{line.content}</span>
							</div>
						);
					})}
				</div>
			))}
		</div>
	);
}
