---
name: ib-commission-tracking
description: |
  Monitor, reconcile, and forecast Introducing Broker commissions from Vantage Markets and BlackBull Markets. Track referred Hedge Edge client trading volumes, calculate expected per-lot rebates by asset class, reconcile against broker commission reports and Tide Bank deposits, chase discrepancies, and model commission revenue projections based on user growth and trading activity.
---

# IB Commission Tracking

## Objective

Maximise and accurately account for Hedge Edge's second revenue stream: Introducing Broker (IB) commissions. Every standard lot traded by a Hedge Edge-referred client on Vantage or BlackBull generates a per-lot rebate. This skill ensures every rebatable lot is tracked, every commission is reported correctly by the broker, every payment is received in Tide Bank, and projections inform business decisions on user acquisition and broker partnership optimisation.

## When to Use This Skill

- **Daily**: Monitor referred client trading activity where real-time data is available (API or portal scraping)
- **Weekly**: Estimate accrued commissions based on trading volume, cross-reference with any interim broker reports
- **Monthly**: Full commission reconciliation  broker reports received, cross-checked against internal tracking, matched to Tide Bank deposits
- **On-Demand**: When Business Strategist Agent needs IB revenue projections for financial models, or Sales Agent needs commission data for partnership discussions
- **Trigger-Based**: When broker commission report is published, when Tide Bank receives a deposit from Vantage or BlackBull

## Input Specification

### Required Data Sources
1. **Vantage Markets IB Portal** (via VANTAGE_IB_CREDENTIALS):
   - Commission report (monthly): client_id, account_number, asset_class, instrument, lots_traded, commission_rate, commission_earned, period
   - Referred client list: account_number, registration_date, status (active/dormant/closed), last_trade_date
   - Payment history: payout_date, amount_usd, payment_method, reference

2. **BlackBull Markets IB Portal** (via BLACKBULL_IB_CREDENTIALS):
   - Commission report (monthly): similar structure to Vantage
   - Referred client tracking
   - Payout records

3. **Supabase** (via SUPABASE_URL, SUPABASE_KEY):
   - Table: roker_accounts  user_id, broker (vantage/blackbull), account_id, ib_tag, status, created_at, linked_at
   - Table: ib_commissions  id, broker, period, client_account_id, lots, commission_usd, commission_gbp, status (accrued/received/disputed), broker_report_ref, tide_transaction_id
   - Table: users  to join broker accounts with Hedge Edge user profiles

4. **Tide Bank** (via TIDE_API_KEY):
   - Inbound transactions matching broker payout references
   - FX rate applied on receipt (USDGBP)

### Input Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| period | string | Yes | monthly, quarterly, ytd, custom |
| broker | string | No | antage, lackbull, ll (default: ll) |
| start_date | date | For custom | YYYY-MM-DD |
| end_date | date | For custom | YYYY-MM-DD |
| include_projections | boolean | No | Whether to generate forward-looking commission estimates (default: true) |

## Step-by-Step Process

### Step 1: Referred Client Inventory
1. Pull referred client list from each broker portal:
   - Vantage: All accounts under Hedge Edge IB tag
   - BlackBull: All accounts under Hedge Edge IB tag
