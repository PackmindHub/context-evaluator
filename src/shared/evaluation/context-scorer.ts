// Context Scorer Module
// Computes an overall quality grade (1-10) for repository AGENTS.md files
// Algorithm: "Base + Setup Bonus - Issue Penalty"

import { invokeClaudeWithRetry } from "@shared/claude/invoker";
import type {
	ContextScoreGrade,
	IContextScore,
	IContextScoreBreakdown,
	IProjectContext,
	Issue,
} from "@shared/types/evaluation";
import { getIssueTypeFromEvaluatorName } from "./evaluator-types";

/**
 * Input for computing context score
 */
export interface IContextScorerInput {
	issues: Issue[];
	filesFound: number;
	filesExpected?: number; // Optional: estimate of expected files based on repo structure
	projectContext?: IProjectContext; // Optional: for setup bonuses and LOC normalization
}

// ============================================================================
// Algorithm Constants
// ============================================================================

/**
 * Base score - supportive starting point
 */
const BASE_SCORE = 6.0;

/**
 * Maximum bonus caps for progressive scaling
 * Note: Individual bonuses now use logarithmic scaling instead of flat tiers
 */
const MAX_AGENTS_FILES_BONUS = 2.5; // Increased from 2.0 to reward more files
const MAX_SKILLS_BONUS = 1.0; // Increased from 0.75 to reward more skills
const MAX_LINKED_DOCS_BONUS = 1.0; // Increased from 0.75 to reward more docs

/**
 * Maximum total setup bonus
 */
const MAX_SETUP_BONUS = 4.5; // Increased from 3.5 to reward extensive documentation

/**
 * LOC-based issue allowances (free issues before penalties apply)
 */
const LOC_TIERS = {
	small: { maxLOC: 5000, freeIssues: 5 },
	medium: { maxLOC: 25000, freeIssues: 10 },
	large: { maxLOC: 100000, freeIssues: 15 },
	enterprise: { maxLOC: Number.POSITIVE_INFINITY, freeIssues: 20 },
};

/**
 * Severity weights for issue penalty calculation (3-level system)
 * Updated for 3-level system: High (8-10), Medium (6-7), Low (≤5)
 * High weight reduced from 0.6 to 0.45 to be less punishing
 */
const SEVERITY_WEIGHTS = {
	high: 0.45, // severity 8-10 (merged critical + high) - reduced from 0.6
	medium: 0.15, // severity 6-7
	low: 0.05, // severity ≤5
};

/**
 * Issue type weights (suggestions weighted much lower than errors)
 */
const ISSUE_TYPE_WEIGHTS = {
	error: 1.0,
	suggestion: 0.2, // Suggestions count at 20%
};

/**
 * Maximum issue penalty (soft cap)
 */
const MAX_ISSUE_PENALTY = 3.0;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse total lines of code from cloc summary
 * @example "TypeScript: 15,234\nJavaScript: 3,421" -> 18655
 */
export function parseTotalLOC(clocSummary?: string): number {
	if (!clocSummary) return 0;

	let total = 0;
	const lines = clocSummary.split("\n");
	for (const line of lines) {
		// Match patterns like "TypeScript: 15,234" or "JavaScript: 3421"
		const match = line.match(/:\s*([\d,]+)/);
		if (match?.[1]) {
			// Remove commas and parse as number
			const locValue = Number.parseInt(match[1].replace(/,/g, ""), 10);
			if (!Number.isNaN(locValue)) {
				total += locValue;
			}
		}
	}
	return total;
}

/**
 * Get project size tier based on total LOC
 */
export function getProjectSizeTier(
	totalLOC: number,
): "small" | "medium" | "large" | "enterprise" {
	if (totalLOC < LOC_TIERS.small.maxLOC) return "small";
	if (totalLOC < LOC_TIERS.medium.maxLOC) return "medium";
	if (totalLOC < LOC_TIERS.large.maxLOC) return "large";
	return "enterprise";
}

/**
 * Get free issue allowance for a project size tier
 */
