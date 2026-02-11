import { getIssueTypeFromEvaluatorName } from "@shared/evaluation/evaluator-types";
import type {
	ILinkedDocSummary,
	IProjectContext,
	ISkill,
	ITechnicalInventory,
} from "@shared/types/evaluation";
import { readFile } from "fs/promises";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

// Try to import embedded prompts (available in single binary mode)
let embeddedSharedPrompts: Record<string, string> | null = null;
try {
	const embedded = await import("../../embedded/prompts-assets");
	embeddedSharedPrompts = embedded.sharedPrompts;
} catch {
	// Not in embedded mode, will use file-based prompts
}

// Get directory paths for templates (file-based fallback)
const __dirname = dirname(fileURLToPath(import.meta.url));
const SHARED_TEMPLATES_DIR = resolve(__dirname, "../../../prompts/shared");

/**
 * Category-specific agent perspective descriptions
 */
const AGENT_PERSPECTIVES: Record<string, string> = {
	"Content Quality & Focus":
		"Agents need deterministic, executable instructions",
	"Structure & Organization": "Agents parse structured text better than prose",
	"Command Clarity": "Agents need unambiguous, executable commands",
	"Testing Guidance": "Agents need to know how to verify their changes",
	"Code Style Clarity":
		"Agents need explicit rules to generate consistent code",
	"Language Clarity":
		"Agents need clear, unambiguous language without vague references",
	"Workflow Integration": "Agents need to know how to integrate their changes",
	"Project Structure": "Agents need to understand where to create/modify files",
	"Security Awareness": "Agents need to know about security-sensitive areas",
	"Completeness & Balance":
		"Agents need sufficient but not overwhelming information",
	"Subdirectory Coverage":
		"Agents benefit from focused, context-specific guidance per component",
	"Context Gaps & Documentation Opportunities":
		"Agents benefit from explicit documentation of frameworks, patterns, and conventions",
};

/**
 * Message shown when no context file (AGENTS.md, CLAUDE.md, or copilot-instructions.md) exists in the repository.
 * Used by evaluators that support running without an existing file.
 */
const NO_FILE_MESSAGE = `## No Context File Found

This repository does not have an AGENTS.md, CLAUDE.md, or copilot-instructions.md file. Focus on suggesting what documentation should be created based on the codebase analysis.

Use location {"file": "AGENTS.md", "start": 0, "end": 0} for all issues since the file does not exist yet.`;

/**
 * Brief JSON-only reminder appended at the very end of every assembled prompt.
 * Leverages recency bias so the model sees this constraint last, right before generating.
 */
const JSON_OUTPUT_REMINDER = `\n\n---\n\nREMINDER: Your ENTIRE response must be ONLY a valid JSON array. Start with \`[\` and end with \`]\`. No text before or after. No markdown. No explanations. Just the JSON array.`;

/**
 * Check if content is empty or effectively empty.
 */
export function isEmptyContent(content: string | undefined | null): boolean {
	return !content || content.trim().length === 0;
}

/**
 * Load and process the output format template with category-specific replacements
 */
async function loadOutputFormatTemplate(
	category: string,
	evaluatorName: string,
): Promise<string> {
	let template: string;

	// Determine the issue type and template name
	const issueType = getIssueTypeFromEvaluatorName(evaluatorName);
	const templateName =
		issueType === "suggestion"
			? "output-format-suggestion"
			: "output-format-error";

	// Try embedded prompts first (single binary mode)
	if (embeddedSharedPrompts && embeddedSharedPrompts[templateName]) {
		template = embeddedSharedPrompts[templateName];
	} else {
		// Fall back to file-based prompts
		const templatePath = resolve(SHARED_TEMPLATES_DIR, `${templateName}.md`);
		try {
			template = await readFile(templatePath, "utf-8");
		} catch (_error) {
			// If template not found, default to error template with warning
			console.warn(
				`Template ${templateName}.md not found, falling back to output-format-error.md`,
			);
			const fallbackPath = resolve(
				SHARED_TEMPLATES_DIR,
				"output-format-error.md",
			);
			template = await readFile(fallbackPath, "utf-8");
		}
	}

	const agentPerspective =
		AGENT_PERSPECTIVES[category] || "Agents need clear, specific guidance";

	return template
		.replace(/\{\{CATEGORY\}\}/g, category)
		.replace(/\{\{AGENT_PERSPECTIVE\}\}/g, agentPerspective);
}

