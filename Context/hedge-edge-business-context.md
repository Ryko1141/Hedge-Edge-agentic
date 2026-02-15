# Hedge Edge  Shared Business Context
> This file is the single source of truth for all agents. Referenced via the context tool.
> Last updated: 2026-02-15

---

## Company Overview

| Field | Value |
|-------|-------|
| **Legal Name** | Hedge Edge Ltd |
| **Registered Address** | Office 14994, 182-184 High Street North, East Ham, London, E6 2JA |
| **Company Email** | hedgeedgebusiness@gmail.com |
| **Jurisdiction** | England & Wales (Companies House) |
| **Banking** | Tide Bank |
| **Payments** | Creem.io |
| **Auth/Database** | Supabase |
| **Landing Page** | Vercel (hedgeedge.io) |

---

## Product

**What it does**: Desktop application (Electron) providing automated multi-account hedge management for prop firm traders. When a trader opens a position on a prop firm account, the app instantly opens a **reverse position** on a personal broker account  ensuring capital preservation whether the challenge passes or fails.

**Tech Stack**:
- Electron desktop app (Windows primary, Mac planned)
- MT5 Expert Advisor (EA)  **LIVE**
- MT4 EA  **Coming Soon**
- cTrader integration  **Coming Soon**
- Supabase for auth, user management, subscription tracking
- Vercel for landing page hosting
- Creem.io for payment processing

**Competitive Moats**:
1. **Local-first execution**  Zero latency vs cloud-based trade copiers
2. **Capital preservation framing**  Not a signal service, not a copy trader. Hedge = insurance
3. **Multi-platform**  MT4 + MT5 + cTrader (competitors typically support only one)
4. **Community-driven**  Discord as product feedback loop and acquisition channel

---

## Revenue Streams

### 1. SaaS Subscriptions (Primary)

| Tier | Price | Features | Status |
|------|-------|----------|--------|
| Free Guide | $0 | Hedge education PDF + Discord access | **Live** |
| Starter | $29/mo | MT5 EA, 1-2 accounts, basic hedge | **Live** |
| Pro | $30/mo | Multi-account, advanced settings | **Coming Soon** |
| Hedger | $75/mo | Unlimited accounts, priority support, all platforms | **Coming Soon** |

### 2. IB Commissions (Secondary)

Per-lot rebates from partner brokers on referred hedge accounts:

| Broker | Status | Commission Model |
|--------|--------|-----------------|
| **Vantage** | Signed IB agreement | Per-lot rebate on forex, metals, indices |
| **BlackBull** | Signed IB agreement | Per-lot rebate on forex, commodities |

Affiliate links:
- FundingPips: https://app.fundingpips.com/register?ref=2c2214bc
- BlackBull: https://blackbull.com/en/live-account/?cmp=5p0z2d3q&refid=6478
- Heron Copier: https://heroncopier.com/?atp=PbyKL9

### 3. Free Tier Funnel

Free hedge guide + Discord community  educate  convert to paid subscribers

---

## Target Customer

**Primary**: Prop firm traders running evaluations at:
- FTMO
- The5%ers
- TopStep
- Apex Trader Funding
- MyForexFunds (and similar)

**Profile**:
- Sophisticated enough to run multiple MT4/MT5 terminals
- Frustrated by manual hedging complexity
- Running 1-10 funded/evaluation accounts simultaneously
- Typical challenge sizes: $10K  $200K
- Pain point: ~85-90% of prop firm challenges fail. Hedging protects capital regardless of outcome

---

## Current State (Feb 2026)

- **Users**: ~500 active beta users
- **MRR**: Growing (Starter tier live)
- **Platforms**: MT5 EA live, MT4 and cTrader in development
- **Community**: Active Discord server
- **IB Agreements**: 2 signed (Vantage, BlackBull)
- **Team**: Lean founding team

---

## Marketing Funnel

```
Content Engine  Attention Layer  Capture & Identity  CRM  Sales  Delivery  Retention  Analytics
```