function getIssueAllowance(
	tier: "small" | "medium" | "large" | "enterprise",
): number {
	return LOC_TIERS[tier].freeIssues;
}

/**
 * Calculate bonus for AGENTS.md files using logarithmic scaling
 * Progressive scaling that continues to reward additional files:
 * - 1 file → 1.5
 * - 2 files → ~1.9
 * - 3 files → ~2.13
 * - 5 files → ~2.43
 * - 10 files → 2.5 (max)
 */
export function calculateAgentsFilesBonus(fileCount: number): number {
	if (fileCount <= 0) return 0;
	// Base 1.5 for first file, then +0.4 * log2(fileCount) for additional files
	const bonus = 1.5 + 0.4 * Math.log2(fileCount);
	return Math.min(MAX_AGENTS_FILES_BONUS, Math.round(bonus * 100) / 100);
}

/**
 * Calculate bonus for skills using logarithmic scaling
 * Progressive scaling that continues to reward additional skills:
 * - 1-3 skills → ~0.2-0.4
 * - 8 skills → ~0.63
 * - 20 skills → ~0.87
 * - 30+ skills → 1.0 (max)
 */
export function calculateSkillsBonus(skillsCount: number): number {
	if (skillsCount <= 0) return 0;
	// 0.2 * log2(1 + skillsCount) for smooth scaling
	const bonus = 0.2 * Math.log2(1 + skillsCount);
	return Math.min(MAX_SKILLS_BONUS, Math.round(bonus * 100) / 100);
}

/**
 * Calculate bonus for linked docs using logarithmic scaling
 * Progressive scaling that continues to reward additional docs:
 * - 1-2 docs → ~0.2-0.32
 * - 6 docs → ~0.56
 * - 15 docs → ~0.8
 * - 30+ docs → 1.0 (max)
 */
export function calculateLinkedDocsBonus(linkedDocsCount: number): number {
	if (linkedDocsCount <= 0) return 0;
	// 0.2 * log2(1 + linkedDocsCount) for smooth scaling
	const bonus = 0.2 * Math.log2(1 + linkedDocsCount);
	return Math.min(MAX_LINKED_DOCS_BONUS, Math.round(bonus * 100) / 100);
}

/**
 * Get severity category from numeric severity
 * Updated for 3-level system: High (8-10), Medium (6-7), Low (≤5)
 */
function getSeverityCategory(severity: number): "high" | "medium" | "low" {
	if (severity >= 8) return "high";
	if (severity >= 6) return "medium";
	return "low";
}

/**
 * Calculate documentation maturity factor based on issues-per-file ratio
 * Reduces penalty for well-documented repos with good coverage
 *
 * - 10 issues across 10 files (ratio 1.0) → 30% penalty reduction (factor 0.7)
 * - 10 issues across 5 files (ratio 2.0) → 15% penalty reduction (factor 0.85)
 * - 10 issues in 1 file (ratio 10.0) → no reduction (factor 1.0)
 */
export function getDocumentationMaturityFactor(issuesPerFile: number): number {
	if (issuesPerFile <= 1) return 0.7; // 30% penalty reduction
	if (issuesPerFile <= 2) return 0.85; // 15% penalty reduction
	return 1.0; // No reduction
}

/**
 * Get grade label from numeric score
 * New thresholds: 8.5/6.5/4.5/3.0
 */
export function getGradeFromScore(score: number): ContextScoreGrade {
	if (score >= 8.5) return "Excellent";
	if (score >= 6.5) return "Good";
	if (score >= 4.5) return "Fair";
	if (score >= 3.0) return "Developing";
	return "Getting Started";
}

/**
 * Generate user-friendly one-liner explanation
 */
