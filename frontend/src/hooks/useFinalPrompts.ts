import { useCallback, useEffect, useState } from "react";

interface IFinalPromptsResponse {
	evaluationId: string;
	prompts: Record<string, string>;
}

/**
 * Hook to fetch final prompts for a completed evaluation
 */
export function useFinalPrompts(evaluationId: string | null) {
	const [prompts, setPrompts] = useState<Record<string, string>>({});
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchPrompts = useCallback(async (id: string) => {
		setIsLoading(true);
		setError(null);

		try {
			const response = await fetch(`/api/evaluations/${id}/prompts`);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(
					errorData.error || `Failed to fetch prompts: ${response.status}`,
				);
			}

			const data: IFinalPromptsResponse = await response.json();
			setPrompts(data.prompts || {});
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to fetch prompts";
			setError(message);
			console.error("[useFinalPrompts] Error:", message);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!evaluationId) {
			setPrompts({});
			setError(null);
			return;
		}

		fetchPrompts(evaluationId);
	}, [evaluationId, fetchPrompts]);

	return { prompts, isLoading, error };
}
