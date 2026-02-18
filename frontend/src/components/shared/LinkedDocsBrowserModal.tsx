import React, { useMemo } from "react";
import type { ILinkedDocSummary } from "../../types/evaluation";
import { ContentBrowserModal, type ContentItem } from "./ContentBrowserModal";

interface LinkedDocsBrowserModalProps {
	/** Whether the modal is open */
	isOpen: boolean;
	/** Callback when the modal should close */
	onClose: () => void;
	/** Linked documentation files to display */
	linkedDocs: ILinkedDocSummary[];
	/** Optional doc path to pre-select when modal opens */
	initialSelectedPath?: string;
}

/**
 * Browser modal for viewing linked documentation files.
 * Displays a list on the left with markdown preview on the right.
 */
export const LinkedDocsBrowserModal: React.FC<LinkedDocsBrowserModalProps> = ({
	isOpen,
	onClose,
	linkedDocs,
	initialSelectedPath,
}) => {
	// Transform linked docs to generic content items, sorted alphabetically by path
	const items: ContentItem[] = useMemo(() => {
		// Sort alphabetically by path
		const sortedDocs = [...linkedDocs].sort((a, b) =>
			a.path.localeCompare(b.path),
		);

		return sortedDocs.map((doc) => ({
			id: doc.path,
			title: doc.path.split("/").pop() || doc.path,
			subtitle: `Linked from ${doc.linkedFrom}`,
			description: doc.summary,
			content: doc.content,
		}));
	}, [linkedDocs]);

	return (
		<ContentBrowserModal
			isOpen={isOpen}
			onClose={onClose}
			items={items}
			title="Linked Documentation"
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
						d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
					/>
				</svg>
			}
			searchPlaceholder="Search linked docs..."
			emptySearchText="No linked docs found"
			selectPromptText="Select a document to view its content"
			noContentText="Content not available"
			noContentSubtext="Re-run evaluation to load document content"
			initialSelectedId={initialSelectedPath}
		/>
	);
};
