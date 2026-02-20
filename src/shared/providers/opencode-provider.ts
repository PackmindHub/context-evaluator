/**
 * OpenCode CLI Provider
 * Implements the AI provider interface for OpenCode CLI
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
 * OpenCode CLI response format (legacy single JSON)
 * Note: This is based on expected OpenCode CLI output format
 */
interface OpenCodeCLIResponse {
	result?: string;
	output?: string;
	content?: string;
	session_id?: string;
	cost?: number;
	total_cost?: number;
	duration_ms?: number;
	duration?: number;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		total_tokens?: number;
	};
}

/**
 * OpenCode streaming event types (NDJSON format)
 * Each line is a separate JSON object with a type field
 */
interface OpenCodeStreamEvent {
	type: "step_start" | "text" | "step_finish" | string;
	timestamp?: number;
	sessionID?: string;
	part?: {
		id?: string;
		sessionID?: string;
		messageID?: string;
		type?: string;
		text?: string;
		reason?: string;
		snapshot?: string;
		cost?: number;
		tokens?: {
			input?: number;
			output?: number;
			reasoning?: number;
			cache?: {
				read?: number;
				write?: number;
			};
		};
	};
}

/**
 * OpenCode CLI provider implementation
 */
export class OpenCodeProvider extends BaseProvider {
	readonly name: ProviderName = "opencode";
	readonly displayName = "OpenCode";

	/**
	 * Check if OpenCode CLI is available
	 */
	async isAvailable(): Promise<boolean> {
		return checkCliAvailability("opencode", ["--version"], this.displayName);
	}

	/**
	 * Invoke OpenCode CLI with a prompt
	 */
	async invoke(
		prompt: string,
		options: IProviderInvokeOptions = {},
	): Promise<IProviderResponse> {
		const { verbose = false, timeout = DEFAULT_TIMEOUT_MS, cwd } = options;

		// OpenCode CLI command format: opencode run --format json
		// Note: prompt is passed via stdin to avoid E2BIG errors on large prompts
		const args = [
			"run",
			"--format",
			"json",
			"--model",
			"openai/gpt-5.3-codex",
			"--variant",
			"medium",
		];

		if (verbose) {
			console.log(`\n[OpenCode] Starting API call...`);
			console.log(`[OpenCode] Prompt length: ${prompt.length} chars`);
			console.log(
				`[OpenCode] Timeout: ${timeout}ms (${(timeout / 1000).toFixed(1)}s)`,
			);
			if (cwd) {
				console.log(`[OpenCode] Working directory: ${cwd}`);
			}
			console.log(
				`[OpenCode] Command: opencode run --format json --model openai/gpt-5.2-codex --variant medium (prompt via stdin)`,
			);
			console.log(`[OpenCode] Spawning process...`);
		}

		const startTime = Date.now();

		const proc = Bun.spawn(["opencode", ...args], {
			stdin: "pipe",
			stdout: "pipe",
			stderr: "pipe",
			env: process.env,
			cwd: cwd || process.cwd(),
		});

		if (verbose) {
			console.log(`[OpenCode] Process spawned (PID: ${proc.pid})`);
		}

		// Write prompt to stdin and close the stream
		proc.stdin.write(prompt);
		await proc.stdin.end();

		if (verbose) {
			console.log(`[OpenCode] Wrote ${prompt.length} chars to stdin`);
			console.log(`[OpenCode] Waiting for response...`);
		}

		// Progress indicator for long operations
		let progressInterval: ReturnType<typeof setInterval> | undefined;
		if (verbose) {
			progressInterval = setInterval(() => {
				const elapsed = Date.now() - startTime;
				const remaining = timeout - elapsed;
				console.log(
					`[OpenCode] Still waiting... ${(elapsed / 1000).toFixed(1)}s elapsed, ${(remaining / 1000).toFixed(1)}s remaining`,
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
					`[OpenCode] Process exited with code ${exitCode} after ${(elapsed / 1000).toFixed(1)}s`,
				);
				console.log(
					`[OpenCode] stdout size: ${(stdout.length / 1024).toFixed(1)} KB`,
				);
				if (stderr) {
					console.log(
						`[OpenCode] stderr size: ${(stderr.length / 1024).toFixed(1)} KB`,
					);
				}

				// Enhanced debugging when stdout is empty
				if (stdout.length === 0) {
					console.log(
						`[OpenCode] ⚠️  WARNING: stdout is completely empty (0 bytes)`,
					);
				} else {
					// Show first 200 chars of stdout for debugging
					const preview = stdout.substring(0, 200).replace(/\n/g, "\\n");
					console.log(
						`[OpenCode] stdout preview: ${preview}${stdout.length > 200 ? "..." : ""}`,
					);
				}

				// Show stderr content if present
				if (stderr && stderr.length > 0) {
					const stderrPreview = stderr.substring(0, 500).replace(/\n/g, "\\n");
					console.log(
						`[OpenCode] stderr content: ${stderrPreview}${stderr.length > 500 ? "..." : ""}`,
					);
				}
			}

			if (exitCode !== 0) {
				const exitCodeExplanation = this.getExitCodeExplanation(exitCode);
				const errorDetails = [
					`OpenCode CLI exited with code ${exitCode}${exitCodeExplanation}`,
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
						`[OpenCode] ⚠️  DIAGNOSTIC: stdout is empty but stderr has ${stderr.length} bytes`,
					);
					console.log(
						`[OpenCode] This may indicate OpenCode is outputting to stderr instead of stdout`,
					);
					console.log(
						`[OpenCode] Or the command may not support --format json properly`,
					);
				}
			}

			return this.parseJsonResponse(stdout, verbose);
		} catch (err) {
			if (progressInterval) clearInterval(progressInterval);

			const message = err instanceof Error ? err.message : String(err);
			if (message.includes("ENOENT")) {
				throw new Error(
					`OpenCode CLI not found. Is 'opencode' installed and in your PATH? Original error: ${message}`,
				);
			} else if (message.includes("EACCES")) {
				throw new Error(
					`Permission denied when running OpenCode CLI. Check file permissions. Original error: ${message}`,
				);
			} else if (message.includes("E2BIG")) {
				throw new Error(
					`Prompt too large for OpenCode CLI. The prompt exceeds OS argument size limits. Original error: ${message}`,
				);
			}
			throw err;
		}
	}

