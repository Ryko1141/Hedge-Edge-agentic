---
name: landing-page-optimization
description: |
  Continuously test and improve the Hedge Edge landing page (hedge-edge.com) hosted on Vercel
  to maximise visitor-to-trial and trial-to-paid conversion rates. Covers A/B testing, CTA
  optimization, pricing page experiments, page speed, mobile UX, and funnel analysis using
  GA4 data  all tailored to converting prop-firm traders who are evaluating hedging tools.
---

# Landing Page Optimization

## Objective

Achieve and sustain a landing-page-to-trial conversion rate of 8%+ and a pricing-page-to-checkout conversion rate of 12%+. Reduce bounce rate below 40% for paid traffic and below 55% for organic traffic. Every experiment must be grounded in prop-firm trader psychology: capital preservation anxiety, challenge-failure fear, desire for automation, and skepticism toward "too good to be true" tools.

## When to Use This Skill

- Conversion rate drops below 6% for 7 consecutive days  diagnose and fix.
- A new paid ad campaign launches  create a campaign-specific landing page variant.
- Pricing changes are being tested (\/\/\ tiers)  run pricing page experiment.
- A major feature ships (MT4 connector, cTrader support)  update hero section and feature blocks.
- GA4 funnel analysis reveals a drop-off point (e.g., 60% exit at pricing page)  targeted fix.
- Quarterly CRO (Conversion Rate Optimization) sprint  systematic multi-variant testing.
- Page speed score drops below 90 on Lighthouse  performance remediation.

## Input Specification

| Field | Type | Required | Description |
|---|---|---|---|
| experiment_type | enum | Yes | hero_test, cta_test, pricing_page, social_proof, page_speed, 
ew_variant, mobile_ux |
| hypothesis | string | Yes | Clear statement: "Changing X to Y will improve Z by N% because [reason]" |
| variant_specs | object[] | Yes | [{ variant_name, changes_description, mockup_url? }]  min 2 (control + 1 challenger) |
| traffic_split | number[] | No | Percentage split per variant  default: equal split |
| success_metric | enum | Yes | 	rial_signup_rate, checkout_rate, ounce_rate, 	ime_on_page, cta_click_rate |
| min_sample_size | integer | No | Minimum visitors per variant before declaring winner  default: 500 |
| duration_days | integer | No | Maximum experiment duration  default: 14 |

## Step-by-Step Process

### 1. Funnel Diagnosis
- Pull current funnel data from GA4 via GA4_MEASUREMENT_ID:
  - Landing page  pricing page (target: 40%+ progression).
  - Pricing page  checkout initiation (target: 20%+ progression).
  - Checkout initiation  checkout completion (target: 60%+  Creem.io-side).
  - Overall visitor  trial signup (target: 8%+).
- Identify the largest drop-off point as the priority experiment area.
- Segment by traffic source (organic vs. paid vs. direct vs. Discord referral)  different sources have different intent levels.
- Check device split: if mobile traffic > 40% but mobile conversion < half of desktop, prioritise mobile UX.

### 2. Hypothesis Formation
- Ground every hypothesis in prop-firm trader behaviour:
  - "Traders who have failed a challenge are skeptical of new tools  adding a money-back guarantee badge near the CTA will increase trial signups by 15%."
  - "Showing real-time user count ('487 traders hedging right now') creates FOMO and social proof  will reduce bounce rate by 10%."
  - "Traders care about specific prop-firm compatibility  adding FTMO/TopStep/Apex logos to the hero reduces the 'will this work for me?' objection."
  - "The current 'Start Free Trial' CTA is generic  changing to 'Protect Your Funded Accounts' aligns with trader pain and will improve CTR by 20%."

### 3. Variant Development
- Design variant changes using the current Hedge Edge design system (dark theme, trading-UI aesthetic, green/blue accent palette).
- **Hero section tests**:
  - Control: Current headline and sub-headline.
  - Variant A: Pain-led  "Stop Losing Funded Accounts to Drawdown Breaches".
  - Variant B: Solution-led  "Automated Multi-Account Hedging for Prop Traders".
  - Variant C: Proof-led  "500+ Traders Protecting \+ in Funded Capital".
- **CTA tests**:
  - Control: "Start Free Trial"
  - Variant A: "Protect My Accounts  Free for 14 Days"
  - Variant B: "Get Hedge Edge  No Card Required"
  - Variant C: "See It In Action" (leads to demo video, then trial CTA)
- **Pricing page tests**:
  - Control: Three-tier horizontal cards.
  - Variant A: Comparison table with feature checkmarks.
  - Variant B: Calculator  "How many accounts do you manage?"  recommends tier.
  - Variant C: Annual pricing toggle with savings highlight (30% savings badge).
