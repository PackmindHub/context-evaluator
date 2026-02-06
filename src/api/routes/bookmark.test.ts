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
import { BookmarkRoutes } from "./bookmark";

// Mock the getDatabase function to return our test database
let testDb: Database;

mock.module("../db/database", () => ({
	getDatabase: () => testDb,
}));

describe("BookmarkRoutes", () => {
	let routes: BookmarkRoutes;

	beforeAll(() => {
		testDb = new Database(":memory:");
		testDb.run(`
			CREATE TABLE IF NOT EXISTS issue_bookmarks (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				evaluation_id TEXT NOT NULL,
				issue_hash TEXT NOT NULL,
				evaluator_name TEXT NOT NULL,
				created_at TEXT NOT NULL,
				UNIQUE(evaluation_id, issue_hash)
			);
		`);
	});

	afterAll(() => {
		testDb.close();
	});

	beforeEach(() => {
		testDb.run("DELETE FROM issue_bookmarks");
		routes = new BookmarkRoutes();
	});

	describe("POST /api/bookmarks", () => {
		test("should add bookmark and return 200", async () => {
			const req = new Request("http://localhost/api/bookmarks", {
				method: "POST",
				body: JSON.stringify({
					evaluationId: "eval-123",
					issueHash: "hash-abc",
					evaluatorName: "content-quality",
				}),
				headers: { "Content-Type": "application/json" },
			});

			const response = await routes.post(req);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);

			// Verify in database
			const results = testDb
				.query("SELECT * FROM issue_bookmarks")
				.all() as Array<Record<string, unknown>>;
			expect(results).toHaveLength(1);
		});

		test("should return 400 when evaluationId is missing", async () => {
			const req = new Request("http://localhost/api/bookmarks", {
				method: "POST",
				body: JSON.stringify({
					issueHash: "hash-abc",
					evaluatorName: "content-quality",
				}),
				headers: { "Content-Type": "application/json" },
			});

			const response = await routes.post(req);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toBe("Missing required fields");
		});

		test("should return 400 when issueHash is missing", async () => {
			const req = new Request("http://localhost/api/bookmarks", {
				method: "POST",
				body: JSON.stringify({
					evaluationId: "eval-123",
					evaluatorName: "content-quality",
				}),
				headers: { "Content-Type": "application/json" },
			});

			const response = await routes.post(req);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toBe("Missing required fields");
		});

		test("should return 400 when evaluatorName is missing", async () => {
			const req = new Request("http://localhost/api/bookmarks", {
				method: "POST",
				body: JSON.stringify({
					evaluationId: "eval-123",
					issueHash: "hash-abc",
				}),
				headers: { "Content-Type": "application/json" },
			});

			const response = await routes.post(req);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toBe("Missing required fields");
		});

		test("should be idempotent (add same bookmark twice)", async () => {
			const req = new Request("http://localhost/api/bookmarks", {
				method: "POST",
				body: JSON.stringify({
					evaluationId: "eval-123",
					issueHash: "hash-abc",
					evaluatorName: "content-quality",
				}),
				headers: { "Content-Type": "application/json" },
			});

			await routes.post(req);
			const response2 = await routes.post(
				new Request("http://localhost/api/bookmarks", {
					method: "POST",
					body: JSON.stringify({
						evaluationId: "eval-123",
						issueHash: "hash-abc",
						evaluatorName: "content-quality",
					}),
					headers: { "Content-Type": "application/json" },
				}),
			);

			expect(response2.status).toBe(200);

			const results = testDb
				.query("SELECT * FROM issue_bookmarks")
				.all() as Array<Record<string, unknown>>;
			expect(results).toHaveLength(1);
		});
	});

	describe("DELETE /api/bookmarks", () => {
		test("should remove bookmark and return 200", async () => {
			// First add a bookmark
			testDb.run(
				`INSERT INTO issue_bookmarks (evaluation_id, issue_hash, evaluator_name, created_at)
				 VALUES ('eval-123', 'hash-abc', '01-content-quality', datetime('now'))`,
			);

			const req = new Request(
				"http://localhost/api/bookmarks?evaluationId=eval-123&issueHash=hash-abc",
				{ method: "DELETE" },
			);

			const response = await routes.delete(req);
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.success).toBe(true);

			// Verify removed from database
			const results = testDb
				.query("SELECT * FROM issue_bookmarks")
				.all() as Array<Record<string, unknown>>;
			expect(results).toHaveLength(0);
		});

		test("should return 400 when evaluationId is missing", async () => {
			const req = new Request(
				"http://localhost/api/bookmarks?issueHash=hash-abc",
				{ method: "DELETE" },
			);

			const response = await routes.delete(req);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toBe("Missing required parameters");
		});

		test("should return 400 when issueHash is missing", async () => {
			const req = new Request(
				"http://localhost/api/bookmarks?evaluationId=eval-123",
				{ method: "DELETE" },
			);

			const response = await routes.delete(req);
			const body = await response.json();

			expect(response.status).toBe(400);
			expect(body.error).toBe("Missing required parameters");
		});

		test("should return 200 for non-existent bookmark", async () => {
			const req = new Request(
				"http://localhost/api/bookmarks?evaluationId=non-existent&issueHash=hash-abc",
				{ method: "DELETE" },
			);

			const response = await routes.delete(req);
			expect(response.status).toBe(200);
		});
	});

	describe("GET /api/bookmarks/evaluation/:evaluationId", () => {
		test("should return array of bookmarks", async () => {
			// Add some bookmarks
			testDb.run(
				`INSERT INTO issue_bookmarks (evaluation_id, issue_hash, evaluator_name, created_at)
				 VALUES ('eval-123', 'hash-1', '01-content-quality', datetime('now'))`,
			);
			testDb.run(
				`INSERT INTO issue_bookmarks (evaluation_id, issue_hash, evaluator_name, created_at)
				 VALUES ('eval-123', 'hash-2', '03-command-completeness', datetime('now'))`,
			);

			const req = new Request(
				"http://localhost/api/bookmarks/evaluation/eval-123",
			);
			const response = await routes.getForEvaluation(req, "eval-123");
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.bookmarks).toBeInstanceOf(Array);
			expect(body.bookmarks).toHaveLength(2);
			expect(body.bookmarks).toContain("hash-1");
			expect(body.bookmarks).toContain("hash-2");
		});

		test("should return empty array for evaluation with no bookmarks", async () => {
			const req = new Request(
				"http://localhost/api/bookmarks/evaluation/non-existent",
			);
			const response = await routes.getForEvaluation(req, "non-existent");
			const body = await response.json();

			expect(response.status).toBe(200);
			expect(body.bookmarks).toEqual([]);
		});

		test("should only return bookmarks for specified evaluation", async () => {
			testDb.run(
				`INSERT INTO issue_bookmarks (evaluation_id, issue_hash, evaluator_name, created_at)
				 VALUES ('eval-1', 'hash-1', '01-content-quality', datetime('now'))`,
			);
			testDb.run(
				`INSERT INTO issue_bookmarks (evaluation_id, issue_hash, evaluator_name, created_at)
				 VALUES ('eval-2', 'hash-2', '03-command-completeness', datetime('now'))`,
			);

			const req = new Request(
				"http://localhost/api/bookmarks/evaluation/eval-1",
			);
			const response = await routes.getForEvaluation(req, "eval-1");
			const body = await response.json();

			expect(body.bookmarks).toHaveLength(1);
			expect(body.bookmarks).toContain("hash-1");
		});
	});
});
