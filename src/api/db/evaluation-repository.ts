import type {
	IAgentCostStat,
	IEvaluateRequest,
	IRepoCostStat,
} from "@shared/types/api";
import type { EvaluationOutput } from "@shared/types/evaluation";
import { getDatabase } from "./database";

/**
 * Context score grade type
 */
export type ContextScoreGrade =
	| "Excellent"
	| "Good"
	| "Fair"
	| "Developing"
	| "Getting Started";

/**
 * Evaluation history item (for listing)
 */
export interface IEvaluationHistoryItem {
	id: string;
	repositoryUrl: string;
	evaluationMode: "unified" | "independent" | null;
	evaluatorsCount: number;
	status: "completed" | "failed";
	totalFiles: number;
	totalIssues: number;
	highCount: number;
	mediumCount: number;
	lowCount: number;
	curatedCount: number;
	totalCostUsd: number;
	totalDurationMs: number;
	contextScore?: number;
	contextGrade?: ContextScoreGrade;
	failedEvaluatorCount: number;
	errorMessage?: string;
	errorCode?: string;
	createdAt: string;
	completedAt: string;
}

/**
 * Full evaluation record (with result JSON)
 */
export interface IEvaluationRecord extends IEvaluationHistoryItem {
	result?: EvaluationOutput;
	finalPrompts?: Record<string, string>;
}

/**
 * Database row shape
 */
interface EvaluationRow {
	id: string;
	repository_url: string;
	evaluation_mode: string | null;
	evaluators_count: number;
	status: string;
	total_files: number;
	total_issues: number;
	critical_count: number;
	high_count: number;
	medium_count: number;
	curated_count: number;
	total_cost_usd: number;
	total_duration_ms: number;
	total_input_tokens: number;
	total_output_tokens: number;
	context_score: number | null;
	context_grade: string | null;
	failed_evaluator_count: number;
	result_json: string | null;
	final_prompts_json: string | null;
	error_message: string | null;
	error_code: string | null;
	created_at: string;
	completed_at: string;
}

/**
 * Evaluation Repository - CRUD operations for evaluation history
 */
export class EvaluationRepository {
	/**
	 * Save a completed evaluation
	 */
	saveEvaluation(
		jobId: string,
		request: IEvaluateRequest,
		result: EvaluationOutput,
		createdAt: Date,
	): void {
		const db = getDatabase();
		const now = new Date().toISOString();
		const metadata = result.metadata;

		const stmt = db.prepare(`
      INSERT INTO evaluations (
        id, repository_url, evaluation_mode, evaluators_count, status,
        total_files, total_issues, critical_count, high_count, medium_count,
        curated_count, total_cost_usd, total_duration_ms, total_input_tokens, total_output_tokens,
        context_score, context_grade, failed_evaluator_count,
        result_json, final_prompts_json, error_message, error_code, created_at, completed_at
      ) VALUES (
        $id, $repositoryUrl, $evaluationMode, $evaluatorsCount, $status,
        $totalFiles, $totalIssues, $criticalCount, $highCount, $mediumCount,
        $curatedCount, $totalCostUsd, $totalDurationMs, $totalInputTokens, $totalOutputTokens,
        $contextScore, $contextGrade, $failedEvaluatorCount,
        $resultJson, $finalPromptsJson, $errorMessage, $errorCode, $createdAt, $completedAt
      )
    `);

		// Extract finalPrompts from result if present
		const finalPrompts =
			"finalPrompts" in result ? result.finalPrompts : undefined;

		stmt.run({
			$id: jobId,
			$repositoryUrl: request.repositoryUrl || request.localPath || "unknown",
			$evaluationMode: metadata.evaluationMode || null,
			$evaluatorsCount: request.options?.evaluators || 12,
			$status: "completed",
			$totalFiles: metadata.totalFiles || 0,
			$totalIssues: metadata.totalIssues || 0,
			$criticalCount: 0, // Deprecated: critical merged into high
			$highCount: metadata.highCount || 0,
			$mediumCount: metadata.mediumCount || 0,
			$curatedCount: metadata.curatedCount || 0,
			$totalCostUsd: metadata.totalCostUsd || 0,
			$totalDurationMs: metadata.totalDurationMs || 0,
			$totalInputTokens: metadata.totalInputTokens || 0,
			$totalOutputTokens: metadata.totalOutputTokens || 0,
			$contextScore: metadata.contextScore?.score ?? null,
			$contextGrade: metadata.contextScore?.grade ?? null,
			$failedEvaluatorCount: metadata.failedEvaluators?.length || 0,
			$resultJson: JSON.stringify(result),
			$finalPromptsJson: finalPrompts ? JSON.stringify(finalPrompts) : null,
			$errorMessage: null,
			$errorCode: null,
			$createdAt: createdAt.toISOString(),
			$completedAt: now,
		});

		console.log(`[EvaluationRepository] Saved evaluation ${jobId}`);
	}

