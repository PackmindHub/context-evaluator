import { describe, expect, test } from "bun:test";
import type {
	ICurationCompletedEvent,
	ICurationStartedEvent,
	IEvaluatorProgressEvent,
	IEvaluatorRetryEvent,
	IEvaluatorTimeoutEvent,
	IFileCompletedEvent,
	IFileStartedEvent,
	IJobCompletedEvent,
	IJobFailedEvent,
	IJobStartedEvent,
	IProgressState,
} from "../types/job";
import {
	createInitialProgressState,
	processCurationCompletedEvent,
	processCurationStartedEvent,
	processEvaluatorCompletedEvent,
	processEvaluatorProgressEvent,
	processEvaluatorRetryEvent,
	processEvaluatorTimeoutEvent,
	processFileCompletedEvent,
	processFileStartedEvent,
	processJobCompletedEvent,
	processJobFailedEvent,
	processJobStartedEvent,
	processProgressEvent,
} from "./progress-events";

// ============================================================================
// Test Fixtures
// ============================================================================

const createProgressState = (
	overrides: Partial<IProgressState> = {},
): IProgressState => ({
	status: "queued",
	repositoryUrl: "https://github.com/test/repo",
	totalFiles: 0,
	completedFiles: 0,
	totalEvaluators: 17,
	completedEvaluators: 0,
	percentage: 0,
	startTime: new Date(),
	logs: [],
	...overrides,
});

// ============================================================================
// createInitialProgressState Tests
// ============================================================================

describe("createInitialProgressState", () => {
	test("creates initial state with correct values", () => {
		const state = createInitialProgressState(
			"https://github.com/test/repo",
			17,
		);

		expect(state.status).toBe("queued");
		expect(state.repositoryUrl).toBe("https://github.com/test/repo");
		expect(state.totalFiles).toBe(0);
		expect(state.completedFiles).toBe(0);
		expect(state.totalEvaluators).toBe(17);
		expect(state.completedEvaluators).toBe(0);
		expect(state.percentage).toBe(0);
		expect(state.startTime).toBeInstanceOf(Date);
		expect(state.logs).toHaveLength(1);
		expect(state.logs[0].type).toBe("info");
		expect(state.logs[0].message).toBe("Evaluation job submitted");
	});
});

// ============================================================================
// processJobStartedEvent Tests
// ============================================================================

describe("processJobStartedEvent", () => {
	test("updates status to running", () => {
		const state = createProgressState();
		const event: IJobStartedEvent = {
			type: "job.started",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				totalFiles: 2,
				evaluationMode: "unified",
			},
		};

		const result = processJobStartedEvent(state, event);
		expect(result.status).toBe("running");
	});

	test("sets totalFiles from event data", () => {
		const state = createProgressState();
		const event: IJobStartedEvent = {
			type: "job.started",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				totalFiles: 5,
				evaluationMode: "independent",
			},
		};

		const result = processJobStartedEvent(state, event);
		expect(result.totalFiles).toBe(5);
	});

	test("adds log entry with evaluation mode", () => {
		const state = createProgressState();
		const event: IJobStartedEvent = {
			type: "job.started",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				totalFiles: 3,
				evaluationMode: "unified",
			},
		};

		const result = processJobStartedEvent(state, event);
		expect(result.logs).toHaveLength(1);
		expect(result.logs[0].message).toContain("unified mode");
		expect(result.logs[0].message).toContain("3 file(s)");
	});
});

// ============================================================================
// processFileStartedEvent Tests
// ============================================================================

describe("processFileStartedEvent", () => {
	test("sets currentFile from event data", () => {
		const state = createProgressState();
		const event: IFileStartedEvent = {
			type: "file.started",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				filePath: "AGENTS.md",
				fileIndex: 0,
				totalFiles: 2,
			},
		};

		const result = processFileStartedEvent(state, event);
		expect(result.currentFile).toBe("AGENTS.md");
	});

	test("adds log entry with file path", () => {
		const state = createProgressState();
		const event: IFileStartedEvent = {
			type: "file.started",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				filePath: "src/AGENTS.md",
				fileIndex: 1,
				totalFiles: 2,
			},
		};

		const result = processFileStartedEvent(state, event);
		expect(result.logs[0].message).toBe("Processing src/AGENTS.md");
	});
});

