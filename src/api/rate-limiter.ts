/**
 * Daily rate limiter for Git URL evaluations
 *
 * Tracks the number of Git URL evaluations per day and enforces a configurable limit.
 * Resets automatically at midnight UTC.
 */
export class DailyRateLimiter {
	private count: number = 0;
	private currentDate: string; // UTC date string YYYY-MM-DD
	private limit: number;

	constructor(limit: number = 50) {
		this.limit = limit;
		this.currentDate = this.getUTCDateString();
	}

	private getUTCDateString(): string {
		return new Date().toISOString().split("T")[0]!;
	}

	private resetIfNewDay(): void {
		const today = this.getUTCDateString();
		if (today !== this.currentDate) {
			this.count = 0;
			this.currentDate = today;
		}
	}

	canAccept(): boolean {
		this.resetIfNewDay();
		return this.count < this.limit;
	}

	increment(): void {
		this.resetIfNewDay();
		this.count++;
	}

	getStats(): { count: number; limit: number; remaining: number } {
		this.resetIfNewDay();
		return {
			count: this.count,
			limit: this.limit,
			remaining: Math.max(0, this.limit - this.count),
		};
	}
}
