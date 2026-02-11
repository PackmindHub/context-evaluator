# [0.3.0] - 2026-02-11

## Added

- **Remediation module redesign**: Issue-level selection workflow replaces evaluator-checklist approach
  - "Add to remediate" (+) button on each issue card in Errors and Suggestions tabs
  - "Add all to remediation" bulk action button in each tab
  - Remediate tab shows compact selected issues list grouped by type (errors/suggestions)
  - Badge count on Remediate tab showing number of selected issues
  - SelectionSummaryBar "Remediate" action navigates directly to the Remediate tab
  - Individual issue removal from remediation queue via (X) button
- Run suggestion evaluators when no AGENTS.md or CLAUDE.md files are found, providing actionable suggestions about what documentation to create
- OpenAI Codex provider (`--agent codex`)
- `--concurrency` CLI option to control parallel evaluator execution
- Advanced CLI options: `--timeout`, `--linked-docs-concurrency`, `--enable-assessment-features`
- Remediation API route (`POST /api/remediation/generate-prompts`) accepting issues directly

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
