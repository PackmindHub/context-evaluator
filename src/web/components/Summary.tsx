import React from "react";
import type { Metadata } from "../types/evaluation";
import {
	formatCost,
	formatDuration,
	formatTokenUsage,
} from "../types/evaluation";

interface SummaryProps {
	metadata: Metadata;
	actualIssueCount?: number;
	actualPerFileIssueCount?: number;
	actualCrossFileIssueCount?: number;
	actualHighCount?: number;
	actualMediumCount?: number;
}

interface StatCardProps {
	label: string;
	value: string | number;
	icon?: React.ReactNode;
	className?: string;
}

const StatCard: React.FC<StatCardProps> = ({
	label,
	value,
	icon,
	className = "",
}) => (
	<div className={`card card-hover group ${className}`}>
		<div className="flex items-start justify-between">
			<div className="flex-1">
				<p className="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">
					{label}
				</p>
				<p className="text-2xl font-bold text-slate-100 group-hover:text-gradient transition-all">
					{value}
				</p>
			</div>
			{icon && (
				<div className="ml-2 text-slate-600 group-hover:text-blue-400 transition-colors">
					{icon}
				</div>
			)}
		</div>
	</div>
);

export const Summary: React.FC<SummaryProps> = ({
	metadata,
	actualIssueCount,
	actualPerFileIssueCount,
	actualCrossFileIssueCount,
	actualHighCount,
	actualMediumCount,
}) => {
	const formattedDate = new Date(metadata.generatedAt).toLocaleString();

	// Use actual counts if provided, otherwise fall back to metadata
	const totalIssues = actualIssueCount ?? metadata.totalIssues ?? 0;
	const perFileIssues = actualPerFileIssueCount ?? metadata.perFileIssues ?? 0;
	const crossFileIssues =
		actualCrossFileIssueCount ?? metadata.crossFileIssues ?? 0;
	const highCount = actualHighCount ?? metadata.highCount ?? 0;
	const mediumCount = actualMediumCount ?? metadata.mediumCount ?? 0;

	return (
		<div className="space-y-4 animate-fade-in">
			{/* Header with Premium Gradient */}
			<div className="relative overflow-hidden card border-2 border-blue-800/50">
				<div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 opacity-95"></div>
				<div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIuNSIgb3BhY2l0eT0iLjEiLz48L2c+PC9zdmc+')] opacity-10"></div>

				<div className="relative flex items-center justify-between py-4">
					<div className="flex-1">
						<div className="flex items-center gap-2 mb-2">
							<div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center border border-white/30">
								<svg
									className="h-5 w-5 text-white"
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
							<h1 className="text-xl md:text-2xl font-bold text-white">
								Evaluation Summary
							</h1>
						</div>
						<div className="flex flex-wrap items-center gap-2 text-white/90 text-xs">
							<span className="flex items-center gap-1 bg-white/10 backdrop-blur-sm px-2 py-1 rounded-md border border-white/20">
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
							<span className="flex items-center gap-1 bg-white/10 backdrop-blur-sm px-2 py-1 rounded-md border border-white/20">
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
							<span className="flex items-center gap-1 bg-white/10 backdrop-blur-sm px-2 py-1 rounded-md border border-white/20">
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
					<div className="hidden md:block">
						<svg
							className="h-16 w-16 text-white/10"
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
				</div>
			</div>

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

			{/* Severity Breakdown */}
			{(highCount > 0 || mediumCount > 0) && (
				<div className="card">
					<h3 className="text-base font-bold text-slate-100 mb-3 flex items-center gap-2">
						<span className="w-6 h-6 bg-gradient-to-br from-red-500 to-orange-500 rounded-lg flex items-center justify-center">
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
									d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
								/>
							</svg>
						</span>
						Severity Breakdown
					</h3>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
						{highCount > 0 && (
							<div className="card-hover bg-gradient-to-br from-red-900/30 to-rose-900/20 border-2 border-red-700/60 group cursor-pointer">
								<div className="flex items-center gap-3">
									<div className="w-10 h-10 bg-gradient-to-br from-red-500 to-rose-600 rounded-lg flex items-center justify-center text-xl shadow-lg group-hover:scale-110 transition-transform">
										🔴
									</div>
									<div>
										<p className="text-xs font-semibold text-red-300 uppercase tracking-wide">
											High
										</p>
										<p className="text-2xl font-bold text-red-400">
											{highCount}
										</p>
										<p className="text-xs text-red-400/80">Severity 7-10</p>
									</div>
								</div>
							</div>
						)}
						{mediumCount > 0 && (
							<div className="card-hover bg-gradient-to-br from-orange-900/30 to-amber-900/20 border-2 border-orange-700/60 group cursor-pointer">
								<div className="flex items-center gap-3">
									<div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-600 rounded-lg flex items-center justify-center text-xl shadow-lg group-hover:scale-110 transition-transform">
										🟠
									</div>
									<div>
										<p className="text-xs font-semibold text-orange-300 uppercase tracking-wide">
											Medium
										</p>
										<p className="text-2xl font-bold text-orange-400">
											{mediumCount}
										</p>
										<p className="text-xs text-orange-400/80">Severity 5-6</p>
									</div>
								</div>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Resource Usage */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
				{/* Token Usage */}
				{metadata.totalInputTokens !== undefined &&
					metadata.totalOutputTokens !== undefined && (
						<div className="card card-hover">
							<div className="flex items-center gap-2 mb-3">
								<div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-md flex items-center justify-center shadow-sm">
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
											d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
										/>
									</svg>
								</div>
								<h3 className="text-base font-bold text-slate-100">
									Token Usage
								</h3>
							</div>
							<div className="space-y-2">
								<div className="flex justify-between items-center py-1 border-b border-slate-700">
									<span className="text-xs font-medium text-slate-400">
										Input tokens:
									</span>
									<span className="font-mono text-xs font-bold text-slate-100">
										{formatTokenUsage(metadata.totalInputTokens)}
									</span>
								</div>
								<div className="flex justify-between items-center py-1 border-b border-slate-700">
									<span className="text-xs font-medium text-slate-400">
										Output tokens:
									</span>
									<span className="font-mono text-xs font-bold text-slate-100">
										{formatTokenUsage(metadata.totalOutputTokens)}
									</span>
								</div>
								{metadata.totalCacheCreationTokens !== undefined &&
									metadata.totalCacheCreationTokens > 0 && (
										<div className="flex justify-between items-center py-1 border-b border-slate-700">
											<span className="text-xs font-medium text-slate-400">
												Cache creation:
											</span>
											<span className="font-mono text-xs font-bold text-slate-100">
												{formatTokenUsage(metadata.totalCacheCreationTokens)}
											</span>
										</div>
									)}
								{metadata.totalCacheReadTokens !== undefined &&
									metadata.totalCacheReadTokens > 0 && (
										<div className="flex justify-between items-center py-1 border-b border-slate-700">
											<span className="text-xs font-medium text-slate-400">
												Cache read:
											</span>
											<span className="font-mono text-xs font-bold text-slate-100">
												{formatTokenUsage(metadata.totalCacheReadTokens)}
											</span>
										</div>
									)}
								<div className="pt-2 mt-2 border-t-2 border-blue-800">
									<div className="flex justify-between items-center">
										<span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
											Total:
										</span>
										<span className="font-mono text-base font-bold text-gradient">
											{formatTokenUsage(
												metadata.totalInputTokens +
													metadata.totalOutputTokens +
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
					<div className="flex items-center gap-2 mb-3">
						<div className="w-6 h-6 bg-gradient-to-br from-emerald-500 to-green-600 rounded-md flex items-center justify-center shadow-sm">
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
									d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
						</div>
						<h3 className="text-base font-bold text-slate-100">
							Cost & Performance
						</h3>
					</div>
					<div className="space-y-3">
						{metadata.totalCostUsd !== undefined && (
							<div className="bg-gradient-to-br from-green-900/30 to-emerald-900/20 border-2 border-green-700/60 rounded-lg p-3">
								<span className="text-xs font-semibold text-green-300 uppercase tracking-wide block mb-1">
									Total Investment
								</span>
								<span className="font-mono text-2xl font-bold text-gradient">
									{formatCost(metadata.totalCostUsd)}
								</span>
							</div>
						)}
						{metadata.totalDurationMs !== undefined && (
							<div className="bg-gradient-to-br from-blue-900/30 to-cyan-900/20 border-2 border-blue-700/60 rounded-lg p-3">
								<span className="text-xs font-semibold text-blue-300 uppercase tracking-wide block mb-1">
									Processing Time
								</span>
								<span className="font-mono text-2xl font-bold text-gradient">
									{formatDuration(metadata.totalDurationMs)}
								</span>
							</div>
						)}
						{!metadata.totalCostUsd && !metadata.totalDurationMs && (
							<p className="text-xs text-slate-400 italic py-3 text-center">
								No cost or duration data available
							</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};
