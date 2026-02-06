import { useCallback, useState } from "react";
import type { ProviderName } from "./useEvaluationApi";

/**
 * Provider status information
 */
export interface ProviderStatus {
	name: ProviderName;
	displayName: string;
	available: boolean;
}

/**
 * Detection state
 */
interface DetectionState {
	status: "idle" | "detecting" | "completed" | "error";
	providers: Map<ProviderName, ProviderStatus>;
	error: string | null;
}

/**
 * Return type for the useProviderDetection hook
 */
interface IUseProviderDetectionReturn {
	detectProviders: () => Promise<void>;
	status: "idle" | "detecting" | "completed" | "error";
	providers: Map<ProviderName, ProviderStatus>;
	error: string | null;
	clearError: () => void;
	getProviderStatus: (name: ProviderName) => ProviderStatus | undefined;
}

/**
 * Hook for detecting available AI provider CLIs
 *
 * Calls the backend /api/providers/detect endpoint to check which CLIs are installed
 */
export function useProviderDetection(): IUseProviderDetectionReturn {
	const [state, setState] = useState<DetectionState>({
		status: "idle",
		providers: new Map(),
		error: null,
	});

	const detectProviders = useCallback(async (): Promise<void> => {
		setState((prev) => ({ ...prev, status: "detecting", error: null }));

		try {
			const response = await fetch("/api/providers/detect", {
				method: "GET",
				headers: { "Content-Type": "application/json" },
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error || `HTTP error ${response.status}`);
			}

			const data = await response.json();
			const providersArray = data.providers as ProviderStatus[];

			// Convert array to Map for efficient lookups
			const providersMap = new Map<ProviderName, ProviderStatus>();
			for (const provider of providersArray) {
				providersMap.set(provider.name, provider);
			}

			setState({
				status: "completed",
				providers: providersMap,
				error: null,
			});
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to detect providers";

			setState((prev) => ({
				...prev,
				status: "error",
				error: message,
			}));
		}
	}, []);

	const clearError = useCallback(() => {
		setState((prev) => ({ ...prev, error: null }));
	}, []);

	const getProviderStatus = useCallback(
		(name: ProviderName): ProviderStatus | undefined => {
			return state.providers.get(name);
		},
		[state.providers],
	);

	return {
		detectProviders,
		status: state.status,
		providers: state.providers,
		error: state.error,
		clearError,
		getProviderStatus,
	};
}
