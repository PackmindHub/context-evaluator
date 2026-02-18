import { useCallback, useMemo, useState } from "react";
import type { EvaluatorFilter, Issue } from "../types/evaluation";
import type {
	IBatchEvaluateResponse,
	IBatchStatusResponse,
	IEvaluateResponse,
	IJobStatusResponse,
} from "../types/job";
import type {
	RemediationHistoryItem,
	RemediationResult,
} from "../types/remediation";

/** Supported AI provider names */
export type ProviderName =
	| "claude"
	| "codex"
	| "opencode"
	| "cursor"
	| "github-copilot"
	| "random";

/** Target agent for remediation output */
export type TargetAgent =
	| "agents-md"
	| "claude-code"
	| "github-copilot"
	| "cursor";

export interface RemediationPromptsResponse {
	errorFixPrompt: string;
	suggestionEnrichPrompt: string;
	errorCount: number;
	suggestionCount: number;
}

export interface ExecuteRemediationResponse {
	remediationId: string;
	sseUrl: string;
	status: string;
}

export interface RemediationStatusResponse {
	id: string;
	status: string;
	currentStep?: string;
	result?: RemediationResult;
	error?: { message: string; code: string };
	createdAt: string;
	startedAt?: string;
	completedAt?: string;
}

export interface RemediationForEvaluationResponse {
	id: string;
	status: string;
	currentStep?: string;
	result?: RemediationResult;
	error?: { message: string; code?: string };
	createdAt: string;
	startedAt?: string;
	completedAt?: string | null;
	// DB record fields (flat shape)
	fullPatch?: string | null;
	fileChanges?: RemediationResult["fileChanges"];
	totalAdditions?: number;
	totalDeletions?: number;
	filesChanged?: number;
	totalDurationMs?: number;
	totalCostUsd?: number;
	totalInputTokens?: number;
	totalOutputTokens?: number;
	summary?: RemediationResult["summary"] | null;
	promptStats?: {
		errorFixStats?: RemediationResult["errorFixStats"];
		suggestionEnrichStats?: RemediationResult["suggestionEnrichStats"];
	} | null;
	errorMessage?: string | null;
}

export interface RemediationsListResponse {
	remediations: RemediationHistoryItem[];
	activeJob: {
		id: string;
		status: string;
		currentStep?: string;
		createdAt: string;
	} | null;
}

export interface ImportReportResponse {
	evaluationId: string;
	repositoryUrl: string;
	status: string;
}

export interface EvaluateImpactResponse {
	jobId: string;
	sseUrl: string;
	status: "queued" | "already_exists";
}

export interface EvaluationScoreResponse {
	contextScore?: number;
	contextGrade?: string;
}

interface IUseEvaluationApiReturn {
	submitJob: (
		repositoryUrl: string,
		evaluators?: number,
		provider?: ProviderName,
		evaluatorFilter?: EvaluatorFilter,
		timeout?: number,
		concurrency?: number,
		selectedEvaluators?: string[],
	) => Promise<IEvaluateResponse>;
	submitBatch: (
		urls: string[],
		evaluators?: number,
		provider?: ProviderName,
		evaluatorFilter?: EvaluatorFilter,
		timeout?: number,
		concurrency?: number,
		selectedEvaluators?: string[],
	) => Promise<IBatchEvaluateResponse>;
	getBatchStatus: (batchId: string) => Promise<IBatchStatusResponse>;
	getJobStatus: (jobId: string) => Promise<IJobStatusResponse>;
	cancelJob: (jobId: string) => Promise<void>;
	generateRemediationPrompts: (
		evaluationId: string,
		issues: Issue[],
		targetAgent: TargetAgent,
	) => Promise<RemediationPromptsResponse>;
	executeRemediation: (
		evaluationId: string,
		issues: Issue[],
		targetAgent: TargetAgent,
		provider: ProviderName,
	) => Promise<ExecuteRemediationResponse>;
	getRemediationResult: (
		remediationId: string,
	) => Promise<RemediationStatusResponse>;
	getRemediationForEvaluation: (
		evaluationId: string,
	) => Promise<RemediationForEvaluationResponse | null>;
	getRemediationsForEvaluation: (
		evaluationId: string,
	) => Promise<RemediationsListResponse>;
	deleteRemediation: (remediationId: string) => Promise<void>;
	downloadPatch: (remediationId: string) => Promise<void>;
	importReport: (reportJson: unknown) => Promise<ImportReportResponse>;
	evaluateRemediationImpact: (
		remediationId: string,
	) => Promise<EvaluateImpactResponse>;
	getEvaluationScore: (
		evaluationId: string,
	) => Promise<EvaluationScoreResponse>;
	isLoading: boolean;
	error: string | null;
	clearError: () => void;
}

