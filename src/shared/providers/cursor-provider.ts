/**
 * Cursor CLI Provider
 * Implements the AI provider interface for Cursor Agent CLI
 */

import { DEFAULT_TIMEOUT_MS } from "@shared/constants";
import type { Usage } from "@shared/types/evaluation";
import { BaseProvider } from "./base-provider";
import { checkCliAvailability } from "./cli-checker";
import type {
	IProviderInvokeOptions,
	IProviderResponse,
	ProviderName,
} from "./types";

/**
 * Cursor CLI response format
 * Note: Actual format may vary - implementation includes flexible field mapping
 */
interface CursorCLIResponse {
	result?: string;
	output?: string;
	response?: string;
	content?: string;
	session_id?: string;
	sessionId?: string;
	cost?: number;
	total_cost?: number;
	cost_usd?: number;
	duration_ms?: number;
	duration?: number;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
	};
}

/**
 * Cursor CLI provider implementation
 */
export class CursorProvider extends BaseProvider {
	readonly name: ProviderName = "cursor";
	readonly displayName = "Cursor Agent";

	/**
	 * Check if Cursor Agent CLI is available
	 */
	async isAvailable(): Promise<boolean> {
		return checkCliAvailability("agent", ["--version"], this.displayName);
	}

	/**
	 * Invoke Cursor Agent CLI with a prompt
	 */
	async invoke(
		prompt: string,
		options: IProviderInvokeOptions = {},
	): Promise<IProviderResponse> {
		const {
			verbose = false,
			timeout = DEFAULT_TIMEOUT_MS,
			cwd,
			writeMode = false,
		} = options;

		// Cursor CLI command format: agent -p --output-format json
		// Note: prompt is passed via stdin to avoid E2BIG errors on large prompts
		const args = ["-p", "--output-format", "json"];

		if (writeMode) {
			args.push("--dangerously-skip-permissions");
		}

		if (verbose) {
			console.log(`\n[${this.displayName}] Starting API call...`);
			console.log(
				`[${this.displayName}] Prompt length: ${prompt.length} chars`,
			);
			console.log(
				`[${this.displayName}] Timeout: ${timeout}ms (${(timeout / 1000).toFixed(1)}s)`,
			);
			if (cwd) {
				console.log(`[${this.displayName}] Working directory: ${cwd}`);
			}
			console.log(
				`[${this.displayName}] Command: agent -p --output-format json (prompt via stdin)`,
			);
			console.log(`[${this.displayName}] Spawning process...`);
		}

		const startTime = Date.now();

		const proc = Bun.spawn(["agent", ...args], {
			stdin: "pipe",
			stdout: "pipe",
			stderr: "pipe",
			env: process.env,
			cwd: cwd || process.cwd(),
		});

		if (verbose) {
			console.log(`[${this.displayName}] Process spawned (PID: ${proc.pid})`);
		}

		// Write prompt to stdin and close the stream
		proc.stdin.write(prompt);
		await proc.stdin.end();

		if (verbose) {
			console.log(
				`[${this.displayName}] Wrote ${prompt.length} chars to stdin`,
			);
			console.log(`[${this.displayName}] Waiting for response...`);
		}

		// Progress indicator for long operations
		let progressInterval: ReturnType<typeof setInterval> | undefined;
		if (verbose) {
			progressInterval = setInterval(() => {
				const elapsed = Date.now() - startTime;
				const remaining = timeout - elapsed;
				console.log(
					`[${this.displayName}] Still waiting... ${(elapsed / 1000).toFixed(1)}s elapsed, ${(remaining / 1000).toFixed(1)}s remaining`,
				);
			}, 5000);
		}

		// Set up timeout
		const timeoutPromise = this.createTimeoutPromise<[string, string, number]>(
			timeout,
			() => {
				if (progressInterval) clearInterval(progressInterval);
				proc.kill();
			},
			startTime,
		);

		try {
			const [stdout, stderr, exitCode] = await Promise.race([
				Promise.all([
					new Response(proc.stdout).text(),
					new Response(proc.stderr).text(),
					proc.exited,
				]),
				timeoutPromise,
			]);

			if (progressInterval) clearInterval(progressInterval);

			const elapsed = Date.now() - startTime;
			if (verbose) {
				console.log(
					`[${this.displayName}] Process exited with code ${exitCode} after ${(elapsed / 1000).toFixed(1)}s`,
				);
				console.log(
					`[${this.displayName}] stdout size: ${(stdout.length / 1024).toFixed(1)} KB`,
				);
				if (stderr) {
					console.log(
						`[${this.displayName}] stderr size: ${(stderr.length / 1024).toFixed(1)} KB`,
					);
				}

				// Enhanced debugging when stdout is empty
				if (stdout.length === 0) {
					console.log(
						`[${this.displayName}] ⚠️  WARNING: stdout is completely empty (0 bytes)`,
					);
				} else {
					// Show first 200 chars of stdout for debugging
					const preview = stdout.substring(0, 200).replace(/\n/g, "\\n");
					console.log(
						`[${this.displayName}] stdout preview: ${preview}${stdout.length > 200 ? "..." : ""}`,
					);
				}

				// Show stderr content if present
				if (stderr && stderr.length > 0) {
					const stderrPreview = stderr.substring(0, 500).replace(/\n/g, "\\n");
					console.log(
						`[${this.displayName}] stderr content: ${stderrPreview}${stderr.length > 500 ? "..." : ""}`,
					);
				}
			}

			if (exitCode !== 0) {
				const exitCodeExplanation = this.getExitCodeExplanation(exitCode);
				const errorDetails = [
					`${this.displayName} CLI exited with code ${exitCode}${exitCodeExplanation}`,
					stderr ? `stderr: ${stderr.trim()}` : null,
					stdout
						? `stdout preview: ${stdout.substring(0, 500)}`
						: "(no stdout)",
				]
					.filter(Boolean)
					.join("\n");
				throw new Error(errorDetails);
			}

			// Check for the common issue: stderr has content but stdout is empty
			if (stdout.length === 0 && stderr.length > 0) {
				if (verbose) {
					console.log(
						`[${this.displayName}] ⚠️  DIAGNOSTIC: stdout is empty but stderr has ${stderr.length} bytes`,
					);
					console.log(
						`[${this.displayName}] This may indicate Cursor is outputting to stderr instead of stdout`,
					);
					console.log(
						`[${this.displayName}] Or the command may not support --output-format json properly`,
					);
				}
			}

			return this.parseJsonResponse(stdout, verbose);
		} catch (err) {
			if (progressInterval) clearInterval(progressInterval);

			const message = err instanceof Error ? err.message : String(err);
			if (message.includes("ENOENT")) {
				throw new Error(
					`Cursor Agent CLI not found. Is 'agent' command installed and in your PATH? Original error: ${message}`,
				);
			} else if (message.includes("EACCES")) {
				throw new Error(
					`Permission denied when running Cursor Agent CLI. Check file permissions. Original error: ${message}`,
				);
			} else if (message.includes("E2BIG")) {
				throw new Error(
					`Prompt too large for Cursor Agent CLI. The prompt exceeds OS argument size limits. ` +
						`For large evaluations, consider using --agent claude instead. Original error: ${message}`,
				);
			}
			throw err;
		}
	}

