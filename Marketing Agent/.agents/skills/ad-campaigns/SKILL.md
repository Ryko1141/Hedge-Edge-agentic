---
name: ad-campaigns
description: |
  Plan, launch, optimise, and report on paid advertising campaigns across Google Ads
  (Search, YouTube, Display) and Meta Ads (Facebook, Instagram) for Hedge Edge. Targets
  prop-firm traders actively seeking hedging solutions, multi-account management tools,
  and drawdown protection strategies. Manages budgets, bidding, creative, audiences,
  and conversion tracking through to Creem.io checkout attribution.
---

# Ad Campaigns

## Objective

Acquire new Hedge Edge trial users and paid subscribers through profitable paid channels at a blended CAC (Customer Acquisition Cost) below \ and a 90-day ROAS (Return on Ad Spend) above 3.0x. Scale monthly ad spend from \ to \,000 as unit economics prove out, while maintaining creative freshness and audience precision for the prop-firm trading niche.

## When to Use This Skill

- A new campaign is needed to promote a product launch (e.g., MT4 connector, new pricing tier).
- Monthly paid acquisition budget is allocated and campaigns need refreshing.
- An existing campaign's CPC rises above \.50 or CTR drops below 2%  optimisation cycle needed.
- A competitor (e.g., a rival hedging tool or prop-firm service) is running aggressive ads  counter-positioning needed.
- IB broker partner (Vantage/BlackBull) co-funds an acquisition campaign  joint creative required.
- Retargeting audiences need refreshing based on new Supabase user segment data.

## Input Specification

| Field | Type | Required | Description |
|---|---|---|---|
| campaign_objective | enum | Yes | 	rial_signup, paid_conversion, ib_broker_signup, etargeting, rand_awareness |
| platform | enum | Yes | google_search, google_youtube, google_display, meta_facebook, meta_instagram |
| daily_budget | number | Yes | Daily budget in USD (min \, max \) |
| duration_days | integer | Yes | Campaign run duration (7-90 days) |
| target_audience | object | Yes | { geo: string[], age_range: [int,int], interests: string[], custom_audience_id?: string } |
| ad_creatives | object[] | Yes | [{ headline, description, cta_text, image_url?, video_url?, landing_url }]  min 3 variants |
| negative_keywords | string[] | No | For Google Search  terms to exclude (default list provided) |
| ib_broker | enum | No | antage or lackbull  for co-branded IB campaigns |
| bid_strategy | enum | No | manual_cpc, 	arget_cpa, maximize_conversions  default: maximize_conversions |

## Step-by-Step Process

### 1. Audience Research & Definition
- **Core audience profile**: Male 22-45, interested in forex/futures trading, prop-firm challenges, MetaTrader, risk management, funded accounts.
- **Geographic targeting**: Primary  UK, US, Canada, Australia, Germany, Netherlands. Secondary  UAE, Singapore, South Africa.
- **Google Search keywords** (seed list):
  - High intent: "prop firm hedging tool", "hedge funded accounts", "multi account hedge EA", "drawdown protection software", "FTMO hedging strategy"
  - Medium intent: "prop firm risk management", "how to pass prop firm challenge", "funded account drawdown protection", "MT5 hedging EA"
  - Competitor: "prop firm tools", "trading account manager software", "copy trade hedge"
- **Negative keywords** (default):
  - "free", "crack", "pirated", "forex signal", "guaranteed profit", "get rich", "MLM", "binary options", "crypto bot"
- **Meta audiences**:
  - Interest targeting: MetaTrader, FTMO, The5%ers, funded trading, forex risk management, proprietary trading.
  - Lookalike: 1% lookalike of existing Hedge Edge users (upload Supabase email list as Custom Audience via META_ADS_TOKEN).
  - Retargeting: Landing page visitors (GA4 audience sync), trial users who didn't convert (Supabase segment).

### 2. Creative Development
- Produce minimum 3 ad variants per campaign, testing:
  - **Hook angle A**  Pain: "73% of prop-firm challenges fail from drawdown breaches. Don't be a statistic."
  - **Hook angle B**  Solution: "Automated hedging across all your funded accounts. Set up in 90 seconds."
  - **Hook angle C**  Social proof: "500+ prop traders already protecting their capital with Hedge Edge."
- **Google Search ads**:
  - Headline 1 (30 chars): "Hedge Your Funded Accounts"
  - Headline 2 (30 chars): "Automated Drawdown Protection"
  - Headline 3 (30 chars): "MT5 EA  Try Free for 14 Days"
  - Description (90 chars): "Manage risk across multiple prop-firm accounts with one-click hedging. FTMO, TopStep, Apex compatible."
- **Meta image ads**: Dark-themed UI screenshots of Hedge Edge dashboard showing multi-account hedge status, drawdown gauges, P&L curves.
- **Meta video ads** (15-30 sec): Screen recording of setting up a hedge in the Electron app + voiceover explaining the prop-firm pain point.
- **IB co-branded ads**: Include Vantage/BlackBull logo, "Trade with [broker] + Hedge Edge for tighter spreads and full protection."
- All creatives must include disclaimer: "Trading involves risk. Hedge Edge is a risk-management tool."

### 3. Campaign Setup
- **Google Ads** (via GOOGLE_ADS_API_KEY):
  - Create campaign with specified id_strategy and daily_budget.
  - Set up conversion tracking: Creem.io checkout completion + trial signup (Supabase event  Google Ads conversion import via n8n).
  - Enable ad extensions: sitelinks (Pricing, How It Works, Discord Community), callout (14-Day Free Trial, No Card Required).
  - Set ad schedule: 06:00-23:00 in target timezones (traders are active outside market hours for setup/management).
