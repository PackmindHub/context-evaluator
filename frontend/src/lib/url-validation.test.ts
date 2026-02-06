import { describe, expect, test } from "bun:test";
import { isValidGitUrl, normalizeGitUrl, parseGitUrl } from "./url-validation";

describe("isValidGitUrl", () => {
	describe("GitHub URLs", () => {
		test("accepts standard GitHub HTTPS URLs", () => {
			expect(isValidGitUrl("https://github.com/owner/repo")).toBe(true);
			expect(isValidGitUrl("https://github.com/facebook/react")).toBe(true);
		});

		test("accepts GitHub URLs with .git suffix", () => {
			expect(isValidGitUrl("https://github.com/owner/repo.git")).toBe(true);
		});

		test("accepts GitHub SSH URLs", () => {
			expect(isValidGitUrl("git@github.com:owner/repo.git")).toBe(true);
			expect(isValidGitUrl("git@github.com:facebook/react.git")).toBe(true);
		});

		test("accepts GitHub git protocol URLs", () => {
			expect(isValidGitUrl("git://github.com/owner/repo")).toBe(true);
		});
	});

	describe("GitLab URLs", () => {
		test("accepts standard GitLab HTTPS URLs", () => {
			expect(isValidGitUrl("https://gitlab.com/owner/repo")).toBe(true);
			expect(isValidGitUrl("https://gitlab.com/gitlab-org/gitlab")).toBe(true);
		});

		test("accepts GitLab SSH URLs", () => {
			expect(isValidGitUrl("git@gitlab.com:owner/repo.git")).toBe(true);
			expect(isValidGitUrl("git@gitlab.com:gitlab-org/gitlab.git")).toBe(true);
		});

		test("accepts GitLab URLs with nested groups", () => {
			expect(isValidGitUrl("https://gitlab.com/group/subgroup/project")).toBe(
				true,
			);
			expect(isValidGitUrl("git@gitlab.com:group/subgroup/project.git")).toBe(
				true,
			);
		});
	});

	describe("Bitbucket URLs", () => {
		test("accepts standard Bitbucket HTTPS URLs", () => {
			expect(isValidGitUrl("https://bitbucket.org/owner/repo")).toBe(true);
			expect(isValidGitUrl("https://bitbucket.org/atlassian/jira")).toBe(true);
		});

		test("accepts Bitbucket SSH URLs", () => {
			expect(isValidGitUrl("git@bitbucket.org:owner/repo.git")).toBe(true);
		});
	});

	describe("Self-hosted Git URLs", () => {
		test("accepts self-hosted Git HTTPS URLs", () => {
			expect(isValidGitUrl("https://git.company.com/owner/repo")).toBe(true);
			expect(isValidGitUrl("https://git.example.org/team/project")).toBe(true);
		});

		test("accepts self-hosted Git URLs with custom ports", () => {
			expect(isValidGitUrl("https://git.company.com:8443/owner/repo")).toBe(
				true,
			);
			expect(isValidGitUrl("http://localhost:3000/owner/repo")).toBe(true);
		});

		test("accepts self-hosted Git SSH URLs", () => {
			expect(isValidGitUrl("git@git.company.com:owner/repo.git")).toBe(true);
		});
	});

	describe("Edge cases", () => {
		test("accepts URLs with trailing slashes", () => {
			expect(isValidGitUrl("https://github.com/owner/repo/")).toBe(true);
		});

		test("accepts URLs with dashes and underscores", () => {
			expect(isValidGitUrl("https://github.com/my-org/my_repo")).toBe(true);
			expect(
				isValidGitUrl("https://git.my-company.com/team_name/project-name"),
			).toBe(true);
		});

		test("accepts URLs with dots in names", () => {
			expect(isValidGitUrl("https://github.com/owner/repo.name")).toBe(true);
		});
	});

	describe("Invalid URLs", () => {
		test("rejects URLs without owner/repo structure", () => {
			expect(isValidGitUrl("https://github.com")).toBe(false);
			expect(isValidGitUrl("https://github.com/owner")).toBe(false);
		});

		test("rejects non-git URLs", () => {
			expect(isValidGitUrl("https://example.com")).toBe(false);
			expect(isValidGitUrl("https://example.com/page")).toBe(false);
		});

		test("rejects invalid input types", () => {
			expect(isValidGitUrl("")).toBe(false);
			expect(isValidGitUrl("   ")).toBe(false);
			// @ts-expect-error - testing invalid input
			expect(isValidGitUrl(null)).toBe(false);
			// @ts-expect-error - testing invalid input
			expect(isValidGitUrl(undefined)).toBe(false);
		});

		test("rejects malformed SSH URLs", () => {
			expect(isValidGitUrl("git@")).toBe(false);
			expect(isValidGitUrl("git@github.com")).toBe(false);
		});
	});
});

