---
name: financial-reporting
description: |
  Produce comprehensive financial reports for Hedge Edge  monthly profit-and-loss statements, quarterly management accounts, annual financial statements, cash-flow statements, and board-ready financial packs. Include variance analysis, KPI dashboards, and forward-looking commentary. Ensure compliance with UK GAAP (FRS 105 micro-entity or FRS 102 Section 1A small company regime).
---

# Financial Reporting

## Objective

Deliver accurate, timely, and insightful financial reports that give Hedge Edge's founders and stakeholders complete visibility into the business's financial health. Every report must tell a story: what happened, why it happened, and what to do next. Reports comply with UK GAAP and are structured to support future audit readiness and investor due diligence.

## When to Use This Skill

- **Monthly (by 5th business day)**: Monthly management accounts  P&L, balance sheet, cash flow, KPI dashboard
- **Quarterly**: Quarterly business review pack  detailed analysis, trend commentary, reforecast
- **Annually**: Annual financial statements for Companies House filing (due 9 months after year-end), Corporation Tax computation
- **On-Demand**: When founders need financial data for investor conversations, partnership negotiations, or strategic decisions
- **Trigger-Based**: When revenue or expense anomalies detected by other skills require contextual financial analysis

## Input Specification

### Required Data Sources
1. **Revenue Tracking Skill Output**: MRR, ARR, revenue by stream, reconciliation status
2. **Expense Management Skill Output**: Categorised expenses, budget vs. actual, burn rate
3. **IB Commission Tracking Skill Output**: Commission actuals, accruals, projections
4. **Invoicing Skill Output**: Invoiced amounts, collections, aged debtors
5. **Tide Bank** (via TIDE_API_KEY): Bank balance, transaction history (source of truth for cash position)
6. **Google Sheets** (via GOOGLE_SHEETS_API_KEY): Financial model, budget, prior period actuals
7. **Supabase** (via SUPABASE_URL, SUPABASE_KEY): Operational metrics (user count, subscriptions)

### Input Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| report_type | string | Yes | monthly_pnl, quarterly_pack, nnual_accounts, cash_flow, kpi_dashboard, 	ax_computation, custom |
| period | string | Yes | e.g., 2026-01, 2026-Q1, 2025-FY |
| comparatives | string | No | prior_period, prior_year, udget, ll (default: ll) |
| format | string | No | json, markdown, pdf, sheets (default: markdown) |

## Step-by-Step Process

### Step 1: Data Collection & Consolidation
1. Pull outputs from all finance skills (revenue, expense, IB, invoicing) for the period
2. Query Tide Bank for opening and closing balances
3. Pull prior period and budget data from Google Sheets
4. Pull operational metrics from Supabase (subscriber count, user registrations)
5. Validate data completeness: all sources reporting, no missing periods

### Step 2: Profit & Loss Statement (Monthly/Quarterly)
Construct P&L following UK GAAP structure:

`
HEDGE EDGE LTD
PROFIT AND LOSS ACCOUNT
For the period ended [DD Month YYYY]

TURNOVER (Revenue)
  SaaS Subscription Revenue                    £X,XXX
  IB Commission Revenue (Vantage)              £X,XXX
  IB Commission Revenue (BlackBull)            £X,XXX
  Affiliate Revenue                            £X,XXX
                                              -------
  TOTAL TURNOVER                               £XX,XXX

COST OF SALES
  Payment Processing Fees (Creem.io)           (£X,XXX)
  Infrastructure Costs (Supabase, hosting)     (£X,XXX)
                                              -------
  TOTAL COST OF SALES                          (£X,XXX)

GROSS PROFIT                                   £XX,XXX
  Gross Margin: XX.X%

ADMINISTRATIVE EXPENSES
  Marketing & Advertising                      (£X,XXX)
  Software Licenses & Development Tools        (£X,XXX)
  Banking & Payment Fees (Tide)                (£XXX)
  Professional Fees (accountant, legal)        (£XXX)
  Office & Administration                      (£XXX)
  Depreciation / Amortisation                  (£XXX)
  Other Operating Expenses                     (£XXX)
                                              -------
  TOTAL ADMINISTRATIVE EXPENSES                (£X,XXX)

OPERATING PROFIT / (LOSS)                      £X,XXX
  Operating Margin: XX.X%

Interest Receivable / (Payable)                £XX

PROFIT / (LOSS) BEFORE TAX                     £X,XXX

Corporation Tax (25%)                          (£XXX)

PROFIT / (LOSS) AFTER TAX                      £X,XXX
`

