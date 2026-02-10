import {
	buildMultiFilePrompt,
	buildSingleFilePrompt,
	estimateTokens,
	type FileContext,
} from "@shared/claude/prompt-builder";
import {
	parseEvaluatorResult,
	populateCrossFileSnippets,
	populateSnippets,
	separateIssuesByType,
} from "@shared/claude/response-parser";
import { DEFAULT_TIMEOUT_MS } from "@shared/constants";
import { getProvider, type IAIProvider } from "@shared/providers";
import type {
	EvaluatorFilter,
	Issue,
	StructuredError,
	Usage,
} from "@shared/types/evaluation";
import { getIssueSeverity } from "@shared/types/evaluation";
import { determineErrorCategory } from "@shared/utils/error-categorizer";
import { createLogger, runnerLogger } from "@shared/utils/logger";
import { readFile, writeFile } from "fs/promises";
import { basename, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import {
	filterFilesForEvaluator,
	getFilteringReason,
	hasFileFiltering,
} from "./config";
import {
	filterEvaluatorsByIds,
	filterEvaluatorsByType,
	getIssueTypeFromEvaluatorName,
	shouldExecuteIfNoFile,
} from "./evaluator-types";
import { logRuntimePrompt } from "./runtime-prompt-logger";

/**
 * Format token usage with cache breakdown
 */
function formatTokenUsage(usage: Usage): string {
	const cacheRead = usage.cache_read_input_tokens || 0;
	const cacheWrite = usage.cache_creation_input_tokens || 0;
	const totalInput = usage.input_tokens + cacheRead + cacheWrite;
	const parts = [`Input: ${totalInput}`];
	if (cacheRead > 0 || cacheWrite > 0) {
		parts[0] += ` (${usage.input_tokens} new, ${cacheRead} cache read, ${cacheWrite} cache write)`;
	}
	parts.push(`Output: ${usage.output_tokens}`);
	return `Token usage - ${parts.join(", ")}`;
}

// Try to import embedded prompts (available in single binary mode)
let embeddedEvaluatorPrompts: Record<string, string> | null = null;
try {
	const embedded = await import("../../embedded/prompts-assets");
	embeddedEvaluatorPrompts = embedded.evaluatorPrompts;
} catch {
	// Not in embedded mode, will use file-based prompts
}

// Get the directory where evaluator prompts are stored (file-based fallback)
const __dirname = dirname(fileURLToPath(import.meta.url));
const EVALUATORS_DIR = resolve(__dirname, "../../../prompts/evaluators");

/**
 * Load evaluator prompt content, using embedded if available
 */
async function loadEvaluatorPrompt(evaluatorPath: string): Promise<string> {
	// Extract evaluator ID from path (e.g., "content-quality" from "content-quality.md")
	const filename = basename(evaluatorPath);
	const evaluatorId = filename.replace(".md", "");

	// Try embedded prompts first
	if (embeddedEvaluatorPrompts && embeddedEvaluatorPrompts[evaluatorId]) {
		return embeddedEvaluatorPrompts[evaluatorId];
	}

	// Fall back to file-based prompts
	return readFile(evaluatorPath, "utf-8");
}

/**
 * List of evaluators in order
 */
export const EVALUATOR_FILES = [
	"content-quality.md",
	"structure-formatting.md",
	"command-completeness.md",
	"testing-validation.md",
	"code-style.md",
	"language-clarity.md",
	"git-workflow.md",
	"project-structure.md",
	"security.md",
	"completeness.md",
	"subdirectory-coverage.md",
	"context-gaps.md",
	"contradictory-instructions.md",
	"test-patterns-coverage.md",
	"database-patterns-coverage.md",
	"markdown-validity.md",
	"outdated-documentation.md",
] as const;

export interface EvaluatorResult {
	evaluator: string;
	issues: Issue[];
	error?: string;
	errors?: StructuredError[]; // Structured error information
	usage?: Usage;
	cost_usd?: number;
	duration_ms?: number;
	finalPrompt?: string;
	/** Whether this evaluator was skipped (e.g., no file mode) */
	skipped?: boolean;
	/** Reason why this evaluator was skipped */
	skipReason?: string;
}

export interface FileEvaluationResult {
	filePath: string;
	relativePath: string;
	evaluations: EvaluatorResult[];
	totalIssues: number;
	highCount: number;
	mediumCount: number;
	lowCount: number;
	totalUsage?: Usage;
	totalCost?: number;
	totalDuration?: number;
}

/**
 * Run evaluators with concurrency limit to avoid overwhelming the system
 */
async function runWithConcurrencyLimit<T, R>(
	items: T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length); // Pre-allocate array
	let activeCount = 0;
	let currentIndex = 0;

	return new Promise((resolve) => {
		const runNext = () => {
			if (currentIndex >= items.length && activeCount === 0) {
				resolve(results);
				return;
			}

			while (activeCount < limit && currentIndex < items.length) {
				const index = currentIndex++;
				const item = items[index];

				// Validate item exists
				if (item === undefined) {
					runnerLogger.error(`Item at index ${index} is undefined, skipping`);
					results[index] = new Error("Item undefined") as R;
					continue;
				}

				activeCount++;

				fn(item, index)
					.then((result) => {
						results[index] = result;
					})
					.catch((error) => {
						runnerLogger.error(`Task ${index} failed:`, error);
						results[index] = error;
					})
					.finally(() => {
						activeCount--;
						runNext();
					});
			}
		};

		runNext();
	});
}

