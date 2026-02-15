---
name: qa-automation
description: |
  Designs and maintains the test strategy for Hedge Edge across unit tests, integration
  tests, and end-to-end hedge simulation tests. Covers critical paths: hedge execution
  under latency stress, multi-account synchronization, broker reconnection during open
  positions, Electron auto-update with active hedges, and prop firm compliance validation.
  Manages test environments that simulate real market conditions without risking capital.
---

# QA Automation

## Objective

Guarantee that every Hedge Edge release meets the reliability bar required for software that manages real trader capital. The test suite must catch any regression in hedge execution, broker connectivity, multi-account sync, or prop firm compliance before code reaches production. Target: 99.7% hedge success rate in simulation, sub-150ms p95 latency, and zero undetected P0 regressions.

## When to Use This Skill

- A new feature or bug fix is ready for testing before merge
- The hedge simulation test suite needs to be updated for new scenarios
- A platform integration (MT4, cTrader) needs its test harness built
- Post-release monitoring revealed a gap in test coverage
- Quarterly test strategy review to align coverage with product evolution
- A P0 post-mortem identified a missing test that should have caught the issue
- Load testing is needed before a major release or marketing push that will increase user count

## Input Specification

| Field | Type | Required | Description |
|---|---|---|---|
| test_type | enum | Yes | unit, integration, e2e_simulation, load, regression, platform_specific |
| component | string | Yes | electron-main, electron-renderer, mt5-ea, mt4-ea, ctrader-cbot, supabase, auto-updater |
| trigger | enum | Yes | pre_merge, pre_release, post_incident, coverage_gap, new_platform, scheduled |
| scenario_description | string | For new tests | What trading scenario this test covers |
| related_issue | string | No | GitHub Issue number that motivated this test |
| target_metrics | object | No | Expected latency, success rate, or other quantitative targets |

## Step-by-Step Process

### 1. Test Environment Architecture

**Simulated Trading Environment**:
- Dedicated MT5 demo accounts on Vantage and BlackBull demo servers
  - 3 accounts simulating prop firm accounts (FTMO rules applied via test harness)
  - 2 accounts simulating personal hedge accounts
  - Accounts pre-funded with virtual capital matching real user scenarios (50K, 100K, 200K)
- MT4 demo accounts for MT4 EA testing (when active)
- cTrader demo accounts via Spotware sandbox (when active)
- Network simulation layer: inject latency (50ms, 100ms, 500ms, 2000ms), packet loss (1%, 5%), and disconnections to stress-test the hedge engine

**Electron Test Instance**:
- Headless Electron app running the full main process (Node.js trade event loop)
- Mock renderer for UI interaction tests (Playwright or Spectron)
- Isolated Supabase project for test data (separate from production)
- Sentry test DSN to validate error reporting without polluting production dashboards

**CI Integration**:
- Unit tests run on every commit (GitHub Actions, under 2 minutes)
- Integration tests run on every PR to main (GitHub Actions, under 10 minutes)
- E2E hedge simulation runs nightly and on every release candidate (under 30 minutes)
- Load tests run weekly and before major releases (under 60 minutes)

### 2. Test Categories and Coverage

#### Unit Tests (Component Level)
Target: 90% code coverage on hedge-core modules

**Hedge Engine Unit Tests**:
- Order construction: Verify correct symbol, volume, direction (reverse of source), and magic number for hedge orders
- Lot size normalization: Input 1.5 lots MT5, expect 150,000 units for cTrader; input 0.01 lots, expect minimum lot validation
- Position mapping: Given 3 source positions across 2 symbols, verify correct hedge position mapping
- Partial close calculation: Source closes 0.3 of 1.0 lot position, verify hedge close of 0.3 lots on the correct mapped position
- Drawdown calculation: Given account balance, equity, and open P/L, verify drawdown percentage matches prop firm formula

**IPC Message Tests**:
- Serialize/deserialize trade events between EA and Electron (JSON schema validation)
- Handle malformed messages gracefully (no crash, log error, skip event)
- Heartbeat timeout detection: miss 3 heartbeats, trigger disconnection handler

