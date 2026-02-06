import { useCallback, useEffect, useRef, useState } from "react";
import type { IJobStatusResponse, JobStatus } from "../types/job";

interface IActiveJob {
	jobId: string;
	status: JobStatus;
	repositoryUrl?: string;
	createdAt: string;
	startedAt?: string;
	progress?: {
		currentFile?: string;
		totalFiles: number;
		completedFiles: number;
		currentEvaluator?: string;
		completedEvaluators: number;
		totalEvaluators: number;
	};
}

interface IUseActiveJobsReturn {
	activeJobs: IActiveJob[];
	isLoading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
}

const POLLING_INTERVAL_MS = 5000; // 5 seconds

export function useActiveJobs(): IUseActiveJobsReturn {
	const [activeJobs, setActiveJobs] = useState<IActiveJob[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// Fetch all jobs and filter for active ones
	const fetchActiveJobs = useCallback(async () => {
		setIsLoading(true);
		setError(null);

		try {
			const response = await fetch("/api/evaluate", {
				method: "GET",
				headers: { "Content-Type": "application/json" },
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error || `HTTP error ${response.status}`);
			}

			const allJobs = (await response.json()) as IJobStatusResponse[];

			// Filter for queued or running jobs
			const active = allJobs
				.filter((job) => job.status === "queued" || job.status === "running")
				.map((job) => ({
					jobId: job.jobId,
					status: job.status,
					repositoryUrl: job.repositoryUrl,
					createdAt: job.createdAt,
					startedAt: job.startedAt,
					progress: job.progress,
				}));

			setActiveJobs(active);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to fetch active jobs";
			setError(message);
			console.error("[useActiveJobs] Error fetching jobs:", err);
		} finally {
			setIsLoading(false);
		}
	}, []);

	// Start/stop polling based on active jobs
	useEffect(() => {
		// Initial fetch
		fetchActiveJobs();

		// Start polling
		intervalRef.current = setInterval(fetchActiveJobs, POLLING_INTERVAL_MS);

		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}
		};
	}, [fetchActiveJobs]);

	return {
		activeJobs,
		isLoading,
		error,
		refresh: fetchActiveJobs,
	};
}
