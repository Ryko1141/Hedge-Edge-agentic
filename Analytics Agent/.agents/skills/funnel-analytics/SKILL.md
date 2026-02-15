---
name: funnel-analytics
description: |
  Map and measure the complete Hedge Edge user journey from first touch through retention and referral. Track conversion rates, drop-off points, and revenue impact at every funnel stage: Content  Attention  Capture  Sales  Delivery  Retention  Analytics. Integrate data from GA4, Vercel Analytics, Supabase, Creem.io, Discord, and Google Sheets to identify the highest-leverage optimization points.
---

# Funnel Analytics

## Objective

Identify exactly where Hedge Edge is losing potential revenue in the user journey and quantify the dollar impact of fixing each bottleneck. The funnel is not a static diagram  it is a living, measured system where every stage has a conversion rate, a benchmark, a trend, and a recommended action. The goal is to make funnel optimization the primary growth lever by turning qualitative hunches into quantitative priorities.

## When to Use This Skill

- **Weekly funnel review**: Standard weekly analysis of full-funnel conversion rates and WoW changes
- **Campaign launch**: When Marketing Agent launches a new campaign and needs baseline + tracking setup
- **Conversion drop detected**: When KPI Dashboards flag a conversion rate anomaly at any funnel stage
- **Channel comparison**: When evaluating which acquisition channel (YouTube, Discord, paid, IB) has the best funnel performance
- **Landing page changes**: When Developer Agent or Content Creator Agent pushes landing page updates and needs impact measurement
- **Growth planning**: When Business Strategist Agent needs funnel data to model growth scenarios
- **New funnel stage added**: When a new touchpoint is introduced (e.g., webinar funnel, MT4 launch)

## Input Specification

### Required Inputs
| Field | Source | Description |
|---|---|---|
| date_range | Request parameter | Analysis period with comparison period |
| ga4_traffic_data | GA4 API | Sessions, users, source/medium, landing pages, UTM parameters, conversion events |
| ercel_page_data | Vercel Analytics | Page views, unique visitors, bounce rate by page, referrer data |
| supabase_signups | Supabase uth.users | Signup events with created_at, source, utm_source, utm_medium, utm_campaign |
| supabase_trials | Supabase subscriptions | Trial start events with user_id, plan, started_at |
| creem_conversions | Creem.io API | Trial-to-paid conversions, plan selections, payment timestamps |
| creem_retention | Creem.io API | Renewal events, cancellation events, upgrade/downgrade events |

### Optional Inputs
| Field | Source | Description |
|---|---|---|
| discord_signups | Discord Bot + Supabase join | Users who joined Discord before/after signup (community influence measurement) |
| email_events | n8n/email platform | Email sends, opens, clicks by campaign (for email funnel stages) |
| ib_activations | Google Sheets CRM | IB broker activation events mapped to user journey |
| support_tickets | Supabase/Google Sheets | Support interactions mapped to funnel stage (pre-sale vs. post-sale) |
| segment_filter | Request parameter | Filter by channel, plan, prop firm, geography, device |

## Step-by-Step Process

### Step 1: Define the Funnel Stages

Map the Hedge Edge funnel with measurable events at each transition:

`
CONTENT (Awareness)
  Event: Video view, blog visit, social impression
  Metric: Impressions, watch time, profile visits
  Source: YouTube Analytics, social platforms

 ATTENTION (Interest)
    Event: Click to landing page, ad click, email open
    Metric: CTR, CPC, engagement rate, open rate
    Source: GA4, Vercel, email platform

 CAPTURE (Lead)
    Event: Landing page signup, lead magnet download, Discord join
    Metric: Lead capture rate, leads per channel
    Source: Vercel + Supabase (signup event)

 SALES (Conversion)
    Event: Trial start, trial-to-paid, plan selection
    Metric: Trial start rate, close rate, avg plan value
    Source: Supabase + Creem.io

 DELIVERY (Activation)
    Event: First hedge executed, MT5 EA connected, 3+ accounts added
    Metric: Time-to-first-value, activation rate, support tickets
    Source: Supabase usage logs

 RETENTION (Loyalty)
    Event: 30-day renewal, 60-day renewal, upgrade, referral sent
    Metric: 30/60/90-day retention, NRR, referral rate
    Source: Creem.io + Supabase

 EXPANSION (Advocacy)
     Event: Referral conversion, IB activation, plan upgrade, review posted
     Metric: Viral coefficient, IB activation rate, expansion revenue
     Source: Supabase + Google Sheets CRM
`