| Stage | Channels/Tools | KPIs |
|-------|---------------|------|
| Content Engine | YouTube, LinkedIn, Instagram | Watch time, Retention curve, Content ROI |
| Attention Layer | Welcome email, Value prop, Newsletter | CTR, CPC, Engagement rate, Open rate |
| Capture & Identity | Lead forms, Discord join | Lead capture rate, Lead-to-qualified ratio |
| CRM / Data Core | Google Sheets + n8n | Data freshness, enrichment rate |
| Sales & Monetization | Sales calls, demos | Close rate, Show-up rate, Sales cycle length |
| Delivery | Onboarding, training | Support tickets per user |
| Retention & Expansion | Discord check-ins, upsell | 30/60/90 day retention, LTV, Churn, Referral rate |
| Analytics | All data sources | CAC vs LTV, Conversion rate, Content-assisted revenue |

---

## Agent Architecture

| Agent | Domain | Key Skills |
|-------|--------|------------|
| **Orchestrator** | Task routing, multi-agent coordination | agent-routing, task-decomposition, cross-agent-coordination, status-reporting |
| **Business Strategist** | Strategy, growth, competitive intel | prop-firm-market-research, competitive-intelligence, growth-strategy, revenue-optimization, partnership-strategy, strategic-planning |
| **Content Engine** | Content creation & publishing | youtube-management, instagram-management, linkedin-management, content-creation, content-scheduling, video-production |
| **Marketing** | Lead gen, email, ads, SEO | email-marketing, lead-generation, newsletter-management, ad-campaigns, landing-page-optimization, seo-strategy |
| **Sales** | Pipeline, demos, CRM | lead-qualification, call-scheduling, crm-management, sales-pipeline, demo-management, proposal-generation |
| **Finance** | Revenue, expenses, tax, IB commissions | revenue-tracking, expense-management, ib-commission-tracking, invoicing, financial-reporting, subscription-analytics |
| **Community Manager** | Discord, onboarding, retention | discord-management, user-onboarding, retention-engagement, feedback-collection, community-events, support-triage |
| **Analytics** | KPIs, funnels, cohorts, attribution | kpi-dashboards, funnel-analytics, cohort-analysis, attribution-modeling, ab-testing, reporting-automation |
| **Product** | Roadmap, bugs, releases, QA | feature-roadmap, bug-triage, user-feedback, release-management, platform-integration, qa-automation |

---

## Key Platforms & Services

| Platform | Purpose | Agent(s) Using |
|----------|---------|---------------|
| Supabase | Auth, DB, user management | All |
| Creem.io | Payments, subscriptions | Finance, Sales, Analytics |
| Vercel | Landing page hosting | Marketing, Product |
| Discord | Community, support, onboarding | Community Manager, Sales, Content Engine |
| Tide Bank | Business banking | Finance |
| Google Sheets | CRM, financial models | Sales, Finance, Analytics |
| n8n | Workflow automation | All |
| Notion | Documentation, planning | All |
| YouTube | Video content | Content Engine |
| Instagram | Visual content | Content Engine |
| LinkedIn | Professional content | Content Engine |
| Vantage | IB broker partner | Finance, Business Strategist |
| BlackBull | IB broker partner | Finance, Business Strategist |
| Sentry | Error tracking | Product |
| GitHub | Code management | Product |

---

## Prop Firm Economics (Reference)

- **Challenge fee**: $100  $1,000+ depending on account size
- **Failure rate**: ~85-90% of traders fail challenges
- **Payout split**: 80/20  90/10 (firm/trader) depending on scaling
- **Hedge Edge value prop**: Even if you fail the challenge, you recovered capital on the hedge side. Even if you pass, you banked extra on the hedge
- **Average trader runs**: 2-5 simultaneous challenges
- **Key prop firms**: FTMO, The5%ers, TopStep, Apex Trader Funding, MyForexFunds
