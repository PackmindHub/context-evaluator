/**
 * Compact card for a single past remediation with expand-to-full-details.
 */

import { useMemo, useState } from "react";
import type {
	FileChange,
	RemediationAction,
	RemediationHistoryItem,
	RemediationResult,
} from "../types/remediation";
import {
	countPackmindArtifacts,
	formatArtifactCount,
} from "../utils/packmind-artifacts";
import { DiffViewer } from "./DiffViewer";
import { PatchDownload } from "./PatchDownload";
import { PackmindLogo } from "./shared/PackmindLogo";
import { PackmindProductTourModal } from "./shared/PackmindProductTourModal";

export type ImpactEvalStatus = "idle" | "running" | "completed" | "failed";

interface RemediationHistoryCardProps {
	item: RemediationHistoryItem;
	index: number;
	total: number;
	expanded: boolean;
	onToggle: () => void;
	onDelete: () => void;
	onEvaluateImpact?: () => void;
	cloudMode?: boolean;
	parentScore?: number;
	parentGrade?: string;
	impactEvalStatus?: ImpactEvalStatus;
	impactJobId?: string;
	impactScore?: number;
	impactGrade?: string;
	hasRepoUrl?: boolean;
}

function hasPackmindArtifacts(actions: RemediationAction[]): boolean {
	return actions.some(
		(a) => a.outputType === "standard" || a.outputType === "skill",
	);
}

