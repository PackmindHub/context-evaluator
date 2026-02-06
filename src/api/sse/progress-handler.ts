import type { ProgressEvent } from "@shared/types/evaluation";
import type { JobManager, JobProgressCallback } from "../jobs/job-manager";

/**
 * SSE Connection wrapper
 */
interface ISSEConnection {
	jobId: string;
	controller: ReadableStreamDefaultController<Uint8Array>;
	encoder: TextEncoder;
	closed: boolean;
	heartbeatInterval?: ReturnType<typeof setInterval>;
}

/**
 * SSE Progress Handler - Manages Server-Sent Events connections for job progress updates
 *
 * Benefits over WebSocket:
 * - Simpler protocol (standard HTTP)
 * - Built-in reconnection in EventSource API
 * - Better proxy/load balancer compatibility
 * - Unidirectional (server → client) which matches our use case
 *
 * IMPORTANT: Only ONE callback is registered per jobId to prevent duplicate events.
 * When multiple SSE connections exist for the same job (due to reconnections),
 * each would register its own callback that broadcasts to ALL connections,
 * causing N² event delivery. We track one shared callback per jobId instead.
 */
export class SSEProgressHandler {
	private connections = new Map<string, Set<ISSEConnection>>();
	private jobCallbacks = new Map<string, JobProgressCallback>();
	private jobManager: JobManager;

	constructor(jobManager: JobManager) {
		this.jobManager = jobManager;
	}

	/**
	 * Close a connection and clean up resources
	 */
	private closeConnection(connection: ISSEConnection): void {
		if (connection.closed) return;

		connection.closed = true;

		// Clear heartbeat interval
		if (connection.heartbeatInterval) {
			clearInterval(connection.heartbeatInterval);
			connection.heartbeatInterval = undefined;
		}

		// Close controller
		try {
			connection.controller.close();
		} catch {
			// Ignore close errors
		}
	}

