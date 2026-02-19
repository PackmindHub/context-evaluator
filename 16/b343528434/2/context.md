# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: Merge Action Summary + Diff Sections into Unified File List

## Context

The remediation report currently has two separate sections:
1. **Action Summary** — groups action bullets by file name (green checkmarks)
2. **File Changes** — a separate set of expandable `FileChangeCard` rows with diffs below

This is redundant: the same files appear in both places. The user wants a **single unified section** where each file row can toggle its diff inline, replac...

### Prompt 2

commit

