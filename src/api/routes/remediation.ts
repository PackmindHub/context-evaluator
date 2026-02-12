/**
 * Remediation routes - generates prompts and executes remediation via CLI agents
 */

import { buildTechnicalInventorySection } from "@shared/claude/prompt-builder";
import {
	generateRemediationPrompts,
	type RemediationInput,
	type RemediationIssue,
} from "@shared/remediation/prompt-generator";
import type { Issue } from "@shared/types/evaluation";
import type { IRemediationRequest } from "@shared/types/remediation";
import { evaluationRepository } from "../db/evaluation-repository";
import { remediationRepository } from "../db/remediation-repository";
import type { JobManager } from "../jobs/job-manager";
import type { RemediationJobManager } from "../jobs/remediation-job-manager";
import type { RemediationSSEHandler } from "../sse/remediation-sse-handler";
import {
	errorResponse,
	internalErrorResponse,
	notFoundResponse,
	okResponse,
} from "../utils/response-builder";

interface GeneratePromptsRequest {
	evaluationId: string;
	issues: (Issue & { evaluatorName?: string })[];
	targetFileType: "AGENTS.md" | "CLAUDE.md";
}

function issueToRemediationIssue(
	issue: Issue & { evaluatorName?: string },
): RemediationIssue {
	const loc = Array.isArray(issue.location)
		? issue.location[0]
		: issue.location;
	return {
		evaluatorName: issue.evaluatorName || "unknown",
		category: issue.category,
		title: issue.title,
		problem: issue.problem,
		description: issue.description,
		severity: issue.issueType === "error" ? issue.severity : undefined,
		impactLevel:
			issue.issueType === "suggestion" ? issue.impactLevel : undefined,
		location: {
			file: loc?.file,
			start: loc?.start ?? 0,
			end: loc?.end ?? 0,
		},
		snippet: issue.snippet,
		fix: issue.fix,
		recommendation: issue.recommendation,
	};
}

export class RemediationRoutes {
	constructor(
		private jobManager: JobManager,
		private remediationJobManager?: RemediationJobManager,
		private remediationSSEHandler?: RemediationSSEHandler,
	) {}

	async generatePrompts(req: Request): Promise<Response> {
		try {
			const body = (await req.json()) as GeneratePromptsRequest;

			if (!body.evaluationId) {
				return errorResponse(
					"evaluationId is required",
					"INVALID_REQUEST",
					400,
				);
			}
			if (!body.issues || body.issues.length === 0) {
				return errorResponse(
					"issues must be a non-empty array",
					"INVALID_REQUEST",
					400,
				);
			}
			if (!body.targetFileType) {
				return errorResponse(
					"targetFileType is required",
					"INVALID_REQUEST",
					400,
				);
			}

			// Step 1: Look up evaluation for context data (job store first, then database)
			let evaluationData = null;

			const job = this.jobManager.getJob(body.evaluationId);
			if (job?.result) {
				evaluationData = job.result;
			} else {
				const record = evaluationRepository.getEvaluationById(
					body.evaluationId,
				);
				if (record?.result) {
					evaluationData = record.result;
				}
			}

			if (!evaluationData) {
				return notFoundResponse("Evaluation not found or has no results");
			}

			// Step 2: Map provided issues directly to remediation format
			const errors: RemediationIssue[] = [];
			const suggestions: RemediationIssue[] = [];

			for (const issue of body.issues) {
				const remIssue = issueToRemediationIssue(issue);
				if (issue.issueType === "suggestion") {
					suggestions.push(remIssue);
				} else {
					errors.push(remIssue);
				}
			}

			// Step 3: Build technical inventory section
			const technicalInventorySection = buildTechnicalInventorySection(
				evaluationData.metadata?.projectContext?.technicalInventory,
			);

			// Step 4: Build project summary
			const pc = evaluationData.metadata?.projectContext;
			const projectSummary = {
				languages: pc?.languages,
				frameworks: pc?.frameworks,
				architecture: pc?.architecture,
			};

			// Step 5: Get context file paths
			const contextFilePaths = pc?.agentsFilePaths ?? [];

			// Step 6: Generate prompts
			const input: RemediationInput = {
				targetFileType: body.targetFileType,
				contextFilePaths,
				errors,
				suggestions,
				technicalInventorySection,
				projectSummary,
			};

			const result = generateRemediationPrompts(input);

			return okResponse(result);
		} catch (err: unknown) {
			console.error("[RemediationRoutes] Error generating prompts:", err);
			return internalErrorResponse("Failed to generate remediation prompts");
		}
	}

