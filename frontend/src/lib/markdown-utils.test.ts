import { describe, expect, test } from "bun:test";
import {
	parseMarkdownFrontmatter,
	stripMarkdownFrontmatter,
} from "./markdown-utils";

describe("parseMarkdownFrontmatter", () => {
	test("parses content with valid frontmatter (name and description only)", () => {
		const content = `---
name: test-skill
description: A test skill
---

# Test Skill

This is the content.`;

		const result = parseMarkdownFrontmatter(content);

		expect(result.frontmatter).toEqual({
			name: "test-skill",
			description: "A test skill",
		});
		expect(result.content).toBe("# Test Skill\n\nThis is the content.");
	});

	test("parses content with all optional fields", () => {
		const content = `---
name: full-skill
description: A skill with all fields
license: MIT
compatibility: Node 18+
allowed-tools: Bash Read Write
---

# Full Skill

Content here.`;

		const result = parseMarkdownFrontmatter(content);

		expect(result.frontmatter).toEqual({
			name: "full-skill",
			description: "A skill with all fields",
			license: "MIT",
			compatibility: "Node 18+",
			"allowed-tools": "Bash Read Write",
		});
		expect(result.content).toBe("# Full Skill\n\nContent here.");
	});

	test("returns original content when no frontmatter markers", () => {
		const content = `# No Frontmatter

This is just regular markdown.`;

		const result = parseMarkdownFrontmatter(content);

		expect(result.frontmatter).toBeNull();
		expect(result.content).toBe(content);
	});

	test("handles incomplete frontmatter (only opening marker)", () => {
		const content = `---
name: incomplete
This is content after opening marker but no closing marker.`;

		const result = parseMarkdownFrontmatter(content);

		expect(result.frontmatter).toBeNull();
		expect(result.content).toBe(content);
	});

	test("handles quoted values in frontmatter", () => {
		const content = `---
name: "quoted-skill"
description: 'Single quoted description'
license: "Apache 2.0"
---

Content.`;

		const result = parseMarkdownFrontmatter(content);

		expect(result.frontmatter).toEqual({
			name: "quoted-skill",
			description: "Single quoted description",
			license: "Apache 2.0",
		});
	});

	test("handles values with colons", () => {
		const content = `---
name: my-skill
description: A skill for doing: many things
---

Content.`;

		const result = parseMarkdownFrontmatter(content);

		expect(result.frontmatter).toEqual({
			name: "my-skill",
			description: "A skill for doing: many things",
		});
	});

	test("handles empty content", () => {
		const result = parseMarkdownFrontmatter("");

		expect(result.frontmatter).toBeNull();
		expect(result.content).toBe("");
	});

	test("handles frontmatter only (no content after)", () => {
		const content = `---
name: frontmatter-only
description: Just frontmatter
---
`;

		const result = parseMarkdownFrontmatter(content);

		expect(result.frontmatter).toEqual({
			name: "frontmatter-only",
			description: "Just frontmatter",
		});
		expect(result.content).toBe("");
	});

	test("handles frontmatter with empty values", () => {
		const content = `---
name: skill-name
description:
license: MIT
---

Content.`;

		const result = parseMarkdownFrontmatter(content);

		// Empty description should not be included
		expect(result.frontmatter).toEqual({
			name: "skill-name",
			license: "MIT",
		});
	});

	test("ignores unknown frontmatter fields", () => {
		const content = `---
name: my-skill
description: Test
author: John Doe
version: 1.0.0
custom-field: value
---

Content.`;

		const result = parseMarkdownFrontmatter(content);

		expect(result.frontmatter).toEqual({
			name: "my-skill",
			description: "Test",
		});
		// Unknown fields should be ignored
		expect(result.frontmatter).not.toHaveProperty("author");
		expect(result.frontmatter).not.toHaveProperty("version");
	});

	test("returns null frontmatter if no valid fields are parsed", () => {
		const content = `---
unknown-field: value
another-unknown: test
---

Content.`;

		const result = parseMarkdownFrontmatter(content);

		expect(result.frontmatter).toBeNull();
		expect(result.content).toBe("Content.");
	});

	test("handles whitespace variations in frontmatter markers", () => {
		const content = `---
name: whitespace-skill
description: Has trailing whitespace
---

Content.`;

		const result = parseMarkdownFrontmatter(content);

		expect(result.frontmatter).toEqual({
			name: "whitespace-skill",
			description: "Has trailing whitespace",
		});
	});
});

describe("stripMarkdownFrontmatter", () => {
	test("strips frontmatter and returns content only", () => {
		const content = `---
name: test-skill
description: Test
---

# Heading

Content here.`;

		const result = stripMarkdownFrontmatter(content);

		expect(result).toBe("# Heading\n\nContent here.");
	});

	test("returns original content if no frontmatter", () => {
		const content = "# No Frontmatter\n\nJust content.";

		const result = stripMarkdownFrontmatter(content);

		expect(result).toBe(content);
	});

	test("returns empty string for empty input", () => {
		expect(stripMarkdownFrontmatter("")).toBe("");
	});
});
