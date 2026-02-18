import React, { useState } from "react";
import type { Metadata } from "../types/evaluation";
import { ContextFilesBrowserModal } from "./shared/ContextFilesBrowserModal";
import { LinkedDocsBrowserModal } from "./shared/LinkedDocsBrowserModal";
import { SkillsBrowserModal } from "./shared/SkillsBrowserModal";

interface ContextTabProps {
	metadata: Metadata;
}

const ExternalLinkIcon: React.FC = () => (
	<svg
		className="w-3 h-3"
		fill="none"
		stroke="currentColor"
		viewBox="0 0 24 24"
	>
		<path
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={2}
			d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
		/>
	</svg>
);

/** Icon: document */
const DocIcon: React.FC<{ className?: string }> = ({
	className = "h-4 w-4",
}) => (
	<svg
		className={className}
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
);

/** Icon: sparkles (skills) */
const SparklesIcon: React.FC<{ className?: string }> = ({
	className = "h-4 w-4",
}) => (
	<svg
		className={className}
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
);

/** Icon: link */
const LinkIcon: React.FC<{ className?: string }> = ({
	className = "h-4 w-4",
}) => (
	<svg
		className={className}
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
);

/** Icon: shield/rules */
const RulesIcon: React.FC<{ className?: string }> = ({
	className = "h-4 w-4",
}) => (
	<svg
		className={className}
		fill="none"
		viewBox="0 0 24 24"
		stroke="currentColor"
	>
		<path
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth={2}
			d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
		/>
	</svg>
);

/** GitHub Copilot official logo */
const CopilotLogo: React.FC<{ className?: string }> = ({
	className = "w-4 h-4",
}) => (
	<svg className={className} fill="currentColor" viewBox="0 0 16 16">
		<path d="M8 1C4.14 1 1 4.14 1 8s3.14 7 7 7 7-3.14 7-7-3.14-7-7-7zm2.5 5.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm-5 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm6 3.5c-.55.83-1.4 1.5-3.5 1.5S5.05 10.83 4.5 10h7z" />
	</svg>
);

/** Cursor official logo */
const CursorLogo: React.FC<{ className?: string }> = ({
	className = "w-4 h-4",
}) => (
	<svg className={className} fill="currentColor" viewBox="0 0 24 24">
		<path d="M4.5 3a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 4.5 21h15a1.5 1.5 0 0 0 1.5-1.5v-15A1.5 1.5 0 0 0 19.5 3h-15Zm2.25 3.75h1.5v9.5h-1.5v-9.5Zm3.5 0h1.5l3.5 6.5V6.75h1.5v9.5h-1.5l-3.5-6.5v6.5h-1.5v-9.5Z" />
	</svg>
);

