import { DEFAULT_TIMEOUT_MS } from "@shared/constants";
import { getProvider } from "@shared/providers";
import type {
	IContextIdentifierOptions,
	IContextIdentifierResult,
	IFolderDescription,
	IProjectContext,
} from "@shared/types/evaluation";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

// Try to import embedded prompts (available in single binary mode)
let embeddedSharedPrompts: Record<string, string> | null = null;
try {
	const embedded = await import("../../embedded/prompts-assets");
	embeddedSharedPrompts = embedded.sharedPrompts;
} catch {
	// Not in embedded mode, will use file-based prompts
}

// Get directory path for file-based fallback
const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTEXT_PROMPT_PATH = resolve(
	__dirname,
	"../../../prompts/shared/context-identifier.md",
);

/**
 * Run CLOC command on the working directory
 * Returns null if CLOC is not installed or fails
 */
async function runCloc(
	workingDir: string,
	timeout: number = 60000,
	verbose: boolean = false,
): Promise<string | null> {
	const command = ["cloc", "--json", workingDir];

	if (verbose) {
		console.log(
			`[ContextIdentifier] Executing CLOC command: ${command.join(" ")}`,
		);
		console.log(`[ContextIdentifier] CLOC timeout: ${timeout}ms`);
	}

	try {
		const startTime = Date.now();
		const proc = Bun.spawn(command, {
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
			cwd: workingDir,
		});

		// Set up timeout
		const timeoutPromise = new Promise<null>((resolve) => {
			setTimeout(() => {
				if (verbose) {
					console.log(
						`[ContextIdentifier] CLOC command timed out after ${timeout}ms`,
					);
				}
				proc.kill();
				resolve(null);
			}, timeout);
		});

		const resultPromise = (async () => {
			const [stdout, stderr, exitCode] = await Promise.all([
				new Response(proc.stdout).text(),
				new Response(proc.stderr).text(),
				proc.exited,
			]);

			const duration = Date.now() - startTime;

			if (verbose) {
				console.log(`[ContextIdentifier] CLOC exit code: ${exitCode}`);
				console.log(`[ContextIdentifier] CLOC duration: ${duration}ms`);
				if (stderr && stderr.trim()) {
					console.log(`[ContextIdentifier] CLOC stderr: ${stderr.trim()}`);
				}
			}

			if (exitCode !== 0) {
				if (verbose) {
					console.log(
						`[ContextIdentifier] CLOC failed with exit code ${exitCode}`,
					);
				}
				return null;
			}

			if (verbose) {
				console.log(
					`[ContextIdentifier] CLOC output size: ${stdout.length} bytes`,
				);
				// Log a summary of the output (first 500 chars or parsed summary)
				try {
					const parsed = JSON.parse(stdout);
					const languages = Object.keys(parsed).filter(
						(k) => k !== "header" && k !== "SUM",
					);
					console.log(
						`[ContextIdentifier] CLOC detected ${languages.length} languages: ${languages.slice(0, 5).join(", ")}${languages.length > 5 ? "..." : ""}`,
					);
					if (parsed.SUM) {
						console.log(
							`[ContextIdentifier] CLOC total: ${parsed.SUM.code} lines of code in ${parsed.SUM.nFiles} files`,
						);
					}
				} catch {
					console.log(
						`[ContextIdentifier] CLOC raw output (truncated): ${stdout.substring(0, 200)}...`,
					);
				}
			}

			return stdout;
		})();

		return await Promise.race([resultPromise, timeoutPromise]);
	} catch (error) {
		// CLOC not installed or other error
		if (verbose) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			console.log(`[ContextIdentifier] CLOC execution failed: ${errorMessage}`);
		}
		return null;
	}
}

/**
 * Format CLOC JSON output into a readable string
 */
function formatClocOutput(clocJson: string | null): string {
	if (!clocJson) {
		return "CLOC analysis not available (tool not installed or timed out)";
	}

	try {
		const data = JSON.parse(clocJson);
		const lines: string[] = [];

		// Sort languages by code lines (descending)
		const languages = Object.entries(data)
			.filter(([key]) => key !== "header" && key !== "SUM")
			.map(([lang, stats]) => ({
				language: lang,
				files:
					(
						stats as {
							nFiles?: number;
							code?: number;
							comment?: number;
							blank?: number;
						}
					).nFiles || 0,
				code: (stats as { code?: number }).code || 0,
				comment: (stats as { comment?: number }).comment || 0,
				blank: (stats as { blank?: number }).blank || 0,
			}))
			.sort((a, b) => b.code - a.code);

		if (languages.length === 0) {
			return "No code files detected by CLOC";
		}

		lines.push("Language breakdown (by lines of code):");
		for (const lang of languages.slice(0, 10)) {
			// Top 10 languages
			lines.push(
				`  ${lang.language}: ${lang.code} lines (${lang.files} files)`,
			);
		}

		// Add summary
		const sum = data.SUM;
		if (sum) {
			lines.push("");
			lines.push(`Total: ${sum.code} lines of code in ${sum.nFiles} files`);
		}

		return lines.join("\n");
	} catch {
		return "CLOC output could not be parsed";
	}
}

