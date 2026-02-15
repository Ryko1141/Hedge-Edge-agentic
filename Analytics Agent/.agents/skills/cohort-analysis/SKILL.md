---
name: cohort-analysis
description: |
  Group Hedge Edge users by signup date, acquisition channel, plan tier, and prop firm to track retention curves, revenue trajectories, and behavioral patterns over time. Identify what separates high-retention cohorts from churned ones, correlate hedge performance with retention, and provide actionable segmentation insights for product, marketing, and business strategy decisions.
---

# Cohort Analysis

## Objective

Understand how different groups of Hedge Edge users behave over time  not just as a blended average, but as distinct cohorts with different acquisition stories, usage patterns, and economic value. The goal is to answer: "Which users stick, which users churn, and why?" by decomposing retention and revenue into their cohort-level components and identifying causal patterns that can be amplified or corrected.

## When to Use This Skill

- **Monthly business review**: Standard cohort retention analysis for the monthly analytics report
- **Acquisition channel evaluation**: When comparing long-term value of users from different channels (YouTube vs. paid vs. Discord vs. IB referral)
- **Product change impact**: When measuring whether a feature launch, onboarding change, or pricing update improved retention for subsequent cohorts
- **Churn investigation**: When churn spikes and you need to understand which cohorts are affected and why
- **LTV model calibration**: When recalculating LTV curves based on actual cohort retention data
- **Prop firm segmentation**: When analyzing whether FTMO traders retain differently than The5%ers or TopStep traders
- **Hedge performance correlation**: When testing the hypothesis that better hedge results  higher retention
- **Expansion revenue analysis**: When identifying which cohorts are most likely to upgrade or activate IB

## Input Specification

### Required Inputs
| Field | Source | Description |
|---|---|---|
| cohort_definition | Request parameter | How to group users: signup_week, signup_month, cquisition_channel, plan_tier, prop_firm, or custom |
| date_range | Request parameter | Full period to analyze (e.g., all cohorts from Oct 2025  Feb 2026) |
| etention_intervals | Request parameter | Day 1, 7, 14, 30, 60, 90 (default) or custom intervals |
| supabase_users | Supabase uth.users | User records with created_at, plan_tier, cquisition_source, prop_firm (if tagged) |
| supabase_subscriptions | Supabase subscriptions | Subscription lifecycle: started_at, plan, upgraded_at, canceled_at, status |
| supabase_usage_logs | Supabase usage_logs | Daily activity records: user_id, date, hedges_executed, ccounts_active, ea_connected |
| creem_events | Creem.io API | Payment events for revenue-per-cohort calculation |

### Optional Inputs
| Field | Source | Description |
|---|---|---|
| ib_data | Google Sheets CRM | IB activation status and lot volumes per user |
| discord_join_date | Discord Bot API | When each user joined Discord (for community cohort analysis) |
| hedge_performance | Supabase hedge_results | Win/loss records, drawdown metrics, challenge pass/fail flags per user |
| support_tickets | Supabase/Google Sheets | Ticket count and resolution time per user (for support load by cohort) |
| secondary_dimension | Request parameter | Optional second grouping for 2D cohort analysis (e.g., month  channel) |

## Step-by-Step Process

### Step 1: Cohort Definition & User Assignment
1. Query Supabase for all users within the analysis date range
2. Assign each user to their cohort based on the cohort_definition parameter:
   - **Signup week/month**: Group by created_at truncated to week/month
   - **Acquisition channel**: Group by cquisition_source (youtube, discord, paid_google, paid_meta, organic_search, ib_referral, direct, referral)
   - **Plan tier**: Group by first plan_tier selected (Starter/Pro/Elite/Trial-only)
   - **Prop firm**: Group by prop_firm tag (FTMO, The5%ers, TopStep, Apex, Multiple, Unknown)
   - **Custom**: Accept arbitrary grouping logic (e.g., "users who joined Discord before signing up" vs. "users who didn't")
3. Calculate cohort sizes and ensure minimum cohort size of 20 users for statistical relevance. Flag cohorts <20 as "low sample  interpret with caution."
4. Exclude test accounts and accounts flagged with is_internal = true

### Step 2: Retention Curve Calculation
1. For each cohort, calculate retention at each interval:
   - **Day 1 retention**: % of cohort who logged in / used the app the day after signup
   - **Day 7 retention**: % active in day 5-7 window
   - **Day 14 retention**: % active in day 12-14 window
   - **Day 30 retention**: % still subscribed at day 30 (for paid users: renewal event present)
   - **Day 60 retention**: % still subscribed at day 60
   - **Day 90 retention**: % still subscribed at day 90
