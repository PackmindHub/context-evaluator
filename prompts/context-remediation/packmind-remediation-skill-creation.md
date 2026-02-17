# Skill Creation Process

## Skill Anatomy

Every skill consists of a required SKILL.md file and optional bundled resources:

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter metadata (required)
│   │   ├── name: (required)
│   │   └── description: (required)
│   └── Markdown instructions (required)
└── Bundled Resources (optional)
    ├── scripts/          - Executable code (Python/Bash/etc.)
    ├── references/       - Documentation intended to be loaded into context as needed
    └── assets/           - Files used in output (templates, icons, fonts, etc.)
```

- **Scripts** — Executable code for tasks requiring deterministic reliability or repeatedly rewritten logic.
- **References** — Documentation loaded as needed into context. Keep SKILL.md lean; move detailed schemas, API docs, and domain knowledge here.
- **Assets** — Files used in output (templates, images, boilerplate) that Claude uses without loading into context.

## Progressive Disclosure

1. **Metadata (name + description)** — Always in context (~100 words)
2. **SKILL.md body** — When skill triggers (<5k words)
3. **Bundled resources** — As needed by Claude (unlimited; scripts can execute without reading into context)

## Metadata Quality

The `name` and `description` in YAML frontmatter determine when Claude will use the skill. Be specific about what the skill does and when to use it. Use the third-person (e.g. "This skill should be used when..." instead of "Use this skill when...").

## Step 1: Understand Usage

Understand concrete examples of how the skill will be used. This understanding can come from direct user examples or generated examples validated with user feedback. Ask targeted questions about functionality, usage patterns, and triggers.

Conclude when there is a clear sense of the functionality the skill should support.

## Step 2: Plan Resources

Analyze each concrete example by:

1. Considering how to execute on the example from scratch
2. Identifying what scripts, references, and assets would be helpful when executing these workflows repeatedly

Create a list of the reusable resources to include: scripts, references, and assets.

## Step 3: Create the Skill

The skill is being created for another instance of Claude to use. Focus on information that would be beneficial and non-obvious. Consider what procedural knowledge, domain-specific details, or reusable assets would help another Claude instance execute tasks more effectively.

### Start with Resources

Implement the reusable resources identified in Step 2: `scripts/`, `references/`, and `assets/` files. This may require user input (e.g., brand assets, documentation, templates). Delete any example files and directories not needed for the skill.

### Update SKILL.md

**Writing Style:** Write the entire skill using **imperative/infinitive form** (verb-first instructions), not second person. Use objective, instructional language (e.g., "To accomplish X, do Y" rather than "You should do X" or "If you need to do X").

Answer these questions in SKILL.md:

1. What is the purpose of the skill, in a few sentences?
2. When should the skill be used?
3. In practice, how should Claude use the skill? All reusable skill contents must be referenced so that Claude knows how to use them.

## Step 4: Iterate

After testing the skill on real tasks, notice struggles or inefficiencies. Identify how SKILL.md or bundled resources should be updated. Implement changes and test again.
