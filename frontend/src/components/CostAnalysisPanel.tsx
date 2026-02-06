import React from "react";
import {
	formatCost,
	formatDuration,
	formatTokenUsage,
} from "../lib/formatters";
import type { Metadata } from "../types/evaluation";

interface CostAnalysisPanelProps {
	metadata: Metadata;
}

export const CostAnalysisPanel: React.FC<CostAnalysisPanelProps> = ({
	metadata,
}) => {
	const hasTokenData =
		metadata.totalInputTokens !== undefined &&
		metadata.totalOutputTokens !== undefined;
	const hasCostData =
		metadata.totalCostUsd !== undefined ||
		metadata.totalDurationMs !== undefined;

	if (!hasTokenData && !hasCostData) {
		return (
			<div className="card text-center py-12">
				<svg
					className="w-12 h-12 text-slate-600 mx-auto mb-4"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<p className="text-slate-400">No cost or performance data available</p>
			</div>
		);
	}

	return (
		<div className="space-y-4 animate-fade-in">
			{/* Header */}
			<div className="card">
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center">
						<svg
							className="w-6 h-6 text-slate-300"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					</div>
					<div>
						<h3 className="text-base font-bold text-slate-100">
							Cost & Performance Analysis
						</h3>
						<p className="text-xs text-slate-400">
							Resource usage and evaluation costs
						</p>
					</div>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
				{/* Token Usage */}
				{hasTokenData && (
					<div className="card card-hover">
						<div className="flex items-center gap-2 mb-4">
							<div className="w-6 h-6 bg-slate-700 rounded-md flex items-center justify-center">
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
							</div>
							<h3 className="text-base font-bold text-slate-100">
								Token Usage
							</h3>
						</div>
						<div className="space-y-2">
							<div className="flex justify-between items-center py-2 border-b border-slate-700">
								<span className="text-sm font-medium text-slate-400">
									Input tokens
								</span>
								<span className="font-mono text-sm font-bold text-slate-100">
									{formatTokenUsage(metadata.totalInputTokens!)}
								</span>
							</div>
							<div className="flex justify-between items-center py-2 border-b border-slate-700">
								<span className="text-sm font-medium text-slate-400">
									Output tokens
								</span>
								<span className="font-mono text-sm font-bold text-slate-100">
									{formatTokenUsage(metadata.totalOutputTokens!)}
								</span>
							</div>
							{metadata.totalCacheCreationTokens !== undefined &&
								metadata.totalCacheCreationTokens > 0 && (
									<div className="flex justify-between items-center py-2 border-b border-slate-700">
										<span className="text-sm font-medium text-slate-400">
											Cache creation
										</span>
										<span className="font-mono text-sm font-bold text-slate-100">
											{formatTokenUsage(metadata.totalCacheCreationTokens)}
										</span>
									</div>
								)}
							{metadata.totalCacheReadTokens !== undefined &&
								metadata.totalCacheReadTokens > 0 && (
									<div className="flex justify-between items-center py-2 border-b border-slate-700">
										<span className="text-sm font-medium text-slate-400">
											Cache read
										</span>
										<span className="font-mono text-sm font-bold text-slate-100">
											{formatTokenUsage(metadata.totalCacheReadTokens)}
										</span>
									</div>
								)}
							<div className="pt-3 mt-2 border-t border-slate-600">
								<div className="flex justify-between items-center">
									<span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
										Total
									</span>
									<span className="font-mono text-lg font-bold text-slate-100">
										{formatTokenUsage(
											metadata.totalInputTokens! +
												metadata.totalOutputTokens! +
												(metadata.totalCacheCreationTokens || 0) +
												(metadata.totalCacheReadTokens || 0),
										)}
									</span>
								</div>
							</div>
						</div>
					</div>
				)}

				{/* Cost & Duration */}
				<div className="card card-hover">
					<div className="flex items-center gap-2 mb-4">
						<div className="w-6 h-6 bg-slate-700 rounded-md flex items-center justify-center">
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
									d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
						</div>
						<h3 className="text-base font-bold text-slate-100">
							Cost & Performance
						</h3>
					</div>
					<div className="space-y-4">
						{/* Hero Summary Section - Total Investment & Processing Time */}
						<div className="grid grid-cols-2 gap-3">
							{metadata.totalCostUsd !== undefined && (
								<div className="cost-hero-card">
									<span className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-2">
										Total Investment
									</span>
									<span className="font-mono text-2xl font-bold text-slate-100">
										{formatCost(metadata.totalCostUsd)}
									</span>
								</div>
							)}
							{metadata.totalDurationMs !== undefined && (
								<div className="cost-hero-card">
									<span className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-2">
										Processing Time
									</span>
									<span className="font-mono text-2xl font-bold text-slate-100">
										{formatDuration(metadata.totalDurationMs)}
									</span>
								</div>
							)}
						</div>

						{/* Detail Cards Grid - Context Analysis, Evaluators, Curation, Deduplication */}
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
							{metadata.contextIdentificationCostUsd !== undefined && (
								<div className="cost-detail-card">
									<span className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1">
										Context Analysis
									</span>
									<div className="flex items-baseline gap-2">
										<span className="font-mono text-lg font-bold text-slate-100">
											{formatCost(metadata.contextIdentificationCostUsd)}
										</span>
										{metadata.contextIdentificationDurationMs !== undefined && (
											<span className="text-xs text-slate-400">
												(
												{formatDuration(
													metadata.contextIdentificationDurationMs,
												)}
												)
											</span>
										)}
									</div>
								</div>
							)}
							{/* Evaluators Cost Section - calculated as total minus other costs */}
							{metadata.totalCostUsd !== undefined &&
								(() => {
									const contextCost =
										metadata.contextIdentificationCostUsd ?? 0;
									const curationCost =
										metadata.totalCurationCostUsd ??
										metadata.curationCostUsd ??
										0;
									const deduplicationCost =
										metadata.deduplicationPhase2CostUsd ?? 0;
									const evaluatorCost =
										metadata.totalCostUsd -
										contextCost -
										curationCost -
										deduplicationCost;

									// Calculate evaluator duration similarly
									const contextDuration =
										metadata.contextIdentificationDurationMs ?? 0;
									const curationDuration =
										metadata.totalCurationDurationMs ??
										metadata.curationDurationMs ??
										0;
									const deduplicationDuration =
										metadata.deduplicationPhase2DurationMs ?? 0;
									const evaluatorDuration =
										metadata.totalDurationMs !== undefined
											? metadata.totalDurationMs -
												contextDuration -
												curationDuration -
												deduplicationDuration
											: undefined;

									return evaluatorCost > 0 ? (
										<div className="cost-detail-card">
											<span className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1">
												Evaluators Analysis
											</span>
											<div className="flex items-baseline gap-2">
												<span className="font-mono text-lg font-bold text-slate-100">
													{formatCost(evaluatorCost)}
												</span>
												{evaluatorDuration !== undefined &&
													evaluatorDuration > 0 && (
														<span className="text-xs text-slate-400">
															({formatDuration(evaluatorDuration)})
														</span>
													)}
											</div>
										</div>
									) : null;
								})()}
							{/* Curation Cost Section */}
							{(metadata.totalCurationCostUsd !== undefined ||
								metadata.curationCostUsd !== undefined) && (
								<div className="cost-detail-card">
									<span className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1">
										Issue Curation
									</span>
									<div className="flex items-baseline gap-2">
										<span className="font-mono text-lg font-bold text-slate-100">
											{formatCost(
												metadata.totalCurationCostUsd ??
													metadata.curationCostUsd ??
													0,
											)}
										</span>
										{(metadata.totalCurationDurationMs !== undefined ||
											metadata.curationDurationMs !== undefined) && (
											<span className="text-xs text-slate-400">
												(
												{formatDuration(
													metadata.totalCurationDurationMs ??
														metadata.curationDurationMs ??
														0,
												)}
												)
											</span>
										)}
									</div>
									{/* Show breakdown if dual curation data available */}
									{metadata.errorCurationCostUsd !== undefined &&
										metadata.suggestionCurationCostUsd !== undefined && (
											<div className="mt-2 pt-2 border-t border-slate-700/60 space-y-1">
												<div className="flex justify-between text-xs">
													<span className="text-slate-400">
														Errors ({metadata.errorsCuratedCount ?? 0} curated)
													</span>
													<span className="font-mono text-slate-300">
														{formatCost(metadata.errorCurationCostUsd)}
													</span>
												</div>
												<div className="flex justify-between text-xs">
													<span className="text-slate-400">
														Suggestions ({metadata.suggestionsCuratedCount ?? 0}{" "}
														curated)
													</span>
													<span className="font-mono text-slate-300">
														{formatCost(metadata.suggestionCurationCostUsd)}
													</span>
												</div>
											</div>
										)}
								</div>
							)}
							{/* Deduplication Cost Section (Phase 2 AI) */}
							{metadata.deduplicationPhase2CostUsd !== undefined &&
								metadata.deduplicationPhase2CostUsd > 0 && (
									<div className="cost-detail-card">
										<span className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1">
											AI Deduplication
										</span>
										<div className="flex items-baseline gap-2">
											<span className="font-mono text-lg font-bold text-slate-100">
												{formatCost(metadata.deduplicationPhase2CostUsd)}
											</span>
											{metadata.deduplicationPhase2DurationMs !== undefined && (
												<span className="text-xs text-slate-400">
													(
													{formatDuration(
														metadata.deduplicationPhase2DurationMs,
													)}
													)
												</span>
											)}
										</div>
										{metadata.deduplicationPhase2Removed !== undefined && (
											<div className="mt-1 text-xs text-slate-400">
												{metadata.deduplicationPhase2Removed} duplicate
												{metadata.deduplicationPhase2Removed !== 1 ? "s" : ""}{" "}
												removed
												{metadata.deduplicationPhase2Groups !== undefined &&
													` across ${metadata.deduplicationPhase2Groups} group${metadata.deduplicationPhase2Groups !== 1 ? "s" : ""}`}
											</div>
										)}
									</div>
								)}
						</div>
						{!metadata.totalCostUsd && !metadata.totalDurationMs && (
							<p className="text-sm text-slate-400 italic py-4 text-center">
								No cost or duration data available
							</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};