**Supabase Integration Unit Tests**:
- Feature flag evaluation: user on Pro tier with mt4_enabled = true gets MT4 features
- Trade event logging: events are batched and written efficiently (no per-trade DB round trip)
- Auth token refresh: expired Supabase JWT triggers silent refresh without interrupting hedge loop

#### Integration Tests (Cross-Component)
Target: Cover every communication boundary

**EA-to-Electron Integration**:
- MT5 EA opens a trade on demo account. Verify Electron receives the trade event within 100ms.
- MT5 EA modifies SL/TP. Verify Electron receives the modification and updates the hedge position.
- MT5 EA closes a trade via SL hit. Verify Electron closes the corresponding hedge within 200ms.
- Simulate EA crash (process kill). Verify Electron detects the disconnection and alerts the user.
- Simulate Electron crash. Verify EA continues running and queues events. On Electron restart, verify state resynchronization.

**Electron-to-Supabase Integration**:
- Trade events are logged to Supabase with correct user_id, account_id, and timestamps.
- Feature flag changes in Supabase propagate to the Electron app within 30 seconds.
- Connection status changes (broker connect/disconnect) are logged in real-time.

**Electron-to-Sentry Integration**:
- Unhandled exceptions in main process are captured with correct release version tag.
- Breadcrumbs include the last 5 trade events before the error (for debugging context).
- Performance transactions are created for hedge execution (to track latency in Sentry).

#### E2E Hedge Simulation Tests
Target: 99.7% hedge success rate across 1000 simulated trades

**Scenario Suite**:

| Scenario | Description | Pass Criteria |
|---|---|---|
| Basic hedge | Open EURUSD buy on prop, verify sell on personal | Hedge executes within 150ms, correct lot size |
| Multi-pair | Open 5 different pairs simultaneously | All 5 hedges execute within 200ms total |
| Partial close | Close 50% of position on prop | Hedge partial close matches within 1ms lot precision |
| Rapid fire | Open 10 trades in 2 seconds | All 10 hedges execute, no missed trades, no duplicate hedges |
| Broker disconnect mid-hedge | Kill broker connection after prop trade, before hedge | System detects gap, alerts trader, recovers on reconnect |
| High latency | Inject 500ms network latency | Hedge still executes (with degraded latency), no timeouts |
| Multi-account | 3 prop accounts trade same symbol | Hedges distributed correctly, no cross-account contamination |
| Account switch | Switch active prop account during trading | Hedge mapping updates without affecting existing positions |
| Position reversal | Prop goes from long to short (close + open) | Both close and new hedge execute atomically |
| SL/TP cascade | Prop position hits SL, auto-closes | Hedge position closes within 200ms of SL trigger |
| Weekend gap | Positions held over weekend, market gaps on open | Hedge P/L tracking resynchronizes on Monday open |
| EA update during hedge | Electron pushes EA update while hedges are active | Update deferred until all hedges closed, then applied |
| Prop firm rule breach | Drawdown approaches 80% of max | Alert fires, hedge continues, user notified before 90% |

**Simulation Runner**:
- Uses MT5 demo accounts with a custom "market replay" EA that generates trades on a schedule
- Electron app runs in headless mode processing events
- Results logged to a test Supabase project for analysis
- Pass/fail determined by hedge success rate, latency percentiles, and zero missed trades

#### Load Tests
Target: System stable with 10 concurrent accounts, 50 trades per second aggregate

**Load Scenarios**:
- Ramp from 1 to 10 concurrent prop accounts, each trading every 30 seconds
- Burst: all 10 accounts open trades simultaneously (simulating correlated entry on news)
- Sustained: 30-minute continuous trading at 2 trades/minute per account
- Memory leak check: run for 4 hours, verify Electron main process memory stays under 500MB
- CPU utilization: hedge event loop should not exceed 30% CPU on a mid-range machine (i5, 8GB RAM)

#### Platform-Specific Tests

**MT4-Specific**:
- FIFO close ordering on FIFO-enforced brokers
- Magic number assignment and collision avoidance
- Polling-based position detection latency benchmark (vs MT5 event-driven)
- DLL IPC reliability under rapid trade sequences

