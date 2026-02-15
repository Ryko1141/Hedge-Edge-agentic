---
name: partnership-strategy
description: |
  Designs and evaluates partnerships for Hedge Edge — broker IB deals,
  affiliate programs, prop firm integrations, influencer partnerships,
  and channel distribution. Use when negotiating deals, evaluating
  partnership opportunities, or building the affiliate/IB flywheel.
---

# Partnership Strategy

## Objective

Build a partnership ecosystem that creates compounding distribution advantages for Hedge Edge. The goal is not just revenue — it's building a network of aligned partners whose success depends on Hedge Edge's success, creating a moat that deepens over time.

## When to Use This Skill

- When evaluating a new broker partnership opportunity
- When designing or refining the affiliate program
- When a prop firm approaches for integration
- When planning influencer marketing campaigns
- When negotiating IB agreement terms
- When assessing whether a partnership is worth the operational cost
- When building the referral program mechanics

## Input Specification

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| partnership_type | string | Yes | `broker-ib`, `affiliate`, `prop-firm`, `influencer`, `technology`, `white-label` |
| partner_name | string | No | Specific partner being evaluated |
| deal_terms | object | No | Proposed terms (commission rates, revenue shares, etc.) |
| objective | string | No | What the partnership should achieve (revenue, distribution, credibility) |

## Step-by-Step Process

### Phase 1: Partnership Ecosystem Map

```
                    ┌─────────────────┐
                    │   HEDGE EDGE    │
                    │   (Hub)         │
                    └────────┬────────┘
                             │
        ┌────────────────────┼─────────────────────┐
        │                    │                     │
   ┌────▼────┐         ┌────▼────┐          ┌─────▼────┐
   │ BROKERS │         │  PROP   │          │ CONTENT  │
   │  (IB)   │         │  FIRMS  │          │ CREATORS │
   └────┬────┘         └────┬────┘          └─────┬────┘
        │                   │                     │
   Revenue via         Distribution          Awareness &
   lot commissions     via dashboards        trust building
```

### Phase 2: Broker IB Partnerships (Highest Priority)

**Current Partners**: Vantage Markets, BlackBull Markets

**Evaluation Framework for New Partners**:

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Commission rate | 25% | $/lot on forex, metals, indices |
| Platform support | 20% | MT4/MT5/cTrader availability |
| Prop trader popularity | 20% | Is this broker commonly used for hedging? |
| Regulation quality | 15% | FCA/ASIC/CySEC tier vs offshore |
| Onboarding friction | 10% | How fast can a referred user start trading? |
| Geographic coverage | 10% | Matches Hedge Edge user base geography |

**Negotiation Playbook**:
1. Lead with volume projection, not current volume — show growth trajectory
2. Ask for tiered commissions (higher rate as volume increases)
3. Request exclusive spread tier for Hedge Edge users (marketing advantage)
4. Negotiate co-marketing budget (broker funds Hedge Edge ads in exchange for exclusivity)
5. Get sub-IB capability (let Hedge Edge affiliates earn split IB commission)
6. Request dedicated account manager for referred traders

**Priority Broker Targets**:
1. **IC Markets** — #1 volume broker globally, excellent prop trader base
2. **Pepperstone** — Strong in Europe/APAC, cTrader support (aligns with roadmap)
3. **VT Markets** — Aggressive IB programs, growing brand
4. **Exness** — Massive in Southeast Asia (high-growth region)
5. **FP Markets** — ASIC regulated, good MT5 support

### Phase 3: Prop Firm Partnerships

**The Strategic Play**: Get Hedge Edge recommended/embedded in prop firm platforms.

- Prop firms publicly condemn hedging, but many privately tolerate it (ambiguous rules)
- The opportunity: Position Hedge Edge as a "risk management tool" (not a "hedge cheat")
- Target prop firms with explicit hedging policies:
  - Firms that ALLOW hedging → direct partnership (integrated into their dashboard)
  - Firms that are NEUTRAL → educational content partnership
  - Firms that PROHIBIT → avoid (but their traders still use the tool independently)

