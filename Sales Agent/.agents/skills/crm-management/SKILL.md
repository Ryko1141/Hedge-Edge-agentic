---
name: crm-management
description: |
  Maintains the Hedge Edge sales CRM (Google Sheets + Notion) via n8n automation.
  Logs every lead interaction, manages deal stages, syncs Supabase subscription data,
  and ensures a single source of truth for all sales activity.
---

# CRM Management

## Objective

Keep the Hedge Edge CRM accurate, current, and actionable by logging every sales touchpoint
(Discord message, demo call, email, checkout event) in Google Sheets and Notion. Provide the
Sales Agent with real-time context on any lead or deal, and feed clean data into pipeline
forecasting.

## When to Use This Skill

- A new lead is qualified and needs a CRM record created.
- A sales interaction occurs (call completed, email sent, Discord DM exchanged, proposal sent).
- A deal stage changes (e.g., MQL  SQL, Demo Scheduled  Proposal Sent  Closed Won).
- Subscription status changes in Supabase (new signup, upgrade, downgrade, churn).
- A Creem.io payment event fires (checkout completed, payment failed, subscription renewed).
- A periodic CRM hygiene sweep is triggered (stale leads, missing data, duplicates).
- An IB referral event occurs (lead opens Vantage or BlackBull account via Hedge Edge link).

## Input Specification

`yaml
crm_action:
  type: enum[create_lead, update_lead, log_interaction, change_stage, sync_subscription, sync_payment, bulk_hygiene, log_ib_event]
  required: true

lead_id: string | null                    # existing CRM row ID; null for create
lead_data:                                # required for create_lead
  name: string
  email: string
  discord_handle: string | null
  source: enum[discord, landing_page, free_guide, referral, ib_partner]
  score: integer
  classification: enum[cold, warm, mql, sql, hot]
  tier_recommendation: enum[starter, pro, hedger]
  prop_firms: list[string]
  account_count: integer
  platform: enum[MT5, MT4, cTrader]
  broker_accounts: list[string]

interaction_data:                         # required for log_interaction
  type: enum[discord_dm, email, call_discovery, call_demo, call_closing, proposal_sent, checkout_link_sent, follow_up]
  summary: string                         # one-paragraph description
  outcome: string                         # e.g. "Booked demo for Feb 20", "Objection: price too high"
  next_action: string
  next_action_date: date

stage_change:                             # required for change_stage
  from_stage: string
  to_stage: string
  reason: string

subscription_data:                        # required for sync_subscription
  supabase_user_id: string
  current_tier: enum[free, starter, pro, hedger]
  subscription_start: date
  last_payment_date: date
  payment_status: enum[active, past_due, cancelled]

payment_data:                             # required for sync_payment
  creem_event_type: enum[checkout_completed, payment_failed, subscription_renewed, subscription_cancelled, refund_issued]
  amount: float
  currency: string
  tier: string
`

## Step-by-Step Process

### Step 1  Resolve Lead Identity
1. If lead_id is provided, fetch the existing row from Google Sheets CRM.
2. If lead_id is null, search by email and discord_handle to detect duplicates.
3. If a Supabase user ID exists, pull the latest profile and subscription data via SUPABASE_URL + SUPABASE_KEY.
4. Merge all data sources into a unified lead record.

### Step 2  Execute CRM Action

**create_lead:**
1. Validate all required fields are present.
2. Generate a unique lead_id (format: HE-LEAD-{YYYYMMDD}-{4-digit-seq}).
3. Append a new row to the Google Sheets "Leads" tab with all fields plus created_at timestamp.
4. If classification  MQL, also create a Notion page in the "Sales Pipeline" database with properties: Lead Name, Score, Stage (= classification), Tier Recommendation, Prop Firms, Account Count, Source, Created Date.
5. Trigger n8n webhook for any downstream automations (e.g., Slack notification to sales channel).

**update_lead:**
1. Fetch current row, merge new data (never overwrite with null).
2. Update the Google Sheets row in place.
3. If a Notion page exists, update corresponding properties.
4. Append an entry to the "Interaction Log" tab: lead_id, timestamp, "Lead data updated", delta summary.