### Step 3: Balance Sheet (Quarterly/Annual)
`
HEDGE EDGE LTD
BALANCE SHEET
As at [DD Month YYYY]

FIXED ASSETS
  Intangible Assets (software development)     £X,XXX
  Tangible Assets (equipment)                  £XXX
                                              -------
                                               £X,XXX
CURRENT ASSETS
  Trade Debtors (outstanding invoices)         £X,XXX
  Accrued Income (IB commissions accrued)      £X,XXX
  Prepayments                                  £XXX
  Cash at Bank (Tide Bank)                     £XX,XXX
                                              -------
                                               £XX,XXX

CURRENT LIABILITIES
  Trade Creditors                              (£XXX)
  Accruals                                     (£XXX)
  Deferred Revenue (prepaid subscriptions)     (£X,XXX)
  VAT Payable                                  (£XXX)
  Corporation Tax Payable                      (£XXX)
                                              -------
                                               (£X,XXX)

NET CURRENT ASSETS                             £XX,XXX

TOTAL ASSETS LESS CURRENT LIABILITIES          £XX,XXX

CAPITAL AND RESERVES
  Share Capital                                £XXX
  Retained Earnings                            £XX,XXX
                                              -------
  SHAREHOLDERS' FUNDS                          £XX,XXX
`

### Step 4: Cash Flow Statement
`
HEDGE EDGE LTD
CASH FLOW STATEMENT
For the period ended [DD Month YYYY]

OPERATING ACTIVITIES
  Profit / (Loss) before tax                   £X,XXX
  Adjustments for:
    Depreciation / Amortisation                £XXX
    (Increase)/Decrease in Debtors             (£XXX)
    Increase/(Decrease) in Creditors           £XXX
    Increase/(Decrease) in Deferred Revenue    £XXX
                                              -------
  Net Cash from Operating Activities           £X,XXX

INVESTING ACTIVITIES
  Purchase of Fixed Assets                     (£XXX)
  Software Development Costs (capitalised)     (£XXX)
                                              -------
  Net Cash used in Investing Activities        (£XXX)

FINANCING ACTIVITIES
  Share Capital Issued                         £XXX
  Dividends Paid                               (£XXX)
                                              -------
  Net Cash from Financing Activities           £XXX

NET INCREASE / (DECREASE) IN CASH              £X,XXX
Cash at Beginning of Period                    £XX,XXX
Cash at End of Period                          £XX,XXX
  Reconciled to Tide Bank balance: 
`

### Step 5: KPI Dashboard
Compile key performance indicators:

| Category | KPI | Current | Prior Period | Change | Target |
|----------|-----|---------|-------------|--------|--------|
| Revenue | MRR (GBP) | | | | |
| Revenue | ARR (GBP) | | | | |
| Revenue | MoM MRR Growth | | | | >10% |
| Revenue | Net Revenue Retention | | | | >100% |
| Revenue | IB Commission (GBP) | | | | |
| Customers | Total Subscribers | | | | |
| Customers | Paying Subscribers | | | | |
| Customers | Free-to-Paid Conversion | | | | >5% |
| Customers | Monthly Churn Rate | | | | <5% |
| Unit Economics | ARPU (GBP) | | | | |
| Unit Economics | LTV (GBP) | | | | |
| Unit Economics | CAC (GBP) | | | | |
| Unit Economics | LTV:CAC Ratio | | | | >3:1 |
| Unit Economics | Payback Period (months) | | | | <12 |
| Cash | Bank Balance (GBP) | | | | |
| Cash | Monthly Burn Rate | | | | |
| Cash | Runway (months) | | | | >12 |
| Profitability | Gross Margin | | | | >70% |
| Profitability | Operating Margin | | | | |
| Profitability | Rule of 40 | | | | >40 |

### Step 6: Variance Analysis
For each P&L line item, calculate:
1. **vs. Budget**: Actual  Budget, Variance %, Commentary on cause
2. **vs. Prior Period**: Actual  Prior, % Change, Commentary on trend
3. **vs. Prior Year** (if available): YoY growth rate
4. Material variances (>10% or >£500) require a narrative explanation:
   - Root cause analysis
   - Whether variance is one-off or recurring
   - Recommended action (if overspend) or opportunity (if upside)

