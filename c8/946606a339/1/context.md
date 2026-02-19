# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: Fix Remediation Direction for CLAUDE.md/AGENTS.md Colocated Pairs

## Context

When both `AGENTS.md` and `CLAUDE.md` coexist in a directory, the system rule is:
- **AGENTS.md** = single source of truth (canonical)
- **CLAUDE.md** = pointer only, containing solely `@AGENTS.md`

The bug: a remediation plan chose the opposite direction — making CLAUDE.md canonical and having AGENTS.md redirect to it. This caused two problems:
1. Wrong canonical file (CLAUDE....