	/**
	 * Create SSE response for a job
	 */
	createSSEResponse(jobId: string): Response {
		const job = this.jobManager.getJob(jobId);

		if (!job) {
			return new Response(JSON.stringify({ error: "Job not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}

		const encoder = new TextEncoder();
		let connection: ISSEConnection;

		const stream = new ReadableStream<Uint8Array>({
			start: (controller) => {
				connection = {
					jobId,
					controller,
					encoder,
					closed: false,
				};

				// Check if this is the first connection for this job
				const isFirstConnection = !this.connections.has(jobId);

				// Track connection
				if (isFirstConnection) {
					this.connections.set(jobId, new Set());
				}
				this.connections.get(jobId)!.add(connection);

				console.log(
					`[SSEProgressHandler] SSE connected for job ${jobId} (connections: ${this.connections.get(jobId)!.size})`,
				);

				// Only register ONE callback per jobId to prevent duplicate events
				// Multiple connections share the same callback via broadcastToJob
				if (isFirstConnection) {
					const callback: JobProgressCallback = (jId, event) => {
						this.broadcastToJob(jId, event);
					};
					this.jobCallbacks.set(jobId, callback);
					this.jobManager.onProgress(jobId, callback);
				}

				// Start heartbeat to keep connection alive (every 15 seconds)
				connection.heartbeatInterval = setInterval(() => {
					if (!connection.closed) {
						this.sendComment(connection, "heartbeat");
					}
				}, 15000);

				// Send retry directive (10 seconds) to slow down automatic reconnection
				try {
					const retryData = `retry: 10000\n\n`;
					connection.controller.enqueue(connection.encoder.encode(retryData));
				} catch {
					// Ignore
				}

				// Send initial connection event
				this.sendEvent(connection, {
					type: "connected",
					data: { jobId },
				});

				// Send current job status
				if (job) {
					this.sendEvent(connection, {
						type: "job.status",
						data: {
							status: job.status,
							progress: job.progress,
							createdAt: job.createdAt,
							startedAt: job.startedAt,
							updatedAt: job.updatedAt,
						},
					});

					// If job already completed, send result
					if (job.status === "completed" && job.result) {
						this.sendEvent(connection, {
							type: "job.completed",
							data: {
								jobId,
								result: job.result,
								duration: job.completedAt
									? job.completedAt.getTime() - job.createdAt.getTime()
									: 0,
							},
						});
					}

					// If job failed, send error
					if (job.status === "failed" && job.error) {
						this.sendEvent(connection, {
							type: "job.failed",
							data: { jobId, error: job.error },
						});
					}
				}
			},

			cancel: () => {
				if (connection && !connection.closed) {
					this.closeConnection(connection); // Use helper

					// Remove connection from set
					const connections = this.connections.get(jobId);
					if (connections) {
						connections.delete(connection);
						console.log(
							`[SSEProgressHandler] SSE disconnected for job ${jobId} (remaining: ${connections.size})`,
						);

						// Only unregister callback when NO connections remain for this job
						if (connections.size === 0) {
							const callback = this.jobCallbacks.get(jobId);
							if (callback) {
								this.jobManager.offProgress(jobId, callback);
								this.jobCallbacks.delete(jobId);
							}
							this.connections.delete(jobId);
						}
					}
				}
			},
		});

		return new Response(stream, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
				"Access-Control-Allow-Origin": "*",
			},
		});
	}

	/**
	 * Send SSE event to a connection
	 */
	private sendEvent(connection: ISSEConnection, data: unknown): void {
		if (connection.closed) return;

		try {
			const eventData = `data: ${JSON.stringify(data)}\n\n`;
			connection.controller.enqueue(connection.encoder.encode(eventData));
		} catch (error) {
			console.error(`[SSEProgressHandler] Error sending event:`, error);
			this.closeConnection(connection); // Use helper instead of just setting closed = true
		}
	}

	/**
	 * Send SSE comment (for keep-alive)
	 */
	private sendComment(connection: ISSEConnection, comment: string): void {
		if (connection.closed) return;

		try {
			const commentData = `: ${comment}\n\n`;
			connection.controller.enqueue(connection.encoder.encode(commentData));
		} catch {
			this.closeConnection(connection); // Use helper
		}
	}

	/**
	 * Broadcast progress event to all connections for a job
	 */
	private broadcastToJob(jobId: string, event: ProgressEvent): void {
		const connections = this.connections.get(jobId);
		if (!connections || connections.size === 0) return;

		for (const connection of connections) {
			this.sendEvent(connection, event);
		}
	}

	/**
	 * Get connection count for a job
	 */
	getConnectionCount(jobId: string): number {
		return this.connections.get(jobId)?.size ?? 0;
	}

	/**
	 * Get total connection count
	 */
	getTotalConnectionCount(): number {
		let total = 0;
		for (const connections of this.connections.values()) {
			total += connections.size;
		}
		return total;
	}

	/**
	 * Close all connections for a job
	 */
	closeJob(jobId: string): void {
		const connections = this.connections.get(jobId);
		if (!connections) return;

		for (const connection of connections) {
			if (!connection.closed) {
				connection.closed = true;
				// Clear heartbeat interval
				if (connection.heartbeatInterval) {
					clearInterval(connection.heartbeatInterval);
				}
				try {
					connection.controller.close();
				} catch {
					// Ignore close errors
				}
			}
		}

		// Clean up the shared callback for this job
		const callback = this.jobCallbacks.get(jobId);
		if (callback) {
			this.jobManager.offProgress(jobId, callback);
			this.jobCallbacks.delete(jobId);
		}

		this.connections.delete(jobId);
	}

	/**
	 * Shutdown handler and close all connections
	 */
	shutdown(): void {
		for (const [jobId] of this.connections.entries()) {
			this.closeJob(jobId);
		}
		this.connections.clear();
	}
}
