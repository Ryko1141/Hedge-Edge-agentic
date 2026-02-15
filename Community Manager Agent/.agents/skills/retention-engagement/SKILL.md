---
name: retention-engagement
description: |
  Drives 30/60/90-day retention, reduces churn, increases LTV, and accelerates tier upgrades through proactive engagement scoring, re-engagement campaigns, referral program management, and community-driven habit reinforcement for Hedge Edge users.
---

# Retention & Engagement

## Objective

Keep every Hedge Edge user actively hedging, engaged in the Discord community, and progressing toward higher subscription tiers. Target metrics: 80%+ 30-day retention, 65%+ 60-day retention, 55%+ 90-day retention, and a referral rate where 20%+ of active users generate at least one referral. Every churned user represents lost SaaS revenue AND lost IB broker commissions  retention is a dual-revenue lever.

## When to Use This Skill

- Weekly retention cohort analysis is due (every Monday).
- A user's engagement score drops below the churn risk threshold (defined below).
- A user has not opened the Hedge Edge app or posted in Discord for 7+ days.
- A user downgrades from Pro/Elite to Free tier.
- A user's subscription payment fails (dunning sequence trigger).
- Monthly LTV and churn rate reporting is due.
- A re-engagement campaign needs design, execution, or performance review.
- Referral program metrics need updating or the program needs optimization.
- A user reaches a milestone worth celebrating (30 days active, 100 hedged trades, passed challenge).

## Input Specification

| Field | Type | Required | Description |
|---|---|---|---|
| ction | enum | Yes | score_engagement, identify_churn_risk, un_reengagement, celebrate_milestone, nalyze_cohort, manage_referral, 
udge_upgrade |
| user_id | string | Conditional | Required for individual user actions |
| cohort | string | Conditional | Required for cohort analysis (e.g., 2026-01, eta_users) |
| campaign_id | string | Conditional | Required for campaign performance review |
| date_range | object | No | { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } for reporting |

## Step-by-Step Process

### 1. Engagement Scoring Model

Calculate a weekly engagement score (0-100) for each user based on:

| Signal | Weight | Data Source | Scoring |
|---|---|---|---|
| App sessions this week | 25% | Supabase pp_sessions | 0 sessions = 0, 1-2 = 10, 3-5 = 18, 6-7 = 25 |
| Hedged trades executed | 25% | Supabase 	rades | 0 = 0, 1-5 = 10, 6-15 = 18, 16+ = 25 |
| Discord messages posted | 15% | Discord API / Supabase discord_activity | 0 = 0, 1-3 = 5, 4-10 = 10, 11+ = 15 |
| Discord reactions given | 5% | Discord API | 0 = 0, 1-5 = 2, 6+ = 5 |
| Support tickets opened | 5% | Supabase support_tickets | 0 = 5 (no issues), 1 = 3 (some friction), 2+ = 0 (high friction) |
| Referrals made | 10% | Supabase eferrals | 0 = 0, 1 = 5, 2+ = 10 |
| Days since last login | 15% | Supabase last_active | 0-1 days = 15, 2-3 = 10, 4-7 = 5, 8+ = 0 |

**Engagement Tiers:**
- **90-100**: Power User  candidate for community ambassador, Elite upsell, testimonial request.
- **70-89**: Healthy  maintain engagement, occasional feature highlight.
- **50-69**: Cooling Off  proactive check-in DM, invite to next community event.
- **30-49**: Churn Risk  trigger re-engagement sequence (see below).
- **0-29**: Critical  personal outreach from community manager, offer 1-on-1 setup review.

### 2. Churn Risk Detection & Alerts

**Automated churn signals** (any single trigger activates alert):

