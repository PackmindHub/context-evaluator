import { describe, expect, test } from "bun:test";
import type { Issue, Location } from "@shared/types/evaluation";
import {
	extractSnippetWithContext,
	parseEvaluatorResult,
	populateCrossFileSnippets,
	populateSnippets,
	separateIssuesByType,
} from "./response-parser";

describe("Response Parser", () => {
	describe("parseEvaluatorResult", () => {
		test("should parse direct JSON array", () => {
			const result =
				'[{"category":"test","severity":5,"location":{"start":1,"end":1}}]';
			const parseResult = parseEvaluatorResult(result);

			expect(parseResult.issues).toHaveLength(1);
			expect(parseResult.errors).toHaveLength(0);
			expect(parseResult.issues[0]!.category).toBe("test");
			expect(parseResult.issues[0]!.severity).toBe(5);
		});

		test("should parse JSON array with whitespace", () => {
			const result = `
        [
          {
            "category": "test",
            "severity": 5,
            "location": {"start": 1, "end": 1}
          }
        ]
      `;
			const parseResult = parseEvaluatorResult(result);

			expect(parseResult.issues).toHaveLength(1);
			expect(parseResult.errors).toHaveLength(0);
			expect(parseResult.issues[0]!.category).toBe("test");
		});

		test("should extract JSON array from text wrapper", () => {
			const result = `Here are the issues I found:

[
  {
    "category": "missing_example",
    "severity": 7,
    "problem": "No code examples",
    "location": {"start": 10, "end": 15}
  }
]

Hope this helps!`;

			const parseResult = parseEvaluatorResult(result);

			expect(parseResult.issues).toHaveLength(1);
			expect(parseResult.errors).toHaveLength(0);
			expect(parseResult.issues[0]!.category).toBe("missing_example");
			expect(parseResult.issues[0]!.severity).toBe(7);
			expect(parseResult.issues[0]!.problem).toBe("No code examples");
		});

		test("should parse empty array", () => {
			const result = "[]";
			const parseResult = parseEvaluatorResult(result);

			expect(parseResult.issues).toHaveLength(0);
			expect(parseResult.errors).toHaveLength(0);
		});

		test("should return empty array for empty string", () => {
			const result = "";
			const parseResult = parseEvaluatorResult(result);

			expect(parseResult.issues).toHaveLength(0);
			expect(parseResult.errors).toHaveLength(1);
			expect(parseResult.errors[0]!.category).toBe("parsing");
			expect(parseResult.errors[0]!.severity).toBe("fatal");
		});

		test("should return empty array for whitespace only", () => {
			const result = "   \n  \t  ";
			const parseResult = parseEvaluatorResult(result);

			expect(parseResult.issues).toHaveLength(0);
			expect(parseResult.errors).toHaveLength(1);
			expect(parseResult.errors[0]!.category).toBe("parsing");
		});

		test("should return empty array for invalid JSON", () => {
			const result = "This is not JSON at all";
			const parseResult = parseEvaluatorResult(result);

			expect(parseResult.issues).toHaveLength(0);
			expect(parseResult.errors).toHaveLength(1);
			expect(parseResult.errors[0]!.category).toBe("parsing");
		});

		test("should return empty array when JSON is not an array", () => {
			const result = '{"category":"test","severity":5}';
			const parseResult = parseEvaluatorResult(result);

			expect(parseResult.issues).toHaveLength(0);
			expect(parseResult.errors).toHaveLength(1);
			expect(parseResult.errors[0]!.category).toBe("parsing");
		});

		test("should parse multiple issues", () => {
			const result = `[
        {"category":"issue1","severity":7,"location":{"start":1,"end":1}},
        {"category":"issue2","severity":5,"location":{"start":10,"end":10}},
        {"category":"issue3","severity":9,"location":{"start":20,"end":20}}
      ]`;

			const parseResult = parseEvaluatorResult(result);

			expect(parseResult.issues).toHaveLength(3);
			expect(parseResult.errors).toHaveLength(0);
			expect(parseResult.issues[0]!.category).toBe("issue1");
			expect(parseResult.issues[1]!.category).toBe("issue2");
			expect(parseResult.issues[2]!.category).toBe("issue3");
		});

		test("should handle Claude-style wrapped response", () => {
			const result = `I'll analyze the AGENTS.md file for issues:

\`\`\`json
[
  {
    "category": "incomplete",
    "severity": 6,
    "description": "Missing details",
    "location": {"start": 5, "end": 8}
  }
]
\`\`\`

This issue should be addressed.`;

			const parseResult = parseEvaluatorResult(result);

			expect(parseResult.issues).toHaveLength(1);
			expect(parseResult.errors).toHaveLength(0);
			expect(parseResult.issues[0]!.category).toBe("incomplete");
		});

		test("should parse issues with all optional fields", () => {
			const result = `[
        {
          "category": "test",
          "severity": 8,
          "problem": "Test problem",
          "description": "Test description",
          "title": "Test title",
          "location": {"file": "AGENTS.md", "start": 1, "end": 5},
          "impact": "Test impact",
          "fix": "Test fix",
          "recommendation": "Test recommendation"
        }
      ]`;

			const parseResult = parseEvaluatorResult(result);

			expect(parseResult.issues).toHaveLength(1);
			expect(parseResult.errors).toHaveLength(0);
			expect(parseResult.issues[0]!.problem).toBe("Test problem");
			expect(parseResult.issues[0]!.description).toBe("Test description");
			expect(parseResult.issues[0]!.title).toBe("Test title");
			expect(parseResult.issues[0]!.impact).toBe("Test impact");
			expect(parseResult.issues[0]!.fix).toBe("Test fix");
			expect(parseResult.issues[0]!.recommendation).toBe("Test recommendation");
		});
	});

	describe("extractSnippetWithContext", () => {
		const sampleContent = `Line 1
Line 2
Line 3
Line 4
Line 5
Line 6
Line 7
Line 8
Line 9
Line 10`;

		test("should extract snippet with context lines", () => {
			const location: Location = {
				start: 5,
				end: 5,
			};

			const result = extractSnippetWithContext(sampleContent, location, 2);

			expect(result).toBeDefined();
			expect(result!.content).toBe("Line 3\nLine 4\nLine 5\nLine 6\nLine 7");
			expect(result!.startLine).toBe(3);
			expect(result!.highlightStart).toBe(5);
			expect(result!.highlightEnd).toBe(5);
		});

		test("should extract snippet with no context", () => {
			const location: Location = {
				start: 5,
				end: 5,
			};

			const result = extractSnippetWithContext(sampleContent, location, 0);

			expect(result).toBeDefined();
			expect(result!.content).toBe("Line 5");
			expect(result!.startLine).toBe(5);
			expect(result!.highlightStart).toBe(5);
			expect(result!.highlightEnd).toBe(5);
		});

		test("should extract multi-line snippet", () => {
			const location: Location = {
				start: 4,
				end: 6,
			};

			const result = extractSnippetWithContext(sampleContent, location, 1);

			expect(result).toBeDefined();
			expect(result!.content).toBe("Line 3\nLine 4\nLine 5\nLine 6\nLine 7");
			expect(result!.startLine).toBe(3);
			expect(result!.highlightStart).toBe(4);
			expect(result!.highlightEnd).toBe(6);
		});

		test("should handle snippet at start of file", () => {
			const location: Location = {
				start: 1,
				end: 1,
			};

			const result = extractSnippetWithContext(sampleContent, location, 2);

			expect(result).toBeDefined();
			// Cannot go before line 1, so starts at line 1
			expect(result!.content).toBe("Line 1\nLine 2\nLine 3");
			expect(result!.startLine).toBe(1);
			expect(result!.highlightStart).toBe(1);
			expect(result!.highlightEnd).toBe(1);
		});

		test("should handle snippet at end of file", () => {
			const location: Location = {
				start: 10,
				end: 10,
			};

			const result = extractSnippetWithContext(sampleContent, location, 2);

			expect(result).toBeDefined();
			// Cannot go beyond line 10
			expect(result!.content).toBe("Line 8\nLine 9\nLine 10");
			expect(result!.startLine).toBe(8);
			expect(result!.highlightStart).toBe(10);
			expect(result!.highlightEnd).toBe(10);
		});

		test("should handle array of locations (use first)", () => {
			const locations: Location[] = [
				{ start: 5, end: 5 },
				{ start: 8, end: 8 },
			];

			const result = extractSnippetWithContext(sampleContent, locations, 1);

			expect(result).toBeDefined();
			expect(result!.content).toBe("Line 4\nLine 5\nLine 6");
			expect(result!.startLine).toBe(4);
			expect(result!.highlightStart).toBe(5);
			expect(result!.highlightEnd).toBe(5);
		});

		test("should return undefined for invalid location (start < 1)", () => {
			const location: Location = {
				start: 0,
				end: 5,
			};

			const result = extractSnippetWithContext(sampleContent, location, 2);

			expect(result).toBeUndefined();
		});

		test("should return undefined for invalid location (end < start)", () => {
			const location: Location = {
				start: 5,
				end: 3,
			};

			const result = extractSnippetWithContext(sampleContent, location, 2);

			expect(result).toBeUndefined();
		});

		test("should clamp line range when it exceeds file length", () => {
			const location: Location = {
				start: 20,
				end: 25,
			};

			const result = extractSnippetWithContext(sampleContent, location, 2);

			// Should clamp to file length instead of returning undefined
			expect(result).toBeDefined();
			expect(result!.highlightStart).toBe(10); // Clamped to file length
			expect(result!.highlightEnd).toBe(10); // Clamped to file length
			expect(result!.content).toContain("Line 10");
		});

		test("should return undefined for null location", () => {
			// biome-ignore lint/suspicious/noExplicitAny: Testing with intentional invalid input
			const result = extractSnippetWithContext(sampleContent, null as any, 2);

			expect(result).toBeUndefined();
		});

		test("should return undefined for non-object location", () => {
			const result = extractSnippetWithContext(
				sampleContent,
				// biome-ignore lint/suspicious/noExplicitAny: Testing with intentional invalid input
				"invalid" as any,
				2,
			);

			expect(result).toBeUndefined();
		});

		test("should return undefined for empty snippet content", () => {
			const emptyContent = "\n\n\n\n\n";
			const location: Location = {
				start: 2,
				end: 4,
			};

			const result = extractSnippetWithContext(emptyContent, location, 0);

			expect(result).toBeUndefined();
		});

		test("should handle large context lines", () => {
			const location: Location = {
				start: 5,
				end: 5,
			};

			const result = extractSnippetWithContext(sampleContent, location, 100);

			expect(result).toBeDefined();
			// Should include entire file since context is larger than file
			expect(result!.content).toBe(sampleContent);
			expect(result!.startLine).toBe(1);
			expect(result!.highlightStart).toBe(5);
			expect(result!.highlightEnd).toBe(5);
		});

		test("should clamp end line when it exceeds file length", () => {
			const location: Location = {
				start: 8,
				end: 15, // Exceeds file length of 10
			};

			const result = extractSnippetWithContext(sampleContent, location, 1);

			expect(result).toBeDefined();
			expect(result!.highlightStart).toBe(8);
			expect(result!.highlightEnd).toBe(10); // Clamped to file length
		});
	});

	describe("populateSnippets", () => {
		const sampleContent = Array.from(
			{ length: 57 },
			(_, i) => `Line ${i + 1}`,
		).join("\n");

		test("should populate snippet for valid line range", () => {
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "test",
					severity: 7,
					location: { file: "AGENTS.md", start: 1, end: 5 },
				},
			];
			const contentMap = new Map([["AGENTS.md", sampleContent]]);

			populateSnippets(issues, contentMap);

			expect(issues[0]!.snippetInfo).toBeDefined();
			expect(issues[0]!.snippetInfo?.highlightStart).toBe(1);
			expect(issues[0]!.snippetInfo?.highlightEnd).toBe(5);
		});

		test("should clamp line range when it exceeds file length", () => {
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "test",
					severity: 7,
					location: { file: "AGENTS.md", start: 71, end: 75 },
				},
			];
			const contentMap = new Map([["AGENTS.md", sampleContent]]);

			populateSnippets(issues, contentMap);

			// Should clamp to file length and populate snippet
			expect(issues[0]!.snippetInfo).toBeDefined();
			expect(issues[0]!.snippetInfo?.highlightStart).toBe(57); // Clamped to file length
			expect(issues[0]!.snippetInfo?.highlightEnd).toBe(57); // Clamped to file length
		});

		test("should match file by fuzzy logic when exact path differs", () => {
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "test",
					severity: 7,
					location: { file: "AGENTS.md", start: 1, end: 5 },
				},
			];
			const contentMap = new Map([["docs/AGENTS.md", sampleContent]]);

			populateSnippets(issues, contentMap);

			expect(issues[0]!.snippetInfo).toBeDefined();
		});

		test("should use default content when file not found", () => {
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "test",
					severity: 7,
					location: { start: 1, end: 5 }, // No file property
				},
			];
			const defaultContent =
				"Default Line 1\nDefault Line 2\nDefault Line 3\nDefault Line 4\nDefault Line 5";

			populateSnippets(issues, new Map(), defaultContent);

			expect(issues[0]!.snippetInfo).toBeDefined();
			expect(issues[0]!.snippetInfo?.content).toContain("Default Line");
		});

		test("should populate snippetError when file not found", () => {
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "test",
					severity: 7,
					location: { file: "missing.md", start: 1, end: 5 },
				},
			];

			populateSnippets(issues, new Map());

			expect(issues[0]!.snippetInfo).toBeUndefined();
			expect(issues[0]!.snippetError).toBe("File not found: missing.md");
		});

		test("should populate snippetError when line exceeds file length", () => {
			const shortContent = "Line 1\nLine 2\nLine 3";
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "test",
					severity: 7,
					location: { file: "short.md", start: 10, end: 15 },
				},
			];
			const contentMap = new Map([["short.md", shortContent]]);

			populateSnippets(issues, contentMap);

			// Should still populate snippet (clamped) but also set error for context
			expect(issues[0]!.snippetInfo).toBeDefined();
		});

		test("should prefer root-level file when multiple files have same basename", () => {
			const rootContent = "Root AGENTS.md content\nLine 2\nLine 3";
			const pkgContent = "Package AGENTS.md content\nLine 2\nLine 3";
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "test",
					severity: 7,
					location: { file: "AGENTS.md", start: 1, end: 1 },
				},
			];
			const contentMap = new Map([
				["AGENTS.md", rootContent],
				["packages/AGENTS.md", pkgContent],
			]);

			populateSnippets(issues, contentMap);

			expect(issues[0]!.snippetInfo).toBeDefined();
			expect(issues[0]!.snippet).toContain("Root AGENTS.md content");
			expect(issues[0]!.snippet).not.toContain("Package AGENTS.md content");
		});

		test("should error when multiple files exist but no root-level file", () => {
			const pkg1Content = "Package 1 AGENTS.md";
			const pkg2Content = "Package 2 AGENTS.md";
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "test",
					severity: 7,
					location: { file: "AGENTS.md", start: 1, end: 1 },
				},
			];
			const contentMap = new Map([
				["packages/pkg1/AGENTS.md", pkg1Content],
				["packages/pkg2/AGENTS.md", pkg2Content],
			]);

			populateSnippets(issues, contentMap);

			expect(issues[0]!.snippetInfo).toBeUndefined();
			expect(issues[0]!.snippetError).toContain("Ambiguous file reference");
			expect(issues[0]!.snippetError).toContain("but none at root level");
		});
	});

	describe("populateCrossFileSnippets", () => {
		const file1Content = Array.from(
			{ length: 20 },
			(_, i) => `File1 Line ${i + 1}`,
		).join("\n");
		const file2Content = Array.from(
			{ length: 15 },
			(_, i) => `File2 Line ${i + 1}`,
		).join("\n");

		test("should populate snippets for all affected files", () => {
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "test",
					severity: 7,
					affectedFiles: ["file1.ts", "file2.ts"],
					location: [
						{ file: "file1.ts", start: 10, end: 15 },
						{ file: "file2.ts", start: 5, end: 8 },
					],
				},
			];

			const contentMap = new Map([
				["file1.ts", file1Content],
				["file2.ts", file2Content],
			]);

			populateCrossFileSnippets(issues, contentMap);

			expect(issues[0]!.snippets).toBeDefined();
			expect(issues[0]!.snippets?.length).toBe(2);
			expect(issues[0]!.snippets![0]!.file).toBe("file1.ts");
			expect(issues[0]!.snippets![1]!.file).toBe("file2.ts");
		});

		test("should handle affected files without specific locations", () => {
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "test",
					severity: 7,
					affectedFiles: ["file1.ts"],
					location: { start: 1, end: 1 }, // Single location without file
				},
			];

			const contentMap = new Map([["file1.ts", file1Content]]);

			populateCrossFileSnippets(issues, contentMap);

			expect(issues[0]!.snippets).toBeDefined();
			expect(issues[0]!.snippets?.length).toBe(1);
			// Should show first 20 lines as preview
			expect(issues[0]!.snippets![0]!.highlightStart).toBe(1);
			expect(issues[0]!.snippets![0]!.highlightEnd).toBe(20);
		});

		test("should skip files that cannot be found", () => {
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "test",
					severity: 7,
					affectedFiles: ["file1.ts", "missing.ts"],
					location: [{ file: "file1.ts", start: 5, end: 10 }],
				},
			];

			const contentMap = new Map([["file1.ts", file1Content]]);

			populateCrossFileSnippets(issues, contentMap);

			expect(issues[0]!.snippets).toBeDefined();
			expect(issues[0]!.snippets?.length).toBe(1); // Only found file1.ts
			expect(issues[0]!.snippets![0]!.file).toBe("file1.ts");
		});

		test("should handle issues without affected files", () => {
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "test",
					severity: 7,
					location: { start: 1, end: 5 },
				},
			];

			populateCrossFileSnippets(issues, new Map());

			expect(issues[0]!.snippets).toBeUndefined();
		});
	});

	describe("Multi-file issue validation", () => {
		test("should detect missing file references in multi-file context", () => {
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "Test",
					severity: 7,
					location: { start: 1, end: 5 }, // Missing 'file' field
				},
			];

			const files = [
				{ relativePath: "AGENTS.md" },
				{ relativePath: "frontend/AGENTS.md" },
			];

			const result = separateIssuesByType(issues, files);

			expect(result.validationErrors).toBeDefined();
			expect(result.validationErrors).toHaveLength(1);
			expect(result.validationErrors![0]!).toContain("missing file reference");
		});

		test("should not flag issues with correct file references", () => {
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "Test",
					severity: 7,
					location: { file: "frontend/AGENTS.md", start: 1, end: 5 },
				},
			];

			const files = [
				{ relativePath: "AGENTS.md" },
				{ relativePath: "frontend/AGENTS.md" },
			];

			const result = separateIssuesByType(issues, files);

			expect(result.validationErrors).toBeUndefined();
		});

		test("should handle array locations with file references", () => {
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "Test",
					severity: 7,
					location: [
						{ file: "AGENTS.md", start: 1, end: 5 },
						{ file: "frontend/AGENTS.md", start: 10, end: 15 },
					],
				},
			];

			const files = [
				{ relativePath: "AGENTS.md" },
				{ relativePath: "frontend/AGENTS.md" },
			];

			const result = separateIssuesByType(issues, files);

			expect(result.validationErrors).toBeUndefined();
		});

		test("should flag array locations missing file references", () => {
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "Test",
					severity: 7,
					title: "Test Issue",
					location: [
						{ start: 1, end: 5 }, // Missing file field
						{ file: "frontend/AGENTS.md", start: 10, end: 15 },
					],
				},
			];

			const files = [
				{ relativePath: "AGENTS.md" },
				{ relativePath: "frontend/AGENTS.md" },
			];

			const result = separateIssuesByType(issues, files);

			expect(result.validationErrors).toBeDefined();
			expect(result.validationErrors).toHaveLength(1);
		});

		test("should not validate single-file contexts", () => {
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "Test",
					severity: 7,
					location: { start: 1, end: 5 }, // No file field, but that's OK for single file
				},
			];

			const files = [{ relativePath: "AGENTS.md" }];

			const result = separateIssuesByType(issues, files);

			// No validation errors for single-file context
			expect(result.validationErrors).toBeUndefined();
		});

		test("should separate issues correctly despite validation warnings", () => {
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "Test",
					severity: 7,
					location: { start: 1, end: 5 }, // Missing file
				},
				{
					issueType: "error" as const,
					category: "Test",
					severity: 8,
					location: { file: "frontend/AGENTS.md", start: 10, end: 15 },
				},
			];

			const files = [
				{ relativePath: "AGENTS.md" },
				{ relativePath: "frontend/AGENTS.md" },
			];

			const result = separateIssuesByType(issues, files);

			// Issues should still be separated (with warnings)
			expect(result.validationErrors).toBeDefined();
			expect(result.perFileIssues.size).toBe(2);

			// First issue should default to first file
			expect(result.perFileIssues.get("AGENTS.md")).toHaveLength(1);

			// Second issue should go to correct file
			expect(result.perFileIssues.get("frontend/AGENTS.md")).toHaveLength(1);
		});
	});

	describe("Phantom file handling", () => {
		test("should set special error message for phantom files", () => {
			const issues: Issue[] = [
				{
					category: "Subdirectory Coverage",
					issueType: "suggestion",
					impactLevel: "High",
					location: {
						file: "packages/frontend/AGENTS.md",
						start: 1,
						end: 1,
					},
					isPhantomFile: true,
				} as Issue,
			];

			populateSnippets(issues, new Map());

			expect(issues[0]!.snippetError).toBe(
				"Suggested file location (does not exist yet): packages/frontend/AGENTS.md",
			);
		});

		test("should set regular error for non-phantom missing files", () => {
			const issues: Issue[] = [
				{
					category: "Test",
					issueType: "error",
					severity: 7,
					location: {
						file: "missing.md",
						start: 1,
						end: 5,
					},
					// isPhantomFile not set
				} as Issue,
			];

			populateSnippets(issues, new Map());

			expect(issues[0]!.snippetError).toBe("File not found: missing.md");
		});

		test("should handle phantom file with isPhantomFile=false as regular missing file", () => {
			const issues: Issue[] = [
				{
					category: "Test",
					issueType: "error",
					severity: 7,
					location: {
						file: "missing.md",
						start: 1,
						end: 5,
					},
					isPhantomFile: false,
				} as Issue,
			];

			populateSnippets(issues, new Map());

			expect(issues[0]!.snippetError).toBe("File not found: missing.md");
		});
	});

	describe("File extract content matching with multiple files", () => {
		// Create sample content for different files
		const rootAgentsContent = `# Root AGENTS.md
Line 2
Line 3: Root file content
Line 4
Line 5: Important instructions`;

		const pkgUiAgentsContent = `# UI Package AGENTS.md
Line 2
Line 3: UI file content
Line 4
Line 5: UI-specific instructions`;

		const pkgApiAgentsContent = `# API Package AGENTS.md
Line 2
Line 3: API file content
Line 4
Line 5: API-specific instructions`;

		test("should extract content from single AGENTS.md file", () => {
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "test",
					severity: 7,
					location: { file: "AGENTS.md", start: 3, end: 3 },
				},
			];
			const contentMap = new Map([["AGENTS.md", rootAgentsContent]]);

			populateSnippets(issues, contentMap);

			expect(issues[0]!.snippetInfo).toBeDefined();
			expect(issues[0]!.snippetInfo?.content).toContain("Root file content");
			expect(issues[0]!.snippetInfo?.highlightStart).toBe(3);
		});

		test("should extract correct content from packages/ui/AGENTS.md", () => {
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "test",
					severity: 7,
					location: { file: "packages/ui/AGENTS.md", start: 3, end: 3 },
				},
			];
			const contentMap = new Map([
				["packages/ui/AGENTS.md", pkgUiAgentsContent],
			]);

			populateSnippets(issues, contentMap);

			expect(issues[0]!.snippetInfo).toBeDefined();
			expect(issues[0]!.snippetInfo?.content).toContain("UI file content");
			expect(issues[0]!.snippetInfo?.content).not.toContain(
				"Root file content",
			);
			expect(issues[0]!.snippetInfo?.highlightStart).toBe(3);
		});

		test("should extract correct content when multiple AGENTS.md files exist", () => {
			// This is the key test for the bug fix
			const rootIssue: Issue = {
				issueType: "error" as const,
				category: "test",
				severity: 7,
				location: { file: "AGENTS.md", start: 3, end: 3 },
			};
			const uiIssue: Issue = {
				issueType: "error" as const,
				category: "test",
				severity: 7,
				location: { file: "packages/ui/AGENTS.md", start: 3, end: 3 },
			};
			const issues = [rootIssue, uiIssue];

			const contentMap = new Map([
				["AGENTS.md", rootAgentsContent],
				["packages/ui/AGENTS.md", pkgUiAgentsContent],
			]);

			populateSnippets(issues, contentMap);

			// Root issue should have root content
			expect(issues[0]!.snippetInfo?.content).toContain("Root file content");
			expect(issues[0]!.snippetInfo?.content).not.toContain("UI file content");

			// UI issue should have UI content
			expect(issues[1]!.snippetInfo?.content).toContain("UI file content");
			expect(issues[1]!.snippetInfo?.content).not.toContain(
				"Root file content",
			);
		});

		test("should extract correct content from nested AGENTS.md files", () => {
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "test",
					severity: 7,
					location: { file: "packages/api/AGENTS.md", start: 3, end: 3 },
				},
				{
					issueType: "error" as const,
					category: "test",
					severity: 7,
					location: { file: "packages/ui/AGENTS.md", start: 3, end: 3 },
				},
			];

			const contentMap = new Map([
				["packages/api/AGENTS.md", pkgApiAgentsContent],
				["packages/ui/AGENTS.md", pkgUiAgentsContent],
			]);

			populateSnippets(issues, contentMap);

			expect(issues[0]!.snippetInfo?.content).toContain("API file content");
			expect(issues[0]!.snippetInfo?.content).not.toContain("UI file content");

			expect(issues[1]!.snippetInfo?.content).toContain("UI file content");
			expect(issues[1]!.snippetInfo?.content).not.toContain("API file content");
		});

		test("should report error when basename-only reference has multiple matches (no exact match)", () => {
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "test",
					severity: 7,
					location: { file: "AGENTS.md", start: 3, end: 3 },
				},
			];

			// No exact match for "AGENTS.md", but multiple files with that basename
			const contentMap = new Map([
				["packages/api/AGENTS.md", pkgApiAgentsContent],
				["packages/ui/AGENTS.md", pkgUiAgentsContent],
			]);

			populateSnippets(issues, contentMap);

			// Should have an error indicating ambiguity
			expect(issues[0]!.snippetError).toBeDefined();
			expect(issues[0]!.snippetError).toContain("Ambiguous");
			expect(issues[0]!.snippetError).toContain("AGENTS.md");
		});

		test("should allow basename-only reference when only one file with that name exists", () => {
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "test",
					severity: 7,
					location: { file: "AGENTS.md", start: 3, end: 3 },
				},
			];

			// Only one file with basename AGENTS.md
			const contentMap = new Map([["AGENTS.md", rootAgentsContent]]);

			populateSnippets(issues, contentMap);

			expect(issues[0]!.snippetInfo).toBeDefined();
			expect(issues[0]!.snippetInfo?.content).toContain("Root file content");
			// Should not have error since there's no ambiguity
			expect(issues[0]!.snippetError).toBeUndefined();
		});

		test("should handle line number extraction for different files correctly", () => {
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "test",
					severity: 7,
					location: { file: "AGENTS.md", start: 5, end: 5 },
				},
				{
					issueType: "error" as const,
					category: "test",
					severity: 7,
					location: { file: "packages/ui/AGENTS.md", start: 5, end: 5 },
				},
			];

			const contentMap = new Map([
				["AGENTS.md", rootAgentsContent],
				["packages/ui/AGENTS.md", pkgUiAgentsContent],
			]);

			populateSnippets(issues, contentMap);

			// Both should have snippets, but with different content
			expect(issues[0]!.snippetInfo?.content).toContain(
				"Important instructions",
			);
			expect(issues[0]!.snippetInfo?.content).not.toContain("UI-specific");

			expect(issues[1]!.snippetInfo?.content).toContain(
				"UI-specific instructions",
			);
			expect(issues[1]!.snippetInfo?.content).not.toContain(
				"Important instructions",
			);

			// Both should report correct line numbers
			expect(issues[0]!.snippetInfo?.highlightStart).toBe(5);
			expect(issues[1]!.snippetInfo?.highlightStart).toBe(5);
		});

		test("should preserve full paths in error messages", () => {
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "test",
					severity: 7,
					location: { file: "packages/missing/AGENTS.md", start: 1, end: 1 },
				},
			];

			const contentMap = new Map([
				["AGENTS.md", rootAgentsContent],
				["packages/ui/AGENTS.md", pkgUiAgentsContent],
			]);

			populateSnippets(issues, contentMap);

			expect(issues[0]!.snippetError).toBe(
				"File not found: packages/missing/AGENTS.md",
			);
		});

		test("should work correctly with cross-file issues using full paths", () => {
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "test",
					severity: 7,
					affectedFiles: ["AGENTS.md", "packages/ui/AGENTS.md"],
					location: [
						{ file: "AGENTS.md", start: 3, end: 3 },
						{ file: "packages/ui/AGENTS.md", start: 3, end: 3 },
					],
				},
			];

			const contentMap = new Map([
				["AGENTS.md", rootAgentsContent],
				["packages/ui/AGENTS.md", pkgUiAgentsContent],
			]);

			populateCrossFileSnippets(issues, contentMap);

			expect(issues[0]!.snippets).toBeDefined();
			expect(issues[0]!.snippets?.length).toBe(2);
			expect(issues[0]!.snippets![0]!.content).toContain("Root file content");
			expect(issues[0]!.snippets![1]!.content).toContain("UI file content");
		});

		test("should handle mixed path formats consistently", () => {
			// Some issues use full paths, some use basenames
			const issues: Issue[] = [
				{
					issueType: "error" as const,
					category: "test",
					severity: 7,
					location: { file: "AGENTS.md", start: 3, end: 3 },
				},
				{
					issueType: "error" as const,
					category: "test",
					severity: 7,
					location: { file: "packages/ui/AGENTS.md", start: 3, end: 3 },
				},
			];

			// Only subdirectory files (no root AGENTS.md)
			const contentMap = new Map([
				["packages/api/AGENTS.md", pkgApiAgentsContent],
				["packages/ui/AGENTS.md", pkgUiAgentsContent],
			]);

			populateSnippets(issues, contentMap);

			// Second issue should work fine with full path
			expect(issues[1]!.snippetInfo?.content).toContain("UI file content");

			// First issue should error because it's ambiguous (basename-only with multiple matches)
			expect(issues[0]!.snippetError).toBeDefined();
			expect(issues[0]!.snippetError).toContain("Ambiguous");
		});
	});

	describe("Semantic Anchor Recommendations", () => {
		test("should parse issue with semantic anchor fix", () => {
			const result = `[{
      "category": "Language Clarity",
      "severity": 7,
      "problem": "Vague reference without specificity",
      "location": {"file": "AGENTS.md", "start": 10, "end": 12},
      "fix": "Replace with semantic anchor: 'Follow Clean Architecture'. See: https://github.com/LLM-Coding/Semantic-Anchors"
    }]`;

			const parseResult = parseEvaluatorResult(result);
			expect(parseResult.issues).toHaveLength(1);
			expect(parseResult.issues[0]!.fix).toContain("semantic anchor");
			expect(parseResult.issues[0]!.fix).toContain(
				"github.com/LLM-Coding/Semantic-Anchors",
			);
		});

		test("should preserve semantic anchor recommendation field", () => {
			const result = `[{
      "category": "Content Quality & Focus",
      "severity": 8,
      "problem": "Vague imperative",
      "location": {"file": "AGENTS.md", "start": 34, "end": 34},
      "recommendation": "Consider using semantic anchors like 'Testing Pyramid (Mike Cohn)' instead of vague 'test well'. See: https://github.com/LLM-Coding/Semantic-Anchors"
    }]`;

			const parseResult = parseEvaluatorResult(result);
			expect(parseResult.issues[0]!.recommendation).toBeDefined();
			expect(parseResult.issues[0]!.recommendation).toContain(
				"semantic anchors",
			);
		});

		test("should handle issue with both fix and recommendation", () => {
			const result = `[{
      "category": "Language Clarity",
      "severity": 6,
      "problem": "Ambiguous reference",
      "location": {"file": "AGENTS.md", "start": 45, "end": 47},
      "fix": "Clarify the antecedent for 'it' in line 47",
      "recommendation": "Also consider using semantic anchors for methodology references. See: https://github.com/LLM-Coding/Semantic-Anchors"
    }]`;

			const parseResult = parseEvaluatorResult(result);
			expect(parseResult.issues[0]!.fix).toBeDefined();
			expect(parseResult.issues[0]!.recommendation).toBeDefined();
		});

		test("should parse issue with SOLID principles semantic anchor", () => {
			const result = `[{
      "category": "Content Quality & Focus",
      "severity": 8,
      "problem": "Non-specific imperative 'write maintainable code' without criteria",
      "location": {"file": "AGENTS.md", "start": 34, "end": 34},
      "fix": "Replace with semantic anchor: 'Follow SOLID Principles (Robert C. Martin): Single Responsibility, Open-Closed, Liskov Substitution, Interface Segregation, Dependency Inversion for maintainable object-oriented design'. See: https://github.com/LLM-Coding/Semantic-Anchors"
    }]`;

			const parseResult = parseEvaluatorResult(result);
			expect(parseResult.issues).toHaveLength(1);
			expect(parseResult.issues[0]!.fix).toContain("SOLID Principles");
			expect(parseResult.issues[0]!.fix).toContain("Robert C. Martin");
			expect(parseResult.issues[0]!.fix).toContain(
				"github.com/LLM-Coding/Semantic-Anchors",
			);
		});

		test("should parse issue with Testing Pyramid semantic anchor", () => {
			const result = `[{
      "category": "Content Quality & Focus",
      "severity": 7,
      "problem": "Vague imperative 'follow testing best practices' without specificity",
      "location": {"file": "AGENTS.md", "start": 67, "end": 68},
      "fix": "Replace with semantic anchor: 'Follow the Testing Pyramid (Mike Cohn): majority unit tests at base, fewer integration tests in middle, minimal E2E tests at top'. See: https://github.com/LLM-Coding/Semantic-Anchors"
    }]`;

			const parseResult = parseEvaluatorResult(result);
			expect(parseResult.issues).toHaveLength(1);
			expect(parseResult.issues[0]!.fix).toContain("Testing Pyramid");
			expect(parseResult.issues[0]!.fix).toContain("Mike Cohn");
		});
	});

	describe("JSON parsing error detection", () => {
		test("detects unquoted key", () => {
			const input =
				'[{category: "test", severity: 8, location: {start: 1, end: 1}}]';
			const result = parseEvaluatorResult(input);

			// Should have parsing errors
			expect(result.errors.length).toBeGreaterThan(0);

			// Error context should include detection
			const error = result.errors[0]!;
			expect(error.context?.errorType).toBe("unquoted_key");
			expect(error.context?.suggestedFix).toBeDefined();
			expect(error.context?.suggestedFix).toContain("double quotes");
		});

		test("detects unquoted value", () => {
			const input =
				'[{"category": "test", "severity": high, "location": {"start": 1, "end": 1}}]';
			const result = parseEvaluatorResult(input);

			// Should have parsing errors
			expect(result.errors.length).toBeGreaterThan(0);

			// Error context should include detection
			const error = result.errors[0]!;
			expect(error.context?.errorType).toBe("unquoted_value");
			expect(error.context?.suggestedFix).toBeDefined();
		});

		test("extracts JSON from text wrapper successfully", () => {
			// Note: This is actually handled correctly - the parser extracts the JSON array
			const input =
				'Here are the issues: [{"category": "test", "severity": 8, "location": {"start": 1, "end": 1}}]';
			const result = parseEvaluatorResult(input);

			// Should successfully extract the JSON despite the text before it
			expect(result.issues.length).toBe(1);
			expect(result.errors.length).toBe(0);
		});

		test("detects single quotes", () => {
			const input =
				"[{'category': 'test', 'severity': 8, 'location': {'start': 1, 'end': 1}}]";
			const result = parseEvaluatorResult(input);

			// Should have parsing errors
			expect(result.errors.length).toBeGreaterThan(0);

			// Error context should include detection
			const error = result.errors[0]!;
			expect(error.context?.errorType).toBe("single_quotes");
			expect(error.context?.suggestedFix).toContain("double quotes");
		});

		test("filters out issues with number as string (caught by validation)", () => {
			// Note: "severity": "8" is valid JSON syntax, but filtered by validateIssues
			// since severity must be a number type, not a string
			const input =
				'[{"category": "test", "severity": "8", "location": {"start": 1, "end": 1}}]';
			const result = parseEvaluatorResult(input);

			// JSON parses successfully, but issue is filtered out by validation
			expect(result.issues.length).toBe(0);
			expect(result.errors.length).toBe(0);
		});

		test("detects unclosed brackets", () => {
			const input = '[{"category": "test", "severity": 8';
			const result = parseEvaluatorResult(input);

			// Should have parsing errors
			expect(result.errors.length).toBeGreaterThan(0);

			// Error context should include detection
			const error = result.errors[0]!;
			expect(error.context?.errorType).toBe("unclosed_brackets");
			expect(error.context?.suggestedFix).toContain("Close all brackets");
		});

		test("provides helpful error messages for unquoted keys", () => {
			const input =
				'[{category: "Markdown Syntax", severity: 8, problem: "Broken link"}]';
			const result = parseEvaluatorResult(input);

			expect(result.errors.length).toBeGreaterThan(0);
			const error = result.errors[0]!;

			// Should have all context
			expect(error.context?.errorType).toBe("unquoted_key");
			expect(error.context?.suggestedFix).toContain("double quotes");
			expect(error.context?.matchedContent).toBeDefined();
			expect(error.context?.commonMistakes).toBeDefined();
		});
	});
});
