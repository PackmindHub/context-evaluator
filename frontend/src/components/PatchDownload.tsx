/**
 * Patch download button component.
 */

import { useCallback, useState } from "react";
import { useEvaluationApi } from "../hooks/useEvaluationApi";

interface PatchDownloadProps {
	remediationId: string;
}

export function PatchDownload({ remediationId }: PatchDownloadProps) {
	const api = useEvaluationApi();
	const [downloading, setDownloading] = useState(false);

	const handleDownload = useCallback(async () => {
		setDownloading(true);
		try {
			await api.downloadPatch(remediationId);
		} catch {
			// Error is handled by the hook
		} finally {
			setDownloading(false);
		}
	}, [api, remediationId]);

	return (
		<button
			onClick={handleDownload}
			disabled={downloading}
			className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-slate-700/80 text-slate-200 border border-slate-600 hover:bg-indigo-700 hover:border-indigo-600 hover:text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
		>
			<svg
				className="w-3.5 h-3.5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
				/>
			</svg>
			{downloading ? "Downloading..." : "Download Patch"}
		</button>
	);
}
