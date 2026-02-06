# Output Format Specification - Error Issues

This template defines the standard output format for error evaluators (issues with existing content that need fixing).

---

## Output Format

Return a JSON array of issues. Each issue must have these fields:

```json
{
  "category": "{{CATEGORY}}",
  "severity": 6-10,
  "problem": "short description",
  "location": {
    "file": "AGENTS.md",
    "start": 10,
    "end": 11
  },
  "impact": "why this affects agents",
  "fix": "specific recommendation"
}
```

**Location Format:**

**⚠️ CRITICAL: File Paths MUST Be Full Relative Paths**

When reporting issues, the `"file"` field in location objects MUST contain the FULL relative path of the file, not just the filename.

**Why This Matters:**
- When evaluating MULTIPLE files (e.g., `AGENTS.md` and `packages/ui/AGENTS.md`), using only the filename creates ambiguity
- The system uses file paths to extract the correct content and display snippets
- Using basename-only paths (e.g., just `"AGENTS.md"`) may cause content from the WRONG file to be displayed

**How to Get the Correct Path:**
- Look for section headers like: `### File 1: path/to/AGENTS.md` or `FILE: packages/ui/AGENTS.md`
- Extract the EXACT full path shown in these headers
- Use that path in the "file" field of your location objects

**Examples:**

✅ **CORRECT** - Full relative paths:
```json
{"file": "AGENTS.md", "start": 10, "end": 11}
{"file": "packages/ui/AGENTS.md", "start": 5, "end": 8}
{"file": "frontend/docs/AGENTS.md", "start": 15, "end": 20}
```

❌ **INCORRECT** - Basename only (will cause content extraction failures):
```json
{"file": "AGENTS.md", "start": 10, "end": 11}  // Ambiguous if multiple AGENTS.md exist!
```

**For Single-File Evaluation:**
- Location: `{"file": "AGENTS.md", "start": 10, "end": 11}`
- Use the file path exactly as shown in the section headers

**For Multi-File Evaluation (per-file issues):**
- Location: `{"file": "frontend/AGENTS.md", "start": 10, "end": 15}`
- Location: `{"file": "backend/AGENTS.md", "start": 8, "end": 12}`
- Each issue MUST reference the correct file where the problem exists using the FULL path
- Multiple files may be evaluated; use the appropriate full path for each issue

**For Cross-File Issues:**
- Location: Array of locations referencing multiple files
  ```json
  "location": [
    {"file": "frontend/AGENTS.md", "start": 10, "end": 15},
    {"file": "backend/AGENTS.md", "start": 8, "end": 12}
  ],
  "affectedFiles": ["frontend/AGENTS.md", "backend/AGENTS.md"],
  "isMultiFile": true
  ```
- Use the FULL path for each file reference

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
- If you find an issue at the line `   47 | some content here`
- Then your location MUST use `"start": 47, "end": 47`
- ❌ DO NOT use line 1, 22, or any other number besides 47

**Additional rules:**
- Use the same line number for start and end if issue is on a single line
- Line numbers are 1-indexed (first line is 1, not 0)
- If an issue spans multiple lines, use the start line number and end line number shown

---

## JSON Formatting Requirements - MANDATORY CHECKLIST

Before returning your response, verify ALL of these:

✓ **1. All keys are double-quoted**: `"category"`, `"severity"`, `"problem"`
   ❌ NOT: category, 'category'

✓ **2. All string values are double-quoted**: `"Content Quality"`, `"AGENTS.md"`
   ❌ NOT: Content Quality, 'high', high

✓ **3. Numbers are unquoted**: `"severity": 8`
   ❌ NOT: `"severity": "8"`

✓ **4. No text before opening bracket**: Start immediately with `[`
   ❌ NOT: "Here are the issues: [...]"

✓ **5. No text after closing bracket**: End with `]`
   ❌ NOT: "[...] These are the main issues."

✓ **6. Use double quotes only**: `"fix": "Add examples"`
   ❌ NOT: `'fix': 'Add examples'` (single quotes are JavaScript, not JSON)

