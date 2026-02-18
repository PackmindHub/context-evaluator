/**
 * Git operations for remediation workflow.
 * Provides functions to check git status, capture diffs, parse diffs, and reset working directories.
 */

import type { IFileChange } from "@shared/types/remediation";
import { join } from "path";

interface GitStatusResult {
	clean: boolean;
	status: string;
}

/**
 * Run a shell command and return stdout
 */
async function runGit(args: string[], cwd: string): Promise<string> {
	const proc = Bun.spawn(["git", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (exitCode !== 0) {
		throw new Error(
			`git ${args[0]} failed (exit ${exitCode}): ${stderr.trim()}`,
		);
	}
	return stdout;
}

/**
 * Check if the working tree is clean (no uncommitted changes).
 */
export async function checkCleanWorkingTree(
	cwd: string,
): Promise<GitStatusResult> {
	const status = await runGit(["status", "--porcelain"], cwd);
	return { clean: status.trim().length === 0, status: status.trim() };
}

/**
 * Capture all changes (modified, added, deleted) as a unified diff.
 * Stages everything first so new files are included.
 */
export async function captureGitDiff(cwd: string): Promise<string> {
	await runGit(["add", "-A"], cwd);
	const diff = await runGit(["diff", "--cached"], cwd);
	return diff;
}

/**
 * Reset the working directory to a pristine state.
 * Undoes all staged/unstaged changes and removes untracked files.
 */
export async function resetWorkingDirectory(cwd: string): Promise<void> {
	await runGit(["reset", "HEAD", "--quiet"], cwd);
	await runGit(["checkout", "."], cwd);
	await runGit(["clean", "-fd"], cwd);
}

/**
 * Apply a patch (unified diff) to a working directory using git apply.
 */
export async function applyPatch(
	cwd: string,
	patchContent: string,
): Promise<void> {
	const patchFile = join(cwd, ".remediation-impact.patch");
	try {
		await Bun.write(patchFile, patchContent);
		await runGit(["apply", "--whitespace=fix", patchFile], cwd);
	} finally {
		try {
			const { unlink } = await import("fs/promises");
			await unlink(patchFile);
		} catch {
			// Ignore cleanup errors
		}
	}
}

/**
 * Parse a unified diff string into per-file IFileChange objects.
 */
export function parseUnifiedDiff(diffText: string): IFileChange[] {
	if (!diffText.trim()) {
		return [];
	}

	const files: IFileChange[] = [];

	// Split on "diff --git" boundaries
	const diffSegments = diffText.split(/^diff --git /m).filter(Boolean);

	for (const segment of diffSegments) {
		const fullDiff = `diff --git ${segment}`;

		// Extract file path from "diff --git a/path b/path"
		const headerMatch = segment.match(/^a\/(.+?) b\/(.+)/);
		if (!headerMatch) continue;

		const path = headerMatch[2]!;

		// Determine status from diff headers
		let status: "modified" | "added" | "deleted" = "modified";
		if (/^new file mode/m.test(segment)) {
			status = "added";
		} else if (/^deleted file mode/m.test(segment)) {
			status = "deleted";
		}

		// Count additions and deletions (lines starting with + or - after @@)
		let additions = 0;
		let deletions = 0;
		const lines = segment.split("\n");
		let inHunk = false;

		for (const line of lines) {
			if (line.startsWith("@@")) {
				inHunk = true;
				continue;
			}
			if (!inHunk) continue;

			if (line.startsWith("+") && !line.startsWith("+++")) {
				additions++;
			} else if (line.startsWith("-") && !line.startsWith("---")) {
				deletions++;
			}
		}

		files.push({ path, status, diff: fullDiff, additions, deletions });
	}

	return files;
}
