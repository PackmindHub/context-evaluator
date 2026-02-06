import React, { useCallback, useEffect, useState } from "react";
import { useEvaluationHistory } from "../hooks/useEvaluationHistory";
import { useEvaluatorsApi } from "../hooks/useEvaluatorsApi";
import type { IEvaluator } from "../types/evaluator";
import { AppHeader } from "./AppHeader";
import type { TabItem } from "./Tabs";
import { Tabs } from "./Tabs";

// Evaluator summaries based on CLAUDE.md documentation
const EVALUATOR_SUMMARIES: Record<string, string> = {
	"content-quality":
		"Evaluates content focus and relevance for AI agents. Detects human-focused content (marketing language, social references), README-style content, completely off-topic material (recipes, personal stories), vague instructions, and missing critical development information that agents need to work effectively.",
	"structure-formatting":
		"Analyzes the organization and formatting of context files. Checks for proper markdown structure, consistent heading hierarchy, appropriate use of code blocks, clear section organization, and readability issues that make documentation difficult for AI agents to parse and understand.",
	"command-completeness":
		"Evaluates the quality and completeness of documented commands. Checks for non-executable commands, missing success criteria, unclear prerequisites, incomplete setup steps, undocumented environment variables, missing dependency order, and version constraints. Ensures commands are actionable and reproducible.",
	"testing-validation":
		"Examines testing guidance documentation. Identifies missing or vague test execution instructions, unclear test frameworks, missing test coverage expectations, incomplete CI/CD testing steps, and gaps in validation procedures that prevent agents from reliably running and verifying tests.",
	"code-style":
		"Reviews the quality of documented code style guidelines in context files. Flags conflicting style rules, absent formatting standards, missing linting configurations, unclear naming conventions, and inconsistent style guidance that could confuse AI agents during code generation.",
	"language-clarity":
		"Analyzes language clarity and accessibility. Detects ambiguous references, vague terminology, excessive jargon without explanations, undefined acronyms, pronoun confusion, and unclear domain concepts. Focuses on domain terminology and project concepts rather than command names.",
	"git-workflow":
		"Evaluates documented git and CI/CD workflow guidance. Checks for missing branching strategies, unclear merge procedures, vague commit conventions, incomplete PR processes, and insufficient CI/CD pipeline documentation. Focuses on workflow context rather than command definitions.",
	"project-structure":
		"Examines documentation of project structure and organization. Identifies missing directory explanations, unclear module boundaries, vague architectural patterns, and insufficient context about how different parts of the codebase relate to each other.",
	security:
		"Scans for security issues and risks. Detects exposed credentials, hardcoded secrets, API keys in documentation, missing security guidance, unsafe configuration examples, and potential security vulnerabilities that could be introduced by following the documented instructions.",
	completeness:
		"Evaluates overall content completeness and appropriateness. Checks if content is too short (missing essential information), too long (overwhelming detail), or inappropriately placed in the hierarchy. Ensures documentation provides the right amount of context at the right level.",
	"subdirectory-coverage":
		"Identifies subdirectories and packages that would benefit from their own context files. Scans the codebase for distinct modules, microservices, or components that have unique development patterns, dependencies, or workflows deserving dedicated documentation.",
	"context-gaps":
		"Scans the codebase to discover undocumented patterns and conventions. Identifies missing framework guidelines, undocumented architectural decisions, unmentioned tools and libraries, code patterns used across multiple files, and domain-specific conventions that should be documented for AI agents.",
	"contradictory-instructions":
		"Detects conflicting instructions across multiple context files in a repository. Identifies contradictory commands, incompatible guidelines, conflicting configuration advice, and inconsistent patterns that could confuse agents working on different parts of the project.",
	"test-patterns-coverage":
		"Analyzes the codebase to discover undocumented testing patterns. Identifies test frameworks in use, mocking strategies, fixture patterns, E2E testing setups, test utilities, and testing conventions that are followed in code but not documented in context files.",
	"database-patterns-coverage":
		"Scans the codebase for undocumented database and ORM patterns. Discovers migration strategies, database relationships, ORM configurations, query patterns, schema conventions, and data access patterns that are implemented but not documented for AI agents.",
	"markdown-validity":
		"Validates markdown syntax and structure. Detects malformed markdown, broken internal links, invalid code blocks, incorrect heading levels, unclosed tags, and syntax errors that could prevent proper rendering or parsing of context files.",
	"outdated-documentation":
		"Verifies that documented information matches the actual codebase. Checks that documented file paths exist, commands are valid, tools are installed, technologies match actual usage (e.g., PostgreSQL vs MongoDB), and frameworks referenced in docs are actually used in the project.",
};

