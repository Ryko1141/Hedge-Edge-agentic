---
name: attribution-modeling
description: |
  Determine which marketing touchpoints drive Hedge Edge signups, trial conversions, paid subscriptions, and IB activations. Implement multi-touch attribution models (first-touch, last-touch, linear, time-decay, data-driven) to allocate credit across channels  YouTube content, Discord community, paid ads, email nurture, organic search, and IB partner referrals. Enable data-driven marketing spend allocation by connecting every revenue dollar to the touchpoints that influenced it.
---

# Attribution Modeling

## Objective

Eliminate the question "Is our marketing working?" by building a rigorous attribution system that connects every Hedge Edge conversion to the touchpoints that influenced it. The goal is not just to track what happened, but to answer: "If we spend the next dollar on YouTube content vs. paid ads vs. Discord community building, which produces the highest incremental revenue?" Attribution modeling turns qualitative marketing intuition into quantitative spend allocation.

## When to Use This Skill

- **Monthly marketing ROI review**: Calculate attributed revenue per channel and compare CAC:LTV by channel
- **Budget allocation decisions**: When Business Strategist Agent or Marketing Agent needs data to decide where to invest next
- **New channel launch**: When a new acquisition channel is introduced and needs to be integrated into the attribution model
- **Content ROI analysis**: When Content Creator Agent needs to understand which specific pieces of content drive revenue
- **Campaign post-mortem**: When evaluating the true impact of a marketing campaign across the full conversion window
- **IB partner performance review**: When assessing the revenue contribution of Vantage vs. BlackBull partnerships
- **Attribution model comparison**: When testing whether the current model is over/under-crediting specific channels
- **Disparate signal reconciliation**: When different metrics tell conflicting stories (e.g., YouTube traffic is up but attributed conversions are flat)

## Input Specification

### Required Inputs
| Field | Source | Description |
|---|---|---|
| date_range | Request parameter | Attribution window (e.g., last 30 days, last 90 days) |
| ttribution_model | Request parameter | Model to apply: irst_touch, last_touch, linear, 	ime_decay, position_based, data_driven, or ll |
| ga4_sessions | GA4 API | Session-level data with source, medium, campaign, landing_page, user_pseudo_id, session_start |
| ga4_conversions | GA4 API | Conversion events: sign_up, 	rial_start, purchase with timestamps and user IDs |
| supabase_users | Supabase | User records with utm_source, utm_medium, utm_campaign, eferral_code, created_at |
| supabase_subscriptions | Supabase | Subscription events mapped to user IDs |
| creem_revenue | Creem.io API | Revenue per user for LTV-weighted attribution |

### Optional Inputs
| Field | Source | Description |
|---|---|---|
| discord_touchpoints | Discord Bot API + Supabase | Discord interactions before signup (join date, messages, channels active in) |
| email_touchpoints | n8n/email platform | Email opens and clicks prior to conversion, mapped to user |
| ib_referral_data | Google Sheets CRM | IB partner referral link clicks and conversions |
| youtube_data | YouTube Analytics (manual/export) | Video performance data for content-level attribution |
| ercel_pageviews | Vercel Analytics | Page-level engagement data (scroll depth, time on page, CTA clicks) |
| conversion_window | Request parameter | Maximum lookback for touchpoints (default: 30 days) |
| evenue_weighting | Request parameter | Whether to weight by subscription revenue or count-based (default: revenue-weighted) |

## Step-by-Step Process

### Step 1: Touchpoint Data Collection & Unification
1. **Collect all touchpoint data** from each source:
   - GA4: Session-level data with source/medium/campaign, landing page, timestamp
   - Supabase: Signup UTM parameters, referral codes, first-seen source
   - Discord: Join event, message activity timestamps, role assignments
   - Email: Send, open, click events with timestamps and user mapping
   - IB referrals: Partner link click events from Google Sheets CRM
   - Direct/organic: Sessions with no UTM that hit the landing page
2. **Build a unified touchpoint timeline per user**:
   `
   User #4872 Journey:
   Day -14: YouTube video view (utm_source=youtube, utm_medium=organic, utm_campaign=ftmo-hedge-guide)
   Day -10: Organic search click (utm_source=google, utm_medium=organic)
   Day -7:  Discord join (discord_referral)
   Day -3:  Email open (nurture_sequence_1, email_3)
   Day -1:  Direct visit to landing page
   Day 0:   Signup  Trial start
   Day 7:   Paid conversion (Pro plan, /mo)
   Day 21:  IB activation (Vantage)
   `
3. **Identity resolution**: Match anonymous sessions to known users using:
   - GA4 user_pseudo_id mapped to Supabase user_id at signup event
   - Email click  landing page session  signup chain
   - Discord username  Supabase user mapping (where available)
   - UTM parameters stored at signup as fallback for users with incomplete session data

### Step 2: Attribution Model Application
Apply each requested model to distribute conversion credit across touchpoints:

#### First-Touch Attribution
- 100% credit to the first recorded touchpoint in the user's journey
- Best for: Understanding which channels generate awareness and top-of-funnel demand
- Hedge Edge use case: Which channels bring people into the Hedge Edge ecosystem?
`
User #4872: YouTube organic gets 100% credit for the  conversion
`

#### Last-Touch Attribution
- 100% credit to the last touchpoint before conversion
- Best for: Understanding which channels close deals / trigger final action
- Hedge Edge use case: What's the last thing users interact with before converting?
`
User #4872: Direct visit gets 100% credit
`

#### Linear Attribution
- Equal credit distributed across all touchpoints in the journey
- Best for: Balanced view when no strong hypothesis about channel role
- Hedge Edge use case: Holistic view of multi-channel journeys
`
User #4872: Each of 5 touchpoints gets 20% credit (.80 each)
`

#### Time-Decay Attribution
- More credit to touchpoints closer to conversion, using exponential decay (half-life = 7 days default)
- Best for: Recognizing that recent touchpoints matter more while still crediting earlier ones
- Hedge Edge use case: Primary model for spend allocation decisions
`
User #4872 (7-day half-life):
  YouTube (Day -14): 6.3%  .09
  Search (Day -10):  12.5%  .13
  Discord (Day -7):  25.0%  .25
  Email (Day -3):    35.4%  .35
  Direct (Day -1):   20.8%  .19
`

#### Position-Based (U-Shaped) Attribution
- 40% to first touch, 40% to last touch, 20% distributed across middle touchpoints
- Best for: Emphasizing both demand generation and conversion while acknowledging assists
- Hedge Edge use case: Balancing awareness channels (YouTube) with closing channels (direct/email)

#### Data-Driven Attribution (Advanced)
- Uses logistic regression or Shapley value calculation on historical conversion data
- Requires minimum 200 conversions with touchpoint data for statistical reliability
- Compares converting vs. non-converting user journeys to identify which touchpoints actually increase conversion probability
- Hedge Edge use case: Most accurate model once sufficient data volume exists (target: Q3 2026)
- **Note**: With ~500 beta users, sample size may be insufficient for data-driven attribution. Fall back to time-decay until conversion volume supports statistical modeling.

### Step 3: Channel-Level Revenue Attribution
1. Aggregate user-level attribution to channel level:
   `
   Channel Revenue Attribution (Time-Decay, Feb 2026):
   YouTube Organic:    ,280 (32% of attributed revenue)
   Discord Community:  ,680 (20%)
   Organic Search:     ,870 (14%)
   Email Nurture:      ,600 (12%)
   Paid Google:        ,340 (10%)
   IB Partner Referral:   (7%)
   Direct:               (5%)
   `
2. Calculate channel-level CAC using attributed conversions:
   - Organic channels: Allocate team time cost (content production, community management hours  hourly rate)
   - Paid channels: Ad spend + management time
   - IB referrals: Commission cost + partnership management time
3. Compute CAC:LTV ratio per channel using cohort-based LTV estimates from Cohort Analysis skill
4. Calculate payback period: CAC / monthly ARPU of attributed users

### Step 4: Content-Level Attribution
1. For YouTube: Attribution at the individual video level
   - Which videos appear as touchpoints in converting user journeys?
   - Video-level attributed revenue = sum of attributed credit from all users who watched that video pre-conversion
   - Content ROI = Attributed revenue / Production cost
2. For email: Campaign-level and individual email-level attribution
   - Which nurture emails drive the most conversion assists?
   - Identify the highest-converting email in each sequence