/**
 * Get basic repository structure
 */
async function getRepoStructure(workingDir: string): Promise<string> {
	try {
		// Get top-level directories and files
		const proc = Bun.spawn(["ls", "-la"], {
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
			cwd: workingDir,
		});

		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);

		if (exitCode !== 0) {
			return `Could not read repository structure${stderr.trim() ? `: ${stderr.trim()}` : ""}`;
		}

		// Also try to find key config files that indicate framework usage
		const configFiles = await findConfigFiles(workingDir);

		let result = "Top-level contents:\n" + stdout;

		if (configFiles.length > 0) {
			result += "\n\nDetected configuration files:\n" + configFiles.join("\n");
		}

		return result;
	} catch {
		return "Could not read repository structure";
	}
}

/**
 * Find key configuration files that indicate frameworks/tools
 */
async function findConfigFiles(workingDir: string): Promise<string[]> {
	const configPatterns = [
		"package.json",
		"tsconfig.json",
		"Cargo.toml",
		"go.mod",
		"requirements.txt",
		"pyproject.toml",
		"Gemfile",
		"pom.xml",
		"build.gradle",
		".eslintrc*",
		"jest.config*",
		"vitest.config*",
		"webpack.config*",
		"vite.config*",
		"next.config*",
		"nuxt.config*",
		"angular.json",
		"docker-compose*",
		"Dockerfile",
		".env.example",
	];

	const found: string[] = [];

	for (const pattern of configPatterns) {
		try {
			const proc = Bun.spawn(
				["find", ".", "-maxdepth", "2", "-name", pattern, "-type", "f"],
				{
					stdin: "ignore",
					stdout: "pipe",
					stderr: "pipe",
					cwd: workingDir,
				},
			);

			const [stdout, exitCode] = await Promise.all([
				new Response(proc.stdout).text(),
				proc.exited,
			]);

			if (exitCode === 0 && stdout.trim()) {
				const files = stdout
					.trim()
					.split("\n")
					.filter((f: string) => f);
				found.push(...files);
			}
		} catch {
			// Ignore errors
		}
	}

	return [...new Set(found)].slice(0, 20); // Dedupe and limit
}

/**
 * Get important folders in the repository (up to depth 3)
 * Excludes common non-source directories
 */
