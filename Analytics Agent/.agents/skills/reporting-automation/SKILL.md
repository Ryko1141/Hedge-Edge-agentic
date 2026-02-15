---
name: reporting-automation
description: |
  Build automated data pipelines via n8n that collect, transform, and distribute Hedge Edge analytics reports on daily, weekly, and monthly cadences. Push formatted dashboards to Google Sheets, narrative reports to Notion, alert summaries to Discord, and executive digests to email. Handle data freshness monitoring, error recovery, cross-platform data synchronization, and stakeholder-appropriate formatting to ensure every team member and agent has the right data at the right time without manual intervention.
---

# Reporting Automation

## Objective

Eliminate all manual data collection, transformation, and distribution tasks. Every recurring analytics deliverable  from the daily MRR snapshot to the monthly cohort report  should run automatically, arrive on time, surface anomalies immediately, and degrade gracefully when data sources are unavailable. The goal is to make data access effortless so that decision speed is limited by thinking, not by waiting for reports.

## When to Use This Skill

- **New report setup**: When a new recurring report is needed (e.g., weekly IB commission report, daily churn alert)
- **Pipeline creation**: When data needs to flow from one platform to another on a schedule (Supabase  Google Sheets, Creem.io  Notion)
- **Alert configuration**: When real-time or near-real-time alerts are needed for metric anomalies
- **Report modification**: When an existing automated report needs new metrics, changed formatting, or different recipients
- **Pipeline debugging**: When an automated report fails, delivers stale data, or produces incorrect numbers
- **Stakeholder onboarding**: When a new team member, agent, or stakeholder needs to receive reports
- **Data freshness monitoring**: When ensuring all dashboards and reports reflect current data
- **Cross-platform sync**: When data from multiple sources (Supabase, Creem, GA4, Sheets) needs to be unified on a schedule

## Input Specification

### Required Inputs
| Field | Source | Description |
|---|---|---|
| eport_type | Request parameter | Type: daily_snapshot, weekly_funnel, monthly_review, cohort_update, ttribution_report, custom |
| cadence | Request parameter | Frequency: ealtime (webhook-triggered), hourly, daily (default 7am UTC), weekly (Monday 8am UTC), monthly (1st of month 8am UTC) |
| data_sources | Request parameter | List of platforms to pull from: supabase, creem, ga4, ercel, discord, sheets |
| destinations | Request parameter | Where to send: google_sheets, 
otion, discord_channel, email, 
8n_webhook |
| ecipients | Request parameter | Who receives: agent names, Discord channel IDs, email addresses, or ll_stakeholders |

### Optional Inputs
| Field | Source | Description |
|---|---|---|
| lert_thresholds | Request parameter | Metric-specific thresholds that trigger immediate alerts (e.g., "churn >5 users/day", "MRR drops >3% WoW") |
| ormatting_preferences | Request parameter | Output format: executive_summary (3-5 bullets), detailed (full tables), aw_data (CSV/JSON) |
| etry_policy | Request parameter | On failure: etry_3x (default), etry_then_alert, skip_and_log |
| data_freshness_sla | Request parameter | Maximum acceptable data age (default: daily reports use data <24hr old, weekly <48hr) |
| comparison_period | Request parameter | Auto-include comparison: previous_period, same_period_last_month, custom |

## Step-by-Step Process

### Step 1: Pipeline Architecture Design
1. Define the data flow for the requested report:
   `
   Example: Daily MRR Snapshot Pipeline
   
   Trigger: n8n Cron  07:00 UTC daily
   
    Step 1: Query Supabase (active subscriptions, new signups, churned users)
       Validate: Row count > 0, no null plan_tier values
   
    Step 2: Query Creem.io (payment events last 24h: new, renewed, canceled, failed)
       Validate: Event timestamps within last 24h
   
    Step 3: Cross-reference Supabase  Creem.io subscriber counts
       If mismatch >2%: Set DATA_INTEGRITY_WARNING flag
   
    Step 4: Calculate metrics
       Current MRR (sum of active subscription amounts)
       Net new MRR (new + expansion - contraction - churned)
       New signups (last 24h)
       Churn events (last 24h, voluntary vs. involuntary)
       IB activations (from Sheets CRM)
       Quick Ratio
   
    Step 5: Format output
       Google Sheets: Update "Daily Snapshot" tab with new row
       Discord: Post formatted summary to #analytics channel
       If anomaly detected: Post alert to #alerts channel
   
    Step 6: Log execution
        Timestamp, duration, data source status, row counts
        Error flag if any step failed
   `

2. Map all recurring reports to their pipeline architecture:

