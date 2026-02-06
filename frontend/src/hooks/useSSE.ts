import { useCallback, useEffect, useRef, useState } from "react";
import type { SSEEvent } from "../types/job";

interface IUseSSEOptions {
	url: string | null;
	onMessage: (event: SSEEvent) => void;
	onOpen?: () => void;
	onError?: (error: Event) => void;
}

interface IUseSSEReturn {
	isConnected: boolean;
	close: () => void;
}

/**
 * Hook for Server-Sent Events (SSE) connection
 *
 * Benefits over WebSocket:
 * - Built-in automatic reconnection
 * - Simpler protocol (standard HTTP)
 * - Better proxy/load balancer compatibility
 * - Perfect for unidirectional server → client communication
 */
export function useSSE(options: IUseSSEOptions): IUseSSEReturn {
	const { url, onMessage, onOpen, onError } = options;

	const [isConnected, setIsConnected] = useState(false);
	const eventSourceRef = useRef<EventSource | null>(null);
	const shouldConnectRef = useRef(true);
	// Track if onOpen has been called to prevent duplicate calls on reconnection
	const hasCalledOnOpenRef = useRef(false);

	// Store callbacks in refs to prevent reconnection on callback changes
	const onMessageRef = useRef(onMessage);
	const onOpenRef = useRef(onOpen);
	const onErrorRef = useRef(onError);

	// Update refs when callbacks change
	useEffect(() => {
		onMessageRef.current = onMessage;
	}, [onMessage]);

	useEffect(() => {
		onOpenRef.current = onOpen;
	}, [onOpen]);

	useEffect(() => {
		onErrorRef.current = onError;
	}, [onError]);

	// Store URL in ref for stable access
	const urlRef = useRef(url);
	useEffect(() => {
		urlRef.current = url;
	}, [url]);

	// Connect when URL changes
	useEffect(() => {
		if (!url) return;

		shouldConnectRef.current = true;
		// Reset onOpen tracking when URL changes (new connection)
		hasCalledOnOpenRef.current = false;

		// Clean up existing connection
		if (eventSourceRef.current) {
			eventSourceRef.current.close();
			eventSourceRef.current = null;
		}

		console.log("[SSE] Connecting to", url);
		const eventSource = new EventSource(url);

		eventSource.onopen = () => {
			console.log("[SSE] Connected to", url);
			setIsConnected(true);
			// Only call onOpen once per URL to prevent duplicate "Connected" logs on auto-reconnect
			if (!hasCalledOnOpenRef.current) {
				hasCalledOnOpenRef.current = true;
				onOpenRef.current?.();
			}
		};

		eventSource.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				// Handle both wrapped and direct event formats
				if (data.type) {
					onMessageRef.current(data as SSEEvent);
				}
			} catch (err) {
				console.error("[SSE] Failed to parse message:", err);
			}
		};

		eventSource.onerror = (error) => {
			console.error("[SSE] Error:", error);
			setIsConnected(false);
			// Only call onError if this was a user-initiated connection (not auto-reconnect)
			// EventSource auto-reconnects, so errors during reconnection are expected
			if (eventSource.readyState === EventSource.CLOSED) {
				onErrorRef.current?.(error);
			}
		};

		eventSourceRef.current = eventSource;

		return () => {
			console.log("[SSE] Cleanup for", url);
			shouldConnectRef.current = false;
			hasCalledOnOpenRef.current = false;
			if (eventSourceRef.current) {
				eventSourceRef.current.close();
				eventSourceRef.current = null;
			}
			setIsConnected(false);
		};
	}, [url]);

	const close = useCallback(() => {
		shouldConnectRef.current = false;
		hasCalledOnOpenRef.current = false;
		if (eventSourceRef.current) {
			eventSourceRef.current.close();
			eventSourceRef.current = null;
		}
		setIsConnected(false);
	}, []);

	return { isConnected, close };
}