export function useEvaluationApi(): IUseEvaluationApiReturn {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const submitJob = useCallback(
		async (
			repositoryUrl: string,
			evaluators?: number,
			provider?: ProviderName,
			evaluatorFilter?: EvaluatorFilter,
			timeout?: number,
			concurrency?: number,
			selectedEvaluators?: string[],
		): Promise<IEvaluateResponse> => {
			setIsLoading(true);
			setError(null);

			try {
				const response = await fetch("/api/evaluate", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						repositoryUrl,
						options: {
							...(evaluators ? { evaluators } : {}),
							...(provider ? { provider } : {}),
							...(evaluatorFilter ? { evaluatorFilter } : {}),
							...(timeout ? { timeout } : {}),
							...(concurrency ? { concurrency } : {}),
							...(selectedEvaluators ? { selectedEvaluators } : {}),
						},
					}),
				});

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}));

					// Handle queue full error (429) with user-friendly message
					if (response.status === 429 || errorData.code === "QUEUE_FULL") {
						throw new Error(
							"The evaluation queue is currently at capacity. Please wait a few moments for running evaluations to complete, then try again.",
						);
					}

					throw new Error(errorData.error || `HTTP error ${response.status}`);
				}

				const data = await response.json();

				// Ensure sseUrl is an absolute URL
				if (data.sseUrl && data.sseUrl.startsWith("/")) {
					data.sseUrl = `${window.location.origin}${data.sseUrl}`;
				}

				return data as IEvaluateResponse;
			} catch (err) {
				const message =
					err instanceof Error
						? err.message
						: "Failed to submit evaluation job";
				setError(message);
				throw err;
			} finally {
				setIsLoading(false);
			}
		},
		[],
	);

	const getJobStatus = useCallback(
		async (jobId: string): Promise<IJobStatusResponse> => {
			try {
				const response = await fetch(`/api/evaluate/${jobId}`, {
					method: "GET",
					headers: { "Content-Type": "application/json" },
				});

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}));
					throw new Error(errorData.error || `HTTP error ${response.status}`);
				}

				return (await response.json()) as IJobStatusResponse;
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to get job status";
				setError(message);
				throw err;
			}
		},
		[],
	);

	const cancelJob = useCallback(async (jobId: string): Promise<void> => {
		try {
			const response = await fetch(`/api/evaluate/${jobId}`, {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
			});

			if (!response.ok && response.status !== 404) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error || `HTTP error ${response.status}`);
			}
		} catch (err) {
			// Silently handle cancel errors - job might already be completed
			console.warn("[API] Cancel job error:", err);
		}
	}, []);

	const submitBatch = useCallback(
		async (
			urls: string[],
			evaluators?: number,
			provider?: ProviderName,
			evaluatorFilter?: EvaluatorFilter,
			timeout?: number,
			concurrency?: number,
			selectedEvaluators?: string[],
		): Promise<IBatchEvaluateResponse> => {
			setIsLoading(true);
			setError(null);

			try {
				const response = await fetch("/api/evaluate/batch", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						urls,
						options: {
							...(evaluators ? { evaluators } : {}),
							...(provider ? { provider } : {}),
							...(evaluatorFilter ? { evaluatorFilter } : {}),
							...(timeout ? { timeout } : {}),
							...(concurrency ? { concurrency } : {}),
							...(selectedEvaluators ? { selectedEvaluators } : {}),
						},
					}),
				});

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}));
					throw new Error(errorData.error || `HTTP error ${response.status}`);
				}

				return (await response.json()) as IBatchEvaluateResponse;
			} catch (err) {
				const message =
					err instanceof Error
						? err.message
						: "Failed to submit batch evaluation";
				setError(message);
				throw err;
			} finally {
				setIsLoading(false);
			}
		},
		[],
	);

	const getBatchStatus = useCallback(
		async (batchId: string): Promise<IBatchStatusResponse> => {
			try {
				const response = await fetch(`/api/evaluate/batch/${batchId}`, {
					method: "GET",
					headers: { "Content-Type": "application/json" },
				});

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}));
					throw new Error(errorData.error || `HTTP error ${response.status}`);
				}

				return (await response.json()) as IBatchStatusResponse;
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to get batch status";
				setError(message);
				throw err;
			}
		},
		[],
	);

	const generateRemediationPrompts = useCallback(
		async (
			evaluationId: string,
			issues: Issue[],
			targetAgent: TargetAgent,
		): Promise<RemediationPromptsResponse> => {
			try {
				const response = await fetch("/api/remediation/generate-prompts", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						evaluationId,
						issues,
						targetAgent,
					}),
				});

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}));
					throw new Error(errorData.error || `HTTP error ${response.status}`);
				}

				return (await response.json()) as RemediationPromptsResponse;
			} catch (err) {
				const message =
					err instanceof Error
						? err.message
						: "Failed to generate remediation prompts";
				setError(message);
				throw err;
			}
		},
		[],
	);

	const executeRemediation = useCallback(
		async (
			evaluationId: string,
			issues: Issue[],
			targetAgent: TargetAgent,
			provider: ProviderName,
		): Promise<ExecuteRemediationResponse> => {
			try {
				const response = await fetch("/api/remediation/execute", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						evaluationId,
						issues,
						targetAgent,
						provider,
					}),
				});

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}));
					throw new Error(errorData.error || `HTTP error ${response.status}`);
				}

				const data = await response.json();

				// Ensure sseUrl is absolute
				if (data.sseUrl && data.sseUrl.startsWith("/")) {
					data.sseUrl = `${window.location.origin}${data.sseUrl}`;
				}

				return data as ExecuteRemediationResponse;
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to execute remediation";
				setError(message);
				throw err;
			}
		},
		[],
	);

	const getRemediationResult = useCallback(
		async (remediationId: string): Promise<RemediationStatusResponse> => {
			try {
				const response = await fetch(`/api/remediation/${remediationId}`, {
					method: "GET",
					headers: { "Content-Type": "application/json" },
				});

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}));
					throw new Error(errorData.error || `HTTP error ${response.status}`);
				}

				return (await response.json()) as RemediationStatusResponse;
			} catch (err) {
				const message =
					err instanceof Error
						? err.message
						: "Failed to get remediation result";
				setError(message);
				throw err;
			}
		},
		[],
	);

	const getRemediationForEvaluation = useCallback(
		async (
			evaluationId: string,
		): Promise<RemediationForEvaluationResponse | null> => {
			try {
				const response = await fetch(
					`/api/remediation/for-evaluation/${evaluationId}`,
					{
						method: "GET",
						headers: { "Content-Type": "application/json" },
					},
				);

				if (response.status === 404) {
					return null;
				}

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}));
					throw new Error(errorData.error || `HTTP error ${response.status}`);
				}

				return (await response.json()) as RemediationForEvaluationResponse;
			} catch (err) {
				// Silently return null — this is a best-effort lookup on mount
				console.warn("[API] Failed to fetch remediation for evaluation:", err);
				return null;
			}
		},
		[],
	);

	const getRemediationsForEvaluation = useCallback(
		async (evaluationId: string): Promise<RemediationsListResponse> => {
			try {
				const response = await fetch(
					`/api/remediation/list-for-evaluation/${evaluationId}`,
					{
						method: "GET",
						headers: { "Content-Type": "application/json" },
					},
				);

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}));
					throw new Error(errorData.error || `HTTP error ${response.status}`);
				}

				return (await response.json()) as RemediationsListResponse;
			} catch (err) {
				console.warn("[API] Failed to fetch remediations for evaluation:", err);
				return { remediations: [], activeJob: null };
			}
		},
		[],
	);

	const deleteRemediation = useCallback(
		async (remediationId: string): Promise<void> => {
			try {
				const response = await fetch(`/api/remediation/${remediationId}`, {
					method: "DELETE",
					headers: { "Content-Type": "application/json" },
				});

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}));
					throw new Error(errorData.error || `HTTP error ${response.status}`);
				}
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to delete remediation";
				setError(message);
				throw err;
			}
		},
		[],
	);

	const downloadPatch = useCallback(
		async (remediationId: string): Promise<void> => {
			try {
				const response = await fetch(`/api/remediation/${remediationId}/patch`);

				if (!response.ok) {
					throw new Error(`Failed to download patch: HTTP ${response.status}`);
				}

				const blob = await response.blob();
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = "remediation.patch";
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to download patch";
				setError(message);
				throw err;
			}
		},
		[],
	);

	const importReport = useCallback(
		async (reportJson: unknown): Promise<ImportReportResponse> => {
			setIsLoading(true);
			setError(null);

			try {
				const response = await fetch("/api/evaluations/import", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(reportJson),
				});

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}));
					throw new Error(errorData.error || `HTTP error ${response.status}`);
				}

				return (await response.json()) as ImportReportResponse;
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to import report";
				setError(message);
				throw err;
			} finally {
				setIsLoading(false);
			}
		},
		[],
	);

	const evaluateRemediationImpact = useCallback(
		async (remediationId: string): Promise<EvaluateImpactResponse> => {
			try {
				const response = await fetch(
					`/api/remediation/${remediationId}/evaluate`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
					},
				);

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}));
					// 409 with existing jobId means evaluation is in progress
					if (response.status === 409 && errorData.jobId) {
						return {
							jobId: errorData.jobId,
							sseUrl: errorData.sseUrl,
							status: "queued",
						};
					}
					throw new Error(errorData.error || `HTTP error ${response.status}`);
				}

				return (await response.json()) as EvaluateImpactResponse;
			} catch (err) {
				const message =
					err instanceof Error
						? err.message
						: "Failed to start impact evaluation";
				setError(message);
				throw err;
			}
		},
		[],
	);

	const getEvaluationScore = useCallback(
		async (evaluationId: string): Promise<EvaluationScoreResponse> => {
			try {
				const response = await fetch(`/api/evaluations/${evaluationId}`, {
					method: "GET",
					headers: { "Content-Type": "application/json" },
				});

				if (!response.ok) {
					throw new Error(`HTTP error ${response.status}`);
				}

				const data = await response.json();
				return {
					contextScore: data.contextScore,
					contextGrade: data.contextGrade,
				};
			} catch (err) {
				console.warn("[API] Failed to fetch evaluation score:", err);
				return {};
			}
		},
		[],
	);

	const clearError = useCallback(() => {
		setError(null);
	}, []);

	return useMemo(
		() => ({
			submitJob,
			submitBatch,
			getBatchStatus,
			getJobStatus,
			cancelJob,
			generateRemediationPrompts,
			executeRemediation,
			getRemediationResult,
			getRemediationForEvaluation,
			getRemediationsForEvaluation,
			deleteRemediation,
			downloadPatch,
			importReport,
			evaluateRemediationImpact,
			getEvaluationScore,
			isLoading,
			error,
			clearError,
		}),
		[
			submitJob,
			submitBatch,
			getBatchStatus,
			getJobStatus,
			cancelJob,
			generateRemediationPrompts,
			executeRemediation,
			getRemediationResult,
			getRemediationForEvaluation,
			getRemediationsForEvaluation,
			deleteRemediation,
			downloadPatch,
			importReport,
			evaluateRemediationImpact,
			getEvaluationScore,
			isLoading,
			error,
			clearError,
		],
	);
}
