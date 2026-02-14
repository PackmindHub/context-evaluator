import {
	convertJsonReportToEvaluationOutput,
	type IJsonReport,
} from "@cli/output/report-formatters";
import type {
	IBatchEvaluateRequest,
	IEvaluateRequest,
	IJobStatusResponse,
} from "@shared/types/api";
import { evaluationRepository } from "../db/evaluation-repository";
import type { BatchManager } from "../jobs/batch-manager";
import type { JobManager } from "../jobs/job-manager";
import type { DailyRateLimiter } from "../rate-limiter";

/**
 * Evaluation routes
 */
export class EvaluationRoutes {
	private cloudMode: boolean;
	private rateLimiter: DailyRateLimiter;
	private batchManager: BatchManager | null;

	constructor(
		private jobManager: JobManager,
		cloudMode = false,
		rateLimiter: DailyRateLimiter,
		batchManager: BatchManager | null = null,
	) {
		this.cloudMode = cloudMode;
		this.rateLimiter = rateLimiter;
		this.batchManager = batchManager;
	}

	/**
	 * POST /api/evaluate - Start new evaluation
	 */
	async post(req: Request): Promise<Response> {
		console.log("[EvaluationRoutes] POST /api/evaluate");

		try {
			// Parse request body
			const body = (await req.json()) as IEvaluateRequest;
			console.log("[EvaluationRoutes] Request body:", body);

			// Always enable verbose, debug, and curation for API requests
			body.options = {
				...body.options,
				verbose: true,
				debug: true,
				preserveDebugOutput: body.options?.preserveDebugOutput ?? false,
				curation: {
					enabled: true,
					topN: body.options?.curation?.topN ?? 20,
				},
			};

			// Validate request
			if (!body.repositoryUrl && !body.localPath) {
				return new Response(
					JSON.stringify({
						error: "Either repositoryUrl or localPath must be provided",
						code: "INVALID_REQUEST",
					}),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			// Check rate limit for Git URL evaluations
			if (body.repositoryUrl && !this.rateLimiter.canAccept()) {
				return new Response(
					JSON.stringify({
						error:
							"Daily Git URL evaluation limit reached. Try again tomorrow.",
						code: "DAILY_LIMIT_EXCEEDED",
					}),
					{
						status: 429,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			// Submit job
			const jobId = await this.jobManager.submitJob(body);

			// Increment rate limiter counter for Git URL evaluations
			if (body.repositoryUrl) {
				this.rateLimiter.increment();
			}

			// Get job for response
			const job = this.jobManager.getJob(jobId);
			if (!job) {
				return new Response(
					JSON.stringify({
						error: "Failed to create job",
						code: "JOB_CREATION_FAILED",
					}),
					{
						status: 500,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			// Build SSE URL for progress updates
			const sseUrl = `/api/evaluate/${jobId}/progress`;

			// Return response
			const response: IJobStatusResponse = {
				jobId: job.id,
				status: job.status,
				sseUrl,
				createdAt: job.createdAt.toISOString(),
				updatedAt: job.updatedAt.toISOString(),
			};

			return new Response(JSON.stringify(response), {
				status: 202, // Accepted
				headers: { "Content-Type": "application/json" },
			});
		} catch (err: unknown) {
			console.error("[EvaluationRoutes] Error in POST /api/evaluate:", err);
			const error = err as Error;

			// Check if queue is at capacity
			const isQueueFull = error.message?.includes("queue is at capacity");

			return new Response(
				JSON.stringify({
					error: error.message || "Internal server error",
					code: isQueueFull ? "QUEUE_FULL" : "INTERNAL_ERROR",
				}),
				{
					status: isQueueFull ? 429 : 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	}

	/**
	 * GET /api/evaluate/:id - Get job status
	 */
	async get(req: Request, jobId: string): Promise<Response> {
		try {
			// Get job
			const job = this.jobManager.getJob(jobId);
			if (!job) {
				return new Response(
					JSON.stringify({
						error: "Job not found",
						code: "JOB_NOT_FOUND",
					}),
					{
						status: 404,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			// Build response
			const response: IJobStatusResponse = {
				jobId: job.id,
				status: job.status,
				repositoryUrl:
					job.request?.repositoryUrl || job.request?.localPath || undefined,
				createdAt: job.createdAt.toISOString(),
				updatedAt: job.updatedAt.toISOString(),
			};

			// Add optional fields
			if (job.startedAt) {
				response.startedAt = job.startedAt.toISOString();
			}
			if (job.completedAt) {
				response.completedAt = job.completedAt.toISOString();
			}
			if (job.failedAt) {
				response.failedAt = job.failedAt.toISOString();
			}
			if (job.progress) {
				response.progress = job.progress;
			}
			if (job.logs && job.logs.length > 0) {
				response.logs = job.logs;
			}
			if (job.result) {
				response.result = job.result;
			}
			if (job.error) {
				response.error = job.error;
			}

			// Add SSE URL if job is active
			if (job.status === "queued" || job.status === "running") {
				response.sseUrl = `/api/evaluate/${jobId}/progress`;
			}

			return new Response(JSON.stringify(response), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (err: unknown) {
			console.error("[EvaluationRoutes] Error in GET /api/evaluate/:id:", err);
			const error = err as Error;

			return new Response(
				JSON.stringify({
					error: error.message || "Internal server error",
					code: "INTERNAL_ERROR",
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	}

	/**
	 * GET /api/evaluate - List all jobs (optional endpoint)
	 */
	async list(_req: Request): Promise<Response> {
		try {
			const jobs = this.jobManager.getAllJobs();

			// Map to response format
			const response = jobs.map((job) => ({
				jobId: job.id,
				status: job.status,
				repositoryUrl:
					job.request?.repositoryUrl || job.request?.localPath || undefined,
				progress: job.progress,
				createdAt: job.createdAt.toISOString(),
				updatedAt: job.updatedAt.toISOString(),
				startedAt: job.startedAt?.toISOString(),
				completedAt: job.completedAt?.toISOString(),
				failedAt: job.failedAt?.toISOString(),
			}));

			return new Response(JSON.stringify(response), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (err: unknown) {
			console.error("[EvaluationRoutes] Error in GET /api/evaluate:", err);
			const error = err as Error;

			return new Response(
				JSON.stringify({
					error: error.message || "Internal server error",
					code: "INTERNAL_ERROR",
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	}

	/**
	 * GET /api/evaluations - List recent evaluations from database
	 */
	async listHistory(req: Request): Promise<Response> {
		try {
			const url = new URL(req.url);
			const limitParam = url.searchParams.get("limit");
			const limit = limitParam ? parseInt(limitParam, 10) : undefined;

			const evaluations = evaluationRepository.getRecentEvaluations(limit);

			return new Response(JSON.stringify(evaluations), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (err: unknown) {
			console.error("[EvaluationRoutes] Error in GET /api/evaluations:", err);
			const error = err as Error;

			return new Response(
				JSON.stringify({
					error: error.message || "Internal server error",
					code: "INTERNAL_ERROR",
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	}

	/**
	 * GET /api/evaluations/:id - Get full evaluation from database
	 */
	async getHistoryItem(_req: Request, evaluationId: string): Promise<Response> {
		try {
			const evaluation = evaluationRepository.getEvaluationById(evaluationId);

			if (!evaluation) {
				return new Response(
					JSON.stringify({
						error: "Evaluation not found",
						code: "EVALUATION_NOT_FOUND",
					}),
					{
						status: 404,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			return new Response(JSON.stringify(evaluation), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (err: unknown) {
			console.error(
				"[EvaluationRoutes] Error in GET /api/evaluations/:id:",
				err,
			);
			const error = err as Error;

			return new Response(
				JSON.stringify({
					error: error.message || "Internal server error",
					code: "INTERNAL_ERROR",
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	}

	/**
	 * DELETE /api/evaluations/:id - Delete evaluation from database
	 */
	async deleteHistoryItem(
		_req: Request,
		evaluationId: string,
	): Promise<Response> {
		// Block deletion in cloud mode
		if (this.cloudMode) {
			return new Response(
				JSON.stringify({
					error: "Deletion not permitted in cloud mode",
					code: "CLOUD_MODE_RESTRICTED",
				}),
				{
					status: 403,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		try {
			const deleted = evaluationRepository.deleteEvaluation(evaluationId);

			if (!deleted) {
				return new Response(
					JSON.stringify({
						error: "Evaluation not found",
						code: "EVALUATION_NOT_FOUND",
					}),
					{
						status: 404,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			return new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (err: unknown) {
			console.error(
				"[EvaluationRoutes] Error in DELETE /api/evaluations/:id:",
				err,
			);
			const error = err as Error;

			return new Response(
				JSON.stringify({
					error: error.message || "Internal server error",
					code: "INTERNAL_ERROR",
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	}

	/**
	 * DELETE /api/evaluations - Delete all evaluations from database
	 */
	async deleteAllHistoryItems(_req: Request): Promise<Response> {
		// Block deletion in cloud mode
		if (this.cloudMode) {
			return new Response(
				JSON.stringify({
					error: "Deletion not permitted in cloud mode",
					code: "CLOUD_MODE_RESTRICTED",
				}),
				{
					status: 403,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		try {
			const deletedCount = evaluationRepository.deleteAllEvaluations();

			return new Response(JSON.stringify({ success: true, deletedCount }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		} catch (err: unknown) {
			console.error(
				"[EvaluationRoutes] Error in DELETE /api/evaluations:",
				err,
			);
			const error = err as Error;

			return new Response(
				JSON.stringify({
					error: error.message || "Internal server error",
					code: "INTERNAL_ERROR",
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	}

	/**
	 * GET /api/evaluations/:id/prompts - Get final prompts for an evaluation
	 */
	async getEvaluationPrompts(
		_req: Request,
		evaluationId: string,
	): Promise<Response> {
		try {
			const evaluation = evaluationRepository.getEvaluationById(evaluationId);

			if (!evaluation) {
				return new Response(
					JSON.stringify({
						error: "Evaluation not found",
						code: "EVALUATION_NOT_FOUND",
					}),
					{
						status: 404,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			return new Response(
				JSON.stringify({
					evaluationId,
					prompts: evaluation.finalPrompts || {},
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			);
		} catch (err: unknown) {
			console.error(
				"[EvaluationRoutes] Error in GET /api/evaluations/:id/prompts:",
				err,
			);
			const error = err as Error;

			return new Response(
				JSON.stringify({
					error: error.message || "Internal server error",
					code: "INTERNAL_ERROR",
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	}

	/**
	 * POST /api/evaluations/import - Import a CLI-generated JSON report
	 */
	async importReport(req: Request): Promise<Response> {
		console.log("[EvaluationRoutes] POST /api/evaluations/import");

		// Block in cloud mode
		if (this.cloudMode) {
			return new Response(
				JSON.stringify({
					error: "Import is not available in cloud mode",
					code: "CLOUD_MODE_RESTRICTED",
				}),
				{
					status: 403,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		try {
			const body = (await req.json()) as IJsonReport;

			// Validate required fields
			if (!body.metadata || !body.issues || !body.statistics) {
				return new Response(
					JSON.stringify({
						error:
							"Invalid report format: metadata, issues, and statistics are required",
						code: "INVALID_REQUEST",
					}),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			if (!Array.isArray(body.issues)) {
				return new Response(
					JSON.stringify({
						error: "Invalid report format: issues must be an array",
						code: "INVALID_REQUEST",
					}),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			// Convert to EvaluationOutput
			const evaluationOutput = convertJsonReportToEvaluationOutput(body);

			// Generate a unique ID
			const evaluationId = crypto.randomUUID();

			// Determine repository URL
			const repositoryUrl =
				body.metadata.repositoryUrl ||
				body.metadata.localPath ||
				"unknown (imported)";

			// Save to database
			evaluationRepository.saveImportedEvaluation(
				evaluationId,
				evaluationOutput,
				repositoryUrl,
			);

			return new Response(
				JSON.stringify({
					evaluationId,
					repositoryUrl,
					status: "imported",
				}),
				{
					status: 201,
					headers: { "Content-Type": "application/json" },
				},
			);
		} catch (err: unknown) {
			console.error(
				"[EvaluationRoutes] Error in POST /api/evaluations/import:",
				err,
			);
			const error = err as Error;

			return new Response(
				JSON.stringify({
					error: error.message || "Internal server error",
					code: "INTERNAL_ERROR",
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	}

	/**
	 * POST /api/evaluate/batch - Start batch evaluation (sequential)
	 */
	async postBatch(req: Request): Promise<Response> {
		console.log("[EvaluationRoutes] POST /api/evaluate/batch");

		// Block in cloud mode
		if (this.cloudMode) {
			return new Response(
				JSON.stringify({
					error: "Batch evaluation is not available in cloud mode",
					code: "CLOUD_MODE_RESTRICTED",
				}),
				{
					status: 403,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		if (!this.batchManager) {
			return new Response(
				JSON.stringify({
					error: "Batch evaluation is not configured",
					code: "BATCH_NOT_AVAILABLE",
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		try {
			const body = (await req.json()) as IBatchEvaluateRequest;
			console.log(
				"[EvaluationRoutes] Batch request:",
				body.urls?.length,
				"URLs",
			);

			// Validate urls field exists
			if (!body.urls || !Array.isArray(body.urls)) {
				return new Response(
					JSON.stringify({
						error: "urls array is required",
						code: "INVALID_REQUEST",
					}),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			// Force standard API options
			const options = {
				...body.options,
				verbose: true,
				debug: true,
				preserveDebugOutput: body.options?.preserveDebugOutput ?? false,
				curation: {
					enabled: true,
					topN: body.options?.curation?.topN ?? 20,
				},
			};

			// Create batch (BatchManager handles validation and rate limit checks)
			const batch = await this.batchManager.createBatch(
				body.urls.map((u) => u.trim()),
				options,
			);

			return new Response(
				JSON.stringify({
					batchId: batch.id,
					totalUrls: batch.entries.length,
					jobs: batch.entries.map((e) => ({
						url: e.url,
						jobId: e.jobId,
						status: e.status,
					})),
					createdAt: batch.createdAt.toISOString(),
				}),
				{
					status: 202,
					headers: { "Content-Type": "application/json" },
				},
			);
		} catch (err: unknown) {
			console.error(
				"[EvaluationRoutes] Error in POST /api/evaluate/batch:",
				err,
			);
			const error = err as Error;

			// Determine appropriate status code
			const isValidationError =
				error.message?.includes("Invalid Git URLs") ||
				error.message?.includes("At least one URL") ||
				error.message?.includes("Maximum 50 URLs");
			const isRateLimitError = error.message?.includes(
				"Daily rate limit insufficient",
			);

			return new Response(
				JSON.stringify({
					error: error.message || "Internal server error",
					code: isValidationError
						? "INVALID_REQUEST"
						: isRateLimitError
							? "DAILY_LIMIT_EXCEEDED"
							: "INTERNAL_ERROR",
				}),
				{
					status: isValidationError ? 400 : isRateLimitError ? 429 : 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	}

	/**
	 * GET /api/evaluate/batch/:batchId - Get batch status
	 */
	async getBatchStatus(_req: Request, batchId: string): Promise<Response> {
		if (!this.batchManager) {
			return new Response(
				JSON.stringify({
					error: "Batch evaluation is not configured",
					code: "BATCH_NOT_AVAILABLE",
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		const status = this.batchManager.getBatchStatus(batchId);
		if (!status) {
			return new Response(
				JSON.stringify({
					error: "Batch not found",
					code: "BATCH_NOT_FOUND",
				}),
				{
					status: 404,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		return new Response(JSON.stringify(status), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}
}
