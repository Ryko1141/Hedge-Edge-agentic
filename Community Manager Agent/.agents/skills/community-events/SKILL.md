---
name: community-events
description: |
  Plans, executes, and measures recurring and one-off community events for Hedge Edge  including weekly Hedge Lab calls, AMAs with the founder, trading challenges, milestone celebrations, and educational workshops  to drive engagement, retention, and tier upgrades.
---

# Community Events

## Objective

Build a predictable rhythm of community events that give Hedge Edge users reasons to return, engage, learn, and feel part of something bigger than a software subscription. Events are the heartbeat of community  they create shared experiences, surface product champions, generate organic testimonials, and provide a natural context for tier upgrade conversations. Target: 25%+ of active users attend at least one event per month.

## When to Use This Skill

- Scheduling the weekly Hedge Lab community call (recurring every Thursday).
- Planning a special AMA (Ask Me Anything) with the Hedge Edge founder or a prop firm partner.
- Designing a trading challenge (e.g., "30-Day Hedge Challenge  pass your prop firm evaluation using Hedge Edge").
- Celebrating a community milestone (500 members, 1000th hedged trade, first user to pass FTMO with Hedge Edge).
- Running educational workshops (EA setup masterclass, broker comparison deep-dive, hedge ratio optimization).
- Post-event follow-up  recording distribution, feedback collection, attendee engagement tracking.
- Quarterly event calendar planning.

## Input Specification

| Field | Type | Required | Description |
|---|---|---|---|
| ction | enum | Yes | plan_event, execute_event, post_event_followup, plan_calendar, nalyze_event_performance |
| event_type | enum | Yes | hedge_lab, ma, 	rading_challenge, milestone_celebration, workshop, custom |
| 	itle | string | Yes | Event title (e.g., "Hedge Lab #12: Optimizing Hedge Ratios for FTMO Phase 2") |
| date_time | datetime | Conditional | UTC datetime for scheduled events |
| duration_minutes | integer | No | Expected duration (default: 60) |
| host | string | No | Who's hosting (founder, community manager, guest expert) |
| 	arget_audience | enum | No | ll, ree, pro, elite, prop_firm_specific |
| description | string | Yes | Event description and agenda |

## Step-by-Step Process

### 1. Weekly Hedge Lab Call (Every Thursday, 18:00 UTC)

**Format**: Discord Stage Channel or Voice Channel with screen share. 45-60 minutes.

**Recurring structure:**
1. **Market Check-In (5 min)**  Brief overview of the week's volatility and how hedges performed.
2. **Feature Spotlight (10 min)**  Demo a Hedge Edge feature, tip, or workflow. Rotate weekly:
   - Week 1: EA configuration deep-dive
   - Week 2: Broker comparison (Vantage vs. BlackBull execution analysis)
   - Week 3: Prop firm strategy (rotating: FTMO, The5%ers, TopStep, Apex)
   - Week 4: User showcase  a community member shares their setup and results
3. **Live Q&A (20 min)**  Open floor. Users ask questions, community manager or founder answers.
4. **Community Wins (10 min)**  Celebrate users who passed challenges, hit milestones, or referred friends this week.
5. **Sneak Peek (5 min)**  Preview what's coming next week/month (builds anticipation for return).
6. **Wrap-Up**  Remind about referral program, tier benefits, and next event.

**Pre-event automation (n8n workflow):**
- **T-48 hours**: Post event reminder in #hedge-lab-events with agenda. Pin it.
- **T-24 hours**: DM all users who attended the last Hedge Lab: "Tomorrow's Hedge Lab covers [topic]  see you there!"
- **T-1 hour**: Post reminder in #announcements + #hedge-lab-events.
- **T-0**: Open Stage Channel, post join link.

**Post-event automation:**
- Upload recording to a shared drive, post link in #hedge-lab-events.
- Post 3-question feedback survey (reactions-based) in the event thread.
- Log attendance count and engaged participants in Supabase events table.
- DM first-time attendees: "Thanks for joining your first Hedge Lab! What did you think? Here's the recording if you missed anything: [link]"

