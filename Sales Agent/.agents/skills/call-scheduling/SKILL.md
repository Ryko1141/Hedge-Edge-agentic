---
name: call-scheduling
description: |
  Manages the end-to-end scheduling workflow for Hedge Edge sales and demo calls.
  Books Calendly slots, creates Zoom meeting links, sends confirmation and reminder
  sequences, and handles rescheduling and no-show follow-ups to maintain 80% show-up rate.
---

# Call Scheduling

## Objective

Convert qualified leads into booked, attended sales conversations by orchestrating calendar
availability, meeting creation, confirmation messaging, and reminder cadences. Maximise the
show-up rate (target  80%) and minimise time-to-first-call for SQL and hot leads.

## When to Use This Skill

- A lead has been classified as MQL (score 5175) or higher by the lead-qualification skill.
- A prospect explicitly requests a demo or sales call in Discord, email, or the landing page.
- A rescheduling or cancellation request arrives.
- A no-show occurs and a re-engagement follow-up is needed.
- A sales call needs to be booked as part of the upsell flow (e.g., Starter subscriber exploring Hedger tier).

## Input Specification

`yaml
scheduling_request:
  lead_id: string                          # CRM row ID or Supabase user ID
  lead_name: string
  lead_email: string
  discord_handle: string | null
  lead_classification: enum[mql, sql, hot]
  call_type: enum[discovery_15min, demo_30min, closing_call_30min, upsell_15min]
  preferred_datetime: datetime | null       # lead's preferred slot (if stated)
  timezone: string                          # e.g. "America/New_York", "Europe/London"
  tier_context: string | null               # e.g. "Considering upgrade from Starter to Hedger"
  prop_firm_context: string | null          # e.g. "Running 4 FTMO accounts on MT5"
  urgency: enum[standard, high, immediate]  # hot leads get same-day slots
`

## Step-by-Step Process

### Step 1  Check Availability
1. Query Google Calendar API (GOOGLE_CALENDAR_KEY) for available slots in the next 5 business days.
2. If urgency is immediate, expand the search to include same-day and next-day slots, including early morning and evening windows.
3. Filter out existing bookings, buffer 15 minutes between calls for prep/debrief.
4. If preferred_datetime is provided, check if that exact slot is available first.

### Step 2  Create Calendly Event
1. Call Calendly API (CALENDLY_API_KEY) to create a one-time scheduling link for the appropriate call_type:
   - discovery_15min  15-minute intro call for MQLs. Topic: "Discover how Hedge Edge automates your prop-firm hedging."
   - demo_30min  30-minute live demo for SQLs. Topic: "See Hedge Edge manage hedges across your {account_count} {prop_firm} accounts in real time."
   - closing_call_30min  30-minute call for pricing discussion and close. Topic: "Your personalised Hedge Edge plan  {tier} tier walkthrough."
   - upsell_15min  15-minute call for existing subscribers. Topic: "Unlock {target_tier} features for your growing account portfolio."
2. Set the event description to include:
   - Lead's prop-firm context (e.g., "Trader runs 4 FTMO 200K accounts, currently hedging manually across MT5 terminals")
   - Recommended tier and reasoning
   - Pre-call checklist for the sales rep

### Step 3  Create Zoom Meeting
1. Call Zoom API (ZOOM_API_KEY) to generate a meeting link with the following settings:
   - Waiting room enabled
   - Recording set to cloud (for call review/coaching)
   - Meeting duration matches call_type
2. Attach the Zoom link to the Calendly event.

### Step 4  Send Confirmation Sequence
1. **Immediate confirmation** (within 30 seconds of booking):
   - Channel: Email + Discord DM (if discord_handle available)
   - Content: "Hey {lead_name}, your {call_type_friendly} with Hedge Edge is confirmed for {datetime} {timezone}. Here's your Zoom link: {zoom_link}. Before our call, you might want to check out how traders with {account_count}+ accounts use automated hedging: [link to relevant case study or Free Guide]."
2. **24-hour reminder**:
   - Channel: Email + Discord DM
   - Content: "Quick reminder  we're meeting tomorrow at {time} to walk through how Hedge Edge can automate hedging across your {prop_firm} accounts. Join here: {zoom_link}. Got questions beforehand? Drop them in our Discord #hedge-help channel."
3. **1-hour reminder**:
   - Channel: Discord DM only (less intrusive)
   - Content: "See you in an hour! {zoom_link}"

### Step 5  Handle Edge Cases

**Rescheduling:**
1. Cancel the existing Calendly event and Zoom meeting.
2. Present 3 alternative time slots from the availability check.
3. Rebook and re-trigger the confirmation sequence.
4. Update the CRM row with the new datetime and a "Rescheduled" note.

**No-Show:**
1. Wait 5 minutes past the scheduled time.
2. Send a "We missed you" message via Discord DM and email: "Hey {lead_name}, looks like we missed each other. No worries  I know prop-firm trading keeps you busy. Here are a few times that work this week: {3 alternative slots}. Or grab a slot directly: {calendly_link}."
3. Update CRM with "No-Show" status and schedule an automated follow-up in 48 hours.
4. If second no-show, downgrade lead classification by one tier (SQL  MQL) and add to nurture sequence.

### Step 6  Update CRM and Pipeline
1. Write to Google Sheets CRM via n8n webhook: call type, datetime, Zoom link, confirmation sent, reminder status.
2. Update the Notion deal card with "Demo Scheduled" or "Closing Call Scheduled" stage.
3. Log the full scheduling chain in the interaction history.

## Output Specification

`yaml
scheduling_result:
  lead_id: string
  call_type: string
  scheduled_datetime: datetime
  timezone: string
  calendly_event_id: string
  zoom_meeting_id: string
  zoom_join_link: string
  confirmation_sent: boolean
  confirmation_channels: list[enum[email, discord_dm]]
  reminder_schedule:
    - trigger: "24h_before"
      status: enum[scheduled, sent]
    - trigger: "1h_before"
      status: enum[scheduled, sent]
  crm_updated: boolean
  notion_stage_updated: boolean
  pre_call_brief: string                  # summary for the sales rep
`

## API & Platform Requirements

| Platform | Variable | Operations Used |
|---|---|---|
| Calendly | CALENDLY_API_KEY | Create one-time event link, cancel event, list event types |
| Zoom | ZOOM_API_KEY | Create meeting, delete meeting, get meeting details |
| Google Calendar | GOOGLE_CALENDAR_KEY | List events (availability check), create calendar block |
| Google Sheets | GOOGLE_SHEETS_API_KEY | Update lead row with scheduling data |
| n8n | N8N_WEBHOOK_URL | Trigger reminder sequences, no-show follow-up workflows |
| Discord Bot | DISCORD_BOT_TOKEN | Send DM confirmations and reminders |
| Notion | NOTION_API_KEY | Update deal stage to "Demo Scheduled" or "Closing Call Booked" |

## Quality Checks

- [ ] Every booked call has both a Calendly event and a Zoom meeting link  never one without the other.
- [ ] Confirmation message is sent within 30 seconds of booking.
- [ ] Pre-call brief includes the lead's prop-firm context, account count, current hedging method, and recommended tier.
- [ ] No double-bookings: availability is re-checked immediately before Calendly event creation.
- [ ] Timezone is explicitly confirmed and displayed in the lead's local time in all communications.
- [ ] No-show follow-up fires within 10 minutes of missed call, not later.
- [ ] Rescheduled calls are logged as rescheduled (not new bookings) to preserve the interaction chain.
- [ ] Show-up rate is tracked per lead source to identify which channels produce the most reliable attendees.
