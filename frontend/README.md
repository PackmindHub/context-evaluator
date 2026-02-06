# AGENTS.md Evaluator Frontend

A modern, developer-friendly web interface for visualizing AGENTS.md evaluation results.

## Features

- 🎨 **Clean B2B SaaS Design** - Professional interface with great UX
- 📤 **Drag & Drop Upload** - Easy file upload with validation
- 🔍 **Advanced Filtering** - Filter by severity, category, evaluator, and search text
- 📊 **Comprehensive Summary** - Metadata, statistics, token usage, and costs
- 🎯 **Smart Issue Display** - Expandable cards with all issue details
- ⚡ **Fast & Responsive** - Client-side processing, instant filtering

## Tech Stack

- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **Bun** for bundling and serving
- No build step required - uses Bun's HTML imports

## Getting Started

### Install Dependencies

```bash
cd frontend
bun install
```

### Run Development Server

```bash
bun --hot server.ts
```

The frontend will be available at `http://localhost:3000`

### Build for Production

```bash
bun build server.ts --outdir dist
```

### Run Production Build

```bash
bun run dist/server.js
```

## Usage

1. **Upload Results**: Drag and drop your `evaluator-results.json` file or click to browse
2. **View Summary**: See overall statistics, severity breakdown, and resource usage
3. **Filter Issues**: Use the sidebar to filter by severity, category, or evaluator
4. **Explore Details**: Click to expand individual issues for full details

## File Format

The frontend supports both evaluation modes:

- **Unified Mode**: Single evaluation with results array
- **Independent Mode**: Per-file evaluations with files object

Example upload file: `evaluator-results.json` from running:
```bash
bun run evaluate --repo <url>
```

## Project Structure

```
frontend/
├── index.html          # Entry point
├── server.ts           # Bun.serve configuration
├── src/
│   ├── App.tsx        # Main application
│   ├── components/    # React components
│   ├── types/         # TypeScript types
│   └── styles.css     # Tailwind styles
└── package.json
```

## Development

The frontend uses Bun's hot module reloading for instant updates during development. Just edit files and see changes immediately.

## Deployment

Deploy as a Bun server to any platform that supports Bun:
- Fly.io
- Railway
- Any VPS with Bun installed

Or build and serve statically (requires additional configuration).
