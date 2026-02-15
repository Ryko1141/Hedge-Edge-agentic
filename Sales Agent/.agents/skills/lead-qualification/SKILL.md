---
name: lead-qualification
description: |
  Scores and qualifies inbound leads for Hedge Edge by evaluating their prop-firm trading profile,
  hedging needs, account count, and purchase intent. Produces a structured lead score (0100) with
  a tier recommendation and next-action routing.
---

# Lead Qualification

## Objective

Transform raw inbound signals  Discord messages, landing-page form submissions, free-guide downloads,
and referral introductions  into scored, qualified leads with a clear tier recommendation (Starter,
Pro, or Hedger) and a defined next step (nurture, book demo, or direct close).

## When to Use This Skill

- A new user joins the Hedge Edge Discord and mentions prop-firm trading, hedging, or multi-account management.
- A visitor submits the landing-page contact form or downloads the Free Hedging Guide.
- An existing Free-tier user asks about paid features.
- A referral comes in from an IB partner, community member, or prop-firm forum.
- The n8n webhook fires a 
ew-lead event.

## Input Specification

`yaml
lead_source:
  type: enum[discord, landing_page, free_guide_download, referral, ib_partner, manual]
  required: true

lead_data:
  name: string
  email: string | null
  discord_handle: string | null
  message_content: string | null          # raw message or form submission text
  prop_firms: list[string] | null         # e.g. ["FTMO", "The5%ers", "Apex"]
  account_count: integer | null           # number of funded/challenge accounts
  current_hedging_method: string | null   # "manual", "none", "copy-trade", "other"
  trading_pairs: list[string] | null      # e.g. ["EURUSD", "GBPJPY"]
  platform: enum[MT5, MT4, cTrader] | null
  existing_subscription: string | null    # from Supabase lookup
  broker_accounts: list[string] | null    # Vantage, BlackBull, other

supabase_user_id: string | null           # if they already have a Hedge Edge account
`

## Step-by-Step Process

### Step 1  Enrich Lead Data
1. If discord_handle is provided, query Discord Bot API to pull recent message history from #general, #trading-chat, and #hedge-help channels. Look for keywords: "drawdown", "blown account", "hedge", "multiple accounts", "FTMO", "The5%ers", "TopStep", "Apex".
2. If email is provided, query Supabase (SUPABASE_URL + SUPABASE_KEY) for existing user profile: subscription tier, signup date, last login, broker linkage status.
3. If supabase_user_id exists, pull usage telemetry: number of hedge sessions run, accounts connected, last active date.
4. Query Google Sheets CRM via GOOGLE_SHEETS_API_KEY to check if this lead already exists (match on email or Discord handle). If found, pull interaction history.

### Step 2  Score the Lead (0100)

| Criterion | Weight | Scoring Logic |
|---|---|---|
| Account Count | 25 pts | 1 account = 5, 23 = 15, 45 = 20, 6+ = 25 |
| Prop-Firm Affiliation | 20 pts | Known firm (FTMO, The5%ers, TopStep, Apex) = 15; multiple firms = 20 |
| Current Hedging Pain | 20 pts | "none" = 10, "manual" = 20, "copy-trade" = 12 |
| Platform Match | 15 pts | MT5 = 15 (full support), MT4 = 8 (coming soon), cTrader = 5 (roadmap) |
| Engagement Signal | 10 pts | Discord active = 5, asked pricing question = 8, requested demo = 10 |
| Purchase Intent | 10 pts | Mentioned budget/pricing = 5, asked for checkout link = 10 |

### Step 3  Classify and Route

| Score Range | Classification | Recommended Action |
|---|---|---|
| 025 | Cold | Add to nurture sequence; send Free Hedging Guide |
| 2650 | Warm | Invite to Discord community; schedule educational follow-up |
| 5175 | Marketing Qualified (MQL) | Book a 15-min discovery call via Calendly |
| 7690 | Sales Qualified (SQL) | Book a 30-min demo call; prepare tier recommendation |
| 91100 | Hot | Immediate outreach; send personalised Creem.io checkout link |

### Step 4  Tier Recommendation

Based on the lead profile, recommend the optimal starting tier:

- **Starter (/mo)**  Trader with 12 accounts, new to hedging, wants to test the concept. Pitch: "Try automated hedging on your primary FTMO account for less than the cost of a single challenge fee reset."
- **Pro (/mo)**  Trader with 24 accounts across 12 firms, already hedging manually. Pitch: "You're spending 2+ hours daily managing hedges across terminals. Pro automates all of it and pays for itself in time saved."
- **Hedger (/mo)**  Trader with 5+ accounts, multiple firms, high notional exposure. Pitch: "At + notional across 5 FTMO accounts, one unhedged overnight gap could cost you  in drawdown breaches. Hedger tier is /mo insurance against that."

### Step 5  Log to CRM
1. Trigger n8n webhook (N8N_WEBHOOK_URL) with the qualification payload.
2. Write a new row (or update existing) in the Google Sheets CRM: Lead Name, Email, Discord Handle, Source, Score, Classification, Tier Recommendation, Next Action, Timestamp.
3. If score  76, create a deal card in Notion (NOTION_API_KEY) in the Sales Pipeline database.

## Output Specification

`yaml
qualification_result:
  lead_id: string                          # CRM row ID or Supabase user ID
  score: integer                           # 0100
  classification: enum[cold, warm, mql, sql, hot]
  tier_recommendation: enum[starter, pro, hedger]
  tier_reasoning: string                   # one-paragraph justification
  next_action: string                      # e.g. "Book 30-min demo via Calendly"
  next_action_owner: enum[sales_agent, marketing_agent, self_serve]
  crm_updated: boolean
  notion_deal_created: boolean
  ib_opportunity: boolean                  # true if lead has no Vantage/BlackBull account
  follow_up_date: date                     # suggested follow-up timestamp
  personalised_message: string             # ready-to-send outreach message
`

## API & Platform Requirements

| Platform | Variable | Operations Used |
|---|---|---|
| Supabase | SUPABASE_URL, SUPABASE_KEY | GET /rest/v1/users?email=eq.{email}  profile lookup |
| Google Sheets | GOOGLE_SHEETS_API_KEY | Read/append rows in "Leads" sheet |
| n8n | N8N_WEBHOOK_URL | POST webhook with qualification payload |
| Notion | NOTION_API_KEY | Create page in Sales Pipeline database |
| Discord Bot | DISCORD_BOT_TOKEN | Fetch user message history, send DM |
| Creem.io | CREEM_API_KEY | Generate tier-specific checkout link for hot leads |

## Quality Checks

- [ ] Every lead receives a score within 60 seconds of ingestion.
- [ ] No lead is scored without at least one enrichment source (Supabase, Discord, or CRM history).
- [ ] Tier recommendation aligns with account count: never recommend Starter to a 5+ account trader.
- [ ] CRM row is written before any outreach message is sent.
- [ ] Duplicate detection: if the lead already exists in CRM, update the existing row instead of creating a new one.
- [ ] IB opportunity flag is set whenever the lead's broker list does not include Vantage or BlackBull.
- [ ] Personalised message references the lead's specific prop firm(s) and account count  no generic templates.
- [ ] Score breakdown is auditable: each criterion's contribution is logged in the CRM notes column.
