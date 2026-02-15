---
name: kpi-dashboards
description: |
  Build and maintain real-time KPI dashboards for Hedge Edge. Track MRR waterfall, subscriber distribution by plan tier, IB commission revenue, daily/weekly/monthly active users, churn events, and top-line business health metrics. Pull live data from Supabase, Creem.io, Google Sheets, and Vercel Analytics. Output structured dashboards to Google Sheets and formatted reports to Notion.
---

# KPI Dashboards

## Objective

Provide Hedge Edge leadership and all agents with a single source of truth for business-critical metrics. Every dashboard must update automatically, surface anomalies within 24 hours, and connect each metric to a revenue or retention lever. The goal is zero ambiguity  anyone should be able to open the dashboard and know exactly how the business is performing today vs. last week vs. last month.

## When to Use This Skill

- **Daily health check**: Automated morning snapshot of MRR, new signups, churn events, IB activations
- **Stakeholder requests**: When any agent or team member asks "how are we doing on [metric]?"
- **Anomaly detection**: When a metric deviates >15% from its trailing 7-day average
- **Board/investor updates**: When preparing summary metrics for external stakeholders
- **New metric onboarding**: When a new KPI needs to be added to tracking (e.g., MT4 adoption when launched)
- **Goal tracking**: When monitoring progress against monthly/quarterly OKRs

## Input Specification

### Required Inputs
| Field | Source | Description |
|---|---|---|
| date_range | Request parameter | Reporting period (e.g., 2026-02-01 to 2026-02-15, last_7_days, mtd, last_month) |
| supabase_users | Supabase uth.users table | User records with created_at, plan_tier, status, cquisition_source |
| supabase_subscriptions | Supabase subscriptions table | Active/churned/trialing subscription records with plan, mount, started_at, canceled_at |
| creem_events | Creem.io API /events | Payment events: subscription.created, subscription.renewed, subscription.canceled, payment.failed, subscription.upgraded, subscription.downgraded |
| ib_activations | Google Sheets CRM | IB broker signups with user_id, roker (Vantage/BlackBull), kyc_status, irst_deposit_date, monthly_lots |

### Optional Inputs
| Field | Source | Description |
|---|---|---|
| ercel_metrics | Vercel Analytics API | Page views, unique visitors, bounce rate, Core Web Vitals |
| ga4_events | GA4 API | Landing page conversion events, UTM-tagged traffic sources |
| discord_metrics | Discord Bot API | Daily active members, messages/day, support thread count |
| comparison_period | Request parameter | Period to compare against (default: previous period of same length) |

## Step-by-Step Process

### Step 1: Data Collection & Validation
1. Query Supabase for current user and subscription state:
   - Total registered users, total active subscribers, total trialing users
   - Breakdown by plan: Starter ($29), Pro ($49), Elite ($75)
   - Filter out test accounts (flag accounts with @hedgeapptech.com domain or is_test = true)
2. Pull Creem.io payment events for the reporting period:
   - New subscriptions, renewals, upgrades, downgrades, cancellations, failed payments
   - Match Creem customer IDs to Supabase user IDs
3. Cross-validate: Supabase active subscriber count must match Creem.io active subscription count 2%. If discrepancy >2%, flag as DATA_INTEGRITY_WARNING and list mismatched records.
4. Pull IB data from Google Sheets CRM: active IB accounts, KYC completion rates, monthly lot volumes by broker.

### Step 2: MRR Waterfall Calculation
1. **New MRR**: Sum of first-time subscription payments in period
2. **Expansion MRR**: Revenue from upgrades (StarterPro = +$20, StarterElite = +$46, ProElite = +$26)
3. **Contraction MRR**: Revenue lost from downgrades
4. **Churned MRR**: Revenue lost from cancellations (separate voluntary vs. involuntary/payment failure)
5. **Reactivation MRR**: Revenue from previously-churned users resubscribing
6. **Net New MRR** = New + Expansion + Reactivation - Contraction - Churned
7. **Ending MRR** = Beginning MRR + Net New MRR
8. Calculate MRR growth rate (MoM) and project 30/60/90 day MRR using trailing growth rate

### Step 3: Subscriber Health Metrics
1. **Plan distribution**: Count and percentage per tier. Calculate ARPU (Average Revenue Per User) = Total MRR / Active subscribers.
2. **Trial metrics**: Active trials, trial start rate (signups that start trial / total signups), trial-to-paid conversion rate (historically and for current cohort).
3. **Churn metrics**: Logo churn rate (churned users / beginning-of-period users), Revenue churn rate (churned MRR / beginning MRR). Separate voluntary vs. involuntary. Track dunning recovery rate for failed payments.
4. **Quick ratio**: (New MRR + Expansion MRR + Reactivation MRR) / (Churned MRR + Contraction MRR). Target >4.0 for healthy growth.

### Step 4: IB Commission Dashboard
1. Pull monthly lot volumes per user per broker from Google Sheets CRM
2. Calculate commission revenue: lots  commission-per-lot rate (varies by broker agreement)
3. Track IB funnel: Total users  IB link clicked  Signup complete  KYC verified  First deposit  First trade  Monthly active
4. Calculate IB revenue as % of total revenue (subscription + IB)
5. Track IB activation rate: % of paying subscribers who have activated at least one IB broker account

### Step 5: Engagement & Usage Metrics
1. Query Supabase usage logs for:
   - Daily Active Users (DAU), Weekly Active Users (WAU), Monthly Active Users (MAU)
   - DAU/MAU ratio (stickiness  target >25% for B2B SaaS)
   - Average hedges executed per user per day/week
   - MT5 EA connection uptime per user
   - Average accounts managed per user
