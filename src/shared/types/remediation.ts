/**
 * Shared types for the remediation execution system
 */

import type { ProviderName } from "../providers/types";

export const REMEDIATION_BATCH_SIZE = 10;

export type RemediationStatus = "queued" | "running" | "completed" | "failed";

export type RemediationStep =
	| "cloning"
	| "checking_git"
	| "executing_error_fix"
	| "executing_suggestion_enrich"
	| "capturing_diff"
	| "resetting";

export interface IFileChange {
	path: string;
	status: "modified" | "added" | "deleted";
	diff: string;
	additions: number;
	deletions: number;
}

export interface IPromptExecutionStats {
	prompt: string;
	durationMs: number;
	costUsd?: number;
	inputTokens?: number;
	outputTokens?: number;
}

export interface IStoredPromptStats {
	durationMs: number;
	costUsd?: number;
	inputTokens?: number;
	outputTokens?: number;
}

export interface IRemediationAction {
	issueIndex: number;
	status: "fixed" | "added" | "skipped";
	file?: string;
	summary: string;
	issueTitle?: string;
}

export interface IRemediationSummary {
	errorFixActions: IRemediationAction[];
	suggestionEnrichActions: IRemediationAction[];
	addressedCount: number;
	skippedCount: number;
	parsed: boolean;
}

export interface IRemediationResult {
	errorFixStats?: IPromptExecutionStats;
	suggestionEnrichStats?: IPromptExecutionStats;
	fullPatch: string;
	fileChanges: IFileChange[];
	totalAdditions: number;
	totalDeletions: number;
	filesChanged: number;
	totalDurationMs: number;
	totalCostUsd: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	summary?: IRemediationSummary;
}

export interface IRemediationRequest {
	evaluationId: string;
	issues: Array<{
		issueType: "error" | "suggestion";
		category: string;
		title?: string;
		problem?: string;
		description?: string;
		severity?: number;
		impactLevel?: string;
		location?:
			| { file?: string; start?: number; end?: number }
			| Array<{ file?: string; start?: number; end?: number }>;
		snippet?: string;
		fix?: string;
		recommendation?: string;
		evaluatorName?: string;
		isPhantomFile?: boolean;
	}>;
	targetFileType: "AGENTS.md" | "CLAUDE.md";
	provider: ProviderName;
}

export interface RemediationProgressEvent {
	type:
		| "remediation.started"
		| "remediation.progress"
		| "remediation.step.started"
		| "remediation.step.completed"
		| "remediation.completed"
		| "remediation.failed";
	data: Record<string, unknown>;
}

export interface IRemediationJob {
	id: string;
	status: RemediationStatus;
	request: IRemediationRequest;
	currentStep?: RemediationStep;
	result?: IRemediationResult;
	error?: { message: string; code: string };
	createdAt: Date;
	startedAt?: Date;
	completedAt?: Date;
}
