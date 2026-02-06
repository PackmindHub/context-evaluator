import React, { useState } from "react";

interface StatCardProps {
	/** Label displayed above the value */
	label: string;
	/** The main value to display */
	value: string | number;
	/** Optional icon to display on the right */
	icon?: React.ReactNode;
	/** Additional class names for the card */
	className?: string;
	/** Optional tooltip content shown on hover */
	tooltip?: React.ReactNode;
}

/**
 * A card component for displaying statistics/metrics
 *
 * Features:
 * - Animated hover effects
 * - Optional icon
 * - Optional tooltip with detailed information
 */
export const StatCard: React.FC<StatCardProps> = ({
	label,
	value,
	icon,
	className = "",
	tooltip,
}) => {
	const [showTooltip, setShowTooltip] = useState(false);

	return (
		<div
			className={`card card-hover group ${className} relative ${showTooltip ? "z-50" : ""}`}
			onMouseEnter={() => tooltip && setShowTooltip(true)}
			onMouseLeave={() => setShowTooltip(false)}
		>
			<div className="flex items-start justify-between">
				<div className="flex-1">
					<p className="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">
						{label}
					</p>
					<p className="text-2xl font-bold text-slate-100 group-hover:text-gradient transition-all">
						{value}
					</p>
				</div>
				{icon && (
					<div className="ml-2 text-slate-600 group-hover:text-indigo-400 transition-colors">
						{icon}
					</div>
				)}
			</div>

			{/* Tooltip */}
			{tooltip && showTooltip && (
				<div className="absolute left-0 top-full mt-2 bg-slate-800 border border-slate-600 rounded-lg shadow-xl shadow-black/50 p-4 min-w-[300px] max-w-[500px] animate-fade-in">
					<div className="max-h-[400px] overflow-y-auto custom-scrollbar">
						{tooltip}
					</div>
				</div>
			)}
		</div>
	);
};
