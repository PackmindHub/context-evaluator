/**
 * CORS middleware utilities for API responses
 */

/**
 * Default CORS headers for API responses
 */
export const DEFAULT_CORS_HEADERS: Record<string, string> = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * Create a CORS preflight response (204 No Content)
 */
export function createPreflightResponse(
	headers: Record<string, string> = DEFAULT_CORS_HEADERS,
): Response {
	return new Response(null, {
		status: 204,
		headers,
	});
}

/**
 * Check if a request is a CORS preflight request
 */
export function isPreflightRequest(req: Request): boolean {
	return req.method === "OPTIONS";
}

/**
 * Add CORS headers to an existing response
 * Returns a new Response with CORS headers merged
 */
export function addCorsHeaders(
	response: Response,
	corsHeaders: Record<string, string> = DEFAULT_CORS_HEADERS,
): Response {
	const headers = new Headers(response.headers);
	for (const [key, value] of Object.entries(corsHeaders)) {
		headers.set(key, value);
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

/**
 * Handle CORS for a request - returns preflight response or null
 */
export function handleCors(
	req: Request,
	corsHeaders: Record<string, string> = DEFAULT_CORS_HEADERS,
): Response | null {
	if (isPreflightRequest(req)) {
		return createPreflightResponse(corsHeaders);
	}
	return null;
}
