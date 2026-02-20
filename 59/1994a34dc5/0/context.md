# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: Local Execution Warning in Remediation Confirmation Modal

## Context

When users click "Execute Remediation", a confirmation modal appears. Currently it only shows issue counts, target, and provider name. But locally, the system spawns CLI agents with elevated permissions (e.g., `--dangerously-skip-permissions` for Claude). Users should be informed about **what command will run on their machine** and its security implications before confirming. This warnin...

### Prompt 2

commit