2. "Active" definition for product retention: user executed 1 hedge OR had EA connected on that day
3. "Retained" definition for subscription retention: subscription status = ctive on the measurement date (not canceled, not expired, not payment-failed-and-unrecovered)
4. Track both **product retention** (usage-based) and **subscription retention** (payment-based) separately  divergence between them is an early churn signal
5. Build the retention matrix:
`
              Day 1    Day 7    Day 14   Day 30   Day 60   Day 90
Oct 2025      85%      72%      65%      58%      48%      41%
Nov 2025      88%      75%      68%      61%      52%      
Dec 2025      82%      70%      63%      55%              
Jan 2026      90%      78%      71%                      
Feb 2026      87%                                      
`

### Step 3: Revenue Cohort Analysis
1. For each cohort, calculate:
   - **Revenue at month N**: Total MRR contributed by surviving cohort members in month N
   - **Revenue retention**: Month N revenue / Month 0 revenue (captures both churn and expansion)
   - **Cumulative revenue per user**: Running total of revenue generated per cohort member (including churned)
   - **LTV realization curve**: At month 3, 6, 9, 12  how much of estimated LTV has been realized?
2. Compare revenue retention to logo retention  if revenue retention > logo retention, expansion is working (upgrades outpacing churn revenue loss)
3. Calculate **net revenue retention (NRR)** per cohort: (Renewed + Expansion) / Beginning MRR of cohort
4. Track plan migration within cohort: what % upgraded from StarterPro, ProElite, or downgraded

### Step 4: Behavioral Cohort Segmentation
1. Within each cohort, segment users by activation behaviors:
   - **Fully activated**: Connected EA + executed 5 hedges in first 7 days + added 2 accounts
   - **Partially activated**: Connected EA but <5 hedges or only 1 account
   - **Dormant**: Signed up but never connected EA or executed a hedge
2. Calculate retention for each activation segment within the cohort
3. Expected pattern: Fully activated users should retain 2-3x higher than dormant users
4. Identify the **activation threshold**: What's the minimum activity in week 1 that predicts 90-day retention >70%?
   - Test hypotheses: "Users who execute 3 hedges in first 3 days retain at 75%+ at day 90"
   - Find the "aha moment" activity threshold for Hedge Edge

### Step 5: Hedge Performance  Retention Correlation
1. For users with hedge_results data, calculate:
   - Average win rate of hedged positions
   - Average drawdown with Hedge Edge vs. estimated drawdown without
   - Challenge pass rate among Hedge Edge users (if tagged) vs. industry baseline (10-15%)
2. Segment cohorts by hedge performance quartile (top 25%, middle 50%, bottom 25%)
3. Compare retention rates across performance quartiles
4. Key question: Do users who see good hedge results (>60% win rate, <5% drawdown) retain significantly better?
5. If correlation exists, quantify: "Users in the top hedge performance quartile retain at 78% vs. 45% for bottom quartile at day 90  a 33pp gap worth  in LTV difference"

### Step 6: IB Activation Cohort Analysis
1. Track IB broker activation as a cohort-level metric:
   - What % of each cohort activates an IB broker account?
   - How long after signup does IB activation occur (median, P90)?
   - Does IB activation correlate with retention? (Hypothesis: yes  users with broker accounts are more invested)
2. Calculate the dual-revenue value: cohorts with high IB activation generate subscription + commission revenue
3. Compare Vantage vs. BlackBull activation rates and lot volumes by cohort
4. Identify which acquisition channels produce the highest IB activation rates

