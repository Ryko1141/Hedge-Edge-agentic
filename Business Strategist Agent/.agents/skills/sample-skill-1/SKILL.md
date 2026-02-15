---
name: sample-skill-1
description: |
  A sample skill demonstrating the Agent Skills format for the ASE framework.
  Use this as a reference when creating new skills. Copilot will activate this
  skill when users ask about creating skills or need a template example.
---

# Sample Skill 1

## Objective
This is a demonstration skill showing the proper Agent Skills format. It serves as a reference for creating new skills within the ASE (Agent-Skill-Execution) framework.

## When to Use This Skill
<!-- Describe the conditions/triggers that indicate this skill should be activated -->

- When a user asks about creating a new skill
- When demonstrating the Agent Skills format
- As a template reference for new skill development

## Input Specification

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| skill_name | string | Yes | Lowercase, hyphenated name for the skill |
| description | string | Yes | Clear description of when to use the skill |

## Step-by-Step Process

1. **Create skill directory**: Create a new folder under `.agents/skills/` with your skill name (e.g., `.agents/skills/my-new-skill/`)
2. **Create SKILL.md**: Add a `SKILL.md` file with YAML frontmatter containing `name` and `description`
3. **Write instructions**: Document the objective, triggers, inputs, and step-by-step process
4. **Add resources**: Place any scripts or data files in the skill directory
5. **Link resources**: Use relative paths like `[script](./script.py)` to reference files

## Execution Scripts
<!-- Reference scripts using relative paths so Copilot can access them -->

- [example-script.py](./execution/example-script.py) - A sample script demonstrating resource inclusion

## Resources

- [example-data.json](./resources/example-data.json) - Sample data file for demonstration

## Expected Output

A properly structured skill directory containing:
```
my-skill/
  SKILL.md           # Required - skill definition
  execution/         # Optional - execution scripts
  resources/         # Optional - resources
```

## Definition of Done

- [ ] SKILL.md exists with valid YAML frontmatter
- [ ] `name` field is lowercase with hyphens (max 64 chars)
- [ ] `description` field explains when to use the skill (max 1024 chars)
- [ ] All referenced files exist and use relative paths
- [ ] Skill directory is under `.agents/skills/` or configured skill location

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Skill not detected | Missing YAML frontmatter | Add `---` delimited frontmatter with `name` and `description` |
| Resources not found | Absolute paths used | Convert to relative paths like `./script.py` |
| Skill not loading | `chat.agentSkillsLocations` not configured | Add `.agents/skills` path to VS Code settings |

## Notes

- Keep the `description` field concise but specific about **when** to use the skill
- Copilot uses progressive loading: metadata first, then instructions, then resources
- Skills are portable across VS Code, Copilot CLI, and Copilot coding agent
