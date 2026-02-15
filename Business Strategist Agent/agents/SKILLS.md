# Agent-Skill-Execution (ASE) Framework

## Overview

You are an AI agent operating within the **ASE Framework**, a three-layer architecture designed to maximize reliability by separating concerns:

1. **Agents** (The "Who") — Executive AI agents with specialized roles (Orchestrator, Designer, Developer, Tester, etc.). Each agent's behavior is defined by its `.agent.md` file and the directives it follows.
2. **Skills** (The "What") — Reusable capabilities stored as `SKILL.md` files. Each skill defines an objective, inputs, step-by-step process, and Definition of Done. Skills are what agents **have** — they dictate what an agent can do.
3. **Execution** (The "How") — Deterministic scripts inside each skill's `execution/` folder. One script = one job. Atomic, testable, repeatable.

This separation ensures **probabilistic reasoning** (agent decision-making) is kept distinct from **deterministic execution** (reliable, repeatable code).

---

## Directory Structure

```
ASE framework/
  Agents/              # Agent directives — what each agent is and does
    SKILLS.md          # This file — master reference for the ASE framework
  .agents/
    skills/            # Discoverable skills (VS Code Copilot reads these)
      <skill-name>/
        SKILL.md       # Required — YAML frontmatter + instructions
        execution/     # Atomic scripts for this skill
        resources/     # Static data, templates, reference files
  .env                 # Secrets — never hardcode, never commit
  .vscode/
    settings.json      # Skill discovery config
  tmp/                 # Scratch space — intermediate outputs only
```

| Folder | Purpose |
|--------|---------|
| `/Agents` | Agent-level directives and framework documentation. **NO CODE HERE.** |
| `.agents/skills/` | Skills with `SKILL.md` files. VS Code Copilot discovers these automatically. |
| `execution/` (inside each skill) | Atomic Python/TS scripts. One script = one job. Deterministic. |
| `resources/` (inside each skill) | Static files, reference data, templates. |
| `/tmp` | Scratchpad for temporary files during operation. Keep clean. |
| `.env` | API keys, passwords, secrets. Never committed. |

---

## The ASE Hierarchy

```
Agent (Who)
  └── has Skills (What)
        └── each Skill has Execution scripts (How)
```

**Example:**
```
Designer Agent (Designer.agent.md)
  └── component-discovery (skill)
        ├── SKILL.md → objective, inputs, steps, Definition of Done
        └── execution/
              └── fetch_components.py → deterministic script
```

An Agent's capabilities are defined entirely by its Skills. To give an agent a new capability, create a new Skill.

---

## Your Operating Protocol

### 1. Reading Tasks
- When given a task, **first check which Agent owns it** (see Orchestrator routing)
- Check if the Agent **has a Skill** for this task
- If no skill exists, **create one before proceeding**
- Always understand the full workflow before executing

### 2. Execution Rules
- **Never hardcode API keys** — always reference the `.env` file
- **One script, one job** — keep execution scripts atomic
- **Test autonomously** — run and loop until successful
- **Deterministic output** — same input must always yield same output

### 3. Self-Annealing Protocol (Error Handling)

When an error occurs, follow this loop:

```
DIAGNOSE → FIX → UPDATE → RETRY
```

1. **Diagnose**: Identify the root cause of the failure
2. **Fix**: Update the execution script to resolve the issue
3. **Update**: **Crucial step.** Modify the Skill's `SKILL.md` or execution script to prevent recurrence
4. **Retry**: Re-run the workflow to confirm the fix

**Do not stop at the first error.** Loop repeatedly until the task succeeds or you've exhausted all reasonable approaches.

### 4. Building New Skills

When asked to build something new:

1. Determine which **Agent** will own this capability
2. Create a **Skill** folder in `.agents/skills/<skill-name>/`
3. Write a `SKILL.md` defining:
   - Objective
   - When to Use
   - Input Specification
   - Step-by-Step Process
   - Definition of Done
   - Error Handling
4. Create corresponding **Execution scripts** in the skill's `execution/` folder
5. Test the workflow end-to-end

### 5. Optimization Rules

- **10x Rule**: Only optimize a working skill if it yields at least a 10x improvement
- **Stability First**: Avoid introducing instability for marginal gains
- **Human-in-the-Loop**: Flag tasks with high sensitivity for human review before execution (e.g., mass emails, financial transactions)

---

## Skill Discovery (VS Code Integration)

Skills are discovered by VS Code Copilot from the paths configured in:

**`.vscode/settings.json`:**
```json
{
  "chat.agentSkillsLocations": {
    ".agents/skills": true
  }
}
```

**SKILL.md requirements:**
- YAML frontmatter between `---` delimiters with `name` (lowercase-hyphenated, max 64 chars) and `description` (max 1024 chars)
- All linked files use **relative paths** (e.g., `[script](./execution/script.py)`)
- Sections: Objective, When to Use, Input Spec, Steps, Execution Scripts, Resources, Definition of Done, Error Handling

---

## Reminders

- **Agents** are the executives — they plan and decide
- **Skills** are what agents have — they define capabilities
- **Execution** is what skills run — deterministic, atomic scripts
- The human is the **Manager** — provides high-level direction and steering
- Keep `/tmp` clean — it's for intermediate outputs only
- Document everything in Skills for reproducibility
