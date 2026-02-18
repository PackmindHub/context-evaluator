import React, { useMemo } from "react";
import { stripMarkdownFrontmatter } from "../../lib/markdown-utils";
import type { IContextFile } from "../../types/evaluation";
import { ContentBrowserModal, type ContentItem } from "./ContentBrowserModal";

interface ContextFilesBrowserModalProps {
	/** Whether the modal is open */
	isOpen: boolean;
	/** Callback when the modal should close */
	onClose: () => void;
	/** Context files to display */
	contextFiles: IContextFile[];
	/** Optional filter to show only files of a specific type. "claude-code" shows both claude and rules files. "cursor" shows cursor rules. */
	filterType?:
		| "agents"
		| "claude"
		| "copilot"
		| "rules"
		| "claude-code"
		| "cursor-rules"
		| "skills";
}

/**
 * Get human-readable label for context file type
 */
function getTypeLabel(
	type: "agents" | "claude" | "copilot" | "rules" | "cursor-rules" | "skills",
): string {
	switch (type) {
		case "agents":
			return "AGENTS.md";
		case "claude":
			return "CLAUDE.md";
		case "rules":
			return "Rules";
		case "copilot":
			return "Copilot";
		case "cursor-rules":
			return "Cursor Rule";
		case "skills":
			return "Skill";
	}
}

/**
 * Browser modal for viewing context files (AGENTS.md, CLAUDE.md, copilot-instructions.md).
 * Displays a list on the left with markdown preview on the right.
 */
export const ContextFilesBrowserModal: React.FC<
	ContextFilesBrowserModalProps
> = ({ isOpen, onClose, contextFiles, filterType }) => {
	// Filter context files by type if filterType is provided
	const filteredContextFiles = useMemo(() => {
		if (!filterType) return contextFiles;
		// "claude-code" shows both claude and rules files
		if (filterType === "claude-code") {
			return contextFiles.filter(
				(file) => file.type === "claude" || file.type === "rules",
			);
		}
		return contextFiles.filter((file) => file.type === filterType);
	}, [contextFiles, filterType]);

	// Transform context files to generic content items, sorted alphabetically by path
	const items: ContentItem[] = useMemo(() => {
		// Sort alphabetically by path
		const sortedFiles = [...filteredContextFiles].sort((a, b) =>
			a.path.localeCompare(b.path),
		);

		return sortedFiles.map((file) => {
			// Add globs/description info for rules files
			let description = file.summary;
			if (
				(file.type === "rules" || file.type === "cursor-rules") &&
				file.globs
			) {
				description = description
					? `Applies to: ${file.globs}\n\n${description}`
					: `Applies to: ${file.globs}`;
			}
			if (file.type === "cursor-rules" && file.description) {
				const descLine = `Description: ${file.description}`;
				description = description ? `${descLine}\n${description}` : descLine;
			}

			return {
				id: file.path,
				title: file.path.split("/").pop() || file.path,
				subtitle: file.path,
				description,
				content: file.content
					? stripMarkdownFrontmatter(file.content)
					: undefined,
				badge: getTypeLabel(file.type),
			};
		});
	}, [filteredContextFiles]);

	// Dynamic title based on filter type
	const modalTitle = useMemo(() => {
		if (!filterType) return "Context Files Browser";
		if (filterType === "claude-code") return "Claude Code Browser";
		return `${getTypeLabel(filterType)} Browser`;
	}, [filterType]);

	return (
		<ContentBrowserModal
			isOpen={isOpen}
			onClose={onClose}
			items={items}
			title={modalTitle}
			icon={
				<svg
					className="w-4 h-4 text-slate-300"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
					/>
				</svg>
			}
			searchPlaceholder="Search context files..."
			emptySearchText="No context files found"
			selectPromptText="Select a context file to view its content"
			noContentText="Content not available"
			noContentSubtext="Re-run evaluation to load file content"
		/>
	);
};
