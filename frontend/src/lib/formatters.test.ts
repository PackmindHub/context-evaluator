import { describe, expect, test } from "bun:test";
import {
	extractRepoName,
	extractRepoNameOnly,
	getFilteredEvaluatorCount,
} from "./formatters";

describe("getFilteredEvaluatorCount", () => {
	test("should return 17 for 'all' filter", () => {
		expect(getFilteredEvaluatorCount("all", 100)).toBe(17);
		expect(getFilteredEvaluatorCount("all", 19)).toBe(17);
	});

	test("should return 13 for 'errors' filter", () => {
		expect(getFilteredEvaluatorCount("errors", 100)).toBe(13);
		expect(getFilteredEvaluatorCount("errors", 19)).toBe(13);
	});

	test("should return 4 for 'suggestions' filter", () => {
		expect(getFilteredEvaluatorCount("suggestions", 100)).toBe(4);
		expect(getFilteredEvaluatorCount("suggestions", 19)).toBe(4);
	});

	test("should respect maxCount limit when it's lower than filter count", () => {
		// If user sets maxCount to 10, it should limit to 10 even for 'all' (17)
		expect(getFilteredEvaluatorCount("all", 10)).toBe(10);

		// If user sets maxCount to 5, 'errors' (13) should be limited to 5
		expect(getFilteredEvaluatorCount("errors", 5)).toBe(5);

		// If user sets maxCount to 3, 'suggestions' (4) should be limited to 3
		expect(getFilteredEvaluatorCount("suggestions", 3)).toBe(3);
	});

	test("should work with default maxCount of 17", () => {
		expect(getFilteredEvaluatorCount("all")).toBe(17);
		expect(getFilteredEvaluatorCount("errors")).toBe(13);
		expect(getFilteredEvaluatorCount("suggestions")).toBe(4);
	});

	test("REGRESSION: should correctly show filtered count in UI progress display", () => {
		// Before fix: always showed 17 regardless of filter
		// After fix: shows the correct filtered count

		// When user selects "Suggestions Only", should show 4 not 17
		const suggestionsCount = getFilteredEvaluatorCount("suggestions", 17);
		expect(suggestionsCount).toBe(4);
		expect(suggestionsCount).not.toBe(17);

		// When user selects "Errors Only", should show 13 not 17
		const errorsCount = getFilteredEvaluatorCount("errors", 17);
		expect(errorsCount).toBe(13);
		expect(errorsCount).not.toBe(17);
	});
});

describe("extractRepoName", () => {
	describe("GitHub URLs", () => {
		test("extracts owner/repo from standard HTTPS URL", () => {
			expect(extractRepoName("https://github.com/facebook/react")).toBe(
				"facebook/react",
			);
			expect(extractRepoName("https://github.com/owner/repo")).toBe(
				"owner/repo",
			);
		});

		test("extracts owner/repo from URL with .git suffix", () => {
			expect(extractRepoName("https://github.com/owner/repo.git")).toBe(
				"owner/repo",
			);
		});

		test("extracts owner/repo from SSH URL", () => {
			expect(extractRepoName("git@github.com:facebook/react.git")).toBe(
				"facebook/react",
			);
			expect(extractRepoName("git@github.com:owner/repo")).toBe("owner/repo");
		});

		test("handles URLs with dashes and underscores", () => {
			expect(extractRepoName("https://github.com/my-org/my_repo")).toBe(
				"my-org/my_repo",
			);
		});

		test("handles URLs with dots in names", () => {
			expect(extractRepoName("https://github.com/owner/repo.name")).toBe(
				"owner/repo.name",
			);
		});
	});

	describe("GitLab URLs", () => {
		test("extracts owner/repo from standard HTTPS URL", () => {
			expect(extractRepoName("https://gitlab.com/gitlab-org/gitlab")).toBe(
				"gitlab-org/gitlab",
			);
			expect(extractRepoName("https://gitlab.com/owner/repo")).toBe(
				"owner/repo",
			);
		});

		test("extracts owner/repo from URL with .git suffix", () => {
			expect(extractRepoName("https://gitlab.com/owner/repo.git")).toBe(
				"owner/repo",
			);
		});

		test("extracts owner/repo from SSH URL", () => {
			expect(extractRepoName("git@gitlab.com:owner/repo.git")).toBe(
				"owner/repo",
			);
			expect(extractRepoName("git@gitlab.com:owner/repo")).toBe("owner/repo");
		});

		test("handles nested groups (extracts first and last segments)", () => {
			expect(extractRepoName("https://gitlab.com/group/subgroup/project")).toBe(
				"group/project",
			);
			expect(extractRepoName("git@gitlab.com:group/subgroup/project.git")).toBe(
				"group/project",
			);
		});
	});

	describe("Bitbucket URLs", () => {
		test("extracts owner/repo from standard HTTPS URL", () => {
			expect(extractRepoName("https://bitbucket.org/atlassian/jira")).toBe(
				"atlassian/jira",
			);
			expect(extractRepoName("https://bitbucket.org/owner/repo")).toBe(
				"owner/repo",
			);
		});

		test("extracts owner/repo from URL with .git suffix", () => {
			expect(extractRepoName("https://bitbucket.org/owner/repo.git")).toBe(
				"owner/repo",
			);
		});

		test("extracts owner/repo from SSH URL", () => {
			expect(extractRepoName("git@bitbucket.org:owner/repo.git")).toBe(
				"owner/repo",
			);
		});
	});

	describe("Self-hosted Git URLs", () => {
		test("extracts owner/repo from self-hosted HTTPS URL", () => {
			expect(extractRepoName("https://git.company.com/team/project")).toBe(
				"team/project",
			);
			expect(extractRepoName("https://git.example.org/owner/repo")).toBe(
				"owner/repo",
			);
		});

		test("extracts owner/repo from URL with custom port", () => {
			expect(extractRepoName("https://git.company.com:8443/owner/repo")).toBe(
				"owner/repo",
			);
		});

		test("extracts owner/repo from self-hosted SSH URL", () => {
			expect(extractRepoName("git@git.company.com:owner/repo.git")).toBe(
				"owner/repo",
			);
		});
	});

	describe("Edge cases", () => {
		test("handles invalid URLs gracefully", () => {
			expect(extractRepoName("not-a-url")).toBe("not-a-url");
			expect(extractRepoName("https://example.com")).toBe(
				"https://example.com",
			);
		});

		test("handles empty or malformed input", () => {
			expect(extractRepoName("")).toBe("");
		});
	});
});

