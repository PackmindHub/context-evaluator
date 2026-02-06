import { beforeEach, describe, expect, test } from "bun:test";
import { DailyRateLimiter } from "../rate-limiter";
import { BatchManager } from "./batch-manager";

// Create a mock JobManager with controllable behavior
function createMockJobManager() {
	let jobCounter = 0;
	const finishedCallbacks: Array<
		(jobId: string, status: "completed" | "failed") => void
	> = [];
	const submittedJobs: Array<{ jobId: string; url: string }> = [];
	const jobs = new Map<string, { id: string; status: string }>();

	return {
		mock: {
			get submittedJobs() {
				return submittedJobs;
			},
			get finishedCallbacks() {
				return finishedCallbacks;
			},
			simulateJobFinished(jobId: string, status: "completed" | "failed") {
				const job = jobs.get(jobId);
				if (job) {
					job.status = status;
				}
				for (const cb of finishedCallbacks) {
					cb(jobId, status);
				}
			},
		},
		submitJob: async (request: { repositoryUrl?: string }) => {
			jobCounter++;
			const jobId = `job-${jobCounter}`;
			submittedJobs.push({ jobId, url: request.repositoryUrl || "" });
			jobs.set(jobId, { id: jobId, status: "queued" });
			return jobId;
		},
		getJob: (id: string) => jobs.get(id) || undefined,
		getAllJobs: () => Array.from(jobs.values()),
		getActiveJobs: () =>
			Array.from(jobs.values()).filter(
				(j) => j.status === "queued" || j.status === "running",
			),
		onJobFinished: (
			callback: (jobId: string, status: "completed" | "failed") => void,
		) => {
			finishedCallbacks.push(callback);
		},
	};
}

