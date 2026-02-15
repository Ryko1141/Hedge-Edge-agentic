---
name: user-feedback
description: |
  Aggregates and synthesizes user feedback for Hedge Edge from Discord, in-app feedback
  widgets, Sentry session data, and direct interviews. Clusters signals into actionable
  themes, quantifies demand, and produces briefs that feed the feature roadmap and
  bug triage pipelines. Focused on prop firm trader pain points and hedging workflow friction.
---

# User Feedback Synthesis

## Objective

Transform the raw, unstructured voice of Hedge Edge's ~500 beta traders into prioritized, actionable product insights. No feedback gets lost in Discord noise. Every signal is captured, clustered, quantified, and routed to the right product decision.

## When to Use This Skill

- Weekly feedback synthesis cycle (every Monday)
- A surge of feedback on a single topic (3+ messages in Discord about the same issue within 48 hours)
- Pre-sprint planning  produce a voice of the trader brief to inform prioritization
- Post-release feedback monitoring  what are traders saying about the latest update?
- Quarterly feedback trends report for business strategy alignment

## Input Specification

| Field | Type | Required | Description |
|---|---|---|---|
| synthesis_type | enum | Yes | weekly_cycle, surge_response, pre_sprint, post_release, quarterly_trends, deep_dive |
| date_range | string | Yes | Start and end dates for the feedback window |
| release_version | string | For post-release | The version to monitor feedback for (e.g., v2.3.1) |
| focus_topic | string | For deep dives | Specific topic to investigate |
| discord_channels | list | No | Channels to scan (defaults: bug-reports, feature-requests, general, trading-chat) |

## Step-by-Step Process

### 1. Feedback Collection

**Discord** (via DISCORD_BOT_TOKEN):
- Scan bug-reports: Extract every message with its reactions count (reactions = signal amplification)
- Scan feature-requests: Extract messages and threaded replies showing discussion depth
- Scan general and trading-chat: Filter for product-related messages using keyword matching (hedge, latency, disconnect, update, crash, slow, broken, wish, please add)
- Capture user metadata: server tenure, role (beta-tester, pro-user), message frequency

**In-App Feedback Widget** (via Supabase):
- Query the feedback_submissions table for the date range
- Each submission includes: user_id, feedback_type (bug, feature, praise, complaint), message text, app version, timestamp
- Join with user_profiles for: subscription tier, active account count, broker config, days since signup

**Sentry Session Data** (via SENTRY_DSN):
- Query sessions with frustration signals: repeated crashes, rage clicks, sessions ending within 30 seconds of a crash
- Extract the user flow leading to frustration

### 2. Feedback Classification

**Category Tags**:
- hedge-execution: Speed, accuracy, failures, partial fills
- broker-connectivity: Connection drops, reconnection behavior, broker-specific issues
- multi-account: Managing multiple prop accounts, hedge distribution, account switching
- onboarding: First-time setup, EA installation, broker linking
- ui-dashboard: Visual design, information architecture, position display accuracy
- platform-request: MT4, cTrader, new broker support requests
- pricing-billing: Plan confusion, value perception, upgrade friction
- auto-update: Update experience, forced restarts, version compatibility
- prop-firm-compliance: Drawdown monitoring, rule compliance features
- praise: Positive feedback (protect what works)

**Sentiment**: positive, neutral, negative, urgent-negative

**Signal Strength** based on: unique users expressing it, Discord reaction count, subscriber tier weight (Pro/Enterprise = 1.5x), recency decay (7d = 1.0x, 30d = 0.7x, older = 0.4x)

### 3. Theme Clustering

Group feedback items into themes representing the same underlying problem:
- Example: "My hedge didn't fire" + "Latency spiked to 2 seconds" + "App froze during NFP" = Theme: Hedge Execution Reliability Under Volatility
- Themes must be specific enough to be actionable
- Minimum 2 unique users to become a reported theme; single-user items go to signals to watch appendix

**Standard themes tracked every cycle**:
1. Hedge execution speed and reliability
2. Broker reconnection and failover
3. Multi-account management experience
4. Onboarding friction and time-to-first-hedge
5. Platform expansion demand (MT4 / cTrader / new brokers)
6. Pricing and value perception

### 4. Quantification and Ranking

Compute a Trader Impact Score (TIS) for each theme:
- Weight sentiment: urgent-negative = 4, negative = 2, neutral = 1, positive = 0.5
- Weight tier: Enterprise = 1.5, Pro = 1.2, Starter = 1.0, Free/Beta = 0.8
- Weight recency: 7 days = 1.0, 8-30 days = 0.7, 30+ days = 0.4
- Multiply sum of weighted signals by log2(unique_users + 1)
- Rank themes by TIS descending. Top 5 = Priority Signals for the sprint.

### 5. Actionable Brief Generation

For each Priority Signal theme produce:
- Theme Title with TIS Score and breakdown
- 2-3 representative user quotes (anonymized)
- Affected Segment: which trader profiles are most affected (tier, prop firm, trading style)
- Current Product Behavior vs Trader Expectation Gap
- Recommended Action: new_feature, bug_fix, ux_improvement, documentation, or no_action
- Linked Roadmap Item if one exists; otherwise recommend creating one

### 6. Feedback Loop Closure
- For every theme that ships, post a "You asked, we built" update in Discord tagging original reporters
- Update feedback_submissions in Supabase to mark resolved items
- Track feedback-to-ship cycle time (target: under 4 weeks for P1 themes)

## Output Specification

| Output Type | Format | Destination |
|---|---|---|
| Weekly Feedback Brief | Markdown with ranked themes, TIS scores, quotes | Notion Feedback Insights database |
| Pre-Sprint Brief | Top-5 themes with recommended actions | Notion sprint page + Discord |
| Post-Release Sentiment Report | Sentiment breakdown by category | Notion release page |
| Quarterly Trends Report | Longitudinal theme trends | Notion Product Strategy database |
| Surge Alert | Urgent notification when topic hits 3+ reports in 48h | Discord incidents or team-updates |

## API and Platform Requirements

- Discord Bot (DISCORD_BOT_TOKEN): Read bug-reports, feature-requests, general, trading-chat; post summaries
- Supabase (SUPABASE_URL, SUPABASE_KEY): Query feedback_submissions, user_profiles, trade_events
- Sentry (SENTRY_DSN): Session frustration signals, crash frequency, error trends
- Notion API (NOTION_API_KEY): Create feedback briefs, theme tracking database, roadmap links
- GitHub API (GITHUB_TOKEN): Link themes to existing issues, create new issues

## Quality Checks

- [ ] Every feedback channel scanned in the weekly cycle  no channel skipped
- [ ] Feedback deduplicated across channels (same user in Discord and in-app counted once)
- [ ] Theme clustering is specific and actionable  no theme broader than one product area
- [ ] TIS scoring uses current subscription data from Supabase
- [ ] User quotes are representative, not cherry-picked
- [ ] Positive feedback tracked alongside negative  protect what works
- [ ] Single-user signals tracked in appendix for trend monitoring
- [ ] No PII in shared reports  Discord usernames anonymized in Notion briefs
- [ ] Post-release sentiment monitored for 72+ hours before declaring release healthy