### Step 2: Data Collection & Event Mapping
1. Pull GA4 session data with UTM parameters to attribute traffic to channels
2. Pull Vercel Analytics for landing page behavior (pageviews, scroll depth, CTA clicks)
3. Query Supabase for signup events, matching utm_source to GA4 sessions where possible
4. Pull Creem.io for trial starts, conversions, and renewals
5. Query Supabase usage logs for activation events (first hedge, EA connection, account additions)
6. Map each user to their funnel journey: assign timestamps for each stage transition
7. Handle multi-session attribution: if a user visits 3 times before signing up, capture all touchpoints

### Step 3: Conversion Rate Calculation
For each stage transition, calculate:
1. **Absolute conversion rate**: Users who completed stage N+1 / Users who entered stage N
2. **Cumulative conversion rate**: Users at stage N / Total users at top of funnel
3. **Time-to-convert**: Median and P90 time between stages (e.g., signup to trial start: median 0.5 days, P90 3 days)
4. **Drop-off count**: Absolute number of users lost at each stage
5. **Revenue impact of drop-off**: Lost users  average LTV of converted users = revenue left on table

Example calculation for Hedge Edge:
`
Landing Page Visitors:     10,000/mo
 Signups:               800 (8.0% capture rate)
 Trial Starts:          560 (70% of signups)
 Trial-to-Paid:         168 (30% close rate)
 30-Day Retained:       135 (80% retention)
 90-Day Retained:       101 (60% of original paid)
 IB Activated:          42 (25% of paid users)

Revenue per converted user:  ARPU  8 mo avg tenure =  LTV
+ IB value: 25%  /mo IB commission  8 mo =  IB LTV contribution
Blended LTV: ~

Revenue impact of +1% signup rate improvement:
100 additional signups  70% trial  30% convert   LTV = ,862/year
`

### Step 4: Channel-Specific Funnel Analysis
Build separate funnels for each acquisition channel:

1. **YouTube Organic**: Video view  Profile visit  Landing page click  Signup  Trial  Paid
   - Key metric: Content-to-signup rate, video-assisted conversion rate
2. **Discord Community**: Discord join  Engagement (5+ messages)  Landing page visit  Signup  Trial  Paid
   - Key metric: Community-influenced conversion rate, time-in-community before conversion
3. **Paid Ads**: Ad impression  Click  Landing page  Signup  Trial  Paid
   - Key metric: CAC (fully loaded), ROAS, payback period
4. **IB Partner Referral**: Partner link click  Broker signup  Hedge Edge signup  Trial  Paid
   - Key metric: Partner-attributed revenue, co-registration rate
5. **Organic Search**: Search impression  Click  Landing page  Signup  Trial  Paid
   - Key metric: Keyword conversion rates, SEO ROI
6. **Email**: Email received  Opened  Clicked  Landing page  Signup/Trial/Upgrade
   - Key metric: Email-attributed conversions, nurture sequence effectiveness
7. **Word of Mouth/Referral**: Referral link shared  Click  Signup  Trial  Paid
   - Key metric: Viral coefficient, referral conversion premium vs. organic

### Step 5: Drop-Off Analysis & Bottleneck Identification
1. Rank all stage transitions by drop-off rate (worst conversion % first)
2. For the top 3 bottlenecks, investigate:
   - **Who drops off**: Segment by channel, device, plan interest, geography
   - **When they drop off**: Time-based patterns (day of week, time of day, days since previous stage)
   - **Where they drop off**: Specific pages, form fields, onboarding steps
   - **Behavioral signals**: What did drop-offs do differently than converters? (e.g., watched demo video vs. didn't, joined Discord vs. didn't)
3. Calculate the revenue impact of improving each bottleneck by 10%, 25%, 50%
4. Rank bottlenecks by: Revenue Impact  Confidence of Improvement  Implementation Ease

### Step 6: Funnel Velocity Analysis
1. Calculate time-to-convert at each stage (median, P25, P75, P90)
2. Identify slow stages where users stall (e.g., signup-to-trial >3 days = risk of drop-off)
3. Correlate speed with conversion: do faster-moving users have higher LTV?
4. Identify "fast path" users (signup to paid in <24 hours) and analyze what they have in common
5. Set velocity benchmarks and flag users who are falling behind (trigger nurture automation)

### Step 7: Output Generation
1. Build funnel visualization with conversion rates at each stage (Sankey-style data for rendering)
2. Write stage-by-stage data to Google Sheets with conditional formatting
3. Generate Notion report with:
   - Funnel diagram with current rates and MoM changes
   - Top 3 bottlenecks with revenue impact quantification
   - Channel comparison table
   - Velocity analysis with benchmark compliance
   - Recommended actions with ICE scores
4. If a conversion rate drops >15% WoW, trigger n8n alert

## Output Specification

