/**
 * Remediation routes - generates prompts and executes remediation via CLI agents
 */

import { buildTechnicalInventorySection } from "@shared/claude/prompt-builder";
import type { FileEvaluationResult } from "@shared/evaluation/runner";
import { cloneRepository } from "@shared/file-system/git-cloner";
import { applyPatch } from "@shared/remediation/git-operations";
import {
	generateRemediationPrompts,
	type RemediationInput,
	type RemediationIssue,
} from "@shared/remediation/prompt-generator";
import {
	type Issue,
	isIndependentFormat,
	isUnifiedFormat,
} from "@shared/types/evaluation";
import {
	type IRemediationRequest,
	TARGET_AGENTS,
	type TargetAgent,
} from "@shared/types/remediation";
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
	targetAgent: TargetAgent;
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
		isPhantomFile: issue.isPhantomFile,
	};
}

export class RemediationRoutes {
	constructor(
		private jobManager: JobManager,
		private remediationJobManager?: RemediationJobManager,
		private remediationSSEHandler?: RemediationSSEHandler,
		private cloudMode: boolean = false,
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
			if (
				!body.targetAgent ||
				!Object.keys(TARGET_AGENTS).includes(body.targetAgent)
			) {
				return errorResponse(
					"targetAgent must be one of: agents-md, claude-code, github-copilot",
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

			// Step 5: Get context file paths and handle colocated pairs
			const colocatedPairs = pc?.colocatedPairs ?? [];
			let contextFilePaths = pc?.agentsFilePaths ?? [];

			// Remap issue locations from CLAUDE.md → AGENTS.md for consolidated pairs
			if (colocatedPairs.length > 0) {
				const claudeToAgents = new Map(
					colocatedPairs.map((p) => [p.claudePath, p.agentsPath]),
				);
				for (const issue of [...errors, ...suggestions]) {
					if (issue.location?.file && claudeToAgents.has(issue.location.file)) {
						issue.location.file = claudeToAgents.get(issue.location.file)!;
					}
				}
				// Filter consolidated CLAUDE.md paths from context file list
				const claudePaths = new Set(colocatedPairs.map((p) => p.claudePath));
				contextFilePaths = contextFilePaths.filter((p) => !claudePaths.has(p));
			}

			// Step 6: Generate prompts
			const input: RemediationInput = {
				targetAgent: body.targetAgent,
				contextFilePaths,
				errors,
				suggestions,
				technicalInventorySection,
				projectSummary,
				colocatedPairs: colocatedPairs.length > 0 ? colocatedPairs : undefined,
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
			if (
				!body.targetAgent ||
				!Object.keys(TARGET_AGENTS).includes(body.targetAgent)
			) {
				return errorResponse(
					"targetAgent must be one of: agents-md, claude-code, github-copilot",
					"INVALID_REQUEST",
					400,
				);
			}
			if (!body.provider) {
				return errorResponse("provider is required", "INVALID_REQUEST", 400);
			}

			// Guard: prevent concurrent remediations for filesystem safety
			if (
				this.remediationJobManager.hasActiveJobForEvaluation(body.evaluationId)
			) {
				return errorResponse(
					"A remediation is already in progress for this evaluation",
					"REMEDIATION_ACTIVE",
					409,
				);
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
	 * GET /api/remediation/list-for-evaluation/:evaluationId — Get all remediations for an evaluation
	 */
	async getRemediationsForEvaluation(
		_req: Request,
		evaluationId: string,
	): Promise<Response> {
		try {
			const remediations =
				remediationRepository.getRemediationsByEvaluationId(evaluationId);

			// Check for active in-memory job
			let activeJob: {
				id: string;
				status: string;
				currentStep?: string;
				createdAt: string;
			} | null = null;

			if (this.remediationJobManager) {
				const job =
					this.remediationJobManager.getJobByEvaluationId(evaluationId);
				if (job && (job.status === "queued" || job.status === "running")) {
					activeJob = {
						id: job.id,
						status: job.status,
						currentStep: job.currentStep,
						createdAt: job.createdAt.toISOString(),
					};
				}
			}

			return okResponse({ remediations, activeJob });
		} catch (err: unknown) {
			console.error(
				"[RemediationRoutes] Error listing remediations for evaluation:",
				err,
			);
			return internalErrorResponse(
				"Failed to list remediations for evaluation",
			);
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
	 * DELETE /api/remediation/:id — Delete a remediation (non-cloud only)
	 */
	async deleteRemediation(
		_req: Request,
		remediationId: string,
	): Promise<Response> {
		try {
			if (this.cloudMode) {
				return errorResponse(
					"Deleting remediations is not allowed in cloud mode",
					"CLOUD_MODE_RESTRICTED",
					403,
				);
			}

			// Prevent deleting active (queued/running) remediations
			if (this.remediationJobManager) {
				const job = this.remediationJobManager.getJob(remediationId);
				if (job && (job.status === "queued" || job.status === "running")) {
					return errorResponse(
						"Cannot delete an active remediation",
						"REMEDIATION_ACTIVE",
						409,
					);
				}
			}

			const deleted = remediationRepository.deleteRemediation(remediationId);
			if (!deleted) {
				return notFoundResponse("Remediation not found");
			}

			// Clean up in-memory job data
			if (this.remediationJobManager) {
				// Find the job to get the evaluationId for cleanup
				const job = this.remediationJobManager.getJob(remediationId);
				if (job) {
					this.remediationJobManager.removeJobByEvaluationId(
						job.request.evaluationId,
					);
				}
			}

			return okResponse({ success: true });
		} catch (err: unknown) {
			console.error("[RemediationRoutes] Error deleting remediation:", err);
			return internalErrorResponse("Failed to delete remediation");
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
	 * POST /api/remediation/:id/evaluate — Evaluate the impact of a remediation
	 */
	async evaluateImpact(
		_req: Request,
		remediationId: string,
	): Promise<Response> {
		try {
			// Fetch remediation
			const remediation =
				remediationRepository.getRemediationById(remediationId);
			if (!remediation) {
				return notFoundResponse("Remediation not found");
			}
			if (remediation.status !== "completed" || !remediation.fullPatch) {
				return errorResponse(
					"Remediation must be completed with a patch to evaluate impact",
					"INVALID_STATE",
					400,
				);
			}

			// If a result evaluation already exists, check its state
			if (remediation.resultEvaluationId) {
				// Check if the evaluation job is still running in memory
				const existingJob = this.jobManager.getJob(
					remediation.resultEvaluationId,
				);
				if (
					existingJob &&
					(existingJob.status === "queued" || existingJob.status === "running")
				) {
					return new Response(
						JSON.stringify({
							error: "Impact evaluation is already in progress",
							code: "IMPACT_EVAL_ACTIVE",
							jobId: remediation.resultEvaluationId,
							sseUrl: `/api/evaluate/${remediation.resultEvaluationId}/progress`,
						}),
						{
							status: 409,
							headers: { "Content-Type": "application/json" },
						},
					);
				}
				// Already completed — return existing evaluation ID
				return okResponse({
					jobId: remediation.resultEvaluationId,
					sseUrl: `/api/evaluate/${remediation.resultEvaluationId}/progress`,
					status: "already_exists",
				});
			}

			// Fetch parent evaluation for repo URL and git metadata
			const parentRecord = evaluationRepository.getEvaluationById(
				remediation.evaluationId,
			);
			if (!parentRecord) {
				return notFoundResponse("Parent evaluation not found");
			}

			// Guard: need a repository URL to clone
			const repoUrl = parentRecord.repositoryUrl;
			if (
				!repoUrl ||
				repoUrl === "unknown" ||
				(!repoUrl.startsWith("http") && !repoUrl.startsWith("git@"))
			) {
				return errorResponse(
					"Cannot evaluate impact: no repository URL available (local or imported evaluations are not supported)",
					"NO_REPO_URL",
					400,
				);
			}

			// Clone the repo at the same commit
			let cloneResult: { path: string; cleanup: () => Promise<void> };
			try {
				cloneResult = await cloneRepository(repoUrl, {
					branch: parentRecord.gitBranch,
					commitSha: parentRecord.gitCommitSha,
				});
			} catch (cloneError) {
				console.error(
					"[RemediationRoutes] Clone failed for impact evaluation:",
					cloneError,
				);
				return internalErrorResponse(
					`Failed to clone repository: ${cloneError instanceof Error ? cloneError.message : "Unknown error"}`,
				);
			}

			// Apply the remediation patch
			try {
				await applyPatch(cloneResult.path, remediation.fullPatch);
			} catch (patchError) {
				// Cleanup clone directory on failure
				try {
					await cloneResult.cleanup();
				} catch {
					// Ignore cleanup errors
				}
				return new Response(
					JSON.stringify({
						error: `Failed to apply patch: ${patchError instanceof Error ? patchError.message : "Unknown error"}`,
						code: "PATCH_APPLY_FAILED",
					}),
					{
						status: 422,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			// Extract evaluators from parent evaluation result
			let parentEvaluatorIds: string[] | undefined;
			const parentResult = parentRecord.result;
			if (parentResult) {
				const evaluatorNames = new Set<string>();
				if (isIndependentFormat(parentResult)) {
					for (const fileResult of Object.values(
						parentResult.files,
					) as FileEvaluationResult[]) {
						for (const evaluation of fileResult.evaluations) {
							if (evaluation.evaluator) {
								evaluatorNames.add(evaluation.evaluator.replace(/\.md$/, ""));
							}
						}
					}
				} else if (isUnifiedFormat(parentResult)) {
					for (const result of parentResult.results) {
						if (result.evaluator) {
							evaluatorNames.add(result.evaluator.replace(/\.md$/, ""));
						}
					}
				}
				if (evaluatorNames.size > 0) {
					parentEvaluatorIds = [...evaluatorNames];
				}
			}

			// Submit evaluation job on the patched clone
			const jobId = await this.jobManager.submitJob({
				localPath: cloneResult.path,
				repositoryUrl: repoUrl,
				options: {
					selectedEvaluators: parentEvaluatorIds,
				},
				_cleanupFn: cloneResult.cleanup,
				_parentEvaluationId: remediation.evaluationId,
				_sourceRemediationId: remediationId,
			});

			return okResponse({
				jobId,
				sseUrl: `/api/evaluate/${jobId}/progress`,
				status: "queued",
			});
		} catch (err: unknown) {
			console.error(
				"[RemediationRoutes] Error evaluating remediation impact:",
				err,
			);
			return internalErrorResponse("Failed to start impact evaluation");
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
