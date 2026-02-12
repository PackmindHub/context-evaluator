/**
 * Remediation Job Manager - handles job queue for remediation execution.
 * Only one remediation runs at a time (filesystem safety).
 */

import { executeRemediation } from "@shared/remediation/engine";
import type {
	IRemediationJob,
	IRemediationRequest,
	RemediationProgressEvent,
} from "@shared/types/remediation";
import { remediationRepository } from "../db/remediation-repository";
import type { JobManager } from "./job-manager";

export type RemediationProgressCallback = (
	jobId: string,
	event: RemediationProgressEvent,
) => void;

export class RemediationJobManager {
	private jobs = new Map<string, IRemediationJob>();
	private runningJobId: string | null = null;
	private queue: string[] = [];
	private progressCallbacks = new Map<string, RemediationProgressCallback[]>();
	private eventBuffer = new Map<string, RemediationProgressEvent[]>();
	private jobManager: JobManager;
	private cleanupInterval: ReturnType<typeof setInterval>;

	constructor(jobManager: JobManager) {
		this.jobManager = jobManager;
		// Cleanup completed jobs after 1 hour
		this.cleanupInterval = setInterval(
			() => this.cleanupOldJobs(),
			60 * 60 * 1000,
		);
	}

	submitJob(request: IRemediationRequest): string {
		const jobId = crypto.randomUUID();

		const job: IRemediationJob = {
			id: jobId,
			status: "queued",
			request,
			createdAt: new Date(),
		};

		this.jobs.set(jobId, job);
		this.queue.push(jobId);

		const errorCount = request.issues.filter(
			(i) => i.issueType === "error",
		).length;
		const suggestionCount = request.issues.length - errorCount;
		console.log(
			`[RemediationJobManager] Job ${jobId} queued: ${request.issues.length} issues (${errorCount} errors, ${suggestionCount} suggestions), provider: ${request.provider}, target: ${request.targetFileType}`,
		);

		// Start processing
		this.processQueue().catch((err) => {
			console.error("[RemediationJobManager] Queue processing error:", err);
		});

		return jobId;
	}

	getJob(jobId: string): IRemediationJob | undefined {
		return this.jobs.get(jobId);
	}

	onProgress(jobId: string, callback: RemediationProgressCallback): void {
		const callbacks = this.progressCallbacks.get(jobId) ?? [];
		callbacks.push(callback);
		this.progressCallbacks.set(jobId, callbacks);

		// Replay buffered events
		const buffered = this.eventBuffer.get(jobId);
		if (buffered) {
			for (const event of buffered) {
				try {
					callback(jobId, event);
				} catch {
					// ignore
				}
			}
			this.eventBuffer.delete(jobId);
		}
	}

	offProgress(jobId: string, callback: RemediationProgressCallback): void {
		const callbacks = this.progressCallbacks.get(jobId);
		if (!callbacks) return;
		const idx = callbacks.indexOf(callback);
		if (idx !== -1) callbacks.splice(idx, 1);
		if (callbacks.length === 0) this.progressCallbacks.delete(jobId);
	}

	private async processQueue(): Promise<void> {
		if (this.runningJobId || this.queue.length === 0) return;

		const jobId = this.queue.shift()!;
		const job = this.jobs.get(jobId);
		if (!job) return;

		this.runningJobId = jobId;
		job.status = "running";
		job.startedAt = new Date();

		console.log(`[RemediationJobManager] Job ${jobId} started`);

		this.emitProgress(jobId, {
			type: "remediation.started",
			data: { jobId },
		});

		try {
			const result = await executeRemediation(
				job.request,
				this.jobManager,
				(event) => this.emitProgress(jobId, event),
			);

			job.status = "completed";
			job.result = result;
			job.completedAt = new Date();

			// Persist to database
			try {
				remediationRepository.saveRemediation(
					jobId,
					job.request,
					result,
					job.createdAt,
				);
			} catch (dbErr) {
				console.error(
					"[RemediationJobManager] Failed to persist remediation:",
					dbErr,
				);
			}

			this.emitProgress(jobId, {
				type: "remediation.completed",
				data: { jobId, result },
			});

			const durationSec = (
				(job.completedAt!.getTime() - job.startedAt!.getTime()) /
				1000
			).toFixed(1);
			console.log(
				`[RemediationJobManager] Job ${jobId} completed: ${durationSec}s, ${result.filesChanged} files changed, +${result.totalAdditions}/-${result.totalDeletions} lines`,
			);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			job.status = "failed";
			job.error = { message, code: "REMEDIATION_ERROR" };
			job.completedAt = new Date();

			// Persist failure
			try {
				remediationRepository.saveFailedRemediation(
					jobId,
					job.request,
					message,
					job.createdAt,
				);
			} catch (dbErr) {
				console.error(
					"[RemediationJobManager] Failed to persist failed remediation:",
					dbErr,
				);
			}

			this.emitProgress(jobId, {
				type: "remediation.failed",
				data: { jobId, error: { message } },
			});

			console.error(`[RemediationJobManager] Job ${jobId} failed:`, message);
		} finally {
			this.runningJobId = null;
			this.progressCallbacks.delete(jobId);
			this.eventBuffer.delete(jobId);

			// Process next in queue
			if (this.queue.length > 0) {
				this.processQueue().catch(() => {
					// Best-effort queue processing
				});
			}
		}
	}

	private emitProgress(jobId: string, event: RemediationProgressEvent): void {
		const callbacks = this.progressCallbacks.get(jobId);

		if (!callbacks || callbacks.length === 0) {
			const buffer = this.eventBuffer.get(jobId) ?? [];
			buffer.push(event);
			this.eventBuffer.set(jobId, buffer);
			return;
		}

		for (const cb of callbacks) {
			try {
				cb(jobId, event);
			} catch (error) {
				console.error(
					"[RemediationJobManager] Progress callback error:",
					error,
				);
			}
		}
	}

	private cleanupOldJobs(): void {
		const oneHourAgo = Date.now() - 60 * 60 * 1000;
		for (const [id, job] of this.jobs) {
			if (job.completedAt && job.completedAt.getTime() < oneHourAgo) {
				this.jobs.delete(id);
			}
		}
	}

	shutdown(): void {
		clearInterval(this.cleanupInterval);
		this.progressCallbacks.clear();
		this.eventBuffer.clear();
		this.queue = [];
		this.runningJobId = null;
	}
}
