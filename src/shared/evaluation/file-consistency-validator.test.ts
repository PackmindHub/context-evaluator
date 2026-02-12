import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { validateFileConsistency } from "./file-consistency-validator";

describe("File Consistency Validator", () => {
	const testDir = join(process.cwd(), "test", "temp", "consistency-test");

	beforeAll(async () => {
		// Create test directory structure
		await mkdir(testDir, { recursive: true });
	});

	afterAll(async () => {
		// Cleanup test directory
		await rm(testDir, { recursive: true, force: true });
	});

	test("should report no issues when files are identical", async () => {
		const dir = join(testDir, "identical-files");
		await mkdir(dir, { recursive: true });

		const content = "# Project Context\n\nThis is identical content.\n";

		await writeFile(join(dir, "AGENTS.md"), content);
		await writeFile(join(dir, "CLAUDE.md"), content);

		const result = await validateFileConsistency(testDir);

		expect(result.pairsChecked).toBe(1);
		expect(result.conflictsFound).toBe(0);
		expect(result.issues).toHaveLength(0);
	});

	test("should report issue when files have different content", async () => {
		const dir = join(testDir, "different-files");
		await mkdir(dir, { recursive: true });

		const agentsContent = "# Project Context\n\nContent in AGENTS.md\n";
		const claudeContent = "# Project Context\n\nContent in CLAUDE.md\n";

		await writeFile(join(dir, "AGENTS.md"), agentsContent);
		await writeFile(join(dir, "CLAUDE.md"), claudeContent);

		const result = await validateFileConsistency(testDir);

		const conflictingIssue = result.issues.find(
			(i) => i.category === "File Consistency",
		);

		expect(conflictingIssue).toBeDefined();
		expect(result.conflictsFound).toBeGreaterThan(0);

		if (conflictingIssue) {
			expect(conflictingIssue.severity).toBe(9);
			expect(conflictingIssue.problem).toContain("different content");
			expect(conflictingIssue.isMultiFile).toBe(true);
			expect(conflictingIssue.affectedFiles).toHaveLength(2);
			expect(conflictingIssue.context).toContain("Unified Diff");
		}
	});

	test("should detect differences in whitespace", async () => {
		const dir = join(testDir, "whitespace-diff");
		await mkdir(dir, { recursive: true });

		const agentsContent =
			"# Project Context\n\nContent with trailing spaces  \n";
		const claudeContent = "# Project Context\n\nContent with trailing spaces\n";

		await writeFile(join(dir, "AGENTS.md"), agentsContent);
		await writeFile(join(dir, "CLAUDE.md"), claudeContent);

		const result = await validateFileConsistency(testDir);

		const conflictingIssue = result.issues.find(
			(i) =>
				i.category === "File Consistency" &&
				Array.isArray(i.affectedFiles) &&
				i.affectedFiles.some((f) => f.includes("whitespace-diff")),
		);

		expect(conflictingIssue).toBeDefined();
		expect(result.conflictsFound).toBeGreaterThan(0);
	});

	test("should report no issues when only one file exists in directory", async () => {
		const dir = join(testDir, "single-file");
		await mkdir(dir, { recursive: true });

		await writeFile(join(dir, "AGENTS.md"), "# Content\n");

		const result = await validateFileConsistency(testDir);

		// Should not find a pair for this directory
		const singleFileIssues = result.issues.filter(
			(i) =>
				Array.isArray(i.affectedFiles) &&
				i.affectedFiles.some((f) => f.includes("single-file")),
		);

		expect(singleFileIssues).toHaveLength(0);
	});

	test("should handle multiple directory pairs", async () => {
		const dir1 = join(testDir, "multi-pair-1");
		const dir2 = join(testDir, "multi-pair-2");

		await mkdir(dir1, { recursive: true });
		await mkdir(dir2, { recursive: true });

		// First pair: identical
		await writeFile(join(dir1, "AGENTS.md"), "Same content\n");
		await writeFile(join(dir1, "CLAUDE.md"), "Same content\n");

		// Second pair: different
		await writeFile(join(dir2, "AGENTS.md"), "Agents content\n");
		await writeFile(join(dir2, "CLAUDE.md"), "Claude content\n");

		const result = await validateFileConsistency(testDir);

		expect(result.pairsChecked).toBeGreaterThanOrEqual(2);
		expect(result.conflictsFound).toBeGreaterThanOrEqual(1);
	});

	test("should include unified diff in issue context", async () => {
		const dir = join(testDir, "diff-check");
		await mkdir(dir, { recursive: true });

		const agentsContent = "# Title\n\nLine 1\nLine 2\n";
		const claudeContent = "# Title\n\nLine 1\nLine 2 modified\n";

		await writeFile(join(dir, "AGENTS.md"), agentsContent);
		await writeFile(join(dir, "CLAUDE.md"), claudeContent);

		const result = await validateFileConsistency(testDir);

		const diffIssue = result.issues.find(
			(i) =>
				i.category === "File Consistency" &&
				Array.isArray(i.affectedFiles) &&
				i.affectedFiles.some((f) => f.includes("diff-check")),
		);

		expect(diffIssue).toBeDefined();

		if (diffIssue) {
			expect(diffIssue.context).toContain("Unified Diff");
			expect(diffIssue.context).toContain("diff-check");
			// Diffs typically contain +/- markers
			expect(
				diffIssue.context!.includes("+") || diffIssue.context!.includes("-"),
			).toBe(true);
		}
	});

	test("should include both file locations in issue", async () => {
		const dir = join(testDir, "locations-check");
		await mkdir(dir, { recursive: true });

		await writeFile(join(dir, "AGENTS.md"), "Content A\n");
		await writeFile(join(dir, "CLAUDE.md"), "Content B\n");

		const result = await validateFileConsistency(testDir);

		const locationIssue = result.issues.find(
			(i) =>
				i.category === "File Consistency" &&
				Array.isArray(i.affectedFiles) &&
				i.affectedFiles.some((f) => f.includes("locations-check")),
		);

		expect(locationIssue).toBeDefined();

		if (locationIssue && Array.isArray(locationIssue.location)) {
			expect(locationIssue.location).toHaveLength(2);

			const loc1 = locationIssue.location[0]!;
			const loc2 = locationIssue.location[1]!;

			expect(loc1.file).toContain("AGENTS.md");
			expect(loc2.file).toContain("CLAUDE.md");
			expect(loc1.start).toBe(1);
			expect(loc2.start).toBe(1);
		}
	});

	test("should handle empty directory gracefully", async () => {
		const emptyDir = join(testDir, "empty-test-dir");
		await mkdir(emptyDir, { recursive: true });

		const result = await validateFileConsistency(emptyDir);

		expect(result.pairsChecked).toBe(0);
		expect(result.conflictsFound).toBe(0);
		expect(result.issues).toHaveLength(0);
	});

	test("should return empty result on directory read error", async () => {
		const nonExistentDir = join(testDir, "does-not-exist-xyz");

		const result = await validateFileConsistency(nonExistentDir);

		// Should handle error gracefully
		expect(result.pairsChecked).toBe(0);
		expect(result.conflictsFound).toBe(0);
		expect(result.issues).toHaveLength(0);
	});

	test("should properly categorize issue as error type", async () => {
		const dir = join(testDir, "issue-type-check");
		await mkdir(dir, { recursive: true });

		await writeFile(join(dir, "AGENTS.md"), "Version 1\n");
		await writeFile(join(dir, "CLAUDE.md"), "Version 2\n");

		const result = await validateFileConsistency(testDir);

		const issue = result.issues.find(
			(i) =>
				i.category === "File Consistency" &&
				Array.isArray(i.affectedFiles) &&
				i.affectedFiles.some((f) => f.includes("issue-type-check")),
		);

		expect(issue).toBeDefined();

		if (issue) {
			expect(issue.issueType).toBe("error");
			expect(issue.evaluatorName).toBe("file-consistency");
		}
	});

	test("should report no conflict when files differ only in Packmind standards section", async () => {
		const dir = join(testDir, "packmind-only-diff");
		await mkdir(dir, { recursive: true });

		const baseContent = "# Project Context\n\nCommon content here.\n";
		const packmindSection1 = `<!-- start: Packmind standards -->
## Standards from Team A
Some standards content
<!-- end: Packmind standards -->`;
		const packmindSection2 = `<!-- start: Packmind standards -->
## Different Standards from Team B
Different standards content
<!-- end: Packmind standards -->`;

		const agentsContent = `${baseContent}\n${packmindSection1}\n`;
		const claudeContent = `${baseContent}\n${packmindSection2}\n`;

		await writeFile(join(dir, "AGENTS.md"), agentsContent);
		await writeFile(join(dir, "CLAUDE.md"), claudeContent);

		const result = await validateFileConsistency(testDir);

		const packmindIssue = result.issues.find(
			(i) =>
				i.category === "File Consistency" &&
				Array.isArray(i.affectedFiles) &&
				i.affectedFiles.some((f) => f.includes("packmind-only-diff")),
		);

		expect(packmindIssue).toBeUndefined();
	});

	test("should report conflict when files have real differences plus Packmind sections", async () => {
		const dir = join(testDir, "packmind-with-real-diff");
		await mkdir(dir, { recursive: true });

		const packmindSection = `<!-- start: Packmind standards -->
Standards content
<!-- end: Packmind standards -->`;

		const agentsContent = `# Project Context\n\nContent in AGENTS.md\n\n${packmindSection}\n`;
		const claudeContent = `# Project Context\n\nContent in CLAUDE.md\n\n${packmindSection}\n`;

		await writeFile(join(dir, "AGENTS.md"), agentsContent);
		await writeFile(join(dir, "CLAUDE.md"), claudeContent);

		const result = await validateFileConsistency(testDir);

		const conflictIssue = result.issues.find(
			(i) =>
				i.category === "File Consistency" &&
				Array.isArray(i.affectedFiles) &&
				i.affectedFiles.some((f) => f.includes("packmind-with-real-diff")),
		);

		expect(conflictIssue).toBeDefined();
		// The diff should NOT contain Packmind content since it's stripped
		if (conflictIssue?.context) {
			expect(conflictIssue.context).not.toContain("Packmind standards");
		}
	});

	test("should handle missing end tag gracefully - treat as normal content", async () => {
		const dir = join(testDir, "packmind-missing-end");
		await mkdir(dir, { recursive: true });

		// Malformed: missing end tag
		const agentsContent = `# Title\n\n<!-- start: Packmind standards -->\nOrphaned section\n`;
		const claudeContent = `# Title\n\n<!-- start: Packmind standards -->\nDifferent orphaned section\n`;

		await writeFile(join(dir, "AGENTS.md"), agentsContent);
		await writeFile(join(dir, "CLAUDE.md"), claudeContent);

		const result = await validateFileConsistency(testDir);

		// Should report a conflict since malformed tags are treated as regular content
		const conflictIssue = result.issues.find(
			(i) =>
				i.category === "File Consistency" &&
				Array.isArray(i.affectedFiles) &&
				i.affectedFiles.some((f) => f.includes("packmind-missing-end")),
		);

		expect(conflictIssue).toBeDefined();
	});

	test("should handle files with only Packmind sections as identical", async () => {
		const dir = join(testDir, "packmind-only-content");
		await mkdir(dir, { recursive: true });

		const agentsContent = `<!-- start: Packmind standards -->
Agent specific standards
<!-- end: Packmind standards -->`;
		const claudeContent = `<!-- start: Packmind standards -->
Claude specific standards
<!-- end: Packmind standards -->`;

		await writeFile(join(dir, "AGENTS.md"), agentsContent);
		await writeFile(join(dir, "CLAUDE.md"), claudeContent);

		const result = await validateFileConsistency(testDir);

		const issue = result.issues.find(
			(i) =>
				i.category === "File Consistency" &&
				Array.isArray(i.affectedFiles) &&
				i.affectedFiles.some((f) => f.includes("packmind-only-content")),
		);

		// After stripping, both files are empty, so they should be identical
		expect(issue).toBeUndefined();
	});

	test("should ignore trailing empty lines at end of file", async () => {
		const dir = join(testDir, "trailing-newlines");
		await mkdir(dir, { recursive: true });

		// Same content, but one file has multiple trailing newlines
		const agentsContent = "# Project Context\n\nContent here.\n";
		const claudeContent = "# Project Context\n\nContent here.\n\n\n";

		await writeFile(join(dir, "AGENTS.md"), agentsContent);
		await writeFile(join(dir, "CLAUDE.md"), claudeContent);

		const result = await validateFileConsistency(testDir);

		const issue = result.issues.find(
			(i) =>
				i.category === "File Consistency" &&
				Array.isArray(i.affectedFiles) &&
				i.affectedFiles.some((f) => f.includes("trailing-newlines")),
		);

		// Files differ only in trailing newlines, should be considered identical
		expect(issue).toBeUndefined();
	});

	test("should ignore difference between one and zero trailing newlines", async () => {
		const dir = join(testDir, "no-trailing-newline");
		await mkdir(dir, { recursive: true });

		// Same content, one has trailing newline, one doesn't
		const agentsContent = "# Project Context\n\nContent here.";
		const claudeContent = "# Project Context\n\nContent here.\n";

		await writeFile(join(dir, "AGENTS.md"), agentsContent);
		await writeFile(join(dir, "CLAUDE.md"), claudeContent);

		const result = await validateFileConsistency(testDir);

		const issue = result.issues.find(
			(i) =>
				i.category === "File Consistency" &&
				Array.isArray(i.affectedFiles) &&
				i.affectedFiles.some((f) => f.includes("no-trailing-newline")),
		);

		// Files differ only in presence of trailing newline, should be considered identical
		expect(issue).toBeUndefined();
	});

	test("should report no conflict when AGENTS.md is a @CLAUDE.md reference", async () => {
		const dir = join(testDir, "agents-ref-claude");
		await mkdir(dir, { recursive: true });

		await writeFile(join(dir, "AGENTS.md"), "@CLAUDE.md\n");
		await writeFile(
			join(dir, "CLAUDE.md"),
			"# Real Content\n\nActual instructions here.\n",
		);

		const result = await validateFileConsistency(testDir);

		const issue = result.issues.find(
			(i) =>
				i.category === "File Consistency" &&
				Array.isArray(i.affectedFiles) &&
				i.affectedFiles.some((f) => f.includes("agents-ref-claude")),
		);

		expect(issue).toBeUndefined();
	});

	test("should report no conflict when CLAUDE.md is a @AGENTS.md reference", async () => {
		const dir = join(testDir, "claude-ref-agents");
		await mkdir(dir, { recursive: true });

		await writeFile(
			join(dir, "AGENTS.md"),
			"# Real Content\n\nActual instructions here.\n",
		);
		await writeFile(join(dir, "CLAUDE.md"), "@AGENTS.md\n");

		const result = await validateFileConsistency(testDir);

		const issue = result.issues.find(
			(i) =>
				i.category === "File Consistency" &&
				Array.isArray(i.affectedFiles) &&
				i.affectedFiles.some((f) => f.includes("claude-ref-agents")),
		);

		expect(issue).toBeUndefined();
	});

	test("should report no conflict for dotslash variant @./CLAUDE.md", async () => {
		const dir = join(testDir, "dotslash-ref");
		await mkdir(dir, { recursive: true });

		await writeFile(join(dir, "AGENTS.md"), "@./CLAUDE.md");
		await writeFile(
			join(dir, "CLAUDE.md"),
			"# Real Content\n\nActual instructions here.\n",
		);

		const result = await validateFileConsistency(testDir);

		const issue = result.issues.find(
			(i) =>
				i.category === "File Consistency" &&
				Array.isArray(i.affectedFiles) &&
				i.affectedFiles.some((f) => f.includes("dotslash-ref")),
		);

		expect(issue).toBeUndefined();
	});

	test("should still report conflict when reference has extra content", async () => {
		const dir = join(testDir, "ref-with-extra-content");
		await mkdir(dir, { recursive: true });

		await writeFile(
			join(dir, "AGENTS.md"),
			"@CLAUDE.md\n\n# Also some extra content\n",
		);
		await writeFile(
			join(dir, "CLAUDE.md"),
			"# Real Content\n\nActual instructions here.\n",
		);

		const result = await validateFileConsistency(testDir);

		const issue = result.issues.find(
			(i) =>
				i.category === "File Consistency" &&
				Array.isArray(i.affectedFiles) &&
				i.affectedFiles.some((f) => f.includes("ref-with-extra-content")),
		);

		expect(issue).toBeDefined();
	});
});
