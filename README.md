# context-evaluator

AI agent documentation quality analyzer for AGENTS.md and CLAUDE.md files.

This tool evaluates your AI agent instruction files using 17 specialized evaluators to identify issues and improvement opportunities, and can automatically remediate them using AI. It helps ensure your documentation provides clear, actionable guidance for AI coding assistants.

**An experimental project from [Packmind](https://github.com/PackmindHub/packmind).**

---

## How to Use

### Option 1: Online (No Install)

Visit **[https://context-evaluator.ai](https://context-evaluator.ai)** and paste your repository URL.

### Option 2: Binary Release (No Dependencies)

Download a standalone executable from [GitHub Releases](https://github.com/PackmindHub/context-evaluator/releases). No runtime dependencies needed.

Available platforms: macOS (Apple Silicon), macOS (Intel), Linux (x64), Windows (x64).

```bash
# Make executable (macOS/Linux)
chmod +x ./context-evaluator-<platform>

# Start the web UI
./context-evaluator-<platform> api

# Or run a CLI evaluation
./context-evaluator-<platform> cli evaluate --url https://github.com/user/repo
```

Then open **http://localhost:3000** in your browser.

### Option 3: From Source (requires Node 22+ and [Bun](https://bun.sh))

```bash
# Clone and install
git clone https://github.com/PackmindHub/context-evaluator.git
cd context-evaluator
bun install

# Start the application
bun run dev
```

Then open **http://localhost:3000** in your browser.

### Local Scanning Notes

- Git clone operations run on your local machine
- Private repositories may work if your git credentials are configured (SSH keys, credential helpers)
- The homepage auto-detects which AI agents you have installed

---

## How it Works

```
Input (Git URL or Local Path)
    ↓
Clone Repository (if remote)
    ↓
Analyze Codebase (languages, frameworks, patterns)
    ↓
Find Documentation (AGENTS.md, CLAUDE.md, linked files)
    ↓
Run 17 Evaluators via AI
    ↓
Rank by Impact
    ↓
Calculate Score & Grade
    ↓
Return Results
```

**Processing time:** 1-3 minutes depending on codebase size and AI provider.

**Cost display:** Shows API costs when supported by the provider.

---

## Understanding Results

Results are categorized into two types:

- **Errors** (13 evaluators): Issues with existing content that need fixing
- **Suggestions** (4 evaluators): Opportunities for new content based on codebase analysis

Each issue includes:
- Severity level (Critical, High, Medium, Low)
- Location in your documentation
- Problem description
- Recommended fix

---

## Remediation

After reviewing evaluation results, you can automatically fix issues using AI-powered remediation (web UI only).

### How it works

1. **Select issues** — Use the + button on issue cards to add them to your selection basket
2. **Configure** — Choose your target file type (AGENTS.md or CLAUDE.md) and AI provider
3. **Execute** — Click "Execute Remediation" to let the AI agent fix errors and add missing content
4. **Review** — Inspect the generated diffs per file, then download the patch

Errors are fixed first (sorted by severity), then suggestions are added on top. Issues are batched automatically to stay within token limits.

### Output

- Per-file diffs with additions/deletions
- Action summary showing what was fixed, added, or skipped
- Downloadable `.patch` file
- Cost and token usage breakdown

### Alternative: Generate Prompts

If you prefer manual control, click "Generate Prompts" to get copy-paste-ready prompts for your own CLI agent.

---

## Evaluators

| # | Evaluator | Type | Description |
|---|-----------|------|-------------|
| 01 | Content Quality | Error | Detects human-focused, irrelevant, or vague content |
| 02 | Structure & Formatting | Error | Identifies poor organization and inconsistent formatting |
| 03 | Command Completeness | Error | Finds incomplete commands and missing prerequisites |
| 04 | Testing Guidance | Error | Detects absent or unclear testing instructions |
| 05 | Code Style Clarity | Error | Identifies missing or conflicting style guidelines |
| 06 | Language Clarity | Error | Finds ambiguous language and undefined jargon |
| 07 | Workflow Integration | Error | Detects missing git/CI workflow documentation |
| 08 | Project Structure | Error | Identifies missing codebase organization explanations |
| 09 | Security Awareness | Error | Finds exposed credentials and security risks |
| 10 | Completeness & Balance | Error | Detects skeletal or over-detailed content |
| 11 | Subdirectory Coverage | Suggestion | Recommends separate AGENTS.md for subdirectories |
| 12 | Context Gaps | Suggestion | Discovers undocumented framework/tool patterns |
| 13 | Contradictory Instructions | Error | Detects conflicting instructions across files |
| 14 | Test Patterns Coverage | Suggestion | Discovers undocumented testing conventions |
| 15 | Database Patterns Coverage | Suggestion | Discovers undocumented database/ORM patterns |
| 17 | Markdown Validity | Error | Checks markdown syntax and link validity |
| 19 | Outdated Documentation | Error | Verifies documented paths and files exist |

---

## AI Providers

The tool supports multiple AI providers:

| Provider | CLI Flag | Setup |
|----------|----------|-------|
| Claude Code | `--agent claude` (default) | [claude.ai/code](https://claude.ai/code) |
| Cursor Agent | `--agent cursor` | [cursor.com](https://cursor.com) |
| OpenCode | `--agent opencode` | [github.com/opencode-ai/opencode](https://github.com/opencode-ai/opencode) |
| GitHub Copilot | `--agent github-copilot` | [docs.github.com/copilot](https://docs.github.com/en/copilot) |
| OpenAI Codex | `--agent codex` | [docs.openai.com/codex](https://docs.openai.com/codex) |

---

## CLI Reference

### Basic Usage

```bash
# Evaluate current directory
bun run evaluate

# Evaluate a remote repository
bun run evaluate --url https://github.com/user/repo

# Evaluate a local directory
bun run evaluate --path /path/to/project
```

### Evaluate Command Options

| Option | Description | Default |
|--------|-------------|---------|
| `--url <github-url>` | GitHub repository URL to clone and evaluate | - |
| `--path <directory>` | Local directory path (absolute or relative) | Current directory |
| `--agent <name>` | AI provider: `claude`, `cursor`, `opencode`, `github-copilot`, `codex` | `claude` |
| `-o, --output <file>` | Output file path for results | `evaluator-results.json` |
| `--report <mode>` | Output format: `terminal`, `raw`, `json` | `terminal` |

**Evaluation Scope:**

| Option | Description | Default |
|--------|-------------|---------|
| `--evaluators <number>` | Number of evaluators to run | `12` |
| `--evaluator-filter <type>` | Filter: `all` (17), `errors` (13), `suggestions` (4) | `all` |
| `--depth <integer>` | Limit directory depth for context file search (0 = root only) | Unlimited |
| `--concurrency <number>` | Number of evaluators to run concurrently | `3` |

**Evaluation Mode:**

| Option | Description |
|--------|-------------|
| `--unified` | All files evaluated together (better cross-file detection) |
| `--independent` | Each file evaluated separately |
| `--max-tokens <number>` | Maximum combined tokens for unified mode (default: 100000) |

**Results:**

| Option | Description | Default |
|--------|-------------|---------|
| `--no-curation` | Show all issues without impact prioritization | Curation enabled |
| `--top-n <number>` | Number of top issues to curate | `20` |

**Debug:**

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Enable verbose output |
| `--debug` | Save prompts/responses to `debug-output/` directory |
| `--preserve-debug-output` | Keep debug files after successful evaluation |

**Advanced:**

| Option | Description | Default |
|--------|-------------|---------|
| `--timeout <ms>` | Timeout per evaluator in milliseconds | `600000` |
| `--linked-docs-concurrency <number>` | Parallel AI calls for linked doc summarization | `3` |
| `--enable-assessment-features` | Enable assessment features (feedback, selection basket) | Disabled |

### Examples

```bash
# Run all error evaluators only
bun run evaluate --evaluator-filter errors

# Evaluate with verbose output and top 10 issues
bun run evaluate -v --top-n 10

# Evaluate remote repo with JSON output
bun run evaluate --url https://github.com/user/repo --report json -o report.json

# Use Cursor agent with unified mode
bun run evaluate --agent cursor --unified
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, architecture details, API reference, and contribution guidelines.

---

## About

Built with [Bun](https://bun.com), [React](https://react.dev), [Tailwind CSS](https://tailwindcss.com), and [TypeScript](https://www.typescriptlang.org).

**License:** MIT

**Issues & Feedback:** [GitHub Issues](https://github.com/PackmindHub/context-evaluator/issues)
