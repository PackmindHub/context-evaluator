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
import { FeedbackRoutes } from "./feedback";

// Mock the getDatabase function to return our test database
let testDb: Database;

mock.module("../db/database", () => ({
	getDatabase: () => testDb,
}));

describe("FeedbackRoutes", () => {
	let routes: FeedbackRoutes;

	beforeAll(() => {
		testDb = new Database(":memory:");
		testDb.run(`
			CREATE TABLE IF NOT EXISTS issue_feedback (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				evaluation_id TEXT NOT NULL,
				issue_hash TEXT NOT NULL,
				evaluator_name TEXT NOT NULL,
				feedback_type TEXT NOT NULL CHECK(feedback_type IN ('like', 'dislike')),
				created_at TEXT NOT NULL,
				UNIQUE(evaluation_id, issue_hash)
			);
		`);
	});

	afterAll(() => {
		testDb.close();
	});

	beforeEach(() => {
		testDb.run("DELETE FROM issue_feedback");
		routes = new FeedbackRoutes();
	});

	describe("POST /api/feedback", () => {
		test("should save feedback and return 200", async () => {
			const req = new Request("http://localhost/api/feedback", {
				method: "POST",
				body: JSON.stringify({
					evaluationId: "eval-123",
					issueHash: "hash-abc",
					evaluatorName: "content-quality",
					feedbackType: "like",
				}),
				headers: { "Content-Type": "application/json" },
			});

			const response = await routes.post(req);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);

			const results = testDb
				.query("SELECT * FROM issue_feedback")
				.all() as Array<Record<string, unknown>>;
			expect(results).toHaveLength(1);
			expect(results[0]!.feedback_type).toBe("like");
		});

		test("should update existing feedback", async () => {
			// First save a 'like'
			const req1 = new Request("http://localhost/api/feedback", {
				method: "POST",
				body: JSON.stringify({
					evaluationId: "eval-123",
					issueHash: "hash-abc",
					evaluatorName: "content-quality",
					feedbackType: "like",
				}),
				headers: { "Content-Type": "application/json" },
			});
			await routes.post(req1);

			// Then update to 'dislike'
			const req2 = new Request("http://localhost/api/feedback", {
				method: "POST",
				body: JSON.stringify({
					evaluationId: "eval-123",
					issueHash: "hash-abc",
					evaluatorName: "content-quality",
					feedbackType: "dislike",
				}),
				headers: { "Content-Type": "application/json" },
			});
			const response = await routes.post(req2);

			expect(response.status).toBe(200);

			const results = testDb
				.query("SELECT * FROM issue_feedback")
				.all() as Array<Record<string, unknown>>;
			expect(results).toHaveLength(1);
			expect(results[0]!.feedback_type).toBe("dislike");
		});

		test("should return 400 when evaluationId is missing", async () => {
			const req = new Request("http://localhost/api/feedback", {
				method: "POST",
				body: JSON.stringify({
					issueHash: "hash-abc",
					evaluatorName: "content-quality",
					feedbackType: "like",
				}),
				headers: { "Content-Type": "application/json" },
			});

			const response = await routes.post(req);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toBe("Missing required fields");
		});

		test("should return 400 when issueHash is missing", async () => {
			const req = new Request("http://localhost/api/feedback", {
				method: "POST",
				body: JSON.stringify({
					evaluationId: "eval-123",
					evaluatorName: "content-quality",
					feedbackType: "like",
				}),
				headers: { "Content-Type": "application/json" },
			});

			const response = await routes.post(req);
			expect(response.status).toBe(400);
		});

		test("should return 400 when feedbackType is missing", async () => {
			const req = new Request("http://localhost/api/feedback", {
				method: "POST",
				body: JSON.stringify({
					evaluationId: "eval-123",
					issueHash: "hash-abc",
					evaluatorName: "content-quality",
				}),
				headers: { "Content-Type": "application/json" },
			});

			const response = await routes.post(req);
			expect(response.status).toBe(400);
		});

		test("should return 400 when feedbackType is invalid", async () => {
			const req = new Request("http://localhost/api/feedback", {
				method: "POST",
				body: JSON.stringify({
					evaluationId: "eval-123",
					issueHash: "hash-abc",
					evaluatorName: "content-quality",
					feedbackType: "invalid",
				}),
				headers: { "Content-Type": "application/json" },
			});

			const response = await routes.post(req);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toBe("Invalid feedback type");
		});

		test("should accept 'dislike' feedback type", async () => {
			const req = new Request("http://localhost/api/feedback", {
				method: "POST",
				body: JSON.stringify({
					evaluationId: "eval-123",
					issueHash: "hash-abc",
					evaluatorName: "content-quality",
					feedbackType: "dislike",
				}),
				headers: { "Content-Type": "application/json" },
			});

			const response = await routes.post(req);
			expect(response.status).toBe(200);
		});
	});

	describe("DELETE /api/feedback", () => {
		test("should delete feedback and return 200", async () => {
			// First add feedback
			testDb.run(
				`INSERT INTO issue_feedback (evaluation_id, issue_hash, evaluator_name, feedback_type, created_at)
				 VALUES ('eval-123', 'hash-abc', 'content-quality', 'like', datetime('now'))`,
			);

			const req = new Request(
				"http://localhost/api/feedback?evaluationId=eval-123&issueHash=hash-abc",
				{ method: "DELETE" },
			);

			const response = await routes.delete(req);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);

			const results = testDb
				.query("SELECT * FROM issue_feedback")
				.all() as Array<Record<string, unknown>>;
			expect(results).toHaveLength(0);
		});

		test("should return 400 when evaluationId is missing", async () => {
			const req = new Request(
				"http://localhost/api/feedback?issueHash=hash-abc",
				{ method: "DELETE" },
			);

			const response = await routes.delete(req);
			expect(response.status).toBe(400);
		});

		test("should return 400 when issueHash is missing", async () => {
			const req = new Request(
				"http://localhost/api/feedback?evaluationId=eval-123",
				{ method: "DELETE" },
			);

			const response = await routes.delete(req);
			expect(response.status).toBe(400);
		});

		test("should return 200 for non-existent feedback", async () => {
			const req = new Request(
				"http://localhost/api/feedback?evaluationId=non-existent&issueHash=hash-abc",
				{ method: "DELETE" },
			);

			const response = await routes.delete(req);
			expect(response.status).toBe(200);
		});
	});

	describe("GET /api/feedback/evaluation/:evaluationId", () => {
		test("should return feedback array", async () => {
			testDb.run(
				`INSERT INTO issue_feedback (evaluation_id, issue_hash, evaluator_name, feedback_type, created_at)
				 VALUES ('eval-123', 'hash-1', 'content-quality', 'like', datetime('now'))`,
			);
			testDb.run(
				`INSERT INTO issue_feedback (evaluation_id, issue_hash, evaluator_name, feedback_type, created_at)
				 VALUES ('eval-123', 'hash-2', '03-command-completeness', 'dislike', datetime('now'))`,
			);

			const req = new Request(
				"http://localhost/api/feedback/evaluation/eval-123",
			);
			const response = await routes.getForEvaluation(req, "eval-123");
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.feedback).toBeInstanceOf(Array);
			expect(body.feedback).toHaveLength(2);
		});

		test("should return empty array for evaluation with no feedback", async () => {
			const req = new Request(
				"http://localhost/api/feedback/evaluation/non-existent",
			);
			const response = await routes.getForEvaluation(req, "non-existent");
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.feedback).toEqual([]);
		});

		test("should return feedback with all required fields", async () => {
			testDb.run(
				`INSERT INTO issue_feedback (evaluation_id, issue_hash, evaluator_name, feedback_type, created_at)
				 VALUES ('eval-123', 'hash-abc', 'code-style', 'like', datetime('now'))`,
			);

			const req = new Request(
				"http://localhost/api/feedback/evaluation/eval-123",
			);
			const response = await routes.getForEvaluation(req, "eval-123");
			const body = await response.json();

			expect(body.feedback).toHaveLength(1);
			const feedback = body.feedback[0];
			expect(feedback.id).toBeDefined();
			expect(feedback.evaluationId).toBe("eval-123");
			expect(feedback.issueHash).toBe("hash-abc");
			expect(feedback.evaluatorName).toBe("code-style");
			expect(feedback.feedbackType).toBe("like");
			expect(feedback.createdAt).toBeDefined();
		});
	});

	describe("GET /api/feedback/aggregate", () => {
		test("should return empty array when no feedback exists", async () => {
			const req = new Request("http://localhost/api/feedback/aggregate");
			const response = await routes.getAggregate(req);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.aggregate).toEqual([]);
		});

		test("should return aggregated feedback", async () => {
			// Add various feedback
			testDb.run(
				`INSERT INTO issue_feedback (evaluation_id, issue_hash, evaluator_name, feedback_type, created_at)
				 VALUES ('eval-1', 'hash-1', 'content-quality', 'like', datetime('now'))`,
			);
			testDb.run(
				`INSERT INTO issue_feedback (evaluation_id, issue_hash, evaluator_name, feedback_type, created_at)
				 VALUES ('eval-2', 'hash-2', 'content-quality', 'like', datetime('now'))`,
			);
			testDb.run(
				`INSERT INTO issue_feedback (evaluation_id, issue_hash, evaluator_name, feedback_type, created_at)
				 VALUES ('eval-3', 'hash-3', 'content-quality', 'dislike', datetime('now'))`,
			);

			const req = new Request("http://localhost/api/feedback/aggregate");
			const response = await routes.getAggregate(req);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.aggregate).toHaveLength(1);
			expect(body.aggregate[0].evaluatorName).toBe("content-quality");
			expect(body.aggregate[0].totalLikes).toBe(2);
			expect(body.aggregate[0].totalDislikes).toBe(1);
			expect(body.aggregate[0].netScore).toBe(1);
			expect(body.aggregate[0].totalFeedback).toBe(3);
		});

		test("should return multiple evaluators sorted by net score", async () => {
			testDb.run(
				`INSERT INTO issue_feedback (evaluation_id, issue_hash, evaluator_name, feedback_type, created_at)
				 VALUES ('eval-1', 'hash-1', 'evaluator-a', 'dislike', datetime('now'))`,
			);
			testDb.run(
				`INSERT INTO issue_feedback (evaluation_id, issue_hash, evaluator_name, feedback_type, created_at)
				 VALUES ('eval-2', 'hash-2', 'evaluator-b', 'like', datetime('now'))`,
			);
			testDb.run(
				`INSERT INTO issue_feedback (evaluation_id, issue_hash, evaluator_name, feedback_type, created_at)
				 VALUES ('eval-3', 'hash-3', 'evaluator-b', 'like', datetime('now'))`,
			);

			const req = new Request("http://localhost/api/feedback/aggregate");
			const response = await routes.getAggregate(req);
			const body = await response.json();

			expect(body.aggregate).toHaveLength(2);
			// Highest score first
			expect(body.aggregate[0].evaluatorName).toBe("evaluator-b");
			expect(body.aggregate[0].netScore).toBe(2);
			// Lowest score last
			expect(body.aggregate[1].evaluatorName).toBe("evaluator-a");
			expect(body.aggregate[1].netScore).toBe(-1);
		});
	});
});
