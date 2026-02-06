import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { discoverLinkedDocs, extractMarkdownLinks } from "./docs-finder";

describe("Docs Finder", () => {
	const testDir = join(process.cwd(), "test", "temp", "docs-finder-test");

	beforeAll(async () => {
		await mkdir(testDir, { recursive: true });
	});

	afterAll(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	describe("extractMarkdownLinks", () => {
		test("extracts inline Markdown links to .md files", () => {
			const content = `
# Documentation

See [Architecture Guide](./docs/architecture.md) for details.
Also check [API Reference](api/reference.md).
`;
			const sourcePath = join(testDir, "AGENTS.md");

			const links = extractMarkdownLinks(content, sourcePath);

			expect(links).toHaveLength(2);
			expect(links[0]!.rawPath).toBe("./docs/architecture.md");
			expect(links[0]!.linkText).toBe("Architecture Guide");
			expect(links[1]!.rawPath).toBe("api/reference.md");
			expect(links[1]!.linkText).toBe("API Reference");
		});

		test("extracts reference-style links", () => {
			const content = `
# Documentation

See [arch] for architecture details.

[arch]: ./docs/architecture.md
`;
			const sourcePath = join(testDir, "AGENTS.md");

			const links = extractMarkdownLinks(content, sourcePath);

			expect(links).toHaveLength(1);
			expect(links[0]!.rawPath).toBe("./docs/architecture.md");
			expect(links[0]!.linkText).toBe("arch");
		});

		test("excludes external URLs (http/https)", () => {
			const content = `
See [External](https://example.com/docs.md) for external docs.
Also [HTTP Link](http://example.com/guide.md).
`;
			const sourcePath = join(testDir, "AGENTS.md");

			const links = extractMarkdownLinks(content, sourcePath);

			expect(links).toHaveLength(0);
		});

		test("excludes anchor-only links", () => {
			const content = `
See [Section](#section-name) for this section.
Also [Another Section](#another).
`;
			const sourcePath = join(testDir, "AGENTS.md");

			const links = extractMarkdownLinks(content, sourcePath);

			expect(links).toHaveLength(0);
		});

		test("excludes self-references to AGENTS.md and CLAUDE.md", () => {
			const content = `
See [Main Config](./AGENTS.md) for main config.
Also [Claude Config](../CLAUDE.md).
And [Sub Agents](./subdir/AGENTS.md).
`;
			const sourcePath = join(testDir, "AGENTS.md");

			const links = extractMarkdownLinks(content, sourcePath);

			expect(links).toHaveLength(0);
		});

		test("excludes self-references to copilot-instructions.md", () => {
			const content = `
See [Copilot Config](./.github/copilot-instructions.md) for copilot config.
Also [Nested Copilot](../.github/copilot/copilot-instructions.md).
`;
			const sourcePath = join(testDir, "AGENTS.md");

			const links = extractMarkdownLinks(content, sourcePath);

			expect(links).toHaveLength(0);
		});

		test("resolves relative paths correctly", () => {
			const content = `
See [Guide](./docs/guide.md) for guide.
See [Parent](../other/file.md) for parent.
See [Deep](./a/b/c.md) for deep.
`;
			const sourcePath = join(testDir, "subdir", "AGENTS.md");

			const links = extractMarkdownLinks(content, sourcePath);

			expect(links).toHaveLength(3);
			expect(links[0]!.absolutePath).toBe(
				resolve(testDir, "subdir", "docs", "guide.md"),
			);
			expect(links[1]!.absolutePath).toBe(resolve(testDir, "other", "file.md"));
			expect(links[2]!.absolutePath).toBe(
				resolve(testDir, "subdir", "a", "b", "c.md"),
			);
		});

		test("deduplicates identical links", () => {
			const content = `
See [Guide](./docs/guide.md) for guide.
Also [Guide Again](./docs/guide.md) for the same guide.
And [Same Path](docs/guide.md) which resolves the same.
`;
			const sourcePath = join(testDir, "AGENTS.md");

			const links = extractMarkdownLinks(content, sourcePath);

			// First two have same path, third may differ due to "./" prefix
			// But all should resolve to the same absolute path
			expect(links.length).toBeLessThanOrEqual(2);
		});

		test("handles links with anchors (removes anchor from path)", () => {
			const content = `
See [Guide Section](./docs/guide.md#section-name) for section.
`;
			const sourcePath = join(testDir, "AGENTS.md");

			const links = extractMarkdownLinks(content, sourcePath);

			expect(links).toHaveLength(1);
			expect(links[0]!.rawPath).toBe("./docs/guide.md");
			expect(links[0]!.absolutePath).toBe(resolve(testDir, "docs", "guide.md"));
		});

		test("handles mixed link types in same document", () => {
			const content = `
# Documentation

See [Inline](./docs/inline.md) for inline.
Check [External](https://example.com/ext.md) for external.
And [Anchor](#anchor) for anchor.
Also [Self](./AGENTS.md) for self.

[ref]: ./docs/reference.md
`;
			const sourcePath = join(testDir, "AGENTS.md");

			const links = extractMarkdownLinks(content, sourcePath);

			expect(links).toHaveLength(2);
			expect(links.map((l) => l.rawPath)).toContain("./docs/inline.md");
			expect(links.map((l) => l.rawPath)).toContain("./docs/reference.md");
		});

		test("returns empty array for content with no links", () => {
			const content = `
# Documentation

This is just plain text with no links.
`;
			const sourcePath = join(testDir, "AGENTS.md");

			const links = extractMarkdownLinks(content, sourcePath);

			expect(links).toHaveLength(0);
		});

		test("extracts links from real-world example", () => {
			const content = `
# AGENTS.md

## Architecture

For detailed architecture information, see:
- [System Design](./docs/architecture/system-design.md)
- [API Layer](./docs/api/overview.md)
- [Database Schema](./docs/database/schema.md)

## Quick Links

[Quick Start][quickstart]
[Contributing][contrib]

[quickstart]: ./docs/getting-started.md
[contrib]: ./CONTRIBUTING.md
`;
			const sourcePath = join(testDir, "AGENTS.md");

			const links = extractMarkdownLinks(content, sourcePath);

			// Should find: system-design.md, overview.md, schema.md, getting-started.md, CONTRIBUTING.md
			// (CONTRIBUTING.md is not excluded - only AGENTS.md and CLAUDE.md are)
			expect(links).toHaveLength(5);
		});
	});

	describe("discoverLinkedDocs", () => {
		test("discovers docs from single AGENTS.md file", async () => {
			// Setup test files
			const docsDir = join(testDir, "discover-test-1", "docs");
			await mkdir(docsDir, { recursive: true });

			const agentsContent = `
# AGENTS.md

See [Guide](./docs/guide.md) for guide.
`;
			const guideContent = `
# Guide

This is the guide documentation.

It explains how to use the system effectively.
`;

			const baseDir = join(testDir, "discover-test-1");
			await writeFile(join(baseDir, "AGENTS.md"), agentsContent);
			await writeFile(join(docsDir, "guide.md"), guideContent);

			// Mock provider
			const mockProvider = {
				name: "claude" as const,
				displayName: "Claude",
				isAvailable: async () => true,
				invoke: async () => ({
					result:
						"This document provides guidance on using the system. It covers effective usage patterns and best practices.",
				}),
				invokeWithRetry: async () => ({
					result: "Summary",
				}),
			};

			const result = await discoverLinkedDocs(
				[join(baseDir, "AGENTS.md")],
				baseDir,
				{
					provider: mockProvider,
					verbose: false,
				},
			);

			expect(result.docs).toHaveLength(1);
			expect(result.docs[0]!.path).toBe("docs/guide.md");
			expect(result.docs[0]!.linkedFrom).toBe("AGENTS.md");
			expect(result.docs[0]!.summary).toContain("guidance");
		});

		test("respects maxDocs limit", async () => {
			const baseDir = join(testDir, "discover-test-2");
			const docsDir = join(baseDir, "docs");
			await mkdir(docsDir, { recursive: true });

			// Create AGENTS.md with many links
			let agentsContent = "# AGENTS.md\n\n";
			for (let i = 1; i <= 10; i++) {
				agentsContent += `- [Doc ${i}](./docs/doc${i}.md)\n`;
				await writeFile(join(docsDir, `doc${i}.md`), `# Doc ${i}\n\nContent.`);
			}

			await writeFile(join(baseDir, "AGENTS.md"), agentsContent);

			const mockProvider = {
				name: "claude" as const,
				displayName: "Claude",
				isAvailable: async () => true,
				invoke: async () => ({ result: "Summary of document." }),
				invokeWithRetry: async () => ({ result: "Summary" }),
			};

			const result = await discoverLinkedDocs(
				[join(baseDir, "AGENTS.md")],
				baseDir,
				{
					provider: mockProvider,
					maxDocs: 5,
					verbose: false,
				},
			);

			expect(result.docs).toHaveLength(5);
			expect(result.totalLinksFound).toBe(10);
		});

		test("handles missing files gracefully", async () => {
			const baseDir = join(testDir, "discover-test-3");
			await mkdir(baseDir, { recursive: true });

			const agentsContent = `
# AGENTS.md

See [Missing](./docs/missing.md) for missing doc.
`;

			await writeFile(join(baseDir, "AGENTS.md"), agentsContent);

			const mockProvider = {
				name: "claude" as const,
				displayName: "Claude",
				isAvailable: async () => true,
				invoke: async () => ({ result: "Summary" }),
				invokeWithRetry: async () => ({ result: "Summary" }),
			};

			const result = await discoverLinkedDocs(
				[join(baseDir, "AGENTS.md")],
				baseDir,
				{
					provider: mockProvider,
					verbose: false,
				},
			);

			expect(result.docs).toHaveLength(0);
			expect(result.unresolvedLinks).toHaveLength(1);
			expect(result.unresolvedLinks[0]!).toBe("./docs/missing.md");
		});

		test("deduplicates links across multiple AGENTS.md files", async () => {
			const baseDir = join(testDir, "discover-test-4");
			const subDir = join(baseDir, "subdir");
			const docsDir = join(baseDir, "docs");
			await mkdir(subDir, { recursive: true });
			await mkdir(docsDir, { recursive: true });

			// Both AGENTS.md files link to the same doc
			const rootAgentsContent = `
# AGENTS.md

See [Guide](./docs/guide.md) for guide.
`;
			const subAgentsContent = `
# AGENTS.md

See [Guide](../docs/guide.md) for guide.
`;

			await writeFile(join(baseDir, "AGENTS.md"), rootAgentsContent);
			await writeFile(join(subDir, "AGENTS.md"), subAgentsContent);
			await writeFile(join(docsDir, "guide.md"), "# Guide\n\nContent.");

			let invokeCount = 0;
			const mockProvider = {
				name: "claude" as const,
				displayName: "Claude",
				isAvailable: async () => true,
				invoke: async () => {
					invokeCount++;
					return { result: "Summary of guide." };
				},
				invokeWithRetry: async () => ({ result: "Summary" }),
			};

			const result = await discoverLinkedDocs(
				[join(baseDir, "AGENTS.md"), join(subDir, "AGENTS.md")],
				baseDir,
				{
					provider: mockProvider,
					verbose: false,
				},
			);

			// Should only summarize once (deduplicated)
			expect(result.docs).toHaveLength(1);
			expect(invokeCount).toBe(1);
		});

		test("returns empty result when no links found", async () => {
			const baseDir = join(testDir, "discover-test-5");
			await mkdir(baseDir, { recursive: true });

			const agentsContent = `
# AGENTS.md

No links here, just text.
`;

			await writeFile(join(baseDir, "AGENTS.md"), agentsContent);

			const mockProvider = {
				name: "claude" as const,
				displayName: "Claude",
				isAvailable: async () => true,
				invoke: async () => ({ result: "Summary" }),
				invokeWithRetry: async () => ({ result: "Summary" }),
			};

			const result = await discoverLinkedDocs(
				[join(baseDir, "AGENTS.md")],
				baseDir,
				{
					provider: mockProvider,
					verbose: false,
				},
			);

			expect(result.docs).toHaveLength(0);
			expect(result.totalLinksFound).toBe(0);
			expect(result.unresolvedLinks).toHaveLength(0);
		});

		test("passes correct file content to summarizer", async () => {
			const baseDir = join(testDir, "discover-test-6");
			const docsDir = join(baseDir, "docs");
			await mkdir(docsDir, { recursive: true });

			const agentsContent = `
# AGENTS.md

See [API Docs](./docs/api.md) for API documentation.
`;
			const apiDocContent = `# API Documentation

## Endpoints

### GET /users
Returns a list of users.

### POST /users
Creates a new user.

## Authentication
All endpoints require Bearer token authentication.
`;

			await writeFile(join(baseDir, "AGENTS.md"), agentsContent);
			await writeFile(join(docsDir, "api.md"), apiDocContent);

			// Track what content was passed to the provider
			let receivedPrompt = "";
			const mockProvider = {
				name: "claude" as const,
				displayName: "Claude",
				isAvailable: async () => true,
				invoke: async (prompt: string) => {
					receivedPrompt = prompt;
					return { result: "API documentation summary." };
				},
				invokeWithRetry: async () => ({ result: "Summary" }),
			};

			await discoverLinkedDocs([join(baseDir, "AGENTS.md")], baseDir, {
				provider: mockProvider,
				verbose: false,
			});

			// Verify the actual file content was included in the prompt
			expect(receivedPrompt).toContain("# API Documentation");
			expect(receivedPrompt).toContain("GET /users");
			expect(receivedPrompt).toContain("POST /users");
			expect(receivedPrompt).toContain("Bearer token authentication");
			// Note: File path is intentionally omitted from the prompt to prevent
			// AI agents from exploring the filesystem instead of summarizing content
		});

		test("truncates content when file exceeds maxContentLength", async () => {
			const baseDir = join(testDir, "discover-test-7");
			const docsDir = join(baseDir, "docs");
			await mkdir(docsDir, { recursive: true });

			const agentsContent = `
# AGENTS.md

See [Large Doc](./docs/large.md) for large documentation.
`;
			// Create content that exceeds 500 characters
			const largeContent =
				"# Large Document\n\n" + "This is line content. ".repeat(100);

			await writeFile(join(baseDir, "AGENTS.md"), agentsContent);
			await writeFile(join(docsDir, "large.md"), largeContent);

			let receivedPrompt = "";
			const mockProvider = {
				name: "claude" as const,
				displayName: "Claude",
				isAvailable: async () => true,
				invoke: async (prompt: string) => {
					receivedPrompt = prompt;
					return { result: "Summary of large document." };
				},
				invokeWithRetry: async () => ({ result: "Summary" }),
			};

			await discoverLinkedDocs([join(baseDir, "AGENTS.md")], baseDir, {
				provider: mockProvider,
				maxContentLength: 500, // Small limit to trigger truncation
				verbose: false,
			});

			// Verify truncation marker is present
			expect(receivedPrompt).toContain("[Content truncated...]");
			// Verify content was actually truncated (prompt should be shorter than full content)
			expect(receivedPrompt.length).toBeLessThan(largeContent.length + 500);
		});

		test("discovers multiple linked docs from same AGENTS.md", async () => {
			const baseDir = join(testDir, "discover-test-8");
			const docsDir = join(baseDir, "docs");
			await mkdir(docsDir, { recursive: true });

			const agentsContent = `
# AGENTS.md

## Documentation

- [Architecture](./docs/architecture.md) - System architecture
- [API](./docs/api.md) - API reference
- [Testing](./docs/testing.md) - Testing guide
`;

			await writeFile(join(baseDir, "AGENTS.md"), agentsContent);
			await writeFile(
				join(docsDir, "architecture.md"),
				"# Architecture\n\nSystem design.",
			);
			await writeFile(join(docsDir, "api.md"), "# API\n\nEndpoints.");
			await writeFile(join(docsDir, "testing.md"), "# Testing\n\nTest guide.");

			const summaries: string[] = [];
			const mockProvider = {
				name: "claude" as const,
				displayName: "Claude",
				isAvailable: async () => true,
				invoke: async (prompt: string) => {
					// Return different summaries based on content
					if (prompt.includes("Architecture")) {
						summaries.push("architecture");
						return { result: "Architecture documentation summary." };
					}
					if (prompt.includes("API")) {
						summaries.push("api");
						return { result: "API documentation summary." };
					}
					if (prompt.includes("Testing")) {
						summaries.push("testing");
						return { result: "Testing documentation summary." };
					}
					return { result: "Generic summary." };
				},
				invokeWithRetry: async () => ({ result: "Summary" }),
			};

			const result = await discoverLinkedDocs(
				[join(baseDir, "AGENTS.md")],
				baseDir,
				{
					provider: mockProvider,
					verbose: false,
				},
			);

			expect(result.docs).toHaveLength(3);
			expect(result.totalLinksFound).toBe(3);
			expect(summaries).toHaveLength(3);
			expect(summaries).toContain("architecture");
			expect(summaries).toContain("api");
			expect(summaries).toContain("testing");

			// Verify each doc has correct metadata
			const paths = result.docs.map((d) => d.path);
			expect(paths).toContain("docs/architecture.md");
			expect(paths).toContain("docs/api.md");
			expect(paths).toContain("docs/testing.md");
		});

		test("uses fallback summary when provider fails", async () => {
			const baseDir = join(testDir, "discover-test-9");
			const docsDir = join(baseDir, "docs");
			await mkdir(docsDir, { recursive: true });

			const agentsContent = `
# AGENTS.md

See [Guide](./docs/guide.md) for guide.
`;

			await writeFile(join(baseDir, "AGENTS.md"), agentsContent);
			await writeFile(join(docsDir, "guide.md"), "# Guide\n\nContent here.");

			const mockProvider = {
				name: "claude" as const,
				displayName: "Claude",
				isAvailable: async () => true,
				invoke: async () => {
					throw new Error("Provider API error");
				},
				invokeWithRetry: async () => ({ result: "Summary" }),
			};

			const result = await discoverLinkedDocs(
				[join(baseDir, "AGENTS.md")],
				baseDir,
				{
					provider: mockProvider,
					verbose: false,
				},
			);

			expect(result.docs).toHaveLength(1);
			expect(result.docs[0]!.summary).toContain("docs/guide.md");
			expect(result.docs[0]!.summary).toContain("Summary unavailable");
		});

		test("discovers docs from deeply nested directories", async () => {
			const baseDir = join(testDir, "discover-test-10");
			const deepDir = join(baseDir, "docs", "guides", "advanced", "topics");
			await mkdir(deepDir, { recursive: true });

			const agentsContent = `
# AGENTS.md

See [Advanced Topic](./docs/guides/advanced/topics/deep-guide.md) for advanced info.
`;

			await writeFile(join(baseDir, "AGENTS.md"), agentsContent);
			await writeFile(
				join(deepDir, "deep-guide.md"),
				"# Deep Guide\n\nAdvanced content.",
			);

			const mockProvider = {
				name: "claude" as const,
				displayName: "Claude",
				isAvailable: async () => true,
				invoke: async () => ({ result: "Deep guide summary." }),
				invokeWithRetry: async () => ({ result: "Summary" }),
			};

			const result = await discoverLinkedDocs(
				[join(baseDir, "AGENTS.md")],
				baseDir,
				{
					provider: mockProvider,
					verbose: false,
				},
			);

			expect(result.docs).toHaveLength(1);
			expect(result.docs[0]!.path).toBe(
				"docs/guides/advanced/topics/deep-guide.md",
			);
			expect(result.docs[0]!.linkedFrom).toBe("AGENTS.md");
		});

		test("handles mixed existing and missing linked files", async () => {
			const baseDir = join(testDir, "discover-test-11");
			const docsDir = join(baseDir, "docs");
			await mkdir(docsDir, { recursive: true });

			const agentsContent = `
# AGENTS.md

- [Exists](./docs/exists.md) - This file exists
- [Missing](./docs/missing.md) - This file is missing
- [Also Exists](./docs/also-exists.md) - This also exists
`;

			await writeFile(join(baseDir, "AGENTS.md"), agentsContent);
			await writeFile(join(docsDir, "exists.md"), "# Exists\n\nContent.");
			// Intentionally not creating missing.md
			await writeFile(
				join(docsDir, "also-exists.md"),
				"# Also Exists\n\nMore content.",
			);

			const mockProvider = {
				name: "claude" as const,
				displayName: "Claude",
				isAvailable: async () => true,
				invoke: async () => ({ result: "File summary." }),
				invokeWithRetry: async () => ({ result: "Summary" }),
			};

			const result = await discoverLinkedDocs(
				[join(baseDir, "AGENTS.md")],
				baseDir,
				{
					provider: mockProvider,
					verbose: false,
				},
			);

			expect(result.docs).toHaveLength(2);
			expect(result.unresolvedLinks).toHaveLength(1);
			expect(result.unresolvedLinks[0]!).toBe("./docs/missing.md");
			expect(result.totalLinksFound).toBe(3);
		});
	});
});
