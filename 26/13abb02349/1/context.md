# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: Fix Evaluate Impact UX - Show Started Message + Progress Link

## Context

When "Evaluate Impact" is clicked on a remediation history card, the frontend:
1. Calls `POST /api/remediation/:id/evaluate` to queue a new evaluation job
2. Opens an `EventSource` SSE connection to `/api/evaluate/:jobId/progress` to track completion
3. On SSE error → marks impact eval as "failed"

The problem: SSE fails with `ERR_INCOMPLETE_CHUNKED_ENCODING` (stream cut off during...

### Prompt 2

commit

