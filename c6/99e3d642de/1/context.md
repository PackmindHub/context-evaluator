# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: Add nesting guidance to skill Instructions template

## Context

Generated SKILL.md files have flat bullet lists in the `## Instructions` section, even when steps logically contain sub-steps (e.g., "Expect script X to:" followed by its behaviors). The AI has no guidance to use indented sub-bullets, so it defaults to flat lists. This hurts readability.

## Changes

### 1. Update skill creation prompt template
**File**: `prompts/context-remediation/packmind-r...

### Prompt 2

commit

