import { getProvider, type IAIProvider } from "@shared/providers";
import type { Issue } from "@shared/types/evaluation";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

// Try to import embedded prompts (available in single binary mode)
let embeddedSharedPrompts: Record<string, string> | null = null;
try {
	const embedded = await import("../../embedded/prompts-assets");
	embeddedSharedPrompts = embedded.sharedPrompts;
} catch {
	// Not in embedded mode, will use file-based prompts
}

// Get directory path for file-based fallback
const __dirname = dirname(fileURLToPath(import.meta.url));
const DEDUPLICATION_PROMPT_PATH = resolve(
	__dirname,
	"../../../prompts/shared/semantic-deduplication.md",
);

/**
 * Input format for semantic deduplication
 */
interface ISemanticDeduplicationInput {
	id: number; // Index in array for tracking
	category: string;
	problem: string; // Main text to compare
	title?: string;
	file?: string;
	locationCandidate?: boolean; // Same location as other issues, low text similarity
	entityCandidate?: boolean; // Shares technology entities with other issues
	sharedEntities?: string[]; // Which entities are shared
}

/**
 * Duplicate group from AI response
 */
interface IDuplicateGroup {
	representativeIndex: number; // Which issue to keep
	duplicateIndices: number[]; // Which to remove
	reason: string; // Why they're duplicates
}

/**
 * AI deduplication response format
 */
interface ISemanticDeduplicationResponse {
	groups: IDuplicateGroup[];
}

/**
 * Semantic deduplication result
 */
export interface ISemanticDeduplicationResult {
	groups: IDuplicateGroup[];
	kept: Issue[]; // Final deduplicated list
	removed: Issue[]; // Issues marked as duplicates
	originalCount: number;
	finalCount: number;
	cost_usd?: number;
	duration_ms?: number;
}

/**
 * Options for semantic deduplication
 */
export interface ISemanticDeduplicationOptions {
	verbose?: boolean;
	provider?: IAIProvider;
	maxIssuesForAI?: number; // Default 500
	timeout?: number;
	locationCandidates?: Issue[][]; // Issues with same location but low text similarity
	entityCandidates?: Issue[][]; // Issues with shared technology entities
}

/**
 * Extract entity names from a cluster of issues
 * Used to identify which entities are shared across issues in entity candidates
 */
function extractEntitiesFromCluster(cluster: Issue[]): string[] {
	const entityCounts = new Map<string, number>();

	for (const issue of cluster) {
		const text = [
			issue.problem,
			issue.description,
			issue.title,
			issue.impact,
			issue.recommendation,
		]
			.filter(Boolean)
			.join(" ");

		const entities = new Set<string>();

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

		// Count occurrences across issues
		for (const entity of entities) {
			entityCounts.set(entity, (entityCounts.get(entity) || 0) + 1);
		}
	}

	// Return entities that appear in 2+ issues (shared entities)
	return Array.from(entityCounts.entries())
		.filter(([_, count]) => count >= 2)
		.map(([entity, _]) => entity)
		.sort();
}

/**
 * Format issues for AI deduplication prompt
 * Exported for testing
 */
export function formatIssuesForDeduplication(
	issues: Issue[],
	locationCandidates: Issue[][] = [],
	entityCandidates: Issue[][] = [],
): ISemanticDeduplicationInput[] {
	// Build set of location candidate issues for fast lookup
	const locationCandidateSet = new Set<Issue>();
	for (const cluster of locationCandidates) {
		for (const issue of cluster) {
			locationCandidateSet.add(issue);
		}
	}

	// Build entity candidate map: issue -> shared entities
	const entityCandidateMap = new Map<Issue, string[]>();
	for (const cluster of entityCandidates) {
		// Extract entity names from cluster
		const entities = extractEntitiesFromCluster(cluster);
		for (const issue of cluster) {
			entityCandidateMap.set(issue, entities);
		}
	}

	return issues.map((issue, index) => ({
		id: index,
		category: issue.category,
		problem: issue.problem || issue.description || issue.title || "",
		title: issue.title,
		file: Array.isArray(issue.location)
			? issue.location[0]?.file
			: issue.location?.file,
		locationCandidate: locationCandidateSet.has(issue),
		entityCandidate: entityCandidateMap.has(issue),
		sharedEntities: entityCandidateMap.get(issue),
	}));
}

/**
 * Build deduplication prompt from template
 */
async function buildDeduplicationPrompt(
	issues: ISemanticDeduplicationInput[],
): Promise<string> {
	// Try embedded prompts first (for compiled binary)
	let template: string;
	if (
		embeddedSharedPrompts &&
		embeddedSharedPrompts["semantic-deduplication"]
	) {
		template = embeddedSharedPrompts["semantic-deduplication"];
	} else {
		// Fall back to file-based prompts (for development)
		const templateFile = Bun.file(DEDUPLICATION_PROMPT_PATH);
		template = await templateFile.text();
	}

	const issuesJson = JSON.stringify(issues, null, 2);
	return template.replace(/\{\{ISSUES\}\}/g, issuesJson);
}