export function generateExplanation(
	score: number,
	grade: ContextScoreGrade,
	setupBonus: number,
	issuePenalty: number,
	agentsFileCount: number,
): string {
	if (agentsFileCount === 0) {
		return "No AGENTS.md files found. Create one to provide AI agents with essential context.";
	}

	if (grade === "Excellent") {
		return `Great job! Your ${agentsFileCount} context file${agentsFileCount > 1 ? "s" : ""} provide excellent guidance for AI agents.`;
	}

	if (grade === "Good") {
		if (issuePenalty > 0.5) {
			return `Good foundation with ${agentsFileCount} context file${agentsFileCount > 1 ? "s" : ""}. Addressing a few issues would improve AI agent effectiveness.`;
		}
		return `Solid context setup. Consider adding more documentation links or skills to enhance AI assistance.`;
	}

	if (grade === "Fair") {
		if (setupBonus < 2) {
			return `${agentsFileCount} context file${agentsFileCount > 1 ? "s" : ""} provide basic guidance. Adding skills and linked docs would help AI agents more.`;
		}
		return `Context files exist but have issues that may confuse AI agents. Review the recommendations below.`;
	}

	if (grade === "Developing") {
		return `Your context setup is developing. Focus on fixing high-severity issues first.`;
	}

	return `Your AI context needs significant improvement. Start by creating or enhancing your AGENTS.md file.`;
}

// ============================================================================
// Core Scoring Functions
// ============================================================================

/**
 * Compute context score based on issues, file count, and project context
 *
 * Algorithm: "Base + Setup Bonus - Issue Penalty × Maturity Factor"
 * FinalScore = clamp(1, 10, BaseScore + SetupBonus - IssuePenalty)
 *
 * Where:
 * - BaseScore = 6.0 (supportive starting point)
 * - SetupBonus = 0 to 4.5 (rewards existing investment, progressive scaling)
 * - IssuePenalty = 0 to 3.0 (soft cap with LOC-normalized allowance)
 * - MaturityFactor = 0.7 to 1.0 (reduces penalty for well-covered repos)
 */
