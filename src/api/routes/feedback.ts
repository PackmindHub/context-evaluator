import { FeedbackRepository } from "../db/feedback-repository";

/**
 * API routes for issue feedback management
 * Handles submission, deletion, and retrieval of feedback
 */
export class FeedbackRoutes {
	private feedbackRepo = FeedbackRepository.getInstance();

	/**
	 * POST /api/feedback - Submit or update feedback for an issue
	 */
	async post(req: Request): Promise<Response> {
		try {
			const body = await req.json();
			const { evaluationId, issueHash, evaluatorName, feedbackType } = body;

			// Validation
			if (!evaluationId || !issueHash || !evaluatorName || !feedbackType) {
				return new Response(
					JSON.stringify({ error: "Missing required fields" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}

			if (!["like", "dislike"].includes(feedbackType)) {
				return new Response(
					JSON.stringify({ error: "Invalid feedback type" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}

			this.feedbackRepo.saveFeedback(
				evaluationId,
				issueHash,
				evaluatorName,
				feedbackType,
			);

			return new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (error) {
			console.error("[FeedbackRoutes] Error saving feedback:", error);
			return new Response(
				JSON.stringify({ error: "Failed to save feedback" }),
				{ status: 500, headers: { "Content-Type": "application/json" } },
			);
		}
	}

	/**
	 * DELETE /api/feedback - Remove feedback for an issue
	 */
	async delete(req: Request): Promise<Response> {
		try {
			const url = new URL(req.url);
			const evaluationId = url.searchParams.get("evaluationId");
			const issueHash = url.searchParams.get("issueHash");

			if (!evaluationId || !issueHash) {
				return new Response(
					JSON.stringify({ error: "Missing required parameters" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}

			this.feedbackRepo.deleteFeedback(evaluationId, issueHash);

			return new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (error) {
			console.error("[FeedbackRoutes] Error deleting feedback:", error);
			return new Response(
				JSON.stringify({ error: "Failed to delete feedback" }),
				{ status: 500, headers: { "Content-Type": "application/json" } },
			);
		}
	}

	/**
	 * GET /api/feedback/evaluation/:evaluationId - Get feedback for a specific evaluation
	 */
	async getForEvaluation(
		req: Request,
		evaluationId: string,
	): Promise<Response> {
		try {
			const feedback = this.feedbackRepo.getFeedbackForEvaluation(evaluationId);

			return new Response(JSON.stringify({ feedback }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (error) {
			console.error("[FeedbackRoutes] Error fetching feedback:", error);
			return new Response(
				JSON.stringify({ error: "Failed to fetch feedback" }),
				{ status: 500, headers: { "Content-Type": "application/json" } },
			);
		}
	}

	/**
	 * GET /api/feedback/aggregate - Get aggregated feedback across all evaluations
	 */
	async getAggregate(req: Request): Promise<Response> {
		try {
			const aggregate = this.feedbackRepo.getAggregatedFeedback();

			return new Response(JSON.stringify({ aggregate }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (error) {
			console.error("[FeedbackRoutes] Error fetching aggregate:", error);
			return new Response(
				JSON.stringify({ error: "Failed to fetch aggregate feedback" }),
				{ status: 500, headers: { "Content-Type": "application/json" } },
			);
		}
	}
}
