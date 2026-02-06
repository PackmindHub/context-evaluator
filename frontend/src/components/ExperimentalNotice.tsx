import React, { useEffect, useState } from "react";

export const ExperimentalNotice: React.FC = () => {
	const [isDismissed, setIsDismissed] = useState(false);

	useEffect(() => {
		const dismissed = localStorage.getItem("experimental-notice-dismissed");
		if (dismissed === "true") {
			setIsDismissed(true);
		}
	}, []);

	const handleDismiss = () => {
		localStorage.setItem("experimental-notice-dismissed", "true");
		setIsDismissed(true);
	};

	if (isDismissed) return null;

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

				{/* Dismiss button */}
				<button
					onClick={handleDismiss}
					className="flex-shrink-0 p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
					aria-label="Dismiss notice"
					type="button"
				>
					<svg
						className="w-5 h-5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>
		</div>
	);
};
