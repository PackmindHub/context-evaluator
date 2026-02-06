import React from "react";

interface FilterChipProps {
	label: string;
	count: number;
	active: boolean;
	onClick: () => void;
}

export const FilterChip: React.FC<FilterChipProps> = ({
	label,
	count,
	active,
	onClick,
}) => {
	return (
		<button
			onClick={onClick}
			className={`w-full text-left filter-chip-button ${
				active ? "filter-chip-button-active" : ""
			}`}
		>
			<span className="text-sm text-slate-300 group-hover:text-slate-100">
				{label}
			</span>
			<span className="text-xs text-slate-500 ml-auto flex-shrink-0">
				{count}
			</span>
		</button>
	);
};
