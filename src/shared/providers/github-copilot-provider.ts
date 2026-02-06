/**
 * GitHub Copilot CLI Provider
 * Implements the AI provider interface for GitHub Copilot CLI
 */

import { DEFAULT_TIMEOUT_MS } from "@shared/constants";
import { BaseProvider } from "./base-provider";
import { checkCliAvailability } from "./cli-checker";
import type {
	IProviderInvokeOptions,
	IProviderResponse,
	ProviderName,
} from "./types";

/**
 * GitHub Copilot CLI provider implementation
 * Uses the `copilot` command with raw text output (no JSON support)
 */
export class GitHubCopilotProvider extends BaseProvider {
	readonly name: ProviderName = "github-copilot";
	readonly displayName = "GitHub Copilot";

	/**
	 * Check if GitHub Copilot CLI is available
	 */
	async isAvailable(): Promise<boolean> {
		return checkCliAvailability("copilot", ["--version"], this.displayName);
	}

	/**
	 * Invoke GitHub Copilot CLI with a prompt
	 */
	async invoke(
		prompt: string,
		options: IProviderInvokeOptions = {},
	): Promise<IProviderResponse> {
		const { verbose = false, timeout = DEFAULT_TIMEOUT_MS, cwd } = options;

		// GitHub Copilot CLI command format: copilot -p --allow-all-tools
		// Note: prompt is passed via stdin to avoid E2BIG errors on large prompts
		const args = ["-p", "--allow-all-tools"];

		if (verbose) {
			console.log(`\n[GitHub Copilot] Starting API call...`);
			console.log(`[GitHub Copilot] Prompt length: ${prompt.length} chars`);
			console.log(
				`[GitHub Copilot] Timeout: ${timeout}ms (${(timeout / 1000).toFixed(1)}s)`,
			);
			if (cwd) {
				console.log(`[GitHub Copilot] Working directory: ${cwd}`);
			}
			console.log(
				`[GitHub Copilot] Command: copilot -p --allow-all-tools (prompt via stdin)`,
			);
			console.log(`[GitHub Copilot] Spawning process...`);
		}

		const startTime = Date.now();

		const proc = Bun.spawn(["copilot", ...args], {
			stdin: "pipe",
			stdout: "pipe",
			stderr: "pipe",
			env: process.env,
			cwd: cwd || process.cwd(),
		});

		if (verbose) {
			console.log(`[GitHub Copilot] Process spawned (PID: ${proc.pid})`);
		}

		// Write prompt to stdin and close the stream
		proc.stdin.write(prompt);
		await proc.stdin.end();

		if (verbose) {
			console.log(`[GitHub Copilot] Wrote ${prompt.length} chars to stdin`);
			console.log(`[GitHub Copilot] Waiting for response...`);
		}

		// Progress indicator for long operations
		let progressInterval: ReturnType<typeof setInterval> | undefined;
		if (verbose) {
			progressInterval = setInterval(() => {
				const elapsed = Date.now() - startTime;
				const remaining = timeout - elapsed;
				console.log(
					`[GitHub Copilot] Still waiting... ${(elapsed / 1000).toFixed(1)}s elapsed, ${(remaining / 1000).toFixed(1)}s remaining`,
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
					`[GitHub Copilot] Process exited with code ${exitCode} after ${(elapsed / 1000).toFixed(1)}s`,
				);
				console.log(
					`[GitHub Copilot] stdout size: ${(stdout.length / 1024).toFixed(1)} KB`,
				);
				if (stderr) {
					console.log(
						`[GitHub Copilot] stderr size: ${(stderr.length / 1024).toFixed(1)} KB`,
					);
				}

				// Show first 200 chars of stdout for debugging
				if (stdout.length > 0) {
					const preview = stdout.substring(0, 200).replace(/\n/g, "\\n");
					console.log(
						`[GitHub Copilot] stdout preview: ${preview}${stdout.length > 200 ? "..." : ""}`,
					);
				}

				// Show stderr content if present
				if (stderr && stderr.length > 0) {
					const stderrPreview = stderr.substring(0, 500).replace(/\n/g, "\\n");
					console.log(
						`[GitHub Copilot] stderr content: ${stderrPreview}${stderr.length > 500 ? "..." : ""}`,
					);
				}
			}

			if (exitCode !== 0) {
				const exitCodeExplanation = this.getExitCodeExplanation(exitCode);
				const errorDetails = [
					`GitHub Copilot CLI exited with code ${exitCode}${exitCodeExplanation}`,
					stderr ? `stderr: ${stderr.trim()}` : null,
					stdout
						? `stdout preview: ${stdout.substring(0, 500)}`
						: "(no stdout)",
				]
					.filter(Boolean)
					.join("\n");
				throw new Error(errorDetails);
			}

			// GitHub Copilot returns raw text, not JSON
			// Measure duration via timestamps since no metrics are available
			const duration_ms = Date.now() - startTime;

			if (verbose) {
				console.log(
					`[GitHub Copilot] ✓ Received response (${stdout.length} chars) in ${duration_ms}ms`,
				);
			}

			return {
				result: stdout,
				duration_ms,
				// Cost and usage metrics are not available from GitHub Copilot CLI
			};
		} catch (err) {
			if (progressInterval) clearInterval(progressInterval);

			const message = err instanceof Error ? err.message : String(err);
			if (message.includes("ENOENT")) {
				throw new Error(
					`GitHub Copilot CLI not found. Is 'copilot' installed and in your PATH? Original error: ${message}`,
				);
			} else if (message.includes("EACCES")) {
				throw new Error(
					`Permission denied when running GitHub Copilot CLI. Check file permissions. Original error: ${message}`,
				);
			} else if (message.includes("E2BIG")) {
				throw new Error(
					`Prompt too large for GitHub Copilot CLI. The prompt exceeds OS argument size limits. Original error: ${message}`,
				);
			}
			throw err;
		}
	}

	/**
	 * Normalize response - GitHub Copilot returns raw text, not JSON
	 * This method is not used since we return the raw stdout directly
	 */
	protected normalizeResponse(parsed: unknown): IProviderResponse {
		// GitHub Copilot doesn't return JSON, but if it somehow does,
		// handle it gracefully
		if (typeof parsed === "string") {
			return { result: parsed };
		}
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"result" in parsed &&
			typeof (parsed as { result: unknown }).result === "string"
		) {
			return { result: (parsed as { result: string }).result };
		}
		return { result: JSON.stringify(parsed) };
	}
}
