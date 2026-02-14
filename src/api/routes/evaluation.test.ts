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
import { DailyRateLimiter } from "../rate-limiter";
import { EvaluationRoutes } from "./evaluation";

// Mock the database for evaluationRepository
let testDb: Database;

mock.module("../db/database", () => ({
	getDatabase: () => testDb,
}));

// Create a mock JobManager
function createMockJobManager(
	options: {
		jobs?: Map<string, unknown>;
		submitJobResult?: string;
		submitJobError?: Error;
	} = {},
) {
	const jobs = options.jobs || new Map();

	return {
		submitJob: async () => {
			if (options.submitJobError) {
				throw options.submitJobError;
			}
			return options.submitJobResult || "job-123";
		},
		getJob: (id: string) => jobs.get(id) || null,
		getAllJobs: () => Array.from(jobs.values()),
	};
}

// Create a rate limiter for tests
function createRateLimiter(limit = 50) {
	return new DailyRateLimiter(limit);
}

describe("EvaluationRoutes", () => {
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
				is_imported INTEGER DEFAULT 0,
				result_json TEXT,
				final_prompts_json TEXT,
				error_message TEXT,
				error_code TEXT,
				created_at TEXT NOT NULL,
				completed_at TEXT NOT NULL
			);
		`);
	});

	afterAll(() => {
		testDb.close();
	});

	beforeEach(() => {
		testDb.run("DELETE FROM evaluations");
	});

	describe("POST /api/evaluate", () => {
		test("should return 400 when repositoryUrl and localPath are missing", async () => {
			const mockManager = createMockJobManager();
			const routes = new EvaluationRoutes(
				mockManager as never,
				false,
				createRateLimiter(),
			);

			const req = new Request("http://localhost/api/evaluate", {
				method: "POST",
				body: JSON.stringify({}),
				headers: { "Content-Type": "application/json" },
			});

			const response = await routes.post(req);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.code).toBe("INVALID_REQUEST");
		});

		test("should return 202 when job is created successfully", async () => {
			const jobs = new Map();
			const jobId = "job-456";
			jobs.set(jobId, {
				id: jobId,
				status: "queued",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const mockManager = createMockJobManager({
				jobs,
				submitJobResult: jobId,
			});
			const routes = new EvaluationRoutes(
				mockManager as never,
				false,
				createRateLimiter(),
			);

			const req = new Request("http://localhost/api/evaluate", {
				method: "POST",
				body: JSON.stringify({
					repositoryUrl: "https://github.com/test/repo",
				}),
				headers: { "Content-Type": "application/json" },
			});

			const response = await routes.post(req);
			const body = await response.json();

			expect(response.status).toBe(202);
			expect(body.jobId).toBe(jobId);
			expect(body.status).toBe("queued");
			expect(body.sseUrl).toBe(`/api/evaluate/${jobId}/progress`);
		});

		test("should return 202 with localPath", async () => {
			const jobs = new Map();
			const jobId = "job-789";
			jobs.set(jobId, {
				id: jobId,
				status: "queued",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const mockManager = createMockJobManager({
				jobs,
				submitJobResult: jobId,
			});
			const routes = new EvaluationRoutes(
				mockManager as never,
				false,
				createRateLimiter(),
			);

			const req = new Request("http://localhost/api/evaluate", {
				method: "POST",
				body: JSON.stringify({
					localPath: "/path/to/repo",
				}),
				headers: { "Content-Type": "application/json" },
			});

			const response = await routes.post(req);

			expect(response.status).toBe(202);
		});

		test("should return 429 when queue is full", async () => {
			const mockManager = createMockJobManager({
				submitJobError: new Error("Job queue is at capacity"),
			});
			const routes = new EvaluationRoutes(
				mockManager as never,
				false,
				createRateLimiter(),
			);

			const req = new Request("http://localhost/api/evaluate", {
				method: "POST",
				body: JSON.stringify({
					repositoryUrl: "https://github.com/test/repo",
				}),
				headers: { "Content-Type": "application/json" },
			});

			const response = await routes.post(req);
			const body = await response.json();

			expect(response.status).toBe(429);
			expect(body.code).toBe("QUEUE_FULL");
		});

		test("should return 429 when daily Git URL limit is exceeded", async () => {
			const jobs = new Map();
			const jobId = "job-rate-limited";
			jobs.set(jobId, {
				id: jobId,
				status: "queued",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const mockManager = createMockJobManager({
				jobs,
				submitJobResult: jobId,
			});

			// Create a rate limiter with limit of 2
			const rateLimiter = createRateLimiter(2);
			const routes = new EvaluationRoutes(
				mockManager as never,
				false,
				rateLimiter,
			);

			// First request should succeed
			const req1 = new Request("http://localhost/api/evaluate", {
				method: "POST",
				body: JSON.stringify({
					repositoryUrl: "https://github.com/test/repo1",
				}),
				headers: { "Content-Type": "application/json" },
			});
			const response1 = await routes.post(req1);
			expect(response1.status).toBe(202);

			// Second request should succeed
			const req2 = new Request("http://localhost/api/evaluate", {
				method: "POST",
				body: JSON.stringify({
					repositoryUrl: "https://github.com/test/repo2",
				}),
				headers: { "Content-Type": "application/json" },
			});
			const response2 = await routes.post(req2);
			expect(response2.status).toBe(202);

			// Third request should fail due to rate limit
			const req3 = new Request("http://localhost/api/evaluate", {
				method: "POST",
				body: JSON.stringify({
					repositoryUrl: "https://github.com/test/repo3",
				}),
				headers: { "Content-Type": "application/json" },
			});
			const response3 = await routes.post(req3);
			const body3 = await response3.json();

			expect(response3.status).toBe(429);
			expect(body3.code).toBe("DAILY_LIMIT_EXCEEDED");
		});

		test("should not rate limit local path evaluations", async () => {
			const jobs = new Map();
			const jobId = "job-local";
			jobs.set(jobId, {
				id: jobId,
				status: "queued",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const mockManager = createMockJobManager({
				jobs,
				submitJobResult: jobId,
			});

			// Create a rate limiter with limit of 1
			const rateLimiter = createRateLimiter(1);
			const routes = new EvaluationRoutes(
				mockManager as never,
				false,
				rateLimiter,
			);

			// First Git URL request uses up the limit
			const req1 = new Request("http://localhost/api/evaluate", {
				method: "POST",
				body: JSON.stringify({
					repositoryUrl: "https://github.com/test/repo",
				}),
				headers: { "Content-Type": "application/json" },
			});
			const response1 = await routes.post(req1);
			expect(response1.status).toBe(202);

			// Local path request should still succeed (not affected by rate limit)
			const req2 = new Request("http://localhost/api/evaluate", {
				method: "POST",
				body: JSON.stringify({
					localPath: "/path/to/repo",
				}),
				headers: { "Content-Type": "application/json" },
			});
			const response2 = await routes.post(req2);
			expect(response2.status).toBe(202);
		});

		test("should return 500 for other errors", async () => {
			const mockManager = createMockJobManager({
				submitJobError: new Error("Database connection failed"),
			});
			const routes = new EvaluationRoutes(
				mockManager as never,
				false,
				createRateLimiter(),
			);

			const req = new Request("http://localhost/api/evaluate", {
				method: "POST",
				body: JSON.stringify({
					repositoryUrl: "https://github.com/test/repo",
				}),
				headers: { "Content-Type": "application/json" },
			});

			const response = await routes.post(req);
			const body = await response.json();

			expect(response.status).toBe(500);
			expect(body.code).toBe("INTERNAL_ERROR");
		});
	});

	describe("GET /api/evaluate/:id", () => {
		test("should return 404 when job not found", async () => {
			const mockManager = createMockJobManager();
			const routes = new EvaluationRoutes(
				mockManager as never,
				false,
				createRateLimiter(),
			);

			const req = new Request("http://localhost/api/evaluate/non-existent");
			const response = await routes.get(req, "non-existent");
			const body = await response.json();

			expect(response.status).toBe(404);
			expect(body.code).toBe("JOB_NOT_FOUND");
		});

		test("should return 200 with job details", async () => {
			const jobs = new Map();
			const jobId = "job-123";
			jobs.set(jobId, {
				id: jobId,
				status: "running",
				createdAt: new Date("2024-01-01T00:00:00Z"),
				updatedAt: new Date("2024-01-01T00:01:00Z"),
				startedAt: new Date("2024-01-01T00:00:30Z"),
				progress: { step: "evaluating", completed: 5, total: 10 },
			});

			const mockManager = createMockJobManager({ jobs });
			const routes = new EvaluationRoutes(
				mockManager as never,
				false,
				createRateLimiter(),
			);

			const req = new Request(`http://localhost/api/evaluate/${jobId}`);
			const response = await routes.get(req, jobId);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.jobId).toBe(jobId);
			expect(body.status).toBe("running");
			expect(body.startedAt).toBeDefined();
			expect(body.progress).toBeDefined();
			expect(body.sseUrl).toBe(`/api/evaluate/${jobId}/progress`);
		});

		test("should include result when job is completed", async () => {
			const jobs = new Map();
			const jobId = "job-completed";
			jobs.set(jobId, {
				id: jobId,
				status: "completed",
				createdAt: new Date(),
				updatedAt: new Date(),
				completedAt: new Date(),
				result: { totalIssues: 5 },
			});

			const mockManager = createMockJobManager({ jobs });
			const routes = new EvaluationRoutes(
				mockManager as never,
				false,
				createRateLimiter(),
			);

			const req = new Request(`http://localhost/api/evaluate/${jobId}`);
			const response = await routes.get(req, jobId);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.result).toBeDefined();
			expect(body.result.totalIssues).toBe(5);
			expect(body.sseUrl).toBeUndefined(); // No SSE for completed jobs
		});

		test("should include error when job failed", async () => {
			const jobs = new Map();
			const jobId = "job-failed";
			jobs.set(jobId, {
				id: jobId,
				status: "failed",
				createdAt: new Date(),
				updatedAt: new Date(),
				failedAt: new Date(),
				error: { message: "Evaluation failed", code: "EVAL_ERROR" },
			});

			const mockManager = createMockJobManager({ jobs });
			const routes = new EvaluationRoutes(
				mockManager as never,
				false,
				createRateLimiter(),
			);

			const req = new Request(`http://localhost/api/evaluate/${jobId}`);
			const response = await routes.get(req, jobId);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.error).toBeDefined();
			expect(body.failedAt).toBeDefined();
		});
	});

	describe("GET /api/evaluate (list)", () => {
		test("should return list of all jobs", async () => {
			const jobs = new Map();
			jobs.set("job-1", {
				id: "job-1",
				status: "completed",
				createdAt: new Date(),
				updatedAt: new Date(),
			});
			jobs.set("job-2", {
				id: "job-2",
				status: "running",
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			const mockManager = createMockJobManager({ jobs });
			const routes = new EvaluationRoutes(
				mockManager as never,
				false,
				createRateLimiter(),
			);

			const req = new Request("http://localhost/api/evaluate");
			const response = await routes.list(req);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body).toBeInstanceOf(Array);
			expect(body).toHaveLength(2);
		});

		test("should return empty array when no jobs", async () => {
			const mockManager = createMockJobManager();
			const routes = new EvaluationRoutes(
				mockManager as never,
				false,
				createRateLimiter(),
			);

			const req = new Request("http://localhost/api/evaluate");
			const response = await routes.list(req);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body).toEqual([]);
		});
	});

	describe("GET /api/evaluations (history)", () => {
		test("should return recent evaluations from database", async () => {
			// Insert test data
			testDb.run(
				`INSERT INTO evaluations (id, repository_url, evaluators_count, status, created_at, completed_at)
				 VALUES ('eval-1', 'https://github.com/test/repo', 17, 'completed', datetime('now'), datetime('now'))`,
			);

			const mockManager = createMockJobManager();
			const routes = new EvaluationRoutes(
				mockManager as never,
				false,
				createRateLimiter(),
			);

			const req = new Request("http://localhost/api/evaluations");
			const response = await routes.listHistory(req);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body).toBeInstanceOf(Array);
			expect(body.length).toBeGreaterThan(0);
		});

		test("should respect limit parameter", async () => {
			// Insert multiple evaluations
			for (let i = 0; i < 5; i++) {
				testDb.run(
					`INSERT INTO evaluations (id, repository_url, evaluators_count, status, created_at, completed_at)
					 VALUES ('eval-${i}', 'https://github.com/test/repo', 17, 'completed', datetime('now'), datetime('now'))`,
				);
			}

			const mockManager = createMockJobManager();
			const routes = new EvaluationRoutes(
				mockManager as never,
				false,
				createRateLimiter(),
			);

			const req = new Request("http://localhost/api/evaluations?limit=2");
			const response = await routes.listHistory(req);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body).toHaveLength(2);
		});
	});

	describe("GET /api/evaluations/:id", () => {
		test("should return 404 when evaluation not found", async () => {
			const mockManager = createMockJobManager();
			const routes = new EvaluationRoutes(
				mockManager as never,
				false,
				createRateLimiter(),
			);

			const req = new Request("http://localhost/api/evaluations/non-existent");
			const response = await routes.getHistoryItem(req, "non-existent");
			const body = await response.json();

			expect(response.status).toBe(404);
			expect(body.code).toBe("EVALUATION_NOT_FOUND");
		});

		test("should return evaluation when found", async () => {
			testDb.run(
				`INSERT INTO evaluations (id, repository_url, evaluators_count, status, total_issues, created_at, completed_at)
				 VALUES ('eval-test', 'https://github.com/test/repo', 17, 'completed', 10, datetime('now'), datetime('now'))`,
			);

			const mockManager = createMockJobManager();
			const routes = new EvaluationRoutes(
				mockManager as never,
				false,
				createRateLimiter(),
			);

			const req = new Request("http://localhost/api/evaluations/eval-test");
			const response = await routes.getHistoryItem(req, "eval-test");
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.id).toBe("eval-test");
		});
	});

	describe("DELETE /api/evaluations/:id", () => {
		test("should return 404 when evaluation not found", async () => {
			const mockManager = createMockJobManager();
			const routes = new EvaluationRoutes(
				mockManager as never,
				false,
				createRateLimiter(),
			);

			const req = new Request("http://localhost/api/evaluations/non-existent", {
				method: "DELETE",
			});
			const response = await routes.deleteHistoryItem(req, "non-existent");
			const body = await response.json();

			expect(response.status).toBe(404);
			expect(body.code).toBe("EVALUATION_NOT_FOUND");
		});

		test("should delete evaluation and return success", async () => {
			testDb.run(
				`INSERT INTO evaluations (id, repository_url, evaluators_count, status, created_at, completed_at)
				 VALUES ('eval-to-delete', 'https://github.com/test/repo', 17, 'completed', datetime('now'), datetime('now'))`,
			);

			const mockManager = createMockJobManager();
			const routes = new EvaluationRoutes(
				mockManager as never,
				false,
				createRateLimiter(),
			);

			const req = new Request(
				"http://localhost/api/evaluations/eval-to-delete",
				{ method: "DELETE" },
			);
			const response = await routes.deleteHistoryItem(req, "eval-to-delete");
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);

			// Verify deleted
			const check = testDb
				.query("SELECT * FROM evaluations WHERE id = ?")
				.all("eval-to-delete");
			expect(check).toHaveLength(0);
		});
	});

	describe("DELETE /api/evaluations (all)", () => {
		test("should delete all evaluations", async () => {
			// Insert multiple evaluations
			testDb.run(
				`INSERT INTO evaluations (id, repository_url, evaluators_count, status, created_at, completed_at)
				 VALUES ('eval-1', 'https://github.com/test/repo', 17, 'completed', datetime('now'), datetime('now'))`,
			);
			testDb.run(
				`INSERT INTO evaluations (id, repository_url, evaluators_count, status, created_at, completed_at)
				 VALUES ('eval-2', 'https://github.com/test/repo', 17, 'completed', datetime('now'), datetime('now'))`,
			);

			const mockManager = createMockJobManager();
			const routes = new EvaluationRoutes(
				mockManager as never,
				false,
				createRateLimiter(),
			);

			const req = new Request("http://localhost/api/evaluations", {
				method: "DELETE",
			});
			const response = await routes.deleteAllHistoryItems(req);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);
			expect(body.deletedCount).toBe(2);

			// Verify all deleted
			const check = testDb.query("SELECT * FROM evaluations").all();
			expect(check).toHaveLength(0);
		});
	});

	describe("GET /api/evaluations/:id/prompts", () => {
		test("should return 404 when evaluation not found", async () => {
			const mockManager = createMockJobManager();
			const routes = new EvaluationRoutes(
				mockManager as never,
				false,
				createRateLimiter(),
			);

			const req = new Request(
				"http://localhost/api/evaluations/non-existent/prompts",
			);
			const response = await routes.getEvaluationPrompts(req, "non-existent");
			const body = await response.json();

			expect(response.status).toBe(404);
			expect(body.code).toBe("EVALUATION_NOT_FOUND");
		});

		test("should return prompts for evaluation", async () => {
			const prompts = { "content-quality": "test prompt" };
			testDb.run(
				`INSERT INTO evaluations (id, repository_url, evaluators_count, status, final_prompts_json, created_at, completed_at)
				 VALUES ('eval-prompts', 'https://github.com/test/repo', 17, 'completed', ?, datetime('now'), datetime('now'))`,
				[JSON.stringify(prompts)],
			);

			const mockManager = createMockJobManager();
			const routes = new EvaluationRoutes(
				mockManager as never,
				false,
				createRateLimiter(),
			);

			const req = new Request(
				"http://localhost/api/evaluations/eval-prompts/prompts",
			);
			const response = await routes.getEvaluationPrompts(req, "eval-prompts");
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.evaluationId).toBe("eval-prompts");
			expect(body.prompts).toBeDefined();
		});
	});
});
