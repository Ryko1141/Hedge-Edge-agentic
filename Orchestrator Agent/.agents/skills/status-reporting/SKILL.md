---
name: status-reporting
description: |
  Generate status reports on agent activity, task progress, workflow completion, and system health across the entire Hedge Edge AI agent architecture. Provides visibility into what each agent is doing, what is complete, what is blocked, and overall architecture performance.
---

# Status Reporting

## Objective

Provide comprehensive, real-time visibility into the state of the entire Hedge Edge agent architecture. Generate reports on individual agent activity, multi-agent workflow progress, task completion rates, bottlenecks, failure patterns, and overall system health. Enable the user to understand at a glance what is happening across all 9 agents and where attention is needed.

## When to Use This Skill

- When the user asks "What's the status?" or "Where are we?" or "What's happening?"
- At the completion of any multi-agent workflow (automatic summary)
- When a workflow is blocked or at risk (proactive alert)
- On a scheduled cadence (daily standup summary, weekly review)
- When the user asks about a specific agent's workload or performance
- When diagnosing why a task is taking longer than expected

## Input Specification

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| report_type | enum | Yes | "workflow_status", "agent_status", "system_health", "daily_standup", "weekly_review" |
| workflow_id | string | No | Specific workflow to report on (required for workflow_status) |
| agent_name | string | No | Specific agent to report on (required for agent_status) |
| time_range | string | No | Time period for the report: "today", "this_week", "this_month", "last_7_days", "last_30_days" |
| detail_level | enum | No | "summary" (default), "detailed", "debug" |

## Step-by-Step Process

### Step 1: Data Collection
Gather status data from all relevant sources based on report type:

**For Workflow Status**:
- Load the execution plan (DAG) for the specified workflow
- Collect current status of every sub-task (PENDING, DISPATCHED, IN_PROGRESS, COMPLETE, FAILED, BLOCKED)
- Calculate completion percentage: (completed_tasks / total_tasks) * 100
- Identify the current execution layer (which tasks are actively running)
- Check for blocked or failed tasks and their impact on downstream work
- Calculate elapsed time vs. estimated total time

**For Agent Status**:
- Count tasks assigned to the specified agent in the given time range
- Categorize by status: completed, in progress, failed
- Calculate success rate: completed / (completed + failed)
- List currently active tasks with their workflow context
- Identify any overloaded agents (too many concurrent tasks)

**For System Health**:
- Aggregate status across all agents
- Calculate overall routing accuracy (correct first-route / total routes)
- Track workflow completion rates
- Identify recurring failure patterns
- Monitor agent response times
- Check for agents with no recent activity (potential issues)

**For Daily Standup**:
- Yesterday's completed tasks by agent
- Today's planned tasks by agent
- Current blockers or risks
- Key metrics snapshot (MRR, active users, community health)

**For Weekly Review**:
- Week's completed workflows and outcomes
- Agent performance rankings
- Workflow efficiency metrics (time to complete, parallelism achieved)
- Recurring issues or bottlenecks
- Recommendations for process improvements

### Step 2: Status Computation
Process collected data into structured status indicators:

**Overall Health Score**: 0-100 based on:
- Task completion rate (weight: 30%)
- Routing accuracy (weight: 20%)
- Conflict resolution rate (weight: 15%)
- Average workflow completion time vs target (weight: 20%)
- Agent availability (weight: 15%)

**Traffic Light Status**:
- GREEN: Health score > 80, no critical blockers, all agents responsive
- YELLOW: Health score 60-80, or non-critical blockers present, or one agent underperforming
- RED: Health score < 60, or critical blockers present, or multiple agents failing

**Per-Agent Status**:
| Agent | Tasks (7d) | Success Rate | Avg Response Time | Current Load | Status |
|-------|-----------|-------------|-------------------|-------------|--------|
| Business Strategist | 12 | 100% | 45s | 2 active | GREEN |
| Content Engine | 8 | 87% | 120s | 3 active | YELLOW |
| Marketing Agent | 15 | 93% | 60s | 1 active | GREEN |
| Sales Agent | 6 | 100% | 30s | 0 active | GREEN |
| Finance Agent | 10 | 100% | 40s | 1 active | GREEN |
| Community Manager | 20 | 95% | 25s | 4 active | YELLOW |
| Analytics Agent | 14 | 92% | 90s | 2 active | GREEN |
| Product Agent | 9 | 88% | 75s | 2 active | GREEN |

### Step 3: Bottleneck Identification
Analyze the status data to identify bottlenecks:

1. **Agent bottleneck**: One agent has disproportionately high load or low success rate
   - Recommendation: Redistribute tasks, simplify sub-task specs, or escalate issues
