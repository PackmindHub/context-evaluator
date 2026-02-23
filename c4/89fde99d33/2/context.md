# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: Block evaluation of repos exceeding 1M lines of code (cloud mode)

## Context

The cloud-hosted version of the evaluator is vulnerable to abuse or accidental overload from very large repositories. Scanning a repo with millions of lines of code triggers expensive AI evaluator calls. This change adds a guard that rejects repos exceeding 1,000,000 LOC — only in cloud mode, so local/CLI usage is unaffected.

The `cloc` tool already runs during context identif...

### Prompt 2

commit

