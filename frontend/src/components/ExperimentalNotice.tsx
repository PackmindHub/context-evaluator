import React from "react";

export const ExperimentalNotice: React.FC = () => {
	return (
		<div className="experimental-notice">
			<div className="flex items-start gap-3">
				{/* Info icon */}
				<svg
					className="experimental-notice-icon"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>

				{/* Content */}
				<div className="flex-1">
					<h3 className="text-subheading mb-2">Experimental Project</h3>
					<p className="text-body">
						This tool is under active development. Features may change, and
						results may vary. We welcome your feedback to improve quality.
					</p>
				</div>
			</div>
		</div>
	);
};
