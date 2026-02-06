# Detection Patterns Quick Reference

Use these patterns and keywords to quickly scan for issues in AGENTS.md files.

---

## Standard Prerequisites (DO NOT FLAG as Missing)

**Assume these are available if project type is clear:**
- Ruby/Bundler for Rails projects
- Node/npm/yarn for JavaScript/TypeScript projects
- Python/pip for Django/Flask projects
- Go toolchain for Go projects
- Cargo for Rust projects
- Maven/Gradle for Java projects
- Standard databases (Postgres, MySQL, Redis) - engine installation

**Only flag if:**
- Custom/proprietary tools used without explanation (`custom-builder`, `internal-cli`)
- Unusual version constraints mentioned but not verifiable ("must use Node 14.x only")
- Non-standard toolchain with zero context

---

## Tool Documentation Patterns (Context + Command Assessment)

### Acceptable - DO NOT FLAG (Severity <= 5):
- Command + Purpose: "LangGraph Studio requires local dev server running via `langgraph dev`"
- Discovery mechanism: "Docker support available via Makefile - run `make help`"
- Standard tools with clear ecosystem: "Run `npm install` to set up dependencies"

### Flag as Severity 6-7:
- Command without purpose: "Run `special-tool init`" (what does it do?)
- Purpose without command: "We use Docker for development" (how to start it?)
- Partial info: "Makefile has Docker targets" (which targets? how to discover?)

### Flag as Severity 8-10:
- Mention only, no details: "MCP servers configured" (no command, no explanation)
- Custom tool, zero context: "Use `proprietary-cli` for deployment" (what is it? where to get it?)
- Multiple tools, all missing context

**Key Rule**: Split multi-tool issues into separate problems with individual severities.

---

## Human-Focused Content Indicators
- Keywords: "welcome", "excited", "community", "join", "discord", "slack", "thank you"
- Emoji density: > 5% of lines
- Personal pronouns with welcoming context: "we're happy", "you're invited"

---

## Future Plans / Roadmap Indicators (Non-Actionable)
- Section headings: "Future Enhancements", "Roadmap", "TODO", "Coming Soon", "Planned Features", "Wishlist"
- Aspirational lists: "Add more...", "Integrate...", "Expand...", "Improve..." without implementation details
- Vague improvements: "make it faster", "add more tests", "better error handling"
- Feature requests without current development guidance

---

## Skills Extraction Opportunities (Context Window Pollution)
- **Large specialized sections**: >50-100 lines of task-specific content
- **Conditional headers**: "When working on...", "For X tasks...", "If you're doing Y..."
- **Parallel procedures**: Multiple similar sections for different SDKs/languages/domains
- **Domain-specific content**: Documentation guidelines, tutorial processes, legal review, data pipelines
- **Reference material**: Content that reads like a manual rather than quick guidance
- **Template libraries**: Extensive boilerplate examples or template collections
- **SDK-specific procedures**: Repeated testing/setup instructions for Python, JS, Go, etc.

**Severity Guidelines:**
- Severity 8-9: >200 lines of task-specific content applying to <30% of tasks
- Severity 7: 100-200 lines of specialized knowledge
- Severity 6: 50-100 lines with clear task-specific applicability

---

## Vagueness Indicators
- Qualifiers: "usually", "typically", "generally", "often", "sometimes", "might", "probably", "likely"
- Non-specific quality: "good", "clean", "proper", "correct", "appropriate", "best practices"
- Relative references: "existing style", "current approach", "similar to", "like before"

---

## Missing Commands/Actions
- Section has < 1 code block
- No executable commands (npm, python, cargo, make, etc.)
- Only descriptive text without imperatives

---

## Placeholder Issues
- Angle brackets: `<variable>`, `<placeholder>`
- Square brackets: `[value]`, `[option]`
- Curly braces: `{something}`
- Ellipsis in commands: `...`

---

## Ambiguous References
- Standalone pronouns: "it", "this", "that", "these", "those" (without clear antecedent)
- "The X" without defining which X: "the config file", "the script"
- Demonstratives without target: "above", "below", "following", "previous"

---

## Structural Issues
- Only H1 headings (single #)
- Very deep nesting (##### or ######)
- Paragraphs > 150 words
- No bullet lists where appropriate

---

## README-Style Content
- Feature lists with emoji
- "Why choose us" type language
- End-user value propositions
- Competitive positioning: "best", "fastest", "easiest"

---

## Security Red Flags
- Patterns: `sk_`, `api_key=`, `password=`, `token=`, `secret=`
- Database URLs with credentials: `://user:pass@`
- Long base64-like strings
- Email addresses with @
- Internal URLs: `.internal`, `.local`, IP addresses in examples

---

## Completeness Checks
- File length < 30 lines = too short
- File length > 1000 lines = too verbose
- Code blocks < 3 = likely missing commands
- Sections < 3 = likely incomplete

---

## Consistency Checks
- Mixed list styles: both `-` and `1.` in similar contexts
- Commands in different formats: code blocks vs inline vs plain text
- Inconsistent heading capitalization
