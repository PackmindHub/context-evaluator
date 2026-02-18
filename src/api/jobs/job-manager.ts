import { EvaluationEngine } from "@shared/evaluation/engine";
import type { IEvaluateRequest, IJob, IJobLog } from "@shared/types/api";
import type { ProgressEvent } from "@shared/types/evaluation";
import { jobManagerLogger } from "@shared/utils/logger";
import { evaluationRepository } from "../db/evaluation-repository";
import { remediationRepository } from "../db/remediation-repository";
import { JobStore } from "./job-store";

/**
 * Convert a progress event to a human-readable log entry
 */
function eventToLog(event: ProgressEvent): IJobLog | null {
	const timestamp = new Date().toISOString();
	// biome-ignore lint/suspicious/noExplicitAny: ProgressEvent.data is typed as unknown, cast for switch-based access
	const data = event.data as any;

	switch (event.type) {
		case "job.started":
			return {
				timestamp,
				type: "info",
				message: `Started evaluation (${data.evaluationMode} mode, ${data.totalFiles} file(s))`,
			};

		case "file.started":
			return {
				timestamp,
				type: "info",
				message: `Processing ${data.filePath}`,
			};

		case "evaluator.progress": {
			const fileContext = data.currentFile
				? ` on ${data.currentFile.split("/").pop()}`
				: "";
			return {
				timestamp,
				type: "info",
				message: `Running ${data.evaluatorName}${fileContext} (${data.evaluatorIndex + 1}/${data.totalEvaluators})`,
			};
		}

		case "evaluator.retry":
			return {
				timestamp,
				type: "warning",
				message: `Retry ${data.attempt}/${data.maxRetries} for ${data.evaluatorName}: ${data.error.substring(0, 100)}`,
			};

		case "evaluator.timeout":
			return {
				timestamp,
				type: "error",
				message: `Timeout: ${data.evaluatorName} exceeded ${Math.round(data.timeoutMs / 1000)}s limit`,
			};

		case "curation.started": {
			const typeLabel =
				data.issueType === "error"
					? "errors"
					: data.issueType === "suggestion"
						? "suggestions"
						: "issues";
			return {
				timestamp,
				type: "info",
				message: `Curating top ${typeLabel} from ${data.totalIssues} total...`,
			};
		}

		case "curation.completed": {
			const typeLabel =
				data.issueType === "error"
					? "errors"
					: data.issueType === "suggestion"
						? "suggestions"
						: "issues";
			return {
				timestamp,
				type: "success",
				message: `Impact curation completed for ${typeLabel} (${data.curatedCount} selected)`,
			};
		}

		case "job.completed":
			return {
				timestamp,
				type: "success",
				message: `Evaluation completed in ${Math.round(data.duration / 1000)}s`,
			};

		case "job.failed":
			return {
				timestamp,
				type: "error",
				message: `Evaluation failed: ${data.error?.message || "Unknown error"}`,
			};

		default:
			return null;
	}
}

/**
 * Progress event callback for SSE broadcasting
 */
export type JobProgressCallback = (jobId: string, event: ProgressEvent) => void;

/**
 * Job manager configuration
 */
interface IJobManagerConfig {
	maxConcurrentJobs?: number;
	maxQueueSize?: number;
}

/**
 * Job manager - Handles job queue and execution
 *
 * Responsibilities:
 * - Queue management with concurrency control
 * - Job execution using EvaluationEngine
 * - Progress event emission for WebSocket broadcasting
 * - Error handling and retry logic
 */
export class JobManager {
	private store: JobStore;
	private runningJobs = new Set<string>();
	private maxConcurrentJobs: number;
	private maxQueueSize: number;
	private progressCallbacks = new Map<string, JobProgressCallback[]>();
	private eventBuffer = new Map<string, ProgressEvent[]>();
	private jobFinishedCallbacks: Array<
		(jobId: string, status: "completed" | "failed") => void
	> = [];

	constructor(config: IJobManagerConfig = {}) {
		this.store = new JobStore();
		this.maxConcurrentJobs = config.maxConcurrentJobs ?? 2;
		this.maxQueueSize = config.maxQueueSize ?? 20;
	}

	/**
	 * Register a callback that fires when any job completes or fails
	 */
	onJobFinished(
		callback: (jobId: string, status: "completed" | "failed") => void,
	): void {
		this.jobFinishedCallbacks.push(callback);
	}

	/**
	 * Submit a new evaluation job
	 * @throws Error if queue is at capacity
	 */
	async submitJob(request: IEvaluateRequest): Promise<string> {
		// Check queue capacity
		const activeJobs = this.store.getActiveJobs();
		if (activeJobs.length >= this.maxQueueSize) {
			throw new Error(
				`Job queue is at capacity (${this.maxQueueSize} jobs). Please wait for some jobs to complete.`,
			);
		}

		// Generate unique job ID
		const jobId = crypto.randomUUID();

		jobManagerLogger.log(`Submitting job ${jobId}`, request);

		// Create job in store
		this.store.createJob(jobId, request);

		// Emit job.queued event (job.started will be emitted by the engine with proper data)
		this.emitProgress(jobId, {
			type: "job.queued",
			data: { jobId, request },
		});

		// Start processing queue (don't await - run in background)
		this.processQueue().catch((err) => {
			jobManagerLogger.error(`Error processing queue:`, err);
		});

		return jobId;
	}

