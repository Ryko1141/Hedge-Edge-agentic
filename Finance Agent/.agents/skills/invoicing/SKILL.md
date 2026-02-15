---
name: invoicing
description: |
  Generate, send, and track invoices for all Hedge Edge billable activities. Manage Creem.io automated subscription invoices, produce manual invoices for enterprise or custom deals, track payment status via Tide Bank, handle overdue payment follow-ups, and maintain HMRC-compliant invoice numbering with a full audit trail.
---

# Invoicing

## Objective

Ensure every Hedge Edge revenue event has a corresponding valid invoice that meets HMRC requirements, every invoice is tracked to payment receipt, and overdue invoices are systematically followed up. Maintain a sequential, gap-free invoice numbering system and a complete audit trail from invoice generation to cash collection in Tide Bank.

## When to Use This Skill

- **Automatic (Creem.io)**: Creem.io generates subscription invoices automatically  this skill monitors their completeness and correctness
- **On-Demand**: When a manual invoice is needed (enterprise deal, custom hedging setup, consulting, refund credit note)
- **Monthly**: Reconcile all invoices issued vs. payments received. Produce aged debtor report.
- **Trigger-Based**: When a Creem.io payment fails (invoice unpaid), when a customer requests an invoice copy, when a new enterprise/custom deal is closed by Sales Agent

## Input Specification

### Required Data Sources
1. **Creem.io** (via CREEM_API_KEY):
   - Automated invoices: invoice_id, customer_id, amount, currency, status (paid/unpaid/void), issued_date, due_date, line_items
   - Payment links and hosted invoice pages
   
2. **Supabase** (via SUPABASE_URL, SUPABASE_KEY):
   - Table: invoices  invoice_number, type (subscription/manual/credit_note), customer_id, amount, currency, vat_amount, status, issued_date, due_date, paid_date, tide_transaction_id, creem_invoice_id
   - Table: users  customer billing details (name, email, company, address, VAT number if applicable)

3. **Tide Bank** (via TIDE_API_KEY):
   - Inbound payments matched to invoices for payment confirmation
   
4. **Google Sheets** (via GOOGLE_SHEETS_API_KEY):
   - Invoice register / log for accounting integration

### Input Parameters (Manual Invoice)
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| customer_id | string | Yes | Supabase user ID or manual customer reference |
| customer_name | string | Yes | Full legal name or company name |
| customer_email | string | Yes | Email for invoice delivery |
| customer_address | string | Yes for VAT invoices | Billing address |
| customer_vat_number | string | No | Customer's VAT number (for B2B EU/UK) |
| line_items | array | Yes | [{description, quantity, unit_price, vat_rate}] |
| currency | string | No | GBP or USD (default: USD for SaaS) |
| due_days | integer | No | Payment terms in days (default: 14) |
| notes | string | No | Additional notes on invoice |

## Step-by-Step Process

### Step 1: Invoice Number Generation
1. Hedge Edge invoice numbering format: HE-{YYYY}-{NNNNN}
   - Example: HE-2026-00001, HE-2026-00002
   - Sequential, gap-free within each calendar year
   - Counter stored in Supabase: SELECT MAX(invoice_number) FROM invoices WHERE year = 2026
2. For credit notes: HE-CN-{YYYY}-{NNNNN}
3. Creem.io auto-invoices: store Creem invoice_id in creem_invoice_id field, assign Hedge Edge invoice number as wrapper reference

### Step 2: Invoice Content (HMRC Compliance)
All invoices must contain (per HMRC VAT guidelines and UK invoicing requirements):
1. **Hedge Edge Details**:
   - Company: Hedge Edge Ltd
   - Address: Office 14994, 182-184 High Street North, East Ham, London, E6 2JA
   - Company Registration Number (if applicable)
   - VAT Registration Number (when registered  threshold £85K)
2. **Customer Details**: Name, address, VAT number (if B2B)
3. **Invoice Details**:
   - Unique invoice number (HE-YYYY-NNNNN)
   - Issue date
   - Due date (issue date + due_days)
   - Supply date (date service rendered)
4. **Line Items**: Description, quantity, unit price, VAT rate, line total
5. **Totals**:
   - Subtotal (ex-VAT)
   - VAT amount (if applicable  20% standard rate, or 0% for exports/non-UK digital services)
   - Total (inc-VAT)
6. **Payment Details**:
   - Tide Bank account details (sort code, account number) for bank transfer
   - Creem.io payment link (if applicable)
   - Payment reference: invoice number

### Step 3: VAT Treatment
Determine correct VAT treatment per customer:

| Customer Location | Customer Type | VAT Treatment |
|------------------|---------------|---------------|
| UK | B2C | Charge 20% VAT (if VAT registered) |
| UK | B2B | Charge 20% VAT (if VAT registered) |
| EU | B2C | UK VAT or OSS (depending on registration) |
| EU | B2B | Reverse charge (0%  customer self-accounts) |
| Non-EU | B2C | Outside scope (0%) |
| Non-EU | B2B | Outside scope (0%) |

