import type { EvaluationOutput } from "./evaluation";

// Job status types
export type JobStatus = "queued" | "running" | "completed" | "failed";

// API Response types
export interface IEvaluateResponse {
	jobId: string;
	status: JobStatus;
	createdAt: string;
	sseUrl: string;
}

export interface IJobProgress {
	currentFile?: string;
	totalFiles: number;
	completedFiles: number;
	currentEvaluator?: string;
	completedEvaluators: number;
	totalEvaluators: number;
}

// Log entry from server
export interface IJobLog {
	timestamp: string;
	type: "info" | "success" | "warning" | "error";
	message: string;
}

export interface IJobStatusResponse {
	jobId: string;
	status: JobStatus;
	repositoryUrl?: string;
	sseUrl?: string;
	progress?: IJobProgress;
	logs?: IJobLog[];
	result?: EvaluationOutput;
	error?: {
		message: string;
		code: string;
		details?: unknown;
	};
	createdAt: string;
	startedAt?: string;
	completedAt?: string;
	failedAt?: string;
	updatedAt: string;
	duration?: number;
}

// SSE event types (Server-Sent Events)
export interface ISSEEvent {
	type:
		| "job.started"
		| "file.started"
		| "file.completed"
		| "evaluator.progress"
		| "evaluator.completed"
		| "evaluator.retry"
		| "evaluator.timeout"
		| "curation.started"
		| "curation.completed"
		| "job.completed"
		| "job.failed"
		// Clone events
		| "clone.started"
		| "clone.completed"
		| "clone.warning"
		// Discovery events
		| "discovery.started"
		| "discovery.completed"
		// Context sub-step events
		| "context.cloc"
		| "context.folders"
		| "context.analysis"
		| "context.warning";
	jobId: string;
	timestamp: string;
	data?: unknown;
}

export interface IJobStartedEvent extends ISSEEvent {
	type: "job.started";
	data: {
		totalFiles: number;
		evaluationMode: "unified" | "independent";
	};
}

export interface IFileStartedEvent extends ISSEEvent {
	type: "file.started";
	data: {
		filePath: string;
		fileIndex: number;
		totalFiles: number;
	};
}

export interface IFileCompletedEvent extends ISSEEvent {
	type: "file.completed";
	data: {
		filePath: string;
		totalIssues: number;
		highCount: number;
		mediumCount: number;
		lowCount: number;
	};
}

export interface IEvaluatorProgressEvent extends ISSEEvent {
	type: "evaluator.progress";
	data: {
		evaluatorName: string;
		evaluatorIndex: number;
		totalEvaluators: number;
		currentFile?: string;
	};
}

export interface IEvaluatorCompletedEvent extends ISSEEvent {
	type: "evaluator.completed";
	data: {
		evaluatorName: string;
		issuesFound: number;
		duration: number;
	};
}

export interface IEvaluatorRetryEvent extends ISSEEvent {
	type: "evaluator.retry";
	data: {
		evaluatorName: string;
		attempt: number;
		maxRetries: number;
		error: string;
		currentFile?: string;
	};
}

export interface IEvaluatorTimeoutEvent extends ISSEEvent {
	type: "evaluator.timeout";
	data: {
		evaluatorName: string;
		elapsedMs: number;
		timeoutMs: number;
		currentFile?: string;
	};
}

export interface ICurationStartedEvent extends ISSEEvent {
	type: "curation.started";
	data: {
		totalIssues: number;
		issueType?: "error" | "suggestion";
	};
}

export interface ICurationCompletedEvent extends ISSEEvent {
	type: "curation.completed";
	data: {
		curatedCount: number;
		issueType?: "error" | "suggestion";
	};
}

export interface IJobCompletedEvent extends ISSEEvent {
	type: "job.completed";
	data: {
		result: EvaluationOutput;
		duration: number;
	};
}

export interface IJobFailedEvent extends ISSEEvent {
	type: "job.failed";
	data: {
		error: {
			message: string;
			code: string;
			details?: unknown;
		};
	};
}

// Clone events
export interface ICloneStartedEvent extends ISSEEvent {
	type: "clone.started";
	data: {
		repositoryUrl: string;
	};
}

export interface ICloneCompletedEvent extends ISSEEvent {
	type: "clone.completed";
	data: Record<string, never>;
}

export interface ICloneWarningEvent extends ISSEEvent {
	type: "clone.warning";
	data: {
		message: string;
	};
}

// Discovery events
export interface IDiscoveryStartedEvent extends ISSEEvent {
	type: "discovery.started";
	data: Record<string, never>;
}

export interface IDiscoveryCompletedEvent extends ISSEEvent {
	type: "discovery.completed";
	data: {
		filesFound: number;
		filePaths: string[];
	};
}

// Context sub-step events
export interface IContextClocEvent extends ISSEEvent {
	type: "context.cloc";
	data: {
		status: "started" | "completed";
		totalLines?: number;
		languageCount?: number;
	};
}

export interface IContextFoldersEvent extends ISSEEvent {
	type: "context.folders";
	data: {
		status: "started" | "completed";
		folderCount?: number;
	};
}

export interface IContextAnalysisEvent extends ISSEEvent {
	type: "context.analysis";
	data: {
		status: "started" | "completed";
	};
}

export interface IContextWarningEvent extends ISSEEvent {
	type: "context.warning";
	data: {
		message: string;
	};
}

export type SSEEvent =
	| IJobStartedEvent
	| IFileStartedEvent
	| IFileCompletedEvent
	| IEvaluatorProgressEvent
	| IEvaluatorCompletedEvent
	| IEvaluatorRetryEvent
	| IEvaluatorTimeoutEvent
	| ICurationStartedEvent
	| ICurationCompletedEvent
	| IJobCompletedEvent
	| IJobFailedEvent
	// Clone events
	| ICloneStartedEvent
	| ICloneCompletedEvent
	| ICloneWarningEvent
	// Discovery events
	| IDiscoveryStartedEvent
	| IDiscoveryCompletedEvent
	// Context sub-step events
	| IContextClocEvent
	| IContextFoldersEvent
	| IContextAnalysisEvent
	| IContextWarningEvent;

// Frontend-specific progress state for UI
export interface IProgressLog {
	timestamp: Date;
	type: "info" | "success" | "warning" | "error";
	message: string;
}

export interface IProgressState {
	status: JobStatus;
	repositoryUrl: string;
	currentFile?: string;
	totalFiles: number;
	completedFiles: number;
	currentEvaluator?: string;
	totalEvaluators: number;
	completedEvaluators: number;
	startTime: Date;
	estimatedTimeRemaining?: number;
	percentage: number;
	logs: IProgressLog[];
	// Error details for failed state
	errorMessage?: string;
	errorCode?: string;
}

// Evaluation mode for App state
export type EvaluationMode = "idle" | "evaluating" | "completed";

// Batch evaluation types
export type BatchEntryStatus =
	| "pending"
	| "queued"
	| "running"
	| "completed"
	| "failed";

export interface IBatchEvaluateResponse {
	batchId: string;
	totalUrls: number;
	jobs: Array<{ url: string; jobId: string; status: BatchEntryStatus }>;
	createdAt: string;
}

export interface IBatchStatusResponse {
	batchId: string;
	totalUrls: number;
	submitted: number;
	completed: number;
	failed: number;
	running: number;
	queued: number;
	pending: number;
	jobs: Array<{
		url: string;
		jobId: string;
		status: BatchEntryStatus;
	}>;
	createdAt: string;
	isFinished: boolean;
}
