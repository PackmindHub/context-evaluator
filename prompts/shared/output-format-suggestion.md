# Output Format Specification - Suggestion Issues

This template defines the standard output format for suggestion evaluators (missing content or improvement opportunities).

---

## Output Format

Return a JSON array of suggestions. Each suggestion must have these fields:

```json
{
  "category": "{{CATEGORY}}",
  "impactLevel": "High",
  "problem": "short description",
  "location": {
    "file": "AGENTS.md",
    "start": 1,
    "end": 1
  },
  "impact": "why implementing this would improve agent effectiveness",
  "fix": "specific recommendation"
}
```

**Location Format:**

**CRITICAL: Extracting File Paths**
- When evaluating MULTIPLE files, look for section headers like `### File 1: path/to/AGENTS.md`
- Extract the EXACT file path from these headers (e.g., "frontend/AGENTS.md", "backend/AGENTS.md", "AGENTS.md")
- Use this extracted path in the "file" field of your location objects

**For Single-File Evaluation:**
- Location: `{"file": "AGENTS.md", "start": 1, "end": 1}`
- For missing content suggestions, use line 1 or the most relevant location
- The file path is simply "AGENTS.md" unless specified otherwise in the section header

**For Multi-File Evaluation (per-file suggestions):**
- Location: `{"file": "frontend/AGENTS.md", "start": 1, "end": 1}`
- Use the file path from the section header (e.g., `### File 1: frontend/AGENTS.md`)
- Each suggestion MUST reference the correct file where content should be added

**For Cross-File Suggestions:**
- Location: Array of locations referencing multiple files
  ```json
  "location": [
    {"file": "frontend/AGENTS.md", "start": 1, "end": 1},
    {"file": "backend/AGENTS.md", "start": 1, "end": 1}
  ],
  "affectedFiles": ["frontend/AGENTS.md", "backend/AGENTS.md"],
  "isMultiFile": true
  ```

**Line Number Guidelines:**

**⚠️ CRITICAL: How to Extract Line Numbers**

The content is provided with line numbers prefixed in this format:
```
   47 | - For any task you perform, you MUST split it into sub-tasks
```

**YOU MUST:**
1. **Read the number BEFORE the `|` character** - this is the ACTUAL line number
2. **Use these exact numbers** in your location objects (start and end fields)
3. **NEVER count lines manually or approximate** - always use the prefixed numbers
4. **NEVER use a different line number** than what appears before the `|`

**Example:**
- If you reference content at the line `   47 | some content here`
- Then your location MUST use `"start": 47, "end": 47`
- ❌ DO NOT use line 1, 22, or any other number besides 47

**Additional rules:**
- For missing content suggestions, you may use line 1 or reference the most relevant insertion point if you want to suggest where content should be added
- Line numbers are 1-indexed (first line is 1, not 0)
- If referencing existing content that spans multiple lines, use the start and end line numbers shown

---

## JSON Formatting Requirements - MANDATORY CHECKLIST

Before returning your response, verify ALL of these:

✓ **1. All keys are double-quoted**: `"category"`, `"impactLevel"`, `"problem"`
   ❌ NOT: category, 'category'

✓ **2. All string values are double-quoted**: `"Subdirectory Coverage"`, `"High"`, `"AGENTS.md"`
   ❌ NOT: Subdirectory Coverage, High, high

✓ **3. Numbers are unquoted** (if any): `"lineCount": 150`
   ❌ NOT: `"lineCount": "150"`

✓ **4. No text before opening bracket**: Start immediately with `[`
   ❌ NOT: "Here are the suggestions: [...]"

✓ **5. No text after closing bracket**: End with `]`
   ❌ NOT: "[...] These are the main suggestions."

✓ **6. Use double quotes only**: `"fix": "Add documentation"`
   ❌ NOT: `'fix': 'Add documentation'` (single quotes are JavaScript, not JSON)

✓ **7. All brackets closed**: Every `{` has `}`, every `[` has `]`
   ❌ NOT: `[{"category": "test"`

✓ **8. Each suggestion has ALL required fields**: category, impactLevel, problem, location, impact, fix
   ❌ NOT: `[{"category": "test"}]` (missing other required fields)

