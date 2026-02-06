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
import { BookmarkRepository } from "./bookmark-repository";

// Mock the getDatabase function to return our test database
let testDb: Database;

// We need to mock the module before importing the repository
mock.module("./database", () => ({
	getDatabase: () => testDb,
}));

describe("BookmarkRepository", () => {
	beforeAll(() => {
		// Create an in-memory database for testing
		testDb = new Database(":memory:");

		// Create the bookmarks table
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
		// Clear the table before each test
		testDb.run("DELETE FROM issue_bookmarks");
	});

	describe("getInstance", () => {
		test("should return singleton instance", () => {
			const instance1 = BookmarkRepository.getInstance();
			const instance2 = BookmarkRepository.getInstance();

			expect(instance1).toBe(instance2);
		});
	});

	describe("addBookmark", () => {
		test("should add a new bookmark", () => {
			const repo = BookmarkRepository.getInstance();

			repo.addBookmark("eval-123", "hash-abc", "content-quality");

			const results = testDb
				.query("SELECT * FROM issue_bookmarks WHERE evaluation_id = ?")
				.all("eval-123") as Array<Record<string, unknown>>;

			expect(results).toHaveLength(1);
			expect(results[0]!.issue_hash).toBe("hash-abc");
			expect(results[0]!.evaluator_name).toBe("content-quality");
		});

		test("should be idempotent (ignore duplicates)", () => {
			const repo = BookmarkRepository.getInstance();

			repo.addBookmark("eval-123", "hash-abc", "content-quality");
			repo.addBookmark("eval-123", "hash-abc", "content-quality"); // Duplicate

			const results = testDb
				.query("SELECT * FROM issue_bookmarks WHERE evaluation_id = ?")
				.all("eval-123") as Array<Record<string, unknown>>;

			expect(results).toHaveLength(1);
		});

		test("should allow same hash in different evaluations", () => {
			const repo = BookmarkRepository.getInstance();

			repo.addBookmark("eval-1", "hash-abc", "content-quality");
			repo.addBookmark("eval-2", "hash-abc", "content-quality");

			const results = testDb
				.query("SELECT * FROM issue_bookmarks")
				.all() as Array<Record<string, unknown>>;

			expect(results).toHaveLength(2);
		});

		test("should allow different hashes in same evaluation", () => {
			const repo = BookmarkRepository.getInstance();

			repo.addBookmark("eval-123", "hash-1", "content-quality");
			repo.addBookmark("eval-123", "hash-2", "command-completeness");

			const results = testDb
				.query("SELECT * FROM issue_bookmarks WHERE evaluation_id = ?")
				.all("eval-123") as Array<Record<string, unknown>>;

			expect(results).toHaveLength(2);
		});
	});

	describe("removeBookmark", () => {
		test("should remove existing bookmark", () => {
			const repo = BookmarkRepository.getInstance();

			repo.addBookmark("eval-123", "hash-abc", "content-quality");
			repo.removeBookmark("eval-123", "hash-abc");

			const results = testDb
				.query("SELECT * FROM issue_bookmarks WHERE evaluation_id = ?")
				.all("eval-123") as Array<Record<string, unknown>>;

			expect(results).toHaveLength(0);
		});

		test("should not throw for non-existent bookmark", () => {
			const repo = BookmarkRepository.getInstance();

			// Should not throw
			expect(() =>
				repo.removeBookmark("non-existent", "hash-abc"),
			).not.toThrow();
		});

		test("should only remove specific bookmark", () => {
			const repo = BookmarkRepository.getInstance();

			repo.addBookmark("eval-123", "hash-1", "content-quality");
			repo.addBookmark("eval-123", "hash-2", "command-completeness");

			repo.removeBookmark("eval-123", "hash-1");

			const results = testDb
				.query("SELECT * FROM issue_bookmarks WHERE evaluation_id = ?")
				.all("eval-123") as Array<Record<string, unknown>>;

			expect(results).toHaveLength(1);
			expect(results[0]!.issue_hash).toBe("hash-2");
		});
	});

	describe("getBookmarksForEvaluation", () => {
		test("should return empty Set for evaluation with no bookmarks", () => {
			const repo = BookmarkRepository.getInstance();

			const bookmarks = repo.getBookmarksForEvaluation("non-existent");

			expect(bookmarks).toBeInstanceOf(Set);
			expect(bookmarks.size).toBe(0);
		});

		test("should return Set of issue hashes", () => {
			const repo = BookmarkRepository.getInstance();

			repo.addBookmark("eval-123", "hash-1", "content-quality");
			repo.addBookmark("eval-123", "hash-2", "command-completeness");
			repo.addBookmark("eval-123", "hash-3", "code-style");

			const bookmarks = repo.getBookmarksForEvaluation("eval-123");

			expect(bookmarks.size).toBe(3);
			expect(bookmarks.has("hash-1")).toBe(true);
			expect(bookmarks.has("hash-2")).toBe(true);
			expect(bookmarks.has("hash-3")).toBe(true);
		});

		test("should only return bookmarks for specified evaluation", () => {
			const repo = BookmarkRepository.getInstance();

			repo.addBookmark("eval-1", "hash-1", "content-quality");
			repo.addBookmark("eval-2", "hash-2", "command-completeness");

			const bookmarks = repo.getBookmarksForEvaluation("eval-1");

			expect(bookmarks.size).toBe(1);
			expect(bookmarks.has("hash-1")).toBe(true);
			expect(bookmarks.has("hash-2")).toBe(false);
		});

		test("should enable O(1) lookup", () => {
			const repo = BookmarkRepository.getInstance();

			repo.addBookmark("eval-123", "hash-abc", "content-quality");

			const bookmarks = repo.getBookmarksForEvaluation("eval-123");

			// Set.has() is O(1)
			expect(bookmarks.has("hash-abc")).toBe(true);
			expect(bookmarks.has("hash-xyz")).toBe(false);
		});
	});
});