- **Meta Ads** (via META_ADS_TOKEN):
  - Create campaign at the campaign_objective level (Traffic, Conversions, or Awareness).
  - Set audience using targeting spec + Custom/Lookalike audiences.
  - Configure Conversions API (CAPI) server-side event for Creem.io checkout attribution.
  - Set placement: Feed + Stories (Instagram), Feed + Reels (Facebook). Exclude Audience Network.
- Tag campaign in Notion marketing calendar via NOTION_API_KEY.

### 4. Launch & Day-1 Monitoring
- Activate campaign.
- Monitor first 24 hours for:
  - Ad approval status (flag and fix any disapprovals immediately  common for financial products).
  - Spend pacing (should be within 80-120% of daily budget).
  - CTR (floor: 2% for search, 0.8% for display/social).
  - CPC (ceiling: \.50 for search, \.50 for social).
- If any metric is critically off, pause underperforming ad variants and reallocate budget.

### 5. Ongoing Optimisation (Weekly)
- **Week 1**: Gather data, no major changes. Identify winning & losing creatives.
- **Week 2**: Pause ads with CTR < 1.5% (search) or < 0.5% (social). Increase budget on winners by 20%.
- **Week 3+**: Test new creative variants against winners. Expand audiences incrementally (broaden geo, increase lookalike % from 1% to 2%).
- **Bid adjustments**: Increase bids for demographics/placements with above-average conversion rates. Decrease or exclude underperformers.
- **Search term review** (Google): Weekly review of actual search terms triggering ads. Add irrelevant terms to negative keyword list. Identify new keyword opportunities.
- **Frequency cap** (Meta): If frequency exceeds 3.0 in a 7-day window, refresh creatives or expand audience to combat ad fatigue.

### 6. Conversion Tracking & Attribution
- Primary conversion: Creem.io checkout event (trial signup or paid subscription).
- Secondary conversions: Landing page CTA click, "Start Free Trial" button click, pricing page visit.
- Attribute conversions using:
  - Google Ads conversion import (n8n webhook: Supabase trial event  Google Ads API).
  - Meta CAPI server-side events (n8n webhook: Supabase trial event  Meta Conversions API).
  - GA4 cross-channel attribution (GA4_MEASUREMENT_ID).
- Calculate CAC per campaign: total spend / total paid conversions.
- Calculate 90-day ROAS: LTV of acquired cohort / ad spend for that cohort.

### 7. Reporting & Budget Reallocation
- Weekly performance report:
  - Spend, impressions, clicks, CTR, CPC, conversions, CPA, ROAS.
  - Creative-level breakdown (which hook/angle won).
  - Audience-level breakdown (which segment converts cheapest).
- Monthly budget reallocation:
  - Increase allocation to channels/campaigns with CPA < \ and ROAS > 3x.
  - Decrease or pause channels with CPA > \ for 2+ consecutive weeks.
  - Reserve 20% of budget for creative testing and new audience exploration.

## Output Specification

| Output | Format | Destination |
|---|---|---|
| Campaign performance report | JSON { campaign_id, platform, spend, impressions, clicks, ctr, cpc, conversions, cpa, roas } | Google Sheets CRM + Notion |
| Creative performance | JSON [{ creative_id, hook_angle, ctr, conversion_rate }] | Agent memory + Content Engine Agent (for organic content repurposing) |
| Audience insights | JSON { top_geo, top_age_range, top_interest, cheapest_segment } | Lead Generation skill (for organic targeting) |
| Budget recommendation | JSON { channel, current_budget, recommended_budget, rationale } | Business Strategist Agent |
| Negative keyword updates | string[] | Google Ads campaign (automated append) |

## API & Platform Requirements

| Platform | Variable | Operations Used |
|---|---|---|
| Google Ads | GOOGLE_ADS_API_KEY | Campaign CRUD, keyword management, bid adjustments, conversion import, reporting |
| Meta Ads | META_ADS_TOKEN | Campaign CRUD, audience management, CAPI events, creative upload, reporting |
| GA4 | GA4_MEASUREMENT_ID | Cross-channel attribution, audience export for retargeting |
| Supabase | SUPABASE_URL, SUPABASE_KEY | User segment export for Custom Audiences, conversion event source |
| n8n | N8N_WEBHOOK_URL | Relay conversion events to ad platforms, automate weekly reporting |
| Creem.io | CREEM_API_KEY | Primary conversion event source (checkout, subscription) |
| Notion | NOTION_API_KEY | Campaign calendar, performance logs, creative library |
| Vercel | VERCEL_TOKEN | Landing page variant deployment for campaign-specific URLs |

## Quality Checks

- [ ] All ads include risk disclaimer ("Trading involves risk. Hedge Edge is a risk-management tool.")
- [ ] No ad copy promises guaranteed returns, specific profit percentages, or risk-free trading
- [ ] Conversion tracking fires correctly on test checkout (verify before scaling)
- [ ] Negative keyword list is applied and updated weekly
- [ ] Daily spend does not exceed 120% of configured budget
- [ ] Creative fatigue check: no ad variant runs unchanged for > 21 days
- [ ] Custom Audiences are refreshed at least bi-weekly from Supabase segments
- [ ] CAC is calculated with full-funnel attribution (not just last-click)
- [ ] CPC remains below \.50 (search) / \.50 (social)  alert if breached
- [ ] Landing pages load in < 2 seconds for all target geos (Vercel edge)
- [ ] Budget reallocation decisions are logged with rationale in Notion