describe("normalizeGitUrl", () => {
	describe("GitHub URLs", () => {
		test("removes /blob/ paths", () => {
			expect(
				normalizeGitUrl("https://github.com/owner/repo/blob/main/file.md"),
			).toBe("https://github.com/owner/repo");
		});

		test("removes /tree/ paths", () => {
			expect(
				normalizeGitUrl("https://github.com/owner/repo/tree/feature-branch"),
			).toBe("https://github.com/owner/repo");
		});

		test("removes /commit/ paths", () => {
			expect(
				normalizeGitUrl("https://github.com/owner/repo/commit/abc123"),
			).toBe("https://github.com/owner/repo");
		});

		test("removes /pull/ paths", () => {
			expect(normalizeGitUrl("https://github.com/owner/repo/pull/123")).toBe(
				"https://github.com/owner/repo",
			);
		});

		test("removes /issues/ paths", () => {
			expect(normalizeGitUrl("https://github.com/owner/repo/issues/456")).toBe(
				"https://github.com/owner/repo",
			);
		});
	});

	describe("GitLab URLs", () => {
		test("removes /blob/ paths", () => {
			expect(
				normalizeGitUrl("https://gitlab.com/owner/repo/blob/main/file.md"),
			).toBe("https://gitlab.com/owner/repo");
		});

		test("removes /-/blob/ paths (GitLab-specific)", () => {
			expect(
				normalizeGitUrl("https://gitlab.com/owner/repo/-/blob/main/file.md"),
			).toBe("https://gitlab.com/owner/repo");
		});

		test("removes /-/tree/ paths (GitLab-specific)", () => {
			expect(normalizeGitUrl("https://gitlab.com/owner/repo/-/tree/main")).toBe(
				"https://gitlab.com/owner/repo",
			);
		});
	});

	describe("Bitbucket URLs", () => {
		test("removes /src/ paths", () => {
			expect(
				normalizeGitUrl("https://bitbucket.org/owner/repo/src/main/file.md"),
			).toBe("https://bitbucket.org/owner/repo");
		});

		test("removes /commits/ paths", () => {
			expect(
				normalizeGitUrl("https://bitbucket.org/owner/repo/commits/abc123"),
			).toBe("https://bitbucket.org/owner/repo");
		});

		test("removes /pull-requests/ paths", () => {
			expect(
				normalizeGitUrl("https://bitbucket.org/owner/repo/pull-requests/123"),
			).toBe("https://bitbucket.org/owner/repo");
		});
	});

	describe("Common normalizations", () => {
		test("removes .git suffix", () => {
			expect(normalizeGitUrl("https://github.com/owner/repo.git")).toBe(
				"https://github.com/owner/repo",
			);
		});

		test("removes trailing slashes", () => {
			expect(normalizeGitUrl("https://github.com/owner/repo/")).toBe(
				"https://github.com/owner/repo",
			);
		});

		test("handles combination of .git and trailing slash", () => {
			expect(normalizeGitUrl("https://github.com/owner/repo.git/")).toBe(
				"https://github.com/owner/repo",
			);
		});
	});

	describe("SSH URLs", () => {
		test("preserves SSH format", () => {
			expect(normalizeGitUrl("git@github.com:owner/repo.git")).toBe(
				"git@github.com:owner/repo.git",
			);
		});

		test("preserves SSH format without .git", () => {
			expect(normalizeGitUrl("git@gitlab.com:owner/repo")).toBe(
				"git@gitlab.com:owner/repo",
			);
		});
	});

	describe("Edge cases", () => {
		test("handles already normalized URLs", () => {
			expect(normalizeGitUrl("https://github.com/owner/repo")).toBe(
				"https://github.com/owner/repo",
			);
		});

		test("handles empty or invalid input", () => {
			expect(normalizeGitUrl("")).toBe("");
			expect(normalizeGitUrl("   ")).toBe("");
			// @ts-expect-error - testing invalid input
			expect(normalizeGitUrl(null)).toBe(null);
			// @ts-expect-error - testing invalid input
			expect(normalizeGitUrl(undefined)).toBe(undefined);
		});

		test("trims whitespace", () => {
			expect(normalizeGitUrl("  https://github.com/owner/repo  ")).toBe(
				"https://github.com/owner/repo",
			);
		});
	});
});