| Signal | Threshold | Alert Level |
|---|---|---|
| No app session | 7+ days | Yellow  send re-engagement DM |
| No hedged trade | 14+ days | Orange  personal Discord DM + invite to Hedge Lab |
| Engagement score drop | > 30 points in 1 week | Orange  investigate cause |
| Support ticket unresolved | > 48 hours | Red  escalate to support triage |
| Subscription payment failed | 1st attempt | Red  dunning email + Discord DM |
| Downgrade from paid to free | Immediate | Red  exit survey + win-back offer |
| Posted negative sentiment in Discord | Detected via keyword scan | Yellow  personal empathetic response + escalate issue |

**Churn alert pipeline (n8n):**
1. Supabase query runs daily at 06:00 UTC  identifies users matching any churn signal.
2. n8n webhook triggers appropriate response sequence.
3. All alerts logged in Supabase churn_alerts table with status (	riggered, esponded, ecovered, churned).
4. Weekly churn alert summary posted to internal #community-ops channel.

### 3. Re-Engagement Campaigns

**Campaign A: "Your Hedge is Waiting" (7-day inactive)**

> Hey [name]! Your Hedge Edge system hasn't run in a week. Your prop firm account is trading without protection right now.
>
> Quick reconnection takes 30 seconds:
> 1. Open the Hedge Edge app
> 2. Check your broker connection (green = good)
> 3. You're back to hedged trading
>
> Need help? I'm here. Just reply to this message.

**Campaign B: "What We've Shipped" (14-day inactive)**

