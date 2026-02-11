#!/usr/bin/env bun

import { DEFAULT_TIMEOUT_MS } from "@shared/constants";
import { isValidProviderName, listProviders } from "@shared/providers";
import { VERSION } from "@shared/version";
import { Command } from "commander";
import { executeEvaluateCommand } from "./commands/evaluate-command";

const program = new Command();

program
	.name("agents-eval")
	.description(
		"CLI tool to evaluate AGENTS.md, CLAUDE.md, and copilot-instructions.md files using AI agents",
	)
	.version(VERSION)
	.option(
		"--host <address>",
		"Host address to bind (API mode only)",
		"localhost",
	)
	.option("--port <number>", "Port number (API mode only)", "3001");

program
	.command("evaluate")
	.description(
		"Evaluate all AGENTS.md, CLAUDE.md, and copilot-instructions.md files in the current directory or a remote repository",
	)
	.option(
		"--agent <name>",
		`AI agent to use: ${listProviders().join(", ")} (default: claude)`,
		"claude",
	)
	.option("--url <github-url>", "GitHub repository URL to clone and evaluate")
	.option(
		"--path <directory>",
		"Path to local directory to evaluate (absolute or relative)",
	)
	.option("-o, --output <file>", "Output file path", "evaluator-results.json")
	.option("-v, --verbose", "Enable verbose output")
	.option(
		"--debug",
		"Enable debug mode (saves prompts/responses to debug-output/ directory)",
	)
	.option(
		"--preserve-debug-output",
		"Preserve debug output files after successful evaluation",
	)
	.option(
		"--concurrency <number>",
		"Number of evaluators to run concurrently (default: 3)",
		"3",
	)
	.option(
		"--depth <integer>",
		"Limit directory depth for context file search (0 = root only)",
	)
	.option(
		"--evaluators <number>",
		"Number of evaluators to run (default: 12)",
		"12",
	)
	.option(
		"--evaluator-filter <type>",
		"Filter evaluators by type: all (17), errors (13), suggestions (4) (default: all)",
		"all",
	)
	.option(
		"--unified",
		"Force unified evaluation mode (all files evaluated together for cross-file detection)",
	)
	.option(
		"--independent",
		"Force independent evaluation mode (each file evaluated separately)",
	)
	.option(
		"--max-tokens <number>",
		"Maximum combined tokens for unified mode (default: 100000)",
		"100000",
	)
	.option(
		"--no-curation",
		"Disable impact curation step (shows all issues without prioritization)",
	)
	.option(
		"--top-n <number>",
		"Number of top issues to curate (default: 20)",
		"20",
	)
	.option(
		"--report <mode>",
		"Report mode: terminal (default), raw, json",
		"terminal",
	)
	.option(
		"--enable-assessment-features",
		"Enable assessment features (feedback buttons, selection basket, assessment page)",
	)
	.option(
		"--linked-docs-concurrency <number>",
		"Number of parallel AI calls for linked doc summarization (default: 3)",
		"3",
	)
	.option(
		"--timeout <ms>",
		"Timeout per evaluator in milliseconds (default: 600000 = 10 minutes)",
		String(DEFAULT_TIMEOUT_MS),
	)
	.action(async (options) => {
		// Validate agent option
		if (!isValidProviderName(options.agent)) {
			console.error(
				`Error: Invalid agent '${options.agent}'. Available agents: ${listProviders().join(", ")}`,
			);
			process.exit(1);
		}

		// Validate mutually exclusive options
		if (options.unified && options.independent) {
			console.error(
				"Error: --unified and --independent are mutually exclusive",
			);
			process.exit(1);
		}

		// Validate report mode
		const validReportModes = ["terminal", "raw", "json"];
		if (!validReportModes.includes(options.report)) {
			console.error(
				`Error: --report must be one of: ${validReportModes.join(", ")}`,
			);
			process.exit(1);
		}

		// Validate evaluator filter
		const validFilters = ["all", "errors", "suggestions"];
		if (!validFilters.includes(options.evaluatorFilter)) {
			console.error(
				`Error: --evaluator-filter must be one of: ${validFilters.join(", ")}`,
			);
			process.exit(1);
		}

		// Validate that --url and --path are mutually exclusive
		if (options.url && options.path) {
			console.error(
				"Error: --url and --path are mutually exclusive. Please specify only one.",
			);
			process.exit(1);
		}

		// Validate and resolve path if provided
		let localPath: string | undefined = undefined;
		if (options.path) {
			const { resolve, isAbsolute } = await import("path");
			const { stat } = await import("fs/promises");

			// Resolve relative paths against current working directory
			localPath = isAbsolute(options.path)
				? options.path
				: resolve(process.cwd(), options.path);

			// Validate directory exists and is accessible
			try {
				const stats = await stat(localPath!);
				if (!stats.isDirectory()) {
					console.error(
						`Error: --path must point to a directory, not a file: ${localPath}`,
					);
					process.exit(1);
				}
			} catch (err: unknown) {
				const error = err as NodeJS.ErrnoException;
				if (error.code === "ENOENT") {
					console.error(`Error: Directory does not exist: ${localPath}`);
				} else if (error.code === "EACCES") {
					console.error(
						`Error: Permission denied accessing directory: ${localPath}`,
					);
				} else {
					console.error(`Error: Cannot access directory: ${localPath}`);
				}
				process.exit(1);
			}
		}

		// Validate depth option if provided
		let depth: number | undefined = undefined;
		if (options.depth !== undefined) {
			depth = parseInt(options.depth, 10);
			if (isNaN(depth) || depth < 0) {
				console.error("Error: --depth must be a non-negative integer");
				process.exit(1);
			}
		}

		// Parse numeric options
		const concurrency = parseInt(options.concurrency, 10);
		const evaluators = parseInt(options.evaluators, 10);
		const maxTokens = parseInt(options.maxTokens, 10);
		const topN = parseInt(options.topN, 10);
		const linkedDocsConcurrency = parseInt(options.linkedDocsConcurrency, 10);
		const timeout = parseInt(options.timeout, 10);

		// Validate numeric options
		if (isNaN(concurrency) || concurrency < 1) {
			console.error("Error: --concurrency must be a positive integer");
			process.exit(1);
		}

		if (isNaN(evaluators) || evaluators < 1) {
			console.error("Error: --evaluators must be a positive integer");
			process.exit(1);
		}

		if (isNaN(maxTokens) || maxTokens < 1000) {
			console.error("Error: --max-tokens must be at least 1000");
			process.exit(1);
		}

		if (isNaN(topN) || topN < 1) {
			console.error("Error: --top-n must be a positive integer");
			process.exit(1);
		}

		if (
			isNaN(linkedDocsConcurrency) ||
			linkedDocsConcurrency < 1 ||
			linkedDocsConcurrency > 10
		) {
			console.error(
				"Error: --linked-docs-concurrency must be an integer between 1 and 10",
			);
			process.exit(1);
		}

		if (isNaN(timeout) || timeout < 10000) {
			console.error("Error: --timeout must be at least 10000 (10 seconds)");
			process.exit(1);
		}

		// Execute the evaluate command
		await executeEvaluateCommand({
			repositoryUrl: options.url,
			localPath,
			outputFile: options.output,
			verbose: options.verbose ?? false,
			debug: options.debug ?? false,
			preserveDebugOutput: options.preserveDebugOutput ?? false,
			concurrency,
			depth,
			evaluators,
			evaluatorFilter: options.evaluatorFilter,
			unified: options.unified ?? false,
			independent: options.independent ?? false,
			maxTokens,
			noCuration: options.curation === false,
			topN,
			report: options.report,
			agent: options.agent,
			enableAssessmentFeatures: options.enableAssessmentFeatures ?? false,
			linkedDocsConcurrency,
			timeout,
		});
	});

program.parse();
