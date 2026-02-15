---
name: cross-agent-coordination
description: |
  Manage multi-agent workflow execution  dispatch sub-tasks to specialist agents, manage dependencies between them, handle parallel and sequential execution, aggregate results, resolve conflicts between agent outputs, and deliver a unified response.
---

# Cross-Agent Coordination

## Objective

Execute multi-agent workflows by dispatching sub-tasks from a decomposed execution plan to the appropriate specialist agents, managing the flow of data between them, handling failures and retries, aggregating all outputs into a coherent unified response, and resolving any conflicts or contradictions between agent outputs. This is the runtime engine of the Orchestrator.

## When to Use This Skill

- After the task-decomposition skill produces an execution plan (DAG of sub-tasks)
- When a pre-defined Cross-Agent Workflow is triggered (Launch Campaign, Monthly Review, etc.)
- When a single-agent task fails and needs to be re-routed or escalated to another agent
- When the user requests a coordinated action across multiple business domains
- When aggregating results from multiple agents into a single deliverable

## Input Specification

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| execution_plan | object | Yes | The DAG of sub-tasks from the task-decomposition skill or a pre-defined workflow |
| workflow_name | string | No | Name of the pre-defined workflow being executed, if applicable |
| shared_context | object | No | Context that all agents need (company data, user info, current priorities) |
| quality_bar | string | No | Expected quality level: "draft", "review-ready", "final" |
| conflict_resolution_strategy | string | No | "user-decides", "strategist-arbitrates", "majority-wins" (default: "strategist-arbitrates") |

## Step-by-Step Process

### Step 1: Execution Initialization
Prepare the workflow for execution:
1. Load the execution plan (DAG) and validate it has no cycles
2. Identify Layer 0 tasks (no dependencies  can start immediately)
3. Initialize a task status tracker with states: PENDING, DISPATCHED, IN_PROGRESS, COMPLETE, FAILED, BLOCKED
4. Set all Layer 0 tasks to PENDING, all others to BLOCKED
5. Prepare shared context package that all agents will receive

Task Status Tracker Template:
- task_id: T1
- assigned_agent: Business Strategist
- status: PENDING
- dispatched_at: null
- completed_at: null
- output: null
- error: null
- retry_count: 0

### Step 2: Parallel Dispatch
For each execution layer, dispatch all tasks in that layer simultaneously:

1. Gather all PENDING tasks whose dependencies are all COMPLETE
2. For each such task, compile the dispatch package:
   - The sub-task specification (objective, acceptance criteria)
   - Outputs from dependency tasks (inputs for this task)
   - Shared context (company data, user metadata)
   - Quality bar expectation
3. Dispatch to the assigned specialist agent
4. Update task status to DISPATCHED

Dispatch Package Template:
- task_id: T3
- agent: Marketing Agent
- objective: "Update the Hedge Edge landing page to include the Pro tier pricing card with features list, price point, and checkout link"
- inputs_from_dependencies:
  - From T1 (Business Strategist): Approved price point of $30/mo, positioning as "For serious traders managing 3+ accounts"
  - From T2 (Finance Agent): Revenue projection showing 30% of Starter users upgrading = $4,500 incremental MRR
  - From T8 (Product Agent): Creem.io product ID pro_tier_001, checkout URL https://checkout.creem.io/pro
- shared_context: Current landing page URL, brand guidelines, tone of voice
- quality_bar: "review-ready"

### Step 3: Result Collection and Dependency Resolution
As each agent completes its task:

1. Receive the agent's output
2. Validate output against acceptance criteria defined in the sub-task spec
3. If output passes validation:
   - Update task status to COMPLETE
   - Store output in the results registry
   - Check which BLOCKED tasks have all dependencies now COMPLETE
   - Move those tasks to PENDING (they are now eligible for dispatch in the next cycle)
4. If output fails validation:
   - Log the failure reason
   - Increment retry_count
   - If retry_count < 2: Re-dispatch with feedback on what was wrong
   - If retry_count >= 2: Mark as FAILED, assess impact on downstream tasks
   - If a FAILED task blocks critical-path tasks, flag the entire workflow as AT_RISK

### Step 4: Failure Handling
When a task fails after max retries:

**Option A  Graceful Degradation**:
If the failed task is non-critical (not on critical path), continue the workflow without it. Note the gap in the final output.