/**
 * Parse AI deduplication response
 */
function parseDeduplicationResponse(
	result: string,
	verbose: boolean = false,
): ISemanticDeduplicationResponse {
	if (!result || result.trim() === "") {
		if (verbose) {
			console.warn("[SemanticDeduplicator] Empty result received");
		}
		return { groups: [] };
	}

	try {
		// Try direct JSON parse
		const parsed = JSON.parse(result.trim());
		if (parsed.groups && Array.isArray(parsed.groups)) {
			return parsed as ISemanticDeduplicationResponse;
		}
	} catch {
		// Try to extract JSON from response
		const jsonMatch = result.match(/\{[\s\S]*"groups"[\s\S]*\}/);
		if (jsonMatch) {
			try {
				const parsed = JSON.parse(jsonMatch[0]);
				if (parsed.groups && Array.isArray(parsed.groups)) {
					return parsed as ISemanticDeduplicationResponse;
				}
			} catch {
				if (verbose) {
					console.warn("[SemanticDeduplicator] Failed to parse extracted JSON");
				}
			}
		}
	}

	if (verbose) {
		console.warn(
			"[SemanticDeduplicator] Could not parse deduplication response, returning empty groups",
		);
		console.warn(
			"[SemanticDeduplicator] Response preview:",
			result.substring(0, 500),
		);
	}

	return { groups: [] };
}

/**
 * Deduplicate issues using AI semantic analysis
 *
 * This is Phase 2 of deduplication - it should be called AFTER Phase 1 (rule-based)
 * to catch semantic duplicates that have different wording.
 *
 * @param issues - Issues to deduplicate (should already be filtered by Phase 1)
 * @param options - Deduplication options
 * @returns Deduplication result with kept/removed issues
 */
export async function deduplicateIssuesSemantic(
	issues: Issue[],
	options: ISemanticDeduplicationOptions = {},
): Promise<ISemanticDeduplicationResult> {
	const {
		verbose = false,
		provider = getProvider(),
		maxIssuesForAI = 500,
		timeout = 180000,
	} = options;

	if (issues.length === 0) {
		if (verbose) {
			console.log("[SemanticDeduplicator] No issues to deduplicate");
		}
		return {
			groups: [],
			kept: [],
			removed: [],
			originalCount: 0,
			finalCount: 0,
		};
	}

	// Limit issues to avoid token overflow
	const issuesToProcess = issues.slice(0, maxIssuesForAI);

	if (verbose) {
		console.log(
			`[SemanticDeduplicator] Processing ${issuesToProcess.length} issues for semantic deduplication`,
		);
		if (issues.length > maxIssuesForAI) {
			console.warn(
				`[SemanticDeduplicator] Warning: ${issues.length - maxIssuesForAI} issues truncated due to token limits`,
			);
		}
	}

	// Format and build prompt
	const formattedIssues = formatIssuesForDeduplication(
		issuesToProcess,
		options.locationCandidates,
		options.entityCandidates,
	);
	const prompt = await buildDeduplicationPrompt(formattedIssues);

	if (verbose) {
		console.log(`[SemanticDeduplicator] Prompt length: ${prompt.length} chars`);
		console.log(
			`[SemanticDeduplicator] Invoking ${provider.displayName} for semantic analysis...`,
		);
	}

	const startTime = Date.now();

	try {
		// Call AI provider with deterministic settings
		const response = await provider.invokeWithRetry(prompt, {
			verbose,
			timeout,
		});

		const duration_ms = Date.now() - startTime;

		if (verbose) {
			console.log(
				`[SemanticDeduplicator] Semantic analysis completed in ${(duration_ms / 1000).toFixed(1)}s`,
			);
		}

		// Parse response
		const parsed = parseDeduplicationResponse(response.result, verbose);

		// Build kept/removed sets
		const removedIndices = new Set(
			parsed.groups.flatMap((g) => g.duplicateIndices),
		);
		const kept = issues.filter((_, idx) => !removedIndices.has(idx));
		const removed = issues.filter((_, idx) => removedIndices.has(idx));

		if (verbose) {
			console.log(
				`[SemanticDeduplicator] Found ${parsed.groups.length} duplicate groups, removing ${removed.length} issues`,
			);
		}

		return {
			groups: parsed.groups,
			kept,
			removed,
			originalCount: issues.length,
			finalCount: kept.length,
			cost_usd: response.cost_usd,
			duration_ms,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(
			`[SemanticDeduplicator] Semantic deduplication failed: ${errorMessage}`,
		);

		// Return all issues unchanged on failure
		return {
			groups: [],
			kept: issues,
			removed: [],
			originalCount: issues.length,
			finalCount: issues.length,
		};
	}
}
