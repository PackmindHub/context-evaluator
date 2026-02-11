import { useCallback, useMemo, useState } from "react";
import type { RemediationPromptsResponse } from "../hooks/useEvaluationApi";
import { useEvaluationApi } from "../hooks/useEvaluationApi";
import type { EvaluationOutput, Issue } from "../types/evaluation";
import {
	getImpactBadgeClass,
	getImpactLabel,
	getIssueSeverity,
	getIssueType,
	getSeverityColor,
	getSeverityLevel,
} from "../types/evaluation";
import { CopyButton } from "./shared/CopyButton";

interface RemediateTabProps {
	evaluationId: string | null;
	evaluationData: EvaluationOutput | null;
	selectedIssueKeys: Set<string>;
	issueKeyMap: Map<string, Issue>;
	onRemoveIssue: (key: string) => void;
	onClearAll: () => void;
}

export function RemediateTab({
	evaluationId,
	evaluationData,
	selectedIssueKeys,
	issueKeyMap,
	onRemoveIssue,
	onClearAll,
}: RemediateTabProps) {
	const api = useEvaluationApi();

	const [targetFileType, setTargetFileType] = useState<
		"AGENTS.md" | "CLAUDE.md"
	>("AGENTS.md");
	const [isGenerating, setIsGenerating] = useState(false);
	const [generateError, setGenerateError] = useState<string | null>(null);
	const [prompts, setPrompts] = useState<RemediationPromptsResponse | null>(
		null,
	);

	// Resolve selected issue keys to actual issues, split by type
	const { errorEntries, suggestionEntries } = useMemo(() => {
		const errors: { key: string; issue: Issue }[] = [];
		const suggestions: { key: string; issue: Issue }[] = [];

		for (const key of selectedIssueKeys) {
			const issue = issueKeyMap.get(key);
			if (!issue) continue;
			const type = getIssueType(issue);
			if (type === "error") {
				errors.push({ key, issue });
			} else {
				suggestions.push({ key, issue });
			}
		}

		// Sort errors by severity descending, suggestions by impact
		errors.sort(
			(a, b) => getIssueSeverity(b.issue) - getIssueSeverity(a.issue),
		);
		const impactOrder: Record<string, number> = {
			High: 0,
			Medium: 1,
			Low: 2,
		};
		suggestions.sort(
			(a, b) =>
				(impactOrder[a.issue.impactLevel ?? "Low"] ?? 2) -
				(impactOrder[b.issue.impactLevel ?? "Low"] ?? 2),
		);

		return { errorEntries: errors, suggestionEntries: suggestions };
	}, [selectedIssueKeys, issueKeyMap]);

	const totalSelected = errorEntries.length + suggestionEntries.length;

	const handleGenerate = useCallback(async () => {
		if (!evaluationId || totalSelected === 0) return;

		setIsGenerating(true);
		setGenerateError(null);

		try {
			const issues = [
				...errorEntries.map((e) => e.issue),
				...suggestionEntries.map((e) => e.issue),
			];
			const result = await api.generateRemediationPrompts(
				evaluationId,
				issues,
				targetFileType,
			);
			setPrompts(result);
		} catch (err) {
			setGenerateError(
				err instanceof Error ? err.message : "Failed to generate prompts",
			);
		} finally {
			setIsGenerating(false);
		}
	}, [
		evaluationId,
		totalSelected,
		errorEntries,
		suggestionEntries,
		targetFileType,
		api,
	]);

	if (!evaluationData) {
		return (
			<div className="card text-center py-12">
				<p className="text-body-muted">
					No evaluation data. Run an evaluation first to generate remediation
					prompts.
				</p>
			</div>
		);
	}

	if (totalSelected === 0) {
		return (
			<div className="space-y-6">
				{/* Header */}
				<div className="card">
					<h2 className="text-heading text-slate-100">Remediation Prompts</h2>
					<p className="text-body-muted mt-1">
						Generate prompts to fix issues with your AI coding agent
					</p>
				</div>

				<div className="card text-center py-12">
					<svg
						className="w-12 h-12 text-slate-600 mx-auto mb-4"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={1.5}
							d="M12 4v16m8-8H4"
						/>
					</svg>
					<p className="text-body-muted">
						No issues selected. Use the{" "}
						<span className="inline-flex items-center justify-center w-5 h-5 rounded bg-slate-700 text-slate-300 text-xs align-middle mx-0.5">
							+
						</span>{" "}
						button on issue cards in the Errors and Suggestions tabs.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="card">
				<h2 className="text-heading text-slate-100">Remediation Prompts</h2>
				<p className="text-body-muted mt-1">
					Generate prompts to fix issues with your AI coding agent
				</p>
			</div>

			{/* Configuration */}
			<div className="card space-y-5">
				{/* Target File Type */}
				<div>
					<label className="text-label text-slate-300 block mb-2">
						Target file type
					</label>
					<div className="flex gap-2">
						<button
							onClick={() => setTargetFileType("AGENTS.md")}
							className={`px-3 py-1.5 rounded text-sm transition-colors ${
								targetFileType === "AGENTS.md"
									? "bg-blue-600 text-white"
									: "bg-slate-700 text-slate-300 hover:bg-slate-600"
							}`}
						>
							AGENTS.md
						</button>
						<button
							onClick={() => setTargetFileType("CLAUDE.md")}
							className={`px-3 py-1.5 rounded text-sm transition-colors ${
								targetFileType === "CLAUDE.md"
									? "bg-blue-600 text-white"
									: "bg-slate-700 text-slate-300 hover:bg-slate-600"
							}`}
						>
							CLAUDE.md
						</button>
					</div>
				</div>

				{/* Selected Issues List */}
				<div className="space-y-4">
					{/* Errors Section */}
					{errorEntries.length > 0 && (
						<IssueSection
							title="Errors"
							count={errorEntries.length}
							entries={errorEntries}
							onRemove={onRemoveIssue}
						/>
					)}

					{/* Suggestions Section */}
					{suggestionEntries.length > 0 && (
						<IssueSection
							title="Suggestions"
							count={suggestionEntries.length}
							entries={suggestionEntries}
							onRemove={onRemoveIssue}
						/>
					)}

					{/* Clear all link */}
					<div className="flex items-center justify-between">
						<span className="text-caption">
							{totalSelected} issue{totalSelected !== 1 ? "s" : ""} selected
						</span>
						<button
							onClick={onClearAll}
							className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
						>
							Clear all
						</button>
					</div>
				</div>

				{/* Generate Button */}
				<button
					onClick={handleGenerate}
					disabled={isGenerating}
					className="btn-primary w-full sm:w-auto"
				>
					{isGenerating ? (
						<span className="flex items-center gap-2">
							<svg
								className="animate-spin h-4 w-4"
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
							Generating...
						</span>
					) : (
						`Generate Prompts (${totalSelected})`
					)}
				</button>

				{generateError && (
					<p className="text-sm text-red-400 mt-2">{generateError}</p>
				)}
			</div>

			{/* Generated Prompts */}
			{prompts && (
				<div className="space-y-6">
					{prompts.errorFixPrompt && (
						<PromptDisplay
							title={`Fix Errors Prompt (${prompts.errorCount} issues)`}
							content={prompts.errorFixPrompt}
						/>
					)}
					{prompts.suggestionEnrichPrompt && (
						<PromptDisplay
							title={`Enrich Suggestions Prompt (${prompts.suggestionCount} issues)`}
							content={prompts.suggestionEnrichPrompt}
						/>
					)}
				</div>
			)}
		</div>
	);
}

function IssueSection({
	title,
	count,
	entries,
	onRemove,
}: {
	title: string;
	count: number;
	entries: { key: string; issue: Issue }[];
	onRemove: (key: string) => void;
}) {
	return (
		<div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-3">
			<div className="flex items-center justify-between mb-2">
				<span className="text-sm font-semibold text-slate-200">
					{title} ({count})
				</span>
			</div>
			<div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
				{entries.map(({ key, issue }) => {
					const numericSeverity = getIssueSeverity(issue);
					const severityLevel = getSeverityLevel(numericSeverity);
					const issueTitle =
						issue.title || issue.problem || issue.description || issue.category;

					return (
						<div
							key={key}
							className="flex items-center gap-2 py-1 px-1 rounded hover:bg-slate-700/30 group"
						>
							{/* Severity dot */}
							<div
								className={`severity-dot severity-dot-${severityLevel} flex-shrink-0`}
							/>

							{/* Severity/Impact badge */}
							<div className="flex-shrink-0 w-[72px]">
								{issue.issueType === "error" ? (
									<span className={getSeverityColor(issue.severity)}>
										{severityLevel.charAt(0).toUpperCase() +
											severityLevel.slice(1)}
									</span>
								) : (
									<span className={getImpactBadgeClass(issue.impactLevel)}>
										{getImpactLabel(issue.impactLevel)}
									</span>
								)}
							</div>

							{/* Title - truncated */}
							<span className="flex-1 min-w-0 text-sm text-slate-300 truncate">
								{issueTitle}
							</span>

							{/* Evaluator name */}
							{issue.evaluatorName && (
								<span className="flex-shrink-0 text-xs text-slate-500 hidden sm:block">
									{issue.evaluatorName}
								</span>
							)}

							{/* Remove button */}
							<button
								onClick={() => onRemove(key)}
								className="flex-shrink-0 text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
								title="Remove from remediation"
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
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function PromptDisplay({ title, content }: { title: string; content: string }) {
	return (
		<div className="card">
			<div className="flex items-center justify-between mb-3">
				<h3 className="text-subheading text-slate-200">{title}</h3>
				<CopyButton text={content} variant="text" />
			</div>
			<div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50 font-mono text-xs text-slate-300 max-h-96 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
				{content}
			</div>
		</div>
	);
}
