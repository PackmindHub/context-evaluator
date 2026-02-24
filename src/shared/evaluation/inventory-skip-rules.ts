import type { ITechnicalInventory } from "@shared/types/evaluation";

export interface SkipDecision {
	skip: boolean;
	reason?: string;
}

/**
 * Known database-related package names across ecosystems.
 * Matched case-insensitively against dependencies and devDependencies.
 */
const DB_PACKAGES = new Set([
	// Node.js / TypeScript
	"pg",
	"pg-promise",
	"postgres",
	"mysql",
	"mysql2",
	"better-mysql2",
	"mongodb",
	"mongoose",
	"prisma",
	"@prisma/client",
	"typeorm",
	"sequelize",
	"knex",
	"objection",
	"mikro-orm",
	"@mikro-orm/core",
	"drizzle-orm",
	"kysely",
	"better-sqlite3",
	"sqlite3",
	"redis",
	"ioredis",
	"@redis/client",
	"cassandra-driver",
	"neo4j-driver",
	"fauna",
	"faunadb",
	"@supabase/supabase-js",
	"@planetscale/database",
	"@neon/serverless",
	"@neondatabase/serverless",
	// Python
	"sqlalchemy",
	"django",
	"psycopg2",
	"psycopg",
	"pymongo",
	"motor",
	"tortoise-orm",
	"peewee",
	"databases",
	"asyncpg",
	"aiomysql",
	"aiosqlite",
	// Ruby
	"activerecord",
	"sequel",
	"rom-rb",
	// Go
	"gorm",
	"sqlx",
	"pgx",
	// Java / Kotlin
	"hibernate",
	"spring-data-jpa",
	"mybatis",
	"jooq",
	"exposed",
]);

/**
 * Known test framework / testing package names across ecosystems.
 * Matched case-insensitively against dependencies and devDependencies.
 */
const TEST_PACKAGES = new Set([
	// Node.js / TypeScript
	"jest",
	"vitest",
	"mocha",
	"ava",
	"tape",
	"@testing-library/react",
	"@testing-library/jest-dom",
	"@testing-library/vue",
	"@testing-library/angular",
	"cypress",
	"playwright",
	"@playwright/test",
	"puppeteer",
	"supertest",
	"chai",
	"sinon",
	"nock",
	"msw",
	"storybook",
	"@storybook/react",
	// Python
	"pytest",
	"unittest",
	"nose",
	"nose2",
	"hypothesis",
	"tox",
	// Ruby
	"rspec",
	"minitest",
	"capybara",
	"factory_bot",
	// Go
	"testify",
	"gomock",
	"ginkgo",
	// Java / Kotlin
	"junit",
	"testng",
	"mockito",
	"mockk",
]);

/**
 * Regex to detect database-related Docker service names.
 */
const DB_DOCKER_SERVICE_PATTERN =
	/postgres|mysql|mariadb|mongo|redis|cassandra|neo4j|cockroach|dgraph|influx|elastic|meilisearch|supabase/i;

/**
 * Check if any dependency matches a known package set (case-insensitive).
 */
function hasMatchingDep(
	deps: string[] | undefined,
	packageSet: Set<string>,
): boolean {
	if (!deps || deps.length === 0) return false;
	return deps.some((dep) => packageSet.has(dep.toLowerCase()));
}

/**
 * Check if file extension counts suggest test files exist.
 * Looks for .test.*, .spec.*, _test.* patterns in the inventory.
 */
function hasTestFilePatterns(inventory: ITechnicalInventory): boolean {
	// Check mock/fixture indicators
	if (inventory.mockUsageCount && inventory.mockUsageCount > 0) return true;
	if (inventory.fixtureDirectories && inventory.fixtureDirectories.length > 0)
		return true;
	if (inventory.testUtilityFiles && inventory.testUtilityFiles.length > 0)
		return true;
	if (inventory.testOrganization) return true;
	return false;
}

/**
 * Check if the inventory has any database-related indicators.
 */
function hasDatabaseIndicators(inventory: ITechnicalInventory): boolean {
	if (inventory.migrationFileCount && inventory.migrationFileCount > 0)
		return true;
	if (inventory.ormRelationshipCount && inventory.ormRelationshipCount > 0)
		return true;
	if (inventory.seedFileCount && inventory.seedFileCount > 0) return true;
	if (inventory.repositoryFileCount && inventory.repositoryFileCount > 0)
		return true;
	if (inventory.dockerServices?.some((s) => DB_DOCKER_SERVICE_PATTERN.test(s)))
		return true;
	return false;
}

/**
 * Compute skip decisions for all evaluators based on the technical inventory.
 *
 * Returns a Map from evaluator filename (e.g., "database-patterns-coverage.md")
 * to a SkipDecision. Only evaluators with skip=true are included.
 *
 * If inventory is undefined (collection failed), returns an empty map (no skips — safe fallback).
 */
export function computeInventorySkips(
	inventory: ITechnicalInventory | undefined,
): Map<string, SkipDecision> {
	const skips = new Map<string, SkipDecision>();

	// Safe fallback: if inventory is unavailable, skip nothing
	if (!inventory) {
		return skips;
	}

	const allDeps = [
		...(inventory.dependencies ?? []),
		...(inventory.devDependencies ?? []),
	];

	// --- database-patterns-coverage ---
	const hasDbDeps = hasMatchingDep(allDeps, DB_PACKAGES);
	const hasDbIndicators = hasDatabaseIndicators(inventory);
	if (!hasDbDeps && !hasDbIndicators) {
		skips.set("database-patterns-coverage.md", {
			skip: true,
			reason:
				"No database dependencies, migration/ORM/seed/repository files, or DB Docker services detected",
		});
	}

	// --- test-patterns-coverage ---
	const hasTestDeps = hasMatchingDep(allDeps, TEST_PACKAGES);
	const hasTestFiles = hasTestFilePatterns(inventory);
	if (!hasTestDeps && !hasTestFiles) {
		skips.set("test-patterns-coverage.md", {
			skip: true,
			reason:
				"No test framework dependencies, test files, or mock/fixture patterns detected",
		});
	}

	// --- security ---
	// Only skip for very minimal repos with no env vars, no config files, and no dependencies
	const hasEnvVars = inventory.envVarNames && inventory.envVarNames.length > 0;
	const hasConfigFiles =
		inventory.configFiles && inventory.configFiles.length > 0;
	const hasDeps = allDeps.length > 0;
	if (!hasEnvVars && !hasConfigFiles && !hasDeps) {
		skips.set("security.md", {
			skip: true,
			reason:
				"No env vars, config files, or dependencies detected (very minimal repository)",
		});
	}

	return skips;
}
