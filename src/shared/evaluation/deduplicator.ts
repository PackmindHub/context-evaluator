import type { Issue, Location } from "@shared/types/evaluation";

export interface DeduplicationConfig {
	enabled: boolean;
	locationToleranceLines: number; // Default: 5
	textSimilarityThreshold: number; // Default: 0.75
	verbose: boolean;
}

export interface DuplicateCluster {
	representative: Issue;
	duplicates: Issue[];
	reason: string; // "Same location + 85% text similarity"
	similarity: number; // Average similarity score
}

export interface DeduplicationResult {
	deduplicated: Issue[];
	removed: Issue[];
	clusters: DuplicateCluster[];
	originalCount: number;
	finalCount: number;
	locationCandidates?: Issue[][]; // Clusters with overlapping locations but low text similarity
	entityCandidates?: Issue[][]; // Clusters with shared technology entities
}

/**
 * Deduplicate issues using location + text similarity
 *
 * Algorithm:
 * 1. Cluster issues by overlapping locations (within N lines tolerance)
 * 2. Within each location cluster, compute text similarity
 * 3. If similarity > threshold, mark as duplicates
 * 4. Select representative (highest severity/impact + most complete info)
 */
export function deduplicateIssues(
	issues: Issue[],
	config: DeduplicationConfig,
): DeduplicationResult {
	// 1. Location-based clustering
	const locationClusters = clusterByLocation(
		issues,
		config.locationToleranceLines,
	);

	const duplicateClusters: DuplicateCluster[] = [];
	const kept = new Set<Issue>();
	const removed = new Set<Issue>();
	const locationCandidates: Issue[][] = [];

	// 2. Text similarity within clusters
	for (const cluster of locationClusters) {
		if (cluster.length < 2) {
			// Single issue, keep it
			kept.add(cluster[0]!);
			continue;
		}

		// Compute pairwise similarity
		const similarPairs = findSimilarPairs(
			cluster,
			config.textSimilarityThreshold,
		);

		if (similarPairs.length === 0) {
			// No duplicates in this cluster, keep all
			for (const issue of cluster) {
				kept.add(issue);
			}

			// Track as location candidates if cluster has 2+ issues
			// (same location but low text similarity - likely candidates for semantic deduplication)
			if (cluster.length >= 2) {
				locationCandidates.push([...cluster]);
			}
			continue;
		}

		// Group similar pairs into duplicate groups
		const duplicateGroups = groupSimilarPairs(similarPairs, cluster);

		// For each group, select representative
		for (const group of duplicateGroups) {
			const representative = selectRepresentative(group.issues);
			const duplicates = group.issues.filter(
				(issue) => issue !== representative,
			);

			kept.add(representative);
			for (const issue of duplicates) {
				removed.add(issue);
			}

			duplicateClusters.push({
				representative,
				duplicates,
				reason: `Same location + ${Math.round(group.avgSimilarity * 100)}% text similarity`,
				similarity: group.avgSimilarity,
			});
		}
	}

	// 3. Extract entity candidates
	const entityCandidates = extractEntityCandidates(issues, 2);

	return {
		deduplicated: Array.from(kept),
		removed: Array.from(removed),
		clusters: duplicateClusters,
		originalCount: issues.length,
		finalCount: kept.size,
		locationCandidates,
		entityCandidates,
	};
}

/**
 * Cluster issues by overlapping locations
 */
function clusterByLocation(issues: Issue[], tolerance: number): Issue[][] {
	const clusters: Issue[][] = [];
	const processed = new Set<Issue>();

	for (const issue of issues) {
		if (processed.has(issue)) continue;

		const cluster = [issue];
		processed.add(issue);

		// Find all issues with overlapping locations
		for (const other of issues) {
			if (processed.has(other)) continue;

			if (locationsOverlap(issue.location, other.location, tolerance)) {
				cluster.push(other);
				processed.add(other);
			}
		}

		clusters.push(cluster);
	}

	return clusters;
}

/**
 * Extract technology entities from issues and group issues by shared entities
 * Used to create entity candidates for Phase 2 semantic deduplication
 *
 * @param issues - Issues to analyze
 * @param threshold - Minimum number of issues that must share an entity (default: 2)
 * @returns Array of issue clusters where each cluster shares at least one entity
 */
