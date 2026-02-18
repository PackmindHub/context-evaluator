# Skill Creation Process

## Skill Placement by Target Agent

| Target Agent   | Skill Directory               |
|----------------|-------------------------------|
| AGENTS.md      | `.agents/skills/<skill-name>/` |
| Claude Code    | `.claude/skills/<skill-name>/` |
| GitHub Copilot | `.github/skills/<skill-name>/` |

## Skill Structure

A skill is a single `SKILL.md` file inside a named folder. Unlike standards (which are bullet-point rules), skills can contain additional documentation about project structure, context, and resources to give the agent richer procedural knowledge:

```
<skill-dir>/<skill-name>/
└── SKILL.md
```

### SKILL.md Format

```md
---
name: <Skill Name>
description: <When the agent should activate this skill. Be specific. Use third-person voice.>
---

## Purpose

<One or two sentences explaining what the skill does and why it exists.>

## When to Use

<Describe the triggers: what task, file type, or user request should activate this skill.>

## Instructions

<Step-by-step procedural instructions written in imperative/infinitive form (verb-first, not second person). Keep concise, under 5k words.>
```

## Progressive Disclosure

1. **Metadata (name + description)** — Always in context (~100 words). Determines when the skill activates.
2. **SKILL.md body** — Loaded when skill triggers (<5k words).

## Metadata Quality

The `name` and `description` in YAML frontmatter determine when the agent activates the skill. Be specific about what the skill does and when to use it. Use third-person voice (e.g. "This skill should be used when..." instead of "Use this skill when...").

## Writing Style

Write the entire skill using **imperative/infinitive form** (verb-first instructions), not second person. Use objective, instructional language (e.g., "To accomplish X, do Y" rather than "You should do X" or "If you need to do X").

## Creation Steps

1. **Understand usage** — Identify concrete examples of how the skill will be used. Clarify functionality, usage patterns, and triggers.
2. **Write SKILL.md** — Answer: What is the purpose? When should it activate? What are the step-by-step instructions? Focus on procedural knowledge that would be beneficial and non-obvious to another agent instance.
3. **Iterate** — Test the skill on real tasks, notice struggles or inefficiencies, and refine the instructions.
