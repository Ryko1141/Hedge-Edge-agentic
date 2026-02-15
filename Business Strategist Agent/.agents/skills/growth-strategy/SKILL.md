---
name: growth-strategy
description: |
  Designs customer acquisition funnels, retention loops, community-driven
  growth mechanics, and viral strategies specific to prop firm traders.
  Use when planning how to acquire, activate, retain, and expand the
  Hedge Edge user base. Focuses on durable, compounding growth — not hacks.
---

# Growth Strategy

## Objective

Design and refine customer acquisition and retention strategies that exploit the unique dynamics of the prop firm trading community. Every growth lever must compound over time, creating flywheel effects that become harder for competitors to replicate.

## When to Use This Skill

- When planning acquisition campaigns or channel experiments
- When churn exceeds acceptable thresholds (>8% monthly)
- When evaluating new distribution channels (YouTube, TikTok, Telegram, Reddit)
- When designing referral or affiliate programs
- When activation rates (signup → first hedged trade) are underperforming
- When expanding into new geographic markets

## Input Specification

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| growth_lever | string | Yes | `acquisition`, `activation`, `retention`, `referral`, `expansion`, `full-funnel` |
| current_metrics | object | No | Current MRR, users, churn, CAC, etc. If not provided, uses estimates |
| constraint | string | No | Budget limit, team size, timeline, or other constraint |
| market_segment | string | No | Geographic or demographic segment to target |

## Step-by-Step Process

### Phase 1: Map the Prop Firm Trader Journey

```
Discovery → Education → Free Trial → First Hedge → Habit Loop → Upgrade → Advocate
```

1. **Discovery**: Where do prop firm traders congregate?
   - Discord servers (prop firm communities, trading groups)
   - YouTube (challenge documentaries, strategy videos, "I passed FTMO" content)
   - Reddit (r/Forex, r/FuturesTrading, r/PropFirm)
   - Twitter/X (FinTwit, prop firm influencers)
   - Telegram groups (especially Southeast Asia, Middle East)
   - TikTok (growing fast for trading content, especially younger demographics)
   - Prop firm review sites (PropFirmMatch, TrustPilot, ForexPeaceArmy)

2. **Education**: What convinces them hedging is worth it?
   - Cost of failing challenges without hedging (emotional + financial pain)
   - Math: $500 fee × 3 failures = $1,500 lost vs. $29/mo for fee recovery
   - Social proof: Certificates, P&L screenshots, "hedging saved my account" testimonials
   - The "aha moment": Seeing the hedge P&L offset a failed challenge in real-time

3. **Activation**: What gets them from signup to first hedged trade?
   - Guided setup wizard in the desktop app
   - "First hedge in 10 minutes" onboarding promise
   - Preconfigured broker + EA template (reduce friction to zero)

4. **Retention**: What makes them stay?
   - The tool pays for itself every month ($29 vs. $500 per recovered failure)
   - Performance tracking creates habit (daily check of hedge P&L)
   - Community (Discord) creates social lock-in
   - Switching cost: Broker account is set up, EA is configured, history is tracked

5. **Expansion**: What makes them pay more?
   - More accounts (Pro tier for unlimited)
   - More platforms (MT4 + cTrader support in higher tiers)
   - Advanced features (dynamic daily loss limits, webhooks, API access)

6. **Advocacy**: What makes them bring friends?
   - Referral incentive (free month for each referral)
   - Affiliate program (recurring % of referred revenue)
   - "I passed with hedging" bragging rights content

### Phase 2: Channel-Specific Strategies

#### Discord (Highest ROI for prop firm traders)
- Build the definitive "Hedge Edge" Discord as THE hedging community
- Partner with existing prop firm Discord servers (sponsored channels, expert AMAs)
- Bot that auto-posts hedge P&L summaries (social proof engine)
- Free tier users get community access → upgrade for the tool

#### YouTube (Long-form education + SEO)
- Content types: Challenge walkthroughs with hedging, math breakdowns, strategy comparisons
- Partner with prop firm YouTubers (10K-100K subscriber range — best ROI tier)
- "Hedge Edge Challenge Series" — document a $0 to funded journey using hedging
- Optimize for search: "how to pass FTMO", "prop firm hedging strategy", "recover challenge fees"

#### Affiliate / IB Flywheel
- Traders who use Hedge Edge → open broker accounts via referral → generate IB commissions
- IB revenue funds growth spend → acquires more traders → more IB volume → compounding loop
- Goal: IB revenue fully covers customer acquisition cost (CAC → 0)

#### Referral Program
- "Give $10, Get $10" (or free month) — simple, tested
- Track via referral codes embedded in the app
- Leaderboard: Top referrers get featured in community + free Pro access

### Phase 3: Growth Modeling

Model each channel with:
- **Reach**: How many prop firm traders can this channel touch?
- **Conversion Rate**: What % will sign up?
- **CAC**: Cost per acquired customer via this channel
- **Payback Period**: Months until CAC is recovered
- **Scalability**: Can this 10x without linear cost increase?
- **Compounding**: Does this channel get better over time?

### Phase 4: Retention Architecture

Build retention loops that don't depend on willpower:

1. **Value Loop**: Every month, the tool demonstrably saves/earns more than it costs
2. **Data Loop**: The longer you use it, the more performance history you accumulate (switching cost)
3. **Social Loop**: Community engagement creates belonging; leaving = losing your community
4. **Habit Loop**: Daily hedge P&L check becomes routine (push notifications, daily digest email)
5. **Investment Loop**: Broker accounts, EA configurations, and device activations create setup friction that discourages leaving

### Phase 5: Experiment Design

For each growth initiative:
1. **Hypothesis**: "If we [do X], then [metric Y] will increase by [Z%] because [reason]"
2. **Minimum Viable Test**: Smallest version of the experiment that proves/disproves the hypothesis
3. **Success Criteria**: Quantified threshold for declaring success
4. **Timeline**: Max 2 weeks per experiment cycle
5. **Kill Criteria**: When to stop investing in a failing channel

## Execution Scripts

- [growth_model.py](./execution/growth_model.py) — Funnel modeling, CAC/LTV calculations, channel comparison
- [retention_analyzer.py](./execution/retention_analyzer.py) — Cohort analysis, churn prediction, retention score

## Resources

- [hedge-edge-business-context.md](./resources/hedge-edge-business-context.md) — Complete business context

## Definition of Done

- [ ] Growth lever clearly identified and scoped
- [ ] At least 3 channels evaluated with quantified potential
- [ ] CAC and payback period estimated for recommended channels
- [ ] Retention loops explicitly designed (not just mentioned)
- [ ] Experiment design included with hypothesis, test, and success criteria
- [ ] Recommendations are specific to prop firm trader behavior (not generic SaaS)

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Vanity metrics | Tracking followers instead of conversions | Refocus on revenue-connected metrics (trial → paid, activation rate) |
| Channel saturation | Diminishing returns on a channel | Shift budget to next highest-ROI channel; model decaying returns |
| Premature scaling | Scaling before product-market fit | Validate retention (>3 month cohort) before increasing acquisition spend |
| Geographic blindness | Strategies that only work in one region | Segment analysis by geo; test messaging in 2-3 regions before committing |
