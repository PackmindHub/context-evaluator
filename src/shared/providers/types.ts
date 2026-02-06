/**
 * Provider type definitions
 * Defines the core interfaces for AI provider abstraction
 */

import type { Usage } from "@shared/types/evaluation";

/**
 * Supported AI provider names
 */
export type ProviderName =
	| "claude"
	| "opencode"
	| "cursor"
	| "github-copilot"
	| "codex"
	| "random";

/**
 * Standardized response from AI providers
 */
export interface IProviderResponse {
	result: string;
	session_id?: string;
	cost_usd?: number;
	duration_ms?: number;
	usage?: Usage;
}

/**
 * Options for invoking an AI provider
 */
export interface IProviderInvokeOptions {
	verbose?: boolean;
	timeout?: number;
	/** Working directory for the CLI process (defaults to process.cwd()) */
	cwd?: string;
}

/**
 * Callback for retry events (for progress tracking)
 */
export interface IRetryEvent {
	attempt: number;
	maxRetries: number;
	error: string;
	delayMs: number;
}

/**
 * Callback for timeout events (for progress tracking)
 */
export interface ITimeoutEvent {
	elapsedMs: number;
	timeoutMs: number;
}

/**
 * Options for invoking with retry logic
 */
export interface IProviderRetryOptions extends IProviderInvokeOptions {
	maxRetries?: number;
	/** Callback when a retry attempt is made */
	onRetry?: (event: IRetryEvent) => void;
	/** Callback when a timeout occurs */
	onTimeout?: (event: ITimeoutEvent) => void;
}

/**
 * Core AI provider interface
 * All providers must implement this interface
 */
export interface IAIProvider {
	/**
	 * Unique name identifier for the provider
	 */
	readonly name: ProviderName;

	/**
	 * Human-readable display name
	 */
	readonly displayName: string;

	/**
	 * Check if the provider CLI is available
	 */
	isAvailable(): Promise<boolean>;

	/**
	 * Invoke the provider with a prompt
	 */
	invoke(
		prompt: string,
		options?: IProviderInvokeOptions,
	): Promise<IProviderResponse>;

	/**
	 * Invoke the provider with retry logic for transient failures
	 */
	invokeWithRetry(
		prompt: string,
		options?: IProviderRetryOptions,
	): Promise<IProviderResponse>;
}

/**
 * Provider metadata for listing available providers
 */
export interface IProviderInfo {
	name: ProviderName;
	displayName: string;
	available: boolean;
}
