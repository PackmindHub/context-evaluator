import { describe, expect, test } from "bun:test";

// Import types for testing
import type { IProjectContext } from "@shared/types/evaluation";

// Helper functions to test parsing logic (replicated from module for testing)

function formatClocOutput(clocJson: string | null): string {
	if (!clocJson) {
		return "CLOC analysis not available (tool not installed or timed out)";
	}

	try {
		const data = JSON.parse(clocJson);
		const lines: string[] = [];

		const languages = Object.entries(data)
			.filter(([key]) => key !== "header" && key !== "SUM")
			.map(([lang, rawStats]) => {
				const stats = rawStats as {
					nFiles?: number;
					code?: number;
					comment?: number;
					blank?: number;
				};
				return {
					language: lang,
					files: stats.nFiles || 0,
					code: stats.code || 0,
					comment: stats.comment || 0,
					blank: stats.blank || 0,
				};
			})
			.sort((a, b) => b.code - a.code);

		if (languages.length === 0) {
			return "No code files detected by CLOC";
		}

		lines.push("Language breakdown (by lines of code):");
		for (const lang of languages.slice(0, 10)) {
			lines.push(
				`  ${lang.language}: ${lang.code} lines (${lang.files} files)`,
			);
		}

		const sum = data.SUM;
		if (sum) {
			lines.push("");
			lines.push(`Total: ${sum.code} lines of code in ${sum.nFiles} files`);
		}

		return lines.join("\n");
	} catch {
		return "CLOC output could not be parsed";
	}
}

interface IFolderDescription {
	path: string;
	description: string;
}

function parseKeyFolders(response: string): IFolderDescription[] {
	const keyFolders: IFolderDescription[] = [];

	const keyFoldersMatch = response.match(
		/Key Folders:?\s*\n((?:[-*]\s+.+\n?)+)/i,
	);
	if (!keyFoldersMatch || !keyFoldersMatch[1]) {
		return keyFolders;
	}

	const foldersBlock = keyFoldersMatch[1];
	const lines = foldersBlock
		.split("\n")
		.filter(
			(line) => line.trim().startsWith("-") || line.trim().startsWith("*"),
		);

	for (const line of lines) {
		const content = line.replace(/^[-*]\s*/, "").trim();
		if (!content) continue;

		const separatorMatch = content.match(
			/^([^\s-:]+(?:\/[^\s-:]+)*)\s*[-:]\s*(.+)$/,
		);
		if (separatorMatch && separatorMatch[1] && separatorMatch[2]) {
			keyFolders.push({
				path: separatorMatch[1].trim(),
				description: separatorMatch[2].trim(),
			});
		}
	}

	return keyFolders.slice(0, 20);
}

function parseContextResponse(
	response: string,
	clocSummary?: string,
	agentsFilePaths?: string[],
): IProjectContext {
	const defaultContext: IProjectContext = {
		languages: "Unknown",
		frameworks: "Unknown",
		architecture: "Unknown",
		patterns: "Unknown",
		raw: response,
		clocSummary,
		agentsFilePaths,
	};

	if (!response) {
		return defaultContext;
	}

	const languagesMatch = response.match(/Languages?:\s*(.+?)(?:\n|$)/i);
	const frameworksMatch = response.match(/Frameworks?:\s*(.+?)(?:\n|$)/i);
	const architectureMatch = response.match(/Architecture?:\s*(.+?)(?:\n|$)/i);
	const patternsMatch = response.match(/Patterns?:\s*(.+?)(?:\n|$)/i);

	const keyFolders = parseKeyFolders(response);

	const rawParts: string[] = [];
	if (
		clocSummary &&
		clocSummary !==
			"CLOC analysis not available (tool not installed or timed out)"
	) {
		rawParts.push(clocSummary);
		rawParts.push("");
	}
	rawParts.push(response.trim());
	const combinedRaw = rawParts.join("\n");

	return {
		languages: languagesMatch?.[1]?.trim() || defaultContext.languages,
		frameworks: frameworksMatch?.[1]?.trim() || defaultContext.frameworks,
		architecture: architectureMatch?.[1]?.trim() || defaultContext.architecture,
		patterns: patternsMatch?.[1]?.trim() || defaultContext.patterns,
		raw: combinedRaw,
		clocSummary,
		keyFolders: keyFolders.length > 0 ? keyFolders : undefined,
		agentsFilePaths,
	};
}