	/**
	 * Save a failed evaluation
	 */
	saveFailedEvaluation(
		jobId: string,
		request: IEvaluateRequest,
		error: { message: string; code: string; details?: unknown },
		createdAt: Date,
	): void {
		const db = getDatabase();
		const now = new Date().toISOString();

		const stmt = db.prepare(`
      INSERT INTO evaluations (
        id, repository_url, evaluation_mode, evaluators_count, status,
        total_files, total_issues, critical_count, high_count, medium_count,
        curated_count, total_cost_usd, total_duration_ms, total_input_tokens, total_output_tokens,
        result_json, final_prompts_json, error_message, error_code, created_at, completed_at
      ) VALUES (
        $id, $repositoryUrl, $evaluationMode, $evaluatorsCount, $status,
        $totalFiles, $totalIssues, $criticalCount, $highCount, $mediumCount,
        $curatedCount, $totalCostUsd, $totalDurationMs, $totalInputTokens, $totalOutputTokens,
        $resultJson, $finalPromptsJson, $errorMessage, $errorCode, $createdAt, $completedAt
      )
    `);

		stmt.run({
			$id: jobId,
			$repositoryUrl: request.repositoryUrl || request.localPath || "unknown",
			$evaluationMode: null,
			$evaluatorsCount: request.options?.evaluators || 12,
			$status: "failed",
			$totalFiles: 0,
			$totalIssues: 0,
			$criticalCount: 0,
			$highCount: 0,
			$mediumCount: 0,
			$curatedCount: 0,
			$totalCostUsd: 0,
			$totalDurationMs: 0,
			$totalInputTokens: 0,
			$totalOutputTokens: 0,
			$resultJson: null,
			$finalPromptsJson: null,
			$errorMessage: error.message,
			$errorCode: error.code,
			$createdAt: createdAt.toISOString(),
			$completedAt: now,
		});

		console.log(`[EvaluationRepository] Saved failed evaluation ${jobId}`);
	}

	/**
	 * Get evaluation by ID with full result
	 */
	getEvaluationById(id: string): IEvaluationRecord | null {
		const db = getDatabase();

		const stmt = db.prepare<EvaluationRow, string>(`
      SELECT * FROM evaluations WHERE id = ?
    `);

		const row = stmt.get(id);
		if (!row) return null;

		return this.rowToRecord(row);
	}

	/**
	 * Get recent evaluations (metadata only, no result JSON)
	 */
	getRecentEvaluations(limit?: number): IEvaluationHistoryItem[] {
		const db = getDatabase();

		if (limit !== undefined) {
			const stmt = db.prepare<EvaluationRow, number>(`
        SELECT
          id, repository_url, evaluation_mode, evaluators_count, status,
          total_files, total_issues, critical_count, high_count, medium_count,
          curated_count, total_cost_usd, total_duration_ms, total_input_tokens, total_output_tokens,
          context_score, context_grade, failed_evaluator_count,
          error_message, error_code, created_at, completed_at
        FROM evaluations
        ORDER BY completed_at DESC
        LIMIT ?
      `);
			const rows = stmt.all(limit);
			return rows.map((row) => this.rowToHistoryItem(row));
		}

		const stmt = db.prepare<EvaluationRow, []>(`
      SELECT
        id, repository_url, evaluation_mode, evaluators_count, status,
        total_files, total_issues, critical_count, high_count, medium_count,
        curated_count, total_cost_usd, total_duration_ms, total_input_tokens, total_output_tokens,
        context_score, context_grade, failed_evaluator_count,
        error_message, error_code, created_at, completed_at
      FROM evaluations
      ORDER BY completed_at DESC
    `);

		const rows = stmt.all();
		return rows.map((row) => this.rowToHistoryItem(row));
	}

	/**
	 * Delete evaluation by ID
	 */
	deleteEvaluation(id: string): boolean {
		const db = getDatabase();

		const stmt = db.prepare(`DELETE FROM evaluations WHERE id = ?`);
		const result = stmt.run(id);

		const deleted = result.changes > 0;
		if (deleted) {
			console.log(`[EvaluationRepository] Deleted evaluation ${id}`);
		}

		return deleted;
	}

	/**
	 * Delete all evaluations
	 */
	deleteAllEvaluations(): number {
		const db = getDatabase();

		const stmt = db.prepare(`DELETE FROM evaluations`);
		const result = stmt.run();

		const deletedCount = result.changes;
		console.log(
			`[EvaluationRepository] Deleted all evaluations (${deletedCount} records)`,
		);

		return deletedCount;
	}

