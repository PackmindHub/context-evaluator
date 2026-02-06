import { useNavigate } from "react-router-dom";
import { extractRepoName, formatElapsedTime } from "../lib/formatters";
import type { JobStatus } from "../types/job";

interface IActiveJobCardProps {
	jobId: string;
	status: JobStatus;
	repositoryUrl?: string;
	createdAt: string;
	startedAt?: string;
	progress?: {
		totalFiles: number;
		completedFiles: number;
		completedEvaluators: number;
		totalEvaluators: number;
	};
}

export function ActiveJobCard({
	jobId,
	status,
	repositoryUrl,
	createdAt,
	startedAt,
	progress,
}: IActiveJobCardProps) {
	const navigate = useNavigate();

	// Calculate elapsed time
	const startTime = startedAt || createdAt;
	const elapsedMs = Date.now() - new Date(startTime).getTime();

	// Calculate progress percentage for running jobs
	let progressPercentage = 0;
	if (status === "running" && progress) {
		const { completedEvaluators, totalEvaluators } = progress;
		if (totalEvaluators > 0) {
			progressPercentage = Math.round(
				(completedEvaluators / totalEvaluators) * 100,
			);
		}
	}

	const handleClick = () => {
		navigate(`/evaluation/${jobId}`);
	};

	const repoName = repositoryUrl
		? extractRepoName(repositoryUrl)
		: "Local Path";

	return (
		<div
			role="button"
			tabIndex={0}
			onClick={handleClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					handleClick();
				}
			}}
			className="w-full px-6 py-4 text-left hover:bg-slate-700/30 transition-colors group cursor-pointer"
		>
			<div className="flex items-center justify-between gap-4">
				{/* Left side: Status dot + Repo name */}
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-3">
						{/* Status indicator */}
						{status === "running" ? (
							<span
								className="status-dot-running w-3 h-3 bg-indigo-500 rounded-full flex-shrink-0"
								title="Running"
							/>
						) : (
							<span
								className="status-dot-queued w-3 h-3 rounded-full flex-shrink-0"
								title="Queued"
							/>
						)}
						{/* Repo name */}
						<span className="text-lg font-medium text-slate-100 truncate">
							{repoName}
						</span>
					</div>

					{/* Metadata row */}
					<div className="flex items-center gap-4 mt-2 text-sm text-slate-400">
						<span>{formatElapsedTime(elapsedMs)}</span>
						{status === "running" && progress && (
							<>
								<span className="text-slate-600">|</span>
								<span>
									{progress.completedEvaluators}/{progress.totalEvaluators}{" "}
									evaluators
								</span>
							</>
						)}
					</div>
				</div>

				{/* Right side: Status badge + Progress */}
				<div className="flex items-center gap-4">
					{status === "running" ? (
						<div className="flex items-center gap-3">
							{/* Progress bar */}
							<div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
								<div
									className="h-full bg-indigo-500 rounded-full transition-all duration-300 progress-bar-animated"
									style={{ width: `${progressPercentage}%` }}
								/>
							</div>
							<span className="text-sm font-medium text-indigo-400 min-w-[3rem] text-right">
								{progressPercentage}%
							</span>
						</div>
					) : (
						<span className="text-sm text-slate-400">Waiting...</span>
					)}

					{/* Arrow indicator */}
					<svg
						className="w-5 h-5 text-slate-500 group-hover:text-slate-300 transition-colors"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M9 5l7 7-7 7"
						/>
					</svg>
				</div>
			</div>
		</div>
	);
}
