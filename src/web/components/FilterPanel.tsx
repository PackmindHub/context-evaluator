import React from "react";

export interface FilterState {
	severities: Set<string>;
	categories: Set<string>;
	evaluators: Set<string>;
	searchText: string;
}

interface FilterPanelProps {
	filters: FilterState;
	onFilterChange: (filters: FilterState) => void;
	availableCategories: string[];
	availableEvaluators: string[];
	issueCount: number;
	totalIssues: number;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
	filters,
	onFilterChange,
	availableCategories,
	availableEvaluators,
	issueCount,
	totalIssues,
}) => {
	const severityOptions = [
		{
			value: "high",
			label: "High (7-10)",
			emoji: "🔴",
			color: "text-red-600",
		},
		{
			value: "medium",
			label: "Medium (5-6)",
			emoji: "🟠",
			color: "text-orange-600",
		},
		{
			value: "low",
			label: "Low (1-4)",
			emoji: "🟡",
			color: "text-yellow-600",
		},
	];

	const toggleSeverity = (severity: string) => {
		const newSeverities = new Set(filters.severities);
		if (newSeverities.has(severity)) {
			newSeverities.delete(severity);
		} else {
			newSeverities.add(severity);
		}
		onFilterChange({ ...filters, severities: newSeverities });
	};

	const toggleCategory = (category: string) => {
		const newCategories = new Set(filters.categories);
		if (newCategories.has(category)) {
			newCategories.delete(category);
		} else {
			newCategories.add(category);
		}
		onFilterChange({ ...filters, categories: newCategories });
	};

	const toggleEvaluator = (evaluator: string) => {
		const newEvaluators = new Set(filters.evaluators);
		if (newEvaluators.has(evaluator)) {
			newEvaluators.delete(evaluator);
		} else {
			newEvaluators.add(evaluator);
		}
		onFilterChange({ ...filters, evaluators: newEvaluators });
	};

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		onFilterChange({ ...filters, searchText: e.target.value });
	};

	const clearAllFilters = () => {
		onFilterChange({
			severities: new Set(),
			categories: new Set(),
			evaluators: new Set(),
			searchText: "",
		});
	};

	const hasActiveFilters =
		filters.severities.size > 0 ||
		filters.categories.size > 0 ||
		filters.evaluators.size > 0 ||
		filters.searchText.length > 0;

	return (
		<div className="card space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between pb-4 border-b border-slate-700">
				<div>
					<div className="flex items-center gap-2 mb-2">
						<div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
							<svg
								className="w-5 h-5 text-white"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
								/>
							</svg>
						</div>
						<h3 className="text-lg font-bold text-slate-100">Filters</h3>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-sm font-semibold text-slate-100">
							{issueCount}
						</span>
						<span className="text-sm text-slate-400">of</span>
						<span className="text-sm text-slate-300">{totalIssues} issues</span>
					</div>
				</div>
				{hasActiveFilters && (
					<button
						onClick={clearAllFilters}
						className="text-sm text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 hover:underline"
					>
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
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
						Clear all
					</button>
				)}
			</div>

			{/* Search */}
			<div>
				<label className="block text-sm font-semibold text-slate-300 mb-2">
					Search
				</label>
				<div className="relative">
					<input
						type="text"
						value={filters.searchText}
						onChange={handleSearchChange}
						placeholder="Search in descriptions..."
						className="input-field w-full pl-10"
					/>
					<svg
						className="absolute left-3 top-3 h-5 w-5 text-slate-500"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
						/>
					</svg>
				</div>
			</div>

			{/* Severity Filter */}
			<div>
				<label className="block text-sm font-semibold text-slate-300 mb-3">
					Severity Level
				</label>
				<div className="space-y-2">
					{severityOptions.map((option) => (
						<label
							key={option.value}
							className="flex items-center cursor-pointer group hover:bg-slate-700 p-2 rounded-lg transition-colors"
						>
							<input
								type="checkbox"
								checked={filters.severities.has(option.value)}
								onChange={() => toggleSeverity(option.value)}
								className="h-4 w-4 text-blue-600 border-slate-600 rounded focus:ring-blue-500 focus:ring-2"
							/>
							<span className="ml-3 text-sm font-medium flex items-center gap-2">
								<span className="text-lg">{option.emoji}</span>
								<span className={`${option.color} group-hover:underline`}>
									{option.label}
								</span>
							</span>
						</label>
					))}
				</div>
			</div>

			{/* Category Filter */}
			{availableCategories.length > 0 && (
				<div>
					<label className="block text-sm font-semibold text-slate-300 mb-3">
						Category{" "}
						<span className="text-slate-400 font-normal">
							({availableCategories.length})
						</span>
					</label>
					<div className="max-h-48 overflow-y-auto space-y-1 border border-slate-700 rounded-lg p-2 bg-slate-900/50 custom-scrollbar">
						{availableCategories.map((category) => (
							<label
								key={category}
								className="flex items-center cursor-pointer group hover:bg-slate-700 p-2 rounded-lg transition-colors"
							>
								<input
									type="checkbox"
									checked={filters.categories.has(category)}
									onChange={() => toggleCategory(category)}
									className="h-4 w-4 text-blue-600 border-slate-600 rounded focus:ring-blue-500 focus:ring-2"
								/>
								<span className="ml-3 text-sm text-slate-300 font-medium group-hover:text-slate-100">
									{category}
								</span>
							</label>
						))}
					</div>
				</div>
			)}

			{/* Evaluator Filter */}
			{availableEvaluators.length > 0 && (
				<div>
					<label className="block text-sm font-semibold text-slate-300 mb-3">
						Evaluator{" "}
						<span className="text-slate-400 font-normal">
							({availableEvaluators.length})
						</span>
					</label>
					<div className="max-h-48 overflow-y-auto space-y-1 border border-slate-700 rounded-lg p-2 bg-slate-900/50 custom-scrollbar">
						{availableEvaluators.map((evaluator) => (
							<label
								key={evaluator}
								className="flex items-center cursor-pointer group hover:bg-slate-700 p-2 rounded-lg transition-colors"
							>
								<input
									type="checkbox"
									checked={filters.evaluators.has(evaluator)}
									onChange={() => toggleEvaluator(evaluator)}
									className="h-4 w-4 text-blue-600 border-slate-600 rounded focus:ring-blue-500 focus:ring-2"
								/>
								<span className="ml-3 text-xs text-slate-300 font-mono group-hover:text-slate-100">
									{evaluator}
								</span>
							</label>
						))}
					</div>
				</div>
			)}

			{/* Active Filter Badges */}
			{hasActiveFilters && (
				<div className="pt-4 border-t border-slate-700">
					<p className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">
						Active Filters
					</p>
					<div className="flex flex-wrap gap-2">
						{Array.from(filters.severities).map((sev) => (
							<span
								key={sev}
								className="badge bg-gradient-to-r from-blue-900/40 to-indigo-900/40 text-blue-300 border border-blue-700"
							>
								{sev}
								<button
									onClick={() => toggleSeverity(sev)}
									className="ml-1.5 hover:text-blue-200 font-bold"
								>
									×
								</button>
							</span>
						))}
						{Array.from(filters.categories).map((cat) => (
							<span
								key={cat}
								className="badge bg-gradient-to-r from-purple-900/40 to-pink-900/40 text-purple-300 border border-purple-700"
							>
								{cat}
								<button
									onClick={() => toggleCategory(cat)}
									className="ml-1.5 hover:text-purple-200 font-bold"
								>
									×
								</button>
							</span>
						))}
						{Array.from(filters.evaluators).map((evaluatorName) => (
							<span
								key={evaluatorName}
								className="badge bg-gradient-to-r from-green-900/40 to-emerald-900/40 text-green-300 border border-green-700"
							>
								{evaluatorName}
								<button
									onClick={() => toggleEvaluator(evaluatorName)}
									className="ml-1.5 hover:text-green-200 font-bold"
								>
									×
								</button>
							</span>
						))}
					</div>
				</div>
			)}
		</div>
	);
};
