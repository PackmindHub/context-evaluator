/**
 * Frontend types for the remediation execution system
 */

export type RemediationStatus = "queued" | "running" | "completed" | "failed";

export interface FileChange {
	path: string;
	status: "modified" | "added" | "deleted";
	diff: string;
	additions: number;
	deletions: number;
}

export interface RemediationAction {
	issueIndex: number;
	status: "fixed" | "added" | "skipped";
	file?: string;
	summary: string;
	issueTitle?: string;
}

export interface RemediationSummary {
	errorFixActions: RemediationAction[];
	suggestionEnrichActions: RemediationAction[];
	addressedCount: number;
	skippedCount: number;
	parsed: boolean;
}

export interface PromptStats {
	durationMs: number;
	costUsd?: number;
	inputTokens?: number;
	outputTokens?: number;
}

export interface RemediationResult {
	fullPatch: string;
	fileChanges: FileChange[];
	totalAdditions: number;
	totalDeletions: number;
	filesChanged: number;
	totalDurationMs: number;
	totalCostUsd: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	summary?: RemediationSummary;
	errorFixStats?: PromptStats;
	suggestionEnrichStats?: PromptStats;
}

export interface IRemediationProgressState {
	status: RemediationStatus;
	currentStep?: string;
	batchInfo?: { batchNumber: number; totalBatches: number };
	logs: Array<{ timestamp: string; message: string }>;
	result?: RemediationResult;
	error?: { message: string };
}

export interface DiffLine {
	type: "addition" | "deletion" | "context" | "header";
	content: string;
	oldLineNumber?: number;
	newLineNumber?: number;
}

export interface DiffHunk {
	header: string;
	lines: DiffLine[];
}
