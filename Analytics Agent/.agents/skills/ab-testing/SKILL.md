---
name: ab-testing
description: |
  Design, monitor, and analyze controlled experiments across the Hedge Edge funnel  landing page variants, pricing page layouts, onboarding flows, email sequences, feature rollouts, and in-app messaging. Ensure statistical rigor with proper sample sizing, sequential testing boundaries, significance calculations, and guardrail metrics. Prevent common pitfalls including peeking, p-hacking, Simpson's paradox, and novelty effects.
---

# A/B Testing

## Objective

Replace opinion-driven decisions with evidence-based experimentation. Every change to the Hedge Edge funnel, landing page, pricing, onboarding, or product should be testable. This skill provides the framework to design experiments that produce trustworthy results, monitor them safely, and translate outcomes into concrete revenue impact. At ~500 users, sample size is a real constraint  every experiment must be designed to maximize statistical power with limited traffic.

## When to Use This Skill

- **Landing page optimization**: Testing headline, CTA copy, layout, social proof, pricing presentation on the Vercel-hosted page
- **Onboarding flow changes**: Testing different onboarding sequences to improve activation rate (EA connection, first hedge)
- **Pricing page experiments**: Testing plan presentation, anchoring, feature comparison layout, annual vs. monthly emphasis
- **Email sequence testing**: Subject lines, send times, content variants, sequence length for nurture campaigns
- **Feature rollout**: Gradual feature release (e.g., MT4 integration beta) to measure impact on engagement and retention
- **In-app messaging**: Testing upgrade prompts, IB activation nudges, feature adoption CTAs
- **Checkout flow**: Testing payment page layout, trust signals, billing frequency defaults on Creem.io checkout
- **Prop firm specific messaging**: Testing whether firm-specific copy (e.g., "Built for FTMO traders") outperforms generic copy

## Input Specification

### Required Inputs
| Field | Source | Description |
|---|---|---|
| hypothesis | Request parameter | Clear hypothesis in format: "Changing [X] from [current] to [variant] will increase [metric] by [expected lift] because [reasoning]" |
| primary_metric | Request parameter | The single metric the test is designed to move (e.g., signup rate, trial-to-paid conversion, 7-day retention) |
| aseline_rate | Historical data / KPI Dashboards | Current conversion rate for the primary metric |
| minimum_detectable_effect | Request parameter | Smallest meaningful improvement to detect (e.g., +15% relative lift = 8%  9.2% absolute) |
| 	raffic_volume | GA4 / Supabase | Expected daily/weekly traffic or user volume entering the experiment |
| 	est_duration_limit | Request parameter | Maximum acceptable test duration (budget/patience constraint) |

### Optional Inputs
| Field | Source | Description |
|---|---|---|
| guardrail_metrics | Request parameter | Metrics that must NOT degrade (e.g., "bounce rate must not increase >5%", "support tickets must not increase") |
| segments | Request parameter | Pre-defined segments for subgroup analysis (plan tier, channel, device, prop firm) |
| exclusion_criteria | Request parameter | Users to exclude (existing paid users, test accounts, specific geographies) |
| secondary_metrics | Request parameter | Additional metrics to track (not used for decision-making but for learning) |
| confidence_level | Request parameter | Required significance level (default: 95%, α=0.05) |
| power | Request parameter | Statistical power (default: 80%, β=0.20) |

## Step-by-Step Process

### Step 1: Experiment Design
1. **Formalize the hypothesis**:
   `
   Hypothesis: Changing the landing page headline from "Automated Hedge Management"
   to "Pass Your Prop Firm Challenge  Hedge Smarter" will increase the signup click
   rate by 20% (from 8.0% to 9.6%) because prop-firm-specific language resonates 
   more with our target audience who are actively trying to pass challenges.
   `
2. **Define the primary metric**: Must be a single, clearly measurable metric with a known baseline
3. **Set guardrail metrics**: Metrics that must not degrade beyond a threshold
   - Common guardrails for Hedge Edge: bounce rate, page load time, support ticket volume, payment failure rate
4. **Calculate required sample size**:
   - Use the formula:  = \frac{(Z_{\alpha/2} + Z_{\beta})^2 \cdot (p_1(1-p_1) + p_2(1-p_2))}{(p_2 - p_1)^2}$
   - Where $ = baseline rate, $ = expected rate with lift, $\alpha$ = 0.05 (two-tailed), $\beta$ = 0.20
   - Example: Baseline 8%, MDE +20% relative ( 9.6%), α=0.05, β=0.20
     - Required: ~4,750 visitors per variant (~9,500 total)
     - At 330 landing page visitors/day = ~29 days to reach significance
5. **Estimate test duration**: Required sample / daily traffic volume
   - If duration >6 weeks, reconsider: increase MDE (accept only larger effects), target higher-traffic page, or use a different method (Bayesian, bandit)
6. **Validate feasibility**: With ~500 users and ~10,000 monthly landing page visitors, some tests are feasible on the landing page but in-app tests on paid users will require longer durations or larger MDE thresholds