/**
 * Run all evaluators against a single context file (AGENTS.md or CLAUDE.md) with controlled concurrency
 */
export async function runAllEvaluators(
	agentsFilePath: string,
	options: {
		verbose?: boolean;
		debug?: boolean;
		debugDir?: string;
		concurrency?: number;
		evaluators?: number;
		baseDir?: string;
		projectContext?: string;
		onProgress?: (evaluator: string, index: number, total: number) => void;
		/** Callback for retry events */
		onRetry?: (
			evaluator: string,
			attempt: number,
			maxRetries: number,
			error: string,
		) => void;
		/** Callback for timeout events */
		onTimeout?: (
			evaluator: string,
			elapsedMs: number,
			timeoutMs: number,
		) => void;
		/** When true, skip evaluators that require existing file content */
		noFileMode?: boolean;
		/** AI provider to use (defaults to claude) */
		provider?: IAIProvider;
		/** Filter evaluators by type */
		evaluatorFilter?: EvaluatorFilter;
		/** Specific evaluator IDs to run (overrides evaluatorFilter when set) */
		selectedEvaluators?: string[];
		/** Timeout per evaluator in milliseconds */
		timeout?: number;
	} = {},
): Promise<EvaluatorResult[]> {
	const {
		verbose = false,
		debug = false,
		debugDir,
		concurrency = 3,
		evaluators = 100,
		baseDir,
		projectContext,
		onProgress,
		onRetry,
		onTimeout,
		noFileMode = false,
		provider = getProvider(),
		evaluatorFilter = "all",
		selectedEvaluators,
		timeout = DEFAULT_TIMEOUT_MS,
	} = options;

	// Apply filter first, then limit by count
	const allEvaluatorFiles = EVALUATOR_FILES;
	const filteredFiles =
		selectedEvaluators && selectedEvaluators.length > 0
			? filterEvaluatorsByIds(allEvaluatorFiles, selectedEvaluators)
			: filterEvaluatorsByType(allEvaluatorFiles, evaluatorFilter);
	const selectedFiles = filteredFiles.slice(
		0,
		Math.min(evaluators, filteredFiles.length),
	);
	const evaluatorPaths = selectedFiles.map((file) =>
		resolve(EVALUATORS_DIR, file),
	);

	if (verbose) {
		runnerLogger.log(
			`Running ${evaluatorPaths.length} evaluators (filter: ${evaluatorFilter}, limit: ${evaluators}, concurrency: ${concurrency})`,
		);
	}

	// Run evaluators with concurrency limit
	const results = await runWithConcurrencyLimit(
		evaluatorPaths,
		concurrency,
		async (evaluatorPath, i) => {
			const evaluatorFilename = selectedFiles[i]!;
			const evaluatorName = evaluatorFilename.replace(".md", "");

			if (onProgress) {
				onProgress(evaluatorName, i + 1, evaluatorPaths.length);
			}

			// Check if evaluator should be skipped in no-file mode
			if (noFileMode && !shouldExecuteIfNoFile(evaluatorFilename)) {
				if (verbose) {
					runnerLogger.log(
						`Skipping ${evaluatorName} - requires existing file content`,
					);
				}
				return {
					evaluator: evaluatorName,
					issues: [],
					skipped: true,
					skipReason:
						"No context file exists and this evaluator requires existing content to evaluate",
				};
			}

			// Check if this evaluator requires file filtering
			if (hasFileFiltering(evaluatorFilename)) {
				const reason = getFilteringReason(evaluatorFilename);
				const filterBaseDir = baseDir || dirname(agentsFilePath);

				// Apply filtering to determine if this file should be evaluated
				const filteredFiles = filterFilesForEvaluator(
					evaluatorFilename,
					[agentsFilePath],
					filterBaseDir,
				);

				// If this file was filtered out, return empty result
				if (filteredFiles.length === 0) {
					if (verbose) {
						runnerLogger.log(
							`${evaluatorName} has file filtering enabled: ${reason}`,
						);
						runnerLogger.log(
							`Skipping evaluation for this file (not root-level)`,
						);
					}
					return {
						evaluator: evaluatorName,
						issues: [],
					};
				}

				if (verbose) {
					runnerLogger.log(
						`${evaluatorName} has file filtering enabled: ${reason}`,
					);
					runnerLogger.log(`File passed filtering, proceeding with evaluation`);
				}
			}

			try {
				if (verbose) {
					runnerLogger.log(`\n========================================`);
					runnerLogger.log(
						`Starting evaluator ${i + 1}/${evaluatorPaths.length}: ${evaluatorName}`,
					);
					runnerLogger.log(`========================================`);
				}

				// Read evaluator and AGENTS.md content
				let evaluatorPrompt: string;
				let agentsContent: string;

				try {
					evaluatorPrompt = await loadEvaluatorPrompt(evaluatorPath);
					agentsContent = noFileMode
						? ""
						: await readFile(agentsFilePath, "utf-8");
				} catch (error) {
					const errorMessage =
						error instanceof Error ? error.message : String(error);
					runnerLogger.error(
						`Failed to read files for ${evaluatorName}:`,
						errorMessage,
					);
					return {
						evaluator: evaluatorName,
						issues: [],
						error: `File read error: ${errorMessage}`,
					};
				}

				if (verbose) {
					runnerLogger.log(
						`Read evaluator prompt (${evaluatorPrompt.length} chars)`,
					);
					runnerLogger.log(
						`Read AGENTS.md content (${agentsContent.length} chars)`,
					);
				}

				// Build prompt with project context
				const fullPrompt = await buildSingleFilePrompt(
					evaluatorPrompt,
					agentsContent,
					projectContext,
					evaluatorName,
				);

				if (verbose) {
					runnerLogger.log(`Built final prompt: ${fullPrompt.length} chars`);
					runnerLogger.log(`Invoking ${provider.displayName}...`);
				}

				// Save prompt to debug directory if debug mode is enabled
				if (debug && debugDir) {
					const promptFile = resolve(debugDir, `${evaluatorName}-prompt.md`);
					await writeFile(promptFile, fullPrompt, "utf-8");
					if (verbose) {
						const debugLogger = createLogger("Debug");
						debugLogger.log(`Saved prompt to: ${promptFile}`);
					}
				}

				// NEW: Always log runtime prompt to persistent debug folder (blocking write)
				await logRuntimePrompt({
					evaluatorName,
					prompt: fullPrompt,
					mode: "independent",
					verbose,
				});

				// Log execution context before invoking AI agent
				runnerLogger.log(
					`[Agent] Executing evaluator: ${evaluatorName} (independent mode)`,
				);
				runnerLogger.log(
					`[Agent] Working directory: ${baseDir || process.cwd()}`,
				);

				// Invoke provider with retry logic
				const evaluatorStartTime = Date.now();
				const response = await provider.invokeWithRetry(fullPrompt, {
					verbose,
					timeout, // Configurable timeout (default: 10 minutes)
					cwd: baseDir, // Execute in the cloned repository directory
					onRetry: onRetry
						? (event) =>
								onRetry(
									evaluatorName,
									event.attempt,
									event.maxRetries,
									event.error,
								)
						: undefined,
					onTimeout: onTimeout
						? (event) =>
								onTimeout(evaluatorName, event.elapsedMs, event.timeoutMs)
						: undefined,
				});
				const evaluatorDuration = (Date.now() - evaluatorStartTime) / 1000;

				if (verbose) {
					const evaluatorLogger = createLogger("Evaluator");
					const resultPreview = response.result
						? response.result.substring(0, 1000)
						: "(empty)";
					evaluatorLogger.log(
						`Response type: ${typeof response.result}, length: ${response.result?.length ?? 0}`,
					);
					evaluatorLogger.log(
						`Raw response (first 1000 chars):\n${resultPreview}...`,
					);
				}

				// Save response to debug directory if debug mode is enabled
				if (debug && debugDir) {
					const responseFile = resolve(
						debugDir,
						`${evaluatorName}-response.json`,
					);
					await writeFile(
						responseFile,
						JSON.stringify(response, null, 2),
						"utf-8",
					);
					if (verbose) {
						const debugLogger = createLogger("Debug");
						debugLogger.log(`Saved response to: ${responseFile}`);
					}
				}

				// Parse issues from response
				if (verbose) {
					runnerLogger.log(`Parsing response for issues...`);
				}
				const parseResult = parseEvaluatorResult(response.result, verbose);

				// Add issueType to each issue based on evaluator
				const issueType = getIssueTypeFromEvaluatorName(evaluatorFilename);
				for (const issue of parseResult.issues) {
					issue.issueType = issueType;
				}

				// Populate snippets from file content
				populateSnippets(parseResult.issues, new Map(), agentsContent);

				// Enhance parsing errors with evaluator context
				const errors: StructuredError[] = parseResult.errors.map((e) => ({
					...e,
					evaluatorName: evaluatorName,
					filePath: agentsFilePath,
				}));

				// Always log evaluator completion with timing
				const evalLogger = createLogger(evaluatorName);
				evalLogger.log(`✓ Completed in ${evaluatorDuration.toFixed(1)}s`);

				if (verbose) {
					runnerLogger.log(`✓ Found ${parseResult.issues.length} issues`);
					if (errors.length > 0) {
						runnerLogger.warn(`⚠️  ${errors.length} parsing error(s) occurred`);
					}
					if (response.usage) {
						runnerLogger.log(formatTokenUsage(response.usage));
						if (response.cost_usd) {
							runnerLogger.log(`Cost: $${response.cost_usd.toFixed(4)}`);
						}
					}
					if (response.duration_ms) {
						runnerLogger.log(
							`API processing time: ${(response.duration_ms / 1000).toFixed(1)}s`,
						);
					}
				}

				return {
					evaluator: evaluatorName,
					issues: parseResult.issues,
					errors: errors.length > 0 ? errors : undefined,
					usage: response.usage,
					cost_usd: response.cost_usd,
					duration_ms: response.duration_ms,
					finalPrompt: fullPrompt,
				};
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				const isTimeout =
					errorMessage.includes("timeout") || errorMessage.includes("TIMEOUT");

				// Log with appropriate symbol and timing info
				const evalLogger = createLogger(evaluatorName);
				if (isTimeout) {
					evalLogger.log(`❌ TIMEOUT after ${(timeout / 1000).toFixed(1)}s`);
				} else {
					runnerLogger.error(`\n❌ Evaluator ${evaluatorName} FAILED`);
					runnerLogger.error(`Error: ${errorMessage}\n`);
				}
				if (verbose && error instanceof Error && error.stack) {
					runnerLogger.error(`Stack trace:\n${error.stack}`);
				}

				// Create structured error
				const structuredError: StructuredError = {
					message: errorMessage,
					category: determineErrorCategory(error),
					severity: "partial",
					evaluatorName: evaluatorName,
					filePath: agentsFilePath,
					timestamp: new Date(),
					retryable: false,
					technicalDetails: error instanceof Error ? error.stack : undefined,
				};

				return {
					evaluator: evaluatorName,
					issues: [],
					error: errorMessage,
					errors: [structuredError],
				};
			}
		},
	);

	return results;
}

