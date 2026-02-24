import { describe, expect, test } from "bun:test";
import type { ITechnicalInventory } from "@shared/types/evaluation";
import { computeInventorySkips } from "./inventory-skip-rules";

describe("computeInventorySkips", () => {
	test("returns empty map when inventory is undefined", () => {
		const skips = computeInventorySkips(undefined);
		expect(skips.size).toBe(0);
	});

	test("returns empty map when inventory is fully populated", () => {
		const inventory: ITechnicalInventory = {
			dependencies: ["pg", "jest", "express"],
			devDependencies: ["vitest"],
			configFiles: [".env", "tsconfig.json"],
			envVarNames: ["DATABASE_URL", "API_KEY"],
			migrationFileCount: 5,
			mockUsageCount: 10,
		};
		const skips = computeInventorySkips(inventory);
		expect(skips.size).toBe(0);
	});

	// --- database-patterns-coverage ---

	test("skips database evaluator when no DB deps or indicators", () => {
		const inventory: ITechnicalInventory = {
			dependencies: ["express", "react"],
			devDependencies: ["vitest"],
			configFiles: ["tsconfig.json"],
			envVarNames: ["API_KEY"],
		};
		const skips = computeInventorySkips(inventory);
		expect(skips.has("database-patterns-coverage.md")).toBe(true);
		expect(skips.get("database-patterns-coverage.md")!.skip).toBe(true);
	});

	test("does not skip database evaluator when DB dependency exists", () => {
		const inventory: ITechnicalInventory = {
			dependencies: ["prisma", "express"],
		};
		const skips = computeInventorySkips(inventory);
		expect(skips.has("database-patterns-coverage.md")).toBe(false);
	});

	test("does not skip database evaluator when migration files exist", () => {
		const inventory: ITechnicalInventory = {
			dependencies: ["express"],
			migrationFileCount: 3,
		};
		const skips = computeInventorySkips(inventory);
		expect(skips.has("database-patterns-coverage.md")).toBe(false);
	});

	test("does not skip database evaluator when ORM relationships exist", () => {
		const inventory: ITechnicalInventory = {
			dependencies: ["express"],
			ormRelationshipCount: 5,
		};
		const skips = computeInventorySkips(inventory);
		expect(skips.has("database-patterns-coverage.md")).toBe(false);
	});

	test("does not skip database evaluator when DB Docker service exists", () => {
		const inventory: ITechnicalInventory = {
			dependencies: ["express"],
			dockerServices: ["app", "postgres", "redis"],
		};
		const skips = computeInventorySkips(inventory);
		expect(skips.has("database-patterns-coverage.md")).toBe(false);
	});

	test("does not skip database evaluator for supabase dependency", () => {
		const inventory: ITechnicalInventory = {
			dependencies: ["@supabase/supabase-js"],
		};
		const skips = computeInventorySkips(inventory);
		expect(skips.has("database-patterns-coverage.md")).toBe(false);
	});

	// --- test-patterns-coverage ---

	test("skips test evaluator when no test deps or patterns", () => {
		const inventory: ITechnicalInventory = {
			dependencies: ["express", "pg"],
			configFiles: ["tsconfig.json"],
			envVarNames: ["DB_URL"],
		};
		const skips = computeInventorySkips(inventory);
		expect(skips.has("test-patterns-coverage.md")).toBe(true);
		expect(skips.get("test-patterns-coverage.md")!.skip).toBe(true);
	});

	test("does not skip test evaluator when test dependency exists", () => {
		const inventory: ITechnicalInventory = {
			devDependencies: ["vitest"],
		};
		const skips = computeInventorySkips(inventory);
		expect(skips.has("test-patterns-coverage.md")).toBe(false);
	});

	test("does not skip test evaluator when mock usage detected", () => {
		const inventory: ITechnicalInventory = {
			dependencies: ["express"],
			mockUsageCount: 5,
		};
		const skips = computeInventorySkips(inventory);
		expect(skips.has("test-patterns-coverage.md")).toBe(false);
	});

	test("does not skip test evaluator when fixture directories exist", () => {
		const inventory: ITechnicalInventory = {
			dependencies: ["express"],
			fixtureDirectories: ["tests/fixtures"],
		};
		const skips = computeInventorySkips(inventory);
		expect(skips.has("test-patterns-coverage.md")).toBe(false);
	});

	test("does not skip test evaluator when test organization is set", () => {
		const inventory: ITechnicalInventory = {
			dependencies: ["express"],
			testOrganization: "co-located",
		};
		const skips = computeInventorySkips(inventory);
		expect(skips.has("test-patterns-coverage.md")).toBe(false);
	});

	// --- security ---

	test("skips security evaluator for very minimal repository", () => {
		const inventory: ITechnicalInventory = {};
		const skips = computeInventorySkips(inventory);
		expect(skips.has("security.md")).toBe(true);
		expect(skips.get("security.md")!.skip).toBe(true);
	});

	test("does not skip security evaluator when env vars exist", () => {
		const inventory: ITechnicalInventory = {
			envVarNames: ["SECRET_KEY"],
		};
		const skips = computeInventorySkips(inventory);
		expect(skips.has("security.md")).toBe(false);
	});

	test("does not skip security evaluator when config files exist", () => {
		const inventory: ITechnicalInventory = {
			configFiles: [".env.example"],
		};
		const skips = computeInventorySkips(inventory);
		expect(skips.has("security.md")).toBe(false);
	});

	test("does not skip security evaluator when dependencies exist", () => {
		const inventory: ITechnicalInventory = {
			dependencies: ["express"],
		};
		const skips = computeInventorySkips(inventory);
		expect(skips.has("security.md")).toBe(false);
	});

	// --- combined scenarios ---

	test("skips all three evaluators for empty inventory", () => {
		const inventory: ITechnicalInventory = {};
		const skips = computeInventorySkips(inventory);
		expect(skips.has("database-patterns-coverage.md")).toBe(true);
		expect(skips.has("test-patterns-coverage.md")).toBe(true);
		expect(skips.has("security.md")).toBe(true);
	});

	test("skips only database evaluator for test-only project", () => {
		const inventory: ITechnicalInventory = {
			dependencies: ["express"],
			devDependencies: ["jest", "@testing-library/react"],
			configFiles: ["jest.config.ts"],
			envVarNames: ["API_URL"],
		};
		const skips = computeInventorySkips(inventory);
		expect(skips.has("database-patterns-coverage.md")).toBe(true);
		expect(skips.has("test-patterns-coverage.md")).toBe(false);
		expect(skips.has("security.md")).toBe(false);
	});

	test("skip reasons contain descriptive text", () => {
		const inventory: ITechnicalInventory = {};
		const skips = computeInventorySkips(inventory);
		for (const [, decision] of skips) {
			expect(decision.reason).toBeDefined();
			expect(decision.reason!.length).toBeGreaterThan(10);
		}
	});
});