	/**
	 * Get job by ID
	 */
	getJob(jobId: string): IJob | undefined {
		return this.store.getJob(jobId);
	}

	/**
	 * Get all jobs
	 */
	getAllJobs(): IJob[] {
		return this.store.getAllJobs();
	}

	/**
	 * Get active jobs
	 */
	getActiveJobs(): IJob[] {
		return this.store.getActiveJobs();
	}

	/**
	 * Get statistics
	 */
	getStats() {
		return this.store.getStats();
	}

	/**
	 * Register progress callback for a job
	 */
	onProgress(jobId: string, callback: JobProgressCallback): void {
		const callbacks = this.progressCallbacks.get(jobId) ?? [];
		callbacks.push(callback);
		this.progressCallbacks.set(jobId, callbacks);

		// Replay buffered events
		const bufferedEvents = this.eventBuffer.get(jobId);
		if (bufferedEvents && bufferedEvents.length > 0) {
			jobManagerLogger.log(
				`Replaying ${bufferedEvents.length} buffered events for job ${jobId}`,
			);
			for (const event of bufferedEvents) {
				try {
					callback(jobId, event);
				} catch (error) {
					jobManagerLogger.error(`Error replaying buffered event:`, error);
				}
			}
			// Clear buffer after replay
			this.eventBuffer.delete(jobId);
		}
	}

	/**
	 * Unregister progress callback for a job
	 */
	offProgress(jobId: string, callback: JobProgressCallback): void {
		const callbacks = this.progressCallbacks.get(jobId);
		if (!callbacks) return;

		const index = callbacks.indexOf(callback);
		if (index !== -1) {
			callbacks.splice(index, 1);
		}

		if (callbacks.length === 0) {
			this.progressCallbacks.delete(jobId);
		}
	}

	/**
	 * Cancel a job
	 */
	async cancelJob(jobId: string): Promise<boolean> {
		const job = this.store.getJob(jobId);
		if (!job) return false;

		// Can only cancel queued jobs
		if (job.status !== "queued") {
			return false;
		}

		// Mark as failed
		this.store.storeError(jobId, {
			message: "Job cancelled by user",
			code: "JOB_CANCELLED",
		});

		// Emit event
		this.emitProgress(jobId, {
			type: "job.failed",
			data: { jobId, reason: "cancelled" },
		});

		return true;
	}

	/**
	 * Process job queue
	 */
	private async processQueue(): Promise<void> {
		jobManagerLogger.log(
			`processQueue called, running: ${this.runningJobs.size}/${this.maxConcurrentJobs}`,
		);

		// Check if we have capacity
		if (this.runningJobs.size >= this.maxConcurrentJobs) {
			jobManagerLogger.log(`At capacity, skipping`);
			return;
		}

		// Get next queued job
		const queuedJobs = this.store
			.getActiveJobs()
			.filter((job) => job.status === "queued");
		jobManagerLogger.log(`Found ${queuedJobs.length} queued job(s)`);

		if (queuedJobs.length === 0) {
			return;
		}

		// Sort by creation time (FIFO)
		queuedJobs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

		// Take next job
		const job = queuedJobs[0];
		if (!job) return;

		jobManagerLogger.log(`Executing job ${job.id}`);

		// Execute job
		await this.executeJob(job);

		// Try to process next job
		if (this.runningJobs.size < this.maxConcurrentJobs) {
			this.processQueue();
		}
	}

