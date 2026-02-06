#!/usr/bin/env bun

// Quick test script to validate frontend functionality
import type {
	IndependentEvaluationOutput,
	UnifiedEvaluationOutput,
} from "./src/types/evaluation";
import {
	isIndependentFormat,
	isUnifiedFormat,
	parseEvaluatorResult,
} from "./src/types/evaluation";

console.log("🧪 Testing frontend type definitions and utilities...\n");

// Test data - simplified evaluation output
const testUnifiedData: UnifiedEvaluationOutput = {
	metadata: {
		generatedAt: new Date().toISOString(),
		agent: "claude",
		evaluationMode: "unified",
		totalFiles: 3,
		totalIssues: 5,
	},
	results: [
		{
			evaluator: "01-content-quality",
			output: {
				type: "result",
				subtype: "success",
				is_error: false,
				duration_ms: 1000,
				num_turns: 1,
				result: JSON.stringify([
					{
						category: "Content Quality",
						severity: 8,
						title: "Test Issue",
						description: "This is a test issue",
						location: { file: "test.md", start: 1, end: 10 },
					},
				]),
				session_id: "test",
				total_cost_usd: 0.01,
				usage: {
					input_tokens: 100,
					output_tokens: 50,
					cache_creation_input_tokens: 0,
					cache_read_input_tokens: 0,
				},
				uuid: "test-uuid",
			},
		},
	],
};

const testIndependentData: IndependentEvaluationOutput = {
	metadata: {
		generatedAt: new Date().toISOString(),
		agent: "claude",
		evaluationMode: "independent",
		totalFiles: 2,
	},
	files: {
		"test.md": {
			evaluations: [],
			totalIssues: 0,
			criticalCount: 0,
			highCount: 0,
			mediumCount: 0,
		},
	},
	crossFileIssues: [],
};

// Run tests
let passed = 0;
let failed = 0;

function test(name: string, fn: () => boolean) {
	try {
		const result = fn();
		if (result) {
			console.log(`✅ ${name}`);
			passed++;
		} else {
			console.log(`❌ ${name}`);
			failed++;
		}
	} catch (error) {
		console.log(`❌ ${name} - Error: ${error}`);
		failed++;
	}
}

// Type guard tests
test("isUnifiedFormat recognizes unified format", () => {
	return isUnifiedFormat(testUnifiedData);
});

test("isIndependentFormat recognizes independent format", () => {
	return isIndependentFormat(testIndependentData);
});

test("isUnifiedFormat rejects independent format", () => {
	return !isUnifiedFormat(testIndependentData);
});

test("isIndependentFormat rejects unified format", () => {
	return !isIndependentFormat(testUnifiedData);
});

// Parser tests
test("parseEvaluatorResult extracts issues from JSON", () => {
	const result = testUnifiedData.results[0].output?.result;
	if (!result) return false;
	const issues = parseEvaluatorResult(result);
	return issues.length === 1 && issues[0].category === "Content Quality";
});

test("parseEvaluatorResult handles invalid JSON", () => {
	const issues = parseEvaluatorResult("invalid json");
	return issues.length === 0;
});

test("parseEvaluatorResult handles text before JSON", () => {
	const textWithJson =
		'Here are the issues:\n\n[{"category": "Test", "severity": 5}]';
	const issues = parseEvaluatorResult(textWithJson);
	return issues.length === 1;
});

console.log("\n" + "=".repeat(50));
console.log(`Tests completed: ${passed} passed, ${failed} failed`);
console.log("=".repeat(50) + "\n");

if (failed === 0) {
	console.log("✨ All tests passed! Frontend is ready to use.\n");
	process.exit(0);
} else {
	console.log("⚠️  Some tests failed. Please review the errors.\n");
	process.exit(1);
}
