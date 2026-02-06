import { DEFAULT_TIMEOUT_MS } from "@shared/constants";
import { EvaluationEngine } from "@shared/evaluation/engine";
import type { ProviderName } from "@shared/providers";
import type {
	EvaluatorFilter,
	IEvaluationRequest,
	ProgressEvent,
} from "@shared/types/evaluation";
import { mkdir, writeFile } from "fs/promises";
import { resolve } from "path";
import { buildJsonReport, buildRawReport } from "../output/report-formatters";
import { displayProgress, displayResults } from "../output/terminal-formatter";

export type ReportMode = "terminal" | "raw" | "json";

export interface EvaluateCommandOptions {
	repositoryUrl?: string;
	localPath?: string;
	outputFile?: string;
	verbose?: boolean;
	debug?: boolean;
	concurrency?: number;
	depth?: number;
	evaluators?: number;
	evaluatorFilter?: EvaluatorFilter;
	unified?: boolean;
	independent?: boolean;
	maxTokens?: number;
	noCuration?: boolean;
	topN?: number;
	report?: ReportMode;
	/** AI agent to use (defaults to claude) */
	agent?: ProviderName;
	preserveDebugOutput?: boolean;
	enableAssessmentFeatures?: boolean;
	/** Number of parallel AI calls for linked doc summarization (default: 3) */
	linkedDocsConcurrency?: number;
	/** Timeout per evaluator in milliseconds (default: 600000 = 10 minutes) */
	timeout?: number;
}

/**
 * Execute the evaluate command using the shared evaluation engine
 */
export async function executeEvaluateCommand(
	options: EvaluateCommandOptions,
): Promise<void> {
	const {
		repositoryUrl,
		localPath: initialLocalPath,
		outputFile = "evaluator-results.json",
		verbose = false,
		debug = false,
		concurrency = 3,
		depth,
		evaluators = 12,
		evaluatorFilter = "all",
		unified,
		independent,
		maxTokens = 100000,
		noCuration = false,
		topN = 20,
		report = "terminal",
		agent,
		preserveDebugOutput = false,
		enableAssessmentFeatures = false,
		linkedDocsConcurrency = 3,
		timeout = DEFAULT_TIMEOUT_MS,
	} = options;

	// Validate inputs
	let localPath = initialLocalPath;
	if (!repositoryUrl && !localPath) {
		localPath = process.cwd();
	}

	if (repositoryUrl && localPath) {
		throw new Error("Cannot specify both --url and local path. Choose one.");
	}

	// Build evaluation request
	const request: IEvaluationRequest = {
		repositoryUrl,
		localPath: localPath || process.cwd(),
		options: {
			verbose,
			debug,
			preserveDebugOutput,
			concurrency,
			depth,
			evaluators,
			evaluatorFilter,
			evaluationMode: unified
				? "unified"
				: independent
					? "independent"
					: undefined,
			maxTokens,
			curation: {
				enabled: !noCuration,
				topN,
			},
			provider: agent,
			enableAssessmentFeatures,
			linkedDocsConcurrency,
			timeout,
		},
	};

	// Progress callback for terminal output (suppressed for non-terminal modes)
	const terminalProgressCallback = (event: ProgressEvent) => {
		// biome-ignore lint/suspicious/noExplicitAny: ProgressEvent.data is typed as unknown
		const data = event.data as any;
		switch (event.type) {
			case "job.started":
				displayProgress(
					`Starting ${data.evaluationMode} evaluation for ${data.totalFiles} file(s)...`,
					"info",
				);
				break;

			case "file.started":
				displayProgress(
					`Evaluating: ${data.filePath} (${data.fileIndex}/${data.totalFiles})`,
					"info",
				);
				break;

			case "evaluator.progress":
				if (verbose) {
					const fileInfo = data.currentFile ? ` [${data.currentFile}]` : "";
					displayProgress(
						`Running evaluator ${data.evaluatorIndex}/${data.totalEvaluators}: ${data.evaluatorName}${fileInfo}`,
						"info",
					);
				}
				break;

			case "file.completed":
				displayProgress(
					`✓ Completed: ${data.filePath} (${data.totalIssues} issues found)`,
					"success",
				);
				break;

			case "curation.started":
				displayProgress(
					`Curating top ${topN} issues from ${data.totalIssues} total...`,
					"info",
				);
				break;

			case "curation.completed":
				displayProgress(
					`✓ Impact curation completed (${data.curatedCount} issues selected)`,
					"success",
				);
				break;

			case "job.failed":
				displayProgress(`Evaluation failed: ${data.error.message}`, "error");
				break;
		}
	};

	// Suppress progress output for non-terminal modes
	const progressCallback =
		report === "terminal" ? terminalProgressCallback : undefined;

	try {
		// Only show startup message for terminal mode
		if (report === "terminal") {
			console.log("\n🚀 Starting AGENTS.md evaluation...\n");
		}

		// Create evaluation engine and execute
		const engine = new EvaluationEngine();
		const result = await engine.execute(request, progressCallback);

		// Handle output based on report mode
		const outputPath = resolve(process.cwd(), outputFile);
		const outputDir = resolve(outputPath, "..");

		switch (report) {
			case "terminal":
				// Display results to terminal
				displayResults(result);

				// Write results to file
				await mkdir(outputDir, { recursive: true });
				await writeFile(outputPath, JSON.stringify(result, null, 2), "utf-8");
				displayProgress(`Results saved to: ${outputPath}`, "success");
				break;

			case "raw": {
				// Output minimal JSON to stdout for piping
				const rawReport = buildRawReport(result);
				console.log(JSON.stringify(rawReport, null, 2));
				break;
			}

			case "json": {
				// Write comprehensive JSON report to file
				const jsonReport = buildJsonReport(result);
				await mkdir(outputDir, { recursive: true });
				await writeFile(
					outputPath,
					JSON.stringify(jsonReport, null, 2),
					"utf-8",
				);
				console.log(`JSON report saved to: ${outputPath}`);
				break;
			}
		}

		// Exit with appropriate code
		const hasIssues = (result.metadata.totalIssues ?? 0) > 0;
		const hasHighSeverity = (result.metadata.highCount ?? 0) > 0;

		if (hasHighSeverity) {
			if (report === "terminal") {
				console.log(
					`\n${result.metadata.highCount} high severity issue(s) found. Please address them.\n`,
				);
			}
			process.exit(1);
		} else if (hasIssues) {
			if (report === "terminal") {
				console.log(
					`\n${result.metadata.totalIssues} issue(s) found. Review recommended.\n`,
				);
			}
			process.exit(0);
		} else {
			if (report === "terminal") {
				console.log("\n✨ No issues found! Great work!\n");
			}
			process.exit(0);
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		if (report === "terminal") {
			displayProgress(`Error: ${errorMessage}`, "error");
		} else {
			// For raw/json modes, output error as JSON to stderr
			console.error(JSON.stringify({ error: errorMessage }));
		}

		if (verbose && error instanceof Error && error.stack) {
			console.error("\nStack trace:");
			console.error(error.stack);
		}

		process.exit(1);
	}
}