/**
 * Aggregate all issues from evaluator results
 */
export function aggregateIssues(results: EvaluatorResult[]): Issue[] {
	return results.flatMap((r) => r.issues);
}

/**
 * Count issues by severity
 * Thresholds: High (8-10), Medium (6-7), Low (5)
 * Note: Evaluator prompts instruct AI to not report issues with severity ≤4
 */
export function countBySeverity(issues: Issue[]): {
	high: number;
	medium: number;
	low: number;
} {
	return {
		high: issues.filter((i) => getIssueSeverity(i) >= 8).length,
		medium: issues.filter(
			(i) => getIssueSeverity(i) >= 6 && getIssueSeverity(i) < 8,
		).length,
		low: issues.filter((i) => getIssueSeverity(i) < 6).length,
	};
}

/**
 * Create a summary of evaluation results for a file
 */
export function createFileResult(
	filePath: string,
	relativePath: string,
	evaluations: EvaluatorResult[],
): FileEvaluationResult {
	const allIssues = aggregateIssues(evaluations);
	const counts = countBySeverity(allIssues);

	// Aggregate token usage and costs
	let totalInputTokens = 0;
	let totalOutputTokens = 0;
	let totalCacheCreation = 0;
	let totalCacheRead = 0;
	let totalCost = 0;
	let totalDuration = 0;

	for (const evaluation of evaluations) {
		if (evaluation.usage) {
			totalInputTokens += evaluation.usage.input_tokens;
			totalOutputTokens += evaluation.usage.output_tokens;
			totalCacheCreation += evaluation.usage.cache_creation_input_tokens || 0;
			totalCacheRead += evaluation.usage.cache_read_input_tokens || 0;
		}
		if (evaluation.cost_usd) {
			totalCost += evaluation.cost_usd;
		}
		if (evaluation.duration_ms) {
			totalDuration += evaluation.duration_ms;
		}
	}

	return {
		filePath,
		relativePath,
		evaluations,
		totalIssues: allIssues.length,
		highCount: counts.high,
		mediumCount: counts.medium,
		lowCount: counts.low,
		totalUsage: {
			input_tokens: totalInputTokens,
			output_tokens: totalOutputTokens,
			cache_creation_input_tokens: totalCacheCreation,
			cache_read_input_tokens: totalCacheRead,
		},
		totalCost: totalCost > 0 ? totalCost : undefined,
		totalDuration: totalDuration > 0 ? totalDuration : undefined,
	};
}

