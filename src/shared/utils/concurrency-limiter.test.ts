import { describe, expect, test } from "bun:test";
import { runWithConcurrencyLimit } from "./concurrency-limiter";

describe("Concurrency Limiter", () => {
	describe("runWithConcurrencyLimit", () => {
		test("should process all items", async () => {
			const items = [1, 2, 3, 4, 5];
			const results = await runWithConcurrencyLimit(items, 2, async (item) => {
				return item * 2;
			});

			expect(results).toEqual([2, 4, 6, 8, 10]);
		});

		test("should preserve order", async () => {
			const items = [100, 50, 10, 200]; // Different delays
			const results = await runWithConcurrencyLimit(items, 4, async (item) => {
				// Simulate varying delays
				await new Promise((r) => setTimeout(r, item / 10));
				return item;
			});

			// Results should be in original order, not completion order
			expect(results).toEqual([100, 50, 10, 200]);
		});

		test("should respect concurrency limit", async () => {
			let maxConcurrent = 0;
			let currentConcurrent = 0;

			const items = Array.from({ length: 10 }, (_, i) => i);
			await runWithConcurrencyLimit(items, 3, async () => {
				currentConcurrent++;
				maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
				await new Promise((r) => setTimeout(r, 10));
				currentConcurrent--;
				return true;
			});

			expect(maxConcurrent).toBeLessThanOrEqual(3);
		});

		test("should handle empty array", async () => {
			const results = await runWithConcurrencyLimit([], 5, async () => true);
			expect(results).toEqual([]);
		});

		test("should handle single item", async () => {
			const results = await runWithConcurrencyLimit(
				["single"],
				3,
				async (item) => item.toUpperCase(),
			);
			expect(results).toEqual(["SINGLE"]);
		});

		test("should handle limit of 1 (sequential)", async () => {
			let maxConcurrent = 0;
			let currentConcurrent = 0;

			const items = [1, 2, 3];
			await runWithConcurrencyLimit(items, 1, async () => {
				currentConcurrent++;
				maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
				await new Promise((r) => setTimeout(r, 5));
				currentConcurrent--;
				return true;
			});

			expect(maxConcurrent).toBe(1);
		});

		test("should pass index to callback", async () => {
			const items = ["a", "b", "c"];
			const indices: number[] = [];

			await runWithConcurrencyLimit(items, 2, async (_, index) => {
				indices.push(index);
				return true;
			});

			expect(indices.sort()).toEqual([0, 1, 2]);
		});

		test("should handle errors without stopping other tasks", async () => {
			const items = [1, 2, 3, 4, 5];
			const results = await runWithConcurrencyLimit(items, 2, async (item) => {
				if (item === 3) {
					throw new Error("Item 3 failed");
				}
				return item * 2;
			});

			// Successful items should have results
			expect(results[0]).toBe(2);
			expect(results[1]).toBe(4);
			// Error items should have error object
			expect(results[2]).toBeInstanceOf(Error);
			expect(results[3]).toBe(8);
			expect(results[4]).toBe(10);
		});

		test("should handle all items throwing errors", async () => {
			const items = [1, 2, 3];
			const results = await runWithConcurrencyLimit(items, 2, async () => {
				throw new Error("All fail");
			});

			expect(results.every((r) => (r as unknown) instanceof Error)).toBe(true);
		});

		test("should handle limit larger than items count", async () => {
			const items = [1, 2];
			const results = await runWithConcurrencyLimit(
				items,
				100,
				async (item) => item,
			);
			expect(results).toEqual([1, 2]);
		});
	});
});
