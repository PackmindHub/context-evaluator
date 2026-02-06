import { describe, expect, test } from "bun:test";
import {
	colors,
	EVALUATOR_LABELS,
	getEvaluatorLabel,
	getSeverityDisplay,
	impactLevelToSeverity,
	PROGRESS_CONFIG,
	SEVERITY_CONFIG,
} from "./terminal-colors";

describe("Terminal Colors", () => {
	describe("colors", () => {
		test("should have valid ANSI escape sequences", () => {
			expect(colors.reset.startsWith("\x1b[")).toBe(true);
			expect(colors.bright.startsWith("\x1b[")).toBe(true);
			expect(colors.dim.startsWith("\x1b[")).toBe(true);
			expect(colors.red.startsWith("\x1b[")).toBe(true);
			expect(colors.green.startsWith("\x1b[")).toBe(true);
		});

		test("should have reset code [0m", () => {
			expect(colors.reset).toBe("\x1b[0m");
		});

		test("should have bright code [1m", () => {
			expect(colors.bright).toBe("\x1b[1m");
		});

		test("should have all required colors", () => {
			expect(colors.red).toBeDefined();
			expect(colors.green).toBeDefined();
			expect(colors.yellow).toBeDefined();
			expect(colors.blue).toBeDefined();
			expect(colors.cyan).toBeDefined();
		});
	});

	describe("SEVERITY_CONFIG", () => {
		// Updated for 3-level system: High (8-10), Medium (6-7), Low (≤5)
		test("should have high threshold at 8", () => {
			expect(SEVERITY_CONFIG.HIGH.min).toBe(8);
		});

		test("should have medium threshold at 6", () => {
			expect(SEVERITY_CONFIG.MEDIUM.min).toBe(6);
		});

		test("should have low threshold at 1", () => {
			expect(SEVERITY_CONFIG.LOW.min).toBe(1);
		});

		test("should have emojis for all levels", () => {
			expect(SEVERITY_CONFIG.HIGH.emoji).toBe("🟠");
			expect(SEVERITY_CONFIG.MEDIUM.emoji).toBe("🟡");
			expect(SEVERITY_CONFIG.LOW.emoji).toBe("⚪");
		});
	});

	describe("getSeverityDisplay", () => {
		// High severity (8-10)
		test("should return high display for severity 10", () => {
			const display = getSeverityDisplay(10);
			expect(display.emoji).toBe("🟠");
			expect(display.label).toBe("High");
		});

		test("should return high display for severity 9", () => {
			const display = getSeverityDisplay(9);
			expect(display.emoji).toBe("🟠");
			expect(display.label).toBe("High");
		});

		test("should return high display for severity 8", () => {
			const display = getSeverityDisplay(8);
			expect(display.emoji).toBe("🟠");
			expect(display.label).toBe("High");
		});

		// Medium severity (6-7)
		test("should return medium display for severity 7", () => {
			const display = getSeverityDisplay(7);
			expect(display.emoji).toBe("🟡");
			expect(display.label).toBe("Medium");
		});

		test("should return medium display for severity 6", () => {
			const display = getSeverityDisplay(6);
			expect(display.emoji).toBe("🟡");
			expect(display.label).toBe("Medium");
		});

		// Low severity (≤5)
		test("should return low display for severity 5", () => {
			const display = getSeverityDisplay(5);
			expect(display.emoji).toBe("⚪");
			expect(display.label).toBe("Low");
		});

		test("should return low display for severity 3", () => {
			const display = getSeverityDisplay(3);
			expect(display.emoji).toBe("⚪");
			expect(display.label).toBe("Low");
		});

		test("should return low display for severity 1", () => {
			const display = getSeverityDisplay(1);
			expect(display.emoji).toBe("⚪");
			expect(display.label).toBe("Low");
		});

		test("should return low display for severity 0", () => {
			const display = getSeverityDisplay(0);
			expect(display.emoji).toBe("⚪");
			expect(display.label).toBe("Low");
		});
	});

	describe("impactLevelToSeverity", () => {
		test("should return 9 for High impact", () => {
			expect(impactLevelToSeverity("High")).toBe(9);
		});

		test("should return 7 for Medium impact", () => {
			expect(impactLevelToSeverity("Medium")).toBe(7);
		});

		test("should return 5 for Low impact", () => {
			expect(impactLevelToSeverity("Low")).toBe(5);
		});

		test("should return 5 for undefined impact", () => {
			expect(impactLevelToSeverity(undefined)).toBe(5);
		});
	});

	describe("EVALUATOR_LABELS", () => {
		test("should have label for content quality", () => {
			expect(EVALUATOR_LABELS["content-quality"]).toBe(
				"Content Quality & Focus",
			);
		});

		test("should have label for command completeness", () => {
			expect(EVALUATOR_LABELS["command-completeness"]).toBe(
				"Command Completeness",
			);
		});

		test("should have label for security", () => {
			expect(EVALUATOR_LABELS["security"]).toBe("Security");
		});

		test("should have labels for all known evaluators", () => {
			expect(Object.keys(EVALUATOR_LABELS).length).toBeGreaterThan(10);
		});
	});

	describe("getEvaluatorLabel", () => {
		test("should return mapped label for known evaluator", () => {
			expect(getEvaluatorLabel("content-quality")).toBe(
				"Content Quality & Focus",
			);
		});

		test("should return evaluator name for unknown evaluator", () => {
			expect(getEvaluatorLabel("99-unknown")).toBe("99-unknown");
		});

		test("should handle empty string", () => {
			expect(getEvaluatorLabel("")).toBe("");
		});
	});

	describe("PROGRESS_CONFIG", () => {
		test("should have info configuration", () => {
			expect(PROGRESS_CONFIG.info.symbol).toBe("📊");
			expect(PROGRESS_CONFIG.info.color).toBe(colors.cyan);
		});

		test("should have success configuration", () => {
			expect(PROGRESS_CONFIG.success.symbol).toBe("✅");
			expect(PROGRESS_CONFIG.success.color).toBe(colors.green);
		});

		test("should have error configuration", () => {
			expect(PROGRESS_CONFIG.error.symbol).toBe("❌");
			expect(PROGRESS_CONFIG.error.color).toBe(colors.red);
		});

		test("should have warn configuration", () => {
			expect(PROGRESS_CONFIG.warn.symbol).toBe("⚠️");
			expect(PROGRESS_CONFIG.warn.color).toBe(colors.yellow);
		});
	});
});
