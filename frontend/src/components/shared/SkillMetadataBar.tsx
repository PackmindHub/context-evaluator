import React from "react";
import type { SkillFrontmatter } from "../../lib/markdown-utils";

interface SkillMetadataBarProps {
	/** Parsed frontmatter from the skill file */
	frontmatter: SkillFrontmatter | null;
}

/**
 * Displays optional frontmatter metadata fields (license, compatibility, allowed-tools)
 * in a compact horizontal bar above the skill content.
 * Only renders if at least one optional field is present.
 */
export const SkillMetadataBar: React.FC<SkillMetadataBarProps> = ({
	frontmatter,
}) => {
	if (!frontmatter) return null;

	const { license, compatibility, "allowed-tools": allowedTools } = frontmatter;

	// Only render if at least one optional field is present
	if (!license && !compatibility && !allowedTools) return null;

	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-xs">
			{license && (
				<div className="flex items-center gap-1.5">
					<svg
						className="w-3.5 h-3.5 text-slate-500"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
						/>
					</svg>
					<span className="text-slate-400">License:</span>
					<span className="text-slate-200">{license}</span>
				</div>
			)}
			{compatibility && (
				<div className="flex items-center gap-1.5">
					<svg
						className="w-3.5 h-3.5 text-slate-500"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
						/>
					</svg>
					<span className="text-slate-400">Compatibility:</span>
					<span className="text-slate-200">{compatibility}</span>
				</div>
			)}
			{allowedTools && (
				<div className="flex items-center gap-1.5">
					<svg
						className="w-3.5 h-3.5 text-slate-500"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
						/>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
						/>
					</svg>
					<span className="text-slate-400">Allowed Tools:</span>
					<span className="text-slate-200 font-mono">{allowedTools}</span>
				</div>
			)}
		</div>
	);
};
