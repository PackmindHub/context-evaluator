import type { FilterState } from "../components/FilterPanel";

/**
 * Determines if nested grouping (file -> evaluator -> issues) should be used.
 * Nested grouping is only used when no filters are active, as filtering
 * breaks the natural grouping hierarchy.
 *
 * @param filters - Current filter state
 * @returns true if nested grouping should be used, false otherwise
 */
export function shouldUseNestedGrouping(filters: FilterState): boolean {
	// Disable nested grouping by default for better scannability
	return false;

	// Original logic preserved for future use:
	// if (filters.severities.size > 0) return false;
	// if (filters.categories.size > 0) return false;
	// if (filters.evaluators.size > 0) return false;
	// if (filters.searchText.trim() !== "") return false;
	// if (filters.bookmarkedOnly) return false;
	// return true;
}
