# Severity Scoring Rubric

When evaluating an AGENTS.md file, assign severity scores to issues using this rubric.

## Severity Scoring Scale (1-10)

**IMPORTANT**: Only report issues with severity > 5 in your JSON output.

| Score | Level | Description |
|-------|-------|-------------|
| **10** | Critical | Agent completely blocked, cannot proceed at all. Examples: No commands anywhere, file is empty/nearly empty, completely unusable |
| **9** | Critical | Severely hampers agent effectiveness across multiple areas. Examples: Missing all key sections, pervasive vagueness, critically incomplete |
| **8** | High | Major issue significantly impacting agent's ability to work. Examples: No testing commands, human-focused content dominating file, major structural issues |
| **7** | High | Important problem affecting agent performance. Examples: Vague testing guidance, no code style rules, ambiguous instructions throughout |
| **6** | Medium-High | Notable issue reducing agent efficiency. Examples: Missing project structure, some vague instructions, minor inconsistencies affecting usability |
| **5** | Medium | Issues with some impact (DO NOT REPORT) |
| **4** | Low-Medium | Small issues with minimal impact (DO NOT REPORT) |
| **3** | Low | Minor improvements (DO NOT REPORT) |
| **2** | Very Low | Nitpicks (DO NOT REPORT) |
| **1** | Minimal | Cosmetic issues only (DO NOT REPORT) |

---

## Category-Specific Guidelines

When assigning severity, consider the impact on these aspects:

### 1. Command Clarity
- **10**: No commands exist
- **9**: Commands all have placeholders or missing context
- **8**: Most commands unclear or incomplete
- **7**: Several commands vague or ambiguous
- **6**: Some commands lack context

### 2. Testing Guidance
- **10**: No testing section or mention of tests
- **9**: Testing mentioned but zero executable guidance
- **8**: Test command exists but no success criteria
- **7**: Vague test instructions without specifics
- **6**: Test guidance exists but incomplete

### 3. Content Quality & Focus
- **10**: Entirely wrong focus (all human-focused, no technical content)
- **9**: Majority human-focused with minimal agent guidance
- **8**: Significant human-focused content taking up valuable space
- **7**: Some human-focused content mixed with technical
- **6**: Minor human-focused elements present

### 4. Completeness & Balance
- **10**: File < 10 lines or essentially empty
- **9**: File < 30 lines, critically lacking content
- **8**: Missing multiple critical sections
- **7**: Missing 1-2 important sections
- **6**: Sparse content in existing sections

### 5. Language Clarity
- **10**: All instructions ambiguous or unintelligible
- **9**: Pervasive vagueness throughout
- **8**: Many vague qualifiers and ambiguous references
- **7**: Several instances of unclear language
- **6**: Some ambiguous references or vague terms

### 6. Structure & Organization
- **10**: No structure, wall of text
- **9**: Barely any organization, chaotic
- **8**: Poor structure making content hard to parse
- **7**: Inconsistent formatting throughout
- **6**: Minor organizational issues

### 7. Code Style Clarity
- **10**: No style guidance exists
- **9**: Only generic advice like "write clean code"
- **8**: Vague guidelines without specifics
- **7**: Some specific rules but incomplete
- **6**: Missing tool/linter information

### 8. Project Structure
- **10**: No mention of project organization
- **9**: Extremely vague about structure
- **8**: No directory layout provided
- **7**: Partial structure info
- **6**: Structure mentioned but not detailed

### 9. Workflow Integration
- **10**: Zero git/CI/workflow information
- **9**: No workflow guidance at all
- **8**: Workflow mentioned but no specifics
- **7**: Some workflow info but incomplete
- **6**: Minor workflow details missing

### 10. Security Awareness
- **10**: Exposed production credentials/secrets
- **9**: Multiple exposed secrets or credentials
- **8**: Security risk present (exposed API keys, passwords)
- **7**: No security guidance in security-sensitive project
- **6**: Missing security guidance where relevant

---

## Severity Assignment Strategy

1. **Start High for Critical Gaps**: If fundamental information is missing (no commands, no tests, no structure), start at 9-10

2. **Reduce for Partial Information**: If some guidance exists but is vague/incomplete, use 6-8

3. **Multiple Issues in Category**: If a category has many problems, increase severity

4. **Impact Assessment**: Consider "Can an agent actually work with this?"
   - No = severity 9-10
   - With difficulty = severity 7-8
   - With inefficiency = severity 6

5. **Context Matters**: A missing security section in a web API project = higher severity than in a CLI tool
