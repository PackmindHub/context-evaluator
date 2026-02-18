import type { ProgressCallback } from "@shared/types/evaluation";
import { spawn } from "child_process";
import { mkdir, mkdtemp, rm } from "fs/promises";
import { join, resolve } from "path";

export interface CloneResult {
	path: string;
	cleanup: () => Promise<void>;
}

export interface CloneOptions {
	verbose?: boolean;
	progressCallback?: ProgressCallback;
	/** Clone a specific branch */
	branch?: string;
	/** After cloning, checkout a specific commit SHA */
	commitSha?: string;
}

/**
 * Normalize Git repository URLs to repository root URLs for cloning
 * Handles various URL formats from GitHub, GitLab, Bitbucket, and self-hosted Git:
 * - https://github.com/user/repo/blob/main/file.md -> https://github.com/user/repo
 * - https://gitlab.com/user/repo/-/blob/main/file.md -> https://gitlab.com/user/repo
 * - https://bitbucket.org/user/repo/src/main/file.md -> https://bitbucket.org/user/repo
 * - https://github.com/user/repo.git -> https://github.com/user/repo
 */
function normalizeGitUrl(url: string): string {
	try {
		const parsed = new URL(url);

		// Extract path segments
		const pathSegments = parsed.pathname.split("/").filter(Boolean);

		// Need at least user/repo
		if (pathSegments.length < 2) {
			return url;
		}

		// Get user and repo (first two segments)
		const user = pathSegments[0];
		let repo = pathSegments[1];

		// Remove .git suffix if present
		if (repo?.endsWith(".git")) {
			repo = repo.slice(0, -4);
		}

		// Construct clean repository URL
		return `${parsed.protocol}//${parsed.host}/${user}/${repo}`;
	} catch (_error) {
		// If URL parsing fails, return original
		return url;
	}
}

/**
 * Clone a Git repository to a temporary directory using shallow clone
 * @param repositoryUrl - Git repository URL (will be normalized to repo root)
 * @param options - Options for cloning
 * @returns Object with temp directory path and cleanup function
 */
export async function cloneRepository(
	repositoryUrl: string,
	options: CloneOptions = {},
): Promise<CloneResult> {
	const { verbose = false, progressCallback, branch, commitSha } = options;

	// Normalize the URL to repository root
	const normalizedUrl = normalizeGitUrl(repositoryUrl);

	if (verbose && normalizedUrl !== repositoryUrl) {
		console.log(`[Git] Normalized URL: ${repositoryUrl} -> ${normalizedUrl}`);
	}

	// Create tmp/clones directory if it doesn't exist
	const clonesDir = resolve(process.cwd(), "tmp", "clones");
	await mkdir(clonesDir, { recursive: true });

	// Create a temporary directory in tmp/clones
	const tempDir = await mkdtemp(join(clonesDir, "agents-eval-"));

	if (verbose) {
		console.log(`[Git] Cloning ${normalizedUrl} to ${tempDir}`);
	}

	// Emit clone.started event
	if (progressCallback) {
		progressCallback({
			type: "clone.started",
			data: { repositoryUrl: normalizedUrl },
		});
	}

	return new Promise((resolveClone, reject) => {
		// Use git clone with --depth 1 for shallow clone
		const args = ["clone", "--depth", "1"];
		if (branch && branch !== "HEAD") {
			args.push("--branch", branch);
		}
		args.push(normalizedUrl, tempDir);

		const child = spawn("git", args, {
			stdio: verbose ? "inherit" : "pipe",
		});

		let stderr = "";

		if (!verbose) {
			child.stderr?.on("data", (data) => {
				stderr += data.toString();
			});
		}

		child.on("close", async (code) => {
			if (code !== 0) {
				// Cleanup temp directory on failure
				rm(tempDir, { recursive: true, force: true }).catch(() => {
					// Intentionally ignoring cleanup errors
				});
				reject(
					new Error(
						`Git clone failed with code ${code}: ${stderr || "Unknown error"}`,
					),
				);
				return;
			}

			if (verbose) {
				console.log(`[Git] Successfully cloned to ${tempDir}`);
			}

			// If a specific commit SHA is requested, fetch and checkout it
			if (commitSha) {
				const fetchProc = Bun.spawn(
					["git", "fetch", "--depth", "1", "origin", commitSha],
					{ cwd: tempDir, stdout: "pipe", stderr: "pipe" },
				);
				const fetchExitCode = await fetchProc.exited;

				if (fetchExitCode !== 0) {
					const fetchStderr = await new Response(fetchProc.stderr).text();
					rm(tempDir, { recursive: true, force: true }).catch(() => {
						// Intentionally ignoring cleanup errors
					});
					reject(
						new Error(
							`Failed to fetch commit ${commitSha}: ${fetchStderr || `git fetch exited with code ${fetchExitCode}`}. The commit may have been force-pushed or garbage-collected.`,
						),
					);
					return;
				}

				const checkoutProc = Bun.spawn(["git", "checkout", commitSha], {
					cwd: tempDir,
					stdout: "pipe",
					stderr: "pipe",
				});
				const checkoutExitCode = await checkoutProc.exited;

				if (checkoutExitCode !== 0) {
					const checkoutStderr = await new Response(checkoutProc.stderr).text();
					rm(tempDir, { recursive: true, force: true }).catch(() => {
						// Intentionally ignoring cleanup errors
					});
					reject(
						new Error(
							`Failed to checkout commit ${commitSha}: ${checkoutStderr || `git checkout exited with code ${checkoutExitCode}`}`,
						),
					);
					return;
				}

				if (verbose) {
					console.log(`[Git] Checked out commit ${commitSha}`);
				}
			}

			// Emit clone.completed event
			if (progressCallback) {
				progressCallback({
					type: "clone.completed",
					data: {},
				});
			}

			// Return path and cleanup function
			resolveClone({
				path: tempDir,
				cleanup: async () => {
					if (verbose) {
						console.log(`[Git] Cleaning up ${tempDir}`);
					}
					await rm(tempDir, { recursive: true, force: true });
				},
			});
		});

		child.on("error", (err) => {
			// Cleanup temp directory on error
			rm(tempDir, { recursive: true, force: true }).catch(() => {
				// Intentionally ignoring cleanup errors
			});
			reject(new Error(`Failed to spawn git: ${err.message}`));
		});
	});
}