✓ **7. All brackets closed**: Every `{` has `}`, every `[` has `]`
   ❌ NOT: `[{"category": "test"`

✓ **8. Each issue has ALL required fields**: category, severity, problem, location, impact, fix
   ❌ NOT: `[{"category": "test"}]` (missing other required fields)

### Valid JSON Example

```json
[
  {
    "category": "Content Quality & Focus",
    "severity": 8,
    "problem": "File lacks executable commands",
    "location": {"file": "AGENTS.md", "start": 1, "end": 50},
    "impact": "Agents cannot perform actions without commands",
    "fix": "Add command examples with expected outputs"
  }
]
```

### Invalid Examples - NEVER RETURN THESE

```
❌ Here are the issues: [{...}]           (text before JSON)
❌ [{category: "test"}]                   (unquoted key)
❌ [{"severity": high}]                   (unquoted string value)
❌ [{"severity": "8"}]                    (number as string)
❌ [{"problem": 'test'}]                  (single quotes)
❌ [{"category": "test"                   (incomplete - missing closing)
```

### Self-Validation (MANDATORY - Run Before Returning)

STOP. Before returning your JSON array:

1. **Copy your output** (the `[...]` you plan to return)
2. **Check it against the 8 requirements above** (all must be ✓)
3. **Verify each issue** has ALL required fields (category, severity, problem, location, impact, fix)
4. **Mental JSON.parse() test**: Could this be parsed by JSON.parse() without errors?
   - If NO → Fix it before returning
   - If YES → Safe to return

Only return your JSON array AFTER completing this validation.

---

**Rules:**
- Only include issues with severity > 5
- Return a MAXIMUM of 10 issues per evaluator - prioritize the most severe and impactful issues
- If more than 10 issues are found, select the 10 with highest severity/impact
- Use category: `"{{CATEGORY}}"` for all issues from this evaluator
- Return `[]` if no issues found or if content is not in English
- **CRITICAL OUTPUT REQUIREMENT**: Your response MUST start with `[` and end with `]`. NOTHING else: No explanations, no markdown code blocks, no prose, no apologies. Test: Will JSON.parse() succeed on your exact response? If NO, fix it first.

---

## Field Specifications

### 1. category (string)
The evaluator category - use the value `"{{CATEGORY}}"`

### 2. severity (number)
Integer from 6-10 indicating the severity of the error:
- **10**: Critical - Agent cannot proceed (no commands, completely unusable)
- **9**: Critical - Severely hampers agent effectiveness
- **8**: High - Major issues that significantly impact agent work
- **7**: High - Important problems affecting agent performance
- **6**: Medium-High - Notable issues reducing agent efficiency
- **5 and below**: DO NOT REPORT

**Focus:** Rate the severity of the problem itself (how broken/wrong the current state is).

### 3. problem (string)
A short, clear description of what the issue is:
- Keep it concise (1-2 sentences max)
- Focus on what is wrong, not why or how to fix it
- Example: `"No executable commands provided anywhere in the file"`

### 4. location (object or array)
Where in the file the issue was found:
- Single file: `{"file": "AGENTS.md", "start": 10, "end": 15}`
- Cross-file: Array of location objects with file references
- Always include line numbers (start and end)

### 5. impact (string)
Brief explanation of why this error is problematic for AI agents:
- Focus on the effect on agent effectiveness
- Keep it concise (1-3 sentences)
- Example: `"Agents cannot perform any actions without concrete commands"`

### 6. fix (string)
Specific actionable proposal to improve the content:
- Provide concrete recommendations
- Include examples of what should be added/changed
- Be specific and actionable

---

## Key Evaluation Principles

1. **Text-Only Analysis** - Work only with the provided content
2. **Be Specific & Quote-Based** - Cite exact locations and text
3. **Be Actionable** - Every issue needs a concrete fix
4. **Split Multi-Part Issues** - Don't lump problems together
5. **Avoid False Positives** - Don't penalize valid approaches
6. **Consider Agent Perspective** - {{AGENT_PERSPECTIVE}}
