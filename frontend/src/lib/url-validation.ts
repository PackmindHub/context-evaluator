/**
 * Git repository URL validation and normalization utilities.
 * Supports GitHub, GitLab, Bitbucket, and self-hosted git repositories.
 */

/**
 * Validates if a string is a valid git repository URL.
 * Accepts HTTPS, SSH, and git protocol URLs.
 *
 * @param url - The URL to validate
 * @returns true if the URL is a valid git repository URL
 *
 * @example
 * isValidGitUrl('https://github.com/owner/repo') // true
 * isValidGitUrl('git@gitlab.com:owner/repo.git') // true
 * isValidGitUrl('https://example.com') // false
 */
export function isValidGitUrl(url: string): boolean {
	if (!url || typeof url !== "string") {
		return false;
	}

	const trimmed = url.trim();

	// HTTPS format: https://domain.com/path/to/repo
	const httpsRegex =
		/^https?:\/\/[a-zA-Z0-9.-]+(:[0-9]+)?\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/;

	// SSH format: git@domain.com:path/to/repo.git
	const sshRegex = /^git@[a-zA-Z0-9.-]+:[a-zA-Z0-9_./-]+/;

	// Git protocol: git://domain.com/path/to/repo
	const gitProtocolRegex =
		/^git:\/\/[a-zA-Z0-9.-]+(:[0-9]+)?\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/;

	return (
		httpsRegex.test(trimmed) ||
		sshRegex.test(trimmed) ||
		gitProtocolRegex.test(trimmed)
	);
}

/**
 * Normalizes a git repository URL by removing provider-specific paths and cleaning up format.
 * Preserves the format needed for cloning (HTTPS vs SSH).
 *
 * @param url - The URL to normalize
 * @returns The normalized URL
 *
 * @example
 * normalizeGitUrl('https://github.com/owner/repo/blob/main/file.md')
 * // 'https://github.com/owner/repo'
 *
 * normalizeGitUrl('https://gitlab.com/owner/repo.git')
 * // 'https://gitlab.com/owner/repo'
 */
export function normalizeGitUrl(url: string): string {
	if (!url || typeof url !== "string") {
		return url;
	}

	let normalized = url.trim();

	// Handle HTTPS URLs
	if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
		// Remove trailing slash first
		normalized = normalized.replace(/\/$/, "");

		// Remove .git suffix
		normalized = normalized.replace(/\.git$/, "");

		// Remove provider-specific path segments
		// GitHub: /blob/, /tree/, /commit/, /pull/, /issues/
		// GitLab: /blob/, /tree/, /-/blob/, /-/tree/
		// Bitbucket: /src/, /commits/, /pull-requests/
		normalized = normalized.replace(
			/\/(blob|tree|commit|commits|pull|pull-requests|issues|src|-\/blob|-\/tree)\/.*$/,
			"",
		);
	}

	// Handle SSH URLs - keep as-is for cloning
	// git@domain:owner/repo.git format is already clean

	return normalized;
}

/**
 * Parses a git repository URL and extracts provider, owner, and repo name.
 *
 * @param url - The URL to parse
 * @returns An object with provider, owner, and repo, or null if parsing fails
 *
 * @example
 * parseGitUrl('https://github.com/owner/repo')
 * // { provider: 'github.com', owner: 'owner', repo: 'repo' }
 *
 * parseGitUrl('git@gitlab.com:owner/repo.git')
 * // { provider: 'gitlab.com', owner: 'owner', repo: 'repo' }
 */
export function parseGitUrl(
	url: string,
): { provider: string; owner: string; repo: string } | null {
	if (!url || typeof url !== "string") {
		return null;
	}

	const trimmed = url.trim();

	// Parse HTTPS format: https://domain.com/owner/repo or https://domain.com/group/subgroup/project
	if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
		const httpsMatch = trimmed.match(
			/^https?:\/\/([a-zA-Z0-9.-]+(?::[0-9]+)?)\/(.+)/,
		);
		if (httpsMatch) {
			const [, provider, path] = httpsMatch;
			const pathParts = path.replace(/\.git$/, "").split("/");

			// Handle nested paths (e.g., group/subgroup/project)
			// Take the first segment as owner and last as repo
			if (pathParts.length >= 2) {
				const owner = pathParts[0];
				const repo = pathParts[pathParts.length - 1];
				return { provider, owner, repo };
			}
		}
	}

	// Parse SSH format: git@domain.com:owner/repo.git
	if (trimmed.startsWith("git@")) {
		const sshMatch = trimmed.match(/^git@([a-zA-Z0-9.-]+):([a-zA-Z0-9_./-]+)/);
		if (sshMatch) {
			const [, provider, path] = sshMatch;
			const pathParts = path.replace(/\.git$/, "").split("/");

			// Handle nested paths (e.g., group/subgroup/project)
			// Take the first segment as owner and last as repo
			if (pathParts.length >= 2) {
				const owner = pathParts[0];
				const repo = pathParts[pathParts.length - 1];
				return { provider, owner, repo };
			}
		}
	}

	// Parse git protocol: git://domain.com/owner/repo
	if (trimmed.startsWith("git://")) {
		const gitMatch = trimmed.match(
			/^git:\/\/([a-zA-Z0-9.-]+(?::[0-9]+)?)\/(.+)/,
		);
		if (gitMatch) {
			const [, provider, path] = gitMatch;
			const pathParts = path.replace(/\.git$/, "").split("/");

			// Handle nested paths (e.g., group/subgroup/project)
			// Take the first segment as owner and last as repo
			if (pathParts.length >= 2) {
				const owner = pathParts[0];
				const repo = pathParts[pathParts.length - 1];
				return { provider, owner, repo };
			}
		}
	}

	return null;
}
