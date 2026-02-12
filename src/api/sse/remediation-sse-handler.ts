/**
 * SSE handler for remediation progress streaming.
 * Follows the same pattern as SSEProgressHandler for evaluations.
 */

import type { RemediationProgressEvent } from "@shared/types/remediation";
import type {
	RemediationJobManager,
	RemediationProgressCallback,
} from "../jobs/remediation-job-manager";

interface ISSEConnection {
	jobId: string;
	controller: ReadableStreamDefaultController<Uint8Array>;
	encoder: TextEncoder;
	closed: boolean;
	heartbeatInterval?: ReturnType<typeof setInterval>;
}

export class RemediationSSEHandler {
	private connections = new Map<string, Set<ISSEConnection>>();
	private jobCallbacks = new Map<string, RemediationProgressCallback>();
	private remediationJobManager: RemediationJobManager;

	constructor(remediationJobManager: RemediationJobManager) {
		this.remediationJobManager = remediationJobManager;
	}

	private closeConnection(connection: ISSEConnection): void {
		if (connection.closed) return;
		connection.closed = true;
		if (connection.heartbeatInterval) {
			clearInterval(connection.heartbeatInterval);
			connection.heartbeatInterval = undefined;
		}
		try {
			connection.controller.close();
		} catch {
			// ignore
		}
	}

	createSSEResponse(jobId: string): Response {
		const job = this.remediationJobManager.getJob(jobId);
		if (!job) {
			return new Response(
				JSON.stringify({ error: "Remediation job not found" }),
				{
					status: 404,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		const encoder = new TextEncoder();
		let connection: ISSEConnection;

		const stream = new ReadableStream<Uint8Array>({
			start: (controller) => {
				connection = { jobId, controller, encoder, closed: false };

				const isFirstConnection = !this.connections.has(jobId);
				if (isFirstConnection) {
					this.connections.set(jobId, new Set());
				}
				this.connections.get(jobId)!.add(connection);

				console.log(
					`[RemediationSSE] Connected for job ${jobId} (${this.connections.get(jobId)!.size} connections)`,
				);

				// Register one shared callback per jobId
				if (isFirstConnection) {
					const callback: RemediationProgressCallback = (jId, event) => {
						this.broadcastToJob(jId, event);
					};
					this.jobCallbacks.set(jobId, callback);
					this.remediationJobManager.onProgress(jobId, callback);
				}

				// Heartbeat every 15 seconds
				connection.heartbeatInterval = setInterval(() => {
					if (!connection.closed) {
						this.sendComment(connection, "heartbeat");
					}
				}, 15000);

				// Retry directive
				try {
					controller.enqueue(encoder.encode("retry: 10000\n\n"));
				} catch {
					// ignore
				}

				// Send initial status
				this.sendEvent(connection, {
					type: "connected",
					data: { jobId, status: job.status },
				});

				// If already completed, send result
				if (job.status === "completed" && job.result) {
					this.sendEvent(connection, {
						type: "remediation.completed",
						data: { jobId, result: job.result },
					});
				}
				if (job.status === "failed" && job.error) {
					this.sendEvent(connection, {
						type: "remediation.failed",
						data: { jobId, error: job.error },
					});
				}
			},
			cancel: () => {
				if (connection && !connection.closed) {
					this.closeConnection(connection);
					const conns = this.connections.get(jobId);
					if (conns) {
						conns.delete(connection);
						if (conns.size === 0) {
							const cb = this.jobCallbacks.get(jobId);
							if (cb) {
								this.remediationJobManager.offProgress(jobId, cb);
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

	private sendEvent(connection: ISSEConnection, data: unknown): void {
		if (connection.closed) return;
		try {
			const eventData = `data: ${JSON.stringify(data)}\n\n`;
			connection.controller.enqueue(connection.encoder.encode(eventData));
		} catch {
			this.closeConnection(connection);
		}
	}

	private sendComment(connection: ISSEConnection, comment: string): void {
		if (connection.closed) return;
		try {
			connection.controller.enqueue(
				connection.encoder.encode(`: ${comment}\n\n`),
			);
		} catch {
			this.closeConnection(connection);
		}
	}

	private broadcastToJob(jobId: string, event: RemediationProgressEvent): void {
		const conns = this.connections.get(jobId);
		if (!conns) return;
		for (const conn of conns) {
			this.sendEvent(conn, event);
		}
	}

	shutdown(): void {
		for (const [jobId, conns] of this.connections) {
			for (const conn of conns) {
				this.closeConnection(conn);
			}
			const cb = this.jobCallbacks.get(jobId);
			if (cb) {
				this.remediationJobManager.offProgress(jobId, cb);
			}
		}
		this.connections.clear();
		this.jobCallbacks.clear();
	}
}
