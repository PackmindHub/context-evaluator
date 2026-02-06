import type { DailyRateLimiter } from "../rate-limiter";

/**
 * Configuration routes for feature flags
 */
export class ConfigRoutes {
	private enableAssessmentFeatures: boolean;
	private enableGroupSelect: boolean;
	private cloudMode: boolean;
	private rateLimiter: DailyRateLimiter;

	constructor(
		enableAssessmentFeatures = false,
		enableGroupSelect = false,
		cloudMode = false,
		rateLimiter: DailyRateLimiter,
	) {
		this.enableAssessmentFeatures = enableAssessmentFeatures;
		this.enableGroupSelect = enableGroupSelect;
		this.cloudMode = cloudMode;
		this.rateLimiter = rateLimiter;
	}

	/**
	 * GET /api/config - Get feature flag configuration
	 */
	async get(_req: Request): Promise<Response> {
		const rateLimitStats = this.rateLimiter.getStats();
		return new Response(
			JSON.stringify({
				assessmentEnabled: this.enableAssessmentFeatures,
				groupSelectEnabled: this.enableGroupSelect,
				cloudMode: this.cloudMode,
				dailyGitEvalLimit: rateLimitStats.limit,
				dailyGitEvalCount: rateLimitStats.count,
				dailyGitEvalRemaining: rateLimitStats.remaining,
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	/**
	 * Update feature flags (called by server initialization)
	 */
	setAssessmentEnabled(enabled: boolean): void {
		this.enableAssessmentFeatures = enabled;
	}

	setGroupSelectEnabled(enabled: boolean): void {
		this.enableGroupSelect = enabled;
	}

	setCloudMode(enabled: boolean): void {
		this.cloudMode = enabled;
	}
}