### Funnel Report Structure
`
# Funnel Analytics Report  [Date Range]

## Executive Summary
- Total funnel throughput: [X] visitors  [Y] paid users ([Z]% end-to-end)
- MoM change in end-to-end conversion: [+/- %]
- Biggest bottleneck: [Stage] at [X]% conversion (target: [Y]%)
- Estimated revenue impact of fixing top bottleneck: $[amount]/month

## Stage-by-Stage Breakdown
| Stage | Volume | Conversion Rate | WoW Δ | MoM Δ | Target | Status |
|---|---|---|---|---|---|---|
| Landing Page Visitors | 10,000 |  | +5% | +12% |  |  |
| Signups | 800 | 8.0% | -0.5% | +1.2% | 8% |  |
| Trial Starts | 560 | 70.0% | +2% | +5% | 65% |  |
| Trial-to-Paid | 168 | 30.0% | -3% | -1% | 35% |  |
| 30-Day Retained | 135 | 80.4% | +1% | 0% | 80% |  |
| IB Activated | 42 | 25.0% | +4% | +8% | 30% |  |

## Channel Comparison
| Channel | Visitors | End-to-End CVR | CAC | LTV | CAC:LTV | Payback |
|---|---|---|---|---|---|---|
| YouTube Organic | 4,200 | 2.1% |  |  | 1:55 | 0.4 mo |
| Discord | 1,800 | 3.5% |  |  | 1:170 | 0.2 mo |
| Paid (Google) | 2,500 | 1.2% |  |  | 1:9 | 3.2 mo |
| Organic Search | 1,200 | 1.8% |  |  | 1:80 | 0.5 mo |
| Referral | 300 | 5.2% |  |  |  | 0 mo |

## Bottleneck Analysis
### Bottleneck 1: Trial-to-Paid (30% vs. 35% target)
- Revenue at stake: $[X]/month
- Root cause hypothesis: [analysis]
- Segment most affected: [detail]
- Recommended action: [specific action]
- ICE Score: [Impact  Confidence  Ease]

## Funnel Velocity
| Transition | Median Time | P90 Time | Benchmark | Status |
|---|---|---|---|---|
| Visit  Signup | 2.3 sessions | 7 sessions | 3 sessions |  |
| Signup  Trial | 0.5 days | 3.2 days | 1 day |  |
| Trial  Paid | 6.8 days | 13 days | 7 days |  |

## Recommended Actions (ICE-ranked)
1. [Action]  Impact: [H/M/L], Confidence: [H/M/L], Ease: [H/M/L]  Score: [X/30]
2. ...
`

## API & Platform Requirements

| Platform | Endpoint/Method | Auth | Purpose |
|---|---|---|---|
| GA4 | Data API v1 unReport | GA4_MEASUREMENT_ID + GA4_API_SECRET | Traffic source, UTM attribution, session data |
| Vercel Analytics | /v1/analytics | VERCEL_ANALYTICS_TOKEN | Landing page behavior, CTA click tracking |
| Supabase | /rest/v1/users, /rest/v1/events | SUPABASE_URL + SUPABASE_KEY | Signup events, activation events, usage logs |
| Creem.io | /v1/subscriptions, /v1/events | CREEM_API_KEY | Trial, conversion, renewal, churn events |
| Google Sheets | Sheets API v4 | GOOGLE_SHEETS_API_KEY + service account | Dashboard output, CRM data for IB funnel |
| Notion | /v1/pages | NOTION_API_KEY | Report storage and distribution |
| Discord Bot | /guilds/{id}/members, /channels/{id}/messages | DISCORD_BOT_TOKEN | Community engagement funnel data |
| n8n | POST to N8N_WEBHOOK_URL | Webhook URL | Alert triggers for conversion anomalies |

## Quality Checks

- [ ] **Full funnel coverage**: Every defined stage has a measured conversion rate with sample size shown
- [ ] **Attribution integrity**: >90% of signups have a tracked source (UTM or referrer). Unattributed <10%.
- [ ] **No double-counting**: Each user counted once per stage, even with multiple sessions
- [ ] **Conversion windows**: Time windows are defined and consistent (e.g., 14-day trial window, 30-day attribution window)
- [ ] **Statistical validity**: Conversion rate changes flagged only when sample size >100 and change is >2 percentage points or statistically significant at p<0.05
- [ ] **Channel isolation**: Channel-specific funnels do not overlap (multi-touch handled in Attribution Modeling skill, not here)
- [ ] **Revenue impact calculated**: Every bottleneck has a dollar-value impact estimate, not just a percentage
- [ ] **Velocity benchmarks set**: Each stage transition has a target time-to-convert with actual vs. target comparison
- [ ] **Comparison context**: Every metric shows WoW and MoM change plus target benchmark
- [ ] **Actionable output**: Report includes at least 3 ICE-scored recommended actions tied to specific funnel stages
