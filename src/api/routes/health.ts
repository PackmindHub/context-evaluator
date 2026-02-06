import { VERSION } from "@shared/version";
import type { JobManager } from "../jobs/job-manager";

/**
 * Health check response
 */
interface IHealthResponse {
	status: "healthy" | "degraded" | "unhealthy";
	timestamp: string;
	uptime: number;
	version: string;
	jobs?: {
		total: number;
		active: number;
		queued: number;
		running: number;
		completed: number;
		failed: number;
	};
}

/**
 * Health routes
 */
export class HealthRoutes {
	private startTime = Date.now();

	constructor(private jobManager: JobManager) {}

	/**
	 * GET /api/health - Health check endpoint
	 */
	async get(_req: Request): Promise<Response> {
		try {
			const stats = this.jobManager.getStats();

			// Determine health status
			let status: "healthy" | "degraded" | "unhealthy" = "healthy";

			// Check if too many failed jobs
			const failureRate =
				stats.totalJobs > 0 ? stats.failedJobs / stats.totalJobs : 0;
			if (failureRate > 0.5 && stats.totalJobs >= 10) {
				status = "degraded";
			}

			// Check if all jobs are failing
			if (
				stats.totalJobs > 0 &&
				stats.failedJobs === stats.totalJobs &&
				stats.totalJobs >= 5
			) {
				status = "unhealthy";
			}

			const response: IHealthResponse = {
				status,
				timestamp: new Date().toISOString(),
				uptime: Date.now() - this.startTime,
				version: VERSION,
				jobs: {
					total: stats.totalJobs,
					active: stats.activeJobs,
					queued: stats.queuedJobs,
					running: stats.runningJobs,
					completed: stats.completedJobs,
					failed: stats.failedJobs,
				},
			};

			// Return appropriate status code
			const statusCode =
				status === "healthy" ? 200 : status === "degraded" ? 200 : 503;

			return new Response(JSON.stringify(response), {
				status: statusCode,
				headers: { "Content-Type": "application/json" },
			});
		} catch (err: unknown) {
			console.error("[HealthRoutes] Error in GET /api/health:", err);

			const response: IHealthResponse = {
				status: "unhealthy",
				timestamp: new Date().toISOString(),
				uptime: Date.now() - this.startTime,
				version: VERSION,
			};

			return new Response(JSON.stringify(response), {
				status: 503,
				headers: { "Content-Type": "application/json" },
			});
		}
	}
}