// ============================================================================
// processFileCompletedEvent Tests
// ============================================================================

describe("processFileCompletedEvent", () => {
	test("increments completedFiles", () => {
		const state = createProgressState({ completedFiles: 1, totalFiles: 3 });
		const event: IFileCompletedEvent = {
			type: "file.completed",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				filePath: "AGENTS.md",
				totalIssues: 5,
				highCount: 3,
				mediumCount: 2,
				lowCount: 0,
			},
		};

		const result = processFileCompletedEvent(state, event);
		expect(result.completedFiles).toBe(2);
	});

	test("updates percentage based on file progress", () => {
		const state = createProgressState({ completedFiles: 0, totalFiles: 4 });
		const event: IFileCompletedEvent = {
			type: "file.completed",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				filePath: "AGENTS.md",
				totalIssues: 0,
				highCount: 0,
				mediumCount: 0,
				lowCount: 0,
			},
		};

		const result = processFileCompletedEvent(state, event);
		// 1/4 files = 25%, but scaled to 50% of total progress
		expect(result.percentage).toBe(13); // Math.round(0.25 * 50)
	});
});

// ============================================================================
// processEvaluatorProgressEvent Tests
// ============================================================================

describe("processEvaluatorProgressEvent", () => {
	test("updates currentEvaluator", () => {
		const state = createProgressState();
		const event: IEvaluatorProgressEvent = {
			type: "evaluator.progress",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				evaluatorName: "01-content-quality",
				evaluatorIndex: 0,
				totalEvaluators: 17,
			},
		};

		const result = processEvaluatorProgressEvent(state, event);
		expect(result.currentEvaluator).toBe("01-content-quality");
	});

	test("updates completedEvaluators from evaluatorIndex", () => {
		const state = createProgressState();
		const event: IEvaluatorProgressEvent = {
			type: "evaluator.progress",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				evaluatorName: "03-command-completeness",
				evaluatorIndex: 2,
				totalEvaluators: 17,
			},
		};

		const result = processEvaluatorProgressEvent(state, event);
		expect(result.completedEvaluators).toBe(2);
	});

	test("calculates percentage based on evaluator progress", () => {
		const state = createProgressState();
		const event: IEvaluatorProgressEvent = {
			type: "evaluator.progress",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				evaluatorName: "test",
				evaluatorIndex: 10,
				totalEvaluators: 20,
			},
		};

		const result = processEvaluatorProgressEvent(state, event);
		// 10/20 = 50% of evaluator progress, which is 50% of second half = 25%
		// Total: 50% + 25% = 75%
		expect(result.percentage).toBe(75);
	});

	test("adds log with evaluator name and progress", () => {
		const state = createProgressState();
		const event: IEvaluatorProgressEvent = {
			type: "evaluator.progress",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				evaluatorName: "05-code-style",
				evaluatorIndex: 4,
				totalEvaluators: 17,
			},
		};

		const result = processEvaluatorProgressEvent(state, event);
		expect(result.logs[0].message).toBe("Running 05-code-style (5/17)");
	});
});

// ============================================================================
// processEvaluatorCompletedEvent Tests
// ============================================================================

describe("processEvaluatorCompletedEvent", () => {
	test("increments completedEvaluators", () => {
		const state = createProgressState({ completedEvaluators: 5 });
		const result = processEvaluatorCompletedEvent(state);
		expect(result.completedEvaluators).toBe(6);
	});
});

// ============================================================================
// processEvaluatorRetryEvent Tests
// ============================================================================

describe("processEvaluatorRetryEvent", () => {
	test("adds warning log with retry information", () => {
		const state = createProgressState();
		const event: IEvaluatorRetryEvent = {
			type: "evaluator.retry",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				evaluatorName: "01-content-quality",
				attempt: 1,
				maxRetries: 3,
				error: "API timeout",
			},
		};

		const result = processEvaluatorRetryEvent(state, event);
		expect(result.logs[0].type).toBe("warning");
		expect(result.logs[0].message).toContain("Retry 1/3");
		expect(result.logs[0].message).toContain("01-content-quality");
		expect(result.logs[0].message).toContain("2 retries remaining");
	});

	test("truncates long error messages", () => {
		const state = createProgressState();
		const longError = "A".repeat(150);
		const event: IEvaluatorRetryEvent = {
			type: "evaluator.retry",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				evaluatorName: "test",
				attempt: 1,
				maxRetries: 3,
				error: longError,
			},
		};

		const result = processEvaluatorRetryEvent(state, event);
		expect(result.logs[0].message).toContain("...");
		expect(result.logs[0].message.length).toBeLessThan(200);
	});
});

