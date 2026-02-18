import React, { useCallback, useEffect, useMemo, useState } from "react";
import { parseMarkdownFrontmatter } from "../../lib/markdown-utils";
import type { ISkill } from "../../types/evaluation";
import { MarkdownPreview } from "./MarkdownPreview";
import { SkillMetadataBar } from "./SkillMetadataBar";

interface SkillsBrowserModalProps {
	/** Whether the modal is open */
	isOpen: boolean;
	/** Callback when the modal should close */
	onClose: () => void;
	/** Skills to display */
	skills: ISkill[];
	/** Optional skill path to pre-select when modal opens */
	initialSelectedPath?: string;
}

/**
 * A two-panel browser modal for viewing skills.
 * Left panel: Searchable list of skills
 * Right panel: Markdown preview of selected skill content
 */
export const SkillsBrowserModal: React.FC<SkillsBrowserModalProps> = ({
	isOpen,
	onClose,
	skills,
	initialSelectedPath,
}) => {
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedSkillIndex, setSelectedSkillIndex] = useState<number | null>(
		null,
	);

	// Filter and sort skills alphabetically by name
	const filteredSkills = useMemo(() => {
		let result = [...skills];

		// Filter by search query
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			result = result.filter(
				(skill) =>
					skill.name.toLowerCase().includes(query) ||
					skill.description.toLowerCase().includes(query) ||
					(skill.summary && skill.summary.toLowerCase().includes(query)),
			);
		}

		// Sort alphabetically by name
		result.sort((a, b) => a.name.localeCompare(b.name));

		return result;
	}, [skills, searchQuery]);

	// Get currently selected skill
	const selectedSkill = useMemo(() => {
		if (selectedSkillIndex === null) return null;
		return filteredSkills[selectedSkillIndex] ?? null;
	}, [filteredSkills, selectedSkillIndex]);

	// Parse frontmatter from selected skill content
	const parsedContent = useMemo(() => {
		if (!selectedSkill?.content) return null;
		return parseMarkdownFrontmatter(selectedSkill.content);
	}, [selectedSkill?.content]);

	// Reset selection when filter changes and selected item is no longer visible
	useEffect(() => {
		if (
			selectedSkillIndex !== null &&
			selectedSkillIndex >= filteredSkills.length
		) {
			setSelectedSkillIndex(filteredSkills.length > 0 ? 0 : null);
		}
	}, [filteredSkills, selectedSkillIndex]);

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

	// Reset state when modal opens; pre-select if initialSelectedPath is provided
	useEffect(() => {
		if (isOpen) {
			setSearchQuery("");
			if (initialSelectedPath) {
				const idx = filteredSkills.findIndex(
					(s) => s.path === initialSelectedPath,
				);
				setSelectedSkillIndex(idx >= 0 ? idx : null);
			} else {
				setSelectedSkillIndex(null);
			}
		}
	}, [isOpen, initialSelectedPath, filteredSkills]);

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
									d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
								/>
							</svg>
						</span>
						<h3 className="text-lg font-bold text-slate-100">Skills Browser</h3>
						<span className="text-sm text-slate-400">
							{skills.length} skill{skills.length !== 1 ? "s" : ""}
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
					{/* Left panel - Skills list */}
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
									placeholder="Search skills..."
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									className="w-full input-field pl-10 py-2"
								/>
							</div>
						</div>

						{/* Skills list */}
						<div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
							{filteredSkills.length === 0 ? (
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
									<p className="text-sm">No skills found</p>
								</div>
							) : (
								filteredSkills.map((skill, index) => (
									<button
										key={skill.path}
										onClick={() => setSelectedSkillIndex(index)}
										className={`w-full text-left p-3 rounded-lg transition-all ${
											selectedSkillIndex === index
												? "bg-indigo-600/30 border border-indigo-500/50"
												: "hover:bg-slate-700/40 border border-transparent"
										}`}
									>
										<div className="text-sm font-medium text-slate-100 mb-1">
											{skill.name}
										</div>
										{skill.description && (
											<p className="text-xs text-slate-400">
												{skill.description}
											</p>
										)}
									</button>
								))
							)}
						</div>
					</div>

					{/* Right panel - Markdown preview */}
					<div className="w-3/5 flex flex-col min-h-0">
						{selectedSkill ? (
							<>
								{/* Skill header */}
								<div className="p-4 border-b border-slate-700/50 bg-slate-800/30">
									<div className="flex items-center gap-2 mb-1">
										<h4 className="text-base font-semibold text-slate-100">
											{selectedSkill.name}
										</h4>
										{selectedSkill.duplicatePaths &&
											selectedSkill.duplicatePaths.length > 0 && (
												<span
													className="text-xs bg-slate-700 px-2 py-0.5 rounded text-slate-400"
													title={`Also found at: ${selectedSkill.duplicatePaths.join(", ")}`}
												>
													+{selectedSkill.duplicatePaths.length} duplicate
													{selectedSkill.duplicatePaths.length !== 1 ? "s" : ""}
												</span>
											)}
									</div>
									<p className="text-xs text-slate-500 font-mono">
										{selectedSkill.path}
									</p>
								</div>

								{/* Content */}
								<div className="flex-1 overflow-y-auto custom-scrollbar p-4">
									{selectedSkill.content ? (
										<>
											<SkillMetadataBar
												frontmatter={parsedContent?.frontmatter ?? null}
											/>
											<MarkdownPreview
												content={
													parsedContent?.content ?? selectedSkill.content
												}
											/>
										</>
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
											<p className="text-sm">Content not available</p>
											<p className="text-xs text-slate-600 mt-1">
												Re-run evaluation to load skill content
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
										d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
									/>
								</svg>
								<p className="text-base text-slate-400 mb-1">
									Select a skill to view its content
								</p>
								<p className="text-sm text-slate-600">
									Click on a skill from the list on the left
								</p>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};