describe("extractRepoNameOnly", () => {
	describe("GitHub URLs", () => {
		test("extracts just repo name from HTTPS URL", () => {
			expect(extractRepoNameOnly("https://github.com/facebook/react")).toBe(
				"react",
			);
			expect(extractRepoNameOnly("https://github.com/owner/repo")).toBe("repo");
		});

		test("extracts repo name from URL with .git suffix", () => {
			expect(extractRepoNameOnly("https://github.com/owner/repo.git")).toBe(
				"repo",
			);
		});

		test("extracts repo name from SSH URL", () => {
			expect(extractRepoNameOnly("git@github.com:facebook/react.git")).toBe(
				"react",
			);
			expect(extractRepoNameOnly("git@github.com:owner/repo")).toBe("repo");
		});

		test("handles repo names with dashes and underscores", () => {
			expect(extractRepoNameOnly("https://github.com/my-org/my_repo")).toBe(
				"my_repo",
			);
		});

		test("handles repo names with dots", () => {
			expect(extractRepoNameOnly("https://github.com/owner/repo.name")).toBe(
				"repo.name",
			);
		});
	});

	describe("GitLab URLs", () => {
		test("extracts just repo name from HTTPS URL", () => {
			expect(extractRepoNameOnly("https://gitlab.com/gitlab-org/gitlab")).toBe(
				"gitlab",
			);
			expect(extractRepoNameOnly("https://gitlab.com/owner/repo")).toBe("repo");
		});

		test("extracts repo name from URL with .git suffix", () => {
			expect(extractRepoNameOnly("https://gitlab.com/owner/repo.git")).toBe(
				"repo",
			);
		});

		test("extracts repo name from SSH URL", () => {
			expect(extractRepoNameOnly("git@gitlab.com:owner/repo.git")).toBe("repo");
		});

		test("handles nested groups (extracts last segment)", () => {
			expect(
				extractRepoNameOnly("https://gitlab.com/group/subgroup/project"),
			).toBe("project");
			expect(
				extractRepoNameOnly("git@gitlab.com:group/subgroup/project.git"),
			).toBe("project");
		});
	});

	describe("Bitbucket URLs", () => {
		test("extracts just repo name from HTTPS URL", () => {
			expect(extractRepoNameOnly("https://bitbucket.org/atlassian/jira")).toBe(
				"jira",
			);
			expect(extractRepoNameOnly("https://bitbucket.org/owner/repo")).toBe(
				"repo",
			);
		});

		test("extracts repo name from URL with .git suffix", () => {
			expect(extractRepoNameOnly("https://bitbucket.org/owner/repo.git")).toBe(
				"repo",
			);
		});

		test("extracts repo name from SSH URL", () => {
			expect(extractRepoNameOnly("git@bitbucket.org:owner/repo.git")).toBe(
				"repo",
			);
		});
	});

	describe("Self-hosted Git URLs", () => {
		test("extracts repo name from self-hosted HTTPS URL", () => {
			expect(extractRepoNameOnly("https://git.company.com/team/project")).toBe(
				"project",
			);
			expect(extractRepoNameOnly("https://git.example.org/owner/repo")).toBe(
				"repo",
			);
		});

		test("extracts repo name from URL with custom port", () => {
			expect(
				extractRepoNameOnly("https://git.company.com:8443/owner/repo"),
			).toBe("repo");
		});

		test("extracts repo name from self-hosted SSH URL", () => {
			expect(extractRepoNameOnly("git@git.company.com:owner/repo.git")).toBe(
				"repo",
			);
		});
	});

	describe("Edge cases", () => {
		test("handles invalid URLs gracefully", () => {
			expect(extractRepoNameOnly("not-a-url")).toBe("not-a-url");
			expect(extractRepoNameOnly("https://example.com")).toBe(
				"https://example.com",
			);
		});

		test("handles empty or malformed input", () => {
			expect(extractRepoNameOnly("")).toBe("");
		});
	});
});
