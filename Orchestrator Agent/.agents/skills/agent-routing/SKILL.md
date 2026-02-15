---
name: agent-routing
description: |
  Classify user intent and route requests to the correct specialist agent(s) using the Hedge Edge routing decision matrix. This is the Orchestrator's primary skill  every inbound request passes through this skill first to determine which agent(s) should handle it.
---

# Agent Routing

## Objective

Accurately classify every user request by domain and route it to the correct specialist agent(s) within the Hedge Edge 9-agent architecture. Achieve >95% first-attempt routing accuracy by matching intent patterns against the agent capability registry. For multi-domain requests, identify all relevant agents and flag the request for task decomposition before routing.

## When to Use This Skill

- **Every single user request** passes through this skill  it is the default entry point
- When the user submits a new task, question, or instruction
- When a previous routing decision needs to be revised (user corrects or clarifies intent)
- When an agent reports that a routed task is outside its domain (re-route)
- When the Orchestrator receives a follow-up that may need a different agent than the original conversation

## Input Specification

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| user_request | string | Yes | The raw text of the user's request |
| conversation_history | array | No | Prior messages for context (helps disambiguate follow-ups) |
| previous_routing | object | No | If this is a re-route, the previous agent assignment and reason for re-route |
| user_metadata | object | No | User's subscription tier, IB status, account age (helps prioritize) |

## Step-by-Step Process

### Step 1: Intent Extraction
Parse the user request to identify:
- **Primary action verb**: What does the user want done? (create, analyze, fix, plan, report, launch, check, build, send, track)
- **Domain keywords**: Which business domain does the request touch? Map keywords to agents:
  - Strategy/growth/pricing/competition/partnerships/moats -> **Business Strategist**
  - Video/content/social/YouTube/Instagram/LinkedIn/post/script -> **Content Engine**
  - Email/SEO/ads/landing page/newsletter/lead magnet/keywords/funnel -> **Marketing Agent**
  - Lead/demo/call/CRM/pipeline/proposal/close/qualify/follow-up -> **Sales Agent**
  - Revenue/MRR/expense/commission/invoice/tax/P&L/cash flow/runway -> **Finance Agent**
  - Discord/community/onboard/support/ticket/feedback/sentiment -> **Community Manager**
  - Metrics/dashboard/funnel/cohort/churn/attribution/A-B test/KPI -> **Analytics Agent**
  - Feature/bug/release/roadmap/spec/QA/integration/MT4/cTrader -> **Product Agent**
- **Specificity level**: Is this a concrete task (do X) or an exploratory question (what should we do about X)?
- **Urgency signals**: Words like "urgent", "ASAP", "broken", "down" escalate priority

### Step 2: Domain Classification
Using the extracted intent, classify the request into one of three categories:

**Category A  Single Domain (route directly)**:
The request clearly maps to exactly one agent's domain. No ambiguity. Route immediately.
Example: "What's our MRR this month?" -> Finance Agent (100% confidence)

**Category B  Multi-Domain (decompose first)**:
The request spans 2+ agent domains. Flag for task decomposition before routing.
Example: "Launch a campaign for our new Pro tier" -> Content Engine + Marketing + Analytics + Community Manager

**Category C  Ambiguous (clarify or infer)**:
The request could map to multiple agents depending on interpretation. Either:
(a) Infer the most likely agent based on conversation context and route with a note
(b) Ask the user one clarifying question (max one  never ask more than one)
Example: "How are we doing?" -> Could be Finance (revenue), Analytics (metrics), Community Manager (sentiment). Infer based on context or ask: "Do you mean revenue performance, user metrics, or community health?"

### Step 3: Confidence Scoring
Assign a confidence score to the routing decision:
- **High (>85%)**: Clear domain match, unambiguous intent. Route immediately.
- **Medium (60-85%)**: Likely correct but some ambiguity. Route with a note explaining the interpretation.
- **Low (<60%)**: Genuinely ambiguous. Ask one clarifying question before routing.

### Step 4: Pre-Defined Workflow Check
Before finalizing routing, check if the request matches a pre-defined Cross-Agent Workflow:
- "Launch campaign" / "content push" / "marketing blitz" -> **Launch New Content Campaign** workflow
- "Monthly review" / "business review" / "month-end" -> **Monthly Business Review** workflow
- "Customer complaint" / "bad review" / "churn risk" -> **Handle Customer Complaint** workflow
- "Ship feature" / "release update" / "launch feature" -> **New Feature Release** workflow
- "New broker" / "IB partnership" / "broker onboarding" -> **Onboard New IB Partner** workflow
- "Weekly sprint" / "growth check" / "weekly priorities" -> **Weekly Growth Sprint** workflow

If a workflow match is found, skip individual routing and trigger the full workflow via the cross-agent-coordination skill.

### Step 5: Route Assignment
Produce the final routing decision with:
- routing_type: "single" or "multi" or "clarification_needed"
- target_agent: The agent name(s) to route to
- confidence: 0.0-1.0 confidence score
- sub_task: Refined task description for the target agent
- context_passed: List of context items the agent needs
- expected_output: What the Orchestrator expects back
- workflow_match: Name of matched pre-defined workflow, if any
- trigger_decomposition: Whether task-decomposition skill should be invoked

### Step 6: Handoff
Pass the routing decision to either:
- The target agent directly (single-agent route)
- The task-decomposition skill (multi-agent route without workflow match)
- The cross-agent-coordination skill (multi-agent route with workflow match)

## Output Specification

| Field | Type | Description |
|-------|------|-------------|
| routing_type | enum | single, multi, or clarification_needed |
| target_agent | string or array | Agent name(s) the request is routed to |
| confidence | float | 0.0-1.0 confidence score for the routing decision |
| sub_task | string | Refined task description for the target agent |
| context_passed | array | List of context items passed to the target agent |
| expected_output | string | What the Orchestrator expects back from the agent |
| workflow_match | string or null | Name of matched pre-defined workflow, if any |
| trigger_decomposition | boolean | Whether the task-decomposition skill should be invoked |
| clarification_question | string or null | Question to ask user if confidence is low |

## Quality Checks

- Every request gets a routing decision  no request should be left unrouted
- Confidence score is calibrated  High confidence routes should be correct >95% of the time
- Multi-domain requests are always flagged for decomposition, never force-routed to a single agent
- Pre-defined workflows are correctly matched when applicable (avoids redundant decomposition)
- Context passed to the target agent is sufficient for the agent to execute without needing to ask follow-ups
- Re-routes are logged so routing accuracy can be measured and improved over time
- No agent receives tasks outside its declared domain  if no agent matches, escalate to user
- Urgency signals are preserved and passed through to the target agent
