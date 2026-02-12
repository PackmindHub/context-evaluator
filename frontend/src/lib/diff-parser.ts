/**
 * Pure utility to parse unified diff text into structured DiffHunk arrays.
 */

import type { DiffHunk } from "../types/remediation";

export function parseDiff(diffText: string): DiffHunk[] {
	if (!diffText.trim()) return [];

	const hunks: DiffHunk[] = [];
	const lines = diffText.split("\n");

	let currentHunk: DiffHunk | null = null;
	let oldLine = 0;
	let newLine = 0;

	for (const line of lines) {
		// Hunk header: @@ -oldStart,oldCount +newStart,newCount @@
		const hunkMatch = line.match(
			/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/,
		);
		if (hunkMatch) {
			currentHunk = {
				header: line,
				lines: [{ type: "header", content: line }],
			};
			hunks.push(currentHunk);
			oldLine = Number.parseInt(hunkMatch[1]!, 10);
			newLine = Number.parseInt(hunkMatch[2]!, 10);
			continue;
		}

		if (!currentHunk) continue;

		if (line.startsWith("+")) {
			currentHunk.lines.push({
				type: "addition",
				content: line.slice(1),
				newLineNumber: newLine++,
			});
		} else if (line.startsWith("-")) {
			currentHunk.lines.push({
				type: "deletion",
				content: line.slice(1),
				oldLineNumber: oldLine++,
			});
		} else if (line.startsWith(" ") || line === "") {
			// Context line (only within a hunk that has started)
			if (currentHunk.lines.length > 1 || line.startsWith(" ")) {
				currentHunk.lines.push({
					type: "context",
					content: line.startsWith(" ") ? line.slice(1) : line,
					oldLineNumber: oldLine++,
					newLineNumber: newLine++,
				});
			}
		}
	}

	return hunks;
}
