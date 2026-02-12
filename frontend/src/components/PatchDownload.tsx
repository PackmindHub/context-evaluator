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
			className="btn-secondary flex items-center gap-2"
		>
			<svg
				className="w-4 h-4"
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
