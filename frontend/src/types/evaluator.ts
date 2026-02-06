export interface IEvaluator {
	id: string; // e.g., "01-content-quality"
	name: string; // e.g., "Content Quality & Focus"
	issueType: "error" | "suggestion";
}

export interface IEvaluatorTemplate extends IEvaluator {
	content: string;
}

export interface IEvaluatorsListResponse {
	evaluators: IEvaluator[];
}