// ============================================================================
// processEvaluatorTimeoutEvent Tests
// ============================================================================

describe("processEvaluatorTimeoutEvent", () => {
	test("adds error log with timeout information", () => {
		const state = createProgressState();
		const event: IEvaluatorTimeoutEvent = {
			type: "evaluator.timeout",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				evaluatorName: "slow-evaluator",
				elapsedMs: 65000,
				timeoutMs: 60000,
			},
		};

		const result = processEvaluatorTimeoutEvent(state, event);
		expect(result.logs[0].type).toBe("error");
		expect(result.logs[0].message).toContain("Timeout");
		expect(result.logs[0].message).toContain("slow-evaluator");
		expect(result.logs[0].message).toContain("60s limit");
		expect(result.logs[0].message).toContain("elapsed: 65s");
	});
});

// ============================================================================
// processCurationStartedEvent Tests
// ============================================================================

describe("processCurationStartedEvent", () => {
	test("sets currentEvaluator for errors curation", () => {
		const state = createProgressState();
		const event: ICurationStartedEvent = {
			type: "curation.started",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				totalIssues: 50,
				issueType: "error",
			},
		};

		const result = processCurationStartedEvent(state, event);
		expect(result.currentEvaluator).toBe("Impact Curation (errors)");
	});

	test("sets currentEvaluator for suggestions curation", () => {
		const state = createProgressState();
		const event: ICurationStartedEvent = {
			type: "curation.started",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				totalIssues: 30,
				issueType: "suggestion",
			},
		};

		const result = processCurationStartedEvent(state, event);
		expect(result.currentEvaluator).toBe("Impact Curation (suggestions)");
	});

	test("adds log with total issues count", () => {
		const state = createProgressState();
		const event: ICurationStartedEvent = {
			type: "curation.started",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				totalIssues: 100,
				issueType: "error",
			},
		};

		const result = processCurationStartedEvent(state, event);
		expect(result.logs[0].message).toContain("100 total");
	});
});

// ============================================================================
// processCurationCompletedEvent Tests
// ============================================================================

describe("processCurationCompletedEvent", () => {
	test("adds success log with curated count", () => {
		const state = createProgressState();
		const event: ICurationCompletedEvent = {
			type: "curation.completed",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				curatedCount: 10,
				issueType: "error",
			},
		};

		const result = processCurationCompletedEvent(state, event);
		expect(result.logs[0].type).toBe("success");
		expect(result.logs[0].message).toContain("10 selected");
		expect(result.logs[0].message).toContain("errors");
	});
});

// ============================================================================
// processJobCompletedEvent Tests
// ============================================================================

describe("processJobCompletedEvent", () => {
	test("sets status to completed", () => {
		const state = createProgressState({ status: "running" });
		const event: IJobCompletedEvent = {
			type: "job.completed",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				result: {
					metadata: {
						generatedAt: new Date().toISOString(),
						agent: "claude",
						evaluationMode: "unified",
						totalFiles: 1,
					},
					results: [],
				},
				duration: 45000,
			},
		};

		const result = processJobCompletedEvent(state, event);
		expect(result.status).toBe("completed");
	});

	test("sets percentage to 100", () => {
		const state = createProgressState({ percentage: 85 });
		const event: IJobCompletedEvent = {
			type: "job.completed",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				result: {
					metadata: {
						generatedAt: new Date().toISOString(),
						agent: "claude",
						evaluationMode: "unified",
						totalFiles: 1,
					},
					results: [],
				},
				duration: 30000,
			},
		};

		const result = processJobCompletedEvent(state, event);
		expect(result.percentage).toBe(100);
	});

	test("adds success log with duration", () => {
		const state = createProgressState();
		const event: IJobCompletedEvent = {
			type: "job.completed",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				result: {
					metadata: {
						generatedAt: new Date().toISOString(),
						agent: "claude",
						evaluationMode: "unified",
						totalFiles: 1,
					},
					results: [],
				},
				duration: 120000,
			},
		};

		const result = processJobCompletedEvent(state, event);
		expect(result.logs[0].type).toBe("success");
		expect(result.logs[0].message).toContain("120s");
	});
});

