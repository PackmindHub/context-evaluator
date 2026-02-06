/**
 * Progress event processing logic extracted from App.tsx
 * Pure functions for handling SSE events and updating progress state
 */

import type {
	ICloneCompletedEvent,
	ICloneStartedEvent,
	ICloneWarningEvent,
	IContextAnalysisEvent,
	IContextClocEvent,
	IContextFoldersEvent,
	IContextWarningEvent,
	ICurationCompletedEvent,
	ICurationStartedEvent,
	IDiscoveryCompletedEvent,
	IDiscoveryStartedEvent,
	IEvaluatorProgressEvent,
	IEvaluatorRetryEvent,
	IEvaluatorTimeoutEvent,
	IFileCompletedEvent,
	IFileStartedEvent,
	IJobCompletedEvent,
	IJobFailedEvent,
	IJobStartedEvent,
	IProgressLog,
	IProgressState,
	SSEEvent,
} from "../types/job";

/**
 * Maximum number of logs to keep in state
 */
const MAX_LOGS = 50;

/**
 * Helper to add a log entry and trim to max size
 */
function addLog(
	logs: IProgressLog[],
	type: IProgressLog["type"],
	message: string,
): IProgressLog[] {
	const newLogs = [
		...logs,
		{
			timestamp: new Date(),
			type,
			message,
		},
	];

	// Keep only last MAX_LOGS
	if (newLogs.length > MAX_LOGS) {
		return newLogs.slice(-MAX_LOGS);
	}
	return newLogs;
}

/**
 * Process job.started event
 */
export function processJobStartedEvent(
	state: IProgressState,
	event: IJobStartedEvent,
): IProgressState {
	const data = event.data;
	return {
		...state,
		status: "running",
		totalFiles: data.totalFiles || 0,
		logs: addLog(
			state.logs,
			"info",
			`Started evaluation (${data.evaluationMode} mode, ${data.totalFiles} file(s))`,
		),
	};
}

/**
 * Process file.started event
 */
export function processFileStartedEvent(
	state: IProgressState,
	event: IFileStartedEvent,
): IProgressState {
	const data = event.data;
	return {
		...state,
		currentFile: data.filePath,
		logs: addLog(state.logs, "info", `Processing ${data.filePath}`),
	};
}

/**
 * Process file.completed event
 */
export function processFileCompletedEvent(
	state: IProgressState,
	_event: IFileCompletedEvent,
): IProgressState {
	const completedFiles = (state.completedFiles || 0) + 1;
	let percentage = state.percentage;

	// Update percentage based on file progress
	if (state.totalFiles > 0) {
		percentage = Math.round((completedFiles / state.totalFiles) * 50);
	}

	return {
		...state,
		completedFiles,
		percentage,
	};
}

/**
 * Process evaluator.progress event
 */
export function processEvaluatorProgressEvent(
	state: IProgressState,
	event: IEvaluatorProgressEvent,
): IProgressState {
	const data = event.data;
	let percentage = state.percentage;

	// Update percentage based on evaluator progress
	if (data.totalEvaluators > 0) {
		const evaluatorProgress = (data.evaluatorIndex / data.totalEvaluators) * 50;
		percentage = 50 + Math.round(evaluatorProgress);
	}

	// Include file context in log message when evaluating multiple files
	const fileContext = data.currentFile
		? ` on ${data.currentFile.split("/").pop()}`
		: "";

	return {
		...state,
		currentEvaluator: data.evaluatorName,
		completedEvaluators: data.evaluatorIndex,
		totalEvaluators: data.totalEvaluators,
		percentage,
		logs: addLog(
			state.logs,
			"info",
			`Running ${data.evaluatorName}${fileContext} (${data.evaluatorIndex + 1}/${data.totalEvaluators})`,
		),
	};
}

/**
 * Process evaluator.completed event
 */
export function processEvaluatorCompletedEvent(
	state: IProgressState,
): IProgressState {
	return {
		...state,
		completedEvaluators: (state.completedEvaluators || 0) + 1,
	};
}

/**
 * Process evaluator.retry event
 */
export function processEvaluatorRetryEvent(
	state: IProgressState,
	event: IEvaluatorRetryEvent,
): IProgressState {
	const data = event.data;
	const retriesRemaining = data.maxRetries - data.attempt;
	const truncatedError =
		data.error.length > 100 ? `${data.error.substring(0, 100)}...` : data.error;

	return {
		...state,
		logs: addLog(
			state.logs,
			"warning",
			`Retry ${data.attempt}/${data.maxRetries} for ${data.evaluatorName}: ${truncatedError} (${retriesRemaining} retries remaining)`,
		),
	};
}

