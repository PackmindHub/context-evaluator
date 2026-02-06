import type { BatchEntryStatus, IBatchStatusResponse } from "@shared/types/api";
import type { IEvaluationOptions } from "@shared/types/evaluation";
import { isValidGitUrl } from "@shared/file-system/git-url-validation";
import type { DailyRateLimiter } from "../rate-limiter";
import type { JobManager } from "./job-manager";

/**
 * A single entry in a batch evaluation
 */
interface IBatchEntry {
	url: string;
	jobId: string;
	status: BatchEntryStatus;
}

/**
 * Internal batch record
 */
interface IBatchRecord {
	id: string;
	createdAt: Date;
	options?: IEvaluationOptions;
	entries: IBatchEntry[];
}

/** How long to keep batch records before auto-cleanup (2 hours) */
const BATCH_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * BatchManager - Orchestrates sequential batch evaluation of multiple Git URLs.
 *
 * URLs are processed one at a time: the next URL is submitted to the JobManager
 * only after the current one completes or fails.
 */
export class BatchManager {
	private batches = new Map<string, IBatchRecord>();
	private jobToBatch = new Map<string, string>(); // jobId → batchId lookup
	private cleanupInterval: ReturnType<typeof setInterval>;

	constructor(
		private jobManager: JobManager,
		private rateLimiter: DailyRateLimiter,
	) {
		// Listen for job completions to advance batch processing
		this.jobManager.onJobFinished((jobId, status) => {
			this.onJobFinished(jobId, status);
		});

		// Periodic cleanup of old batch records
		this.cleanupInterval = setInterval(() => this.cleanup(), 30 * 60 * 1000);
	}

	/**
	 * Create a new batch evaluation.
	 * Validates all URLs, checks rate limits, and starts processing the first URL.
	 *
	 * @throws Error if validation or rate limit checks fail
	 */
	async createBatch(
		urls: string[],
		options?: IEvaluationOptions,
	): Promise<IBatchRecord> {
		// Validate URL count
		if (!urls || urls.length === 0) {
			throw new Error("At least one URL is required");
		}
		if (urls.length > 50) {
			throw new Error("Maximum 50 URLs per batch");
		}

		// Validate each URL
		const invalidUrls: string[] = [];
		for (const url of urls) {
			if (!isValidGitUrl(url)) {
				invalidUrls.push(url);
			}
		}
		if (invalidUrls.length > 0) {
			throw new Error(
				`Invalid Git URLs: ${invalidUrls.slice(0, 5).join(", ")}${invalidUrls.length > 5 ? ` and ${invalidUrls.length - 5} more` : ""}`,
			);
		}

		// Check rate limit has enough remaining for the entire batch
		const remaining = this.rateLimiter.getStats().remaining;
		if (remaining < urls.length) {
			throw new Error(
				`Daily rate limit insufficient: ${remaining} evaluations remaining, ${urls.length} requested`,
			);
		}

		// Create batch record
		const batchId = crypto.randomUUID();
		const entries: IBatchEntry[] = urls.map((url) => ({
			url,
			jobId: crypto.randomUUID(),
			status: "pending" as BatchEntryStatus,
		}));

		const batch: IBatchRecord = {
			id: batchId,
			createdAt: new Date(),
			options,
			entries,
		};

		this.batches.set(batchId, batch);

		// Register all jobId → batchId mappings
		for (const entry of entries) {
			this.jobToBatch.set(entry.jobId, batchId);
		}

		// Submit the first URL
		await this.submitNext(batchId);

		return batch;
	}

	/**
	 * Get batch record by ID
	 */
	getBatch(batchId: string): IBatchRecord | undefined {
		return this.batches.get(batchId);
	}

	/**
	 * Get formatted batch status response
	 */
	getBatchStatus(batchId: string): IBatchStatusResponse | undefined {
		const batch = this.batches.get(batchId);
		if (!batch) return undefined;

		// Sync entry statuses from JobManager for submitted entries
		for (const entry of batch.entries) {
			if (
				entry.status === "queued" ||
				entry.status === "running"
			) {
				const job = this.jobManager.getJob(entry.jobId);
				if (job) {
					entry.status = job.status as BatchEntryStatus;
				}
			}
		}

		const completed = batch.entries.filter(
			(e) => e.status === "completed",
		).length;
		const failed = batch.entries.filter((e) => e.status === "failed").length;
		const running = batch.entries.filter((e) => e.status === "running").length;
		const queued = batch.entries.filter((e) => e.status === "queued").length;
		const pending = batch.entries.filter((e) => e.status === "pending").length;

		return {
			batchId: batch.id,
			totalUrls: batch.entries.length,
			submitted: completed + failed + running + queued,
			completed,
			failed,
			running,
			queued,
			pending,
			jobs: batch.entries.map((e) => ({
				url: e.url,
				jobId: e.jobId,
				status: e.status,
			})),
			createdAt: batch.createdAt.toISOString(),
			isFinished: completed + failed === batch.entries.length,
		};
	}

	/**
	 * Submit the next pending URL in the batch to the JobManager.
	 * Only submits one URL at a time (sequential processing).
	 */
	private async submitNext(batchId: string): Promise<void> {
		const batch = this.batches.get(batchId);
		if (!batch) return;

		// Find the next pending entry
		const nextEntry = batch.entries.find((e) => e.status === "pending");
		if (!nextEntry) return; // All entries submitted or done

		try {
			// Submit as a job with the pre-generated jobId
			// We need to use the JobManager's submitJob which generates its own ID,
			// so we'll map our entry to the actual jobId returned
			const actualJobId = await this.jobManager.submitJob({
				repositoryUrl: nextEntry.url,
				options: batch.options,
			});

			// Update the mapping: remove old jobId, add actual jobId
			this.jobToBatch.delete(nextEntry.jobId);
			nextEntry.jobId = actualJobId;
			this.jobToBatch.set(actualJobId, batchId);
			nextEntry.status = "queued";

			// Increment rate limiter
			this.rateLimiter.increment();
		} catch (err) {
			// Mark entry as failed if submission fails (e.g., queue full)
			nextEntry.status = "failed";
			// Try to submit the next one
			await this.submitNext(batchId);
		}
	}

	/**
	 * Called when a job completes or fails.
	 * Updates the batch entry status and submits the next URL.
	 */
	private onJobFinished(
		jobId: string,
		status: "completed" | "failed",
	): void {
		const batchId = this.jobToBatch.get(jobId);
		if (!batchId) return; // Not a batch job

		const batch = this.batches.get(batchId);
		if (!batch) return;

		// Update the entry status
		const entry = batch.entries.find((e) => e.jobId === jobId);
		if (entry) {
			entry.status = status;
		}

		// Clean up the jobId → batchId mapping for this completed job
		this.jobToBatch.delete(jobId);

		// Submit the next pending URL (sequential processing)
		this.submitNext(batchId).catch((err) => {
			console.error(
				`[BatchManager] Error submitting next URL for batch ${batchId}:`,
				err,
			);
		});
	}

	/**
	 * Remove batch records older than BATCH_TTL_MS
	 */
	private cleanup(): void {
		const now = Date.now();
		for (const [batchId, batch] of this.batches) {
			if (now - batch.createdAt.getTime() > BATCH_TTL_MS) {
				// Clean up job mappings
				for (const entry of batch.entries) {
					this.jobToBatch.delete(entry.jobId);
				}
				this.batches.delete(batchId);
			}
		}
	}

	/**
	 * Stop the cleanup interval (for graceful shutdown)
	 */
	dispose(): void {
		clearInterval(this.cleanupInterval);
	}
}