describe("BatchManager", () => {
	let mockJobManager: ReturnType<typeof createMockJobManager>;
	let rateLimiter: DailyRateLimiter;
	let batchManager: BatchManager;

	beforeEach(() => {
		mockJobManager = createMockJobManager();
		rateLimiter = new DailyRateLimiter(50);
		batchManager = new BatchManager(
			mockJobManager as any,
			rateLimiter,
		);
	});

	describe("createBatch", () => {
		test("should create batch with valid URLs", async () => {
			const urls = [
				"https://github.com/owner/repo1",
				"https://github.com/owner/repo2",
				"https://github.com/owner/repo3",
			];

			const batch = await batchManager.createBatch(urls);

			expect(batch.id).toBeTruthy();
			expect(batch.entries).toHaveLength(3);
			// First URL should be submitted (queued), rest should be pending
			expect(batch.entries[0].status).toBe("queued");
			expect(batch.entries[1].status).toBe("pending");
			expect(batch.entries[2].status).toBe("pending");
		});

		test("should only submit first URL (sequential processing)", async () => {
			const urls = [
				"https://github.com/owner/repo1",
				"https://github.com/owner/repo2",
				"https://github.com/owner/repo3",
			];

			await batchManager.createBatch(urls);

			// Only one job should have been submitted
			expect(mockJobManager.mock.submittedJobs).toHaveLength(1);
			expect(mockJobManager.mock.submittedJobs[0].url).toBe(
				"https://github.com/owner/repo1",
			);
		});

		test("should reject empty URL list", async () => {
			await expect(batchManager.createBatch([])).rejects.toThrow(
				"At least one URL is required",
			);
		});

		test("should reject more than 50 URLs", async () => {
			const urls = Array.from(
				{ length: 51 },
				(_, i) => `https://github.com/owner/repo${i}`,
			);
			await expect(batchManager.createBatch(urls)).rejects.toThrow(
				"Maximum 50 URLs per batch",
			);
		});

		test("should reject invalid URLs", async () => {
			const urls = [
				"https://github.com/owner/repo1",
				"not-a-valid-url",
				"also-invalid",
			];
			await expect(batchManager.createBatch(urls)).rejects.toThrow(
				"Invalid Git URLs",
			);
		});

		test("should reject when rate limit insufficient", async () => {
			const limitedRateLimiter = new DailyRateLimiter(2);
			const limitedBatchManager = new BatchManager(
				mockJobManager as any,
				limitedRateLimiter,
			);

			const urls = [
				"https://github.com/owner/repo1",
				"https://github.com/owner/repo2",
				"https://github.com/owner/repo3",
			];

			await expect(
				limitedBatchManager.createBatch(urls),
			).rejects.toThrow("Daily rate limit insufficient");
		});

		test("should increment rate limiter on job submission", async () => {
			const urls = ["https://github.com/owner/repo1"];
			await batchManager.createBatch(urls);

			const stats = rateLimiter.getStats();
			expect(stats.count).toBe(1);
		});
	});

	describe("sequential processing", () => {
		test("should submit next URL when current job completes", async () => {
			const urls = [
				"https://github.com/owner/repo1",
				"https://github.com/owner/repo2",
				"https://github.com/owner/repo3",
			];

			const batch = await batchManager.createBatch(urls);

			// First job submitted
			expect(mockJobManager.mock.submittedJobs).toHaveLength(1);
			const firstJobId = batch.entries[0].jobId;

			// Simulate first job completing
			mockJobManager.mock.simulateJobFinished(firstJobId, "completed");

			// Wait for async submitNext
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Second job should now be submitted
			expect(mockJobManager.mock.submittedJobs).toHaveLength(2);
			expect(mockJobManager.mock.submittedJobs[1].url).toBe(
				"https://github.com/owner/repo2",
			);
		});

		test("should continue after a failed job", async () => {
			const urls = [
				"https://github.com/owner/repo1",
				"https://github.com/owner/repo2",
			];

			const batch = await batchManager.createBatch(urls);
			const firstJobId = batch.entries[0].jobId;

			// Simulate first job failing
			mockJobManager.mock.simulateJobFinished(firstJobId, "failed");

			// Wait for async submitNext
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Second job should still be submitted
			expect(mockJobManager.mock.submittedJobs).toHaveLength(2);
		});

		test("should process all URLs to completion", async () => {
			const urls = [
				"https://github.com/owner/repo1",
				"https://github.com/owner/repo2",
				"https://github.com/owner/repo3",
			];

			const batch = await batchManager.createBatch(urls);

			// Process all three sequentially
			for (let i = 0; i < 3; i++) {
				const jobId = batch.entries[i].jobId;
				mockJobManager.mock.simulateJobFinished(jobId, "completed");
				await new Promise((resolve) => setTimeout(resolve, 10));
			}

			// All three should have been submitted
			expect(mockJobManager.mock.submittedJobs).toHaveLength(3);
		});
	});

	describe("getBatchStatus", () => {
		test("should return undefined for unknown batch", () => {
			expect(batchManager.getBatchStatus("unknown")).toBeUndefined();
		});

		test("should return correct status counts", async () => {
			const urls = [
				"https://github.com/owner/repo1",
				"https://github.com/owner/repo2",
				"https://github.com/owner/repo3",
			];

			const batch = await batchManager.createBatch(urls);
			const status = batchManager.getBatchStatus(batch.id);

			expect(status).toBeTruthy();
			expect(status!.totalUrls).toBe(3);
			expect(status!.pending).toBe(2);
			expect(status!.isFinished).toBe(false);
		});

		test("should report isFinished when all done", async () => {
			const urls = ["https://github.com/owner/repo1"];

			const batch = await batchManager.createBatch(urls);
			const firstJobId = batch.entries[0].jobId;

			// Complete the only job
			mockJobManager.mock.simulateJobFinished(firstJobId, "completed");
			await new Promise((resolve) => setTimeout(resolve, 10));

			const status = batchManager.getBatchStatus(batch.id);
			expect(status!.isFinished).toBe(true);
			expect(status!.completed).toBe(1);
		});

		test("should count failures in finished check", async () => {
			const urls = [
				"https://github.com/owner/repo1",
				"https://github.com/owner/repo2",
			];

			const batch = await batchManager.createBatch(urls);

			// Fail first, complete second
			mockJobManager.mock.simulateJobFinished(
				batch.entries[0].jobId,
				"failed",
			);
			await new Promise((resolve) => setTimeout(resolve, 10));
			mockJobManager.mock.simulateJobFinished(
				batch.entries[1].jobId,
				"completed",
			);
			await new Promise((resolve) => setTimeout(resolve, 10));

			const status = batchManager.getBatchStatus(batch.id);
			expect(status!.isFinished).toBe(true);
			expect(status!.completed).toBe(1);
			expect(status!.failed).toBe(1);
		});
	});

	describe("getBatch", () => {
		test("should return batch record by ID", async () => {
			const urls = ["https://github.com/owner/repo1"];
			const batch = await batchManager.createBatch(urls);

			const retrieved = batchManager.getBatch(batch.id);
			expect(retrieved).toBeTruthy();
			expect(retrieved!.id).toBe(batch.id);
		});

		test("should return undefined for unknown ID", () => {
			expect(batchManager.getBatch("unknown")).toBeUndefined();
		});
	});
});
