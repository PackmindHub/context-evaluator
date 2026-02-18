import React, { useCallback, useEffect, useMemo, useState } from "react";
import { MarkdownPreview } from "./MarkdownPreview";

/**
 * Generic content item for the browser modal
 */
export interface ContentItem {
	/** Unique identifier */
	id: string;
	/** Primary display title */
	title: string;
	/** Secondary info (displayed as monospace subtitle) */
	subtitle?: string;
	/** Description or summary text */
	description?: string;
	/** Markdown content for preview */
	content?: string;
	/** Optional badge text (e.g., file type) */
	badge?: string;
}

interface ContentBrowserModalProps {
	/** Whether the modal is open */
	isOpen: boolean;
	/** Callback when the modal should close */
	onClose: () => void;
	/** Items to display */
	items: ContentItem[];
	/** Modal title */
	title: string;
	/** Icon element for the modal header */
	icon: React.ReactNode;
	/** Placeholder text for search input */
	searchPlaceholder?: string;
	/** Text to show when no items match search */
	emptySearchText?: string;
	/** Text to show when no item is selected */
	selectPromptText?: string;
	/** Text to show when content is unavailable */
	noContentText?: string;
	/** Subtext for no content state */
	noContentSubtext?: string;
	/** Optional item ID to pre-select when modal opens */
	initialSelectedId?: string;
}

/**
 * A generic two-panel browser modal.
 * Left panel: Searchable list of items
 * Right panel: Markdown preview of selected item content
 */