	/**
	 * Override parseJsonResponse to handle NDJSON streaming format
	 * OpenCode output may include plain text (like CLOC output) followed by NDJSON events
	 */
	protected override parseJsonResponse(
		stdout: string,
		verbose: boolean,
	): IProviderResponse {
		if (verbose) {
			console.log(
				`[${this.displayName}] Parsing response (length: ${stdout.length} chars, ${stdout.split("\n").length} lines)`,
			);
		}

		const lines = stdout.trim().split("\n");

		if (verbose && lines.length > 0) {
			console.log(
				`[${this.displayName}] First line preview: ${lines[0]!.substring(0, 100)}${lines[0]!.length > 100 ? "..." : ""}`,
			);
			if (lines.length > 1) {
				console.log(
					`[${this.displayName}] Last line preview: ${lines[lines.length - 1]!.substring(0, 100)}${lines[lines.length - 1]!.length > 100 ? "..." : ""}`,
				);
			}
		}

		// Find NDJSON lines - they start with { and contain "type":
		const ndjsonLines = lines.filter(
			(line) => line.trim().startsWith("{") && line.includes('"type"'),
		);

		if (verbose) {
			const jsonStartLines = lines.filter((line) =>
				line.trim().startsWith("{"),
			).length;
			const totalNonEmpty = lines.filter(
				(line) => line.trim().length > 0,
			).length;
			console.log(
				`[${this.displayName}] Line analysis: ${totalNonEmpty} non-empty, ${jsonStartLines} start with '{', ${ndjsonLines.length} have "type" field`,
			);

			if (ndjsonLines.length === 0 && jsonStartLines > 0) {
				console.log(
					`[${this.displayName}] Found JSON-like lines without "type" field - may be legacy format`,
				);
			}
		}

		// If we found NDJSON streaming events, parse them
		if (ndjsonLines.length > 0) {
			if (verbose) {
				console.log(
					`[${this.displayName}] Detected NDJSON streaming format (${ndjsonLines.length} events out of ${lines.length} lines)`,
				);
			}
			return this.parseNdjsonResponse(ndjsonLines, verbose);
		}

		// Fall back to standard JSON parsing
		if (verbose && stdout.trim().length === 0) {
			console.log(
				`[${this.displayName}] ⚠️  Attempting to parse empty stdout - will return empty result`,
			);
		}
		return super.parseJsonResponse(stdout, verbose);
	}

