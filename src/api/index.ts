import { apiServerLogger } from "@shared/utils/logger";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { hasEmbeddedAssets, hasEmbeddedPrompts } from "../embedded";
import { BatchManager } from "./jobs/batch-manager";
import { JobManager } from "./jobs/job-manager";
import {
	addCorsHeaders,
	DEFAULT_CORS_HEADERS,
	handleCors,
} from "./middleware/cors";
import { DailyRateLimiter } from "./rate-limiter";
import { BookmarkRoutes } from "./routes/bookmark";
import { ConfigRoutes } from "./routes/config";
import { EvaluationRoutes } from "./routes/evaluation";
import { FeedbackRoutes } from "./routes/feedback";
import { HealthRoutes } from "./routes/health";
import { IssuesRoutes } from "./routes/issues";
import { ProviderRoutes } from "./routes/providers";
import { SSEProgressHandler } from "./sse/progress-handler";
import { serveStaticFile } from "./static/static-file-server";
import { getEvaluatorById, getEvaluators } from "./utils/evaluator-utils";
import {
	internalErrorResponse,
	notFoundResponse,
	okResponse,
} from "./utils/response-builder";

// Get the directory where evaluator prompts are stored (file-based fallback)
const __dirname = dirname(fileURLToPath(import.meta.url));
const EVALUATORS_DIR = resolve(__dirname, "../../prompts/evaluators");

// Check embedded mode at startup
const EMBEDDED_MODE = hasEmbeddedAssets() && hasEmbeddedPrompts();
if (EMBEDDED_MODE) {
	apiServerLogger.log("📦 Running in embedded mode (single binary)");
}

/**
 * API Server configuration
 */
interface IAPIServerConfig {
	port?: number;
	hostname?: string;
	maxConcurrentJobs?: number;
	maxQueueSize?: number;
	enableAssessmentFeatures?: boolean;
	enableGroupSelect?: boolean;
	cloudMode?: boolean;
	dailyGitEvalLimit?: number;
}

/**
 * API Server - Main entry point for web application mode
 *
 * Features:
 * - RESTful API for job management
 * - SSE (Server-Sent Events) for real-time progress updates
 * - Static file serving for frontend
 * - Health monitoring
 */
export class APIServer {
	private jobManager: JobManager;
	private sseHandler: SSEProgressHandler;
	private evaluationRoutes: EvaluationRoutes;
	private feedbackRoutes: FeedbackRoutes;
	private bookmarkRoutes: BookmarkRoutes;
	private healthRoutes: HealthRoutes;
	private issuesRoutes: IssuesRoutes;
	private configRoutes: ConfigRoutes;
	private providerRoutes: ProviderRoutes;
	private rateLimiter: DailyRateLimiter;
	private server?: ReturnType<typeof Bun.serve>;

	constructor(config: IAPIServerConfig = {}) {
		const cloudMode = config.cloudMode ?? false;
		this.rateLimiter = new DailyRateLimiter(config.dailyGitEvalLimit ?? 50);
		this.jobManager = new JobManager({
			maxConcurrentJobs: config.maxConcurrentJobs ?? 2,
			maxQueueSize: config.maxQueueSize ?? 20,
		});
		this.sseHandler = new SSEProgressHandler(this.jobManager);
		const batchManager = cloudMode
			? null
			: new BatchManager(this.jobManager, this.rateLimiter);
		this.evaluationRoutes = new EvaluationRoutes(
			this.jobManager,
			cloudMode,
			this.rateLimiter,
			batchManager,
		);
		this.feedbackRoutes = new FeedbackRoutes();
		this.bookmarkRoutes = new BookmarkRoutes();
		this.issuesRoutes = new IssuesRoutes();
		this.healthRoutes = new HealthRoutes(this.jobManager);
		this.configRoutes = new ConfigRoutes(
			config.enableAssessmentFeatures ?? false,
			config.enableGroupSelect ?? false,
			cloudMode,
			this.rateLimiter,
		);
		this.providerRoutes = new ProviderRoutes(cloudMode);
	}