2. Cross-reference against Supabase roker_accounts table:
   - Identify any referred clients in broker portal NOT in Supabase  data gap (user signed up via IB link but didn't complete Hedge Edge registration)
   - Identify any Supabase broker accounts NOT in broker portal  possible delisted or closed account
3. Calculate referred client metrics:
   - Total referred clients per broker
   - Active traders (traded in last 30 days) vs. dormant
   - New referrals this period
   - Client retention rate: active now  total ever referred

### Step 2: Trading Volume Analysis
1. From broker commission reports, extract trading volume per client:
   - Total lots traded by asset class:
     - **Forex (FX)**: Major pairs, minor pairs, exotics  typical rebate /lot
     - **Indices**: US30, US500, UK100, GER40  typical rebate /lot
     - **Commodities**: Gold (XAUUSD), Oil  typical rebate /lot
     - **Crypto**: BTCUSD, ETHUSD  variable rebate
2. Aggregate volumes:
   - Total lots per broker per asset class
   - Average lots per active client per month
   - Volume trend: MoM growth/decline
3. Flag anomalies:
   - Individual client trading >100 lots/month (high-volume trader  valuable, ensure retention)
   - Sudden drop in client activity (>50% decline MoM  possible churn signal)
   - New high-volume trader (>20 lots in first month  potential institutional/corporate)

### Step 3: Commission Calculation
1. For each client-period-asset class combination:
   - Expected commission = lots_traded  commission_rate_per_lot
   - Commission rates from IB agreement:
     - Vantage: Forex /lot, Indices /lot, Commodities /lot (exact rates from IB agreement)
     - BlackBull: Similar tiered structure
2. Aggregate:
   - Total expected commission per broker (USD)
   - Convert to GBP at period mid-market rate
3. Compare expected (calculated) vs. reported (from broker):
   - Variance >2%  flag for investigation
   - Common discrepancy causes: different lot-size definitions (standard vs. mini), excluded instruments, volume tier changes

### Step 4: Commission Reconciliation
1. **Broker Report  Internal Calculation**: Compare broker-reported commission totals against Step 3 expected totals
2. **Broker Report  Tide Bank Deposit**: Match broker payout to Tide Bank inbound transaction
   - Vantage pays monthly via international transfer (USD or GBP)
   - BlackBull pays monthly via wire
   - Allow for FX conversion differences (2% tolerance on USD payouts received in GBP)
   - Allow for payout timing: commission for month N typically received by month N+1 day 1530
3. **Reconciliation Status per Period**:
   - **Fully Reconciled**: Reported = Expected (2%), and Paid = Reported (FX tolerance), and Received in Tide
   - **Partially Reconciled**: One or more checks failing
   - **Unreconciled**: Broker report not yet received, or payment not yet deposited
4. Log reconciliation status in Supabase ib_commissions table

### Step 5: Commission Projections
1. **Short-term (next 3 months)**: Based on current active client count  average lots/client/month  commission rate
   - Apply growth rate: new referrals per month (from Sales Agent pipeline data)
   - Apply churn rate: dormancy probability based on historical patterns
2. **Medium-term (612 months)**: Factor in user growth trajectory (current ~500 beta users, target X)
   - Assume conversion rate from Hedge Edge user  IB-referred broker account (typically 2040%)
   - Assume lot-per-user distribution based on historical data
3. **Scenario Analysis**:
   - **Base case**: Current growth and activity rates sustained
   - **Bull case**: 2 referral rate + 20% higher lots/user (expanded hedging strategies)
   - **Bear case**: Growth stalls, 30% of active traders go dormant

### Step 6: Generate Output
1. Commission dashboard with actuals and reconciliation status
2. Narrative on broker performance comparison
3. Projections for financial model input
4. Action items: chase unpaid commissions, investigate discrepancies, highlight top-performing referrals

## Output Specification

### IB Commission Dashboard (Structured JSON)
`json
{
  "period": "2026-01",
  "currency": "GBP",
  "fx_rate_usd_gbp": 0.79,
  "vantage": {
    "referred_clients_total": 0,
    "referred_clients_active": 0,
    "lots_traded": {
      "forex": 0,
      "indices": 0,
      "commodities": 0,
      "crypto": 0,
      "total": 0
    },
    "commission_expected_usd": 0,
    "commission_reported_usd": 0,
    "commission_received_gbp": 0,
    "variance_pct": 0,
    "reconciliation_status": "fully_reconciled",
    "avg_commission_per_active_client_usd": 0
  },
  "blackbull": {
    "referred_clients_total": 0,
    "referred_clients_active": 0,
    "lots_traded": { "forex": 0, "indices": 0, "commodities": 0, "crypto": 0, "total": 0 },
    "commission_expected_usd": 0,
    "commission_reported_usd": 0,
    "commission_received_gbp": 0,
    "variance_pct": 0,
    "reconciliation_status": "fully_reconciled",
    "avg_commission_per_active_client_usd": 0
  },
  "combined": {
    "total_commission_gbp": 0,
    "total_accrued_unpaid_gbp": 0,
    "mom_growth_pct": 0
  },
  "projections": {
    "next_month_base_gbp": 0,
    "next_quarter_base_gbp": 0,
    "next_quarter_bull_gbp": 0,
    "next_quarter_bear_gbp": 0
  },
  "action_items": []
}
`

### Narrative Report
- Commission performance summary (Vantage vs. BlackBull)
- Referred client activity trends
- Reconciliation status and outstanding items
- Projection confidence level and assumptions
- Recommendations: broker to prioritise, clients at risk of churn, commission rate renegotiation triggers

## API & Platform Requirements

| Platform | Endpoint / Resource | Auth | Purpose |
|----------|---------------------|------|---------|
| Vantage IB Portal | Commission reports, client list | VANTAGE_IB_CREDENTIALS | Monthly commission data, referred clients |
| BlackBull IB Portal | Commission reports, client list | BLACKBULL_IB_CREDENTIALS | Monthly commission data, referred clients |
| Supabase | roker_accounts, ib_commissions, users | SUPABASE_URL + SUPABASE_KEY | Internal tracking, reconciliation log |
| Tide Bank | /v1/transactions (inbound from brokers) | TIDE_API_KEY | Commission deposit verification |
| Google Sheets | IB commission model | GOOGLE_SHEETS_API_KEY | Projections, historical trends |

## Quality Checks

1. **Client Count Integrity**: Referred client count in broker portal matches Supabase roker_accounts count per broker (5% tolerance for timing delays).
2. **Commission Accuracy**: Expected commission (lots  rate) matches broker-reported commission within 2%. Larger variances investigated and documented within 5 business days.
3. **Payment Timeliness**: Commission payments tracked against broker SLA (typically 1530 days after period end). Overdue payments chased at day 31 and escalated at day 45.
4. **FX Reconciliation**: USD commission  GBP deposit reconciled with documented FX rate. Variance >3% flagged (may indicate bank applied unfavourable rate or commission was adjusted).
5. **Projection Reasonableness**: Projected commissions back-tested against 3 months of actuals. If projection error >25%, recalibrate model assumptions.
6. **Data Completeness**: No gaps in monthly commission data. If broker report delayed, accrual posted based on estimated volume, reversed when actual received.
7. **Supabase Sync**: Every commission record in Supabase has: broker, period, amount_usd, amount_gbp, status, broker_report_ref. No orphaned records.
