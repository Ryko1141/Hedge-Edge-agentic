---
name: expense-management
description: |
  Categorise, track, and analyse all Hedge Edge business expenditure from Tide Bank transactions. Maintain budget vs. actual reporting, flag anomalous spending, identify cost optimisation opportunities, and ensure proper categorisation for UK tax purposes including allowable deductions, capital vs. revenue expenditure, and VAT reclaim eligibility.
---

# Expense Management

## Objective

Maintain complete control over every pound leaving Hedge Edge's Tide Bank account. Every expense must be categorised against the chart of accounts, tagged to a cost centre (Infrastructure, Marketing, Development, Operations, Tax), tracked against budget, and assessed for tax efficiency (allowable Corporation Tax deduction, VAT reclaimable, capital allowance eligibility).

## When to Use This Skill

- **Daily**: Auto-categorise new Tide Bank outbound transactions as they appear
- **Weekly**: Expense summary with budget vs. actual variance, flagging any spend >10% over budget category
- **Monthly**: Full expense close  all transactions categorised, supplier reconciliation complete, prepayments/accruals posted, budget reforecast if needed
- **On-Demand**: When any agent queries cost data, burn rate, or specific expense category
- **Trigger-Based**: When a Tide Bank transaction exceeds predefined thresholds (e.g., single transaction >£500, new payee detected)

## Input Specification

### Required Data Sources
1. **Tide Bank Transactions** (via TIDE_API_KEY):
   - Outbound payments: date, amount, reference, counterparty, payment_type (FASTER_PAYMENT, DIRECT_DEBIT, CARD_PAYMENT, STANDING_ORDER)
   - Pending transactions and scheduled payments
   - Account balance and available funds

2. **Budget Model** (via GOOGLE_SHEETS_API_KEY):
   - Monthly budget by category: Infrastructure, Marketing, Development, Operations, Tax & Compliance, Contingency
   - Annual budget with quarterly breakdown
   - Prior year actuals for trend comparison

3. **Supabase** (via SUPABASE_URL, SUPABASE_KEY):
   - Table: expenses  id, date, amount, category, subcategory, supplier, description, tide_transaction_id, vat_amount, receipt_url
   - Table: udgets  category, monthly_budget, ytd_budget, ytd_actual

### Input Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| period | string | Yes | daily, weekly, monthly, quarterly, ytd, custom |
| start_date | date | For custom | YYYY-MM-DD |
| end_date | date | For custom | YYYY-MM-DD |
| category | string | No | Filter by category, default: ll |
| flag_threshold | number | No | Flag individual transactions above this amount (default: £500) |

## Step-by-Step Process

### Step 1: Pull Tide Bank Outbound Transactions
1. Query Tide Bank API for all debit transactions in the period:
   - GET /v1/transactions?direction=OUTBOUND&from={start}&to={end}
2. Extract: date, amount, counterparty_name, reference, payment_type, transaction_id
3. Filter out internal transfers (e.g., savings pot movements) and tax payments (separate tracking)

### Step 2: Auto-Categorise Transactions
Apply rules-based categorisation using counterparty matching:

| Counterparty Pattern | Category | Subcategory | VAT Reclaimable |
|---------------------|----------|-------------|-----------------|
| Supabase / Vercel / AWS / Cloudflare | Infrastructure | Cloud Services | Yes (reverse charge on non-UK) |
| Google Ads / Meta / Facebook Ads | Marketing | Paid Advertising | Yes (if UK VAT registered) |
| Figma / GitHub / JetBrains / Cursor | Development | Software Licenses | Yes (reverse charge) |
| Companies House | Operations | Regulatory | No (exempt) |
| HMRC | Tax & Compliance | Tax Payment | No |
| Creem.io (fees) | Operations | Payment Processing | Yes |
| Tide (fees) | Operations | Banking Fees | Yes |
| Registered office service | Operations | Admin | Yes |
| Code-signing certificate | Development | Publishing | Yes |
| Domain registrar (Namecheap/Cloudflare) | Infrastructure | Domain & DNS | Yes |

For unrecognised counterparties:
1. Check transaction reference and amount against known recurring payments
2. Flag for manual review if no match  add to uncategorised queue
3. Learn from manual categorisation to improve future auto-matching

### Step 3: Budget vs. Actual Analysis
1. Pull budget figures from Google Sheets financial model
2. For each category, calculate:
   - **Actual Spend**: Sum of categorised transactions in period
   - **Budgeted Spend**: Monthly or period budget allocation
   - **Variance**: Actual  Budget (negative = underspend, positive = overspend)
   - **Variance %**: Variance  Budget  100
   - **YTD Actual vs. YTD Budget**: Cumulative tracking
3. Flag categories where:
   - Monthly spend >10% over budget  Amber alert
   - Monthly spend >25% over budget  Red alert
   - YTD spend trending to exceed annual budget  Forecast warning

