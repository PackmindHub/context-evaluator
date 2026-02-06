import { getProvider, type IAIProvider } from "@shared/providers";
import type {
	ICurationOutput,
	ICurationResult,
	Issue,
} from "@shared/types/evaluation";
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
const CURATION_PROMPT_PATH = resolve(
	__dirname,
	"../../../prompts/shared/impact-curation.md",
);

/**
 * Input format for the curation prompt
 */
interface ICurationInput {
	id: number;
	category: string;
	severity: number;
	problem: string;
	impact?: string;
	fix?: string;
	location: unknown;
	file?: string;
	snippet?: string; // Only included if < 50 chars
}

/**
 * Options for the impact curator
 */
export interface IImpactCuratorOptions {
	topN?: number;
	verbose?: boolean;
	timeout?: number;
	cwd?: string;
	issueTypeFilter?: "error" | "suggestion"; // New: filter by issue type
	/** AI provider to use (defaults to claude) */
	provider?: IAIProvider;
}

/**
 * Default number of issues to curate
 */
export const DEFAULT_TOP_N = 30;

/**
 * Maximum issues to send to curation prompt (token limit safety)
 */
export const MAX_ISSUES_FOR_CURATION = 150;

/**
 * Maximum snippet length to include in curation prompt
 */
const MAX_SNIPPET_LENGTH_FOR_CURATION = 50;

/**
 * Format issues for the curation prompt
 */
function formatIssuesForCuration(issues: Issue[]): ICurationInput[] {
	return issues.map((issue, index) => {
		const input: ICurationInput = {
			id: index,
			category: issue.category,
			severity: issue.issueType === "error" ? issue.severity : 0,
			problem: issue.problem || issue.description || issue.title || "",
			impact: issue.impact,
			fix: issue.fix || issue.recommendation || issue.suggestion,
			location: issue.location,
			file: Array.isArray(issue.location)
				? issue.location[0]?.file
				: issue.location?.file,
		};

		// Only include snippet if it's short enough (< 50 chars)
		if (
			issue.snippet &&
			issue.snippet.length < MAX_SNIPPET_LENGTH_FOR_CURATION
		) {
			input.snippet = issue.snippet;
		}

		return input;
	});
}

/**
 * Build the curation prompt from template and issues
 */
async function buildCurationPrompt(
	issues: ICurationInput[],
	topN: number,
): Promise<string> {
	// Try embedded prompts first (for compiled binary)
	let template: string;
	if (embeddedSharedPrompts && embeddedSharedPrompts["impact-curation"]) {
		template = embeddedSharedPrompts["impact-curation"];
	} else {
		// Fall back to file-based prompts (for development)
		const templateFile = Bun.file(CURATION_PROMPT_PATH);
		template = await templateFile.text();
	}

	// Replace template variables
	const prompt = template.replace(/\{\{TOP_N\}\}/g, String(topN));

	// Append issues as JSON
	const issuesJson = JSON.stringify(issues, null, 2);

	return `${prompt}\n\`\`\`json\n${issuesJson}\n\`\`\``;
}

/**
 * Parse the curation response
 */
function parseCurationResponse(
	result: string,
	verbose: boolean = false,
): ICurationResult | null {
	if (!result || result.trim() === "") {
		if (verbose) {
			console.warn("[ImpactCurator] Empty result received");
		}
		return null;
	}

	try {
		// Try direct JSON parse
		const parsed = JSON.parse(result.trim());
		if (parsed.curatedIssues && Array.isArray(parsed.curatedIssues)) {
			return parsed as ICurationResult;
		}
	} catch {
		// Try to extract JSON from response
		const jsonMatch = result.match(/\{[\s\S]*"curatedIssues"[\s\S]*\}/);
		if (jsonMatch) {
			try {
				return JSON.parse(jsonMatch[0]) as ICurationResult;
			} catch {
				if (verbose) {
					console.warn("[ImpactCurator] Failed to parse extracted JSON");
				}
			}
		}
	}

	if (verbose) {
		console.warn("[ImpactCurator] Could not parse curation response");
		console.warn("[ImpactCurator] Response preview:", result.substring(0, 500));
	}

	return null;
}

