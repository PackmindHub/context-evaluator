#!/usr/bin/env bun

/**
 * Main entry point for context-evaluator
 * Routes to either CLI mode or API mode based on arguments
 */

const args = process.argv.slice(2);

// Determine mode based on first argument
const mode = args[0];

if (mode === "api") {
	// API mode - start the web server
	// Parse CLI options for API mode (--host, --port, --cloud, --daily-limit)
	let hostname = process.env.HOST ?? "localhost";
	let port = Number(process.env.PORT) || 3001;
	let cloudMode = process.env.CLOUD_MODE === "true";
	let dailyGitEvalLimit = process.env.DAILY_GIT_EVAL_LIMIT
		? Number(process.env.DAILY_GIT_EVAL_LIMIT)
		: 50;

	// Parse --host, --port, --cloud, and --daily-limit flags from command line
	for (let i = 1; i < args.length; i++) {
		if (args[i] === "--host" && args[i + 1]) {
			hostname = args[i + 1]!;
			i++; // Skip the next argument
		} else if (args[i] === "--port" && args[i + 1]) {
			const parsedPort = Number(args[i + 1]);
			if (!isNaN(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
				port = parsedPort;
			} else {
				console.error(`Error: Invalid port number: ${args[i + 1]}`);
				process.exit(1);
			}
			i++; // Skip the next argument
		} else if (args[i] === "--cloud") {
			cloudMode = true;
		} else if (args[i] === "--daily-limit" && args[i + 1]) {
			const parsed = Number(args[i + 1]);
			if (!isNaN(parsed) && parsed > 0) {
				dailyGitEvalLimit = parsed;
			} else {
				console.error(`Error: Invalid daily limit: ${args[i + 1]}`);
				process.exit(1);
			}
			i++; // Skip the next argument
		}
	}

	// Default to port 3001 to avoid conflict with frontend server (port 3000)
	const { startAPIServer } = await import("./api/index.ts");
	await startAPIServer({
		port,
		hostname,
		maxConcurrentJobs: process.env.MAX_CONCURRENT_JOBS
			? Number(process.env.MAX_CONCURRENT_JOBS)
			: undefined,
		maxQueueSize: process.env.MAX_QUEUE_SIZE
			? Number(process.env.MAX_QUEUE_SIZE)
			: undefined,
		enableAssessmentFeatures:
			process.env.ENABLE_ASSESSMENT_FEATURES === "true" || false,
		cloudMode,
		dailyGitEvalLimit,
	});
} else if (mode === "cli") {
	// CLI mode - pass control to CLI entry point
	// Remove 'cli' from args and pass the rest to the CLI
	process.argv = [process.argv[0]!, process.argv[1]!, ...args.slice(1)];

	// Import and run CLI
	import("./cli/index.ts");
} else {
	// Default to CLI mode if no mode specified or unrecognized mode
	console.log("Usage:");
	console.log(
		"  bun run src/index.ts cli [command] [options]  # Run in CLI mode",
	);
	console.log(
		"  bun run src/index.ts api                       # Run in API mode (web server)",
	);
	console.log("");
	console.log("Examples:");
	console.log("  bun run src/index.ts cli evaluate --claude");
	console.log(
		"  bun run src/index.ts cli evaluate --claude --url https://github.com/...",
	);
	console.log("");
	console.log("For CLI help:");
	console.log("  bun run src/index.ts cli --help");
	console.log("");
	process.exit(1);
}
