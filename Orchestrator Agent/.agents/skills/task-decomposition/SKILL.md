---
name: task-decomposition
description: |
  Break complex multi-domain requests into atomic sub-tasks with clear inputs, outputs, dependencies, and execution order. Builds a Directed Acyclic Graph (DAG) of sub-tasks optimized for maximum parallelism and minimum total execution time.
---

# Task Decomposition

## Objective

Transform any complex, multi-domain user request into a structured execution plan consisting of atomic sub-tasks. Each sub-task is assigned to exactly one specialist agent, has clearly defined inputs and outputs, and is placed into a dependency graph that maximizes parallel execution while respecting data dependencies. The output is a ready-to-execute DAG that the cross-agent-coordination skill can dispatch.

## When to Use This Skill

- When the agent-routing skill classifies a request as "multi" (multi-domain)
- When a request involves 2 or more specialist agents
- When a single-agent task turns out to require input from another agent (discovered during execution)
- When the user explicitly asks for a plan or breakdown before execution
- When a pre-defined workflow does not exist for the detected multi-agent pattern

## Input Specification

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| user_request | string | Yes | The original user request |
| agents_involved | array | Yes | List of specialist agents identified by the routing skill |
| routing_context | object | No | Any context or metadata from the routing decision |
| constraints | object | No | Time constraints, priority level, budget limits, or scope restrictions |
| previous_plan | object | No | If revising a prior decomposition, the original plan |

## Step-by-Step Process

### Step 1: Goal Decomposition
Break the user's high-level request into discrete objectives. Each objective should be:
- **Atomic**: Cannot be meaningfully broken down further within a single agent's domain
- **Testable**: Has a clear definition of "done"  you can verify the output meets the objective
- **Domain-bound**: Falls entirely within one specialist agent's domain

Technique: Ask "What distinct outcomes does the user need?" and list them. Then for each outcome, ask "Which agent owns this outcome?" If an outcome spans two agents, split it further.

Example decomposition for "Launch the Pro tier":
1. Validate Pro tier pricing against market (Business Strategist)
2. Model Pro tier revenue impact and cannibalization risk (Finance Agent)
3. Update landing page with Pro tier card and features (Marketing Agent)
4. Create launch announcement content  video, social, blog (Content Engine)
5. Build email sequence for existing users about upgrade (Marketing Agent)
6. Set up Pro tier tracking and conversion funnel (Analytics Agent)
7. Announce in Discord with FAQ and early-adopter incentive (Community Manager)
8. Configure Creem.io subscription product and Supabase feature flags (Product Agent)

### Step 2: Dependency Mapping
For each sub-task, identify:
- **Inputs required**: What data or artifacts does this task need to start?
- **Source of inputs**: Which other sub-task produces the required input?
- **Outputs produced**: What does this task deliver when complete?
- **Consumers of outputs**: Which downstream tasks need this output?

Build a dependency matrix:

| Sub-Task | Depends On | Produces | Consumed By |
|----------|-----------|----------|-------------|
| T1: Validate pricing | None (can start immediately) | Approved price point and positioning | T2, T3, T4, T5 |
| T2: Revenue modeling | T1 (needs price point) | Revenue projections, cannibalization estimate | T3 (landing page needs pricing proof point) |
| T3: Update landing page | T1 (pricing), T2 (proof points) | Live landing page URL | T5 (email links to page), T7 (Discord links to page) |
| T4: Create content | T1 (positioning) | Video script, social posts, blog draft | T7 (Discord shares content) |
| T5: Email sequence | T1 (pricing), T3 (landing page URL) | Scheduled email campaign | T6 (tracking needs UTM params) |
| T6: Analytics setup | T3 (page URL), T5 (UTM params) | Live dashboard | None (final step) |
| T7: Discord announcement | T3 (page URL), T4 (content links) | Community announcement | None (final step) |
| T8: Platform config | T1 (pricing) | Live Creem product, feature flags | T3 (needs product ID for checkout link) |

