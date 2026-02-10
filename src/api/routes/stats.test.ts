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
import { StatsRoutes } from "./stats";

// Mock the database
let testDb: Database;

mock.module("../db/database", () => ({
	getDatabase: () => testDb,
}));

// Mock getEvaluators to return a fixed set of evaluators
mock.module("../utils/evaluator-utils", () => ({
	getEvaluators: async () => [
		{ id: "01-content-quality", name: "Content Quality", issueType: "error" },
		{
			id: "03-command-completeness",
			name: "Command Completeness",
			issueType: "error",
		},
		{ id: "12-context-gaps", name: "Context Gaps", issueType: "suggestion" },
		{ id: "09-security", name: "Security", issueType: "error" },
	],
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

describe("StatsRoutes", () => {
	let routes: StatsRoutes;

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
		routes = new StatsRoutes("/unused/path");
	});

	beforeEach(() => {
		testDb.run("DELETE FROM evaluations");
	});

	afterAll(() => {
		testDb.close();
	});

	test("returns all evaluators with 0 counts when no evaluations exist", async () => {
		const req = new Request("http://localhost/api/stats");
		const res = await routes.get(req);
		const data = await res.json();

		expect(res.status).toBe(200);
		expect(data.evaluators).toHaveLength(4);
		expect(data.totalReposEvaluated).toBe(0);

		// All should have 0 counts
		for (const evaluator of data.evaluators) {
			expect(evaluator.repoCount).toBe(0);
			expect(evaluator.totalIssueCount).toBe(0);
		}
	});

	test("counts unique repos per evaluator", async () => {
		const result1 = createUnifiedResultJson([
			{
				issueType: "error",
				severity: 8,
				category: "Quality",
				description: "Issue in repo1",
				evaluator: "content-quality",
			},
		]);
		const result2 = createUnifiedResultJson([
			{
				issueType: "error",
				severity: 7,
				category: "Quality",
				description: "Issue in repo2",
				evaluator: "content-quality",
			},
		]);

		insertEvaluation("eval-1", "https://github.com/owner/repo1", result1);
		insertEvaluation("eval-2", "https://github.com/owner/repo2", result2);

		const req = new Request("http://localhost/api/stats");
		const res = await routes.get(req);
		const data = await res.json();

		const contentQuality = data.evaluators.find(
			(e: { evaluatorId: string }) => e.evaluatorId === "content-quality",
		);
		expect(contentQuality.repoCount).toBe(2);
		expect(contentQuality.totalIssueCount).toBe(2);
		expect(data.totalReposEvaluated).toBe(2);
	});

	test("does not double-count same repo URL", async () => {
		const result1 = createUnifiedResultJson([
			{
				issueType: "error",
				severity: 8,
				category: "Quality",
				description: "First issue",
				evaluator: "content-quality",
			},
		]);
		const result2 = createUnifiedResultJson([
			{
				issueType: "error",
				severity: 7,
				category: "Quality",
				description: "Second issue",
				evaluator: "content-quality",
			},
		]);

		// Same repo URL, different evaluations
		insertEvaluation(
			"eval-1",
			"https://github.com/owner/repo",
			result1,
			"2026-01-15T10:00:00Z",
		);
		insertEvaluation(
			"eval-2",
			"https://github.com/owner/repo",
			result2,
			"2026-01-16T10:00:00Z",
		);

		const req = new Request("http://localhost/api/stats");
		const res = await routes.get(req);
		const data = await res.json();

		const contentQuality = data.evaluators.find(
			(e: { evaluatorId: string }) => e.evaluatorId === "content-quality",
		);
		expect(contentQuality.repoCount).toBe(1); // Same repo, counted once
		expect(contentQuality.totalIssueCount).toBe(2); // But issues accumulate
		expect(data.totalReposEvaluated).toBe(1);
	});

	test("separates counts by evaluator correctly", async () => {
		const resultJson = createUnifiedResultJson([
			{
				issueType: "error",
				severity: 8,
				category: "Quality",
				description: "Quality issue 1",
				evaluator: "content-quality",
			},
			{
				issueType: "error",
				severity: 8,
				category: "Quality",
				description: "Quality issue 2",
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

		const req = new Request("http://localhost/api/stats");
		const res = await routes.get(req);
		const data = await res.json();

		const contentQuality = data.evaluators.find(
			(e: { evaluatorId: string }) => e.evaluatorId === "content-quality",
		);
		const security = data.evaluators.find(
			(e: { evaluatorId: string }) => e.evaluatorId === "security",
		);
		const contextGaps = data.evaluators.find(
			(e: { evaluatorId: string }) => e.evaluatorId === "context-gaps",
		);

		expect(contentQuality.repoCount).toBe(1);
		expect(contentQuality.totalIssueCount).toBe(2);
		expect(security.repoCount).toBe(1);
		expect(security.totalIssueCount).toBe(1);
		expect(contextGaps.repoCount).toBe(0);
		expect(contextGaps.totalIssueCount).toBe(0);
	});

	test("returns correct totalReposEvaluated", async () => {
		const result1 = createUnifiedResultJson([
			{
				issueType: "error",
				severity: 8,
				category: "Quality",
				description: "Issue",
				evaluator: "content-quality",
			},
		]);
		const result2 = createUnifiedResultJson([
			{
				issueType: "suggestion",
				impactLevel: "High",
				category: "Context",
				description: "Gap",
				evaluator: "context-gaps",
			},
		]);
		const result3 = createUnifiedResultJson([
			{
				issueType: "error",
				severity: 6,
				category: "Commands",
				description: "Missing",
				evaluator: "command-completeness",
			},
		]);

		insertEvaluation("eval-1", "https://github.com/owner/repo1", result1);
		insertEvaluation("eval-2", "https://github.com/owner/repo2", result2);
		insertEvaluation("eval-3", "https://github.com/owner/repo3", result3);

		const req = new Request("http://localhost/api/stats");
		const res = await routes.get(req);
		const data = await res.json();

		expect(data.totalReposEvaluated).toBe(3);
	});

	test("sorted by repoCount descending", async () => {
		// Create evaluations where content-quality hits 2 repos, security hits 1
		const result1 = createUnifiedResultJson([
			{
				issueType: "error",
				severity: 8,
				category: "Quality",
				description: "Issue",
				evaluator: "content-quality",
			},
			{
				issueType: "error",
				severity: 7,
				category: "Security",
				description: "Sec issue",
				evaluator: "security",
			},
		]);
		const result2 = createUnifiedResultJson([
			{
				issueType: "error",
				severity: 8,
				category: "Quality",
				description: "Issue 2",
				evaluator: "content-quality",
			},
		]);

		insertEvaluation("eval-1", "https://github.com/owner/repo1", result1);
		insertEvaluation("eval-2", "https://github.com/owner/repo2", result2);

		const req = new Request("http://localhost/api/stats");
		const res = await routes.get(req);
		const data = await res.json();

		// content-quality should be first (2 repos), then security (1 repo)
		const nonZero = data.evaluators.filter(
			(e: { repoCount: number }) => e.repoCount > 0,
		);
		expect(nonZero[0].evaluatorId).toBe("content-quality");
		expect(nonZero[0].repoCount).toBe(2);
		expect(nonZero[1].evaluatorId).toBe("security");
		expect(nonZero[1].repoCount).toBe(1);
	});

	test("includes evaluator metadata (name and issueType)", async () => {
		const req = new Request("http://localhost/api/stats");
		const res = await routes.get(req);
		const data = await res.json();

		const contentQuality = data.evaluators.find(
			(e: { evaluatorId: string }) => e.evaluatorId === "content-quality",
		);
		expect(contentQuality.evaluatorName).toBe("Content Quality");
		expect(contentQuality.issueType).toBe("error");

		const contextGaps = data.evaluators.find(
			(e: { evaluatorId: string }) => e.evaluatorId === "context-gaps",
		);
		expect(contextGaps.evaluatorName).toBe("Context Gaps");
		expect(contextGaps.issueType).toBe("suggestion");
	});

	// --- Token stats tests ---

	describe("GET /api/stats/tokens", () => {
		function createUnifiedResultJsonWithTokens(
			evaluatorTokens: Array<{
				evaluator: string;
				inputTokens: number;
				outputTokens: number;
				costUsd: number;
				cacheReadInputTokens?: number;
				cacheCreationInputTokens?: number;
			}>,
			contextIdTokens?: {
				inputTokens: number;
				outputTokens: number;
				costUsd: number;
			},
		): string {
			const metadata: Record<string, unknown> = {
				generatedAt: "2026-01-01",
				agent: "claude",
				evaluationMode: "unified",
				totalFiles: 1,
			};
			if (contextIdTokens) {
				metadata.contextIdentificationInputTokens = contextIdTokens.inputTokens;
				metadata.contextIdentificationOutputTokens =
					contextIdTokens.outputTokens;
				metadata.contextIdentificationCostUsd = contextIdTokens.costUsd;
			}
			return JSON.stringify({
				metadata,
				results: evaluatorTokens.map((et) => ({
					evaluator: et.evaluator,
					output: {
						type: "text",
						subtype: "",
						is_error: false,
						duration_ms: 100,
						num_turns: 1,
						result: "[]",
						session_id: "s1",
						total_cost_usd: et.costUsd,
						usage: {
							input_tokens: et.inputTokens,
							output_tokens: et.outputTokens,
							...(et.cacheReadInputTokens !== undefined && {
								cache_read_input_tokens: et.cacheReadInputTokens,
							}),
							...(et.cacheCreationInputTokens !== undefined && {
								cache_creation_input_tokens: et.cacheCreationInputTokens,
							}),
						},
					},
				})),
				crossFileIssues: [],
			});
		}

		test("returns empty stats when no evaluations exist", async () => {
			const req = new Request("http://localhost/api/stats/tokens");
			const res = await routes.getTokenStats(req);
			const data = await res.json();

			expect(res.status).toBe(200);
			expect(data.evaluators).toEqual([]);
			expect(data.contextIdentification).toBeNull();
			expect(data.totalEvaluationsAnalyzed).toBe(0);
		});

		test("computes correct averages across evaluations", async () => {
			const result1 = createUnifiedResultJsonWithTokens([
				{
					evaluator: "content-quality",
					inputTokens: 1000,
					outputTokens: 200,
					costUsd: 0.01,
				},
				{
					evaluator: "security",
					inputTokens: 800,
					outputTokens: 150,
					costUsd: 0.008,
				},
			]);
			const result2 = createUnifiedResultJsonWithTokens([
				{
					evaluator: "content-quality",
					inputTokens: 1200,
					outputTokens: 300,
					costUsd: 0.02,
				},
			]);

			insertEvaluation("eval-1", "https://github.com/owner/repo1", result1);
			insertEvaluation("eval-2", "https://github.com/owner/repo2", result2);

			const req = new Request("http://localhost/api/stats/tokens");
			const res = await routes.getTokenStats(req);
			const data = await res.json();

			expect(data.totalEvaluationsAnalyzed).toBe(2);

			const contentQuality = data.evaluators.find(
				(e: { evaluatorId: string }) => e.evaluatorId === "content-quality",
			);
			expect(contentQuality).toBeDefined();
			expect(contentQuality.avgInputTokens).toBe(1100); // (1000+1200)/2
			expect(contentQuality.avgOutputTokens).toBe(250); // (200+300)/2
			expect(contentQuality.avgCostUsd).toBeCloseTo(0.015, 5);
			expect(contentQuality.sampleCount).toBe(2);

			const security = data.evaluators.find(
				(e: { evaluatorId: string }) => e.evaluatorId === "security",
			);
			expect(security).toBeDefined();
			expect(security.avgInputTokens).toBe(800);
			expect(security.avgOutputTokens).toBe(150);
			expect(security.sampleCount).toBe(1);
		});

		test("handles missing usage data gracefully", async () => {
			// Create a result where one evaluator has no output (skipped/failed)
			const resultJson = JSON.stringify({
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
							result: "[]",
							session_id: "s1",
							total_cost_usd: 0.01,
							usage: { input_tokens: 500, output_tokens: 100 },
						},
					},
					{
						evaluator: "security",
						error: "Provider timeout",
						// No output field
					},
				],
				crossFileIssues: [],
			});

			insertEvaluation("eval-1", "https://github.com/owner/repo1", resultJson);

			const req = new Request("http://localhost/api/stats/tokens");
			const res = await routes.getTokenStats(req);
			const data = await res.json();

			// Only content-quality should appear (security has no usage)
			expect(data.evaluators).toHaveLength(1);
			expect(data.evaluators[0].evaluatorId).toBe("content-quality");
		});

		test("aggregates context identification tokens", async () => {
			const result1 = createUnifiedResultJsonWithTokens(
				[
					{
						evaluator: "content-quality",
						inputTokens: 500,
						outputTokens: 100,
						costUsd: 0.01,
					},
				],
				{ inputTokens: 2000, outputTokens: 400, costUsd: 0.005 },
			);
			const result2 = createUnifiedResultJsonWithTokens(
				[
					{
						evaluator: "content-quality",
						inputTokens: 600,
						outputTokens: 120,
						costUsd: 0.012,
					},
				],
				{ inputTokens: 3000, outputTokens: 600, costUsd: 0.008 },
			);

			insertEvaluation("eval-1", "https://github.com/owner/repo1", result1);
			insertEvaluation("eval-2", "https://github.com/owner/repo2", result2);

			const req = new Request("http://localhost/api/stats/tokens");
			const res = await routes.getTokenStats(req);
			const data = await res.json();

			expect(data.contextIdentification).not.toBeNull();
			expect(data.contextIdentification.avgInputTokens).toBe(2500); // (2000+3000)/2
			expect(data.contextIdentification.avgOutputTokens).toBe(500); // (400+600)/2
			expect(data.contextIdentification.avgCostUsd).toBeCloseTo(0.0065, 5);
			expect(data.contextIdentification.sampleCount).toBe(2);
		});

		test("context identification is null when no evaluations have token data", async () => {
			// Result without context identification tokens
			const result = createUnifiedResultJsonWithTokens([
				{
					evaluator: "content-quality",
					inputTokens: 500,
					outputTokens: 100,
					costUsd: 0.01,
				},
			]);

			insertEvaluation("eval-1", "https://github.com/owner/repo1", result);

			const req = new Request("http://localhost/api/stats/tokens");
			const res = await routes.getTokenStats(req);
			const data = await res.json();

			expect(data.contextIdentification).toBeNull();
		});

		test("sorted by total tokens descending", async () => {
			const result = createUnifiedResultJsonWithTokens([
				{
					evaluator: "security",
					inputTokens: 500,
					outputTokens: 100,
					costUsd: 0.005,
				},
				{
					evaluator: "content-quality",
					inputTokens: 2000,
					outputTokens: 500,
					costUsd: 0.02,
				},
			]);

			insertEvaluation("eval-1", "https://github.com/owner/repo1", result);

			const req = new Request("http://localhost/api/stats/tokens");
			const res = await routes.getTokenStats(req);
			const data = await res.json();

			expect(data.evaluators).toHaveLength(2);
			// content-quality (2500 total) should be before security (600 total)
			expect(data.evaluators[0].evaluatorId).toBe("content-quality");
			expect(data.evaluators[1].evaluatorId).toBe("security");
		});

		test("excludes zero-token entries from evaluator averages", async () => {
			// Evaluation 1: content-quality has real tokens, security has zero tokens
			const result1 = createUnifiedResultJsonWithTokens([
				{
					evaluator: "content-quality",
					inputTokens: 1000,
					outputTokens: 200,
					costUsd: 0.01,
				},
				{
					evaluator: "security",
					inputTokens: 0,
					outputTokens: 0,
					costUsd: 0,
				},
			]);
			// Evaluation 2: content-quality has real tokens, security has real tokens
			const result2 = createUnifiedResultJsonWithTokens([
				{
					evaluator: "content-quality",
					inputTokens: 1200,
					outputTokens: 300,
					costUsd: 0.02,
				},
				{
					evaluator: "security",
					inputTokens: 800,
					outputTokens: 150,
					costUsd: 0.008,
				},
			]);

			insertEvaluation("eval-1", "https://github.com/owner/repo1", result1);
			insertEvaluation("eval-2", "https://github.com/owner/repo2", result2);

			const req = new Request("http://localhost/api/stats/tokens");
			const res = await routes.getTokenStats(req);
			const data = await res.json();

			// content-quality: averaged over 2 entries (both have real tokens)
			const contentQuality = data.evaluators.find(
				(e: { evaluatorId: string }) => e.evaluatorId === "content-quality",
			);
			expect(contentQuality.avgInputTokens).toBe(1100); // (1000+1200)/2
			expect(contentQuality.avgOutputTokens).toBe(250); // (200+300)/2
			expect(contentQuality.sampleCount).toBe(2);

			// security: only 1 valid entry (zero-token entry excluded)
			const security = data.evaluators.find(
				(e: { evaluatorId: string }) => e.evaluatorId === "security",
			);
			expect(security.avgInputTokens).toBe(800);
			expect(security.avgOutputTokens).toBe(150);
			expect(security.sampleCount).toBe(1);
		});

		test("includes cache tokens in avg input token computation", async () => {
			// With prompt caching, most input tokens come from cache_read_input_tokens
			// input_tokens alone can be as low as 3
			const result1 = createUnifiedResultJsonWithTokens([
				{
					evaluator: "content-quality",
					inputTokens: 3,
					outputTokens: 200,
					costUsd: 0.01,
					cacheReadInputTokens: 20000,
					cacheCreationInputTokens: 5000,
				},
				{
					evaluator: "security",
					inputTokens: 5,
					outputTokens: 150,
					costUsd: 0.008,
					cacheReadInputTokens: 15000,
				},
			]);
			const result2 = createUnifiedResultJsonWithTokens([
				{
					evaluator: "content-quality",
					inputTokens: 10,
					outputTokens: 300,
					costUsd: 0.02,
					cacheReadInputTokens: 22000,
					cacheCreationInputTokens: 0,
				},
			]);

			insertEvaluation("eval-1", "https://github.com/owner/repo1", result1);
			insertEvaluation("eval-2", "https://github.com/owner/repo2", result2);

			const req = new Request("http://localhost/api/stats/tokens");
			const res = await routes.getTokenStats(req);
			const data = await res.json();

			const contentQuality = data.evaluators.find(
				(e: { evaluatorId: string }) => e.evaluatorId === "content-quality",
			);
			// eval1: 3 + 20000 + 5000 = 25003, eval2: 10 + 22000 + 0 = 22010
			// avg = (25003 + 22010) / 2 = 23506.5 → 23507 (rounded)
			expect(contentQuality.avgInputTokens).toBe(23507);
			expect(contentQuality.sampleCount).toBe(2);

			const security = data.evaluators.find(
				(e: { evaluatorId: string }) => e.evaluatorId === "security",
			);
			// 5 + 15000 = 15005
			expect(security.avgInputTokens).toBe(15005);
			expect(security.sampleCount).toBe(1);
		});

		test("excludes zero-token context identification from averages", async () => {
			// Evaluation 1: zero context identification tokens (e.g. from Cursor)
			const result1 = createUnifiedResultJsonWithTokens(
				[
					{
						evaluator: "content-quality",
						inputTokens: 500,
						outputTokens: 100,
						costUsd: 0.01,
					},
				],
				{ inputTokens: 0, outputTokens: 0, costUsd: 0 },
			);
			// Evaluation 2: real context identification tokens
			const result2 = createUnifiedResultJsonWithTokens(
				[
					{
						evaluator: "content-quality",
						inputTokens: 600,
						outputTokens: 120,
						costUsd: 0.012,
					},
				],
				{ inputTokens: 3000, outputTokens: 600, costUsd: 0.008 },
			);

			insertEvaluation("eval-1", "https://github.com/owner/repo1", result1);
			insertEvaluation("eval-2", "https://github.com/owner/repo2", result2);

			const req = new Request("http://localhost/api/stats/tokens");
			const res = await routes.getTokenStats(req);
			const data = await res.json();

			// Only the real entry should be counted
			expect(data.contextIdentification).not.toBeNull();
			expect(data.contextIdentification.avgInputTokens).toBe(3000);
			expect(data.contextIdentification.avgOutputTokens).toBe(600);
			expect(data.contextIdentification.sampleCount).toBe(1);
		});
	});

	// --- Cost stats tests ---

	describe("GET /api/stats/costs", () => {
		function createResultJsonWithAgent(
			agent: string,
			totalLOC?: number,
		): string {
			const metadata: Record<string, unknown> = {
				generatedAt: "2026-01-01",
				agent,
				evaluationMode: "unified",
				totalFiles: 1,
			};
			if (totalLOC !== undefined) {
				metadata.contextScore = {
					score: 7.5,
					grade: "Good",
					breakdown: {
						context: { totalLOC },
					},
				};
			}
			return JSON.stringify({
				metadata,
				results: [],
				crossFileIssues: [],
			});
		}

		function insertEvaluationWithCost(
			id: string,
			repositoryUrl: string,
			resultJson: string,
			totalCostUsd: number,
			completedAt = "2026-01-15T10:00:00Z",
		) {
			testDb.run(
				`INSERT INTO evaluations (
					id, repository_url, evaluation_mode, evaluators_count, status,
					total_files, total_issues, critical_count, high_count, medium_count,
					total_cost_usd, total_duration_ms, total_input_tokens, total_output_tokens,
					curated_count, result_json, created_at, completed_at
				) VALUES (?, ?, 'unified', 5, 'completed', 1, 0, 0, 0, 0, ?, 5000, 500, 200, 0, ?, ?, ?)`,
				[id, repositoryUrl, totalCostUsd, resultJson, completedAt, completedAt],
			);
		}

		test("returns empty arrays when no evaluations exist", async () => {
			const req = new Request("http://localhost/api/stats/costs");
			const res = await routes.getCosts(req);
			const data = await res.json();

			expect(res.status).toBe(200);
			expect(data.topReposByCost).toEqual([]);
			expect(data.costByAgent).toEqual([]);
		});

		test("returns top repos sorted by cost descending", async () => {
			const result1 = createResultJsonWithAgent("claude", 5000);
			const result2 = createResultJsonWithAgent("claude", 12000);

			insertEvaluationWithCost(
				"eval-1",
				"https://github.com/owner/cheap-repo",
				result1,
				0.05,
			);
			insertEvaluationWithCost(
				"eval-2",
				"https://github.com/owner/expensive-repo",
				result2,
				0.5,
			);

			const req = new Request("http://localhost/api/stats/costs");
			const res = await routes.getCosts(req);
			const data = await res.json();

			expect(data.topReposByCost).toHaveLength(2);
			expect(data.topReposByCost[0].repositoryUrl).toBe(
				"https://github.com/owner/expensive-repo",
			);
			expect(data.topReposByCost[0].totalCostUsd).toBe(0.5);
			expect(data.topReposByCost[1].repositoryUrl).toBe(
				"https://github.com/owner/cheap-repo",
			);
			expect(data.topReposByCost[1].totalCostUsd).toBe(0.05);
		});

		test("aggregates cost across multiple evaluations of same repo", async () => {
			const result1 = createResultJsonWithAgent("claude", 8000);
			const result2 = createResultJsonWithAgent("claude", 8000);

			insertEvaluationWithCost(
				"eval-1",
				"https://github.com/owner/repo",
				result1,
				0.1,
				"2026-01-15T10:00:00Z",
			);
			insertEvaluationWithCost(
				"eval-2",
				"https://github.com/owner/repo",
				result2,
				0.2,
				"2026-01-16T10:00:00Z",
			);

			const req = new Request("http://localhost/api/stats/costs");
			const res = await routes.getCosts(req);
			const data = await res.json();

			expect(data.topReposByCost).toHaveLength(1);
			expect(data.topReposByCost[0].totalCostUsd).toBeCloseTo(0.3, 5);
		});

		test("extracts LOC from latest evaluation result_json", async () => {
			const result1 = createResultJsonWithAgent("claude", 5000);
			const result2 = createResultJsonWithAgent("claude", 12000);

			insertEvaluationWithCost(
				"eval-1",
				"https://github.com/owner/repo",
				result1,
				0.1,
				"2026-01-15T10:00:00Z",
			);
			insertEvaluationWithCost(
				"eval-2",
				"https://github.com/owner/repo",
				result2,
				0.2,
				"2026-01-16T10:00:00Z",
			);

			const req = new Request("http://localhost/api/stats/costs");
			const res = await routes.getCosts(req);
			const data = await res.json();

			// Should use LOC from latest evaluation (eval-2)
			expect(data.topReposByCost[0].totalLOC).toBe(12000);
		});

		test("LOC is null when contextScore is missing", async () => {
			const result = createResultJsonWithAgent("claude"); // no LOC

			insertEvaluationWithCost(
				"eval-1",
				"https://github.com/owner/repo",
				result,
				0.1,
			);

			const req = new Request("http://localhost/api/stats/costs");
			const res = await routes.getCosts(req);
			const data = await res.json();

			expect(data.topReposByCost[0].totalLOC).toBeNull();
		});

		test("aggregates cost by agent", async () => {
			const claudeResult = createResultJsonWithAgent("claude");
			const cursorResult = createResultJsonWithAgent("cursor");

			insertEvaluationWithCost(
				"eval-1",
				"https://github.com/owner/repo1",
				claudeResult,
				0.3,
			);
			insertEvaluationWithCost(
				"eval-2",
				"https://github.com/owner/repo2",
				claudeResult,
				0.2,
			);
			insertEvaluationWithCost(
				"eval-3",
				"https://github.com/owner/repo3",
				cursorResult,
				0.1,
			);

			const req = new Request("http://localhost/api/stats/costs");
			const res = await routes.getCosts(req);
			const data = await res.json();

			expect(data.costByAgent).toHaveLength(2);
			// Claude should be first (higher total cost)
			expect(data.costByAgent[0].agent).toBe("claude");
			expect(data.costByAgent[0].totalCostUsd).toBeCloseTo(0.5, 5);
			expect(data.costByAgent[1].agent).toBe("cursor");
			expect(data.costByAgent[1].totalCostUsd).toBeCloseTo(0.1, 5);
		});

		test("limits top repos to 10", async () => {
			// Insert 12 repos
			for (let i = 1; i <= 12; i++) {
				const result = createResultJsonWithAgent("claude");
				insertEvaluationWithCost(
					`eval-${i}`,
					`https://github.com/owner/repo${i}`,
					result,
					i * 0.01,
				);
			}

			const req = new Request("http://localhost/api/stats/costs");
			const res = await routes.getCosts(req);
			const data = await res.json();

			expect(data.topReposByCost).toHaveLength(10);
			// Most expensive should be first
			expect(data.topReposByCost[0].totalCostUsd).toBeCloseTo(0.12, 5);
		});
	});
});
