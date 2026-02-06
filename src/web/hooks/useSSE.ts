import type { ProgressEvent } from "@shared/types/evaluation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * SSE connection state
 */
export type SSEState = "connecting" | "connected" | "disconnected" | "error";

/**
 * SSE hook options
 */
interface IUseSSEOptions {
	onMessage?: (event: ProgressEvent) => void;
	onError?: (error: Error) => void;
	onOpen?: () => void;
}

/**
 * SSE hook return value
 */
interface IUseSSEReturn {
	state: SSEState;
	error: Error | null;
	close: () => void;
}

/**
 * Custom hook for Server-Sent Events (SSE) connection management
 *
 * Benefits over WebSocket:
 * - Built-in automatic reconnection
 * - Simpler protocol (standard HTTP)
 * - Better proxy/load balancer compatibility
 * - Perfect for unidirectional server → client communication
 */
export function useSSE(
	url: string | null,
	options: IUseSSEOptions = {},
): IUseSSEReturn {
	const { onMessage, onError, onOpen } = options;

	const [state, setState] = useState<SSEState>("disconnected");
	const [error, setError] = useState<Error | null>(null);

	const eventSourceRef = useRef<EventSource | null>(null);
	const shouldConnectRef = useRef(true);

	/**
	 * Connect to SSE endpoint
	 */
	const connect = useCallback(() => {
		if (!url) return;

		setState("connecting");
		setError(null);

		try {
			const eventSource = new EventSource(url);

			eventSource.onopen = () => {
				console.log("[SSE] Connected");
				setState("connected");
				onOpen?.();
			};

			eventSource.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data);
					// Handle progress events
					if (data.type) {
						onMessage?.(data as ProgressEvent);
					}
				} catch (err) {
					console.error("[SSE] Error parsing message:", err);
				}
			};

			eventSource.onerror = (event) => {
				console.error("[SSE] Error:", event);
				const err = new Error("SSE connection error");
				setError(err);
				setState("error");
				onError?.(err);

				// EventSource automatically reconnects, but if closed we clean up
				if (eventSource.readyState === EventSource.CLOSED) {
					setState("disconnected");
				}
			};

			eventSourceRef.current = eventSource;
		} catch (err) {
			console.error("[SSE] Connection error:", err);
			const error = err instanceof Error ? err : new Error("Failed to connect");
			setError(error);
			setState("error");
			onError?.(error);
		}
	}, [url, onMessage, onError, onOpen]);

	/**
	 * Close SSE connection
	 */
	const close = useCallback(() => {
		shouldConnectRef.current = false;

		if (eventSourceRef.current) {
			eventSourceRef.current.close();
			eventSourceRef.current = null;
		}
		setState("disconnected");
	}, []);

	/**
	 * Connect on mount, cleanup on unmount
	 */
	useEffect(() => {
		if (url) {
			shouldConnectRef.current = true;
			// eslint-disable-next-line react-hooks/set-state-in-effect
			connect();
		}

		return () => {
			shouldConnectRef.current = false;

			if (eventSourceRef.current) {
				eventSourceRef.current.close();
				eventSourceRef.current = null;
			}
		};
	}, [url, connect]);

	return {
		state,
		error,
		close,
	};
}
