/**
 * Parses structured action summaries from AI provider responses.
 * Extracts the JSON summary block that the prompt instructs the AI to output.
 */

import type { IRemediationAction } from "@shared/types/remediation";

const MAX_SUMMARY_LENGTH = 200;

const VALID_STATUSES: Record<string, IRemediationAction["status"]> = {
	fixed: "fixed",
	resolved: "fixed",
	added: "added",
	enriched: "added",
	skipped: "skipped",
	ignored: "skipped",
};

interface ParseResult {
	actions: IRemediationAction[];
	parsed: boolean;
}

/**
 * Parse action summary JSON from an AI response text.
 *
 * Strategy 1: Extract last ```json ... ``` block containing "actions" key
 * Strategy 2: Find raw JSON object with "actions" array (no fences)
 * Fallback: return { actions: [], parsed: false }
 */
export function parseActionSummary(
	responseText: string | undefined,
	type: "error_fix" | "suggestion_enrich",
): ParseResult {
	if (!responseText) {
		return { actions: [], parsed: false };
	}

	// Strategy 1: fenced JSON blocks
	const fencedJson = extractFencedJson(responseText);
	if (fencedJson) {
		const actions = parseActionsFromJson(fencedJson, type);
		if (actions.length > 0) {
			return { actions, parsed: true };
		}
	}

	// Strategy 2: raw JSON object
	const rawJson = extractRawJson(responseText);
	if (rawJson) {
		const actions = parseActionsFromJson(rawJson, type);
		if (actions.length > 0) {
			return { actions, parsed: true };
		}
	}

	return { actions: [], parsed: false };
}

/**
 * Extract the last ```json ... ``` block that contains an "actions" key.
 */
function extractFencedJson(text: string): string | null {
	const fencePattern = /```(?:json)?\s*\n?([\s\S]*?)```/g;
	let lastMatch: string | null = null;

	let match: RegExpExecArray | null;
	while (true) {
		match = fencePattern.exec(text);
		if (!match) break;
		const content = (match[1] ?? "").trim();
		if (content.includes('"actions"')) {
			lastMatch = content;
		}
	}

	return lastMatch;
}

/**
 * Extract a raw JSON object containing "actions" from the text.
 * Looks for the last { ... "actions" ... } pattern.
 */
function extractRawJson(text: string): string | null {
	// Find the last occurrence of "actions" and work outward to find the enclosing {}
	const actionsIdx = text.lastIndexOf('"actions"');
	if (actionsIdx === -1) return null;

	// Walk backward to find the opening {
	let openBrace = -1;
	for (let i = actionsIdx - 1; i >= 0; i--) {
		if (text[i] === "{") {
			openBrace = i;
			break;
		}
	}
	if (openBrace === -1) return null;

	// Walk forward from openBrace to find the matching closing }
	let depth = 0;
	for (let i = openBrace; i < text.length; i++) {
		if (text[i] === "{") depth++;
		else if (text[i] === "}") {
			depth--;
			if (depth === 0) {
				return text.slice(openBrace, i + 1);
			}
		}
	}

	return null;
}

/**
 * Parse and validate actions from a JSON string.
 */
function parseActionsFromJson(
	jsonStr: string,
	type: "error_fix" | "suggestion_enrich",
): IRemediationAction[] {
	try {
		const parsed = JSON.parse(jsonStr);
		if (!parsed || !Array.isArray(parsed.actions)) {
			return [];
		}

		const defaultStatus: IRemediationAction["status"] =
			type === "error_fix" ? "fixed" : "added";

		return parsed.actions
			.filter(
				(a: unknown) =>
					a !== null &&
					typeof a === "object" &&
					"issueIndex" in (a as Record<string, unknown>) &&
					typeof (a as Record<string, unknown>).issueIndex === "number",
			)
			.map((a: Record<string, unknown>): IRemediationAction => {
				const rawStatus = String(a.status ?? "").toLowerCase();
				const status = VALID_STATUSES[rawStatus] ?? defaultStatus;

				let summary = String(a.summary ?? "");
				if (summary.length > MAX_SUMMARY_LENGTH) {
					summary = `${summary.slice(0, MAX_SUMMARY_LENGTH - 3)}...`;
				}

				return {
					issueIndex: a.issueIndex as number,
					status,
					file: typeof a.file === "string" ? a.file : undefined,
					summary,
				};
			});
	} catch {
		return [];
	}
}
