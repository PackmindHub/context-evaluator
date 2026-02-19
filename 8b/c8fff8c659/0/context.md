# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: Hide Remediation Prompt Sections Behind `?debug=true`

## Context

The remediation tab currently always displays six collapsible prompt sections ("Error Fix Plan Prompt", "Error Fix Plan", "Error Fix Execution Prompt", "Suggestion Plan Prompt", "Suggestion Enrichment Plan", "Suggestion Execution Prompt"). These are debug/internal details that should only be visible when the URL contains the query parameter `?debug=true`.

## File to Modify

**`frontend/src/...

