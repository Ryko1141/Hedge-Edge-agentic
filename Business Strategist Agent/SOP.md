User Guide: Operating the ASE (Agent-Skill-Execution) Framework in VS Code

1. Core Philosophy


This workspace relies on a separation of concerns to maximize reliability. You do not write code manually; you act as the "Manager" providing high-level instructions, while AI Agents act as executives that plan and delegate tasks.

Agents (The "Who"): Executive AI agents defined by .agent.md files. Each agent has specialized responsibilities (Orchestrator, Designer, Developer, Tester, etc.).

Skills (The "What"): stored in .agents/skills/. Each skill is a reusable capability with a SKILL.md that defines objectives, inputs, steps, and a Definition of Done. Skills are what agents HAVE — they dictate what an agent can do.

Execution (The "How"): stored in execution/ inside each skill folder. Deterministic scripts that perform specific atomic tasks (e.g., API calls, file manipulation). One script = one job.


2. Workspace Initialization


Before beginning work, ensure the agents are aligned with the framework.

1. Agent Discovery: VS Code Copilot discovers .agent.md files from the prompts folder. These define each agent's role, routing rules, and operating protocol.

2. Skill Discovery: Skills are discovered from .agents/skills/ as configured in .vscode/settings.json. Each skill has a SKILL.md with YAML frontmatter (name + description) that Copilot reads automatically.

3. Environment Variables: Store all API keys (OpenAI, Anthropic, etc.) in the .env file. Never hardcode credentials into execution scripts or skill definitions.


3. The ASE Hierarchy


```
Agent (Who)
  └── has Skills (What)
        └── each Skill has Execution scripts (How)
```

Example:
  Designer Agent (Designer.agent.md)
    └── component-discovery (skill)
          ├── SKILL.md → objective, inputs, steps, Definition of Done
          └── execution/
                └── fetch_components.py → deterministic script

To give an agent a new capability, create a new Skill. To automate a capability, add Execution scripts to the skill.


4. Workflow: Building vs. Using


There is a distinct difference between building a skill and using one. You will spend time building first, then transition to using.

Phase A: Building a Skill

You do not need to know how to code. You simply need to explain what you want.
• Input Method: Drag existing company SOPs (PDFs, Docs) into the workspace or write a list of bullet points describing the task.
• The Command: Ask the agent: "Turn this into a Skill and build the necessary Execution scripts."
• Review: The agent will create a SKILL.md in .agents/skills/<skill-name>/ and Python scripts in the skill's execution/ folder.

    ◦ SKILL.md must contain no code. It defines objectives, inputs, steps, and the "Definition of Done".
    ◦ Execution scripts must be atomic (do one thing well) and deterministic.


Phase B: Using a Skill

Once built, the IDE becomes a command center where you trigger actions via text.

• Triggering: You do not need to memorize file names. Simply ask natural language commands like "Run the lead scraper" or "Generate a proposal for [Client Name]".
• Providing Context: To reduce errors, be specific with inputs.

    ◦ Bad: "Get me some leads."
    ◦ Good: "Scrape 200 HVAC companies in Texas, verify emails, and output to a Google Sheet."

• Voice Mode: It is highly recommended to use voice transcription software (e.g., Whisper Flow). Speaking allows for 200 words per minute of input versus 50 for typing, significantly increasing bandwidth.

--------------------------------------------------------------------------------


5. Maintenance: The "Self-Annealing" Protocol


Skills should not just break; they should heal. The goal is for the agent to behave like a capable employee who fixes their own mistakes.

• The Loop: When an error occurs (e.g., an API change or a script failure), the agent must follow this cycle:
    1. Diagnose: Read the error log.
    2. Fix: Attempt to repair the execution script.
    3. Update: Crucial Step. The agent must update the SKILL.md or the execution script to ensure this error does not happen again.

• Your Role: If the agent gets stuck, do not fix the code yourself. Provide "steering" instructions (e.g., "You are stuck in a loop. Research the API documentation first, then try a different endpoint"). Steering is high-ROI activity.

--------------------------------------------------------------------------------


6. Optimization Rules


Do not continuously tweak skills for minor gains.
• The Order of Magnitude Rule: Only optimize a working skill if it yields a 10x improvement (e.g., reducing runtime from 20 minutes to 2 minutes via parallelization).

• Human-in-the-Loop: For high-sensitivity tasks (e.g., sending emails to 10,000 leads), always insert a review step in the skill where the agent must pause for your approval.

--------------------------------------------------------------------------------


7. Deployment (Cloudifying)


When a skill is stable and needs to run automatically (e.g., daily reports), you move it from the IDE to the cloud.

• Remove the Agent: Cloud deployments (using tools like Modal) upload only the Execution scripts. The AI (Agent) is removed to ensure the process is deterministic and reliable.

• Webhooks: Instruct the agent to "Deploy this to Modal as a webhook." It will generate a URL that triggers the script.