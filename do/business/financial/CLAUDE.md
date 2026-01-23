# CLAUDE.md - Financial Module

## Purpose

Stripe Connect-powered financial operations for Business-as-Code Digital Objects.

## Key Concepts

- **Stripe Connect** as foundation for multi-party payments
- **Double-entry accounting** for all financial transactions
- **Real-time metrics** for MRR/ARR/churn tracking
- **Webhook-driven** state synchronization with Stripe

## Files

| File | Responsibility |
|------|----------------|
| `stripe.ts` | Connect accounts, onboarding, capabilities |
| `payments.ts` | Payment intents, captures, refunds |
| `subscriptions.ts` | Recurring billing, trials, cancellations |
| `accounting.ts` | Journal entries, chart of accounts, balances |
| `reports.ts` | P&L, balance sheet, cash flow statements |
| `metrics.ts` | MRR/ARR, churn, LTV/CAC calculations |

## Implementation Notes

### Stripe Connect Pattern

All Stripe operations should support both platform and connected accounts:

```typescript
// Platform operation
await stripe.paymentIntents.create({ amount: 1000 })

// Connected account operation
await stripe.paymentIntents.create(
  { amount: 1000 },
  { stripeAccount: 'acct_xxx' }
)
```

### Money Handling

- **Always use smallest currency unit** (cents for USD)
- **Never use floating point** for money calculations
- **Store currency code** with all amounts
- **Use BigInt** for aggregations over large datasets

```typescript
// Good
const amount = 1000  // $10.00 in cents

// Bad
const amount = 10.00  // Floating point!
```

### Double-Entry Validation

Every journal entry must balance (debits = credits):

```typescript
function validateEntry(entry: JournalEntry): boolean {
  const totalDebits = entry.lines.reduce((sum, l) => sum + (l.debit || 0), 0)
  const totalCredits = entry.lines.reduce((sum, l) => sum + (l.credit || 0), 0)
  return totalDebits === totalCredits
}
```

### Webhook Handling

Use idempotency keys to prevent duplicate processing:

```typescript
async function handleWebhook(event: Stripe.Event) {
  // Check if already processed
  const processed = await state.get(`webhook:${event.id}`)
  if (processed) return

  // Process event
  await processEvent(event)

  // Mark as processed
  await state.set(`webhook:${event.id}`, { processedAt: Date.now() })
}
```

### Metrics Calculation

Calculate MRR from subscription data, not payment data:

```typescript
// Good - from subscription value
const mrr = subscription.items.reduce((sum, item) => {
  const price = item.price
  if (price.recurring?.interval === 'year') {
    return sum + (price.unit_amount * item.quantity / 12)
  }
  return sum + (price.unit_amount * item.quantity)
}, 0)

// Bad - from payment amounts (includes one-time, prorations)
const mrr = payments.reduce((sum, p) => sum + p.amount, 0)
```

## Testing Requirements

- **Mock Stripe API** - Use stripe-mock or custom mocks
- **Test webhook handlers** - Verify idempotency
- **Test accounting balance** - Ensure entries always balance
- **Test metrics accuracy** - Verify against known scenarios

### Test Scenarios

1. **Onboarding flow**: Account creation, link generation, webhook updates
2. **Payment lifecycle**: Create, confirm, capture, refund
3. **Subscription lifecycle**: Create, upgrade, downgrade, cancel
4. **Accounting integrity**: All transactions produce balanced entries
5. **Report accuracy**: P&L and balance sheet reconcile
6. **Metric calculation**: MRR movement categories are accurate

## Error Handling

Use typed errors with Stripe error codes:

```typescript
class FinancialError extends Error {
  constructor(
    public code: string,
    message: string,
    public stripeError?: Stripe.StripeError,
    public details?: unknown
  ) {
    super(message)
  }
}

// Usage
throw new FinancialError(
  'PAYMENT_FAILED',
  'Payment was declined',
  stripeError,
  { paymentIntentId: 'pi_xxx' }
)
```

### Error Codes

| Code | Description |
|------|-------------|
| `ACCOUNT_NOT_FOUND` | Stripe Connect account not found |
| `ONBOARDING_INCOMPLETE` | Account not fully onboarded |
| `PAYMENT_FAILED` | Payment declined or failed |
| `INSUFFICIENT_FUNDS` | Not enough balance for transfer |
| `ENTRY_UNBALANCED` | Journal entry debits != credits |
| `ACCOUNT_CODE_EXISTS` | Duplicate chart of accounts code |

## Import Conventions

```typescript
// Types from /types/financial.ts
import type {
  StripeConnectAccount,
  Payment,
  Subscription,
  JournalEntry,
  ProfitAndLoss,
  MRRMetrics,
} from '../../../types/financial'

// Stripe SDK
import Stripe from 'stripe'

// Internal modules
import { StripeConnect } from './stripe'
import { AccountingJournal } from './accounting'
```

## Naming Conventions

- **Methods**: `createPayment`, `cancelSubscription`, `postJournalEntry`
- **Events**: `payment.succeeded`, `subscription.canceled`, `entry.posted`
- **Accounts**: Use 4-digit codes (1000, 2000, etc.)
- **IDs**: Preserve Stripe IDs (`pi_xxx`, `sub_xxx`, `acct_xxx`)

## Security Considerations

- **Never log full card numbers** or sensitive payment data
- **Validate webhook signatures** before processing
- **Use restricted API keys** with minimal permissions
- **Store API keys in environment** variables only
- **Implement rate limiting** for payment endpoints

## Dependencies

- Types from `../../../types/financial.ts`
- Stripe SDK (`stripe` package)
- No other external dependencies
