---
name: release-management
description: |
  Owns the end-to-end release process for Hedge Edge: Electron desktop app, MT5 EA,
  MT4 EA, cTrader cBot, and landing page. Manages semantic versioning, changelog
  generation, staged rollouts via Electron auto-updater, rollback procedures, and
  post-release monitoring. Never ships during peak trading hours.
---

# Release Management

## Objective

Ship Hedge Edge updates that traders can trust with their funded accounts. Every release is versioned, tested, staged, monitored, and rollback-ready. The release process is designed around the reality that our users have live money at risk: a bad update that crashes the app during an open hedge could cost someone their FTMO funded account. Zero tolerance for surprise breaking changes.

## When to Use This Skill

- A sprint is complete and features/fixes are ready to ship
- A P0 hotfix needs emergency deployment outside the normal release cadence
- Electron auto-updater configuration changes are needed (rollout percentage, channel targeting)
- MT5/MT4 EA version needs to be pushed to users (EA files distributed via app or manual download)
- Landing page deployment to Vercel for changelog, docs, or marketing updates
- Rollback decision is needed because post-release monitoring shows regression
- Release notes and changelog need to be generated for Discord and in-app display

## Input Specification

| Field | Type | Required | Description |
|---|---|---|---|
| release_type | enum | Yes | standard, hotfix, ea_update, landing_page |
| version_bump | enum | Yes | major, minor, patch (follows semver) |
| components | list | Yes | Which components are included: electron-app, mt5-ea, mt4-ea, ctrader-cbot, landing-page |
| changelog_commits | list | No | List of conventional commit messages to generate changelog from (auto-fetched if not provided) |
| rollout_strategy | enum | No | canary, staged, full (defaults to staged for standard, full for hotfix) |
| target_date | string | No | Desired release date (must not fall on a Friday or during major forex news events) |

## Step-by-Step Process

### 1. Release Readiness Check

Before any release proceeds, validate:

**Code Quality Gates**:
- All CI checks pass on the release branch (unit tests, integration tests, linting)
- No open P0 or P1 bugs tagged with the release milestone
- Code review approved on all PRs in the release
- Sentry error rate on the current version is at baseline (no unresolved spikes)

**Hedge Safety Audit**:
- If the release touches hedge execution code (trade event loop, order placement, position sync):
  - Run the hedge simulation test suite (1000 simulated trades across 5 account configurations)
  - Verify hedge success rate is 99.7% or higher in simulation
  - Verify p95 hedge latency is under 150ms in simulation
- If the release touches Electron main process or IPC:
  - Test that the app gracefully handles crash-during-hedge scenario (hedges are persisted and resumed on restart)
  - Test auto-update with active hedges (update should be deferred until all hedges are closed)

**Timing Validation**:
- Never release during London/NY session overlap (08:00-12:00 EST Monday-Friday)
- Never release on Friday (no weekend support for rollback)
- Avoid major forex news events (NFP, FOMC, ECB rate decisions) - check Forex Factory calendar
- Preferred release window: Tuesday-Thursday, 17:00-20:00 EST (after NY close, before Asia open)
- Hotfix exception: P0 hotfixes can ship anytime but require 2x monitoring coverage

### 2. Version Management

**Semantic Versioning Rules for Hedge Edge**:
- **Major (X.0.0)**: Breaking changes to hedge behavior, new platform support (MT4, cTrader), subscription tier restructuring
- **Minor (x.Y.0)**: New features (hedge ratio customization, drawdown alerts), non-breaking improvements
- **Patch (x.y.Z)**: Bug fixes, performance improvements, documentation updates

**EA Versioning**: MT5/MT4 EAs follow their own version scheme (EA-X.Y.Z) but are pinned to a minimum Electron app version for compatibility. The EA must check the Electron app version on startup and warn if incompatible.

**Version Manifest**: Update the version manifest at ELECTRON_UPDATE_URL with:
- Latest version number
- Minimum required EA version
- Release notes URL
- Rollout percentage (for staged releases)
- Platform-specific download URLs (Windows x64, macOS ARM, macOS x64)

### 3. Changelog Generation

Generate changelog from conventional commits since the last release:

**Changelog Categories**:
- **Hedge Core**: Changes to trade execution, latency, position management
- **Platform**: MT5/MT4/cTrader EA changes
- **Dashboard**: UI/UX changes to the Electron renderer
- **Connectivity**: Broker connection, reconnection, failover changes
- **Infrastructure**: Auto-update, telemetry, authentication, Supabase changes
- **Bug Fixes**: Resolved issues with links to GitHub Issues

**Format**: Changelog is written in Markdown and published to:
1. GitHub Release (full changelog)
2. Discord #updates channel (highlighted changes with trader-friendly language)
3. In-app changelog dialog (shown on first launch after update)
4. Landing page /changelog route on Vercel

**Tone**: Changelogs are written for traders, not developers. Instead of "Refactored WebSocket reconnection state machine", write "Improved broker reconnection reliability - the app now recovers from connection drops 3x faster and preserves your active hedges during brief network interruptions."