**log_interaction:**
1. Append a row to the "Interaction Log" tab: lead_id, timestamp, interaction type, summary, outcome, next_action, next_action_date.
2. Update the lead's "Last Contact Date" and "Last Interaction Type" in the Leads tab.
3. If the interaction is a completed demo call, calculate days since first contact (sales cycle tracking).
4. If the interaction reveals an IB opportunity (lead mentions needing a broker), flag for IB outreach.

**change_stage:**
1. Update the lead's stage in Google Sheets and Notion.
2. Log the stage transition with timestamp and reason in the Interaction Log.
3. Stage definitions for Hedge Edge pipeline:
   - 
ew_lead  qualified  discovery_call_booked  demo_scheduled  demo_completed  proposal_sent  
egotiation  closed_won | closed_lost
4. If closed_won: update with tier, MRR value, and IB status; trigger n8n celebration webhook.
5. If closed_lost: log the loss reason (price, timing, no need, competitor, went silent) for win/loss analysis.

**sync_subscription:**
1. Query Supabase for the user's current subscription record.
2. Update the CRM lead row with: current_tier, subscription_start, payment_status, MRR value.
3. If tier changed (upgrade or downgrade), log as a stage event and update Notion.
4. MRR values: Starter = , Pro = , Hedger = .

**sync_payment:**
1. Receive Creem.io webhook payload.
2. Map the payment event to the CRM lead (match by email).
3. Update payment fields: last_payment_date, payment_status, lifetime_value (cumulative).
4. If payment_failed, trigger n8n workflow for dunning sequence and alert the Sales Agent for save outreach.
5. If subscription_cancelled, move deal to churned stage and log the churn reason.

**bulk_hygiene:**
1. Scan all leads with last_contact_date older than 30 days and stage not closed_won/closed_lost.
2. Flag stale leads for re-engagement or archival.
3. Check for duplicate emails/Discord handles and merge records.
4. Verify all MQL+ leads have a Notion deal card; create missing ones.
5. Validate that subscription data matches between CRM and Supabase.

### Step 3  Maintain Data Integrity
1. Enforce required fields: every lead must have at least name + (email OR discord_handle).
2. Validate score is 0100 and classification matches the score range defined in lead-qualification.
3. Ensure stage transitions are valid (no skipping from 
ew_lead to closed_won).
4. All timestamps in UTC; display in the lead's local timezone where relevant.

## Output Specification

`yaml
crm_result:
  action_performed: string
  lead_id: string
  google_sheets_row_updated: boolean
  google_sheets_row_number: integer
  notion_page_updated: boolean
  notion_page_id: string | null
  n8n_webhook_triggered: boolean
  data_conflicts_resolved: list[string]   # e.g. ["Email mismatch resolved: used Supabase value"]
  warnings: list[string]                  # e.g. ["Lead has no email  Discord-only contact"]
  summary: string                         # human-readable one-line summary
`

## API & Platform Requirements

| Platform | Variable | Operations Used |
|---|---|---|
| Google Sheets | GOOGLE_SHEETS_API_KEY | Read, append, update rows across Leads and Interaction Log tabs |
| Notion | NOTION_API_KEY | Create/update pages in Sales Pipeline database; query for existing deals |
| n8n | N8N_WEBHOOK_URL | Trigger CRM sync workflows, stage-change notifications, dunning sequences |
| Supabase | SUPABASE_URL, SUPABASE_KEY | Query user profiles, subscription status, usage telemetry |
| Creem.io | CREEM_API_KEY | Verify payment status, retrieve subscription details |
| Discord Bot | DISCORD_BOT_TOKEN | Resolve discord_handle to user ID for deduplication |

## Quality Checks

- [ ] Every sales interaction is logged within 5 minutes of occurrence  no orphaned touchpoints.
- [ ] Lead records are never duplicated; dedup runs on every create and bulk hygiene sweep.
- [ ] Stage transitions are sequential and logged with timestamps and reasons.
- [ ] Supabase subscription data and CRM data agree; discrepancies trigger an alert via n8n.
- [ ] Creem.io payment events are matched to CRM leads within 60 seconds of webhook receipt.
- [ ] Stale leads (30+ days no contact, not closed) are flagged weekly for review.
- [ ] All MQL+ leads have corresponding Notion deal cards  verified on every bulk hygiene run.
- [ ] MRR values in the CRM match Creem.io payment amounts  no manual overrides without audit trail.
- [ ] Loss reasons are captured for every closed-lost deal to feed win/loss analysis.
