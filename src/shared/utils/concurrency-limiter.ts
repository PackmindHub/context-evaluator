/**
 * Concurrency limiter utility
 *
 * Provides controlled concurrent execution of async operations.
 * Extracted from runner.ts for reusability.
 */

import { concurrencyLogger } from "./logger";

/**
 * Run async operations with a concurrency limit
 *
 * @param items - Array of items to process
 * @param limit - Maximum concurrent operations
 * @param fn - Async function to run for each item
 * @returns Promise resolving to array of results (preserves order)
 *
 * @example
 * const urls = ['url1', 'url2', 'url3'];
 * const results = await runWithConcurrencyLimit(urls, 2, async (url, i) => {
 *   return await fetch(url);
 * });
 */
export async function runWithConcurrencyLimit<T, R>(
	items: T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let activeCount = 0;
	let currentIndex = 0;

	return new Promise((resolve) => {
		const runNext = () => {
			if (currentIndex >= items.length && activeCount === 0) {
				resolve(results);
				return;
			}

			while (activeCount < limit && currentIndex < items.length) {
				const index = currentIndex++;
				const item = items[index];

				// Validate item exists
				if (item === undefined) {
					concurrencyLogger.error(
						`Item at index ${index} is undefined, skipping`,
					);
					results[index] = new Error("Item undefined") as R;
					continue;
				}

				activeCount++;

				fn(item, index)
					.then((result) => {
						results[index] = result;
					})
					.catch((error) => {
						concurrencyLogger.error(`Task ${index} failed:`, error);
						results[index] = error;
					})
					.finally(() => {
						activeCount--;
						runNext();
					});
			}
		};

		runNext();
	});
}