async function getImportantFolders(
	workingDir: string,
	verbose: boolean = false,
): Promise<string[]> {
	const excludeDirs = [
		"node_modules",
		".git",
		"dist",
		"build",
		"coverage",
		"__pycache__",
		"vendor",
		"venv",
		".venv",
		".next",
		".nuxt",
		".cache",
		".turbo",
		"target",
		"out",
		".idea",
		".vscode",
	];

	try {
		// Build find command with exclusions
		const excludeArgs = excludeDirs.flatMap((dir) => ["-name", dir, "-o"]);
		// Remove trailing "-o"
		excludeArgs.pop();

		const command = [
			"find",
			".",
			"-maxdepth",
			"3",
			"-type",
			"d",
			"(",
			...excludeArgs,
			")",
			"-prune",
			"-o",
			"-type",
			"d",
			"-print",
		];

		if (verbose) {
			console.log(`[ContextIdentifier] Getting folder structure...`);
		}

		const proc = Bun.spawn(command, {
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
			cwd: workingDir,
		});

		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);

		if (exitCode !== 0) {
			if (verbose) {
				console.log(
					`[ContextIdentifier] Failed to get folder structure (exit code ${exitCode})${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
				);
			}
			return [];
		}

		// Clean up paths - remove "./" prefix and filter
		const folders = stdout
			.trim()
			.split("\n")
			.filter((f: string) => f && f !== ".")
			.map((f: string) => f.replace(/^\.\//, ""))
			.sort();

		if (verbose) {
			console.log(`[ContextIdentifier] Found ${folders.length} folders`);
		}

		return folders;
	} catch (error) {
		if (verbose) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			console.log(`[ContextIdentifier] Failed to get folders: ${errorMessage}`);
		}
		return [];
	}
}

/**
 * Build the context identifier prompt
 */
async function buildContextIdentifierPrompt(
	clocOutput: string | null,
	repoStructure: string,
	folderList: string[],
): Promise<string> {
	// Try embedded prompts first (for compiled binary)
	let template: string;
	if (embeddedSharedPrompts && embeddedSharedPrompts["context-identifier"]) {
		template = embeddedSharedPrompts["context-identifier"];
	} else {
		// Fall back to file-based prompts (for development)
		const templateFile = Bun.file(CONTEXT_PROMPT_PATH);
		template = await templateFile.text();
	}

	const formattedCloc = formatClocOutput(clocOutput);
	const formattedFolders =
		folderList.length > 0
			? folderList.map((f) => `- ${f}`).join("\n")
			: "No folder listing available";

	return template
		.replace(/\{\{CLOC_OUTPUT\}\}/g, formattedCloc)
		.replace(/\{\{REPO_STRUCTURE\}\}/g, repoStructure)
		.replace(/\{\{FOLDER_LIST\}\}/g, formattedFolders);
}

/**
 * Parse key folders section from Claude's response
 */
function parseKeyFolders(response: string): IFolderDescription[] {
	const keyFolders: IFolderDescription[] = [];

	// Find the "Key Folders:" section
	const keyFoldersMatch = response.match(
		/Key Folders:?\s*\n((?:[-*]\s+.+\n?)+)/i,
	);
	if (!keyFoldersMatch || !keyFoldersMatch[1]) {
		return keyFolders;
	}

	const foldersBlock = keyFoldersMatch[1];
	// Parse lines like "- src/api - REST endpoints" or "- src/api: REST endpoints"
	const lines = foldersBlock
		.split("\n")
		.filter(
			(line) => line.trim().startsWith("-") || line.trim().startsWith("*"),
		);

	for (const line of lines) {
		// Remove bullet point and trim
		const content = line.replace(/^[-*]\s*/, "").trim();
		if (!content) continue;

		// Try to split by " - " or ": "
		const separatorMatch = content.match(
			/^([^\s-:]+(?:\/[^\s-:]+)*)\s*[-:]\s*(.+)$/,
		);
		if (separatorMatch && separatorMatch[1] && separatorMatch[2]) {
			keyFolders.push({
				path: separatorMatch[1].trim(),
				description: separatorMatch[2].trim(),
			});
		}
	}

	return keyFolders.slice(0, 20); // Limit to 20 folders
}

/**
 * Parse Claude's context response into structured fields
 */
function parseContextResponse(
	response: string,
	clocSummary?: string,
	agentsFilePaths?: string[],
): IProjectContext {
	const defaultContext: IProjectContext = {
		languages: "Unknown",
		frameworks: "Unknown",
		architecture: "Unknown",
		patterns: "Unknown",
		raw: response,
		clocSummary,
		agentsFilePaths,
	};

	if (!response) {
		return defaultContext;
	}

	// Parse the structured output
	const languagesMatch = response.match(/Languages?:\s*(.+?)(?:\n|$)/i);
	const frameworksMatch = response.match(/Frameworks?:\s*(.+?)(?:\n|$)/i);
	const architectureMatch = response.match(/Architecture?:\s*(.+?)(?:\n|$)/i);
	const patternsMatch = response.match(/Patterns?:\s*(.+?)(?:\n|$)/i);

	// Parse key folders
	const keyFolders = parseKeyFolders(response);

	// Combine Claude's response with CLOC summary for the raw field
	const rawParts: string[] = [];
	if (
		clocSummary &&
		clocSummary !==
			"CLOC analysis not available (tool not installed or timed out)"
	) {
		rawParts.push(clocSummary);
		rawParts.push(""); // Empty line separator
	}
	rawParts.push(response.trim());
	const combinedRaw = rawParts.join("\n");

	return {
		languages: languagesMatch?.[1]?.trim() || defaultContext.languages,
		frameworks: frameworksMatch?.[1]?.trim() || defaultContext.frameworks,
		architecture: architectureMatch?.[1]?.trim() || defaultContext.architecture,
		patterns: patternsMatch?.[1]?.trim() || defaultContext.patterns,
		raw: combinedRaw,
		clocSummary,
		keyFolders: keyFolders.length > 0 ? keyFolders : undefined,
		agentsFilePaths,
	};
}

/**
 * Identify project context by analyzing the codebase
 * Combines CLOC output with Claude AI analysis
 */
export async function identifyProjectContext(
	workingDir: string,
	options: IContextIdentifierOptions = {},
): Promise<IContextIdentifierResult> {
	const {
		verbose = false,
		timeout = DEFAULT_TIMEOUT_MS,
		clocTimeout = 60000, // 60s for large repositories
		agentsFilePaths,
		provider: providerName,
		progressCallback,
	} = options;

	// Get the provider
	const provider = getProvider(providerName);

	try {
		if (verbose) {
			console.log(
				`[ContextIdentifier] Starting context identification for: ${workingDir}`,
			);
		}

		// Step 1: Run CLOC command and get folder structure in parallel
		if (verbose) {
			console.log(
				`[ContextIdentifier] Running CLOC analysis and getting folder structure...`,
			);
		}

		// Emit context.cloc started event
		if (progressCallback) {
			progressCallback({
				type: "context.cloc",
				data: { status: "started" },
			});
		}

		// Emit context.folders started event
		if (progressCallback) {
			progressCallback({
				type: "context.folders",
				data: { status: "started" },
			});
		}

		const [clocOutput, folderList] = await Promise.all([
			runCloc(workingDir, clocTimeout, verbose),
			getImportantFolders(workingDir, verbose),
		]);

		// Emit context.cloc completed/warning event
		if (progressCallback) {
			if (clocOutput) {
				// Parse CLOC output to extract summary info
				try {
					const clocData = JSON.parse(clocOutput);
					const languageCount = Object.keys(clocData).filter(
						(k) => k !== "header" && k !== "SUM",
					).length;
					const totalLines = clocData.SUM?.code || 0;
					progressCallback({
						type: "context.cloc",
						data: {
							status: "completed",
							totalLines,
							languageCount,
						},
					});
				} catch {
					progressCallback({
						type: "context.cloc",
						data: { status: "completed" },
					});
				}
			} else {
				progressCallback({
					type: "context.warning",
					data: { message: "CLOC not available, skipping line count analysis" },
				});
			}
		}

		// Emit context.folders completed event
		if (progressCallback) {
			progressCallback({
				type: "context.folders",
				data: {
					status: "completed",
					folderCount: folderList.length,
				},
			});
		}

		if (verbose) {
			if (clocOutput) {
				console.log(`[ContextIdentifier] CLOC analysis completed successfully`);
			} else {
				console.log(
					`[ContextIdentifier] CLOC not available, continuing with AI-only analysis`,
				);
			}
			console.log(
				`[ContextIdentifier] Found ${folderList.length} folders in structure`,
			);
		}

		// Step 2: Get repository structure
		if (verbose) {
			console.log(`[ContextIdentifier] Getting repository structure...`);
		}
		const repoStructure = await getRepoStructure(workingDir);

		// Step 3: Build and run the context identifier prompt
		if (verbose) {
			console.log(`[ContextIdentifier] Building context identifier prompt...`);
		}
		const prompt = await buildContextIdentifierPrompt(
			clocOutput,
			repoStructure,
			folderList,
		);

		if (verbose) {
			console.log(
				`[ContextIdentifier] Invoking ${provider.displayName} for context analysis...`,
			);
		}

		// Emit context.analysis started event
		if (progressCallback) {
			progressCallback({
				type: "context.analysis",
				data: { status: "started" },
			});
		}

		const response = await provider.invokeWithRetry(prompt, {
			verbose,
			timeout,
			cwd: workingDir, // Execute in the cloned repository directory
		});

		// Emit context.analysis completed event
		if (progressCallback) {
			progressCallback({
				type: "context.analysis",
				data: { status: "completed" },
			});
		}

		if (verbose) {
			console.log(`[ContextIdentifier] Received response, parsing context...`);
		}

		// Step 4: Parse response into structured context
		// Include formatted cloc output for injection into evaluator prompts
		const formattedClocOutput = formatClocOutput(clocOutput);
		const context = parseContextResponse(
			response.result,
			formattedClocOutput,
			agentsFilePaths,
		);

		if (verbose) {
			console.log(`[ContextIdentifier] Context identified:`);
			console.log(`  Languages: ${context.languages}`);
			console.log(`  Frameworks: ${context.frameworks}`);
			console.log(`  Architecture: ${context.architecture}`);
			console.log(`  Patterns: ${context.patterns}`);
			if (context.clocSummary) {
				console.log(`  CLOC Summary: ${context.clocSummary.split("\n")[0]}...`);
			}
			if (context.keyFolders && context.keyFolders.length > 0) {
				console.log(`  Key Folders: ${context.keyFolders.length} identified`);
			}
			if (context.agentsFilePaths && context.agentsFilePaths.length > 0) {
				console.log(`  AGENTS.md files: ${context.agentsFilePaths.join(", ")}`);
			}
		}

		return {
			context,
			clocAvailable: clocOutput !== null,
			clocOutput: clocOutput ?? undefined,
			usage: response.usage,
			cost_usd: response.cost_usd,
			duration_ms: response.duration_ms,
		};
	} catch (error) {
		// Return default context on failure
		const errorMessage = error instanceof Error ? error.message : String(error);

		if (verbose) {
			console.error(
				`[ContextIdentifier] Failed to identify context: ${errorMessage}`,
			);
			console.log(`[ContextIdentifier] Proceeding with default context`);
		}

		return {
			context: {
				languages: "Unknown",
				frameworks: "Unknown",
				architecture: "Unknown",
				patterns: "Unknown",
				raw: "Context identification failed. Proceeding with evaluation.",
				agentsFilePaths,
			},
			clocAvailable: false,
		};
	}
}
