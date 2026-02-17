/**
 * Remediation Repository - CRUD operations for remediation history
 */

import type {
	IFileChange,
	IRemediationRequest,
	IRemediationResult,
	IRemediationSummary,
	IStoredPromptStats,
} from "@shared/types/remediation";
import { getDatabase } from "./database";

export interface IRemediationRecord {
	id: string;
	evaluationId: string;
	status: "completed" | "failed";
	provider: string;
	targetAgent: string;
	selectedIssueCount: number;
	errorCount: number;
	suggestionCount: number;
	fullPatch: string | null;
	fileChanges: IFileChange[];
	totalAdditions: number;
	totalDeletions: number;
	filesChanged: number;
	totalDurationMs: number;
	totalCostUsd: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	summary: IRemediationSummary | null;
	promptStats: {
		errorFixStats?: IStoredPromptStats;
		suggestionEnrichStats?: IStoredPromptStats;
	} | null;
	errorMessage: string | null;
	createdAt: string;
	completedAt: string | null;
}

interface RemediationRow {
	id: string;
	evaluation_id: string;
	status: string;
	provider: string;
	target_file_type: string;
	selected_issue_count: number;
	error_count: number;
	suggestion_count: number;
	full_patch: string | null;
	file_changes_json: string | null;
	total_additions: number;
	total_deletions: number;
	files_changed: number;
	total_duration_ms: number;
	total_cost_usd: number;
	total_input_tokens: number;
	total_output_tokens: number;
	summary_json: string | null;
	prompt_stats_json: string | null;
	error_message: string | null;
	created_at: string;
	completed_at: string | null;
}

export class RemediationRepository {
	saveRemediation(
		jobId: string,
		request: IRemediationRequest,
		result: IRemediationResult,
		createdAt: Date,
	): void {
		const db = getDatabase();
		const now = new Date().toISOString();

		const errorCount = request.issues.filter(
			(i) => i.issueType === "error",
		).length;
		const suggestionCount = request.issues.filter(
			(i) => i.issueType === "suggestion",
		).length;

		// Build prompt stats without the raw prompt text
		const promptStats: {
			errorFixStats?: IStoredPromptStats;
			suggestionEnrichStats?: IStoredPromptStats;
		} = {};
		if (result.errorFixStats) {
			const { prompt: _, ...stats } = result.errorFixStats;
			promptStats.errorFixStats = stats;
		}
		if (result.suggestionEnrichStats) {
			const { prompt: _, ...stats } = result.suggestionEnrichStats;
			promptStats.suggestionEnrichStats = stats;
		}
		const hasPromptStats =
			promptStats.errorFixStats || promptStats.suggestionEnrichStats;

		const stmt = db.prepare(`
      INSERT INTO remediations (
        id, evaluation_id, status, provider, target_file_type,
        selected_issue_count, error_count, suggestion_count,
        full_patch, file_changes_json,
        total_additions, total_deletions, files_changed,
        total_duration_ms, total_cost_usd, total_input_tokens, total_output_tokens,
        summary_json, prompt_stats_json, error_message, created_at, completed_at
      ) VALUES (
        $id, $evaluationId, $status, $provider, $targetFileType,
        $selectedIssueCount, $errorCount, $suggestionCount,
        $fullPatch, $fileChangesJson,
        $totalAdditions, $totalDeletions, $filesChanged,
        $totalDurationMs, $totalCostUsd, $totalInputTokens, $totalOutputTokens,
        $summaryJson, $promptStatsJson, $errorMessage, $createdAt, $completedAt
      )
    `);

		stmt.run({
			$id: jobId,
			$evaluationId: request.evaluationId,
			$status: "completed",
			$provider: request.provider,
			$targetFileType: request.targetAgent,
			$selectedIssueCount: request.issues.length,
			$errorCount: errorCount,
			$suggestionCount: suggestionCount,
			$fullPatch: result.fullPatch || null,
			$fileChangesJson: JSON.stringify(result.fileChanges),
			$totalAdditions: result.totalAdditions,
			$totalDeletions: result.totalDeletions,
			$filesChanged: result.filesChanged,
			$totalDurationMs: result.totalDurationMs,
			$totalCostUsd: result.totalCostUsd,
			$totalInputTokens: result.totalInputTokens,
			$totalOutputTokens: result.totalOutputTokens,
			$summaryJson: result.summary ? JSON.stringify(result.summary) : null,
			$promptStatsJson: hasPromptStats ? JSON.stringify(promptStats) : null,
			$errorMessage: null,
			$createdAt: createdAt.toISOString(),
			$completedAt: now,
		});

		console.log(`[RemediationRepository] Saved remediation ${jobId}`);
	}