/**
 * Extract category from evaluator prompt title
 */
function extractCategory(evaluatorPrompt: string): string {
	// Look for pattern like "# Category Name Evaluator"
	const match = evaluatorPrompt.match(/^#\s+(.+?)\s+Evaluator/m);
	if (match && match[1]) {
		return match[1];
	}
	return "Unknown Category";
}

/**
 * File context for multi-file evaluation
 */
export interface FileContext {
	filePath: string;
	relativePath: string;
	content: string;
}

/**
 * Add line numbers to content for accurate location tracking
 * Format: "   1 | content line here"
 */
function addLineNumbers(content: string): string {
	const lines = content.split("\n");
	const maxLineNumWidth = String(lines.length).length;
	return lines
		.map((line, index) => {
			const lineNum = String(index + 1).padStart(maxLineNumWidth, " ");
			return `${lineNum} | ${line}`;
		})
		.join("\n");
}

/**
 * Add line numbers with periodic file reminders to reduce cognitive load in multi-file contexts
 * Format: "   1 | content line here"
 * Adds reminder comments every 50 lines: "--- Still in file: path/to/file ---"
 */
function addLineNumbersWithReminders(
	content: string,
	filePath: string,
): string {
	const lines = content.split("\n");
	const maxLineNumWidth = String(lines.length).length;
	const reminderInterval = 50;

	const result: string[] = [];

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		const lineNum = String(index + 1).padStart(maxLineNumWidth, " ");

		// Add reminder every 50 lines (but not at line 1)
		if (index > 0 && index % reminderInterval === 0) {
			result.push(`\n--- Still in file: ${filePath} ---\n`);
		}

		result.push(`${lineNum} | ${line}`);
	}

	return result.join("\n");
}

/**
 * Format a file block with prominent separators and periodic reminders
 * This makes file boundaries unmistakable and reduces LLM confusion in multi-file contexts
 */
function formatFileBlockWithSeparators(
	file: FileContext,
	index: number,
): string {
	const separator = "=".repeat(80);
	const fileHeader = `FILE ${index + 1}: ${file.relativePath}`;
	const fileFooter = `END OF FILE ${index + 1}: ${file.relativePath}`;

	if (isEmptyContent(file.content)) {
		return `${separator}\n${fileHeader}\n${separator}\n\n*File does not exist or is empty*\n\n${separator}\n${fileFooter}\n${separator}`;
	}

	// Add line numbers with periodic reminders
	const numberedContent = addLineNumbersWithReminders(
		file.content,
		file.relativePath,
	);

	return `${separator}\n${fileHeader}\n${separator}\n\n${numberedContent}\n\n${separator}\n${fileFooter}\n${separator}`;
}

/**
 * Build the key folders section if available
 */
function buildKeyFoldersSection(
	keyFolders?: IProjectContext["keyFolders"],
): string {
	if (!keyFolders || keyFolders.length === 0) {
		return "";
	}

	const folderLines = keyFolders
		.map((f) => `- ${f.path} - ${f.description}`)
		.join("\n");

	return `### Key Folders

${folderLines}

`;
}

/**
 * Build the context files section if available.
 * Lists all AGENTS.md, CLAUDE.md, and copilot-instructions.md files found in the repository.
 */
function buildAgentsFilesSection(agentsFilePaths?: string[]): string {
	if (!agentsFilePaths || agentsFilePaths.length === 0) {
		return "";
	}

	const fileLines = agentsFilePaths.map((f) => `- ${f}`).join("\n");

	return `### Context Files (AGENTS.md / CLAUDE.md / Rules / Github Copilot Instructions)

${fileLines}

`;
}

/**
 * Build the Agent Skills section if available.
 * Lists all skills discovered from SKILL.md files in the repository.
 * Uses AI-generated summary when available, falls back to frontmatter description.
 */
function buildSkillsSection(skills: ISkill[]): string {
	if (!skills || skills.length === 0) {
		return "";
	}

	const skillLines = skills
		.map((s) => {
			// Prefer AI-generated summary, fall back to frontmatter description
			const desc = s.summary || s.description;
			return `- **${s.name}** (${s.directory}/SKILL.md): ${desc}`;
		})
		.join("\n");

	return `### Agent Skills in Repository

The following ${skills.length} skill(s) are available:

${skillLines}

These skills provide specialized capabilities that may already address certain context gaps.

`;
}

