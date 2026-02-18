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
import { FileChangeCard } from "./FileChangeCard";
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
	impactScore?: number;
	impactGrade?: string;
	hasRepoUrl?: boolean;
}

function hasPackmindArtifacts(actions: RemediationAction[]): boolean {
	return actions.some(
		(a) => a.outputType === "standard" || a.outputType === "skill",
	);
}

function countPackmindArtifacts(actions: RemediationAction[]): {
	standards: number;
	skills: number;
} {
	let standards = 0;
	let skills = 0;
	for (const a of actions) {
		if (a.outputType === "standard") standards++;
		else if (a.outputType === "skill") skills++;
	}
	return { standards, skills };
}

function formatArtifactCount(standards: number, skills: number): string {
	const parts: string[] = [];
	if (standards > 0)
		parts.push(`${standards} standard${standards !== 1 ? "s" : ""}`);
	if (skills > 0) parts.push(`${skills} skill${skills !== 1 ? "s" : ""}`);
	return parts.join(" & ");
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
						<span className="text-sm font-medium text-slate-200">{label}</span>
						<span
							className={`w-2 h-2 rounded-full flex-shrink-0 ${isFailed ? "bg-red-400" : "bg-green-400"}`}
						/>
						<span className="text-xs text-slate-500">{statLabel}</span>
					</div>
					<div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
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
					{!isFailed && <PatchDownload remediationId={item.id} />}
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

			{/* Impact evaluation row */}
			{!isFailed && (
				<div className="px-3 pb-2 flex items-center gap-3">
					{impactEvalStatus === "idle" &&
						!item.resultEvaluationId &&
						hasRepoUrl && (
							<button
								onClick={(e) => {
									e.stopPropagation();
									onEvaluateImpact?.();
								}}
								className="text-xs px-2.5 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-slate-100 transition-colors"
							>
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
							Evaluating impact...
						</span>
					)}
					{impactEvalStatus === "failed" && (
						<span className="text-xs text-red-400">
							Impact evaluation failed
						</span>
					)}
					{(impactEvalStatus === "completed" || item.resultEvaluationId) &&
						impactScore !== undefined &&
						parentScore !== undefined && (
							<ScoreComparison
								before={parentScore}
								after={impactScore}
								afterGrade={impactGrade}
							/>
						)}
				</div>
			)}

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
								{/* Action summary */}
								{result.summary?.parsed && (
									<CompactActionSummary summary={result.summary} />
								)}

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

								{/* File changes */}
								{result.fileChanges.length === 0 ? (
									<p className="text-sm text-slate-500">
										No file changes were made.
									</p>
								) : (
									<div className="space-y-2">
										{result.fileChanges.map((file: FileChange) => {
											const fileSummaries = getFileSummaries(file.path, result);
											return (
												<FileChangeCard
													key={file.path}
													file={file}
													defaultExpanded={result.fileChanges.length <= 3}
													summaries={fileSummaries}
												/>
											);
										})}
									</div>
								)}
							</>
						)
					)}
				</div>
			)}
		</div>
	);
}

function CompactActionSummary({
	summary,
}: {
	summary: NonNullable<RemediationResult["summary"]>;
}) {
	const allActions = [
		...summary.errorFixActions,
		...summary.suggestionEnrichActions,
	];

	return (
		<div className="bg-slate-900/30 rounded-lg p-3">
			<div className="flex items-center justify-between mb-2">
				<span className="text-xs font-semibold text-slate-300">
					Action Summary
				</span>
				<span className="text-xs text-slate-500">
					{summary.addressedCount} addressed
					{summary.skippedCount > 0 && `, ${summary.skippedCount} skipped`}
				</span>
			</div>
			<div className="space-y-1">
				{allActions.map((action) => (
					<div
						key={`${action.issueIndex}-${action.status}`}
						className="flex items-start gap-2 text-xs"
					>
						{action.status === "skipped" ? (
							<span className="text-slate-500 mt-0.5">—</span>
						) : (
							<span className="text-green-400 mt-0.5">✓</span>
						)}
						<span className="text-slate-400 flex-1">{action.summary}</span>
						{action.outputType && (
							<span
								className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 output-type-${action.outputType}`}
							>
								{action.outputType.charAt(0).toUpperCase() +
									action.outputType.slice(1)}
							</span>
						)}
						{action.file && (
							<span className="text-slate-600 font-mono">{action.file}</span>
						)}
					</div>
				))}
			</div>
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
		<div className="flex items-center gap-2 text-xs">
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

function getFileSummaries(
	filePath: string,
	result: RemediationResult,
): RemediationAction[] {
	if (!result.summary?.parsed) return [];

	const allActions = [
		...result.summary.errorFixActions,
		...result.summary.suggestionEnrichActions,
	];

	return allActions.filter(
		(a) => a.file && a.status !== "skipped" && filePath.endsWith(a.file),
	);
}
