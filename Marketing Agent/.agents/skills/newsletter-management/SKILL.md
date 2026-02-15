---
name: newsletter-management
description: |
  Produce, distribute, and optimise the Hedge Edge recurring newsletter targeting prop-firm
  traders. Manages list hygiene, deliverability, content curation, A/B testing, and subscriber
  growth. The newsletter is the primary top-of-funnel nurture channel for cold leads and the
  retention touchpoint for existing users.
---

# Newsletter Management

## Objective

Grow the Hedge Edge newsletter subscriber base to 2,000+ within 6 months while maintaining open rates above 40% and click-through rates above 7%. The newsletter educates prop-firm traders on hedging strategies, product updates, market conditions affecting funded accounts, and broker promotions  converting readers into trial users and trial users into paid subscribers.

## When to Use This Skill

- It is the scheduled newsletter send day (bi-weekly, every other Tuesday).
- The Content Engine Agent has produced new blog posts, guides, or video content that needs distribution.
- A major product update (MT4 connector, cTrader support, new pricing tier) requires announcement.
- Subscriber growth has stalled  activate list-growth tactics (lead magnets, referral program).
- Deliverability metrics have degraded (open rate < 30%, bounce rate > 3%)  run list hygiene.
- A seasonal or market event affects prop-firm traders (e.g., holiday trading hours, broker promotions, challenge rule changes at FTMO/TopStep).

## Input Specification

| Field | Type | Required | Description |
|---|---|---|---|
| edition_number | integer | Yes | Sequential newsletter edition (e.g., 24) |
| primary_topic | string | Yes | Main theme (e.g., "MT4 connector beta launch", "Surviving drawdown in volatile markets") |
| content_links | object[] | Yes | [{ title, url, type: "blog"|"video"|"guide"|"product_update" }]  curated content for this edition |
| subscriber_segment | enum | No | ll, ctive_30d, 	rial_only, paid_only  default: ll |
| sponsored_section | object | No | { sponsor: "vantage"|"blackbull", copy, cta_url }  IB broker promotion placement |
| growth_tactic | enum | No | 
one, eferral_program, lead_magnet, cross_promo  default: 
one |

## Step-by-Step Process

### 1. Content Curation
- Pull latest content from Content Engine Agent output: blog posts, YouTube videos, trading guides, product changelogs.
- Select 3-5 pieces that align with the primary_topic.
- Write a 100-150 word editorial intro from the Hedge Edge team voice  insightful, direct, empathetic to the prop-firm grind.
- Structure the newsletter:
  1. **Header**: Hedge Edge logo + edition number + date.
  2. **Editorial**: 2-3 paragraphs on the primary topic  e.g., "Why correlated exposure is the silent challenge killer."
  3. **Featured content**: Hero article/video with thumbnail and CTA.
  4. **Quick links**: 2-3 additional content pieces as bullet summaries.
  5. **Product spotlight**: Latest feature or upcoming release (e.g., "cTrader integration  sign up for early access").
  6. **Broker corner** (optional): Vantage or BlackBull promotion if sponsored_section provided.
  7. **Community highlight**: Top Discord discussion of the week, user testimonial, or trading tip from the community.
  8. **Footer**: Social links, unsubscribe, compliance disclaimer, company address (London, UK).

### 2. Subject Line & Preview Text
- Generate 3 subject line variants (max 50 characters each)  optimised for curiosity and prop-firm relevance.
- Examples:
  - "The drawdown trap nobody talks about"
  - "MT4 hedging is here  early access inside"
  - "How 5 funded accounts became 0 (and how to prevent it)"
- Write preview text (max 90 characters) that complements the subject line without repeating it.

### 3. List Preparation
- Pull subscriber list from Brevo/Mailchimp via EMAIL_API_KEY.
- Apply segment filter if subscriber_segment is not ll.
- Run pre-send hygiene:
  - Remove hard bounces from previous sends.
  - Suppress users with 5+ consecutive non-opens (move to "re-engagement" segment  do not delete).
  - Validate new subscribers added since last edition.
- Final count check: log total recipients vs. previous edition (flag if > 5% drop).

### 4. A/B Test Configuration
- Split: 15% List A (subject 1) / 15% List B (subject 2) / 70% Winner.
- Winner metric: Open rate after 3-hour test window.
- If neither variant achieves > 25% open rate in the test window, send subject 3 to the remaining 70%.