export const ContextTab: React.FC<ContextTabProps> = ({ metadata }) => {
	const [showSkillsModal, setShowSkillsModal] = useState(false);
	const [showCopilotSkillsModal, setShowCopilotSkillsModal] = useState(false);
	const [showCursorSkillsModal, setShowCursorSkillsModal] = useState(false);
	const [showLinkedDocsModal, setShowLinkedDocsModal] = useState(false);
	const [contextFilesModalType, setContextFilesModalType] = useState<
		| "agents"
		| "claude"
		| "copilot"
		| "rules"
		| "claude-code"
		| "cursor-rules"
		| "skills"
		| null
	>(null);

	// Context files derivation
	const agentsFilePaths = metadata.projectContext?.agentsFilePaths ?? [];
	const contextFilesFromApi = metadata.projectContext?.contextFiles ?? [];

	const contextFiles =
		contextFilesFromApi.length > 0
			? contextFilesFromApi
			: agentsFilePaths.map((path) => {
					const lowerPath = path.toLowerCase();
					let type: "agents" | "claude" | "copilot" = "agents";
					if (lowerPath.includes("claude")) {
						type = "claude";
					} else if (lowerPath.includes("copilot")) {
						type = "copilot";
					}
					return {
						path,
						type,
						content: "",
						summary: "Re-run evaluation to load content and summary.",
					};
				});

	const agentsMdPaths =
		contextFilesFromApi.length > 0
			? contextFilesFromApi
					.filter((f) => f.type === "agents")
					.map((f) => f.path)
			: agentsFilePaths.filter((p) => p.toLowerCase().includes("agents"));
	const claudeMdPaths =
		contextFilesFromApi.length > 0
			? contextFilesFromApi
					.filter((f) => f.type === "claude")
					.map((f) => f.path)
			: agentsFilePaths.filter((p) => p.toLowerCase().includes("claude"));
	const rulesPaths =
		contextFilesFromApi.length > 0
			? contextFilesFromApi.filter((f) => f.type === "rules").map((f) => f.path)
			: agentsFilePaths.filter((p) => p.includes(".claude/rules/"));
	const copilotInstructionsPaths =
		contextFilesFromApi.length > 0
			? contextFilesFromApi
					.filter((f) => f.type === "copilot")
					.map((f) => f.path)
			: agentsFilePaths.filter((p) =>
					p.toLowerCase().includes("copilot-instructions"),
				);
	const cursorRulesPaths =
		contextFilesFromApi.length > 0
			? contextFilesFromApi
					.filter((f) => f.type === "cursor-rules")
					.map((f) => f.path)
			: agentsFilePaths.filter((p) => p.includes(".cursor/rules/"));

	const agentsMdCount = agentsMdPaths.length;
	const claudeMdCount = claudeMdPaths.length;
	const rulesCount = rulesPaths.length;
	const copilotInstructionsCount = copilotInstructionsPaths.length;
	const cursorRulesCount = cursorRulesPaths.length;
	const skills = metadata.projectContext?.skills ?? [];
	const linkedDocs = metadata.projectContext?.linkedDocs ?? [];
	const linkedDocsCount = linkedDocs.length;

	// Sorted for display
	const sortedAgentsMdPaths = [...agentsMdPaths].sort((a, b) =>
		a.localeCompare(b),
	);
	const sortedClaudeMdPaths = [...claudeMdPaths].sort((a, b) =>
		a.localeCompare(b),
	);
	const sortedRulesPaths = [...rulesPaths].sort((a, b) => a.localeCompare(b));
	const sortedCopilotInstructionsPaths = [...copilotInstructionsPaths].sort(
		(a, b) => a.localeCompare(b),
	);
	const sortedCursorRulesPaths = [...cursorRulesPaths].sort((a, b) =>
		a.localeCompare(b),
	);
	const sortedSkills = [...skills].sort((a, b) => a.name.localeCompare(b.name));

	// Split skills by agent path prefix
	const claudeSkills = sortedSkills.filter((s) =>
		s.path.startsWith(".claude/skills/"),
	);
	const copilotSkills = sortedSkills.filter((s) =>
		s.path.startsWith(".github/skills/"),
	);
	const cursorSkills = sortedSkills.filter((s) =>
		s.path.startsWith(".cursor/skills/"),
	);
	const genericSkills = sortedSkills.filter(
		(s) =>
			!s.path.startsWith(".claude/skills/") &&
			!s.path.startsWith(".github/skills/") &&
			!s.path.startsWith(".cursor/skills/"),
	);
	const claudeSkillsCount = claudeSkills.length + genericSkills.length;

	const sortedLinkedDocs = [...linkedDocs].sort((a, b) =>
		a.path.localeCompare(b.path),
	);

	// Section visibility
	const hasAgentsMd = agentsMdCount > 0;
	const hasClaudeCode = claudeMdCount + rulesCount + claudeSkillsCount > 0;
	const hasCopilot = copilotInstructionsCount > 0 || copilotSkills.length > 0;
	const hasCursor = cursorRulesCount > 0 || cursorSkills.length > 0;
	const hasLinkedDocs = linkedDocsCount > 0;
	const hasAnything =
		hasAgentsMd || hasClaudeCode || hasCopilot || hasCursor || hasLinkedDocs;

	if (!hasAnything) {
		return (
			<div className="glass-card p-12 text-center">
				<DocIcon className="w-12 h-12 text-slate-600 mx-auto mb-3" />
				<p className="text-sm text-slate-400">
					No context files found in this repository.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-4 animate-fade-in">
			{/* AGENTS.md section */}
			{hasAgentsMd && (
				<SectionCard
					icon={<DocIcon className="w-4 h-4 text-slate-300" />}
					title="AGENTS.md"
					count={agentsMdCount}
					countLabel="file"
				>
					<FileRow
						label="AGENTS.md"
						icon={<DocIcon className="h-4 w-4 text-slate-500" />}
						count={agentsMdCount}
						paths={sortedAgentsMdPaths}
						onAction={() => setContextFilesModalType("agents")}
						actionLabel="Browse"
					/>
				</SectionCard>
			)}

			{/* Claude Code section */}
			{hasClaudeCode && (
				<SectionCard
					icon={
						<svg
							className="w-4 h-4 text-slate-300"
							fill="currentColor"
							viewBox="0 0 16 16"
						>
							<path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
						</svg>
					}
					title="Claude Code"
					count={claudeMdCount + rulesCount + claudeSkillsCount}
					countLabel="item"
				>
					<FileRow
						label="CLAUDE.md"
						icon={<DocIcon className="h-4 w-4 text-slate-500" />}
						count={claudeMdCount}
						paths={sortedClaudeMdPaths}
						onAction={() => setContextFilesModalType("claude")}
						actionLabel="Browse"
					/>
					<FileRow
						label="Rules"
						icon={<RulesIcon className="h-4 w-4 text-slate-500" />}
						count={rulesCount}
						paths={sortedRulesPaths}
						onAction={() => setContextFilesModalType("rules")}
						actionLabel="Browse"
					/>
					{claudeSkillsCount > 0 && (
						<ItemRow
							label="Skills"
							icon={<SparklesIcon className="h-4 w-4 text-slate-500" />}
							count={claudeSkillsCount}
							chips={[...claudeSkills, ...genericSkills]
								.slice(0, 5)
								.map((s) => s.name)}
							overflowCount={
								claudeSkillsCount > 5 ? claudeSkillsCount - 5 : undefined
							}
							onAction={() => setShowSkillsModal(true)}
							actionLabel="Display all"
						/>
					)}
				</SectionCard>
			)}

			{/* GitHub Copilot section */}
			{hasCopilot && (
				<SectionCard
					icon={<CopilotLogo className="w-4 h-4 text-slate-300" />}
					title="GitHub Copilot"
					count={copilotInstructionsCount + copilotSkills.length}
					countLabel="item"
				>
					<FileRow
						label="Copilot Instructions"
						icon={<DocIcon className="h-4 w-4 text-slate-500" />}
						count={copilotInstructionsCount}
						paths={sortedCopilotInstructionsPaths}
						onAction={() => setContextFilesModalType("copilot")}
						actionLabel="Browse"
					/>
					{copilotSkills.length > 0 && (
						<ItemRow
							label="Skills"
							icon={<SparklesIcon className="h-4 w-4 text-slate-500" />}
							count={copilotSkills.length}
							chips={copilotSkills.slice(0, 5).map((s) => s.name)}
							overflowCount={
								copilotSkills.length > 5 ? copilotSkills.length - 5 : undefined
							}
							onAction={() => setShowCopilotSkillsModal(true)}
							actionLabel="Display all"
						/>
					)}
				</SectionCard>
			)}

			{/* Cursor section */}
			{hasCursor && (
				<SectionCard
					icon={<CursorLogo className="w-4 h-4 text-slate-300" />}
					title="Cursor"
					count={cursorRulesCount + cursorSkills.length}
					countLabel="item"
				>
					<FileRow
						label="Cursor Rules"
						icon={<RulesIcon className="h-4 w-4 text-slate-500" />}
						count={cursorRulesCount}
						paths={sortedCursorRulesPaths}
						onAction={() => setContextFilesModalType("cursor-rules")}
						actionLabel="Browse"
					/>
					{cursorSkills.length > 0 && (
						<ItemRow
							label="Skills"
							icon={<SparklesIcon className="h-4 w-4 text-slate-500" />}
							count={cursorSkills.length}
							chips={cursorSkills.slice(0, 5).map((s) => s.name)}
							overflowCount={
								cursorSkills.length > 5 ? cursorSkills.length - 5 : undefined
							}
							onAction={() => setShowCursorSkillsModal(true)}
							actionLabel="Display all"
						/>
					)}
				</SectionCard>
			)}

			{/* Linked Docs section */}
			{hasLinkedDocs && (
				<SectionCard
					icon={<LinkIcon className="w-4 h-4 text-slate-300" />}
					title="Linked Docs"
					count={linkedDocsCount}
					countLabel="doc"
				>
					<ItemRow
						label="Linked Docs"
						icon={<LinkIcon className="h-4 w-4 text-slate-500" />}
						count={linkedDocsCount}
						chips={sortedLinkedDocs.slice(0, 3).map((d) => d.path)}
						overflowCount={
							linkedDocsCount > 3 ? linkedDocsCount - 3 : undefined
						}
						onAction={() => setShowLinkedDocsModal(true)}
						actionLabel="Display all"
					/>
				</SectionCard>
			)}

			{/* Modals */}
			<SkillsBrowserModal
				isOpen={showSkillsModal}
				onClose={() => setShowSkillsModal(false)}
				skills={[...claudeSkills, ...genericSkills]}
			/>
			<SkillsBrowserModal
				isOpen={showCopilotSkillsModal}
				onClose={() => setShowCopilotSkillsModal(false)}
				skills={copilotSkills}
			/>
			<SkillsBrowserModal
				isOpen={showCursorSkillsModal}
				onClose={() => setShowCursorSkillsModal(false)}
				skills={cursorSkills}
			/>
			<ContextFilesBrowserModal
				isOpen={contextFilesModalType !== null}
				onClose={() => setContextFilesModalType(null)}
				contextFiles={contextFiles}
				filterType={contextFilesModalType ?? undefined}
			/>
			<LinkedDocsBrowserModal
				isOpen={showLinkedDocsModal}
				onClose={() => setShowLinkedDocsModal(false)}
				linkedDocs={linkedDocs}
			/>
		</div>
	);
};

/** Section card with header */
const SectionCard: React.FC<{
	icon: React.ReactNode;
	title: string;
	count: number;
	countLabel: string;
	children: React.ReactNode;
}> = ({ icon, title, count, countLabel, children }) => (
	<div className="glass-card p-6">
		<div className="flex items-center gap-2 mb-4">
			<span className="w-6 h-6 bg-slate-700 rounded-lg flex items-center justify-center">
				{icon}
			</span>
			<h3 className="text-base font-bold text-slate-100">{title}</h3>
			<span className="text-xs text-slate-500 ml-1">
				{count} {count === 1 ? countLabel : `${countLabel}s`}
			</span>
		</div>
		<div className="space-y-1">{children}</div>
	</div>
);

/** A row for a file-type context item (with paths) */
const FileRow: React.FC<{
	label: string;
	icon: React.ReactNode;
	count: number;
	paths: string[];
	onAction: () => void;
	actionLabel: string;
}> = ({ label, icon, count, paths, onAction, actionLabel }) => {
	if (count === 0) return null;

	return (
		<div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-800/30 transition-colors">
			<div className="flex items-center gap-3 flex-1 min-w-0">
				<span className="flex-shrink-0">{icon}</span>
				<span className="text-sm text-slate-300">{label}</span>
				<span className="text-xs bg-slate-700/60 text-slate-400 px-1.5 py-0.5 rounded">
					{count}
				</span>
				<div className="flex-1 min-w-0 ml-2">
					<div className="flex flex-wrap gap-1.5">
						{paths.slice(0, 3).map((path, i) => (
							<span
								key={i}
								className="text-xs text-slate-500 bg-slate-800/50 px-1.5 py-0.5 rounded truncate max-w-48"
								title={path}
							>
								{path}
							</span>
						))}
						{paths.length > 3 && (
							<span className="text-xs text-slate-600">
								+{paths.length - 3} more
							</span>
						)}
					</div>
				</div>
			</div>
			<button
				onClick={onAction}
				className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors ml-3 flex-shrink-0"
			>
				<span>{actionLabel}</span>
				<ExternalLinkIcon />
			</button>
		</div>
	);
};

/** A row for a non-file item (with chips preview) */
const ItemRow: React.FC<{
	label: string;
	icon: React.ReactNode;
	count: number;
	chips: string[];
	overflowCount?: number;
	onAction: () => void;
	actionLabel: string;
}> = ({ label, icon, count, chips, overflowCount, onAction, actionLabel }) => (
	<div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-800/30 transition-colors">
		<div className="flex items-center gap-3 flex-1 min-w-0">
			<span className="flex-shrink-0">{icon}</span>
			<span className="text-sm text-slate-300">{label}</span>
			<span className="text-xs bg-slate-700/60 text-slate-400 px-1.5 py-0.5 rounded">
				{count}
			</span>
			<div className="flex-1 min-w-0 ml-2">
				<div className="flex flex-wrap gap-1.5">
					{chips.map((chip, i) => (
						<span
							key={i}
							className="text-xs text-slate-500 bg-slate-800/50 px-1.5 py-0.5 rounded truncate max-w-48"
							title={chip}
						>
							{chip}
						</span>
					))}
					{overflowCount !== undefined && (
						<span className="text-xs text-slate-600">
							+{overflowCount} more
						</span>
					)}
				</div>
			</div>
		</div>
		<button
			onClick={onAction}
			className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors ml-3 flex-shrink-0"
		>
			<span>{actionLabel}</span>
			<ExternalLinkIcon />
		</button>
	</div>
);
