import { useCallback, useMemo } from "react";

/**
 * Custom hook for bookmark API operations
 * Follows the same pattern as useFeedbackApi
 */
export function useBookmarkApi() {
	const addBookmark = useCallback(
		async (
			evaluationId: string,
			issueHash: string,
			evaluatorName: string,
		): Promise<void> => {
			const response = await fetch("/api/bookmarks", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ evaluationId, issueHash, evaluatorName }),
			});

			if (!response.ok) {
				throw new Error("Failed to add bookmark");
			}
		},
		[],
	);

	const removeBookmark = useCallback(
		async (evaluationId: string, issueHash: string): Promise<void> => {
			const response = await fetch(
				`/api/bookmarks?evaluationId=${evaluationId}&issueHash=${issueHash}`,
				{ method: "DELETE" },
			);

			if (!response.ok) {
				throw new Error("Failed to remove bookmark");
			}
		},
		[],
	);

	const getBookmarksForEvaluation = useCallback(
		async (evaluationId: string): Promise<Set<string>> => {
			const response = await fetch(`/api/bookmarks/evaluation/${evaluationId}`);

			if (!response.ok) {
				throw new Error("Failed to fetch bookmarks");
			}

			const { bookmarks } = await response.json();
			return new Set(bookmarks);
		},
		[],
	);

	return useMemo(
		() => ({ addBookmark, removeBookmark, getBookmarksForEvaluation }),
		[addBookmark, removeBookmark, getBookmarksForEvaluation],
	);
}
