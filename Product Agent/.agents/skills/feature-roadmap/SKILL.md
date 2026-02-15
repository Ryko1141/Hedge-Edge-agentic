---
name: feature-roadmap
description: |
  Manages the Hedge Edge product roadmap end-to-end: prioritization using RICE scoring
  adapted for prop-firm trader impact, PRD authoring, GitHub Issue decomposition,
  sprint planning, and progress tracking across Notion and GitHub. Covers all product
  surfaces  Electron app, MT5/MT4/cTrader EAs, landing page, and payment flows.
---

# Feature Roadmap

## Objective

Maintain a living, prioritized product roadmap for Hedge Edge that maximizes trader trust and business growth. Every feature on the roadmap must answer: "Does this protect more trader capital, reduce hedge latency, expand platform coverage, or increase activation/retention?" Features that don't pass this filter get deprioritized or killed.

## When to Use This Skill

- A new feature request arrives (from user feedback, business strategy, or competitive analysis)
- Sprint planning is needed  selecting the next 2-week batch of work from the backlog
- Roadmap reprioritization is triggered by a market event (e.g., FTMO changes their rules, a competitor launches a cTrader copier)
- A PRD needs to be written for a complex feature (e.g., hedge ratio customization, multi-broker failover)
- Stakeholders need a roadmap status update with progress percentages and ETA confidence
- A "build vs. defer" decision is required (e.g., "Do we build MT4 support in-house or integrate a third-party bridge?")

## Input Specification

| Field | Type | Required | Description |
|---|---|---|---|
| equest_type | enum | Yes | 
ew_feature, eprioritize, sprint_plan, prd_write, status_update, uild_vs_defer |
| eature_title | string | For new features | Short name: "cTrader Integration", "Hedge Ratio Customization", "Drawdown Alert System" |
| eature_description | string | For new features | Detailed description of the feature and the trader problem it solves |
| equester | string | No | Source: "discord-user:TraderMike", "sentry-trend:reconnection-crashes", "business-strategy" |
| urgency_context | string | No | Why now? "FTMO changed max drawdown to 8%", "3 users reported losing funded accounts due to X" |
| sprint_dates | string | For sprint plans | Sprint start and end dates |
| 
otion_roadmap_id | string | No | Notion database ID for the roadmap (defaults to main roadmap DB) |

## Step-by-Step Process

### 1. Feature Intake & Classification
- Receive the feature request and classify it into a product area:
  - **Hedge Core**: Trade execution, latency, order management, position synchronization
  - **Platform Expansion**: MT4 EA, cTrader cBot, new broker APIs
  - **Trader Experience**: Dashboard UI, onboarding, notifications, drawdown alerts
  - **Infrastructure**: Auto-update, telemetry, error handling, Supabase schema
  - **Growth**: IB broker signup flow, referral mechanics, pricing/plan features
- Tag with affected components: electron-main, electron-renderer, mt5-ea, mt4-ea, ctrader-cbot, supabase, landing-page, 
8n-workflow

### 2. RICE Scoring (Hedge Edge Adapted)
Score each feature on a 1-10 scale for each dimension:
- **Reach**: How many of the ~500 beta users (and projected growth) does this affect? A feature for MT5 users only scores higher than cTrader-only (MT5 is 90%+ of current base). Weight: 1.0x
- **Impact**: How much does this improve trader outcomes? Measured on a prop-firm scale:
  - 10 = Prevents funded account loss (e.g., reconnection failover during open hedge)
  - 7 = Measurably reduces risk (e.g., drawdown proximity alerts)
  - 4 = Improves workflow efficiency (e.g., one-click account setup)
  - 1 = Cosmetic or convenience (e.g., dark mode refinement)
  Weight: 2.0x (trader trust is paramount)
- **Confidence**: How well do we understand the requirements and technical feasibility?
  - 10 = Clear spec, proven tech, similar feature exists
  - 5 = Spec exists but technical unknowns (e.g., cTrader Open API rate limits)
  - 1 = Exploratory, no clear path
  Weight: 0.8x
- **Effort**: Engineering weeks required (inverse  lower effort = higher score):
  - 10 = Less than 1 week
  - 5 = 2-4 weeks
  - 1 = 8+ weeks
  Weight: 0.5x

