import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFeatureFlags } from "../contexts/FeatureFlagContext";
import type { ProviderName } from "../hooks/useEvaluationApi";
import { useEvaluatorsApi } from "../hooks/useEvaluatorsApi";
import { useProviderDetection } from "../hooks/useProviderDetection";
import { isValidGitUrl } from "../lib/url-validation";
import type { EvaluatorFilter } from "../types/evaluation";
import type { IEvaluator } from "../types/evaluator";

interface IRepositoryUrlInputProps {
	onSubmit: (
		url: string,
		evaluators: number,
		provider: ProviderName,
		evaluatorFilter: EvaluatorFilter,
		concurrency: number,
		selectedEvaluators?: string[],
	) => Promise<void>;
	isLoading: boolean;
	error?: string | null;
	disabled?: boolean;
}

/** Available AI providers */
const PROVIDERS: { name: ProviderName; displayName: string }[] = [
	{ name: "claude", displayName: "Claude Code" },
	{ name: "codex", displayName: "OpenAI Codex" },
	{ name: "opencode", displayName: "OpenCode" },
	{ name: "cursor", displayName: "Cursor Agent" },
	{ name: "github-copilot", displayName: "GitHub Copilot" },
];

export const RepositoryUrlInput: React.FC<IRepositoryUrlInputProps> = ({
	onSubmit,
	isLoading,
	error,
	disabled = false,
}) => {
	const { cloudMode } = useFeatureFlags();
	const { fetchEvaluatorsList } = useEvaluatorsApi();
	const {
		detectProviders,
		status: detectionStatus,
		getProviderStatus,
	} = useProviderDetection();
	const [url, setUrl] = useState("");
	const [concurrency, setConcurrency] = useState<number>(3);
	const [totalEvaluators, setTotalEvaluators] = useState<number>(17); // Default fallback
	const [evaluatorsList, setEvaluatorsList] = useState<IEvaluator[]>([]);
	const [selectedEvaluatorIds, setSelectedEvaluatorIds] = useState<Set<string>>(
		new Set(),
	);
	const [evaluatorDropdownOpen, setEvaluatorDropdownOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const [provider, setProvider] = useState<ProviderName>("claude");
	const [validationError, setValidationError] = useState<string | null>(null);

	// Fetch evaluators list on mount to get the total count and details
	useEffect(() => {
		fetchEvaluatorsList()
			.then((list) => {
				setTotalEvaluators(list.length);
				setEvaluatorsList(list);
				setSelectedEvaluatorIds(new Set(list.map((e) => e.id)));
			})
			.catch(() => {
				// Keep the fallback default
			});
	}, [fetchEvaluatorsList]);

	// Close dropdown on click outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setEvaluatorDropdownOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const validateUrl = useCallback((value: string): boolean => {
		if (!value.trim()) {
			setValidationError("Please enter a repository URL");
			return false;
		}

		if (!isValidGitUrl(value.trim())) {
			setValidationError(
				"Please enter a valid Git repository URL (supports GitHub, GitLab, Bitbucket, self-hosted)",
			);
			return false;
		}

		setValidationError(null);
		return true;
	}, []);

	const handleSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();

			if (!validateUrl(url)) {
				return;
			}

			try {
				// In cloud mode, use "random" sentinel to let backend pick an available provider
				const effectiveProvider = cloudMode ? "random" : provider;
				const isAllSelected =
					selectedEvaluatorIds.size === totalEvaluators ||
					selectedEvaluatorIds.size === 0;
				const selectedArray = isAllSelected
					? undefined
					: Array.from(selectedEvaluatorIds);
				await onSubmit(
					url.trim(),
					selectedArray ? selectedArray.length : totalEvaluators,
					effectiveProvider,
					"all",
					concurrency,
					cloudMode ? undefined : selectedArray,
				);
			} catch {
				// Error is handled by parent component
			}
		},
		[
			url,
			totalEvaluators,
			provider,
			selectedEvaluatorIds,
			concurrency,
			validateUrl,
			onSubmit,
			cloudMode,
		],
	);

	const handleInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = e.target.value;
			setUrl(value);
			if (validationError) {
				setValidationError(null);
			}
		},
		[validationError],
	);

	const displayError = validationError || error;

	/**
	 * Render an agent card with detection status
	 */
	const renderAgentCard = (
		name: ProviderName,
		displayName: string,
		getStartedUrl: string,
	) => {
		const providerStatus = getProviderStatus(name);
		const isDetecting = detectionStatus === "detecting";
		const hasResult = providerStatus !== undefined;
		const isAvailable = hasResult && providerStatus.available;
		const isUnavailable = hasResult && !providerStatus.available;

		// Determine card state classes
		let stateClass = "";
		if (isDetecting) {
			stateClass = "agent-card-detecting";
		} else if (isAvailable) {
			stateClass = "agent-card-available";
		} else if (isUnavailable) {
			stateClass = "agent-card-unavailable";
		}

		return (
			<div
				key={name}
				className={`relative flex flex-col items-center justify-center p-4 rounded-lg border border-slate-700/60 bg-slate-800/40 transition-all duration-200 ${stateClass}`}
			>
				{/* Status icon */}
				{isDetecting && (
					<svg
						className="agent-status-icon text-indigo-400 animate-spin"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
						/>
					</svg>
				)}
				{isAvailable && (
					<svg
						className="agent-status-icon text-green-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M5 13l4 4L19 7"
						/>
					</svg>
				)}
				{isUnavailable && (
					<svg
						className="agent-status-icon text-red-400"
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
				)}

				{/* Agent name */}
				<p className="text-sm font-medium text-slate-200 mb-2 text-center">
					{displayName}
				</p>

				{/* Status or Get Started link */}
				{isDetecting ? (
					<div className="flex items-center gap-1.5 text-xs text-indigo-400">
						<span>Checking...</span>
					</div>
				) : isAvailable ? (
					<div className="flex items-center gap-1.5 text-xs text-green-400">
						<span>Installed</span>
					</div>
				) : (
					<a
						href={getStartedUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-400 transition-colors"
					>
						<span>Get Started</span>
						<svg
							className="w-3.5 h-3.5"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
							/>
						</svg>
					</a>
				)}
			</div>
		);
	};

	return (
		<div className="w-full">
			<form onSubmit={handleSubmit}>
				<div className="glass-card p-4 gradient-border-hover transition-all duration-300">
					<div className="flex flex-col items-center py-2">
						{/* Text Content */}
						<div className="text-center mb-3">
							<p className="text-sm font-medium text-slate-200">
								Enter a Git repository URL to analyze
							</p>
						</div>

						{/* URL Input with focus glow */}
						<div className="w-full max-w-lg px-4 mb-3">
							<div className="relative">
								<div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
									<svg
										className="h-5 w-5 text-slate-500"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
										/>
									</svg>
								</div>
								<input
									type="url"
									value={url}
									onChange={handleInputChange}
									placeholder="Enter repository URL (GitHub, GitLab, Bitbucket, etc.)"
									disabled={disabled || isLoading}
									className={`
										w-full pl-12 pr-4 py-3.5 bg-slate-800/60 border rounded-xl
										text-slate-100 placeholder-slate-500
										focus:outline-none focus:border-indigo-500/70
										disabled:opacity-50 disabled:cursor-not-allowed
										transition-all duration-200
										${displayError ? "border-red-500/60" : "border-slate-600/60"}
									`}
									style={{
										boxShadow: "inset 0 2px 4px rgba(0,0,0,0.2)",
									}}
								/>
							</div>
						</div>

						{/* Options Row: Evaluator Selector, Provider, Concurrency - hidden in cloud mode */}
						{!cloudMode && (
							<div className="w-full max-w-lg px-4 mb-3">
								<div className="flex flex-wrap items-center justify-center gap-4">
									{/* Evaluator Multi-Select Dropdown */}
									<div
										className="flex items-center gap-2 relative"
										ref={dropdownRef}
									>
										<label className="text-sm text-slate-400 whitespace-nowrap">
											Evaluators:
										</label>
										<button
											type="button"
											onClick={() =>
												setEvaluatorDropdownOpen(!evaluatorDropdownOpen)
											}
											disabled={
												disabled || isLoading || evaluatorsList.length === 0
											}
											className="
												px-3 py-2 bg-slate-800/60 border border-slate-600/60 rounded-lg
												text-slate-200 text-sm
												focus:outline-none focus:border-indigo-500/70
												disabled:opacity-50 disabled:cursor-not-allowed
												transition-all duration-200 cursor-pointer
												flex items-center gap-1.5
											"
										>
											<span>
												{selectedEvaluatorIds.size}/{totalEvaluators}
											</span>
											<svg
												className={`w-3.5 h-3.5 transition-transform ${evaluatorDropdownOpen ? "rotate-180" : ""}`}
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M19 9l-7 7-7-7"
												/>
											</svg>
										</button>
										{evaluatorDropdownOpen && evaluatorsList.length > 0 && (
											<div className="absolute top-full left-0 mt-1 z-50 w-72 bg-slate-800 border border-slate-600/60 rounded-lg shadow-xl overflow-hidden">
												{/* Select All / Deselect All */}
												<div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/60">
													<button
														type="button"
														onClick={() =>
															setSelectedEvaluatorIds(
																new Set(evaluatorsList.map((e) => e.id)),
															)
														}
														className="text-xs text-indigo-400 hover:text-indigo-300"
													>
														Select All
													</button>
													<button
														type="button"
														onClick={() => {
															// Keep at least the first evaluator
															const first = evaluatorsList[0];
															if (first) {
																setSelectedEvaluatorIds(new Set([first.id]));
															}
														}}
														className="text-xs text-slate-400 hover:text-slate-300"
													>
														Deselect All
													</button>
												</div>
												<div className="max-h-64 overflow-y-auto">
													{/* Errors group */}
													{(() => {
														const errorEvals = evaluatorsList.filter(
															(e) => e.issueType === "error",
														);
														const allErrorsSelected = errorEvals.every((e) =>
															selectedEvaluatorIds.has(e.id),
														);
														const someErrorsSelected =
															!allErrorsSelected &&
															errorEvals.some((e) =>
																selectedEvaluatorIds.has(e.id),
															);
														return (
															<>
																<div
																	className="flex items-center gap-2 px-3 py-1.5 bg-slate-750 border-b border-slate-700/40 cursor-pointer hover:bg-slate-700/50"
																	onClick={() => {
																		setSelectedEvaluatorIds((prev) => {
																			const next = new Set(prev);
																			if (allErrorsSelected) {
																				// Deselect all errors, but ensure at least 1 evaluator remains
																				for (const e of errorEvals) {
																					next.delete(e.id);
																				}
																				if (next.size === 0) {
																					// Keep first suggestion or first error
																					const fallback =
																						evaluatorsList.find(
																							(e) =>
																								e.issueType === "suggestion",
																						) || errorEvals[0];
																					if (fallback)
																						next.add(fallback.id);
																				}
																			} else {
																				for (const e of errorEvals) {
																					next.add(e.id);
																				}
																			}
																			return next;
																		});
																	}}
																>
																	<input
																		type="checkbox"
																		checked={allErrorsSelected}
																		ref={(el) => {
																			if (el)
																				el.indeterminate =
																					someErrorsSelected;
																		}}
																		readOnly
																		className="rounded border-slate-500 text-indigo-500 focus:ring-0 cursor-pointer"
																	/>
																	<span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
																		Errors ({errorEvals.length})
																	</span>
																</div>
																{errorEvals.map((ev) => (
																	<label
																		key={ev.id}
																		className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700/40 cursor-pointer"
																	>
																		<input
																			type="checkbox"
																			checked={selectedEvaluatorIds.has(
																				ev.id,
																			)}
																			onChange={() => {
																				setSelectedEvaluatorIds((prev) => {
																					const next = new Set(prev);
																					if (next.has(ev.id)) {
																						if (next.size > 1)
																							next.delete(ev.id);
																					} else {
																						next.add(ev.id);
																					}
																					return next;
																				});
																			}}
																			className="rounded border-slate-500 text-indigo-500 focus:ring-0 cursor-pointer"
																		/>
																		<span className="text-sm text-slate-300 truncate">
																			{ev.name}
																		</span>
																	</label>
																))}
															</>
														);
													})()}
													{/* Suggestions group */}
													{(() => {
														const suggestionEvals = evaluatorsList.filter(
															(e) => e.issueType === "suggestion",
														);
														const allSuggestionsSelected =
															suggestionEvals.every((e) =>
																selectedEvaluatorIds.has(e.id),
															);
														const someSuggestionsSelected =
															!allSuggestionsSelected &&
															suggestionEvals.some((e) =>
																selectedEvaluatorIds.has(e.id),
															);
														return (
															<>
																<div
																	className="flex items-center gap-2 px-3 py-1.5 bg-slate-750 border-b border-t border-slate-700/40 cursor-pointer hover:bg-slate-700/50"
																	onClick={() => {
																		setSelectedEvaluatorIds((prev) => {
																			const next = new Set(prev);
																			if (allSuggestionsSelected) {
																				for (const e of suggestionEvals) {
																					next.delete(e.id);
																				}
																				if (next.size === 0) {
																					const fallback =
																						evaluatorsList.find(
																							(e) =>
																								e.issueType === "error",
																						) || suggestionEvals[0];
																					if (fallback)
																						next.add(fallback.id);
																				}
																			} else {
																				for (const e of suggestionEvals) {
																					next.add(e.id);
																				}
																			}
																			return next;
																		});
																	}}
																>
																	<input
																		type="checkbox"
																		checked={allSuggestionsSelected}
																		ref={(el) => {
																			if (el)
																				el.indeterminate =
																					someSuggestionsSelected;
																		}}
																		readOnly
																		className="rounded border-slate-500 text-indigo-500 focus:ring-0 cursor-pointer"
																	/>
																	<span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
																		Suggestions ({suggestionEvals.length})
																	</span>
																</div>
																{suggestionEvals.map((ev) => (
																	<label
																		key={ev.id}
																		className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-700/40 cursor-pointer"
																	>
																		<input
																			type="checkbox"
																			checked={selectedEvaluatorIds.has(
																				ev.id,
																			)}
																			onChange={() => {
																				setSelectedEvaluatorIds((prev) => {
																					const next = new Set(prev);
																					if (next.has(ev.id)) {
																						if (next.size > 1)
																							next.delete(ev.id);
																					} else {
																						next.add(ev.id);
																					}
																					return next;
																				});
																			}}
																			className="rounded border-slate-500 text-indigo-500 focus:ring-0 cursor-pointer"
																		/>
																		<span className="text-sm text-slate-300 truncate">
																			{ev.name}
																		</span>
																	</label>
																))}
															</>
														);
													})()}
												</div>
											</div>
										)}
									</div>

									{/* Provider Selector */}
									<div className="flex items-center gap-2">
										<label
											htmlFor="provider"
											className="text-sm text-slate-400 whitespace-nowrap"
										>
											Agent:
										</label>
										<select
											id="provider"
											value={provider}
											onChange={(e) =>
												setProvider(e.target.value as ProviderName)
											}
											disabled={disabled || isLoading}
											className="
												px-3 py-2 bg-slate-800/60 border border-slate-600/60 rounded-lg
												text-slate-200 text-sm
												focus:outline-none focus:border-indigo-500/70
												disabled:opacity-50 disabled:cursor-not-allowed
												transition-all duration-200 cursor-pointer
											"
										>
											{PROVIDERS.map((p) => (
												<option key={p.name} value={p.name}>
													{p.displayName}
												</option>
											))}
										</select>
									</div>

									{/* Concurrency Selector */}
									<div className="flex items-center gap-2">
										<label
											htmlFor="concurrency"
											className="text-sm text-slate-400 whitespace-nowrap"
										>
											Concurrency:
										</label>
										<select
											id="concurrency"
											value={concurrency}
											onChange={(e) => setConcurrency(Number(e.target.value))}
											disabled={disabled || isLoading}
											className="
												px-3 py-2 bg-slate-800/60 border border-slate-600/60 rounded-lg
												text-slate-200 text-sm
												focus:outline-none focus:border-indigo-500/70
												disabled:opacity-50 disabled:cursor-not-allowed
												transition-all duration-200 cursor-pointer
											"
										>
											{[1, 2, 3, 4, 5].map((n) => (
												<option key={n} value={n}>
													{n}
												</option>
											))}
										</select>
									</div>
								</div>
							</div>
						)}

						{/* Submit Button */}
						<button
							type="submit"
							disabled={disabled || isLoading || !url.trim()}
							className="btn-primary px-8 py-3 text-base cursor-pointer"
						>
							<div className="flex items-center gap-2">
								{isLoading ? (
									<>
										<svg
											className="w-5 h-5 animate-spin"
											fill="none"
											viewBox="0 0 24 24"
										>
											<circle
												className="opacity-25"
												cx="12"
												cy="12"
												r="10"
												stroke="currentColor"
												strokeWidth="4"
											></circle>
											<path
												className="opacity-75"
												fill="currentColor"
												d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
											></path>
										</svg>
										<span>Starting Evaluation...</span>
									</>
								) : (
									<>
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
												d="M13 10V3L4 14h7v7l9-11h-7z"
											/>
										</svg>
										<span>Start Evaluation</span>
									</>
								)}
							</div>
						</button>
					</div>
				</div>
			</form>

			{/* AI Agents Compatibility Section - hidden in cloud mode */}
			{!cloudMode && (
				<div className="mt-6 info-section">
					<div className="flex items-start gap-3 mb-4">
						<svg
							className="info-section-icon"
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
						<div className="flex-1">
							<div className="flex items-center justify-between mb-1">
								<p className="info-section-header">Required Setup</p>
								<button
									type="button"
									onClick={detectProviders}
									disabled={detectionStatus === "detecting"}
									className="btn-secondary text-xs py-1 px-3 flex items-center gap-1.5"
								>
									{detectionStatus === "detecting" ? (
										<>
											<svg
												className="w-3.5 h-3.5 animate-spin"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
												/>
											</svg>
											<span>Detecting...</span>
										</>
									) : (
										<>
											<svg
												className="w-3.5 h-3.5"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
												/>
											</svg>
											<span>Auto-detect</span>
										</>
									)}
								</button>
							</div>
							<p className="info-section-content">
								You need at least one of these AI agents installed on your
								machine
							</p>
						</div>
					</div>

					{/* Agent Cards Grid */}
					<div className="grid grid-cols-2 md:grid-cols-5 gap-3">
						{renderAgentCard(
							"claude",
							"Claude Code",
							"https://claude.com/product/claude-code",
						)}
						{renderAgentCard(
							"codex",
							"OpenAI Codex",
							"https://docs.openai.com/codex",
						)}
						{renderAgentCard(
							"github-copilot",
							"Copilot CLI",
							"https://github.com/features/copilot/cli",
						)}
						{renderAgentCard("cursor", "Cursor CLI", "https://cursor.com/cli")}
						{renderAgentCard(
							"opencode",
							"OpenCode",
							"https://opencode.ai/download",
						)}
					</div>
				</div>
			)}

			{/* Error Display */}
			{displayError && (
				<div className="mt-4 glass-card p-4 border-red-700/40 animate-slide-up">
					<div className="flex items-start gap-3">
						<div className="w-8 h-8 bg-gradient-to-br from-red-500 to-rose-600 rounded-lg flex items-center justify-center flex-shrink-0">
							<svg
								className="h-5 w-5 text-white"
								fill="currentColor"
								viewBox="0 0 20 20"
							>
								<path
									fillRule="evenodd"
									d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
									clipRule="evenodd"
								/>
							</svg>
						</div>
						<div>
							<p className="font-semibold text-red-300 text-sm mb-1">Error</p>
							<p className="text-sm text-red-400/90">{displayError}</p>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