// ============================================================================
// UNIFIED MULTI-FILE EVALUATION
// ============================================================================

/**
 * Multi-file context for unified evaluation
 */
export interface MultiFileContext {
	files: FileContext[];
	totalTokenEstimate: number;
}

/**
 * Result from unified multi-file evaluation
 */
export interface UnifiedEvaluationResult {
	files: Record<string, FileEvaluationResult>;
	crossFileIssues: Issue[];
	evaluatorResults: UnifiedEvaluatorResult[];
	totalUsage?: Usage;
	totalCost?: number;
	totalDuration?: number;
}

/**
 * Result from a single evaluator in unified mode
 */
export interface UnifiedEvaluatorResult {
	evaluator: string;
	perFileIssues: Record<string, Issue[]>;
	crossFileIssues: Issue[];
	error?: string;
	errors?: StructuredError[]; // Structured error information
	usage?: Usage;
	cost_usd?: number;
	duration_ms?: number;
	finalPrompt?: string;
	/** Whether this evaluator was skipped (e.g., no file mode) */
	skipped?: boolean;
	/** Reason why this evaluator was skipped */
	skipReason?: string;
}

/**
 * Default token limit for unified evaluation (100K tokens to leave room for response)
 */
export const DEFAULT_MAX_UNIFIED_TOKENS = 100000;

