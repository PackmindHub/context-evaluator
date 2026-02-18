// API request and response types
import type { EvaluationOutput, IEvaluationOptions, Issue } from "./evaluation";

// Job status types
export type JobStatus = "queued" | "running" | "completed" | "failed";

// API Request types
export interface IEvaluateRequest {
	repositoryUrl?: string;
	localPath?: string;
	options?: IEvaluationOptions;
	// Internal fields for remediation impact evaluation (not sent from frontend)
	_cleanupFn?: () => Promise<void>;
	_parentEvaluationId?: string;
	_sourceRemediationId?: string;
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

// Batch API types
export type BatchEntryStatus =
	| "pending"
	| "queued"
	| "running"
	| "completed"
	| "failed";

export interface IBatchEvaluateRequest {
	urls: string[]; // 1-50 public Git URLs
	options?: IEvaluationOptions;
}

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

// Evaluator stats types (cross-evaluation aggregation)
export interface IEvaluatorStat {
	evaluatorId: string; // e.g., "content-quality"
	evaluatorName: string; // e.g., "Content Quality"
	issueType: "error" | "suggestion";
	repoCount: number; // unique repos with ≥1 issue
	totalIssueCount: number; // total issues across all repos
}

export interface IEvaluatorStatsResponse {
	evaluators: IEvaluatorStat[];
	totalReposEvaluated: number;
}

// Cost stats types (cross-evaluation aggregation)
export interface IRepoCostStat {
	repositoryUrl: string;
	totalCostUsd: number;
	totalLOC: number | null;
}

export interface IAgentCostStat {
	agent: string;
	totalCostUsd: number;
}

export interface ICostStatsResponse {
	topReposByCost: IRepoCostStat[];
	costByAgent: IAgentCostStat[];
}

// Token consumption stats types (per-evaluator)
export interface IEvaluatorTokenStat {
	evaluatorId: string;
	evaluatorName: string;
	avgInputTokens: number;
	avgOutputTokens: number;
	avgCostUsd: number;
	sampleCount: number;
}

export interface IContextIdentificationTokenStat {
	avgInputTokens: number;
	avgOutputTokens: number;
	avgCostUsd: number;
	sampleCount: number;
}

export interface ITokenStatsResponse {
	evaluators: IEvaluatorTokenStat[];
	contextIdentification: IContextIdentificationTokenStat | null;
	totalEvaluationsAnalyzed: number;
}
