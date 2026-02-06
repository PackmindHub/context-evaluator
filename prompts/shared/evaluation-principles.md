# Evaluation Principles

Follow these principles when evaluating AGENTS.md files:

## 1. Text-Only Analysis
- Work ONLY with the content provided in the AGENTS.md file
- Do NOT assume knowledge about the actual repository or codebase
- Do NOT verify if mentioned files/commands actually exist
- Focus on intrinsic quality signals visible in the text

## 2. Be Specific & Quote-Based
- Quote exact sections when identifying issues
- Point to specific line numbers or section headers
- Use actual text from the file in your examples
- Don't make general criticisms without evidence

## 3. Be Actionable
- Every criticism must include how to fix it
- Provide concrete "before/after" examples
- Suggest specific wording, structure, or additions
- Prioritize fixes by impact on agent effectiveness

## 4. Consider Agent Perspective
- Evaluate from what an AI agent needs to work effectively
- Agents need deterministic, executable instructions
- Agents cannot infer context or "figure things out"
- Agents parse structured text better than prose

## 5. Balance Criticism with Recognition
- Acknowledge good patterns when present
- Don't penalize reasonable approaches that differ from examples
- Consider project complexity in completeness assessment
- Recognize that different project types need different guidance

## 6. Context-Aware Severity
- **Critical**: Agent literally cannot proceed (no commands, all vague)
- **High**: Agent will struggle significantly (incomplete/ambiguous guidance)
- **Medium**: Agent can work but inefficiently (minor gaps/inconsistencies)
- **Low**: Minor improvements for polish (formatting preferences)

## 7. Avoid False Positives
- Don't penalize unusual but valid approaches
- Project-specific terms may be necessary (just note if undefined)
- Some verbosity may be warranted for complex projects
- Don't require sections that may not apply to all projects

## 8. Apply Criteria Consistently
- Use the same standards throughout the document
- If you flag a pattern once, flag all instances
- Score categories independently but consistently
- Overall score should reflect weighted category performance

## 9. Split Multi-Part Issues Appropriately
- **DO NOT lump multiple distinct problems into one issue** with inflated severity
- If a file has 3 separate tool documentation gaps, create 3 separate issues
- Each issue should have its own severity based on that specific problem
- Example of proper splitting:
  - Issue 1 (Severity 7): MCP servers mentioned with no usage commands
  - Issue 2 (Severity 6): Docker/Makefile mentioned without target list
  - Issue 3 (Severity 4): LangGraph dev command provided with inline context (DO NOT REPORT)
- **BAD**: Combining all three into one "Command Clarity" issue with severity 8
- **GOOD**: Separate issues with appropriate individual severities, omitting severity <= 5

## 10. Focus on Clarity Signals
Since you only have the text, prioritize detecting:
- **Specificity**: Concrete commands vs. vague instructions
- **Completeness**: Presence of key sections (setup, test, style)
- **Consistency**: Uniform formatting and non-contradictory rules
- **Structure**: Logical organization and clear sections
- **Actionability**: Executable commands with clear outcomes
- **Clarity**: Unambiguous language and clear references
- **Context-with-Command**: Tools mentioned with both command AND purpose are acceptable

## 11. Quantitative Metrics to Track
- Line count (too short < 30, too long > 1000)
- Code block count (too few < 3 suggests missing commands)
- Section count (< 3 suggests incompleteness)
- Command count (number of executable examples)
- Vague qualifier count ("usually", "typically", "might")
- Placeholder count (<>, [], {})
