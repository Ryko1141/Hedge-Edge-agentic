---
name: lead-generation
description: |
  Identify, score, enrich, and segment prospective Hedge Edge users from all inbound and
  outbound channels  Discord community, landing page visitors, organic search, paid ads,
  and partner referrals. Build a qualified pipeline of prop-firm traders who are actively
  managing funded accounts and need automated hedging solutions.
---

# Lead Generation

## Objective

Build and maintain a continuously growing pipeline of qualified prop-firm trader leads, scoring them from cold to warm to hot based on intent signals, and routing them into the appropriate email nurture or sales sequence. Target: 200+ new qualified leads/month with a 15% warm-to-paid conversion rate within 30 days.

## When to Use This Skill

- New landing page visitors are captured via GA4 but have not signed up  identify and enrich.
- Discord community members ask questions about hedging, drawdown protection, or multi-account management  flag as warm leads.
- Paid ad campaigns (Google/Meta) generate click-throughs  capture and score.
- Organic blog/SEO content attracts visitors searching for prop-firm hedging solutions  extract intent signals.
- IB partner (Vantage/BlackBull) shares a referral list  ingest, deduplicate, and score.
- Monthly lead pipeline review is due  generate segment health report.

## Input Specification

| Field | Type | Required | Description |
|---|---|---|---|
| lead_source | enum | Yes | landing_page, discord, google_ads, meta_ads, organic_search, ib_referral, manual_import |
| raw_leads | object[] | Yes | Array of { email, name?, source_url?, utm_params?, discord_id?, broker? } |
| scoring_model | enum | No | default or ggressive  aggressive lowers thresholds for beta-growth phase (default: default) |
| enrichment_level | enum | No | asic (email validation only) or ull (email + social + trading profile)  default: ull |
| auto_route | boolean | No | If 	rue, automatically trigger the appropriate email sequence for scored leads (default: 	rue) |

## Step-by-Step Process

### 1. Lead Ingestion
- Accept raw leads from the specified lead_source.
- For **landing page**: Pull GA4 session data via GA4_MEASUREMENT_ID to capture UTM parameters, pages visited, time-on-site, and CTA interactions.
- For **Discord**: Monitor #general, #hedging-strategies, and #support channels for users expressing prop-firm pain points. Flag keywords: "drawdown", "challenge failed", "hedge", "multiple accounts", "FTMO", "The5%ers", "TopStep", "Apex", "funded account", "capital preservation".
- For **paid ads**: Ingest Meta/Google Ads lead form submissions via META_ADS_TOKEN / GOOGLE_ADS_API_KEY.
- For **IB referral**: Accept CSV/JSON from Vantage or BlackBull partnership team.
- Store all raw leads in Supabase leads table via SUPABASE_URL + SUPABASE_KEY.

### 2. Deduplication & Validation
- Deduplicate by email (primary) and Discord ID (secondary).
- Validate email deliverability  reject disposable/temporary email domains.
- Merge duplicate records, preserving the earliest created_at and richest profile data.
- Flag existing Hedge Edge users (match against Supabase users table) to avoid re-marketing to active subscribers.

### 3. Enrichment
- **Basic**: Email syntax validation + MX record check.
- **Full enrichment**:
  - Cross-reference Discord membership (is this lead in the Hedge Edge Discord?).
  - Check for prop-firm community activity (public profiles on FTMO leaderboard, MyFXBook, MQL5).
  - Identify broker affiliation  are they already trading with Vantage or BlackBull (potential IB conversion)?
  - Estimate account count and challenge stage from available signals.
  - Append enrichment data back to Supabase leads table.

### 4. Lead Scoring
Apply a points-based scoring model:

| Signal | Points |
|---|---|
| Visited pricing page | +20 |
| Downloaded app / started trial | +40 |
| Discord member | +15 |
| Asked about hedging in Discord | +25 |
| Clicked Google/Meta ad | +10 |
| Opened previous email | +10 |
| Clicked CTA in previous email | +15 |
| Trades with Vantage or BlackBull | +20 |
| Manages 3+ funded accounts | +30 |
| Previously failed a prop-firm challenge | +25 |
| Visited landing page 3+ times in 7 days | +20 |
| Referred by existing user | +15 |

