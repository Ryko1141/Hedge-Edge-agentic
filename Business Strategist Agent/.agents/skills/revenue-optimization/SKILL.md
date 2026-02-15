---
name: revenue-optimization
description: |
  Optimizes Hedge Edge's revenue through pricing strategy, ARPU expansion,
  tier design, IB commission maximization, and churn reduction. Use when
  making pricing decisions, designing upsell paths, or evaluating the
  financial impact of product changes.
---

# Revenue Optimization

## Objective

Maximize Hedge Edge's revenue per user, total revenue, and revenue durability through strategic pricing, tier architecture, IB commission optimization, and monetization of adjacent value. Every recommendation must be grounded in prop firm trader willingness-to-pay and competitive pricing reality.

## When to Use This Skill

- When setting or changing subscription prices
- When designing new pricing tiers (Pro, Hedger)
- When analyzing IB commission structures from broker partners
- When evaluating whether a feature should be free or paid
- When churn is eating into MRR growth
- When preparing financial projections for partners or investors
- When considering new revenue streams (marketplace, API, white-label)

## Input Specification

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| revenue_question | string | Yes | Specific revenue question or optimization area |
| current_mrr | float | No | Current monthly recurring revenue |
| current_users | int | No | Current active paying users |
| current_churn | float | No | Monthly churn rate (decimal) |
| constraint | string | No | Business constraint (e.g., "cannot raise prices on existing users") |

## Step-by-Step Process

### Phase 1: Revenue Architecture Analysis

Map all current and potential revenue streams:

**Stream 1: SaaS Subscriptions (Primary)**
```
Free Guide → Starter ($29/mo) → Pro ($30/mo) → Hedger ($75/mo)
                 ↑                    ↑              ↑
              Current             Coming Soon     Coming Soon
```

Critical pricing issues to evaluate:
- Gap between Starter ($29) and Pro ($30) is only $1 — this is broken. Pro should be $49-59.
- Hedger at $75 may be too high for 90% of the market. Consider $59 for Pro, $99 for Hedger.
- 7-day free trial needs conversion tracking. What % convert?
- Monthly-only pricing leaves money on the table — add annual plans (20% discount = 2 months free)

**Stream 2: IB Commissions (Secondary)**
- Per-lot rebates from Vantage and BlackBull on referred hedge accounts
- Currently passive — users voluntarily open accounts via referral links
- Optimization: Make broker setup part of the onboarding flow (not just a link on the website)
- Model: If 30% of users open broker accounts, trading 80 lots/month at $4/lot = $96/user/month in IB revenue
- This can exceed SaaS revenue per user — it's the hidden profit engine

**Stream 3: Future Revenue Streams**
- **API Access**: Charge for webhook/API integration (Hedger tier or separate)
- **White-Label**: License the copier engine to other trading tools
- **Marketplace**: Sell preconfigured hedge strategies/templates
- **Education**: Premium courses on advanced hedging (one-time purchases)
- **Data**: Anonymized aggregate hedge performance data (for brokers/prop firms)

### Phase 2: Pricing Strategy

#### Value-Based Pricing Framework

The core question: **How much does Hedge Edge save/earn the trader?**

```
Scenario: Trader doing 3 challenges/month at $400 each
- Without hedging: 85% fail → loses $1,020/month in challenge fees
- With hedging: Recovers ~80% of failed challenge fees → saves $816/month
- Hedge Edge cost: $29/month
- Net ROI: $816 - $29 = $787/month (28x return)
```

**Implication**: Hedge Edge is dramatically underpriced relative to value delivered. The product pays for itself within 2 days of the month. This means:
1. Price elasticity is low — users will accept higher prices without churning
2. The anchor is not "$29/mo for software" but "$29/mo to save $800/mo"
3. Upgrade triggers should emphasize ROI, not features

#### Tier Redesign Recommendation

| Tier | Price | Target | Key Differentiator |
|------|-------|--------|--------------------|
| Free Guide | Free | Top-of-funnel | Education + community only |
| Starter | $29/mo | Casual hedger (1-2 accounts) | 3 copier groups, basic features |
| Pro | **$59/mo** | Serious hedger (3-5 accounts) | Unlimited groups, advanced analytics, hedge map |
| Hedger | **$99/mo** | Power user / fund manager | Multi-platform, API, webhooks, white-glove |
| Annual Starter | $249/yr ($20.75/mo) | Price-sensitive users | 28% savings, reduces churn |
| Annual Pro | $499/yr ($41.58/mo) | Committed professionals | 30% savings |

### Phase 3: IB Commission Optimization

IB revenue is the strategic moat — competitors can copy features but not your broker relationships.

**Optimization levers**:
1. **Increase referral rate**: Embed broker signup into the app's onboarding flow (not just a website link)
2. **Negotiate volume tiers**: As referred volume increases, renegotiate commission rates upward
3. **Add more broker partners**: VT Markets, IC Markets, Pepperstone — each new broker = more user choice = higher referral rate
4. **Track and attribute**: Ensure every lot traded through a referred account is tracked and attributed
5. **Exclusive spreads**: Negotiate exclusive spread discounts for Hedge Edge users → makes partner brokers the obvious choice

**Revenue model**:
```
500 users × 30% referral rate × 80 lots/month × $4/lot = $48,000/month IB revenue
vs.
500 users × $35 ARPU = $17,500/month SaaS revenue
```

IB revenue can be 2-3x SaaS revenue at scale. This is the strategic insight most competitors miss.

### Phase 4: Churn-to-Revenue Analysis

Every 1% reduction in monthly churn = significant LTV increase:
- 8% churn → 12.5 month LTV → $437/user
- 7% churn → 14.3 month LTV → $500/user (+14%)
- 6% churn → 16.7 month LTV → $583/user (+33%)
- 5% churn → 20.0 month LTV → $700/user (+60%)

**High-impact churn reduction tactics**:
1. Annual plans (eliminate 83% of churn for annual subscribers)
2. Usage-based stickiness (the more hedges tracked, the harder to leave)
3. Community integration (Discord role based on subscription tier)
4. Win-back campaigns targeting churned users at challenge-season peaks

### Phase 5: Financial Modeling

Build projections connecting pricing/retention changes to 12-month MRR:

Model variables:
- New user acquisition rate (monthly)
- Tier distribution (% Starter / Pro / Hedger)
- Monthly churn by tier
- IB referral rate and average lot volume
- IB commission rate per broker
- Annual plan adoption rate

## Execution Scripts

- [pricing_optimizer.py](./execution/pricing_optimizer.py) — Price sensitivity modeling, tier analysis, revenue projection
- [ib_revenue_model.py](./execution/ib_revenue_model.py) — IB commission calculator, broker partnership ROI model

## Resources

- [hedge-edge-business-context.md](./resources/hedge-edge-business-context.md) — Complete business context

## Definition of Done

- [ ] Revenue question is clearly answered with quantified projections
- [ ] All revenue streams (SaaS + IB + future) are considered
- [ ] Pricing recommendations include rationale grounded in customer value
- [ ] Financial impact is modeled over at least 6-12 months
- [ ] Implementation steps are specific and sequenced
- [ ] Risks and mitigations identified for each recommendation

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Price shock churn | Raising prices too aggressively | Grandfather existing users; apply new pricing only to new signups |
| IB attribution failure | Broker not tracking referrals accurately | Audit IB dashboard monthly; use sub-IB codes per user if available |
| Cannibalization | Free tier too generous | Audit free tier features; ensure paid tier has clear "I need this" features |
| Revenue concentration | Over-reliance on single broker's IB | Diversify to 3+ broker partners; no single broker >50% of IB revenue |