Note: Most Hedge Edge customers are individual prop-firm traders (B2C). SaaS delivered digitally = service for VAT purposes.

### Step 4: Invoice Generation & Delivery
1. **Subscription Invoices (Automated)**:
   - Creem.io generates and delivers to customer email
   - Finance Agent pulls invoice data via API, assigns HE invoice number, stores in Supabase
2. **Manual Invoices**:
   - Generate invoice PDF using template (company details pre-populated)
   - Store in Supabase with all metadata
   - Deliver to customer via email
   - Log in Google Sheets invoice register
3. **Credit Notes**:
   - Reference original invoice number
   - Negative line items for refunded amounts
   - Adjust VAT accordingly
   - Store and deliver same as invoices

### Step 5: Payment Tracking
1. For each outstanding invoice, check Tide Bank for matching inbound payment:
   - Match by: amount (exact), reference (invoice number), counterparty, date (within due period)
   - Partial payments: track remaining balance, update invoice status to partially_paid
2. Invoice statuses: draft  issued  paid / partially_paid / overdue / oid / written_off
3. Transition rules:
   - issued  overdue: Automatically when current_date > due_date and status  paid
   - overdue  paid: When matching Tide payment received
   - issued/overdue  oid: Manual action (e.g., duplicate invoice)

### Step 6: Overdue Invoice Management
1. **Day 1 overdue**: Automated gentle reminder email
2. **Day 7 overdue**: Second reminder with updated payment link
3. **Day 14 overdue**: Escalation to Sales Agent for personal follow-up
4. **Day 30 overdue**: Final demand letter, consider subscription suspension
5. **Day 60 overdue**: Write-off consideration, escalate to founders

### Step 7: Aged Debtor Report
Produce monthly:
| Ageing Bucket | Invoice Count | Total GBP |
|--------------|---------------|-----------|
| Current (not yet due) | | |
| 114 days overdue | | |
| 1530 days overdue | | |
| 3160 days overdue | | |
| 60+ days overdue | | |

## Output Specification

### Invoice Record (Structured JSON)
`json
{
  "invoice_number": "HE-2026-00001",
  "type": "subscription",
  "customer": {
    "id": "user_abc123",
    "name": "John Trader",
    "email": "john@example.com"
  },
  "issued_date": "2026-02-01",
  "due_date": "2026-02-15",
  "line_items": [
    {
      "description": "Hedge Edge Pro Plan - February 2026",
      "quantity": 1,
      "unit_price_usd": 30.00,
      "vat_rate": 0.00,
      "line_total_usd": 30.00
    }
  ],
  "subtotal_usd": 30.00,
  "vat_usd": 0.00,
  "total_usd": 30.00,
  "status": "paid",
  "payment": {
    "date": "2026-02-01",
    "method": "creem",
    "creem_payment_id": "pay_xyz",
    "tide_transaction_id": "txn_abc"
  }
}
`

### Monthly Invoicing Summary
- Total invoices issued (count and value)
- Total collected vs. outstanding
- Aged debtor breakdown
- Credit notes issued
- Overdue actions taken

## API & Platform Requirements

| Platform | Endpoint / Resource | Auth | Purpose |
|----------|---------------------|------|---------|
| Creem.io | /v1/invoices, /v1/payments | Bearer CREEM_API_KEY | Auto-invoice data, payment status |
| Supabase | invoices, users tables | SUPABASE_URL + SUPABASE_KEY | Invoice records, customer data |
| Tide Bank | /v1/transactions (inbound) | TIDE_API_KEY | Payment matching |
| Google Sheets | Invoice register sheet | GOOGLE_SHEETS_API_KEY | Accounting log |
| Notion | Invoice templates, process docs | NOTION_API_KEY | Documentation |

## Quality Checks

1. **Sequential Numbering**: No gaps in HE-YYYY-NNNNN sequence. Validated on each invoice creation. Voided invoices retain their number (never reused).
2. **HMRC Compliance**: Every invoice contains all mandatory fields per HMRC guidelines. Validated via checklist before issue.
3. **Payment Matching Accuracy**: 98% of invoice payments auto-matched to Tide Bank transactions. Unmatched items resolved within 5 business days.
4. **Timeliness**: Subscription invoices synced from Creem.io within 24 hours of payment. Manual invoices issued within 2 business days of request.
5. **Aged Debtor Health**: No invoice >30 days overdue without documented follow-up action. Overdue amount <5% of total monthly billing.
6. **Credit Note Traceability**: Every credit note references the original invoice number and has an approved reason (refund, billing error, goodwill).
7. **Data Consistency**: Invoice totals in Supabase match Creem.io totals and tie to revenue tracking skill figures. Cross-check monthly.