export const ContentBrowserModal: React.FC<ContentBrowserModalProps> = ({
	isOpen,
	onClose,
	items,
	title,
	icon,
	searchPlaceholder = "Search...",
	emptySearchText = "No items found",
	selectPromptText = "Select an item to view its content",
	noContentText = "Content not available",
	noContentSubtext = "Re-run evaluation to load content",
	initialSelectedId,
}) => {
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(
		null,
	);

	// Filter items by search query
	const filteredItems = useMemo(() => {
		let result = [...items];

		// Filter by search query
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			result = result.filter(
				(item) =>
					item.title.toLowerCase().includes(query) ||
					(item.subtitle && item.subtitle.toLowerCase().includes(query)) ||
					(item.description && item.description.toLowerCase().includes(query)),
			);
		}

		return result;
	}, [items, searchQuery]);

	// Get currently selected item
	const selectedItem = useMemo(() => {
		if (selectedItemIndex === null) return null;
		return filteredItems[selectedItemIndex] ?? null;
	}, [filteredItems, selectedItemIndex]);

	// Reset selection when filter changes and selected item is no longer visible
	useEffect(() => {
		if (
			selectedItemIndex !== null &&
			selectedItemIndex >= filteredItems.length
		) {
			setSelectedItemIndex(filteredItems.length > 0 ? 0 : null);
		}
	}, [filteredItems, selectedItemIndex]);

	// Handle Escape key
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		},
		[onClose],
	);

	// Lock body scroll and add key listener when open
	useEffect(() => {
		if (isOpen) {
			document.body.style.overflow = "hidden";
			document.addEventListener("keydown", handleKeyDown);
		} else {
			document.body.style.overflow = "";
		}

		return () => {
			document.body.style.overflow = "";
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [isOpen, handleKeyDown]);

	// Reset state when modal opens; auto-select if only one item or initialSelectedId
	useEffect(() => {
		if (isOpen) {
			setSearchQuery("");
			if (initialSelectedId) {
				const idx = items.findIndex((item) => item.id === initialSelectedId);
				setSelectedItemIndex(idx >= 0 ? idx : null);
			} else {
				setSelectedItemIndex(items.length === 1 ? 0 : null);
			}
		}
	}, [isOpen, items, initialSelectedId]);

	if (!isOpen) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center p-4"
			onClick={onClose}
		>
			{/* Backdrop */}
			<div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" />

			{/* Modal */}
			<div
				className="relative max-w-6xl w-full h-[80vh] glass-card animate-fade-in flex flex-col"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className="flex items-center justify-between p-4 border-b border-slate-700/50">
					<div className="flex items-center gap-3">
						<span className="w-6 h-6 bg-slate-700 rounded-lg flex items-center justify-center">
							{icon}
						</span>
						<h3 className="text-lg font-bold text-slate-100">{title}</h3>
						<span className="text-sm text-slate-400">
							{items.length} item{items.length !== 1 ? "s" : ""}
						</span>
					</div>
					<button
						onClick={onClose}
						className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 rounded-lg transition-all"
						aria-label="Close modal"
					>
						<svg
							className="w-5 h-5"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>

				{/* Two-panel content */}
				<div className="flex flex-1 min-h-0">
					{/* Left panel - Items list */}
					<div className="w-2/5 border-r border-slate-700/50 flex flex-col">
						{/* Search */}
						<div className="p-3 border-b border-slate-700/50">
							<div className="relative">
								<svg
									className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
									/>
								</svg>
								<input
									type="text"
									placeholder={searchPlaceholder}
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									className="w-full input-field pl-10 py-2"
								/>
							</div>
						</div>

						{/* Items list */}
						<div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
							{filteredItems.length === 0 ? (
								<div className="flex flex-col items-center justify-center h-full text-slate-500 p-4">
									<svg
										className="w-12 h-12 mb-3 opacity-50"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={1.5}
											d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
									<p className="text-sm">{emptySearchText}</p>
								</div>
							) : (
								filteredItems.map((item, index) => (
									<button
										key={item.id}
										onClick={() => setSelectedItemIndex(index)}
										className={`w-full text-left p-3 rounded-lg transition-all ${
											selectedItemIndex === index
												? "bg-indigo-600/30 border border-indigo-500/50"
												: "hover:bg-slate-700/40 border border-transparent"
										}`}
									>
										<div className="flex items-center gap-2 mb-1">
											<span className="text-sm font-medium text-slate-100 truncate">
												{item.title}
											</span>
											{item.badge && (
												<span className="text-xs bg-slate-700 px-1.5 py-0.5 rounded text-slate-400">
													{item.badge}
												</span>
											)}
										</div>
										{item.subtitle && (
											<p className="text-xs text-slate-500 font-mono truncate mb-1">
												{item.subtitle}
											</p>
										)}
										{item.description && (
											<p className="text-xs text-slate-400 line-clamp-2">
												{item.description}
											</p>
										)}
									</button>
								))
							)}
						</div>
					</div>

					{/* Right panel - Markdown preview */}
					<div className="w-3/5 flex flex-col min-h-0">
						{selectedItem ? (
							<>
								{/* Item header */}
								<div className="p-4 border-b border-slate-700/50 bg-slate-800/30">
									<div className="flex items-center gap-2 mb-1">
										<h4 className="text-base font-semibold text-slate-100">
											{selectedItem.title}
										</h4>
										{selectedItem.badge && (
											<span className="text-xs bg-slate-700 px-2 py-0.5 rounded text-slate-400">
												{selectedItem.badge}
											</span>
										)}
									</div>
									{selectedItem.subtitle && (
										<p className="text-xs text-slate-500 font-mono">
											{selectedItem.subtitle}
										</p>
									)}
								</div>

								{/* Content */}
								<div className="flex-1 overflow-y-auto custom-scrollbar p-4">
									{selectedItem.content ? (
										<MarkdownPreview content={selectedItem.content} />
									) : (
										<div className="flex flex-col items-center justify-center h-full text-slate-500">
											<svg
												className="w-12 h-12 mb-3 opacity-50"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={1.5}
													d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
												/>
											</svg>
											<p className="text-sm">{noContentText}</p>
											<p className="text-xs text-slate-600 mt-1">
												{noContentSubtext}
											</p>
										</div>
									)}
								</div>
							</>
						) : (
							<div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8">
								<svg
									className="w-16 h-16 mb-4 opacity-40"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
										d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
									/>
								</svg>
								<p className="text-base text-slate-400 mb-1">
									{selectPromptText}
								</p>
								<p className="text-sm text-slate-600">
									Click on an item from the list on the left
								</p>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};
