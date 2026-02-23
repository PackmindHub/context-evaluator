# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Fix: Add `--trust` flag to Cursor Agent CLI invocation

## Context

The Cursor Agent CLI now requires explicit workspace trust when running non-interactively. On the remote machine, evaluations fail with:

```
⚠ Workspace Trust Required
Pass --trust, --yolo, or -f if you trust this directory
```

This blocks all Cursor-based evaluations on remote/headless servers since there's no interactive prompt to accept trust.

## Change

**File:** `src/shared/providers/cu...

### Prompt 2

Ensure the command is properly displayed when running remediations with cursor in the frontend

### Prompt 3

commit a

