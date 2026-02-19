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
	outputType?: "standard" | "skill" | "generic";
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

export interface PlanData {
	errorPlan?: string;
	suggestionPlan?: string;
	errorPlanPrompt?: string;
	suggestionPlanPrompt?: string;
	errorFixPrompt?: string;
	suggestionEnrichPrompt?: string;
	errorFixDiff?: string;
	errorFixFileChanges?: FileChange[];
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
	errorPlanStats?: PromptStats;
	suggestionPlanStats?: PromptStats;
}

export interface IRemediationProgressState {
	status: RemediationStatus;
	currentStep?: string;
	batchInfo?: { batchNumber: number; totalBatches: number };
	logs: Array<{ timestamp: string; message: string }>;
	result?: RemediationResult;
	error?: { message: string };
	// Enriched progress tracking
	errorCount?: number;
	suggestionCount?: number;
	totalBatches?: number;
	completedBatches?: number;
	currentPhase?: "errors" | "suggestions";
	runningTotalCostUsd?: number;
	runningTotalDurationMs?: number;
	runningTotalInputTokens?: number;
	runningTotalOutputTokens?: number;
	currentBatchIssues?: string[];
	lastBatchStats?: {
		durationMs: number;
		costUsd: number;
		inputTokens: number;
		outputTokens: number;
	};
}

export interface RemediationHistoryItem {
	id: string;
	evaluationId: string;
	status: "completed" | "failed";
	provider: string;
	targetAgent: string;
	selectedIssueCount: number;
	errorCount: number;
	suggestionCount: number;
	fullPatch: string | null;
	fileChanges: FileChange[];
	totalAdditions: number;
	totalDeletions: number;
	filesChanged: number;
	totalDurationMs: number;
	totalCostUsd: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	summary: RemediationSummary | null;
	promptStats: {
		errorFixStats?: PromptStats;
		suggestionEnrichStats?: PromptStats;
		errorPlanStats?: PromptStats;
		suggestionPlanStats?: PromptStats;
	} | null;
	planData: PlanData | null;
	resultEvaluationId: string | null;
	errorMessage: string | null;
	createdAt: string;
	completedAt: string | null;
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
