---
name: proposal-generation
description: |
  Creates tailored sales proposals, tier recommendations, discount structures, and checkout
  links for Hedge Edge prospects. Combines the lead's prop-firm profile with ROI modelling
  to produce a compelling, data-backed offer that drives conversion.
---

# Proposal Generation

## Objective

Generate personalised, data-driven proposals that map each prospect's prop-firm trading
profile to the optimal Hedge Edge tier. Every proposal quantifies the financial risk of
NOT using automated hedging, presents a clear ROI case, and includes a frictionless
Creem.io checkout link for immediate conversion.

## When to Use This Skill

- A demo has been completed and the lead is ready for a formal proposal.
- A hot lead (score 91100) requests pricing directly without needing a demo.
- A closing call is approaching and a proposal document needs to be prepared in advance.
- An annual-plan discount or promotional offer is being extended.
- An existing subscriber is considering an upgrade and needs a comparative proposal.
- A bulk/team deal is being negotiated (e.g., a prop-firm trading group wants 10+ licenses).

## Input Specification

`yaml
proposal_request:
  type: enum[standard, annual_discount, upgrade, bulk_team, promotional]
  required: true

lead_context:
  lead_id: string
  lead_name: string
  email: string
  company_name: string | null             # for bulk/team proposals
  prop_firms: list[string]
  account_count: integer
  account_sizes: list[string]             # e.g. ["200K", "200K", "100K"]
  total_notional: float
  trading_pairs: list[string]
  platform: enum[MT5, MT4, cTrader]
  current_hedging_method: string
  current_tier: enum[free, starter, pro, hedger] | null
  pain_points: list[string]
  demo_completed: boolean
  demo_engagement: enum[high, medium, low] | null
  objections: list[string] | null
  broker_accounts: list[string]

pricing_context:
  discount_code: string | null
  annual_billing: boolean                 # true = offer annual pricing
  custom_terms: string | null             # for bulk deals
`

## Step-by-Step Process

### Step 1  Determine Optimal Tier

Apply tier-matching logic based on lead profile:

| Profile Pattern | Recommended Tier | Monthly Price | Annual Price (20% off) |
|---|---|---|---|
| 12 accounts, single firm, new to hedging | Starter | /mo | /yr (.17/mo) |
| 24 accounts, 12 firms, manual hedging, MT5 | Pro | /mo | /yr (/mo) |
| 5+ accounts, multiple firms, high notional, needs priority execution | Hedger | /mo | /yr (/mo) |

Override rules:
- If ccount_count  5, never recommend Starter or Pro  always Hedger.
- If 	otal_notional  , recommend Hedger regardless of account count.
- If the lead explicitly stated budget constraints and has  3 accounts, Starter is acceptable even if pain points suggest Pro.

### Step 2  Build the ROI Model

Calculate personalised financial justification:

`
# Risk Quantification
challenge_fee_per_account = lookup(prop_firm)  # FTMO 200K = ,049, The5%ers = varies, Apex = 
total_challenge_fees = sum(challenge_fee for each account)
estimated_annual_breach_risk = total_challenge_fees  breach_probability  # industry avg: 1.2 breaches/year for manual hedgers

# Cost of Inaction
annual_risk_exposure = estimated_annual_breach_risk + opportunity_cost_of_lost_profit_splits
# Profit split loss: if an 80/20 split on  account, monthly profit avg , payout = ,200
# One breach = 48 weeks reset = ,400,800 lost income

# Hedge Edge Investment
annual_hedge_cost = tier_price  12  # or annual_price if annual_billing
roi_ratio = annual_risk_exposure / annual_hedge_cost
payback_period_days = annual_hedge_cost / (annual_risk_exposure / 365)
`

Example output for a 5 FTMO 200K trader on Hedger tier:
- Challenge fees at risk: 5  ,049 = ,245
- Estimated annual breach cost (1.2 breaches): ,294
- Lost profit splits from breaches: ~,800
- Total annual risk: ,094
- Hedger annual cost:  (or  on annual plan)
- ROI: **21.2** (monthly) or **26.5** (annual plan)
- Payback period: **14 days**

### Step 3  Compose the Proposal Document

Structure:

**1. Executive Summary**
"Hi {lead_name}, based on our conversation about your {account_count} {prop_firm} accounts, here's a tailored Hedge Edge plan to automate your hedging and protect  in funded capital."

**2. Your Current Situation**
- {account_count} accounts across {prop_firms}
- Currently: {current_hedging_method} hedging
- Key risk: {primary_pain_point}
- Estimated annual exposure: 

**3. Recommended Solution: {tier_name} Tier**
- What's included (tier-specific feature list)
- How it addresses each pain point
- Platform support: MT5 (live now), MT4/cTrader (roadmap)

**4. Financial Impact**
- ROI calculation with their numbers
- Break-even timeline
- Comparison: cost of Hedge Edge vs. cost of one blown account

**5. Pricing**
- Monthly: /mo
- Annual (20% savings): /yr (/mo)
- If applicable: discount code, promotional offer, or bulk pricing

**6. IB Broker Bonus** (if applicable)
- "Open a Vantage or BlackBull account through our partner link and get competitive raw spreads that complement your hedging strategy."
- Include IB referral link.