### Step 4: Tax Categorisation
For each expense, determine:
1. **Corporation Tax**: Allowable deduction (revenue expenditure) vs. capital expenditure (capitalise and depreciate/claim Annual Investment Allowance)
   - Software subscriptions: Revenue expenditure, 100% deductible in year
   - Hardware >£500: Capital expenditure, AIA eligible
   - Marketing: Revenue expenditure, fully deductible
   - Legal/professional fees: Revenue expenditure (but note: company formation costs are NOT deductible)
2. **VAT Treatment** (if VAT registered):
   - UK suppliers with VAT: Reclaim input VAT
   - EU/non-UK digital services: Reverse charge mechanism  no VAT paid, self-assess
   - Exempt or out-of-scope: No VAT reclaim (e.g., bank charges, insurance)
3. **Receipt Compliance**: HMRC requires receipts for all business expenses. Flag any expense >£25 without an attached receipt/invoice.

### Step 5: Burn Rate & Runway Calculation
1. **Monthly Burn Rate** = Average monthly outflows over trailing 3 months
2. **Net Burn** = Monthly Burn  Monthly Revenue
3. **Runway** = Current Tide Bank Balance  Net Burn (in months)
4. **Runway Alert Thresholds**:
   - >12 months: Green (healthy)
   - 612 months: Amber (monitor, reduce discretionary spend)
   - 36 months: Red (cut non-essential, accelerate revenue)
   - <3 months: Critical (founder escalation, emergency measures)

### Step 6: Cost Optimisation Scan
1. Identify top 5 expense categories by spend
2. For each, compare:
   - MoM trend (growing, stable, declining)
   - Benchmarks for SaaS companies at similar stage (~500 users)
   - Alternative suppliers or plans that could reduce cost
3. Flag subscription services with low utilisation (e.g., paying for Pro plan when Basic suffices)
4. Identify duplicate or overlapping services

### Step 7: Generate Output
1. Compile expense dashboard
2. Write narrative highlighting overspend areas, optimisation opportunities, and runway status
3. Update Google Sheets budget tracker with actuals
4. Store categorised expenses in Supabase expenses table

## Output Specification

### Expense Dashboard (Structured JSON)
`json
{
  "period": "2026-01",
  "currency": "GBP",
  "total_expenses_gbp": 0,
  "by_category": {
    "infrastructure": { "actual": 0, "budget": 0, "variance": 0, "variance_pct": 0 },
    "marketing": { "actual": 0, "budget": 0, "variance": 0, "variance_pct": 0 },
    "development": { "actual": 0, "budget": 0, "variance": 0, "variance_pct": 0 },
    "operations": { "actual": 0, "budget": 0, "variance": 0, "variance_pct": 0 },
    "tax_compliance": { "actual": 0, "budget": 0, "variance": 0, "variance_pct": 0 }
  },
  "burn_rate": {
    "gross_monthly_burn_gbp": 0,
    "net_monthly_burn_gbp": 0,
    "runway_months": 0,
    "runway_status": "green"
  },
  "tax_summary": {
    "allowable_deductions_gbp": 0,
    "capital_expenditure_gbp": 0,
    "vat_reclaimable_gbp": 0,
    "receipts_missing_count": 0
  },
  "alerts": [],
  "uncategorised_transactions": []
}
`

### Narrative Report
- Expense summary with top categories
- Budget variance highlights (overspend/underspend)
- Burn rate trend and runway status
- Cost optimisation recommendations (specific, actionable)
- Missing receipts requiring attention

## API & Platform Requirements

| Platform | Endpoint / Resource | Auth | Purpose |
|----------|---------------------|------|---------|
| Tide Bank | /v1/transactions (outbound), /v1/accounts/balance | OAuth 2.0 TIDE_API_KEY | Raw transaction data |
| Google Sheets | Sheets API v4  Budget workbook | GOOGLE_SHEETS_API_KEY | Budget figures, actuals logging |
| Supabase | expenses, udgets tables | SUPABASE_URL + SUPABASE_KEY | Expense records, categorisation |
| Notion | Expense documentation pages | NOTION_API_KEY | Receipt storage, expense policies |

## Quality Checks

1. **Categorisation Coverage**: 95% of transactions auto-categorised within 24 hours. Uncategorised items resolved within 48 hours via manual review queue.
2. **Budget Accuracy**: Budget figures pulled from Google Sheets match the approved annual budget. Any manual overrides logged with justification.
3. **Receipt Compliance**: All expenses >£25 have an attached receipt/invoice. Missing receipts flagged and chased within 7 days. HMRC requires retention for 6 years.
4. **Reconciliation**: Total outbound Tide transactions = Sum of categorised expenses + Tax payments + Internal transfers. Zero unaccounted-for transactions.
5. **Burn Rate Realism**: Burn rate calculation excludes one-off items (e.g., annual subscriptions paid upfront)  normalise to monthly equivalent.
6. **VAT Accuracy**: Input VAT totals reconcile to VAT return Box 4 figure. Reverse charge amounts correctly self-assessed.
7. **Duplicate Detection**: No duplicate expense entries  each Tide transaction_id appears exactly once in the expenses table.