**Partnership Structure with Hedge-Friendly Firms**:
1. Hedge Edge discounts for their traders (exclusive pricing)
2. Co-branded content ("How to use risk management with [Firm] challenges")
3. Revenue share on referred subscriptions
4. Data sharing: aggregated pass rates for hedging users vs non-hedging (proves value)

### Phase 4: Influencer & Affiliate Program

**Tier Structure**:

| Tier | Requirement | Commission | Perks |
|------|------------|------------|-------|
| Affiliate | Apply, get approved | 20% recurring | Dashboard, tracking links, assets |
| Ambassador | 10+ referred users | 25% recurring + $5 CPA | Early access to features, Discord role |
| Partner | 50+ referred users | 30% recurring + $10 CPA | Custom landing page, co-branded content |
| Elite | 200+ referred users | 35% recurring + $15 CPA | Revenue share on IB (sub-IB), 1-on-1 strategy calls |

**Target Influencer Profiles**:
- YouTube (10K-100K subs, prop firm niche) — Best ROI per $ spent
- Twitter/X (5K-50K followers, FinTwit) — Authority building
- Discord server owners (1K-10K members) — Direct access to target demo
- Telegram group admins (SEA/MENA markets) — Geographic expansion
- TikTok (for awareness, not conversion) — Brand building

**Key Principle**: Never pay flat fees. Always performance-based (CPA or recurring %). This aligns incentives and eliminates wasted spend.

### Phase 5: Technology Partnerships

**Potential Integrations**:
- **MyFXBook** — Auto-publish hedge performance → social proof engine
- **TradingView** — Webhook integration for trade signals → Hedge Edge
- **Discord bots** — Real-time hedge alerts in partner servers
- **VPS providers** — Bundle deals (Hedge Edge + VPS at discount)

### Phase 6: Partnership ROI Evaluation

For every partnership, calculate:

```
Partnership ROI = (Attributed Revenue - Partnership Cost) / Partnership Cost

Where:
- Attributed Revenue = (SaaS revenue from referred users) + (IB revenue from referred users)
- Partnership Cost = Commission payouts + Operational cost + Opportunity cost
```

**Kill criteria**: If a partnership is not ROI-positive within 90 days, renegotiate or terminate.

## Execution Scripts

- [partnership_evaluator.py](./execution/partnership_evaluator.py) — Evaluate partnership opportunities, model ROI, compare deals
- [scrape_ib_pdfs.py](./execution/scrape_ib_pdfs.py) — Scrape IB agreement PDFs into structured Markdown. Run to refresh after PDF updates.

## Resources

- [hedge-edge-business-context.md](./resources/hedge-edge-business-context.md) — Complete business context
- [ib-agreements-index.md](./resources/ib-agreements-index.md) — Index of all scraped IB agreements
- [blackbull-markets-ib-agreement.md](./resources/blackbull-markets-ib-agreement.md) — BlackBull Markets IB Terms & Conditions (scraped)
- [vantage-markets-ib-agreement.md](./resources/vantage-markets-ib-agreement.md) — Vantage Markets IB Agreement (scraped)

## Definition of Done

- [ ] Partnership type clearly identified
- [ ] Evaluation criteria applied with scoring
- [ ] Financial impact modeled (revenue, cost, ROI)
- [ ] Negotiation terms recommended with rationale
- [ ] Risk assessment included
- [ ] Implementation timeline defined

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Partner underperformance | Low referral volume | Set 90-day milestones; renegotiate or cut if missed |
| Regulatory conflict | Partner broker in problematic jurisdiction | Verify broker regulation before signing; get legal review |
| Brand risk | Influencer controversy | Include morality clause in agreements; diversify across 10+ affiliates |
| Commission leakage | Tracking breaks, unattributed conversions | Audit tracking monthly; use UTM + sub-IB codes |
