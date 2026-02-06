import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import type {
	EvaluationOutput,
	IndependentEvaluationOutput,
	Issue,
	UnifiedEvaluationOutput,
} from "@shared/types/evaluation";
import { isIndependentFormat, isUnifiedFormat } from "@shared/types/evaluation";
import { getSeverityLevel, parseEvaluatorResult } from "@shared/types/issues";
import { EmptyState } from "./components/EmptyState";
import { FileUpload } from "./components/FileUpload";
import { FilterPanel, type FilterState } from "./components/FilterPanel";
import { IssuesList } from "./components/IssuesList";
import { LiveEvaluation } from "./components/LiveEvaluation";
import { Summary } from "./components/Summary";
import type { Issue as WebIssue } from "./types/evaluation";

type TabType = "live" | "upload";

function App() {
	const [activeTab, setActiveTab] = useState<TabType>("live");
	const [evaluationData, setEvaluationData] = useState<EvaluationOutput | null>(
		null,
	);
	const [filters, setFilters] = useState<FilterState>({
		severities: new Set(),
		categories: new Set(),
		evaluators: new Set(),
		searchText: "",
	});

	// Parse all issues from evaluation data
	const allIssues = useMemo(() => {
		if (!evaluationData) return [];

		const issues: Array<Issue & { evaluatorName?: string }> = [];

		if (isUnifiedFormat(evaluationData)) {
			// Unified format: results array
			const unifiedData = evaluationData as UnifiedEvaluationOutput;
			for (const result of unifiedData.results) {
				if (result.output && result.output.result) {
					const parsedIssues = parseEvaluatorResult(result.output.result);
					parsedIssues.forEach((issue) => {
						issues.push({ ...issue, evaluatorName: result.evaluator });
					});
				}
			}
		} else if (isIndependentFormat(evaluationData)) {
			// Independent format: files object
			const independentData = evaluationData as IndependentEvaluationOutput;
			for (const [_filePath, fileResult] of Object.entries(
				independentData.files,
			)) {
				for (const evaluation of (
					fileResult as {
						evaluations: Array<{
							evaluator: string;
							output?: { result?: string };
						}>;
					}
				).evaluations) {
					if (evaluation.output && evaluation.output.result) {
						const parsedIssues = parseEvaluatorResult(evaluation.output.result);
						parsedIssues.forEach((issue) => {
							issues.push({ ...issue, evaluatorName: evaluation.evaluator });
						});
					}
				}
			}

			// Add cross-file issues
			if (independentData.crossFileIssues) {
				issues.push(
					...independentData.crossFileIssues.map((issue) => ({
						...issue,
						evaluatorName: "cross-file",
					})),
				);
			}
		}

		return issues;
	}, [evaluationData]);

	// Calculate severity counts from actual issues
	const { highCount, mediumCount } = useMemo(() => {
		const counts = { high: 0, medium: 0 };
		allIssues.forEach((issue) => {
			const level = getSeverityLevel(issue.severity ?? 0);
			if (level === "high") counts.high++;
			else if (level === "medium") counts.medium++;
		});
		return {
			highCount: counts.high,
			mediumCount: counts.medium,
		};
	}, [allIssues]);

	// Calculate per-file vs cross-file issue counts
	const { perFileIssueCount, crossFileIssueCount } = useMemo(() => {
		if (!evaluationData)
			return { perFileIssueCount: 0, crossFileIssueCount: 0 };

		if (isIndependentFormat(evaluationData)) {
			const independentData = evaluationData as IndependentEvaluationOutput;
			const crossFile = independentData.crossFileIssues?.length || 0;
			const perFile = allIssues.length - crossFile;
			return { perFileIssueCount: perFile, crossFileIssueCount: crossFile };
		}

		// For unified format, all issues are considered per-file
		return { perFileIssueCount: allIssues.length, crossFileIssueCount: 0 };
	}, [evaluationData, allIssues]);

	// Extract unique categories and evaluators
	const { availableCategories, availableEvaluators } = useMemo(() => {
		const categories = new Set<string>();
		const evaluators = new Set<string>();

		allIssues.forEach((issue) => {
			if (issue.category) categories.add(issue.category);
			if (issue.evaluatorName) evaluators.add(issue.evaluatorName);
		});

		return {
			availableCategories: Array.from(categories).sort(),
			availableEvaluators: Array.from(evaluators).sort(),
		};
	}, [allIssues]);

	// Filter issues based on active filters
	const filteredIssues = useMemo(() => {
		return allIssues.filter((issue) => {
			// Severity filter
			if (filters.severities.size > 0) {
				const severityLevel = getSeverityLevel(issue.severity ?? 0);
				if (!filters.severities.has(severityLevel)) {
					return false;
				}
			}

			// Category filter
			if (filters.categories.size > 0 && issue.category) {
				if (!filters.categories.has(issue.category)) {
					return false;
				}
			}

			// Evaluator filter
			if (filters.evaluators.size > 0 && issue.evaluatorName) {
				if (!filters.evaluators.has(issue.evaluatorName)) {
					return false;
				}
			}

			// Search text filter
			if (filters.searchText) {
				const searchLower = filters.searchText.toLowerCase();
				const searchableText = [
					issue.title,
					issue.category,
					issue.description,
					issue.problem,
					issue.fix,
					issue.recommendation,
					issue.suggestion,
				]
					.filter(Boolean)
					.join(" ")
					.toLowerCase();

				if (!searchableText.includes(searchLower)) {
					return false;
				}
			}

			return true;
		});
	}, [allIssues, filters]);

	// Group issues by evaluator for display
	const groupedIssues = useMemo(() => {
		const grouped: Record<string, Issue[]> = {};
		filteredIssues.forEach((issue) => {
			const evaluator = issue.evaluatorName || "unknown";
			if (!grouped[evaluator]) {
				grouped[evaluator] = [];
			}
			grouped[evaluator].push(issue);
		});
		return grouped;
	}, [filteredIssues]);

	const handleFileLoad = (data: EvaluationOutput) => {
		// Aggregate cost and duration data from evaluator results
		if (isUnifiedFormat(data)) {
			const unifiedData = data as UnifiedEvaluationOutput;
			let totalCostUsd = 0;
			let totalDurationMs = 0;
			let totalInputTokens = 0;
			let totalOutputTokens = 0;
			let totalCacheCreationTokens = 0;
			let totalCacheReadTokens = 0;

			for (const result of unifiedData.results) {
				if (result.output) {
					totalCostUsd += result.output.total_cost_usd || 0;
					totalDurationMs += result.output.duration_ms || 0;
					totalInputTokens += result.output.usage.input_tokens || 0;
					totalOutputTokens += result.output.usage.output_tokens || 0;
					totalCacheCreationTokens +=
						result.output.usage.cache_creation_input_tokens || 0;
					totalCacheReadTokens +=
						result.output.usage.cache_read_input_tokens || 0;
				}
			}

			// Add aggregated data to metadata
			unifiedData.metadata.totalCostUsd = totalCostUsd;
			unifiedData.metadata.totalDurationMs = totalDurationMs;
			unifiedData.metadata.totalInputTokens = totalInputTokens;
			unifiedData.metadata.totalOutputTokens = totalOutputTokens;
			unifiedData.metadata.totalCacheCreationTokens = totalCacheCreationTokens;
			unifiedData.metadata.totalCacheReadTokens = totalCacheReadTokens;
		}

		setEvaluationData(data);
		// Reset filters when new data is loaded
		setFilters({
			severities: new Set(),
			categories: new Set(),
			evaluators: new Set(),
			searchText: "",
		});
	};

	const handleClear = () => {
		setEvaluationData(null);
		setFilters({
			severities: new Set(),
			categories: new Set(),
			evaluators: new Set(),
			searchText: "",
		});
	};

	return (
		<div className="min-h-screen animate-fade-in">
			{/* Header */}
			<header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-50">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
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
										d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
							</div>
							<div>
								<h1 className="text-lg font-bold text-slate-50">
									AGENTS.md Evaluator
								</h1>
								<p className="text-slate-300 text-xs">
									Professional code analysis for AI agent documentation
								</p>
							</div>
						</div>
						<div className="flex items-center gap-3">
							<a
								href="https://github.com/PackmindHub/context-evaluator"
								target="_blank"
								rel="noopener noreferrer"
								className="btn-ghost flex items-center gap-2"
							>
								<svg
									className="h-5 w-5"
									fill="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										fillRule="evenodd"
										d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
										clipRule="evenodd"
									/>
								</svg>
								<span className="hidden sm:inline">GitHub</span>
							</a>
						</div>
					</div>
				</div>
			</header>

			{/* Main Content */}
			<main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
				{/* Tabs */}
				<div className="mb-6">
					<div className="border-b border-gray-200">
						<nav className="-mb-px flex space-x-8" aria-label="Tabs">
							<button
								onClick={() => setActiveTab("live")}
								className={`
                  py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${
										activeTab === "live"
											? "border-blue-500 text-blue-600"
											: "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
									}
                `}
							>
								🚀 Live Evaluation
							</button>
							<button
								onClick={() => setActiveTab("upload")}
								className={`
                  py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${
										activeTab === "upload"
											? "border-blue-500 text-blue-600"
											: "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
									}
                `}
							>
								📁 Upload Results
							</button>
						</nav>
					</div>
				</div>

				{/* Tab Content */}
				{activeTab === "live" ? (
					<div>
						<LiveEvaluation
							onEvaluationComplete={(result) => {
								handleFileLoad(result);
								setActiveTab("upload");
							}}
						/>
					</div>
				) : (
					<div>
						{/* File Upload */}
						<div className="mb-4">
							<FileUpload
								onFileLoad={handleFileLoad}
								onClear={handleClear}
								hasData={evaluationData !== null}
							/>
						</div>
					</div>
				)}

				{/* Content Area */}
				{evaluationData && activeTab === "upload" ? (
					<div className="space-y-4">
						{/* Summary */}
						<Summary
							metadata={evaluationData.metadata}
							actualIssueCount={allIssues.length}
							actualPerFileIssueCount={perFileIssueCount}
							actualCrossFileIssueCount={crossFileIssueCount}
							actualHighCount={highCount}
							actualMediumCount={mediumCount}
						/>

						{/* Filters and Issues */}
						<div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
							{/* Sidebar - Filters */}
							<div className="lg:col-span-1">
								<div className="sticky top-8 max-h-[calc(100vh-4rem)] overflow-y-auto custom-scrollbar">
									<FilterPanel
										filters={filters}
										onFilterChange={setFilters}
										availableCategories={availableCategories}
										availableEvaluators={availableEvaluators}
										issueCount={filteredIssues.length}
										totalIssues={allIssues.length}
									/>
								</div>
							</div>

							{/* Main - Issues List */}
							<div className="lg:col-span-3">
								<IssuesList
									issues={filteredIssues as unknown as WebIssue[]}
									groupedByEvaluator={
										groupedIssues as unknown as Record<string, WebIssue[]>
									}
									title="Evaluation Issues"
								/>
							</div>
						</div>
					</div>
				) : activeTab === "upload" && !evaluationData ? (
					<EmptyState />
				) : null}
			</main>

			{/* Footer */}
			<footer className="bg-slate-800 border-t border-slate-700 mt-20">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
					<div className="flex flex-col md:flex-row items-center justify-between gap-6">
						<div className="flex items-center gap-3">
							<div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
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
										d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
							</div>
							<p className="text-sm font-semibold text-slate-50">
								AGENTS.md Evaluator
							</p>
						</div>
						<div className="flex flex-wrap items-center justify-center gap-8 text-sm text-slate-300">
							<span>Built for developers</span>
							<span className="hidden md:inline text-slate-600">•</span>
							<span className="font-medium text-slate-200">
								Powered by Bun + React + Tailwind
							</span>
							<span className="hidden md:inline text-slate-600">•</span>
							<a
								href="#"
								className="hover:text-slate-100 transition-colors font-medium"
							>
								Documentation
							</a>
						</div>
					</div>
				</div>
			</footer>
		</div>
	);
}

// Mount the app
const root = createRoot(document.getElementById("root")!);
root.render(<App />);
