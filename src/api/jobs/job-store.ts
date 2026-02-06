import type {
	IEvaluateRequest,
	IJob,
	IJobLog,
	JobStatus,
} from "@shared/types/api";
import type { EvaluationOutput } from "@shared/types/evaluation";

/**
 * In-memory job storage
 * Future enhancement: Persist to SQLite for durability
 */
export class JobStore {
	private jobs = new Map<string, IJob>();
	private readonly JOB_TTL = 1000 * 60 * 60; // 1 hour
	private cleanupInterval?: Timer;

	constructor() {
		this.startCleanupTask();
	}

	/**
	 * Create a new job
	 */
	createJob(jobId: string, request: IEvaluateRequest): IJob {
		const now = new Date();
		const job: IJob = {
			id: jobId,
			status: "queued",
			request,
			createdAt: now,
			updatedAt: now,
		};

		this.jobs.set(jobId, job);
		return job;
	}

	/**
	 * Get a job by ID
	 */
	getJob(jobId: string): IJob | undefined {
		return this.jobs.get(jobId);
	}

	/**
	 * Update job status
	 */
	updateStatus(jobId: string, status: JobStatus): void {
		const job = this.jobs.get(jobId);
		if (!job) return;

		job.status = status;
		job.updatedAt = new Date();

		if (status === "running") {
			job.startedAt = new Date();
		} else if (status === "completed") {
			job.completedAt = new Date();
		} else if (status === "failed") {
			job.failedAt = new Date();
		}

		this.jobs.set(jobId, job);
	}

	/**
	 * Update job progress
	 */
	updateProgress(jobId: string, progress: IJob["progress"]): void {
		const job = this.jobs.get(jobId);
		if (!job) return;

		job.progress = progress;
		job.updatedAt = new Date();
		this.jobs.set(jobId, job);
	}

	/**
	 * Append a log entry to the job (in-memory only, max 50 logs)
	 */
	appendLog(jobId: string, log: IJobLog): void {
		const job = this.jobs.get(jobId);
		if (!job) return;

		if (!job.logs) {
			job.logs = [];
		}

		job.logs.push(log);

		// Keep only the last 50 logs
		if (job.logs.length > 50) {
			job.logs = job.logs.slice(-50);
		}

		this.jobs.set(jobId, job);
	}

	/**
	 * Store job result
	 */
	storeResult(jobId: string, result: EvaluationOutput): void {
		const job = this.jobs.get(jobId);
		if (!job) return;

		job.result = result;
		job.status = "completed";
		job.completedAt = new Date();
		job.updatedAt = new Date();
		this.jobs.set(jobId, job);
	}

	/**
	 * Store job error
	 */
	storeError(
		jobId: string,
		error: { message: string; code: string; details?: string },
	): void {
		const job = this.jobs.get(jobId);
		if (!job) return;

		job.error = error;
		job.status = "failed";
		job.failedAt = new Date();
		job.updatedAt = new Date();
		this.jobs.set(jobId, job);
	}

	/**
	 * Get all jobs
	 */
	getAllJobs(): IJob[] {
		return Array.from(this.jobs.values());
	}

	/**
	 * Get active jobs (queued or running)
	 */
	getActiveJobs(): IJob[] {
		return Array.from(this.jobs.values()).filter(
			(job) => job.status === "queued" || job.status === "running",
		);
	}

	/**
	 * Get job count by status
	 */
	getJobCountByStatus(): Record<JobStatus, number> {
		const counts: Record<JobStatus, number> = {
			queued: 0,
			running: 0,
			completed: 0,
			failed: 0,
		};

		for (const job of this.jobs.values()) {
			counts[job.status]++;
		}

		return counts;
	}

	/**
	 * Delete a job
	 */
	deleteJob(jobId: string): boolean {
		return this.jobs.delete(jobId);
	}

	/**
	 * Start periodic cleanup of old completed/failed jobs
	 */
	private startCleanupTask(): void {
		this.cleanupInterval = setInterval(
			() => {
				const now = Date.now();
				const jobsToDelete: string[] = [];

				for (const [jobId, job] of this.jobs.entries()) {
					// Only clean up completed or failed jobs
					if (job.status === "completed" || job.status === "failed") {
						const age = now - job.updatedAt.getTime();
						if (age > this.JOB_TTL) {
							jobsToDelete.push(jobId);
						}
					}
				}

				for (const jobId of jobsToDelete) {
					this.jobs.delete(jobId);
				}

				if (jobsToDelete.length > 0) {
					console.log(
						`[JobStore] Cleaned up ${jobsToDelete.length} old job(s)`,
					);
				}
			},
			1000 * 60 * 10,
		); // Run every 10 minutes
	}

	/**
	 * Stop cleanup task
	 */
	stopCleanup(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
		}
	}

	/**
	 * Get statistics
	 */
	getStats(): {
		totalJobs: number;
		activeJobs: number;
		queuedJobs: number;
		runningJobs: number;
		completedJobs: number;
		failedJobs: number;
	} {
		const counts = this.getJobCountByStatus();
		return {
			totalJobs: this.jobs.size,
			activeJobs: counts.queued + counts.running,
			queuedJobs: counts.queued,
			runningJobs: counts.running,
			completedJobs: counts.completed,
			failedJobs: counts.failed,
		};
	}
}
