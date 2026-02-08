import { Database } from "bun:sqlite";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import { IssuesRoutes } from "./issues";

// Mock the database
let testDb: Database;

mock.module("../db/database", () => ({
	getDatabase: () => testDb,
}));

// Helper to create a unified evaluation result_json
function createUnifiedResultJson(
	issues: Array<{
		issueType: string;
		severity?: number;
		impactLevel?: string;
		category: string;
		description: string;
		evaluator: string;
	}>,
) {
	const evaluatorGroups: Record<
		string,
		Array<{
			issueType: string;
			severity?: number;
			impactLevel?: string;
			category: string;
			description: string;
			location: { start: number; end: number };
		}>
	> = {};

	for (const issue of issues) {
		if (!evaluatorGroups[issue.evaluator]) {
			evaluatorGroups[issue.evaluator] = [];
		}
		const { evaluator: _e, ...issueData } = issue;
		evaluatorGroups[issue.evaluator]!.push({
			...issueData,
			location: { start: 1, end: 5 },
		});
	}

	return JSON.stringify({
		metadata: {
			generatedAt: "2026-01-01",
			agent: "claude",
			evaluationMode: "unified",
			totalFiles: 1,
		},
		results: Object.entries(evaluatorGroups).map(([evaluator, evalIssues]) => ({
			evaluator,
			output: {
				type: "text",
				subtype: "",
				is_error: false,
				duration_ms: 100,
				num_turns: 1,
				result: JSON.stringify(evalIssues),
				session_id: "s1",
				total_cost_usd: 0.01,
				usage: { input_tokens: 100, output_tokens: 50 },
			},
		})),
		crossFileIssues: [],
	});
}

// Helper to insert an evaluation
function insertEvaluation(
	id: string,
	repositoryUrl: string,
	resultJson: string,
	completedAt = "2026-01-15T10:00:00Z",
) {
	testDb.run(
		`INSERT INTO evaluations (
			id, repository_url, evaluation_mode, evaluators_count, status,
			total_files, total_issues, critical_count, high_count, medium_count,
			total_cost_usd, total_duration_ms, total_input_tokens, total_output_tokens,
			curated_count, result_json, created_at, completed_at
		) VALUES (?, ?, 'unified', 5, 'completed', 1, 3, 0, 1, 1, 0.05, 5000, 500, 200, 0, ?, ?, ?)`,
		[id, repositoryUrl, resultJson, completedAt, completedAt],
	);
}

