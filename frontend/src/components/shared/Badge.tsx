import React from "react";

type BadgeVariant =
	| "default"
	| "primary"
	| "success"
	| "warning"
	| "error"
	| "info"
	| "severity-high"
	| "severity-medium"
	| "severity-low";

interface BadgeProps {
	/** Badge content */
	children: React.ReactNode;
	/** Visual variant */
	variant?: BadgeVariant;
	/** Optional close/remove handler */
	onRemove?: () => void;
	/** Additional class names */
	className?: string;
	/** Whether to animate entrance */
	animate?: boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
	default: "bg-slate-700/60 text-slate-300 border-slate-600/60",
	primary: "bg-indigo-900/60 text-indigo-300 border-indigo-700/50",
	success: "bg-emerald-900/60 text-emerald-300 border-emerald-700/50",
	warning: "bg-yellow-900/60 text-yellow-300 border-yellow-700/50",
	error: "bg-red-900/60 text-red-300 border-red-700/50",
	info: "bg-blue-900/60 text-blue-300 border-blue-700/50",
	"severity-high": "severity-badge severity-high",
	"severity-medium": "severity-badge severity-medium",
	"severity-low": "severity-badge severity-low",
};

/**
 * A versatile badge component for labels, tags, and status indicators
 *
 * Features:
 * - Multiple color variants including severity levels
 * - Optional remove button
 * - Optional entrance animation
 */
export const Badge: React.FC<BadgeProps> = ({
	children,
	variant = "default",
	onRemove,
	className = "",
	animate = false,
}) => {
	const baseClasses = "badge border";
	const variantClass = variantClasses[variant];
	const animateClass = animate ? "animate-bounce-in" : "";
	const hoverClass = onRemove ? "hover:bg-purple-700/60" : "";

	return (
		<span
			className={`${baseClasses} ${variantClass} ${animateClass} ${hoverClass} ${className}`}
		>
			{children}
			{onRemove && (
				<button
					onClick={(e) => {
						e.stopPropagation();
						onRemove();
					}}
					className="ml-1.5 -mr-0.5 text-current opacity-60 hover:opacity-100 transition-opacity"
					aria-label="Remove"
				>
					<svg
						className="h-3 w-3"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			)}
		</span>
	);
};

/**
 * Pre-configured severity badge
 */
export const SeverityBadge: React.FC<{
	severity: number;
	className?: string;
}> = ({ severity, className }) => {
	// Thresholds: High (8-10), Medium (6-7), Low (5)
	let variant: BadgeVariant = "severity-low";
	if (severity >= 8) variant = "severity-high";
	else if (severity >= 6) variant = "severity-medium";

	return (
		<Badge variant={variant} className={className}>
			Severity {severity}
		</Badge>
	);
};
