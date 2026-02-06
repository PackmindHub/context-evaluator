import { getDatabase } from "./database";

/**
 * Repository for managing issue bookmarks persistence
 * Follows singleton pattern like FeedbackRepository
 */
export class BookmarkRepository {
	private static instance: BookmarkRepository | null = null;

	static getInstance(): BookmarkRepository {
		if (!this.instance) {
			this.instance = new BookmarkRepository();
		}
		return this.instance;
	}

	/**
	 * Add a bookmark for an issue in an evaluation
	 * Idempotent - silently ignores if bookmark already exists
	 */
	addBookmark(
		evaluationId: string,
		issueHash: string,
		evaluatorName: string,
	): void {
		const db = getDatabase();
		db.run(
			`INSERT INTO issue_bookmarks (evaluation_id, issue_hash, evaluator_name, created_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(evaluation_id, issue_hash) DO NOTHING`,
			[evaluationId, issueHash, evaluatorName],
		);
	}

	/**
	 * Remove a bookmark for a specific issue in an evaluation
	 */
	removeBookmark(evaluationId: string, issueHash: string): void {
		const db = getDatabase();
		db.run(
			`DELETE FROM issue_bookmarks WHERE evaluation_id = ? AND issue_hash = ?`,
			[evaluationId, issueHash],
		);
	}

	/**
	 * Get all bookmarked issue hashes for a specific evaluation
	 * Returns a Set for efficient O(1) lookup when filtering
	 */
	getBookmarksForEvaluation(evaluationId: string): Set<string> {
		const db = getDatabase();
		const results = db
			.query(
				`SELECT issue_hash as issueHash FROM issue_bookmarks WHERE evaluation_id = ?`,
			)
			.all(evaluationId) as Array<{ issueHash: string }>;

		return new Set(results.map((r) => r.issueHash));
	}
}
