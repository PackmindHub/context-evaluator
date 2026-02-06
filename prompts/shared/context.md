# AGENTS.md Evaluation Context

## What is AGENTS.md

AGENTS.md is a standardized format for providing context and instructions to AI coding agents. It should complement README.md by containing detailed, agent-specific guidance about build steps, tests, conventions, and project-specific workflows.

## Evaluation Constraints

**IMPORTANT**: You will ONLY receive the AGENTS.md file content itself, without access to:
- The actual codebase or repository structure
- README.md or other documentation files
- package.json, pom.xml, or other config files
- The project's git history or CI configuration

Therefore, focus your evaluation on **intrinsic quality signals** that can be detected from the text alone:
- Clarity and specificity of language
- Completeness of information within the document
- Logical structure and organization
- Presence of actionable commands vs. vague guidance
- Internal consistency
- Signs of human-focused vs. agent-focused content

---

## Workspace & Environment Assumptions

**IMPORTANT**: When evaluating AGENTS.md files, assume the following workspace prerequisites are ALREADY in place:

### What Agents Can Reasonably Assume

1. **Standard Language Runtimes**: If the project type is mentioned (Rails, Node.js, Python, Go, etc.), assume the primary language runtime is installed and functional
2. **Package Managers**: Standard package managers for the ecosystem (npm/yarn for Node, bundler for Ruby, pip for Python, cargo for Rust) are available
3. **Version Control**: Git is installed and the repository is cloned
4. **Database Engines**: If a database is mentioned, assume the engine itself is installed (though credentials/setup may need documentation)
5. **Operating System Basics**: Standard UNIX utilities (bash, curl, wget, etc.) are available on the PATH

### What SHOULD Be Documented

1. **Specific Version Requirements**: If unusual or strict versions are required (e.g., "must be Node 14.x, NOT 16+"), this should be stated with verification commands
2. **Non-Standard Tools**: Custom build tools, proprietary CLIs, or unusual dependencies (e.g., `modernizr`, custom scripts) need explanation
3. **Environment Configuration**: How to set up `.env` files, credentials, API keys, database connection strings
4. **Service Dependencies**: External services that must be running (Redis, Elasticsearch, message queues)
5. **Verification Commands**: How to check that the environment is correctly configured before starting work

### Severity Guidance for Prerequisites

**Severity 8-10 (Critical/High)**:
- No mention of unusual/non-standard tools that appear in commands
- Custom toolchain with zero explanation
- Complex environment with no setup guidance at all
- Tool mentioned but NO command AND NO explanation (e.g., "We use X" with nothing else)

**Severity 6-7 (Medium-High/High)**:
- Non-standard tool with command but unclear purpose/usage
- Complex multi-service setup (Docker, databases, caches) with incomplete guidance
- Environment variables required but not listed
- Tool mentioned with partial information (command OR purpose, but not both)

**Severity 4-5 (Low-Medium) - DO NOT REPORT**:
- Standard toolchain for project type (Ruby for Rails, Node for Next.js) with versions mentioned but no verification commands
- Basic prerequisites implied by project type (Postgres for Rails app, npm for JavaScript project)
- Standard conventions followed (bin/setup, npm install) even if prerequisites not explicitly listed
- **Non-standard tool mentioned WITH both command AND purpose** (e.g., "LangGraph Studio requires local dev server running via `langgraph dev`")
- **Discovery mechanism provided** (e.g., "run `make help` to see targets")

### Example: Good Minimal Prerequisites

For a standard Rails project:
```markdown
## Prerequisites
Rails 6.0 on Ruby 2.6.6 with Postgres 12+. Verify: `ruby -v`, `bundle -v`, `psql --version`
```

For a Node.js project:
```markdown
## Prerequisites
Node 16+ and npm 7+. Check versions: `node -v`, `npm -v`
```

### Example: When to Flag as High Severity

```markdown
## Setup
Run: `custom-tool build && proprietary-cli deploy`
```
*(No explanation of what these tools are, how to install them, or where to get them = Severity 8)*
