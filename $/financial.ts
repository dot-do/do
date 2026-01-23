/**
 * Financial Context Implementation
 *
 * Provides payment, transfer, and accounting operations.
 * Abstracts over payment providers (Stripe, etc.).
 *
 * @example
 * ```typescript
 * // Charge with tagged template
 * await $.pay`charge ${customer.id} $${amount}`
 *
 * // Explicit operations
 * await $.pay.charge(customer.id, 9900, 'usd')
 * await $.pay.transfer(destination, 5000)
 *
 * // Accounting
 * await $.pay.journal({
 *   debit: [{ account: 'revenue', amount: 1000 }],
 *   credit: [{ account: 'receivables', amount: 1000 }]
 * })
 *
 * // Reports
 * const metrics = await $.pay.mrr()
 * ```
 *
 * @module context/financial
 */

import type { FinancialContext } from '../types/context'
import type { DOEnvironment } from './index'
import { interpolateTemplate } from './proxy'

/**
 * Internal context state
 */
interface ContextState {
  env: DOEnvironment
}

/**
 * Payment result
 */
interface PaymentResult {
  paymentId: string
}

/**
 * Transfer result
 */
interface TransferResult {
  transferId: string
}

/**
 * Payout result
 */
interface PayoutResult {
  payoutId: string
}

/**
 * Journal entry result
 */
interface JournalEntryResult {
  entryId: string
}

/**
 * MRR metrics
 */
interface MRRMetrics {
  mrr: number
  arr: number
  growth: number
}

/**
 * Journal entry
 */
interface JournalEntry {
  debit: Array<{ account: string; amount: number }>
  credit: Array<{ account: string; amount: number }>
}

// =============================================================================
// Financial Operations
// =============================================================================

/**
 * Parse a payment template to extract customer and amount
 *
 * Supported patterns:
 * - `charge ${customerId} $${amount}`
 * - `charge ${customerId} ${amount} USD`
 *
 * @param template - Template string
 * @returns Parsed payment components
 */
function parsePaymentTemplate(template: string): {
  action?: string
  customerId?: string
  amount?: number
  currency?: string
} {
  // Extract action (charge, transfer, etc.)
  const actionMatch = template.match(/^(\w+)\s+/)
  const action = actionMatch?.[1]

  // Extract amount with currency symbol
  const amountMatch = template.match(/\$(\d+(?:\.\d{2})?)/)
  const amount = amountMatch ? Math.round(parseFloat(amountMatch[1]) * 100) : undefined

  // Extract customer ID (anything that looks like an ID)
  const idMatch = template.match(/\b(cus_\w+|[a-f0-9-]{36}|\w+-\d+)\b/i)
  const customerId = idMatch?.[1]

  // Extract currency if specified
  const currencyMatch = template.match(/\b(USD|EUR|GBP|JPY|CAD|AUD)\b/i)
  const currency = currencyMatch?.[1]?.toLowerCase()

  return { action, customerId, amount, currency }
}

/**
 * Charge a customer
 *
 * @param state - Context state
 * @param customerId - Customer ID
 * @param amount - Amount in cents
 * @param currency - Currency code
 * @returns Payment result
 */
async function chargeCustomer(
  state: ContextState,
  customerId: string,
  amount: number,
  currency = 'usd'
): Promise<PaymentResult> {
  // TODO: Implement actual charge via Stripe
  console.log(`[Pay] Charging ${customerId}: ${amount} ${currency}`)
  return { paymentId: `pay-${Date.now()}` }
}

/**
 * Transfer funds
 *
 * @param state - Context state
 * @param destination - Destination account/ID
 * @param amount - Amount in cents
 * @returns Transfer result
 */
async function transferFunds(
  state: ContextState,
  destination: string,
  amount: number
): Promise<TransferResult> {
  // TODO: Implement actual transfer
  console.log(`[Pay] Transferring ${amount} to ${destination}`)
  return { transferId: `tr-${Date.now()}` }
}

/**
 * Create a payout
 *
 * @param state - Context state
 * @param amount - Amount in cents
 * @param destination - Destination account
 * @returns Payout result
 */
async function createPayout(
  state: ContextState,
  amount: number,
  destination: string
): Promise<PayoutResult> {
  // TODO: Implement actual payout
  console.log(`[Pay] Payout of ${amount} to ${destination}`)
  return { payoutId: `po-${Date.now()}` }
}

/**
 * Create a journal entry
 *
 * @param state - Context state
 * @param entry - Journal entry
 * @returns Entry result
 */
