# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: Filter skills sub-files from linked-doc resolution

## Context

When scanning linked documentation (files referenced via Markdown links inside AGENTS.md/CLAUDE.md), the system currently includes all linked `.md` files. However, skill directories follow a specific structure:

```
.github/skills/<skill-name>/SKILL.md        ← useful: the skill's main file
.github/skills/<skill-name>/reference/*.md  ← noise: progressive-disclosure refs
.github/skills/<skil...

### Prompt 2

commit then

