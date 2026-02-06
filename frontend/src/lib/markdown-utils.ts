/**
 * Frontmatter fields supported in SKILL.md files
 * Based on Agent Skills specification
 */
export interface SkillFrontmatter {
	/** Skill name (required) */
	name?: string;
	/** Skill description (required) */
	description?: string;
	/** License information (optional) */
	license?: string;
	/** Compatibility requirements (optional) */
	compatibility?: string;
	/** Allowed tools for this skill (optional) */
	"allowed-tools"?: string;
}

export interface ParsedMarkdown {
	/** Parsed frontmatter fields */
	frontmatter: SkillFrontmatter | null;
	/** Markdown content with frontmatter stripped */
	content: string;
}

/**
 * Regex pattern to match YAML frontmatter in markdown files
 * Matches content between opening and closing --- markers at the start of the file
 */
const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

/**
 * Parse a YAML frontmatter value, handling quoted strings
 */
function parseYamlValue(value: string): string {
	const trimmed = value.trim();
	// Handle quoted strings (single or double quotes)
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

/**
 * Parse simple YAML frontmatter into key-value pairs
 * Supports only simple key: value pairs (no nested objects or arrays)
 */
function parseSimpleYaml(yaml: string): SkillFrontmatter {
	const result: SkillFrontmatter = {};
	const lines = yaml.split("\n");

	for (const line of lines) {
		const colonIndex = line.indexOf(":");
		if (colonIndex === -1) continue;

		const key = line.slice(0, colonIndex).trim();
		const value = line.slice(colonIndex + 1);

		if (!key || !value.trim()) continue;

		const parsedValue = parseYamlValue(value);

		// Only extract known fields
		if (key === "name") result.name = parsedValue;
		else if (key === "description") result.description = parsedValue;
		else if (key === "license") result.license = parsedValue;
		else if (key === "compatibility") result.compatibility = parsedValue;
		else if (key === "allowed-tools") result["allowed-tools"] = parsedValue;
	}

	return result;
}

/**
 * Parse markdown content and extract YAML frontmatter
 *
 * @param content - Raw markdown content that may contain frontmatter
 * @returns Parsed frontmatter (if present) and content with frontmatter stripped
 */
export function parseMarkdownFrontmatter(content: string): ParsedMarkdown {
	if (!content) {
		return { frontmatter: null, content: "" };
	}

	const match = content.match(FRONTMATTER_REGEX);

	if (!match) {
		return { frontmatter: null, content };
	}

	const yamlContent = match[1];
	const frontmatter = parseSimpleYaml(yamlContent);
	const strippedContent = content.slice(match[0].length);

	// Only return frontmatter if at least one field was parsed
	const hasFields = Object.keys(frontmatter).length > 0;

	return {
		frontmatter: hasFields ? frontmatter : null,
		content: strippedContent,
	};
}

/**
 * Strip YAML frontmatter from markdown content
 *
 * @param content - Raw markdown content that may contain frontmatter
 * @returns Content with frontmatter removed
 */
export function stripMarkdownFrontmatter(content: string): string {
	return parseMarkdownFrontmatter(content).content;
}