2. Pull Discord engagement: daily messages, active members, support threads opened/resolved
3. Pull Vercel landing page metrics: traffic, bounce rate, avg session duration

### Step 6: Dashboard Assembly & Output
1. Structure all metrics into the dashboard template (see Output Specification)
2. Write to Google Sheets dashboard with conditional formatting:
   - Green: metric at or above target
   - Yellow: metric within 10% of target
   - Red: metric >10% below target or anomaly detected
3. Generate Notion report page with narrative summary and embedded charts
4. If any metric has DATA_INTEGRITY_WARNING, place alert at top of dashboard

### Step 7: Anomaly Detection & Alerts
1. Compare each metric against its trailing 7-day and 30-day moving averages
2. Flag if current value deviates >2 standard deviations from the moving average
3. For critical metrics (MRR, churn, signups), trigger n8n webhook to send Discord/email alert
4. Log anomaly with timestamp, metric name, expected range, actual value, and potential causes

## Output Specification

### Google Sheets Dashboard Structure
`
Tab 1: Executive Summary
 MRR (current, MoM change, 90-day projection)
 Active Subscribers (total, by plan, ARPU)
 Quick Ratio
 CAC:LTV Ratio (blended)
 Net Revenue Retention
 IB Revenue % of Total

Tab 2: MRR Waterfall
 Beginning MRR
 + New MRR (count, amount)
 + Expansion MRR (count, amount)
 + Reactivation MRR (count, amount)
 - Contraction MRR (count, amount)
 - Churned MRR (voluntary count/amount, involuntary count/amount)
 = Ending MRR

Tab 3: Subscriber Detail
 Plan Distribution (pie chart + table)
 Trial Pipeline (active trials, conversion rate, days-to-convert)
 Churn Detail (logo churn, revenue churn, reasons breakdown)
 Dunning (failed payments, recovery rate, recovered revenue)

Tab 4: IB Commissions
 Revenue by Broker (Vantage, BlackBull)
 IB Funnel (signup  KYC  deposit  active)
 Lots per User (distribution, average, median)
 IB Activation Rate Trend

Tab 5: Engagement
 DAU / WAU / MAU with stickiness ratio
 Hedges per User (daily, weekly)
 Feature Adoption (MT5 EA usage, account count distribution)
 Discord Engagement (messages, members, threads)

Tab 6: Landing Page
 Traffic (sessions, unique visitors, source breakdown)
 Bounce Rate & Avg Session Duration
 Core Web Vitals (LCP, FID, CLS)
 Conversion Events (signup clicks, trial starts)
`

### Notion Report Format
`markdown
# Hedge Edge KPI Report  [Date Range]
## Traffic Light Summary
 [Metrics on target] |  [Metrics at risk] |  [Metrics below target]
## Key Highlights (3-5 bullet points)
## MRR & Revenue (waterfall chart + narrative)
## Subscriber Health (plan mix, churn, trials)
## IB Commission Performance
## Engagement & Usage
## Anomalies & Warnings
## Recommended Actions (ranked by revenue impact)
`

### Alert Format (Discord/Email via n8n)
`
 ANALYTICS ALERT  [Metric Name]
Current: [value] | Expected Range: [range]
Deviation: [+/- %] from 7-day average
Possible Causes: [list]
Dashboard Link: [Google Sheets URL]
`

## API & Platform Requirements

| Platform | Endpoint/Method | Auth | Rate Limits |
|---|---|---|---|
| Supabase | REST API (/rest/v1/users, /rest/v1/subscriptions, /rest/v1/usage_logs) | SUPABASE_URL + SUPABASE_KEY (service role) | 1000 req/sec |
| Creem.io | REST API (/v1/subscriptions, /v1/events, /v1/customers) | CREEM_API_KEY (Bearer token) | Per plan limits |
| Google Sheets | Sheets API v4 (spreadsheets.values.update, spreadsheets.batchUpdate) | GOOGLE_SHEETS_API_KEY + OAuth2 service account | 300 req/min |
| Notion | REST API v1 (/v1/pages, /v1/databases) | NOTION_API_KEY (Bearer token) | 3 req/sec |
| Vercel Analytics | REST API (/v1/analytics) | VERCEL_ANALYTICS_TOKEN | 100 req/hr |
| GA4 | Data API v1 (unReport, atchRunReports) | GA4_MEASUREMENT_ID + GA4_API_SECRET | 10 req/sec |
| Discord | Bot API (/channels/{id}/messages) | DISCORD_BOT_TOKEN | 50 req/sec |
| n8n | Webhook trigger (POST to N8N_WEBHOOK_URL) | Webhook URL with optional auth header | No hard limit |

## Quality Checks

- [ ] **Data integrity**: Supabase subscriber count matches Creem.io active subscriptions within 2%
- [ ] **Completeness**: All 6 dashboard tabs populated with current-period data
- [ ] **Timeliness**: Dashboard data is <24 hours old for daily metrics, <1 hour for real-time alerts
- [ ] **MRR reconciliation**: Beginning MRR + Net New MRR = Ending MRR (must balance exactly)
- [ ] **Denominator visibility**: Every rate/percentage shows the numerator and denominator
- [ ] **Trend context**: Every metric includes MoM and WoW comparison
- [ ] **Target benchmarks**: Each metric has a defined target (green/yellow/red thresholds)
- [ ] **Anomaly coverage**: Anomaly detection runs on all Tier 1 metrics (MRR, churn, signups, IB revenue)
- [ ] **No stale data**: If any data source fails to respond, dashboard shows last-updated timestamp and warning
- [ ] **Test account exclusion**: All metrics exclude internal/test accounts
