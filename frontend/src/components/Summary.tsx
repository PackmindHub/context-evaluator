import React, { useState } from "react";
import { useFeatureFlags } from "../contexts/FeatureFlagContext";
import { extractRepoName, formatCost, formatDuration } from "../lib/formatters";
import type {
	ICuratedIssue,
	ICurationSummary,
	Metadata,
} from "../types/evaluation";
import { StatCard } from "./shared";
import { ContextFilesBrowserModal } from "./shared/ContextFilesBrowserModal";
import { LinkedDocsBrowserModal } from "./shared/LinkedDocsBrowserModal";
import { SkillsBrowserModal } from "./shared/SkillsBrowserModal";
import { ContextScoreCard } from "./summary/ContextScoreCard";

// Log entry type for activity logs
interface LogEntry {
	timestamp: Date;
	type: string;
	message: string;
}

interface SummaryProps {
	metadata: Metadata;
	repositoryUrl?: string | null;
	actualIssueCount?: number;
	actualPerFileIssueCount?: number;
	actualCrossFileIssueCount?: number;
	actualHighCount?: number;
	actualMediumCount?: number;
	actualLowCount?: number;
	actualErrorCount?: number;
	actualSuggestionCount?: number;
	curationSummary?: ICurationSummary | null;
	curatedCount?: number;
	evaluationId?: string;
	onDelete?: () => void;
	curation?: {
		errors?: {
			curatedIssues: ICuratedIssue[];
			summary: ICurationSummary;
		};
		suggestions?: {
			curatedIssues: ICuratedIssue[];
			summary: ICurationSummary;
		};
	};
	evaluationLogs?: LogEntry[];
}

