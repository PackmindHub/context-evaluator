# [Unreleased]

## Added

- **Multi-remediation support**: Users can now run multiple independent remediations per evaluation. Each remediation runs from the current git state and produces its own downloadable patch. Past remediations are displayed in a collapsible history section above the config area, with compact cards that expand to show full diffs and action summaries. The 409 guard blocking new remediations when a completed one exists has been removed; only concurrent remediations are prevented.
- **Target agent selection for remediation**: Replace 2-option file type selector (AGENTS.md/CLAUDE.md) with 3 target agents (AGENTS.md, Claude Code, GitHub Copilot). Suggestion remediation now routes output to structured artifacts (standards, skills, or generic updates) with per-agent file path conventions and format templates. Error fix remediation now includes output type routing (standard, skill, or generic), matching the suggestion enrichment framework.
- **Import JSON reports in Web UI**: Upload CLI-generated JSON reports (`--report json`) into the Web UI for viewing and persistence without re-running the evaluation. Available in non-cloud mode via the "Import JSON" tab on the home page. Imported evaluations are marked with an "Imported" badge in the history list.
- **Re-run evaluation from summary page**: "Re-run" button in the evaluation summary header allows re-running the same repository without navigating back to the home page, with an inline provider selector in non-cloud mode
- **Remediation module redesign**: Issue-level selection workflow replaces evaluator-checklist approach
  - "Add to remediate" (+) button on each issue card in Errors and Suggestions tabs
  - "Add all to remediation" bulk action button in each tab
  - Remediate tab shows compact selected issues list grouped by type (errors/suggestions)
  - Badge count on Remediate tab showing number of selected issues
  - SelectionSummaryBar "Remediate" action navigates directly to the Remediate tab
  - Individual issue removal from remediation queue via (X) button
- **Context tab**: Move context files from Summary tab into a dedicated "Context" tab with tool-specific sections (AGENTS.md, Claude Code, GitHub Copilot, Cursor, Linked Docs). Each section groups its related items (e.g., Claude Code shows CLAUDE.md, Rules, and Skills). Uses the official Claude logo for the Claude Code section. Content browser modals now auto-select when only one item is present.
- **Remediation impact evaluation**: "Evaluate Impact" button on each completed remediation card that clones the repo, applies the remediation patch, runs a full 17-evaluator analysis, and displays a before/after score comparison directly on the Remediate tab. Supports idempotent re-evaluation (returns existing result if already run), concurrent execution guard, and automatic cleanup of patched clone directories.
- **Re-evaluation badges in UI**: Impact evaluations created from remediations are now visually distinguished from regular evaluations. A "Re-evaluation" badge with a link icon appears in the Latest Evaluations list, clicking it navigates to the original (parent) evaluation. The Summary tab shows a banner with the original score comparison (e.g., "7.1 → 8.4 (+1.3)").
- Run suggestion evaluators when no AGENTS.md or CLAUDE.md files are found, providing actionable suggestions about what documentation to create
- OpenAI Codex provider (`--agent codex`)
- `--concurrency` CLI option to control parallel evaluator execution
- Advanced CLI options: `--timeout`, `--linked-docs-concurrency`, `--enable-assessment-features`
- Remediation API route (`POST /api/remediation/generate-prompts`) accepting issues directly


## Fixed

- Suppress false positive severity-9 conflicts when colocated AGENTS.md/CLAUDE.md contain `@` file reference annotations (e.g., `@CLAUDE.md` pointing to the companion file)
- File deduplication now drops pointer files containing only `@` references, keeping only the referenced content file

## Changed

- Remediation API accepts `issues` array instead of `selectedEvaluators` for direct issue-to-prompt generation
- Issue selection buttons and SelectionSummaryBar no longer gated behind `assessmentEnabled` feature flag
- Updated evaluator filter counts in CLI help (17 total, 13 errors, 4 suggestions)

# [0.2.0] - 2026-02-10

## Added

- Add "Issues" module that centralize all issues from all evaluations
- Add "Batch mode" to process multiple git repositories
- Add "Stats" page to see overall statistics from all evaluations, as well as insights regarding costs
- When submitting one or multiple repositories to analyze, users can select errors and suggestions to check
- Add sorting controls to Recent Evaluations page (by date, name, grade, or number of errors)
- Add per-evaluator token consumption stats and context identification token tracking to the Stats page

## Fixed

- GH Copilot CLI execution runtime issues were fixed
- Evaluators now have as context the .gitignore to ensure they won't raise issues regarding folders and files ignored
- Evaluator cross-file issues were silently dropped in unified mode due to stale copies missing deduplication IDs

# [0.0.1] - 2026-02-06

## Added

- Initial version of context-evaluator

[0.3.0]: https://github.com/PackmindHub/context-evaluator/compare/release/0.2.0...release/0.3.0
[0.2.0]: https://github.com/PackmindHub/context-evaluator/compare/release/0.0.1...release/0.2.0
[0.0.1]: https://github.com/PackmindHub/context-evaluator/compare/5c44587a...release/0.0.1
