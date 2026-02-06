/**
 * Embedded Asset Server
 *
 * Serves frontend assets from memory (embedded at compile time)
 */

import { type EmbeddedAsset, frontendAssets } from "./frontend-assets";

/**
 * Check if embedded assets are available
 */
export function hasEmbeddedAssets(): boolean {
	return Object.keys(frontendAssets).length > 0;
}

/**
 * Serve an embedded asset
 * @param path URL path (e.g., "/index.html" or "/App.abc123.js")
 * @returns Response or null if not found
 */
export function serveEmbeddedAsset(path: string): Response | null {
	// Normalize path
	let filename = path.startsWith("/") ? path.slice(1) : path;

	// Default to index.html for root
	if (filename === "" || filename === "/") {
		filename = "index.html";
	}

	// Try direct path first
	let asset = frontendAssets[filename];

	// If not found, try public/ prefix (for favicons and static assets)
	// This handles absolute paths like /logo.svg that map to public/logo.svg
	if (!asset) {
		asset = frontendAssets[`public/${filename}`];
	}

	if (!asset) {
		return null;
	}

	return createAssetResponse(asset);
}

/**
 * Serve index.html (for SPA routing fallback)
 */
export function serveIndexHtml(): Response | null {
	const asset = frontendAssets["index.html"];
	if (!asset) {
		return null;
	}

	return createAssetResponse(asset);
}

/**
 * Create a Response from an embedded asset
 */
function createAssetResponse(asset: EmbeddedAsset): Response {
	if (asset.isBase64) {
		// Decode base64 for binary files
		const binary = Uint8Array.from(atob(asset.content), (c) => c.charCodeAt(0));
		return new Response(binary, {
			headers: {
				"Content-Type": asset.mimeType,
				"Cache-Control": "public, max-age=31536000, immutable",
			},
		});
	}

	return new Response(asset.content, {
		headers: {
			"Content-Type": asset.mimeType,
			"Cache-Control": asset.mimeType.includes("html")
				? "no-cache"
				: "public, max-age=31536000, immutable",
		},
	});
}

/**
 * List all embedded asset paths
 */
export function listEmbeddedAssets(): string[] {
	return Object.keys(frontendAssets);
}