**Option B  Re-Route**:
If another agent could potentially handle the failed task (even partially), re-route to that agent with the original spec plus the error context.

**Option C  Escalate**:
If the failed task is critical and no re-route is possible, pause the workflow and report to the user:
- Which task failed
- Which agent was responsible
- What went wrong
- Which downstream tasks are now blocked
- Recommended resolution

### Step 5: Conflict Detection and Resolution
After all tasks complete, scan outputs for conflicts:

**Types of conflicts**:
1. **Data contradiction**: Two agents cite different numbers (e.g., Finance says MRR is $14,500 but Analytics dashboard shows $14,200)
   - Resolution: Identify authoritative source. Finance is authoritative for revenue figures. Analytics is authoritative for behavioral metrics.

2. **Strategic disagreement**: Two agents recommend opposing actions (e.g., Marketing says increase ad spend, Finance says cut costs)
   - Resolution: Route to Business Strategist for arbitration based on current company priorities (growth vs. profitability vs. retention)

3. **Resource conflict**: Two agents propose tasks that compete for the same resource (e.g., both Content Engine and Marketing want to redesign the landing page)
   - Resolution: Merge into a single coordinated task, assign a lead agent, have the other agent provide input

4. **Timeline conflict**: Agents propose incompatible timelines (e.g., Product says feature ships in 4 weeks, Marketing plans launch campaign for next week)
   - Resolution: Surface the conflict, align on realistic timeline, adjust all dependent plans

Conflict Resolution Process:
1. Detect the conflict by comparing outputs
2. Classify the conflict type
3. Apply resolution strategy (user-decides, strategist-arbitrates, or majority-wins)
4. Document the resolution and reasoning
5. Update affected outputs to reflect the resolution

### Step 6: Result Aggregation
Compile all agent outputs into a single unified response:

1. **Order by relevance**: Lead with the most impactful or user-facing output
2. **Maintain attribution**: Clearly indicate which agent produced which section
3. **Resolve formatting**: Ensure consistent formatting, terminology, and tone across all sections
4. **Add connective tissue**: Write transitions between agent outputs so the response reads as one coherent document, not a collection of fragments
5. **Highlight dependencies**: If one output references another (e.g., "as shown in the financial model"), ensure the reference is valid
6. **Append metadata**: Include execution summary  which agents participated, total execution time, any conflicts resolved

### Step 7: Final Quality Gate
Before delivering the aggregated result to the user:

1. **Completeness check**: Does the response fully address every aspect of the original request?
2. **Consistency check**: Do all agent outputs align with each other after conflict resolution?
3. **Actionability check**: Are next steps clear and concrete for each section?
4. **Brand alignment check**: Does the response maintain Hedge Edge's tone (professional, trader-savvy, no fluff)?
5. **Accuracy check**: Are all numbers, dates, URLs, and references correct?

If any check fails, loop back to the relevant agent with specific feedback.

## Output Specification

| Field | Type | Description |
|-------|------|-------------|
| workflow_id | string | Unique identifier for this workflow execution |
| status | enum | COMPLETE, PARTIAL (some tasks failed), FAILED |
| total_tasks | integer | Number of sub-tasks executed |
| completed_tasks | integer | Number successfully completed |
| failed_tasks | integer | Number that failed after retries |
| execution_time | string | Total wall-clock time for the workflow |
| conflicts_detected | integer | Number of conflicts found between agent outputs |
| conflicts_resolved | integer | Number of conflicts successfully resolved |
| aggregated_result | object | The unified response combining all agent outputs |
| task_status_log | array | Full status history for every sub-task |
| unresolved_issues | array | Any open questions or decisions that need user input |

## Quality Checks

- All tasks in the execution plan are accounted for (dispatched or explicitly skipped with reason)
- Parallel tasks within the same layer are dispatched simultaneously, not sequentially
- Failed tasks are retried before being marked as failed (max 2 retries)
- All conflicts between agent outputs are detected and resolved (or flagged for user decision)
- The aggregated result reads as a coherent document, not a patchwork of disconnected agent outputs
- Execution respects the dependency DAG  no task runs before its dependencies complete
- The final output includes clear attribution so the user knows which agent handled which part
- Shared context is passed to all agents consistently  no agent operates on stale or contradictory context
- The quality gate catches issues before they reach the user