- **Social proof tests**:
  - Control: No testimonials above fold.
  - Variant A: 3 trader testimonials with Discord avatars.
  - Variant B: Real-time counter + recent signup notifications ("John from London just signed up").
  - Variant C: Case study summary  "How a 5-account FTMO trader saved 3 challenges in one month".
- Deploy variants via Vercel VERCEL_TOKEN  use edge config or feature flags for traffic splitting.

### 4. Experiment Execution
- Implement traffic split using Vercel Edge Middleware or client-side feature flag.
- Ensure GA4 event tracking is configured for each variant:
  - page_variant custom dimension.
  - cta_click event with ariant_name parameter.
  - 	rial_signup conversion event.
  - checkout_initiated and checkout_completed events (via Creem.io webhook  GA4 Measurement Protocol).
- Run experiment for minimum duration_days or until min_sample_size is reached per variant.
- Do not peek at results before minimum sample is collected (avoid peeking bias).

### 5. Statistical Analysis
- Calculate conversion rate per variant with 95% confidence interval.
- Use a two-proportion z-test or Bayesian A/B methodology.
- Declare a winner only if:
  - p-value < 0.05 (frequentist) or probability-to-be-best > 95% (Bayesian).
  - Minimum sample size met for all variants.
  - Result is consistent across traffic sources (paid and organic both show improvement, or at least no degradation in either).
- If no clear winner after duration_days, extend by 7 days or declare inconclusive and document learnings.

### 6. Implementation & Rollout
- Roll winning variant to 100% traffic via Vercel deployment.
- Update the control baseline for future experiments.
- Document the experiment result in Notion campaign retrospective:
  - Hypothesis, variants tested, sample sizes, conversion rates, confidence level, uplift %.
- Notify Business Strategist Agent if pricing-page changes affect revenue projections.
- Notify Content Engine Agent if new messaging/positioning won (update brand guidelines).

### 7. Page Performance Monitoring
- Monthly Lighthouse audit (target scores):
  - Performance:  90
  - Accessibility:  95
  - Best Practices:  90
  - SEO:  95
- Core Web Vitals (from Google Search Console via SEARCH_CONSOLE_KEY):
  - LCP (Largest Contentful Paint): < 2.5s
  - FID (First Input Delay): < 100ms
  - CLS (Cumulative Layout Shift): < 0.1
- If any metric degrades after a variant deployment, roll back immediately.
- Optimize images (WebP/AVIF), lazy-load below-fold content, minimize JavaScript bundles.

## Output Specification

| Output | Format | Destination |
|---|---|---|
| Experiment report | JSON { experiment_id, hypothesis, variants[], sample_sizes[], conversion_rates[], winner, confidence, uplift_pct } | Notion + Google Sheets CRM |
| Funnel analysis | JSON { stage, visitors, progression_rate, drop_off_rate }[] | GA4 dashboard + Notion |
| Page speed report | JSON { lcp, fid, cls, performance_score, accessibility_score } | Notion + alert if degraded |
| Winning variant deployment | Vercel production deployment | hedge-edge.com |
| Messaging insights | string (winning headline/CTA) | Content Engine Agent + agent memory |

## API & Platform Requirements

| Platform | Variable | Operations Used |
|---|---|---|
| Vercel | VERCEL_TOKEN | Deploy page variants, manage edge config, trigger builds |
| GA4 | GA4_MEASUREMENT_ID | Funnel analysis, variant tracking, conversion events |
| Google Search Console | SEARCH_CONSOLE_KEY | Core Web Vitals, mobile usability, indexed page status |
| Supabase | SUPABASE_URL, SUPABASE_KEY | Trial signup events for conversion attribution |
| Creem.io | CREEM_API_KEY | Checkout events for pricing-page experiment attribution |
| n8n | N8N_WEBHOOK_URL | Relay conversion events to GA4, automate experiment reporting |
| Notion | NOTION_API_KEY | Experiment logs, CRO sprint planning, retrospective documentation |

## Quality Checks

- [ ] Every experiment has a documented hypothesis before launch
- [ ] Minimum sample size is met before declaring any winner
- [ ] Statistical significance threshold (p < 0.05) is enforced
- [ ] No more than 2 experiments run simultaneously on the same page section
- [ ] Variants do not break mobile experience (test on iOS Safari, Chrome Android)
- [ ] Lighthouse Performance score  90 maintained after every deployment
- [ ] Core Web Vitals remain in "Good" range for all pages
- [ ] Pricing page experiments are approved by Business Strategist Agent before launch
- [ ] All landing page CTAs link to valid Creem.io checkout or trial signup flow
- [ ] Experiment results are logged in Notion within 48h of conclusion
- [ ] Rollback plan exists for every variant deployment (previous Vercel deployment ID stored)