### Valid JSON Example

```json
[
  {
    "category": "Subdirectory Coverage",
    "impactLevel": "High",
    "problem": "Large frontend package lacks dedicated context",
    "location": {"file": "packages/frontend/AGENTS.md", "start": 1, "end": 1},
    "impact": "Agents can understand frontend-specific architecture",
    "fix": "Create packages/frontend/AGENTS.md with component patterns"
  }
]
```

### Invalid Examples - NEVER RETURN THESE

```
❌ Here are the suggestions: [{...}]      (text before JSON)
❌ [{category: "test"}]                   (unquoted key)
❌ [{"impactLevel": High}]                (unquoted string value)
❌ [{"impactLevel": 'High'}]              (single quotes)
❌ [{"category": "test"                   (incomplete - missing closing)
```

### Self-Validation (MANDATORY - Run Before Returning)

STOP. Before returning your JSON array:

1. **Copy your output** (the `[...]` you plan to return)
2. **Check it against the 8 requirements above** (all must be ✓)
3. **Verify each suggestion** has ALL required fields (category, impactLevel, problem, location, impact, fix)
4. **Mental JSON.parse() test**: Could this be parsed by JSON.parse() without errors?
   - If NO → Fix it before returning
   - If YES → Safe to return

Only return your JSON array AFTER completing this validation.

---

**Rules:**
- Only include suggestions with "Medium" or "High" impact level
- Return a MAXIMUM of 10 suggestions per evaluator - prioritize those with the highest potential impact
- If more than 10 suggestions are found, select the 10 with highest impact
- Use category: `"{{CATEGORY}}"` for all suggestions from this evaluator
- Return `[]` if no suggestions found or if content is not in English
- **CRITICAL OUTPUT REQUIREMENT**: Your response MUST start with `[` and end with `]`. NOTHING else: No explanations, no markdown code blocks, no prose, no apologies. Test: Will JSON.parse() succeed on your exact response? If NO, fix it first.

---

## Field Specifications

### 1. category (string)
The evaluator category - use the value `"{{CATEGORY}}"`

### 2. impactLevel (string)
Must be one of: "High" | "Medium" | "Low"

Impact level indicates the potential benefit to AI coding agents if the suggestion is implemented:
- **High**: Missing critical documentation that significantly hampers agent effectiveness. Implementing this would greatly improve agent performance (e.g., missing framework-specific guidelines, no architecture overview, missing key commands)
- **Medium**: Important gaps that reduce efficiency. Implementing this would noticeably improve agent work (e.g., missing testing patterns, incomplete error handling guidelines)
- **Low**: Minor improvements that would be helpful but not critical. DO NOT REPORT "Low" impact suggestions.

**Focus:** Rate the potential improvement if implemented (how much better things would be).

### 3. problem (string)
A short, clear description of what is missing or could be improved:
- Keep it concise (1-2 sentences max)
- Focus on the gap or opportunity
- Example: `"No framework-specific guidelines for React component development"`

### 4. location (object or array)
Where in the file the content should be added:
- Single file: `{"file": "AGENTS.md", "start": 1, "end": 1}`
- Cross-file: Array of location objects with file references
- For missing content, use line 1 or the most relevant insertion point

### 5. impact (string)
Brief explanation of why implementing this suggestion would improve AI agent effectiveness:
- Focus on the potential benefit to agents
- Keep it concise (1-3 sentences)
- Example: `"Agents would better understand React-specific patterns and make fewer framework-inappropriate suggestions"`

### 6. fix (string)
Specific actionable proposal for what content should be added:
- Provide concrete recommendations
- Include examples of what should be added
- Be specific and actionable
- Focus on missing content rather than corrections

---

## Key Evaluation Principles

1. **Text-Only Analysis** - Work only with the provided content
2. **Be Specific** - Identify concrete gaps and opportunities
3. **Be Actionable** - Every suggestion needs a concrete proposal
4. **Focus on Impact** - Prioritize suggestions that would most improve agent effectiveness
5. **Avoid Over-Engineering** - Don't suggest unnecessary documentation
6. **Consider Agent Perspective** - {{AGENT_PERSPECTIVE}}
