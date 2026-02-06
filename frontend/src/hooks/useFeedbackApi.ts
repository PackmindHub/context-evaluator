import { useCallback, useMemo } from "react";

/**
 * Hook for managing issue feedback via API
 *
 * Provides methods for:
 * - Submitting like/dislike feedback
 * - Removing feedback
 * - Fetching feedback for an evaluation
 * - Fetching aggregated feedback across all evaluations
 */
export function useFeedbackApi() {
	/**
	 * Submit or update feedback for an issue
	 */
	const submitFeedback = useCallback(
		async (
			evaluationId: string,
			issueHash: string,
			evaluatorName: string,
			feedbackType: "like" | "dislike",
		): Promise<void> => {
			const response = await fetch("/api/feedback", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					evaluationId,
					issueHash,
					evaluatorName,
					feedbackType,
				}),
			});

			if (!response.ok) {
				throw new Error("Failed to submit feedback");
			}
		},
		[],
	);

	/**
	 * Remove feedback for an issue
	 */
	const removeFeedback = useCallback(
		async (evaluationId: string, issueHash: string): Promise<void> => {
			const response = await fetch(
				`/api/feedback?evaluationId=${evaluationId}&issueHash=${issueHash}`,
				{ method: "DELETE" },
			);

			if (!response.ok) {
				throw new Error("Failed to remove feedback");
			}
		},
		[],
	);

	/**
	 * Get all feedback for a specific evaluation
	 * Returns a map of issue hash to feedback type
	 */
	const getFeedbackForEvaluation = useCallback(
		async (evaluationId: string): Promise<Map<string, "like" | "dislike">> => {
			const response = await fetch(`/api/feedback/evaluation/${evaluationId}`);

			if (!response.ok) {
				throw new Error("Failed to fetch feedback");
			}

			const { feedback } = await response.json();
			const feedbackMap = new Map<string, "like" | "dislike">();

			for (const item of feedback) {
				feedbackMap.set(item.issueHash, item.feedbackType);
			}

			return feedbackMap;
		},
		[],
	);

	/**
	 * Get aggregated feedback across all evaluations
	 * Returns array of evaluator statistics
	 */
	const getAggregateFeedback = useCallback(async () => {
		const response = await fetch("/api/feedback/aggregate");

		if (!response.ok) {
			throw new Error("Failed to fetch aggregate feedback");
		}

		const { aggregate } = await response.json();
		return aggregate;
	}, []);

	return useMemo(
		() => ({
			submitFeedback,
			removeFeedback,
			getFeedbackForEvaluation,
			getAggregateFeedback,
		}),
		[
			submitFeedback,
			removeFeedback,
			getFeedbackForEvaluation,
			getAggregateFeedback,
		],
	);
}
