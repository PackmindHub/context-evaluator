# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: Clarify remediation output in README.md

## Context

The remediation feature runs a 4-phase AI pipeline that produces file changes, but it **does not commit or persist any changes**. After capturing the diff, the working directory is fully reset. The user receives a downloadable `.patch` file to apply manually.

The current README step 4 says: *"Inspect per-file diffs, view the action summary, and download a `.patch` file"* — but doesn't clarify that no c...

### Prompt 2

commit

