/**
 * MIME type utilities for serving static files with proper Content-Type headers.
 * Used by both filesystem-based and embedded asset servers.
 */

const MIME_TYPES: Record<string, string> = {
	// Web
	".html": "text/html; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	// Images
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".ico": "image/x-icon",
	// Fonts
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".eot": "application/vnd.ms-fontobject",
	// Other
	".xml": "application/xml; charset=utf-8",
	".pdf": "application/pdf",
	".zip": "application/zip",
};

/**
 * Returns the MIME type for a given file path based on its extension.
 * Falls back to 'application/octet-stream' for unknown types.
 */
export function getMimeType(filePath: string): string {
	const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
	return MIME_TYPES[ext] || "application/octet-stream";
}

/**
 * Returns appropriate Cache-Control header based on file type.
 * - HTML files: no-cache (ensure SPA updates are seen)
 * - Hashed assets: immutable with long max-age (aggressive caching)
 */
export function getCacheControl(filePath: string): string {
	const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();

	if (ext === ".html") {
		return "no-cache";
	}

	// Hashed assets (e.g., App.abc123.js) get aggressive caching
	// Simple heuristic: if filename contains a hash pattern (8+ hex chars before extension)
	const filename = filePath.substring(filePath.lastIndexOf("/") + 1);
	const hasHash = /\.[a-f0-9]{8,}\./i.test(filename);

	if (hasHash) {
		return "public, max-age=31536000, immutable";
	}

	// Default: moderate caching for other static assets
	return "public, max-age=3600";
}

/**
 * Creates a Response with proper Content-Type and Cache-Control headers.
 * Used by static file servers to ensure browsers correctly interpret files.
 */
export function createFileResponse(
	file: ReturnType<typeof Bun.file>,
	filePath: string,
): Response {
	const headers = new Headers();
	headers.set("Content-Type", getMimeType(filePath));
	headers.set("Cache-Control", getCacheControl(filePath));

	return new Response(file, { headers });
}
