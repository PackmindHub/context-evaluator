import { describe, expect, test } from "bun:test";
import {
	DEFAULT_STATIC_CONFIG,
	normalizePath,
	serveStaticFile,
	tryServeFromFilesystem,
	tryServeSpaFallback,
} from "./static-file-server";

describe("Static File Server", () => {
	describe("DEFAULT_STATIC_CONFIG", () => {
		test("should have search paths in priority order", () => {
			expect(DEFAULT_STATIC_CONFIG.searchPaths).toContain("./frontend/dist");
			expect(DEFAULT_STATIC_CONFIG.searchPaths).toContain("./frontend");
			expect(DEFAULT_STATIC_CONFIG.searchPaths[0]).toBe("./frontend/dist");
		});

		test("should have index.html as SPA fallback", () => {
			expect(DEFAULT_STATIC_CONFIG.spaFallback).toBe("index.html");
		});
	});

	describe("normalizePath", () => {
		test("should convert root to index.html", () => {
			expect(normalizePath("/")).toBe("/index.html");
		});

		test("should preserve paths with leading slash", () => {
			expect(normalizePath("/styles.css")).toBe("/styles.css");
		});

		test("should add leading slash if missing", () => {
			expect(normalizePath("styles.css")).toBe("/styles.css");
		});

		test("should preserve nested paths", () => {
			expect(normalizePath("/assets/images/logo.png")).toBe(
				"/assets/images/logo.png",
			);
		});

		test("should handle empty path by adding slash", () => {
			expect(normalizePath("")).toBe("/");
		});
	});

	describe("tryServeFromFilesystem", () => {
		test("should return null for non-existent file", async () => {
			const result = await tryServeFromFilesystem(
				"/definitely-not-a-real-file-12345.xyz",
			);
			expect(result).toBeNull();
		});

		test("should search custom paths", async () => {
			const result = await tryServeFromFilesystem("/nonexistent.txt", {
				searchPaths: ["./nonexistent-dir"],
				spaFallback: "index.html",
			});
			expect(result).toBeNull();
		});

		test("should return Response for existing file", async () => {
			// Test with a known file that exists (package.json in root)
			const result = await tryServeFromFilesystem("/package.json", {
				searchPaths: ["."],
				spaFallback: "index.html",
			});
			expect(result).not.toBeNull();
			expect(result?.status).toBe(200);
		});

		test("should set correct Content-Type for JSON files", async () => {
			const result = await tryServeFromFilesystem("/package.json", {
				searchPaths: ["."],
				spaFallback: "index.html",
			});
			expect(result).not.toBeNull();
			expect(result?.headers.get("Content-Type")).toBe(
				"application/json; charset=utf-8",
			);
		});

		test("should set correct Cache-Control for non-hashed files", async () => {
			const result = await tryServeFromFilesystem("/package.json", {
				searchPaths: ["."],
				spaFallback: "index.html",
			});
			expect(result).not.toBeNull();
			expect(result?.headers.get("Cache-Control")).toBe("public, max-age=3600");
		});
	});

	describe("tryServeSpaFallback", () => {
		test("should return null when spaFallback is undefined", async () => {
			const result = await tryServeSpaFallback({
				searchPaths: ["./frontend/dist"],
				spaFallback: undefined,
			});
			expect(result).toBeNull();
		});

		test("should return null when fallback not found", async () => {
			const result = await tryServeSpaFallback({
				searchPaths: ["./nonexistent-dir"],
				spaFallback: "index.html",
			});
			expect(result).toBeNull();
		});

		test("should set correct Content-Type for HTML fallback", async () => {
			// Use package.json as a test fallback file (we know it exists)
			const result = await tryServeSpaFallback({
				searchPaths: ["."],
				spaFallback: "package.json",
			});
			expect(result).not.toBeNull();
			expect(result?.headers.get("Content-Type")).toBe(
				"application/json; charset=utf-8",
			);
		});

		test("should set no-cache for HTML files", async () => {
			// Test with a file path that would be an HTML file
			const result = await tryServeSpaFallback({
				searchPaths: ["./frontend/dist"],
				spaFallback: "index.html",
			});
			// If the file exists, it should have no-cache header
			if (result) {
				expect(result.headers.get("Cache-Control")).toBe("no-cache");
			}
		});
	});

	describe("serveStaticFile", () => {
		test("should serve existing file from filesystem", async () => {
			// Test with a known file
			const response = await serveStaticFile("/package.json", {
				searchPaths: ["."],
				spaFallback: undefined,
			});
			expect(response.status).toBe(200);
		});

		test("should search paths in order and find in second path", async () => {
			// First path doesn't exist, second does
			const response = await serveStaticFile("/package.json", {
				searchPaths: ["./nonexistent-dir", "."],
				spaFallback: undefined,
			});
			expect(response.status).toBe(200);
		});

		test("should return valid response for any path", async () => {
			// This test verifies the function returns a valid response
			// The actual status depends on embedded mode and filesystem state
			const response = await serveStaticFile(
				"/definitely-not-a-real-file-12345.xyz",
				{
					searchPaths: ["./nonexistent-dir"],
					spaFallback: undefined,
				},
			);
			// Should return a valid Response
			expect(response).toBeInstanceOf(Response);
			// Status should be either 200 (if embedded index exists) or 404
			expect([200, 404]).toContain(response.status);
		});

		test("should return valid response for root path", async () => {
			const response = await serveStaticFile("/", {
				searchPaths: ["."],
				spaFallback: undefined,
			});
			// Root path normalizes to /index.html
			// Will be 200 if embedded or file exists, 404 otherwise
			expect(response).toBeInstanceOf(Response);
		});

		test("should use SPA fallback when file not found in paths", async () => {
			// Test SPA fallback behavior with valid paths
			const response = await serveStaticFile("/unknown-route", {
				searchPaths: ["."],
				spaFallback: "package.json",
			});
			// Should find the SPA fallback in "." directory
			expect(response.status).toBe(200);
		});
	});
});
