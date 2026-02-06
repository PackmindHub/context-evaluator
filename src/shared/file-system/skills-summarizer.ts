import type { ISkill, ISkillWithContent } from "./skills-finder";

/**
 * Options for skill deduplication
 */
export interface ISkillsSummaryOptions {
	/** Enable verbose logging */
	verbose?: boolean;
}

/**
 * Result of skill summarization and deduplication
 */
export interface ISkillsSummaryResult {
	/** Deduplicated skills with AI summaries */
	skills: ISkill[];
	/** Total skills processed */
	totalProcessed: number;
	/** Number of duplicates removed */
	duplicatesRemoved: number;
	/** Number of unique skills (after deduplication) */
	uniqueCount: number;
}

/**
 * Deduplicate skills based on content hash.
 *
 * Skills with identical SKILL.md content will be deduplicated:
 * - Only one representative skill is kept
 * - Uses frontmatter description as summary (no AI calls)
 * - Other paths are recorded in `duplicatePaths`
 *
 * @param skillsWithContent - Skills with raw content and hash
 * @param options - Deduplication options
 * @returns Deduplicated skills using frontmatter descriptions
 */
export function summarizeAndDeduplicateSkills(
	skillsWithContent: ISkillWithContent[],
	options: ISkillsSummaryOptions,
): ISkillsSummaryResult {
	const { verbose = false } = options;

	if (skillsWithContent.length === 0) {
		return {
			skills: [],
			totalProcessed: 0,
			duplicatesRemoved: 0,
			uniqueCount: 0,
		};
	}

	// Step 1: Group skills by content hash
	const skillsByHash = new Map<string, ISkillWithContent[]>();

	for (const skill of skillsWithContent) {
		const existing = skillsByHash.get(skill.contentHash);
		if (existing) {
			existing.push(skill);
		} else {
			skillsByHash.set(skill.contentHash, [skill]);
		}
	}

	const uniqueCount = skillsByHash.size;
	const duplicatesRemoved = skillsWithContent.length - uniqueCount;

	if (verbose) {
		console.log(
			`[SkillsSummarizer] Found ${skillsWithContent.length} skill(s), ${uniqueCount} unique (${duplicatesRemoved} duplicates)`,
		);
	}

	// Step 2: Process each unique skill group (no AI calls)
	const resultSkills: ISkill[] = [];

	for (const group of skillsByHash.values()) {
		// Take the first skill as the representative (shallower path due to sorting)
		const representative = group[0];
		if (!representative) continue;

		// Collect duplicate paths (excluding the representative)
		const duplicatePaths =
			group.length > 1 ? group.slice(1).map((s) => s.path) : undefined;

		if (verbose && duplicatePaths && duplicatePaths.length > 0) {
			console.log(
				`[SkillsSummarizer] Skill "${representative.name}" has ${duplicatePaths.length} duplicate(s): ${duplicatePaths.join(", ")}`,
			);
		}

		// Use frontmatter description as summary (no AI call needed)
		const skill: ISkill = {
			name: representative.name,
			description: representative.description,
			path: representative.path,
			directory: representative.directory,
			summary: representative.description, // Use frontmatter description
			contentHash: representative.contentHash,
			duplicatePaths,
			content: representative.content,
		};

		resultSkills.push(skill);
	}

	// Sort by path depth (shallower first, maintaining consistency)
	resultSkills.sort((a, b) => {
		const depthA = a.path.split("/").length;
		const depthB = b.path.split("/").length;
		return depthA - depthB;
	});

	if (verbose) {
		console.log(
			`[SkillsSummarizer] Completed: ${resultSkills.length} skill(s)`,
		);
	}

	return {
		skills: resultSkills,
		totalProcessed: skillsWithContent.length,
		duplicatesRemoved,
		uniqueCount,
	};
}
