---
name: revenue-tracking
description: |
  Track and analyse all Hedge Edge revenue streams  SaaS subscriptions via Creem.io, IB commissions from Vantage and BlackBull Markets, and affiliate income from FundingPips and Heron Copier. Calculate MRR, ARR, net new MRR, and revenue growth. Reconcile Creem.io payments against Supabase subscription records and Tide Bank deposits.
---

# Revenue Tracking

## Objective

Maintain a real-time, accurate picture of all Hedge Edge revenue. Every pound entering the business must be attributed to a source (SaaS subscription tier, IB commission from specific broker, or affiliate payout), reconciled across systems (Creem.io  Supabase  Tide Bank), and surfaced as actionable metrics (MRR, ARR, growth rate, revenue mix).

## When to Use This Skill

- **Daily**: Automated reconciliation of Creem.io payments received vs. Supabase active subscriptions vs. Tide Bank deposits
- **Weekly**: Revenue summary with MRR movement (new, expansion, contraction, churn) and IB commission accruals
- **Monthly**: Full revenue close  finalised MRR/ARR, IB commissions reconciled against broker reports, affiliate income confirmed, revenue mix analysis
- **On-Demand**: When any agent or founder queries current revenue, growth trajectory, or revenue attribution
- **Trigger-Based**: When Creem.io webhook fires payment_succeeded, subscription_created, subscription_cancelled, or refund_issued events

## Input Specification