export function computeContextScore(
	input: IContextScorerInput,
): IContextScoreBreakdown {
	const { issues, filesFound, projectContext } = input;

	// =========================================================================
	// 1. Calculate Setup Bonuses
	// =========================================================================
	const agentsFileCount = projectContext?.agentsFilePaths?.length ?? filesFound;
	const skillsCount = projectContext?.skills?.length ?? 0;
	const linkedDocsCount = projectContext?.linkedDocs?.length ?? 0;

	const agentsFilesBonus = calculateAgentsFilesBonus(agentsFileCount);
	const skillsBonus = calculateSkillsBonus(skillsCount);
	const linkedDocsBonus = calculateLinkedDocsBonus(linkedDocsCount);

	const totalSetupBonus = Math.min(
		MAX_SETUP_BONUS,
		agentsFilesBonus + skillsBonus + linkedDocsBonus,
	);

	// =========================================================================
	// 2. Calculate LOC-Normalized Issue Penalty
	// =========================================================================
	const totalLOC = parseTotalLOC(projectContext?.clocSummary);
	const projectSizeTier = getProjectSizeTier(totalLOC);
	const issueAllowance = getIssueAllowance(projectSizeTier);

	// Count issues by severity and type
	let highCount = 0;
	let mediumCount = 0;
	let lowCount = 0;
	let errorCount = 0;
	let suggestionCount = 0;

	// Calculate weighted issue count
	let weightedIssueCount = 0;

	for (const issue of issues) {
		// Determine issue type
		const evaluatorName = "evaluatorName" in issue ? issue.evaluatorName : "";
		const issueType =
			issue.issueType || getIssueTypeFromEvaluatorName(evaluatorName || "");
		const isError = issueType !== "suggestion";

		// Count by type
		if (isError) {
			errorCount++;
		} else {
			suggestionCount++;
		}

		// Count by severity (3-level system)
		const severityCat = getSeverityCategory(
			issue.issueType === "error" ? issue.severity : 5, // Map suggestions to low severity
		);
		switch (severityCat) {
			case "high":
				highCount++;
				break;
			case "medium":
				mediumCount++;
				break;
			case "low":
				lowCount++;
				break;
		}

		// Calculate weighted value
		const severityWeight = SEVERITY_WEIGHTS[severityCat];
		const typeWeight = isError
			? ISSUE_TYPE_WEIGHTS.error
			: ISSUE_TYPE_WEIGHTS.suggestion;
		weightedIssueCount += severityWeight * typeWeight;
	}

	// Calculate excess issues beyond allowance
	// Use weighted count for fairer comparison
	const excessIssues = Math.max(0, weightedIssueCount - issueAllowance * 0.5);

	// Calculate penalty with soft cap
	// Use logarithmic scaling for diminishing returns
	const rawPenalty = Math.log2(1 + excessIssues) * 1.2;

	// =========================================================================
	// 2b. Apply Documentation Maturity Factor
	// Reduces penalty for repos with good file coverage (low issues-per-file ratio)
	// =========================================================================
	const issuesPerFile =
		agentsFileCount > 0 ? issues.length / agentsFileCount : issues.length;
	const documentationMaturityFactor =
		getDocumentationMaturityFactor(issuesPerFile);
	const adjustedPenalty = rawPenalty * documentationMaturityFactor;
	const issuePenalty = Math.min(MAX_ISSUE_PENALTY, adjustedPenalty);

	// =========================================================================
	// 3. Build Breakdown Object
	// =========================================================================
	const breakdown: IContextScoreBreakdown = {
		baseScore: BASE_SCORE,
		setupBonus: {
			agentsFilesBonus: Math.round(agentsFilesBonus * 100) / 100,
			skillsBonus: Math.round(skillsBonus * 100) / 100,
			linkedDocsBonus: Math.round(linkedDocsBonus * 100) / 100,
			total: Math.round(totalSetupBonus * 100) / 100,
		},
		issuePenalty: {
			weightedIssueCount: Math.round(weightedIssueCount * 100) / 100,
			issueAllowance,
			excessIssues: Math.round(excessIssues * 100) / 100,
			penalty: Math.round(issuePenalty * 100) / 100,
		},
		context: {
			projectSizeTier,
			totalLOC,
			agentsFileCount,
			skillsCount,
			linkedDocsCount,
			highIssues: highCount,
			mediumIssues: mediumCount,
			lowIssues: lowCount,
			errorCount,
			suggestionCount,
			issuesPerFile: Math.round(issuesPerFile * 100) / 100,
			documentationMaturityFactor,
		},
		// Legacy fields for backward compatibility
		coveragePenalty: 0,
		categoryDiversityPenalty: 0,
		totalPenalty: Math.round(issuePenalty * 100) / 100,
	};

	return breakdown;
}

/**
 * Calculate final score from breakdown
 * Formula: clamp(1, 10, BaseScore + SetupBonus - IssuePenalty)
 */
export function calculateScore(breakdown: IContextScoreBreakdown): number {
	const rawScore =
		breakdown.baseScore +
		breakdown.setupBonus.total -
		breakdown.issuePenalty.penalty;

	// Clamp between 1 and 10
	const score = Math.max(1, Math.min(10, rawScore));

	return Math.round(score * 10) / 10; // Round to 1 decimal
}

/**
 * Generate AI explanation and recommendations for the score
 */
