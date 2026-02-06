import { useCallback, useRef, useState } from "react";
import type {
	IEvaluator,
	IEvaluatorsListResponse,
	IEvaluatorTemplate,
} from "../types/evaluator";

interface IUseEvaluatorsApiReturn {
	evaluators: IEvaluator[];
	fetchEvaluatorsList: () => Promise<IEvaluator[]>;
	fetchTemplate: (id: string) => Promise<IEvaluatorTemplate>;
	isLoading: boolean;
	error: string | null;
}

export function useEvaluatorsApi(): IUseEvaluatorsApiReturn {
	const [evaluators, setEvaluators] = useState<IEvaluator[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Cache templates to avoid refetching
	const templateCache = useRef<Map<string, IEvaluatorTemplate>>(new Map());

	const fetchEvaluatorsList = useCallback(async (): Promise<IEvaluator[]> => {
		// Return cached if already loaded
		if (evaluators.length > 0) {
			return evaluators;
		}

		setIsLoading(true);
		setError(null);

		try {
			const response = await fetch("/api/evaluators", {
				method: "GET",
				headers: { "Content-Type": "application/json" },
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error || `HTTP error ${response.status}`);
			}

			const data: IEvaluatorsListResponse = await response.json();
			setEvaluators(data.evaluators);
			return data.evaluators;
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to fetch evaluators";
			setError(message);
			throw err;
		} finally {
			setIsLoading(false);
		}
	}, [evaluators]);

	const fetchTemplate = useCallback(
		async (id: string): Promise<IEvaluatorTemplate> => {
			// Return cached if available
			const cached = templateCache.current.get(id);
			if (cached) {
				return cached;
			}

			setIsLoading(true);
			setError(null);

			try {
				const response = await fetch(`/api/evaluators/${id}`, {
					method: "GET",
					headers: { "Content-Type": "application/json" },
				});

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}));
					throw new Error(errorData.error || `HTTP error ${response.status}`);
				}

				const data: IEvaluatorTemplate = await response.json();
				templateCache.current.set(id, data);
				return data;
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to fetch template";
				setError(message);
				throw err;
			} finally {
				setIsLoading(false);
			}
		},
		[],
	);

	return {
		evaluators,
		fetchEvaluatorsList,
		fetchTemplate,
		isLoading,
		error,
	};
}
