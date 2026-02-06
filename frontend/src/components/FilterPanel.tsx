import React from "react";
import { useFeatureFlags } from "../contexts/FeatureFlagContext";

export interface FilterState {
	severities: Set<string>;
	categories: Set<string>;
	evaluators: Set<string>;
	searchText: string;
	bookmarkedOnly: boolean;
}

export interface FilterOptionCounts {
	severities: {
		high: number;
		medium: number;
		low: number;
	};
	categories: Record<string, number>;
}

interface FilterPanelProps {
	filters: FilterState;
	onFilterChange: (filters: FilterState) => void;
	availableCategories: string[];
	issueCount: number;
	totalIssues: number;
	filterOptionCounts: FilterOptionCounts;
	bookmarkedCount?: number;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
	filters,
	onFilterChange,
	availableCategories,
	issueCount,
	totalIssues,
	filterOptionCounts,
	bookmarkedCount,
}) => {
	const { cloudMode } = useFeatureFlags();
	const severityOptions = [
		{ value: "high", label: "High", dotClass: "severity-dot-high" },
		{ value: "medium", label: "Medium", dotClass: "severity-dot-medium" },
		{ value: "low", label: "Low", dotClass: "severity-dot-low" },
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

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		onFilterChange({ ...filters, searchText: e.target.value });
	};

	const clearAllFilters = () => {
		onFilterChange({
			severities: new Set(),
			categories: new Set(),
			evaluators: new Set(),
			searchText: "",
			bookmarkedOnly: false,
		});
	};

	const hasActiveFilters =
		filters.severities.size > 0 ||
		filters.categories.size > 0 ||
		filters.searchText.length > 0 ||
		(!cloudMode && filters.bookmarkedOnly);

	return (
		<div className="glass-card p-5">
			{/* Header */}
			<div className="flex items-center justify-between pb-4 border-b border-slate-700/40">
				<div>
					<div className="flex items-center gap-2 mb-2">
						<div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center">
							<svg
								className="w-5 h-5 text-slate-300"
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
						className="text-sm text-primary hover:text-purple-300 font-semibold flex items-center gap-1 hover:underline"
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

			{/* Search Section */}
			<div className="filter-section">
				<div className="filter-section-title">Search</div>
				<div className="relative">
					<input
						type="text"
						value={filters.searchText}
						onChange={handleSearchChange}
						placeholder="Search issue titles..."
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

			{/* Bookmark Filter Section */}
			{!cloudMode && (
				<div className="filter-section">
					<label className="flex items-center cursor-pointer group hover:bg-slate-700/60 p-3 rounded-lg transition-colors -mx-1">
						<input
							type="checkbox"
							checked={filters.bookmarkedOnly}
							onChange={(e) =>
								onFilterChange({ ...filters, bookmarkedOnly: e.target.checked })
							}
							className="h-4 w-4 text-indigo-600 border-slate-600 rounded focus:ring-indigo-500 focus:ring-2"
						/>
						<span className="ml-3 text-sm font-medium flex items-center gap-2 flex-1">
							<svg
								className="h-4 w-4 text-bookmark"
								fill="currentColor"
								viewBox="0 0 24 24"
							>
								<path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
							</svg>
							<span className="text-slate-300 group-hover:text-slate-100">
								Bookmarked only
							</span>
							{bookmarkedCount !== undefined && (
								<span className="text-xs text-slate-500 ml-auto">
									{bookmarkedCount}
								</span>
							)}
						</span>
					</label>
				</div>
			)}

			{/* Severity Filter Section */}
			<div className="filter-section">
				<div className="filter-section-title">Severity Level</div>
				<div className="space-y-1">
					{severityOptions.map((option) => (
						<label
							key={option.value}
							className="flex items-center cursor-pointer group hover:bg-slate-700/60 p-2 rounded-lg transition-colors"
						>
							<input
								type="checkbox"
								checked={filters.severities.has(option.value)}
								onChange={() => toggleSeverity(option.value)}
								className="h-4 w-4 text-indigo-600 border-slate-600 rounded focus:ring-indigo-500 focus:ring-2"
							/>
							<span className="ml-3 text-sm font-medium flex items-center gap-2 flex-1">
								<span className={`severity-dot ${option.dotClass}`}></span>
								<span className="text-slate-300 group-hover:text-slate-100">
									{option.label}
								</span>
								<span className="text-xs text-slate-500 ml-auto">
									{
										filterOptionCounts.severities[
											option.value as keyof typeof filterOptionCounts.severities
										]
									}
								</span>
							</span>
						</label>
					))}
				</div>
			</div>

			{/* Category Filter Section */}
			{availableCategories.length > 0 && (
				<div className="filter-section">
					<div className="filter-section-title">Category</div>
					<div className="space-y-1">
						{availableCategories.map((category) => (
							<label
								key={category}
								className="flex items-center cursor-pointer group hover:bg-slate-700/60 p-2 rounded-lg transition-colors"
							>
								<input
									type="checkbox"
									checked={filters.categories.has(category)}
									onChange={() => toggleCategory(category)}
									className="h-4 w-4 text-indigo-600 border-slate-600 rounded focus:ring-indigo-500 focus:ring-2"
								/>
								<span className="ml-3 text-sm text-slate-300 font-medium group-hover:text-slate-100 flex items-center flex-1 gap-2">
									<span>{category}</span>
									<span className="text-xs text-slate-500 ml-auto">
										{filterOptionCounts.categories[category] || 0}
									</span>
								</span>
							</label>
						))}
					</div>
				</div>
			)}

			{/* Active Filter Badges */}
			{hasActiveFilters && (
				<div className="pt-4 border-t border-slate-700/50">
					<p className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">
						Active Filters
					</p>
					<div className="flex flex-wrap gap-2">
						{Array.from(filters.severities).map((sev) => (
							<span
								key={sev}
								className="badge bg-slate-700/60 text-slate-300 border border-slate-600/60 animate-bounce-in hover:bg-purple-700/60 transition-colors"
							>
								{sev}
								<button
									onClick={() => toggleSeverity(sev)}
									className="ml-1.5 hover:text-white transition-colors"
								>
									<svg
										className="w-3 h-3"
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
								</button>
							</span>
						))}
						{Array.from(filters.categories).map((cat) => (
							<span
								key={cat}
								className="badge bg-slate-700/60 text-slate-300 border border-slate-600/60 animate-bounce-in hover:bg-purple-700/60 transition-colors"
							>
								{cat}
								<button
									onClick={() => toggleCategory(cat)}
									className="ml-1.5 hover:text-white transition-colors"
								>
									<svg
										className="w-3 h-3"
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
								</button>
							</span>
						))}
						{!cloudMode && filters.bookmarkedOnly && (
							<span className="badge bg-yellow-700/60 text-yellow-200 border border-yellow-600/60 animate-bounce-in hover:bg-yellow-600/60 transition-colors">
								Bookmarked
								<button
									onClick={() =>
										onFilterChange({ ...filters, bookmarkedOnly: false })
									}
									className="ml-1.5 hover:text-yellow-100 transition-colors"
								>
									<svg
										className="w-3 h-3"
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
								</button>
							</span>
						)}
					</div>
				</div>
			)}
		</div>
	);
};