/**
 * Build multi-file context from file paths
 */
export async function buildMultiFileContext(
	filePaths: string[],
	getRelativePath: (path: string) => string,
): Promise<MultiFileContext> {
	const files: FileContext[] = [];
	let totalContent = "";
	const timeout = 30000; // 30 second timeout

	for (const filePath of filePaths) {
		try {
			const content = await Promise.race([
				readFile(filePath, "utf-8"),
				new Promise<never>((_, reject) =>
					setTimeout(
						() => reject(new Error(`File read timeout after ${timeout}ms`)),
						timeout,
					),
				),
			]);
			const relativePath = getRelativePath(filePath);
			files.push({ filePath, relativePath, content });
			totalContent += content;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to read ${filePath}: ${errorMessage}`);
		}
	}

	return {
		files,
		totalTokenEstimate: estimateTokens(totalContent),
	};
}

/**
 * Check if unified evaluation is viable given token limits
 */
export function canUseUnifiedMode(
	context: MultiFileContext,
	maxTokens: number = DEFAULT_MAX_UNIFIED_TOKENS,
): { viable: boolean; reason?: string } {
	if (context.totalTokenEstimate > maxTokens) {
		return {
			viable: false,
			reason: `Combined file content (~${context.totalTokenEstimate} tokens) exceeds limit (${maxTokens} tokens)`,
		};
	}
	return { viable: true };
}

/**
 * Run all evaluators against multiple context files (AGENTS.md / CLAUDE.md) in unified mode
 */
export async function runUnifiedEvaluation(
	filePaths: string[],
	getRelativePath: (path: string) => string,
	options: {
		verbose?: boolean;
		debug?: boolean;
		debugDir?: string;
		concurrency?: number;
		evaluators?: number;
		maxTokens?: number;
		baseDir?: string;
		projectContext?: string;
		onProgress?: (evaluator: string, index: number, total: number) => void;
		/** Callback for retry events */
		onRetry?: (
			evaluator: string,
			attempt: number,
			maxRetries: number,
			error: string,
		) => void;
		/** Callback for timeout events */
		onTimeout?: (
			evaluator: string,
			elapsedMs: number,
			timeoutMs: number,
		) => void;
		/** When true, skip evaluators that require existing file content */
		noFileMode?: boolean;
		/** AI provider to use (defaults to claude) */
		provider?: IAIProvider;
		/** Filter evaluators by type */
		evaluatorFilter?: EvaluatorFilter;
		/** Specific evaluator IDs to run (overrides evaluatorFilter when set) */
		selectedEvaluators?: string[];
		/** Timeout per evaluator in milliseconds */
		timeout?: number;
	} = {},
): Promise<UnifiedEvaluationResult> {
	const {
		verbose = false,
		debug = false,
		debugDir,
		concurrency = 3,
		evaluators = 100,
		maxTokens = DEFAULT_MAX_UNIFIED_TOKENS,
		baseDir,
		projectContext,
		onProgress,
		onRetry,
		onTimeout,
		noFileMode = false,
		provider = getProvider(),
		evaluatorFilter = "all",
		selectedEvaluators,
		timeout = DEFAULT_TIMEOUT_MS,
	} = options;

	// Build file context
	const context = await buildMultiFileContext(filePaths, getRelativePath);

	const unifiedLogger = createLogger("Unified");
	if (verbose) {
		unifiedLogger.log(`Building context for ${context.files.length} files`);
		unifiedLogger.log(`Total estimated tokens: ${context.totalTokenEstimate}`);
	}

	// Check if unified mode is viable
	const viability = canUseUnifiedMode(context, maxTokens);
	if (!viability.viable) {
		throw new Error(`Cannot use unified mode: ${viability.reason}`);
	}

	// Apply filter first, then limit by count
	const allEvaluatorFiles = EVALUATOR_FILES;
	const filteredFiles =
		selectedEvaluators && selectedEvaluators.length > 0
			? filterEvaluatorsByIds(allEvaluatorFiles, selectedEvaluators)
			: filterEvaluatorsByType(allEvaluatorFiles, evaluatorFilter);
	const selectedFiles = filteredFiles.slice(
		0,
		Math.min(evaluators, filteredFiles.length),
	);
	const evaluatorPaths = selectedFiles.map((file) =>
		resolve(EVALUATORS_DIR, file),
	);

	if (verbose) {
		unifiedLogger.log(
			`Running ${evaluatorPaths.length} evaluators (filter: ${evaluatorFilter}, limit: ${evaluators}, concurrency: ${concurrency})`,
		);
	}

	// Run evaluators with concurrency limit
	const evaluatorResults: UnifiedEvaluatorResult[] =
		await runWithConcurrencyLimit(
			evaluatorPaths,
			concurrency,
			async (evaluatorPath, i) => {
				const evaluatorFilename = selectedFiles[i]!;
				const evaluatorName = evaluatorFilename.replace(".md", "");

				if (onProgress) {
					onProgress(evaluatorName, i + 1, evaluatorPaths.length);
				}

				// Check if evaluator should be skipped in no-file mode
				if (noFileMode && !shouldExecuteIfNoFile(evaluatorFilename)) {
					if (verbose) {
						unifiedLogger.log(
							`Skipping ${evaluatorName} - requires existing file content`,
						);
					}
					// Initialize empty per-file issues for skipped evaluator
					const perFileIssues: Record<string, Issue[]> = {};
					for (const file of context.files) {
						perFileIssues[file.relativePath] = [];
					}
					return {
						evaluator: evaluatorName,
						perFileIssues,
						crossFileIssues: [],
						skipped: true,
						skipReason:
							"No context file exists and this evaluator requires existing content to evaluate",
					};
				}

				// Apply file filtering for this evaluator
				const filterBaseDir =
					filePaths.length > 0 && filePaths[0]
						? dirname(filePaths[0])
						: process.cwd();
				const filteredPaths = filterFilesForEvaluator(
					evaluatorFilename,
					filePaths,
					filterBaseDir,
				);

				// Log filtering if verbose
				if (verbose && hasFileFiltering(evaluatorFilename)) {
					const reason = getFilteringReason(evaluatorFilename);
					unifiedLogger.log(
						`${evaluatorName}: Filtering ${filePaths.length} → ${filteredPaths.length} files`,
					);
					unifiedLogger.log(`Reason: ${reason}`);
					unifiedLogger.log(
						`Files: ${filteredPaths.map((f) => getRelativePath(f)).join(", ")}`,
					);
				}

				// Build filtered file context for this evaluator
				const filteredContext = await buildMultiFileContext(
					filteredPaths,
					getRelativePath,
				);

				try {
					// Read evaluator prompt
					const evaluatorPrompt = await loadEvaluatorPrompt(evaluatorPath);

					// Build multi-file prompt with project context
					const fullPrompt = await buildMultiFilePrompt(
						evaluatorPrompt,
						filteredContext.files,
						projectContext,
						evaluatorName,
					);
					const tokenEstimate = estimateTokens(fullPrompt);

					if (verbose) {
						const evaluatorLogger = createLogger("Evaluator");
						evaluatorLogger.log(
							`Running multi-file evaluation: ${evaluatorPath}`,
						);
						evaluatorLogger.log(
							`Files: ${filteredContext.files.map((f) => f.relativePath).join(", ")}`,
						);
						evaluatorLogger.log(
							`Prompt length: ${fullPrompt.length} chars (~${tokenEstimate} tokens)`,
						);
					}

					// Save prompt to debug directory if debug mode is enabled
					if (debug && debugDir) {
						const promptFile = resolve(
							debugDir,
							`${evaluatorName}-unified-prompt.md`,
						);
						await writeFile(promptFile, fullPrompt, "utf-8");
						if (verbose) {
							const debugLogger = createLogger("Debug");
							debugLogger.log(`Saved unified prompt to: ${promptFile}`);
						}
					}

					// NEW: Always log runtime prompt to persistent debug folder (blocking write)
					await logRuntimePrompt({
						evaluatorName,
						prompt: fullPrompt,
						mode: "unified",
						verbose,
					});

					// Log execution context before invoking AI agent
					runnerLogger.log(
						`[Agent] Executing evaluator: ${evaluatorName} (unified mode)`,
					);
					runnerLogger.log(
						`[Agent] Working directory: ${baseDir || process.cwd()}`,
					);

					// Invoke provider with retry logic
					const evaluatorStartTime = Date.now();
					const response = await provider.invokeWithRetry(fullPrompt, {
						verbose,
						timeout, // Configurable timeout (default: 10 minutes)
						cwd: baseDir, // Execute in the cloned repository directory
						onRetry: onRetry
							? (event) =>
									onRetry(
										evaluatorName,
										event.attempt,
										event.maxRetries,
										event.error,
									)
							: undefined,
						onTimeout: onTimeout
							? (event) =>
									onTimeout(evaluatorName, event.elapsedMs, event.timeoutMs)
							: undefined,
					});
					const evaluatorDuration = (Date.now() - evaluatorStartTime) / 1000;

					if (verbose) {
						unifiedLogger.log(`\n✓ Received response from provider`);
						unifiedLogger.log(
							`Response type: ${typeof response.result}, length: ${response.result?.length ?? 0}`,
						);
						const resultPreview = response.result
							? response.result.substring(0, 500)
							: "(empty)";
						unifiedLogger.log(
							`Response preview (first 500 chars):\n${resultPreview}...`,
						);
					}

					// Save response to debug directory if debug mode is enabled
					if (debug && debugDir) {
						const responseFile = resolve(
							debugDir,
							`${evaluatorName}-unified-response.json`,
						);
						await writeFile(
							responseFile,
							JSON.stringify(response, null, 2),
							"utf-8",
						);
						if (verbose) {
							const debugLogger = createLogger("Debug");
							debugLogger.log(`Saved unified response to: ${responseFile}`);
						}
					}

					// Parse the JSON array from the result
					const parseResult = parseEvaluatorResult(response.result, verbose);

					// Add issueType to each issue based on evaluator
					const issueType = getIssueTypeFromEvaluatorName(evaluatorFilename);
					for (const issue of parseResult.issues) {
						issue.issueType = issueType;
					}

					// Enhance parsing errors with evaluator context
					const errors: StructuredError[] = parseResult.errors.map((e) => ({
						...e,
						evaluatorName: evaluatorName,
					}));

					const contentMap = new Map<string, string>();
					const basenameMap = new Map<string, string[]>(); // Track basenames to detect duplicates

					for (const file of filteredContext.files) {
						contentMap.set(file.relativePath, file.content);

						// Track basenames to detect duplicates
						const filename = file.relativePath.split("/").pop();
						if (filename) {
							if (!basenameMap.has(filename)) {
								basenameMap.set(filename, []);
							}
							basenameMap.get(filename)!.push(file.relativePath);
						}
					}

					// Warn about duplicate basenames (informational)
					if (verbose) {
						for (const [basename, fullPaths] of basenameMap) {
							if (fullPaths.length > 1) {
								const hasRootLevel = fullPaths.some((p) => !p.includes("/"));
								runnerLogger.warn(
									`ℹ️  Info: Multiple files with basename "${basename}":`,
								);
								for (const path of fullPaths) {
									const marker = !path.includes("/") ? " (default)" : "";
									runnerLogger.warn(`    - ${path}${marker}`);
								}
								if (hasRootLevel) {
									runnerLogger.warn(
										`Basename-only references (e.g., "${basename}") will use root-level file`,
									);
								} else {
									runnerLogger.warn(
										`⚠️  No root-level file found - evaluators MUST use full relative paths`,
									);
								}
							}
						}
					}

					// Use first AGENTS.md or CLAUDE.md file content as fallback
					const defaultContent = filteredContext.files.find(
						(f) =>
							f.relativePath.includes("AGENTS.md") ||
							f.relativePath.includes("CLAUDE.md"),
					)?.content;

					// Populate snippets from file content
					populateSnippets(parseResult.issues, contentMap, defaultContent);

					// Also populate cross-file snippets
					populateCrossFileSnippets(parseResult.issues, contentMap);

					// Separate per-file and cross-file issues
					const { perFileIssues, crossFileIssues } = separateIssuesByType(
						parseResult.issues,
						filteredContext.files,
					);

					// Convert Map to Record for serialization
					const perFileIssuesRecord: Record<string, Issue[]> = {};
					for (const [path, issues] of perFileIssues) {
						perFileIssuesRecord[path] = issues;
					}

					// Always log evaluator completion with timing
					const evalLogger = createLogger(evaluatorName);
					evalLogger.log(`✓ Completed in ${evaluatorDuration.toFixed(1)}s`);

					if (verbose) {
						const evaluatorLogger = createLogger("Evaluator");
						const totalPerFile = Array.from(perFileIssues.values()).reduce(
							(sum, arr) => sum + arr.length,
							0,
						);
						evaluatorLogger.log(
							`Found ${totalPerFile} per-file issues and ${crossFileIssues.length} cross-file issues`,
						);
						if (errors.length > 0) {
							evaluatorLogger.warn(
								`⚠️  ${errors.length} parsing error(s) occurred`,
							);
						}
						if (response.usage) {
							evaluatorLogger.log(formatTokenUsage(response.usage));
						}
					}

					return {
						evaluator: evaluatorName,
						perFileIssues: perFileIssuesRecord,
						crossFileIssues,
						errors: errors.length > 0 ? errors : undefined,
						usage: response.usage,
						cost_usd: response.cost_usd,
						duration_ms: response.duration_ms,
						finalPrompt: fullPrompt,
					};
				} catch (error) {
					const errorMessage =
						error instanceof Error ? error.message : String(error);
					const isTimeout =
						errorMessage.includes("timeout") ||
						errorMessage.includes("TIMEOUT");

					// Log with appropriate symbol and timing info
					const evalLogger = createLogger(evaluatorName);
					if (isTimeout) {
						evalLogger.log(`❌ TIMEOUT after ${(timeout / 1000).toFixed(1)}s`);
					} else if (verbose) {
						unifiedLogger.error(
							`Evaluator ${evaluatorName} failed: ${errorMessage}`,
						);
					}

					// Create structured error
					const structuredError: StructuredError = {
						message: errorMessage,
						category: determineErrorCategory(error),
						severity: "partial",
						evaluatorName: evaluatorName,
						timestamp: new Date(),
						retryable: false,
						technicalDetails: error instanceof Error ? error.stack : undefined,
					};

					// Initialize empty per-file issues
					const perFileIssues: Record<string, Issue[]> = {};
					for (const file of context.files) {
						perFileIssues[file.relativePath] = [];
					}

					return {
						evaluator: evaluatorName,
						perFileIssues,
						crossFileIssues: [],
						error: errorMessage,
						errors: [structuredError],
					};
				}
			},
		);

	// Aggregate results by file and collect cross-file issues
	const fileResults: Record<string, FileEvaluationResult> = {};
	const allCrossFileIssues: Issue[] = [];
	let totalInputTokens = 0;
	let totalOutputTokens = 0;
	let totalCacheCreation = 0;
	let totalCacheRead = 0;
	let totalCost = 0;
	let totalDuration = 0;

	// Initialize file results
	for (const file of context.files) {
		const fileEvaluations: EvaluatorResult[] = [];

		for (const evalResult of evaluatorResults) {
			const fileIssues = evalResult.perFileIssues[file.relativePath] || [];
			fileEvaluations.push({
				evaluator: evalResult.evaluator,
				issues: fileIssues,
				error: evalResult.error,
				// Usage is shared across all files in unified mode, so we don't include per-file usage
			});
		}

		fileResults[file.relativePath] = createFileResult(
			file.filePath,
			file.relativePath,
			fileEvaluations,
		);
	}

	// Aggregate cross-file issues and usage
	for (const evalResult of evaluatorResults) {
		allCrossFileIssues.push(
			...evalResult.crossFileIssues.map((issue) => ({
				...issue,
				evaluatorName: evalResult.evaluator,
			})),
		);

		if (evalResult.usage) {
			totalInputTokens += evalResult.usage.input_tokens;
			totalOutputTokens += evalResult.usage.output_tokens;
			totalCacheCreation += evalResult.usage.cache_creation_input_tokens || 0;
			totalCacheRead += evalResult.usage.cache_read_input_tokens || 0;
		}
		if (evalResult.cost_usd) {
			totalCost += evalResult.cost_usd;
		}
		if (evalResult.duration_ms) {
			totalDuration += evalResult.duration_ms;
		}
	}

	return {
		files: fileResults,
		crossFileIssues: allCrossFileIssues,
		evaluatorResults,
		totalUsage: {
			input_tokens: totalInputTokens,
			output_tokens: totalOutputTokens,
			cache_creation_input_tokens: totalCacheCreation,
			cache_read_input_tokens: totalCacheRead,
		},
		totalCost: totalCost > 0 ? totalCost : undefined,
		totalDuration: totalDuration > 0 ? totalDuration : undefined,
	};
}