3. For Discord: Engagement-depth attribution
   - Does deeper Discord engagement (>20 messages) increase conversion probability?
   - Which Discord channels (#strategies, #support, #general) are most associated with conversion?

### Step 5: IB Commission Attribution
1. Track IB activation as a downstream conversion event (separate from subscription conversion):
   - Which touchpoints lead users to activate IB broker accounts?
   - What's the typical delay between subscription and IB activation?
2. Calculate IB-attributed revenue: IB commission revenue allocated to the channels that brought those IB-activating users
3. Total channel value = Subscription-attributed revenue + IB-attributed revenue
4. This often reveals that YouTube/Discord users (high-intent, educated) have higher IB activation rates than paid ad users

### Step 6: Model Comparison & Validation
1. Run all models side-by-side for the same period
2. Generate comparison table showing how each channel's credit shifts across models:
   `
   Channel         First-Touch  Last-Touch  Linear  Time-Decay  Position
   YouTube         42%          12%         25%     22%         30%
   Discord         18%          8%          15%     16%         14%
   Paid Google     15%          22%         18%     20%         18%
   Email           5%           28%         20%     22%         14%
   Organic Search  12%          18%         14%     13%         15%
   Direct          3%           8%          5%      4%          5%
   IB Referral     5%           4%          3%      3%          4%
   `
3. Identify channels with high variance across models  these are the channels where attribution model choice matters most
4. Recommend primary model: Time-decay for operational decisions (spend allocation) with first-touch as a secondary lens for awareness channel investment

### Step 7: Output Generation
1. Write attribution results to Google Sheets dashboard with:
   - Channel-level summary with all model outputs
   - CAC:LTV by channel table
   - Content-level attribution table (top 20 pieces of content by attributed revenue)
   - IB commission attribution breakdown
2. Generate Notion report with analysis narrative and recommended spend allocation
3. Provide Marketing Agent with channel scores for budget optimization
4. Flag any attribution data gaps (>10% unattributed conversions) for investigation

## Output Specification

### Attribution Report Structure
`markdown
# Attribution Analysis  [Date Range]

## Model: [Primary Model Used] (with comparison)

## Channel Attribution Summary
| Channel | Attributed Revenue | % of Total | Attributed Conversions | CAC | LTV | CAC:LTV | Payback (mo) |
|---|---|---|---|---|---|---|---|
| YouTube Organic | ,280 | 32% | 38 | .50 |  | 1:52 | 0.4 |
| Discord | ,680 | 20% | 22 | .20 |  | 1:121 | 0.2 |
| Organic Search | ,870 | 14% | 18 | .00 |  | 1:80 | 0.5 |
| Email Nurture | ,600 | 12% | 15 | .00 |  | 1:70 | 0.4 |
| Paid Google | ,340 | 10% | 12 | .00 |  | 1:9 | 3.2 |
| IB Referral |  | 7% | 8 | .00 |  | 1:43 | 0.7 |
| Direct |  | 5% | 7 |  |  |  |  |

## Model Comparison Matrix
[Table showing all channels  all models]

## Content Attribution (Top 10)
| Content Piece | Type | Attributed Revenue | Conversions Assisted | ROI |
|---|---|---|---|---|
| "FTMO Hedge Strategy Explained" | YouTube | ,240 | 12 | 24x |
| Nurture Email #4 "Live Results" | Email |  | 9 | 18x |
| ... | ... | ... | ... | ... |

## IB Commission Attribution
[Revenue split by originating channel]

## Unattributed Analysis
- Unattributed conversions: [N] ([%])
- Likely causes: [analysis]
- Remediation: [UTM improvements, identity resolution fixes]

## Spend Allocation Recommendation
Based on marginal CAC:LTV analysis:
1. Increase: [Channel]  headroom for [X]% more spend at profitable CAC
2. Maintain: [Channel]  at optimal spend level
3. Decrease: [Channel]  diminishing returns, reallocate to #1
4. Test: [Channel]  insufficient data, recommend $[X] test budget

## Data Quality Notes
- Attribution coverage: [X]% of conversions have full touchpoint data
- Identity resolution rate: [X]% of sessions matched to known users
- Model confidence: [High/Medium/Low] based on sample size
`

## API & Platform Requirements

| Platform | Endpoint/Method | Auth | Purpose |
|---|---|---|---|
| GA4 | Data API v1 unReport (dimensions: sessionSource, sessionMedium, sessionCampaign, landingPage) | GA4_MEASUREMENT_ID + GA4_API_SECRET | Session-level touchpoint data, conversion events |
| Supabase | /rest/v1/users (fields: utm_source, utm_medium, utm_campaign, eferral_code) | SUPABASE_URL + SUPABASE_KEY | User signup attribution parameters, subscription data |
| Creem.io | /v1/customers, /v1/subscriptions | CREEM_API_KEY | Revenue per user for LTV-weighted attribution |
| Google Sheets | Sheets API v4 | GOOGLE_SHEETS_API_KEY | IB referral data, CRM touchpoint logs, dashboard output |
| Notion | /v1/pages | NOTION_API_KEY | Report storage |
| Discord Bot | /guilds/{id}/members, message history | DISCORD_BOT_TOKEN | Discord interaction timestamps for community touchpoint data |
| Vercel Analytics | /v1/analytics | VERCEL_ANALYTICS_TOKEN | Landing page engagement for page-level attribution |
| n8n | POST N8N_WEBHOOK_URL | Webhook URL | Automated attribution report triggers |

## Quality Checks

- [ ] **Attribution coverage 90%**: At least 90% of conversions have at least one attributed touchpoint. Unattributed <10%.
- [ ] **Identity resolution validated**: Spot-check 20 random user journeys to confirm touchpoint timelines are correct and complete
- [ ] **No future touchpoints**: Verify no touchpoints have timestamps after the conversion event (data integrity)
- [ ] **Conversion window respected**: Only touchpoints within the defined conversion window (default 30 days) are included
- [ ] **Revenue reconciliation**: Sum of all channel-attributed revenue equals total revenue for the period (within 1% rounding tolerance)
- [ ] **Model comparison completed**: At least 3 attribution models run side-by-side to identify model-dependent conclusions
- [ ] **CAC includes all costs**: Paid CAC includes ad spend + management time. Organic CAC includes content production + team time.
- [ ] **Sample size flagged**: Channels with <10 attributed conversions flagged as "low confidence  directional only"
- [ ] **UTM hygiene audit**: Checked for inconsistent UTM tagging (e.g., youtube vs YouTube vs yt) and normalized
- [ ] **Cross-device/cross-session handled**: Noted the current limitation of cross-device attribution and its impact on accuracy