function extractEntityCandidates(issues: Issue[], threshold = 2): Issue[][] {
	// Extract entities from each issue
	const issueEntities = issues.map((issue) => {
		const entities = new Set<string>();
		const text = [
			issue.problem,
			issue.description,
			issue.title,
			issue.impact,
			issue.recommendation,
		]
			.filter(Boolean)
			.join(" ");

		// Database names (case-insensitive)
		const databaseRegex =
			/\b(mysql|postgresql|postgres|mongodb|mongo|sqlite|mariadb|redis|cassandra|dynamodb|oracle|mssql|sqlserver)\b/gi;
		for (const match of text.matchAll(databaseRegex)) {
			entities.add(match[1]!.toLowerCase());
		}

		// ORM/framework names (case-insensitive)
		const ormRegex =
			/\b(typeorm|mongoose|prisma|sequelize|knex|bookshelf|objection|mikro-orm|mikroorm|drizzle)\b/gi;
		for (const match of text.matchAll(ormRegex)) {
			entities.add(match[1]!.toLowerCase());
		}

		// IP addresses
		const ipRegex = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g;
		for (const match of text.matchAll(ipRegex)) {
			entities.add(match[1]!);
		}

		return { issue, entities };
	});

	// Group issues by shared entities
	const entityGroups = new Map<string, Issue[]>();
	for (const { issue, entities } of issueEntities) {
		for (const entity of entities) {
			if (!entityGroups.has(entity)) {
				entityGroups.set(entity, []);
			}
			entityGroups.get(entity)!.push(issue);
		}
	}

	// Filter groups with threshold+ issues
	return Array.from(entityGroups.values()).filter(
		(group) => group.length >= threshold,
	);
}

/**
 * Check if two locations overlap (within tolerance)
 */
function locationsOverlap(
	loc1: Location | Location[] | undefined,
	loc2: Location | Location[] | undefined,
	tolerance: number,
): boolean {
	if (!loc1 || !loc2) return false;

	const locs1 = Array.isArray(loc1) ? loc1 : [loc1];
	const locs2 = Array.isArray(loc2) ? loc2 : [loc2];

	// Check if ANY location from loc1 overlaps with ANY from loc2
	for (const l1 of locs1) {
		for (const l2 of locs2) {
			// Same file?
			if (l1.file !== l2.file) continue;

			// Overlapping line ranges (with tolerance)?
			const start1 = l1.start - tolerance;
			const end1 = l1.end + tolerance;
			const start2 = l2.start - tolerance;
			const end2 = l2.end + tolerance;

			if (!(end1 < start2 || end2 < start1)) {
				return true; // Overlap
			}
		}
	}

	return false;
}

/**
 * Find pairs of similar issues (by text)
 */
function findSimilarPairs(
	cluster: Issue[],
	threshold: number,
): Array<{ i: number; j: number; similarity: number }> {
	const pairs = [];

	for (let i = 0; i < cluster.length; i++) {
		for (let j = i + 1; j < cluster.length; j++) {
			const similarity = computeTextSimilarity(
				extractText(cluster[i]!),
				extractText(cluster[j]!),
			);

			if (similarity >= threshold) {
				pairs.push({ i, j, similarity });
			}
		}
	}

	return pairs;
}

/**
 * Extract text for similarity comparison
 */
function extractText(issue: Issue): string {
	// Prioritize: problem > description > title > category
	return (
		issue.problem ||
		issue.description ||
		issue.title ||
		issue.category ||
		""
	)
		.toLowerCase()
		.trim();
}

/**
 * Compute text similarity (Levenshtein + word overlap)
 */
function computeTextSimilarity(text1: string, text2: string): number {
	if (text1 === text2) return 1.0;
	if (!text1 || !text2) return 0.0;

	// 1. Levenshtein distance (character-level)
	const maxLen = Math.max(text1.length, text2.length);
	if (maxLen === 0) return 1.0; // Both empty strings are identical

	const distance = levenshteinDistance(text1, text2);
	const levenshteinSim = 1 - distance / maxLen;

	// 2. Word overlap (token-level)
	const words1 = new Set(text1.split(/\s+/));
	const words2 = new Set(text2.split(/\s+/));
	const intersection = new Set([...words1].filter((w) => words2.has(w)));
	const union = new Set([...words1, ...words2]);
	const jaccardSim = union.size > 0 ? intersection.size / union.size : 0; // Fix division by zero

	// Weighted combination: 60% Levenshtein + 40% Jaccard
	return 0.6 * levenshteinSim + 0.4 * jaccardSim;
}