describe("Context Identifier", () => {
	describe("formatClocOutput", () => {
		test("should return not available message for null input", () => {
			const result = formatClocOutput(null);
			expect(result).toBe(
				"CLOC analysis not available (tool not installed or timed out)",
			);
		});

		test("should return could not parse for invalid JSON", () => {
			const result = formatClocOutput("not valid json");
			expect(result).toBe("CLOC output could not be parsed");
		});

		test("should return no files detected for empty data", () => {
			const result = formatClocOutput(JSON.stringify({}));
			expect(result).toBe("No code files detected by CLOC");
		});

		test("should format valid CLOC JSON output", () => {
			const clocData = {
				TypeScript: { nFiles: 50, code: 5000, comment: 500, blank: 300 },
				JavaScript: { nFiles: 10, code: 1000, comment: 100, blank: 50 },
				SUM: { nFiles: 60, code: 6000, comment: 600, blank: 350 },
			};

			const result = formatClocOutput(JSON.stringify(clocData));

			expect(result).toContain("Language breakdown");
			expect(result).toContain("TypeScript: 5000 lines (50 files)");
			expect(result).toContain("JavaScript: 1000 lines (10 files)");
			expect(result).toContain("Total: 6000 lines of code in 60 files");
		});

		test("should sort languages by code lines descending", () => {
			const clocData = {
				JavaScript: { nFiles: 10, code: 1000 },
				TypeScript: { nFiles: 50, code: 5000 },
				CSS: { nFiles: 5, code: 500 },
			};

			const result = formatClocOutput(JSON.stringify(clocData));
			const lines = result.split("\n");

			// TypeScript (5000) should appear before JavaScript (1000)
			const tsIndex = lines.findIndex((l) => l.includes("TypeScript"));
			const jsIndex = lines.findIndex((l) => l.includes("JavaScript"));
			expect(tsIndex).toBeLessThan(jsIndex);
		});

		test("should limit to top 10 languages", () => {
			const clocData: Record<string, { nFiles: number; code: number }> = {};
			for (let i = 1; i <= 15; i++) {
				clocData[`Language${i}`] = { nFiles: i, code: i * 100 };
			}

			const result = formatClocOutput(JSON.stringify(clocData));
			const languageLines = result
				.split("\n")
				.filter((l) => l.includes("lines ("));
			expect(languageLines.length).toBe(10);
		});

		test("should ignore header field", () => {
			const clocData = {
				header: { version: "1.0" },
				TypeScript: { nFiles: 50, code: 5000 },
			};

			const result = formatClocOutput(JSON.stringify(clocData));
			expect(result).not.toContain("header");
		});
	});

	describe("parseKeyFolders", () => {
		test("should return empty array for response without key folders", () => {
			const result = parseKeyFolders("Some response without key folders");
			expect(result).toEqual([]);
		});

		test("should parse dash-separated folder descriptions", () => {
			const response = `
Some intro text

Key Folders:
- src/api - REST API endpoints
- src/components - React UI components
- tests - Unit and integration tests

More text
`;

			const result = parseKeyFolders(response);

			expect(result).toHaveLength(3);
			expect(result[0]!).toEqual({
				path: "src/api",
				description: "REST API endpoints",
			});
			expect(result[1]!).toEqual({
				path: "src/components",
				description: "React UI components",
			});
		});

		test("should parse colon-separated folder descriptions", () => {
			const response = `
Key Folders:
- src/api: REST API endpoints
- src/models: Database models
`;

			const result = parseKeyFolders(response);

			expect(result).toHaveLength(2);
			expect(result[0]!.path).toBe("src/api");
			expect(result[0]!.description).toBe("REST API endpoints");
		});

		test("should handle asterisk bullet points", () => {
			const response = `
Key Folders:
* src/api - REST API endpoints
* lib - Shared utilities
`;

			const result = parseKeyFolders(response);

			expect(result).toHaveLength(2);
			expect(result[0]!.path).toBe("src/api");
		});

		test("should limit to 20 folders", () => {
			const folders = Array.from(
				{ length: 25 },
				(_, i) => `- folder${i} - Description ${i}`,
			).join("\n");
			const response = `Key Folders:\n${folders}`;

			const result = parseKeyFolders(response);

			expect(result.length).toBe(20);
		});

		test("should skip lines without proper separator", () => {
			const response = `
Key Folders:
- src/api - REST endpoints
- invalid line without separator
- src/models - Database models
`;

			const result = parseKeyFolders(response);

			// "invalid line without separator" doesn't match the pattern
			expect(result).toHaveLength(2);
		});
	});

	describe("parseContextResponse", () => {
		test("should return default context for empty response", () => {
			const result = parseContextResponse("");

			expect(result.languages).toBe("Unknown");
			expect(result.frameworks).toBe("Unknown");
			expect(result.architecture).toBe("Unknown");
			expect(result.patterns).toBe("Unknown");
		});

		test("should parse languages from response", () => {
			const response = "Languages: TypeScript, JavaScript\nOther text";
			const result = parseContextResponse(response);

			expect(result.languages).toBe("TypeScript, JavaScript");
		});

		test("should parse frameworks from response", () => {
			const response = "Framework: React, Express\nLanguages: TypeScript";
			const result = parseContextResponse(response);

			expect(result.frameworks).toBe("React, Express");
		});

		test("should parse architecture from response", () => {
			const response = "Architecture: Monorepo with microservices";
			const result = parseContextResponse(response);

			expect(result.architecture).toBe("Monorepo with microservices");
		});

		test("should parse patterns from response", () => {
			const response = "Patterns: MVC, Repository pattern";
			const result = parseContextResponse(response);

			expect(result.patterns).toBe("MVC, Repository pattern");
		});

		test("should include CLOC summary in raw when available", () => {
			const response = "Languages: TypeScript";
			const clocSummary = "TypeScript: 5000 lines";

			const result = parseContextResponse(response, clocSummary);

			expect(result.raw).toContain(clocSummary);
			expect(result.raw).toContain(response);
			expect(result.clocSummary).toBe(clocSummary);
		});

		test("should not include CLOC not available message in raw", () => {
			const response = "Languages: TypeScript";
			const clocSummary =
				"CLOC analysis not available (tool not installed or timed out)";

			const result = parseContextResponse(response, clocSummary);

			expect(result.raw).not.toContain("CLOC analysis not available");
		});

		test("should include agentsFilePaths in result", () => {
			const result = parseContextResponse("Some response", undefined, [
				"CLAUDE.md",
				"packages/core/AGENTS.md",
			]);

			expect(result.agentsFilePaths).toEqual([
				"CLAUDE.md",
				"packages/core/AGENTS.md",
			]);
		});

		test("should parse key folders when present", () => {
			const response = `
Languages: TypeScript
Frameworks: React

Key Folders:
- src/api - REST endpoints
- src/components - UI components
`;

			const result = parseContextResponse(response);

			expect(result.keyFolders).toBeDefined();
			expect(result.keyFolders).toHaveLength(2);
		});

		test("should not include keyFolders when none parsed", () => {
			const response = "Languages: TypeScript";
			const result = parseContextResponse(response);

			expect(result.keyFolders).toBeUndefined();
		});

		test("should handle all fields at once", () => {
			const response = `
Languages: TypeScript, JavaScript
Frameworks: React, Node.js
Architecture: Full-stack monolith
Patterns: Component-based, REST API

Key Folders:
- src - Main source code
`;

			const result = parseContextResponse(response, "CLOC summary here", [
				"CLAUDE.md",
			]);

			expect(result.languages).toBe("TypeScript, JavaScript");
			expect(result.frameworks).toBe("React, Node.js");
			expect(result.architecture).toBe("Full-stack monolith");
			expect(result.patterns).toBe("Component-based, REST API");
			expect(result.clocSummary).toBe("CLOC summary here");
			expect(result.agentsFilePaths).toEqual(["CLAUDE.md"]);
			expect(result.keyFolders).toHaveLength(1);
		});
	});
});
