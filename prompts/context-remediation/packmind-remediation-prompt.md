# Remediation Prompt

Rendering modes: Claude Code, AGENTS.md, GitHub Copilot.

## Decision: Standard vs Skill

**Standard** — A short, declarative rule file always loaded into context. Defines constraints and conventions the agent must follow at all times.

**Skill** — A folder with instructions, scripts, and resources loaded on-demand via progressive disclosure. Provides procedural knowledge activated when a task matches its description.

### Decision Criteria

Ask these four questions to decide whether a remediation should produce a standard or a skill:

1. **Must the agent always know this?** If yes → standard. If it is only relevant during a specific task → skill.
2. **Is it a constraint or a capability?** Constraints and guardrails → standard. Capabilities and workflows → skill.
3. **Does it need bundled resources?** If it requires scripts, templates, or assets → skill. If a single file of rules suffices → standard.
4. **Is it short and declarative?** Bullet-point rules → standard. Procedural paragraphs with sequenced steps → skill.

### Boundary Rule

Extract **rules** into a standard and **procedures** into a skill. A single remediation topic can produce both. When in doubt, prefer a standard.

## Standard Creation

### Generic Rules

- Standards must contain a one sentence-summary describing the purpose of the rules, their intent, their rationale, as a short introduction.
- Rules must be a list of bullet-points rules, starting with a verb.
- Use scoped glob patterns when relevant based on the suggestions.

### Claude Code

Create file at `.claude/rules/<standard-slug>.md`:

```md
---
name: Domain Events
alwaysApply: true
description: Use when creating domain events, emitting events from use cases, or implementing listeners.
---

## Standard: Domain Events

Use when creating domain events, emitting events from use cases, or implementing listeners. :

- Define event classes in `packages/types/src/{domain}/events/` with an `index.ts` barrel file
- Define payload as a separate `{EventName}Payload` interface
- Extend `PackmindListener<TAdapter>` and implement `registerHandlers()` to subscribe to events
- Extend `UserEvent` for user-triggered actions, `SystemEvent` for background/automated processes
- Include `userId` and `organizationId` in UserEvent payloads; include `organizationId` in SystemEvent payloads when applicable
- Suffix event class names with `Event` (e.g., `StandardUpdatedEvent`)
- Use `eventEmitterService.emit(new MyEvent(payload))` to emit events
- Use `static override readonly eventName` with `domain.entity.action` pattern
- Use `this.subscribe(EventClass, this.handlerMethod)` to register handlers
- Use arrow functions for handlers to preserve `this` binding
```

### AGENTS.md

Append a section specific to the coding standards and guidelines in AGENTS.md, at the location where it is most relevant:

```md
## Standard: Testing good practices

Standardize unit test structure and naming in TypeScript/TSX test files using verb-first descriptions, Arrange-Act-Assert flow without comments, nested describe('when...') context blocks, and single-expect test cases to improve readability, maintainability, and debugging. :
* Follow  'Arrange, Act, Assert' pattern
* Move 'when' contextual clauses from `it()` into nested `describe('when...')` blocks
* Remove explicit 'Arrange, Act, Assert' comments from tests and structure them so the setup, execution, and verification phases are clear without redundant labels
* Use assertive, verb-first unit test names instead of starting with 'should'
* Use one expect per test case for better clarity and easier debugging; group related tests in describe blocks with shared setup in beforeEach
```

### GitHub Copilot

Create file at `.github/instructions/<standard-slug>.md`:

```md
---
applyTo: '**/*.ts'
---
## Standard: Typescript code standards

Adopt TypeScript code standards by prefixing interfaces with "I" and abstract classes with "Abstract" while choosing "Type" for plain objects and "Interface" for implementations to enhance clarity and maintainability when writing .ts files. :
* Prefix abstract classes with Abstract
* Prefix interfaces with I
* Use Type for plain objects, Interface when implmentation is required
```

## Skill Creation

For AGENTS.md targets, skills are placed in the `.agent/skills/` directory.

For skill creation, follow the complete process in [packmind-remediation-skill-creation.md](packmind-remediation-skill-creation.md).
