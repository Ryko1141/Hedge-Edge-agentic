---
name: subscription-analytics
description: |
  Deep-dive into Hedge Edge subscription metrics  cohort analysis, retention curves, churn decomposition, trial-to-paid conversion, upgrade/downgrade flows, pricing sensitivity, and revenue-per-user trends. Cross-reference Creem.io billing data with Supabase user behaviour to identify revenue optimisation opportunities, predict churn risk, and inform pricing strategy across Free Guide, Starter (), Pro (), and Hedger () tiers.
---

# Subscription Analytics

## Objective

Transform raw subscription data into strategic intelligence that drives Hedge Edge's SaaS growth. Go beyond surface metrics (MRR, churn rate) to understand the behavioural drivers: which cohorts retain best, what triggers upgrades, which users are at risk of churning, and how pricing changes would impact revenue. Every analysis must conclude with specific, actionable recommendations.

## When to Use This Skill

- **Weekly**: Quick-look subscription health metrics  new signups, conversions, churn events, tier movements
- **Monthly**: Full cohort analysis refresh, retention curve update, churn autopsy (why did each churned customer leave?)
- **Quarterly**: Strategic pricing analysis, LTV model refresh, segment deep-dive
- **On-Demand**: When Business Strategist Agent evaluates pricing changes, when Sales Agent needs conversion funnel data, when Product Agent assesses feature impact on retention
- **Trigger-Based**: When monthly churn exceeds 8%, when conversion rate drops below historical average, when a high-value customer (Hedger tier) cancels

## Input Specification

### Required Data Sources
1. **Creem.io** (via CREEM_API_KEY):
   - Subscription lifecycle events: created, updated (plan_change), cancelled, paused, resumed
   - Payment events: succeeded, failed, refunded
   - Customer metadata: plan, amount, currency, billing_cycle, created_at
   - Trial data (if applicable): trial_start, trial_end, converted (yes/no)

2. **Supabase** (via SUPABASE_URL, SUPABASE_KEY):
   - Table: users  id, email, created_at, subscription_tier, subscription_status, last_login, referral_source, country
   - Table: subscriptions  user_id, plan, status, start_date, end_date, cancelled_at, cancel_reason, creem_subscription_id, previous_plan
   - Table: user_activity  user_id, event_type (login, hedge_placed, account_linked, strategy_created), timestamp
   - Table: roker_accounts  user_id, broker, account_count (indicator of engagement depth)

3. **Revenue Tracking Skill Output**: MRR movement data (new, expansion, contraction, churn)

### Input Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| analysis_type | string | Yes | cohort, etention, churn, conversion, 	ier_flow, pricing, ltv, comprehensive |
| period | string | Yes | monthly, quarterly, ytd, ll_time |
| cohort_by | string | No | signup_month, eferral_source, irst_plan, country (default: signup_month) |
| tier_filter | string | No | ll, ree, starter, pro, hedger (default: ll) |

## Step-by-Step Process

### Step 1: Build Subscriber Dataset
1. Query Supabase for all users with subscription history:
   `sql
   SELECT u.id, u.created_at AS signup_date, u.referral_source, u.country,
          s.plan, s.status, s.start_date, s.end_date, s.cancelled_at, s.cancel_reason, s.previous_plan
   FROM users u
   LEFT JOIN subscriptions s ON u.id = s.user_id
   ORDER BY u.created_at
   `
2. Enrich with Creem.io payment data (payment success rate, failed payment count, total lifetime payments)
3. Enrich with activity data (last login, hedges placed, accounts linked)
4. Create unified subscriber profile dataset

### Step 2: Cohort Analysis
1. **Define Cohorts**: Group users by signup month (e.g., Jan 2026, Feb 2026)
2. **Track Lifecycle**: For each cohort, by month since signup:
   - Active subscribers (still paying)
   - Churned (cancelled or expired)
   - Upgraded (moved to higher tier)
   - Downgraded (moved to lower tier)
3. **Cohort Table**:
   | Cohort | M0 | M1 | M2 | M3 | M4 | M5 | M6 |
   |--------|-----|-----|-----|-----|-----|-----|-----|
   | Jan 26 | 100% | X% | X% | X% | | | |
   | Feb 26 | 100% | X% | X% | | | | |
   | Mar 26 | 100% | X% | | | | | |
4. **Insights**: Which cohorts retain best? Is retention improving over time (product-market fit signal)?