	/**
	 * Get all completed evaluations with their full result JSON.
	 * Used by the aggregated issues endpoint to extract issues across evaluations.
	 */
	getAllCompletedEvaluationsWithResults(): Array<{
		id: string;
		repositoryUrl: string;
		completedAt: string;
		result: EvaluationOutput;
	}> {
		const db = getDatabase();

		const rows = db
			.prepare<
				Pick<
					EvaluationRow,
					"id" | "repository_url" | "completed_at" | "result_json"
				>,
				[]
			>(
				`SELECT id, repository_url, completed_at, result_json
			FROM evaluations
			WHERE status = 'completed' AND result_json IS NOT NULL
			ORDER BY completed_at DESC`,
			)
			.all();

		return rows
			.map((row) => {
				try {
					return {
						id: row.id,
						repositoryUrl: row.repository_url,
						completedAt: row.completed_at,
						result: JSON.parse(row.result_json!) as EvaluationOutput,
					};
				} catch {
					return null;
				}
			})
			.filter((r): r is NonNullable<typeof r> => r !== null);
	}

	/**
	 * Get evaluation count
	 */
	getCount(): number {
		const db = getDatabase();
		const stmt = db.prepare<{ count: number }, []>(
			`SELECT COUNT(*) as count FROM evaluations`,
		);
		const result = stmt.get();
		return result?.count || 0;
	}

	/**
	 * Get top repositories by total cost (summed across all evaluations)
	 */
	getTopReposByCost(limit = 10): IRepoCostStat[] {
		const db = getDatabase();

		// Get total cost per repo and the latest result_json for LOC extraction
		const rows = db
			.prepare<
				{
					repository_url: string;
					total_cost: number;
					latest_result_json: string | null;
				},
				number
			>(
				`SELECT
					e.repository_url,
					SUM(e.total_cost_usd) as total_cost,
					(SELECT e2.result_json FROM evaluations e2
					 WHERE e2.repository_url = e.repository_url
					   AND e2.status = 'completed' AND e2.result_json IS NOT NULL
					 ORDER BY e2.completed_at DESC LIMIT 1) as latest_result_json
				FROM evaluations e
				WHERE e.status = 'completed'
				GROUP BY e.repository_url
				HAVING total_cost > 0
				ORDER BY total_cost DESC
				LIMIT ?`,
			)
			.all(limit);

		return rows.map((row) => {
			let totalLOC: number | null = null;
			if (row.latest_result_json) {
				try {
					const result = JSON.parse(row.latest_result_json);
					totalLOC =
						result?.metadata?.contextScore?.breakdown?.context?.totalLOC ??
						null;
				} catch {
					// ignore parse errors
				}
			}
			return {
				repositoryUrl: row.repository_url,
				totalCostUsd: row.total_cost,
				totalLOC,
			};
		});
	}

	/**
	 * Get total cost aggregated by AI agent
	 */
	getCostByAgent(): IAgentCostStat[] {
		const db = getDatabase();

		const rows = db
			.prepare<{ total_cost_usd: number; result_json: string | null }, []>(
				`SELECT total_cost_usd, result_json
				FROM evaluations
				WHERE status = 'completed' AND total_cost_usd > 0`,
			)
			.all();

		const costMap = new Map<string, number>();
		for (const row of rows) {
			let agent = "unknown";
			if (row.result_json) {
				try {
					const result = JSON.parse(row.result_json);
					agent = result?.metadata?.agent || "unknown";
				} catch {
					// ignore parse errors
				}
			}
			costMap.set(agent, (costMap.get(agent) || 0) + row.total_cost_usd);
		}

		return Array.from(costMap.entries())
			.map(([agent, totalCostUsd]) => ({ agent, totalCostUsd }))
			.sort((a, b) => b.totalCostUsd - a.totalCostUsd);
	}

	/**
	 * Convert database row to history item (without result JSON)
	 */
	private rowToHistoryItem(row: EvaluationRow): IEvaluationHistoryItem {
		return {
			id: row.id,
			repositoryUrl: row.repository_url,
			evaluationMode: row.evaluation_mode as "unified" | "independent" | null,
			evaluatorsCount: row.evaluators_count,
			status: row.status as "completed" | "failed",
			totalFiles: row.total_files,
			totalIssues: row.total_issues,
			// Merge critical into high for backward compatibility with old DB records
			highCount: row.critical_count + row.high_count,
			mediumCount: row.medium_count,
			lowCount: 0, // Not stored in old DB schema, will be 0 for legacy records
			curatedCount: row.curated_count,
			totalCostUsd: row.total_cost_usd,
			totalDurationMs: row.total_duration_ms,
			contextScore: row.context_score ?? undefined,
			contextGrade: (row.context_grade as ContextScoreGrade) ?? undefined,
			failedEvaluatorCount: row.failed_evaluator_count ?? 0,
			errorMessage: row.error_message || undefined,
			errorCode: row.error_code || undefined,
			createdAt: row.created_at,
			completedAt: row.completed_at,
		};
	}

	/**
	 * Convert database row to full record (with result JSON)
	 */
	private rowToRecord(row: EvaluationRow): IEvaluationRecord {
		const historyItem = this.rowToHistoryItem(row);

		return {
			...historyItem,
			result: row.result_json ? JSON.parse(row.result_json) : undefined,
			finalPrompts: row.final_prompts_json
				? JSON.parse(row.final_prompts_json)
				: undefined,
		};
	}
}

// Singleton instance
export const evaluationRepository = new EvaluationRepository();
