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
import { FeedbackRepository } from "./feedback-repository";

// Mock the getDatabase function to return our test database
let testDb: Database;

// We need to mock the module before importing the repository
mock.module("./database", () => ({
	getDatabase: () => testDb,
}));

describe("FeedbackRepository", () => {
	beforeAll(() => {
		// Create an in-memory database for testing
		testDb = new Database(":memory:");

		// Create the feedback table
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
		// Clear the table before each test
		testDb.run("DELETE FROM issue_feedback");
	});

	describe("getInstance", () => {
		test("should return singleton instance", () => {
			const instance1 = FeedbackRepository.getInstance();
			const instance2 = FeedbackRepository.getInstance();

			expect(instance1).toBe(instance2);
		});
	});

	describe("saveFeedback", () => {
		test("should save new feedback", () => {
			const repo = FeedbackRepository.getInstance();

			repo.saveFeedback("eval-123", "hash-abc", "content-quality", "like");

			const results = testDb
				.query("SELECT * FROM issue_feedback WHERE evaluation_id = ?")
				.all("eval-123") as Array<Record<string, unknown>>;

			expect(results).toHaveLength(1);
			expect(results[0]!.issue_hash).toBe("hash-abc");
			expect(results[0]!.feedback_type).toBe("like");
		});

		test("should update existing feedback (upsert)", () => {
			const repo = FeedbackRepository.getInstance();

			repo.saveFeedback("eval-123", "hash-abc", "content-quality", "like");
			repo.saveFeedback("eval-123", "hash-abc", "content-quality", "dislike"); // Update

			const results = testDb
				.query("SELECT * FROM issue_feedback WHERE evaluation_id = ?")
				.all("eval-123") as Array<Record<string, unknown>>;

			expect(results).toHaveLength(1);
			expect(results[0]!.feedback_type).toBe("dislike");
		});

		test("should allow same hash in different evaluations", () => {
			const repo = FeedbackRepository.getInstance();

			repo.saveFeedback("eval-1", "hash-abc", "content-quality", "like");
			repo.saveFeedback("eval-2", "hash-abc", "content-quality", "dislike");

			const results = testDb
				.query("SELECT * FROM issue_feedback")
				.all() as Array<Record<string, unknown>>;

			expect(results).toHaveLength(2);
		});

		test("should allow different hashes in same evaluation", () => {
			const repo = FeedbackRepository.getInstance();

			repo.saveFeedback("eval-123", "hash-1", "content-quality", "like");
			repo.saveFeedback(
				"eval-123",
				"hash-2",
				"command-completeness",
				"dislike",
			);

			const results = testDb
				.query("SELECT * FROM issue_feedback WHERE evaluation_id = ?")
				.all("eval-123") as Array<Record<string, unknown>>;

			expect(results).toHaveLength(2);
		});
	});

	describe("deleteFeedback", () => {
		test("should delete existing feedback", () => {
			const repo = FeedbackRepository.getInstance();

			repo.saveFeedback("eval-123", "hash-abc", "content-quality", "like");
			repo.deleteFeedback("eval-123", "hash-abc");

			const results = testDb
				.query("SELECT * FROM issue_feedback WHERE evaluation_id = ?")
				.all("eval-123") as Array<Record<string, unknown>>;

			expect(results).toHaveLength(0);
		});

		test("should not throw for non-existent feedback", () => {
			const repo = FeedbackRepository.getInstance();

			expect(() =>
				repo.deleteFeedback("non-existent", "hash-abc"),
			).not.toThrow();
		});

		test("should only delete specific feedback", () => {
			const repo = FeedbackRepository.getInstance();

			repo.saveFeedback("eval-123", "hash-1", "content-quality", "like");
			repo.saveFeedback(
				"eval-123",
				"hash-2",
				"command-completeness",
				"dislike",
			);

			repo.deleteFeedback("eval-123", "hash-1");

			const results = testDb
				.query("SELECT * FROM issue_feedback WHERE evaluation_id = ?")
				.all("eval-123") as Array<Record<string, unknown>>;

			expect(results).toHaveLength(1);
			expect(results[0]!.issue_hash).toBe("hash-2");
		});
	});

	describe("getFeedbackForEvaluation", () => {
		test("should return empty array for evaluation with no feedback", () => {
			const repo = FeedbackRepository.getInstance();

			const feedback = repo.getFeedbackForEvaluation("non-existent");

			expect(feedback).toBeInstanceOf(Array);
			expect(feedback).toHaveLength(0);
		});

		test("should return array of feedback records", () => {
			const repo = FeedbackRepository.getInstance();

			repo.saveFeedback("eval-123", "hash-1", "content-quality", "like");
			repo.saveFeedback(
				"eval-123",
				"hash-2",
				"command-completeness",
				"dislike",
			);

			const feedback = repo.getFeedbackForEvaluation("eval-123");

			expect(feedback).toHaveLength(2);

			// Find specific records by hash
			const likeRecord = feedback.find((f) => f.issueHash === "hash-1");
			const dislikeRecord = feedback.find((f) => f.issueHash === "hash-2");

			expect(likeRecord?.feedbackType).toBe("like");
			expect(dislikeRecord?.feedbackType).toBe("dislike");
		});

		test("should return only feedback for specified evaluation", () => {
			const repo = FeedbackRepository.getInstance();

			repo.saveFeedback("eval-1", "hash-1", "content-quality", "like");
			repo.saveFeedback("eval-2", "hash-2", "command-completeness", "dislike");

			const feedback = repo.getFeedbackForEvaluation("eval-1");

			expect(feedback).toHaveLength(1);
			expect(feedback[0]!.issueHash).toBe("hash-1");
		});

		test("should include all required fields", () => {
			const repo = FeedbackRepository.getInstance();

			repo.saveFeedback("eval-123", "hash-abc", "code-style", "like");

			const feedback = repo.getFeedbackForEvaluation("eval-123");

			expect(feedback).toHaveLength(1);
			expect(feedback[0]!.id).toBeDefined();
			expect(feedback[0]!.evaluationId).toBe("eval-123");
			expect(feedback[0]!.issueHash).toBe("hash-abc");
			expect(feedback[0]!.evaluatorName).toBe("code-style");
			expect(feedback[0]!.feedbackType).toBe("like");
			expect(feedback[0]!.createdAt).toBeDefined();
		});
	});

	describe("getAggregatedFeedback", () => {
		test("should return empty array when no feedback exists", () => {
			const repo = FeedbackRepository.getInstance();

			const aggregated = repo.getAggregatedFeedback();

			expect(aggregated).toBeInstanceOf(Array);
			expect(aggregated).toHaveLength(0);
		});

		test("should aggregate feedback by evaluator", () => {
			const repo = FeedbackRepository.getInstance();

			// Add feedback from different evaluations
			repo.saveFeedback("eval-1", "hash-1", "content-quality", "like");
			repo.saveFeedback("eval-2", "hash-2", "content-quality", "like");
			repo.saveFeedback("eval-3", "hash-3", "content-quality", "dislike");
			repo.saveFeedback("eval-1", "hash-4", "command-completeness", "dislike");

			const aggregated = repo.getAggregatedFeedback();

			expect(aggregated).toHaveLength(2);

			const contentQuality = aggregated.find(
				(a) => a.evaluatorName === "content-quality",
			);
			expect(contentQuality?.totalLikes).toBe(2);
			expect(contentQuality?.totalDislikes).toBe(1);
			expect(contentQuality?.totalFeedback).toBe(3);
			expect(contentQuality?.netScore).toBe(1); // 2 - 1

			const commandComplete = aggregated.find(
				(a) => a.evaluatorName === "command-completeness",
			);
			expect(commandComplete?.totalLikes).toBe(0);
			expect(commandComplete?.totalDislikes).toBe(1);
			expect(commandComplete?.totalFeedback).toBe(1);
			expect(commandComplete?.netScore).toBe(-1); // 0 - 1
		});

		test("should sort by net score descending", () => {
			const repo = FeedbackRepository.getInstance();

			// Create feedback with different scores
			repo.saveFeedback("eval-1", "hash-1", "evaluator-a", "dislike"); // -1
			repo.saveFeedback("eval-2", "hash-2", "evaluator-b", "like"); // +1
			repo.saveFeedback("eval-3", "hash-3", "evaluator-b", "like"); // +2
			repo.saveFeedback("eval-4", "hash-4", "evaluator-c", "like"); // +1 (tie with b before second like)

			const aggregated = repo.getAggregatedFeedback();

			// evaluator-b has highest score (2)
			expect(aggregated[0]!.evaluatorName).toBe("evaluator-b");
			expect(aggregated[0]!.netScore).toBe(2);

			// evaluator-a has lowest score (-1)
			expect(aggregated[aggregated.length - 1]!.evaluatorName).toBe(
				"evaluator-a",
			);
			expect(aggregated[aggregated.length - 1]!.netScore).toBe(-1);
		});

		test("should calculate correct net score", () => {
			const repo = FeedbackRepository.getInstance();

			// 5 likes, 2 dislikes = net score of 3
			repo.saveFeedback("eval-1", "hash-1", "test-evaluator", "like");
			repo.saveFeedback("eval-2", "hash-2", "test-evaluator", "like");
			repo.saveFeedback("eval-3", "hash-3", "test-evaluator", "like");
			repo.saveFeedback("eval-4", "hash-4", "test-evaluator", "like");
			repo.saveFeedback("eval-5", "hash-5", "test-evaluator", "like");
			repo.saveFeedback("eval-6", "hash-6", "test-evaluator", "dislike");
			repo.saveFeedback("eval-7", "hash-7", "test-evaluator", "dislike");

			const aggregated = repo.getAggregatedFeedback();

			expect(aggregated).toHaveLength(1);
			expect(aggregated[0]!.totalLikes).toBe(5);
			expect(aggregated[0]!.totalDislikes).toBe(2);
			expect(aggregated[0]!.netScore).toBe(3);
			expect(aggregated[0]!.totalFeedback).toBe(7);
		});
	});
});