| Report | Cadence | Sources | Destinations | Key Metrics |
|---|---|---|---|---|
| Daily MRR Snapshot | Daily 7am UTC | Supabase, Creem.io, Sheets | Google Sheets, Discord | MRR, new signups, churns, IB activations |
| Weekly Funnel Report | Monday 8am UTC | GA4, Vercel, Supabase, Creem.io | Google Sheets, Notion, Discord | Full-funnel conversion rates, WoW changes |
| Weekly Channel Report | Monday 8am UTC | GA4, Supabase, Discord | Google Sheets, Notion | Attribution by channel, CAC:LTV per channel |
| Monthly Business Review | 1st of month 8am UTC | All sources | Notion, Google Sheets, Email | MRR waterfall, cohort retention, full dashboard |
| Monthly Cohort Update | 1st of month 10am UTC | Supabase, Creem.io | Google Sheets, Notion | Retention matrix update, cohort DNA profiles |
| Monthly IB Report | 1st of month 9am UTC | Sheets CRM, Supabase | Google Sheets, Notion | IB revenue, lots, activation rates by broker |
| Real-time Churn Alert | Event-triggered | Creem.io webhook | Discord #alerts, Email | Each cancellation with user details and risk flag |
| Real-time Signup Alert | Event-triggered | Supabase webhook | Discord #growth | New signup with source attribution |
| Real-time Payment Failure | Event-triggered | Creem.io webhook | Discord #alerts, n8n dunning flow | Failed payment with retry status |

### Step 2: n8n Workflow Construction
For each pipeline, build the n8n workflow with these standard components:

1. **Trigger node**:
   - Cron trigger for scheduled reports (with timezone = UTC)
   - Webhook trigger for real-time alerts (Creem.io and Supabase webhooks)
   - Manual trigger for on-demand report generation
2. **Data collection nodes** (one per source):
   - **Supabase HTTP node**: REST API call with SUPABASE_URL + SUPABASE_KEY headers
     - Query: /rest/v1/subscriptions?status=eq.active&select=plan,amount,created_at
     - Pagination: Handle via Range header for datasets >1000 rows
   - **Creem.io HTTP node**: REST API call with CREEM_API_KEY bearer token
     - Query: /v1/events?created_after={yesterday_iso}&type=subscription.*
   - **GA4 HTTP node**: Data API v1 unReport with service account OAuth
     - Dimensions: sessionSource, sessionMedium, date
     - Metrics: sessions, conversions, 
ewUsers
   - **Google Sheets node**: Native n8n Google Sheets node for CRM/IB data reads
   - **Vercel HTTP node**: Analytics API with bearer token for landing page metrics
   - **Discord HTTP node**: Bot API for community metrics (member count, message count)
3. **Validation nodes**:
   - Check each data source response for:
     - HTTP 200 status (non-200 triggers error path)
     - Non-empty response body
     - Expected schema (required fields present)
     - Data freshness (most recent record timestamp within SLA)
   - Log validation results for debugging
4. **Transformation nodes** (n8n Function or Code nodes):
   - Calculate derived metrics (MRR, growth rates, conversion rates, deltas)
   - Apply comparison logic (calculate WoW and MoM changes)
   - Format numbers (currency, percentages, with proper rounding)
   - Apply conditional logic for traffic-light status ()