/**
 * Build the linked documentation section if available.
 * Lists AI-generated summaries of documentation files linked from AGENTS.md.
 */
function buildLinkedDocsSection(linkedDocs?: ILinkedDocSummary[]): string {
	if (!linkedDocs || linkedDocs.length === 0) {
		return "";
	}

	const docLines = linkedDocs
		.map((d) => `- **${d.path}**: ${d.summary}`)
		.join("\n");

	return `### Referenced Documentation

The AGENTS.md file references the following documentation:

${docLines}

`;
}

/**
 * Build the technical inventory section if available.
 * Formats pre-computed codebase data so evaluators can reference it
 * instead of running redundant scanning commands.
 */
export function buildTechnicalInventorySection(
	inventory?: ITechnicalInventory,
): string {
	if (!inventory) {
		return "";
	}

	const lines: string[] = ["### Technical Inventory (Pre-computed)", ""];

	if (inventory.dependencies && inventory.dependencies.length > 0) {
		lines.push(`**Dependencies:** ${inventory.dependencies.join(", ")}`);
	}

	if (inventory.devDependencies && inventory.devDependencies.length > 0) {
		lines.push(`**Dev Dependencies:** ${inventory.devDependencies.join(", ")}`);
	}

	if (inventory.scripts && Object.keys(inventory.scripts).length > 0) {
		lines.push(`**Scripts:** ${Object.keys(inventory.scripts).join(", ")}`);
	}

	if (inventory.dockerServices && inventory.dockerServices.length > 0) {
		lines.push(`**Docker Services:** ${inventory.dockerServices.join(", ")}`);
	}

	if (inventory.configFiles && inventory.configFiles.length > 0) {
		lines.push(`**Config Files:** ${inventory.configFiles.join(", ")}`);
	}

	if (
		inventory.fileCountsByExtension &&
		Object.keys(inventory.fileCountsByExtension).length > 0
	) {
		const counts = Object.entries(inventory.fileCountsByExtension)
			.sort(([, a], [, b]) => b - a)
			.map(([ext, count]) => `${ext} (${count})`)
			.join(", ");
		lines.push(`**File Counts:** ${counts}`);
	}

	if (inventory.envVarNames && inventory.envVarNames.length > 0) {
		lines.push(`**Env Variables:** ${inventory.envVarNames.join(", ")}`);
	}

	// Database patterns
	const dbParts: string[] = [];
	if (inventory.migrationFileCount)
		dbParts.push(`${inventory.migrationFileCount} migration files`);
	if (inventory.ormRelationshipCount)
		dbParts.push(`${inventory.ormRelationshipCount} ORM relationships`);
	if (inventory.seedFileCount)
		dbParts.push(`${inventory.seedFileCount} seed/factory files`);
	if (inventory.repositoryFileCount)
		dbParts.push(`${inventory.repositoryFileCount} repository files`);
	if (dbParts.length > 0) {
		lines.push(`**Database Patterns:** ${dbParts.join(", ")}`);
	}

	// Testing patterns
	const testParts: string[] = [];
	if (inventory.mockUsageCount)
		testParts.push(`${inventory.mockUsageCount} mock usages`);
	if (inventory.testOrganization)
		testParts.push(`${inventory.testOrganization} test organization`);
	if (inventory.fixtureDirectories && inventory.fixtureDirectories.length > 0)
		testParts.push(
			`${inventory.fixtureDirectories.length} fixture dir(s): ${inventory.fixtureDirectories.join(", ")}`,
		);
	if (inventory.testUtilityFiles && inventory.testUtilityFiles.length > 0)
		testParts.push(
			`${inventory.testUtilityFiles.length} test util(s): ${inventory.testUtilityFiles.join(", ")}`,
		);
	if (testParts.length > 0) {
		lines.push(`**Testing Patterns:** ${testParts.join(", ")}`);
	}

	// Architecture layers
	if (
		inventory.detectedDirectoryLayers &&
		inventory.detectedDirectoryLayers.length > 0
	) {
		lines.push(
			`**Architecture Layers:** ${inventory.detectedDirectoryLayers.join(", ")}`,
		);
	}

	// Gitignore entries
	if (inventory.gitignoreEntries && inventory.gitignoreEntries.length > 0) {
		lines.push(
			`**Gitignore Entries:** ${inventory.gitignoreEntries.join(", ")}`,
		);
	}

	// Only return if we have at least one data line beyond the header
	if (lines.length <= 2) {
		return "";
	}

	lines.push("");
	return `${lines.join("\n")}\n`;
}

