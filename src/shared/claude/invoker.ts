import { DEFAULT_TIMEOUT_MS } from "@shared/constants";
import type { Usage } from "@shared/types/evaluation";

export interface ClaudeInvokeOptions {
	verbose?: boolean;
	timeout?: number;
}

export interface ClaudeResponse {
	result: string;
	session_id?: string;
	cost_usd?: number;
	duration_ms?: number;
	usage?: Usage;
}

/**
 * Invoke Claude Code CLI with a prompt using Bun.spawn for direct invocation
 * This replaces the bash script generation approach
 */
export async function invokeClaudeCLI(
	prompt: string,
	options: ClaudeInvokeOptions = {},
): Promise<ClaudeResponse> {
	const { verbose = false, timeout = DEFAULT_TIMEOUT_MS } = options;

	const args = [
		"--output-format",
		"json",
		"--no-session-persistence", // Prevent session file writes which can fail in sandboxes
	];

	// Log details if in verbose mode (but don't pass --verbose to Claude CLI as it corrupts JSON output)
	if (verbose) {
		console.log(`\n[Claude] Starting API call...`);
		console.log(`[Claude] Prompt length: ${prompt.length} chars`);
		console.log(
			`[Claude] Timeout: ${timeout}ms (${(timeout / 1000).toFixed(1)}s)`,
		);
		console.log(
			`[Claude] Command: claude --output-format json --no-session-persistence (prompt via stdin)`,
		);
		console.log(`[Claude] Spawning process...`);
	}

	const startTime = Date.now();

	// Use Bun.spawn with proper async handling
	const proc = Bun.spawn(["claude", ...args], {
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
		env: process.env,
	});

	// Write prompt to stdin and close the stream
	proc.stdin.write(prompt);
	await proc.stdin.end();

	if (verbose) {
		console.log(`[Claude] Process spawned (PID: ${proc.pid})`);
		console.log(`[Claude] Wrote ${prompt.length} chars to stdin`);
		console.log(`[Claude] Waiting for response...`);
	}

	// Progress indicator for long operations
	let progressInterval: Timer | undefined;
	if (verbose) {
		progressInterval = setInterval(() => {
			const elapsed = Date.now() - startTime;
			const remaining = timeout - elapsed;
			console.log(
				`[Claude] Still waiting... ${(elapsed / 1000).toFixed(1)}s elapsed, ${(remaining / 1000).toFixed(1)}s remaining`,
			);
		}, 5000); // Update every 5 seconds
	}

	// Set up timeout
	const timeoutPromise = new Promise<never>((_, reject) => {
		setTimeout(() => {
			if (progressInterval) clearInterval(progressInterval);
			proc.kill();
			const elapsed = Date.now() - startTime;
			console.error(
				`\n[Claude] ❌ TIMEOUT after ${(elapsed / 1000).toFixed(1)}s`,
			);
			reject(
				new Error(
					`Claude CLI timed out after ${timeout}ms (${(timeout / 1000).toFixed(1)}s). The prompt may be too large or Claude is taking too long to respond.`,
				),
			);
		}, timeout);
	});

	try {
		// Read stdout and stderr using Bun's text() method
		const [stdout, stderr, exitCode] = await Promise.race([
			Promise.all([
				new Response(proc.stdout).text(),
				new Response(proc.stderr).text(),
				proc.exited,
			]),
			timeoutPromise,
		]);

		// Clear progress indicator
		if (progressInterval) clearInterval(progressInterval);

		const elapsed = Date.now() - startTime;
		if (verbose) {
			console.log(
				`[Claude] Process exited with code ${exitCode} after ${(elapsed / 1000).toFixed(1)}s`,
			);
			console.log(
				`[Claude] stdout size: ${(stdout.length / 1024).toFixed(1)} KB`,
			);
			if (stderr) {
				console.log(
					`[Claude] stderr size: ${(stderr.length / 1024).toFixed(1)} KB`,
				);
			}
		}

		// Check exit code
		if (exitCode !== 0) {
			let exitCodeExplanation = "";
			if (exitCode === 143) {
				exitCodeExplanation =
					" (SIGTERM - process was terminated, possibly by timeout or user interrupt)";
			} else if (exitCode === 137) {
				exitCodeExplanation =
					" (SIGKILL - process was forcefully killed, possibly out of memory)";
			} else if (exitCode === 130) {
				exitCodeExplanation = " (SIGINT - interrupted by user Ctrl+C)";
			} else if (exitCode === 1) {
				exitCodeExplanation = " (general error)";
			}

			const errorDetails = [
				`Claude CLI exited with code ${exitCode}${exitCodeExplanation}`,
				stderr ? `stderr: ${stderr.trim()}` : null,
				stdout ? `stdout preview: ${stdout.substring(0, 500)}` : "(no stdout)",
			]
				.filter(Boolean)
				.join("\n");
			throw new Error(errorDetails);
		}

		try {
			// Parse Claude's JSON response
			const parsed = JSON.parse(stdout);
			if (verbose) {
				console.log(`[Claude] ✓ Successfully parsed JSON response`);
				console.log(
					`[Claude] Response size: ${(stdout.length / 1024).toFixed(1)} KB`,
				);
			}

			// Handle case where Claude returns array directly (evaluator responses)
			// instead of the standard {result: "...", type: "result", ...} format
			if (Array.isArray(parsed)) {
				if (verbose) {
					console.log(
						`[Claude] Response is a direct JSON array (${parsed.length} items), wrapping in result field`,
					);
				}
				return { result: JSON.stringify(parsed) };
			}

			// Handle standard Claude CLI response format with result field
			if (verbose) {
				console.log(
					`[Claude] Response has 'result' field: ${parsed.result !== undefined}`,
				);
				if (parsed.result !== undefined) {
					console.log(
						`[Claude] Result type: ${typeof parsed.result}, length: ${parsed.result?.length ?? 0}`,
					);
				}
			}

			// Map Claude CLI response fields to our interface
			// Claude CLI returns 'total_cost_usd' and 'duration_ms' at the top level
			const response: ClaudeResponse = {
				result: parsed.result,
				session_id: parsed.session_id,
				cost_usd: parsed.total_cost_usd, // Map total_cost_usd -> cost_usd
				duration_ms: parsed.duration_ms,
				usage: parsed.usage,
			};
			return response;
		} catch {
			// If not JSON, return raw output wrapped in a response object
			if (verbose) {
				console.log(
					`[Claude] ⚠️  Response is not JSON, treating as raw text (length: ${stdout.length})`,
				);
			}
			return { result: stdout };
		}
	} catch (err) {
		// Clear progress indicator
		if (progressInterval) clearInterval(progressInterval);

		// Check for common issues
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes("ENOENT")) {
			throw new Error(
				`Claude CLI not found. Is 'claude' installed and in your PATH? Original error: ${message}`,
			);
		} else if (message.includes("EACCES")) {
			throw new Error(
				`Permission denied when running Claude CLI. Check file permissions. Original error: ${message}`,
			);
		} else {
			throw err;
		}
	}
}

/**
 * Invoke Claude CLI with retry logic for transient failures
 */
export async function invokeClaudeWithRetry(
	prompt: string,
	options: ClaudeInvokeOptions & { maxRetries?: number } = {},
): Promise<ClaudeResponse> {
	const { maxRetries = 3, ...invokeOptions } = options;

	for (let i = 0; i < maxRetries; i++) {
		try {
			return await invokeClaudeCLI(prompt, invokeOptions);
		} catch (error) {
			const isLastAttempt = i === maxRetries - 1;
			const errorMessage =
				error instanceof Error ? error.message : String(error);

			// Don't retry on certain errors
			if (
				errorMessage.includes("not found") ||
				errorMessage.includes("Permission denied") ||
				errorMessage.includes("E2BIG")
			) {
				throw error;
			}

			if (isLastAttempt) {
				throw error;
			}

			if (options.verbose) {
				console.log(
					`[Claude] Attempt ${i + 1} failed, retrying in ${1000 * (i + 1)}ms...`,
				);
			}

			// Exponential backoff
			await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
		}
	}

	throw new Error("Should not reach here");
}