	saveFailedRemediation(
		jobId: string,
		request: IRemediationRequest,
		error: string,
		createdAt: Date,
	): void {
		const db = getDatabase();
		const now = new Date().toISOString();

		const errorCount = request.issues.filter(
			(i) => i.issueType === "error",
		).length;
		const suggestionCount = request.issues.filter(
			(i) => i.issueType === "suggestion",
		).length;

		const stmt = db.prepare(`
      INSERT INTO remediations (
        id, evaluation_id, status, provider, target_file_type,
        selected_issue_count, error_count, suggestion_count,
        full_patch, file_changes_json,
        total_additions, total_deletions, files_changed,
        total_duration_ms, total_cost_usd, total_input_tokens, total_output_tokens,
        prompt_stats_json, error_message, created_at, completed_at
      ) VALUES (
        $id, $evaluationId, $status, $provider, $targetFileType,
        $selectedIssueCount, $errorCount, $suggestionCount,
        $fullPatch, $fileChangesJson,
        $totalAdditions, $totalDeletions, $filesChanged,
        $totalDurationMs, $totalCostUsd, $totalInputTokens, $totalOutputTokens,
        $promptStatsJson, $errorMessage, $createdAt, $completedAt
      )
    `);

		stmt.run({
			$id: jobId,
			$evaluationId: request.evaluationId,
			$status: "failed",
			$provider: request.provider,
			$targetFileType: request.targetAgent,
			$selectedIssueCount: request.issues.length,
			$errorCount: errorCount,
			$suggestionCount: suggestionCount,
			$fullPatch: null,
			$fileChangesJson: null,
			$totalAdditions: 0,
			$totalDeletions: 0,
			$filesChanged: 0,
			$totalDurationMs: 0,
			$totalCostUsd: 0,
			$totalInputTokens: 0,
			$totalOutputTokens: 0,
			$promptStatsJson: null,
			$errorMessage: error,
			$createdAt: createdAt.toISOString(),
			$completedAt: now,
		});

		console.log(`[RemediationRepository] Saved failed remediation ${jobId}`);
	}

	getRemediationById(id: string): IRemediationRecord | null {
		const db = getDatabase();

		const stmt = db.prepare<RemediationRow, string>(
			`SELECT * FROM remediations WHERE id = ?`,
		);
		const row = stmt.get(id);
		if (!row) return null;

		return this.rowToRecord(row);
	}

	deleteRemediation(id: string): boolean {
		const db = getDatabase();
		const stmt = db.prepare(`DELETE FROM remediations WHERE id = ?`);
		const result = stmt.run(id);
		return result.changes > 0;
	}

	getRemediationByEvaluationId(
		evaluationId: string,
	): IRemediationRecord | null {
		const db = getDatabase();

		const stmt = db.prepare<RemediationRow, string>(
			`SELECT * FROM remediations WHERE evaluation_id = ? ORDER BY created_at DESC LIMIT 1`,
		);
		const row = stmt.get(evaluationId);
		if (!row) return null;

		return this.rowToRecord(row);
	}

	private rowToRecord(row: RemediationRow): IRemediationRecord {
		let fileChanges: IFileChange[] = [];
		if (row.file_changes_json) {
			try {
				fileChanges = JSON.parse(row.file_changes_json);
			} catch {
				// ignore parse errors
			}
		}

		let summary: IRemediationSummary | null = null;
		if (row.summary_json) {
			try {
				summary = JSON.parse(row.summary_json);
			} catch {
				// ignore parse errors
			}
		}

		let promptStats: {
			errorFixStats?: IStoredPromptStats;
			suggestionEnrichStats?: IStoredPromptStats;
		} | null = null;
		if (row.prompt_stats_json) {
			try {
				promptStats = JSON.parse(row.prompt_stats_json);
			} catch {
				// ignore parse errors
			}
		}

		return {
			id: row.id,
			evaluationId: row.evaluation_id,
			status: row.status as "completed" | "failed",
			provider: row.provider,
			targetAgent: row.target_file_type,
			selectedIssueCount: row.selected_issue_count,
			errorCount: row.error_count,
			suggestionCount: row.suggestion_count,
			fullPatch: row.full_patch,
			fileChanges,
			totalAdditions: row.total_additions,
			totalDeletions: row.total_deletions,
			filesChanged: row.files_changed,
			totalDurationMs: row.total_duration_ms,
			totalCostUsd: row.total_cost_usd,
			totalInputTokens: row.total_input_tokens,
			totalOutputTokens: row.total_output_tokens,
			summary,
			promptStats,
			errorMessage: row.error_message,
			createdAt: row.created_at,
			completedAt: row.completed_at,
		};
	}
}

export const remediationRepository = new RemediationRepository();
