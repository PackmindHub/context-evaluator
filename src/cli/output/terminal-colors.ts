/**
 * ANSI color codes and severity display utilities for terminal output
 */

/**
 * ANSI color codes for terminal output
 */
export const colors = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
	brightRed: "\x1b[91m",
	brightGreen: "\x1b[92m",
	brightYellow: "\x1b[93m",
	brightCyan: "\x1b[96m",
} as const;

/**
 * Severity display configuration
 */
export interface SeverityDisplay {
	color: string;
	emoji: string;
	label: string;
}

/**
 * Severity level thresholds and display configuration
 * Updated for 3-level system: High (8-10), Medium (6-7), Low (≤5)
 */
export const SEVERITY_CONFIG = {
	HIGH: { min: 8, color: colors.yellow, emoji: "🟠", label: "High" },
	MEDIUM: { min: 6, color: colors.blue, emoji: "🟡", label: "Medium" },
	LOW: { min: 1, color: colors.dim, emoji: "⚪", label: "Low" },
} as const;

/**
 * Get severity color and emoji for terminal display
 */
export function getSeverityDisplay(severity: number): SeverityDisplay {
	if (severity >= SEVERITY_CONFIG.HIGH.min) {
		return {
			color: SEVERITY_CONFIG.HIGH.color,
			emoji: SEVERITY_CONFIG.HIGH.emoji,
			label: SEVERITY_CONFIG.HIGH.label,
		};
	}
	if (severity >= SEVERITY_CONFIG.MEDIUM.min) {
		return {
			color: SEVERITY_CONFIG.MEDIUM.color,
			emoji: SEVERITY_CONFIG.MEDIUM.emoji,
			label: SEVERITY_CONFIG.MEDIUM.label,
		};
	}
	return {
		color: SEVERITY_CONFIG.LOW.color,
		emoji: SEVERITY_CONFIG.LOW.emoji,
		label: SEVERITY_CONFIG.LOW.label,
	};
}

/**
 * Convert impact level to numeric severity
 */
export function impactLevelToSeverity(
	impactLevel: "High" | "Medium" | "Low" | undefined,
): number {
	if (impactLevel === "High") return 9;
	if (impactLevel === "Medium") return 7;
	if (impactLevel === "Low") return 5;
	return 5; // Default to low
}

/**
 * Evaluator ID to human-readable label mapping
 */
export const EVALUATOR_LABELS: Record<string, string> = {
	"content-quality": "Content Quality & Focus",
	"structural-organization": "Structural Organization",
	"command-completeness": "Command Completeness",
	"technical-accuracy": "Technical Accuracy",
	"code-style": "Code Style Documentation",
	"language-clarity": "Language Clarity",
	"workflow-integration": "Workflow Integration",
	"project-structure": "Project Structure",
	security: "Security",
	dependencies: "Dependencies",
	"subdirectory-coverage": "Subdirectory Coverage",
	"context-gaps": "Context Gaps",
	completeness: "Completeness",
	"test-patterns-coverage": "Test Patterns Coverage",
	"database-patterns-coverage": "Database Patterns Coverage",
	consistency: "Consistency",
	"outdated-documentation": "Outdated Documentation",
};

/**
 * Get human-readable label for evaluator
 */
export function getEvaluatorLabel(evaluatorName: string): string {
	return EVALUATOR_LABELS[evaluatorName] || evaluatorName;
}

/**
 * Progress message types with display configuration
 */
export const PROGRESS_CONFIG = {
	info: { symbol: "📊", color: colors.cyan },
	success: { symbol: "✅", color: colors.green },
	error: { symbol: "❌", color: colors.red },
	warn: { symbol: "⚠️", color: colors.yellow },
} as const;

export type ProgressType = keyof typeof PROGRESS_CONFIG;