### Step 2: Randomization & Assignment
1. **Traffic split**: Default 50/50 for two-variant tests. For tests with high-risk variants, consider 80/20 (control-heavy)
2. **Randomization unit**: 
   - Landing page tests: Cookie-based (GA4 user_pseudo_id) for visitor-level randomization
   - In-app tests: User-level (Supabase user_id) for consistent experience
   - Email tests: Send-level randomization within the segment
3. **Assignment persistence**: Once a user is assigned to a variant, they stay in that variant for the test duration. No re-randomization.
4. **Exclusions applied**: Test accounts, internal users, and any specified exclusion cohorts removed before randomization
5. **Sample Ratio Mismatch (SRM) check**: After 48 hours, verify that variant populations are within expected range (chi-squared test, p>0.01). If SRM detected, halt test and investigate (usually a technical bug in assignment).

### Step 3: Implementation Guidance
1. **Landing page tests** (Vercel):
   - Use feature flags or URL parameter-based variant serving
   - Ensure both variants load from same CDN/edge with identical performance
   - Track variant assignment in GA4 as a custom dimension
   - Track conversion events (signup_click, trial_start) with variant tag
2. **Email tests** (n8n/email platform):
   - Split the send list randomly before sending
   - Track opens, clicks, and downstream conversions (signup, trial, paid) per variant
   - Ensure identical send time and sender for both variants
3. **In-app tests** (Supabase + Electron app):
   - Use Supabase feature flags or a simple config table to control variant assignment
   - Track in-app events with variant metadata
   - Ensure variant doesn't affect app performance or stability
4. **Checkout tests** (Creem.io):
   - Limited by Creem.io customization options  test pre-checkout elements (pricing page layout, plan emphasis) rather than the checkout flow itself

### Step 4: Monitoring During Test
1. **Daily check** (automated via n8n):
   - Sample sizes per variant (check for SRM)
   - Running conversion rates per variant (do NOT make decisions yet)
   - Guardrail metrics status (error rates, load times, support tickets)
   - Data quality: Are events logging correctly in both variants?
2. **Stopping rules** (pre-defined, not ad-hoc):
   - **Stop for harm**: If guardrail metric degrades >20% with p<0.01, stop the test immediately and revert to control
   - **Stop for technical issues**: If SRM detected, data logging failure, or variant serving error
   - **DO NOT STOP EARLY for positive results** unless using a valid sequential testing framework (see below)
3. **Peeking mitigation**:
   - Use sequential testing (alpha spending function) if early stopping is desired:
     - O'Brien-Fleming boundaries: Very conservative early, relaxed late
     - Set maximum of 3-5 interim analyses at pre-specified fractions of total sample
   - Alternatively, use a Bayesian framework with a pre-specified decision threshold (e.g., P(variant > control) > 95%)
4. **Duration guardrail**: Do not run test beyond 2x the estimated duration  if still inconclusive, the true effect is likely smaller than MDE and not worth chasing

### Step 5: Analysis & Statistical Testing
1. **Primary analysis** (run only after full sample size reached):
   - Calculate conversion rate per variant with 95% confidence intervals
   - Two-proportion z-test (frequentist) or Beta-Binomial posterior (Bayesian)
   - Report: observed lift (absolute and relative), p-value, confidence interval for the lift
   `
   Control: 8.0% (380/4,750), 95% CI [7.23%, 8.77%]
   Variant: 9.8% (465/4,750), 95% CI [8.95%, 10.65%]
   Relative Lift: +22.5%, p = 0.003
   95% CI for Lift: [+7.8%, +37.2%]
   Decision: WINNER  Variant outperforms with statistical significance
   `
2. **Revenue impact projection**:
   - Lift in conversion rate  monthly traffic  LTV = monthly revenue impact
   - Example: +1.8pp signup rate  10,000 visitors/mo  70% trial  30% paid   LTV = ,596/mo incremental revenue
3. **Guardrail check**: Confirm no guardrail metric degraded beyond threshold
4. **Segment analysis** (exploratory, not decisive):
   - Check if lift varies by segment (mobile vs. desktop, channel, prop firm)
   - Flag significant interactions but DO NOT change the decision based on subgroup analysis alone (multiple comparison problem)
5. **Novelty effect assessment**: For in-app tests, check if the variant effect diminishes over the first 7-14 days (users reacting to "new" rather than "better")

### Step 6: Decision & Documentation
1. **Decision framework**:
   - **Ship variant**: p < 0.05, positive lift, no guardrail violations, no SRM, no novelty effect
   - **Keep control**: p > 0.05 (inconclusive) or variant underperforms
   - **Iterate**: If directionally positive (p < 0.15) but not significant, design a follow-up test with refined variant
   - **Investigate**: If contradictory signals (conversion up but engagement down), investigate before making a decision
