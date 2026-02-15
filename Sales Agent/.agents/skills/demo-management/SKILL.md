---
name: demo-management
description: |
  Prepares and delivers tailored Hedge Edge product demonstrations for prop-firm traders.
  Builds custom demo scripts based on the lead's account profile, executes live walkthroughs
  of the Electron app and MT5 EA, handles objections in real time, and captures demo outcomes
  for pipeline progression.
---

# Demo Management

## Objective

Deliver high-conversion product demonstrations that show each prospect exactly how Hedge Edge
solves their specific multi-account hedging problem. Every demo is customised to the lead's
prop-firm portfolio (number of accounts, firms used, current hedging pain) and ends with a clear
next step  either a tier recommendation with checkout link or a closing call booking.

## When to Use This Skill

- A demo call is scheduled and pre-call preparation is needed.
- A live demo is being conducted and the agent needs the demo script and talk track.
- A post-demo follow-up sequence needs to be triggered.
- A prospect requests an async demo (recorded walkthrough) instead of a live call.
- An existing subscriber requests a feature walkthrough for upsell consideration.

## Input Specification

`yaml
demo_request:
  type: enum[prepare, live_script, post_demo, async_demo, upsell_walkthrough]
  required: true

lead_context:
  lead_id: string
  lead_name: string
  email: string
  discord_handle: string | null
  prop_firms: list[string]                # e.g. ["FTMO", "The5%ers"]
  account_count: integer                  # e.g. 5
  account_sizes: list[string] | null      # e.g. ["200K", "200K", "100K", "100K", "50K"]
  total_notional: float | null            # e.g. 750000
  current_hedging_method: string          # "manual", "none", "copy-trade"
  trading_pairs: list[string]             # e.g. ["EURUSD", "GBPJPY", "XAUUSD"]
  platform: enum[MT5, MT4, cTrader]
  current_tier: enum[free, starter, pro, hedger] | null  # for upsell demos
  pain_points: list[string] | null        # captured from discovery call
  objections_raised: list[string] | null  # from prior interactions
  broker_accounts: list[string] | null    # Vantage, BlackBull, other

demo_schedule:
  datetime: datetime
  zoom_link: string
  duration_minutes: integer               # 15 or 30
`

## Step-by-Step Process

### Step 1  Pre-Demo Preparation (type: prepare)

1. **Pull lead context** from Google Sheets CRM and Notion deal card.
2. **Build the demo scenario** matching the lead's exact profile:
   - If trader has 5 FTMO 200K accounts trading EURUSD and GBPJPY:
     - Scenario: "Show hedge automation across 5 accounts with opposing EURUSD positions, demonstrate real-time P&L aggregation, and simulate a drawdown breach alert saving ,000 in challenge fees."
   - If trader has 2 The5%ers accounts, currently hedging manually:
     - Scenario: "Side-by-side comparison: manual hedge workflow (open 4 terminals, calculate lots, execute in sequence  3+ minutes) vs. Hedge Edge one-click (sub-100ms execution across all accounts)."
   - If trader has 3 accounts across FTMO and Apex, no current hedging:
     - Scenario: "Demonstrate the overnight gap risk on an unhedged portfolio, show how a single NFP candle could breach drawdown on 2 of 3 accounts, then show Hedge Edge auto-hedging preventing it."

3. **Prepare the demo environment:**
   - Ensure the Electron app demo instance is loaded with mock accounts matching the lead's profile.
   - Set up MT5 EA demo connections to simulate the lead's exact account structure.
   - Pre-load relevant trading pairs in the P&L dashboard.
   - Prepare a drawdown-breach simulation trigger.

4. **Build the talk track** with these segments:
   - **Hook (2 min)**: Reference their specific pain. "You told me you're running 5 FTMO 200K accounts and spending 2 hours a day managing hedges manually. Let me show you how that becomes 2 clicks."
   - **Core Demo (15 min)**: Walk through account connection  hedge rule setup  one-click execution  real-time P&L monitoring  breach alerts.
   - **ROI Moment (5 min)**: "At 5 accounts  ,000 challenge fee, one blown account costs you ,000 plus 46 weeks of lost profit splits. Hedger tier at /mo is /year  less than one blown account."
   - **IB Angle (3 min)**: If lead doesn't use Vantage/BlackBull: "By the way, if you're also looking for competitive spreads, our partner brokers offer tight raw spreads that pair perfectly with the hedge automation."
   - **Close (5 min)**: Tier recommendation + objection handling + next step.

5. **Prepare objection handlers** based on known objections:
   - **"/mo is expensive"**  "That's .50/day. A single drawdown breach on one FTMO 200K account costs ,049 in reset fees plus weeks of lost income. Hedger pays for itself the first time it prevents a breach."
   - **"I can hedge manually"**  "Across 5 accounts and 3 pairs, you're making 30 position adjustments daily. One missed adjustment during a news spike, and you're in breach. The app executes in under 100ms  faster than you can switch terminals."
   - **"MT4/cTrader support?"**  "MT5 is fully live today. MT4 integration ships in Q2 and cTrader in Q3. Start with your MT5 accounts now, and the other platforms will be ready when you need them."
   - **"What if it breaks?"**  "The app runs locally on your machine  no cloud dependency. If connectivity drops, your existing positions stay in place. Plus we have real-time monitoring in the Discord #support channel."

6. **Generate a pre-call brief** and save to Notion deal card.

### Step 2  Live Demo Execution (type: live_script)

