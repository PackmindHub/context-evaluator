# Project Context Identifier

You are analyzing a codebase to extract key technical context that will help AI coding agent evaluators better assess AGENTS.md documentation files.

---

## Your Task

Analyze the provided codebase information and extract a concise technical summary covering:

1. **Languages** - Primary programming languages with relative usage (e.g., "TypeScript (primary), JavaScript, CSS")
2. **Frameworks** - Key frameworks and libraries (e.g., "React, Express.js, Jest")
3. **Architecture** - High-level architecture pattern if detectable (e.g., "Monorepo with frontend/backend separation")
4. **Patterns** - High-level architectural patterns only (e.g., "Layered architecture, Repository pattern, DDD, MVC, Event-driven")

---

## Input Information

### CLOC Analysis (Lines of Code by Language)

{{CLOC_OUTPUT}}

### Repository Structure

{{REPO_STRUCTURE}}

### Directory Listing

{{FOLDER_LIST}}

---

## Output Format

Return a concise plain text summary in exactly this format:

```
Languages: [list main languages with relative importance]
Frameworks: [list key frameworks and libraries]
Architecture: [describe high-level architecture in one line]
Patterns: [list high-level architectural patterns only]

Key Folders:
- path/to/folder - Brief description (2-5 words)
- path/to/another - Brief description
[... up to 20 most important folders ...]
```

**Guidelines:**
- Keep the summary section (Languages through Patterns) under 10 lines
- Be specific but concise - this context helps evaluators understand what's important
- Focus on information that helps understand what an AGENTS.md should cover:
  - Technology stack expectations
  - Testing and build patterns
  - Framework-specific conventions
- If CLOC data is not available, infer from the repository structure
- If certain aspects are unclear, write "Unknown" rather than guessing
- For Patterns: Report ONLY high-level architectural patterns that describe the overall system design (examples: DDD, MVC, MVVM, hexagonal/ports-and-adapters, layered architecture, event-driven, microservices, Repository pattern, CQRS). Do NOT include:
  - Naming conventions (interface prefixes like "I", abstract class prefixes, casing rules)
  - Testing patterns (AAA, TDD, BDD, single assertion per test)
  - Dependency injection (implementation detail, not architecture)
  - Code-level patterns (factories at class level, builders, decorators)

**Key Folders Guidelines:**
- Select up to 20 folders that are most architecturally significant
- Prioritize: source code directories, test directories, configuration folders, shared/common code
- Use relative paths from repository root (no leading ./)
- Keep descriptions to 2-5 words each
- Focus on folders that an AI agent would need to understand to work effectively

**Example Output:**

```
Languages: TypeScript (primary), JavaScript, CSS
Frameworks: React (frontend), Express.js (backend), Jest (testing), Prisma (ORM)
Architecture: Monorepo with apps/ and packages/ structure, REST API backend
Patterns: Layered architecture with service layer, Repository pattern for data access

Key Folders:
- src/components - React UI components
- src/api/routes - REST API endpoints
- src/services - Business logic layer
- src/hooks - Custom React hooks
- src/utils - Shared utility functions
- tests/unit - Unit test files
- tests/integration - Integration tests
- prisma - Database schema and migrations
- config - Application configuration
```

DO NOT include:
- Detailed file counts (already provided in CLOC)
- Installation or setup instructions
- Marketing language or opinions
- JSON formatting - use plain text only
- Non-source folders like node_modules, dist, build, .git
