import { describe, expect, test } from "bun:test";
import {
	addCorsHeaders,
	createPreflightResponse,
	DEFAULT_CORS_HEADERS,
	handleCors,
	isPreflightRequest,
} from "./cors";

describe("CORS Middleware", () => {
	describe("DEFAULT_CORS_HEADERS", () => {
		test("should include Allow-Origin header", () => {
			expect(DEFAULT_CORS_HEADERS["Access-Control-Allow-Origin"]).toBe("*");
		});

		test("should include Allow-Methods header", () => {
			expect(DEFAULT_CORS_HEADERS["Access-Control-Allow-Methods"]).toBe(
				"GET, POST, PUT, DELETE, OPTIONS",
			);
		});

		test("should include Allow-Headers header", () => {
			expect(DEFAULT_CORS_HEADERS["Access-Control-Allow-Headers"]).toBe(
				"Content-Type, Authorization",
			);
		});
	});

	describe("isPreflightRequest", () => {
		test("should return true for OPTIONS request", () => {
			const req = new Request("http://localhost/api/test", {
				method: "OPTIONS",
			});
			expect(isPreflightRequest(req)).toBe(true);
		});

		test("should return false for GET request", () => {
			const req = new Request("http://localhost/api/test", {
				method: "GET",
			});
			expect(isPreflightRequest(req)).toBe(false);
		});

		test("should return false for POST request", () => {
			const req = new Request("http://localhost/api/test", {
				method: "POST",
			});
			expect(isPreflightRequest(req)).toBe(false);
		});

		test("should return false for DELETE request", () => {
			const req = new Request("http://localhost/api/test", {
				method: "DELETE",
			});
			expect(isPreflightRequest(req)).toBe(false);
		});
	});

	describe("createPreflightResponse", () => {
		test("should return 204 status", () => {
			const response = createPreflightResponse();
			expect(response.status).toBe(204);
		});

		test("should have null body", () => {
			const response = createPreflightResponse();
			expect(response.body).toBeNull();
		});

		test("should include default CORS headers", () => {
			const response = createPreflightResponse();
			expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
			expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
				"GET, POST, PUT, DELETE, OPTIONS",
			);
		});

		test("should allow custom headers", () => {
			const customHeaders = {
				"Access-Control-Allow-Origin": "https://example.com",
				"Access-Control-Allow-Methods": "GET, POST",
			};
			const response = createPreflightResponse(customHeaders);
			expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
				"https://example.com",
			);
			expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
				"GET, POST",
			);
		});
	});

	describe("addCorsHeaders", () => {
		test("should add CORS headers to response", () => {
			const original = new Response(JSON.stringify({ data: "test" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});

			const withCors = addCorsHeaders(original);

			expect(withCors.headers.get("Access-Control-Allow-Origin")).toBe("*");
			expect(withCors.headers.get("Content-Type")).toBe("application/json");
		});

		test("should preserve original status", () => {
			const original = new Response(null, { status: 201 });
			const withCors = addCorsHeaders(original);
			expect(withCors.status).toBe(201);
		});

		test("should preserve original status text", () => {
			const original = new Response(null, {
				status: 404,
				statusText: "Not Found",
			});
			const withCors = addCorsHeaders(original);
			expect(withCors.statusText).toBe("Not Found");
		});

		test("should allow custom CORS headers", () => {
			const original = new Response(null, { status: 200 });
			const customHeaders = {
				"Access-Control-Allow-Origin": "https://mysite.com",
			};

			const withCors = addCorsHeaders(original, customHeaders);
			expect(withCors.headers.get("Access-Control-Allow-Origin")).toBe(
				"https://mysite.com",
			);
		});

		test("should preserve response body", async () => {
			const original = new Response(JSON.stringify({ message: "hello" }), {
				status: 200,
			});

			const withCors = addCorsHeaders(original);
			const body = await withCors.json();
			expect(body.message).toBe("hello");
		});
	});

	describe("handleCors", () => {
		test("should return preflight response for OPTIONS request", () => {
			const req = new Request("http://localhost/api/test", {
				method: "OPTIONS",
			});
			const response = handleCors(req);

			expect(response).not.toBeNull();
			expect(response?.status).toBe(204);
		});

		test("should return null for non-OPTIONS request", () => {
			const req = new Request("http://localhost/api/test", {
				method: "GET",
			});
			const response = handleCors(req);
			expect(response).toBeNull();
		});

		test("should use custom headers for preflight", () => {
			const req = new Request("http://localhost/api/test", {
				method: "OPTIONS",
			});
			const customHeaders = {
				"Access-Control-Allow-Origin": "https://custom.com",
			};

			const response = handleCors(req, customHeaders);
			expect(response?.headers.get("Access-Control-Allow-Origin")).toBe(
				"https://custom.com",
			);
		});
	});
});
