import React, { useCallback, useState } from "react";
import type { Metadata } from "../types/evaluation";
import { ClaudeLogo, CursorLogo, GitHubCopilotLogo } from "./AgentLogos";
import { ContextTreeView } from "./ContextTreeView";
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

export const ContextTab: React.FC<ContextTabProps> = ({ metadata }) => {
	const [viewMode, setViewMode] = useState<"list" | "tree">("list");
	const [showSkillsModal, setShowSkillsModal] = useState(false);
	const [showCopilotSkillsModal, setShowCopilotSkillsModal] = useState(false);
	const [showCursorSkillsModal, setShowCursorSkillsModal] = useState(false);
	const [showLinkedDocsModal, setShowLinkedDocsModal] = useState(false);
	const [initialSelectedPath, setInitialSelectedPath] = useState<
		string | undefined
	>(undefined);
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

	/** Handle clicks from tree view — open the appropriate modal pre-selecting the file */
	const handleTreeFileClick = useCallback((path: string, fileType: string) => {
		setInitialSelectedPath(path);
		if (fileType === "skills") {
			// Determine which skills modal to open based on the path
			if (path.startsWith(".github/skills/")) {
				setShowCopilotSkillsModal(true);
			} else if (path.startsWith(".cursor/skills/")) {
				setShowCursorSkillsModal(true);
			} else {
				setShowSkillsModal(true);
			}
		} else if (fileType === "linked-doc") {
			setShowLinkedDocsModal(true);
		} else {
			// Context file types: agents, claude, copilot, rules, cursor-rules
			setContextFilesModalType(
				fileType as "agents" | "claude" | "copilot" | "rules" | "cursor-rules",
			);
		}
	}, []);

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
		<div className="animate-fade-in">
			{/* Outer frame */}
			<div className="glass-card p-5">
				{/* Header with view toggle */}
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-sm font-semibold text-slate-300">
						Context Files
					</h2>
					<div className="flex bg-slate-800/60 rounded-lg p-0.5 border border-slate-700/50">
						<button
							onClick={() => setViewMode("list")}
							className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
								viewMode === "list"
									? "bg-indigo-600/40 text-slate-100 border border-indigo-500/40"
									: "text-slate-400 hover:text-slate-300 border border-transparent"
							}`}
							title="List view"
						>
							<svg
								className="w-4 h-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M4 6h16M4 12h16M4 18h16"
								/>
							</svg>
							List
						</button>
						<button
							onClick={() => setViewMode("tree")}
							className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
								viewMode === "tree"
									? "bg-indigo-600/40 text-slate-100 border border-indigo-500/40"
									: "text-slate-400 hover:text-slate-300 border border-transparent"
							}`}
							title="Tree view"
						>
							<svg
								className="w-4 h-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
								/>
							</svg>
							Tree
						</button>
					</div>
				</div>

				{/* Content area */}
				<div className="space-y-4">
					{/* Tree view */}
					{viewMode === "tree" && (
						<ContextTreeView
							contextFiles={contextFiles}
							skills={skills}
							linkedDocs={linkedDocs}
							onFileClick={handleTreeFileClick}
						/>
					)}

					{/* List view (original layout) */}
					{viewMode === "list" && hasAgentsMd && (
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
					{viewMode === "list" && hasClaudeCode && (
						<SectionCard
							icon={<ClaudeLogo className="w-4 h-4" />}
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
					{viewMode === "list" && hasCopilot && (
						<SectionCard
							icon={<GitHubCopilotLogo className="w-4 h-4 text-slate-300" />}
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
										copilotSkills.length > 5
											? copilotSkills.length - 5
											: undefined
									}
									onAction={() => setShowCopilotSkillsModal(true)}
									actionLabel="Display all"
								/>
							)}
						</SectionCard>
					)}

					{/* Cursor section */}
					{viewMode === "list" && hasCursor && (
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
										cursorSkills.length > 5
											? cursorSkills.length - 5
											: undefined
									}
									onAction={() => setShowCursorSkillsModal(true)}
									actionLabel="Display all"
								/>
							)}
						</SectionCard>
					)}

					{/* Linked Docs section */}
					{viewMode === "list" && hasLinkedDocs && (
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
				</div>
				{/* end content area */}
			</div>
			{/* end outer frame */}

			{/* Modals */}
			<SkillsBrowserModal
				isOpen={showSkillsModal}
				onClose={() => {
					setShowSkillsModal(false);
					setInitialSelectedPath(undefined);
				}}
				skills={[...claudeSkills, ...genericSkills]}
				initialSelectedPath={initialSelectedPath}
			/>
			<SkillsBrowserModal
				isOpen={showCopilotSkillsModal}
				onClose={() => {
					setShowCopilotSkillsModal(false);
					setInitialSelectedPath(undefined);
				}}
				skills={copilotSkills}
				initialSelectedPath={initialSelectedPath}
			/>
			<SkillsBrowserModal
				isOpen={showCursorSkillsModal}
				onClose={() => {
					setShowCursorSkillsModal(false);
					setInitialSelectedPath(undefined);
				}}
				skills={cursorSkills}
				initialSelectedPath={initialSelectedPath}
			/>
			<ContextFilesBrowserModal
				isOpen={contextFilesModalType !== null}
				onClose={() => {
					setContextFilesModalType(null);
					setInitialSelectedPath(undefined);
				}}
				contextFiles={contextFiles}
				filterType={contextFilesModalType ?? undefined}
				initialSelectedPath={initialSelectedPath}
			/>
			<LinkedDocsBrowserModal
				isOpen={showLinkedDocsModal}
				onClose={() => {
					setShowLinkedDocsModal(false);
					setInitialSelectedPath(undefined);
				}}
				linkedDocs={linkedDocs}
				initialSelectedPath={initialSelectedPath}
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
	<div className="bg-slate-800/30 border border-slate-700/40 rounded-xl p-5">
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
