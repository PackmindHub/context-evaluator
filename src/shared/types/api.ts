// API request and response types
import type { EvaluationOutput, IEvaluationOptions, Issue } from "./evaluation";

// Job status types
export type JobStatus = "queued" | "running" | "completed" | "failed";

// API Request types
export interface IEvaluateRequest {
	repositoryUrl?: string;
	localPath?: string;
	options?: IEvaluationOptions;
}

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

// Log entry for job activity
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
		details?: string;
	};
	createdAt: string;
	startedAt?: string;
	completedAt?: string;
	failedAt?: string;
	updatedAt: string;
	duration?: number;
}

export interface IHealthResponse {
	status: "healthy" | "unhealthy";
	version: string;
	uptime: number;
	activeJobs: number;
	queuedJobs: number;
}

// SSE event types (Server-Sent Events)
export interface ISSEEvent {
	type:
		| "job.started"
		| "file.started"
		| "file.completed"
		| "evaluator.progress"
		| "evaluator.completed"
		| "job.completed"
		| "job.failed";
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
			details?: string;
		};
	};
}

export type SSEEvent =
	| IJobStartedEvent
	| IFileStartedEvent
	| IFileCompletedEvent
	| IEvaluatorProgressEvent
	| IEvaluatorCompletedEvent
	| IJobCompletedEvent
	| IJobFailedEvent;

// Job internal types
export interface IJob {
	id: string;
	status: JobStatus;
	request: IEvaluateRequest;
	progress?: IJobProgress;
	logs?: IJobLog[];
	result?: EvaluationOutput;
	error?: {
		message: string;
		code: string;
		details?: string;
	};
	createdAt: Date;
	startedAt?: Date;
	completedAt?: Date;
	failedAt?: Date;
	updatedAt: Date;
}

// Aggregated issues types (cross-evaluation)
export interface IAggregatedIssue {
	issue: Issue;
	evaluationId: string;
	repositoryUrl: string;
	evaluationDate: string;
	evaluatorName: string;
}

export interface IAggregatedIssuesResponse {
	issues: IAggregatedIssue[];
	pagination: {
		page: number;
		pageSize: number;
		totalItems: number;
		totalPages: number;
	};
	availableFilters: {
		evaluators: string[];
		repositories: string[];
	};
}
