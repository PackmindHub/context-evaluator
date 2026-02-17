import { describe, expect, it } from "bun:test";
import { parseActionSummary } from "./summary-parser";

describe("parseActionSummary", () => {
	describe("fenced JSON blocks", () => {
		it("parses a valid fenced JSON summary", () => {
			const response = `I've made the following changes to fix the issues.

\`\`\`json
{
  "actions": [
    { "issueIndex": 1, "status": "fixed", "file": "AGENTS.md", "summary": "Replaced vague setup instructions with exact commands" },
    { "issueIndex": 2, "status": "skipped", "summary": "Not a real issue after reading the file" }
  ]
}
\`\`\``;

			const result = parseActionSummary(response, "error_fix");
			expect(result.parsed).toBe(true);
			expect(result.actions).toHaveLength(2);
			expect(result.actions[0]).toEqual({
				issueIndex: 1,
				status: "fixed",
				file: "AGENTS.md",
				summary: "Replaced vague setup instructions with exact commands",
			});
			expect(result.actions[1]).toEqual({
				issueIndex: 2,
				status: "skipped",
				file: undefined,
				summary: "Not a real issue after reading the file",
			});
		});

		it("uses the last fenced JSON block with actions", () => {
			const response = `Here's the plan:

\`\`\`json
{ "plan": "do something" }
\`\`\`

Done! Here's the summary:

\`\`\`json
{
  "actions": [
    { "issueIndex": 1, "status": "fixed", "summary": "Fixed it" }
  ]
}
\`\`\``;

			const result = parseActionSummary(response, "error_fix");
			expect(result.parsed).toBe(true);
			expect(result.actions).toHaveLength(1);
			expect(result.actions[0]!.status).toBe("fixed");
		});
	});

	describe("raw JSON extraction", () => {
		it("parses raw JSON without fences", () => {
			const response = `I fixed the issues. Here is the summary:
{
  "actions": [
    { "issueIndex": 1, "status": "added", "file": "AGENTS.md", "summary": "Added testing section" }
  ]
}`;

			const result = parseActionSummary(response, "suggestion_enrich");
			expect(result.parsed).toBe(true);
			expect(result.actions).toHaveLength(1);
			expect(result.actions[0]!.status).toBe("added");
		});
	});

	describe("status normalization", () => {
		it("normalizes 'resolved' to 'fixed'", () => {
			const response = `\`\`\`json
{
  "actions": [
    { "issueIndex": 1, "status": "resolved", "summary": "Done" }
  ]
}
\`\`\``;

			const result = parseActionSummary(response, "error_fix");
			expect(result.actions[0]!.status).toBe("fixed");
		});

		it("normalizes 'ignored' to 'skipped'", () => {
			const response = `\`\`\`json
{
  "actions": [
    { "issueIndex": 1, "status": "ignored", "summary": "Not needed" }
  ]
}
\`\`\``;

			const result = parseActionSummary(response, "error_fix");
			expect(result.actions[0]!.status).toBe("skipped");
		});

		it("normalizes 'enriched' to 'added'", () => {
			const response = `\`\`\`json
{
  "actions": [
    { "issueIndex": 1, "status": "enriched", "summary": "Added docs" }
  ]
}
\`\`\``;

			const result = parseActionSummary(response, "suggestion_enrich");
			expect(result.actions[0]!.status).toBe("added");
		});

		it("defaults unknown status to 'fixed' for error_fix type", () => {
			const response = `\`\`\`json
{
  "actions": [
    { "issueIndex": 1, "status": "completed", "summary": "Done" }
  ]
}
\`\`\``;

			const result = parseActionSummary(response, "error_fix");
			expect(result.actions[0]!.status).toBe("fixed");
		});

		it("defaults unknown status to 'added' for suggestion_enrich type", () => {
			const response = `\`\`\`json
{
  "actions": [
    { "issueIndex": 1, "status": "completed", "summary": "Done" }
  ]
}
\`\`\``;

			const result = parseActionSummary(response, "suggestion_enrich");
			expect(result.actions[0]!.status).toBe("added");
		});
	});

	describe("summary truncation", () => {
		it("truncates summaries longer than 200 characters", () => {
			const longSummary = "A".repeat(250);
			const response = `\`\`\`json
{
  "actions": [
    { "issueIndex": 1, "status": "fixed", "summary": "${longSummary}" }
  ]
}
\`\`\``;

			const result = parseActionSummary(response, "error_fix");
			expect(result.actions[0]!.summary.length).toBe(200);
			expect(result.actions[0]!.summary.endsWith("...")).toBe(true);
		});
	});

	describe("outputType preservation", () => {
		it("preserves valid outputType 'standard'", () => {
			const response = `\`\`\`json
{
  "actions": [
    { "issueIndex": 1, "status": "added", "summary": "Added section", "outputType": "standard" }
  ]
}
\`\`\``;

			const result = parseActionSummary(response, "suggestion_enrich");
			expect(result.actions[0]!.outputType).toBe("standard");
		});

		it("preserves valid outputType 'skill'", () => {
			const response = `\`\`\`json
{
  "actions": [
    { "issueIndex": 1, "status": "added", "summary": "Added section", "outputType": "skill" }
  ]
}
\`\`\``;

			const result = parseActionSummary(response, "suggestion_enrich");
			expect(result.actions[0]!.outputType).toBe("skill");
		});

		it("preserves valid outputType 'generic'", () => {
			const response = `\`\`\`json
{
  "actions": [
    { "issueIndex": 1, "status": "added", "summary": "Added section", "outputType": "generic" }
  ]
}
\`\`\``;

			const result = parseActionSummary(response, "suggestion_enrich");
			expect(result.actions[0]!.outputType).toBe("generic");
		});

		it("normalizes outputType to lowercase", () => {
			const response = `\`\`\`json
{
  "actions": [
    { "issueIndex": 1, "status": "added", "summary": "Added section", "outputType": "Skill" }
  ]
}
\`\`\``;

			const result = parseActionSummary(response, "suggestion_enrich");
			expect(result.actions[0]!.outputType).toBe("skill");
		});

		it("drops unknown outputType values", () => {
			const response = `\`\`\`json
{
  "actions": [
    { "issueIndex": 1, "status": "added", "summary": "Added section", "outputType": "unknown_type" }
  ]
}
\`\`\``;

			const result = parseActionSummary(response, "suggestion_enrich");
			expect(result.actions[0]!.outputType).toBeUndefined();
		});

		it("omits outputType when not provided", () => {
			const response = `\`\`\`json
{
  "actions": [
    { "issueIndex": 1, "status": "added", "summary": "Added section" }
  ]
}
\`\`\``;

			const result = parseActionSummary(response, "suggestion_enrich");
			expect(result.actions[0]!.outputType).toBeUndefined();
			expect("outputType" in result.actions[0]!).toBe(false);
		});
	});

	describe("fallback behavior", () => {
		it("returns parsed: false for undefined input", () => {
			const result = parseActionSummary(undefined, "error_fix");
			expect(result.parsed).toBe(false);
			expect(result.actions).toHaveLength(0);
		});

		it("returns parsed: false for empty string", () => {
			const result = parseActionSummary("", "error_fix");
			expect(result.parsed).toBe(false);
			expect(result.actions).toHaveLength(0);
		});

		it("returns parsed: false when no JSON is present", () => {
			const result = parseActionSummary(
				"I fixed all the issues. Done!",
				"error_fix",
			);
			expect(result.parsed).toBe(false);
			expect(result.actions).toHaveLength(0);
		});

		it("returns parsed: false for invalid JSON", () => {
			const response = `\`\`\`json
{ "actions": [invalid json here }
\`\`\``;

			const result = parseActionSummary(response, "error_fix");
			expect(result.parsed).toBe(false);
		});

		it("returns parsed: false when actions array is empty", () => {
			const response = `\`\`\`json
{ "actions": [] }
\`\`\``;

			const result = parseActionSummary(response, "error_fix");
			expect(result.parsed).toBe(false);
		});

		it("filters out entries without issueIndex", () => {
			const response = `\`\`\`json
{
  "actions": [
    { "status": "fixed", "summary": "No index" },
    { "issueIndex": 1, "status": "fixed", "summary": "Has index" }
  ]
}
\`\`\``;

			const result = parseActionSummary(response, "error_fix");
			expect(result.parsed).toBe(true);
			expect(result.actions).toHaveLength(1);
			expect(result.actions[0]!.issueIndex).toBe(1);
		});
	});
});
