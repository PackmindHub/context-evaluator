/**
 * Git repository URL validation for backend use.
 * Mirrors the frontend validation logic in frontend/src/lib/url-validation.ts.
 */

/**
 * Validates if a string is a valid git repository URL.
 * Accepts HTTPS, SSH, and git protocol URLs.
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