describe("parseGitUrl", () => {
	describe("GitHub URLs", () => {
		test("parses standard GitHub HTTPS URLs", () => {
			expect(parseGitUrl("https://github.com/facebook/react")).toEqual({
				provider: "github.com",
				owner: "facebook",
				repo: "react",
			});
		});

		test("parses GitHub URLs with .git suffix", () => {
			expect(parseGitUrl("https://github.com/owner/repo.git")).toEqual({
				provider: "github.com",
				owner: "owner",
				repo: "repo",
			});
		});

		test("parses GitHub SSH URLs", () => {
			expect(parseGitUrl("git@github.com:facebook/react.git")).toEqual({
				provider: "github.com",
				owner: "facebook",
				repo: "react",
			});
		});

		test("parses GitHub git protocol URLs", () => {
			expect(parseGitUrl("git://github.com/owner/repo")).toEqual({
				provider: "github.com",
				owner: "owner",
				repo: "repo",
			});
		});
	});

	describe("GitLab URLs", () => {
		test("parses standard GitLab HTTPS URLs", () => {
			expect(parseGitUrl("https://gitlab.com/gitlab-org/gitlab")).toEqual({
				provider: "gitlab.com",
				owner: "gitlab-org",
				repo: "gitlab",
			});
		});

		test("parses GitLab SSH URLs", () => {
			expect(parseGitUrl("git@gitlab.com:owner/repo.git")).toEqual({
				provider: "gitlab.com",
				owner: "owner",
				repo: "repo",
			});
		});

		test("parses GitLab URLs with nested groups", () => {
			expect(parseGitUrl("https://gitlab.com/group/subgroup/project")).toEqual({
				provider: "gitlab.com",
				owner: "group",
				repo: "project",
			});
		});

		test("parses GitLab SSH URLs with nested groups", () => {
			expect(parseGitUrl("git@gitlab.com:group/subgroup/project.git")).toEqual({
				provider: "gitlab.com",
				owner: "group",
				repo: "project",
			});
		});
	});

	describe("Bitbucket URLs", () => {
		test("parses standard Bitbucket HTTPS URLs", () => {
			expect(parseGitUrl("https://bitbucket.org/atlassian/jira")).toEqual({
				provider: "bitbucket.org",
				owner: "atlassian",
				repo: "jira",
			});
		});

		test("parses Bitbucket SSH URLs", () => {
			expect(parseGitUrl("git@bitbucket.org:owner/repo.git")).toEqual({
				provider: "bitbucket.org",
				owner: "owner",
				repo: "repo",
			});
		});
	});

	describe("Self-hosted Git URLs", () => {
		test("parses self-hosted HTTPS URLs", () => {
			expect(parseGitUrl("https://git.company.com/team/project")).toEqual({
				provider: "git.company.com",
				owner: "team",
				repo: "project",
			});
		});

		test("parses self-hosted URLs with custom ports", () => {
			expect(parseGitUrl("https://git.company.com:8443/owner/repo")).toEqual({
				provider: "git.company.com:8443",
				owner: "owner",
				repo: "repo",
			});
		});

		test("parses self-hosted SSH URLs", () => {
			expect(parseGitUrl("git@git.company.com:owner/repo.git")).toEqual({
				provider: "git.company.com",
				owner: "owner",
				repo: "repo",
			});
		});
	});

	describe("Edge cases", () => {
		test("handles URLs with dashes and underscores", () => {
			expect(parseGitUrl("https://github.com/my-org/my_repo")).toEqual({
				provider: "github.com",
				owner: "my-org",
				repo: "my_repo",
			});
		});

		test("handles URLs with dots in names", () => {
			expect(parseGitUrl("https://github.com/owner/repo.name")).toEqual({
				provider: "github.com",
				owner: "owner",
				repo: "repo.name",
			});
		});
	});

	describe("Invalid URLs", () => {
		test("returns null for URLs without owner/repo", () => {
			expect(parseGitUrl("https://github.com")).toBeNull();
			expect(parseGitUrl("https://github.com/owner")).toBeNull();
		});

		test("returns null for non-git URLs", () => {
			expect(parseGitUrl("https://example.com")).toBeNull();
		});

		test("returns null for invalid input", () => {
			expect(parseGitUrl("")).toBeNull();
			expect(parseGitUrl("   ")).toBeNull();
			// @ts-expect-error - testing invalid input
			expect(parseGitUrl(null)).toBeNull();
			// @ts-expect-error - testing invalid input
			expect(parseGitUrl(undefined)).toBeNull();
		});

		test("returns null for malformed SSH URLs", () => {
			expect(parseGitUrl("git@")).toBeNull();
			expect(parseGitUrl("git@github.com")).toBeNull();
		});
	});
});