### 4. Staged Rollout Execution

**Canary Phase** (first 4 hours):
- Deploy to 5% of users (selected by Supabase user cohort - prefer users with lower account values and fewer active hedges)
- Monitor Sentry for new crashes, error rate spikes, and hedge failure events
- Monitor Supabase trade_events for hedge latency regression
- Gate: No new P0/P1 issues and hedge success rate stays above 99.7%

**Staged Phase** (next 24 hours):
- Expand to 25%, then 50%, then 100% in 8-hour increments
- Each expansion gated by the same Sentry and Supabase metrics
- If any gate fails: pause rollout, investigate, and decide to fix-forward or rollback

**Full Rollout**:
- 100% of users receive the update
- Monitor for 48 hours post-full-rollout before marking the release as stable
- Remove the previous version from the update server (keeping one version back as rollback target)

### 5. Rollback Procedure

Trigger a rollback if:
- Hedge success rate drops below 99.5% (measured across all users in the rollout cohort)
- P0 bug is confirmed in the new version with no immediate fix available
- Sentry crash-free session rate drops below 99% for the new version
- 3 or more users report the same critical issue in Discord within 2 hours

**Rollback Steps**:
1. Update the version manifest to point to the previous stable version
2. Electron auto-updater will pull the previous version on next check (every 30 minutes)
3. Post a Discord announcement in #updates explaining the rollback and ETA for fix
4. Create a P0 GitHub Issue for the rollback cause
5. All users on the rolled-back version will receive the downgrade within 1 hour
6. For EA rollbacks: post manual download links in Discord since EA auto-update is less reliable

### 6. Post-Release Monitoring Dashboard

After every release, maintain a 48-hour monitoring checklist:

| Metric | Source | Threshold | Action if Breached |
|---|---|---|---|
| Hedge success rate | Supabase trade_events | Greater than 99.7% | Pause rollout, investigate |
| p95 hedge latency | Supabase trade_events | Under 150ms | Performance investigation |
| Crash-free sessions | Sentry | Greater than 99% | Rollback consideration |
| New error types | Sentry | 0 new unhandled errors | Triage immediately |
| Broker disconnect recovery | Supabase connection_logs | Under 5s average | Connectivity investigation |
| Discord sentiment | Discord bot monitoring | No spike in negative messages | Investigate reports |
| Auto-update success | Electron telemetry | Greater than 95% of users updated in 24h | Check update server |

### 7. Release Communication

- **Pre-release** (1 day before): Post in Discord #updates that a new version is coming, with a preview of key changes
- **Release**: Post full changelog in Discord, trigger in-app changelog display, update landing page
- **Post-release** (48 hours): Post a follow-up confirming stable release or noting any issues resolved
- **Hotfix**: Post immediately in Discord explaining the issue and the fix, with reassurance about hedge safety

## Output Specification

| Output Type | Format | Destination |
|---|---|---|
| Release Checklist | Markdown checklist with all gates | GitHub Release draft |
| Changelog | Trader-friendly Markdown | GitHub Release, Discord, in-app, landing page |
| Version Manifest | JSON | ELECTRON_UPDATE_URL |
| Rollout Status | Progress report with metrics | Notion release page |
| Rollback Report | Incident report with cause and timeline | Notion Incidents database |
| Post-Release Report | 48-hour metrics summary | Notion release page |

## API and Platform Requirements

- GitHub API (GITHUB_TOKEN): Create releases, upload artifacts, manage release branches, publish changelogs
- Electron Auto-Update (ELECTRON_UPDATE_URL): Manage version manifest, rollout percentages, platform builds
- Sentry (SENTRY_DSN): Monitor crash-free rate, new errors, error trends per release
- Supabase (SUPABASE_URL, SUPABASE_KEY): Query trade_events for hedge metrics, connection_logs for broker stability, user cohort selection for canary
- Vercel (VERCEL_TOKEN): Deploy changelog page updates to landing site
- Discord Bot (DISCORD_BOT_TOKEN): Post release announcements, pre-release previews, rollback notifications
- n8n (N8N_WEBHOOK_URL): Trigger build pipelines, notify on release completion, automate Notion status updates

## Quality Checks

- [ ] No release ships without passing all CI checks and hedge simulation tests
- [ ] Release timing avoids London/NY overlap, Fridays, and major news events
- [ ] Changelog is written in trader-friendly language, not developer jargon
- [ ] Staged rollout starts at 5% canary and gates on hedge success rate and crash-free rate
- [ ] Rollback procedure is tested quarterly to ensure the version manifest swap works
- [ ] EA version compatibility is validated against the Electron app version before release
- [ ] Post-release monitoring runs for 48 hours with documented metric checks
- [ ] Every release has a Discord announcement posted within 1 hour of going live
- [ ] Auto-update is deferred if the user has active hedges (update queued until hedges close)
- [ ] Previous stable version is retained as rollback target for at least 2 weeks
