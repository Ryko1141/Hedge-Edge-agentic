<p align="center">
  <img src="assets/Hedge-Edge-Logo.png" alt="Hedge Edge" width="280" />
</p>

<h1 align="center">Hedge Edge — Agentic Business Orchestrator</h1>

<p align="center">
  <strong>A 9-agent AI architecture that runs an entire fintech business from a single VS Code workspace.</strong>
</p>

<p align="center">
  <a href="https://hedgeedge.io">hedgeedge.io</a> · <a href="#agents">Agents</a> · <a href="#architecture">Architecture</a> · <a href="#getting-started">Getting Started</a>
</p>

---

## What Is This?

This repository is the **agentic operating system** behind [Hedge Edge](https://hedgeedge.io) — a UK-registered fintech company that provides automated multi-account hedge management for prop firm traders.

Instead of hiring a traditional team for strategy, marketing, sales, finance, content, community, analytics, and product, Hedge Edge delegates these functions to **nine specialised AI agents**, each with codified skills and deterministic execution scripts. A human operator acts as the CEO, providing high-level intent and approval while the agents plan, execute, and self-correct.

This is not a chatbot wrapper. It is a structured **Agent → Skill → Execution (ASE) framework** where:

- **Agents** decide *who* handles a task
- **Skills** define *what* gets done (objectives, steps, definition of done)
- **Execution scripts** define *how* it happens (atomic, deterministic, testable code)

---

## The Product

**Hedge Edge** is a desktop application (Electron) that provides automated hedge management for prop firm traders.

### How It Works

When a trader opens a position on a prop firm evaluation account, Hedge Edge **instantly mirrors a reverse position** on a personal broker account. This creates an automatic hedge:

| Scenario | Prop Firm Account | Personal Hedge Account | Net Result |
|----------|-------------------|------------------------|------------|
| Challenge **passes** | ✅ Profit from payout | ❌ Small loss on hedge | **Net positive** — payout far exceeds hedge cost |
| Challenge **fails** | ❌ Account blown | ✅ Profit captured on hedge | **Capital preserved** — hedge recovers the loss |

> **~85–90% of prop firm challenges fail.** Hedge Edge ensures traders preserve capital regardless of outcome.

### Why It Matters

- **$100–$1,000+** per challenge fee is at risk every attempt
- Traders run **2–5 simultaneous challenges** across firms like FTMO, The5%ers, TopStep, and Apex
- Manual hedging is error-prone and slow — Hedge Edge executes locally with **zero latency**

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop App | Electron (Windows, Mac planned) |
| Trade Execution | MT5 Expert Advisor (**live**), MT4 EA (*coming soon*), cTrader (*coming soon*) |
| Auth & Database | Supabase |
| Payments | Creem.io |
| Landing Page | Vercel ([hedgeedge.io](https://hedgeedge.io)) |
| Community | Discord |
| Automation | n8n |

### Revenue Model

| Stream | Details |
|--------|---------|
| **SaaS Subscriptions** | Free Guide → Starter ($29/mo) → Pro ($30/mo) → Hedger ($75/mo) |
| **IB Commissions** | Per-lot rebates from Vantage and BlackBull on referred hedge accounts |
| **Free Tier Funnel** | Free hedge guide + Discord community → educate → convert to paid |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER / CEO                               │
│              (Natural language intent via VS Code)               │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                   ORCHESTRATOR AGENT                             │
│         Intent classification · Task decomposition              │
│         Agent routing · Dependency management                   │
│         Result aggregation · Quality assurance                  │
└───┬────────┬────────┬────────┬────────┬────────┬────────┬──────┘
    │        │        │        │        │        │        │
    ▼        ▼        ▼        ▼        ▼        ▼        ▼
┌───────┐┌───────┐┌───────┐┌───────┐┌───────┐┌───────┐┌───────┐┌───────┐
│Biz    ││Content││Market-││Sales  ││Finance││Commun-││Analy- ││Product│
│Strat- ││Engine ││ing    ││       ││       ││ity    ││tics   ││       │
│egist  ││       ││       ││       ││       ││Manager││       ││       │
└───┬───┘└───┬───┘└───┬───┘└───┬───┘└───┬───┘└───┬───┘└───┬───┘└───┬───┘
    │        │        │        │        │        │        │        │
    ▼        ▼        ▼        ▼        ▼        ▼        ▼        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SKILLS + EXECUTION LAYER                         │
│         SKILL.md (objectives, steps, definition of done)            │
│         execution/ (atomic Python/TS scripts — one job each)        │
└─────────────────────────────────────────────────────────────────────┘
```

### The ASE Framework

Every agent operates within the **Agent-Skill-Execution** hierarchy:

```
Agent (Who)
  └── has Skills (What)
        └── each Skill has Execution scripts (How)
              └── each Script produces deterministic output
```

- **Agents** are defined in `.github/agents/*.agent.md` — each contains routing rules, domain expertise, and operating protocols
- **Skills** live in `<Agent Folder>/.agents/skills/<skill-name>/SKILL.md` — YAML frontmatter + step-by-step instructions with acceptance criteria
- **Execution scripts** live in `execution/` inside each skill — atomic, testable, one-script-one-job

This separation keeps **probabilistic reasoning** (agent decision-making) cleanly isolated from **deterministic execution** (reliable scripts), making the system auditable and self-healing.

---

## Agents

### 1. Orchestrator Agent
> *Master coordinator — the single entry point for every request*

Routes tasks to specialist agents using a deterministic routing matrix. Decomposes complex multi-domain requests into atomic sub-tasks, identifies dependencies, dispatches in parallel where possible, and stitches results into coherent output.

| Skill | Purpose |
|-------|---------|
| `agent-routing` | Classify intent and dispatch to the correct agent |
| `task-decomposition` | Break complex requests into atomic sub-tasks with clear I/O |
| `cross-agent-coordination` | Manage multi-agent workflows with dependency DAGs |
| `status-reporting` | Aggregate progress across all agents |

---

### 2. Business Strategist Agent
> *Strategy, growth, competitive intelligence, partnerships*

Analyses the prop firm market, identifies growth levers, evaluates pricing models, researches competitors, and develops partnership strategies with brokers.

| Skill | Purpose |
|-------|---------|
| `prop-firm-market-research` | Map the prop firm landscape — firms, fees, failure rates, trends |
| `competitive-intelligence` | Track competitors (trade copiers, hedge tools) and identify moats |
| `growth-strategy` | Model growth scenarios, expansion channels, and GTM plans |
| `revenue-optimization` | Analyse pricing, conversion funnels, and unit economics |
| `partnership-strategy` | Evaluate and manage IB broker partnerships |
| `strategic-planning` | Quarterly OKRs, roadmap alignment, resource allocation |

---

### 3. Content Engine Agent
> *Content creation and multi-platform publishing*

Plans, scripts, and publishes content across YouTube, Instagram, and LinkedIn. Manages the content calendar and repurposes long-form content into platform-native formats.

| Skill | Purpose |
|-------|---------|
| `youtube-management` | Video planning, scripting, thumbnail briefs, publishing |
| `instagram-management` | Reels, carousels, stories — visual-first prop firm content |
| `linkedin-management` | Thought leadership, founder updates, B2B credibility |
| `content-creation` | Long-form articles, hedge guides, educational material |
| `content-scheduling` | Calendar management, cadence optimisation, batching |
| `video-production` | Storyboards, b-roll lists, editing briefs |

---

### 4. Marketing Agent
> *Acquisition, lead generation, SEO, email, paid ads*

Drives top-of-funnel awareness and mid-funnel nurture. Manages landing page copy, email sequences, paid campaigns, and SEO strategy.

| Skill | Purpose |
|-------|---------|
| `email-marketing` | Drip campaigns, welcome sequences, re-engagement flows |
| `lead-generation` | Lead magnets, gated content, referral programs |
| `newsletter-management` | Weekly/monthly newsletters with conversion hooks |
| `ad-campaigns` | Meta and Google Ads — creative, targeting, budget allocation |
| `landing-page-optimization` | Copy, CTA placement, A/B test recommendations |
| `seo-strategy` | Keyword research, on-page SEO, content gap analysis |

---

### 5. Sales Agent
> *Pipeline management, demos, proposals, CRM*

Qualifies leads, schedules discovery calls, prepares demos, generates proposals, handles objections, and manages the full sales pipeline.

| Skill | Purpose |
|-------|---------|
| `lead-qualification` | BANT/MEDDIC scoring for inbound leads |
| `call-scheduling` | Calendly integration, timezone handling, prep docs |
| `crm-management` | Google Sheets CRM — stage tracking, follow-up cadence |
| `sales-pipeline` | Pipeline health, velocity metrics, forecast modelling |
| `demo-management` | Demo scripts, objection handling, feature showcases |
| `proposal-generation` | Custom proposals with ROI calculations |

---

### 6. Finance Agent
> *Revenue tracking, expenses, IB commissions, tax*

Tracks MRR/ARR, reconciles IB commissions from Vantage and BlackBull, manages expenses via Tide Bank, and prepares UK tax filings.

| Skill | Purpose |
|-------|---------|
| `revenue-tracking` | MRR, ARR, churn, expansion revenue dashboards |
| `expense-management` | Categorise and track all business expenses |
| `ib-commission-tracking` | Reconcile per-lot rebates from broker partners |
| `invoicing` | Generate and track invoices |
| `financial-reporting` | P&L, cash flow, runway calculations |
| `subscription-analytics` | Cohort LTV, plan distribution, upgrade/downgrade flows |

---

### 7. Community Manager Agent
> *Discord, onboarding, retention, feedback*

Manages the Discord server — onboards new users, runs engagement campaigns, triages support tickets, collects product feedback, and organises community events.

| Skill | Purpose |
|-------|---------|
| `discord-management` | Server structure, roles, moderation, bot configuration |
| `user-onboarding` | Welcome flows, getting-started guides, first-value-moment |
| `retention-engagement` | 30/60/90-day check-ins, re-engagement campaigns |
| `feedback-collection` | Structured feedback loops, feature request tracking |
| `community-events` | AMAs, trading sessions, challenge watch parties |
| `support-triage` | Ticket categorisation, priority routing, SLA tracking |

---

### 8. Analytics Agent
> *KPIs, funnels, cohorts, attribution, A/B testing*

Builds dashboards, analyses conversion funnels, runs cohort analyses, models attribution, and automates reporting across all business functions.

| Skill | Purpose |
|-------|---------|
| `kpi-dashboards` | Real-time dashboards for all key business metrics |
| `funnel-analytics` | Visitor → lead → trial → paid conversion analysis |
| `cohort-analysis` | Retention curves, LTV modelling by acquisition cohort |
| `attribution-modeling` | Multi-touch attribution across content, ads, and referrals |
| `ab-testing` | Experiment design, statistical significance, winner selection |
| `reporting-automation` | Scheduled reports to Slack, email, or Notion |

---

### 9. Product Agent
> *Roadmap, bugs, releases, QA, platform integrations*

Manages the product roadmap, triages bugs, synthesises user feedback, plans releases, coordinates MT4/cTrader integrations, and designs QA test plans.

| Skill | Purpose |
|-------|---------|
| `feature-roadmap` | Prioritised roadmap with effort/impact scoring |
| `bug-triage` | Severity classification, reproduction steps, assignment |
| `user-feedback` | Feedback synthesis, theme extraction, priority mapping |
| `release-management` | Release notes, versioning, rollout planning |
| `platform-integration` | MT4, MT5, cTrader — integration specs and testing |
| `qa-automation` | Test plans, regression suites, smoke test checklists |

---

## Repository Structure

```
Orchestrator Hedge Edge/
│
├── .github/agents/              # Agent definitions (.agent.md files)
├── .vscode/                     # Workspace settings & skill discovery config
├── .env.example                 # All required API keys (template)
│
├── Orchestrator Agent/          # Task routing, multi-agent coordination
│   └── .agents/skills/          # 4 skills
│
├── Business Strategist Agent/   # Strategy, growth, competitive intel
│   ├── .agents/skills/          # 6 skills + execution scripts
│   ├── agents/SKILLS.md         # ASE framework reference
│   ├── SOP.md                   # Operating guide
│   └── tmp/                     # Scratch space
│
├── Content Engine Agent/        # YouTube, Instagram, LinkedIn, content
│   └── .agents/skills/          # 6 skills
│
├── Marketing Agent/             # Email, ads, SEO, lead gen
│   └── .agents/skills/          # 6 skills
│
├── Sales Agent/                 # Pipeline, demos, CRM, proposals
│   └── .agents/skills/          # 6 skills
│
├── Finance Agent/               # Revenue, expenses, IB commissions, tax
│   └── .agents/skills/          # 6 skills
│
├── Community Manager Agent/     # Discord, onboarding, retention
│   └── .agents/skills/          # 6 skills
│
├── Analytics Agent/             # KPIs, funnels, cohorts, attribution
│   └── .agents/skills/          # 6 skills
│
├── Product Agent/               # Roadmap, bugs, releases, QA
│   └── .agents/skills/          # 6 skills
│
├── Context/                     # Shared business context & product source
│   ├── hedge-edge-business-context.md
│   └── IB agreement/            # Product repos (front-end, back-end, landing page)
│
└── assets/                      # Shared assets (logo, images)
```

**Total: 9 agents · 52 skills · Deterministic execution scripts**

---

## Getting Started

### Prerequisites

- [VS Code](https://code.visualstudio.com/) with [GitHub Copilot](https://github.com/features/copilot) (agent mode)
- Python 3.10+ (for execution scripts)
- Node.js 18+ (for product repos)
- Git

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/Ryko1141/Hedge-Edge-agentic.git
cd Hedge-Edge-agentic

# 2. Create your environment file
cp .env.example .env
# Fill in your API keys

# 3. (Optional) Create a Python virtual environment for execution scripts
python -m venv .venv
.venv/Scripts/activate  # Windows
# source .venv/bin/activate  # macOS/Linux

# 4. Open in VS Code
code .
```

### Usage

Open any `.agent.md` file in the VS Code Copilot chat panel, or simply describe what you need in natural language:

```
"Analyse our top 5 competitors and summarise their pricing models"
→ Orchestrator routes to Business Strategist → competitive-intelligence skill

"Create a YouTube script about why 90% of prop firm traders fail"
→ Orchestrator routes to Content Engine → youtube-management + content-creation skills

"What's our MRR this month and how do IB commissions compare?"
→ Orchestrator routes to Finance → revenue-tracking + ib-commission-tracking skills

"Onboard a new Discord member and send them the getting-started guide"
→ Orchestrator routes to Community Manager → user-onboarding skill
```

The Orchestrator handles all routing, parallelisation, and result aggregation automatically.

---

## How It's Different

| Traditional Startup | Hedge Edge Agentic Model |
|---------------------|--------------------------|
| Hire 5–15 employees across marketing, sales, finance, etc. | 9 AI agents with codified skills and deterministic execution |
| Knowledge lives in people's heads | Knowledge lives in SKILL.md files — versioned, auditable, transferable |
| Onboarding takes weeks | New skills are built in hours and immediately operational |
| Tribal knowledge lost on turnover | Zero knowledge loss — everything is in the repo |
| Manual handoffs between departments | Orchestrator manages cross-agent workflows automatically |
| Expensive to scale | Near-zero marginal cost per additional task |

---

## Current State (Feb 2026)

| Metric | Value |
|--------|-------|
| Active beta users | ~500 |
| Live platform | MT5 Expert Advisor |
| Coming soon | MT4 EA, cTrader integration |
| IB partnerships | 2 signed (Vantage, BlackBull) |
| Subscription tiers | 4 (Free, Starter, Pro, Hedger) |
| Company | Hedge Edge Ltd — London, UK |

---

## Competitive Moats

1. **Local-first execution** — Zero latency vs cloud-based trade copiers
2. **Capital preservation framing** — Not a signal service, not a copy trader. Hedging = insurance
3. **Multi-platform** — MT4 + MT5 + cTrader (competitors typically support only one)
4. **Community-driven** — Discord as product feedback loop and acquisition channel
5. **Agentic operations** — Near-zero operational overhead with AI-first business management

---

## License

Proprietary — Hedge Edge Ltd. All rights reserved.

---

<p align="center">
  <strong>Hedge Edge</strong> · <a href="https://hedgeedge.io">hedgeedge.io</a> · London, UK
</p>
