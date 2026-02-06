/**
 * Static file server utilities for serving frontend assets
 */

import { createFileResponse } from "@shared/utils/mime-types";
import {
	hasEmbeddedAssets,
	serveEmbeddedAsset,
	serveIndexHtml,
} from "../../embedded";

/**
 * Configuration for static file serving
 */
export interface StaticFileConfig {
	/** Base directories to search for files, in priority order */
	searchPaths: string[];
	/** Fallback file for SPA routing (e.g., index.html) */
	spaFallback?: string;
}

/**
 * Default configuration for frontend static files
 */
export const DEFAULT_STATIC_CONFIG: StaticFileConfig = {
	searchPaths: ["./frontend/dist", "./frontend", "./dist/web", "./src/web"],
	spaFallback: "index.html",
};

/**
 * Check if embedded assets are available
 */
export function isEmbeddedMode(): boolean {
	return hasEmbeddedAssets();
}

/**
 * Try to serve a file from embedded assets
 * Returns Response if found, null otherwise
 */
export function tryServeEmbedded(path: string): Response | null {
	if (!isEmbeddedMode()) {
		return null;
	}

	const embeddedResponse = serveEmbeddedAsset(path);
	if (embeddedResponse) {
		return embeddedResponse;
	}

	return null;
}

/**
 * Try to serve the embedded index.html (SPA fallback)
 */
export function tryServeEmbeddedIndex(): Response | null {
	if (!isEmbeddedMode()) {
		return null;
	}

	return serveIndexHtml();
}

/**
 * Try to serve a file from the filesystem
 * Searches through configured paths in order
 */
export async function tryServeFromFilesystem(
	path: string,
	config: StaticFileConfig = DEFAULT_STATIC_CONFIG,
): Promise<Response | null> {
	for (const basePath of config.searchPaths) {
		const file = Bun.file(`${basePath}${path}`);
		if (await file.exists()) {
			return createFileResponse(file, path);
		}
	}

	return null;
}

/**
 * Try to serve the SPA fallback (index.html) from filesystem
 */
export async function tryServeSpaFallback(
	config: StaticFileConfig = DEFAULT_STATIC_CONFIG,
): Promise<Response | null> {
	if (!config.spaFallback) {
		return null;
	}

	for (const basePath of config.searchPaths) {
		const file = Bun.file(`${basePath}/${config.spaFallback}`);
		if (await file.exists()) {
			return createFileResponse(file, `/${config.spaFallback}`);
		}
	}

	return null;
}

/**
 * Normalize a URL path for static file serving
 * - Converts "/" to "/index.html"
 * - Ensures path starts with "/"
 */
export function normalizePath(path: string): string {
	if (path === "/") {
		return "/index.html";
	}
	if (!path.startsWith("/")) {
		return `/${path}`;
	}
	return path;
}

/**
 * Serve a static file with full fallback chain:
 * 1. Try embedded assets (if in embedded mode)
 * 2. Try filesystem paths in order
 * 3. Try SPA fallback (embedded or filesystem)
 * 4. Return 404 if nothing found
 */
export async function serveStaticFile(
	requestPath: string,
	config: StaticFileConfig = DEFAULT_STATIC_CONFIG,
): Promise<Response> {
	const path = normalizePath(requestPath);

	// Try embedded assets first
	const embeddedResponse = tryServeEmbedded(path);
	if (embeddedResponse) {
		return embeddedResponse;
	}

	// Try filesystem paths
	const filesystemResponse = await tryServeFromFilesystem(path, config);
	if (filesystemResponse) {
		return filesystemResponse;
	}

	// Try embedded SPA fallback
	const embeddedIndex = tryServeEmbeddedIndex();
	if (embeddedIndex) {
		return embeddedIndex;
	}

	// Try filesystem SPA fallback
	const spaResponse = await tryServeSpaFallback(config);
	if (spaResponse) {
		return spaResponse;
	}

	return new Response("Not found", { status: 404 });
}
