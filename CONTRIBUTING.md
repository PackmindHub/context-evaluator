# Contributing to context-evaluator

Thank you for your interest in contributing to context-evaluator! This guide covers development setup, architecture, and contribution guidelines.

## Table of Contents

- [Development Setup](#development-setup)
- [Development Commands](#development-commands)
- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Building for Production](#building-for-production)
- [API Reference](#api-reference)
- [CLI Usage](#cli-usage)
- [Evaluation Modes](#evaluation-modes)
- [Testing](#testing)
- [Code Style](#code-style)
- [Troubleshooting](#troubleshooting)
- [Making Contributions](#making-contributions)

---

## Development Setup

### Prerequisites

- [Bun](https://bun.com) runtime (v1.0+)
- [Git](https://git-scm.com/)
- An AI CLI tool installed and authenticated:
  - [Claude Code CLI](https://claude.ai/code) (default)
  - [Cursor Agent CLI](https://cursor.com) (alternative)
  - [OpenCode CLI](https://github.com/opencode-ai/opencode) (alternative)
  - [GitHub Copilot CLI](https://docs.github.com/en/copilot/using-github-copilot/using-github-copilot-in-the-command-line) (alternative)

### Installation

```bash
# Clone the repository
git clone https://github.com/PackmindHub/context-evaluator.git
cd context-evaluator

# Install dependencies
bun install

# Copy environment configuration (optional)
cp .env.example .env
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `3000` | API server port |
| `HOST` | `localhost` | API server hostname |
| `MAX_CONCURRENT_JOBS` | `2` | Max concurrent evaluation jobs |
| `DEBUG` | `false` | Enable debug logging |

---

## Development Commands

### Core Commands

```bash
# Start API server + Frontend (with hot reload)
bun run dev

# Start API server only
bun run dev:api

# Start Frontend dev server only
bun run dev:frontend

# CLI development mode
bun run dev:cli
```

### Testing & Quality

```bash
# Run all tests
bun run test

# Run tests in watch mode
bun run test --watch

# Type checking
bun run typecheck

# Lint code (Biome)
bun run lint

# Auto-fix lint issues
bun run lint:fix

# Format code
bun run format
```

### Building

```bash
# Full production build (frontend + embedded assets + all platform binaries)
bun run build

# Quick evaluation shorthand
bun run evaluate
```

---

## Architecture Overview

### Dual Execution Modes

The application runs in two modes from a single entry point (`src/index.ts`):

- **CLI Mode**: Direct terminal evaluation via Commander.js
- **API Mode**: Web server with REST API + React frontend

### Key Architecture Features

- **Shared Evaluation Engine**: Both CLI and API use the same core logic in `src/shared/`
- **Job Queue**: Concurrent job management with configurable max jobs
- **SSE Streaming**: Real-time progress updates via Server-Sent Events
- **Type-Safe**: Full TypeScript support throughout
- **Embedded Assets**: Single binary deployment with frontend and prompts bundled

### TypeScript Path Aliases

```
@shared/* → ./src/shared/*
@cli/*    → ./src/cli/*
@api/*    → ./src/api/*
@web/*    → ./src/web/*
```

---

## Project Structure

```
.
├── src/
│   ├── index.ts                      # Main entry (CLI or API routing)
│   ├── cli/                          # CLI-specific code
│   │   ├── index.ts                  # Commander.js setup
│   │   ├── commands/
│   │   │   └── evaluate-command.ts   # CLI evaluation logic
│   │   └── output/
│   │       └── terminal-formatter.ts # Terminal output formatting
│   ├── api/                          # API server
│   │   ├── index.ts                  # Bun.serve with SSE
│   │   ├── routes/
│   │   │   ├── evaluation.ts         # Evaluation endpoints
│   │   │   └── health.ts             # Health check
│   │   ├── sse/
│   │   │   └── progress-handler.ts   # SSE progress streaming
│   │   └── jobs/
│   │       └── job-manager.ts        # Job queue & execution
│   ├── embedded/                     # Embedded assets (auto-generated)
│   │   ├── frontend-assets.ts        # Bundled frontend files
│   │   ├── prompts-assets.ts         # Bundled evaluator prompts
│   │   ├── asset-server.ts           # Serve embedded frontend
│   │   └── prompt-server.ts          # Access embedded prompts
│   └── shared/                       # Shared evaluation engine
│       ├── evaluation/
│       │   ├── engine.ts             # Core orchestrator
│       │   ├── runner.ts             # Evaluator execution
│       │   └── config.ts             # Configuration
│       ├── providers/                # AI provider abstraction
│       │   ├── index.ts              # Public exports
│       │   ├── types.ts              # Provider interfaces
│       │   ├── registry.ts           # Provider factory
│       │   ├── base-provider.ts      # Shared retry logic
│       │   ├── claude-provider.ts    # Claude Code CLI
│       │   ├── cursor-provider.ts    # Cursor Agent CLI
│       │   ├── opencode-provider.ts  # OpenCode CLI
│       │   └── github-copilot-provider.ts  # GitHub Copilot CLI
│       ├── claude/
│       │   ├── prompt-builder.ts     # Prompt construction
│       │   └── response-parser.ts    # Response parsing
│       ├── file-system/
│       │   ├── file-finder.ts        # AGENTS.md discovery
│       │   └── git-cloner.ts         # Git operations
│       └── types/                    # Type definitions
├── frontend/                         # React frontend (separate build)
│   ├── src/
│   │   ├── App.tsx                   # Main app
│   │   ├── components/               # UI components
│   │   ├── hooks/                    # React hooks
│   │   ├── contexts/                 # React contexts
│   │   └── types/                    # TypeScript types
│   ├── server.ts                     # Dev server with hot reload
│   └── package.json
├── prompts/                          # Evaluator templates
│   ├── evaluators/                   # 17 specialized evaluators
│   └── shared/                       # Shared prompt fragments
├── scripts/
│   └── generate-embedded-assets.ts   # Build script for embedding
└── dist/                             # Build outputs
    └── bin/                          # Standalone binaries
```

---

## Building for Production

### Full Build Command

Always use the full build command for production:

```bash
bun run build
```

This runs the complete pipeline:
1. **clean** - Removes stale files from `dist/` and `frontend/dist/`
2. **build:frontend** - Compiles React app with hashed filenames
3. **generate:embedded** - Embeds frontend assets into TypeScript
4. **build:binaries** - Creates standalone executables

### Binary Outputs

| Platform | Binary | Size |
|----------|--------|------|
| macOS (Apple Silicon) | `dist/bin/context-evaluator-darwin-arm64` | ~60MB |
| macOS (Intel) | `dist/bin/context-evaluator-darwin-x64` | ~66MB |
| Linux (x64) | `dist/bin/context-evaluator-linux-x64` | ~102MB |
| Windows (x64) | `dist/bin/context-evaluator-windows-x64.exe` | ~113MB |

### Running Production Binary

```bash
# Start web server
./dist/bin/context-evaluator-darwin-arm64 api

# CLI mode
./dist/bin/context-evaluator-darwin-arm64 cli evaluate --path /repo
```

### Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for complete deployment guide including:
- systemd service configuration
- nginx reverse proxy setup
- HTTPS with Let's Encrypt

---

## API Reference

### REST Endpoints

#### Health & Configuration

```bash
GET /api/health          # Health check
GET /api/config          # Returns { assessmentEnabled: boolean }
```

#### Evaluation

```bash
# Start new evaluation
POST /api/evaluate
{
  "repositoryUrl": "https://github.com/user/repo",  # OR
  "localPath": "/path/to/directory",
  "options": {
    "evaluationMode": "independent",  # or "unified"
    "concurrency": 3,
    "evaluators": 12,
    "provider": "claude"  # or "cursor", "opencode", "github-copilot"
  }
}

# Get job status
GET /api/evaluate/:jobId

# List all jobs
GET /api/evaluate

# List evaluators
GET /api/evaluators

# Get specific evaluator template
GET /api/evaluators/:id
```

#### Evaluation History

```bash
GET /api/evaluations?limit=10      # List recent evaluations
GET /api/evaluations/:id           # Get full evaluation details
GET /api/evaluations/:id/prompts   # Get final prompts for debugging
DELETE /api/evaluations/:id        # Delete evaluation
DELETE /api/evaluations            # Delete all evaluations
```

#### Feedback & Bookmarks

```bash
POST /api/feedback                           # Submit feedback
DELETE /api/feedback?evaluationId=X&issueHash=Y
GET /api/feedback/evaluation/:evaluationId   # Get feedback for evaluation
GET /api/feedback/aggregate                  # Aggregated feedback

POST /api/bookmarks                          # Add bookmark
DELETE /api/bookmarks?evaluationId=X&issueHash=Y
GET /api/bookmarks/evaluation/:evaluationId  # Get bookmarks
```

### Server-Sent Events (SSE)

```bash
GET /api/evaluate/:jobId/progress
```

**Events:**
- `job.started` - Evaluation started
- `file.started` / `file.completed` - File processing
- `evaluator.progress` / `evaluator.completed` - Evaluator updates
- `evaluator.retry` / `evaluator.timeout` - Error handling
- `curation.started` / `curation.completed` - Impact curation
- `evaluation.warning` - Warnings
- `job.completed` / `job.failed` - Final status

---

## CLI Usage

### Basic Commands

```bash
# Evaluate current directory (uses Claude by default)
bun run evaluate

# Evaluate specific directory
bun run src/index.ts cli evaluate --path /Users/me/project

# Evaluate GitHub repository
bun run src/index.ts cli evaluate --url https://github.com/user/repo
```

### Using Different AI Providers

```bash
--agent claude         # Claude Code (default)
--agent cursor         # Cursor Agent
--agent opencode       # OpenCode
--agent github-copilot # GitHub Copilot
```

### CLI Options

| Option | Description |
|--------|-------------|
| `--agent <name>` | AI agent: `claude`, `cursor`, `opencode`, `github-copilot` |
| `--url <url>` | GitHub repository URL to clone and evaluate |
| `--path <dir>` | Path to local directory (mutually exclusive with `--url`) |
| `-o, --output <file>` | Output file path (default: `evaluator-results.json`) |
| `-v, --verbose` | Enable verbose output |
| `--debug` | Save prompts/responses to debug-output/ |
| `--preserve-debug-output` | Keep debug files after successful evaluation |
| `--concurrency <n>` | Concurrent evaluators (default: 3) |
| `--depth <n>` | Directory depth for AGENTS.md search (0 = root only) |
| `--evaluators <n>` | Number of evaluators to run (default: 12) |
| `--evaluator-filter <type>` | Filter: `all`, `errors`, `suggestions` |
| `--unified` | Force unified evaluation mode |
| `--independent` | Force independent evaluation mode |
| `--max-tokens <n>` | Max tokens for unified mode (default: 100000) |
| `--no-curation` | Disable impact curation |
| `--top-n <n>` | Top issues to curate (default: 20) |
| `--report <mode>` | Format: `terminal`, `raw`, `json` |

---

## Evaluation Modes

### Independent Mode (Default)

Each AGENTS.md file is evaluated separately:
- Faster processing
- Per-file results
- Best for: Large codebases, quick scans

### Unified Mode

All AGENTS.md files evaluated together:
- Better cross-file issue detection
- Single unified context
- Higher token usage
- Best for: Related files, comprehensive analysis

**Mode Selection Logic:**
- Single file → Independent mode
- Multiple files with small combined size → Unified mode
- Multiple files with large combined size → Independent mode
- Use `--unified` or `--independent` flags to force a specific mode

---

## Testing

### Running Tests

```bash
# Run all tests
bun run test

# Watch mode
bun run test --watch

# Run specific test file
bun test src/shared/evaluation/engine.test.ts
```

### Test Organization

Tests are co-located with source files using the `.test.ts` suffix:

```
src/shared/evaluation/engine.ts
src/shared/evaluation/engine.test.ts
```

---

## Code Style

### TypeScript

- Strict mode enabled
- No `any` types without justification
- Use path aliases (`@shared/`, `@cli/`, etc.)

### Linting

We use [Biome](https://biomejs.dev/) for linting and formatting:

```bash
bun run lint       # Check for issues
bun run lint:fix   # Auto-fix issues
bun run format     # Format code
```

### Pre-commit Hook

The project uses Husky with a pre-commit hook that runs:
- `bun run test` - All tests must pass
- `bun run lint` - Code must pass linting

Commits will be blocked if either fails.

---

## Troubleshooting

### AI CLI Issues

**Claude Code:**
```bash
claude --version    # Verify installation
claude login        # Authenticate if needed
```

**Cursor Agent:**
```bash
agent --version     # Verify installation
# Install from https://cursor.com if needed
```

**OpenCode:**
```bash
opencode --version  # Verify installation
```

**GitHub Copilot:**
```bash
copilot --version   # Verify installation
```

### Port Already in Use

```bash
PORT=8080 bun run dev
```

### Build Issues

```bash
# Clean and rebuild
bun run clean && bun run build
```

### CSS Changes Not Appearing

When modifying Tailwind configuration:

```bash
cd frontend && bun run css:build
```

---

## Making Contributions

### Workflow

1. **Fork** the repository
2. **Create a feature branch**: `git checkout -b feature/my-feature`
3. **Make your changes**
4. **Run checks**:
   ```bash
   bun run test
   bun run typecheck
   bun run lint
   ```
5. **Commit** with a clear message
6. **Push** to your fork
7. **Submit a pull request**

### Commit Guidelines

- Use clear, descriptive commit messages
- Reference issue numbers when applicable
- Keep commits focused on a single change

### Pull Request Process

1. Ensure all tests pass
2. Update documentation if needed
3. Add tests for new functionality
4. Request review from maintainers

---

## License

MIT

## Questions?

Open an issue on [GitHub](https://github.com/PackmindHub/context-evaluator/issues).
