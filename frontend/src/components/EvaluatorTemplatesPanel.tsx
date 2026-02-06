import React, { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEvaluatorsApi } from "../hooks/useEvaluatorsApi";
import { useFinalPrompts } from "../hooks/useFinalPrompts";

interface EvaluatorTemplatesPanelProps {
	evaluationId?: string | null;
}

export const EvaluatorTemplatesPanel: React.FC<
	EvaluatorTemplatesPanelProps
> = ({ evaluationId = null }) => {
	const {
		evaluators,
		fetchEvaluatorsList,
		fetchTemplate,
		isLoading,
		error: templateError,
	} = useEvaluatorsApi();
	const {
		prompts: finalPrompts,
		isLoading: isLoadingPrompts,
		error: promptsError,
	} = useFinalPrompts(evaluationId);
	const [selectedEvaluator, setSelectedEvaluator] = useState<string>("");
	const [templateContent, setTemplateContent] = useState<string | null>(null);
	const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
	const [isCopied, setIsCopied] = useState(false);

	// Mode: "templates" before evaluation, "prompts" after evaluation
	const mode =
		evaluationId && Object.keys(finalPrompts).length > 0
			? "prompts"
			: "templates";

	// Build dropdown options based on mode
	const dropdownOptions = useMemo(() => {
		if (mode === "prompts") {
			// In prompts mode, show available prompt keys
			// Keys might be "evaluator" or "evaluator:filePath" for independent mode
			return Object.keys(finalPrompts).map((key) => {
				// Parse the key to get evaluator ID and optional file path
				const parts = key.split(":");
				const evaluatorId = parts[0]!;
				const filePath = parts[1];
				const evaluator = evaluators.find((e) => e.id === evaluatorId);
				const name = evaluator?.name || evaluatorId;
				const label = filePath
					? `${evaluatorId} - ${name} (${filePath})`
					: `${evaluatorId} - ${name}`;
				return { key, label, evaluatorId };
			});
		} else {
			// In templates mode, show all evaluators
			return evaluators.map((e) => ({
				key: e.id,
				label: `${e.id} - ${e.name}`,
				evaluatorId: e.id,
			}));
		}
	}, [mode, finalPrompts, evaluators]);

	// Fetch evaluators list on mount
	useEffect(() => {
		fetchEvaluatorsList().catch(console.error);
	}, [fetchEvaluatorsList]);

	// Reset selection when evaluationId changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: evaluationId is used as a trigger to reset state
	useEffect(() => {
		setSelectedEvaluator("");
		setTemplateContent(null);
	}, [evaluationId]);

	// Fetch content when selection changes
	useEffect(() => {
		if (!selectedEvaluator) {
			setTemplateContent(null);
			return;
		}

		if (mode === "prompts") {
			// Use final prompt from evaluation
			setTemplateContent(finalPrompts[selectedEvaluator] || null);
		} else {
			// Use template from API
			setIsLoadingTemplate(true);
			fetchTemplate(selectedEvaluator)
				.then((template) => {
					setTemplateContent(template.content);
				})
				.catch(console.error)
				.finally(() => {
					setIsLoadingTemplate(false);
				});
		}
	}, [selectedEvaluator, mode, finalPrompts, fetchTemplate]);
	/* eslint-enable react-hooks/set-state-in-effect */

	const handleEvaluatorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		setSelectedEvaluator(e.target.value);
	};

	const handleCopyPrompt = async () => {
		if (!templateContent) return;
		try {
			await navigator.clipboard.writeText(templateContent);
			setIsCopied(true);
			setTimeout(() => setIsCopied(false), 2000);
		} catch (err) {
			console.error("Failed to copy prompt:", err);
		}
	};

	// Get selected evaluator name for display
	const selectedOption = dropdownOptions.find(
		(opt) => opt.key === selectedEvaluator,
	);
	const selectedEvaluatorName = selectedOption?.label || "";

	const error = mode === "prompts" ? promptsError : templateError;
	const showLoading =
		isLoadingTemplate || (mode === "prompts" && isLoadingPrompts);

	// Header text based on mode
	const headerTitle =
		mode === "prompts"
			? "Final Evaluator Prompts"
			: "Evaluator Prompt Templates";
	const headerSubtitle =
		mode === "prompts"
			? "View the actual prompts sent to Claude for this evaluation"
			: "View the prompts used by each evaluator";

	return (
		<div className="card mt-6">
			{/* Header */}
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg">
						<svg
							className="w-5 h-5 text-white"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
							/>
						</svg>
					</div>
					<div>
						<h3 className="text-lg font-semibold text-slate-100">
							{headerTitle}
						</h3>
						<p className="text-xs text-slate-400">{headerSubtitle}</p>
					</div>
				</div>

				{/* Mode indicator badge */}
				{mode === "prompts" && (
					<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30">
						Final Prompts
					</span>
				)}

				{/* Dropdown */}
				<select
					className="input-field min-w-[280px]"
					value={selectedEvaluator}
					onChange={handleEvaluatorChange}
					disabled={isLoading || (mode === "prompts" && isLoadingPrompts)}
				>
					<option value="">
						{mode === "prompts"
							? "Select an evaluator prompt..."
							: "Select an evaluator..."}
					</option>
					{dropdownOptions.map((option) => (
						<option key={option.key} value={option.key}>
							{option.label}
						</option>
					))}
				</select>
			</div>

			{/* Content Area */}
			<div className="border border-slate-700 rounded-lg bg-slate-900/50 min-h-[200px] max-h-[600px] overflow-y-auto custom-scrollbar">
				{showLoading ? (
					<div className="flex items-center justify-center py-12">
						<div className="flex items-center gap-3 text-slate-400">
							<svg
								className="animate-spin h-5 w-5"
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
								/>
								<path
									className="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								/>
							</svg>
							<span>
								{mode === "prompts"
									? "Loading prompt..."
									: "Loading template..."}
							</span>
						</div>
					</div>
				) : error ? (
					<div className="flex items-center justify-center py-12">
						<div className="text-red-400 text-sm">{error}</div>
					</div>
				) : templateContent ? (
					<div className="p-6">
						<div className="mb-4 pb-4 border-b border-slate-700 flex items-center justify-between">
							<span className="text-xs font-semibold text-indigo-400 uppercase tracking-wide">
								{selectedEvaluatorName}
							</span>
							<button
								onClick={handleCopyPrompt}
								className="p-2 hover:bg-slate-700/50 rounded transition-colors"
								title={isCopied ? "Copied!" : "Copy prompt"}
							>
								{isCopied ? (
									<svg
										className="w-4 h-4 text-green-400"
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
								) : (
									<svg
										className="w-4 h-4 text-slate-400 hover:text-slate-200"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
										/>
									</svg>
								)}
							</button>
						</div>
						<div className="markdown-content">
							<ReactMarkdown remarkPlugins={[remarkGfm]}>
								{templateContent}
							</ReactMarkdown>
						</div>
					</div>
				) : (
					<div className="flex flex-col items-center justify-center py-12 text-slate-500">
						<svg
							className="w-12 h-12 mb-3 opacity-50"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={1.5}
								d="M8 9l4-4 4 4m0 6l-4 4-4-4"
							/>
						</svg>
						<p className="text-sm">
							{mode === "prompts"
								? "Select an evaluator to view its final prompt"
								: "Select an evaluator to view its prompt template"}
						</p>
					</div>
				)}
			</div>
		</div>
	);
};