export const Summary: React.FC<SummaryProps> = ({
	metadata,
	repositoryUrl,
	actualIssueCount,
	actualPerFileIssueCount,
	actualCrossFileIssueCount,
	actualHighCount,
	actualMediumCount,
	actualLowCount,
	actualErrorCount,
	actualSuggestionCount,
	curationSummary: _curationSummary,
	curatedCount,
	evaluationId,
	onDelete,
	curation,
	evaluationLogs,
}) => {
	const { cloudMode } = useFeatureFlags();
	const [showRawContext, setShowRawContext] = useState(false);
	const [copied, setCopied] = useState(false);
	const [showSkillsModal, setShowSkillsModal] = useState(false);
	const [showLinkedDocsModal, setShowLinkedDocsModal] = useState(false);
	const [contextFilesModalType, setContextFilesModalType] = useState<
		"agents" | "claude" | "copilot" | "rules" | "claude-code" | null
	>(null);
	const [showActivityLog, setShowActivityLog] = useState(false);
	const formattedDate = new Date(metadata.generatedAt).toLocaleString();
	const shareUrl = evaluationId
		? `${window.location.origin}/evaluation/${evaluationId}`
		: null;

	// Sort files alphabetically by directory hierarchy
	const sortedFiles = metadata.filesEvaluated
		? [...metadata.filesEvaluated].sort((a, b) => a.localeCompare(b))
		: [];

	const handleCopyLink = () => {
		if (evaluationId) {
			const shareUrl = `${window.location.origin}/evaluation/${evaluationId}`;
			navigator.clipboard.writeText(shareUrl).then(() => {
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			});
		}
	};

	// Use actual counts if provided, otherwise fall back to metadata
	const totalIssues = actualIssueCount ?? metadata.totalIssues ?? 0;
	const perFileIssues = actualPerFileIssueCount ?? metadata.perFileIssues ?? 0;
	const crossFileIssues =
		actualCrossFileIssueCount ?? metadata.crossFileIssues ?? 0;
	const highCount = actualHighCount ?? metadata.highCount ?? 0;
	const mediumCount = actualMediumCount ?? metadata.mediumCount ?? 0;
	const lowCount = actualLowCount ?? metadata.lowCount ?? 0;

	// Context files counting
	const agentsFilePaths = metadata.projectContext?.agentsFilePaths ?? [];
	const contextFilesFromApi = metadata.projectContext?.contextFiles ?? [];

	// Create fallback context files from agentsFilePaths for backward compatibility
	// This allows the browser modal to work with older evaluations that don't have contextFiles
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
						content: "", // No content available for old evaluations
						summary: "Re-run evaluation to load content and summary.",
					};
				});

	// Use contextFiles if available, otherwise fall back to agentsFilePaths for backward compatibility
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
	const agentsMdCount = agentsMdPaths.length;
	const claudeMdCount = claudeMdPaths.length;
	const rulesCount = rulesPaths.length;
	const copilotInstructionsCount = copilotInstructionsPaths.length;
	// Claude Code combines CLAUDE.md and .claude/rules files
	const claudeCodeCount = claudeMdCount + rulesCount;
	const skills = metadata.projectContext?.skills ?? [];
	const skillsCount = skills.length;
	const linkedDocs = metadata.projectContext?.linkedDocs ?? [];
	const linkedDocsCount = linkedDocs.length;

	// Sort paths, skills, and linked docs alphabetically for display
	const sortedAgentsMdPaths = [...agentsMdPaths].sort((a, b) =>
		a.localeCompare(b),
	);
	// Combined Claude Code paths (CLAUDE.md + rules)
	const sortedClaudeCodePaths = [...claudeMdPaths, ...rulesPaths].sort((a, b) =>
		a.localeCompare(b),
	);
	const sortedCopilotInstructionsPaths = [...copilotInstructionsPaths].sort(
		(a, b) => a.localeCompare(b),
	);
	const sortedSkills = [...skills].sort((a, b) => a.name.localeCompare(b.name));
	const sortedLinkedDocs = [...linkedDocs].sort((a, b) =>
		a.path.localeCompare(b.path),
	);
	const hasContextFiles =
		agentsMdCount > 0 ||
		claudeCodeCount > 0 ||
		copilotInstructionsCount > 0 ||
		skillsCount > 0 ||
		linkedDocsCount > 0;

	return (
		<div className="space-y-4 animate-fade-in">
			{/* Header */}
			<div className="glass-card border border-indigo-500/30 p-4">
				<div className="flex items-center justify-between py-3">
					<div className="flex-1">
						{/* Repository Name - Prominent Display */}
						{repositoryUrl && (
							<div className="flex items-center gap-2 mb-3">
								<a
									href={repositoryUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="flex items-center gap-2 hover:opacity-80 transition-opacity group"
								>
									<div className="w-8 h-8 bg-slate-700/60 rounded-lg flex items-center justify-center border border-slate-600/50 group-hover:bg-purple-700/60 transition-colors">
										<svg
											className="w-5 h-5 text-slate-300"
											fill="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												fillRule="evenodd"
												d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
												clipRule="evenodd"
											/>
										</svg>
									</div>
									<span className="text-xl md:text-2xl font-bold text-slate-100 group-hover:underline">
										{extractRepoName(repositoryUrl)}
									</span>
									<svg
										className="w-4 h-4 text-slate-400"
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
								</a>
							</div>
						)}
						<div className="flex items-center gap-2 mb-2">
							<div className="w-6 h-6 bg-slate-700/60 rounded-md flex items-center justify-center border border-slate-600/50">
								<svg
									className="h-4 w-4 text-slate-300"
									fill="currentColor"
									viewBox="0 0 20 20"
								>
									<path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
									<path
										fillRule="evenodd"
										d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
										clipRule="evenodd"
									/>
								</svg>
							</div>
							<h2 className="text-base md:text-lg font-semibold text-slate-100">
								Evaluation Summary
							</h2>
						</div>
						<div className="flex flex-wrap items-center gap-2 text-slate-300 text-xs">
							<span className="flex items-center gap-1 bg-slate-700/60 px-2 py-1 rounded-md border border-slate-600/50">
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
										d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								{formattedDate}
							</span>
							<span className="flex items-center gap-1 bg-slate-700/60 px-2 py-1 rounded-md border border-slate-600/50">
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
										d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
									/>
								</svg>
								{metadata.agent}
							</span>
							<span
								className="flex items-center gap-1 bg-slate-700/60 px-2 py-1 rounded-md border border-slate-600/50"
								title={
									metadata.evaluationMode === "unified"
										? "Unified mode: All files evaluated together for cross-file analysis"
										: "Independent mode: Each file evaluated separately"
								}
							>
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
										d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
									/>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
									/>
								</svg>
								{metadata.evaluationMode}
							</span>
						</div>
					</div>
					{/* Delete Button - hidden in cloud mode */}
					{evaluationId && onDelete && !cloudMode && (
						<button
							onClick={() => {
								if (
									confirm("Are you sure you want to delete this evaluation?")
								) {
									onDelete();
								}
							}}
							className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700/60 rounded-lg transition-all"
							title="Delete evaluation"
						>
							<svg
								className="w-6 h-6"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
								/>
							</svg>
						</button>
					)}
				</div>
			</div>

			{/* Share Report Card - Prominent Display */}
			{shareUrl && (
				<div className="glass-card p-4 border border-indigo-500/30">
					<div className="flex items-start gap-3">
						<div className="w-8 h-8 bg-indigo-600/30 rounded-lg flex items-center justify-center shrink-0">
							<svg
								className="w-4 h-4 text-indigo-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
								/>
							</svg>
						</div>
						<div className="flex-1 min-w-0">
							<p className="text-sm font-medium text-slate-200 mb-1">
								Share this report
							</p>
							<div className="flex items-center gap-2">
								<code className="text-xs text-slate-300 bg-slate-900/50 px-2 py-1 rounded truncate flex-1 block overflow-hidden">
									{shareUrl}
								</code>
								<button
									type="button"
									onClick={handleCopyLink}
									className="shrink-0 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors flex items-center gap-1.5"
								>
									{copied ? (
										<>
											<svg
												className="w-4 h-4"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M5 13l4 4L19 7"
												/>
											</svg>
											<span>Copied!</span>
										</>
									) : (
										<>
											<svg
												className="w-4 h-4"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
												/>
											</svg>
											<span>Copy Link</span>
										</>
									)}
								</button>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Context Score - Prominent Display */}
			{metadata.contextScore && (
				<ContextScoreCard contextScore={metadata.contextScore} />
			)}

			{/* Project Context */}
			{metadata.projectContext && (
				<div className="glass-card p-6">
					<h3 className="text-base font-bold text-slate-100 mb-3 flex items-center gap-2">
						<span className="w-6 h-6 bg-indigo-600 rounded-lg flex items-center justify-center">
							<svg
								className="w-4 h-4 text-white"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
								/>
							</svg>
						</span>
						Project Context
						<span className="text-xs font-normal text-slate-400 ml-2">
							(auto-detected)
						</span>
					</h3>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
						<div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
							<span className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1">
								Languages
							</span>
							<span className="text-sm text-slate-200">
								{metadata.projectContext.languages}
							</span>
						</div>
						<div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
							<span className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1">
								Frameworks
							</span>
							<span className="text-sm text-slate-200">
								{metadata.projectContext.frameworks}
							</span>
						</div>
						<div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
							<span className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1">
								Architecture
							</span>
							<span className="text-sm text-slate-200">
								{metadata.projectContext.architecture}
							</span>
						</div>
						<div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
							<span className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1">
								Patterns
							</span>
							<span className="text-sm text-slate-200">
								{metadata.projectContext.patterns}
							</span>
						</div>
					</div>

					{/* Raw Context Toggle */}
					{metadata.projectContext.raw && (
						<div className="mt-3">
							<button
								onClick={() => setShowRawContext(!showRawContext)}
								className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
							>
								<svg
									className={`w-3 h-3 transition-transform ${showRawContext ? "rotate-90" : ""}`}
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M9 5l7 7-7 7"
									/>
								</svg>
								{showRawContext ? "Hide" : "Show"} raw context
							</button>

							{showRawContext && (
								<div className="mt-2 bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
									<pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono overflow-x-auto">
										{metadata.projectContext.raw}
									</pre>
								</div>
							)}
						</div>
					)}

					{metadata.contextIdentificationCostUsd !== undefined &&
						metadata.contextIdentificationDurationMs !== undefined && (
							<div className="mt-3 pt-3 border-t border-slate-700/50 flex items-center gap-4 text-xs text-slate-400">
								<span>
									Context analysis:{" "}
									{formatCost(metadata.contextIdentificationCostUsd)}
								</span>
								<span>
									{formatDuration(metadata.contextIdentificationDurationMs)}
								</span>
							</div>
						)}
				</div>
			)}

			{/* Context Files */}
			{hasContextFiles && (
				<div className="glass-card p-6">
					<h3 className="text-base font-bold text-slate-100 mb-3 flex items-center gap-2">
						<span className="w-6 h-6 bg-slate-700 rounded-lg flex items-center justify-center">
							<svg
								className="w-4 h-4 text-slate-300"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
								/>
							</svg>
						</span>
						Claude Code
					</h3>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
						{/* AGENTS.md Card */}
						<div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
							<div className="flex items-center gap-2 mb-2">
								<svg
									className="h-5 w-5 text-slate-400"
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
								<span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
									AGENTS.md
								</span>
							</div>
							<p className="text-2xl font-bold text-slate-100 mb-2">
								{agentsMdCount}
							</p>
							{agentsMdCount > 0 && (
								<>
									<ul className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
										{sortedAgentsMdPaths.map((path, index) => (
											<li
												key={index}
												className="text-xs text-slate-400 flex items-start gap-1.5"
											>
												<span className="text-slate-500 mt-0.5">•</span>
												<span className="break-all">{path}</span>
											</li>
										))}
									</ul>
									<button
										onClick={() => setContextFilesModalType("agents")}
										className="mt-2 flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
									>
										<span>Browse</span>
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
									</button>
								</>
							)}
						</div>

						{/* Claude Code Card (CLAUDE.md + Rules combined) */}
						<div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
							<div className="flex items-center gap-2 mb-2">
								<svg
									className="h-5 w-5 text-slate-400"
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
								<span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
									CLAUDE.md + Rules
								</span>
							</div>
							<p className="text-2xl font-bold text-slate-100 mb-2">
								{claudeCodeCount}
							</p>
							{claudeCodeCount > 0 && (
								<>
									<ul className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
										{sortedClaudeCodePaths.map((path, index) => (
											<li
												key={index}
												className="text-xs text-slate-400 flex items-start gap-1.5"
											>
												<span className="text-slate-500 mt-0.5">•</span>
												<span className="break-all">{path}</span>
											</li>
										))}
									</ul>
									<button
										onClick={() => setContextFilesModalType("claude-code")}
										className="mt-2 flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
									>
										<span>Browse</span>
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
									</button>
								</>
							)}
						</div>

						{/* Github Copilot Instructions Card */}
						<div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
							<div className="flex items-center gap-2 mb-2">
								<svg
									className="h-5 w-5 text-slate-400"
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
								<span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
									Copilot Instructions
								</span>
							</div>
							<p className="text-2xl font-bold text-slate-100 mb-2">
								{copilotInstructionsCount}
							</p>
							{copilotInstructionsCount > 0 && (
								<>
									<ul className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar">
										{sortedCopilotInstructionsPaths.map((path, index) => (
											<li
												key={index}
												className="text-xs text-slate-400 flex items-start gap-1.5"
											>
												<span className="text-slate-500 mt-0.5">•</span>
												<span className="break-all">{path}</span>
											</li>
										))}
									</ul>
									<button
										onClick={() => setContextFilesModalType("copilot")}
										className="mt-2 flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
									>
										<span>Browse</span>
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
									</button>
								</>
							)}
						</div>

						{/* Skills Card */}
						<div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
							<div className="flex items-center gap-2 mb-2">
								<svg
									className="h-5 w-5 text-slate-400"
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
								<span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
									Skills
								</span>
							</div>
							<p className="text-2xl font-bold text-slate-100 mb-2">
								{skillsCount}
							</p>
							{skillsCount > 0 && (
								<>
									<ul className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar">
										{sortedSkills.map((skill, index) => (
											<li key={index} className="text-xs">
												<span className="text-slate-300 font-medium">
													{skill.name}
												</span>
												<span className="text-slate-500 ml-1">
													({skill.directory})
												</span>
												{skill.description && (
													<p
														className="text-slate-500 mt-0.5 truncate"
														title={skill.description}
													>
														{skill.description}
													</p>
												)}
											</li>
										))}
									</ul>
									<button
										onClick={() => setShowSkillsModal(true)}
										className="mt-2 flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
									>
										<span>Display all</span>
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
									</button>
								</>
							)}
						</div>

						{/* Linked Docs Card */}
						<div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
							<div className="flex items-center gap-2 mb-2">
								<svg
									className="h-5 w-5 text-slate-400"
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
								<span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
									Linked Docs
								</span>
							</div>
							<p className="text-2xl font-bold text-slate-100 mb-2">
								{linkedDocsCount}
							</p>
							{linkedDocsCount > 0 && (
								<>
									<ul className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar">
										{sortedLinkedDocs.map((doc, index) => (
											<li key={index} className="text-xs">
												<div className="text-slate-300 font-medium break-all">
													{doc.path}
												</div>
												<div className="text-slate-500 text-xs mt-0.5">
													from {doc.linkedFrom}
												</div>
												{doc.summary && (
													<p
														className="text-slate-500 mt-0.5 line-clamp-2"
														title={doc.summary}
													>
														{doc.summary}
													</p>
												)}
											</li>
										))}
									</ul>
									<button
										onClick={() => setShowLinkedDocsModal(true)}
										className="mt-2 flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
									>
										<span>Display all</span>
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
									</button>
								</>
							)}
						</div>
					</div>
				</div>
			)}

			{/* Main Stats Grid */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				<StatCard
					label="Total Files"
					value={metadata.totalFiles}
					icon={
						<svg
							className="h-8 w-8"
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
					tooltip={
						sortedFiles.length > 0 && (
							<div>
								<p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
									Files Evaluated
								</p>
								<ul className="space-y-1">
									{sortedFiles.map((file, index) => (
										<li
											key={index}
											className="text-sm text-slate-300 flex items-start gap-2"
										>
											<span className="text-slate-500 mt-1">•</span>
											<span className="break-all">{file}</span>
										</li>
									))}
								</ul>
							</div>
						)
					}
				/>
				<StatCard
					label="Total Issues"
					value={totalIssues}
					icon={
						<svg
							className="h-8 w-8"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
							/>
						</svg>
					}
				/>
				<StatCard label="Per-File Issues" value={perFileIssues} />
				<StatCard label="Cross-File Issues" value={crossFileIssues} />
			</div>

			{/* Severity & Issue Type Breakdown - Side by Side */}
			{(highCount > 0 ||
				mediumCount > 0 ||
				lowCount > 0 ||
				(actualErrorCount ?? 0) > 0 ||
				(actualSuggestionCount ?? 0) > 0) && (
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
					{/* Severity Breakdown */}
					{(highCount > 0 || mediumCount > 0 || lowCount > 0) && (
						<div className="glass-card p-6">
							<h3 className="text-base font-bold text-slate-100 mb-3 flex items-center gap-2">
								<span className="w-6 h-6 bg-slate-700 rounded-lg flex items-center justify-center">
									<svg
										className="w-4 h-4 text-slate-300"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
										/>
									</svg>
								</span>
								Severity Breakdown
							</h3>
							<div className="grid grid-cols-3 gap-3">
								{highCount > 0 && (
									<div className="card-hover stat-card-high rounded-lg p-4 group">
										<div className="flex items-center gap-3">
											<div className="severity-dot severity-dot-high w-4 h-4" />
											<div>
												<p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
													High
												</p>
												<p className="text-2xl font-bold text-orange-400">
													{highCount}
												</p>
											</div>
										</div>
									</div>
								)}
								{mediumCount > 0 && (
									<div className="card-hover stat-card-medium rounded-lg p-4 group">
										<div className="flex items-center gap-3">
											<div className="severity-dot severity-dot-medium w-4 h-4" />
											<div>
												<p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
													Medium
												</p>
												<p className="text-2xl font-bold text-yellow-400">
													{mediumCount}
												</p>
											</div>
										</div>
									</div>
								)}
								{lowCount > 0 && (
									<div className="card-hover stat-card-low rounded-lg p-4 group">
										<div className="flex items-center gap-3">
											<div className="severity-dot severity-dot-low w-4 h-4" />
											<div>
												<p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
													Low
												</p>
												<p className="text-2xl font-bold text-slate-400">
													{lowCount}
												</p>
											</div>
										</div>
									</div>
								)}
							</div>
						</div>
					)}

					{/* Issue Type Breakdown */}
					{((actualErrorCount ?? 0) > 0 ||
						(actualSuggestionCount ?? 0) > 0) && (
						<div className="glass-card p-6">
							<h3 className="text-base font-bold text-slate-100 mb-3 flex items-center gap-2">
								<span className="w-6 h-6 bg-slate-700 rounded-lg flex items-center justify-center">
									<svg
										className="w-4 h-4 text-slate-300"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M4 6h16M4 12h16M4 18h7"
										/>
									</svg>
								</span>
								Issue Type Breakdown
							</h3>
							<div className="grid grid-cols-2 gap-3">
								{(actualErrorCount ?? 0) > 0 && (
									<div className="card-hover bg-slate-800/80 border border-slate-700/60 rounded-lg p-4 group">
										<div className="flex items-center gap-3">
											<svg
												className="w-5 h-5 text-red-400"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
												/>
											</svg>
											<div>
												<p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
													Errors
												</p>
												<p className="text-2xl font-bold text-slate-100">
													{actualErrorCount}
												</p>
												<p className="text-xs text-slate-500">
													Problems to fix
												</p>
											</div>
										</div>
									</div>
								)}
								{(actualSuggestionCount ?? 0) > 0 && (
									<div className="card-hover bg-slate-800/80 border border-slate-700/60 rounded-lg p-4 group">
										<div className="flex items-center gap-3">
											<svg
												className="w-5 h-5 text-indigo-400"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
												/>
											</svg>
											<div>
												<p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
													Suggestions
												</p>
												<p className="text-2xl font-bold text-slate-100">
													{actualSuggestionCount}
												</p>
												<p className="text-xs text-slate-500">
													Opportunities to improve
												</p>
											</div>
										</div>
									</div>
								)}
							</div>
						</div>
					)}
				</div>
			)}

			{/* Curated Issues Breakdown - Dual Curation */}
			{curation && (curatedCount ?? 0) > 0 && (
				<div className="glass-card p-6">
					<h3 className="text-base font-bold text-slate-100 mb-3 flex items-center gap-2">
						<span className="w-6 h-6 bg-slate-700 rounded-lg flex items-center justify-center">
							<svg
								className="w-4 h-4 text-slate-300"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M13 10V3L4 14h7v7l9-11h-7z"
								/>
							</svg>
						</span>
						Curated Issues Breakdown
						<span className="text-xs font-normal text-slate-400 ml-2">
							(AI-selected high-impact issues)
						</span>
					</h3>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
						{/* Curated Errors */}
						{curation.errors && (
							<div className="card-hover bg-slate-800/80 border border-slate-700/60 rounded-lg p-4">
								<div className="flex items-center gap-3">
									<svg
										className="w-5 h-5 text-red-400"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
										/>
									</svg>
									<div>
										<p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
											Top Errors
										</p>
										<p className="text-2xl font-bold text-slate-100">
											{curation.errors.curatedIssues.length}
										</p>
										<p className="text-xs text-slate-500">
											from {curation.errors.summary.totalIssuesReviewed}{" "}
											reviewed
										</p>
									</div>
								</div>
							</div>
						)}

						{/* Curated Suggestions */}
						{curation.suggestions && (
							<div className="card-hover bg-slate-800/80 border border-slate-700/60 rounded-lg p-4">
								<div className="flex items-center gap-3">
									<svg
										className="w-5 h-5 text-indigo-400"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
										/>
									</svg>
									<div>
										<p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
											Top Suggestions
										</p>
										<p className="text-2xl font-bold text-slate-100">
											{curation.suggestions.curatedIssues.length}
										</p>
										<p className="text-xs text-slate-500">
											from {curation.suggestions.summary.totalIssuesReviewed}{" "}
											reviewed
										</p>
									</div>
								</div>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Activity Log - Collapsible */}
			{evaluationLogs && evaluationLogs.length > 0 && (
				<div className="glass-card p-6">
					<button
						onClick={() => setShowActivityLog(!showActivityLog)}
						className="w-full flex items-center justify-between text-left"
					>
						<h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
							<span className="w-6 h-6 bg-slate-700 rounded-lg flex items-center justify-center">
								<svg
									className="w-4 h-4 text-slate-300"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
									/>
								</svg>
							</span>
							Activity Log
							<span className="text-xs font-normal text-slate-400 ml-2">
								({evaluationLogs.length} entries)
							</span>
						</h3>
						<svg
							className={`w-5 h-5 text-slate-400 transition-transform ${showActivityLog ? "rotate-180" : ""}`}
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M19 9l-7 7-7-7"
							/>
						</svg>
					</button>

					{showActivityLog && (
						<div className="mt-4 bg-slate-900/50 rounded-lg p-4 max-h-64 overflow-y-auto custom-scrollbar border border-slate-700/30">
							<div className="space-y-2">
								{evaluationLogs
									.slice()
									.reverse()
									.map((log, index) => (
										<div key={index} className="flex items-start gap-3 text-xs">
											<span className="text-slate-500 shrink-0 font-mono">
												{log.timestamp instanceof Date
													? log.timestamp.toLocaleTimeString()
													: new Date(log.timestamp).toLocaleTimeString()}
											</span>
											<span
												className={`
													${log.type === "success" ? "text-green-400" : ""}
													${log.type === "error" ? "text-red-400" : ""}
													${log.type === "warning" ? "text-yellow-400" : ""}
													${log.type === "info" ? "text-slate-300" : ""}
												`}
											>
												{log.message}
											</span>
										</div>
									))}
							</div>
						</div>
					)}
				</div>
			)}

			{/* Skills Browser Modal */}
			<SkillsBrowserModal
				isOpen={showSkillsModal}
				onClose={() => setShowSkillsModal(false)}
				skills={skills}
			/>

			{/* Context Files Browser Modal */}
			<ContextFilesBrowserModal
				isOpen={contextFilesModalType !== null}
				onClose={() => setContextFilesModalType(null)}
				contextFiles={contextFiles}
				filterType={contextFilesModalType ?? undefined}
			/>

			{/* Linked Docs Browser Modal */}
			<LinkedDocsBrowserModal
				isOpen={showLinkedDocsModal}
				onClose={() => setShowLinkedDocsModal(false)}
				linkedDocs={linkedDocs}
			/>
		</div>
	);
};
