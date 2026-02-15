---
name: feedback-collection
description: |
  Systematically collects, categorizes, prioritizes, and routes user feedback from Discord conversations, surveys, support tickets, and community events to drive Hedge Edge product decisions and improve user satisfaction.
---

# Feedback Collection

## Objective

Build a continuous feedback loop that captures every meaningful user signal  feature requests, bug reports, UX friction, broker complaints, pricing sentiment, and unmet needs  and transforms raw feedback into structured, prioritized product intelligence. The Community Manager Agent is the ears of Hedge Edge; this skill ensures nothing valuable gets lost between a Discord message and a product decision.

## When to Use This Skill

- A user posts a feature request in #feature-requests or mentions a wish/need in any channel.
- A user reports a bug in #bug-reports or describes unexpected behavior in #hedge-setup-help.
- A user expresses frustration, confusion, or delight in any Discord channel (sentiment signal).
- Weekly feedback synthesis is due (every Friday).
- A survey needs to be designed, deployed, or analyzed (NPS, feature prioritization, exit survey).
- A Hedge Lab community call generates discussion notes that need structuring.
- Product team requests a feedback summary on a specific topic (e.g., "What do users think about the MT4 timeline?").
- Monthly Voice of Customer (VoC) report is due.

## Input Specification

| Field | Type | Required | Description |
|---|---|---|---|
| ction | enum | Yes | capture_feedback, categorize, un_survey, nalyze_survey, synthesize_weekly, generate_voc_report, query_feedback |
| source | enum | Conditional | discord_message, survey_response, support_ticket, community_event, direct_dm |
| content | string | Conditional | Raw feedback text (for capture_feedback) |
| user_id | string | No | Discord user ID for attribution |
| 	opic_filter | string | No | Filter feedback by topic (e.g., mt4, pricing, roker, onboarding) |
| date_range | object | No | { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } |

## Step-by-Step Process

### 1. Real-Time Feedback Capture (Discord Monitoring)

**Passive monitoring**  scan all public Discord channels for feedback signals:

**Feature Request Detection:**
- Keywords: "wish", "would be nice", "can you add", "feature request", "it'd be great if", "please add", "need", "missing", "when will"
- Action: Bot reacts with clipboard emoji, creates a thread reply: "Great idea! I've logged this as a feature request. Upvote with a thumbs-up if you'd like to see this too!"
- Log to Supabase eedback table: { type: "feature_request", source: "discord", channel, user_id, content, timestamp }

**Bug Detection:**
- Keywords: "bug", "broken", "not working", "crash", "error", "disconnected", "won't connect", "stuck", "freeze"
- Action: Bot reacts with wrench emoji, DMs user: "Sorry you hit an issue! Can you share: (1) What you were doing, (2) What happened, (3) A screenshot if possible? I'll fast-track this."
- Log to Supabase: { type: "bug_report", source: "discord", severity: "auto_triage", ... }

**Sentiment Detection:**
- Positive keywords: "love", "amazing", "saved my account", "passed my challenge", "game changer", "best tool"
- Negative keywords: "hate", "terrible", "waste of money", "cancelling", "frustrated", "disappointed", "scam"
- Neutral/confused: "how do I", "confused", "don't understand", "where is"
- Log all with sentiment tag. Negative sentiment triggers immediate personal response from community manager.

**Broker-Specific Feedback:**
- Monitor for: "Vantage", "BlackBull", "slippage", "execution", "spread", "commission", "deposit", "withdrawal"
- Tag with broker name. Route broker complaints to Business Strategist Agent if they indicate systemic issues (3+ similar complaints in 7 days).

### 2. Structured Feedback Categorization

Every captured feedback item gets categorized in Supabase:

| Field | Values | Description |
|---|---|---|
| category | eature, ug, ux_friction, pricing, roker, onboarding, content, praise | Primary classification |
| subcategory | Free text | Specific topic (e.g., "MT4 support", "hedge ratio customization", "Vantage spreads") |
| severity | critical, high, medium, low | Impact level |
| requency | Integer | Number of unique users mentioning this topic (deduped) |
| 	ier | ree, pro, elite, unknown | User's subscription tier |
| prop_firm | tmo, 	he5ers, 	opstep, pex, other | User's prop firm |
| status | 
ew, cknowledged, in_progress, shipped, won't_do | Lifecycle status |
| outed_to | Agent name or 
ull | Which agent owns the resolution |

### 3. Survey Design & Deployment

**Survey Types:**

**A. Onboarding NPS (Day 7)**
- Channel: Discord DM via bot
- Questions:
  1. "On a scale of 0-10, how likely are you to recommend Hedge Edge to a fellow prop trader?" (NPS)
  2. "What's the ONE thing we could improve about your setup experience?" (Open text)
  3. "Which feature do you use most?" (Multiple choice: auto-hedge, dashboard monitoring, multi-account, broker connection)
- Automation: n8n triggers DM 7 days after irst_trade stage in Supabase.

**B. Monthly Pulse Survey (All active users)**
- Channel: Typeform link posted in Discord + DM to engaged users
- Questions:
  1. NPS (0-10)
  2. "What's the biggest risk to your prop firm account right now?" (Open text  reveals unmet needs)
  3. "Rate these potential features by priority" (Rank: MT4 support, cTrader support, mobile app, more brokers, social trading, copy trading)
  4. "How would you feel if Hedge Edge disappeared tomorrow?" (Very disappointed / Somewhat disappointed / Not disappointed  Sean Ellis test)
  5. "Any other feedback?" (Open text)

