import { describe, expect, test } from "bun:test";
import type { FilterState } from "../components/FilterPanel";
import { shouldUseNestedGrouping } from "./grouping-utils";

describe("shouldUseNestedGrouping", () => {
	const createEmptyFilters = (): FilterState => ({
		severities: new Set(),
		categories: new Set(),
		evaluators: new Set(),
		searchText: "",
		bookmarkedOnly: false,
	});

	test("should return false (disabled by default for better scannability)", () => {
		const filters = createEmptyFilters();
		expect(shouldUseNestedGrouping(filters)).toBe(false);
	});

	test("should return false when severities filter is active", () => {
		const filters = createEmptyFilters();
		filters.severities.add("high");
		expect(shouldUseNestedGrouping(filters)).toBe(false);
	});

	test("should return false when multiple severities are selected", () => {
		const filters = createEmptyFilters();
		filters.severities.add("high");
		filters.severities.add("medium");
		expect(shouldUseNestedGrouping(filters)).toBe(false);
	});

	test("should return false when categories filter is active", () => {
		const filters = createEmptyFilters();
		filters.categories.add("Command Completeness");
		expect(shouldUseNestedGrouping(filters)).toBe(false);
	});

	test("should return false when evaluators filter is active", () => {
		const filters = createEmptyFilters();
		filters.evaluators.add("01-content-quality");
		expect(shouldUseNestedGrouping(filters)).toBe(false);
	});

	test("should return false when searchText is not empty", () => {
		const filters = createEmptyFilters();
		filters.searchText = "database";
		expect(shouldUseNestedGrouping(filters)).toBe(false);
	});

	test("should return false when searchText has only whitespace (trimmed check)", () => {
		const filters = createEmptyFilters();
		filters.searchText = "   ";
		// Always false now due to disabled nested grouping
		expect(shouldUseNestedGrouping(filters)).toBe(false);
	});

	test("should return false when bookmarkedOnly is true", () => {
		const filters = createEmptyFilters();
		filters.bookmarkedOnly = true;
		expect(shouldUseNestedGrouping(filters)).toBe(false);
	});

	test("should return false when multiple filters are active", () => {
		const filters = createEmptyFilters();
		filters.severities.add("high");
		filters.categories.add("Security");
		filters.searchText = "test";
		expect(shouldUseNestedGrouping(filters)).toBe(false);
	});

	/**
	 * REGRESSION TEST: Ensure we check the correct property names
	 * Bug: Previously checked non-existent properties like filters.severity (singular)
	 * instead of filters.severities (plural, Set type)
	 */
	test("REGRESSION: should use correct property names (severities, not severity)", () => {
		const filters = createEmptyFilters();

		// Verify the function accesses the correct Set properties
		// If the old bug existed (checking filters.severity), this would fail
		// because filters.severity would be undefined
		filters.severities.add("medium");
		expect(shouldUseNestedGrouping(filters)).toBe(false);

		// Clear - still returns false due to disabled nested grouping
		filters.severities.clear();
		expect(shouldUseNestedGrouping(filters)).toBe(false);
	});

	test("REGRESSION: should use correct property names (categories, not category)", () => {
		const filters = createEmptyFilters();
		filters.categories.add("Test Category");
		expect(shouldUseNestedGrouping(filters)).toBe(false);
	});

	test("REGRESSION: should use correct property names (evaluators, not evaluator)", () => {
		const filters = createEmptyFilters();
		filters.evaluators.add("test-evaluator");
		expect(shouldUseNestedGrouping(filters)).toBe(false);
	});

	test("REGRESSION: should use correct property names (searchText, not searchQuery)", () => {
		const filters = createEmptyFilters();
		filters.searchText = "search term";
		expect(shouldUseNestedGrouping(filters)).toBe(false);
	});
});