5. **Output nodes** (one per destination):
   - **Google Sheets**: Append row or update specific cells in the dashboard spreadsheet
   - **Notion**: Create or update a page in the reports database using Notion API
   - **Discord**: Send formatted message to appropriate channel (#analytics, #alerts, #growth)
   - **Email**: Send via n8n email node or SMTP to stakeholder distribution list
6. **Error handling nodes**:
   - On data source failure: Retry up to 3 times with exponential backoff (10s, 30s, 90s)
   - If all retries fail: Use last successful data with STALE_DATA flag + alert to #alerts
   - Log all errors with: timestamp, source, error code, response body, retry attempt

### Step 3: Data Transformation Templates

#### Daily Snapshot Format (Discord)
`
 **Hedge Edge Daily Snapshot  {date}**

 **MRR**:  ({mrr_delta} vs yesterday)
 **New Signups**: {new_signups} (trailing 7d avg: {avg_7d})
 **Trial Starts**: {trial_starts}
 **New Paid**: {new_paid} ({plans_breakdown})
 **Churned**: {churned} (voluntary: {vol}, involuntary: {invol})
 **IB Activations**: {ib_activations} (Vantage: {v}, BlackBull: {bb})
 **Quick Ratio**: {quick_ratio}
{anomaly_section}

 Full dashboard: {sheets_url}
`

#### Weekly Report Format (Notion)
`markdown
# Weekly Analytics Report  {week_start} to {week_end}

## Traffic Light Summary
 On target: {green_metrics}
 At risk: {yellow_metrics}
 Below target: {red_metrics}

## Key Numbers
| Metric | This Week | Last Week | Δ | Target | Status |
|---|---|---|---|---|---|
| MRR |  |  | {delta}% |  | {status} |
| New Signups | {signups} | {signups_prev} | {delta}% | {target} | {status} |
| TrialPaid CVR | {cvr}% | {cvr_prev}% | {delta}pp | {target}% | {status} |
| Churn Rate | {churn}% | {churn_prev}% | {delta}pp | <{target}% | {status} |
| IB Revenue |  |  | {delta}% |  | {status} |

## Funnel This Week
[Full funnel conversion table from Funnel Analytics skill output]

## Top 3 Insights
1. {insight_1}
2. {insight_2}
3. {insight_3}

## Recommended Actions
1. {action_1}  Expected impact: /mo
2. {action_2}  Expected impact: /mo
3. {action_3}  Expected impact: /mo
`

#### Real-time Churn Alert Format (Discord)
`
 **CHURN ALERT**

 User: {user_id} ({email})
 Plan: {plan} (/mo)
 Tenure: {months} months
 Lifetime Value: 
 Reason: {cancellation_reason}
 Acquisition Source: {source}
 Recovery Action: {dunning_status / win-back trigger}

Monthly churn so far: {mtd_churn_count} ({mtd_churn_rate}%)
`

### Step 4: Data Freshness Monitoring
1. For each automated report, track:
   - **Last successful run**: Timestamp of most recent successful execution
   - **Data source freshness**: Timestamp of most recent record from each source
   - **Expected next run**: Based on cadence
2. Build a meta-dashboard (Google Sheets tab: "Pipeline Health"):
   `
   | Pipeline | Cadence | Last Run | Status | Next Run | Data Age |
   |---|---|---|---|---|---|
   | Daily Snapshot | Daily 7am | 2026-02-15 07:01 |  Success | 2026-02-16 07:00 | 12min |
   | Weekly Funnel | Mon 8am | 2026-02-10 08:03 |  Success | 2026-02-17 08:00 | 5d |
   | Churn Alert | Real-time | 2026-02-15 14:22 |  Fired | Webhook | 0min |
   | Monthly Review | 1st 8am | 2026-02-01 08:15 |  Stale GA4 | 2026-03-01 08:00 | 14d |
   `
3. If a pipeline misses its scheduled run by >1 hour, trigger alert to #alerts
4. If data from any source is older than the freshness SLA, flag report as STALE_DATA with last-known-good timestamp

### Step 5: Error Recovery & Graceful Degradation
1. **Retry logic**: 3 retries with exponential backoff for all API calls
2. **Partial data handling**: If one source fails but others succeed:
   - Generate the report with available data
   - Mark missing sections as "DATA UNAVAILABLE  [source] returned error [code]"
   - Do NOT fill missing data with zeros or estimates (that corrupts metrics)
3. **Fallback data**: For critical metrics (MRR, subscriber count), cache the last successful pull
   - Use cached data with CACHED label and timestamp if live pull fails
   - Never use cached data older than 72 hours  at that point, omit the metric
4. **Alert escalation**:
   - 1st failure: Retry silently
   - 2nd failure: Log warning
   - 3rd failure: Alert to Discord #alerts
   - Persistent failure (>24h): Alert to email + Notion incident log

### Step 6: Stakeholder Distribution Matrix
Define who gets what, when, and in what format:

| Stakeholder | Reports Received | Format | Delivery Channel |
|---|---|---|---|
| Business Strategist Agent | Monthly review, weekly funnel, attribution | Detailed | Notion |
| Marketing Agent | Weekly channel report, attribution, A/B results | Detailed + action items | Notion, Discord |
| Content Creator Agent | Content ROI report, video attribution | Content-specific metrics | Notion, Discord |
| Community Manager Agent | Discord engagement report, community-influenced conversions | Community-focused | Discord, Google Sheets |
| Developer Agent | Feature adoption, product usage, error rates | Technical metrics | Notion, Google Sheets |
| Support Agent | Support ticket analytics, churn reason report | Support-focused | Google Sheets |
| Founders/Leadership | Daily snapshot, weekly summary, monthly review | Executive summary | Discord, Email, Notion |
| All Agents | Real-time alerts (churn, anomalies, milestones) | Alert format | Discord #alerts |

### Step 7: Pipeline Testing & Deployment
1. **Test each pipeline** before enabling scheduled runs:
   - Manual trigger with test data range
   - Verify output format in each destination
   - Confirm error handling by temporarily using invalid API keys
   - Verify retry logic and alert escalation
2. **Deploy in order of priority**:
   - Phase 1 (Week 1): Daily snapshot, real-time churn alert, real-time signup alert
   - Phase 2 (Week 2): Weekly funnel report, weekly channel report
   - Phase 3 (Week 3): Monthly review, cohort update, IB report
   - Phase 4 (Week 4): Pipeline health monitoring, data freshness dashboard
3. **Document each pipeline** in Notion: trigger, sources, transformations, destinations, error handling, and owner

## Output Specification

### Pipeline Configuration Document (Notion)
`markdown
# Reporting Automation  Pipeline Registry

## Active Pipelines
| # | Pipeline Name | Cadence | Trigger | Sources | Destinations | Status | Owner |
|---|---|---|---|---|---|---|---|
| 1 | Daily MRR Snapshot | Daily 7am UTC | Cron | Supabase, Creem, Sheets | Sheets, Discord |  Active | Analytics Agent |
| 2 | Real-time Churn Alert | Event | Creem webhook | Creem, Supabase | Discord, Email |  Active | Analytics Agent |
| ... | ... | ... | ... | ... | ... | ... | ... |

## Pipeline Architecture Diagrams
[For each pipeline: trigger  collection  validation  transformation  output  logging]

## Error Handling Policy
[Retry logic, graceful degradation rules, escalation path]

## Data Freshness SLAs
[Per-report freshness requirements and monitoring approach]
`

### Pipeline Health Dashboard (Google Sheets)
`
Tab: Pipeline Health
- All pipelines with last run, status, next run, data age
- Color-coded: Green = healthy, Yellow = warning, Red = failed/stale
- Execution time tracking (detect pipelines getting slower over time)
`

## API & Platform Requirements

| Platform | Endpoint/Method | Auth | Purpose |
|---|---|---|---|
| n8n | Cron triggers, Webhook triggers, HTTP Request nodes, Function nodes | N8N_WEBHOOK_URL + workflow configs | Pipeline orchestration, scheduling, data transformation |
| Supabase | REST API (all tables) | SUPABASE_URL + SUPABASE_KEY | Primary data source for user, subscription, and usage data |
| Creem.io | REST API + Webhooks | CREEM_API_KEY | Payment events, subscription lifecycle, webhook triggers |
| GA4 | Data API v1 | GA4_MEASUREMENT_ID + GA4_API_SECRET | Traffic and conversion data for weekly/monthly reports |
| Google Sheets | Sheets API v4 (read + write) | GOOGLE_SHEETS_API_KEY + service account | Dashboard output, CRM input, pipeline health dashboard |
| Notion | REST API v1 (create + update pages) | NOTION_API_KEY | Report storage, pipeline documentation |
| Vercel Analytics | REST API | VERCEL_ANALYTICS_TOKEN | Landing page metrics for weekly/monthly reports |
| Discord Bot | REST API (send messages, read members) | DISCORD_BOT_TOKEN | Report delivery, alert notifications, community metrics |

## Quality Checks

- [ ] **All scheduled pipelines ran on time**: No pipeline missed its scheduled window by >1 hour in the past 7 days
- [ ] **Data freshness SLAs met**: All reports delivered with data within their freshness SLA
- [ ] **Error recovery tested**: Each pipeline has been tested with simulated data source failures and recovered correctly
- [ ] **No silent failures**: Every failure produces an alert in Discord #alerts within 15 minutes
- [ ] **Output format validated**: Spot-check 3 random reports per week for formatting correctness and data accuracy
- [ ] **Cross-platform consistency**: MRR reported in daily snapshot matches MRR in weekly report matches MRR in monthly review (within rounding tolerance)
- [ ] **Stakeholder coverage**: Every defined stakeholder (agent or human) receives their designated reports
- [ ] **Pipeline health dashboard current**: Meta-dashboard shows real-time status of all pipelines
- [ ] **Documentation complete**: Every pipeline documented in Notion with architecture, error handling, and owner
- [ ] **Idempotent reruns**: If a pipeline runs twice by accident, it produces the same output (no duplicate rows, no double-counted metrics)
- [ ] **Timezone consistency**: All timestamps in UTC, clearly labeled; local time conversion only in human-facing output
- [ ] **Credential rotation safe**: Pipelines continue working after API key rotation (keys referenced from environment variables, not hardcoded)
