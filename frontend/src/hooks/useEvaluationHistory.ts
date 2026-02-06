import { useCallback, useEffect, useState } from "react";
import type {
	IEvaluationHistoryItem,
	IEvaluationRecord,
} from "../types/evaluation";

interface IUseEvaluationHistoryReturn {
	history: IEvaluationHistoryItem[];
	isLoading: boolean;
	error: string | null;
	loadEvaluation: (id: string) => Promise<IEvaluationRecord | null>;
	deleteEvaluation: (id: string) => Promise<boolean>;
	clearAllEvaluations: () => Promise<boolean>;
	refresh: () => Promise<void>;
}

export function useEvaluationHistory(): IUseEvaluationHistoryReturn {
	const [history, setHistory] = useState<IEvaluationHistoryItem[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Fetch recent evaluations from database
	const fetchHistory = useCallback(async () => {
		setIsLoading(true);
		setError(null);

		try {
			const response = await fetch("/api/evaluations?limit=50", {
				method: "GET",
				headers: { "Content-Type": "application/json" },
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error || `HTTP error ${response.status}`);
			}

			const data = (await response.json()) as IEvaluationHistoryItem[];
			setHistory(data);
		} catch (err) {
			const message =
				err instanceof Error
					? err.message
					: "Failed to fetch evaluation history";
			setError(message);
			console.error("[useEvaluationHistory] Error fetching history:", err);
		} finally {
			setIsLoading(false);
		}
	}, []);

	// Load full evaluation by ID
	const loadEvaluation = useCallback(
		async (id: string): Promise<IEvaluationRecord | null> => {
			try {
				const response = await fetch(`/api/evaluations/${id}`, {
					method: "GET",
					headers: { "Content-Type": "application/json" },
				});

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}));
					throw new Error(errorData.error || `HTTP error ${response.status}`);
				}

				return (await response.json()) as IEvaluationRecord;
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to load evaluation";
				setError(message);
				console.error("[useEvaluationHistory] Error loading evaluation:", err);
				return null;
			}
		},
		[],
	);

	// Delete evaluation by ID
	const deleteEvaluation = useCallback(async (id: string): Promise<boolean> => {
		try {
			const response = await fetch(`/api/evaluations/${id}`, {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error || `HTTP error ${response.status}`);
			}

			// Remove from local state
			setHistory((prev) => prev.filter((item) => item.id !== id));
			return true;
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to delete evaluation";
			setError(message);
			console.error("[useEvaluationHistory] Error deleting evaluation:", err);
			return false;
		}
	}, []);

	// Delete all evaluations
	const clearAllEvaluations = useCallback(async (): Promise<boolean> => {
		try {
			const response = await fetch("/api/evaluations", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error || `HTTP error ${response.status}`);
			}

			// Clear local state
			setHistory([]);
			return true;
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to clear all evaluations";
			setError(message);
			console.error(
				"[useEvaluationHistory] Error clearing all evaluations:",
				err,
			);
			return false;
		}
	}, []);

	// Fetch history on mount
	useEffect(() => {
		fetchHistory();
	}, [fetchHistory]);

	return {
		history,
		isLoading,
		error,
		loadEvaluation,
		deleteEvaluation,
		clearAllEvaluations,
		refresh: fetchHistory,
	};
}