**cTrader-Specific**:
- OAuth token refresh during active hedge (no interruption)
- Position ID tracking through partial close lineage
- Volume-to-lot conversion accuracy for all supported symbols
- Symbol name mapping for top 28 forex pairs + XAUUSD + XAGUSD

### 3. Test Data Management

- **Demo account credentials**: Stored in encrypted environment variables, never in test code
- **Market data**: Recorded tick data from volatile sessions (NFP, FOMC) replayed in simulation
- **User profiles**: Test Supabase project has 20 synthetic user profiles across all subscription tiers
- **Broker configurations**: Pre-configured for Vantage (demo), BlackBull (demo), and a mock broker for edge case testing
- **Cleanup**: Every test run cleans up positions, orders, and Supabase records after completion

### 4. Test Reporting and Coverage Tracking

**Per-Run Report**:
- Test suite name, run time, pass/fail counts
- Hedge success rate (for simulation tests)
- Latency percentiles: p50, p90, p95, p99
- Any new failures with stack traces and Sentry event IDs
- Coverage diff since last run (for unit tests)

**Dashboard** (Notion):
- Current coverage by component (unit, integration, e2e)
- Hedge simulation success rate trend (weekly)
- Latency trend (weekly)
- Known gaps and planned test additions
- Test flakiness rate (tests that pass on retry = flaky, target under 2%)

### 5. Regression Test Protocol

When a P0/P1 bug is fixed:
1. Write a regression test that reproduces the exact failure scenario
2. Verify the test fails on the buggy code (checkout the commit before the fix)
3. Verify the test passes on the fixed code
4. Add the test to the nightly E2E suite with a tag linking to the original GitHub Issue
5. Update the coverage dashboard

### 6. Test Maintenance

- Review test suite monthly for: flaky tests (quarantine and fix), obsolete tests (remove), slow tests (optimize)
- Update simulation scenarios when new prop firms are added to the compliance matrix
- Add platform-specific tests as MT4 and cTrader integrations progress through phases
- Rotate demo account credentials quarterly

## Output Specification

| Output Type | Format | Destination |
|---|---|---|
| Test Plan | Markdown with scenarios, pass criteria, environment setup | Notion QA database + GitHub wiki |
| Test Results | JSON report + human-readable summary | GitHub Actions artifacts + Notion |
| Coverage Report | Coverage percentages by component | GitHub PR comment + Notion dashboard |
| Simulation Report | Hedge success rate, latency percentiles, failures | Notion QA database |
| Regression Test | Test code with linked GitHub Issue | hedge-edge-app repo test directory |
| Load Test Report | Throughput, latency, memory, CPU metrics | Notion QA database |

## API and Platform Requirements

- GitHub API (GITHUB_TOKEN): Trigger CI workflows, read test results from Actions, post coverage to PRs, manage test-related issues
- Supabase (SUPABASE_URL, SUPABASE_KEY): Test project for trade event validation, feature flag testing, user profile fixtures
- Sentry (SENTRY_DSN): Test DSN for validating error capture behavior, performance transaction validation
- n8n (N8N_WEBHOOK_URL): Trigger nightly test runs, aggregate results across test suites, alert on failures
- Electron Auto-Update (ELECTRON_UPDATE_URL): Test update flow with a staging update server
- MetaTrader Manager API (MT_MANAGER_API_KEY, future): Manage demo account state, push test EA configurations

## Quality Checks

- [ ] Unit test coverage is 90% or higher on hedge-core modules
- [ ] Every PR touching hedge execution code has passing integration tests before merge
- [ ] E2E hedge simulation runs nightly with results posted to Notion by 07:00 EST
- [ ] Hedge success rate in simulation has not dropped below 99.7% in the last 30 days
- [ ] p95 hedge latency in simulation stays under 150ms
- [ ] Every P0/P1 bug fix includes a regression test that proves the fix
- [ ] Test flakiness rate is under 2% (flaky tests are quarantined within 48 hours)
- [ ] Load tests confirm stability at 10 concurrent accounts before every major release
- [ ] Demo account credentials are rotated quarterly and never appear in test code
- [ ] Platform-specific test suites exist and pass before any platform reaches open beta phase
- [ ] Test data is cleaned up after every run (no orphaned positions on demo accounts)
