# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: Detect `@` file references and suppress false positive conflicts

## Context

When a repository has both `AGENTS.md` and `CLAUDE.md` in the same directory, but one contains only a file reference annotation (e.g., `@CLAUDE.md` or `@AGENTS.md`), the system currently reports a **false positive** severity-9 conflict. The `@` annotation is a convention used by coding agents that only support one file type — it points to the companion file. This is not a real c...

