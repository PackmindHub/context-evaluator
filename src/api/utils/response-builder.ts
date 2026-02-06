/**
 * Response builder utilities for consistent API responses
 *
 * Provides helper functions for creating standardized HTTP responses
 * with proper headers and JSON formatting.
 */

/**
 * Standard error response structure
 */
export interface ErrorResponse {
	error: string;
	code: string;
}

/**
 * Create a successful JSON response
 */
export function jsonResponse(
	data: unknown,
	status = 200,
	headers: Record<string, string> = {},
): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"Content-Type": "application/json",
			...headers,
		},
	});
}

/**
 * Create a 200 OK response with JSON data
 */
export function okResponse(
	data: unknown,
	headers: Record<string, string> = {},
): Response {
	return jsonResponse(data, 200, headers);
}

/**
 * Create an error response
 */
export function errorResponse(
	message: string,
	code: string,
	status: number,
	headers: Record<string, string> = {},
): Response {
	const body: ErrorResponse = { error: message, code };
	return jsonResponse(body, status, headers);
}

/**
 * Create a 404 Not Found response
 */
export function notFoundResponse(
	message: string,
	code = "NOT_FOUND",
): Response {
	return errorResponse(message, code, 404);
}

/**
 * Create a 429 Too Many Requests response
 */
export function tooManyRequestsResponse(
	message: string,
	code = "TOO_MANY_REQUESTS",
): Response {
	return errorResponse(message, code, 429);
}

/**
 * Create a 500 Internal Server Error response
 */
export function internalErrorResponse(
	message = "Internal server error",
	code = "INTERNAL_ERROR",
): Response {
	return errorResponse(message, code, 500);
}
