/**
 * Base provider implementation with shared logic
 * Provides common retry and timeout handling for all providers
 */

import { DEFAULT_TIMEOUT_MS } from "@shared/constants";
import type {
	IAIProvider,
	IProviderInvokeOptions,
	IProviderResponse,
	IProviderRetryOptions,
	ProviderName,
} from "./types";

/**
 * Abstract base class for AI providers
 * Implements common retry logic and error handling
 */
export abstract class BaseProvider implements IAIProvider {
	abstract readonly name: ProviderName;
	abstract readonly displayName: string;

	/**
	 * Check if the provider CLI is available
	 */
	abstract isAvailable(): Promise<boolean>;

	/**
	 * Invoke the provider with a prompt (implementation specific)
	 */
	abstract invoke(
		prompt: string,
		options?: IProviderInvokeOptions,
	): Promise<IProviderResponse>;

	/**
	 * Invoke with retry logic for transient failures
	 * Provides exponential backoff and error classification
	 */
	async invokeWithRetry(
		prompt: string,
		options: IProviderRetryOptions = {},
	): Promise<IProviderResponse> {
		const { maxRetries = 3, onRetry, onTimeout, ...invokeOptions } = options;

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				return await this.invoke(prompt, invokeOptions);
			} catch (error) {
				const isLastAttempt = attempt === maxRetries - 1;
				const errorMessage =
					error instanceof Error ? error.message : String(error);

				// Check if this is a timeout error and emit timeout event
				if (
					errorMessage.includes("timed out") ||
					errorMessage.includes("timeout")
				) {
					const timeoutMatch = errorMessage.match(/(\d+)ms/);
					const timeoutMs = timeoutMatch
						? parseInt(timeoutMatch[1]!, 10)
						: (options.timeout ?? DEFAULT_TIMEOUT_MS);
					if (onTimeout) {
						onTimeout({ elapsedMs: timeoutMs, timeoutMs });
					}
				}

				// Don't retry on certain errors
				if (this.isNonRetryableError(errorMessage)) {
					throw error;
				}

				if (isLastAttempt) {
					throw error;
				}

				const delayMs = 1000 * (attempt + 1);

				// Always log retry attempts (not just when verbose)
				console.log(
					`[${this.displayName}] Attempt ${attempt + 1}/${maxRetries} failed: ${errorMessage}`,
				);
				console.log(
					`[${this.displayName}] Retrying in ${delayMs}ms... (${maxRetries - attempt - 1} retries remaining)`,
				);

				// Emit retry event if callback provided
				if (onRetry) {
					onRetry({
						attempt: attempt + 1,
						maxRetries,
						error: errorMessage,
						delayMs,
					});
				}

				// Exponential backoff
				await this.sleep(delayMs);
			}
		}

		throw new Error("Should not reach here");
	}

	/**
	 * Check if an error should not be retried
	 */
	protected isNonRetryableError(errorMessage: string): boolean {
		return (
			errorMessage.includes("not found") ||
			errorMessage.includes("Permission denied") ||
			errorMessage.includes("ENOENT") ||
			errorMessage.includes("EACCES") ||
			errorMessage.includes("E2BIG")
		);
	}

	/**
	 * Sleep for a given number of milliseconds
	 */
	protected sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Create a timeout promise that rejects after the specified duration
	 */
	protected createTimeoutPromise<T>(
		timeout: number,
		onTimeout: () => void,
		startTime: number,
	): Promise<T> {
		return new Promise<never>((_, reject) => {
			setTimeout(() => {
				onTimeout();
				const elapsed = Date.now() - startTime;
				console.error(
					`\n[${this.displayName}] ❌ TIMEOUT after ${(elapsed / 1000).toFixed(1)}s`,
				);
				reject(
					new Error(
						`${this.displayName} CLI timed out after ${timeout}ms (${(timeout / 1000).toFixed(1)}s). The prompt may be too large or the provider is taking too long to respond.`,
					),
				);
			}, timeout);
		});
	}

	/**
	 * Parse JSON response with fallback to raw text
	 */
	protected parseJsonResponse(
		stdout: string,
		verbose: boolean,
	): IProviderResponse {
		try {
			const parsed = JSON.parse(stdout);
			if (verbose) {
				console.log(
					`[${this.displayName}] ✓ Successfully parsed JSON response`,
				);
			}
			return this.normalizeResponse(parsed);
		} catch {
			// If not JSON, return raw output wrapped in a response object
			if (verbose) {
				console.log(
					`[${this.displayName}] ⚠️  Response is not JSON, treating as raw text (length: ${stdout.length})`,
				);
			}
			return { result: stdout };
		}
	}

	/**
	 * Normalize provider-specific response to standard format
	 * Override in subclasses for provider-specific normalization
	 */
	protected abstract normalizeResponse(parsed: unknown): IProviderResponse;

	/**
	 * Get exit code explanation for common signals
	 */
	protected getExitCodeExplanation(exitCode: number): string {
		switch (exitCode) {
			case 143:
				return " (SIGTERM - process was terminated, possibly by timeout or user interrupt)";
			case 137:
				return " (SIGKILL - process was forcefully killed, possibly out of memory)";
			case 130:
				return " (SIGINT - interrupted by user Ctrl+C)";
			case 1:
				return " (general error)";
			default:
				return "";
		}
	}
}
