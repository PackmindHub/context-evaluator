import type { IEvaluateRequest } from "@shared/types/api";
import type { EvaluationOutput, ProgressEvent } from "@shared/types/evaluation";
import React, { useCallback, useEffect, useState } from "react";
import { useEvaluation } from "../hooks/useEvaluation";
import { useSSE } from "../hooks/useSSE";
import { ProgressIndicator } from "./ProgressIndicator";

interface ILiveEvaluationProps {
	onEvaluationComplete?: (result: EvaluationOutput) => void;
}

/**
 * Live evaluation component with real-time progress tracking
 *
 * Features:
 * - Form to start new evaluation (repository URL or local path)
 * - Real-time progress via SSE (Server-Sent Events)
 * - Automatic result display on completion
 * - Error handling and retry
 */
export function LiveEvaluation({ onEvaluationComplete }: ILiveEvaluationProps) {
	// Form state
	const [inputType, setInputType] = useState<"url" | "path">("url");
	const [repositoryUrl, setRepositoryUrl] = useState("");
	const [localPath, setLocalPath] = useState("");
	const [evaluationMode, setEvaluationMode] = useState<
		"unified" | "independent"
	>("independent");
	const [concurrency, setConcurrency] = useState(2);

	// Evaluation hook
	const {
		loading,
		error,
		jobId,
		jobStatus,
		startEvaluation,
		fetchJobStatus,
		reset,
	} = useEvaluation();

	// SSE hook
	const { state: sseState, error: _sseError } = useSSE(
		jobStatus?.sseUrl || null,
		{
			onMessage: (event: ProgressEvent) => {
				console.log("[LiveEvaluation] Progress event:", event);

				// Refresh job status on certain events
				if (event.type === "job.completed" || event.type === "job.failed") {
					if (jobId) {
						fetchJobStatus(jobId);
					}
				}
			},
			onError: (err) => {
				console.error("[LiveEvaluation] SSE error:", err);
			},
		},
	);

	/**
	 * Handle form submission
	 */
	const handleSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();

			const request: IEvaluateRequest = {
				repositoryUrl:
					inputType === "url" && repositoryUrl ? repositoryUrl : undefined,
				localPath: inputType === "path" && localPath ? localPath : undefined,
				options: {
					evaluationMode,
					concurrency,
				},
			};

			// Validate input
			if (!request.repositoryUrl && !request.localPath) {
				alert("Please provide either a repository URL or local path");
				return;
			}

			// Start evaluation
			const result = await startEvaluation(request);

			if (result) {
				console.log("[LiveEvaluation] Evaluation started:", result);
			}
		},
		[
			inputType,
			repositoryUrl,
			localPath,
			evaluationMode,
			concurrency,
			startEvaluation,
		],
	);

	/**
	 * Handle new evaluation
	 */
	const handleNewEvaluation = useCallback(() => {
		reset();
		setRepositoryUrl("");
		setLocalPath("");
	}, [reset]);

	/**
	 * When evaluation completes, notify parent
	 */
	useEffect(() => {
		if (jobStatus?.status === "completed" && jobStatus.result) {
			onEvaluationComplete?.(jobStatus.result);
		}
	}, [jobStatus, onEvaluationComplete]);

	return (
		<div className="max-w-4xl mx-auto space-y-6">
			{/* Form */}
			{!jobId && (
				<div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
					<h2 className="text-xl font-bold text-gray-900 mb-4">
						Start New Evaluation
					</h2>

					<form onSubmit={handleSubmit} className="space-y-4">
						{/* Input type selector */}
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Source
							</label>
							<div className="flex gap-4">
								<label className="flex items-center">
									<input
										type="radio"
										name="inputType"
										value="url"
										checked={inputType === "url"}
										onChange={(e) => setInputType(e.target.value as "url")}
										className="mr-2"
									/>
									<span className="text-sm">Repository URL</span>
								</label>
								<label className="flex items-center">
									<input
										type="radio"
										name="inputType"
										value="path"
										checked={inputType === "path"}
										onChange={(e) => setInputType(e.target.value as "path")}
										className="mr-2"
									/>
									<span className="text-sm">Local Path</span>
								</label>
							</div>
						</div>

						{/* Repository URL input */}
						{inputType === "url" && (
							<div>
								<label
									htmlFor="repositoryUrl"
									className="block text-sm font-medium text-gray-700 mb-2"
								>
									Repository URL
								</label>
								<input
									type="url"
									id="repositoryUrl"
									value={repositoryUrl}
									onChange={(e) => setRepositoryUrl(e.target.value)}
									placeholder="https://github.com/username/repository"
									className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									required={inputType === "url"}
								/>
							</div>
						)}

						{/* Local path input */}
						{inputType === "path" && (
							<div>
								<label
									htmlFor="localPath"
									className="block text-sm font-medium text-gray-700 mb-2"
								>
									Local Path
								</label>
								<input
									type="text"
									id="localPath"
									value={localPath}
									onChange={(e) => setLocalPath(e.target.value)}
									placeholder="/absolute/path/to/repository"
									className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									required={inputType === "path"}
								/>
								<p className="mt-1 text-xs text-gray-500">
									Must be an absolute path accessible by the server
								</p>
							</div>
						)}

						{/* Evaluation mode */}
						<div>
							<label
								htmlFor="evaluationMode"
								className="block text-sm font-medium text-gray-700 mb-2"
							>
								Evaluation Mode
							</label>
							<select
								id="evaluationMode"
								value={evaluationMode}
								onChange={(e) =>
									setEvaluationMode(e.target.value as "unified" | "independent")
								}
								className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
							>
								<option value="independent">
									Independent (per-file evaluation)
								</option>
								<option value="unified">Unified (cross-file detection)</option>
							</select>
						</div>

						{/* Concurrency */}
						<div>
							<label
								htmlFor="concurrency"
								className="block text-sm font-medium text-gray-700 mb-2"
							>
								Concurrency: {concurrency}
							</label>
							<input
								type="range"
								id="concurrency"
								min="1"
								max="5"
								value={concurrency}
								onChange={(e) => setConcurrency(Number(e.target.value))}
								className="w-full"
							/>
							<p className="mt-1 text-xs text-gray-500">
								Number of evaluators to run concurrently
							</p>
						</div>

						{/* Submit button */}
						<button
							type="submit"
							disabled={loading}
							className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
						>
							{loading ? "Starting..." : "Start Evaluation"}
						</button>

						{/* Error display */}
						{error && (
							<div className="p-4 bg-red-50 border border-red-200 rounded-lg">
								<p className="text-sm text-red-800">{error.message}</p>
							</div>
						)}
					</form>
				</div>
			)}

			{/* Progress indicator */}
			{jobId && jobStatus && (
				<div className="space-y-6">
					<ProgressIndicator
						progress={jobStatus.progress}
						status={jobStatus.status}
						sseState={sseState}
						error={jobStatus.error}
					/>

					{/* New evaluation button */}
					{(jobStatus.status === "completed" ||
						jobStatus.status === "failed") && (
						<button
							onClick={handleNewEvaluation}
							className="w-full px-6 py-3 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-700 transition-colors"
						>
							Start New Evaluation
						</button>
					)}

					{/* Job info */}
					<div className="bg-gray-50 rounded-lg p-4 text-sm">
						<p className="text-gray-600">
							<span className="font-medium">Job ID:</span>{" "}
							<code className="text-xs">{jobId}</code>
						</p>
						{jobStatus.createdAt && (
							<p className="text-gray-600">
								<span className="font-medium">Started:</span>{" "}
								{new Date(jobStatus.createdAt).toLocaleString()}
							</p>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