### Step 3: DAG Construction
Arrange sub-tasks into execution layers based on dependencies:

**Layer 0 (no dependencies  start immediately)**:
- T1: Validate pricing (Business Strategist)

**Layer 1 (depends on Layer 0)**:
- T2: Revenue modeling (Finance Agent)  needs T1
- T4: Create content (Content Engine)  needs T1
- T8: Platform config (Product Agent)  needs T1

**Layer 2 (depends on Layer 1)**:
- T3: Update landing page (Marketing Agent)  needs T1, T2, T8

**Layer 3 (depends on Layer 2)**:
- T5: Email sequence (Marketing Agent)  needs T1, T3
- T7: Discord announcement (Community Manager)  needs T3, T4

**Layer 4 (depends on Layer 3)**:
- T6: Analytics setup (Analytics Agent)  needs T3, T5

Tasks within the same layer can execute in parallel. Layers execute sequentially.

### Step 4: Critical Path Analysis
Identify the longest dependency chain (critical path)  this determines the minimum total execution time.

In the example above:
- Critical path: T1 -> T2 -> T3 -> T5 -> T6 (5 sequential steps)
- Parallel paths: T4 and T8 run alongside T2 in Layer 1

Optimization opportunities:
- Can any dependency be relaxed? (e.g., can T4 start with preliminary positioning before T1 is fully complete?)
- Can any task be split to start partially in an earlier layer?
- Are there any circular dependencies? (If yes, the decomposition has an error  fix it.)

### Step 5: Sub-Task Specification
For each sub-task, produce a complete specification:

**Sub-Task Spec Template**:
- task_id: Unique identifier (T1, T2, etc.)
- title: Short descriptive title
- assigned_agent: Which specialist agent handles this
- objective: What this task must accomplish
- inputs: List of required inputs with their source (user request, prior task output, external data)
- outputs: List of deliverables this task produces
- acceptance_criteria: How to verify the task was completed correctly
- estimated_effort: Low / Medium / High
- priority: Critical (blocks others) / High / Medium / Low
- layer: Which execution layer this task belongs to
- depends_on: List of task_ids this task depends on
- blocks: List of task_ids that depend on this task

### Step 6: Plan Validation
Before finalizing the execution plan, validate:
1. **Completeness**: Does the plan fully address the user's original request? No objectives missed?
2. **No orphans**: Every sub-task either has a dependency or is in Layer 0
3. **No cycles**: The dependency graph is acyclic (DAG property)
4. **Agent alignment**: Every sub-task is assigned to an agent whose domain covers it
5. **Input availability**: Every sub-task's inputs are either provided by the user, available from external data, or produced by a prior sub-task
6. **Reasonable scope**: No sub-task is too large (should take one agent-turn to complete) or too small (trivial)

## Output Specification

| Field | Type | Description |
|-------|------|-------------|
| plan_id | string | Unique identifier for this execution plan |
| original_request | string | The user's original request (preserved for reference) |
| total_sub_tasks | integer | Number of sub-tasks in the plan |
| total_layers | integer | Number of execution layers |
| critical_path | array | Ordered list of task_ids on the critical path |
| estimated_total_effort | string | Low / Medium / High overall estimate |
| sub_tasks | array | Array of sub-task specs (see template in Step 5) |
| execution_dag | object | Adjacency list representation of the dependency graph |
| parallel_opportunities | array | List of tasks that can run simultaneously within each layer |
| risks | array | Potential failure points or bottlenecks identified during planning |

## Quality Checks

- Every sub-task maps to exactly one specialist agent
- No circular dependencies exist in the DAG
- The critical path is correctly identified and represents the actual longest chain
- All user objectives from the original request are covered by at least one sub-task
- Inputs for every sub-task are traceable to a source (user, external, or prior task)
- Parallelism is maximized  no task is placed in a later layer than necessary
- The plan is executable without additional user input (unless explicitly flagged as needing clarification)
- Sub-tasks are sized appropriately  neither too granular nor too coarse
- Priority levels reflect actual business impact and dependency criticality