// Issue type mapping based on evaluator-types.ts
const EVALUATOR_ISSUE_TYPES: Record<string, "error" | "suggestion"> = {
	"content-quality": "error",
	"structure-formatting": "error",
	"command-completeness": "error",
	"testing-validation": "error",
	"code-style": "error",
	"language-clarity": "error",
	"git-workflow": "error",
	"project-structure": "error",
	security: "error",
	completeness: "error",
	"contradictory-instructions": "error",
	"markdown-validity": "error",
	"outdated-documentation": "error",
	"subdirectory-coverage": "suggestion",
	"context-gaps": "suggestion",
	"test-patterns-coverage": "suggestion",
	"database-patterns-coverage": "suggestion",
};

interface EvaluatorWithType extends IEvaluator {
	issueType: "error" | "suggestion";
	description: string;
}

export const EvaluatorsPage: React.FC = () => {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [evaluators, setEvaluators] = useState<EvaluatorWithType[]>([]);
	const [activeTab, setActiveTab] = useState<string>("errors");
	const { fetchEvaluatorsList } = useEvaluatorsApi();
	const { history } = useEvaluationHistory();

	const loadEvaluators = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const data = await fetchEvaluatorsList();

			// Enrich evaluators with type and description
			const enriched = data.map((evaluator) => ({
				...evaluator,
				issueType: EVALUATOR_ISSUE_TYPES[evaluator.id] || "error",
				description:
					EVALUATOR_SUMMARIES[evaluator.id] || "No description available",
			}));

			setEvaluators(enriched);
		} catch (err) {
			console.error("Failed to load evaluators:", err);
			setError("Failed to load evaluators");
		} finally {
			setLoading(false);
		}
	}, [fetchEvaluatorsList]);

	useEffect(() => {
		loadEvaluators();
	}, [loadEvaluators]);

	if (loading) {
		return (
			<div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100">
				<AppHeader currentPage="evaluators" historyCount={history.length} />
				<div className="max-w-6xl mx-auto px-6 py-8">
					<p className="text-body-muted">Loading evaluators...</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100">
				<AppHeader currentPage="evaluators" historyCount={history.length} />
				<div className="max-w-6xl mx-auto px-6 py-8">
					<p className="text-red-400">{error}</p>
				</div>
			</div>
		);
	}

	// Group evaluators by type
	const errorEvaluators = evaluators.filter((e) => e.issueType === "error");
	const suggestionEvaluators = evaluators.filter(
		(e) => e.issueType === "suggestion",
	);

	// Tab configuration
	const tabs: TabItem[] = [
		{
			id: "errors",
			label: "Errors",
			icon: (
				<svg
					className="w-4 h-4"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/>
				</svg>
			),
			count: errorEvaluators.length,
		},
		{
			id: "suggestions",
			label: "Suggestions",
			icon: (
				<svg
					className="w-4 h-4"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
					/>
				</svg>
			),
			count: suggestionEvaluators.length,
		},
	];

	const currentEvaluators =
		activeTab === "errors" ? errorEvaluators : suggestionEvaluators;
	const tabDescription =
		activeTab === "errors"
			? "Issues with existing content that need fixing"
			: "Opportunities for improvement and additions";

	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100">
			<AppHeader currentPage="evaluators" historyCount={history.length} />
			<div className="max-w-6xl mx-auto px-6 py-8">
				{/* Header */}
				<div className="mb-8">
					<h1 className="text-title mb-2">Evaluators</h1>
					<p className="text-body-muted">
						{evaluators.length} specialized evaluators that analyze context
						files (AGENTS.md, CLAUDE.md, copilot-instructions.md) for quality,
						completeness, and best practices
					</p>
				</div>

				{/* Tab Navigation */}
				<Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

				{/* Tab Description */}
				<div className="mb-4 mt-6">
					<p className="text-body-muted">{tabDescription}</p>
				</div>

				{/* Evaluators List */}
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					{currentEvaluators.map((evaluator) => (
						<div key={evaluator.id} className="card">
							<div className="flex items-start justify-between gap-4">
								<div className="flex-1">
									<div className="flex items-center gap-2 mb-2">
										<h3 className="text-card-title">{evaluator.name}</h3>
										<span
											className={`badge ${
												evaluator.issueType === "error"
													? "bg-red-500/20 text-red-400 border border-red-500/30"
													: "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
											}`}
										>
											{evaluator.issueType === "error" ? "Error" : "Suggestion"}
										</span>
									</div>
									<p className="text-body-muted">{evaluator.description}</p>
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};
