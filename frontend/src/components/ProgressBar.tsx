import React from "react";

interface IProgressBarProps {
	percentage: number;
	animated?: boolean;
	size?: "sm" | "md" | "lg";
	showLabel?: boolean;
	color?: "blue" | "green" | "purple";
}

export const ProgressBar: React.FC<IProgressBarProps> = ({
	percentage,
	animated = true,
	size = "md",
	showLabel = true,
	color = "blue",
}) => {
	const clampedPercentage = Math.min(100, Math.max(0, percentage));

	const sizeClasses = {
		sm: "h-1.5",
		md: "h-2.5",
		lg: "h-4",
	};

	const colorClasses = {
		blue: "from-blue-500 to-indigo-500",
		green: "from-green-500 to-emerald-500",
		purple: "from-indigo-500 to-pink-500",
	};

	return (
		<div className="w-full">
			<div
				className={`
          w-full bg-slate-700/50 rounded-full overflow-hidden
          ${sizeClasses[size]}
        `}
			>
				<div
					className={`
            h-full bg-gradient-to-r ${colorClasses[color]} rounded-full
            transition-all duration-500 ease-out
            ${animated && clampedPercentage > 0 && clampedPercentage < 100 ? "progress-bar-animated" : ""}
          `}
					style={{ width: `${clampedPercentage}%` }}
				/>
			</div>
			{showLabel && (
				<div className="flex justify-end mt-1">
					<span className="text-xs text-slate-400 font-medium">
						{Math.round(clampedPercentage)}%
					</span>
				</div>
			)}
		</div>
	);
};