### 2. AMA Sessions (Monthly or on Special Occasions)

**Triggers for scheduling an AMA:**
- Major product launch (MT4 EA release, new broker integration).
- Founder availability for direct community interaction.
- Partner AMA (Vantage or BlackBull account manager answers broker questions).
- 100+ member milestone increments.

**Format**: Text-based AMA in a dedicated Discord thread (accessible async for different timezones) OR live voice AMA in Stage Channel.

**Preparation:**
1. Announce AMA 7 days in advance in #announcements.
2. Open a #submit-questions thread  users pre-submit questions, community upvotes with reactions.
3. Compile top 15 questions by upvote count.
4. Host answers top questions live, takes 5-10 live questions.
5. Post full Q&A transcript to Notion knowledge base.

**Sample AMA topics:**
- "Roadmap AMA: What's Coming in Q2 2026 for Hedge Edge"
- "Broker Deep-Dive AMA: Vantage Account Manager Answers Your Questions"
- "Founder Story AMA: How Hedge Edge Was Built and Where We're Going"

### 3. Trading Challenges

**30-Day Hedge Challenge (Quarterly)**

> **The Hedge Edge 30-Day Challenge**
>
> **Goal**: Pass your prop firm evaluation OR maintain your funded account for 30 consecutive days using Hedge Edge protection.
>
> **Rules**:
> 1. Must use Hedge Edge auto-hedge on every trade during the challenge period.
> 2. Post your daily P&L update in the #30-day-challenge thread (screenshot from dashboard).
> 3. Share your final result at Day 30.
>
> **Prizes**:
> - Complete the challenge (30 days active): 1 month free of your current tier
> - Pass a prop firm evaluation during the challenge: 3 months free Elite + community spotlight
> - Best risk-adjusted return: Custom "Challenge Champion" Discord role + featured case study
>
> **Sign up**: React with a checkmark below. Challenge starts [date].

**Sprint Challenge (Weekly/Bi-weekly)**
- Shorter challenges: "This Week's Challenge: Execute 10 hedged trades  post your dashboard screenshot for a shoutout."
- Low barrier, high participation. Builds habit of sharing results.

### 4. Milestone Celebrations

**Community-Level Milestones:**
- **500 Discord members**  Celebration post + giveaway (3 months free Elite for 3 random active members).
- **1,000 Discord members**  Special AMA + "OG Member" badge for everyone who joined before the milestone.
- **10,000 total hedged trades**  Infographic post showing community stats + celebration in Hedge Lab.

**Individual Milestones** (detected via Supabase, celebrated automatically  see retention-engagement skill for detection):
- Passed challenge, 100 trades, 30 days active, first referral, top referrer.

**Celebration format:**
`
 COMMUNITY WIN 

[UserName] just [achievement]!

[Specific detail  e.g., "Passed their FTMO Phase 2 evaluation with Hedge Edge protecting every trade.
Total drawdown stayed under 3% for the entire evaluation period."]

Drop a  to congratulate them!

Trading with protection  that's the Hedge Edge way.
`

### 5. Educational Workshops (Monthly)

**Workshop Calendar (Rotating Topics):**

| Month | Topic | Target Audience | Duration |
|---|---|---|---|
| Jan | "EA Setup Masterclass: Zero to Hedged in 20 Minutes" | New users, Free tier | 45 min |
| Feb | "Hedge Ratio Optimization: FTMO vs. The5%ers Config Differences" | Pro/Elite | 60 min |
| Mar | "Broker Showdown: Vantage vs. BlackBull Execution Analysis" | All users | 45 min |
| Apr | "Multi-Account Hedging: Managing 5+ Prop Firm Accounts" | Pro/Elite | 60 min |
| May | "Risk Management Beyond Hedging: Position Sizing + Hedge Edge" | All users | 45 min |
| Jun | "Prop Firm Challenge Strategy: How Top Traders Use Hedge Edge to Pass" | All users | 60 min |

