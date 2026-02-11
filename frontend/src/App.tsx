import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
	BrowserRouter,
	Route,
	Routes,
	useLocation,
	useNavigate,
	useParams,
	useSearchParams,
} from "react-router-dom";
import { AppHeader } from "./components/AppHeader";
import { AssessmentPage } from "./components/AssessmentPage";
import { BatchStatusPage } from "./components/BatchStatusPage";
import { CostAnalysisPanel } from "./components/CostAnalysisPanel";
import { EmptyState } from "./components/EmptyState";
import { EvaluationInputPanel } from "./components/EvaluationInputPanel";
import { EvaluatorFailurePanel } from "./components/EvaluatorFailurePanel";
import { EvaluatorsPage } from "./components/EvaluatorsPage";
import { EvaluatorTemplatesPanel } from "./components/EvaluatorTemplatesPanel";
import { ExperimentalNotice } from "./components/ExperimentalNotice";
import type { FilterOptionCounts, FilterState } from "./components/FilterPanel";
import { FilterPanel } from "./components/FilterPanel";
import { HowItWorksPage } from "./components/HowItWorksPage";
import { IssuesList } from "./components/IssuesList";
import { IssuesPage } from "./components/IssuesPage";
import { ProgressPanel } from "./components/ProgressPanel";
import { RecentEvaluationsPage } from "./components/RecentEvaluationsPage";
import { RemediateTab } from "./components/RemediateTab";
import { SelectionSummaryBar } from "./components/SelectionSummaryBar";
import { StatsPage } from "./components/StatsPage";
import { Summary } from "./components/Summary";
import type { TabItem } from "./components/Tabs";
import { TabPanel, Tabs } from "./components/Tabs";
import {
	FeatureFlagProvider,
	useFeatureFlags,
} from "./contexts/FeatureFlagContext";
import { useBookmarkApi } from "./hooks/useBookmarkApi";
import { useEvaluationApi } from "./hooks/useEvaluationApi";
import { useEvaluationHistory } from "./hooks/useEvaluationHistory";
import { useFeedbackApi } from "./hooks/useFeedbackApi";
import { useSSE } from "./hooks/useSSE";
import { useVersion } from "./hooks/useVersion";
import { getFilteredEvaluatorCount } from "./lib/formatters";
import { shouldUseNestedGrouping as checkShouldUseNestedGrouping } from "./lib/grouping-utils";
import { generateIssueHash } from "./lib/issue-hash";
import { generateIssueKey } from "./lib/issue-utils";
import type {
	CategoryGroup,
	EvaluationOutput,
	EvaluatorFilter,
	IndependentEvaluationOutput,
	Issue,
	UnifiedEvaluationOutput,
} from "./types/evaluation";
import {
	getIssueFile,
	getIssueSeverity,
	getIssueType,
	getMaxCategoryGroupSeverity,
	getMaxIssueSeverity,
	getSeverityLevel,
	isIndependentFormat,
	isUnifiedFormat,
	parseEvaluatorResult,
} from "./types/evaluation";
import type {
	EvaluationMode,
	ICloneWarningEvent,
	IContextAnalysisEvent,
	IContextClocEvent,
	IContextFoldersEvent,
	IContextWarningEvent,
	IDiscoveryCompletedEvent,
	IEvaluatorProgressEvent,
	IFileStartedEvent,
	IJobCompletedEvent,
	IJobFailedEvent,
	IJobStartedEvent,
	IProgressState,
	SSEEvent,
} from "./types/job";

