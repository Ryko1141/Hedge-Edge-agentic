---
name: strategic-planning
description: |
  Long-term strategic planning for Hedge Edge — moat building, market
  expansion, product-market fit deepening, and defensibility analysis.
  Use for high-level strategic decisions, annual planning, pivots, and
  evaluating existential threats or transformative opportunities.
---

# Strategic Planning

## Objective

Define and maintain Hedge Edge's long-term strategic direction. Every plan must create compounding advantages that widen over time. The north star is: **Make Hedge Edge the indispensable infrastructure for every prop firm trader's hedging operations.**

## When to Use This Skill

- Annual strategy review and planning
- When evaluating major pivots or market expansion
- When assessing existential threats (regulation, platform changes, prop firm rule changes)
- When making build-vs-buy-vs-partner decisions
- When investors/partners ask "what's the 3-year vision?"
- When a market shock requires strategy revision

## Input Specification

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| strategic_question | string | Yes | High-level strategic question or planning horizon |
| time_horizon | string | No | `6mo`, `1yr`, `3yr`, `5yr`. Default: `3yr` |
| scenario | string | No | `base`, `optimistic`, `defensive`. Default: `base` |
| constraints | list | No | Known constraints (budget, team, regulatory, technical) |

## Step-by-Step Process

### Phase 1: Strategic Position Assessment

**Where Hedge Edge Sits Today (SWOT)**:

| Strengths | Weaknesses |
|-----------|------------|
| First-mover in dedicated prop firm hedge copier | Single-platform (MT5 only in beta) |
| Local-first architecture (latency advantage) | Small team, limited resources |
| Two IB partnerships signed | Low awareness — most prop traders don't know about it |
| Strong value proposition (28x ROI) | Creem payment processing (less known than Stripe) |
| Active Discord community | No mobile app |

| Opportunities | Threats |
|---------------|---------|
| MT4/cTrader launch = 2x addressable market | Prop firms banning hedging (rule changes) |
| IB revenue can exceed SaaS (the hidden engine) | Established copier tools adding hedging features |
| Geographic expansion (SEA, MENA — fastest growing) | Regulatory crackdown on prop firms |
| Affiliate program as a zero-CAC channel | Platform fragmentation (DXtrade, Match-Trader) |
| Prop firm partnerships (embedded distribution) | Free/cheap alternatives on MQL5 marketplace |
| Data moat (aggregate hedge performance data) | Broker IB term changes |

### Phase 2: Moat Architecture

Build defensibility layers that compound:

**Layer 1 — Product Moat** (Year 1)
- Multi-platform support (MT4/MT5/cTrader) — most competitors only cover 1
- Local execution engine with sub-millisecond latency
- Proprietary drawdown protection algorithms
- "Works out of the box" UX that's 10x easier than alternatives

**Layer 2 — Data Moat** (Year 1-2)
- Aggregate anonymous hedge performance data across all users
- Build the largest dataset of "hedging outcomes" in the prop firm space
- Use data to optimize hedge ratios, lot sizing, and entry timing
- Offer data insights as premium feature (or sell aggregated data to brokers)

**Layer 3 — Network Moat** (Year 2-3)
- Broker partnerships create bilateral switching cost (brokers depend on Hedge Edge volume)
- Affiliate network where affiliates' income depends on Hedge Edge's success
- Community (Discord) becomes the de facto hedging community
- Prop firm integrations make Hedge Edge part of the trader's workflow

**Layer 4 — Brand Moat** (Year 2+)
- "Hedge Edge" becomes the verb — "I Hedge-Edged my challenge"
- Thought leadership: Publish the annual "State of Prop Firm Hedging" report
- Trusted by the community (social proof, testimonials, certificates)
- Content library that ranks for every hedging-related search term

### Phase 3: Strategic Roadmap

**Phase A: Foundation (Now → Month 6)**
- Launch MT4 and cTrader support (2x addressable market)
- Launch Pro tier at $59/mo (ARPU expansion)
- Launch affiliate program (zero-CAC acquisition channel)
- Sign 1-2 additional broker partners (IC Markets, Pepperstone)
- Hit 1,000 paying users

**Phase B: Scale (Month 6 → Month 18)**
- Launch annual pricing (reduce churn, improve LTV)
- Expand to new geographies (localized landing pages for SEA, MENA)
- Launch Hedger tier at $99/mo with API/webhook access
- Build the data moat (aggregate performance analytics)
- Hit 5,000 paying users, $200K+ MRR (SaaS + IB combined)