> A lot has happened since your last visit! Here's what's new in Hedge Edge:
>
> - [Latest feature 1  pulled from #announcements]
> - [Latest feature 2]
> - [Community win  "Trader X passed their FTMO challenge with hedge protection"]
>
> Come check it out and reconnect your hedge: [app link]

**Campaign C: "We Miss You" (30-day inactive, paid tier)**

> I noticed your Hedge Edge subscription is active but you haven't used the app in a month. I'd hate for you to pay for something you're not getting value from.
>
> Can I help with anything? Common reasons people pause:
> - Took a break from trading  No problem, your config is saved. Just reopen the app when ready.
> - Had a technical issue  Let's fix it. Post in #hedge-setup-help or DM me.
> - Switched prop firms  We support FTMO, The5%ers, TopStep, and Apex. Let me help reconfigure.
>
> If you'd like to pause your subscription, I can set that up too. No hard feelings.

**Campaign D: "Win-Back" (Downgraded from paid to free)**

> I saw you moved back to the free tier. Totally understand  I want to make sure you got value while you were subscribed.
>
> Quick 2-question survey:
> 1. What was the main reason you downgraded? (Reply with a number)
>    - 1: Price too high
>    - 2: Didn't use features enough
>    - 3: Technical issues
>    - 4: Took a break from trading
>    - 5: Other
>
> 2. What would make you come back?
>
> As a thank-you for your feedback, here's a 7-day free trial of Pro to try the latest features: [link]

### 4. Milestone Celebrations

Automatically detect and celebrate:

| Milestone | Detection | Celebration |
|---|---|---|
| First hedged trade | Supabase trade count = 1 | DM + #wins-and-milestones post + confetti reaction |
| 7-day streak | 7 consecutive days with app session | DM: "1 week of protected trading! You're building a great habit." |
| 30 days active | 30 days since onboarding complete | DM + public shoutout + "Veteran Hedger" role |
| 100 hedged trades | Supabase trade count = 100 | DM + #wins-and-milestones feature post + "Centurion" badge |
| Passed prop firm challenge | Self-reported in #wins + mod verified | Major celebration post + DM asking for testimonial + case study request |
| First referral | Supabase referral count = 1 | DM: "Your friend just joined! You're building the Hedge Edge community." |
| 5 referrals | Supabase referral count = 5 | Top Referrer role + DM with exclusive reward |

### 5. Tier Upgrade Nudges

**Free  Pro ($29/mo) triggers:**
- User has been active for 7+ days on free tier.
- User asks about a Pro-only feature in Discord.
- User hits the free tier hedge limit.
- User posts frustration about manual hedging or lack of multi-account support.

**Nudge template:**
> You're getting great at hedging! Here's what you'd unlock with Pro ($29/mo):
> - Multi-account hedge management (hedge across 3+ prop firm accounts simultaneously)
> - Advanced hedge ratio customization
> - Priority support (< 1 hour response time)
> - Pro-exclusive Discord channels with advanced strategies
>
> That's less than a single failed challenge costs. [Upgrade link]

**Pro  Elite ($75/mo) triggers:**
- User has 3+ active prop firm accounts.
- User has been on Pro for 30+ days with high engagement score.
- User participates actively in #pro-lounge.

### 6. Referral Program Management

**Program structure:**
- Referrer gets: 1 free month of their current tier per successful referral (stacks up to 3 months).
- Referee gets: 7-day free trial of Pro tier.
- Tracking: Unique referral codes stored in Supabase, linked to Discord user ID.

**Leaderboard**: Updated weekly in #referral-program channel. Top 3 referrers each month get:
1. 3 months free Elite
2. 2 months free Elite
3. 1 month free Elite

### 7. Cohort Analysis (Weekly/Monthly)

**Weekly report (every Monday, posted to Notion + internal Discord):**

| Metric | Target | Actual | Trend |
|---|---|---|---|
| 7-day active users | 70%+ of total | [calculated] | [up/down/flat] |
| New onboarding completions | 15+/week | [calculated] |  |
| Engagement score distribution | < 20% in "Churn Risk" or below | [calculated] |  |
| Support tickets opened | < 2 per active user/month | [calculated] |  |
| Tier upgrades this week | 3+/week | [calculated] |  |
| Referrals generated | 5+/week | [calculated] |  |

**Monthly report adds:**
- 30/60/90 day retention rates by cohort.
- LTV by tier and by acquisition channel.
- Churn rate with reason breakdown.
- NPS trend.
- Referral program ROI.

## Output Specification

| Output | Format | Destination |
|---|---|---|
| Engagement scores | JSON per user | Supabase engagement_scores table |
| Churn alerts | Webhook payload | n8n  Discord DM + Supabase churn_alerts |
| Re-engagement DMs | Discord DM | User's Discord DM via bot |
| Milestone celebrations | Discord message + role update | #wins-and-milestones + user DM |
| Cohort analysis report | Markdown table | Notion Retention Dashboard + internal Discord |
| Referral leaderboard | Formatted Discord embed | #referral-program channel |
| Upgrade nudge | Discord DM | User's Discord DM via bot |

## API & Platform Requirements

| Platform | Variables | Usage |
|---|---|---|
| Discord Bot API | DISCORD_BOT_TOKEN | DM sending, role updates, channel posting, reaction monitoring |
| Supabase | SUPABASE_URL, SUPABASE_KEY | Engagement scoring, churn detection, referral tracking, cohort queries |
| n8n | N8N_WEBHOOK_URL | Churn alert pipeline, re-engagement automation, milestone detection triggers |
| Notion API | NOTION_API_KEY | Retention dashboard, cohort reports, campaign performance docs |
| Discord Webhook | DISCORD_WEBHOOK_URL | Leaderboard updates, milestone announcements |
| Typeform / Google Forms | FORM_API_KEY | Exit surveys, NPS collection, feature prioritization polls |

## Quality Checks

- [ ] Engagement scores calculated for 100% of users with at least 1 app session, every Sunday by 23:59 UTC.
- [ ] Churn risk alerts triggered within 24 hours of threshold breach  zero missed alerts.
- [ ] Re-engagement DM response rate tracked  target > 20% reply rate.
- [ ] At least 1 re-engagement campaign A/B test running at all times.
- [ ] Milestone celebrations fire within 1 hour of milestone achievement.
- [ ] 30-day retention rate stays above 80%  any drop below triggers emergency review.
- [ ] Referral program leaderboard updated every Monday by 12:00 UTC.
- [ ] Monthly cohort report delivered by the 3rd business day of each month.
- [ ] Win-back campaign converts > 10% of downgraded users back to paid within 30 days.
- [ ] All engagement data reconciled between Discord API and Supabase weekly  discrepancies < 2%.