/**
 * Levenshtein distance (standard dynamic programming)
 */
function levenshteinDistance(str1: string, str2: string): number {
	const len1 = str1.length;
	const len2 = str2.length;
	const dp: number[][] = Array(len1 + 1)
		.fill(null)
		.map(() => Array(len2 + 1).fill(0));

	for (let i = 0; i <= len1; i++) dp[i]![0] = i;
	for (let j = 0; j <= len2; j++) dp[0]![j] = j;

	for (let i = 1; i <= len1; i++) {
		for (let j = 1; j <= len2; j++) {
			if (str1[i - 1] === str2[j - 1]) {
				dp[i]![j] = dp[i - 1]![j - 1]!;
			} else {
				dp[i]![j] = Math.min(
					dp[i - 1]![j]! + 1, // deletion
					dp[i]![j - 1]! + 1, // insertion
					dp[i - 1]![j - 1]! + 1, // substitution
				);
			}
		}
	}

	return dp[len1]![len2]!;
}

/**
 * Group similar pairs into duplicate clusters
 * Uses union-find to connect transitive similarities
 */
function groupSimilarPairs(
	pairs: Array<{ i: number; j: number; similarity: number }>,
	cluster: Issue[],
): Array<{ issues: Issue[]; avgSimilarity: number }> {
	// Union-Find to group transitive pairs
	const parent = Array.from({ length: cluster.length }, (_, i) => i);

	function find(x: number): number {
		if (parent[x] !== x) {
			parent[x] = find(parent[x]!); // Path compression
		}
		return parent[x]!;
	}

	function union(x: number, y: number) {
		const rootX = find(x);
		const rootY = find(y);
		if (rootX !== rootY) {
			parent[rootY] = rootX;
		}
	}

	// Unite similar pairs
	for (const { i, j } of pairs) {
		union(i, j);
	}

	// Group by root
	const groups = new Map<number, number[]>();
	for (let i = 0; i < cluster.length; i++) {
		const root = find(i);
		if (!groups.has(root)) groups.set(root, []);
		groups.get(root)!.push(i);
	}

	// Convert to issue groups with average similarity
	return Array.from(groups.values()).map((indices) => {
		const issues = indices.map((i) => cluster[i]!).filter(Boolean);

		// Compute average similarity within group
		const groupPairs = pairs.filter(
			(p) => indices.includes(p.i) && indices.includes(p.j),
		);
		const avgSimilarity =
			groupPairs.length > 0
				? groupPairs.reduce((sum, p) => sum + p.similarity, 0) /
					groupPairs.length
				: 1.0;

		return { issues, avgSimilarity };
	});
}

/**
 * Select representative issue from duplicate group
 * Prefer: higher severity/impact > more complete information
 */
function selectRepresentative(issues: Issue[]): Issue {
	if (issues.length === 0) {
		throw new Error(
			"[Deduplicator] Cannot select representative from empty issue list",
		);
	}

	if (issues.length === 1) {
		const issue = issues[0];
		if (!issue) {
			throw new Error("[Deduplicator] Issue array contains undefined element");
		}
		return issue;
	}

	// Score each issue
	const scores = issues.map((issue) => {
		let score = 0;

		// Severity/impact level
		if (issue.issueType === "error") {
			score += (issue.severity || 0) * 10; // 60-100 points
		} else {
			const impactMap: Record<string, number> = {
				High: 80,
				Medium: 50,
				Low: 30,
			};
			score += impactMap[issue.impactLevel || ""] || 0;
		}

		// Completeness
		if (issue.problem) score += 5;
		if (issue.impact) score += 5;
		if (issue.fix || issue.recommendation) score += 5;
		if (issue.snippet || issue.snippetInfo) score += 3;
		if (issue.description) score += issue.description.length / 100;

		return score;
	});

	// Return issue with highest score
	const maxScore = Math.max(...scores);
	const maxIndex = scores.indexOf(maxScore);

	if (maxIndex === -1) {
		throw new Error(
			`[Deduplicator] Failed to find max score index: scores=${scores.join(",")}`,
		);
	}

	const representative = issues[maxIndex];
	if (!representative) {
		throw new Error(
			`[Deduplicator] Representative is undefined at index ${maxIndex}, array length=${issues.length}`,
		);
	}

	return representative;
}