	/**
	 * Normalize Cursor CLI response to standard format
	 * Handles multiple possible field name variations since actual format is unknown
	 */
	protected normalizeResponse(parsed: unknown): IProviderResponse {
		// Handle case where Cursor returns array directly (for evaluator results)
		if (Array.isArray(parsed)) {
			return { result: JSON.stringify(parsed) };
		}

		const cursorResponse = parsed as CursorCLIResponse;

		// Cursor may use different field names - handle various possibilities
		// Prefer: result > output > response > content
		const result =
			cursorResponse.result ??
			cursorResponse.output ??
			cursorResponse.response ??
			cursorResponse.content ??
			"";

		// Session ID variations
		const session_id =
			cursorResponse.session_id ?? cursorResponse.sessionId ?? undefined;

		// Cost variations
		const cost_usd =
			cursorResponse.cost_usd ??
			cursorResponse.cost ??
			cursorResponse.total_cost ??
			undefined;

		// Duration variations
		const duration_ms =
			cursorResponse.duration_ms ?? cursorResponse.duration ?? undefined;

		// Normalize usage format - handle both OpenAI and Anthropic style field names
		let usage: Usage | undefined;
		if (cursorResponse.usage) {
			const inputTokens =
				cursorResponse.usage.input_tokens ??
				cursorResponse.usage.prompt_tokens ??
				0;
			const outputTokens =
				cursorResponse.usage.output_tokens ??
				cursorResponse.usage.completion_tokens ??
				0;

			usage = {
				input_tokens: inputTokens,
				output_tokens: outputTokens,
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 0,
			};
		}

		return {
			result,
			session_id,
			cost_usd,
			duration_ms,
			usage,
		};
	}
}
