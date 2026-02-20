# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Fix: Show issues alongside diff when expanded

## Context

In `UnifiedFileRow`, the expanded/collapsed states use a ternary that hides issues (action bullets) when the diff is shown. Users expect to see both the issues and the diff when expanded.

## Change

**File**: `frontend/src/components/RemediationHistoryCard.tsx` (lines 631-654)

Replace the ternary with:
1. Always render action bullets when they exist
2. Additionally render the diff when expanded

```tsx
...

### Prompt 2

commit

