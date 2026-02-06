# Multi-File Evaluation Mode

When evaluating multiple AGENTS.md files together, additional cross-file analysis is required.

---

## CRITICAL: File Reference Requirements

When you identify an issue, you MUST specify which file it's in:

1. **Extract file path from section headers:**
   - Headers look like: "FILE 1: packages/ui/AGENTS.md"
   - Use the path exactly as shown: "packages/ui/AGENTS.md"

2. **Include file in EVERY location object:**
   ```json
   {
     "location": {
       "file": "packages/ui/AGENTS.md",  // ← MANDATORY
       "start": 10,
       "end": 15
     }
   }
   ```

3. **For cross-file issues**, include all affected files:
   ```json
   {
     "location": [
       {"file": "AGENTS.md", "start": 5, "end": 10},
       {"file": "packages/ui/AGENTS.md", "start": 20, "end": 25}
     ],
     "affectedFiles": ["AGENTS.md", "packages/ui/AGENTS.md"],
     "isMultiFile": true
   }
   ```

4. **Never omit the file field** - it's mandatory for multi-file evaluation

---

## File Separators in the Input

Files are separated by prominent dividers you cannot miss:

```
================================================================================
FILE 1: path/to/file
================================================================================
[content with line numbers]
================================================================================
END OF FILE 1: path/to/file
================================================================================
```

**Pay attention to:**
- File boundaries marked by `================================================================================`
- File path appears in both start and end separators
- Periodic reminders throughout long files: `--- Still in file: path/to/file ---`

These separators make file boundaries unmistakable. Use them to track which file you're evaluating.

---

## Multi-File Context

You will receive multiple AGENTS.md files from the same repository. Each file is clearly separated:
- File boundaries marked with 80-character `=` separators
- File path appears in header: `FILE 1: path/to/AGENTS.md`
- File path repeats in footer: `END OF FILE 1: path/to/AGENTS.md`
- Long files include periodic reminders: `--- Still in file: path ---`

---

## Cross-File Detection Patterns

In addition to per-file issues, detect these cross-file patterns:

### Intentional Duplication: AGENTS.md and CLAUDE.md Pairs

**IMPORTANT EXEMPTION**: When AGENTS.md and CLAUDE.md exist in the same directory with identical or near-identical content, this is INTENTIONAL and should NOT be flagged as duplication.

**Why This Is Acceptable:**
- AGENTS.md and CLAUDE.md are two different standards for AI coding agents
- Most AI agents only support one format (Claude Code reads CLAUDE.md, other tools read AGENTS.md)
- Mirroring content ensures consistent behavior regardless of which AI agent is used
- This is a deliberate compatibility strategy, not a maintenance oversight

**DO NOT REPORT:**
- Identical content in AGENTS.md and CLAUDE.md in the same directory
- Near-identical content (same instructions with minor formatting differences)
- Colocated files that serve as mirrors for different AI agent compatibility

**DO REPORT (still applicable):**
- Duplication between parent/child files (e.g., root AGENTS.md and packages/ui/AGENTS.md)
- Duplication between files in different subdirectories
- Inconsistencies between AGENTS.md and CLAUDE.md that could cause different agent behaviors

---

### Duplicate Content Across Files

**Detection Signals:**
- Same or very similar instructions appearing in multiple files
- Copy-pasted sections (testing, setup, code style)
- Redundant command documentation
- Repeated explanations of project-wide conventions

**Why It's Bad:** Duplicated content creates maintenance burden and risks inconsistencies when one copy is updated but others aren't.

### Inconsistent Guidance Between Files

**Detection Signals:**
- Different test commands for the same project
- Conflicting code style rules
- Contradictory git workflow instructions
- Mismatched build/setup procedures
- Different terminology for the same concepts

**Why It's Bad:** Agents working across different parts of the project will receive conflicting instructions.

### Missing Parent/Child Relationships

**Detection Signals:**
- Child file (e.g., `frontend/AGENTS.md`) doesn't reference root file
- No indication of inheritance or override relationships
- Unclear which instructions take precedence
- Component files duplicating root-level guidance

**Why It's Bad:** Agents don't know if component-specific files supplement or replace root instructions.

### Consolidation Opportunities

**Detection Signals:**
- Small files (< 50 lines) that could be merged
- Files with 80%+ duplicate content
- Files that only add 1-2 specifics to common guidance
- Component files that don't add meaningful project-specific context

**Why It's Bad:** Too many files increases cognitive load; consolidation improves maintainability.

---

## Output Format for Multi-File Issues

### Per-File Issues (within a single file)

**CRITICAL:** You MUST include the `file` field in the location object:

```json
{
  "category": "string",
  "severity": 6-10,
  "problem": "short description",
  "location": {
    "file": "packages/ui/AGENTS.md",  // ← MANDATORY - extract from FILE header
    "start": 10,
    "end": 15
  },
  "impact": "why this affects agents",
  "fix": "specific recommendation"
}
```

### Cross-File Issues (spanning multiple files)

For issues that span multiple files, use this enhanced format:

```json
{
  "category": "string",
  "severity": 6-10,
  "problem": "short description",
  "location": [
    {"file": "AGENTS.md", "start": 5, "end": 10},
    {"file": "frontend/AGENTS.md", "start": 20, "end": 25}
  ],
  "affectedFiles": ["AGENTS.md", "frontend/AGENTS.md"],
  "impact": "why this affects agents",
  "fix": "specific recommendation",
  "isMultiFile": true
}
```

**Important:**
- For per-file issues, ALWAYS include `file` in the location object
- For cross-file issues, ALWAYS include `affectedFiles` array and `isMultiFile: true`
- Extract the exact file path from the FILE header (e.g., "FILE 1: packages/ui/AGENTS.md")
- Never omit the file field - it's mandatory for accurate file attribution

---

## Severity Guidelines for Cross-File Issues

| Score | Description |
|-------|-------------|
| **9-10** | Critical inconsistency that will cause agent confusion (contradictory commands) |
| **8** | Significant duplication or inconsistency across files |
| **7** | Notable cross-file issues that reduce clarity |
| **6** | Minor cross-file improvements possible |
| **5 and below** | DO NOT REPORT |

---

## Evaluation Strategy

1. **First Pass:** Evaluate each file individually for category-specific issues
2. **Second Pass:** Compare files to detect cross-file patterns
3. **Output:** Combined array with both per-file and cross-file issues