### Step 7: Cohort Comparison & Insight Generation
1. Rank cohorts by 30-day retention (primary), 90-day retention (secondary), and LTV (tertiary)
2. For the top-performing and bottom-performing cohorts, identify differentiating factors:
   - Acquisition channel distribution
   - Plan tier distribution
   - Activation speed (time-to-first-hedge)
   - Feature adoption (which features did high-retention cohorts use that low-retention didn't?)
   - External factors (product changes, marketing campaigns, seasonal effects)
3. Generate "Cohort DNA" profiles:
`
Best Cohort: Nov 2025 (Week 3)
 Retention: 30d=68%, 60d=55%, 90d=48%
 Acquisition: 60% YouTube, 25% Discord, 15% Other
 Plan Mix: 40% Pro, 35% Elite, 25% Starter
 Activation: 82% connected EA in first 48 hours
 Hedge Performance: Avg 64% win rate
 IB Activation: 35% within 30 days
 What happened: Viral YouTube video "FTMO hedge strategy" drove high-intent traffic
 Lesson: YouTube content targeting specific prop firm challenges attracts highest-quality users
`

### Step 8: Output Generation
1. Build retention matrix heatmap data for Google Sheets (color-coded: green >70%, yellow 50-70%, red <50%)
2. Generate Notion report with cohort narratives, visual tables, and recommended actions
3. Export cohort definitions as segments that Marketing Agent can use for targeted campaigns
4. Flag "at-risk" cohorts: any cohort showing retention drop >10pp faster than the historical average

## Output Specification

### Retention Matrix (Google Sheets)
`
Heatmap with cohorts as rows, retention intervals as columns.
Cell value: retention % (color-coded green/yellow/red)
Marginal row: Average across all cohorts per interval
Marginal column: Cohort size
Additional columns: ARPU, NRR, IB activation rate, activation score
`

### Cohort Report (Notion)
`markdown
# Cohort Analysis Report  [Date Range]

## Summary
- Total cohorts analyzed: [N]
- Best-performing cohort: [Name]  90d retention [X]%
- Worst-performing cohort: [Name]  90d retention [Y]%
- Key differentiator: [Insight]

## Retention Matrix (heatmap table)

## Revenue Cohort Analysis
- NRR by cohort
- LTV realization curves
- Plan migration patterns

## Behavioral Segmentation
- Activation threshold: [X hedges in Y days] predicts [Z]% 90d retention
- Fully activated vs. dormant retention gap: [X]pp

## Hedge Performance  Retention
- Correlation coefficient: [r]
- Top quartile vs. bottom quartile retention gap: [X]pp
- Revenue implication: $[amount] LTV difference

## IB Activation Patterns
- Activation rate by cohort
- IB activation  retention correlation
- Channel affinity for IB activation

## Cohort DNA Profiles
- [Top 3 and bottom 3 cohort profiles]

## Recommended Actions
1. Replicate conditions of best cohort: [specific actions]
2. Intervene in at-risk cohorts: [specific actions]
3. Adjust activation onboarding: [specific actions]
`

## API & Platform Requirements

| Platform | Endpoint/Method | Auth | Purpose |
|---|---|---|---|
| Supabase | /rest/v1/users, /rest/v1/subscriptions, /rest/v1/usage_logs, /rest/v1/hedge_results | SUPABASE_URL + SUPABASE_KEY | User data, subscription lifecycle, usage activity, hedge performance |
| Creem.io | /v1/subscriptions, /v1/events | CREEM_API_KEY | Payment events, revenue per user, plan changes |
| Google Sheets | Sheets API v4 | GOOGLE_SHEETS_API_KEY | IB data, CRM data, dashboard output |
| Notion | /v1/pages, /v1/databases | NOTION_API_KEY | Report storage and distribution |
| Discord Bot | /guilds/{id}/members | DISCORD_BOT_TOKEN | Discord join dates for community cohort analysis |
| n8n | POST N8N_WEBHOOK_URL | Webhook URL | Automated cohort report triggers and alerts |

## Quality Checks

- [ ] **Minimum cohort size**: All analyzed cohorts have 20 users; smaller cohorts flagged with "low sample" warning
- [ ] **Retention calculation consistency**: Day N retention uses the same "active" definition throughout the analysis
- [ ] **No survivor bias**: Retention denominator is original cohort size, not currently-active users
- [ ] **Revenue reconciliation**: Sum of all cohort MRR contributions equals total MRR reported in KPI Dashboards
- [ ] **Maturity awareness**: Don't compare 90-day retention for a 45-day-old cohort (mark immature cells as "")
- [ ] **Product vs. subscription retention separated**: Both tracked, divergence flagged as early warning
- [ ] **Correlation  causation noted**: Hedge performance  retention correlation includes caveat about confounders (e.g., more engaged users both hedge better and retain more)
- [ ] **Activation threshold validated**: Threshold tested against at least 3 cohorts before being declared reliable
- [ ] **Test accounts excluded**: Confirmed no internal/test users in cohort analysis
- [ ] **Comparison is fair**: When comparing cohorts of different sizes, use rates not absolute numbers; confidence intervals included for small cohorts