/**
 * Process evaluator.timeout event
 */
export function processEvaluatorTimeoutEvent(
	state: IProgressState,
	event: IEvaluatorTimeoutEvent,
): IProgressState {
	const data = event.data;
	const elapsedSec = Math.round(data.elapsedMs / 1000);
	const timeoutSec = Math.round(data.timeoutMs / 1000);

	return {
		...state,
		logs: addLog(
			state.logs,
			"error",
			`Timeout: ${data.evaluatorName} exceeded ${timeoutSec}s limit (elapsed: ${elapsedSec}s)`,
		),
	};
}

/**
 * Process curation.started event
 */
export function processCurationStartedEvent(
	state: IProgressState,
	event: ICurationStartedEvent,
): IProgressState {
	const data = event.data;
	const typeLabel =
		data.issueType === "error"
			? "errors"
			: data.issueType === "suggestion"
				? "suggestions"
				: "issues";

	return {
		...state,
		currentEvaluator: `Impact Curation (${typeLabel})`,
		logs: addLog(
			state.logs,
			"info",
			`Curating top ${typeLabel} from ${data.totalIssues} total...`,
		),
	};
}

/**
 * Process curation.completed event
 */
export function processCurationCompletedEvent(
	state: IProgressState,
	event: ICurationCompletedEvent,
): IProgressState {
	const data = event.data;
	const typeLabel =
		data.issueType === "error"
			? "errors"
			: data.issueType === "suggestion"
				? "suggestions"
				: "issues";

	return {
		...state,
		logs: addLog(
			state.logs,
			"success",
			`Impact curation completed for ${typeLabel} (${data.curatedCount} selected)`,
		),
	};
}

/**
 * Process job.completed event
 * Note: This returns partial state - caller must handle setEvaluationData, navigation, etc.
 */
export function processJobCompletedEvent(
	state: IProgressState,
	event: IJobCompletedEvent,
): IProgressState {
	const data = event.data;
	return {
		...state,
		status: "completed",
		percentage: 100,
		logs: addLog(
			state.logs,
			"success",
			`Evaluation completed in ${Math.round(data.duration / 1000)}s`,
		),
	};
}

/**
 * Process job.failed event
 */
export function processJobFailedEvent(
	state: IProgressState,
	event: IJobFailedEvent,
): IProgressState {
	const data = event.data;
	return {
		...state,
		status: "failed",
		errorMessage: data.error?.message || "Unknown error",
		errorCode: data.error?.code,
		logs: addLog(
			state.logs,
			"error",
			`Evaluation failed: ${data.error?.message || "Unknown error"}`,
		),
	};
}

/**
 * Process clone.started event
 */
export function processCloneStartedEvent(
	state: IProgressState,
	_event: ICloneStartedEvent,
): IProgressState {
	return {
		...state,
		logs: addLog(state.logs, "info", "Cloning repository..."),
	};
}

/**
 * Process clone.completed event
 */
export function processCloneCompletedEvent(
	state: IProgressState,
	_event: ICloneCompletedEvent,
): IProgressState {
	return {
		...state,
		logs: addLog(state.logs, "success", "Repository cloned successfully"),
	};
}

/**
 * Process clone.warning event
 */
export function processCloneWarningEvent(
	state: IProgressState,
	event: ICloneWarningEvent,
): IProgressState {
	return {
		...state,
		logs: addLog(state.logs, "warning", event.data.message),
	};
}

/**
 * Process discovery.started event
 */
export function processDiscoveryStartedEvent(
	state: IProgressState,
	_event: IDiscoveryStartedEvent,
): IProgressState {
	return {
		...state,
		logs: addLog(state.logs, "info", "Discovering context files..."),
	};
}

/**
 * Process discovery.completed event
 */
export function processDiscoveryCompletedEvent(
	state: IProgressState,
	event: IDiscoveryCompletedEvent,
): IProgressState {
	const count = event.data.filesFound;
	return {
		...state,
		logs: addLog(
			state.logs,
			"success",
			`Found ${count} context file${count !== 1 ? "s" : ""}`,
		),
	};
}

/**
 * Process context.cloc event
 */
