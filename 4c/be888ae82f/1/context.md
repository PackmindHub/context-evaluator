# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: Improve Remediation Prompt Quality

## Context

The remediation prompt generator (`src/shared/remediation/prompt-generator.ts`) produces prompts sent to AI agents to fix/enrich documentation. Several issues waste tokens and reduce prompt clarity:
- Evaluator recommendations contain "You can use Packmind to achieve this" boilerplate that leaks into prompts
- When multiple gaps reference the same snippet, it's repeated verbatim (7x duplication observed in rea...

### Prompt 2

commit