export async function generateScoreExplanation(
	score: number,
	breakdown: IContextScoreBreakdown,
	issues: Issue[],
	options: { verbose?: boolean } = {},
): Promise<{ summary: string; recommendations: string[] }> {
	const { verbose = false } = options;

	// Build a concise issue summary for the AI (high severity = 8+)
	const errorIssues = issues.filter(
		(i): i is Issue & { issueType: "error"; severity: number } =>
			i.issueType === "error" && i.severity >= 8,
	);
	const topIssues = errorIssues
		.slice(0, 5)
		.map(
			(i) =>
				`- [${getSeverityCategory(i.severity).toUpperCase()}] ${i.category}: ${i.title || i.problem || i.description || "No description"}`,
		)
		.join("\n");

	const grade = getGradeFromScore(score);
	const noFilesGuidance =
		breakdown.context.agentsFileCount === 0
			? `\nIMPORTANT: No AGENTS.md files exist in this repository. Your FIRST recommendation MUST be to bootstrap/create an AGENTS.md file at the repository root. The other two recommendations should focus on what context gaps to address (e.g., project architecture, coding conventions, testing requirements, technology stack).\n`
			: "";

	const prompt = `You are analyzing the quality of AGENTS.md files in a repository. Based on the following evaluation data, generate:
1. A 1-2 sentence summary explaining the overall quality
2. Top 3 actionable recommendations for improvement
${noFilesGuidance}
Score: ${score}/10 (${grade})

Setup Investment:
- AGENTS.md files: ${breakdown.context.agentsFileCount} (+${breakdown.setupBonus.agentsFilesBonus} bonus)
- Skills defined: ${breakdown.context.skillsCount} (+${breakdown.setupBonus.skillsBonus} bonus)
- Linked docs: ${breakdown.context.linkedDocsCount} (+${breakdown.setupBonus.linkedDocsBonus} bonus)
- Total setup bonus: +${breakdown.setupBonus.total}

Issues Found:
- High (8-10): ${breakdown.context.highIssues}
- Medium (6-7): ${breakdown.context.mediumIssues}
- Low (≤5): ${breakdown.context.lowIssues}
- Errors: ${breakdown.context.errorCount}
- Suggestions: ${breakdown.context.suggestionCount}
- Issue penalty: -${breakdown.issuePenalty.penalty} (${breakdown.context.projectSizeTier} project, ${breakdown.issuePenalty.issueAllowance} issue allowance)

${topIssues ? `Top Issues:\n${topIssues}` : "No high-severity issues found."}

Respond in this exact JSON format:
{
  "summary": "Your 1-2 sentence summary here",
  "recommendations": ["First recommendation", "Second recommendation", "Third recommendation"]
}`;

	try {
		const response = await invokeClaudeWithRetry(prompt, {
			verbose,
			timeout: 60000, // 1 minute should be enough
		});

		if (response.result) {
			// Parse JSON from response
			const jsonMatch = response.result.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				const parsed = JSON.parse(jsonMatch[0]);
				return {
					summary: parsed.summary || getDefaultSummary(score, breakdown),
					recommendations: Array.isArray(parsed.recommendations)
						? parsed.recommendations.slice(0, 3)
						: getDefaultRecommendations(breakdown),
				};
			}
		}
	} catch (error) {
		if (verbose) {
			console.error(
				"[ContextScorer] Failed to generate AI explanation:",
				error,
			);
		}
	}

	// Fallback to algorithmic summary
	return {
		summary: getDefaultSummary(score, breakdown),
		recommendations: getDefaultRecommendations(breakdown),
	};
}

/**
 * Default summary when AI fails
 */
function getDefaultSummary(
	score: number,
	breakdown: IContextScoreBreakdown,
): string {
	const grade = getGradeFromScore(score);
	const { highIssues, errorCount, suggestionCount, agentsFileCount } =
		breakdown.context;

	if (agentsFileCount === 0) {
		return "No AGENTS.md files found. AI agents have no context guidance for this repository.";
	}

	if (grade === "Excellent") {
		return "Your AGENTS.md files provide excellent context for AI agents with minimal issues.";
	}
	if (grade === "Good") {
		return `Your AGENTS.md files provide good context with ${errorCount} minor errors to address.`;
	}
	if (grade === "Fair") {
		return `Your AGENTS.md files need improvement. Found ${errorCount} errors and ${suggestionCount} suggestions.`;
	}
	if (grade === "Developing") {
		return `Your AGENTS.md files have significant issues. ${highIssues} high-severity problems require attention.`;
	}
	return `Critical issues in AGENTS.md files. ${highIssues} high-severity problems found.`;
}

/**
 * Default recommendations when AI fails
 */