// ============================================================================
// processJobFailedEvent Tests
// ============================================================================

describe("processJobFailedEvent", () => {
	test("sets status to failed", () => {
		const state = createProgressState({ status: "running" });
		const event: IJobFailedEvent = {
			type: "job.failed",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				error: {
					message: "Repository not found",
					code: "REPO_NOT_FOUND",
				},
			},
		};

		const result = processJobFailedEvent(state, event);
		expect(result.status).toBe("failed");
	});

	test("sets errorMessage from event", () => {
		const state = createProgressState();
		const event: IJobFailedEvent = {
			type: "job.failed",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				error: {
					message: "Invalid repository URL",
					code: "INVALID_URL",
				},
			},
		};

		const result = processJobFailedEvent(state, event);
		expect(result.errorMessage).toBe("Invalid repository URL");
	});

	test("sets errorCode from event", () => {
		const state = createProgressState();
		const event: IJobFailedEvent = {
			type: "job.failed",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				error: {
					message: "Some error",
					code: "API_ERROR",
				},
			},
		};

		const result = processJobFailedEvent(state, event);
		expect(result.errorCode).toBe("API_ERROR");
	});

	test("adds error log", () => {
		const state = createProgressState();
		const event: IJobFailedEvent = {
			type: "job.failed",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				error: {
					message: "Clone failed",
					code: "CLONE_ERROR",
				},
			},
		};

		const result = processJobFailedEvent(state, event);
		expect(result.logs[0].type).toBe("error");
		expect(result.logs[0].message).toContain("Clone failed");
	});

	test("handles missing error message", () => {
		const state = createProgressState();
		const event = {
			type: "job.failed",
			jobId: "test-job",
			timestamp: new Date().toISOString(),
			data: {
				error: {},
			},
		} as IJobFailedEvent;

		const result = processJobFailedEvent(state, event);
		expect(result.errorMessage).toBe("Unknown error");
	});
});

// ============================================================================
// processProgressEvent Tests (Main Entry Point)
// ============================================================================

describe("processProgressEvent", () => {
	test("returns null when state is null", () => {
		const event: IJobStartedEvent = {
			type: "job.started",
			jobId: "test",
			timestamp: new Date().toISOString(),
			data: { totalFiles: 1, evaluationMode: "unified" },
		};

		expect(processProgressEvent(null, event)).toBeNull();
	});

	test("handles job.started event", () => {
		const state = createProgressState();
		const event: IJobStartedEvent = {
			type: "job.started",
			jobId: "test",
			timestamp: new Date().toISOString(),
			data: { totalFiles: 2, evaluationMode: "unified" },
		};

		const result = processProgressEvent(state, event);
		expect(result?.status).toBe("running");
	});

	test("handles file.started event", () => {
		const state = createProgressState();
		const event: IFileStartedEvent = {
			type: "file.started",
			jobId: "test",
			timestamp: new Date().toISOString(),
			data: { filePath: "test.md", fileIndex: 0, totalFiles: 1 },
		};

		const result = processProgressEvent(state, event);
		expect(result?.currentFile).toBe("test.md");
	});

	test("handles unknown event type gracefully", () => {
		const state = createProgressState();
		const event = {
			type: "unknown.event",
			jobId: "test",
			timestamp: new Date().toISOString(),
		} as unknown as IJobStartedEvent;

		const result = processProgressEvent(state, event);
		expect(result).toEqual(state);
	});

	test("trims logs to max 50 entries", () => {
		let state = createProgressState({
			logs: Array(49).fill({
				timestamp: new Date(),
				type: "info" as const,
				message: "existing log",
			}),
		});

		// Add 5 more events to exceed max
		for (let i = 0; i < 5; i++) {
			const event: IFileStartedEvent = {
				type: "file.started",
				jobId: "test",
				timestamp: new Date().toISOString(),
				data: { filePath: `file${i}.md`, fileIndex: i, totalFiles: 5 },
			};
			state = processProgressEvent(state, event) as IProgressState;
		}

		expect(state.logs.length).toBeLessThanOrEqual(50);
	});
});
