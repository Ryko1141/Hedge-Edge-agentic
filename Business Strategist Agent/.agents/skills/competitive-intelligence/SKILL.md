---
name: competitive-intelligence
description: |
  Analyzes competitors in the prop firm hedging and trade copier space.
  Maps competitive positioning, identifies gaps, tracks feature parity,
  and surfaces strategic opportunities. Use when evaluating threats,
  planning differentiation, or preparing for market shifts.
---

# Competitive Intelligence

## Objective

Maintain a continuously updated competitive map of the prop-firm hedging and trade copier market. Identify where Hedge Edge has defensible advantages, where competitors are closing gaps, and where whitespace opportunities exist.

## When to Use This Skill

- When a new competitor launches or an existing one adds hedging features
- Before major product or pricing decisions
- When users mention competitor names or request competitor features
- Quarterly competitive landscape refresh
- When evaluating build-vs-buy for new features
- During investor/partner conversations requiring competitive positioning

## Input Specification

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| competitor_name | string | No | Specific competitor to analyze (or "all" for landscape) |
| analysis_type | string | No | `feature-comparison`, `pricing-analysis`, `positioning-map`, `threat-assessment`, `full-landscape`. Default: `full-landscape` |
| focus_area | string | No | Specific capability to compare (e.g., "MT5 support", "pricing model") |

## Step-by-Step Process

### Phase 1: Competitor Identification

Map all players in concentric competitive rings:

**Ring 1 — Direct Competitors** (hedge copier tools):
- Trade copiers with explicit hedging/reverse-copy features
- Tools specifically marketed to prop firm traders
- Examples: Duplikium, Social Trader Tools, FX Blue, Local Trade Copier

**Ring 2 — Adjacent Competitors** (trade copiers without hedge focus):
- Generic trade copiers that could add hedging
- MT4/MT5 copy plugins (Signal Start, MQL5 Signals)
- Manual hedging EAs on MQL5 marketplace

**Ring 3 — Substitute Solutions** (alternative approaches):
- Manual hedging (no tool — just two terminals)
- Prop firm insurance/refund products
- "No loss" challenge strategies (e.g., time-based expiration exploits)
- Cloud-based prop firm dashboards (MyFXBook, FundedNext analytics)

### Phase 2: Feature Parity Analysis

Score each competitor on Hedge Edge's core value axes:

| Feature | Weight | Scoring |
|---------|--------|---------|
| Reverse copy (hedging) | 25% | 0-10 |
| Multi-platform (MT4/MT5/cTrader) | 15% | 0-10 |
| Local execution (latency) | 15% | 0-10 |
| Multi-account management | 10% | 0-10 |
| Drawdown/daily-loss protection | 10% | 0-10 |
| Visual hedge mapping | 5% | 0-10 |
| Ease of setup | 10% | 0-10 |
| Pricing value | 10% | 0-10 |

### Phase 3: Positioning Map

Plot competitors on 2×2 matrices:
1. **Sophistication vs. Ease of Use** — Where is the gap between "powerful but complex" and "simple but limited"?
2. **Price vs. Feature Depth** — Who is overpriced relative to features? Who is underpriced?
3. **Local vs. Cloud** — Where does the market sit on execution architecture?

### Phase 4: Threat Assessment

For each direct competitor, evaluate:
- **Momentum**: Growing, stable, or declining? (traffic trends, Discord/community activity)
- **Funding/Resources**: Bootstrapped vs. funded? Team size?
- **Switching Cost from Hedge Edge**: How easy is it for a Hedge Edge user to switch?
- **Differentiation Durability**: Can they replicate our advantages? How long would it take?

### Phase 5: Strategic Recommendations

1. **Defend**: Which advantages must be protected?
2. **Attack**: Where are competitor weaknesses we can exploit?
3. **Ignore**: Which competitive moves are noise (not real threats)?
4. **Build**: What features would create category separation?

## Execution Scripts

- [competitor_tracker.py](./execution/competitor_tracker.py) — Tracks competitor changes, pricing updates, and feature launches

## Resources

- [hedge-edge-business-context.md](./resources/hedge-edge-business-context.md) — Hedge Edge business context
- [competitor-profiles.json](./resources/competitor-profiles.json) — Structured competitor database

## Definition of Done

- [ ] All Ring 1 competitors identified and profiled
- [ ] Feature parity matrix completed with weighted scores
- [ ] At least one positioning map generated
- [ ] Threat levels assigned (Critical / High / Medium / Low / Noise)
- [ ] 3+ specific actionable recommendations with rationale
- [ ] Analysis is grounded in evidence, not assumptions

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Incomplete competitor data | Private company, no public info | Use indirect signals (traffic, reviews, social following); flag confidence as low |
| Feature misclassification | Competitor markets feature differently | Test competitor tool directly (free trial) or rely on user reviews |
| Stale analysis | Competitor landscape changes fast | Set quarterly refresh reminders; monitor competitor changelogs/social media |
