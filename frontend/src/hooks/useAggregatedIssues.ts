import { useCallback, useEffect, useRef, useState } from "react";
import type {
	IAggregatedIssue,
	IAggregatedIssuesResponse,
} from "../types/evaluation";

export interface IssuesPageFilters {
	evaluator: string; // "" = all
	severity: string; // "" = all
	repository: string; // "" = all
	issueType: string; // "" = all
	search: string;
}

const DEFAULT_FILTERS: IssuesPageFilters = {
	evaluator: "",
	severity: "",
	repository: "",
	issueType: "",
	search: "",
};

const DEFAULT_PAGINATION = {
	page: 1,
	pageSize: 25,
	totalItems: 0,
	totalPages: 0,
};

const DEFAULT_AVAILABLE_FILTERS = {
	evaluators: [] as string[],
	repositories: [] as string[],
};

export function useAggregatedIssues() {
	const [issues, setIssues] = useState<IAggregatedIssue[]>([]);
	const [pagination, setPagination] = useState(DEFAULT_PAGINATION);
	const [availableFilters, setAvailableFilters] = useState(
		DEFAULT_AVAILABLE_FILTERS,
	);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [filters, setFiltersInternal] =
		useState<IssuesPageFilters>(DEFAULT_FILTERS);
	const [page, setPageInternal] = useState(1);

	// Debounce timer for search
	const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [debouncedSearch, setDebouncedSearch] = useState("");

	// Debounce search input
	useEffect(() => {
		if (searchTimerRef.current) {
			clearTimeout(searchTimerRef.current);
		}
		searchTimerRef.current = setTimeout(() => {
			setDebouncedSearch(filters.search);
		}, 300);
		return () => {
			if (searchTimerRef.current) {
				clearTimeout(searchTimerRef.current);
			}
		};
	}, [filters.search]);

	const fetchIssues = useCallback(async () => {
		setIsLoading(true);
		setError(null);

		try {
			const params = new URLSearchParams();
			params.set("page", String(page));
			params.set("pageSize", "25");
			if (filters.evaluator) params.set("evaluator", filters.evaluator);
			if (filters.severity) params.set("severity", filters.severity);
			if (filters.repository) params.set("repository", filters.repository);
			if (filters.issueType) params.set("issueType", filters.issueType);
			if (debouncedSearch) params.set("search", debouncedSearch);

			const response = await fetch(`/api/issues?${params.toString()}`);
			if (!response.ok) {
				throw new Error(`HTTP error ${response.status}`);
			}

			const data = (await response.json()) as IAggregatedIssuesResponse;
			setIssues(data.issues);
			setPagination(data.pagination);
			setAvailableFilters(data.availableFilters);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to fetch issues");
		} finally {
			setIsLoading(false);
		}
	}, [
		page,
		filters.evaluator,
		filters.severity,
		filters.repository,
		filters.issueType,
		debouncedSearch,
	]);

	// Reset page to 1 when filters change
	const setFilters = useCallback((newFilters: IssuesPageFilters) => {
		setFiltersInternal(newFilters);
		setPageInternal(1);
	}, []);

	const setPage = useCallback((newPage: number) => {
		setPageInternal(newPage);
	}, []);

	// Fetch on mount and when page/filters change
	useEffect(() => {
		fetchIssues();
	}, [fetchIssues]);

	return {
		issues,
		pagination,
		availableFilters,
		isLoading,
		error,
		filters,
		setFilters,
		setPage,
		refresh: fetchIssues,
	};
}
