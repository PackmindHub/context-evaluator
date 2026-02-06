import React, { useCallback, useEffect, useState } from "react";
import { useEvaluationHistory } from "../hooks/useEvaluationHistory";
import { useFeedbackApi } from "../hooks/useFeedbackApi";
import { AppHeader } from "./AppHeader";

interface IEvaluatorFeedback {
	evaluatorName: string;
	totalLikes: number;
	totalDislikes: number;
	netScore: number;
	totalFeedback: number;
}

/**
 * Assessment Page - Shows aggregated feedback across all evaluations
 *
 * Displays evaluator performance based on user feedback (likes/dislikes)
 * from all evaluation runs. Helps identify which evaluators provide
 * the most valuable insights.
 */
export const AssessmentPage: React.FC = () => {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [aggregate, setAggregate] = useState<IEvaluatorFeedback[]>([]);
	const { getAggregateFeedback } = useFeedbackApi();
	const { history } = useEvaluationHistory();

	const loadAggregate = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const data = await getAggregateFeedback();
			setAggregate(data);
		} catch (err) {
			console.error("Failed to load aggregate feedback:", err);
			setError("Failed to load feedback data");
		} finally {
			setLoading(false);
		}
	}, [getAggregateFeedback]);

	useEffect(() => {
		loadAggregate();
	}, [loadAggregate]);

	if (loading) {
		return (
			<div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100">
				<AppHeader currentPage="assessment" historyCount={history.length} />
				<div className="max-w-4xl mx-auto px-6 py-8">
					<p className="text-slate-400">Loading assessment data...</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100">
				<AppHeader currentPage="assessment" historyCount={history.length} />
				<div className="max-w-4xl mx-auto px-6 py-8">
					<p className="text-red-400">{error}</p>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100">
			<AppHeader currentPage="assessment" historyCount={history.length} />
			<div className="max-w-4xl mx-auto px-6 py-8">
				{/* Header */}
				<div className="mb-8">
					<h1 className="text-title mb-2">Evaluator Assessment</h1>
					<p className="text-body-muted">
						Aggregated feedback across all evaluations to identify the most
						valuable evaluators
					</p>
				</div>

				{aggregate.length === 0 ? (
					<div className="card text-center py-12">
						<p className="text-slate-400 text-body">
							No feedback data available yet. Start evaluating and providing
							feedback!
						</p>
					</div>
				) : (
					<div className="space-y-4">
						{aggregate.map((item) => {
							const likeRatio =
								item.totalFeedback > 0
									? (item.totalLikes / item.totalFeedback) * 100
									: 0;

							return (
								<div key={item.evaluatorName} className="card">
									<div className="flex justify-between items-start mb-3">
										<h3 className="text-subheading">{item.evaluatorName}</h3>
										<div className="flex items-center gap-4 text-sm">
											<span className="flex items-center gap-1 text-green-400">
												<svg
													className="h-4 w-4"
													fill="currentColor"
													viewBox="0 0 24 24"
												>
													<path d="M7 22V11M2 13v6a2 2 0 002 2h12.764a2 2 0 001.789-1.106l3.5-7A2 2 0 0020.264 11H16V5a3 3 0 00-3-3v0a3 3 0 00-3 3v6H7a2 2 0 00-2 2z" />
												</svg>
												{item.totalLikes}
											</span>
											<span className="flex items-center gap-1 text-red-400">
												<svg
													className="h-4 w-4"
													fill="currentColor"
													viewBox="0 0 24 24"
												>
													<path d="M17 2V13M22 11V5a2 2 0 00-2-2H7.236a2 2 0 00-1.789 1.106l-3.5 7A2 2 0 003.736 13H8v6a3 3 0 003 3v0a3 3 0 003-3v-6h3a2 2 0 002-2z" />
												</svg>
												{item.totalDislikes}
											</span>
										</div>
									</div>

									{/* Progress bar */}
									<div className="h-2 bg-slate-700 rounded-full overflow-hidden mb-2">
										<div
											className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all"
											style={{ width: `${likeRatio}%` }}
										/>
									</div>

									<div className="flex justify-between text-xs text-slate-400">
										<span>
											Net Score: {item.netScore > 0 ? "+" : ""}
											{item.netScore}
										</span>
										<span>Total Feedback: {item.totalFeedback}</span>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
};
