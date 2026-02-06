import { describe, expect, test } from "bun:test";
import type { ISkillWithContent } from "./skills-finder";
import { summarizeAndDeduplicateSkills } from "./skills-summarizer";

describe("Skills Summarizer", () => {
	// Helper to create a mock skill with content
	const createMockSkill = (
		name: string,
		path: string,
		content: string,
		hash: string,
	): ISkillWithContent => ({
		name,
		description: `Description of ${name}`,
		path,
		directory: path.split("/").slice(-2, -1)[0] ?? name.toLowerCase(),
		content,
		contentHash: hash,
	});

	describe("summarizeAndDeduplicateSkills", () => {
		test("returns empty result for empty input", () => {
			const result = summarizeAndDeduplicateSkills([], { verbose: false });

			expect(result.skills).toHaveLength(0);
			expect(result.totalProcessed).toBe(0);
			expect(result.duplicatesRemoved).toBe(0);
			expect(result.uniqueCount).toBe(0);
		});

		test("uses frontmatter description as summary (no AI)", () => {
			const skill = createMockSkill(
				"Single Skill",
				"skills/single/SKILL.md",
				"# Single Skill\n\nThis skill does one thing.",
				"unique-hash-1",
			);

			const result = summarizeAndDeduplicateSkills([skill], { verbose: false });

			expect(result.skills).toHaveLength(1);
			expect(result.skills[0]!.name).toBe("Single Skill");
			// Summary should be the frontmatter description (no AI call)
			expect(result.skills[0]!.summary).toBe("Description of Single Skill");
			expect(result.totalProcessed).toBe(1);
			expect(result.duplicatesRemoved).toBe(0);
			expect(result.uniqueCount).toBe(1);
		});

		test("handles multiple unique skills", () => {
			const skills: ISkillWithContent[] = [
				createMockSkill("Skill A", "skills/a/SKILL.md", "Content A", "hash-a"),
				createMockSkill("Skill B", "skills/b/SKILL.md", "Content B", "hash-b"),
				createMockSkill("Skill C", "skills/c/SKILL.md", "Content C", "hash-c"),
			];

			const result = summarizeAndDeduplicateSkills(skills, { verbose: false });

			expect(result.skills).toHaveLength(3);
			expect(result.totalProcessed).toBe(3);
			expect(result.duplicatesRemoved).toBe(0);
			expect(result.uniqueCount).toBe(3);
		});

		test("deduplicates skills with identical content (same hash)", () => {
			const sharedHash = "identical-content-hash";
			const skills: ISkillWithContent[] = [
				createMockSkill(
					"Skill Original",
					"skills/original/SKILL.md",
					"Shared content",
					sharedHash,
				),
				createMockSkill(
					"Skill Copy 1",
					"packages/shared/skills/copy1/SKILL.md",
					"Shared content",
					sharedHash,
				),
				createMockSkill(
					"Skill Copy 2",
					"tools/skills/copy2/SKILL.md",
					"Shared content",
					sharedHash,
				),
			];

			const result = summarizeAndDeduplicateSkills(skills, { verbose: false });

			// Should keep only one skill
			expect(result.skills).toHaveLength(1);
			expect(result.totalProcessed).toBe(3);
			expect(result.duplicatesRemoved).toBe(2);
			expect(result.uniqueCount).toBe(1);

			// Summary should use frontmatter description
			expect(result.skills[0]!.summary).toBe("Description of Skill Original");

			// Should track duplicate paths
			expect(result.skills[0]!.duplicatePaths).toHaveLength(2);
			expect(result.skills[0]!.duplicatePaths).toContain(
				"packages/shared/skills/copy1/SKILL.md",
			);
			expect(result.skills[0]!.duplicatePaths).toContain(
				"tools/skills/copy2/SKILL.md",
			);
		});

		test("handles mixed duplicates and unique skills", () => {
			const skills: ISkillWithContent[] = [
				// Unique skill 1
				createMockSkill(
					"Unique A",
					"skills/unique-a/SKILL.md",
					"Unique content A",
					"hash-unique-a",
				),
				// Duplicate pair
				createMockSkill(
					"Duplicate 1",
					"skills/dup1/SKILL.md",
					"Duplicate content",
					"hash-duplicate",
				),
				createMockSkill(
					"Duplicate 2",
					"packages/dup2/SKILL.md",
					"Duplicate content",
					"hash-duplicate",
				),
				// Unique skill 2
				createMockSkill(
					"Unique B",
					"skills/unique-b/SKILL.md",
					"Unique content B",
					"hash-unique-b",
				),
			];

			const result = summarizeAndDeduplicateSkills(skills, { verbose: false });

			// Should have 3 unique skills (2 unique + 1 from duplicate pair)
			expect(result.skills).toHaveLength(3);
			expect(result.totalProcessed).toBe(4);
			expect(result.duplicatesRemoved).toBe(1);
			expect(result.uniqueCount).toBe(3);
		});

		test("preserves contentHash in output skills", () => {
			const skill = createMockSkill(
				"Test Skill",
				"skills/test/SKILL.md",
				"Test content",
				"test-hash-abc123",
			);

			const result = summarizeAndDeduplicateSkills([skill], { verbose: false });

			expect(result.skills[0]!.contentHash).toBe("test-hash-abc123");
		});

		test("sorts result by path depth (shallower first)", () => {
			const skills: ISkillWithContent[] = [
				createMockSkill(
					"Deep Skill",
					"packages/deep/nested/skills/test/SKILL.md",
					"Deep content",
					"hash-deep",
				),
				createMockSkill(
					"Shallow Skill",
					"skills/test/SKILL.md",
					"Shallow content",
					"hash-shallow",
				),
				createMockSkill(
					"Medium Skill",
					"packages/skills/test/SKILL.md",
					"Medium content",
					"hash-medium",
				),
			];

			const result = summarizeAndDeduplicateSkills(skills, { verbose: false });

			// Should be sorted by path depth
			expect(result.skills[0]!.name).toBe("Shallow Skill");
			expect(result.skills[1]!.name).toBe("Medium Skill");
			expect(result.skills[2]!.name).toBe("Deep Skill");
		});

		test("preserves content in output skills for browser display", () => {
			const skill = createMockSkill(
				"Test Skill",
				"skills/test/SKILL.md",
				"This is the file content that should be preserved for display",
				"hash-123",
			);

			const result = summarizeAndDeduplicateSkills([skill], { verbose: false });

			// Output skill should have the 'content' property for browser display
			expect(result.skills[0]!.content).toBe(
				"This is the file content that should be preserved for display",
			);
			// And should have all other properties
			expect(result.skills[0]!.name).toBe("Test Skill");
			expect(result.skills[0]!.path).toBe("skills/test/SKILL.md");
			expect(result.skills[0]!.summary).toBeDefined();
		});

		test("selects first (shallowest) skill as representative for duplicates", () => {
			const sharedHash = "shared-hash";
			const skills: ISkillWithContent[] = [
				// Due to sorting in findSkillsFilesWithContent, shallower paths come first
				createMockSkill(
					"Root Skill",
					"skills/root/SKILL.md",
					"Shared content",
					sharedHash,
				),
				createMockSkill(
					"Deep Skill",
					"packages/deep/nested/SKILL.md",
					"Shared content",
					sharedHash,
				),
			];

			const result = summarizeAndDeduplicateSkills(skills, { verbose: false });

			// Should keep the first (shallowest) skill
			expect(result.skills).toHaveLength(1);
			expect(result.skills[0]!.name).toBe("Root Skill");
			expect(result.skills[0]!.path).toBe("skills/root/SKILL.md");
			expect(result.skills[0]!.duplicatePaths).toEqual([
				"packages/deep/nested/SKILL.md",
			]);
		});
	});
});
