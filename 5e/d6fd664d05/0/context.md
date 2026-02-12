# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Fix: Frontend flooding backend with remediation API requests

## Context

The frontend sends dozens of identical `GET /api/remediation/for-evaluation/{id}` requests per second (~50+ within a single second). This happens because `useEvaluationApi()` returns a **new object on every render**, and `RemediateTab.tsx` uses that object in a `useEffect` dependency array — causing the effect (which fetches remediation status) to re-run on every render in an infinite loo...

### Prompt 2

commit this