**Workshop execution:**
1. Announce 14 days in advance with registration (reaction-based RSVP in Discord).
2. Create a dedicated thread for the workshop in #hedge-lab-events.
3. Host via Discord Stage Channel with screen share.
4. Record and upload to shared drive.
5. Create a summary document in Notion with key takeaways.
6. Post follow-up resources in the workshop thread.

### 6. Event Calendar Planning (Quarterly)

Every quarter, plan the next 13 weeks of events:

**Weekly rhythm:**
- **Monday**: Community spotlight post in #wins-and-milestones (automated from last week's achievements).
- **Wednesday**: Educational content drop in #announcements (tip, guide excerpt, or video).
- **Thursday**: Hedge Lab call at 18:00 UTC.
- **Friday**: Weekly feedback digest published (automated from feedback-collection skill).

**Monthly additions:**
- 1x AMA session (schedule around product launches or partner availability).
- 1x Educational workshop.
- 1x Trading challenge launch (sprint or 30-day, alternating).

**Quarterly additions:**
- 30-Day Hedge Challenge launch.
- Community milestone celebration (timed to projected member growth).
- Retrospective Hedge Lab with community stats and roadmap preview.

Post the quarterly calendar to Notion and pin it in #hedge-lab-events.

## Output Specification

| Output | Format | Destination |
|---|---|---|
| Event announcements | Discord embed message | #announcements, #hedge-lab-events, event-specific threads |
| Reminder DMs | Discord DM | Previous attendees + RSVP'd users |
| Event recordings | Video file + link | Shared drive + #hedge-lab-events thread |
| Attendance logs | JSON records | Supabase events table |
| Post-event surveys | Reaction-based poll | Discord thread |
| Quarterly event calendar | Markdown calendar | Notion Events Calendar + pinned in #hedge-lab-events |
| Challenge leaderboards | Discord embed | Challenge thread + #announcements |
| Workshop summaries | Markdown document | Notion Knowledge Base |

## API & Platform Requirements

| Platform | Variables | Usage |
|---|---|---|
| Discord Bot API | DISCORD_BOT_TOKEN | Stage Channel management, event announcements, RSVP tracking, attendance monitoring |
| Discord Webhook | DISCORD_WEBHOOK_URL | Automated reminders, milestone celebration posts, leaderboard updates |
| Supabase | SUPABASE_URL, SUPABASE_KEY | Event attendance tracking, challenge participation, prize fulfillment records |
| n8n | N8N_WEBHOOK_URL | Pre-event reminder workflows, post-event follow-up automation, RSVP DM triggers |
| Notion API | NOTION_API_KEY | Event calendar, workshop summaries, AMA transcripts, knowledge base articles |
| Typeform / Google Forms | FORM_API_KEY | Post-event feedback surveys (for longer-form feedback beyond Discord reactions) |

## Quality Checks

- [ ] Hedge Lab call happens every Thursday at 18:00 UTC  zero cancellations without 48-hour advance notice.
- [ ] Pre-event reminders sent at T-48h, T-24h, and T-1h for every scheduled event.
- [ ] Event recordings uploaded within 24 hours of event completion.
- [ ] Post-event feedback survey receives responses from > 30% of attendees.
- [ ] Average Hedge Lab attendance grows month-over-month (target: 15%+ of active users).
- [ ] Trading challenges have > 20% sign-up rate from eligible users.
- [ ] Challenge completion rate > 50% of participants who signed up.
- [ ] Quarterly event calendar published by the 1st of each quarter.
- [ ] Workshop NPS (post-event survey) averages 8+ out of 10.
- [ ] At least 2 user-generated testimonials or case studies captured per quarter from event participants.
- [ ] All challenge prizes fulfilled within 7 days of challenge completion.