	/**
	 * Start the server
	 */
	async start(config: IAPIServerConfig = {}): Promise<void> {
		const port = config.port ?? 3001;
		const hostname = config.hostname ?? "localhost";

		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const apiServer = this;

		this.server = Bun.serve({
			port,
			hostname,
			development: true,
			idleTimeout: 255, // Max allowed by Bun (255 seconds) for long-running evaluations and SSE

			async fetch(req: Request): Promise<Response> {
				const url = new URL(req.url);
				const path = url.pathname;

				apiServerLogger.log(`${req.method} ${path}`);

				// Handle CORS preflight
				const corsResponse = handleCors(req);
				if (corsResponse) {
					return corsResponse;
				}

				// API routes
				if (path.startsWith("/api/")) {
					const response = await apiServer.handleApiRoute(req, path);
					return addCorsHeaders(response, DEFAULT_CORS_HEADERS);
				}

				// Serve frontend files
				return apiServer.handleStaticFile(path);
			},
		});

		apiServerLogger.log(`\n🚀 API Server started successfully!`);
		apiServerLogger.log(`   - URL: http://${hostname}:${port}`);
		apiServerLogger.log(`   - Health: http://${hostname}:${port}/api/health`);
		apiServerLogger.log(
			`   - Evaluate: POST http://${hostname}:${port}/api/evaluate`,
		);
		apiServerLogger.log(
			`   - Progress (SSE): http://${hostname}:${port}/api/evaluate/:jobId/progress`,
		);
		apiServerLogger.log(`\n📊 Server ready to accept connections.\n`);
	}

	/**
	 * Handle API routes
	 */
	private async handleApiRoute(req: Request, path: string): Promise<Response> {
		// Health check
		if (path === "/api/health") {
			return this.healthRoutes.get(req);
		}

		// Config endpoint
		if (path === "/api/config" && req.method === "GET") {
			return this.configRoutes.get(req);
		}

		// Provider detection endpoint
		if (path === "/api/providers/detect" && req.method === "GET") {
			return this.providerRoutes.detect(req);
		}

		// Batch evaluation routes (must match before /api/evaluate/:id)
		if (path === "/api/evaluate/batch" && req.method === "POST") {
			return this.evaluationRoutes.postBatch(req);
		}
		if (path.match(/^\/api\/evaluate\/batch\/[^/]+$/) && req.method === "GET") {
			const batchId = path.split("/").pop()!;
			return this.evaluationRoutes.getBatchStatus(req, batchId);
		}

		// Evaluation routes
		if (path === "/api/evaluate" && req.method === "POST") {
			return this.evaluationRoutes.post(req);
		}
		if (path === "/api/evaluate" && req.method === "GET") {
			return this.evaluationRoutes.list(req);
		}
		if (path.match(/^\/api\/evaluate\/[^/]+$/)) {
			const jobId = path.split("/").pop()!;
			if (req.method === "GET") {
				return this.evaluationRoutes.get(req, jobId);
			}
			return notFoundResponse("Method not allowed", "METHOD_NOT_ALLOWED");
		}

		// SSE endpoint for progress
		if (path.match(/^\/api\/evaluate\/[^/]+\/progress$/)) {
			const jobId = path.split("/")[3]!;
			return this.sseHandler.createSSEResponse(jobId);
		}

		// Evaluator templates
		if (path === "/api/evaluators" && req.method === "GET") {
			return this.handleGetEvaluators();
		}
		if (path.match(/^\/api\/evaluators\/[^/]+$/) && req.method === "GET") {
			const evaluatorId = path.split("/").pop()!;
			return this.handleGetEvaluator(evaluatorId);
		}

		// Evaluation history routes
		if (path === "/api/evaluations") {
			if (req.method === "GET") {
				return this.evaluationRoutes.listHistory(req);
			}
			if (req.method === "DELETE") {
				return this.evaluationRoutes.deleteAllHistoryItems(req);
			}
			return notFoundResponse("Method not allowed", "METHOD_NOT_ALLOWED");
		}
		if (
			path.match(/^\/api\/evaluations\/[^/]+\/prompts$/) &&
			req.method === "GET"
		) {
			const evaluationId = path.split("/")[3]!;
			return this.evaluationRoutes.getEvaluationPrompts(req, evaluationId);
		}
		if (path.match(/^\/api\/evaluations\/[^/]+$/)) {
			const evaluationId = path.split("/").pop()!;
			if (req.method === "GET") {
				return this.evaluationRoutes.getHistoryItem(req, evaluationId);
			}
			if (req.method === "DELETE") {
				return this.evaluationRoutes.deleteHistoryItem(req, evaluationId);
			}
			return notFoundResponse("Method not allowed", "METHOD_NOT_ALLOWED");
		}

		// Feedback routes
		if (path === "/api/feedback" && req.method === "POST") {
			return this.feedbackRoutes.post(req);
		}
		if (path === "/api/feedback" && req.method === "DELETE") {
			return this.feedbackRoutes.delete(req);
		}
		if (path === "/api/feedback/aggregate" && req.method === "GET") {
			return this.feedbackRoutes.getAggregate(req);
		}
		if (path.match(/^\/api\/feedback\/evaluation\/[^/]+$/)) {
			const evaluationId = path.split("/").pop()!;
			return this.feedbackRoutes.getForEvaluation(req, evaluationId);
		}

		// Aggregated issues routes
		if (path === "/api/issues" && req.method === "GET") {
			return this.issuesRoutes.list(req);
		}

		// Bookmark routes
		if (path === "/api/bookmarks" && req.method === "POST") {
			return this.bookmarkRoutes.post(req);
		}
		if (path === "/api/bookmarks" && req.method === "DELETE") {
			return this.bookmarkRoutes.delete(req);
		}
		if (path.match(/^\/api\/bookmarks\/evaluation\/[^/]+$/)) {
			const evaluationId = path.split("/").pop()!;
			return this.bookmarkRoutes.getForEvaluation(req, evaluationId);
		}

		return notFoundResponse("Not found");
	}

