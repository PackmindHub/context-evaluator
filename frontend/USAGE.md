# Frontend Quick Start Guide

## Installation & Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
bun install

# Start development server
bun --hot server.ts
```

The frontend will be available at `http://localhost:3000`

## Using the Frontend

### 1. Upload Evaluation Results

You can upload results in two ways:

**Option A: Drag and Drop**
- Drag your `evaluator-results.json` file onto the upload zone
- The file will be validated and loaded automatically

**Option B: File Browser**
- Click "Select File" button
- Choose your `evaluator-results.json` file
- File will be validated and loaded

### 2. View Summary

After loading, you'll see:
- **Header**: Generation date, agent used, evaluation mode
- **Stats Grid**: Total files, issues breakdown
- **Severity Breakdown**: Critical (🔴), High (🟠), Medium (🟡) counts
- **Resource Usage**: Token usage (input, output, cache)
- **Cost & Duration**: Total cost and evaluation time

### 3. Filter Issues

Use the left sidebar to filter:

**Severity Filter**
- ☑️ Critical (9-10)
- ☑️ High (7-8)
- ☑️ Medium (4-6)

**Category Filter**
- Select specific issue categories
- Multiple selections supported

**Evaluator Filter**
- Filter by evaluator name (e.g., `01-content-quality`)
- Multiple selections supported

**Search**
- Free-text search across descriptions
- Real-time filtering

**Active Filters**
- View all active filters as badges
- Click × on badge to remove
- "Clear all" to reset

### 4. Explore Issues

Each issue card shows:
- **Severity badge** with emoji and color
- **Title** and **category**
- **Description** of the problem
- **Location** (file path and lines)
- **Affected files** (for cross-file issues)

Click the ▼ button to expand and see:
- **Impact** on the codebase
- **Recommendation** for fixing
- **Context** and **quotes**
- **Patterns** detected

### 5. Copy Information

- Click 📋 next to locations to copy file paths
- Useful for opening files in your editor

## Sample Workflow

1. **Run CLI evaluation**:
   ```bash
   cd ..  # Back to root
   bun run evaluate --repo <url>
   ```

2. **Start frontend**:
   ```bash
   cd frontend
   bun --hot server.ts
   ```

3. **Upload results**:
   - Upload the generated `evaluator-results.json`

4. **Analyze**:
   - Review summary statistics
   - Filter by severity to focus on critical issues
   - Filter by evaluator to see specific checks
   - Search for keywords

5. **Fix issues**:
   - Copy file locations
   - Open files in your editor
   - Apply recommendations

6. **Re-evaluate**:
   - Run evaluation again
   - Compare results

## Keyboard Shortcuts

- `Ctrl/Cmd + F`: Focus search input
- `Esc`: Clear search
- `Space`: Toggle expanded state on focused issue

## Troubleshooting

**File upload fails**
- Ensure file is valid JSON
- Check file size (max 10MB)
- Verify it's from the evaluator tool

**No issues showing**
- Check active filters
- Clear all filters
- Verify the JSON file contains issues

**Server won't start**
- Check port 3000 is available
- Run `bun install` first
- Check Bun version (1.0+)

## Production Build

For production deployment:

```bash
# Build
bun build server.ts --outdir dist

# Run production build
bun run dist/server.js
```

## Development Notes

- **Hot reload**: File changes apply instantly
- **No build step**: Bun bundles on-demand
- **Type safety**: Full TypeScript support
- **Fast startup**: Bun's native speed

## Support

For issues or questions:
- Check main README.md
- Review frontend/README.md
- Check source comments in `src/`