### 5. Technical Build & Send
- Build responsive HTML template (single-column, mobile-first, < 100KB).
- Upload to Brevo/Mailchimp via EMAIL_API_KEY.
- Schedule send: Tuesday 09:00 UTC (peak open window for UK/EU traders, morning for US East Coast).
- Tag edition in Notion marketing calendar via NOTION_API_KEY.

### 6. Growth Tactics (if enabled)
- **Referral program**: Include shareable link with tracking  "Share Hedge Edge with a trader friend, both get 1 month free."
  - Track referrals via Supabase eferrals table.
  - Fulfil rewards via Creem.io coupon code generation.
- **Lead magnet**: Embed download CTA for gated content (e.g., "The Prop Firm Hedging Playbook  free PDF").
  - Gate behind email capture for non-subscribers (served via Vercel landing page).
- **Cross-promo**: Coordinate with prop-firm educator newsletters for mutual shout-outs.

### 7. Post-Send Analysis (24h + 72h)
- Pull metrics from email platform API:
  - Open rate, click rate, click-to-open rate (CTOR), unsubscribe rate, spam complaints.
  - Top-clicked links (identifies content resonance).
  - Device breakdown (mobile vs. desktop  informs template decisions).
- Compare against rolling 6-edition average.
- Log in Notion retrospective and Google Sheets CRM.
- Update KPI dashboard: Topic-level CTR (which content themes drive the most engagement).

### 8. Deliverability Maintenance (Monthly)
- Check sender reputation via Brevo/Mailchimp deliverability tools.
- Review SPF, DKIM, and DMARC records for hedgeedgebusiness@gmail.com sending domain.
- Monitor blacklist status.
- Prune inactive subscribers (no opens in 90 days)  send final re-engagement email before removal.

## Output Specification

| Output | Format | Destination |
|---|---|---|
| Newsletter HTML | .html file | Brevo/Mailchimp template library |
| Edition performance report | JSON { edition, subject_winner, open_rate, click_rate, ctor, unsub_rate, top_links[], device_split } | Google Sheets CRM + Notion |
| Subscriber growth report | JSON { total_subscribers, new_this_edition, churned, net_growth, referral_signups } | Supabase + Notion |
| Content resonance data | JSON { topic, ctr, click_count }[] | Content Engine Agent (for editorial calendar feedback) |
| Deliverability health | JSON { sender_score, blacklist_status, spf_ok, dkim_ok, dmarc_ok } | Notion + alert if degraded |

## API & Platform Requirements

| Platform | Variable | Operations Used |
|---|---|---|
| Brevo / Mailchimp | EMAIL_API_KEY | Template upload, list management, campaign send, analytics pull |
| Supabase | SUPABASE_URL, SUPABASE_KEY | Subscriber data, referral tracking, event logging |
| n8n | N8N_WEBHOOK_URL | Automate list sync, trigger post-send analytics collection |
| Notion | NOTION_API_KEY | Marketing calendar, edition planning, retrospective logs |
| GA4 | GA4_MEASUREMENT_ID | Track newsletter click-throughs to landing page behaviour |
| Creem.io | CREEM_API_KEY | Generate referral coupon codes, track newsletter-attributed conversions |
| Vercel | VERCEL_TOKEN | Host lead-magnet landing pages, newsletter archive pages |

## Quality Checks

- [ ] Newsletter sends on schedule (bi-weekly Tuesday 09:00 UTC)
- [ ] A/B test runs with statistical rigour (min 50 opens per variant before declaring winner)
- [ ] Open rate  40% (stretch) /  35% (floor)
- [ ] Click-through rate  7% (stretch) /  5% (floor)
- [ ] Unsubscribe rate < 0.3% per edition
- [ ] Spam complaint rate < 0.05%
- [ ] All links resolve correctly (no 404s)  automated pre-send link check
- [ ] Mobile rendering is clean on iOS Mail, Gmail app, Outlook mobile
- [ ] Compliance disclaimer and unsubscribe link present
- [ ] Subscriber count trend is positive month-over-month
- [ ] Inactive subscriber pruning runs monthly without manual intervention
- [ ] Content resonance data is fed back to Content Engine Agent within 72h of send