	/**
	 * Parse NDJSON streaming response format
	 * Extracts text from "text" events and metadata from "step_finish" events
	 */
	private parseNdjsonResponse(
		lines: string[],
		verbose: boolean,
	): IProviderResponse {
		const textParts: string[] = [];
		let sessionId: string | undefined;
		let cost: number | undefined;
		let usage: Usage | undefined;

		for (const line of lines) {
			try {
				const event = JSON.parse(line) as OpenCodeStreamEvent;

				switch (event.type) {
					case "text":
						// Extract text content from text events
						if (event.part?.text) {
							textParts.push(event.part.text);
						}
						if (!sessionId && event.sessionID) {
							sessionId = event.sessionID;
						}
						break;

					case "step_finish":
						// Extract cost and usage from step_finish events
						if (event.part?.cost !== undefined) {
							cost = event.part.cost;
						}
						if (event.part?.tokens) {
							usage = {
								input_tokens: event.part.tokens.input ?? 0,
								output_tokens: event.part.tokens.output ?? 0,
								cache_creation_input_tokens:
									event.part.tokens.cache?.write ?? 0,
								cache_read_input_tokens: event.part.tokens.cache?.read ?? 0,
							};
						}
						if (!sessionId && event.sessionID) {
							sessionId = event.sessionID;
						}
						break;

					case "step_start":
						// Extract session ID from step_start if not already set
						if (!sessionId && event.sessionID) {
							sessionId = event.sessionID;
						}
						break;
				}
			} catch {
				// Skip malformed lines
				if (verbose) {
					console.log(
						`[${this.displayName}] Skipping malformed NDJSON line: ${line.substring(0, 50)}...`,
					);
				}
			}
		}

		const result = textParts.join("");

		if (verbose) {
			console.log(
				`[${this.displayName}] ✓ Parsed NDJSON: ${textParts.length} text events, result length: ${result.length} chars`,
			);
			if (cost !== undefined) {
				console.log(`[${this.displayName}] Cost: $${cost.toFixed(6)}`);
			}
		}

		return {
			result,
			session_id: sessionId,
			cost_usd: cost,
			usage,
		};
	}

	/**
	 * Normalize OpenCode CLI response to standard format (legacy single JSON)
	 */
	protected normalizeResponse(parsed: unknown): IProviderResponse {
		// Handle case where OpenCode returns array directly
		if (Array.isArray(parsed)) {
			return { result: JSON.stringify(parsed) };
		}

		const openCodeResponse = parsed as OpenCodeCLIResponse;

		// OpenCode may use different field names - handle various possibilities
		const result =
			openCodeResponse.result ??
			openCodeResponse.output ??
			openCodeResponse.content ??
			"";

		const cost_usd =
			openCodeResponse.cost ?? openCodeResponse.total_cost ?? undefined;

		const duration_ms =
			openCodeResponse.duration_ms ?? openCodeResponse.duration ?? undefined;

		// Normalize usage format
		let usage: Usage | undefined;
		if (openCodeResponse.usage) {
			usage = {
				input_tokens: openCodeResponse.usage.input_tokens ?? 0,
				output_tokens: openCodeResponse.usage.output_tokens ?? 0,
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 0,
			};
		}

		return {
			result,
			session_id: openCodeResponse.session_id,
			cost_usd,
			duration_ms,
			usage,
		};
	}
}