### Required Data Sources
1. **Creem.io Subscription Data** (via CREEM_API_KEY):
   - Active subscriptions: customer_id, plan (Starter/Pro/Hedger), amount (//), currency, status, created_at, current_period_start, current_period_end
   - Payment events: payment_succeeded, payment_failed, refund_issued, chargeback
   - Subscription lifecycle: subscription_created, subscription_updated (upgrade/downgrade), subscription_cancelled
   
2. **Supabase User Records** (via SUPABASE_URL, SUPABASE_KEY):
   - Table: users  id, email, subscription_tier, subscription_status, creem_customer_id, created_at
   - Table: subscriptions  user_id, plan, status, start_date, end_date, creem_subscription_id
   - Table: roker_accounts  user_id, broker (vantage/blackbull), account_id, ib_tag, created_at

3. **Tide Bank Transactions** (via TIDE_API_KEY):
   - Inbound payments: date, amount, reference, counterparty (Creem.io payouts, broker commission payments)
   - Filter by: payment type (FASTER_PAYMENT, DIRECT_CREDIT, INTERNATIONAL), date range, amount range
   
4. **Broker IB Portals** (via VANTAGE_IB_CREDENTIALS, BLACKBULL_IB_CREDENTIALS):
   - Commission reports: period, referred_client_id, lots_traded, commission_per_lot, total_commission, asset_class
   - Payment confirmations: payout date, amount, payment method

5. **Affiliate Dashboards** (manual or API):
   - FundingPips: referral clicks, conversions, commission earned
   - Heron Copier: referred subscriptions, revenue share

### Input Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| period | string | Yes | Reporting period: daily, weekly, monthly, quarterly, ytd, custom |
| start_date | date | For custom | Start of custom reporting period (YYYY-MM-DD) |
| end_date | date | For custom | End of custom reporting period (YYYY-MM-DD) |
| revenue_stream | string | No | Filter: saas, ib_commissions, ffiliate, ll (default: ll) |
| granularity | string | No | daily, weekly, monthly (default matches period) |
| currency | string | No | Reporting currency: GBP or USD (default: GBP, converted at daily mid-market rate) |

## Step-by-Step Process

### Step 1: Pull Raw Revenue Data
1. Query Creem.io API for all payment events in the period:
   - GET /v1/payments?created[gte]={start}&created[lte]={end}&status=succeeded
   - Extract: subscription payments, one-time payments, refunds
2. Query Supabase for active subscription records:
   - SELECT * FROM subscriptions WHERE status = 'active' AND start_date <= '{end}'
   - Cross-reference with users table for tier distribution
3. Query Tide Bank for inbound transactions:
   - Filter Creem.io payouts (reference contains "CREEM" or known payout reference)
   - Filter broker commission deposits (reference contains "VANTAGE" or "BLACKBULL")
4. Pull broker commission reports from Vantage and BlackBull portals for the period

### Step 2: Reconcile Across Systems
1. **Creem  Supabase**: Match every Creem.io payment to a Supabase subscription record via creem_customer_id. Flag orphaned payments (in Creem but not Supabase) and missing payments (active in Supabase but no Creem payment).
2. **Creem  Tide**: Match Creem.io payout amounts against Tide Bank deposits. Creem typically batches payouts  reconcile total payout to sum of individual payments minus Creem processing fees.
3. **Brokers  Tide**: Match broker commission report totals to Tide Bank deposits from Vantage/BlackBull. Note FX conversion if commissions earned in USD but received in GBP.
4. **Discrepancy Log**: Any unmatched item goes into a discrepancy register with: source, amount, date, attempted match, days outstanding.

### Step 3: Calculate Revenue Metrics

#### SaaS Metrics
- **MRR Calculation**:
  - Count active subscriptions by tier from Supabase
  - MRR = (Starter_count  ) + (Pro_count  ) + (Hedger_count  )
  - Convert to GBP at period-end mid-market rate for reporting
- **MRR Movement**:
  - New MRR: Subscriptions created in period  plan price
  - Expansion MRR: Upgrades (e.g., StarterPro: +/mo, StarterHedger: +/mo, ProHedger: +/mo)
  - Contraction MRR: Downgrades
  - Churned MRR: Cancelled subscriptions  their plan price
  - Net New MRR = New + Expansion  Contraction  Churned
- **ARR** = MRR  12
- **Gross Churn Rate** = Churned MRR  Beginning-of-period MRR
- **Net Revenue Retention** = (Beginning MRR + Expansion  Contraction  Churn)  Beginning MRR

#### IB Commission Metrics
- Total lots traded by referred clients (Vantage + BlackBull, by asset class)
- Commission earned = Σ(lots  commission_rate_per_lot) per broker
- Commission received (cash in Tide) vs. commission accrued (reported but unpaid)
- Average commission per referred user per month
- Trend: lots traded MoM growth rate

#### Affiliate Metrics
- FundingPips referral conversions and commission
- Heron Copier referred subscriptions and revenue share
- Total affiliate revenue

### Step 4: Revenue Mix & Trend Analysis
1. Calculate revenue mix: % SaaS vs. % IB Commissions vs. % Affiliate
2. Calculate MoM and QoQ growth rates for each stream
3. Identify trends: is IB commission revenue growing faster than SaaS? Are certain tiers outperforming?
4. Flag risks: over-reliance on single revenue stream (>70% concentration)

### Step 5: Generate Output
1. Compile revenue dashboard with all metrics
2. Write narrative summary highlighting key movements, anomalies, and recommended actions
3. Update Google Sheets financial model with latest actuals
4. Log to Notion financial documentation

## Output Specification

### Revenue Dashboard (Structured JSON)
`json
{
  "period": "2026-01",
  "currency": "GBP",
  "fx_rate_usd_gbp": 0.79,
  "saas_revenue": {
    "mrr_gbp": 0,
    "arr_gbp": 0,
    "subscribers": {
      "free": 0,
      "starter": 0,
      "pro": 0,
      "hedger": 0
    },
    "mrr_movement": {
      "new": 0,
      "expansion": 0,
      "contraction": 0,
      "churned": 0,
      "net_new": 0
    },
    "gross_churn_rate": 0.0,
    "net_revenue_retention": 0.0
  },
  "ib_commissions": {
    "vantage": { "lots": 0, "commission_usd": 0, "commission_gbp": 0 },
    "blackbull": { "lots": 0, "commission_usd": 0, "commission_gbp": 0 },
    "total_gbp": 0,
    "accrued_unpaid_gbp": 0
  },
  "affiliate_revenue": {
    "fundingpips_gbp": 0,
    "heron_copier_gbp": 0,
    "total_gbp": 0
  },
  "total_revenue_gbp": 0,
  "revenue_mix": {
    "saas_pct": 0.0,
    "ib_pct": 0.0,
    "affiliate_pct": 0.0
  },
  "reconciliation": {
    "fully_reconciled": true,
    "discrepancies": []
  }
}
`

### Narrative Summary (Markdown)
- Executive summary (3 sentences)
- MRR movement waterfall explanation
- IB commission performance vs. prior period
- Revenue mix shift analysis
- Risks and action items

## API & Platform Requirements

| Platform | Endpoint / Resource | Auth | Rate Limits |
|----------|---------------------|------|-------------|
| Creem.io | /v1/payments, /v1/subscriptions, /v1/customers | Bearer CREEM_API_KEY | Per Creem.io plan |
| Supabase | subscriptions, users, roker_accounts tables | SUPABASE_URL + SUPABASE_KEY (service role) | 1000 req/s |
| Tide Bank | /v1/transactions, /v1/accounts/balance | OAuth 2.0 via TIDE_API_KEY | Per Tide API terms |
| Vantage IB | Commission reports portal | VANTAGE_IB_CREDENTIALS | Session-based |
| BlackBull IB | Commission reports portal | BLACKBULL_IB_CREDENTIALS | Session-based |
| Google Sheets | Sheets API v4 | GOOGLE_SHEETS_API_KEY | 100 req/100s |

## Quality Checks

1. **Reconciliation Completeness**: Every Creem.io payment has a matching Supabase subscription AND a corresponding Tide Bank deposit (within payout batch). Discrepancy count must reach zero within 7 days of period close.
2. **MRR Accuracy**: MRR calculated from Supabase active subscriptions must match Creem.io recurring revenue report within 1% tolerance (difference attributable to mid-cycle changes).
3. **IB Commission Verification**: Commission totals from broker portal exports must match Tide Bank deposits within one reporting cycle. Any variance >£50 flagged for investigation.
4. **FX Consistency**: All USDGBP conversions use the same mid-market rate source (e.g., ECB reference rate) for the period. Rate documented in output.
5. **Timeliness**: Daily reconciliation completed by 09:00 GMT. Monthly close completed by 5th business day.
6. **Audit Trail**: Every revenue figure traceable to source transaction ID (Creem payment_id, Tide transaction_id, broker report reference).
7. **Trend Sanity Check**: If MRR changes by >20% MoM, verify against subscription events  sudden movements likely indicate data error or one-off event.
