import { describe, expect, test } from "bun:test";
import {
	errorResponse,
	internalErrorResponse,
	jsonResponse,
	notFoundResponse,
	okResponse,
	tooManyRequestsResponse,
} from "./response-builder";

describe("Response Builder", () => {
	describe("jsonResponse", () => {
		test("should create response with default status 200", async () => {
			const response = jsonResponse({ message: "test" });

			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toBe("application/json");

			const body = await response.json();
			expect(body.message).toBe("test");
		});

		test("should create response with custom status", async () => {
			const response = jsonResponse({ data: "value" }, 201);

			expect(response.status).toBe(201);
		});

		test("should merge custom headers", async () => {
			const response = jsonResponse({ data: "value" }, 200, {
				"X-Custom": "header",
			});

			expect(response.headers.get("Content-Type")).toBe("application/json");
			expect(response.headers.get("X-Custom")).toBe("header");
		});

		test("should handle arrays", async () => {
			const response = jsonResponse([1, 2, 3]);
			const body = await response.json();

			expect(body).toEqual([1, 2, 3]);
		});

		test("should handle null", async () => {
			const response = jsonResponse(null);
			const body = await response.json();

			expect(body).toBeNull();
		});
	});

	describe("okResponse", () => {
		test("should create 200 response", async () => {
			const response = okResponse({ success: true });

			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.success).toBe(true);
		});
	});

	describe("errorResponse", () => {
		test("should create error response with message and code", async () => {
			const response = errorResponse("Something went wrong", "ERROR_CODE", 500);

			expect(response.status).toBe(500);

			const body = await response.json();
			expect(body.error).toBe("Something went wrong");
			expect(body.code).toBe("ERROR_CODE");
		});
	});

	describe("notFoundResponse", () => {
		test("should create 404 response with default code", async () => {
			const response = notFoundResponse("Resource not found");

			expect(response.status).toBe(404);

			const body = await response.json();
			expect(body.error).toBe("Resource not found");
			expect(body.code).toBe("NOT_FOUND");
		});

		test("should allow custom code", async () => {
			const response = notFoundResponse("Job not found", "JOB_NOT_FOUND");

			const body = await response.json();
			expect(body.code).toBe("JOB_NOT_FOUND");
		});
	});

	describe("tooManyRequestsResponse", () => {
		test("should create 429 response with default code", async () => {
			const response = tooManyRequestsResponse("Rate limit exceeded");

			expect(response.status).toBe(429);

			const body = await response.json();
			expect(body.error).toBe("Rate limit exceeded");
			expect(body.code).toBe("TOO_MANY_REQUESTS");
		});

		test("should allow custom code", async () => {
			const response = tooManyRequestsResponse("Queue full", "QUEUE_FULL");

			const body = await response.json();
			expect(body.code).toBe("QUEUE_FULL");
		});
	});

	describe("internalErrorResponse", () => {
		test("should create 500 response with defaults", async () => {
			const response = internalErrorResponse();

			expect(response.status).toBe(500);

			const body = await response.json();
			expect(body.error).toBe("Internal server error");
			expect(body.code).toBe("INTERNAL_ERROR");
		});

		test("should allow custom message", async () => {
			const response = internalErrorResponse("Database error");

			const body = await response.json();
			expect(body.error).toBe("Database error");
		});

		test("should allow custom code", async () => {
			const response = internalErrorResponse("DB error", "DATABASE_ERROR");

			const body = await response.json();
			expect(body.code).toBe("DATABASE_ERROR");
		});
	});
});
