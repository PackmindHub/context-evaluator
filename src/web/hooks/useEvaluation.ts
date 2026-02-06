import type { IEvaluateRequest, IJobStatusResponse } from "@shared/types/api";
import { useCallback, useState } from "react";

/**
 * API configuration
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

/**
 * Evaluation hook state
 */
interface IUseEvaluationState {
	loading: boolean;
	error: Error | null;
	jobId: string | null;
	jobStatus: IJobStatusResponse | null;
}

/**
 * Evaluation hook return value
 */
interface IUseEvaluationReturn extends IUseEvaluationState {
	startEvaluation: (
		request: IEvaluateRequest,
	) => Promise<IJobStatusResponse | null>;
	fetchJobStatus: (jobId: string) => Promise<IJobStatusResponse | null>;
	reset: () => void;
}

/**
 * Custom hook for evaluation API calls
 *
 * Features:
 * - Start new evaluation
 * - Fetch job status
 * - Loading and error state management
 * - Type-safe API responses
 */
export function useEvaluation(): IUseEvaluationReturn {
	const [state, setState] = useState<IUseEvaluationState>({
		loading: false,
		error: null,
		jobId: null,
		jobStatus: null,
	});

	/**
	 * Start a new evaluation
	 */
	const startEvaluation = useCallback(
		async (request: IEvaluateRequest): Promise<IJobStatusResponse | null> => {
			setState((prev) => ({ ...prev, loading: true, error: null }));

			try {
				const response = await fetch(`${API_BASE_URL}/api/evaluate`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(request),
				});

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}));
					throw new Error(
						errorData.error ||
							`HTTP ${response.status}: ${response.statusText}`,
					);
				}

				const data: IJobStatusResponse = await response.json();

				setState({
					loading: false,
					error: null,
					jobId: data.jobId,
					jobStatus: data,
				});

				return data;
			} catch (err) {
				const error =
					err instanceof Error ? err : new Error("Failed to start evaluation");
				console.error("[useEvaluation] Error starting evaluation:", error);

				setState((prev) => ({
					...prev,
					loading: false,
					error,
				}));

				return null;
			}
		},
		[],
	);

	/**
	 * Fetch job status
	 */
	const fetchJobStatus = useCallback(
		async (jobId: string): Promise<IJobStatusResponse | null> => {
			setState((prev) => ({ ...prev, loading: true, error: null }));

			try {
				const response = await fetch(`${API_BASE_URL}/api/evaluate/${jobId}`);

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}));
					throw new Error(
						errorData.error ||
							`HTTP ${response.status}: ${response.statusText}`,
					);
				}

				const data: IJobStatusResponse = await response.json();

				setState((prev) => ({
					...prev,
					loading: false,
					jobStatus: data,
				}));

				return data;
			} catch (err) {
				const error =
					err instanceof Error ? err : new Error("Failed to fetch job status");
				console.error("[useEvaluation] Error fetching job status:", error);

				setState((prev) => ({
					...prev,
					loading: false,
					error,
				}));

				return null;
			}
		},
		[],
	);

	/**
	 * Reset state
	 */
	const reset = useCallback(() => {
		setState({
			loading: false,
			error: null,
			jobId: null,
			jobStatus: null,
		});
	}, []);

	return {
		...state,
		startEvaluation,
		fetchJobStatus,
		reset,
	};
}

/**
 * Fetch health status
 */
export async function fetchHealthStatus(): Promise<{
	status: "healthy" | "degraded" | "unhealthy";
	uptime: number;
	version: string;
	jobs?: {
		total: number;
		active: number;
		queued: number;
		running: number;
		completed: number;
		failed: number;
	};
} | null> {
	try {
		const response = await fetch(`${API_BASE_URL}/api/health`);

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		return await response.json();
	} catch (err) {
		console.error("[fetchHealthStatus] Error:", err);
		return null;
	}
}
