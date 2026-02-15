---
name: bug-triage
description: |
  Classifies, prioritizes, and routes bug reports for Hedge Edge from Sentry crash data,
  Discord community reports, and in-app feedback. Uses a severity matrix calibrated for
  trading software where unhedged exposure is the ultimate P0. Manages the full bug lifecycle
  from intake through fix verification and post-mortem documentation.
---

# Bug Triage

## Objective

Ensure no Hedge Edge bug that could cause trader financial harm goes undetected, deprioritized, or unresolved. Maintain a zero-tolerance policy for hedge execution failures while efficiently managing the full spectrum of issues from cosmetic UI glitches to catastrophic trade logic errors. Every bug gets classified within 2 hours of detection. P0 and P1 bugs trigger immediate response workflows.

## When to Use This Skill

- A new Sentry alert fires (crash, unhandled exception, or error rate spike in the Electron app or MT5 EA)
- A user posts in the Discord bug-reports channel describing unexpected behavior
- In-app feedback submissions in Supabase contain error descriptions or negative sentiment
- A developer discovers a bug during feature work and needs it prioritized
- Post-release monitoring shows regression in hedge success rate, latency, or connection stability
- Weekly bug review is needed to clean up the backlog and verify fixes

## Input Specification

| Field | Type | Required | Description |
|---|---|---|---|
| source | enum | Yes | sentry, discord, in_app_feedback, developer, post_release_monitor |
| raw_report | string | Yes | The original bug report text, Sentry event JSON, or feedback submission |
| affected_component | string | No | electron-main, electron-renderer, mt5-ea, mt4-ea, ctrader-cbot, supabase, landing-page, auto-updater |
| user_id | string | No | Supabase user ID or Discord username for follow-up |
| reproduction_steps | string | No | Steps to reproduce if provided by reporter |
| sentry_event_id | string | For Sentry sources | Sentry event ID for deep linking |
| hedge_state_at_time | string | No | Was the user in an active hedge? How many accounts? What pairs? |

## Step-by-Step Process

### 1. Bug Intake and Deduplication
- Parse the raw report to extract: symptoms, affected component, frequency, and user context
- Search existing GitHub Issues for duplicates using title keywords and component labels
- Search Sentry for related events by stack trace fingerprint
- If duplicate found: add the new report as a comment on the existing issue, increment the reports count, and escalate priority if the report count crosses a threshold (3+ unique users = bump priority)
- If new: proceed to classification

### 2. Severity Classification (Trading Software Matrix)

**P0 Critical** (Response: under 30 minutes):
- Trader left with unhedged exposure (hedge fails to execute while prop account trade is open)
- Broker API credentials leaked in logs or exposed via error messages
- Auto-updater corrupts EA files mid-trading session
- Data loss: trade history, account configuration, or hedge mapping state wiped
- App crashes on startup with no recovery path (trader locked out during market hours)

**P1 High** (Response: under 4 hours):
- Hedge executes but with degraded quality (latency spikes to 500ms+)
- Multi-account sync drops one account silently (trader thinks all accounts are hedged)
- Dashboard shows stale position data (trader makes decisions on incorrect information)
- Reconnection loop after broker disconnect does not recover automatically
- EA fails to detect position modifications (SL/TP changes not mirrored to hedge)

**P2 Medium** (Response: under 24 hours):
- Notification sounds do not play on hedge execution
- Trade history export produces malformed CSV
- Dark mode renders incorrectly on specific Electron version
- Settings page does not save preferences on first attempt (works on retry)
- Discord bot misses some messages in high-traffic channels

**P3 Low** (Response: next sprint):
- Tooltip text truncated on 1080p displays
- Settings page layout shifts on window resize
- Locale-specific date formatting incorrect
- Minor visual glitch in the hedge status indicator animation
- Log file rotation not cleaning up files older than 30 days

### 3. Impact Assessment
- **Active Hedge Impact**: Was the bug triggered while a hedge was active? If yes, auto-escalate one severity level.
- **User Count**: How many users are affected? Check Sentry event count and Supabase error logs.
  - 1 user with unique environment: likely environmental, investigate before prioritizing
  - 3-10 users: confirmed bug, prioritize per severity
  - 10+ users: potential systemic issue, trigger incident response
- **Financial Exposure**: Did any trader report financial loss? If yes, P0 regardless of other factors. Log in incident database and escalate to human.
- **Regression Check**: Was this working in the previous release? If yes, tag as regression and auto-escalate one severity level.

