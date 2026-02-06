/**
 * Deduplication pipeline - three-phase deduplication for evaluation issues
 *
 * Extracted from engine.ts to eliminate code duplication between
 * runUnifiedMode() and runIndependentMode()
 */

import type { IAIProvider } from "@shared/providers";
import type { Issue } from "@shared/types/evaluation";
import { deduplicateIssues } from "./deduplicator";
import { deduplicateIssuesSemantic } from "./semantic-deduplicator";

/**
 * Metadata from Phase 1: Rule-based deduplication
 */
export interface Phase1Metadata {
	originalCount: number;
	finalCount: number;
	removed: number;
	clusters: number;
}

/**
 * Metadata from Phase 2: AI semantic deduplication
 */
export interface Phase2Metadata {
	originalCount: number;
	finalCount: number;
	removed: number;
	groups: number;
	cost_usd?: number;
	duration_ms?: number;
}

/**
 * Options for deduplication pipeline
 */
export interface DeduplicationOptions {
	/** Whether deduplication is enabled (default: true) */
	enabled?: boolean;
	/** Tolerance for location-based grouping (default: 5 lines) */
	locationTolerance?: number;
	/** Threshold for text similarity (default: 0.55) */
	similarityThreshold?: number;
	/** Whether AI semantic deduplication is enabled (default: true) */
	aiEnabled?: boolean;
	/** Maximum issues to process with AI (default: 500) */
	maxIssuesForAI?: number;
	/** Verbose logging */
	verbose?: boolean;
	/** AI provider for semantic deduplication */
	provider?: IAIProvider;
}

/**
 * Result from deduplication pipeline
 */
export interface DeduplicationResult {
	/** Deduplicated issues */
	deduplicated: Issue[];
	/** Phase 1 metadata (rule-based) */
	phase1: Phase1Metadata | null;
	/** Phase 2 metadata (AI semantic) */
	phase2: Phase2Metadata | null;
	/** Total duplicates removed */
	totalRemoved: number;
	/** Total clusters/groups */
	totalClusters: number;
}

/**
 * Execute the two-phase deduplication pipeline
 *
 * Phase 1: Rule-based deduplication (text similarity + location overlap)
 *          Also extracts entity candidates for Phase 2
 * Phase 2: AI semantic deduplication (LLM-based semantic grouping)
 */
export async function executeDeduplicationPipeline(
	issues: Issue[],
	options: DeduplicationOptions = {},
): Promise<DeduplicationResult> {
	const {
		enabled = true,
		locationTolerance = 5,
		similarityThreshold = 0.55,
		aiEnabled = true,
		maxIssuesForAI = 500,
		verbose = false,
		provider,
	} = options;

	// If disabled, return issues unchanged
	if (!enabled) {
		return {
			deduplicated: issues,
			phase1: null,
			phase2: null,
			totalRemoved: 0,
			totalClusters: 0,
		};
	}

	let deduplicatedIssues = issues;
	let phase1Metadata: Phase1Metadata | null = null;
	let phase2Metadata: Phase2Metadata | null = null;

	// Phase 1: Rule-based deduplication
	const phase1Result = deduplicateIssues(deduplicatedIssues, {
		enabled: true,
		locationToleranceLines: locationTolerance,
		textSimilarityThreshold: similarityThreshold,
		verbose,
	});

	deduplicatedIssues = phase1Result.deduplicated;
	phase1Metadata = {
		originalCount: phase1Result.originalCount,
		finalCount: phase1Result.finalCount,
		removed: phase1Result.removed.length,
		clusters: phase1Result.clusters.length,
	};

	if (verbose) {
		console.log(
			`[Dedup] Phase 1: ${phase1Result.originalCount} → ${phase1Result.finalCount} ` +
				`(removed ${phase1Result.removed.length} textual duplicates)`,
		);
		if (
			phase1Result.locationCandidates &&
			phase1Result.locationCandidates.length > 0
		) {
			const candidateCount = phase1Result.locationCandidates.reduce(
				(sum, cluster) => sum + cluster.length,
				0,
			);
			console.log(
				`[Dedup] Phase 1 identified ${candidateCount} location candidates in ${phase1Result.locationCandidates.length} clusters for Phase 2 review`,
			);
		}
		if (
			phase1Result.entityCandidates &&
			phase1Result.entityCandidates.length > 0
		) {
			const entityCandidateCount = phase1Result.entityCandidates.reduce(
				(sum, cluster) => sum + cluster.length,
				0,
			);
			console.log(
				`[Dedup] Phase 1 identified ${entityCandidateCount} entity candidates in ${phase1Result.entityCandidates.length} clusters for Phase 2 review`,
			);
		}
	}

	// Phase 2: AI semantic deduplication
	if (aiEnabled && provider) {
		const phase2Result = await deduplicateIssuesSemantic(deduplicatedIssues, {
			verbose,
			provider,
			maxIssuesForAI,
			locationCandidates: phase1Result.locationCandidates,
			entityCandidates: phase1Result.entityCandidates,
		});

		deduplicatedIssues = phase2Result.kept;
		phase2Metadata = {
			originalCount: phase2Result.originalCount,
			finalCount: phase2Result.finalCount,
			removed: phase2Result.removed.length,
			groups: phase2Result.groups.length,
			cost_usd: phase2Result.cost_usd,
			duration_ms: phase2Result.duration_ms,
		};

		if (verbose) {
			console.log(
				`[Dedup] Phase 2 AI: ${phase2Result.originalCount} → ${phase2Result.finalCount} ` +
					`(removed ${phase2Result.removed.length} semantic duplicates)`,
			);
		}
	}

	// Calculate totals
	const totalRemoved = issues.length - deduplicatedIssues.length;
	const totalClusters =
		(phase1Metadata?.clusters ?? 0) + (phase2Metadata?.groups ?? 0);

	return {
		deduplicated: deduplicatedIssues,
		phase1: phase1Metadata,
		phase2: phase2Metadata,
		totalRemoved,
		totalClusters,
	};
}

/**
 * Add deduplication tracking IDs to issues
 * This allows filtering output structures to match deduplicated issues
 */
export function addDeduplicationIds(issues: Issue[]): void {
	issues.forEach((issue, idx) => {
		issue._deduplicationId = `issue_${idx}`;
	});
}

/**
 * Create a Set of deduplicated IDs for efficient filtering
 */
export function createDeduplicationIdSet(issues: Issue[]): Set<string> {
	return new Set(
		issues
			.map((issue) => issue._deduplicationId)
			.filter((id): id is string => id !== undefined),
	);
}
