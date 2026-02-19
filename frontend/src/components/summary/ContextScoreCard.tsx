import React, { useState } from "react";
import { useAnimatedCounter } from "../../hooks/useAnimatedCounter";
import { useEvaluationApi } from "../../hooks/useEvaluationApi";
import type { ContextScoreGrade, IContextScore } from "../../types/evaluation";

// Helper function to get score color class based on grade (red to green gradient)
function getScoreColorClass(grade: ContextScoreGrade): string {
	switch (grade) {
		case "Excellent":
			return "text-emerald-400";
		case "Good":
			return "text-green-400";
		case "Fair":
			return "text-yellow-400";
		case "Developing":
			return "text-orange-400";
		case "Getting Started":
			return "text-red-400";
		default:
			return "text-slate-400";
	}
}

// Helper function to get badge class based on grade (red to green gradient)
function getScoreBadgeClass(grade: ContextScoreGrade): string {
	switch (grade) {
		case "Excellent":
			return "bg-emerald-950/60 text-emerald-300 border border-emerald-800/50";
		case "Good":
			return "bg-green-950/60 text-green-300 border border-green-800/50";
		case "Fair":
			return "bg-yellow-950/60 text-yellow-300 border border-yellow-800/50";
		case "Developing":
			return "bg-orange-950/60 text-orange-300 border border-orange-800/50";
		case "Getting Started":
			return "bg-red-950/60 text-red-300 border border-red-800/50";
		default:
			return "bg-slate-700/60 text-slate-400 border border-slate-600/50";
	}
}

// Helper function to get glow color for score
function getScoreGlowStyle(grade: ContextScoreGrade): React.CSSProperties {
	const glowColors: Record<ContextScoreGrade, string> = {
		Excellent: "rgba(52, 211, 153, 0.4)",
		Good: "rgba(74, 222, 128, 0.35)",
		Fair: "rgba(250, 204, 21, 0.3)",
		Developing: "rgba(251, 146, 60, 0.35)",
		"Getting Started": "rgba(248, 113, 113, 0.4)",
	};
	return {
		textShadow: `0 0 30px ${glowColors[grade] || "transparent"}`,
	};
}

interface ContextScoreCardProps {
	contextScore: IContextScore;
	evaluationId?: string;
	onScoreRecalculated?: (score: number, grade: string) => void;
}

/**
 * Displays the context score with animated counter and grade badge
 */
export const ContextScoreCard: React.FC<ContextScoreCardProps> = ({
	contextScore,
	evaluationId,
	onScoreRecalculated,
}) => {
	const animatedScore = useAnimatedCounter(contextScore.score, 800);
	const { recalculateScore } = useEvaluationApi();
	const [isRecalculating, setIsRecalculating] = useState(false);
	const [recalcError, setRecalcError] = useState<string | null>(null);

	const isDebugMode =
		typeof window !== "undefined" &&
		new URLSearchParams(window.location.search).has("debug");

	const handleRecalculate = async () => {
		if (!evaluationId) return;
		setIsRecalculating(true);
		setRecalcError(null);
		try {
			const result = await recalculateScore(evaluationId);
			onScoreRecalculated?.(result.score, result.grade);
		} catch (err) {
			setRecalcError(
				err instanceof Error ? err.message : "Recalculation failed",
			);
		} finally {
			setIsRecalculating(false);
		}
	};

	return (
		<div className="glass-card p-6">
			<div className="flex flex-col md:flex-row md:items-center gap-6">
				{/* Score Number */}
				<div className="text-center">
					<p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
						Context Score
					</p>
					<p
						className={`text-6xl font-bold tabular-nums ${getScoreColorClass(contextScore.grade)}`}
						style={getScoreGlowStyle(contextScore.grade)}
					>
						{animatedScore.toFixed(1)}
						<span className="text-2xl text-slate-500 ml-1">/10</span>
					</p>
					{/* Grade Badge - below score */}
					<span
						className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold mt-3 ${getScoreBadgeClass(contextScore.grade)}`}
					>
						{contextScore.grade}
					</span>

					{/* Recalculate button — debug mode only */}
					{isDebugMode && evaluationId && (
						<div className="mt-3">
							<button
								type="button"
								onClick={handleRecalculate}
								disabled={isRecalculating}
								className="px-3 py-1 text-xs font-medium rounded border border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
							>
								{isRecalculating ? "Recalculating…" : "Recalculate Score"}
							</button>
							{recalcError && (
								<p className="text-xs text-red-400 mt-1">{recalcError}</p>
							)}
						</div>
					)}
				</div>

				{/* Summary and Recommendations */}
				<div className="flex-1 min-w-0">
					{/* Explanation - user-friendly one-liner */}
					{contextScore.explanation && (
						<p className="text-sm text-slate-200 mb-2 font-medium">
							{contextScore.explanation}
						</p>
					)}
					<p className="text-sm text-slate-400 mb-4">{contextScore.summary}</p>

					{contextScore.recommendations.length > 0 && (
						<div>
							<p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
								Top Recommendations
							</p>
							<ul className="space-y-2">
								{contextScore.recommendations.map((rec, index) => (
									<li
										key={index}
										className="flex items-start gap-2.5 text-sm text-slate-400 p-2 rounded-lg hover:bg-slate-800/50 transition-colors"
									>
										<span className="text-indigo-400 mt-0.5 flex-shrink-0">
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
													d="M9 5l7 7-7 7"
												/>
											</svg>
										</span>
										<span>{rec}</span>
									</li>
								))}
							</ul>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
