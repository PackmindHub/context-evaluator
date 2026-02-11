/**
 * Remediation routes - generates copy-paste-ready AI agent prompts from evaluation results
 */

import { buildTechnicalInventorySection } from "@shared/claude/prompt-builder";
import {
	generateRemediationPrompts,
	type RemediationInput,
	type RemediationIssue,
} from "@shared/remediation/prompt-generator";
import type { Issue } from "@shared/types/evaluation";
import { evaluationRepository } from "../db/evaluation-repository";
import type { JobManager } from "../jobs/job-manager";
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
	constructor(private jobManager: JobManager) {}

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
}