function formatTimestamp(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function RemediationHistoryCard({
	item,
	index,
	total,
	expanded,
	onToggle,
	onDelete,
	onEvaluateImpact,
	cloudMode = false,
	parentScore,
	impactEvalStatus = "idle",
	impactJobId,
	impactScore,
	impactGrade,
	hasRepoUrl = true,
}: RemediationHistoryCardProps) {
	const [showTourModal, setShowTourModal] = useState(false);
	const label = `Remediation #${total - index}`;
	const statLabel = `${item.errorCount} error${item.errorCount !== 1 ? "s" : ""}, ${item.suggestionCount} suggestion${item.suggestionCount !== 1 ? "s" : ""}`;
	const isFailed = item.status === "failed";

	const result: RemediationResult | null = useMemo(() => {
		if (isFailed) return null;
		return {
			fullPatch: item.fullPatch ?? "",
			fileChanges: item.fileChanges ?? [],
			totalAdditions: item.totalAdditions,
			totalDeletions: item.totalDeletions,
			filesChanged: item.filesChanged,
			totalDurationMs: item.totalDurationMs,
			totalCostUsd: item.totalCostUsd,
			totalInputTokens: item.totalInputTokens,
			totalOutputTokens: item.totalOutputTokens,
			summary: item.summary ?? undefined,
			errorFixStats: item.promptStats?.errorFixStats,
			suggestionEnrichStats: item.promptStats?.suggestionEnrichStats,
			errorPlanStats: item.promptStats?.errorPlanStats,
			suggestionPlanStats: item.promptStats?.suggestionPlanStats,
		};
	}, [item, isFailed]);

	return (
		<div className="bg-slate-800/50 rounded-lg border border-slate-700/50">
			{/* Collapsed header */}
			<button
				onClick={onToggle}
				className="w-full flex items-center gap-3 p-3 text-left"
			>
				<svg
					className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${expanded ? "rotate-90" : ""}`}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M9 5l7 7-7 7"
					/>
				</svg>

				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span className="text-base font-semibold text-slate-200">
							{label}
						</span>
						<span
							className={`w-2 h-2 rounded-full flex-shrink-0 ${isFailed ? "bg-red-400" : "bg-green-400"}`}
						/>
						<span className="text-sm text-slate-500">{statLabel}</span>
					</div>
					<div className="flex items-center gap-3 text-sm text-slate-500 mt-0.5">
						<span>{formatTimestamp(item.createdAt)}</span>
						{!isFailed && (
							<>
								<span>
									{item.filesChanged} file
									{item.filesChanged !== 1 ? "s" : ""}
								</span>
								<span>
									<span className="text-green-400">+{item.totalAdditions}</span>
									<span className="text-red-400 ml-1">
										-{item.totalDeletions}
									</span>
								</span>
								{item.totalDurationMs > 0 && (
									<span>{Math.round(item.totalDurationMs / 1000)}s</span>
								)}
								{item.totalCostUsd > 0 && (
									<span>${item.totalCostUsd.toFixed(4)}</span>
								)}
							</>
						)}
						{isFailed && <span className="text-red-400">Failed</span>}
					</div>
				</div>

				{/* Quick actions (stop propagation so clicks don't toggle) */}
				<div
					className="flex items-center gap-2 flex-shrink-0"
					onClick={(e) => e.stopPropagation()}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") e.stopPropagation();
					}}
				>
					{!isFailed && (
						<>
							{impactEvalStatus === "idle" &&
								!item.resultEvaluationId &&
								hasRepoUrl && (
									<button
										onClick={(e) => {
											e.stopPropagation();
											onEvaluateImpact?.();
										}}
										className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-500 transition-all duration-200"
									>
										<svg
											className="w-3.5 h-3.5"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
											/>
										</svg>
										Evaluate Impact
									</button>
								)}
							{impactEvalStatus === "running" && (
								<span className="flex items-center gap-1.5 text-xs text-slate-400">
									<svg
										className="animate-spin h-3 w-3"
										fill="none"
										viewBox="0 0 24 24"
									>
										<circle
											className="opacity-25"
											cx="12"
											cy="12"
											r="10"
											stroke="currentColor"
											strokeWidth="4"
										/>
										<path
											className="opacity-75"
											fill="currentColor"
											d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
										/>
									</svg>
									Evaluating...
									{impactJobId && (
										<a
											href={`/evaluation/${impactJobId}`}
											className="text-blue-400 hover:text-blue-300 underline"
											onClick={(e) => e.stopPropagation()}
										>
											Track →
										</a>
									)}
								</span>
							)}
							{impactEvalStatus === "failed" && (
								<span className="text-xs text-red-400">Impact failed</span>
							)}
							{(impactEvalStatus === "completed" || item.resultEvaluationId) &&
								impactScore !== undefined &&
								parentScore !== undefined && (
									<a
										href={`/evaluation/${item.resultEvaluationId || impactJobId}`}
										className="hover:underline"
										onClick={(e) => e.stopPropagation()}
									>
										<ScoreComparison
											before={parentScore}
											after={impactScore}
											afterGrade={impactGrade}
										/>
									</a>
								)}
							<PatchDownload remediationId={item.id} />
						</>
					)}
					{!cloudMode && (
						<button
							onClick={onDelete}
							className="text-slate-500 hover:text-red-400 transition-colors p-1"
							title="Delete remediation"
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
									d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
								/>
							</svg>
						</button>
					)}
				</div>
			</button>

			{/* Expanded details */}
			{expanded && (
				<div className="border-t border-slate-700/50 p-3 space-y-4">
					{isFailed ? (
						<div className="text-sm text-red-400">
							{item.errorMessage || "Remediation failed"}
						</div>
					) : (
						result && (
							<>
								{/* Plan sections (collapsible, debug mode only) */}
								{new URLSearchParams(window.location.search).get("debug") ===
									"true" && (
									<>
										{item.planData?.errorPlanPrompt && (
											<CollapsiblePlanSection
												title="Error Fix Plan Prompt"
												content={item.planData.errorPlanPrompt}
											/>
										)}
										{item.planData?.errorPlan && (
											<CollapsiblePlanSection
												title="Error Fix Plan"
												content={item.planData.errorPlan}
											/>
										)}
										{item.planData?.errorFixPrompt && (
											<CollapsiblePlanSection
												title="Error Fix Execution Prompt"
												content={item.planData.errorFixPrompt}
											/>
										)}
										{item.planData?.suggestionPlanPrompt && (
											<CollapsiblePlanSection
												title="Suggestion Plan Prompt"
												content={item.planData.suggestionPlanPrompt}
											/>
										)}
										{item.planData?.suggestionPlan && (
											<CollapsiblePlanSection
												title="Suggestion Enrichment Plan"
												content={item.planData.suggestionPlan}
											/>
										)}
										{item.planData?.suggestionEnrichPrompt && (
											<CollapsiblePlanSection
												title="Suggestion Execution Prompt"
												content={item.planData.suggestionEnrichPrompt}
											/>
										)}
									</>
								)}

								{/* Unified file list (replaces CompactActionSummary + FileChangeCard rows) */}
								<UnifiedFilesSection result={result} />

								{/* Packmind promotion banner */}
								{result.summary?.parsed &&
									(() => {
										const allActions = [
											...(result.summary?.errorFixActions ?? []),
											...(result.summary?.suggestionEnrichActions ?? []),
										];
										if (!hasPackmindArtifacts(allActions)) return null;
										const { standards, skills } =
											countPackmindArtifacts(allActions);
										return (
											<div className="packmind-banner">
												<div className="flex items-start gap-3">
													<PackmindLogo className="h-6 flex-shrink-0 mt-0.5" />
													<div className="flex-1 min-w-0">
														<p className="text-xs font-semibold text-slate-200 mb-1">
															Take It Further with Packmind
														</p>
														<p className="text-xs text-slate-400">
															You've created{" "}
															{formatArtifactCount(standards, skills)}.
															Centralize, govern and distribute your AI agent
															playbook at scale with Packmind.
														</p>
														<div className="flex gap-2 mt-2">
															<a
																href="https://packmind.com"
																target="_blank"
																rel="noopener noreferrer"
																className="btn-secondary text-xs py-1 px-2"
															>
																packmind.com
															</a>
															<button
																onClick={() => setShowTourModal(true)}
																className="btn-primary text-xs py-1 px-2"
															>
																Get product tour
															</button>
														</div>
													</div>
												</div>
												<PackmindProductTourModal
													isOpen={showTourModal}
													onClose={() => setShowTourModal(false)}
												/>
											</div>
										);
									})()}
							</>
						)
					)}
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// UnifiedFilesSection
// ---------------------------------------------------------------------------

interface UnifiedFileEntry {
	key: string;
	actions: RemediationAction[];
	fileChanges: FileChange[];
	totalAdditions: number;
	totalDeletions: number;
	displayStatus: "added" | "modified" | "deleted" | null;
}

function buildUnifiedEntries(result: RemediationResult): {
	entries: UnifiedFileEntry[];
	skippedActions: RemediationAction[];
} {
	const allActions = result.summary?.parsed
		? [
				...result.summary.errorFixActions,
				...result.summary.suggestionEnrichActions,
			]
		: [];

	const addressedActions = allActions.filter((a) => a.status !== "skipped");
	const skippedActions = allActions.filter((a) => a.status === "skipped");

	// Group addressed actions by file key
	const groupMap = new Map<string, RemediationAction[]>();
	for (const action of addressedActions) {
		const key = action.file ?? "General changes";
		if (!groupMap.has(key)) groupMap.set(key, []);
		groupMap.get(key)?.push(action);
	}

	// Track which fileChanges have been matched
	const matchedFilePaths = new Set<string>();

	const entriesFromActions: UnifiedFileEntry[] = [...groupMap.keys()].map(
		(key) => {
			const filenames = key.split(" + ").map((f) => f.trim());
			const matched: FileChange[] = [];
			for (const filename of filenames) {
				for (const fc of result.fileChanges) {
					if (fc.path.endsWith(filename)) {
						matched.push(fc);
						matchedFilePaths.add(fc.path);
					}
				}
			}
			const totalAdditions = matched.reduce((s, fc) => s + fc.additions, 0);
			const totalDeletions = matched.reduce((s, fc) => s + fc.deletions, 0);
			const displayStatus = computeDisplayStatus(matched);
			return {
				key,
				actions: groupMap.get(key) ?? [],
				fileChanges: matched,
				totalAdditions,
				totalDeletions,
				displayStatus,
			};
		},
	);

	// Add fileChanges not matched by any action group
	const unmatchedEntries: UnifiedFileEntry[] = result.fileChanges
		.filter((fc) => !matchedFilePaths.has(fc.path))
		.map((fc) => ({
			key: fc.path,
			actions: [],
			fileChanges: [fc],
			totalAdditions: fc.additions,
			totalDeletions: fc.deletions,
			displayStatus: fc.status,
		}));

	// Sort: "General changes" last, then alphabetical
	const allEntries = [...entriesFromActions, ...unmatchedEntries].sort(
		(a, b) => {
			if (a.key === "General changes") return 1;
			if (b.key === "General changes") return -1;
			return a.key.localeCompare(b.key);
		},
	);

	return { entries: allEntries, skippedActions };
}

function computeDisplayStatus(
	fileChanges: FileChange[],
): "added" | "modified" | "deleted" | null {
	if (fileChanges.length === 0) return null;
	// Priority: modified > deleted > added
	if (fileChanges.some((fc) => fc.status === "modified")) return "modified";
	if (fileChanges.some((fc) => fc.status === "deleted")) return "deleted";
	return "added";
}

type SectionType = "rules" | "skills" | "context" | "other";

interface GroupedSection {
	type: SectionType;
	label: string;
	entries: UnifiedFileEntry[];
}

function categorizeEntry(entry: UnifiedFileEntry): SectionType {
	// Primary: use outputType from first action
	if (entry.actions.length > 0) {
		const outputType = entry.actions[0].outputType;
		if (outputType === "standard") return "rules";
		if (outputType === "skill") return "skills";
		if (outputType === "generic") return "context";
	}
	// Fallback: path-based heuristics for unmatched entries
	const key = entry.key.toLowerCase();
	if (key.includes("agents.md") || key.includes("claude.md")) return "context";
	if (key.includes("/rules/") || key.includes("/standards/")) return "rules";
	if (key.includes("/skills/")) return "skills";
	return "other";
}

function groupEntriesBySections(entries: UnifiedFileEntry[]): GroupedSection[] {
	const buckets: Record<SectionType, UnifiedFileEntry[]> = {
		rules: [],
		skills: [],
		context: [],
		other: [],
	};
	for (const entry of entries) {
		buckets[categorizeEntry(entry)].push(entry);
	}
	const sectionDefs: { type: SectionType; label: string }[] = [
		{ type: "rules", label: "Rules" },
		{ type: "skills", label: "Skills" },
		{ type: "context", label: "Context Files" },
		{ type: "other", label: "Other" },
	];
	return sectionDefs
		.filter((s) => buckets[s.type].length > 0)
		.map((s) => ({ ...s, entries: buckets[s.type] }));
}

function SectionIcon({ type }: { type: SectionType }) {
	const cls = "w-3.5 h-3.5 flex-shrink-0";
	switch (type) {
		case "rules":
			return (
				<svg
					className={cls}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
			);
		case "skills":
			return (
				<svg
					className={cls}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M13 10V3L4 14h7v7l9-11h-7z"
					/>
				</svg>
			);
		case "context":
			return (
				<svg
					className={cls}
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
		default:
			return (
				<svg
					className={cls}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M5 12h.01M12 12h.01M19 12h.01"
					/>
				</svg>
			);
	}
}

function UnifiedFilesSection({ result }: { result: RemediationResult }) {
	const { entries, skippedActions } = useMemo(
		() => buildUnifiedEntries(result),
		[result],
	);
	const [skippedOpen, setSkippedOpen] = useState(false);

	const addressedCount = result.summary?.addressedCount ?? 0;
	const skippedCount = result.summary?.skippedCount ?? 0;

	const sections = useMemo(() => groupEntriesBySections(entries), [entries]);

	if (entries.length === 0 && skippedActions.length === 0) {
		return <p className="text-sm text-slate-500">No file changes were made.</p>;
	}

	return (
		<div className="bg-slate-900/30 rounded-lg p-3">
			{/* Section header */}
			<div className="flex items-center justify-between mb-2">
				<span className="text-xs font-semibold text-slate-300">
					Action Summary
				</span>
				{result.summary?.parsed && (
					<span className="text-xs text-slate-500">
						{addressedCount} addressed
						{skippedCount > 0 && `, ${skippedCount} skipped`}
					</span>
				)}
			</div>

			{/* Grouped sections */}
			{sections.length > 0 && (
				<div className="space-y-3">
					{sections.map((section) => (
						<div key={section.type} className="space-y-1">
							{/* Section header row */}
							<div className="action-summary-section-header">
								<span className="action-summary-section-title">
									<SectionIcon type={section.type} />
									{section.label}
								</span>
								<span className="action-summary-section-count">
									{section.entries.length} file
									{section.entries.length !== 1 ? "s" : ""}
								</span>
							</div>
							{/* Entry rows */}
							{section.entries.map((entry) => (
								<UnifiedFileRow key={entry.key} entry={entry} />
							))}
						</div>
					))}
				</div>
			)}

			{/* Skipped actions */}
			{skippedActions.length > 0 && (
				<div className="mt-2">
					<button
						onClick={() => setSkippedOpen(!skippedOpen)}
						className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-400 transition-colors"
					>
						<svg
							className={`w-3 h-3 transition-transform ${skippedOpen ? "rotate-90" : ""}`}
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M9 5l7 7-7 7"
							/>
						</svg>
						Skipped ({skippedActions.length})
					</button>
					{skippedOpen && (
						<div className="space-y-1 pl-4 mt-1">
							{skippedActions.map((action) => (
								<div
									key={`${action.issueIndex}-${action.status}`}
									className="flex items-start gap-2 text-xs"
								>
									<span className="text-slate-500 mt-0.5">—</span>
									<span className="text-slate-500 flex-1">
										{action.summary}
									</span>
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function UnifiedFileRow({ entry }: { entry: UnifiedFileEntry }) {
	const [expanded, setExpanded] = useState(false);
	const hasDiff = entry.fileChanges.length > 0;

	const badgeClass =
		entry.displayStatus === "added"
			? "change-badge-added"
			: entry.displayStatus === "deleted"
				? "change-badge-deleted"
				: entry.displayStatus === "modified"
					? "change-badge-modified"
					: "";

	return (
		<div>
			<div className="action-summary-row">
				{/* Column 1: File path */}
				<div className="action-summary-cell-file flex items-start gap-1.5">
					{hasDiff ? (
						<button
							onClick={() => setExpanded(!expanded)}
							className="flex-shrink-0 text-slate-400 hover:text-slate-300 transition-colors mt-0.5"
							aria-label={expanded ? "Collapse diff" : "Expand diff"}
						>
							<svg
								className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M9 5l7 7-7 7"
								/>
							</svg>
						</button>
					) : (
						<span className="w-3.5 h-3.5 flex-shrink-0" />
					)}
					<span className="font-mono text-xs text-slate-200 break-all">
						{entry.key}
					</span>
				</div>

				{/* Column 2: Issues fixed */}
				<div className="action-summary-cell-description">
					{entry.actions.length > 0 ? (
						<div className="space-y-0.5">
							{entry.actions.map((action) => (
								<div
									key={`${action.issueIndex}-${action.status}`}
									className="flex items-start gap-1.5 text-xs"
								>
									<span className="text-green-400 flex-shrink-0">✓</span>
									<span className="text-slate-400">{action.summary}</span>
								</div>
							))}
						</div>
					) : (
						<span className="text-xs text-slate-600">&mdash;</span>
					)}
				</div>

				{/* Column 3: Badge + line counts */}
				<div className="action-summary-cell-badge">
					{entry.displayStatus && (
						<span
							className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${badgeClass}`}
						>
							{entry.displayStatus}
						</span>
					)}
					{(entry.totalAdditions > 0 || entry.totalDeletions > 0) && (
						<span className="flex items-center gap-1 text-xs flex-shrink-0">
							{entry.totalAdditions > 0 && (
								<span className="text-green-400">+{entry.totalAdditions}</span>
							)}
							{entry.totalDeletions > 0 && (
								<span className="text-red-400">-{entry.totalDeletions}</span>
							)}
						</span>
					)}
				</div>
			</div>

			{/* Expanded diff — full width below the grid */}
			{expanded && (
				<div className="border border-t-0 border-slate-700/40 rounded-b pt-2 pb-2 space-y-2 bg-slate-800/30">
					{entry.fileChanges.map((fc) => (
						<DiffViewer key={fc.path} diff={fc.diff} />
					))}
				</div>
			)}
		</div>
	);
}

