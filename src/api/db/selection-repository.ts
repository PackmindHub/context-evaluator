import { getDatabase } from "./database";

/**
 * Repository for managing issue selection persistence (remediation picks)
 * Follows singleton pattern like BookmarkRepository
 */
export class SelectionRepository {
	private static instance: SelectionRepository | null = null;

	static getInstance(): SelectionRepository {
		if (!this.instance) {
			this.instance = new SelectionRepository();
		}
		return this.instance;
	}

	/**
	 * Add selections for issues in an evaluation (batch insert)
	 * Idempotent - silently ignores if selection already exists
	 */
	addSelections(evaluationId: string, issueKeys: string[]): void {
		const db = getDatabase();
		const stmt = db.prepare(
			`INSERT INTO issue_selections (evaluation_id, issue_key, created_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(evaluation_id, issue_key) DO NOTHING`,
		);
		for (const issueKey of issueKeys) {
			stmt.run(evaluationId, issueKey);
		}
	}

	/**
	 * Remove a single selection for a specific issue in an evaluation
	 */
	removeSelection(evaluationId: string, issueKey: string): void {
		const db = getDatabase();
		db.run(
			`DELETE FROM issue_selections WHERE evaluation_id = ? AND issue_key = ?`,
			[evaluationId, issueKey],
		);
	}

	/**
	 * Clear all selections for an evaluation
	 */
	clearSelections(evaluationId: string): void {
		const db = getDatabase();
		db.run(`DELETE FROM issue_selections WHERE evaluation_id = ?`, [
			evaluationId,
		]);
	}

	/**
	 * Get all selected issue keys for a specific evaluation
	 * Returns a Set for efficient O(1) lookup
	 */
	getSelectionsForEvaluation(evaluationId: string): Set<string> {
		const db = getDatabase();
		const results = db
			.query(
				`SELECT issue_key as issueKey FROM issue_selections WHERE evaluation_id = ?`,
			)
			.all(evaluationId) as Array<{ issueKey: string }>;

		return new Set(results.map((r) => r.issueKey));
	}
}
