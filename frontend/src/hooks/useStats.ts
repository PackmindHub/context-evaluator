import { useCallback, useEffect, useState } from "react";
import { useFeatureFlags } from "../contexts/FeatureFlagContext";
import type {
	IAgentCostStat,
	ICostStatsResponse,
	IEvaluatorStat,
	IEvaluatorStatsResponse,
	IRepoCostStat,
} from "../types/evaluation";

interface UseStatsReturn {
	evaluators: IEvaluatorStat[];
	totalReposEvaluated: number;
	topReposByCost: IRepoCostStat[];
	costByAgent: IAgentCostStat[];
	isLoading: boolean;
	error: string | null;
	refresh: () => void;
}

export function useStats(): UseStatsReturn {
	const { cloudMode } = useFeatureFlags();
	const [evaluators, setEvaluators] = useState<IEvaluatorStat[]>([]);
	const [totalReposEvaluated, setTotalReposEvaluated] = useState(0);
	const [topReposByCost, setTopReposByCost] = useState<IRepoCostStat[]>([]);
	const [costByAgent, setCostByAgent] = useState<IAgentCostStat[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchStats = useCallback(async () => {
		setIsLoading(true);
		setError(null);

		try {
			const response = await fetch("/api/stats", {
				method: "GET",
				headers: { "Content-Type": "application/json" },
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error || `HTTP error ${response.status}`);
			}

			const data: IEvaluatorStatsResponse = await response.json();
			setEvaluators(data.evaluators);
			setTotalReposEvaluated(data.totalReposEvaluated);

			// Fetch cost stats only in non-cloud mode
			if (!cloudMode) {
				const costResponse = await fetch("/api/stats/costs", {
					method: "GET",
					headers: { "Content-Type": "application/json" },
				});

				if (costResponse.ok) {
					const costData: ICostStatsResponse = await costResponse.json();
					setTopReposByCost(costData.topReposByCost);
					setCostByAgent(costData.costByAgent);
				}
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to fetch stats");
		} finally {
			setIsLoading(false);
		}
	}, [cloudMode]);

	useEffect(() => {
		fetchStats();
	}, [fetchStats]);

	return {
		evaluators,
		totalReposEvaluated,
		topReposByCost,
		costByAgent,
		isLoading,
		error,
		refresh: fetchStats,
	};
}