	/**
	 * Handle GET /api/evaluators
	 */
	private async handleGetEvaluators(): Promise<Response> {
		try {
			const evaluators = await getEvaluators(EVALUATORS_DIR);
			return okResponse({ evaluators });
		} catch {
			return internalErrorResponse("Failed to load evaluators");
		}
	}

	/**
	 * Handle GET /api/evaluators/:id
	 */
	private async handleGetEvaluator(evaluatorId: string): Promise<Response> {
		try {
			const evaluator = await getEvaluatorById(evaluatorId, EVALUATORS_DIR);
			if (evaluator) {
				return okResponse(evaluator);
			}
			return notFoundResponse("Evaluator not found");
		} catch {
			return internalErrorResponse("Failed to load evaluator template");
		}
	}

	/**
	 * Handle static file serving
	 */
	private async handleStaticFile(path: string): Promise<Response> {
		try {
			return await serveStaticFile(path);
		} catch (error) {
			apiServerLogger.error("Error serving static file:", error);
			return new Response("Internal server error", { status: 500 });
		}
	}

	/**
	 * Stop the server
	 */
	async stop(): Promise<void> {
		apiServerLogger.log("\n🛑 Shutting down API server...");

		this.sseHandler.shutdown();
		this.jobManager.shutdown();

		if (this.server) {
			this.server.stop();
		}

		apiServerLogger.log("✓ API server stopped.\n");
	}

	/**
	 * Get server statistics
	 */
	getStats() {
		return {
			jobs: this.jobManager.getStats(),
			sse: {
				total: this.sseHandler.getTotalConnectionCount(),
			},
		};
	}
}

/**
 * Start the API server (called from src/index.ts)
 */
export async function startAPIServer(
	config: IAPIServerConfig = {},
): Promise<APIServer> {
	const server = new APIServer(config);
	await server.start(config);

	// Handle graceful shutdown
	process.on("SIGINT", async () => {
		await server.stop();
		process.exit(0);
	});

	process.on("SIGTERM", async () => {
		await server.stop();
		process.exit(0);
	});

	return server;
}