export function processContextClocEvent(
	state: IProgressState,
	event: IContextClocEvent,
): IProgressState {
	const { status, totalLines, languageCount } = event.data;

	if (status === "started") {
		return {
			...state,
			logs: addLog(state.logs, "info", "Analyzing codebase size..."),
		};
	}

	// completed
	if (totalLines !== undefined && languageCount !== undefined) {
		return {
			...state,
			logs: addLog(
				state.logs,
				"success",
				`Codebase: ${totalLines.toLocaleString()} lines across ${languageCount} language${languageCount !== 1 ? "s" : ""}`,
			),
		};
	}

	return state;
}

/**
 * Process context.folders event
 */
export function processContextFoldersEvent(
	state: IProgressState,
	event: IContextFoldersEvent,
): IProgressState {
	const { status, folderCount } = event.data;

	if (status === "started") {
		return {
			...state,
			logs: addLog(state.logs, "info", "Analyzing directory structure..."),
		};
	}

	// completed
	if (folderCount !== undefined) {
		return {
			...state,
			logs: addLog(
				state.logs,
				"success",
				`Structure: ${folderCount} key director${folderCount !== 1 ? "ies" : "y"}`,
			),
		};
	}

	return state;
}

/**
 * Process context.analysis event
 */
export function processContextAnalysisEvent(
	state: IProgressState,
	event: IContextAnalysisEvent,
): IProgressState {
	const { status } = event.data;

	if (status === "started") {
		return {
			...state,
			logs: addLog(state.logs, "info", "Identifying project context..."),
		};
	}

	// completed
	return {
		...state,
		logs: addLog(state.logs, "success", "Project context identified"),
	};
}

/**
 * Process context.warning event
 */
export function processContextWarningEvent(
	state: IProgressState,
	event: IContextWarningEvent,
): IProgressState {
	return {
		...state,
		logs: addLog(state.logs, "warning", event.data.message),
	};
}

/**
 * Process any SSE event and return updated state
 * This is the main entry point for event processing
 */
export function processProgressEvent(
	state: IProgressState | null,
	event: SSEEvent,
): IProgressState | null {
	if (!state) return state;

	switch (event.type) {
		case "job.started":
			return processJobStartedEvent(state, event as IJobStartedEvent);

		case "file.started":
			return processFileStartedEvent(state, event as IFileStartedEvent);

		case "file.completed":
			return processFileCompletedEvent(state, event as IFileCompletedEvent);

		case "evaluator.progress":
			return processEvaluatorProgressEvent(
				state,
				event as IEvaluatorProgressEvent,
			);

		case "evaluator.completed":
			return processEvaluatorCompletedEvent(state);

		case "evaluator.retry":
			return processEvaluatorRetryEvent(state, event as IEvaluatorRetryEvent);

		case "evaluator.timeout":
			return processEvaluatorTimeoutEvent(
				state,
				event as IEvaluatorTimeoutEvent,
			);

		case "curation.started":
			return processCurationStartedEvent(state, event as ICurationStartedEvent);

		case "curation.completed":
			return processCurationCompletedEvent(
				state,
				event as ICurationCompletedEvent,
			);

		case "job.completed":
			return processJobCompletedEvent(state, event as IJobCompletedEvent);

		case "job.failed":
			return processJobFailedEvent(state, event as IJobFailedEvent);

		// Clone events
		case "clone.started":
			return processCloneStartedEvent(state, event as ICloneStartedEvent);

		case "clone.completed":
			return processCloneCompletedEvent(state, event as ICloneCompletedEvent);

		case "clone.warning":
			return processCloneWarningEvent(state, event as ICloneWarningEvent);

		// Discovery events
		case "discovery.started":
			return processDiscoveryStartedEvent(
				state,
				event as IDiscoveryStartedEvent,
			);

		case "discovery.completed":
			return processDiscoveryCompletedEvent(
				state,
				event as IDiscoveryCompletedEvent,
			);

		// Context sub-step events
		case "context.cloc":
			return processContextClocEvent(state, event as IContextClocEvent);

		case "context.folders":
			return processContextFoldersEvent(state, event as IContextFoldersEvent);

		case "context.analysis":
			return processContextAnalysisEvent(state, event as IContextAnalysisEvent);

		case "context.warning":
			return processContextWarningEvent(state, event as IContextWarningEvent);

		default:
			return state;
	}
}

/**
 * Create initial progress state for a new evaluation job
 */
export function createInitialProgressState(
	repositoryUrl: string,
	totalEvaluators: number,
): IProgressState {
	return {
		status: "queued",
		repositoryUrl,
		totalFiles: 0,
		completedFiles: 0,
		totalEvaluators,
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
	};
}
