/**
 * Claude Code CLI Provider
 * Implements the AI provider interface for Claude Code CLI
 */

import { DEFAULT_TIMEOUT_MS } from "@shared/constants";
import type { Usage } from "@shared/types/evaluation";
import { claudeLogger } from "@shared/utils/logger";
import { BaseProvider } from "./base-provider";
import { checkCliAvailability } from "./cli-checker";
import type {
	IProviderInvokeOptions,
	IProviderResponse,
	ProviderName,
} from "./types";

/**
 * Claude CLI response format
 */
interface ClaudeCLIResponse {
	result?: string;
	session_id?: string;
	total_cost_usd?: number;
	duration_ms?: number;
	usage?: Usage;
}

/**
 * Claude Code CLI provider implementation
 */
export class ClaudeProvider extends BaseProvider {
	readonly name: ProviderName = "claude";
	readonly displayName = "Claude Code";

	/**
	 * Check if Claude CLI is available
	 */
	async isAvailable(): Promise<boolean> {
		return checkCliAvailability("claude", ["--version"], this.displayName);
	}

	/**
	 * Invoke Claude CLI with a prompt
	 */
	async invoke(
		prompt: string,
		options: IProviderInvokeOptions = {},
	): Promise<IProviderResponse> {
		const { verbose = false, timeout = DEFAULT_TIMEOUT_MS, cwd } = options;

		// Note: prompt is passed via stdin to avoid E2BIG errors on large prompts
		const args = [
			"-p",
			"--output-format",
			"json",
			"--no-session-persistence",
			"--disable-slash-commands",
		];

		if (verbose) {
			claudeLogger.log(`\nStarting API call...`);
			claudeLogger.log(`Prompt length: ${prompt.length} chars`);
			claudeLogger.log(
				`Timeout: ${timeout}ms (${(timeout / 1000).toFixed(1)}s)`,
			);
			if (cwd) {
				claudeLogger.log(`Working directory: ${cwd}`);
			}
			claudeLogger.log(
				`Command: claude -p --output-format json --no-session-persistence (prompt via stdin)`,
			);
			claudeLogger.log(`Spawning process...`);
		}

		const startTime = Date.now();

		const proc = Bun.spawn(["claude", ...args], {
			stdin: "pipe",
			stdout: "pipe",
			stderr: "pipe",
			env: process.env,
			cwd: cwd || process.cwd(),
		});

		if (verbose) {
			claudeLogger.log(`Process spawned (PID: ${proc.pid})`);
		}

		// Write prompt to stdin and close the stream
		proc.stdin.write(prompt);
		await proc.stdin.end();

		if (verbose) {
			claudeLogger.log(`Wrote ${prompt.length} chars to stdin`);
			claudeLogger.log(`Waiting for response...`);
		}

		// Progress indicator for long operations
		let progressInterval: ReturnType<typeof setInterval> | undefined;
		if (verbose) {
			progressInterval = setInterval(() => {
				const elapsed = Date.now() - startTime;
				const remaining = timeout - elapsed;
				claudeLogger.log(
					`Still waiting... ${(elapsed / 1000).toFixed(1)}s elapsed, ${(remaining / 1000).toFixed(1)}s remaining`,
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
				claudeLogger.log(
					`Process exited with code ${exitCode} after ${(elapsed / 1000).toFixed(1)}s`,
				);
				claudeLogger.log(
					`stdout size: ${(stdout.length / 1024).toFixed(1)} KB`,
				);
				if (stderr) {
					claudeLogger.log(
						`stderr size: ${(stderr.length / 1024).toFixed(1)} KB`,
					);
				}
			}

			if (exitCode !== 0) {
				const exitCodeExplanation = this.getExitCodeExplanation(exitCode);
				const errorDetails = [
					`Claude CLI exited with code ${exitCode}${exitCodeExplanation}`,
					stderr ? `stderr: ${stderr.trim()}` : null,
					stdout
						? `stdout preview: ${stdout.substring(0, 500)}`
						: "(no stdout)",
				]
					.filter(Boolean)
					.join("\n");
				throw new Error(errorDetails);
			}

			return this.parseJsonResponse(stdout, verbose);
		} catch (err) {
			if (progressInterval) clearInterval(progressInterval);

			const message = err instanceof Error ? err.message : String(err);
			if (message.includes("ENOENT")) {
				throw new Error(
					`Claude CLI not found. Is 'claude' installed and in your PATH? Original error: ${message}`,
				);
			} else if (message.includes("EACCES")) {
				throw new Error(
					`Permission denied when running Claude CLI. Check file permissions. Original error: ${message}`,
				);
			} else if (message.includes("E2BIG")) {
				throw new Error(
					`Prompt too large for Claude CLI. The prompt exceeds OS argument size limits. Original error: ${message}`,
				);
			}
			throw err;
		}
	}

	/**
	 * Normalize Claude CLI response to standard format
	 */
	protected normalizeResponse(parsed: unknown): IProviderResponse {
		// Handle case where Claude returns array directly (evaluator responses)
		if (Array.isArray(parsed)) {
			return { result: JSON.stringify(parsed) };
		}

		const claudeResponse = parsed as ClaudeCLIResponse;

		return {
			result: claudeResponse.result ?? "",
			session_id: claudeResponse.session_id,
			cost_usd: claudeResponse.total_cost_usd,
			duration_ms: claudeResponse.duration_ms,
			usage: claudeResponse.usage,
		};
	}
}
