import type {
	Issue,
	Location,
	SnippetInfo,
	StructuredError,
} from "@shared/types/evaluation";

/**
 * Result from parsing evaluator response
 */
export interface ParseResult {
	issues: Issue[];
	errors: StructuredError[];
}

/**
 * Detect specific type of JSON parsing error to provide better feedback
 * We analyze the content directly rather than relying on error messages
 * which vary across JavaScript runtimes (Node.js vs Bun vs browsers)
 */
function detectJsonErrorType(content: string, error: unknown): string {
	// Pattern 1: Unquoted keys (e.g., {category: "value"})
	// Look for object keys without quotes
	if (/\{\s*[a-zA-Z_]+\s*:/.test(content)) {
		return "unquoted_key";
	}

	// Pattern 2: Unquoted string values (e.g., {"severity": high})
	// Look for values that appear to be identifiers (not quoted)
	if (/:\s*[a-zA-Z_]+(?:\s*[,}])/.test(content)) {
		return "unquoted_value";
	}

	// Pattern 3: Text before JSON (e.g., "Here are issues: [...]")
	// Only applies if content doesn't start with [ or {
	const errorMsg = error instanceof Error ? error.message : String(error);
	if (/Unexpected token/.test(errorMsg) && /^[^[{]/.test(content.trim())) {
		return "text_before_json";
	}

	// Pattern 4: Single quotes (JavaScript syntax)
	// Check for single-quoted strings
	if (/'[^']*'/.test(content)) {
		return "single_quotes";
	}

	// Pattern 5: Unclosed brackets
	// Count opening vs closing brackets
	const openCount = (content.match(/[{[]/g) || []).length;
	const closeCount = (content.match(/[}\]]/g) || []).length;
	if (openCount > closeCount) {
		return "unclosed_brackets";
	}

	// Pattern 6: Number as string
	// This is actually valid JSON, so we don't flag it as a parse error
	if (/"severity":\s*"[0-9]+"/.test(content)) {
		return "number_as_string";
	}

	return "unknown";
}

/**
 * Suggest specific fix based on error type
 */
function suggestJsonFix(errorType: string): string {
	const fixes: Record<string, string> = {
		unquoted_key:
			'Wrap all object keys in double quotes: {"category": ...} not {category: ...}',
		unquoted_value:
			'Wrap all string values in double quotes: {"severity": "high"} not {"severity": high}',
		text_before_json:
			"Remove all text before the opening bracket [. Response must start with [",
		single_quotes:
			"Replace single quotes with double quotes: \"value\" not 'value'",
		unclosed_brackets: "Close all brackets: every { needs }, every [ needs ]",
		number_as_string: 'Use unquoted numbers: "severity": 8 not "severity": "8"',
		unknown:
			"Ensure output is valid JSON parseable by JSON.parse(). Review the JSON formatting checklist in the prompt.",
	};

	return fixes[errorType] ?? fixes.unknown!;
}

/**
 * Strip markdown code fences from content
 * Handles ```json, ```, or plain code fences
 */
function stripCodeFences(content: string): string {
	// Match opening code fence (with optional language tag) and closing fence
	const codeFencePattern = /^```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```\s*$/;
	const match = content.trim().match(codeFencePattern);
	if (match && match[1]) {
		return match[1].trim();
	}
	return content;
}

/**
 * Validate that issues have the correct fields (severity OR impactLevel)
 * Note: At parse time we don't have issueType yet, so we validate structure
 */
function validateIssues(issues: unknown[], verbose: boolean = false): Issue[] {
	const validatedIssues: Issue[] = [];

	for (const issue of issues) {
		if (!issue || typeof issue !== "object") {
			if (verbose) {
				console.warn("[Parser] Skipping non-object issue:", issue);
			}
			continue;
		}

		// Check if it has either severity or impactLevel field
		const hasSeverity =
			"severity" in issue && typeof issue.severity === "number";
		const hasImpactLevel =
			"impactLevel" in issue && typeof issue.impactLevel === "string";

		if (!hasSeverity && !hasImpactLevel) {
			if (verbose) {
				console.warn(
					"[Parser] Issue missing both severity and impactLevel fields:",
					JSON.stringify(issue).substring(0, 200),
				);
			}
			continue;
		}

		// Issue is valid, add to results
		validatedIssues.push(issue as Issue);
	}

	if (verbose && validatedIssues.length !== issues.length) {
		console.log(
			`[Parser] Filtered ${issues.length - validatedIssues.length} invalid issues, ${validatedIssues.length} valid issues remaining`,
		);
	}

	return validatedIssues;
}

/**
 * Validate that pronouns mentioned in an issue actually exist in the source text
 * This catches potential AI hallucinations in category 6.1 (Ambiguous References & Pronouns)
 * Returns array of validation warnings (empty if no issues found)
 */
function validatePronouns(issue: Issue, snippet: string | undefined): string[] {
	const warnings: string[] = [];

	// Only validate category 6.1 (Ambiguous References & Pronouns)
	if (
		issue.category !== "Language Clarity" &&
		!issue.category?.includes("6.1")
	) {
		return warnings;
	}

	// Skip if no snippet available
	if (!snippet) {
		return warnings;
	}

	// Extract pronouns mentioned in the problem description
	const pronouns = ["it", "this", "that", "these", "those", "them"];
	const problemText = (issue.problem || "").toLowerCase();

	const mentionedPronouns = pronouns.filter(
		(p) =>
			problemText.includes(`pronoun '${p}'`) ||
			problemText.includes(`pronoun "${p}"`) ||
			problemText.includes(`pronoun \`${p}\``),
	);

	// For each mentioned pronoun, verify it exists in the snippet
	for (const pronoun of mentionedPronouns) {
		// Match whole word only (not as part of another word)
		const pattern = new RegExp(`\\b${pronoun}\\b`, "i");
		if (!pattern.test(snippet)) {
			warnings.push(
				`Issue claims pronoun '${pronoun}' is ambiguous, but '${pronoun}' ` +
					`does not appear in the referenced text (lines ${
						Array.isArray(issue.location)
							? issue.location[0]?.start
							: issue.location?.start
					}-${
						Array.isArray(issue.location)
							? issue.location[0]?.end
							: issue.location?.end
					}). This may be a false positive.`,
			);
		}
	}

	return warnings;
}

/**
 * Parse the evaluator result to extract the JSON array
 */
export function parseEvaluatorResult(
	result: string,
	verbose: boolean = false,
): ParseResult {
	const errors: StructuredError[] = [];

	if (!result || result.trim() === "") {
		if (verbose) {
			console.warn("[Parser] Warning: Empty result received from evaluator");
		}
		errors.push({
			message: "Empty response from evaluator",
			category: "parsing",
			severity: "fatal",
			timestamp: new Date(),
			retryable: false,
		});
		return { issues: [], errors };
	}

	// Strip any markdown code fences first
	const strippedResult = stripCodeFences(result);

	// Try to parse directly as JSON
	try {
		const parsed = JSON.parse(strippedResult.trim());
		if (Array.isArray(parsed)) {
			if (verbose) {
				console.log("[Parser] Successfully parsed result as direct JSON array");
			}
			return { issues: validateIssues(parsed, verbose), errors };
		}
		if (verbose) {
			console.warn(
				"[Parser] Parsed JSON but not an array, type:",
				typeof parsed,
			);
		}
	} catch (_directParseError) {
		if (verbose) {
			console.log(
				"[Parser] Direct JSON parse failed, trying to extract from response...",
			);
		}
		// Save direct parse error for potential later use if extraction also fails
		// We'll use this when no valid JSON can be extracted
	}

	// Try to find JSON array in the response (use stripped result)
	// Strategy: Try multiple patterns in order of specificity to avoid matching
	// markdown syntax examples (like [text](#anchor)) before the actual JSON array

	// Pattern 1: JSON array on its own line (most common for code blocks)
	// Matches: newline followed by [ ... ] newline or end of string
	let jsonMatch = strippedResult.match(/\n\s*(\[[\s\S]*?\])\s*(?:\n|$)/);

	// Pattern 2: JSON array at start of string (if response is just the JSON)
	if (!jsonMatch) {
		jsonMatch = strippedResult.match(/^\s*(\[[\s\S]*?\])\s*$/);
	}

	// Pattern 3: Last JSON array in the document (fallback - use greedy match from last occurrence)
	// This finds the LAST [ ... ] pattern to avoid matching markdown examples early in text
	if (!jsonMatch) {
		const matches = Array.from(strippedResult.matchAll(/\[[\s\S]*?\]/g));
		if (matches.length > 0) {
			jsonMatch = matches[matches.length - 1] ?? null;
		}
	}

	if (jsonMatch) {
		// Extract the captured group or the full match
		const jsonContent = jsonMatch[1] || jsonMatch[0];
		try {
			const parsed = JSON.parse(jsonContent);
			if (Array.isArray(parsed)) {
				if (verbose) {
					console.log(
						"[Parser] Successfully extracted JSON array from response",
					);
				}
				return { issues: validateIssues(parsed, verbose), errors };
			}
		} catch (e) {
			if (verbose) {
				console.warn(
					"[Parser] Found JSON-like content but failed to parse:",
					(e as Error).message,
				);
				console.warn(
					"[Parser] Matched content preview:",
					jsonContent.substring(0, 200),
				);
			}
			errors.push({
				message: `Failed to parse JSON array: ${(e as Error).message}`,
				category: "parsing",
				severity: "fatal",
				timestamp: new Date(),
				retryable: false,
				technicalDetails: e instanceof Error ? e.stack : String(e),
				context: {
					matchedContent: jsonContent.substring(0, 200),
					errorType: detectJsonErrorType(jsonContent, e),
					suggestedFix: suggestJsonFix(detectJsonErrorType(jsonContent, e)),
					commonMistakes: [
						"Unquoted keys or values",
						"Single quotes instead of double quotes",
						"Numbers as strings",
						"Text mixed with JSON",
					],
				},
			});
			return { issues: [], errors };
		}
	}

	// No valid JSON found - create error with detection info
	console.warn(
		"[Parser] Warning: Could not parse evaluator response as JSON array",
	);
	if (verbose) {
		console.warn("[Parser] Full response was:", result.substring(0, 500));
	}

	// Use strippedResult for error detection since that's what we tried to parse
	const contentForDetection = strippedResult.trim();
	const errorType = detectJsonErrorType(
		contentForDetection,
		new Error("Parse failed"),
	);

	errors.push({
		message: "Could not parse evaluator response as JSON array",
		category: "parsing",
		severity: "fatal",
		timestamp: new Date(),
		retryable: false,
		context: {
			responsePreview: result.substring(0, 500),
			errorType,
			suggestedFix: suggestJsonFix(errorType),
			commonMistakes: [
				"Unquoted keys or values",
				"Single quotes instead of double quotes",
				"Numbers as strings",
				"Text mixed with JSON",
			],
		},
	});

	return { issues: [], errors };
}

/**
 * Validate that issues have file references in multi-file contexts
 * Returns valid issues and any validation errors (warnings, not failures)
 */
function validateMultiFileIssues(
	issues: Issue[],
	files: Array<{ relativePath: string }>,
): { valid: Issue[]; errors: string[] } {
	const valid: Issue[] = [];
	const errors: string[] = [];

	for (const issue of issues) {
		// Check if issue has file reference when multiple files exist
		if (files.length > 1) {
			let hasFileRef = false;

			// Check different location formats
			if (Array.isArray(issue.location)) {
				hasFileRef = issue.location.every(
					(loc) => typeof loc === "object" && loc.file,
				);
			} else if (
				issue.location &&
				typeof issue.location === "object" &&
				"file" in issue.location
			) {
				hasFileRef = true;
			}

			if (!hasFileRef) {
				const issueTitle =
					"title" in issue && typeof issue.title === "string"
						? issue.title
						: "Untitled";
				errors.push(
					`Issue "${issueTitle}" missing file reference in multi-file context. ` +
						`This issue will be assigned to first file by default, which may be incorrect.`,
				);
			}
		}

		valid.push(issue);
	}

	return { valid, errors };
}

/**
 * Separate per-file and cross-file issues from a list of issues
 */
export function separateIssuesByType(
	allIssues: Issue[],
	files: Array<{ relativePath: string }>,
): {
	perFileIssues: Map<string, Issue[]>;
	crossFileIssues: Issue[];
	validationErrors?: string[];
} {
	// Validate issues for multi-file contexts
	const { valid, errors } = validateMultiFileIssues(allIssues, files);

	// Log validation warnings (but don't fail)
	if (errors.length > 0) {
		for (const error of errors) {
			console.warn(`[Parser] Multi-file validation warning: ${error}`);
		}
	}

	const perFileIssues = new Map<string, Issue[]>();
	const crossFileIssues: Issue[] = [];

	// Initialize per-file issue arrays
	for (const file of files) {
		perFileIssues.set(file.relativePath, []);
	}

	for (const issue of valid) {
		// Check if this is a cross-file issue
		if (
			"affectedFiles" in issue &&
			Array.isArray(
				(issue as unknown as { affectedFiles: unknown }).affectedFiles,
			)
		) {
			crossFileIssues.push(issue);
		} else {
			// Try to determine which file this issue belongs to based on location
			let matchingFile: { relativePath: string } | undefined;
			let fileFromLocation: string | undefined;

			// Handle different location formats
			if (!issue.location) {
				// No location specified - default to first file
				matchingFile = files[0];
			} else if (typeof issue.location === "string") {
				// Location is a string like "AGENTS.md:23-27" (defensive: AI providers may return string)
				const parts = (issue.location as unknown as string).split(":");
				fileFromLocation = parts[0];
			} else if (Array.isArray(issue.location)) {
				// Location is an array of location objects
				const firstLoc = issue.location[0];
				if (firstLoc && typeof firstLoc === "object" && "file" in firstLoc) {
					fileFromLocation = firstLoc.file;
				} else if (typeof firstLoc === "string") {
					const parts = (firstLoc as unknown as string).split(":");
					fileFromLocation = parts[0];
				}
			} else if (
				typeof issue.location === "object" &&
				"file" in issue.location
			) {
				// Location is a single object with file property
				fileFromLocation = issue.location.file;
			}

			// Find matching file
			if (fileFromLocation) {
				matchingFile = files.find(
					(f) =>
						f.relativePath === fileFromLocation ||
						f.relativePath.endsWith("/" + fileFromLocation) ||
						fileFromLocation === f.relativePath.split("/").pop(),
				);
			}

			if (matchingFile) {
				perFileIssues.get(matchingFile.relativePath)!.push(issue);
			} else {
				// Default to first file if we can't determine
				perFileIssues.get(files[0]!.relativePath)!.push(issue);
			}
		}
	}

	return {
		perFileIssues,
		crossFileIssues,
		validationErrors: errors.length > 0 ? errors : undefined,
	};
}

/**
 * Extract snippet content from file content based on location
 * @deprecated Use extractSnippetWithContext instead
 */
export function extractSnippet(
	content: string,
	location: Location | Location[],
): string | undefined {
	const info = extractSnippetWithContext(content, location, 0);
	return info?.content;
}

/**
 * Extract snippet content with context lines before and after
 * Returns structured info with line numbers for highlighting
 */
export function extractSnippetWithContext(
	content: string,
	location: Location | Location[],
	contextLines: number = 2,
): SnippetInfo | undefined {
	const lines = content.split("\n");

	// Get the first location if it's an array
	const loc = Array.isArray(location) ? location[0] : location;

	if (!loc || typeof loc !== "object") {
		return undefined;
	}

	const { start, end } = loc;

	// Basic validation
	if (start < 1 || end < start) {
		return undefined;
	}

	// Clamp to valid range instead of rejecting
	const clampedStart = Math.max(1, Math.min(start, lines.length));
	const clampedEnd = Math.max(clampedStart, Math.min(end, lines.length));

	// Log when clamping occurs (for debugging)
	if (start > lines.length || end > lines.length) {
		console.warn(
			`[SnippetExtractor] Line range ${start}-${end} exceeds file length ${lines.length}, clamping to ${clampedStart}-${clampedEnd}`,
		);
	}

	// Calculate context bounds (1-indexed) using clamped values
	const contextStart = Math.max(1, clampedStart - contextLines);
	const contextEnd = Math.min(lines.length, clampedEnd + contextLines);

	// Extract lines with context (convert from 1-indexed to 0-indexed)
	const snippetLines = lines.slice(contextStart - 1, contextEnd);

	// Join content
	const snippetContent = snippetLines.join("\n");

	if (!snippetContent.trim()) {
		return undefined;
	}

	return {
		content: snippetContent,
		startLine: contextStart,
		highlightStart: clampedStart,
		highlightEnd: clampedEnd,
	};
}

/**
 * Populate snippets for all issues using file content
 * Modifies issues in place
 */
export function populateSnippets(
	issues: Issue[],
	fileContentMap: Map<string, string>,
	defaultContent?: string,
): void {
	for (const issue of issues) {
		if (!issue.location) {
			continue;
		}

		// Determine which file content to use
		let content: string | undefined;
		let errorReason: string | undefined;

		// Get file from location
		const loc = Array.isArray(issue.location)
			? issue.location[0]
			: issue.location;

		if (loc && typeof loc === "object" && loc.file) {
			// Try to find the file content by exact path match first
			content = fileContentMap.get(loc.file);

			if (!content) {
				// Only attempt fuzzy matching if the file path does NOT contain directory separators
				// (i.e., it's a basename-only reference, which may be legacy)
				const hasDirectorySeparator = loc.file.includes("/");

				if (!hasDirectorySeparator) {
					// For basename-only references, try to find a matching file
					const matches: string[] = [];
					for (const [path] of fileContentMap) {
						if (path.split("/").pop() === loc.file) {
							matches.push(path);
						}
					}

					if (matches.length === 1) {
						// Exactly one file with this basename - safe to use
						content = fileContentMap.get(matches[0]!);
					} else if (matches.length > 1) {
						// Multiple files with same basename - prefer root-level file
						// Convention: "AGENTS.md", "CLAUDE.md", or "copilot-instructions.md" without path refers to root-level file
						const rootLevelFile = matches.find((path) => !path.includes("/"));
						if (rootLevelFile) {
							content = fileContentMap.get(rootLevelFile);
						} else {
							// No root-level file found - still ambiguous
							errorReason = `Ambiguous file reference: Multiple files have basename "${loc.file}" (${matches.join(", ")}) but none at root level. Use full relative path instead.`;
						}
					}
					// If no matches, errorReason will be set below
				}
			}

			if (!content) {
				// Check if this is a phantom file (suggested location)
				const isPhantom =
					(issue as { isPhantomFile?: boolean }).isPhantomFile === true;

				if (isPhantom) {
					errorReason = `Suggested file location (does not exist yet): ${loc.file}`;
				} else if (!errorReason) {
					// Only set default error if we haven't already set a more specific one
					errorReason = `File not found: ${loc.file}`;
				}
			}
		}

		// Fall back to default content (for single-file evaluations)
		if (!content && defaultContent) {
			content = defaultContent;
			errorReason = undefined; // Clear error if we have fallback
		}

		if (content) {
			// Extract snippet with 2 lines of context
			const snippetInfo = extractSnippetWithContext(content, issue.location, 2);
			if (snippetInfo) {
				issue.snippet = snippetInfo.content;
				issue.snippetInfo = snippetInfo;

				// Update location to match clamped values so UI shows actual range
				if (loc && typeof loc === "object") {
					const locationWasClamped =
						loc.start !== snippetInfo.highlightStart ||
						loc.end !== snippetInfo.highlightEnd;

					if (locationWasClamped) {
						// Update the location to reflect actual displayed range
						if (Array.isArray(issue.location)) {
							// Update first location in array
							issue.location[0] = {
								...issue.location[0],
								start: snippetInfo.highlightStart,
								end: snippetInfo.highlightEnd,
							};
						} else {
							issue.location = {
								...issue.location,
								start: snippetInfo.highlightStart,
								end: snippetInfo.highlightEnd,
							};
						}
					}
				}
			} else if (loc) {
				// extractSnippetWithContext failed - invalid line numbers
				const start = loc.start;
				const end = loc.end;
				const fileLines = content.split("\n").length;

				if (start > fileLines) {
					errorReason = `Line ${start} exceeds file length (${fileLines} lines)`;
				} else if (end > fileLines) {
					errorReason = `End line ${end} exceeds file length (${fileLines} lines)`;
				} else if (!snippetInfo) {
					errorReason = "Unable to extract code snippet";
				}
			}

			// Validate pronouns in category 6.1 issues (language clarity false positive check)
			if (snippetInfo) {
				const warnings = validatePronouns(issue, snippetInfo.content);
				if (warnings.length > 0) {
					issue.validationWarnings = warnings;
				}
			}
		}

		// Store error reason if snippet wasn't populated
		if (!issue.snippetInfo && errorReason) {
			issue.snippetError = errorReason;
		}
	}
}

/**
 * Populate snippets for cross-file issues (issues with multiple affected files)
 * Modifies issues in place
 */
export function populateCrossFileSnippets(
	issues: Issue[],
	fileContentMap: Map<string, string>,
): void {
	for (const issue of issues) {
		if (!issue.affectedFiles || issue.affectedFiles.length === 0) {
			continue;
		}

		const snippets: SnippetInfo[] = [];

		// For each affected file, try to extract a snippet
		for (const filePath of issue.affectedFiles) {
			// Find file content by exact path match first
			let content = fileContentMap.get(filePath);

			if (!content) {
				// Only attempt fuzzy matching for basename-only references
				const hasDirectorySeparator = filePath.includes("/");

				if (!hasDirectorySeparator) {
					// For basename-only references, try to find a matching file
					const matches: string[] = [];
					for (const [path] of fileContentMap) {
						if (path.split("/").pop() === filePath) {
							matches.push(path);
						}
					}

					if (matches.length === 1) {
						// Exactly one file with this basename - safe to use
						content = fileContentMap.get(matches[0]!);
					}
					// If 0 or >1 matches, don't use fuzzy matching
				}
			}

			if (content) {
				// For cross-file issues, if there's a location array, find matching location
				let location: Location | undefined;

				if (Array.isArray(issue.location)) {
					// Find location that matches this file
					location = issue.location.find(
						(loc) => typeof loc === "object" && loc.file === filePath,
					);
				}

				// If no specific location, show first 20 lines as preview
				if (!location) {
					const lines = content.split("\n");
					const previewLines = Math.min(20, lines.length);
					location = { file: filePath, start: 1, end: previewLines };
				}

				// Extract snippet
				const snippetInfo = extractSnippetWithContext(content, location, 2);
				if (snippetInfo) {
					// Add file property to snippet for display
					snippetInfo.file = filePath;
					snippets.push(snippetInfo);
				}
			}
		}

		if (snippets.length > 0) {
			issue.snippets = snippets;
		}
	}
}