describe("IssuesRoutes", () => {
	let routes: IssuesRoutes;

	beforeAll(() => {
		testDb = new Database(":memory:");
		testDb.run(`
			CREATE TABLE IF NOT EXISTS evaluations (
				id TEXT PRIMARY KEY,
				repository_url TEXT NOT NULL,
				evaluation_mode TEXT,
				evaluators_count INTEGER NOT NULL,
				status TEXT NOT NULL,
				total_files INTEGER DEFAULT 0,
				total_issues INTEGER DEFAULT 0,
				critical_count INTEGER DEFAULT 0,
				high_count INTEGER DEFAULT 0,
				medium_count INTEGER DEFAULT 0,
				total_cost_usd REAL DEFAULT 0,
				total_duration_ms INTEGER DEFAULT 0,
				total_input_tokens INTEGER DEFAULT 0,
				total_output_tokens INTEGER DEFAULT 0,
				curated_count INTEGER DEFAULT 0,
				context_score REAL,
				context_grade TEXT,
				failed_evaluator_count INTEGER DEFAULT 0,
				result_json TEXT,
				final_prompts_json TEXT,
				error_message TEXT,
				error_code TEXT,
				created_at TEXT NOT NULL,
				completed_at TEXT NOT NULL
			);
		`);
		routes = new IssuesRoutes();
	});

	beforeEach(() => {
		testDb.run("DELETE FROM evaluations");
	});

	afterAll(() => {
		testDb.close();
	});

	test("returns empty results when no evaluations exist", async () => {
		const req = new Request("http://localhost/api/issues");
		const res = await routes.list(req);
		const data = await res.json();

		expect(res.status).toBe(200);
		expect(data.issues).toHaveLength(0);
		expect(data.pagination.totalItems).toBe(0);
		expect(data.pagination.totalPages).toBe(0);
		expect(data.pagination.page).toBe(1);
	});

	test("returns issues from a single evaluation", async () => {
		const resultJson = createUnifiedResultJson([
			{
				issueType: "error",
				severity: 8,
				category: "Quality",
				description: "High issue",
				evaluator: "content-quality",
			},
			{
				issueType: "error",
				severity: 6,
				category: "Commands",
				description: "Medium issue",
				evaluator: "command-completeness",
			},
		]);

		insertEvaluation("eval-1", "https://github.com/owner/repo", resultJson);

		const req = new Request("http://localhost/api/issues");
		const res = await routes.list(req);
		const data = await res.json();

		expect(res.status).toBe(200);
		expect(data.issues).toHaveLength(2);
		expect(data.pagination.totalItems).toBe(2);
		expect(data.issues[0].evaluationId).toBe("eval-1");
		expect(data.issues[0].repositoryUrl).toBe("https://github.com/owner/repo");
		expect(data.availableFilters.evaluators).toContain("content-quality");
		expect(data.availableFilters.evaluators).toContain("command-completeness");
		expect(data.availableFilters.repositories).toContain(
			"https://github.com/owner/repo",
		);
	});

	test("aggregates issues from multiple evaluations", async () => {
		const result1 = createUnifiedResultJson([
			{
				issueType: "error",
				severity: 8,
				category: "Quality",
				description: "Issue from eval 1",
				evaluator: "content-quality",
			},
		]);
		const result2 = createUnifiedResultJson([
			{
				issueType: "suggestion",
				impactLevel: "High",
				category: "Context",
				description: "Issue from eval 2",
				evaluator: "context-gaps",
			},
		]);

		insertEvaluation(
			"eval-1",
			"https://github.com/owner/repo1",
			result1,
			"2026-01-15T10:00:00Z",
		);
		insertEvaluation(
			"eval-2",
			"https://github.com/owner/repo2",
			result2,
			"2026-01-16T10:00:00Z",
		);

		const req = new Request("http://localhost/api/issues");
		const res = await routes.list(req);
		const data = await res.json();

		expect(data.issues).toHaveLength(2);
		expect(data.availableFilters.repositories).toHaveLength(2);
	});

	test("filters by evaluator", async () => {
		const resultJson = createUnifiedResultJson([
			{
				issueType: "error",
				severity: 8,
				category: "Quality",
				description: "Quality issue",
				evaluator: "content-quality",
			},
			{
				issueType: "error",
				severity: 7,
				category: "Security",
				description: "Security issue",
				evaluator: "security",
			},
		]);

		insertEvaluation("eval-1", "https://github.com/owner/repo", resultJson);

		const req = new Request(
			"http://localhost/api/issues?evaluator=content-quality",
		);
		const res = await routes.list(req);
		const data = await res.json();

		expect(data.issues).toHaveLength(1);
		expect(data.issues[0].evaluatorName).toBe("content-quality");
		// Available filters should still show all evaluators (from unfiltered data)
		expect(data.availableFilters.evaluators).toContain("security");
	});

	test("filters by severity", async () => {
		const resultJson = createUnifiedResultJson([
			{
				issueType: "error",
				severity: 9,
				category: "Quality",
				description: "High severity",
				evaluator: "content-quality",
			},
			{
				issueType: "error",
				severity: 6,
				category: "Commands",
				description: "Medium severity",
				evaluator: "command-completeness",
			},
		]);

		insertEvaluation("eval-1", "https://github.com/owner/repo", resultJson);

		const req = new Request("http://localhost/api/issues?severity=high");
		const res = await routes.list(req);
		const data = await res.json();

		expect(data.issues).toHaveLength(1);
		expect(data.issues[0].issue.description).toBe("High severity");
	});

	test("filters by repository", async () => {
		const result1 = createUnifiedResultJson([
			{
				issueType: "error",
				severity: 8,
				category: "Quality",
				description: "Repo1 issue",
				evaluator: "content-quality",
			},
		]);
		const result2 = createUnifiedResultJson([
			{
				issueType: "error",
				severity: 7,
				category: "Quality",
				description: "Repo2 issue",
				evaluator: "content-quality",
			},
		]);

		insertEvaluation("eval-1", "https://github.com/owner/repo1", result1);
		insertEvaluation("eval-2", "https://github.com/owner/repo2", result2);

		const req = new Request(
			"http://localhost/api/issues?repository=https://github.com/owner/repo1",
		);
		const res = await routes.list(req);
		const data = await res.json();

		expect(data.issues).toHaveLength(1);
		expect(data.issues[0].repositoryUrl).toBe("https://github.com/owner/repo1");
	});

	test("filters by issue type", async () => {
		const resultJson = createUnifiedResultJson([
			{
				issueType: "error",
				severity: 8,
				category: "Quality",
				description: "Error issue",
				evaluator: "content-quality",
			},
			{
				issueType: "suggestion",
				impactLevel: "High",
				category: "Context",
				description: "Suggestion issue",
				evaluator: "context-gaps",
			},
		]);

		insertEvaluation("eval-1", "https://github.com/owner/repo", resultJson);

		const req = new Request("http://localhost/api/issues?issueType=suggestion");
		const res = await routes.list(req);
		const data = await res.json();

		expect(data.issues).toHaveLength(1);
		expect(data.issues[0].issue.issueType).toBe("suggestion");
	});

	test("filters by search text", async () => {
		const resultJson = createUnifiedResultJson([
			{
				issueType: "error",
				severity: 8,
				category: "Quality",
				description: "Missing documentation for API",
				evaluator: "content-quality",
			},
			{
				issueType: "error",
				severity: 7,
				category: "Security",
				description: "Exposed credentials in config",
				evaluator: "security",
			},
		]);

		insertEvaluation("eval-1", "https://github.com/owner/repo", resultJson);

		const req = new Request("http://localhost/api/issues?search=documentation");
		const res = await routes.list(req);
		const data = await res.json();

		expect(data.issues).toHaveLength(1);
		expect(data.issues[0].issue.description).toBe(
			"Missing documentation for API",
		);
	});

	test("paginates results", async () => {
		// Create 30 issues across evaluations
		const issues = [];
		for (let i = 0; i < 30; i++) {
			issues.push({
				issueType: "error" as const,
				severity: 8,
				category: "Quality",
				description: `Issue ${i}`,
				evaluator: "content-quality",
			});
		}
		const resultJson = createUnifiedResultJson(issues);
		insertEvaluation("eval-1", "https://github.com/owner/repo", resultJson);

		// Page 1
		const req1 = new Request("http://localhost/api/issues?page=1&pageSize=10");
		const res1 = await routes.list(req1);
		const data1 = await res1.json();

		expect(data1.issues).toHaveLength(10);
		expect(data1.pagination.page).toBe(1);
		expect(data1.pagination.pageSize).toBe(10);
		expect(data1.pagination.totalItems).toBe(30);
		expect(data1.pagination.totalPages).toBe(3);

		// Page 3 (last page)
		const req3 = new Request("http://localhost/api/issues?page=3&pageSize=10");
		const res3 = await routes.list(req3);
		const data3 = await res3.json();

		expect(data3.issues).toHaveLength(10);
		expect(data3.pagination.page).toBe(3);
	});

	test("clamps page and pageSize to valid ranges", async () => {
		const resultJson = createUnifiedResultJson([
			{
				issueType: "error",
				severity: 8,
				category: "Quality",
				description: "Issue",
				evaluator: "content-quality",
			},
		]);
		insertEvaluation("eval-1", "https://github.com/owner/repo", resultJson);

		// Page 0 should become 1
		const req = new Request("http://localhost/api/issues?page=0&pageSize=200");
		const res = await routes.list(req);
		const data = await res.json();

		expect(data.pagination.page).toBe(1);
		expect(data.pagination.pageSize).toBe(100); // Clamped to max 100
	});

	test("skips failed evaluations", async () => {
		const resultJson = createUnifiedResultJson([
			{
				issueType: "error",
				severity: 8,
				category: "Quality",
				description: "Good issue",
				evaluator: "content-quality",
			},
		]);
		insertEvaluation("eval-1", "https://github.com/owner/repo", resultJson);

		// Insert a failed evaluation
		testDb.run(
			`INSERT INTO evaluations (
				id, repository_url, evaluation_mode, evaluators_count, status,
				total_files, total_issues, critical_count, high_count, medium_count,
				total_cost_usd, total_duration_ms, total_input_tokens, total_output_tokens,
				curated_count, result_json, error_message, error_code, created_at, completed_at
			) VALUES (?, ?, 'unified', 5, 'failed', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL, 'Error', 'ERR', ?, ?)`,
			[
				"eval-failed",
				"https://github.com/owner/repo2",
				"2026-01-15T10:00:00Z",
				"2026-01-15T10:00:00Z",
			],
		);

		const req = new Request("http://localhost/api/issues");
		const res = await routes.list(req);
		const data = await res.json();

		// Should only see issues from the completed evaluation
		expect(data.issues).toHaveLength(1);
		expect(data.issues[0].evaluationId).toBe("eval-1");
	});

	test("combines multiple filters", async () => {
		const resultJson = createUnifiedResultJson([
			{
				issueType: "error",
				severity: 9,
				category: "Quality",
				description: "High quality error",
				evaluator: "content-quality",
			},
			{
				issueType: "error",
				severity: 6,
				category: "Quality",
				description: "Medium quality error",
				evaluator: "content-quality",
			},
			{
				issueType: "suggestion",
				impactLevel: "High",
				category: "Context",
				description: "High context suggestion",
				evaluator: "context-gaps",
			},
		]);

		insertEvaluation("eval-1", "https://github.com/owner/repo", resultJson);

		const req = new Request(
			"http://localhost/api/issues?evaluator=content-quality&severity=high",
		);
		const res = await routes.list(req);
		const data = await res.json();

		expect(data.issues).toHaveLength(1);
		expect(data.issues[0].issue.description).toBe("High quality error");
	});
});