	/**
	 * Execute a job
	 */
	private async executeJob(job: IJob): Promise<void> {
		const jobId = job.id;
		let terminalStatus: "completed" | "failed" = "failed";

		try {
			// Mark as running
			this.runningJobs.add(jobId);
			this.store.updateStatus(jobId, "running");

			jobManagerLogger.log(`Starting job ${jobId}`);

			// Create evaluation engine
			const engine = new EvaluationEngine();

			// Execute with progress callback
			const result = await engine.execute(
				job.request,
				(event: ProgressEvent) => {
					// biome-ignore lint/suspicious/noExplicitAny: ProgressEvent.data is typed as unknown
					const data = event.data as any;
					// Update progress in store
					if (event.type === "evaluator.progress") {
						const job = this.store.getJob(jobId);
						const existingProgress = job?.progress;

						this.store.updateProgress(jobId, {
							currentEvaluator: data.evaluatorName,
							completedEvaluators: data.evaluatorIndex,
							totalEvaluators: data.totalEvaluators,
							currentFile: data.currentFile,
							totalFiles: existingProgress?.totalFiles ?? data.totalFiles ?? 0,
							completedFiles: existingProgress?.completedFiles ?? 0,
						});
					} else if (event.type === "file.completed") {
						const job = this.store.getJob(jobId);
						const existingProgress = job?.progress;

						this.store.updateProgress(jobId, {
							currentEvaluator: existingProgress?.currentEvaluator,
							completedEvaluators: existingProgress?.completedEvaluators ?? 0,
							totalEvaluators: existingProgress?.totalEvaluators ?? 0,
							currentFile: data.filePath,
							totalFiles: data.totalFiles ?? existingProgress?.totalFiles ?? 0,
							completedFiles: (existingProgress?.completedFiles ?? 0) + 1,
						});
					}

					// Emit to SSE listeners
					this.emitProgress(jobId, event);
				},
			);

			// Store result
			this.store.storeResult(jobId, result);

			// Persist to SQLite database
			try {
				evaluationRepository.saveEvaluation(
					jobId,
					job.request,
					result,
					job.createdAt,
				);

				// Link result evaluation back to the source remediation
				if (job.request._sourceRemediationId) {
					try {
						remediationRepository.linkResultEvaluation(
							job.request._sourceRemediationId,
							jobId,
						);
					} catch (linkError) {
						jobManagerLogger.error(
							`Failed to link result evaluation to remediation:`,
							linkError,
						);
					}
				}
			} catch (dbError) {
				jobManagerLogger.error(
					`Failed to persist evaluation to database:`,
					dbError,
				);
			}

			jobManagerLogger.log(`Job ${jobId} completed successfully`);

			// Emit completion event
			const finalJob = this.store.getJob(jobId);
			const duration = finalJob?.startedAt
				? Date.now() - finalJob.startedAt.getTime()
				: 0;
			this.emitProgress(jobId, {
				type: "job.completed",
				data: { jobId, result, duration },
			});

			terminalStatus = "completed";
		} catch (err: unknown) {
			jobManagerLogger.error(`Job ${jobId} failed:`, err);
			const error = err as Error & { code?: string };

			const errorDetails = {
				message: error.message || "Unknown error",
				code: error.code || "EVALUATION_ERROR",
				details: error.stack,
			};

			// Store error
			this.store.storeError(jobId, errorDetails);

			// Persist failed job to SQLite database
			try {
				evaluationRepository.saveFailedEvaluation(
					jobId,
					job.request,
					errorDetails,
					job.createdAt,
				);
			} catch (dbError) {
				jobManagerLogger.error(
					`Failed to persist failed evaluation to database:`,
					dbError,
				);
			}

			// Emit failure event
			this.emitProgress(jobId, {
				type: "job.failed",
				data: {
					jobId,
					error: {
						message: error.message,
						code: error.code || "EVALUATION_ERROR",
					},
				},
			});
		} finally {
			// Remove from running set
			this.runningJobs.delete(jobId);

			// Run cleanup function if provided (e.g., remove patched clone directory)
			if (job.request._cleanupFn) {
				try {
					await job.request._cleanupFn();
				} catch (cleanupError) {
					jobManagerLogger.error(
						`Error running cleanup for job ${jobId}:`,
						cleanupError,
					);
				}
			}

			// Cleanup callbacks and buffer
			this.progressCallbacks.delete(jobId);
			this.eventBuffer.delete(jobId);

			// Notify job finished listeners (e.g., BatchManager)
			for (const cb of this.jobFinishedCallbacks) {
				try {
					cb(jobId, terminalStatus);
				} catch (callbackErr) {
					jobManagerLogger.error(`Error in jobFinished callback:`, callbackErr);
				}
			}

			// Process next job in queue
			this.processQueue();
		}
	}

	/**
	 * Emit progress event to all registered callbacks
	 */
	private emitProgress(jobId: string, event: ProgressEvent): void {
		// Store log entry in job (in-memory, for reconnecting clients)
		const log = eventToLog(event);
		if (log) {
			this.store.appendLog(jobId, log);
		}

		const callbacks = this.progressCallbacks.get(jobId);

		// Buffer events if no callbacks registered yet
		if (!callbacks || callbacks.length === 0) {
			const buffer = this.eventBuffer.get(jobId) ?? [];
			buffer.push(event);
			this.eventBuffer.set(jobId, buffer);
			jobManagerLogger.log(
				`Buffered event ${event.type} for job ${jobId} (${buffer.length} total)`,
			);
			return;
		}

		for (const callback of callbacks) {
			try {
				callback(jobId, event);
			} catch (error) {
				jobManagerLogger.error(`Error in progress callback:`, error);
			}
		}
	}

	/**
	 * Shutdown manager and cleanup
	 */
	shutdown(): void {
		this.store.stopCleanup();
		this.progressCallbacks.clear();
		this.eventBuffer.clear();
		this.runningJobs.clear();
	}
}