function AppContent() {
	// Feature flags
	const { assessmentEnabled, groupSelectEnabled, cloudMode } =
		useFeatureFlags();

	// URL-based routing
	const navigate = useNavigate();
	const { id: urlEvaluationId } = useParams<{ id: string }>();
	const [searchParams, setSearchParams] = useSearchParams();

	// Tab state from URL with smart defaults
	const rawTab = searchParams.get("tab");
	const handleTabChange = useCallback(
		(tabId: string) => {
			setSearchParams(
				(prev) => {
					prev.set("tab", tabId);
					return prev;
				},
				{ replace: true },
			);
		},
		[setSearchParams],
	);

	const [evaluationData, setEvaluationData] = useState<EvaluationOutput | null>(
		null,
	);
	const [filters, setFilters] = useState<FilterState>({
		severities: new Set(),
		categories: new Set(),
		evaluators: new Set(),
		searchText: "",
		bookmarkedOnly: false,
	});
	// Always show all issues (removed curated toggle)

	// Evaluation job state
	const [evaluationMode, setEvaluationMode] = useState<EvaluationMode>("idle");
	const [currentJobId, setCurrentJobId] = useState<string | null>(null);
	const [sseUrl, setSSEUrl] = useState<string | null>(null);
	const [progressState, setProgressState] = useState<IProgressState | null>(
		null,
	);
	const [apiError, setApiError] = useState<string | null>(null);
	const [isLoadingFromUrl, setIsLoadingFromUrl] = useState(false);
	const [currentRepositoryUrl, setCurrentRepositoryUrl] = useState<
		string | null
	>(null);
	// Store evaluation logs to persist after completion
	const [evaluationLogs, setEvaluationLogs] = useState<
		Array<{ timestamp: Date; type: string; message: string }>
	>([]);

	// Issue selection state
	const [selectedIssueKeys, setSelectedIssueKeys] = useState<Set<string>>(
		new Set(),
	);
	const [issueKeyMap, setIssueKeyMap] = useState<Map<string, Issue>>(new Map());

	// Feedback state
	const [feedbackMap, setFeedbackMap] = useState<
		Map<string, "like" | "dislike">
	>(new Map());
	const feedbackApi = useFeedbackApi();

	// Bookmark state
	const [bookmarkSet, setBookmarkSet] = useState<Set<string>>(new Set());
	const bookmarkApi = useBookmarkApi();

	// Derive currentEvaluationId from URL parameter
	const currentEvaluationId = urlEvaluationId || null;

	// Ref for completion timeout cleanup
	const completionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);

	// API hook
	const api = useEvaluationApi();

	// Evaluation history hook
	const historyApi = useEvaluationHistory();

	// Version hook
	const { version } = useVersion();

	// Ref for stable access to API function (avoids dependency array issues)
	const loadEvaluationRef = useRef(historyApi.loadEvaluation);
	loadEvaluationRef.current = historyApi.loadEvaluation;

	// SSE event handler
	const handleProgressEvent = useCallback(
		(event: SSEEvent) => {
			setProgressState((prev) => {
				if (!prev) return prev;

				const newState = { ...prev };

				switch (event.type) {
					// Clone events
					case "clone.started": {
						newState.logs = [
							...prev.logs,
							{
								timestamp: new Date(),
								type: "info",
								message: "Cloning repository...",
							},
						];
						break;
					}

					case "clone.completed": {
						newState.logs = [
							...prev.logs,
							{
								timestamp: new Date(),
								type: "success",
								message: "Repository cloned successfully",
							},
						];
						break;
					}

					case "clone.warning": {
						const data = (event as ICloneWarningEvent).data;
						newState.logs = [
							...prev.logs,
							{
								timestamp: new Date(),
								type: "warning",
								message: data.message,
							},
						];
						break;
					}

					// Discovery events
					case "discovery.started": {
						newState.logs = [
							...prev.logs,
							{
								timestamp: new Date(),
								type: "info",
								message: "Discovering context files...",
							},
						];
						break;
					}

					case "discovery.completed": {
						const data = (event as IDiscoveryCompletedEvent).data;
						newState.logs = [
							...prev.logs,
							{
								timestamp: new Date(),
								type: "success",
								message: `Found ${data.filesFound} context file(s)`,
							},
						];
						break;
					}

					// Context sub-step events
					case "context.cloc": {
						const data = (event as IContextClocEvent).data;
						if (data.status === "started") {
							newState.logs = [
								...prev.logs,
								{
									timestamp: new Date(),
									type: "info",
									message: "Analyzing codebase size...",
								},
							];
						} else if (data.status === "completed") {
							newState.logs = [
								...prev.logs,
								{
									timestamp: new Date(),
									type: "success",
									message: `Codebase: ${data.totalLines?.toLocaleString() || "?"} lines across ${data.languageCount || "?"} languages`,
								},
							];
						}
						break;
					}

					case "context.folders": {
						const data = (event as IContextFoldersEvent).data;
						if (data.status === "started") {
							newState.logs = [
								...prev.logs,
								{
									timestamp: new Date(),
									type: "info",
									message: "Analyzing directory structure...",
								},
							];
						} else if (data.status === "completed") {
							newState.logs = [
								...prev.logs,
								{
									timestamp: new Date(),
									type: "success",
									message: `Structure: ${data.folderCount || "?"} key directories`,
								},
							];
						}
						break;
					}

					case "context.analysis": {
						const data = (event as IContextAnalysisEvent).data;
						if (data.status === "started") {
							newState.logs = [
								...prev.logs,
								{
									timestamp: new Date(),
									type: "info",
									message: "Identifying project context...",
								},
							];
						} else if (data.status === "completed") {
							newState.logs = [
								...prev.logs,
								{
									timestamp: new Date(),
									type: "success",
									message: "Project context identified",
								},
							];
						}
						break;
					}

					case "context.warning": {
						const data = (event as IContextWarningEvent).data;
						newState.logs = [
							...prev.logs,
							{
								timestamp: new Date(),
								type: "warning",
								message: data.message,
							},
						];
						break;
					}

					case "job.started": {
						const data = (event as IJobStartedEvent).data;
						newState.status = "running";
						newState.totalFiles = data.totalFiles || 0;
						newState.logs = [
							...prev.logs,
							{
								timestamp: new Date(),
								type: "info",
								message: `Started evaluation (${data.evaluationMode} mode, ${data.totalFiles} file(s))`,
							},
						];
						break;
					}

					case "file.started": {
						const data = (event as IFileStartedEvent).data;
						newState.currentFile = data.filePath;
						newState.logs = [
							...prev.logs,
							{
								timestamp: new Date(),
								type: "info",
								message: `Processing ${data.filePath}`,
							},
						];
						break;
					}

					case "file.completed": {
						newState.completedFiles = (prev.completedFiles || 0) + 1;
						// Update percentage based on file progress
						if (newState.totalFiles > 0) {
							newState.percentage = Math.round(
								(newState.completedFiles / newState.totalFiles) * 50,
							);
						}
						break;
					}

					case "evaluator.progress": {
						const data = (event as IEvaluatorProgressEvent).data;
						newState.currentEvaluator = data.evaluatorName;
						newState.completedEvaluators = data.evaluatorIndex;
						newState.totalEvaluators = data.totalEvaluators;
						// Update percentage based on evaluator progress
						if (data.totalEvaluators > 0) {
							const evaluatorProgress =
								(data.evaluatorIndex / data.totalEvaluators) * 50;
							newState.percentage = 50 + Math.round(evaluatorProgress);
						}
						// Include file context in log message when evaluating multiple files
						const fileContext = data.currentFile
							? ` on ${data.currentFile.split("/").pop()}`
							: "";
						newState.logs = [
							...prev.logs,
							{
								timestamp: new Date(),
								type: "info",
								message: `Running ${data.evaluatorName}${fileContext} (${data.evaluatorIndex + 1}/${data.totalEvaluators})`,
							},
						];
						break;
					}

					case "evaluator.completed": {
						newState.completedEvaluators = (prev.completedEvaluators || 0) + 1;
						break;
					}

					case "evaluator.retry": {
						const data = event.data as {
							evaluatorName: string;
							attempt: number;
							maxRetries: number;
							error: string;
							currentFile?: string;
						};
						const retriesRemaining = data.maxRetries - data.attempt;
						newState.logs = [
							...prev.logs,
							{
								timestamp: new Date(),
								type: "warning",
								message: `Retry ${data.attempt}/${data.maxRetries} for ${data.evaluatorName}: ${data.error.substring(0, 100)}${data.error.length > 100 ? "..." : ""} (${retriesRemaining} retries remaining)`,
							},
						];
						break;
					}

					case "evaluator.timeout": {
						const data = event.data as {
							evaluatorName: string;
							elapsedMs: number;
							timeoutMs: number;
							currentFile?: string;
						};
						const elapsedSec = Math.round(data.elapsedMs / 1000);
						const timeoutSec = Math.round(data.timeoutMs / 1000);
						newState.logs = [
							...prev.logs,
							{
								timestamp: new Date(),
								type: "error",
								message: `Timeout: ${data.evaluatorName} exceeded ${timeoutSec}s limit (elapsed: ${elapsedSec}s)`,
							},
						];
						break;
					}

					case "curation.started": {
						const data = event.data;
						const typeLabel =
							data.issueType === "error"
								? "errors"
								: data.issueType === "suggestion"
									? "suggestions"
									: "issues";
						newState.currentEvaluator = `Impact Curation (${typeLabel})`;
						newState.logs = [
							...prev.logs,
							{
								timestamp: new Date(),
								type: "info",
								message: `Curating top ${typeLabel} from ${data.totalIssues} total...`,
							},
						];
						break;
					}

					case "curation.completed": {
						const data = event.data;
						const typeLabel =
							data.issueType === "error"
								? "errors"
								: data.issueType === "suggestion"
									? "suggestions"
									: "issues";
						newState.logs = [
							...prev.logs,
							{
								timestamp: new Date(),
								type: "success",
								message: `Impact curation completed for ${typeLabel} (${data.curatedCount} selected)`,
							},
						];
						break;
					}

					case "evaluation.warning": {
						const data = event.data;
						newState.logs = [
							...prev.logs,
							{
								timestamp: new Date(),
								type: "warning",
								message: data.message || "Some evaluators encountered errors",
							},
						];
						break;
					}

					case "job.completed": {
						const data = (event as IJobCompletedEvent).data;
						newState.status = "completed";
						newState.percentage = 100;
						newState.logs = [
							...prev.logs,
							{
								timestamp: new Date(),
								type: "success",
								message: `Evaluation completed in ${Math.round(data.duration / 1000)}s`,
							},
						];
						// Preserve logs for display in Summary after completion
						setEvaluationLogs(newState.logs);
						// Set the evaluation data
						setEvaluationData(data.result);
						setEvaluationMode("completed");
						// Reset job state after a short delay (user is already at /evaluation/:jobId)
						// Clear any existing timeout first
						if (completionTimeoutRef.current) {
							clearTimeout(completionTimeoutRef.current);
							completionTimeoutRef.current = null;
						}
						completionTimeoutRef.current = setTimeout(() => {
							setCurrentJobId(null);
							setSSEUrl(null);
							setProgressState(null);
						}, 100);
						// Refresh history to show new evaluation
						historyApi.refresh();
						break;
					}

					case "job.failed": {
						const data = (event as IJobFailedEvent).data;
						newState.status = "failed";
						newState.errorMessage = data.error?.message || "Unknown error";
						newState.errorCode = data.error?.code;
						newState.logs = [
							...prev.logs,
							{
								timestamp: new Date(),
								type: "error",
								message: `Evaluation failed: ${data.error?.message || "Unknown error"}`,
							},
						];
						// Keep evaluationMode as 'evaluating' so ProgressPanel stays visible
						// User can dismiss manually with the "Try Again" button
						// Refresh history to show failed evaluation
						historyApi.refresh();
						break;
					}
				}

				// Keep only last 50 logs
				if (newState.logs.length > 50) {
					newState.logs = newState.logs.slice(-50);
				}

				return newState;
			});
		},
		[historyApi],
	);

	// SSE connection
	useSSE({
		url: sseUrl,
		onMessage: handleProgressEvent,
		onOpen: () => {
			setProgressState((prev) =>
				prev
					? {
							...prev,
							logs: [
								...prev.logs,
								{
									timestamp: new Date(),
									type: "info",
									message: "Connected to progress stream",
								},
							],
						}
					: prev,
			);
		},
	});

	// Cleanup completion timeout on unmount
	useEffect(() => {
		return () => {
			if (completionTimeoutRef.current) {
				clearTimeout(completionTimeoutRef.current);
				completionTimeoutRef.current = null;
			}
		};
	}, []);

	// Handle URL submission
	const handleUrlSubmit = useCallback(
		async (
			url: string,
			evaluators: number,
			provider?: "claude" | "opencode" | "cursor" | "github-copilot",
			evaluatorFilter?: EvaluatorFilter,
			concurrency?: number,
			selectedEvaluators?: string[],
		) => {
			setEvaluationMode("evaluating");
			setApiError(null);
			setCurrentRepositoryUrl(url);
			setEvaluationLogs([]); // Clear previous logs when starting new evaluation

			try {
				const response = await api.submitJob(
					url,
					evaluators,
					provider,
					evaluatorFilter,
					undefined,
					concurrency,
					selectedEvaluators,
				);
				setCurrentJobId(response.jobId);
				setSSEUrl(response.sseUrl);

				// Initialize progress state
				setProgressState({
					status: "queued",
					repositoryUrl: url,
					totalFiles: 0,
					completedFiles: 0,
					totalEvaluators: getFilteredEvaluatorCount(
						evaluatorFilter || "all",
						evaluators,
						selectedEvaluators?.length,
					),
					completedEvaluators: 0,
					percentage: 0,
					startTime: new Date(),
					logs: [
						{
							timestamp: new Date(),
							type: "info",
							message: "Evaluation job submitted",
						},
					],
				});

				// Navigate immediately to the evaluation URL
				navigate(`/evaluation/${response.jobId}`);
			} catch (error) {
				setEvaluationMode("idle");
				setApiError(
					error instanceof Error
						? error.message
						: "Failed to submit evaluation job",
				);
			}
		},
		[api, navigate],
	);

	// Handle batch URL submission
	const handleBatchSubmit = useCallback(
		async (
			urls: string[],
			_evaluators: number,
			provider?: "claude" | "opencode" | "cursor" | "github-copilot",
			evaluatorFilter?: EvaluatorFilter,
			concurrency?: number,
			selectedEvaluators?: string[],
		) => {
			setApiError(null);
			try {
				const response = await api.submitBatch(
					urls,
					undefined,
					provider,
					evaluatorFilter,
					undefined,
					concurrency,
					selectedEvaluators,
				);
				navigate(`/batch/${response.batchId}`);
			} catch (error) {
				setApiError(
					error instanceof Error
						? error.message
						: "Failed to submit batch evaluation",
				);
			}
		},
		[api, navigate],
	);

	// Handle job cancellation
	const handleCancelJob = useCallback(async () => {
		if (currentJobId) {
			await api.cancelJob(currentJobId);
		}
		setEvaluationMode("idle");
		setProgressState(null);
		setCurrentJobId(null);
		setSSEUrl(null);
	}, [currentJobId, api]);

	// Handle dismissing failed evaluation (Try Again)
	const handleDismissFailure = useCallback(() => {
		setEvaluationMode("idle");
		setProgressState(null);
		setCurrentJobId(null);
		setSSEUrl(null);
	}, []);

	// Load evaluation from URL on mount or when URL changes
	// Handles both active jobs (reconnect SSE) and completed evaluations (load from database)
	// biome-ignore lint/correctness/useExhaustiveDependencies: handleFileLoad is intentionally excluded - we want the latest version but don't want it to trigger re-runs
	useEffect(() => {
		if (!urlEvaluationId) return;
		if (evaluationData && evaluationMode === "completed") return; // Already loaded
		if (evaluationMode === "evaluating") return; // Currently evaluating

		const loadEvaluationById = async () => {
			setIsLoadingFromUrl(true);
			setApiError(null);

			try {
				// Step 1: Check if it's an active job
				const jobStatus = await api.getJobStatus(urlEvaluationId);

				if (jobStatus.status === "completed" && jobStatus.result) {
					// Job completed, result in memory - use it directly
					handleFileLoad(jobStatus.result);
					setCurrentRepositoryUrl(jobStatus.repositoryUrl || null);
					setEvaluationMode("completed");
					// Load feedback and bookmarks
					try {
						const feedback =
							await feedbackApi.getFeedbackForEvaluation(urlEvaluationId);
						setFeedbackMap(feedback);
						if (!cloudMode) {
							const bookmarks =
								await bookmarkApi.getBookmarksForEvaluation(urlEvaluationId);
							setBookmarkSet(bookmarks);
						}
					} catch (err) {
						console.error("Failed to load metadata:", err);
					}
					setIsLoadingFromUrl(false);
					return;
				}

				if (jobStatus.status === "failed") {
					setApiError(jobStatus.error?.message || "Evaluation failed");
					setIsLoadingFromUrl(false);
					return;
				}

				// Active job (running or queued) - reconnect SSE
				if (jobStatus.status === "running" || jobStatus.status === "queued") {
					setCurrentJobId(urlEvaluationId);
					const sseUrlValue = jobStatus.sseUrl?.startsWith("/")
						? `${window.location.origin}${jobStatus.sseUrl}`
						: jobStatus.sseUrl || null;
					setSSEUrl(sseUrlValue);
					setCurrentRepositoryUrl(jobStatus.repositoryUrl || null);
					setEvaluationMode("evaluating");

					// Convert server logs to frontend format, or use default message
					const historicalLogs = jobStatus.logs?.length
						? jobStatus.logs.map((log) => ({
								timestamp: new Date(log.timestamp),
								type: log.type,
								message: log.message,
							}))
						: [
								{
									timestamp: new Date(),
									type: "info" as const,
									message: "Reconnected to evaluation in progress",
								},
							];

					// Calculate progress percentage
					let percentage = 0;
					if (jobStatus.progress?.totalEvaluators) {
						percentage = Math.round(
							((jobStatus.progress.completedEvaluators || 0) /
								jobStatus.progress.totalEvaluators) *
								100,
						);
					}

					// Initialize progress state from job with historical logs
					setProgressState({
						status: jobStatus.status,
						repositoryUrl: jobStatus.repositoryUrl || "Unknown",
						totalFiles: jobStatus.progress?.totalFiles || 0,
						completedFiles: jobStatus.progress?.completedFiles || 0,
						totalEvaluators: jobStatus.progress?.totalEvaluators || 0,
						completedEvaluators: jobStatus.progress?.completedEvaluators || 0,
						currentEvaluator: jobStatus.progress?.currentEvaluator,
						percentage,
						startTime: new Date(jobStatus.startedAt || jobStatus.createdAt),
						logs: historicalLogs,
					});
					setIsLoadingFromUrl(false);
					return;
				}
			} catch {
				// Not an active job - try database
				console.log("[App] Not an active job, trying database");
			}

			// Step 2: Try loading from database
			try {
				const record = await loadEvaluationRef.current(urlEvaluationId);
				if (record?.result) {
					handleFileLoad(record.result);
					setCurrentRepositoryUrl(record.repositoryUrl);
					setEvaluationMode("completed");
					// Load feedback and bookmarks
					try {
						const feedback =
							await feedbackApi.getFeedbackForEvaluation(urlEvaluationId);
						setFeedbackMap(feedback);
						if (!cloudMode) {
							const bookmarks =
								await bookmarkApi.getBookmarksForEvaluation(urlEvaluationId);
							setBookmarkSet(bookmarks);
						}
					} catch (err) {
						console.error("Failed to load metadata:", err);
					}
				} else {
					setApiError("Evaluation not found");
				}
			} catch (err) {
				setApiError(
					err instanceof Error ? err.message : "Failed to load evaluation",
				);
			} finally {
				setIsLoadingFromUrl(false);
			}
		};

		loadEvaluationById();
	}, [
		urlEvaluationId,
		evaluationData,
		evaluationMode,
		api,
		feedbackApi,
		bookmarkApi,
		cloudMode,
	]);

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

			// Add top-level cross-file issues for unified format
			if (unifiedData.crossFileIssues) {
				issues.push(
					...unifiedData.crossFileIssues.map((issue) => ({
						...issue,
						evaluatorName: "cross-file",
					})),
				);
			}
		} else if (isIndependentFormat(evaluationData)) {
			// Independent format: files object
			const independentData = evaluationData as IndependentEvaluationOutput;
			for (const [_filePath, fileResult] of Object.entries(
				independentData.files,
			)) {
				for (const evaluation of fileResult.evaluations) {
					const evalWithIssues = evaluation as {
						issues?: Issue[];
						evaluator: string;
						output?: { result: string };
					};
					// Handle both formats:
					// 1. Backend API format: issues array directly on evaluation
					// 2. JSON file format: output.result as a string to parse
					if ("issues" in evaluation && Array.isArray(evalWithIssues.issues)) {
						// Backend API format - issues are already parsed
						const evalIssues = evalWithIssues.issues;
						evalIssues.forEach((issue) => {
							issues.push({ ...issue, evaluatorName: evaluation.evaluator });
						});
					} else if (evaluation.output && evaluation.output.result) {
						// JSON file format - need to parse result string
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

		// Build issue key map for selection tracking
		const keyMap = new Map<string, Issue>();
		issues.forEach((issue, index) => {
			const key = generateIssueKey(issue, index);
			keyMap.set(key, issue);
		});
		setIssueKeyMap(keyMap);

		return issues;
	}, [evaluationData]);

	// Get curated issues from impact curation (if available)
	const curatedIssues = useMemo(() => {
		if (!evaluationData?.curation) return [];

		const issues: Issue[] = [];

		// Add curated errors
		if (evaluationData.curation.errors?.curatedIssues) {
			issues.push(...evaluationData.curation.errors.curatedIssues);
		}

		// Add curated suggestions
		if (evaluationData.curation.suggestions?.curatedIssues) {
			issues.push(...evaluationData.curation.suggestions.curatedIssues);
		}

		// Fallback to legacy format
		if (issues.length === 0 && evaluationData.curation.curatedIssues) {
			issues.push(...evaluationData.curation.curatedIssues);
		}

		return issues;
	}, [evaluationData]);

	// Get curation summary (if available)
	const curationSummary = useMemo(() => {
		return evaluationData?.curation?.summary || null;
	}, [evaluationData]);

	// Use curated issues when available, otherwise display all issues
	const displayIssues = useMemo(() => {
		return curatedIssues.length > 0 ? curatedIssues : allIssues;
	}, [curatedIssues, allIssues]);

	// Calculate severity counts from displayed issues
	const { highCount, mediumCount } = useMemo(() => {
		const counts = { high: 0, medium: 0 };
		displayIssues.forEach((issue) => {
			const numericSeverity = getIssueSeverity(issue);
			const level = getSeverityLevel(numericSeverity);
			if (level === "high") counts.high++;
			else if (level === "medium") counts.medium++;
		});
		return {
			highCount: counts.high,
			mediumCount: counts.medium,
		};
	}, [displayIssues]);

	// Calculate issue type counts (errors vs suggestions) from displayed issues
	const { errorCount, suggestionCount } = useMemo(() => {
		const counts = { error: 0, suggestion: 0 };
		displayIssues.forEach((issue) => {
			const type = getIssueType(issue);
			counts[type]++;
		});
		return { errorCount: counts.error, suggestionCount: counts.suggestion };
	}, [displayIssues]);

	// Determine active tab with smart defaults and backward compatibility
	const activeTab = useMemo(() => {
		// Backward compatibility: redirect "issues" to "errors"
		if (rawTab === "issues") {
			handleTabChange("errors");
			return "errors";
		}

		// If tab is specified, use it
		if (rawTab) {
			return rawTab;
		}

		// Smart defaults when no tab is specified
		if (!evaluationData) {
			return "summary";
		}

		if (errorCount > 0) {
			return "errors";
		}

		if (suggestionCount > 0) {
			return "suggestions";
		}

		return "summary";
	}, [rawTab, evaluationData, errorCount, suggestionCount, handleTabChange]);

	// Split issues by type for tab-aware filtering
	const errorIssues = useMemo(
		() => allIssues.filter((issue) => getIssueType(issue) === "error"),
		[allIssues],
	);

	const suggestionIssues = useMemo(
		() => allIssues.filter((issue) => getIssueType(issue) === "suggestion"),
		[allIssues],
	);

	// Get base issues based on active tab
	const baseIssues = useMemo(() => {
		if (activeTab === "errors") return errorIssues;
		if (activeTab === "suggestions") return suggestionIssues;
		return displayIssues; // Fallback for non-issue tabs
	}, [activeTab, errorIssues, suggestionIssues, displayIssues]);

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

	// Extract unique categories
	const availableCategories = useMemo(() => {
		const categories = new Set<string>();

		allIssues.forEach((issue) => {
			if (issue.category) categories.add(issue.category);
		});

		return Array.from(categories).sort();
	}, [allIssues]);

	// Calculate counts per filter option (based on baseIssues to respect tab selection)
	const filterOptionCounts = useMemo((): FilterOptionCounts => {
		const counts: FilterOptionCounts = {
			severities: { high: 0, medium: 0, low: 0 },
			categories: {},
		};

		baseIssues.forEach((issue) => {
			// Severity
			const numericSeverity = getIssueSeverity(issue);
			const level = getSeverityLevel(numericSeverity);
			if (level === "high") counts.severities.high++;
			else if (level === "medium") counts.severities.medium++;
			else if (level === "low") counts.severities.low++;

			// Category
			if (issue.category) {
				counts.categories[issue.category] =
					(counts.categories[issue.category] || 0) + 1;
			}
		});

		return counts;
	}, [baseIssues]);

	// Filter issues based on active filters (using baseIssues which respects tab selection)
	const filteredIssues = useMemo(() => {
		return baseIssues.filter((issue) => {
			// Bookmark filter (check first for early return)
			if (filters.bookmarkedOnly) {
				const issueHash = generateIssueHash(issue);
				if (!bookmarkSet.has(issueHash)) {
					return false;
				}
			}

			// Severity filter
			if (filters.severities.size > 0) {
				const numericSeverity = getIssueSeverity(issue);
				const severityLevel = getSeverityLevel(numericSeverity);
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

			// Search text filter
			if (filters.searchText) {
				const searchLower = filters.searchText.toLowerCase();
				const searchableText = [
					issue.description, // Primary issue description
					issue.problem, // Fallback issue description
					issue.title, // Secondary title field
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
	}, [baseIssues, filters, bookmarkSet]);

	// Calculate filtered counts for tab badges
	const filteredErrorsCount = useMemo(() => {
		if (activeTab !== "errors") return errorIssues.length;
		return filteredIssues.length;
	}, [activeTab, errorIssues.length, filteredIssues.length]);

	const filteredSuggestionsCount = useMemo(() => {
		if (activeTab !== "suggestions") return suggestionIssues.length;
		return filteredIssues.length;
	}, [activeTab, suggestionIssues.length, filteredIssues.length]);

	// Calculate bookmarked count for FilterPanel badge
	const bookmarkedCount = useMemo(() => {
		return baseIssues.filter((issue) => {
			const issueHash = generateIssueHash(issue);
			return bookmarkSet.has(issueHash);
		}).length;
	}, [baseIssues, bookmarkSet]);

	// Group issues by file for display
	const groupedIssues = useMemo(() => {
		const grouped: Record<string, Issue[]> = {
			__cross_file__: [], // Special key for cross-file issues
		};

		for (const issue of filteredIssues) {
			const file = getIssueFile(issue);

			if (file === null) {
				// Cross-file or no-file issue
				grouped.__cross_file__.push(issue);
			} else {
				if (!grouped[file]) {
					grouped[file] = [];
				}
				grouped[file].push(issue);
			}
		}

		// Remove cross-file section if empty
		if (grouped.__cross_file__.length === 0) {
			delete grouped.__cross_file__;
		}

		return grouped;
	}, [filteredIssues]);

	// Sort grouped issues: cross-file first, then by max severity, then alphabetically
	const sortedGroupedIssues = useMemo(() => {
		const entries = Object.entries(groupedIssues);

		// Separate cross-file from regular files
		const crossFileEntry = entries.find(([key]) => key === "__cross_file__");
		const fileEntries = entries.filter(([key]) => key !== "__cross_file__");

		// Sort file entries by max severity desc, then alphabetically
		fileEntries.sort(([fileA, issuesA], [fileB, issuesB]) => {
			const maxSeverityA = getMaxIssueSeverity(issuesA);
			const maxSeverityB = getMaxIssueSeverity(issuesB);

			if (maxSeverityA !== maxSeverityB) {
				return maxSeverityB - maxSeverityA;
			}

			return fileA.localeCompare(fileB);
		});

		// Return cross-file first, then sorted files
		return crossFileEntry ? [crossFileEntry, ...fileEntries] : fileEntries;
	}, [groupedIssues]);

	// Determine if we should use nested grouping (file -> evaluator -> issues)
	// Only use nested grouping when no filters are active
	const shouldUseNestedGrouping = useMemo(
		() => checkShouldUseNestedGrouping(filters),
		[filters],
	);

	// Group issues by file, then by category within each file
	const nestedGroupedIssues = useMemo(() => {
		if (!shouldUseNestedGrouping) return null;

		const grouped: Record<string, CategoryGroup[]> = {};

		// First, group by file
		for (const issue of filteredIssues) {
			const file = getIssueFile(issue);
			const fileKey = file === null ? "__cross_file__" : file;

			if (!grouped[fileKey]) {
				grouped[fileKey] = [];
			}
		}

		// Then, within each file, group by category
		for (const issue of filteredIssues) {
			const file = getIssueFile(issue);
			const fileKey = file === null ? "__cross_file__" : file;
			const categoryName = issue.category || "Unknown";

			// Find or create category group
			let categoryGroup = grouped[fileKey].find(
				(g) => g.categoryName === categoryName,
			);

			if (!categoryGroup) {
				categoryGroup = {
					categoryName,
					issues: [],
					maxSeverity: 0,
				};
				grouped[fileKey].push(categoryGroup);
			}

			categoryGroup.issues.push(issue);
		}

		// Calculate max severity for each category group and sort issues
		for (const fileKey in grouped) {
			for (const group of grouped[fileKey]) {
				group.maxSeverity = getMaxIssueSeverity(group.issues);
				// Sort issues within category group by severity (descending)
				group.issues.sort((a, b) => getIssueSeverity(b) - getIssueSeverity(a));
			}

			// Sort category groups by max severity (descending)
			grouped[fileKey].sort((a, b) => b.maxSeverity - a.maxSeverity);
		}

		// Remove cross-file section if empty
		if (grouped.__cross_file__ && grouped.__cross_file__.length === 0) {
			delete grouped.__cross_file__;
		}

		return grouped;
	}, [shouldUseNestedGrouping, filteredIssues]);

	// Sort file groups by max severity across all categories
	const sortedFileGroups = useMemo(() => {
		// If not using nested grouping, return the existing sorted groups
		if (!shouldUseNestedGrouping || !nestedGroupedIssues) {
			return sortedGroupedIssues;
		}

		const entries = Object.entries(nestedGroupedIssues);

		// Separate cross-file from regular files
		const crossFileEntry = entries.find(([key]) => key === "__cross_file__");
		const fileEntries = entries.filter(([key]) => key !== "__cross_file__");

		// Sort file entries by max severity across all categories
		fileEntries.sort(([fileA, groupsA], [fileB, groupsB]) => {
			const maxSeverityA = getMaxCategoryGroupSeverity(groupsA);
			const maxSeverityB = getMaxCategoryGroupSeverity(groupsB);

			if (maxSeverityA !== maxSeverityB) {
				return maxSeverityB - maxSeverityA;
			}

			return fileA.localeCompare(fileB);
		});

		// Return cross-file first, then sorted files
		return crossFileEntry ? [crossFileEntry, ...fileEntries] : fileEntries;
	}, [shouldUseNestedGrouping, nestedGroupedIssues, sortedGroupedIssues]);

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
		// Reset filters and selections when new data is loaded
		setFilters({
			severities: new Set(),
			categories: new Set(),
			evaluators: new Set(),
			searchText: "",
			bookmarkedOnly: false,
		});
		setSelectedIssueKeys(new Set());
	};

	const handleClear = useCallback(() => {
		setEvaluationData(null);
		setEvaluationMode("idle");
		setApiError(null);
		setCurrentRepositoryUrl(null);
		setEvaluationLogs([]); // Clear logs when clearing
		setFilters({
			severities: new Set(),
			categories: new Set(),
			evaluators: new Set(),
			searchText: "",
			bookmarkedOnly: false,
		});
		setSelectedIssueKeys(new Set());
		setBookmarkSet(new Set());
		// Navigate to root
		navigate("/");
	}, [navigate]);

	const handleDeleteEvaluation = useCallback(async () => {
		if (currentEvaluationId) {
			await historyApi.deleteEvaluation(currentEvaluationId);
			handleClear();
		}
	}, [currentEvaluationId, historyApi, handleClear]);

	// Issue selection handlers
	const handleToggleIssueSelection = useCallback(
		(key: string, issue: Issue) => {
			setSelectedIssueKeys((prev) => {
				const newSet = new Set(prev);
				if (newSet.has(key)) {
					newSet.delete(key);
				} else {
					newSet.add(key);
				}
				return newSet;
			});
		},
		[],
	);

	const handleClearSelection = useCallback(() => {
		setSelectedIssueKeys(new Set());
	}, []);

	const handleFeedback = useCallback(
		async (issueHash: string, feedbackType: "like" | "dislike" | null) => {
			if (!currentEvaluationId) return;

			// Find the issue by hash to get the evaluator name
			const issue = allIssues.find((i) => generateIssueHash(i) === issueHash);
			if (!issue) return;

			const newMap = new Map(feedbackMap);

			try {
				if (feedbackType === null) {
					// Remove feedback
					await feedbackApi.removeFeedback(currentEvaluationId, issueHash);
					newMap.delete(issueHash);
				} else {
					// Submit feedback
					await feedbackApi.submitFeedback(
						currentEvaluationId,
						issueHash,
						issue.evaluatorName || "unknown",
						feedbackType,
					);
					newMap.set(issueHash, feedbackType);
				}

				setFeedbackMap(newMap);
			} catch (error) {
				console.error("Failed to update feedback:", error);
			}
		},
		[currentEvaluationId, allIssues, feedbackMap, feedbackApi],
	);

	const handleBookmarkToggle = useCallback(
		async (issueHash: string) => {
			// Early return in cloud mode (no-op)
			if (cloudMode) return;

			if (!currentEvaluationId) return;

			const issue = allIssues.find((i) => generateIssueHash(i) === issueHash);
			if (!issue) return;

			const newSet = new Set(bookmarkSet);

			try {
				if (bookmarkSet.has(issueHash)) {
					await bookmarkApi.removeBookmark(currentEvaluationId, issueHash);
					newSet.delete(issueHash);
				} else {
					await bookmarkApi.addBookmark(
						currentEvaluationId,
						issueHash,
						issue.evaluatorName || "unknown",
					);
					newSet.add(issueHash);
				}

				setBookmarkSet(newSet);
			} catch (error) {
				console.error("Failed to toggle bookmark:", error);
			}
		},
		[currentEvaluationId, allIssues, bookmarkSet, bookmarkApi, cloudMode],
	);

	const handleSelectAllInGroup = useCallback((issues: Issue[]) => {
		setSelectedIssueKeys((prev) => {
			const newSet = new Set(prev);
			issues.forEach((issue, index) => {
				const key = generateIssueKey(issue, index);
				newSet.add(key);
			});
			return newSet;
		});
	}, []);

	const handleReviewSelected = useCallback(() => {
		handleTabChange("remediate");
	}, [handleTabChange]);

	const handleAddAllToRemediation = useCallback(
		(issues: (Issue & { evaluatorName?: string })[]) => {
			setSelectedIssueKeys((prev) => {
				const newSet = new Set(prev);
				for (const issue of issues) {
					const globalIndex = allIssues.indexOf(issue);
					if (globalIndex >= 0) {
						newSet.add(generateIssueKey(issue, globalIndex));
					}
				}
				return newSet;
			});
		},
		[allIssues],
	);

	const handleRemoveIssueFromRemediation = useCallback((key: string) => {
		setSelectedIssueKeys((prev) => {
			const newSet = new Set(prev);
			newSet.delete(key);
			return newSet;
		});
	}, []);

	// Tab configuration
	const tabs: TabItem[] = useMemo(() => {
		const baseTabs: TabItem[] = [
			{
				id: "summary",
				label: "Summary",
				icon: (
					<svg
						className="w-4 h-4"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
						/>
					</svg>
				),
			},
			{
				id: "errors",
				label: "Errors",
				icon: (
					<svg
						className="w-4 h-4"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
				),
				count: filteredErrorsCount,
			},
			{
				id: "suggestions",
				label: "Suggestions",
				icon: (
					<svg
						className="w-4 h-4"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
						/>
					</svg>
				),
				count: filteredSuggestionsCount,
			},
			{
				id: "remediate",
				label: "Remediate",
				icon: (
					<svg
						className="w-4 h-4"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
						/>
					</svg>
				),
				count: selectedIssueKeys.size > 0 ? selectedIssueKeys.size : undefined,
			},
		];

		// Only show Debugging and Cost Analysis tabs in non-cloud mode
		if (!cloudMode) {
			baseTabs.push(
				{
					id: "debugging",
					label: "Debugging",
					icon: (
						<svg
							className="w-4 h-4"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
							/>
						</svg>
					),
				},
				{
					id: "cost",
					label: "Cost Analysis",
					icon: (
						<svg
							className="w-4 h-4"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					),
				},
			);
		}

		return baseTabs;
	}, [
		filteredErrorsCount,
		filteredSuggestionsCount,
		cloudMode,
		selectedIssueKeys.size,
	]);

	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 animate-fade-in">
			{/* Header */}
			<AppHeader
				currentPage="home"
				onLogoClick={handleClear}
				historyCount={historyApi.history.length}
			/>

			{/* Selection Summary Bar */}
			<SelectionSummaryBar
				selectedCount={selectedIssueKeys.size}
				onClearSelection={handleClearSelection}
				onReviewSelected={handleReviewSelected}
			/>

			{/* Main Content */}
			<main
				className={`max-w-[1400px] mx-auto px-6 py-6 ${selectedIssueKeys.size > 0 ? "pt-14" : ""}`}
			>
				{/* Content Area */}
				{evaluationData ? (
					<div className="space-y-4">
						{/* Evaluator Failure Panel - Show if some evaluators failed */}
						{evaluationData.metadata.failedEvaluators &&
							evaluationData.metadata.failedEvaluators.length > 0 && (
								<EvaluatorFailurePanel
									failures={evaluationData.metadata.failedEvaluators}
								/>
							)}

						{/* Tab Navigation */}
						<Tabs
							tabs={tabs}
							activeTab={activeTab}
							onTabChange={handleTabChange}
						/>

						{/* Summary Tab */}
						<TabPanel id="summary" activeTab={activeTab}>
							<Summary
								metadata={evaluationData.metadata}
								repositoryUrl={currentRepositoryUrl}
								actualIssueCount={allIssues.length}
								actualPerFileIssueCount={perFileIssueCount}
								actualCrossFileIssueCount={crossFileIssueCount}
								actualHighCount={highCount}
								actualMediumCount={mediumCount}
								actualErrorCount={errorCount}
								actualSuggestionCount={suggestionCount}
								curationSummary={curationSummary}
								curatedCount={curatedIssues.length}
								evaluationId={currentEvaluationId ?? undefined}
								onDelete={handleDeleteEvaluation}
								curation={evaluationData.curation}
								evaluationLogs={evaluationLogs}
							/>
						</TabPanel>

						{/* Errors Tab */}
						<TabPanel id="errors" activeTab={activeTab}>
							<div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
								<div className="lg:col-span-1">
									<div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto custom-scrollbar">
										<FilterPanel
											filters={filters}
											onFilterChange={setFilters}
											availableCategories={availableCategories}
											issueCount={filteredIssues.length}
											totalIssues={errorIssues.length}
											filterOptionCounts={filterOptionCounts}
											bookmarkedCount={bookmarkedCount}
										/>
									</div>
								</div>
								<div className="lg:col-span-4">
									<div className="flex items-center justify-end mb-3">
										<button
											onClick={() => handleAddAllToRemediation(errorIssues)}
											className="btn-secondary text-sm"
										>
											Add all to remediation ({errorIssues.length})
										</button>
									</div>
									<IssuesList
										issues={filteredIssues}
										groupedByFile={
											shouldUseNestedGrouping
												? undefined
												: Object.fromEntries(sortedGroupedIssues)
										}
										nestedGrouping={
											shouldUseNestedGrouping
												? Object.fromEntries(sortedFileGroups)
												: undefined
										}
										title="Errors"
										emptyStateMessage="No errors found! Your documentation meets all quality standards."
										selectedKeys={selectedIssueKeys}
										issueKeyMap={issueKeyMap}
										onToggleSelection={handleToggleIssueSelection}
										onSelectAllInGroup={handleSelectAllInGroup}
										feedbackMap={feedbackMap}
										onFeedback={handleFeedback}
										bookmarkSet={bookmarkSet}
										onBookmarkToggle={handleBookmarkToggle}
										assessmentEnabled={assessmentEnabled}
										groupSelectEnabled={groupSelectEnabled}
										cloudMode={cloudMode}
									/>
								</div>
							</div>
						</TabPanel>

						{/* Suggestions Tab */}
						<TabPanel id="suggestions" activeTab={activeTab}>
							<div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
								<div className="lg:col-span-1">
									<div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto custom-scrollbar">
										<FilterPanel
											filters={filters}
											onFilterChange={setFilters}
											availableCategories={availableCategories}
											issueCount={filteredIssues.length}
											totalIssues={suggestionIssues.length}
											filterOptionCounts={filterOptionCounts}
											bookmarkedCount={bookmarkedCount}
										/>
									</div>
								</div>
								<div className="lg:col-span-4">
									<div className="flex items-center justify-end mb-3">
										<button
											onClick={() =>
												handleAddAllToRemediation(suggestionIssues)
											}
											className="btn-secondary text-sm"
										>
											Add all to remediation ({suggestionIssues.length})
										</button>
									</div>
									<IssuesList
										issues={filteredIssues}
										groupedByFile={
											shouldUseNestedGrouping
												? undefined
												: Object.fromEntries(sortedGroupedIssues)
										}
										nestedGrouping={
											shouldUseNestedGrouping
												? Object.fromEntries(sortedFileGroups)
												: undefined
										}
										title="Suggestions"
										emptyStateMessage="No suggestions available. Your documentation is comprehensive."
										selectedKeys={selectedIssueKeys}
										issueKeyMap={issueKeyMap}
										onToggleSelection={handleToggleIssueSelection}
										onSelectAllInGroup={handleSelectAllInGroup}
										feedbackMap={feedbackMap}
										onFeedback={handleFeedback}
										bookmarkSet={bookmarkSet}
										onBookmarkToggle={handleBookmarkToggle}
										assessmentEnabled={assessmentEnabled}
										groupSelectEnabled={groupSelectEnabled}
										cloudMode={cloudMode}
									/>
								</div>
							</div>
						</TabPanel>

						{/* Remediate Tab */}
						<TabPanel id="remediate" activeTab={activeTab}>
							<RemediateTab
								evaluationId={currentEvaluationId}
								evaluationData={evaluationData}
								selectedIssueKeys={selectedIssueKeys}
								issueKeyMap={issueKeyMap}
								onRemoveIssue={handleRemoveIssueFromRemediation}
								onClearAll={handleClearSelection}
							/>
						</TabPanel>

						{/* Debugging Tab */}
						<TabPanel id="debugging" activeTab={activeTab}>
							<EvaluatorTemplatesPanel evaluationId={currentEvaluationId} />
						</TabPanel>

						{/* Cost Analysis Tab */}
						<TabPanel id="cost" activeTab={activeTab}>
							<CostAnalysisPanel metadata={evaluationData.metadata} />
						</TabPanel>
					</div>
				) : evaluationMode === "evaluating" && progressState ? (
					<div className="mb-4">
						<ProgressPanel
							progress={progressState}
							jobId={currentJobId ?? undefined}
							onCancel={handleCancelJob}
							onDismiss={handleDismissFailure}
						/>
					</div>
				) : evaluationMode === "idle" ? (
					<div className="space-y-6">
						{/* Hero Section - Show first */}
						<EmptyState />

						{/* Compact Input Form - Show below */}
						<div className="max-w-2xl mx-auto">
							<EvaluationInputPanel
								onUrlSubmit={handleUrlSubmit}
								onBatchSubmit={!cloudMode ? handleBatchSubmit : undefined}
								isLoading={api.isLoading}
								urlError={apiError}
								hasData={false}
							/>
						</div>

						{/* Experimental Notice - Below form */}
						<div className="max-w-2xl mx-auto">
							<ExperimentalNotice />
						</div>

						{/* Cloud Mode Notice */}
						{cloudMode && (
							<div className="max-w-2xl mx-auto">
								<div className="info-section text-left">
									<div className="flex items-start gap-2">
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
										<div>
											<p className="info-section-header">Public Instance</p>
											<p className="info-section-content">
												This is a public instance to illustrate
												context-evaluator. You can submit git repository URLs
												for analysis. All results are public and cannot be
												removed. For any request, contact{" "}
												<a
													href="mailto:support@packmind.com"
													className="text-blue-400 hover:text-blue-300 underline"
												>
													support@packmind.com
												</a>
												.
											</p>
										</div>
									</div>
								</div>
							</div>
						)}
					</div>
				) : isLoadingFromUrl ? (
					<div className="card text-center py-12">
						<div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"></div>
						<p className="text-slate-400">Loading evaluation...</p>
					</div>
				) : apiError && urlEvaluationId ? (
					<div className="card border-red-700/50 bg-red-900/20">
						<div className="flex items-center gap-3">
							<svg
								className="w-6 h-6 text-red-400 flex-shrink-0"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
								/>
							</svg>
							<div className="flex-1">
								<h3 className="font-semibold text-red-300">
									Evaluation Not Found
								</h3>
								<p className="text-sm text-red-400/80">{apiError}</p>
							</div>
							<button onClick={handleClear} className="btn-ghost">
								Go Home
							</button>
						</div>
					</div>
				) : null}
			</main>

			{/* Footer */}
			<footer className="bg-slate-800 border-t border-slate-700 mt-12">
				<div className="max-w-[1400px] mx-auto px-6 py-6">
					<div className="flex flex-col md:flex-row items-center justify-between gap-4">
						<div className="flex items-center gap-3">
							<div>
								<p className="text-sm font-semibold text-slate-50">
									context-evaluator
								</p>
								<p className="text-xs text-slate-400">v{version}</p>
							</div>
						</div>
						<div className="flex flex-wrap items-center justify-center gap-8 text-sm text-slate-300">
							<a
								href="https://packmind.com?utm_source=context-evaluator"
								target="_blank"
								rel="noopener noreferrer"
								className="hover:text-slate-100 transition-colors font-medium text-slate-200"
							>
								Powered by Packmind
							</a>
						</div>
					</div>
				</div>
			</footer>
		</div>
	);
}

// Scrolls to top on every route change
function ScrollToTop() {
	const { pathname } = useLocation();
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-run scroll on route change
	useEffect(() => {
		window.scrollTo(0, 0);
	}, [pathname]);
	return null;
}

// Router wrapper component
function App() {
	return (
		<FeatureFlagProvider>
			<BrowserRouter>
				<ScrollToTop />
				<AppRoutes />
			</BrowserRouter>
		</FeatureFlagProvider>
	);
}

// Routes component with feature flag access
function AppRoutes() {
	const { assessmentEnabled, cloudMode } = useFeatureFlags();

	return (
		<Routes>
			<Route path="/" element={<AppContent />} />
			<Route path="/evaluation/:id" element={<AppContent />} />
			<Route path="/recent" element={<RecentEvaluationsPage />} />
			<Route path="/evaluators" element={<EvaluatorsPage />} />
			<Route path="/issues" element={<IssuesPage />} />
			<Route path="/stats" element={<StatsPage />} />
			<Route path="/how-it-works" element={<HowItWorksPage />} />
			{assessmentEnabled && (
				<Route path="/assessment" element={<AssessmentPage />} />
			)}
			{!cloudMode && (
				<Route path="/batch/:batchId" element={<BatchStatusPage />} />
			)}
		</Routes>
	);
}

// Mount the app
const root = createRoot(document.getElementById("root")!);
root.render(<App />);