### Step 3: Retention Curve Analysis
1. Plot retention curves (% remaining at month N) for:
   - Overall subscriber base
   - By tier (Starter  vs. Pro  vs. Hedger )
   - By referral source (organic, FundingPips, social, paid ads)
   - By country/region
2. Calculate key retention metrics:
   - **D30 Retention**: % still active after 30 days
   - **D90 Retention**: % still active after 90 days
   - **D180 Retention**: % still active after 180 days
   - **Flattening Point**: Month at which retention curve flattens (loyal base identified)
3. Benchmark: SaaS B2C median D30 ~80%, D90 ~60%. Compare Hedge Edge performance.

### Step 4: Churn Decomposition
1. **Voluntary vs. Involuntary Churn**:
   - Voluntary: User actively cancels (check Supabase cancel_reason)
   - Involuntary: Payment fails and subscription expires (Creem.io payment_failed events)
2. **Churn Reasons** (from Supabase cancel_reason or exit survey):
   - Too expensive
   - Not using it enough
   - Switched to competitor
   - Prop firm account failed/lost
   - Technical issues
   - Missing features
   - Other
3. **Churn Risk Scoring**: For each active subscriber, calculate churn probability based on:
   - Days since last login (>14 days = elevated risk)
   - Reduction in hedge activity (50% decline MoM)
   - Failed payment attempts (involuntary churn precursor)
   - Support ticket volume (frustrated user)
   - Time on current plan without upgrade (stagnation)
4. **Churn Risk Segments**:
   - Low Risk: Active in last 7 days, steady usage, no payment issues
   - Medium Risk: Active in last 14 days OR declining usage
   - High Risk: Inactive >14 days OR payment failures OR downgrade in last 30 days
   - Critical: Inactive >30 days AND payment failing

### Step 5: Conversion Funnel Analysis
1. **Free  Paid Conversion**:
   - Total Free Guide signups in period
   - Converted to Starter/Pro/Hedger within 7/14/30/60 days
   - Conversion rate by time window
   - Conversion rate by referral source
   - Average time from signup to first payment
2. **Tier Upgrade/Downgrade Flow**:
   - Starter  Pro: Volume, rate, average time to upgrade
   - Starter  Hedger: Volume, rate, triggers
   - Pro  Hedger: Volume, rate, triggers
   - Hedger  Pro/Starter: Downgrade volume and reasons
   - Any tier  Free (cancellation): Volume and reasons
3. **Sankey Diagram Data**: Flow of users between tiers over the period, enabling visual representation

### Step 6: Unit Economics (LTV & CAC)
1. **LTV Calculation**:
   - By tier: LTV = ARPU  (1  Monthly Churn Rate)
   - Adjusted LTV: Factor in expected upgrades (expansion revenue) based on observed tier flow rates
   - Example: If Starter churn = 6%/month, Starter LTV =   (1/0.06) = 
   - If Pro churn = 5%/month, Pro LTV =   (1/0.05) = 
   - If Hedger churn = 3%/month, Hedger LTV =   (1/0.03) = ,500
2. **CAC Calculation**:
   - Total marketing + sales spend  new paying customers acquired
   - By channel: organic, paid ads, affiliate (FundingPips), content, referral
   - Exclude free signups from denominator (unless measuring full-funnel CAC)
3. **LTV:CAC Ratio**: Target  3:1. Below 3:1 = spending too much to acquire. Above 5:1 = possibly underinvesting in growth.
4. **Payback Period**: CAC  Monthly ARPU. Target <12 months.

### Step 7: Pricing Sensitivity Analysis (Quarterly)
1. Analyse price-dependent behaviour:
   - Upgrade rate from Starter () to Pro ()  only  difference. Is this cannibalising? Should Pro be priced higher?
   - Hedger () as premium: what % of users reach this tier? What features drive upgrades?
   - Free-to-paid barrier: what triggers conversion? How long is the free-to-paid journey?
2. **Price Elasticity Indicators**:
   - Churn correlation with tier price
   - Downgrade patterns (HedgerPro suggests price sensitivity at  level)
   - Competitor pricing comparison (if available from Business Strategist Agent)
3. **Revenue Maximisation Scenarios**:
   - Current pricing: MRR = X
   - Scenario A: Increase Pro to /mo  model impact on churn and MRR
   - Scenario B: Increase Hedger to /mo  model impact
   - Scenario C: Remove Starter, only Free + Pro () + Hedger ()  model impact
   - Note: Scenarios use observed elasticity data, not guesswork

