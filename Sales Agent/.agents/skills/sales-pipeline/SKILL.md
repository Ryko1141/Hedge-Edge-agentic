---
name: sales-pipeline
description: |
  Tracks all Hedge Edge deals through pipeline stages, forecasts monthly recurring revenue,
  identifies stuck or at-risk opportunities, and provides actionable pipeline health reports.
  Enables data-driven sales decisions with prop-firm-specific deal intelligence.
---

# Sales Pipeline

## Objective

Provide real-time visibility into every active Hedge Edge deal from first qualification to close.
Forecast MRR growth, flag stalled opportunities before they go cold, and surface patterns
(e.g., "FTMO traders close 2 faster than Apex traders") that sharpen the sales playbook.

## When to Use This Skill

- A pipeline health report or revenue forecast is requested.
- A deal has been stuck in the same stage for longer than the stage SLA.
- Weekly pipeline review meeting prep is needed.
- A tier-upgrade opportunity is detected (e.g., Starter subscriber adding accounts).
- Win/loss analysis is requested after a deal closes.
- IB revenue pipeline needs separate tracking and forecasting.

## Input Specification

`yaml
pipeline_request:
  type: enum[health_report, forecast, stuck_deals, deal_detail, win_loss_analysis, ib_pipeline, weekly_review]
  required: true

filters:
  date_range:
    start: date | null
    end: date | null
  stage: list[string] | null              # filter by specific stages
  tier: list[enum[starter, pro, hedger]] | null
  source: list[enum[discord, landing_page, free_guide, referral, ib_partner]] | null
  prop_firm: list[string] | null          # e.g. ["FTMO", "The5%ers"]
  min_score: integer | null
  assigned_to: string | null

deal_id: string | null                    # for deal_detail requests
`

## Step-by-Step Process

### Step 1  Aggregate Pipeline Data
1. Pull all active deals from Google Sheets CRM ("Leads" tab where stage is NOT closed_won or closed_lost).
2. Pull corresponding Notion deal cards for enriched context (notes, attachments, linked interactions).
3. Query Supabase for current subscription status of any leads who already have accounts.
4. Query Creem.io for recent payment events to catch upgrades, downgrades, or failed payments that affect pipeline value.

### Step 2  Execute Requested Analysis

**health_report:**
1. Calculate pipeline metrics:
   - **Total pipeline value**: sum of MRR  12 (annual contract value proxy) for all active deals, weighted by stage probability:
     - qualified = 10%, discovery_call_booked = 20%, demo_scheduled = 35%, demo_completed = 50%, proposal_sent = 65%, 
egotiation = 80%
   - **Deal count by stage**: histogram of deals per stage.
   - **Average deal age**: mean days since created_at for active deals.
   - **Conversion rates between stages**: e.g., 70% of demo_completed  proposal_sent.
   - **Velocity**: average days per stage transition.
2. Break down by tier:
   - Starter deals (/mo  12 =  ACV)
   - Pro deals (/mo  12 =  ACV)
   - Hedger deals (/mo  12 =  ACV)
3. Flag anomalies: stages with conversion rate < 50%, deals with age > 2 the stage SLA.

**forecast:**
1. Use weighted pipeline to project MRR for the next 30, 60, and 90 days.
2. Factor in historical close rates by tier and source.
3. Add IB commission forecast: estimated new Vantage/BlackBull accounts  average monthly commission per account.
4. Present three scenarios: conservative (use lower-bound close rates), expected (historical average), optimistic (upper-bound).
5. Track against monthly MRR target.

**stuck_deals:**
1. Define stage SLAs:
   - qualified  discovery_call_booked: 3 days max
   - discovery_call_booked  demo_scheduled: 5 days max
   - demo_scheduled  demo_completed: 7 days max (accounts for scheduling lag)
   - demo_completed  proposal_sent: 2 days max
   - proposal_sent  
egotiation or closed_*: 5 days max
   - 