/**
 * Build the project context section if available
 */
function buildProjectContextSection(projectContext?: string): string {
	if (!projectContext) {
		return "";
	}

	return `## Project Context

The following context was automatically identified from the codebase:

${projectContext}

---

`;
}

/**
 * Build the enhanced project context string from IProjectContext
 * Includes key folders and AGENTS.md file paths
 */
export function buildEnhancedProjectContext(context: IProjectContext): string {
	const parts: string[] = [];

	// Add CLOC summary if available
	if (
		context.clocSummary &&
		context.clocSummary !==
			"CLOC analysis not available (tool not installed or timed out)"
	) {
		parts.push(context.clocSummary);
		parts.push("");
	}

	// Add raw context (Languages, Frameworks, Architecture, Patterns)
	if (context.raw) {
		parts.push(context.raw.trim());
	}

	// Add key folders section
	const keyFoldersSection = buildKeyFoldersSection(context.keyFolders);
	if (keyFoldersSection) {
		parts.push("");
		parts.push(keyFoldersSection.trim());
	}

	// Add AGENTS.md files section
	const agentsFilesSection = buildAgentsFilesSection(context.agentsFilePaths);
	if (agentsFilesSection) {
		parts.push("");
		parts.push(agentsFilesSection.trim());
	}

	// Add Agent Skills section
	const skillsSection = context.skills
		? buildSkillsSection(context.skills)
		: "";
	if (skillsSection) {
		parts.push("");
		parts.push(skillsSection.trim());
	}

	// Add linked documentation section
	const linkedDocsSection = buildLinkedDocsSection(context.linkedDocs);
	if (linkedDocsSection) {
		parts.push("");
		parts.push(linkedDocsSection.trim());
	}

	// Add technical inventory section
	const inventorySection = buildTechnicalInventorySection(
		context.technicalInventory,
	);
	if (inventorySection) {
		parts.push("");
		parts.push(inventorySection.trim());
	}

	return parts.join("\n");
}

/**
 * Build a prompt for single-file evaluation
 */
export async function buildSingleFilePrompt(
	evaluatorPrompt: string,
	agentsContent: string,
	projectContext: string | undefined,
	evaluatorName: string,
): Promise<string> {
	const category = extractCategory(evaluatorPrompt);
	const outputFormatTemplate = await loadOutputFormatTemplate(
		category,
		evaluatorName,
	);
	const contextSection = buildProjectContextSection(projectContext);

	// Handle empty or missing content
	if (isEmptyContent(agentsContent)) {
		return `${evaluatorPrompt}\n\n${contextSection}${outputFormatTemplate}\n\n---\n\n${NO_FILE_MESSAGE}${JSON_OUTPUT_REMINDER}`;
	}

	const numberedContent = addLineNumbers(agentsContent);
	return `${evaluatorPrompt}\n\n${contextSection}${outputFormatTemplate}\n\n---\n\n## Context File Content to Evaluate:\n\n\`\`\`markdown\n${numberedContent}\n\`\`\`${JSON_OUTPUT_REMINDER}`;
}

/**
 * Build a combined prompt for multi-file evaluation
 */
export async function buildMultiFilePrompt(
	evaluatorPrompt: string,
	files: FileContext[],
	projectContext: string | undefined,
	evaluatorName: string,
): Promise<string> {
	const category = extractCategory(evaluatorPrompt);
	const outputFormatTemplate = await loadOutputFormatTemplate(
		category,
		evaluatorName,
	);
	const contextSection = buildProjectContextSection(projectContext);

	// Handle case where all files have empty content (no AGENTS.md files mode)
	const allEmpty =
		files.length === 0 || files.every((f) => isEmptyContent(f.content));
	if (allEmpty) {
		return `${evaluatorPrompt}\n\n${contextSection}${outputFormatTemplate}\n\n---\n\n${NO_FILE_MESSAGE}${JSON_OUTPUT_REMINDER}`;
	}

	const fileBlocks = files
		.map((file, index) => formatFileBlockWithSeparators(file, index))
		.join("\n\n");

	return `${evaluatorPrompt}\n\n${contextSection}${outputFormatTemplate}\n\n---\n\n## Multiple Context Files to Evaluate:\n\n${fileBlocks}${JSON_OUTPUT_REMINDER}`;
}

/**
 * Estimate token count for a string (rough approximation: ~4 chars per token)
 */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}
