import React from "react";

interface SelectionSummaryBarProps {
	selectedCount: number;
	onClearSelection: () => void;
	onReviewSelected: () => void;
}

export const SelectionSummaryBar: React.FC<SelectionSummaryBarProps> = ({
	selectedCount,
	onClearSelection,
	onReviewSelected,
}) => {
	if (selectedCount === 0) {
		return null;
	}

	return (
		<div className="selection-summary-bar">
			<div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between">
				{/* Left: Count */}
				<div className="flex items-center gap-2">
					<div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
					<span className="text-sm text-slate-300">
						<span className="font-medium text-slate-100">{selectedCount}</span>{" "}
						{selectedCount === 1 ? "issue" : "issues"} selected
					</span>
				</div>

				{/* Right: Action buttons */}
				<div className="flex items-center gap-3">
					<button
						onClick={onClearSelection}
						className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
					>
						Clear
					</button>
					<button
						onClick={onReviewSelected}
						className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-400 hover:text-purple-300 transition-colors"
						aria-label={`Remediate ${selectedCount} selected issue${selectedCount === 1 ? "" : "s"}`}
					>
						<svg
							className="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M13 10V3L4 14h7v7l9-11h-7z"
							/>
						</svg>
						Remediate
					</button>
				</div>
			</div>
		</div>
	);
};
