import React from "react";

type SeverityLevel = "high" | "medium" | "low";

interface SeverityDotProps {
	/** Severity level determines the color */
	severity: SeverityLevel;
	/** Optional size variant */
	size?: "sm" | "md" | "lg";
	/** Additional class names */
	className?: string;
}

/**
 * A colored dot indicator for severity levels
 *
 * Uses the centralized severity color system from styles.css.
 */
export const SeverityDot: React.FC<SeverityDotProps> = ({
	severity,
	size = "md",
	className = "",
}) => {
	const sizeClasses = {
		sm: "w-1.5 h-1.5",
		md: "w-2.5 h-2.5",
		lg: "w-3 h-3",
	};

	return (
		<span
			className={`severity-dot severity-dot-${severity} ${sizeClasses[size]} ${className}`}
			aria-label={`${severity} severity`}
		/>
	);
};

/**
 * Helper to convert numeric severity to level string
 * Thresholds: High (8-10), Medium (6-7), Low (5)
 */
export function severityToLevel(severity: number): SeverityLevel {
	if (severity >= 8) return "high";
	if (severity >= 6) return "medium";
	return "low";
}