**Score thresholds**:
- Cold: 0-29  add to newsletter list, long-term nurture.
- Warm: 30-59  trigger conversion drip email sequence.
- Hot: 60+  flag for immediate outreach (personal email or Discord DM from founder).

**Aggressive model** (for growth phase): Lower warm threshold to 20, hot to 45.

### 5. Segmentation
- Assign leads to Supabase segments based on score + attributes:
  - cold_newsletter  educational content, build awareness.
  - warm_trial_nudge  product-focused emails, free trial CTA.
  - hot_founder_outreach  personal touch, schedule demo or 1:1.
  - ib_warm_vantage / ib_warm_blackbull  broker-specific IB conversion path.
  - churned_re_target  previously trialled but didn't convert.

### 6. Routing
- If uto_route is true:
  - Cold  add to Newsletter Management skill queue.
  - Warm  trigger Email Marketing skill with campaign_type: conversion_drip.
  - Hot  send n8n webhook to alert founder + trigger high-priority welcome sequence.
  - IB-warm  trigger Email Marketing skill with campaign_type: ib_referral.
- Sync all segments to Google Sheets CRM via n8n for manual review.

### 7. Pipeline Hygiene (Weekly)
- Re-score all leads based on latest interaction data (email opens, site visits, Discord activity).
- Decay scores by -5 points/week for leads with zero interactions.
- Archive leads with scores below 0 after 60 days of inactivity.
- Remove hard bounces and unsubscribes from active pipeline.

## Output Specification

| Output | Format | Destination |
|---|---|---|
| Scored lead records | JSON array [{ email, name, score, segment, enrichment_data, source }] | Supabase leads table |
| Pipeline summary | JSON { total_leads, cold_count, warm_count, hot_count, new_this_week, score_distribution } | Google Sheets CRM + Notion |
| Hot lead alerts | Webhook payload { email, name, score, top_signals } | n8n  founder notification (Discord/email) |
| Segment sync | CSV export | Google Sheets CRM |
| Routing actions | Trigger payloads | Email Marketing skill, Newsletter Management skill |

## API & Platform Requirements

| Platform | Variable | Operations Used |
|---|---|---|
| Supabase | SUPABASE_URL, SUPABASE_KEY | Read/write leads table, query users for dedup, read event logs |
| GA4 | GA4_MEASUREMENT_ID | Pull session data, page views, CTA events for landing page visitors |
| Google Ads | GOOGLE_ADS_API_KEY | Fetch lead form submissions, click data, conversion events |
| Meta Ads | META_ADS_TOKEN | Fetch lead form submissions, audience overlap reports |
| n8n | N8N_WEBHOOK_URL | Route hot-lead alerts, sync CRM, trigger email sequences |
| Notion | NOTION_API_KEY | Update pipeline dashboard, log weekly hygiene reports |
| Creem.io | CREEM_API_KEY | Match leads to checkout events for conversion attribution |

## Quality Checks

- [ ] Zero duplicate leads in Supabase (unique constraint on email)
- [ ] Email validation rejects 100% of disposable/temp domains
- [ ] Lead scoring model produces a roughly normal distribution (no > 60% in a single tier)
- [ ] Hot leads receive founder outreach within 4 hours of scoring
- [ ] Weekly pipeline hygiene runs without manual intervention
- [ ] Enrichment data populates  70% of non-null fields for full-enrichment leads
- [ ] All UTM parameters from paid campaigns are correctly captured and attributed
- [ ] Score decay prevents stale leads from clogging the warm/hot pipeline
- [ ] IB-affiliated leads are correctly routed to broker-specific nurture paths
- [ ] Pipeline summary matches between Supabase counts and Google Sheets CRM ( 1% tolerance)
