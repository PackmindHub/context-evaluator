import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	configureLogger,
	createLogger,
	formatTimestamp,
	getLoggerConfig,
} from "./logger";

describe("logger", () => {
	describe("formatTimestamp", () => {
		const testDate = new Date("2026-02-05T14:32:45.123Z");

		test("formats time-only correctly", () => {
			const result = formatTimestamp(testDate, "time-only");
			// The exact output depends on local timezone, so check format
			expect(result).toMatch(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\]$/);
		});

		test("formats compact correctly", () => {
			const result = formatTimestamp(testDate, "compact");
			// Format: [YYYY-MM-DD HH:mm:ss.SSS]
			expect(result).toMatch(
				/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\]$/,
			);
		});

		test("formats iso correctly", () => {
			const result = formatTimestamp(testDate, "iso");
			expect(result).toBe("[2026-02-05T14:32:45.123Z]");
		});

		test("uses current date when none provided", () => {
			const result = formatTimestamp();

			// Should produce a valid timestamp format
			expect(result).toMatch(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\]$/);
		});

		test("pads single digits correctly", () => {
			// Create a date with single-digit components (in UTC)
			const singleDigitDate = new Date("2026-01-05T09:05:03.007Z");
			const result = formatTimestamp(singleDigitDate, "iso");
			expect(result).toBe("[2026-01-05T09:05:03.007Z]");
		});
	});

	describe("configureLogger", () => {
		beforeEach(() => {
			// Reset to defaults before each test
			configureLogger({ timestamps: true, timestampFormat: "time-only" });
		});

		afterEach(() => {
			// Restore defaults after each test
			configureLogger({ timestamps: true, timestampFormat: "time-only" });
		});

		test("can disable timestamps", () => {
			configureLogger({ timestamps: false });
			const config = getLoggerConfig();
			expect(config.timestamps).toBe(false);
		});

		test("can change timestamp format", () => {
			configureLogger({ timestampFormat: "iso" });
			const config = getLoggerConfig();
			expect(config.timestampFormat).toBe("iso");
		});

		test("preserves other settings when partially updating", () => {
			configureLogger({ timestamps: true, timestampFormat: "compact" });
			configureLogger({ timestamps: false });
			const config = getLoggerConfig();
			expect(config.timestamps).toBe(false);
			expect(config.timestampFormat).toBe("compact");
		});
	});

	describe("createLogger", () => {
		let consoleLogs: unknown[][] = [];
		let consoleErrors: unknown[][] = [];
		let consoleWarns: unknown[][] = [];
		let consoleInfos: unknown[][] = [];

		const originalLog = console.log;
		const originalError = console.error;
		const originalWarn = console.warn;
		const originalInfo = console.info;

		beforeEach(() => {
			consoleLogs = [];
			consoleErrors = [];
			consoleWarns = [];
			consoleInfos = [];

			console.log = (...args: unknown[]) => consoleLogs.push(args);
			console.error = (...args: unknown[]) => consoleErrors.push(args);
			console.warn = (...args: unknown[]) => consoleWarns.push(args);
			console.info = (...args: unknown[]) => consoleInfos.push(args);

			// Reset config to defaults
			configureLogger({ timestamps: true, timestampFormat: "time-only" });
		});

		afterEach(() => {
			console.log = originalLog;
			console.error = originalError;
			console.warn = originalWarn;
			console.info = originalInfo;

			// Restore defaults
			configureLogger({ timestamps: true, timestampFormat: "time-only" });
		});

		test("creates logger with prefix", () => {
			const logger = createLogger("TestModule");
			logger.log("Hello world");

			expect(consoleLogs.length).toBe(1);
			expect(consoleLogs[0]!).toHaveLength(3); // timestamp, prefix, message
			expect(consoleLogs[0]![0]).toMatch(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\]$/);
			expect(consoleLogs[0]![1]).toBe("[TestModule]");
			expect(consoleLogs[0]![2]).toBe("Hello world");
		});

		test("creates logger without prefix", () => {
			const logger = createLogger();
			logger.log("Hello world");

			expect(consoleLogs.length).toBe(1);
			expect(consoleLogs[0]!).toHaveLength(2); // timestamp, message
			expect(consoleLogs[0]![0]).toMatch(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\]$/);
			expect(consoleLogs[0]![1]).toBe("Hello world");
		});

		test("log method calls console.log", () => {
			const logger = createLogger("Test");
			logger.log("message");
			expect(consoleLogs.length).toBe(1);
		});

		test("error method calls console.error", () => {
			const logger = createLogger("Test");
			logger.error("error message");
			expect(consoleErrors.length).toBe(1);
		});

		test("warn method calls console.warn", () => {
			const logger = createLogger("Test");
			logger.warn("warning message");
			expect(consoleWarns.length).toBe(1);
		});

		test("info method calls console.info", () => {
			const logger = createLogger("Test");
			logger.info("info message");
			expect(consoleInfos.length).toBe(1);
		});

		test("passes multiple arguments", () => {
			const logger = createLogger("Test");
			logger.log("value:", 42, { key: "value" });

			expect(consoleLogs[0]!).toHaveLength(5); // timestamp, prefix, 3 args
			expect(consoleLogs[0]![2]).toBe("value:");
			expect(consoleLogs[0]![3]).toBe(42);
			expect(consoleLogs[0]![4]).toEqual({ key: "value" });
		});

		test("respects timestamps disabled setting", () => {
			configureLogger({ timestamps: false });
			const logger = createLogger("Test");
			logger.log("Hello");

			expect(consoleLogs[0]!).toHaveLength(2); // prefix, message (no timestamp)
			expect(consoleLogs[0]![0]).toBe("[Test]");
			expect(consoleLogs[0]![1]).toBe("Hello");
		});

		test("works with no prefix and timestamps disabled", () => {
			configureLogger({ timestamps: false });
			const logger = createLogger();
			logger.log("Hello");

			expect(consoleLogs[0]!).toHaveLength(1); // just message
			expect(consoleLogs[0]![0]).toBe("Hello");
		});
	});
});