/**
 * Curate issues by impact
 *
 * @param allIssues - All issues from evaluators
 * @param options - Curation options
 * @returns Curation result with top issues and metadata
 */
export async function curateIssuesByImpact(
	allIssues: Issue[],
	options: IImpactCuratorOptions = {},
): Promise<ICurationResult | null> {
	const {
		topN = DEFAULT_TOP_N,
		verbose = false,
		timeout = 180000,
		cwd,
		issueTypeFilter,
		provider = getProvider(),
	} = options;

	// Filter by issue type if specified
	let issuesToProcess = allIssues;
	if (issueTypeFilter) {
		issuesToProcess = allIssues.filter(
			(issue) => issue.issueType === issueTypeFilter,
		);
		if (verbose) {
			console.log(
				`[ImpactCurator] Filtering for ${issueTypeFilter} issues: ${issuesToProcess.length}/${allIssues.length}`,
			);
		}
	}

	if (issuesToProcess.length === 0) {
		if (verbose) {
			console.log("[ImpactCurator] No issues to curate");
		}
		return {
			curatedIssues: [],
			totalIssuesReviewed: 0,
		};
	}

	// Limit issues to avoid token overflow
	const issuesToCurate = issuesToProcess.slice(0, MAX_ISSUES_FOR_CURATION);

	if (verbose) {
		console.log(
			`[ImpactCurator] Curating ${issuesToCurate.length} issues (selecting top ${topN})`,
		);
		if (issuesToProcess.length > MAX_ISSUES_FOR_CURATION) {
			console.warn(
				`[ImpactCurator] Warning: ${issuesToProcess.length - MAX_ISSUES_FOR_CURATION} issues truncated due to token limits`,
			);
		}
	}

	// Format issues for prompt
	const formattedIssues = formatIssuesForCuration(issuesToCurate);

	// Build prompt
	const prompt = await buildCurationPrompt(formattedIssues, topN);

	if (verbose) {
		console.log(`[ImpactCurator] Prompt length: ${prompt.length} chars`);
		console.log(
			`[ImpactCurator] Invoking ${provider.displayName} for curation...`,
		);
	}

	const startTime = Date.now();

	try {
		// Invoke provider
		const response = await provider.invokeWithRetry(prompt, {
			verbose,
			timeout,
			cwd, // Execute in the cloned repository directory
		});

		const duration = Date.now() - startTime;

		if (verbose) {
			console.log(
				`[ImpactCurator] Curation completed in ${(duration / 1000).toFixed(1)}s`,
			);
		}

		// Parse response
		const result = parseCurationResponse(response.result, verbose);

		if (!result) {
			console.error("[ImpactCurator] Failed to parse curation result");
			return null;
		}

		// Add usage metadata
		result.usage = response.usage;
		result.cost_usd = response.cost_usd;
		result.duration_ms = duration;

		if (verbose) {
			console.log(
				`[ImpactCurator] Selected ${result.curatedIssues.length} issues from ${result.totalIssuesReviewed} reviewed`,
			);
		}

		return result;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(`[ImpactCurator] Curation failed: ${errorMessage}`);
		return null;
	}
}

/**
 * Map curated issue indices back to original issues with curation metadata
 */
export function mapCuratedToOriginalIssues(
	curatedResult: ICurationResult,
	originalIssues: Issue[],
): ICurationOutput {
	const curatedIssues = curatedResult.curatedIssues
		.filter(
			(curated) =>
				curated.originalIndex >= 0 &&
				curated.originalIndex < originalIssues.length,
		)
		.map((curated) => {
			const original = originalIssues[curated.originalIndex]!;
			return {
				...original,
				curationReason: curated.reason,
			};
		});

	return {
		curatedIssues,
		summary: {
			totalIssuesReviewed: curatedResult.totalIssuesReviewed,
		},
	};
}
