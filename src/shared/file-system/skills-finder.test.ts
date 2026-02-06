import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { findSkillsFiles } from "./skills-finder";

describe("Skills Finder", () => {
	const testDir = join(process.cwd(), "test", "temp", "skills-test");

	beforeAll(async () => {
		// Create test directory structure
		await mkdir(testDir, { recursive: true });
	});

	afterAll(async () => {
		// Cleanup test directory
		await rm(testDir, { recursive: true, force: true });
	});

	describe("YAML Frontmatter Parsing", () => {
		test("should parse valid YAML frontmatter with name and description", async () => {
			const skillDir = join(testDir, "test-skill-1");
			await mkdir(skillDir, { recursive: true });

			const content = `---
name: Test Skill
description: A test skill for unit testing
---

# Test Skill

This is a test skill.
`;

			await writeFile(join(skillDir, "SKILL.md"), content);

			const skills = await findSkillsFiles(testDir);

			expect(skills).toHaveLength(1);
			expect(skills[0]!.name).toBe("Test Skill");
			expect(skills[0]!.description).toBe("A test skill for unit testing");
			expect(skills[0]!.directory).toBe("test-skill-1");
		});

		test("should parse YAML with quoted values", async () => {
			const skillDir = join(testDir, "test-skill-2");
			await mkdir(skillDir, { recursive: true });

			const content = `---
name: "Quoted Skill"
description: "A skill with quoted values"
---

# Content
`;

			await writeFile(join(skillDir, "SKILL.md"), content);

			const skills = await findSkillsFiles(testDir);

			const skill = skills.find((s) => s.directory === "test-skill-2");
			expect(skill).toBeDefined();
			expect(skill!.name).toBe("Quoted Skill");
			expect(skill!.description).toBe("A skill with quoted values");
		});

		test("should parse YAML with single quotes", async () => {
			const skillDir = join(testDir, "test-skill-3");
			await mkdir(skillDir, { recursive: true });

			const content = `---
name: 'Single Quoted'
description: 'Description with single quotes'
---

# Content
`;

			await writeFile(join(skillDir, "SKILL.md"), content);

			const skills = await findSkillsFiles(testDir);

			const skill = skills.find((s) => s.directory === "test-skill-3");
			expect(skill).toBeDefined();
			expect(skill!.name).toBe("Single Quoted");
			expect(skill!.description).toBe("Description with single quotes");
		});

		test("should handle YAML with special characters", async () => {
			const skillDir = join(testDir, "test-skill-4");
			await mkdir(skillDir, { recursive: true });

			const content = `---
name: Skill: With Colon
description: Description with special chars & symbols
---

# Content
`;

			await writeFile(join(skillDir, "SKILL.md"), content);

			const skills = await findSkillsFiles(testDir);

			const skill = skills.find((s) => s.directory === "test-skill-4");
			expect(skill).toBeDefined();
			expect(skill!.name).toBe("Skill: With Colon");
			expect(skill!.description).toBe(
				"Description with special chars & symbols",
			);
		});

		test("should skip SKILL.md with missing name field", async () => {
			const skillDir = join(testDir, "test-skill-missing-name");
			await mkdir(skillDir, { recursive: true });

			const content = `---
description: Only has description
---

# Content
`;

			await writeFile(join(skillDir, "SKILL.md"), content);

			const skills = await findSkillsFiles(testDir);

			const skill = skills.find(
				(s) => s.directory === "test-skill-missing-name",
			);
			expect(skill).toBeUndefined();
		});

		test("should skip SKILL.md with missing description field", async () => {
			const skillDir = join(testDir, "test-skill-missing-desc");
			await mkdir(skillDir, { recursive: true });

			const content = `---
name: Only Name
---

# Content
`;

			await writeFile(join(skillDir, "SKILL.md"), content);

			const skills = await findSkillsFiles(testDir);

			const skill = skills.find(
				(s) => s.directory === "test-skill-missing-desc",
			);
			expect(skill).toBeUndefined();
		});

		test("should skip SKILL.md with no frontmatter markers", async () => {
			const skillDir = join(testDir, "test-skill-no-markers");
			await mkdir(skillDir, { recursive: true });

			const content = `name: Test
description: Test

# This has no frontmatter markers
`;

			await writeFile(join(skillDir, "SKILL.md"), content);

			const skills = await findSkillsFiles(testDir);

			const skill = skills.find((s) => s.directory === "test-skill-no-markers");
			expect(skill).toBeUndefined();
		});

		test("should skip SKILL.md with malformed YAML", async () => {
			const skillDir = join(testDir, "test-skill-malformed");
			await mkdir(skillDir, { recursive: true });

			const content = `---
name Test Skill
description: Missing colon
---

# Content
`;

			await writeFile(join(skillDir, "SKILL.md"), content);

			const skills = await findSkillsFiles(testDir);

			const skill = skills.find((s) => s.directory === "test-skill-malformed");
			expect(skill).toBeUndefined();
		});

		test("should skip SKILL.md with incomplete frontmatter markers", async () => {
			const skillDir = join(testDir, "test-skill-incomplete");
			await mkdir(skillDir, { recursive: true });

			const content = `---
name: Test
description: Test

# Missing closing marker
`;

			await writeFile(join(skillDir, "SKILL.md"), content);

			const skills = await findSkillsFiles(testDir);

			const skill = skills.find((s) => s.directory === "test-skill-incomplete");
			expect(skill).toBeUndefined();
		});

		test("should handle YAML with extra whitespace", async () => {
			const skillDir = join(testDir, "test-skill-whitespace");
			await mkdir(skillDir, { recursive: true });

			const content = `---
name:    Whitespace Skill
description:     Lots of whitespace
---

# Content
`;

			await writeFile(join(skillDir, "SKILL.md"), content);

			const skills = await findSkillsFiles(testDir);

			const skill = skills.find((s) => s.directory === "test-skill-whitespace");
			expect(skill).toBeDefined();
			expect(skill!.name).toBe("Whitespace Skill");
			expect(skill!.description).toBe("Lots of whitespace");
		});

		test("should return empty array for directory with no SKILL.md files", async () => {
			const emptyDir = join(testDir, "empty-dir");
			await mkdir(emptyDir, { recursive: true });

			const skills = await findSkillsFiles(emptyDir);

			expect(skills).toHaveLength(0);
		});

		test("should sort skills by path depth", async () => {
			// Create skills at different depths
			const skill1Dir = join(testDir, "shallow-skill");
			const skill2Dir = join(testDir, "deep", "nested", "skill");

			await mkdir(skill1Dir, { recursive: true });
			await mkdir(skill2Dir, { recursive: true });

			const content1 = `---
name: Shallow Skill
description: At shallow depth
---
`;

			const content2 = `---
name: Deep Skill
description: At deep depth
---
`;

			await writeFile(join(skill1Dir, "SKILL.md"), content1);
			await writeFile(join(skill2Dir, "SKILL.md"), content2);

			const skills = await findSkillsFiles(testDir);

			// Shallow skills should come first
			const shallowIndex = skills.findIndex((s) => s.name === "Shallow Skill");
			const deepIndex = skills.findIndex((s) => s.name === "Deep Skill");

			expect(shallowIndex).toBeLessThan(deepIndex);
		});

		test("should find SKILL.md files in hidden directories", async () => {
			const hiddenSkillDir = join(testDir, ".claude", "skills", "test-skill");
			await mkdir(hiddenSkillDir, { recursive: true });

			const content = `---
name: Hidden Skill
description: A skill in a hidden directory
---

# Hidden Skill
`;

			await writeFile(join(hiddenSkillDir, "SKILL.md"), content);

			const skills = await findSkillsFiles(testDir);

			const hiddenSkill = skills.find((s) => s.name === "Hidden Skill");
			expect(hiddenSkill).toBeDefined();
			expect(hiddenSkill!.path).toContain(".claude");
			expect(hiddenSkill!.directory).toBe("test-skill");
		});
	});
});