1. Provide the structured talk track as a real-time guide.
2. Surface relevant data points during the call (e.g., "Mention that 73% of beta users saw reduced drawdown violations in the first month").
3. Track which features the prospect reacts positively to and which objections they raise.
4. When the ROI moment lands, be ready with the personalised calculation:
   - 	otal_risk = account_count  average_challenge_fee
   - nnual_hedge_cost = recommended_tier_price  12
   - oi_ratio = total_risk / annual_hedge_cost
   - Example: "5 accounts  ,049 reset fee = ,245 at risk. Hedger at /year gives you a 5.8 ROI on capital protection."

### Step 3  Post-Demo Follow-Up (type: post_demo)

1. Within 30 minutes of demo completion, send a personalised follow-up:
   - **Email**: Recap the key points discussed, include the personalised ROI calculation, and attach a Creem.io checkout link for the recommended tier.
   - **Discord DM**: Shorter version  "Great chatting today, {name}! Here's your {tier} checkout link: {creem_link}. The ROI calc we discussed is in your email. Any questions, drop them in #hedge-help."
2. Log the demo outcome in CRM:
   - Features demonstrated
   - Prospect engagement level (high / medium / low)
   - Objections raised and how they were handled
   - Tier discussed
   - Next step agreed (checkout, closing call, think-it-over period)
3. Update the Notion deal card stage to demo_completed.
4. If next step is a closing call, trigger the call-scheduling skill.
5. If next step is a think-it-over period, schedule a 48-hour follow-up via n8n.
6. If the prospect was interested in the IB broker angle, flag for IB outreach with specific broker recommendation (Vantage for raw-spread preference, BlackBull for broader platform support).

### Step 4  Async Demo (type: sync_demo)

1. Generate a personalised screen-recording script based on the lead's profile.
2. Record (or compose) a Loom-style walkthrough of:
   - Account setup matching their portfolio
   - Hedge execution on their specific trading pairs
   - P&L aggregation dashboard with their account count
   - Drawdown breach simulation
3. Embed the personalised ROI calculation as an overlay or closing slide.
4. Send via email and Discord DM with a Creem.io checkout link.
5. Track video open rate and link clicks via n8n.

### Step 5  Upsell Walkthrough (type: upsell_walkthrough)

1. Pull the subscriber's current usage from Supabase: accounts connected, hedge sessions/month, features used.
2. Identify the upgrade trigger:
   - Starter  Pro: "You've connected 3 accounts but Starter supports 2 optimally. Pro unlocks full multi-account automation."
   - Starter/Pro  Hedger: "You're running hedge sessions 40+ times/month and have 5 accounts. Hedger gives you priority execution, advanced P&L analytics, and unlimited accounts."
3. Build a short (15-min) walkthrough focused only on the delta features between current and target tier.
4. Show the incremental cost and ROI: "Going from Pro (/mo) to Hedger (/mo) is /mo more  that's .50/day for unlimited accounts and priority execution across your + portfolio."

## Output Specification

`yaml
demo_output:
  type: string
  lead_id: string
  demo_scenario: string                   # prose description of the customised demo
  talk_track: list[object]                # ordered segments with timing, content, and key points
  roi_calculation:
    total_risk: float
    annual_hedge_cost: float
    roi_ratio: float
    narrative: string                     # e.g. "5.8 ROI on capital protection"
  objection_handlers: list[object]        # each with objection, response, supporting_data
  pre_call_brief: string                  # saved to Notion
  post_demo_actions:
    follow_up_email_sent: boolean
    follow_up_discord_sent: boolean
    crm_updated: boolean
    notion_stage_updated: boolean
    next_step: string
    checkout_link: string | null          # Creem.io link if ready to close
  ib_opportunity_flagged: boolean
`

## API & Platform Requirements

| Platform | Variable | Operations Used |
|---|---|---|
| Google Sheets | GOOGLE_SHEETS_API_KEY | Read lead data, log demo outcome |
| Notion | NOTION_API_KEY | Read deal card, save pre-call brief, update stage |
| Supabase | SUPABASE_URL, SUPABASE_KEY | Pull usage data for upsell demos, verify account status |
| Creem.io | CREEM_API_KEY | Generate tier-specific checkout link for post-demo follow-up |
| Zoom | ZOOM_API_KEY | Access recording after call for review |
| Discord Bot | DISCORD_BOT_TOKEN | Send post-demo follow-up DM |
| n8n | N8N_WEBHOOK_URL | Trigger follow-up sequences, async demo tracking |

## Quality Checks

- [ ] Every demo is customised to the lead's exact account count, prop firms, and trading pairs  no generic walkthroughs.
- [ ] ROI calculation uses the lead's actual account sizes and challenge fees, not averages.
- [ ] Pre-call brief is saved to Notion at least 1 hour before the scheduled demo.
- [ ] Post-demo follow-up (email + Discord) is sent within 30 minutes of call end.
- [ ] Creem.io checkout link in the follow-up matches the recommended tier  never send a Starter link to a Hedger-qualified lead.
- [ ] Demo outcome (engagement level, objections, next step) is logged in the CRM within 1 hour.
- [ ] Objection handlers are updated quarterly based on win/loss analysis from the sales-pipeline skill.
- [ ] IB opportunity is flagged if the lead's broker list doesn't include Vantage or BlackBull.
- [ ] Upsell walkthroughs include real usage data from Supabase, not assumptions.
