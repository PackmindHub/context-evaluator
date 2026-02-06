import { getDatabase } from "./database";

interface IFeedbackRecord {
	id: number;
	evaluationId: string;
	issueHash: string;
	evaluatorName: string;
	feedbackType: "like" | "dislike";
	createdAt: string;
}

interface IEvaluatorFeedback {
	evaluatorName: string;
	totalLikes: number;
	totalDislikes: number;
	netScore: number;
	totalFeedback: number;
}

/**
 * Repository for managing issue feedback persistence
 * Follows singleton pattern like EvaluationRepository
 */
export class FeedbackRepository {
	private static instance: FeedbackRepository | null = null;

	static getInstance(): FeedbackRepository {
		if (!this.instance) {
			this.instance = new FeedbackRepository();
		}
		return this.instance;
	}

	/**
	 * Save or update feedback (upsert pattern)
	 * If feedback already exists for this issue in this evaluation, update it
	 */
	saveFeedback(
		evaluationId: string,
		issueHash: string,
		evaluatorName: string,
		feedbackType: "like" | "dislike",
	): void {
		const db = getDatabase();
		db.run(
			`INSERT INTO issue_feedback (evaluation_id, issue_hash, evaluator_name, feedback_type, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(evaluation_id, issue_hash)
       DO UPDATE SET feedback_type = ?, created_at = datetime('now')`,
			[evaluationId, issueHash, evaluatorName, feedbackType, feedbackType],
		);
	}

	/**
	 * Remove feedback for a specific issue in an evaluation
	 */
	deleteFeedback(evaluationId: string, issueHash: string): void {
		const db = getDatabase();
		db.run(
			`DELETE FROM issue_feedback WHERE evaluation_id = ? AND issue_hash = ?`,
			[evaluationId, issueHash],
		);
	}

	/**
	 * Get all feedback for a specific evaluation
	 * Used to load existing feedback state when viewing an evaluation
	 */
	getFeedbackForEvaluation(evaluationId: string): IFeedbackRecord[] {
		const db = getDatabase();
		return db
			.query(
				`SELECT id, evaluation_id as evaluationId, issue_hash as issueHash,
              evaluator_name as evaluatorName, feedback_type as feedbackType,
              created_at as createdAt
       FROM issue_feedback WHERE evaluation_id = ?`,
			)
			.all(evaluationId) as IFeedbackRecord[];
	}

	/**
	 * Get aggregated feedback across ALL evaluations
	 * Used for the Assessment page to show evaluator performance
	 */
	getAggregatedFeedback(): IEvaluatorFeedback[] {
		const db = getDatabase();
		const results = db
			.query(
				`SELECT
         evaluator_name as evaluatorName,
         SUM(CASE WHEN feedback_type = 'like' THEN 1 ELSE 0 END) as totalLikes,
         SUM(CASE WHEN feedback_type = 'dislike' THEN 1 ELSE 0 END) as totalDislikes,
         COUNT(*) as totalFeedback
       FROM issue_feedback
       GROUP BY evaluator_name
       ORDER BY (totalLikes - totalDislikes) DESC`,
			)
			.all() as Array<{
			evaluatorName: string;
			totalLikes: number;
			totalDislikes: number;
			totalFeedback: number;
		}>;

		return results.map((r) => ({
			...r,
			netScore: r.totalLikes - r.totalDislikes,
		}));
	}
}
