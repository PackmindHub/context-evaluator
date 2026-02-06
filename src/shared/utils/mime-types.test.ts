import { describe, expect, it } from "bun:test";
import { createFileResponse, getCacheControl, getMimeType } from "./mime-types";

describe("getMimeType", () => {
	it("should return correct MIME types for essential web types", () => {
		expect(getMimeType("script.js")).toBe(
			"application/javascript; charset=utf-8",
		);
		expect(getMimeType("styles.css")).toBe("text/css; charset=utf-8");
		expect(getMimeType("index.html")).toBe("text/html; charset=utf-8");
		expect(getMimeType("data.json")).toBe("application/json; charset=utf-8");
	});

	it("should return correct MIME types for images", () => {
		expect(getMimeType("logo.svg")).toBe("image/svg+xml");
		expect(getMimeType("photo.png")).toBe("image/png");
		expect(getMimeType("photo.jpg")).toBe("image/jpeg");
		expect(getMimeType("photo.jpeg")).toBe("image/jpeg");
		expect(getMimeType("animation.gif")).toBe("image/gif");
		expect(getMimeType("modern.webp")).toBe("image/webp");
		expect(getMimeType("favicon.ico")).toBe("image/x-icon");
	});

	it("should return correct MIME types for fonts", () => {
		expect(getMimeType("font.woff")).toBe("font/woff");
		expect(getMimeType("font.woff2")).toBe("font/woff2");
		expect(getMimeType("font.ttf")).toBe("font/ttf");
		expect(getMimeType("font.eot")).toBe("application/vnd.ms-fontobject");
	});

	it("should return correct MIME types for other formats", () => {
		expect(getMimeType("sitemap.xml")).toBe("application/xml; charset=utf-8");
		expect(getMimeType("document.pdf")).toBe("application/pdf");
		expect(getMimeType("archive.zip")).toBe("application/zip");
	});

	it("should handle uppercase extensions", () => {
		expect(getMimeType("SCRIPT.JS")).toBe(
			"application/javascript; charset=utf-8",
		);
		expect(getMimeType("STYLES.CSS")).toBe("text/css; charset=utf-8");
		expect(getMimeType("IMAGE.PNG")).toBe("image/png");
	});

	it("should handle files with multiple dots", () => {
		expect(getMimeType("app.min.js")).toBe(
			"application/javascript; charset=utf-8",
		);
		expect(getMimeType("styles.bundle.css")).toBe("text/css; charset=utf-8");
	});

	it("should return default MIME type for unknown extensions", () => {
		expect(getMimeType("unknown.xyz")).toBe("application/octet-stream");
		expect(getMimeType("noextension")).toBe("application/octet-stream");
	});

	it("should handle paths with directories", () => {
		expect(getMimeType("/assets/js/app.js")).toBe(
			"application/javascript; charset=utf-8",
		);
		expect(getMimeType("../styles/main.css")).toBe("text/css; charset=utf-8");
	});
});

describe("getCacheControl", () => {
	it("should return no-cache for HTML files", () => {
		expect(getCacheControl("index.html")).toBe("no-cache");
		expect(getCacheControl("/path/to/index.html")).toBe("no-cache");
	});

	it("should return immutable for hashed assets", () => {
		expect(getCacheControl("App.abc12345.js")).toBe(
			"public, max-age=31536000, immutable",
		);
		expect(getCacheControl("styles.a1b2c3d4.css")).toBe(
			"public, max-age=31536000, immutable",
		);
		expect(getCacheControl("chunk.12345678abcd.js")).toBe(
			"public, max-age=31536000, immutable",
		);
	});

	it("should return moderate caching for non-hashed assets", () => {
		expect(getCacheControl("app.js")).toBe("public, max-age=3600");
		expect(getCacheControl("styles.css")).toBe("public, max-age=3600");
		expect(getCacheControl("logo.png")).toBe("public, max-age=3600");
	});

	it("should detect hashes with uppercase hex characters", () => {
		expect(getCacheControl("App.ABC12345.js")).toBe(
			"public, max-age=31536000, immutable",
		);
	});

	it("should not treat short hex-like strings as hashes", () => {
		// Less than 8 characters should not be considered a hash
		expect(getCacheControl("app.abc123.js")).toBe("public, max-age=3600");
	});
});

describe("createFileResponse", () => {
	it("should create Response with correct Content-Type for JS files", () => {
		const mockFile = Bun.file("/tmp/test.js");
		const response = createFileResponse(mockFile, "app.js");

		expect(response.headers.get("Content-Type")).toBe(
			"application/javascript; charset=utf-8",
		);
	});

	it("should create Response with correct Content-Type for CSS files", () => {
		const mockFile = Bun.file("/tmp/test.css");
		const response = createFileResponse(mockFile, "styles.css");

		expect(response.headers.get("Content-Type")).toBe(
			"text/css; charset=utf-8",
		);
	});

	it("should create Response with correct Content-Type for HTML files", () => {
		const mockFile = Bun.file("/tmp/test.html");
		const response = createFileResponse(mockFile, "index.html");

		expect(response.headers.get("Content-Type")).toBe(
			"text/html; charset=utf-8",
		);
	});

	it("should create Response with correct Cache-Control for HTML files", () => {
		const mockFile = Bun.file("/tmp/test.html");
		const response = createFileResponse(mockFile, "index.html");

		expect(response.headers.get("Cache-Control")).toBe("no-cache");
	});

	it("should create Response with correct Cache-Control for hashed assets", () => {
		const mockFile = Bun.file("/tmp/test.js");
		const response = createFileResponse(mockFile, "app.abc12345.js");

		expect(response.headers.get("Cache-Control")).toBe(
			"public, max-age=31536000, immutable",
		);
	});

	it("should create Response with correct headers for images", () => {
		const mockFile = Bun.file("/tmp/test.png");
		const response = createFileResponse(mockFile, "logo.png");

		expect(response.headers.get("Content-Type")).toBe("image/png");
		expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
	});

	it("should handle paths with directories", () => {
		const mockFile = Bun.file("/tmp/test.js");
		const response = createFileResponse(mockFile, "/assets/js/app.js");

		expect(response.headers.get("Content-Type")).toBe(
			"application/javascript; charset=utf-8",
		);
	});
});
