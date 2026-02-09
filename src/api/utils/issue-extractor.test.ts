import { describe, expect, test } from "bun:test";
import type { EvaluationOutput } from "@shared/types/evaluation";
import { extractIssuesFromEvaluation } from "./issue-extractor";

describe("extractIssuesFromEvaluation", () => {
	test("extracts issues from unified format", () => {
		const data: EvaluationOutput = {
			metadata: {
				generatedAt: "2026-01-01",
				agent: "claude",
				evaluationMode: "unified",
				totalFiles: 1,
			},
			results: [
				{
					evaluator: "content-quality",
					output: {
						type: "text",
						subtype: "",
						is_error: false,
						duration_ms: 100,
						num_turns: 1,
						result: JSON.stringify([
							{
								issueType: "error",
								severity: 8,
								category: "Content Quality",
								description: "Test issue",
								location: { start: 1, end: 5 },
							},
						]),
						session_id: "s1",
						total_cost_usd: 0.01,
						usage: {
							input_tokens: 100,
							output_tokens: 50,
							cache_creation_input_tokens: 0,
							cache_read_input_tokens: 0,
						},
						uuid: "test-uuid-1",
					},
				},
				{
					evaluator: "security",
					output: {
						type: "text",
						subtype: "",
						is_error: false,
						duration_ms: 50,
						num_turns: 1,
						result: JSON.stringify([
							{
								issueType: "error",
								severity: 9,
								category: "Security",
								description: "Security issue",
								location: { start: 10, end: 15 },
							},
						]),
						session_id: "s2",
						total_cost_usd: 0.01,
						usage: {
							input_tokens: 100,
							output_tokens: 50,
							cache_creation_input_tokens: 0,
							cache_read_input_tokens: 0,
						},
						uuid: "test-uuid-2",
					},
				},
			],
			crossFileIssues: [],
		};

		const issues = extractIssuesFromEvaluation(data);
		expect(issues).toHaveLength(2);
		expect(issues[0]!.evaluatorName).toBe("content-quality");
		expect(issues[0]!.description).toBe("Test issue");
		expect(issues[1]!.evaluatorName).toBe("security");
	});

	test("extracts cross-file issues from unified format", () => {
		const data: EvaluationOutput = {
			metadata: {
				generatedAt: "2026-01-01",
				agent: "claude",
				evaluationMode: "unified",
				totalFiles: 1,
			},
			results: [],
			crossFileIssues: [
				{
					issueType: "error",
					severity: 7,
					category: "Cross File",
					description: "Cross-file issue",
					location: { start: 1, end: 2 },
				},
			],
		};

		const issues = extractIssuesFromEvaluation(data);
		expect(issues).toHaveLength(1);
		expect(issues[0]!.evaluatorName).toBe("cross-file");
		expect(issues[0]!.description).toBe("Cross-file issue");
	});

	test("extracts issues from independent format with issues array", () => {
		const data: EvaluationOutput = {
			metadata: {
				generatedAt: "2026-01-01",
				agent: "claude",
				evaluationMode: "independent",
				totalFiles: 1,
			},
			files: {
				"AGENTS.md": {
					evaluations: [
						{
							evaluator: "command-completeness",
							issues: [
								{
									issueType: "error",
									severity: 6,
									category: "Commands",
									description: "Missing command",
									location: { start: 5, end: 8 },
								},
							],
						},
					],
				},
			},
			crossFileIssues: [],
		};

		const issues = extractIssuesFromEvaluation(data);
		expect(issues).toHaveLength(1);
		expect(issues[0]!.evaluatorName).toBe("command-completeness");
	});

	test("extracts issues from independent format with output.result string", () => {
		const data: EvaluationOutput = {
			metadata: {
				generatedAt: "2026-01-01",
				agent: "claude",
				evaluationMode: "independent",
				totalFiles: 1,
			},
			files: {
				"AGENTS.md": {
					evaluations: [
						{
							evaluator: "code-style",
							output: {
								result: JSON.stringify([
									{
										issueType: "error",
										severity: 7,
										category: "Code Style",
										description: "Style issue",
										location: { start: 1, end: 3 },
									},
								]),
							},
						},
					],
				},
			},
			crossFileIssues: [],
		};

		const issues = extractIssuesFromEvaluation(data);
		expect(issues).toHaveLength(1);
		expect(issues[0]!.evaluatorName).toBe("code-style");
	});

	test("handles object format result string (perFileIssues + crossFileIssues)", () => {
		const data: EvaluationOutput = {
			metadata: {
				generatedAt: "2026-01-01",
				agent: "claude",
				evaluationMode: "unified",
				totalFiles: 1,
			},
			results: [
				{
					evaluator: "test-evaluator",
					output: {
						type: "text",
						subtype: "",
						is_error: false,
						duration_ms: 100,
						num_turns: 1,
						result: JSON.stringify({
							perFileIssues: {
								"file.md": [
									{
										issueType: "error",
										severity: 8,
										category: "Test",
										description: "Per-file issue",
										location: { start: 1, end: 2 },
									},
								],
							},
							crossFileIssues: [
								{
									issueType: "suggestion",
									impactLevel: "High",
									category: "Cross",
									description: "Cross issue in result",
									location: { start: 3, end: 4 },
								},
							],
						}),
						session_id: "s1",
						total_cost_usd: 0.01,
						usage: {
							input_tokens: 100,
							output_tokens: 50,
							cache_creation_input_tokens: 0,
							cache_read_input_tokens: 0,
						},
						uuid: "test-uuid-3",
					},
				},
			],
			crossFileIssues: [],
		};

		const issues = extractIssuesFromEvaluation(data);
		expect(issues).toHaveLength(2);
		expect(issues[0]!.description).toBe("Per-file issue");
		expect(issues[1]!.description).toBe("Cross issue in result");
	});

	test("handles empty evaluation data", () => {
		const data: EvaluationOutput = {
			metadata: {
				generatedAt: "2026-01-01",
				agent: "claude",
				evaluationMode: "unified",
				totalFiles: 0,
			},
			results: [],
			crossFileIssues: [],
		};

		const issues = extractIssuesFromEvaluation(data);
		expect(issues).toHaveLength(0);
	});

	test("handles malformed result string gracefully", () => {
		const data: EvaluationOutput = {
			metadata: {
				generatedAt: "2026-01-01",
				agent: "claude",
				evaluationMode: "unified",
				totalFiles: 1,
			},
			results: [
				{
					evaluator: "broken",
					output: {
						type: "text",
						subtype: "",
						is_error: false,
						duration_ms: 100,
						num_turns: 1,
						result: "This is not valid JSON at all",
						session_id: "s1",
						total_cost_usd: 0.01,
						usage: {
							input_tokens: 100,
							output_tokens: 50,
							cache_creation_input_tokens: 0,
							cache_read_input_tokens: 0,
						},
						uuid: "test-uuid-4",
					},
				},
			],
			crossFileIssues: [],
		};

		const issues = extractIssuesFromEvaluation(data);
		expect(issues).toHaveLength(0);
	});

	test("extracts issues from unified format with zero-valued usage (cursor/codex providers)", () => {
		const data: EvaluationOutput = {
			metadata: {
				generatedAt: "2026-01-01",
				agent: "cursor",
				evaluationMode: "unified",
				totalFiles: 1,
			},
			results: [
				{
					evaluator: "content-quality",
					output: {
						type: "evaluation",
						subtype: "unified",
						is_error: false,
						duration_ms: 5000,
						num_turns: 1,
						result: JSON.stringify({
							perFileIssues: {
								"AGENTS.md": [
									{
										issueType: "error",
										severity: 8,
										category: "Content Quality",
										description: "Human-focused content detected",
										location: { start: 1, end: 10 },
									},
								],
							},
							crossFileIssues: [],
						}),
						session_id: "",
						total_cost_usd: 0,
						usage: {
							input_tokens: 0,
							output_tokens: 0,
							cache_creation_input_tokens: 0,
							cache_read_input_tokens: 0,
						},
						uuid: "",
					},
				},
				{
					evaluator: "security",
					output: {
						type: "evaluation",
						subtype: "unified",
						is_error: false,
						duration_ms: 3000,
						num_turns: 1,
						result: JSON.stringify({
							perFileIssues: {
								"AGENTS.md": [
									{
										issueType: "error",
										severity: 9,
										category: "Security",
										description: "Exposed API key",
										location: { start: 20, end: 25 },
									},
								],
							},
							crossFileIssues: [],
						}),
						session_id: "",
						total_cost_usd: 0,
						usage: {
							input_tokens: 0,
							output_tokens: 0,
							cache_creation_input_tokens: 0,
							cache_read_input_tokens: 0,
						},
						uuid: "",
					},
				},
			],
			crossFileIssues: [],
		};

		const issues = extractIssuesFromEvaluation(data);
		expect(issues).toHaveLength(2);
		expect(issues[0]!.evaluatorName).toBe("content-quality");
		expect(issues[0]!.description).toBe("Human-focused content detected");
		expect(issues[1]!.evaluatorName).toBe("security");
		expect(issues[1]!.description).toBe("Exposed API key");
	});

	test("skips evaluators with no output", () => {
		const data: EvaluationOutput = {
			metadata: {
				generatedAt: "2026-01-01",
				agent: "claude",
				evaluationMode: "unified",
				totalFiles: 1,
			},
			results: [
				{
					evaluator: "skipped",
					skipped: true,
					skipReason: "No file",
				},
			],
			crossFileIssues: [],
		};

		const issues = extractIssuesFromEvaluation(data);
		expect(issues).toHaveLength(0);
	});
});