**7. Next Step**
- Creem.io checkout link for instant signup
- Or: "Let's jump on a 15-minute closing call to finalise  {calendly_link}"

### Step 4  Generate Checkout Link

1. Call Creem.io API (CREEM_API_KEY) to create a checkout session:
   - Product: Hedge Edge {tier_name}
   - Price: monthly or annual based on nnual_billing
   - Customer email: {email}
   - Success URL: landing page thank-you page
   - Metadata: lead_id, source, discount_code
2. If a discount code is provided, apply it to the checkout session.
3. Store the checkout link in the proposal and CRM.

### Step 5  Handle Special Proposal Types

**annual_discount:**
- Calculate the 20% annual saving.
- Frame it: "Save  per year  that's {months_free} months free."
- Starter: save /yr, Pro: save /yr, Hedger: save /yr.

**upgrade:**
1. Pull current subscription data from Supabase.
2. Calculate the price delta: "Going from Pro (/mo) to Hedger (/mo) is an additional /mo  .50/day."
3. Show what they unlock: additional accounts, priority execution, advanced analytics.
4. Include a pro-rated upgrade checkout link from Creem.io if available.
5. Reference their actual usage: "You've run {hedge_sessions} hedge sessions this month across {connected_accounts} accounts  Hedger tier optimises this workflow with priority execution."

**bulk_team:**
1. Calculate volume pricing:
   - 59 licenses: 10% discount
   - 1024 licenses: 15% discount
   - 25+ licenses: 20% discount + dedicated onboarding session
2. Present per-seat and total pricing.
3. Include a custom terms section if custom_terms is provided.
4. Require approval from the Business Strategist Agent for discounts > 20%.

**promotional:**
1. Apply the specified promotional terms (e.g., "First month free", "50% off first 3 months").
2. Calculate the effective annual cost with the promotion.
3. Include urgency language: "This offer is available until {expiry_date}."
4. Generate a promo-specific Creem.io checkout link with the discount applied.

### Step 6  Deliver and Track

1. Send the proposal via email (formatted HTML) and Discord DM (condensed version with checkout link).
2. Log the proposal in the CRM: tier recommended, pricing offered, discount applied, checkout link, delivery timestamp.
3. Update Notion deal card to proposal_sent stage.
4. Schedule follow-up reminders via n8n:
   - 24 hours: "Just checking if you had any questions about the proposal."
   - 72 hours: "The {tier} plan we discussed would protect your  portfolio  ready to get started?"
   - 7 days (if no response): "I noticed you haven't activated yet. Would a quick call help? {calendly_link}"
5. Track checkout link clicks and completion via Creem.io webhooks.

## Output Specification

`yaml
proposal_output:
  lead_id: string
  proposal_id: string                     # unique ID for tracking
  recommended_tier: enum[starter, pro, hedger]
  pricing:
    monthly: float
    annual: float
    discount_applied: string | null
    effective_monthly: float              # after any discounts
  roi_model:
    annual_risk_exposure: float
    annual_hedge_cost: float
    roi_ratio: float
    payback_period_days: integer
    narrative: string
  checkout_link: string                   # Creem.io URL
  proposal_document: string              # full proposal text (Markdown)
  delivery:
    email_sent: boolean
    discord_sent: boolean
    delivered_at: datetime
  follow_up_schedule:
    - trigger: "24h"
      message_preview: string
    - trigger: "72h"
      message_preview: string
    - trigger: "7d"
      message_preview: string
  crm_updated: boolean
  notion_stage_updated: boolean
  ib_referral_included: boolean
`

## API & Platform Requirements

| Platform | Variable | Operations Used |
|---|---|---|
| Creem.io | CREEM_API_KEY | Create checkout session, apply discount, generate payment link |
| Google Sheets | GOOGLE_SHEETS_API_KEY | Log proposal details in CRM, read lead data |
| Notion | NOTION_API_KEY | Update deal stage, attach proposal document to deal card |
| Supabase | SUPABASE_URL, SUPABASE_KEY | Pull current subscription for upgrade proposals, verify user profile |
| n8n | N8N_WEBHOOK_URL | Schedule follow-up reminder sequences, track checkout events |
| Discord Bot | DISCORD_BOT_TOKEN | Send condensed proposal via DM |
| Calendly | CALENDLY_API_KEY | Include scheduling link for prospects who want a closing call |

## Quality Checks

- [ ] Every proposal includes a personalised ROI calculation using the lead's actual account data  never generic numbers.
- [ ] Tier recommendation matches the lead profile rules (5+ accounts = Hedger, always).
- [ ] Checkout link is valid and tier-correct  verified by a test query to Creem.io before sending.
- [ ] Annual pricing reflects exactly 20% off monthly  no rounding errors.
- [ ] Bulk discounts never exceed 20% without Business Strategist Agent approval.
- [ ] Proposal is delivered on both email and Discord (if handle available) within 2 hours of request.
- [ ] Follow-up sequence is scheduled immediately upon proposal delivery  no manual intervention needed.
- [ ] IB referral link is included only when the lead's broker list does not already include Vantage or BlackBull.
- [ ] Upgrade proposals show the incremental cost, not the full price  frame it as "additional /mo".
- [ ] All pricing in the proposal matches current Creem.io product configuration  no stale prices.
