# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: Reduce evaluator prompt size and improve cache utilization

## Context

Evaluation of a repo with 26 context files produces ~170K char prompts per evaluator, totaling 2.56M chars across 17 evaluators. Two problems:

1. **SKILL.md files are sent as full content** to every evaluator (22K chars for 4 skill files + 30K for a skill-colocated AGENTS.md). Only frontmatter (name/description) is needed — enough to detect if a skill is irrelevant to the project.

2...

### Prompt 2

commit

