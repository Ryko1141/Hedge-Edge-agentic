---
name: email-marketing
description: |
  Design, build, and optimise automated email sequences and one-off campaigns for Hedge Edge.
  Covers the full lifecycle from welcome onboarding through trial conversion, feature education,
  re-engagement of churned users, and IB broker referral nudges. All emails target prop-firm
  traders and comply with UK marketing regulations  no guaranteed-return claims.
---

# Email Marketing

## Objective

Maximise email-driven revenue by nurturing Hedge Edge leads and users through targeted sequences that educate on automated hedging benefits, convert free/trial users to paid subscribers (\-\/mo), and reduce churn through ongoing value delivery  all while maintaining inbox reputation (spam complaint rate < 0.1%, open rate > 35%).

## When to Use This Skill

- A new user signs up via the Vercel landing page or Creem.io checkout  trigger **welcome sequence**.
- A trial user has not converted after 7 days  trigger **conversion drip**.
- A paid subscriber shows declining login frequency (Supabase event data)  trigger **re-engagement flow**.
- A product update ships (e.g., MT4 connector launch)  send **feature announcement blast**.
- An IB broker promotion is active (Vantage/BlackBull bonus period)  send **IB referral campaign**.
- Monthly performance insights are ready  send **value-recap email** with user-specific stats.

## Input Specification

| Field | Type | Required | Description |
|---|---|---|---|
| campaign_type | enum | Yes | welcome, conversion_drip, e_engagement, eature_announcement, ib_referral, alue_recap |
| audience_segment | string | Yes | Supabase segment identifier (e.g., 	rial_day_3, pro_inactive_14d, starter_active) |
| subject_line_variants | string[] | Yes | Minimum 2 A/B subject lines |
| cta_url | URL | Yes | Primary call-to-action destination (landing page, checkout, dashboard) |
| send_window | object | No | { timezone: "UTC", preferred_hours: [9,10,11] }  defaults to 09:00-11:00 UTC |
| ib_broker | enum | No | antage or lackbull  required for IB referral campaigns |
| personalization_fields | string[] | No | Supabase user fields to merge (e.g., irst_name, plan_tier, ccounts_count) |

## Step-by-Step Process

### 1. Audience Extraction
- Query Supabase via SUPABASE_URL + SUPABASE_KEY to pull the target segment.
- Cross-reference with Google Sheets CRM (via n8n N8N_WEBHOOK_URL) for enrichment data (lead source, Discord membership, last email interaction).
- Deduplicate and suppress users who have unsubscribed or marked spam.

### 2. Copy Creation
- Write email body following Hedge Edge voice: direct, technical-but-accessible, trader-to-trader tone.
- **Welcome sequence** (5 emails over 10 days):
  1. Day 0: "Your hedge shield is live"  app download + quick-start guide.
  2. Day 1: "Why 73% of prop-firm challenges fail"  education on drawdown risk, position Hedge Edge as the solution.
  3. Day 3: "Set up your first multi-account hedge in 90 seconds"  video walkthrough CTA.
  4. Day 5: "What FTMO traders wish they knew about correlated exposure"  case-study style, soft upgrade CTA.
  5. Day 10: "Your trial ends in 4 days  lock in Starter at \/mo"  urgency + savings framing.
- **Conversion drip** (3 emails):
  1. "Your hedging stats this week"  personalised usage data from Supabase.
  2. "Pro traders run 5+ accounts  are you leaving money on the table?"  tier upgrade positioning.
  3. "Last chance: 20% off your first month"  conditional discount via Creem.io coupon code.
- **Re-engagement flow** (2 emails):
  1. "We noticed you haven't hedged in 14 days  here's what changed"  product updates + market context.
  2. "Pause or cancel, no hard feelings  but here's what you'd lose"  value quantification (drawdown saves, accounts protected).
- **IB referral campaign**:
  1. "Trade with [Vantage/BlackBull] + Hedge Edge = lower costs, full protection"  explain IB commission benefit passed to user as tighter spreads.

### 3. Compliance Review
- Verify no language implies guaranteed profits or risk-free trading.
- Include disclaimer footer: "Hedge Edge is a risk-management tool. Trading involves risk of loss. Past performance is not indicative of future results."
- Ensure unsubscribe link is present and functional (CAN-SPAM + UK GDPR).

### 4. Technical Setup
- Upload HTML template to Brevo/Mailchimp via EMAIL_API_KEY.
- Configure automation trigger (Supabase webhook  n8n  email platform).
- Set A/B test split: 50/50 on subject lines, winner auto-sent after 4 hours to remaining list.
- Tag campaign in Notion marketing calendar via NOTION_API_KEY.

### 5. Send & Monitor
- Deploy within the configured send_window.
- Monitor first-hour metrics: bounce rate (target < 2%), open rate (target > 35%), click rate (target > 5%).
- If spam complaints exceed 0.05% in the first hour, pause campaign immediately and review content.

### 6. Post-Campaign Analysis
- Pull full-cycle metrics at 24h and 72h via email platform API.
- Attribute conversions to Creem.io checkout events via CREEM_API_KEY webhook data.
- Log results in Google Sheets CRM and Notion campaign retrospective.
- Feed winning subject lines and CTAs back as memory for future campaigns.

## Output Specification

| Output | Format | Destination |
|---|---|---|
| Campaign performance report | JSON { open_rate, click_rate, conversion_rate, revenue_attributed, spam_complaints } | Google Sheets CRM + Notion |
| Winning subject line | string | Agent memory for future A/B seeding |
| Segment health report | JSON { total_contacts, bounced, unsubscribed, active } | Supabase email_segments table |
| Next-action recommendation | string | Orchestrator for routing (e.g., "Trigger re-engagement for 43 users inactive > 14d") |

## API & Platform Requirements

| Platform | Variable | Operations Used |
|---|---|---|
| Brevo / Mailchimp | EMAIL_API_KEY | Create campaign, upload template, manage contacts, pull analytics |
| Supabase | SUPABASE_URL, SUPABASE_KEY | Query user segments, read trial/conversion events, write email interaction logs |
| n8n | N8N_WEBHOOK_URL | Trigger automation sequences, relay Supabase events to email platform |
| Creem.io | CREEM_API_KEY | Fetch checkout events for conversion attribution, generate coupon codes |
| Notion | NOTION_API_KEY | Log campaign briefs, record retrospectives, update marketing calendar |
| GA4 | GA4_MEASUREMENT_ID | Track email-originated sessions and on-site behaviour post-click |

## Quality Checks

- [ ] Spam complaint rate < 0.1% per campaign
- [ ] Open rate  35% (industry avg for SaaS: ~25%)
- [ ] Click-through rate  5%
- [ ] Unsubscribe rate < 0.5% per send
- [ ] All emails render correctly on Gmail, Outlook, Apple Mail, and mobile
- [ ] Personalisation merge tags resolve correctly (no {{first_name}} literals in sent mail)
- [ ] Compliance footer present on every email
- [ ] A/B test has statistical significance before declaring winner (min 100 opens per variant)
- [ ] Conversion revenue is attributed back to the originating campaign in Creem.io + GA4
- [ ] Supabase segment counts match email platform list counts ( 2% tolerance for sync lag)