### Step 7: UK Tax Computations
1. **Corporation Tax (Annual)**:
   - Accounting profit before tax
   - Add back: disallowable expenses (entertaining, penalties, depreciation)
   - Deduct: capital allowances (AIA on qualifying assets), R&D enhanced deduction (if eligible)
   - Taxable profit
   - Tax at 25% (or 19% if small profits £50K, marginal relief £50K£250K)
   - Payment due: 9 months + 1 day after accounting period end
2. **VAT Return (Quarterly, if registered)**:
   - Box 1: VAT due on sales (output tax)
   - Box 2: VAT due on acquisitions from EU
   - Box 3: Total VAT due (Box 1 + Box 2)
   - Box 4: VAT reclaimed on purchases (input tax)
   - Box 5: Net VAT (Box 3  Box 4)  amount to pay/reclaim
   - Box 6: Total sales (ex-VAT)
   - Box 7: Total purchases (ex-VAT)
   - Submit via MTD-compatible software using HMRC API

### Step 8: Report Assembly & Distribution
1. Compile all sections into unified report format
2. Generate executive summary (1 page, suitable for founders/board)
3. Store in Notion financial documentation
4. Update Google Sheets with latest actuals and comparatives
5. Flag critical items requiring immediate attention

## Output Specification

### Monthly Management Pack Contents
1. Executive Summary (1 page)
2. Profit & Loss Statement (with budget and prior period comparatives)
3. Cash Flow Summary
4. KPI Dashboard
5. Revenue Deep-Dive (from revenue-tracking skill)
6. Expense Analysis (from expense-management skill)
7. IB Commission Report (from ib-commission-tracking skill)
8. Variance Commentary
9. Forward-Looking: 3-month cash flow forecast, revenue projection
10. Action Items

### Reporting Calendar
| Report | Frequency | Due Date | Recipient |
|--------|-----------|----------|-----------|
| Monthly Management Accounts | Monthly | 5th business day | Founders |
| Quarterly Review Pack | Quarterly | 10th business day of quarter | Founders, advisors |
| VAT Return | Quarterly | 1 month + 7 days after quarter end | HMRC |
| Annual Financial Statements | Annual | 9 months after year-end | Companies House |
| Corporation Tax Return | Annual | 12 months after year-end | HMRC |
| Corporation Tax Payment | Annual | 9 months + 1 day after year-end | HMRC |

## API & Platform Requirements

| Platform | Endpoint / Resource | Auth | Purpose |
|----------|---------------------|------|---------|
| Tide Bank | /v1/accounts/balance, /v1/transactions | TIDE_API_KEY | Cash position, transaction data |
| Supabase | All finance tables | SUPABASE_URL + SUPABASE_KEY | Operational metrics |
| Google Sheets | Financial model workbook | GOOGLE_SHEETS_API_KEY | Budget, actuals, models |
| Notion | Financial reports database | NOTION_API_KEY | Report storage and distribution |
| HMRC | MTD VAT API, Corporation Tax API | HMRC_API_KEY | Tax filing |
| Xero/FreeAgent | Chart of accounts, journals | ACCOUNTING_API_KEY | Future bookkeeping integration |

## Quality Checks

1. **Balance Sheet Balance**: Total Assets = Total Liabilities + Shareholders' Funds. If not, investigate immediately  never publish an unbalanced balance sheet.
2. **Cash Reconciliation**: Cash flow statement ending balance = Tide Bank balance at period end. Variance must be zero.
3. **P&L Tie-Out**: Revenue in P&L = Revenue tracking skill total. Expenses in P&L = Expense management skill total. Any difference documented.
4. **Comparative Consistency**: Prior period figures in current report match the figures published in the prior period's report. No unexplained restatements.
5. **Tax Accuracy**: Corporation Tax computation tax rate matches current statutory rate (25% / 19%). VAT return figures reconcile to sales and purchase records.
6. **Timeliness**: Reports delivered by stated due dates. Monthly accounts by 5th business day, no exceptions.
7. **Completeness**: All sections populated. No "TBD" or placeholder values in published reports. Missing data flagged with estimate and basis stated.
8. **Narrative Quality**: Variance commentary explains root cause, not just restates the number. Every material variance has a "so what" and recommended action.