**RICE Score** = (Reach  1.0 + Impact  2.0 + Confidence  0.8) / (11 - Effort)  0.5

### 3. Roadmap Placement
- **Now (current sprint)**: RICE  15 and Confidence  7
- **Next (next 2 sprints)**: RICE  10 or strategic imperative from Business Strategist Agent
- **Later (3+ sprints)**: RICE < 10, or high-impact but low-confidence (needs spike/research)
- **Icebox**: Interesting but no current signal supporting it

### 4. PRD Generation (for "Now" and "Next" items)
Write a PRD in Notion with the following sections:
- **Problem Statement**: What trader pain does this solve? Include specific scenarios (e.g., "Trader running 3 FTMO accounts simultaneously opens a 2-lot EURUSD trade on Account 1. Currently, hedge fires on only one personal broker account. Trader needs hedge distribution across accounts proportional to exposure.")
- **Proposed Solution**: High-level approach with architecture notes
- **Hedge Safety Analysis**: "What happens if this feature fails during a live hedge?"  enumerate failure modes and mitigations
- **Prop Firm Compliance Check**: Does this feature interact with or risk violating any prop firm rules? Check FTMO, The5%ers, TopStep, Apex Trader Funding rules.
- **Success Metrics**: Quantitative targets (e.g., "hedge distribution latency < 200 ms for 3 accounts", "0 missed hedges in 1000 simulated multi-account sessions")
- **Technical Breakdown**: GitHub Issues to create, dependencies, estimated effort per issue

### 5. GitHub Issue Decomposition
- Create a parent Epic issue in the hedge-edge-app repository
- Break into child issues with labels: hedge-core, platform, ux, infra, growth
- Each issue includes: acceptance criteria, affected components, test requirements, rollback notes
- Link issues to the Notion PRD page using the Notion page URL in the issue body

### 6. Sprint Planning
- Pull the top N items from "Now" that fit the sprint capacity
- Balance across product areas: never ship a sprint that's 100% platform expansion with 0% hedge core stability work
- Reserve 20% sprint capacity for bug fixes and tech debt (informed by Bug Triage skill)
- Create a sprint board view in GitHub Projects or Notion

### 7. Progress Tracking & Status Updates
- Update Notion roadmap database entries with: current status, % complete, blockers, ETA confidence (High/Medium/Low)
- Post weekly status to Discord #team-updates channel
- Flag items that have slipped 2+ sprints for reevaluation

## Output Specification

| Output Type | Format | Destination |
|---|---|---|
| **RICE Scorecard** | Markdown table with scores and rationale | Notion roadmap entry + GitHub Issue comment |
| **PRD** | Structured Notion page | Notion "Product Specs" database |
| **GitHub Issues** | Issue with labels, assignees, acceptance criteria | hedge-edge-app repo |
| **Sprint Plan** | List of issues with priorities and capacity allocation | Notion sprint board + Discord post |
| **Status Update** | Summary with progress %, blockers, next steps | Notion + Discord #team-updates |
| **Build vs. Defer Analysis** | Pros/cons table with recommendation | Notion decision log |

## API & Platform Requirements

- **Notion API** (NOTION_API_KEY): Create/update roadmap database entries, write PRD pages, query progress data
- **GitHub API** (GITHUB_TOKEN): Create issues, manage labels, link to milestones, query PR status for progress tracking
- **Discord Bot** (DISCORD_BOT_TOKEN): Post status updates to #team-updates, poll #feature-requests for new input
- **Supabase** (SUPABASE_URL, SUPABASE_KEY): Query user analytics for Reach scoring (how many users use MT5 vs MT4 vs cTrader, active account counts)

## Quality Checks

- [ ] Every feature on the roadmap has a RICE score with documented rationale
- [ ] No "Now" item lacks a PRD or at least a lightweight spec
- [ ] Every PRD includes a Hedge Safety Analysis section  no exceptions
- [ ] GitHub Issues reference their parent Epic and Notion PRD
- [ ] Sprint plan reserves  20% capacity for bugs and tech debt
- [ ] Roadmap reflects current reality  no items marked "In Progress" that have been stalled 2+ weeks without a blocker note
- [ ] Prop firm compliance matrix is updated when any hedge-core feature ships
- [ ] cTrader and MT4 integration timelines are realistic given current team capacity  no optimistic dates without spike results