### 4. Reproduction and Diagnosis
- For P0/P1: Attempt reproduction within 1 hour using the Hedge Edge test environment
  - Spin up simulated MT5 accounts with demo broker
  - Replicate the user's configuration (number of accounts, broker, pairs, lot sizes)
  - Monitor Electron main process logs and EA journal for the failure pattern
- For P2/P3: Document reproduction steps in the GitHub Issue; reproduction can happen during sprint work
- Key diagnostic data to collect:
  - Electron app version and OS version
  - MT5/MT4 EA version and build number
  - Broker name and server (e.g., Vantage-Live3, BlackBull-Demo)
  - Network conditions (VPS vs. local, ping to broker server)
  - Supabase user profile and subscription tier
  - Sentry breadcrumbs and stack trace

### 5. GitHub Issue Creation
- Title format: [P-severity] [component] concise description
  - Example: [P0] [mt5-ea] Hedge order rejected when broker returns requote during high volatility
  - Example: [P2] [electron-renderer] Dashboard position card shows NaN for lot size on partial close
- Labels: severity (p0-critical, p1-high, p2-medium, p3-low), component, bug, regression (if applicable)
- Body includes: description, reproduction steps, expected vs actual behavior, diagnostic data, affected users count, Sentry link, and hedge safety implications
- Assign to the appropriate developer based on component ownership
- Link to Discord thread if reported by a user (so they get updates)

### 6. Fix Verification Protocol
- Every P0/P1 fix requires:
  - Unit test covering the exact failure case
  - Integration test simulating the scenario end-to-end
  - Manual verification in the test environment before merge
  - Canary release to 5 percent of users before full rollout
- Every P2/P3 fix requires:
  - Unit test covering the failure case
  - Manual verification before merge
- Close the Sentry issue when the fix is deployed and confirmed stable for 48 hours

### 7. Post-Mortem (P0 Only)
- Write a post-mortem document in Notion with:
  - Timeline of events (detection, triage, fix, deploy, verification)
  - Root cause analysis (5 Whys)
  - What went wrong and what went right
  - Action items to prevent recurrence (test coverage gaps, monitoring gaps, architectural weaknesses)
- Share post-mortem summary in Discord team-updates (sanitized, no user-identifying data)

## Output Specification

| Output Type | Format | Destination |
|---|---|---|
| Bug Issue | GitHub Issue with severity, labels, full diagnostics | hedge-edge-app repo |
| Severity Assessment | Markdown summary with classification rationale | GitHub Issue comment |
| Incident Alert | Formatted notification for P0/P1 | Discord incidents channel via bot |
| Post-Mortem | Structured Notion page | Notion Incidents database |
| Weekly Bug Report | Summary of open bugs by severity, age, and component | Notion + Discord team-updates |
| Fix Verification | Test results and canary rollout metrics | GitHub PR comment |

## API and Platform Requirements

- Sentry (SENTRY_DSN): Query events, issues, and error trends; resolve issues on fix deployment; track release health
- GitHub API (GITHUB_TOKEN): Create/update issues, manage labels, link PRs to issues, query issue history for deduplication
- Supabase (SUPABASE_URL, SUPABASE_KEY): Query error logs, user profiles (correlate bugs with subscription tier and broker config), feedback submissions
- Discord Bot (DISCORD_BOT_TOKEN): Monitor bug-reports channel, post incident alerts to incidents, notify users when their reported bug is fixed
- Notion API (NOTION_API_KEY): Write post-mortems, update bug stats in dashboards

## Quality Checks

- [ ] Every bug report is triaged and classified within 2 hours of detection
- [ ] P0 bugs have an acknowledged owner and active investigation within 30 minutes
- [ ] No P0/P1 bug is closed without a regression test covering the exact failure scenario
- [ ] Sentry issue is linked in every GitHub bug issue where applicable
- [ ] Bug-to-fix cycle time is tracked: P0 under 24 hours, P1 under 72 hours, P2 under 2 weeks
- [ ] Weekly bug backlog review confirms no stale issues (open over 30 days without activity)
- [ ] Post-mortems are written for every P0 within 48 hours of resolution
- [ ] Discord reporters are notified when their bug is fixed to close the feedback loop
- [ ] Hedge safety implications are documented in every bug issue touching hedge-core, mt5-ea, mt4-ea, or ctrader-cbot
