import { useCallback, useState } from "react";
import type { EvaluatorFilter } from "../types/evaluation";
import type {
	IBatchEvaluateResponse,
	IBatchStatusResponse,
	IEvaluateResponse,
	IJobStatusResponse,
} from "../types/job";

/** Supported AI provider names */
export type ProviderName =
	| "claude"
	| "codex"
	| "opencode"
	| "cursor"
	| "github-copilot"
	| "random";

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

	const clearError = useCallback(() => {
		setError(null);
	}, []);

	return {
		submitJob,
		submitBatch,
		getBatchStatus,
		getJobStatus,
		cancelJob,
		isLoading,
		error,
		clearError,
	};
}
