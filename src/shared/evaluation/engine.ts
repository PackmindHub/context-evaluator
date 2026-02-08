import { buildEnhancedProjectContext } from "@shared/claude/prompt-builder";
import { summarizeContextFiles } from "@shared/file-system/context-files-summarizer";
import { discoverLinkedDocs } from "@shared/file-system/docs-finder";
import {
	findAgentsFiles,
	getRelativePath,
} from "@shared/file-system/file-finder";
import {
	type CloneResult,
	cloneRepository,
} from "@shared/file-system/git-cloner";
import {
	findSkillsFilesWithContent,
	type ISkill,
} from "@shared/file-system/skills-finder";
import { summarizeAndDeduplicateSkills } from "@shared/file-system/skills-summarizer";
import {
	getProvider,
	type IAIProvider,
	providerRegistry,
} from "@shared/providers";
import type {
	EvaluationOutput,
	IContextIdentifierResult,
	IEvaluationOptions,
	IEvaluationRequest,
	IndependentEvaluationOutput,
	Issue,
	ITechnicalInventory,
	Metadata,
	ProgressCallback,
	StructuredError,
} from "@shared/types/evaluation";
import { getIssueSeverity } from "@shared/types/evaluation";
import { engineLogger } from "@shared/utils/logger";
import { mkdir, readFile } from "fs/promises";
import { join, resolve } from "path";
import { cleanupTemporaryData } from "./cleanup-manager";
import { identifyProjectContext } from "./context-identifier";
import {
	computeFullContextScore,
	createNoFilesContextScore,
} from "./context-scorer";
import {
	calculateCurationMetadata,
	executeCurationPipeline,
} from "./curation-pipeline";
import {
	createDeduplicationIdSet,
	executeDeduplicationPipeline,
} from "./deduplication-pipeline";
import { validateFileConsistency } from "./file-consistency-validator";
import {
	buildMultiFileContext,
	canUseUnifiedMode,
	countBySeverity,
	createFileResult,
	DEFAULT_MAX_UNIFIED_TOKENS,
	type FileEvaluationResult,
	runAllEvaluators,
	runUnifiedEvaluation,
} from "./runner";

/**
 * Run a shell command and return trimmed stdout. Returns empty string on error.
 */
async function runShellCommand(cmd: string, cwd: string): Promise<string> {
	try {
		const proc = Bun.spawn(["sh", "-c", cmd], {
			cwd,
			stdout: "pipe",
			stderr: "ignore",
		});
		const output = await new Response(proc.stdout).text();
		await proc.exited;
		return output.trim();
	} catch {
		return "";
	}
}

/**
 * Run a shell command and return the line count (number). Returns 0 on error.
 */
async function runCountCommand(cmd: string, cwd: string): Promise<number> {
	const output = await runShellCommand(cmd, cwd);
	const num = Number.parseInt(output, 10);
	return Number.isNaN(num) ? 0 : num;
}

/**
 * Collect structured technical data from the codebase programmatically.
 * Runs batched shell/file operations and takes a few seconds.
 * This data is injected into evaluator prompts so they don't need to rediscover it.
 */