function getDefaultRecommendations(
	breakdown: IContextScoreBreakdown,
): string[] {
	const recommendations: string[] = [];
	const {
		agentsFileCount,
		highIssues,
		errorCount,
		suggestionCount,
		skillsCount,
		linkedDocsCount,
	} = breakdown.context;

	// If no files exist, prioritize bootstrapping
	if (agentsFileCount === 0) {
		return [
			"Bootstrap an AGENTS.md file at the repository root to provide essential AI context.",
			"Document key context gaps: project architecture, coding conventions, and testing requirements.",
			"Add technology stack details and critical workflows that AI agents need to understand.",
		];
	}

	if (highIssues > 0) {
		recommendations.push(
			"Address high-severity issues first - they significantly impact AI agent effectiveness.",
		);
	}

	if (skillsCount === 0 && recommendations.length < 3) {
		recommendations.push(
			"Add SKILL.md files to define reusable workflows for AI agents.",
		);
	}

	if (linkedDocsCount === 0 && recommendations.length < 3) {
		recommendations.push(
			"Link relevant documentation from your AGENTS.md to provide deeper context.",
		);
	}

	if (suggestionCount > errorCount && recommendations.length < 3) {
		recommendations.push(
			"Consider adding AGENTS.md files to subdirectories for better coverage.",
		);
	}

	if (recommendations.length < 3) {
		recommendations.push(
			"Regularly review and update AGENTS.md files as your codebase evolves.",
		);
	}

	return recommendations.slice(0, 3);
}

/**
 * Create a context score for the no-files case
 * Returns score of 3.5 (Developing) - acknowledges the repo exists but needs context
 */
export function createNoFilesContextScore(): IContextScore {
	const breakdown: IContextScoreBreakdown = {
		baseScore: BASE_SCORE,
		setupBonus: {
			agentsFilesBonus: 0,
			skillsBonus: 0,
			linkedDocsBonus: 0,
			total: 0,
		},
		issuePenalty: {
			weightedIssueCount: 0,
			issueAllowance: 5,
			excessIssues: 0,
			penalty: 2.5, // Penalty for having no context files
		},
		context: {
			projectSizeTier: "small",
			totalLOC: 0,
			agentsFileCount: 0,
			skillsCount: 0,
			linkedDocsCount: 0,
			highIssues: 0,
			mediumIssues: 0,
			lowIssues: 0,
			errorCount: 0,
			suggestionCount: 0,
		},
		// Legacy fields
		coveragePenalty: 0,
		categoryDiversityPenalty: 0,
		totalPenalty: 2.5,
	};

	const score = 3.5; // BASE_SCORE (6) + 0 (setup) - 2.5 (penalty) = 3.5
	const grade = getGradeFromScore(score);

	return {
		score,
		grade,
		summary:
			"No AGENTS.md files found. AI agents have no context guidance for this repository.",
		breakdown,
		recommendations: [
			"Bootstrap an AGENTS.md file at the repository root to provide essential AI context.",
			"Document key context gaps: project architecture, coding conventions, and testing requirements.",
			"Add technology stack details and critical workflows that AI agents need to understand.",
		],
		explanation:
			"No AGENTS.md files found. Create one to provide AI agents with essential context.",
	};
}

/**
 * Full context scoring pipeline
 */
export async function computeFullContextScore(
	issues: Issue[],
	filesFound: number,
	options: {
		verbose?: boolean;
		filesExpected?: number;
		projectContext?: IProjectContext;
	} = {},
): Promise<IContextScore> {
	const { verbose = false, filesExpected, projectContext } = options;

	// Compute breakdown
	const breakdown = computeContextScore({
		issues,
		filesFound,
		filesExpected,
		projectContext,
	});

	// Calculate score
	const score = calculateScore(breakdown);
	const grade = getGradeFromScore(score);

	// Generate AI explanation
	const { summary, recommendations } = await generateScoreExplanation(
		score,
		breakdown,
		issues,
		{ verbose },
	);

	// Generate user-friendly explanation
	const explanation = generateExplanation(
		score,
		grade,
		breakdown.setupBonus.total,
		breakdown.issuePenalty.penalty,
		breakdown.context.agentsFileCount,
	);

	return {
		score,
		grade,
		summary,
		breakdown,
		recommendations,
		explanation,
	};
}
