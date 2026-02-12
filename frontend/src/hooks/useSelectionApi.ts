import { useCallback, useMemo } from "react";

/**
 * Custom hook for selection API operations (remediation picks)
 * Follows the same pattern as useBookmarkApi
 */
export function useSelectionApi() {
	const addSelections = useCallback(
		async (evaluationId: string, issueKeys: string[]): Promise<void> => {
			const response = await fetch("/api/selections", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ evaluationId, issueKeys }),
			});

			if (!response.ok) {
				throw new Error("Failed to add selections");
			}
		},
		[],
	);

	const removeSelection = useCallback(
		async (evaluationId: string, issueKey: string): Promise<void> => {
			const response = await fetch(
				`/api/selections?evaluationId=${evaluationId}&issueKey=${encodeURIComponent(issueKey)}`,
				{ method: "DELETE" },
			);

			if (!response.ok) {
				throw new Error("Failed to remove selection");
			}
		},
		[],
	);

	const clearSelections = useCallback(
		async (evaluationId: string): Promise<void> => {
			const response = await fetch(
				`/api/selections/evaluation/${evaluationId}`,
				{ method: "DELETE" },
			);

			if (!response.ok) {
				throw new Error("Failed to clear selections");
			}
		},
		[],
	);

	const getSelectionsForEvaluation = useCallback(
		async (evaluationId: string): Promise<Set<string>> => {
			const response = await fetch(
				`/api/selections/evaluation/${evaluationId}`,
			);

			if (!response.ok) {
				throw new Error("Failed to fetch selections");
			}

			const { selections } = await response.json();
			return new Set(selections);
		},
		[],
	);

	return useMemo(
		() => ({
			addSelections,
			removeSelection,
			clearSelections,
			getSelectionsForEvaluation,
		}),
		[
			addSelections,
			removeSelection,
			clearSelections,
			getSelectionsForEvaluation,
		],
	);
}
