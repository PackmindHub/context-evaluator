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
		selectedEvaluators?: string[],
	) => Promise<void>;
	onBatchSubmit?: (
		urls: string[],
		evaluators: number,
		provider: ProviderName,
		evaluatorFilter: EvaluatorFilter,
		concurrency: number,
		selectedEvaluators?: string[],
	) => Promise<void>;
	onImport?: (file: File) => Promise<void>;
	isLoading: boolean;
	urlError?: string | null;
	hasData: boolean;
}

export const EvaluationInputPanel: React.FC<IEvaluationInputPanelProps> = ({
	onUrlSubmit,
	onBatchSubmit,
	onImport,
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
				onBatchSubmit={onBatchSubmit}
				onImport={onImport}
				isLoading={isLoading}
				error={urlError}
			/>
		</div>
	);
};
