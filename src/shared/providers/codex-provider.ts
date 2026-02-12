/**
 * OpenAI Codex CLI Provider
 * Implements the AI provider interface for OpenAI Codex CLI
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
 * Codex NDJSON event types
 * Each line is a separate JSON object representing an event
 */
interface CodexStreamEvent {
	type:
		| "thread.started"
		| "item.started"
		| "item.completed"
		| "turn.completed"
		| "error"
		| string;
	thread_id?: string;
	item?: {
		type?: string;
		text?: string;
	};
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		cached_input_tokens?: number;
	};
	error?: {
		message?: string;
		code?: string;
	};
}

/**
 * OpenAI Codex CLI provider implementation
 */
export class CodexProvider extends BaseProvider {
	readonly name: ProviderName = "codex";
	readonly displayName = "OpenAI Codex";

	/**
	 * Check if Codex CLI is available
	 */
	async isAvailable(): Promise<boolean> {
		return checkCliAvailability("codex", ["--version"], this.displayName);
	}

	/**
	 * Invoke Codex CLI with a prompt
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

		// Codex CLI command format: codex exec --json --full-auto
		// Note: prompt is passed via stdin to avoid E2BIG errors on large prompts
		const args = [
			"exec",
			"--json",
			"--full-auto",
			"--sandbox",
			writeMode ? "network-only" : "read-only",
			"--skip-git-repo-check",
		];

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
				`[${this.displayName}] Command: codex exec --json --full-auto (prompt via stdin)`,
			);
			console.log(`[${this.displayName}] Spawning process...`);
		}

		const startTime = Date.now();

		const proc = Bun.spawn(["codex", ...args], {
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
						`[${this.displayName}] This may indicate Codex is outputting to stderr instead of stdout`,
					);
					console.log(
						`[${this.displayName}] Or the command may not support --json properly`,
					);
				}
			}

			return this.parseJsonResponse(stdout, verbose);
		} catch (err) {
			if (progressInterval) clearInterval(progressInterval);

			const message = err instanceof Error ? err.message : String(err);
			if (message.includes("ENOENT")) {
				throw new Error(
					`Codex CLI not found. Is 'codex' installed and in your PATH? Original error: ${message}`,
				);
			} else if (message.includes("EACCES")) {
				throw new Error(
					`Permission denied when running Codex CLI. Check file permissions. Original error: ${message}`,
				);
			} else if (message.includes("E2BIG")) {
				throw new Error(
					`Prompt too large for Codex CLI. The prompt exceeds OS argument size limits. Original error: ${message}`,
				);
			} else if (!process.env.CODEX_API_KEY) {
				throw new Error(
					`Codex authentication required. Set CODEX_API_KEY environment variable or run 'codex login'. Original error: ${message}`,
				);
			}
			throw err;
		}
	}

	/**
	 * Override parseJsonResponse to handle NDJSON streaming format
	 * Codex outputs newline-delimited JSON events
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
					`[${this.displayName}] Found JSON-like lines without "type" field - may be non-NDJSON format`,
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
	 * Extracts text from agent_message items and metadata from turn.completed events
	 */
	private parseNdjsonResponse(
		lines: string[],
		verbose: boolean,
	): IProviderResponse {
		const textParts: string[] = [];
		let sessionId: string | undefined;
		let usage: Usage | undefined;
		const eventTypeCounts: Record<string, number> = {};

		for (const line of lines) {
			try {
				const event = JSON.parse(line) as CodexStreamEvent;

				// Count event types for debugging
				if (event.type) {
					eventTypeCounts[event.type] = (eventTypeCounts[event.type] || 0) + 1;
				}

				switch (event.type) {
					case "thread.started":
						// Extract thread_id (maps to session_id)
						if (!sessionId && event.thread_id) {
							sessionId = event.thread_id;
						}
						break;

					case "item.completed":
						// Extract text from agent_message items
						if (event.item?.type === "agent_message" && event.item.text) {
							textParts.push(event.item.text);
						}
						break;

					case "turn.completed":
						// Extract token usage
						if (event.usage) {
							usage = {
								input_tokens: event.usage.input_tokens ?? 0,
								output_tokens: event.usage.output_tokens ?? 0,
								cache_creation_input_tokens: 0, // Codex doesn't provide this
								cache_read_input_tokens: event.usage.cached_input_tokens ?? 0,
							};
						}
						break;

					case "error":
						// Log error messages but continue parsing
						if (verbose && event.error?.message) {
							console.log(
								`[${this.displayName}] ⚠️  Error event: ${event.error.message}`,
							);
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
				`[${this.displayName}] ✓ Parsed NDJSON: ${textParts.length} agent_message items, result length: ${result.length} chars`,
			);
			console.log(
				`[${this.displayName}] Event type counts: ${JSON.stringify(eventTypeCounts)}`,
			);
			if (sessionId) {
				console.log(`[${this.displayName}] Session ID: ${sessionId}`);
			}
			if (usage) {
				console.log(
					`[${this.displayName}] Usage: ${usage.input_tokens} input + ${usage.output_tokens} output tokens`,
				);
				if (usage.cache_read_input_tokens > 0) {
					console.log(
						`[${this.displayName}] Cache: ${usage.cache_read_input_tokens} tokens read from cache`,
					);
				}
			}
		}

		return {
			result,
			session_id: sessionId,
			usage,
			// Note: Codex doesn't provide cost_usd in NDJSON events
			cost_usd: undefined,
		};
	}

	/**
	 * Normalize non-NDJSON response to standard format (fallback)
	 */
	protected normalizeResponse(parsed: unknown): IProviderResponse {
		// Handle case where Codex returns array directly
		if (Array.isArray(parsed)) {
			return { result: JSON.stringify(parsed) };
		}

		// If it's a string, return it directly
		if (typeof parsed === "string") {
			return { result: parsed };
		}

		// Otherwise treat it as an object and try to extract relevant fields
		const obj = parsed as Record<string, unknown>;
		return {
			result: JSON.stringify(obj),
		};
	}
}
