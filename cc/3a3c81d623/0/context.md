# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: Batch Remediation Prompts (max 10 issues per prompt)

## Context

Currently, the remediation engine sends ALL errors in one prompt and ALL suggestions in one prompt to the AI provider. With many issues, this can overwhelm the context window or produce worse results. This change chunks errors and suggestions into batches of 10, executing each batch sequentially (cumulative on the filesystem), then capturing a single diff at the end.

## Changes

### 1. Add b...

### Prompt 2

and push