2. **Document the experiment** in Notion:
   `
   Experiment: [Name]
   Hypothesis: [Statement]
   Duration: [Start]  [End]
   Sample Size: [Control N] / [Variant N]
   Primary Metric: [Metric]  Control: [X%] vs Variant: [Y%]
   Lift: [+/- Z%], p = [value], 95% CI: [range]
   Guardrails: [All clear / Issues]
   Decision: [Ship / Keep control / Iterate]
   Revenue Impact: $[amount]/month projected
   Learnings: [Key takeaways for future experiments]
   `
3. **Feed results into attribution and funnel models**: If variant ships, update baseline rates in Funnel Analytics skill

### Step 7: Test Prioritization (ICE Framework)
When multiple test ideas exist, score and rank them:
1. **Impact** (1-10): How much revenue could this test unlock?
   - Landing page headline test: Impact 8 (affects top of funnel)
   - Onboarding email sequence: Impact 6 (affects trial-to-paid)
   - CTA button color: Impact 2 (marginal effect)
2. **Confidence** (1-10): How sure are we the variant will win?
   - Based on user research, competitor data, or prior test results
3. **Ease** (1-10): How easy is it to implement and measure?
   - Landing page text change: Ease 9 (deploy in minutes via Vercel)
   - Checkout flow change: Ease 3 (limited by Creem.io, may need engineering)
4. **ICE Score** = Impact  Confidence  Ease / 10
5. Run at most 2 tests simultaneously (to avoid interaction effects)  prioritize by ICE score

## Output Specification

### Experiment Plan Document
`markdown
# Experiment Plan: [Name]
## Hypothesis
[Statement in full format]
## Design
- Primary metric: [metric] (baseline: [X%])
- MDE: [Y%] relative lift
- Required sample: [N] per variant ([total])
- Estimated duration: [X] days at [Y] visitors/day
- Traffic split: [50/50]
- Guardrail metrics: [list with thresholds]
## Implementation
- Platform: [Vercel/Supabase/n8n]
- Variant description: [specific change]
- Tracking: [events to log, dimensions to capture]
## Monitoring Schedule
- SRM check: Day 2
- Interim analysis: Day [X] (if using sequential testing)
- Full analysis: Day [Y]
## Decision Criteria
- Ship if: p < 0.05, lift > 0, guardrails clear
- Kill if: guardrail violation at p < 0.01
`

### Results Report
`markdown
# Experiment Results: [Name]
## Summary
- Result: [WINNER / NO WINNER / INCONCLUSIVE]
- Observed lift: [+/- X%] (95% CI: [range])
- p-value: [value]
- Revenue impact: $[amount]/month
## Detailed Results
[Full statistical output]
## Guardrail Status
[All clear / Issues detected]
## Segment Analysis
[Exploratory findings]
## Decision
[Ship variant / Keep control / Iterate with follow-up]
## Learnings
[What we learned for future experiments]
`

## API & Platform Requirements

| Platform | Endpoint/Method | Auth | Purpose |
|---|---|---|---|
| GA4 | Data API v1 unReport with custom dimension for variant | GA4_MEASUREMENT_ID + GA4_API_SECRET | Landing page test data, conversion events by variant |
| Supabase | /rest/v1/experiments, /rest/v1/events | SUPABASE_URL + SUPABASE_KEY | Experiment config, variant assignment, in-app event tracking |
| Creem.io | /v1/subscriptions | CREEM_API_KEY | Downstream conversion validation (trial-to-paid by variant) |
| Vercel | Edge Config / Feature Flags (or URL param routing) | VERCEL_ANALYTICS_TOKEN | Landing page variant serving and performance data |
| Google Sheets | Sheets API v4 | GOOGLE_SHEETS_API_KEY | Experiment log, results dashboard |
| Notion | /v1/pages | NOTION_API_KEY | Experiment documentation (plans and results) |
| n8n | POST N8N_WEBHOOK_URL | Webhook URL | Automated monitoring, SRM alerts, guardrail violation alerts |

## Quality Checks

- [ ] **Hypothesis documented before test starts**: No post-hoc hypothesis formation
- [ ] **Sample size calculated and recorded**: Using proper power analysis, not gut feel
- [ ] **SRM checked within 48 hours**: Sample ratio within expected range (chi-squared p > 0.01)
- [ ] **No early stopping without sequential framework**: Test ran to planned sample size unless sequential boundaries pre-specified
- [ ] **Guardrails monitored throughout**: No guardrail violation went undetected for >24 hours
- [ ] **Single primary metric**: Decision based on one pre-specified metric, not whichever metric looks best
- [ ] **Confidence interval reported**: Not just p-value. CI for relative lift conveyed alongside point estimate.
- [ ] **Revenue impact quantified**: Every result translated to monthly/annual revenue impact in dollars
- [ ] **Segment analysis labeled as exploratory**: Subgroup results clearly marked as hypothesis-generating, not decision-making
- [ ] **Novelty effect considered**: For in-app tests, duration sufficient to account for novelty (14 days post-launch)
- [ ] **Results documented in Notion**: Full experiment record with hypothesis, design, results, learnings, and decision
- [ ] **Baseline rates updated**: If variant ships, Funnel Analytics skill updated with new baseline conversion rate