async function createJournalEntry(
  state: ContextState,
  entry: JournalEntry
): Promise<JournalEntryResult> {
  // Validate that debits equal credits
  const debitTotal = entry.debit.reduce((sum, d) => sum + d.amount, 0)
  const creditTotal = entry.credit.reduce((sum, c) => sum + c.amount, 0)

  if (debitTotal !== creditTotal) {
    throw new Error(`Journal entry unbalanced: debits=${debitTotal}, credits=${creditTotal}`)
  }

  // TODO: Implement journal entry creation
  console.log(`[Pay] Journal entry: ${debitTotal}`)
  console.log(`[Pay] Debits:`, entry.debit)
  console.log(`[Pay] Credits:`, entry.credit)

  return { entryId: `je-${Date.now()}` }
}

/**
 * Get P&L report
 *
 * @param state - Context state
 * @param period - Time period
 * @returns P&L data
 */
async function getPnL(
  state: ContextState,
  period: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'monthly'
): Promise<unknown> {
  // TODO: Implement P&L calculation
  console.log(`[Pay] Getting P&L for ${period}`)
  return {
    revenue: 100000,
    expenses: 60000,
    netIncome: 40000,
    period,
  }
}

/**
 * Get MRR metrics
 *
 * @param state - Context state
 * @returns MRR metrics
 */
async function getMRR(state: ContextState): Promise<MRRMetrics> {
  // TODO: Implement MRR calculation
  console.log(`[Pay] Getting MRR`)
  return {
    mrr: 50000,
    arr: 600000,
    growth: 0.15,
  }
}

/**
 * Create the Financial Context
 *
 * @param state - Internal context state
 * @returns FinancialContext implementation
 */
export function createFinancialContext(state: ContextState): FinancialContext {
  /**
   * Main pay tagged template function
   * Usage: $.pay`charge ${customerId} $${amount}`
   */
  const pay = (async (strings: TemplateStringsArray, ...values: unknown[]): Promise<PaymentResult> => {
    const template = interpolateTemplate(strings, values)
    const { action, customerId, amount, currency } = parsePaymentTemplate(template)

    if (action !== 'charge') {
      throw new Error(`Unsupported payment action: ${action}`)
    }

    if (!customerId) {
      throw new Error('Customer ID not found in template')
    }

    if (!amount) {
      throw new Error('Amount not found in template')
    }

    return chargeCustomer(state, customerId, amount, currency)
  }) as FinancialContext

  /**
   * Charge a customer
   * Usage: $.pay.charge(customerId, amount, currency)
   */
  pay.charge = (customerId: string, amount: number, currency = 'usd'): Promise<PaymentResult> => {
    return chargeCustomer(state, customerId, amount, currency)
  }

  /**
   * Transfer funds
   * Usage: $.pay.transfer(destination, amount)
   */
  pay.transfer = (destination: string, amount: number): Promise<TransferResult> => {
    return transferFunds(state, destination, amount)
  }

  /**
   * Create a payout
   * Usage: $.pay.payout(amount, destination)
   */
  pay.payout = (amount: number, destination: string): Promise<PayoutResult> => {
    return createPayout(state, amount, destination)
  }

  /**
   * Create a journal entry
   * Usage: $.pay.journal({ debit: [...], credit: [...] })
   */
  pay.journal = (entry: JournalEntry): Promise<JournalEntryResult> => {
    return createJournalEntry(state, entry)
  }

  /**
   * Get P&L report
   * Usage: $.pay.pnl('monthly')
   */
  pay.pnl = (period?: 'daily' | 'weekly' | 'monthly' | 'yearly'): Promise<unknown> => {
    return getPnL(state, period)
  }

  /**
   * Get MRR metrics
   * Usage: $.pay.mrr()
   */
  pay.mrr = (): Promise<MRRMetrics> => {
    return getMRR(state)
  }

  return pay
}

// =============================================================================
// Financial Utilities
// =============================================================================

/**
 * Format cents as currency string
 *
 * @param cents - Amount in cents
 * @param currency - Currency code
 * @returns Formatted string
 */
export function formatCurrency(cents: number, currency = 'usd'): string {
  const amount = cents / 100
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  })
  return formatter.format(amount)
}

/**
 * Parse currency string to cents
 *
 * @param value - Currency string (e.g., '$99.99' or '99.99')
 * @returns Amount in cents
 */
export function parseCurrency(value: string): number {
  const cleaned = value.replace(/[^0-9.-]/g, '')
  return Math.round(parseFloat(cleaned) * 100)
}

/**
 * Calculate growth rate
 *
 * @param current - Current value
 * @param previous - Previous value
 * @returns Growth rate as decimal
 */
export function calculateGrowth(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 1 : 0
  return (current - previous) / previous
}