function ScoreComparison({
	before,
	after,
	afterGrade,
}: {
	before: number;
	after: number;
	afterGrade?: string;
}) {
	const delta = after - before;
	const deltaSign = delta > 0 ? "+" : "";
	const deltaColor =
		delta > 0
			? "text-green-400"
			: delta < 0
				? "text-red-400"
				: "text-slate-400";

	return (
		<div className="flex items-center gap-2 text-sm">
			<span className="text-slate-400">Score:</span>
			<span className="text-slate-300">{before.toFixed(1)}</span>
			<span className="text-slate-500">&rarr;</span>
			<span className="text-slate-200 font-medium">{after.toFixed(1)}</span>
			<span className={`font-medium ${deltaColor}`}>
				({deltaSign}
				{delta.toFixed(1)})
			</span>
			{afterGrade && <span className="text-slate-500">{afterGrade}</span>}
		</div>
	);
}

function CollapsiblePlanSection({
	title,
	content,
}: {
	title: string;
	content: string;
}) {
	const [open, setOpen] = useState(false);

	return (
		<div className="bg-slate-900/30 rounded-lg border border-slate-700/50">
			<button
				onClick={() => setOpen(!open)}
				className="w-full flex items-center gap-2 p-2.5 text-left"
			>
				<svg
					className={`w-3 h-3 text-slate-400 transition-transform flex-shrink-0 ${open ? "rotate-90" : ""}`}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M9 5l7 7-7 7"
					/>
				</svg>
				<span className="text-xs font-semibold text-slate-400">{title}</span>
			</button>
			{open && (
				<div className="px-3 pb-3 border-t border-slate-700/30">
					<pre className="text-xs text-slate-400 whitespace-pre-wrap font-mono mt-2 max-h-64 overflow-y-auto custom-scrollbar">
						{content}
					</pre>
				</div>
			)}
		</div>
	);
}
