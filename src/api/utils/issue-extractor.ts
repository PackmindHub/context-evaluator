/**
 * Server-side issue extraction from EvaluationOutput.
 * Mirrors the logic in frontend/src/lib/issue-processing.ts parseAllIssues()
 */

import type { EvaluationOutput, Issue } from "@shared/types/evaluation";
import { isIndependentFormat, isUnifiedFormat } from "@shared/types/evaluation";

/**
 * Parse evaluator result string to extract issues.
 * More robust version that handles both object format ({perFileIssues, crossFileIssues})
 * and array format, mirroring frontend/src/types/evaluation.ts parseEvaluatorResult().
 */
function parseEvaluatorResultRobust(resultString: string): Issue[] {
	try {
		const parsed = JSON.parse(resultString);

		// Handle unified format: {perFileIssues: {...}, crossFileIssues: [...]}
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			const allIssues: Issue[] = [];
			if (parsed.perFileIssues && typeof parsed.perFileIssues === "object") {
				for (const fileIssues of Object.values(parsed.perFileIssues)) {
					if (Array.isArray(fileIssues)) {
						allIssues.push(...(fileIssues as Issue[]));
					}
				}
			}
			if (Array.isArray(parsed.crossFileIssues)) {
				allIssues.push(...parsed.crossFileIssues);
			}
			return allIssues;
		}

		// Handle array format directly
		if (Array.isArray(parsed)) {
			return parsed as Issue[];
		}

		return [];
	} catch {
		// If JSON parse fails, try to find JSON array in the result
		try {
			const jsonMatch = resultString.match(/\[[\s\S]*\]/);
			if (!jsonMatch) {
				return [];
			}
			const issues = JSON.parse(jsonMatch[0]) as Issue[];
			return Array.isArray(issues) ? issues : [];
		} catch {
			return [];
		}
	}
}

/**
 * Extract all issues from an EvaluationOutput, tagging each with its evaluator name.
 */
export function extractIssuesFromEvaluation(
	data: EvaluationOutput,
): Array<Issue & { evaluatorName: string }> {
	const issues: Array<Issue & { evaluatorName: string }> = [];

	if (isUnifiedFormat(data)) {
		for (const result of data.results) {
			if (result.output?.result) {
				const parsedIssues = parseEvaluatorResultRobust(result.output.result);
				for (const issue of parsedIssues) {
					issues.push({ ...issue, evaluatorName: result.evaluator });
				}
			}
		}
		if (data.crossFileIssues) {
			issues.push(
				...data.crossFileIssues.map((issue) => ({
					...issue,
					evaluatorName: "cross-file",
				})),
			);
		}
	} else if (isIndependentFormat(data)) {
		for (const fileResult of Object.values(data.files)) {
			const fr = fileResult as {
				evaluations?: Array<{
					evaluator: string;
					issues?: Issue[];
					output?: { result: string };
				}>;
			};
			if (!fr.evaluations) continue;
			for (const evaluation of fr.evaluations) {
				if ("issues" in evaluation && Array.isArray(evaluation.issues)) {
					for (const issue of evaluation.issues) {
						issues.push({
							...issue,
							evaluatorName: evaluation.evaluator,
						});
					}
				} else if (evaluation.output?.result) {
					const parsedIssues = parseEvaluatorResultRobust(
						evaluation.output.result,
					);
					for (const issue of parsedIssues) {
						issues.push({
							...issue,
							evaluatorName: evaluation.evaluator,
						});
					}
				}
			}
		}
		if (data.crossFileIssues) {
			issues.push(
				...data.crossFileIssues.map((issue) => ({
					...issue,
					evaluatorName: "cross-file",
				})),
			);
		}
	}

	return issues;
}
