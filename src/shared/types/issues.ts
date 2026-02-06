// Issue severity and formatting utilities
import type { Issue, Location } from "./evaluation";

export type SeverityLevel = "high" | "medium" | "low";

// Severity helpers
// New thresholds: High (8-10), Medium (6-7), Low (5 and below)
export function getSeverityLevel(severity: number): SeverityLevel {
	if (severity >= 8) return "high";
	if (severity >= 6) return "medium";
	return "low";
}

export function getSeverityColor(severity: number): string {
	if (severity >= 8) return "text-orange-600 bg-orange-50 border-orange-200";
	if (severity >= 6) return "text-yellow-600 bg-yellow-50 border-yellow-200";
	return "text-gray-600 bg-gray-50 border-gray-200";
}

export function getSeverityEmoji(severity: number): string {
	if (severity >= 8) return "🟠";
	if (severity >= 6) return "🟡";
	return "⚪";
}

// Parse evaluator result string to extract issues
export function parseEvaluatorResult(resultString: string): Issue[] {
	try {
		// The result might contain markdown or other text before the JSON array
		// Try to find JSON array in the result
		const jsonMatch = resultString.match(/\[[\s\S]*\]/);
		if (!jsonMatch) {
			return [];
		}

		const issues = JSON.parse(jsonMatch[0]) as Issue[];
		return Array.isArray(issues) ? issues : [];
	} catch {
		return [];
	}
}

// Format location for display
export function formatLocation(location: Location | Location[]): string {
	if (Array.isArray(location)) {
		return location
			.map((loc) => {
				if (loc.file) {
					return `${loc.file}:${loc.start}-${loc.end}`;
				}
				return `Lines ${loc.start}-${loc.end}`;
			})
			.join(", ");
	} else {
		if (location.file) {
			return `${location.file}:${location.start}-${location.end}`;
		}
		return `Lines ${location.start}-${location.end}`;
	}
}

// Format token usage
export function formatTokenUsage(tokens: number): string {
	return tokens.toLocaleString();
}

// Format cost
export function formatCost(usd: number): string {
	return `$${usd.toFixed(4)}`;
}

// Format duration
export function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${ms}ms`;
	}
	return `${(ms / 1000).toFixed(1)}s`;
}
