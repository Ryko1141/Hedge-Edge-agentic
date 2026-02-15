---
name: user-onboarding
description: |
  Manages the complete onboarding journey for new Hedge Edge users  from Discord join and app download through EA setup, broker linking, and first hedged trade activation. Optimizes time-to-value to under 30 minutes for setup and under 24 hours for first protected trade.
---

# User Onboarding

## Objective

Convert every new Hedge Edge sign-up into an active hedger who completes their first protected trade within 24 hours. The onboarding flow must be frictionless, confidence-building, and progressively reveal product value so users naturally move from the free tier (guide + Discord) into paid subscriptions (Pro $29/mo or Elite $75/mo). Every abandoned onboarding step is a churned user  treat onboarding as the single highest-leverage retention activity.

## When to Use This Skill

- A new user joins the Hedge Edge Discord server (GUILD_MEMBER_ADD event).
- A user downloads the Hedge Edge desktop app but has not completed setup within 2 hours.
- A user has installed the app but has not linked a broker account (Vantage or BlackBull) within 24 hours.
- A user has linked a broker but has not executed their first hedged trade within 48 hours.
- A user explicitly asks for help getting started in #hedge-setup-help or via DM.
- Onboarding funnel metrics show a drop-off at a specific step (weekly analysis).
- A new prop firm partnership or broker integration launches and onboarding materials need updating.

## Input Specification

| Field | Type | Required | Description |
|---|---|---|---|
| user_id | string | Yes | Discord user ID or Supabase user UUID |
| onboarding_stage | enum | Yes | joined_discord, downloaded_app, installed_ea, linked_broker, configured_hedge, irst_trade, completed |
| roker | enum | No | antage, lackbull, other |
| prop_firm | enum | No | tmo, 	he5ers, 	opstep, pex, other |
| platform | enum | No | mt5, mt4_waitlist, ctrader_waitlist |
| issue_description | string | No | Free-text description if user is stuck at a step |
| 	ime_in_stage | integer | No | Minutes spent in current stage (for timeout triggers) |

## Step-by-Step Process

### 1. Welcome Sequence (Trigger: Discord Join)

**Immediate (< 60 seconds via n8n webhook):**

Send personalized Discord DM:

