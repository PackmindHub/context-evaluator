/**
 * Centralized logger utility with timestamp support
 *
 * Provides consistent logging across the application with configurable timestamps.
 * All log output includes timestamps by default in [HH:mm:ss.SSS] format.
 */

export type TimestampFormat = "iso" | "compact" | "time-only";

export interface LoggerConfig {
	timestamps?: boolean;
	timestampFormat?: TimestampFormat;
}

export interface Logger {
	log: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	info: (...args: unknown[]) => void;
}

// Global configuration
let globalConfig: LoggerConfig = {
	timestamps: true,
	timestampFormat: "time-only",
};

/**
 * Configure the global logger settings
 */
export function configureLogger(config: LoggerConfig): void {
	globalConfig = { ...globalConfig, ...config };
}

/**
 * Get the current logger configuration
 */
export function getLoggerConfig(): LoggerConfig {
	return { ...globalConfig };
}

/**
 * Format a timestamp according to the configured format
 *
 * @param date - Date to format (defaults to now)
 * @param format - Override the global format setting
 * @returns Formatted timestamp string with brackets
 */
export function formatTimestamp(
	date: Date = new Date(),
	format?: TimestampFormat,
): string {
	const fmt = format ?? globalConfig.timestampFormat ?? "time-only";

	switch (fmt) {
		case "iso":
			return `[${date.toISOString()}]`;
		case "compact": {
			// Format: [2026-02-05 14:32:45.123]
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, "0");
			const day = String(date.getDate()).padStart(2, "0");
			const hours = String(date.getHours()).padStart(2, "0");
			const minutes = String(date.getMinutes()).padStart(2, "0");
			const seconds = String(date.getSeconds()).padStart(2, "0");
			const ms = String(date.getMilliseconds()).padStart(3, "0");
			return `[${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}]`;
		}
		case "time-only":
		default: {
			// Format: [14:32:45.123]
			const hours = String(date.getHours()).padStart(2, "0");
			const minutes = String(date.getMinutes()).padStart(2, "0");
			const seconds = String(date.getSeconds()).padStart(2, "0");
			const ms = String(date.getMilliseconds()).padStart(3, "0");
			return `[${hours}:${minutes}:${seconds}.${ms}]`;
		}
	}
}

/**
 * Create a logger with an optional prefix
 *
 * @param prefix - Optional prefix to add after timestamp (e.g., "Runner")
 * @returns Logger instance with log, error, warn, info methods
 */
export function createLogger(prefix?: string): Logger {
	const formatMessage = (...args: unknown[]): unknown[] => {
		const parts: unknown[] = [];

		if (globalConfig.timestamps) {
			parts.push(formatTimestamp());
		}

		if (prefix) {
			parts.push(`[${prefix}]`);
		}

		return [...parts, ...args];
	};

	return {
		log: (...args: unknown[]) => console.log(...formatMessage(...args)),
		error: (...args: unknown[]) => console.error(...formatMessage(...args)),
		warn: (...args: unknown[]) => console.warn(...formatMessage(...args)),
		info: (...args: unknown[]) => console.info(...formatMessage(...args)),
	};
}

// Pre-configured loggers for common modules
export const runnerLogger = createLogger("Runner");
export const engineLogger = createLogger("Engine");
export const claudeLogger = createLogger("Claude");
export const jobManagerLogger = createLogger("JobManager");
export const apiServerLogger = createLogger("API");
export const contextIdentifierLogger = createLogger("ContextIdentifier");
export const cleanupLogger = createLogger("Cleanup");
export const promptBuilderLogger = createLogger("PromptBuilder");
export const responseParserLogger = createLogger("ResponseParser");
export const cursorProviderLogger = createLogger("CursorProvider");
export const codexProviderLogger = createLogger("CodexProvider");
export const openCodeProviderLogger = createLogger("OpenCodeProvider");
export const concurrencyLogger = createLogger("ConcurrencyLimiter");
