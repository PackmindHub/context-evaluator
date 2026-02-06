/**
 * File filtering strategies for evaluators
 */
export enum FileFilterStrategy {
	/** Include all discovered files (default) */
	ALL_FILES = "all_files",

	/** Only include the root-level (shallowest) context file */
	ROOT_ONLY = "root_only",

	/** Custom filter function */
	CUSTOM = "custom",
}

/**
 * Configuration for how an evaluator should receive files
 */
export interface EvaluatorFileConfig {
	/** File filtering strategy */
	strategy: FileFilterStrategy;

	/** Custom filter function (only used if strategy is CUSTOM) */
	filterFn?: (files: string[], baseDir: string) => string[];

	/** Human-readable reason for the filtering (for logging) */
	reason?: string;
}

/**
 * Evaluator-specific file filtering configurations
 * Key: evaluator filename (e.g., "git-workflow.md")
 */
export const EVALUATOR_FILE_CONFIGS: Record<string, EvaluatorFileConfig> = {
	"git-workflow.md": {
		strategy: FileFilterStrategy.ROOT_ONLY,
		reason:
			"Git workflow should be defined at repository level, not per-component",
	},
	// Add more evaluator-specific configs here as needed
	// Example for future:
	// "project-structure.md": {
	//   strategy: FileFilterStrategy.ROOT_ONLY,
	//   reason: "Project structure is inherently repository-wide",
	// },
};

/**
 * Get the root-level (shallowest) file from a list of file paths
 */
export function getRootFile(files: string[], _baseDir: string): string | null {
	if (files.length === 0) return null;

	// Files should already be sorted by depth from file-finder
	// but we'll ensure it here for safety
	const sorted = [...files].sort((a, b) => {
		const depthA = a.split("/").length;
		const depthB = b.split("/").length;
		return depthA - depthB;
	});

	return sorted[0] || null;
}

/**
 * Apply file filtering based on evaluator configuration
 */
export function filterFilesForEvaluator(
	evaluatorFilename: string,
	allFiles: string[],
	baseDir: string,
): string[] {
	const config = EVALUATOR_FILE_CONFIGS[evaluatorFilename];

	// No config means use all files (default behavior)
	if (!config) {
		return allFiles;
	}

	switch (config.strategy) {
		case FileFilterStrategy.ROOT_ONLY: {
			const rootFile = getRootFile(allFiles, baseDir);
			return rootFile ? [rootFile] : [];
		}

		case FileFilterStrategy.CUSTOM: {
			if (!config.filterFn) {
				console.warn(
					`[Config] Custom filter strategy for ${evaluatorFilename} but no filterFn provided. Using all files.`,
				);
				return allFiles;
			}
			return config.filterFn(allFiles, baseDir);
		}

		case FileFilterStrategy.ALL_FILES:
		default:
			return allFiles;
	}
}

/**
 * Check if an evaluator has special file filtering requirements
 */
export function hasFileFiltering(evaluatorFilename: string): boolean {
	return evaluatorFilename in EVALUATOR_FILE_CONFIGS;
}

/**
 * Get the filtering reason for logging purposes
 */
export function getFilteringReason(
	evaluatorFilename: string,
): string | undefined {
	return EVALUATOR_FILE_CONFIGS[evaluatorFilename]?.reason;
}