**Phase C: Dominate (Month 18 → Month 36)**
- Become the default hedging infrastructure for prop firm traders
- Negotiate exclusive partnerships with top 5 prop firms
- Launch mobile companion app (portfolio monitoring, no trading)
- Explore adjacent verticals (fund management tools, retail trader tools)
- Hit 20,000+ paying users, $1M+ MRR
- Evaluate exit or raise (from position of strength)

### Phase 4: Scenario Planning

**Scenario 1: Prop Firms Ban Hedging**
- Impact: Existential for the "challenge hedging" use case
- Probability: Medium (some firms already have anti-hedging rules)
- Response: Pivot messaging from "hedge your challenges" to "manage risk across multiple accounts" — the tool's utility extends beyond challenge hedging (funded account management, multi-broker portfolio sync)
- Preparation: Build features that have standalone value without hedging

**Scenario 2: Major Competitor Raises Funding**
- Impact: High — well-funded competitor can outspend on acquisition
- Probability: Medium
- Response: Double down on community and IB moat (can't be bought with VC money). Speed to multi-platform. Lock in broker exclusivity deals. Focus on retention (harder to steal users with high switching costs)

**Scenario 3: MT4/MT5 Loses Dominance**
- Impact: High — if traders move to DXtrade/Match-Trader, Hedge Edge must follow
- Probability: Medium-Low (next 3 years)
- Response: Build platform-agnostic architecture. Abstract the trade execution layer so new platforms can be added quickly. Early investment in DXtrade/Match-Trader connectors.

**Scenario 4: Regulatory Crackdown on Prop Firms**
- Impact: Severe — if prop firms shut down, TAM shrinks dramatically
- Probability: Low-Medium (next 3 years)
- Response: Diversify use case. Hedge Edge as a "multi-account sync tool" for retail traders (not just prop). IB revenue becomes more important (brokers survive even if prop firms don't).

### Phase 5: Resource Allocation Framework

**70-20-10 Rule**:
- **70%** of resources on core product (what's working now — MT5, hedging, current market)
- **20%** on adjacent growth (MT4/cTrader, new geographies, affiliate program)
- **10%** on exploratory bets (DXtrade support, mobile app, data products)

### Phase 6: Decision Frameworks

**For "Should we build X?" decisions:**
```
1. Does it strengthen a moat layer? (If no → probably skip)
2. Does it serve existing users or acquire new ones? (Retain > Acquire at this stage)
3. Can we ship an MVP in <2 weeks? (If not, scope smaller)
4. Does it increase ARPU, reduce churn, or lower CAC? (Must move at least one)
5. Is this a 10x improvement or incremental? (Prefer 10x bets)
```

**For "Should we partner with X?" decisions:**
```
1. Does the partnership create mutual dependency? (Best: they need us as much as we need them)
2. Is the revenue aligned? (Both parties make more money when the partnership succeeds)
3. Is it reversible? (Can we exit without destroying value?)
4. Does it create a moat? (Or is it a commodity deal any competitor could replicate?)
```

## Execution Scripts

- [strategic_scorecard.py](./execution/strategic_scorecard.py) — Strategic health scorecard, initiative tracking, scenario modeling

## Resources

- [hedge-edge-business-context.md](./resources/hedge-edge-business-context.md) — Complete business context

## Definition of Done

- [ ] Strategic question is clearly framed
- [ ] SWOT or equivalent situation analysis is current
- [ ] At least 2 scenarios modeled with responses
- [ ] Recommendation includes timeline, resource requirements, and success metrics
- [ ] Moat impact assessed for each recommendation
- [ ] Risks are identified with mitigations
- [ ] Output connects to the 3-phase roadmap (Foundation → Scale → Dominate)

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Analysis paralysis | Too many options, no clear winner | Apply the "10x Rule" — only pursue options with order-of-magnitude impact |
| Strategy drift | Shiny object syndrome | Re-anchor to the moat framework; does this initiative build a moat layer? |
| Over-planning | Spending too long planning vs doing | Cap planning at 20% of effort; ship, measure, adjust |
| Ignoring weak signals | Dismissing early signs of market shift | Quarterly scenario review; assign someone to track each scenario's indicators |