	/**
	 * POST /api/remediation/execute — Start a remediation execution job
	 */
	async execute(req: Request): Promise<Response> {
		try {
			if (!this.remediationJobManager) {
				return errorResponse(
					"Remediation execution is not available",
					"NOT_AVAILABLE",
					503,
				);
			}

			const body = (await req.json()) as IRemediationRequest;

			if (!body.evaluationId) {
				return errorResponse(
					"evaluationId is required",
					"INVALID_REQUEST",
					400,
				);
			}
			if (!body.issues || body.issues.length === 0) {
				return errorResponse(
					"issues must be a non-empty array",
					"INVALID_REQUEST",
					400,
				);
			}
			if (!body.targetFileType) {
				return errorResponse(
					"targetFileType is required",
					"INVALID_REQUEST",
					400,
				);
			}
			if (!body.provider) {
				return errorResponse("provider is required", "INVALID_REQUEST", 400);
			}

			const remediationId = this.remediationJobManager.submitJob(body);

			return okResponse({
				remediationId,
				sseUrl: `/api/remediation/${remediationId}/progress`,
				status: "queued",
			});
		} catch (err: unknown) {
			console.error("[RemediationRoutes] Error executing remediation:", err);
			return internalErrorResponse("Failed to start remediation execution");
		}
	}

	/**
	 * GET /api/remediation/for-evaluation/:evaluationId — Get latest remediation for an evaluation
	 */
	async getRemediationForEvaluation(
		_req: Request,
		evaluationId: string,
	): Promise<Response> {
		try {
			// Check in-memory jobs first (running/queued)
			if (this.remediationJobManager) {
				const job =
					this.remediationJobManager.getJobByEvaluationId(evaluationId);
				if (job) {
					return okResponse({
						id: job.id,
						status: job.status,
						currentStep: job.currentStep,
						result: job.result,
						error: job.error,
						createdAt: job.createdAt.toISOString(),
						startedAt: job.startedAt?.toISOString(),
						completedAt: job.completedAt?.toISOString(),
					});
				}
			}

			// Fallback to database
			const record =
				remediationRepository.getRemediationByEvaluationId(evaluationId);
			if (record) {
				return okResponse(record);
			}

			return notFoundResponse("No remediation found for this evaluation");
		} catch (err: unknown) {
			console.error(
				"[RemediationRoutes] Error getting remediation for evaluation:",
				err,
			);
			return internalErrorResponse("Failed to get remediation for evaluation");
		}
	}

	/**
	 * GET /api/remediation/:id — Get remediation status/result
	 */
	async getRemediation(
		_req: Request,
		remediationId: string,
	): Promise<Response> {
		try {
			// Check in-memory job first
			if (this.remediationJobManager) {
				const job = this.remediationJobManager.getJob(remediationId);
				if (job) {
					return okResponse({
						id: job.id,
						status: job.status,
						currentStep: job.currentStep,
						result: job.result,
						error: job.error,
						createdAt: job.createdAt.toISOString(),
						startedAt: job.startedAt?.toISOString(),
						completedAt: job.completedAt?.toISOString(),
					});
				}
			}

			// Fallback to database
			const record = remediationRepository.getRemediationById(remediationId);
			if (record) {
				return okResponse(record);
			}

			return notFoundResponse("Remediation not found");
		} catch (err: unknown) {
			console.error("[RemediationRoutes] Error getting remediation:", err);
			return internalErrorResponse("Failed to get remediation status");
		}
	}

	/**
	 * GET /api/remediation/:id/patch — Download the full patch file
	 */
	async getPatch(_req: Request, remediationId: string): Promise<Response> {
		try {
			// Check in-memory job first
			if (this.remediationJobManager) {
				const job = this.remediationJobManager.getJob(remediationId);
				if (job?.result?.fullPatch) {
					return new Response(job.result.fullPatch, {
						headers: {
							"Content-Type": "text/plain",
							"Content-Disposition": 'attachment; filename="remediation.patch"',
						},
					});
				}
			}

			// Fallback to database
			const record = remediationRepository.getRemediationById(remediationId);
			if (record?.fullPatch) {
				return new Response(record.fullPatch, {
					headers: {
						"Content-Type": "text/plain",
						"Content-Disposition": 'attachment; filename="remediation.patch"',
					},
				});
			}

			return notFoundResponse("Patch not found");
		} catch (err: unknown) {
			console.error("[RemediationRoutes] Error getting patch:", err);
			return internalErrorResponse("Failed to get patch");
		}
	}

	/**
	 * GET /api/remediation/:id/progress — SSE stream for progress
	 */
	getProgress(remediationId: string): Response {
		if (!this.remediationSSEHandler) {
			return new Response(JSON.stringify({ error: "SSE not available" }), {
				status: 503,
				headers: { "Content-Type": "application/json" },
			});
		}
		return this.remediationSSEHandler.createSSEResponse(remediationId);
	}
}