async function collectTechnicalInventory(
	workingDir: string,
	verbose = false,
): Promise<ITechnicalInventory> {
	const inventory: ITechnicalInventory = {};

	// 1. Parse package.json (dependencies, devDependencies, scripts)
	try {
		const pkgPath = join(workingDir, "package.json");
		const pkgContent = await readFile(pkgPath, "utf-8");
		const pkg = JSON.parse(pkgContent);

		if (pkg.dependencies) {
			inventory.dependencies = Object.keys(pkg.dependencies);
		}
		if (pkg.devDependencies) {
			inventory.devDependencies = Object.keys(pkg.devDependencies);
		}
		if (pkg.scripts) {
			inventory.scripts = pkg.scripts;
		}
	} catch {
		// No package.json or parse error - skip
		if (verbose) {
			engineLogger.log("No package.json found or parse error, skipping");
		}
	}

	// 1b. Parse additional dependency manifests (Python, Go, Rust, Java, Ruby, PHP, C#, Dart)
	try {
		const [
			pythonDeps,
			goDeps,
			rustDeps,
			javaDeps,
			rubyDeps,
			phpDeps,
			csharpDeps,
			dartDeps,
		] = await Promise.all([
			// Python: requirements.txt + requirements/*.txt
			runShellCommand(
				`cat requirements.txt requirements/*.txt 2>/dev/null | grep -v '^#' | grep -v '^$' | grep -v '^-' | sed 's/[>=<![;].*//' | sed 's/ *$//' | sort -u`,
				workingDir,
			),
			// Go: go.mod require block
			runShellCommand(
				`sed -n '/^require (/,/^)/p' go.mod 2>/dev/null | grep -E '^\\t' | awk '{print $1}' | sort -u`,
				workingDir,
			),
			// Rust: Cargo.toml dependency keys
			runShellCommand(
				`sed -n '/^\\[dependencies\\]/,/^\\[/p' Cargo.toml 2>/dev/null | grep -E '^[a-zA-Z_-]+ *=' | sed 's/ *=.*//' | sort -u`,
				workingDir,
			),
			// Java/Kotlin: build.gradle(.kts) dependency declarations
			runShellCommand(
				`cat build.gradle build.gradle.kts 2>/dev/null | grep -oE "(implementation|api|testImplementation|compileOnly|runtimeOnly).*['\"]([^'\"]+)['\"]" | sed "s/.*['\"]\\([^'\"]*\\)['\"].*/\\1/" | sort -u`,
				workingDir,
			),
			// Ruby: Gemfile gem declarations
			runShellCommand(
				`grep "^gem " Gemfile 2>/dev/null | sed "s/gem ['\"]\\([^'\"]*\\)['\"].*/\\1/" | sort -u`,
				workingDir,
			),
			// PHP: composer.json require packages
			runShellCommand(
				`cat composer.json 2>/dev/null | grep -E '"[a-z][^"]+/[^"]+":' | sed 's/.*"\\([^"]*\\)".*/\\1/' | sort -u`,
				workingDir,
			),
			// C#/.NET: *.csproj PackageReference
			runShellCommand(
				`find . -name "*.csproj" -maxdepth 4 ! -path "*/node_modules/*" ! -path "*/bin/*" ! -path "*/obj/*" 2>/dev/null | head -10 | xargs grep -h "PackageReference" 2>/dev/null | sed 's/.*Include="\\([^"]*\\)".*/\\1/' | sort -u`,
				workingDir,
			),
			// Dart: pubspec.yaml dependencies
			runShellCommand(
				`sed -n '/^dependencies:/,/^[a-z]/p' pubspec.yaml 2>/dev/null | grep -E '^  [a-z]' | sed 's/:.*//' | sed 's/ //g' | sort -u`,
				workingDir,
			),
		]);

		// Merge non-JS dependencies into the dependencies array
		const extraDeps: string[] = [];
		for (const output of [
			pythonDeps,
			goDeps,
			rustDeps,
			javaDeps,
			rubyDeps,
			phpDeps,
			csharpDeps,
			dartDeps,
		]) {
			if (output) {
				extraDeps.push(
					...output.split("\n").filter((d) => d.length > 0 && d.length < 100),
				);
			}
		}

		if (extraDeps.length > 0) {
			inventory.dependencies = [
				...(inventory.dependencies || []),
				...extraDeps,
			];
		}
	} catch {
		// Skip multi-language dependency parsing errors
	}

	// 2. Parse docker-compose.yml services
	try {
		const composePaths = [
			join(workingDir, "docker-compose.yml"),
			join(workingDir, "docker-compose.yaml"),
		];
		for (const composePath of composePaths) {
			try {
				const composeContent = await readFile(composePath, "utf-8");
				// Simple YAML service extraction: lines matching /^  \w+:/ under services:
				const serviceNames: string[] = [];
				let inServices = false;
				for (const line of composeContent.split("\n")) {
					if (/^services:\s*$/.test(line)) {
						inServices = true;
						continue;
					}
					if (inServices && /^ {2}\w/.test(line)) {
						const match = line.match(/^\s{2}(\w[\w-]*):/);
						if (match?.[1]) {
							serviceNames.push(match[1]);
						}
					}
					// Exit services section on next top-level key
					if (inServices && /^\w/.test(line) && !line.startsWith("services")) {
						break;
					}
				}
				if (serviceNames.length > 0) {
					inventory.dockerServices = serviceNames;
					break; // Found services, no need to check other file
				}
			} catch {
				// File doesn't exist, try next
			}
		}
	} catch {
		// Skip docker-compose parsing errors
	}

	// 3. Count files by key extensions (batched find commands)
	const extensionsToCount = [
		// JavaScript/TypeScript test files
		".test.ts",
		".test.tsx",
		".spec.ts",
		".spec.tsx",
		".test.js",
		".test.jsx",
		".spec.js",
		// JavaScript/TypeScript domain files
		".entity.ts",
		".migration.ts",
		".controller.ts",
		".route.ts",
		".service.ts",
		".model.ts",
		// Python
		".model.py",
		".test.py",
		// Java/Kotlin test files (more specific patterns first)
		"Test.java",
		"Test.kt",
		// Ruby test files
		"_spec.rb",
		// PHP test files
		"Test.php",
		// C# test files
		"Tests.cs",
		// Go test files
		"_test.go",
		// Swift test files
		"Tests.swift",
		// Dart test files
		"_test.dart",
		// Elixir test files
		"_test.exs",
	];

	try {
		// Build a single find command that counts all extensions at once
		const nameArgs = extensionsToCount
			.map((ext) => `-name "*${ext}"`)
			.join(" -o ");
		const cmd = `find . -type f \\( ${nameArgs} \\) ! -path "*/node_modules/*" ! -path "*/dist/*" ! -path "*/build/*" ! -path "*/target/*" ! -path "*/venv/*" ! -path "*/.venv/*" 2>/dev/null`;

		const proc = Bun.spawn(["sh", "-c", cmd], {
			cwd: workingDir,
			stdout: "pipe",
			stderr: "ignore",
		});
		const output = await new Response(proc.stdout).text();
		await proc.exited;

		const counts: Record<string, number> = {};
		for (const line of output.trim().split("\n")) {
			if (!line) continue;
			for (const ext of extensionsToCount) {
				if (line.endsWith(ext)) {
					counts[ext] = (counts[ext] || 0) + 1;
					break;
				}
			}
		}

		// Only include extensions with at least 1 file
		const nonZeroCounts = Object.fromEntries(
			Object.entries(counts).filter(([, v]) => v > 0),
		);
		if (Object.keys(nonZeroCounts).length > 0) {
			inventory.fileCountsByExtension = nonZeroCounts;
		}
	} catch {
		// Skip file counting errors
	}

	// 4. Detect config files at root
	try {
		const configPatterns = [
			// JavaScript/TypeScript
			"jest.config.*",
			"vitest.config.*",
			"webpack.config.*",
			"vite.config.*",
			"next.config.*",
			"nuxt.config.*",
			"rollup.config.*",
			"esbuild.config.*",
			"turbo.json",
			"tsconfig.json",
			"biome.json",
			"eslint.config.*",
			".eslintrc*",
			".prettierrc*",
			"prisma/schema.prisma",
			"drizzle.config.*",
			"knexfile.*",
			"playwright.config.*",
			"cypress.config.*",
			// Python
			"pyproject.toml",
			"setup.py",
			"setup.cfg",
			"requirements.txt",
			"tox.ini",
			"pytest.ini",
			".flake8",
			"mypy.ini",
			// Go
			"go.mod",
			"go.sum",
			// Rust
			"Cargo.toml",
			"Cargo.lock",
			// Java/Kotlin
			"pom.xml",
			"build.gradle",
			"build.gradle.kts",
			"settings.gradle",
			"settings.gradle.kts",
			"gradlew",
			// Ruby
			"Gemfile",
			"Rakefile",
			".rubocop.yml",
			// PHP
			"composer.json",
			"phpunit.xml",
			"phpunit.xml.dist",
			"phpstan.neon",
			// C#/.NET
			"*.sln",
			"*.csproj",
			"Directory.Build.props",
			// Dart/Flutter
			"pubspec.yaml",
			"analysis_options.yaml",
			// Elixir
			"mix.exs",
			// Swift
			"Package.swift",
			// DevOps/CI
			"docker-compose.yml",
			"docker-compose.yaml",
			"Dockerfile",
			"Makefile",
			".env.example",
			".github/workflows/*.yml",
			".gitlab-ci.yml",
			"Procfile",
			"Vagrantfile",
		];

		const cmd = `ls -1 ${configPatterns.join(" ")} 2>/dev/null`;
		const proc = Bun.spawn(["sh", "-c", cmd], {
			cwd: workingDir,
			stdout: "pipe",
			stderr: "ignore",
		});
		const output = await new Response(proc.stdout).text();
		await proc.exited;

		const files = output
			.trim()
			.split("\n")
			.filter((f) => f.length > 0);
		if (files.length > 0) {
			inventory.configFiles = files;
		}
	} catch {
		// Skip config detection errors
	}

	// 5. Extract env var names from .env.example / .env.sample / .env.template / .env.dist
	try {
		const envFileCandidates = [
			".env.example",
			".env.sample",
			".env.template",
			".env.dist",
		];
		const varNames: string[] = [];
		for (const envFile of envFileCandidates) {
			try {
				const envContent = await readFile(join(workingDir, envFile), "utf-8");
				for (const line of envContent.split("\n")) {
					const trimmed = line.trim();
					if (trimmed && !trimmed.startsWith("#")) {
						const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=/);
						if (match?.[1] && !varNames.includes(match[1])) {
							varNames.push(match[1]);
						}
					}
				}
				break; // Found an env file, use it
			} catch {
				// File doesn't exist, try next
			}
		}
		if (varNames.length > 0) {
			inventory.envVarNames = varNames;
		}
	} catch {
		// No env template file - skip
	}

	// 6. Deep scanning: database patterns (evaluator 15 territory)
	// Run these in parallel for speed
	const exclusions =
		'! -path "*/node_modules/*" ! -path "*/dist/*" ! -path "*/build/*" ! -path "*/target/*" ! -path "*/venv/*" ! -path "*/.venv/*" ! -path "*/vendor/*" ! -path "*/bin/*" ! -path "*/obj/*"';

	const [migrationCount, ormRelCount, seedCount, repoCount] = await Promise.all(
		[
			// Migration files (Prisma, TypeORM, Alembic, Django, Knex, Drizzle, Rails, Flyway, Liquibase, EF Core, Diesel, goose)
			runCountCommand(
				`find . \\( -path "*/migrations/*" -o -path "*/prisma/migrations/*" -o -path "*/alembic/*" -o -path "*/drizzle/*" -o -path "*/db/migrate/*" -o -path "*/db/migration/*" -o -path "*/changelog/*" -o -path "*/Migrations/*" \\) -type f \\( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.sql" -o -name "*.rb" -o -name "*.java" -o -name "*.cs" -o -name "*.go" -o -name "*.xml" -o -name "*.yaml" \\) ${exclusions} 2>/dev/null | wc -l`,
				workingDir,
			),
			// ORM relationship decorators/annotations (JS/TS, Python, Java, Ruby, PHP, C#)
			runCountCommand(
				`grep -r -c "@relation\\|@OneToMany\\|@ManyToOne\\|@ManyToMany\\|@OneToOne\\|ForeignKey\\|relationship(\\|has_many\\|belongs_to\\|has_one\\|has_and_belongs_to_many\\|hasMany\\|belongsTo\\|HasMany\\|HasOne\\|BelongsTo" --include="*.ts" --include="*.py" --include="*.java" --include="*.prisma" --include="*.rb" --include="*.php" --include="*.cs" . ${exclusions} 2>/dev/null | awk -F: '{s+=$NF} END {print s+0}'`,
				workingDir,
			),
			// Seed files (JS/TS, Python, Ruby, PHP, Java, C#, Go)
			runCountCommand(
				`find . -type f \\( -name "seed*.ts" -o -name "seed*.js" -o -name "*seeder*.ts" -o -name "*seeder*.js" -o -name "seeds.py" -o -name "*factory*.ts" -o -name "*factory*.js" -o -name "*factory*.py" -o -name "*factory*.rb" -o -name "seeds.rb" -o -name "*Seeder.php" -o -name "*Factory.php" -o -name "*Seed*.java" -o -name "*Seeder*.java" -o -name "*Seed*.cs" -o -name "*seed*.go" \\) ${exclusions} 2>/dev/null | wc -l`,
				workingDir,
			),
			// Repository files (JS/TS, Java, Kotlin, Python, Ruby, PHP, Go, C#)
			runCountCommand(
				`find . -type f \\( -name "*repository*.ts" -o -name "*repository*.js" -o -name "*Repository*.java" -o -name "*Repository*.kt" -o -name "*repo*.py" -o -name "*_repository.rb" -o -name "*Repository.php" -o -name "*repository*.go" -o -name "*Repository*.cs" \\) ${exclusions} 2>/dev/null | wc -l`,
				workingDir,
			),
		],
	);

	if (migrationCount > 0) inventory.migrationFileCount = migrationCount;
	if (ormRelCount > 0) inventory.ormRelationshipCount = ormRelCount;
	if (seedCount > 0) inventory.seedFileCount = seedCount;
	if (repoCount > 0) inventory.repositoryFileCount = repoCount;

	// 7. Deep scanning: testing patterns (evaluator 14 territory)
	const [
		mockCount,
		fixtureDirsOutput,
		testUtilsOutput,
		colocatedCount,
		separateTestDirCount,
	] = await Promise.all([
		// Mock usage count (Jest, Vitest, unittest, Mockito, gomock, testify, RSpec, PHPUnit, NUnit/Moq, sinon)
		runCountCommand(
			`grep -r -c "jest\\.mock\\|jest\\.fn\\|jest\\.spyOn\\|vi\\.mock\\|vi\\.fn\\|vi\\.spyOn\\|unittest\\.mock\\|@patch\\|MagicMock\\|@Mock\\|Mockito\\.\\|gomock\\|testify/mock\\|sinon\\.stub\\|sinon\\.mock\\|sinon\\.spy\\|Mockery::\\|\\.createMock(\\|Mock<\\|Mock\\.Of<\\|Substitute\\.For<" --include="*.test.ts" --include="*.test.tsx" --include="*.test.js" --include="*.spec.ts" --include="*.spec.tsx" --include="*.py" --include="*.java" --include="*_test.go" --include="*_spec.rb" --include="*Test.php" --include="*Tests.cs" . ${exclusions} 2>/dev/null | awk -F: '{s+=$NF} END {print s+0}'`,
			workingDir,
		),
		// Fixture directories
		runShellCommand(
			`find . -type d \\( -name "__fixtures__" -o -name "fixtures" -o -name "test-data" -o -name "testdata" -o -name "test_data" -o -name "testresources" -o -name "factories" \\) ${exclusions} 2>/dev/null`,
			workingDir,
		),
		// Test utility files (JS/TS, Python, Ruby, PHP, Go, Java)
		runShellCommand(
			`find . -type f \\( -name "test-utils*" -o -name "testUtils*" -o -name "*test-helper*" -o -name "*testHelper*" -o -name "setupTests*" -o -name "setup-tests*" -o -name "jest.setup*" -o -name "vitest.setup*" -o -name "conftest.py" -o -name "spec_helper.rb" -o -name "rails_helper.rb" -o -name "*TestCase.php" -o -name "*test_helper*.go" -o -name "*TestBase.java" -o -name "*BaseTest.java" \\) ${exclusions} 2>/dev/null`,
			workingDir,
		),
		// Co-located tests (test files alongside source, not in dedicated test dirs)
		runCountCommand(
			`find . -type f \\( -name "*.test.ts" -o -name "*.test.js" -o -name "*.test.tsx" -o -name "*_test.go" -o -name "*_spec.rb" \\) ! -path "*/__tests__/*" ! -path "*/tests/*" ! -path "*/test/*" ! -path "*/spec/*" ${exclusions} 2>/dev/null | wc -l`,
			workingDir,
		),
		// Dedicated test directories
		runCountCommand(
			`find . -maxdepth 3 -type d \\( -name "__tests__" -o -name "tests" -o -name "test" -o -name "spec" \\) ${exclusions} 2>/dev/null | wc -l`,
			workingDir,
		),
	]);

	if (mockCount > 0) inventory.mockUsageCount = mockCount;

	if (fixtureDirsOutput) {
		const dirs = fixtureDirsOutput.split("\n").filter((d) => d.length > 0);
		if (dirs.length > 0) inventory.fixtureDirectories = dirs;
	}

	if (testUtilsOutput) {
		const files = testUtilsOutput.split("\n").filter((f) => f.length > 0);
		if (files.length > 0) inventory.testUtilityFiles = files;
	}

	// Determine test organization pattern
	if (colocatedCount > 0 && separateTestDirCount > 0) {
		inventory.testOrganization = "mixed";
	} else if (separateTestDirCount > 0) {
		inventory.testOrganization = "separate";
	} else if (colocatedCount > 0) {
		inventory.testOrganization = "co-located";
	}

	// 8. Deep scanning: architecture patterns (evaluator 12 territory)
	try {
		const layerDirs = await runShellCommand(
			`find . -maxdepth 3 -type d \\( -name "domain" -o -name "application" -o -name "infrastructure" -o -name "ports" -o -name "adapters" -o -name "entities" -o -name "use-cases" -o -name "usecases" -o -name "repositories" -o -name "presentation" -o -name "services" -o -name "controllers" -o -name "routes" -o -name "models" -o -name "views" -o -name "cmd" -o -name "internal" -o -name "pkg" -o -name "handlers" -o -name "middleware" -o -name "resolvers" -o -name "schemas" -o -name "dtos" -o -name "mappers" -o -name "lib" -o -name "helpers" \\) ${exclusions} 2>/dev/null`,
			workingDir,
		);
		if (layerDirs) {
			const dirs = layerDirs
				.split("\n")
				.filter((d) => d.length > 0)
				.map((d) => d.replace(/^\.\//, ""));
			if (dirs.length > 0) inventory.detectedDirectoryLayers = dirs;
		}
	} catch {
		// Skip architecture detection errors
	}

	if (verbose) {
		const parts: string[] = [];
		if (inventory.dependencies)
			parts.push(`${inventory.dependencies.length} deps`);
		if (inventory.devDependencies)
			parts.push(`${inventory.devDependencies.length} devDeps`);
		if (inventory.scripts)
			parts.push(`${Object.keys(inventory.scripts).length} scripts`);
		if (inventory.dockerServices)
			parts.push(`${inventory.dockerServices.length} docker services`);
		if (inventory.fileCountsByExtension)
			parts.push(
				`${Object.keys(inventory.fileCountsByExtension).length} ext types`,
			);
		if (inventory.configFiles)
			parts.push(`${inventory.configFiles.length} configs`);
		if (inventory.envVarNames)
			parts.push(`${inventory.envVarNames.length} env vars`);
		if (inventory.migrationFileCount)
			parts.push(`${inventory.migrationFileCount} migrations`);
		if (inventory.ormRelationshipCount)
			parts.push(`${inventory.ormRelationshipCount} ORM relations`);
		if (inventory.mockUsageCount)
			parts.push(`${inventory.mockUsageCount} mock usages`);
		if (inventory.detectedDirectoryLayers)
			parts.push(`${inventory.detectedDirectoryLayers.length} arch layers`);
		engineLogger.log(`Technical inventory collected: ${parts.join(", ")}`);
	}

	return inventory;
}

/**
 * Core evaluation engine that orchestrates file discovery, mode selection, and evaluation
 * This is the main interface used by both CLI and API
 */
export class EvaluationEngine {
	/**
	 * Execute an evaluation request
	 */
	async execute(
		request: IEvaluationRequest,
		progressCallback?: ProgressCallback,
	): Promise<EvaluationOutput> {
		const options = request.options || {};
		const { verbose = false } = options;

		// Get the AI provider
		let provider: IAIProvider;
		if (options.provider === "random") {
			// In cloud mode, randomly select from available providers
			provider = await providerRegistry.getRandomAvailable();
			if (verbose) {
				engineLogger.log(`Randomly selected provider: ${provider.displayName}`);
			}
		} else {
			provider = getProvider(options.provider);

			if (verbose) {
				engineLogger.log(`Using AI provider: ${provider.displayName}`);
			}

			// Check if provider is available (only for explicit provider selection)
			const isAvailable = await provider.isAvailable();
			if (!isAvailable) {
				throw new Error(
					`${provider.displayName} CLI is not available. Please ensure it is installed and in your PATH.`,
				);
			}
		}

		// Step 1: Determine working directory
		let workingDir: string;
		let cleanup: (() => Promise<void>) | undefined;

		if (request.repositoryUrl) {
			// Clone repository to temp directory
			engineLogger.log(`Cloning repository: ${request.repositoryUrl}`);

			const cloneResult: CloneResult = await cloneRepository(
				request.repositoryUrl,
				{ verbose, progressCallback },
			);
			workingDir = cloneResult.path;
			cleanup = cloneResult.cleanup;

			engineLogger.log(`Repository cloned to: ${workingDir}`);
		} else if (request.localPath) {
			workingDir = resolve(request.localPath);
			if (verbose) {
				engineLogger.log(`Using local path: ${workingDir}`);
			}
		} else {
			workingDir = process.cwd();
			if (verbose) {
				engineLogger.log(`Using current directory: ${workingDir}`);
			}
		}

		let evaluationSucceeded = false;

		try {
			// Step 1.5: Find AGENTS.md, CLAUDE.md, and copilot-instructions.md files first (needed for context identification)
			if (verbose) {
				engineLogger.log(
					`Searching for AGENTS.md, CLAUDE.md, and copilot-instructions.md files...`,
				);
			}

			// Emit discovery.started event
			if (progressCallback) {
				progressCallback({
					type: "discovery.started",
					data: {},
				});
			}

			const agentsFiles = await findAgentsFiles(
				workingDir,
				options.depth,
				verbose,
			);
			const agentsFilePaths = agentsFiles.map((f) =>
				getRelativePath(f, workingDir),
			);

			// Emit discovery.completed event
			if (progressCallback) {
				progressCallback({
					type: "discovery.completed",
					data: {
						filesFound: agentsFiles.length,
						filePaths: agentsFilePaths,
					},
				});
			}

			if (verbose && agentsFiles.length > 0) {
				engineLogger.log(`Found ${agentsFiles.length} context file(s):`);
				for (const filePath of agentsFilePaths) {
					engineLogger.log(`  - ${filePath}`);
				}
			}

			// Step 1.6: Validate file consistency (AGENTS.md vs CLAUDE.md coexistence)
			if (verbose) {
				engineLogger.log(
					`Checking for AGENTS.md/CLAUDE.md coexistence issues...`,
				);
			}

			const consistencyResult = await validateFileConsistency(workingDir, {
				verbose,
				agentsFiles,
			});

			const consistencyIssues = consistencyResult.issues;

			if (verbose && consistencyResult.conflictsFound > 0) {
				engineLogger.log(
					`Found ${consistencyResult.conflictsFound} file consistency conflicts`,
				);
			}

			// Step 1.7: Find and summarize SKILL.md files
			if (verbose) {
				engineLogger.log(`Searching for SKILL.md files...`);
			}

			const skillsWithContent = await findSkillsFilesWithContent(
				workingDir,
				options.depth,
				verbose,
			);

			// Deduplicate skills (uses frontmatter description, no AI calls)
			let skills: ISkill[] = [];
			if (skillsWithContent.length > 0) {
				if (verbose) {
					engineLogger.log(
						`Found ${skillsWithContent.length} SKILL.md file(s), summarizing...`,
					);
				}

				const skillsSummaryResult = summarizeAndDeduplicateSkills(
					skillsWithContent,
					{ verbose },
				);

				skills = skillsSummaryResult.skills;

				if (verbose) {
					if (skillsSummaryResult.duplicatesRemoved > 0) {
						engineLogger.log(
							`Deduplicated ${skillsSummaryResult.duplicatesRemoved} skill(s) with identical content`,
						);
					}
					engineLogger.log(
						`${skillsSummaryResult.uniqueCount} unique skill(s):`,
					);
					for (const skill of skills) {
						engineLogger.log(`  - ${skill.name} (${skill.path})`);
					}
				}
			}

			// Step 1.8: Load context files (AGENTS.md, CLAUDE.md, copilot-instructions.md)
			// No AI summarization needed - these files are structured for direct consumption
			let contextFiles: Awaited<
				ReturnType<typeof summarizeContextFiles>
			>["contextFiles"] = [];
			if (agentsFiles.length > 0) {
				if (verbose) {
					engineLogger.log(`Loading context files...`);
				}

				try {
					const contextFilesSummaryResult = await summarizeContextFiles(
						agentsFiles,
						workingDir,
						{ verbose },
					);

					contextFiles = contextFilesSummaryResult.contextFiles;

					if (verbose) {
						engineLogger.log(`Loaded ${contextFiles.length} context file(s)`);
					}
				} catch (error) {
					// Non-fatal: log and continue without context files
					if (verbose) {
						engineLogger.log(
							`Error loading context files:`,
							error instanceof Error ? error.message : error,
						);
					}
				}
			}

			// Step 2: Identify project context
			if (progressCallback) {
				progressCallback({
					type: "context.started",
					data: { workingDir },
				});
			}

			if (verbose) {
				engineLogger.log(`Identifying project context...`);
			}

			const contextResult = await identifyProjectContext(workingDir, {
				verbose,
				agentsFilePaths:
					agentsFilePaths.length > 0 ? agentsFilePaths : undefined,
				provider: provider.name,
				progressCallback,
				timeout: options.timeout,
			});

			// Add skills to the context
			if (contextResult?.context && skills.length > 0) {
				contextResult.context.skills = skills;
			}

			// Add context files to the context
			if (contextResult?.context && contextFiles.length > 0) {
				contextResult.context.contextFiles = contextFiles;
			}

			// Step 2.5: Discover and summarize linked documentation
			if (agentsFiles.length > 0 && contextResult?.context) {
				if (verbose) {
					engineLogger.log(`Discovering linked documentation files...`);
				}

				try {
					const linkedDocsResult = await discoverLinkedDocs(
						agentsFiles,
						workingDir,
						{
							provider,
							verbose,
							maxDocs: 30,
							maxContentLength: 8000,
							concurrency: options.linkedDocsConcurrency ?? 3,
							timeout: options.timeout,
						},
					);

					if (linkedDocsResult.docs.length > 0) {
						contextResult.context.linkedDocs = linkedDocsResult.docs;

						if (verbose) {
							engineLogger.log(
								`Found ${linkedDocsResult.docs.length} linked doc(s):`,
							);
							for (const doc of linkedDocsResult.docs) {
								engineLogger.log(`  - ${doc.path}`);
							}
						}
					} else if (verbose) {
						engineLogger.log(`No linked documentation files found`);
					}

					if (verbose && linkedDocsResult.unresolvedLinks.length > 0) {
						engineLogger.log(
							`${linkedDocsResult.unresolvedLinks.length} linked file(s) not found`,
						);
					}
				} catch (error) {
					// Non-fatal: log and continue without linked docs
					if (verbose) {
						engineLogger.log(
							`Error discovering linked docs:`,
							error instanceof Error ? error.message : error,
						);
					}
				}
			}

			// Step 2.7: Collect technical inventory (programmatic, no AI calls)
			if (verbose) {
				engineLogger.log("Collecting technical inventory...");
			}
			try {
				const technicalInventory = await collectTechnicalInventory(
					workingDir,
					verbose,
				);
				if (contextResult?.context) {
					contextResult.context.technicalInventory = technicalInventory;
				}
			} catch (error) {
				// Non-fatal: log and continue without inventory
				if (verbose) {
					engineLogger.log(
						"Error collecting technical inventory:",
						error instanceof Error ? error.message : error,
					);
				}
			}

			if (progressCallback) {
				progressCallback({
					type: "context.completed",
					data: {
						languages: contextResult.context.languages,
						frameworks: contextResult.context.frameworks,
						clocAvailable: contextResult.clocAvailable,
					},
				});
			}

			if (verbose) {
				engineLogger.log(`Project context identified:`);
				engineLogger.log(`  Languages: ${contextResult.context.languages}`);
				engineLogger.log(`  Frameworks: ${contextResult.context.frameworks}`);
				engineLogger.log(
					`  Architecture: ${contextResult.context.architecture}`,
				);
			}

			// Step 3: Handle case where no context files were found

			if (agentsFiles.length === 0) {
				// Return minimal result with score = 1 and standard message
				if (verbose) {
					engineLogger.log(
						`No AGENTS.md or CLAUDE.md files found - returning minimal result with score = 1`,
					);
				}

				// Emit job completed event with no-files result
				if (progressCallback) {
					progressCallback({
						type: "job.started",
						data: {
							totalFiles: 0,
							evaluationMode: "independent",
						},
					});
				}

				const noFilesResult: IndependentEvaluationOutput = {
					metadata: {
						generatedAt: new Date().toISOString(),
						agent: provider.name,
						evaluationMode: "independent",
						totalFiles: 0,
						totalIssues: consistencyIssues.length,
						perFileIssues: 0,
						crossFileIssues: consistencyIssues.length,
						highCount: consistencyIssues.filter((i) => getIssueSeverity(i) >= 8)
							.length,
						mediumCount: consistencyIssues.filter(
							(i) => getIssueSeverity(i) >= 6 && getIssueSeverity(i) < 8,
						).length,
						lowCount: consistencyIssues.filter((i) => getIssueSeverity(i) < 6)
							.length,
						filesEvaluated: [],
						projectContext: contextResult?.context,
						contextIdentificationDurationMs: contextResult?.duration_ms,
						contextIdentificationCostUsd: contextResult?.cost_usd,
						contextScore: createNoFilesContextScore(),
					},
					files: {},
					crossFileIssues: consistencyIssues,
				};

				if (progressCallback) {
					progressCallback({
						type: "job.completed",
						data: { result: noFilesResult },
					});
				}

				return noFilesResult;
			}

			// Emit job started event
			if (progressCallback) {
				progressCallback({
					type: "job.started",
					data: {
						totalFiles: agentsFiles.length,
						evaluationMode: this.determineEvaluationMode(
							agentsFiles.length,
							options,
						),
					},
				});
			}

			// Step 4: Determine evaluation mode
			const useUnified = this.shouldUseUnifiedMode(agentsFiles.length, options);

			if (verbose) {
				engineLogger.log(
					`Evaluation mode: ${useUnified ? "unified" : "independent"}`,
				);
			}

			// Step 5: Run evaluation
			let result: EvaluationOutput;

			if (useUnified) {
				result = await this.runUnifiedMode(
					agentsFiles,
					workingDir,
					options,
					progressCallback,
					contextResult,
					consistencyIssues,
					provider,
				);
			} else {
				result = await this.runIndependentMode(
					agentsFiles,
					workingDir,
					options,
					progressCallback,
					contextResult,
					consistencyIssues,
					provider,
				);
			}

			// Emit job completed event
			if (progressCallback) {
				progressCallback({
					type: "job.completed",
					data: { result },
				});
			}

			evaluationSucceeded = true;
			return result;
		} catch (error) {
			// Emit job failed event
			if (progressCallback) {
				progressCallback({
					type: "job.failed",
					data: {
						error: {
							message: error instanceof Error ? error.message : String(error),
							code: "EVALUATION_FAILED",
						},
					},
				});
			}
			throw error;
		} finally {
			// Cleanup cloned repository if applicable
			if (cleanup) {
				try {
					await cleanup();
				} catch (e) {
					engineLogger.error("Failed to cleanup temp directory:", e);
				}
			}

			// Cleanup temporary data on success
			if (evaluationSucceeded && !options.preserveDebugOutput) {
				try {
					const cleanupSummary = await cleanupTemporaryData(workingDir, {
						verbose,
						preserveDebugOutput: options.preserveDebugOutput,
					});

					if (verbose && cleanupSummary.debugOutputCleaned) {
						engineLogger.log("Cleaned up debug output directory");
					}

					if (verbose && cleanupSummary.emptyDirsRemoved.length > 0) {
						engineLogger.log(
							`Removed ${cleanupSummary.emptyDirsRemoved.length} empty directories`,
						);
					}
				} catch (cleanupError) {
					engineLogger.error("Failed to cleanup temporary data:", cleanupError);
				}
			} else if (
				evaluationSucceeded &&
				options.preserveDebugOutput &&
				verbose
			) {
				engineLogger.log("Preserving debug output as requested");
			}
		}
	}

	/**
	 * Determine evaluation mode based on file count and options
	 */
	private determineEvaluationMode(
		fileCount: number,
		options: IEvaluationOptions,
	): "unified" | "independent" {
		return this.shouldUseUnifiedMode(fileCount, options)
			? "unified"
			: "independent";
	}

	/**
	 * Determine whether to use unified mode
	 */
	private shouldUseUnifiedMode(
		fileCount: number,
		options: IEvaluationOptions,
	): boolean {
		// Explicit independent flag takes precedence
		if (options.evaluationMode === "independent") {
			return false;
		}

		// Explicit unified flag enables unified mode
		if (options.evaluationMode === "unified") {
			return true;
		}

		// Default: use unified mode for multiple files
		return fileCount > 1;
	}

	/**
	 * Run evaluation in unified mode
	 */
	private async runUnifiedMode(
		agentsFiles: string[],
		workingDir: string,
		options: IEvaluationOptions,
		progressCallback?: ProgressCallback,
		contextResult?: IContextIdentifierResult,
		consistencyIssues: Issue[] = [],
		provider?: IAIProvider,
	): Promise<EvaluationOutput> {
		const {
			verbose = false,
			debug = false,
			concurrency = 3,
			evaluators = 12,
			maxTokens = DEFAULT_MAX_UNIFIED_TOKENS,
		} = options;
		// Get the provider (use passed one or get default)
		const aiProvider = provider ?? getProvider(options.provider);
		// Build project context including key folders and AGENTS.md paths
		const projectContext = contextResult?.context
			? buildEnhancedProjectContext(contextResult.context)
			: undefined;

		// Build context and check viability
		const getRelPath = (path: string) => getRelativePath(path, workingDir);
		const context = await buildMultiFileContext(agentsFiles, getRelPath);

		const viability = canUseUnifiedMode(context, maxTokens);
		if (!viability.viable) {
			if (verbose) {
				engineLogger.log(`Cannot use unified mode: ${viability.reason}`);
				engineLogger.log(`Falling back to independent mode...`);
			}
			return this.runIndependentMode(
				agentsFiles,
				workingDir,
				options,
				progressCallback,
				contextResult,
				consistencyIssues,
				aiProvider,
			);
		}

		if (verbose) {
			engineLogger.log(
				`Combined content: ~${context.totalTokenEstimate.toLocaleString()} tokens`,
			);
		}

		// Progress callback wrapper
		const onProgress = (evaluator: string, index: number, total: number) => {
			if (progressCallback) {
				progressCallback({
					type: "evaluator.progress",
					data: {
						evaluatorName: evaluator,
						evaluatorIndex: index,
						totalEvaluators: total,
					},
				});
			}
		};

		// Retry callback wrapper
		const onRetry = (
			evaluator: string,
			attempt: number,
			maxRetries: number,
			error: string,
		) => {
			if (progressCallback) {
				progressCallback({
					type: "evaluator.retry",
					data: {
						evaluatorName: evaluator,
						attempt,
						maxRetries,
						error,
					},
				});
			}
		};

		// Timeout callback wrapper
		const onTimeout = (
			evaluator: string,
			elapsedMs: number,
			timeoutMs: number,
		) => {
			if (progressCallback) {
				progressCallback({
					type: "evaluator.timeout",
					data: {
						evaluatorName: evaluator,
						elapsedMs,
						timeoutMs,
					},
				});
			}
		};

		// Run unified evaluation
		const startTime = Date.now();
		const debugDir = debug ? resolve(workingDir, "debug-output") : undefined;

		// Create debug directory if needed
		if (debugDir) {
			await mkdir(debugDir, { recursive: true });
		}

		const unifiedResult = await runUnifiedEvaluation(agentsFiles, getRelPath, {
			verbose,
			debug,
			debugDir,
			concurrency,
			evaluators,
			maxTokens,
			baseDir: workingDir,
			projectContext,
			onProgress,
			onRetry,
			onTimeout,
			provider: aiProvider,
			evaluatorFilter: options.evaluatorFilter,
			selectedEvaluators: options.selectedEvaluators,
			timeout: options.timeout,
		});

		const duration = Date.now() - startTime;

		// Add deduplication IDs to original issues BEFORE creating copies
		// This ensures the IDs are preserved for later filtering
		let issueIndex = 0;
		// Add IDs to issues in evaluatorResults (used for filtering later)
		for (const evalResult of unifiedResult.evaluatorResults) {
			for (const issues of Object.values(evalResult.perFileIssues)) {
				for (const issue of issues) {
					issue._deduplicationId = `issue_${issueIndex++}`;
				}
			}
			for (const issue of evalResult.crossFileIssues) {
				issue._deduplicationId = `issue_${issueIndex++}`;
			}
		}
		// Add IDs to consistency issues
		for (const issue of consistencyIssues) {
			issue._deduplicationId = `issue_${issueIndex++}`;
		}

		// Calculate totals (issues already have dedup IDs)
		const allPerFileIssues = Object.values(unifiedResult.files).flatMap(
			(file) =>
				file.evaluations.flatMap((e) =>
					e.issues.map((issue) => ({ ...issue, evaluatorName: e.evaluator })),
				),
		);
		const allCrossFileIssues = [
			...unifiedResult.crossFileIssues,
			...consistencyIssues,
		];
		const allIssues = [...allPerFileIssues, ...allCrossFileIssues];

		// Execute deduplication pipeline
		const dedupResult = await executeDeduplicationPipeline(allIssues, {
			enabled: options.deduplication?.enabled !== false,
			locationTolerance: options.deduplication?.locationTolerance ?? 5,
			similarityThreshold: options.deduplication?.similarityThreshold ?? 0.55,
			aiEnabled: options.deduplication?.aiEnabled !== false,
			maxIssuesForAI: options.deduplication?.maxIssuesForAI ?? 500,
			verbose,
			provider: aiProvider,
			timeout: options.timeout,
		});

		const deduplicatedIssues = dedupResult.deduplicated;
		const counts = countBySeverity(deduplicatedIssues);

		// Execute curation pipeline
		const curationResult = await executeCurationPipeline(deduplicatedIssues, {
			enabled: options.curation?.enabled !== false,
			errorTopN: options.curation?.errorTopN ?? 30,
			suggestionTopN: options.curation?.suggestionTopN ?? 30,
			verbose,
			workingDir,
			provider: aiProvider,
			progressCallback,
			timeout: options.timeout,
		});

		const { curationOutput, errorCurationResult, suggestionCurationResult } =
			curationResult;

		// Compute context score
		if (verbose) {
			engineLogger.log(`Computing context score...`);
		}

		const contextScore = await computeFullContextScore(
			allIssues,
			agentsFiles.length,
			{
				verbose,
				projectContext: contextResult?.context,
				timeout: options.timeout,
			},
		);

		if (verbose) {
			engineLogger.log(
				`Context score: ${contextScore.score}/10 (${contextScore.grade})`,
			);
		}

		// Filter output structures to only include deduplicated issues
		const deduplicatedIds = createDeduplicationIdSet(deduplicatedIssues);
		const filteredCrossFileIssues = allCrossFileIssues.filter((issue) =>
			deduplicatedIds.has(issue._deduplicationId!),
		);

		// Update counts based on deduplicated issues
		const finalPerFileIssues = deduplicatedIssues.filter(
			(i) => !i.isMultiFile,
		).length;
		const finalCrossFileIssues = deduplicatedIssues.filter(
			(i) => i.isMultiFile,
		).length;

		// Collect all errors from evaluator results
		const allErrors: StructuredError[] = [];
		for (const evalResult of unifiedResult.evaluatorResults) {
			if (evalResult.errors && evalResult.errors.length > 0) {
				allErrors.push(...evalResult.errors);
			}
		}

		// Categorize errors
		const hasErrors = allErrors.some((e) => e.severity === "fatal");
		const hasPartialFailures = allErrors.some((e) => e.severity === "partial");
		const failedEvaluators = allErrors
			.filter((e) => e.evaluatorName)
			.map((e) => ({
				evaluatorName: e.evaluatorName!,
				error: e,
				filePath: e.filePath,
			}));
		const warnings = allErrors.filter((e) => e.severity === "warning");

		// Emit warning event for partial failures
		if (hasPartialFailures && progressCallback) {
			progressCallback({
				type: "evaluation.warning",
				data: {
					message: `${failedEvaluators.length} evaluator(s) encountered errors`,
					errors: allErrors.filter((e) => e.severity === "partial"),
				},
			});
		}

		if (verbose && allErrors.length > 0) {
			engineLogger.warn(
				`⚠️  ${allErrors.length} error(s) occurred during evaluation`,
			);
			engineLogger.warn(
				`Failed evaluators: ${failedEvaluators.map((f) => f.evaluatorName).join(", ")}`,
			);
		}

		// Calculate curation metadata
		const curationMeta = calculateCurationMetadata(
			errorCurationResult,
			suggestionCurationResult,
			options.curation?.enabled !== false,
		);

		// Build metadata
		const metadata: Metadata = {
			generatedAt: new Date().toISOString(),
			agent: aiProvider.name,
			evaluationMode: "unified",
			totalFiles: agentsFiles.length,
			totalIssues: deduplicatedIssues.length,
			perFileIssues: finalPerFileIssues,
			crossFileIssues: finalCrossFileIssues,
			highCount: counts.high,
			mediumCount: counts.medium,
			lowCount: counts.low,
			totalInputTokens: unifiedResult.totalUsage?.input_tokens,
			totalOutputTokens: unifiedResult.totalUsage?.output_tokens,
			totalCacheCreationTokens:
				unifiedResult.totalUsage?.cache_creation_input_tokens,
			totalCacheReadTokens: unifiedResult.totalUsage?.cache_read_input_tokens,
			totalCostUsd: unifiedResult.totalCost,
			totalDurationMs: duration,
			filesEvaluated: agentsFiles.map((f) => getRelPath(f)),
			// Context identification metadata
			projectContext: contextResult?.context,
			contextIdentificationDurationMs: contextResult?.duration_ms,
			contextIdentificationCostUsd: contextResult?.cost_usd,
			// Curation metadata (from pipeline)
			...curationMeta,
			// Deduplication metadata (from pipeline)
			deduplicationEnabled: options.deduplication?.enabled !== false,
			duplicatesRemoved: dedupResult.totalRemoved,
			deduplicationClusters: dedupResult.totalClusters,
			deduplicationPhase1Removed: dedupResult.phase1?.removed,
			deduplicationPhase1Clusters: dedupResult.phase1?.clusters,
			deduplicationPhase2Removed: dedupResult.phase2?.removed,
			deduplicationPhase2Groups: dedupResult.phase2?.groups,
			deduplicationPhase2CostUsd: dedupResult.phase2?.cost_usd,
			deduplicationPhase2DurationMs: dedupResult.phase2?.duration_ms,
			// Context score
			contextScore,
			// Error tracking
			hasErrors,
			hasPartialFailures,
			failedEvaluators:
				failedEvaluators.length > 0 ? failedEvaluators : undefined,
			warnings: warnings.length > 0 ? warnings : undefined,
		};

		// Extract final prompts from evaluator results
		const finalPrompts: Record<string, string> = {};
		for (const r of unifiedResult.evaluatorResults) {
			if (r.finalPrompt) {
				finalPrompts[r.evaluator] = r.finalPrompt;
			}
		}

		// Filter evaluator results to only include deduplicated issues
		// This ensures the frontend displays the correct post-deduplication issues
		const filteredEvaluatorResults = unifiedResult.evaluatorResults.map((r) => {
			// Filter per-file issues to only include deduplicated ones
			const filteredPerFileIssues: Record<string, Issue[]> = {};
			for (const [filePath, issues] of Object.entries(r.perFileIssues)) {
				filteredPerFileIssues[filePath] = issues.filter((issue) =>
					deduplicatedIds.has(issue._deduplicationId!),
				);
			}

			// Filter cross-file issues to only include deduplicated ones
			const filteredCrossFileIssuesForEvaluator = r.crossFileIssues.filter(
				(issue) => deduplicatedIds.has(issue._deduplicationId!),
			);

			return {
				...r,
				perFileIssues: filteredPerFileIssues,
				crossFileIssues: filteredCrossFileIssuesForEvaluator,
			};
		});

		// Convert to output format
		return {
			metadata,
			results: filteredEvaluatorResults.map((r) => ({
				evaluator: r.evaluator,
				output: r.usage
					? {
							type: "evaluation",
							subtype: "unified",
							is_error: !!r.error,
							duration_ms: r.duration_ms || 0,
							num_turns: 1,
							result: JSON.stringify({
								perFileIssues: r.perFileIssues,
								crossFileIssues: r.crossFileIssues,
							}),
							session_id: "",
							total_cost_usd: r.cost_usd || 0,
							usage: r.usage,
							uuid: "",
						}
					: undefined,
				error: r.error,
			})),
			crossFileIssues: filteredCrossFileIssues,
			curation: curationOutput,
			finalPrompts,
		};
	}

	/**
	 * Run evaluation in independent mode
	 */
	private async runIndependentMode(
		agentsFiles: string[],
		workingDir: string,
		options: IEvaluationOptions,
		progressCallback?: ProgressCallback,
		contextResult?: IContextIdentifierResult,
		consistencyIssues: Issue[] = [],
		provider?: IAIProvider,
	): Promise<IndependentEvaluationOutput> {
		const {
			verbose = false,
			debug = false,
			concurrency = 3,
			evaluators = 12,
		} = options;
		// Get the provider (use passed one or get default)
		const aiProvider = provider ?? getProvider(options.provider);
		// Build project context including key folders and AGENTS.md paths
		const projectContext = contextResult?.context
			? buildEnhancedProjectContext(contextResult.context)
			: undefined;
		const debugDir = debug ? resolve(workingDir, "debug-output") : undefined;

		// Create debug directory if needed
		if (debugDir) {
			await mkdir(debugDir, { recursive: true });
		}

		const files: Record<string, FileEvaluationResult> = {};
		let totalDuration = 0;

		// Process each file independently
		for (let fileIndex = 0; fileIndex < agentsFiles.length; fileIndex++) {
			const filePath = agentsFiles[fileIndex]!;
			const relativePath = getRelativePath(filePath, workingDir);

			// Emit file started event
			if (progressCallback) {
				progressCallback({
					type: "file.started",
					data: {
						filePath: relativePath,
						fileIndex: fileIndex + 1,
						totalFiles: agentsFiles.length,
					},
				});
			}

			if (verbose) {
				engineLogger.log(
					`Evaluating file ${fileIndex + 1}/${agentsFiles.length}: ${relativePath}`,
				);
			}

			// Progress callback wrapper
			const onProgress = (evaluator: string, index: number, total: number) => {
				if (progressCallback) {
					progressCallback({
						type: "evaluator.progress",
						data: {
							evaluatorName: evaluator,
							evaluatorIndex: index,
							totalEvaluators: total,
							currentFile: relativePath,
						},
					});
				}
			};

			// Retry callback wrapper
			const onRetry = (
				evaluator: string,
				attempt: number,
				maxRetries: number,
				error: string,
			) => {
				if (progressCallback) {
					progressCallback({
						type: "evaluator.retry",
						data: {
							evaluatorName: evaluator,
							attempt,
							maxRetries,
							error,
							currentFile: relativePath,
						},
					});
				}
			};

			// Timeout callback wrapper
			const onTimeout = (
				evaluator: string,
				elapsedMs: number,
				timeoutMs: number,
			) => {
				if (progressCallback) {
					progressCallback({
						type: "evaluator.timeout",
						data: {
							evaluatorName: evaluator,
							elapsedMs,
							timeoutMs,
							currentFile: relativePath,
						},
					});
				}
			};

			const startTime = Date.now();

			// Run all evaluators for this file
			const evaluations = await runAllEvaluators(filePath, {
				verbose,
				debug,
				debugDir,
				concurrency,
				evaluators,
				baseDir: workingDir,
				projectContext,
				onProgress,
				onRetry,
				onTimeout,
				provider: aiProvider,
				evaluatorFilter: options.evaluatorFilter,
				selectedEvaluators: options.selectedEvaluators,
				timeout: options.timeout,
			});

			const fileResult = createFileResult(filePath, relativePath, evaluations);
			files[relativePath] = fileResult;

			const duration = Date.now() - startTime;
			totalDuration += duration;

			// Emit file completed event
			if (progressCallback) {
				progressCallback({
					type: "file.completed",
					data: {
						filePath: relativePath,
						totalIssues: fileResult.totalIssues,
						highCount: fileResult.highCount,
						mediumCount: fileResult.mediumCount,
						lowCount: fileResult.lowCount,
					},
				});
			}

			if (verbose) {
				engineLogger.log(
					`File completed: ${relativePath} (${fileResult.totalIssues} issues)`,
				);
			}
		}

		// Add deduplication IDs to original issues BEFORE creating copies
		// This ensures the IDs are preserved for later filtering
		let issueIndex = 0;
		for (const file of Object.values(files)) {
			for (const evaluation of file.evaluations) {
				for (const issue of evaluation.issues) {
					issue._deduplicationId = `issue_${issueIndex++}`;
				}
			}
		}
		for (const issue of consistencyIssues) {
			issue._deduplicationId = `issue_${issueIndex++}`;
		}

		// Calculate totals (issues already have dedup IDs)
		const perFileIssuesOnly = Object.values(files).flatMap((file) =>
			file.evaluations.flatMap((e) =>
				e.issues.map((issue) => ({ ...issue, evaluatorName: e.evaluator })),
			),
		);
		const allIssues = [...perFileIssuesOnly, ...consistencyIssues];

		// Execute deduplication pipeline
		const dedupResult = await executeDeduplicationPipeline(allIssues, {
			enabled: options.deduplication?.enabled !== false,
			locationTolerance: options.deduplication?.locationTolerance ?? 5,
			similarityThreshold: options.deduplication?.similarityThreshold ?? 0.55,
			aiEnabled: options.deduplication?.aiEnabled !== false,
			maxIssuesForAI: options.deduplication?.maxIssuesForAI ?? 500,
			verbose,
			provider: aiProvider,
			timeout: options.timeout,
		});

		const deduplicatedIssues = dedupResult.deduplicated;
		const counts = countBySeverity(deduplicatedIssues);

		// Execute curation pipeline
		const curationResult = await executeCurationPipeline(deduplicatedIssues, {
			enabled: options.curation?.enabled !== false,
			errorTopN: options.curation?.errorTopN ?? 30,
			suggestionTopN: options.curation?.suggestionTopN ?? 30,
			verbose,
			workingDir,
			provider: aiProvider,
			progressCallback,
			timeout: options.timeout,
		});

		const { curationOutput, errorCurationResult, suggestionCurationResult } =
			curationResult;

		// Filter output structures to only include deduplicated issues
		const deduplicatedIds = createDeduplicationIdSet(deduplicatedIssues);

		// Filter each file's issues
		const filteredFiles: Record<string, FileEvaluationResult> = {};
		for (const [filePath, fileResult] of Object.entries(files)) {
			const filteredEvaluations = fileResult.evaluations.map((evaluation) => ({
				...evaluation,
				issues: evaluation.issues.filter((issue) =>
					deduplicatedIds.has(issue._deduplicationId!),
				),
			}));

			const allFilteredIssues = filteredEvaluations.flatMap((e) => e.issues);
			const fileCounts = countBySeverity(allFilteredIssues);

			filteredFiles[filePath] = {
				...fileResult,
				evaluations: filteredEvaluations,
				totalIssues: allFilteredIssues.length,
				highCount: fileCounts.high,
				mediumCount: fileCounts.medium,
				lowCount: fileCounts.low,
			};
		}

		// Filter cross-file issues
		const filteredCrossFileIssues = consistencyIssues.filter((issue) =>
			deduplicatedIds.has(issue._deduplicationId!),
		);

		// Update counts based on deduplicated issues
		const finalPerFileIssues = deduplicatedIssues.filter(
			(i) => !i.isMultiFile,
		).length;
		const finalCrossFileIssues = deduplicatedIssues.filter(
			(i) => i.isMultiFile,
		).length;

		// Collect all errors from file evaluation results
		const allErrorsIndependent: StructuredError[] = [];
		for (const [_filePath, fileResult] of Object.entries(files)) {
			for (const evaluation of fileResult.evaluations) {
				if (evaluation.errors && evaluation.errors.length > 0) {
					allErrorsIndependent.push(...evaluation.errors);
				}
			}
		}

		// Categorize errors
		const hasErrorsIndependent = allErrorsIndependent.some(
			(e) => e.severity === "fatal",
		);
		const hasPartialFailuresIndependent = allErrorsIndependent.some(
			(e) => e.severity === "partial",
		);
		const failedEvaluatorsIndependent = allErrorsIndependent
			.filter((e) => e.evaluatorName)
			.map((e) => ({
				evaluatorName: e.evaluatorName!,
				error: e,
				filePath: e.filePath,
			}));
		const warningsIndependent = allErrorsIndependent.filter(
			(e) => e.severity === "warning",
		);

		// Emit warning event for partial failures
		if (hasPartialFailuresIndependent && progressCallback) {
			progressCallback({
				type: "evaluation.warning",
				data: {
					message: `${failedEvaluatorsIndependent.length} evaluator(s) encountered errors`,
					errors: allErrorsIndependent.filter((e) => e.severity === "partial"),
				},
			});
		}

		if (verbose && allErrorsIndependent.length > 0) {
			engineLogger.warn(
				`⚠️  ${allErrorsIndependent.length} error(s) occurred during evaluation`,
			);
			engineLogger.warn(
				`Failed evaluators: ${failedEvaluatorsIndependent.map((f) => f.evaluatorName).join(", ")}`,
			);
		}

		// Compute context score
		if (verbose) {
			engineLogger.log(`Computing context score...`);
		}

		const contextScore = await computeFullContextScore(
			allIssues,
			agentsFiles.length,
			{
				verbose,
				projectContext: contextResult?.context,
				timeout: options.timeout,
			},
		);

		if (verbose) {
			engineLogger.log(
				`Context score: ${contextScore.score}/10 (${contextScore.grade})`,
			);
		}

		// Aggregate totals
		let totalInputTokens = 0;
		let totalOutputTokens = 0;
		let totalCacheCreation = 0;
		let totalCacheRead = 0;
		let totalCost = 0;

		for (const fileResult of Object.values(files)) {
			if (fileResult.totalUsage) {
				totalInputTokens += fileResult.totalUsage.input_tokens;
				totalOutputTokens += fileResult.totalUsage.output_tokens;
				totalCacheCreation +=
					fileResult.totalUsage.cache_creation_input_tokens || 0;
				totalCacheRead += fileResult.totalUsage.cache_read_input_tokens || 0;
			}
			if (fileResult.totalCost) {
				totalCost += fileResult.totalCost;
			}
		}

		// Calculate curation metadata
		const curationMeta = calculateCurationMetadata(
			errorCurationResult,
			suggestionCurationResult,
			options.curation?.enabled !== false,
		);

		// Build metadata
		const metadata: Metadata = {
			generatedAt: new Date().toISOString(),
			agent: aiProvider.name,
			evaluationMode: "independent",
			totalFiles: agentsFiles.length,
			totalIssues: deduplicatedIssues.length,
			perFileIssues: finalPerFileIssues,
			crossFileIssues: finalCrossFileIssues,
			highCount: counts.high,
			mediumCount: counts.medium,
			lowCount: counts.low,
			totalInputTokens,
			totalOutputTokens,
			totalCacheCreationTokens: totalCacheCreation,
			totalCacheReadTokens: totalCacheRead,
			totalCostUsd: totalCost,
			totalDurationMs: totalDuration,
			filesEvaluated: agentsFiles.map((f) => getRelativePath(f, workingDir)),
			// Context identification metadata
			projectContext: contextResult?.context,
			contextIdentificationDurationMs: contextResult?.duration_ms,
			contextIdentificationCostUsd: contextResult?.cost_usd,
			// Curation metadata (from pipeline)
			...curationMeta,
			// Deduplication metadata (from pipeline)
			deduplicationEnabled: options.deduplication?.enabled !== false,
			duplicatesRemoved: dedupResult.totalRemoved,
			deduplicationClusters: dedupResult.totalClusters,
			deduplicationPhase1Removed: dedupResult.phase1?.removed,
			deduplicationPhase1Clusters: dedupResult.phase1?.clusters,
			deduplicationPhase2Removed: dedupResult.phase2?.removed,
			deduplicationPhase2Groups: dedupResult.phase2?.groups,
			deduplicationPhase2CostUsd: dedupResult.phase2?.cost_usd,
			deduplicationPhase2DurationMs: dedupResult.phase2?.duration_ms,
			// Context score
			contextScore,
			// Error tracking
			hasErrors: hasErrorsIndependent,
			hasPartialFailures: hasPartialFailuresIndependent,
			failedEvaluators:
				failedEvaluatorsIndependent.length > 0
					? failedEvaluatorsIndependent
					: undefined,
			warnings:
				warningsIndependent.length > 0 ? warningsIndependent : undefined,
		};

		// Extract final prompts from evaluator results
		// In independent mode, each file has its own prompts, so we combine them with file-prefixed keys
		const finalPrompts: Record<string, string> = {};
		for (const [filePath, fileResult] of Object.entries(filteredFiles)) {
			for (const evaluation of fileResult.evaluations) {
				if (evaluation.finalPrompt) {
					// Use format: "evaluator:filePath" to distinguish prompts per file
					const key =
						agentsFiles.length > 1
							? `${evaluation.evaluator}:${filePath}`
							: evaluation.evaluator;
					finalPrompts[key] = evaluation.finalPrompt;
				}
			}
		}

		return {
			metadata,
			files: filteredFiles,
			crossFileIssues: filteredCrossFileIssues,
			curation: curationOutput,
			finalPrompts,
		};
	}
}