### Step 8: Generate Output
1. Compile analytics dashboard with all visualisation-ready data
2. Write executive narrative: key findings, strategic implications, recommendations
3. Update Google Sheets analytics model
4. Store analysis in Notion for stakeholder access
5. Feed churn risk scores into CRM (Supabase) for Sales/Support Agent action

## Output Specification

### Subscription Analytics Dashboard (Structured JSON)
`json
{
  "period": "2026-01",
  "subscriber_counts": {
    "free": 0,
    "starter": 0,
    "pro": 0,
    "hedger": 0,
    "total_paying": 0,
    "total_registered": 0
  },
  "conversion": {
    "free_to_paid_rate_30d": 0.0,
    "free_to_paid_rate_60d": 0.0,
    "avg_days_to_convert": 0,
    "top_converting_source": ""
  },
  "retention": {
    "d30_overall": 0.0,
    "d90_overall": 0.0,
    "d30_by_tier": { "starter": 0.0, "pro": 0.0, "hedger": 0.0 },
    "flattening_month": 0
  },
  "churn": {
    "monthly_rate": 0.0,
    "voluntary_pct": 0.0,
    "involuntary_pct": 0.0,
    "top_reasons": [],
    "at_risk_users": {
      "high_risk": 0,
      "medium_risk": 0,
      "critical": 0
    }
  },
  "tier_flow": {
    "upgrades": { "starter_to_pro": 0, "starter_to_hedger": 0, "pro_to_hedger": 0 },
    "downgrades": { "hedger_to_pro": 0, "pro_to_starter": 0 },
    "cancellations": { "starter": 0, "pro": 0, "hedger": 0 }
  },
  "unit_economics": {
    "arpu_usd": 0,
    "ltv_usd": { "starter": 0, "pro": 0, "hedger": 0, "blended": 0 },
    "cac_usd": 0,
    "ltv_cac_ratio": 0,
    "payback_months": 0
  },
  "recommendations": []
}
`

### Narrative Report
- Subscription health summary (3 sentences)
- Cohort performance highlights (best and worst retaining cohorts, hypothesis)
- Churn deep-dive: root causes and recommended mitigations
- Conversion funnel bottlenecks and suggested optimisations
- Pricing observations and recommended experiments
- Users at risk of churn requiring immediate outreach
- LTV:CAC health check and growth investment recommendations

## API & Platform Requirements

| Platform | Endpoint / Resource | Auth | Purpose |
|----------|---------------------|------|---------|
| Creem.io | /v1/subscriptions, /v1/customers, /v1/events | Bearer CREEM_API_KEY | Subscription lifecycle, payments |
| Supabase | users, subscriptions, user_activity, roker_accounts | SUPABASE_URL + SUPABASE_KEY | User data, behaviour, engagement |
| Google Sheets | Subscription analytics model | GOOGLE_SHEETS_API_KEY | Historical data, models |
| Notion | Analytics reports database | NOTION_API_KEY | Report storage |

## Quality Checks

1. **Data Completeness**: Every Creem.io subscription has a matching Supabase user record. Orphaned subscriptions flagged and resolved within 48 hours.
2. **Cohort Correctness**: Cohort assignments immutable  a user's signup month never changes. Cohort counts at M0 must match historical signup records exactly.
3. **Churn Rate Accuracy**: Churn calculated using beginning-of-period MRR as denominator (not end-of-period). Methodology documented and consistent across all reports.
4. **LTV Realism**: LTV calculations use actual observed churn rates (not industry benchmarks). If fewer than 6 months of data, flag LTV as "directional estimate" with confidence interval.
5. **Conversion Attribution**: Free-to-paid conversion attributed to the user's first paid subscription (not resubscriptions after churn). Reactivations tracked separately.
6. **Tier Flow Integrity**: Sum of all tier changes (upgrades + downgrades + cancellations) must reconcile to the net change in subscriber counts between periods.
7. **Pricing Analysis Caveat**: Revenue impact scenarios clearly labelled as models with stated assumptions. Never present modelled scenarios as forecasts without stating confidence level.
8. **Actionability**: Every analysis section ends with 1 specific recommendation. No data for data's sake  every metric tied to a decision it informs.
