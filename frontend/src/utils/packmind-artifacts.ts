import type { RemediationAction } from "../types/remediation";

export function countPackmindArtifacts(actions: RemediationAction[]): {
	standards: number;
	skills: number;
} {
	let standards = 0;
	let skills = 0;
	for (const a of actions) {
		if (a.outputType === "standard") standards++;
		else if (a.outputType === "skill") skills++;
	}
	return { standards, skills };
}

export function formatArtifactCount(standards: number, skills: number): string {
	const parts: string[] = [];
	if (standards > 0)
		parts.push(`${standards} standard${standards !== 1 ? "s" : ""}`);
	if (skills > 0) parts.push(`${skills} skill${skills !== 1 ? "s" : ""}`);
	return parts.join(" & ");
}
