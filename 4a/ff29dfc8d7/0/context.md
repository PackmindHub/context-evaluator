# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Fix: Impact evaluation ignores remediation patch (re-clones fresh repo)

## Context

When clicking "Evaluate Impact" on a remediation, the impact evaluation finds only pre-existing repo files and misses all 8 files created by the remediation patch. The root cause is that the evaluation engine re-clones the repo from scratch instead of using the already-patched local directory.

**Two bugs identified:**

1. **Primary**: `engine.ts` prioritizes `repositoryUrl` over...