2. **Dependency bottleneck**: A critical-path task is blocking multiple downstream tasks
   - Recommendation: Prioritize the blocking task, explore workarounds, or relax the dependency
3. **Resource bottleneck**: Multiple workflows compete for the same agent simultaneously
   - Recommendation: Queue workflows by priority, defer non-urgent work
4. **Quality bottleneck**: High retry rates on a specific task type
   - Recommendation: Improve sub-task specifications, add examples, or adjust acceptance criteria

### Step 4: Report Generation
Compile the analysis into a structured report based on report_type:

**Workflow Status Report**:
```
## Workflow: [Name] (ID: [workflow_id])
**Status**: [GREEN/YELLOW/RED] | **Progress**: [X]% | **Elapsed**: [time]

### Task Progress
| # | Task | Agent | Status | Output |
|---|------|-------|--------|--------|
| T1 | [title] | [agent] | COMPLETE | [summary] |
| T2 | [title] | [agent] | IN_PROGRESS | -- |
| T3 | [title] | [agent] | BLOCKED by T2 | -- |

### Current Layer: [N]
Active tasks: T2 (Marketing Agent)

### Blockers
- T3 is waiting on T2 output (expected completion: [time])

### Next Steps
- Once T2 completes, T3 and T4 will dispatch in parallel
```

**Daily Standup Report**:
```
## Daily Standup  [Date]
**System Health**: [GREEN/YELLOW/RED] ([score]/100)

### Yesterday (Completed)
- Business Strategist: Completed partnership analysis for BlackBull renewal
- Marketing Agent: Launched email sequence for Pro tier announcement
- Analytics Agent: Published weekly KPI dashboard

### Today (Planned)
- Content Engine: Record YouTube video script for hedging tutorial
- Finance Agent: Reconcile January IB commissions
- Community Manager: Run Discord AMA event at 7pm UTC

### Blockers
- None / [List any blockers]

### Key Metrics Snapshot
- MRR: $14,500 (+3.2% WoW)
- Active Users: 487 (-2 WoW)
- Discord Members: 1,247 (+31 WoW)
- Churn Rate: 4.1% (target: <5%)
```

**Weekly Review Report**:
```
## Weekly Review  Week of [Date]
**System Health**: [GREEN/YELLOW/RED] ([score]/100)

### Workflows Completed: [N]
| Workflow | Duration | Tasks | Success Rate | Outcome |
|----------|----------|-------|-------------|---------|
| [name] | [time] | [n/n] | [%] | [one-line summary] |

### Agent Performance
| Agent | Tasks | Success | Avg Time | Notable |
|-------|-------|---------|----------|---------|
| [name] | [n] | [%] | [time] | [highlight] |

### Routing Accuracy: [%]
- First-attempt correct routes: [n] / [total]
- Re-routes required: [n]
- Common misroutes: [pattern, if any]

### Issues and Recommendations
1. [Issue]: [Recommendation]
2. [Issue]: [Recommendation]

### Next Week Priorities
1. [Priority]
2. [Priority]
3. [Priority]
```

### Step 5: Proactive Alerts
In addition to on-demand reports, generate proactive alerts when:

- A workflow has been stuck for more than 2x its estimated completion time
- An agent has failed 3+ tasks in the last 24 hours
- A critical-path task has failed and the workflow is at risk
- Multiple workflows are queued behind the same bottleneck agent
- System health score drops below 60

Alert format:
```
ALERT [SEVERITY]: [Brief description]
- Affected: [workflow/agent]
- Impact: [what is blocked or degraded]
- Recommended action: [specific next step]
```

## Output Specification

| Field | Type | Description |
|-------|------|-------------|
| report_type | string | Type of report generated |
| generated_at | datetime | Timestamp of report generation |
| health_score | integer | 0-100 overall system health score |
| traffic_light | enum | GREEN, YELLOW, or RED |
| report_body | string | The formatted report content (Markdown) |
| alerts | array | Any proactive alerts triggered during report generation |
| recommendations | array | Actionable recommendations based on the analysis |
| agent_statuses | object | Per-agent status summary |
| active_workflows | array | List of currently running workflows with progress |

## Quality Checks

- Reports are generated within 10 seconds of request (no long-running queries)
- Health score calculation is deterministic and reproducible given the same input data
- Traffic light status accurately reflects the actual system state (no false greens)
- Bottleneck identification catches real issues and does not flag noise
- Proactive alerts fire reliably and do not produce alert fatigue (max 3 alerts per day unless critical)
- Reports are formatted consistently regardless of report type
- Agent performance metrics account for task difficulty (a complex strategy task is not penalized vs. a simple status check)
- All timestamps use UTC and are human-readable
- Reports include enough context to be actionable without requiring follow-up questions
- Weekly reviews surface genuine insights, not just data regurgitation
