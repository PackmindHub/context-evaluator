import React from "react";
import type { ProviderName } from "../hooks/useEvaluationApi";
import type { EvaluatorFilter } from "../types/evaluation";
import { RepositoryUrlInput } from "./RepositoryUrlInput";

interface IEvaluationInputPanelProps {
	onUrlSubmit: (
		url: string,
		evaluators: number,
		provider: ProviderName,
		evaluatorFilter: EvaluatorFilter,
		concurrency: number,
	) => Promise<void>;
	isLoading: boolean;
	urlError?: string | null;
	hasData: boolean;
}

export const EvaluationInputPanel: React.FC<IEvaluationInputPanelProps> = ({
	onUrlSubmit,
	isLoading,
	urlError,
	hasData,
}) => {
	// Don't show input panel when viewing results
	if (hasData) {
		return null;
	}

	return (
		<div className="w-full">
			<RepositoryUrlInput
				onSubmit={onUrlSubmit}
				isLoading={isLoading}
				error={urlError}
			/>
		</div>
	);
};
