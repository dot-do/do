# Financial Layer (Epic 11)

Business-as-Code financial operations with deep Stripe Connect integration.

## Purpose

The Financial Layer provides comprehensive financial management for Digital Objects:

- **Stripe Connect Foundation**: Multi-party payments, platform fees, connected accounts
- **Payment Processing**: One-time payments, captures, refunds with full lifecycle tracking
- **Subscription Management**: Recurring revenue with trials, upgrades, downgrades, cancellations
- **Transfers & Payouts**: Money movement between accounts and to external bank accounts
- **Double-Entry Accounting**: Full journal-based ledger with chart of accounts
- **Financial Reporting**: P&L statements, balance sheets, cash flow statements
- **Revenue Metrics**: MRR/ARR tracking, churn analysis, customer lifetime value

## Stripe Connect Setup and Onboarding

### Account Types

| Type | Use Case | Platform Control | User Experience |
|------|----------|------------------|-----------------|
| **Standard** | Full Stripe dashboard access | Low | Users manage their own Stripe |
| **Express** | Simplified onboarding | Medium | Stripe-hosted dashboard |
| **Custom** | Full white-label | High | Platform-controlled UI |

### Onboarding Flow

```
1. Create Connect Account
   POST /v1/accounts
   { type: 'express', capabilities: { card_payments: {requested: true} } }

2. Generate Account Link
   POST /v1/account_links
   { account: 'acct_xxx', type: 'account_onboarding', ... }

3. Redirect User to Onboarding
   User completes KYC, banking setup, terms acceptance

4. Handle Webhook Events
   account.updated - Check capabilities, onboarding status

5. Enable Charges & Payouts
   chargesEnabled: true, payoutsEnabled: true
```

### Webhook Events

| Event | Description | Action |
|-------|-------------|--------|
| `account.updated` | Account status changed | Update onboarding status |
| `account.application.authorized` | User authorized app | Enable features |
| `account.application.deauthorized` | User revoked access | Disable account |

## Payments and Subscriptions

### Payment Lifecycle

```
PaymentIntent Created
        |
        v
    requires_payment_method
        |
        v (user provides method)
    requires_confirmation
        |
        v (confirmation)
    requires_action (3DS, etc.)
        |
        v (action completed)
    processing
        |
        v
    succeeded -----> refunded (partial/full)
        |
        v
    captured (if capture_method: manual)
```

### Payment Processing

```typescript
// Create a payment
const payment = await financial.createPayment(1000, 'usd', {
  customerRef: 'https://example.com/customers/123',
  description: 'Monthly subscription',
  applicationFeeAmount: 100,  // Platform fee
  transferDestination: 'acct_xxx',  // Connected account
})

// Capture a held payment
await financial.capturePayment(paymentId)

// Refund
await financial.refundPayment(paymentId, 500)  // Partial refund
```

### Subscription Management

```typescript
// Create subscription
const subscription = await financial.createSubscription(
  customerRef,
  'price_monthly_pro'
)

// Cancel at period end (graceful)
await financial.cancelSubscription(subscriptionId, true)

// Cancel immediately
await financial.cancelSubscription(subscriptionId, false)
```

### Subscription States

| Status | Description | Billing |
|--------|-------------|---------|
| `trialing` | In trial period | No charge |
| `active` | Paid and current | Normal billing |
| `past_due` | Payment failed | Retry billing |
| `canceled` | Ended | No billing |
| `paused` | Temporarily stopped | No billing |
| `unpaid` | Failed after retries | Dunning |

## Transfers and Payouts

### Transfer Types

**Direct Charges**: Customer pays connected account, platform takes fee
```typescript
// Charge goes to connected account
await stripe.paymentIntents.create({
  amount: 1000,
  application_fee_amount: 100,
}, { stripeAccount: 'acct_xxx' })
```

**Destination Charges**: Customer pays platform, funds transferred
```typescript
// Charge goes to platform, transferred to connected account
await stripe.paymentIntents.create({
  amount: 1000,
  transfer_data: { destination: 'acct_xxx' },
})
```

**Separate Charges and Transfers**: Full control
```typescript
// Charge customer
const payment = await stripe.paymentIntents.create({ amount: 1000 })

// Transfer to connected account (can be delayed, split, etc.)
await stripe.transfers.create({
  amount: 900,
  destination: 'acct_xxx',
  source_transaction: payment.latest_charge,
})
```

### Payout Flow

```
Platform Balance
      |
      v (transfer)
Connected Account Balance
      |
      v (payout)
Bank Account
      |
      v (settlement)
Funds Available
```

### Payout Timing

| Method | Speed | Fee |
|--------|-------|-----|
| `standard` | 2-3 days | Free |
| `instant` | Minutes | 1% (min $0.50) |

## Double-Entry Accounting

### Chart of Accounts

Standard account structure following GAAP:

```
1000-1999: Assets
  1000 Cash and Cash Equivalents
  1100 Accounts Receivable
  1200 Stripe Balance
  1300 Prepaid Expenses

2000-2999: Liabilities
  2000 Accounts Payable
  2100 Accrued Expenses
  2200 Deferred Revenue
  2300 Customer Deposits

3000-3999: Equity
  3000 Owner's Equity
  3100 Retained Earnings

4000-4999: Revenue
  4000 Subscription Revenue
  4100 Usage Revenue
  4200 Platform Fees
  4300 Other Revenue

5000-5999: Cost of Goods Sold
  5000 Payment Processing Fees
  5100 Infrastructure Costs

6000-6999: Operating Expenses
  6000 Salaries and Wages
  6100 Marketing
  6200 Software and Tools
```

### Journal Entry Structure

Every financial transaction creates balanced journal entries:

```typescript
// Payment received
{
  date: Date.now(),
  description: 'Customer payment - Invoice #1234',
  referenceType: 'payment',
  referenceId: 'pi_xxx',
  lines: [
    { accountId: '1200', debit: 970 },   // Stripe Balance
    { accountId: '5000', debit: 30 },    // Processing Fees
    { accountId: '4000', credit: 1000 }, // Revenue
  ]
}
```

### Accounting Rules

| Transaction | Debit | Credit |
|-------------|-------|--------|
| Payment received | Cash/Stripe Balance | Revenue |
| Processing fee | Expense | Cash/Stripe Balance |
| Transfer to connected | Payable | Cash |
| Payout to bank | Bank Account | Stripe Balance |
| Refund | Revenue | Cash/Stripe Balance |
| Subscription renewal | Deferred Revenue | Revenue |

## Financial Reports

### Profit & Loss Statement

```
Revenue
  Subscription Revenue          $50,000
  Usage Revenue                 $10,000
  Platform Fees                  $5,000
  -----------------------------------------
  Total Revenue                 $65,000

Cost of Goods Sold
  Payment Processing             $2,000
  Infrastructure                 $3,000
  -----------------------------------------
  Total COGS                     $5,000

Gross Profit                    $60,000

Operating Expenses
  Salaries                      $30,000
  Marketing                      $5,000
  Software                       $2,000
  -----------------------------------------
  Total OpEx                    $37,000

Operating Income                $23,000
```

### Balance Sheet

```
ASSETS
  Current Assets
    Stripe Balance              $15,000
    Bank Accounts               $50,000
    Accounts Receivable          $5,000
  -----------------------------------------
  Total Assets                  $70,000

LIABILITIES
  Current Liabilities
    Accounts Payable             $5,000
    Deferred Revenue            $10,000
  -----------------------------------------
  Total Liabilities             $15,000

EQUITY
  Owner's Equity                $40,000
  Retained Earnings             $15,000
  -----------------------------------------
  Total Equity                  $55,000

Total Liabilities + Equity      $70,000
```

### Cash Flow Statement

```
Operating Activities
  Net Income                    $23,000
  Changes in Working Capital
    Accounts Receivable          ($500)
    Deferred Revenue            $2,000
  -----------------------------------------
  Net Cash from Operations      $24,500

Investing Activities
  Equipment Purchases           ($5,000)
  -----------------------------------------
  Net Cash from Investing       ($5,000)

Financing Activities
  Owner Distributions          ($10,000)
  -----------------------------------------
  Net Cash from Financing      ($10,000)

Net Change in Cash               $9,500
Beginning Cash                  $55,500
Ending Cash                     $65,000
```

## MRR/ARR Tracking

### MRR Components

```typescript
interface MRRMetrics {
  startingMRR: number       // MRR at period start
  newMRR: number            // New customer subscriptions
  expansionMRR: number      // Upgrades, add-ons
  contractionMRR: number    // Downgrades
  churnedMRR: number        // Cancellations
  reactivationMRR: number   // Returning customers
  endingMRR: number         // MRR at period end
  netNewMRR: number         // Net change
  growthRate: number        // Month-over-month %
}
```

### MRR Calculation

```
Ending MRR = Starting MRR
           + New MRR
           + Expansion MRR
           + Reactivation MRR
           - Contraction MRR
           - Churned MRR

ARR = Ending MRR x 12
```

### Key Metrics

| Metric | Formula | Target |
|--------|---------|--------|
| **Gross Churn Rate** | Churned MRR / Starting MRR | < 3% monthly |
| **Net Revenue Retention** | (Starting - Churned + Expansion) / Starting | > 100% |
| **Quick Ratio** | (New + Expansion + Reactivation) / (Churned + Contraction) | > 4 |
| **ARPU** | Total MRR / Total Customers | Growing |
| **LTV** | ARPU x Avg Customer Lifetime | > 3x CAC |
| **CAC Payback** | CAC / (ARPU x Gross Margin) | < 12 months |

## File Structure

```
do/business/financial/
  stripe.ts           # Stripe Connect integration
  payments.ts         # Payment processing
  subscriptions.ts    # Subscription management
  accounting.ts       # Double-entry journal
  reports.ts          # Financial statements
  metrics.ts          # MRR/ARR/churn metrics
  index.ts            # Public exports
  stripe.test.ts
  payments.test.ts
  subscriptions.test.ts
  accounting.test.ts
  reports.test.ts
  metrics.test.ts
```

## Usage

```typescript
import {
  StripeConnect,
  PaymentProcessor,
  SubscriptionManager,
  AccountingJournal,
  FinancialReporter,
  MetricsCalculator,
} from '@do/core/do/business/financial'

// Initialize Stripe Connect
const stripe = new StripeConnect(env.STRIPE_SECRET_KEY)
await stripe.createConnectAccount('express', businessRef)

// Process payments
const processor = new PaymentProcessor(stripe)
await processor.createPayment(1000, 'usd', { customerRef })

// Manage subscriptions
const subscriptions = new SubscriptionManager(stripe)
await subscriptions.create(customerRef, 'price_pro_monthly')

// Record in accounting
const journal = new AccountingJournal()
await journal.createEntry({
  description: 'Subscription payment',
  lines: [
    { accountId: '1200', debit: 1000 },
    { accountId: '4000', credit: 1000 },
  ]
})

// Generate reports
const reporter = new FinancialReporter(journal)
const pnl = await reporter.generateProfitAndLoss({ start, end })

// Calculate metrics
const metrics = new MetricsCalculator(subscriptions)
const mrr = await metrics.getMRRMetrics({ start, end })
```

## Related

- [Types](/types/financial.ts) - Financial type definitions
- [Integrations](/integrations/) - External service integrations
- [DO](/do/) - Base Digital Object class
