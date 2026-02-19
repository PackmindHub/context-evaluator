# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: Pass original evaluators to impact evaluation

## Context

When clicking "Evaluate Impact" on a remediation, the system clones the repo, applies the patch, and runs a new evaluation. However, it submits the job **without any evaluation options** — meaning it runs the default set of evaluators (all 17) instead of matching the evaluators that ran in the original evaluation. If the original evaluation used a subset (e.g., only "errors" filter or specific sel...

### Prompt 2

commit

