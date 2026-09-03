import { describe, expect, test } from "bun:test";
import type { EvaluationOutput } from "@shared/types/evaluation";
import {
	buildJsonReport,
	convertJsonReportToEvaluationOutput,
	extractAllIssues,
	parseIssuesFromResultString,
} from "./report-formatters";

describe("parseIssuesFromResultString", () => {
	test("parses unified object format with perFileIssues and crossFileIssues", () => {
		const result = JSON.stringify({
			perFileIssues: {
				"AGENTS.md": [
					{
						category: "Language Clarity",
						severity: 8,
						problem: "Ambiguous pronoun",
						location: { file: "AGENTS.md", start: 10, end: 10 },
					},
				],
			},
			crossFileIssues: [
				{
					category: "Language Clarity",
					severity: 7,
					problem: "Conflicting terms",
					isMultiFile: true,
					location: [
						{ file: "AGENTS.md", start: 1, end: 1 },
						{ file: ".github/copilot-instructions.md", start: 2, end: 2 },
					],
				},
			],
		});

		const issues = parseIssuesFromResultString(result);
		expect(issues).toHaveLength(2);
		expect(issues[0]?.problem).toBe("Ambiguous pronoun");
		expect(issues[1]?.problem).toBe("Conflicting terms");
	});

	test("parses bare JSON array format", () => {
		const result = JSON.stringify([
			{
				category: "Security",
				severity: 9,
				problem: "Hardcoded secret",
				location: { file: "AGENTS.md", start: 1, end: 1 },
			},
		]);

		const issues = parseIssuesFromResultString(result);
		expect(issues).toHaveLength(1);
		expect(issues[0]?.category).toBe("Security");
	});

	test("returns empty array for empty object shape", () => {
		const result = JSON.stringify({ perFileIssues: {}, crossFileIssues: [] });
		expect(parseIssuesFromResultString(result)).toEqual([]);
	});
});

describe("extractAllIssues", () => {
	test("extracts issues from unified engine output shape", () => {
		const output: EvaluationOutput = {
			metadata: {
				generatedAt: "2026-09-03",
				agent: "cursor",
				evaluationMode: "unified",
				totalFiles: 2,
				totalIssues: 2,
				highCount: 1,
				mediumCount: 1,
			},
			results: [
				{
					evaluator: "language-clarity",
					output: {
						type: "evaluation",
						subtype: "unified",
						is_error: false,
						duration_ms: 100,
						num_turns: 1,
						result: JSON.stringify({
							perFileIssues: {
								"AGENTS.md": [
									{
										category: "Language Clarity",
										severity: 8,
										problem: "Truncated rule blurb",
										location: { file: "AGENTS.md", start: 86, end: 86 },
										fix: "Replace truncated blurbs with complete sentences",
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
			crossFileIssues: [
				{
					issueType: "error",
					category: "Consistency",
					severity: 7,
					problem: "AGENTS/CLAUDE mismatch",
					location: { file: "AGENTS.md", start: 1, end: 1 },
				},
			],
		};

		const issues = extractAllIssues(output);
		expect(issues).toHaveLength(2);
		expect(issues[0]?.severity).toBe(8);
		expect(issues[0]?.evaluatorName).toBe("language-clarity");
		expect(issues[1]?.evaluatorName).toBe("cross-file");
	});

	test("buildJsonReport populates issues array for UI import", () => {
		const output: EvaluationOutput = {
			metadata: {
				generatedAt: "2026-09-03",
				agent: "cursor",
				evaluationMode: "unified",
				totalFiles: 1,
				totalIssues: 1,
				highCount: 1,
				mediumCount: 0,
				perFileIssues: 1,
				crossFileIssues: 0,
			},
			results: [
				{
					evaluator: "testing-validation",
					output: {
						type: "evaluation",
						subtype: "unified",
						is_error: false,
						duration_ms: 50,
						num_turns: 1,
						result: JSON.stringify({
							perFileIssues: {
								"AGENTS.md": [
									{
										category: "Testing Guidance",
										severity: 9,
										issueType: "error",
										problem: "No copy-pasteable test commands",
										location: { file: "AGENTS.md", start: 64, end: 71 },
										fix: "Add concrete bin/docker_test.sh examples",
									},
								],
							},
							crossFileIssues: [],
						}),
						session_id: "",
						total_cost_usd: 0,
						usage: {
							input_tokens: 10,
							output_tokens: 5,
							cache_creation_input_tokens: 0,
							cache_read_input_tokens: 0,
						},
						uuid: "",
					},
				},
			],
			crossFileIssues: [],
		};

		const report = buildJsonReport(output);
		expect(report.issues).toHaveLength(1);
		expect(report.issues[0]?.problem).toBe("No copy-pasteable test commands");
		expect(report.statistics.issueTypes.errors).toBe(1);
		expect(report.issues[0]?.severityLevel).toBeTruthy();
		expect(report.issues[0]?.formattedLocation).toContain("AGENTS.md");

		const roundTrip = convertJsonReportToEvaluationOutput(report);
		const reextracted = extractAllIssues(roundTrip);
		expect(reextracted).toHaveLength(1);
		expect(reextracted[0]?.problem).toBe("No copy-pasteable test commands");
	});
});
