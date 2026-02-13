# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: Clear issue selection basket after remediation

## Context

After a remediation completes, the top bar still shows "X issues selected" with Clear/Remediate buttons (the `SelectionSummaryBar`). This is confusing because the remediation has already been executed for those issues. The selection basket should be automatically emptied when a remediation runs successfully.

## Current behavior

1. User selects issues → `selectedIssueKeys` state + DB persistence...