**C. Exit Survey (On downgrade or cancellation)**
- Channel: Discord DM (immediate on Supabase subscription status change)
- Questions:
  1. Primary reason for leaving (multiple choice: price, didn't use, technical issues, switched tools, stopped trading, other)
  2. "What would bring you back?" (Open text)
  3. "Would a discount change your mind?" (Yes/No  if Yes, trigger win-back offer)

**D. Post-Event Survey (After Hedge Lab calls)**
- Channel: Discord thread in #hedge-lab-events
- Questions:
  1. "Rate this session" (1-5 stars via reactions)
  2. "What topic should we cover next?" (Open text)
  3. "Would you attend again?" (Yes/Maybe/No via reactions)

### 4. Weekly Feedback Synthesis (Every Friday)

**Process:**
1. Query Supabase eedback table for all entries from the past 7 days.
2. Group by category and count unique users per topic.
3. Identify top 5 most-requested features (deduped by user, not message count).
4. Identify top 3 pain points (highest severity + frequency combination).
5. Identify any new topics not seen in previous weeks (emerging themes).
6. Calculate sentiment distribution: % positive, % negative, % neutral.

**Output format:**

`markdown
# Weekly Feedback Digest  [Date Range]

## Top Feature Requests (by unique user count)
1. **MT4 EA support**  23 users ( from 18 last week)
2. **Mobile dashboard**  15 users (new this week)
3. **Custom hedge ratio profiles**  12 users (stable)
4. **cTrader integration**  9 users (stable)
5. **Social trading / copy hedges**  7 users (new)

## Top Pain Points
1. **EA disconnection on Vantage during high volatility**  8 reports, severity: high
2. **Onboarding confusion at broker linking step**  5 reports, severity: medium
3. **Dashboard load time > 5 seconds**  4 reports, severity: medium

## Sentiment Breakdown
- Positive: 62% | Neutral: 25% | Negative: 13%
- Negative trend: [up/down/flat] vs. last week

## Emerging Themes
- 3 users asked about hedging for futures (Apex/TopStep specific)  currently unsupported
- 2 users requested a Telegram bot alternative to Discord

## Action Items
- Route EA disconnection reports to Engineering Agent (P1)
- Update broker linking onboarding guide (Community Manager)
- Add MT4 timeline update to next #announcements post (Marketing Agent)
`

### 5. Monthly Voice of Customer (VoC) Report

Comprehensive monthly report combining:
- All weekly digests aggregated.
- Survey results (NPS trend, Sean Ellis score, feature priority rankings).
- Support ticket themes.
- Community event feedback.
- Churn reason analysis from exit surveys.
- Competitive mentions (other hedging tools users reference).

Posted to Notion Voice of Customer database and shared with all agents.

### 6. Feedback-to-Product Loop Closure

When a feature request or bug fix ships:
1. Query Supabase for all users who requested/reported it.
2. DM each user: "You asked for [feature]  we built it! It's live now. Here's how to use it: [link]. Thanks for shaping Hedge Edge!"
3. Post in #announcements: "Community-requested feature shipped: [feature]. Thanks to everyone who upvoted this!"
4. Update Supabase feedback item status to shipped.

This closes the loop and proves to users their voice matters  strongest retention signal.

## Output Specification

| Output | Format | Destination |
|---|---|---|
| Captured feedback entries | JSON records | Supabase eedback table |
| Survey deployments | Typeform/Google Form + Discord DM | Users via DM and channel posts |
| Weekly feedback digest | Markdown report | Notion Feedback Digests + internal Discord #community-ops |
| Monthly VoC report | Comprehensive Markdown | Notion Voice of Customer database + all agents |
| Feature shipped notifications | Discord DMs + channel post | Requesting users + #announcements |
| Feedback query results | Filtered JSON or Markdown table | Requesting agent or Notion page |

## API & Platform Requirements

| Platform | Variables | Usage |
|---|---|---|
| Discord Bot API | DISCORD_BOT_TOKEN | Message monitoring, reaction-based capture, DM surveys, feedback acknowledgment |
| Supabase | SUPABASE_URL, SUPABASE_KEY | Feedback storage, categorization, deduplication, user-feedback linking, survey response storage |
| n8n | N8N_WEBHOOK_URL | Survey trigger automation, weekly digest generation, feedback-to-product loop notifications |
| Notion API | NOTION_API_KEY | Weekly digest publishing, VoC report hosting, feedback database dashboard |
| Typeform / Google Forms | FORM_API_KEY | Monthly pulse surveys, exit surveys, event feedback forms |
| Discord Webhook | DISCORD_WEBHOOK_URL | Feature-shipped announcements, digest summaries in internal channels |

## Quality Checks

- [ ] 100% of Discord messages containing feedback keywords are captured in Supabase within 5 minutes.
- [ ] Zero feedback items remain uncategorized for more than 24 hours.
- [ ] Weekly digest published every Friday by 18:00 UTC  zero missed weeks.
- [ ] Monthly VoC report delivered by the 5th business day of each month.
- [ ] NPS survey response rate > 30% of eligible users (Day 7 onboarding survey).
- [ ] Monthly pulse survey response rate > 20% of active users.
- [ ] Feature-shipped loop closure DMs sent within 24 hours of deployment for 100% of shipped requests.
- [ ] Sentiment analysis accuracy > 85% (validated monthly by manual review of 50 random samples).
- [ ] Feedback deduplication catches 90%+ of duplicate reports (same issue, different users).
- [ ] Broker-specific complaints routed to Business Strategist Agent within 4 hours when threshold (3+ in 7 days) is hit.