> **Welcome to Hedge Edge!** You've just joined the smartest community of prop firm hedgers.
>
> Here's your 4-step path to automated hedge protection:
>
> **Step 1**  Download the Hedge Edge app: [link]
> **Step 2**  Install the MT5 EA on your prop firm account
> **Step 3**  Link your hedge broker (Vantage or BlackBull  we'll help you pick)
> **Step 4**  Run your first hedged trade and watch the magic
>
> **Free resource**: Grab our complete Hedge Strategy Guide here: [link]
>
> **Need help?** Post in #hedge-setup-help and our team will respond within 15 minutes.
>
> What prop firm are you trading with? (React below)
> :one: FTMO | :two: The5%ers | :three: TopStep | :four: Apex | :five: Other

**Server-side:**
- Assign New Hedger role.
- Log joined_discord stage in Supabase onboarding_tracking table with timestamp.
- If user reacts with prop firm selection, assign corresponding prop firm role and update Supabase record.

### 2. App Download & Installation Guidance

**Trigger**: User clicks download link OR posts in #hedge-setup-help asking about installation.

Provide platform-specific instructions:

**Windows (primary):**
1. Download the Hedge Edge .exe installer from the dashboard.
2. Run the installer  allow through Windows Defender if prompted (code-signed, fully safe).
3. Launch Hedge Edge desktop app  you'll see the account dashboard.
4. Log in with your Hedge Edge credentials (same as website).

**Post-install checklist DM (sent 30 minutes after download if installed_ea stage not reached):**

> Hey! Looks like you downloaded Hedge Edge  awesome! Have you managed to get the EA installed on MT5 yet?
>
> Quick checklist:
> - [ ] Hedge Edge app is running
> - [ ] MT5 is open with your prop firm account logged in
> - [ ] EA file copied to MQL5/Experts folder
> - [ ] EA attached to a chart with AutoTrading enabled
>
> Stuck on any step? Drop a message in #hedge-setup-help with a screenshot and we'll sort it out fast.

### 3. Broker Linking (Vantage or BlackBull)

**Critical conversion step**  this is where IB commission revenue begins.

**For users without a hedge broker:**

> To run hedges, you need a separate broker account for the hedge side. We've partnered with two top brokers:
>
> **Vantage**  Best for: Fast execution, tight spreads on forex majors, strong for FTMO/5%ers hedging.
> **BlackBull**  Best for: Deep liquidity, excellent for larger lot sizes, great for Apex/TopStep hedging.
>
> Both give you institutional-grade execution. Sign up through our link and your accounts connect automatically:
> - Vantage: [IB referral link]
> - BlackBull: [IB referral link]
>
> Already have an account with one of these? DM me your account number and I'll get it linked.

**For users with existing broker accounts:**
- Verify broker compatibility.
- Guide them through the Hedge Edge app's "Link Broker" flow.
- Confirm connection with a test ping to the broker API.

Update Supabase: linked_broker stage + broker name + IB referral attribution.

### 4. Hedge Configuration

**Trigger**: Broker linked successfully.

Walk the user through their first hedge configuration based on their prop firm:

**FTMO Example:**
> Great, you're all linked up! Let's configure your hedge for FTMO.
>
> FTMO's max daily drawdown is 5%, max overall is 10%. Here's the recommended starter config:
>
> - **Hedge trigger**: When drawdown hits 3% of daily limit (conservative buffer)
> - **Hedge ratio**: 1:1 (full hedge on the opposite broker)
> - **Instruments**: Match your trading pairs (e.g., EURUSD on prop = EURUSD hedge on Vantage)
> - **Auto-close**: When prop side closes, hedge side auto-closes within 500ms
>
> Want to customize these, or start with the recommended settings?

**The5%ers Example:**
> The5%ers has a 4% max drawdown on the Growth program. Config recommendation:
>
> - **Hedge trigger**: 2.5% drawdown threshold
> - **Hedge ratio**: 1:1
> - **Scale-aware**: Enable "scaling plan mode" so hedge params auto-adjust as your account grows
>
> These settings keep you protected while maximizing your profit potential through each scaling level.

### 5. First Hedged Trade Activation

**Trigger**: Hedge configured but no trade executed within 4 hours.

> Your hedge system is armed and ready! Here's how to see it in action:
>
> 1. Open a trade on your prop firm MT5 account (any size, any pair you've configured).
> 2. Watch the Hedge Edge dashboard  you'll see the hedge order mirror on your Vantage/BlackBull account in real-time.
> 3. The status light goes green when both sides are synced.
>
> **Pro tip**: Start with a small position (0.01 lots) to see the system work before going full size. No risk, full confidence.
>
> Once you see that first hedge execute, you'll never trade unprotected again.

**On first trade completion:**
- Update Supabase: irst_trade stage with timestamp.
- Send celebration DM: "Your first hedge is LIVE! You're now trading with a safety net. Post your setup in #wins-and-milestones  the community loves seeing new hedgers go live!"
- If free tier: Trigger upgrade nudge sequence (delayed 48 hours).

### 6. Habit Loop & Tier Conversion

**Days 1-3 (post first trade):**
- Daily check-in DM: "How's your hedge system running? Any questions about the dashboard?"
- Share relevant #wins-and-milestones posts from other users at their prop firm.

**Day 5:**
- If free tier: "You've been hedging for 5 days  here's what Pro unlocks: [multi-account support, advanced hedge ratios, priority support]. Upgrade for $29/mo: [link]"

**Day 7:**
- Invite to next Hedge Lab community call.
- Ask for quick NPS score (1-10 rating via reaction).

**Day 14:**
- If still free tier, share case study: "FTMO trader using Pro saved their challenge account 3 times in the first month."

Update Supabase: completed stage when user has been active for 14+ days with at least 5 hedged trades.

### 7. Drop-Off Recovery Sequences

| Stage Stuck At | Time Threshold | Recovery Action |
|---|---|---|
| joined_discord (no download) | 24 hours | DM with hedge guide + "Most traders set up in under 30 min" |
| downloaded_app (no EA install) | 4 hours | DM with video walkthrough link + offer live screenshare help |
| installed_ea (no broker link) | 24 hours | DM with broker comparison + IB referral links |
| linked_broker (no config) | 12 hours | DM with prop-firm-specific config guide |
| configured_hedge (no trade) | 48 hours | DM with "Just open a 0.01 lot test trade  takes 10 seconds" |

## Output Specification

| Output | Format | Destination |
|---|---|---|
| Welcome DM | Discord DM via bot | New user's Discord DM |
| Onboarding stage update | JSON record | Supabase onboarding_tracking table |
| Setup guidance messages | Discord message | #hedge-setup-help channel or DM |
| Drop-off recovery DM | Discord DM via n8n workflow | User's Discord DM |
| Onboarding funnel report | Weekly Markdown summary | Notion Onboarding Analytics page |
| Broker referral attribution | IB link tracking | Supabase eferrals table |

## API & Platform Requirements

| Platform | Variables | Usage |
|---|---|---|
| Discord Bot API | DISCORD_BOT_TOKEN | Welcome DMs, role assignment, message sending, reaction monitoring |
| Supabase | SUPABASE_URL, SUPABASE_KEY | Onboarding stage tracking, user profiles, broker attribution, funnel analytics |
| n8n | N8N_WEBHOOK_URL | Welcome sequence triggers, drop-off recovery automation, stage transition webhooks |
| Notion API | NOTION_API_KEY | Onboarding guides, FAQ content, funnel report publishing |
| Discord Webhook | DISCORD_WEBHOOK_URL | Automated milestone announcements when users complete onboarding |

## Quality Checks

- [ ] Welcome DM delivered within 60 seconds of Discord join (measure via n8n execution logs).
- [ ] Median time from joined_discord to irst_trade is under 24 hours.
- [ ] Onboarding completion rate (reach irst_trade stage) is above 40%.
- [ ] Drop-off recovery DMs achieve > 15% re-engagement rate (user advances to next stage within 48 hours of recovery DM).
- [ ] Broker linking step captures IB referral attribution for 95%+ of new broker sign-ups.
- [ ] Zero users stuck in a stage for > 7 days without at least 2 recovery attempts.
- [ ] Prop firm-specific configuration guides exist and are current for FTMO, The5%ers, TopStep, and Apex.
- [ ] NPS score at Day 7 averages 8+ across all onboarded users.
- [ ] All onboarding content reviewed and updated within 48 hours of any product change (new EA version, new broker, new tier pricing).
