# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Update Remediation Tab Labels

## Context
The "Target agent" and "AI Provider" labels in the remediation tab need clearer descriptions to help users understand what each selector does.

## Changes

**File**: `frontend/src/components/RemediateTab.tsx`

1. **Line 733**: Change `Target agent` → `Target for markdown file rendering`
2. **Line 761**: Change `AI Provider` → `Pick the AI agent to execute the remediation`
3. **Line 909**: Change `Target agent` → `Ta...