egotiation  closed_*: 7 days max
2. Flag any deal exceeding its stage SLA.
3. For each stuck deal, generate a recommended action:
   - "Lead went silent after demo  send a recap email with the ROI calculation for their 4 FTMO accounts."
   - "Proposal sent 6 days ago, no response  follow up via Discord DM with a limited-time IB bonus offer."
   - "Discovery call booked but no-showed  trigger no-show sequence from call-scheduling skill."
4. Prioritise stuck deals by pipeline value (Hedger > Pro > Starter).

**deal_detail:**
1. Pull the complete record for deal_id: lead data, all interactions, stage history, proposal details, payment status.
2. Calculate days in pipeline and days in current stage.
3. List all touchpoints chronologically.
4. Show the recommended next action and optimal timing.

**win_loss_analysis:**
1. Pull all closed_won and closed_lost deals in the specified date range.
2. Calculate:
   - Overall win rate
   - Win rate by tier, source, prop firm, and platform
   - Average sales cycle length for wins vs. losses
   - Most common loss reasons (price, timing, no need, competitor, went silent)
   - Revenue from closed-won deals (MRR and ACV)
3. Surface actionable insights: "Traders from FTMO close at 42% vs. 18% from Apex  prioritise FTMO-sourced leads."

**ib_pipeline:**
1. Track leads who opened Vantage or BlackBull accounts via Hedge Edge IB links.
2. Calculate: conversion rate (subscriber  IB-referred broker account), estimated monthly commission per account, total IB revenue pipeline.
3. Identify subscribers who are NOT yet using Vantage/BlackBull  these are IB upsell opportunities.
4. Forecast IB commission revenue alongside SaaS MRR.

**weekly_review:**
1. Compile a structured weekly summary:
   - New leads added this week (count, sources, average score)
   - Deals that advanced a stage
   - Deals closed (won + lost, with revenue and loss reasons)
   - Stuck deals requiring attention
   - MRR added this week, total MRR
   - IB conversions this week
   - Key actions for next week

## Output Specification

`yaml
pipeline_output:
  report_type: string
  generated_at: datetime
  summary: string                         # 23 sentence executive summary
  metrics:
    total_pipeline_value_weighted: float
    total_pipeline_value_unweighted: float
    active_deal_count: integer
    deals_by_stage: dict[string, integer]
    deals_by_tier: dict[string, integer]
    average_deal_age_days: float
    mrr_current: float
    mrr_forecast_30d: float
    mrr_forecast_60d: float
    mrr_forecast_90d: float
    close_rate_overall: float
    ib_revenue_current: float
    ib_revenue_forecast: float
  stuck_deals: list[object]               # each with deal_id, stage, days_stuck, recommended_action
  insights: list[string]                  # actionable observations
  action_items: list[object]              # prioritised next steps with owners and deadlines
`

## API & Platform Requirements

| Platform | Variable | Operations Used |
|---|---|---|
| Google Sheets | GOOGLE_SHEETS_API_KEY | Read all rows from Leads and Interaction Log tabs |
| Notion | NOTION_API_KEY | Query Sales Pipeline database with filters; read deal card details |
| Supabase | SUPABASE_URL, SUPABASE_KEY | Query subscription status, usage metrics, IB linkage |
| Creem.io | CREEM_API_KEY | Fetch recent payment events, subscription statuses |
| n8n | N8N_WEBHOOK_URL | Trigger stuck-deal follow-up workflows, weekly report distribution |

## Quality Checks

- [ ] Pipeline value calculations use weighted probabilities by stage  never raw unweighted sums in forecasts.
- [ ] Stage SLAs are enforced: every deal exceeding its SLA appears in the stuck-deals list.
- [ ] Forecast includes both SaaS MRR and IB commission revenue as separate line items.
- [ ] Win/loss analysis includes at least 3 actionable insights, not just raw numbers.
- [ ] Weekly review is generated every Monday by 09:00 UTC and distributed via n8n webhook.
- [ ] Deal counts in the pipeline report match the actual CRM row count  reconciliation check on every report.
- [ ] Tier-specific ACV values are correct: Starter=, Pro=, Hedger=.
- [ ] No deal appears in both active pipeline and closed lists simultaneously.
- [ ] IB pipeline tracks conversion from subscriber  IB account, not just lead  subscriber.
