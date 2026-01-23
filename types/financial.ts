/**
 * Financial Types - Business-as-Code with Stripe Connect
 *
 * Deep integration with Stripe for:
 * - Bank accounts, payments, transfers
 * - Costs, income, accounting
 * - P&L and financial reporting
 *
 * Stripe Connect serves as the platform foundation
 */

import type { DigitalObjectRef } from './identity'

// =============================================================================
// Stripe Connect Foundation
// =============================================================================

/**
 * Stripe account types
 */
export type StripeAccountType = 'Standard' | 'Express' | 'Custom'

/**
 * Stripe Connect account (linked to a Business DO)
 */
export interface StripeConnectAccount {
  /** Stripe account ID (acct_xxx) */
  stripeAccountId: string
  /** Account type */
  type: StripeAccountType
  /** Business DO reference */
  businessRef: DigitalObjectRef
  /** Whether charges are enabled */
  chargesEnabled: boolean
  /** Whether payouts are enabled */
  payoutsEnabled: boolean
  /** Account country */
  country: string
  /** Default currency */
  defaultCurrency: string
  /** Business profile */
  businessProfile?: {
    name?: string
    url?: string
    supportEmail?: string
    supportPhone?: string
    mcc?: string // Merchant category code
  }
  /** Capabilities */
  capabilities?: StripeCapabilities
  /** Onboarding status */
  onboardingStatus: 'Pending' | 'InProgress' | 'Complete' | 'Restricted'
  /** Created timestamp */
  createdAt: number
  /** Updated timestamp */
  updatedAt: number
}

export interface StripeCapabilities {
  cardPayments?: 'Active' | 'Inactive' | 'Pending'
  transfers?: 'Active' | 'Inactive' | 'Pending'
  bankTransferPayments?: 'Active' | 'Inactive' | 'Pending'
  linkPayments?: 'Active' | 'Inactive' | 'Pending'
}

// =============================================================================
// Bank Accounts
// =============================================================================

/**
 * Bank account (for payouts)
 */
export interface BankAccount {
  id: string
  /** Stripe bank account ID */
  stripeBankAccountId?: string
  /** Account holder name */
  accountHolderName: string
  /** Account holder type */
  accountHolderType: 'Individual' | 'Company'
  /** Bank name */
  bankName: string
  /** Country */
  country: string
  /** Currency */
  currency: string
  /** Last 4 digits */
  last4: string
  /** Routing number (last 4) */
  routingNumber?: string
  /** Whether this is the default for payouts */
  isDefault: boolean
  /** Status */
  status: 'New' | 'Validated' | 'Verified' | 'VerificationFailed' | 'Errored'
  /** Created timestamp */
  createdAt: number
}

// =============================================================================
// Payments & Transactions
// =============================================================================

/**
 * Payment intent status
 */
export type PaymentStatus =
  | 'RequiresPaymentMethod'
  | 'RequiresConfirmation'
  | 'RequiresAction'
  | 'Processing'
  | 'RequiresCapture'
  | 'Canceled'
  | 'Succeeded'

/**
 * Payment (incoming money)
 */
export interface Payment {
  id: string
  /** Stripe payment intent ID */
  stripePaymentIntentId?: string
  /** Amount in smallest currency unit (cents) */
  amount: number
  /** Currency (ISO 4217) */
  currency: string
  /** Status */
  status: PaymentStatus
  /** Customer reference */
  customerRef?: DigitalObjectRef
  /** Description */
  description?: string
  /** Metadata */
  metadata?: Record<string, string>
  /** Payment method type */
  paymentMethodType?: string
  /** Receipt email */
  receiptEmail?: string
  /** Created timestamp */
  createdAt: number
  /** Captured timestamp */
  capturedAt?: number
  /** Refunded amount */
  amountRefunded?: number
}

/**
 * Transfer (moving money between accounts)
 */
export interface Transfer {
  id: string
  /** Stripe transfer ID */
  stripeTransferId?: string
  /** Amount in smallest currency unit */
  amount: number
  /** Currency */
  currency: string
  /** Source account */
  sourceAccountId?: string
  /** Destination account */
  destinationAccountId: string
  /** Description */
  description?: string
  /** Status */
  status: 'Pending' | 'Paid' | 'Failed' | 'Canceled'
  /** Transfer group (for linking related transfers) */
  transferGroup?: string
  /** Created timestamp */
  createdAt: number
  /** Arrival date */
  arrivalDate?: number
}

/**
 * Payout (money leaving platform to bank)
 */
export interface Payout {
  id: string
  /** Stripe payout ID */
  stripePayoutId?: string
  /** Amount */
  amount: number
  /** Currency */
  currency: string
  /** Destination bank account */
  bankAccountId: string
  /** Status */
  status: 'Pending' | 'InTransit' | 'Paid' | 'Failed' | 'Canceled'
  /** Method */
  method: 'Standard' | 'Instant'
  /** Type */
  type: 'BankAccount' | 'Card'
  /** Description */
  description?: string
  /** Created timestamp */
  createdAt: number
  /** Arrival date */
  arrivalDate?: number
  /** Failure code */
  failureCode?: string
  /** Failure message */
  failureMessage?: string
}

// =============================================================================
// Subscriptions & Recurring Revenue
// =============================================================================

/**
 * Subscription status
 */
export type SubscriptionStatus =
  | 'Incomplete'
  | 'IncompleteExpired'
  | 'Trialing'
  | 'Active'
  | 'PastDue'
  | 'Canceled'
  | 'Unpaid'
  | 'Paused'

/**
 * Subscription
 */
export interface Subscription {
  id: string
  /** Stripe subscription ID */
  stripeSubscriptionId?: string
  /** Customer reference */
  customerRef: DigitalObjectRef
  /** Status */
  status: SubscriptionStatus
  /** Price/plan ID */
  priceId: string
  /** Quantity */
  quantity: number
  /** Current period start */
  currentPeriodStart: number
  /** Current period end */
  currentPeriodEnd: number
  /** Cancel at period end */
  cancelAtPeriodEnd: boolean
  /** Trial start */
  trialStart?: number
  /** Trial end */
  trialEnd?: number
  /** Created timestamp */
  createdAt: number
  /** Canceled timestamp */
  canceledAt?: number
  /** Metadata */
  metadata?: Record<string, string>
}

/**
 * Invoice
 */
export interface Invoice {
  id: string
  /** Stripe invoice ID */
  stripeInvoiceId?: string
  /** Customer reference */
  customerRef: DigitalObjectRef
  /** Subscription ID (if recurring) */
  subscriptionId?: string
  /** Status */
  status: 'Draft' | 'Open' | 'Paid' | 'Uncollectible' | 'Void'
  /** Amount due */
  amountDue: number
  /** Amount paid */
  amountPaid: number
  /** Amount remaining */
  amountRemaining: number
  /** Currency */
  currency: string
  /** Line items */
  lineItems: InvoiceLineItem[]
  /** Due date */
  dueDate?: number
  /** Period start */
  periodStart: number
  /** Period end */
  periodEnd: number
  /** Created timestamp */
  createdAt: number
  /** Paid timestamp */
  paidAt?: number
  /** Invoice PDF URL */
  invoicePdf?: string
  /** Hosted invoice URL */
  hostedInvoiceUrl?: string
}

export interface InvoiceLineItem {
  id: string
  /** Description */
  description: string
  /** Amount */
  amount: number
  /** Currency */
  currency: string
  /** Quantity */
  quantity: number
  /** Unit amount */
  unitAmount: number
  /** Period */
  period?: { start: number; end: number }
}

// =============================================================================
// Accounting & Ledger
// =============================================================================

/**
 * Account types (double-entry bookkeeping)
 */
export type AccountCategory = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'

/**
 * Chart of accounts entry
 */
export interface ChartOfAccount {
  id: string
  /** Account code (e.g., 1000, 2000) */
  code: string
  /** Account name */
  name: string
  /** Category */
  category: AccountCategory
  /** Parent account (for hierarchy) */
  parentId?: string
  /** Description */
  description?: string
  /** Whether account is active */
  isActive: boolean
  /** Normal balance (debit or credit) */
  normalBalance: 'Debit' | 'Credit'
}

/**
 * Journal entry (double-entry)
 */
export interface JournalEntry {
  id: string
  /** Entry date */
  date: number
  /** Description/memo */
  description: string
  /** Reference (invoice, payment, etc.) */
  reference?: string
  /** Reference type */
  referenceType?: 'Payment' | 'Transfer' | 'Payout' | 'Invoice' | 'Manual'
  /** Reference ID */
  referenceId?: string
  /** Line items (must balance) */
  lines: JournalLine[]
  /** Status */
  status: 'Draft' | 'Posted' | 'Voided'
  /** Created timestamp */
  createdAt: number
  /** Posted timestamp */
  postedAt?: number
  /** Created by */
  createdBy?: string
}

export interface JournalLine {
  /** Account ID */
  accountId: string
  /** Debit amount (positive) */
  debit?: number
  /** Credit amount (positive) */
  credit?: number
  /** Description */
  description?: string
  /** Metadata */
  metadata?: Record<string, unknown>
}

/**
 * Account balance (at a point in time)
 */
export interface AccountBalance {
  accountId: string
  /** Balance date */
  asOf: number
  /** Debit total */
  debits: number
  /** Credit total */
  credits: number
  /** Net balance */
  balance: number
}

// =============================================================================
// Financial Reporting
// =============================================================================

/**
 * Report period
 */
export interface ReportPeriod {
  start: number
  end: number
  label?: string // e.g., "Q1 2024", "January 2024"
}

/**
 * Profit & Loss (Income Statement)
 */
export interface ProfitAndLoss {
  id: string
  /** Report period */
  period: ReportPeriod
  /** Revenue section */
  revenue: PLSection
  /** Cost of goods sold */
  cogs?: PLSection
  /** Gross profit */
  grossProfit: number
  /** Operating expenses */
  operatingExpenses: PLSection
  /** Operating income */
  operatingIncome: number
  /** Other income/expenses */
  otherIncomeExpenses?: PLSection
  /** Net income before tax */
  netIncomeBeforeTax: number
  /** Tax expense */
  taxExpense?: number
  /** Net income */
  netIncome: number
  /** Generated timestamp */
  generatedAt: number
}

export interface PLSection {
  /** Section name */
  name: string
  /** Line items */
  items: PLLineItem[]
  /** Section total */
  total: number
}

export interface PLLineItem {
  /** Account ID */
  accountId: string
  /** Account name */
  accountName: string
  /** Amount */
  amount: number
  /** Percentage of revenue (for analysis) */
  percentageOfRevenue?: number
}

/**
 * Balance Sheet
 */
export interface BalanceSheet {
  id: string
  /** As of date */
  asOf: number
  /** Assets */
  assets: BalanceSheetSection
  /** Liabilities */
  liabilities: BalanceSheetSection
  /** Equity */
  equity: BalanceSheetSection
  /** Total assets (should equal liabilities + equity) */
  totalAssets: number
  /** Total liabilities */
  totalLiabilities: number
  /** Total equity */
  totalEquity: number
  /** Generated timestamp */
  generatedAt: number
}

export interface BalanceSheetSection {
  /** Section name */
  name: string
  /** Subsections */
  subsections: BalanceSheetSubsection[]
  /** Section total */
  total: number
}

export interface BalanceSheetSubsection {
  /** Subsection name (e.g., "Current Assets") */
  name: string
  /** Line items */
  items: BalanceSheetLineItem[]
  /** Subtotal */
  subtotal: number
}

export interface BalanceSheetLineItem {
  accountId: string
  accountName: string
  balance: number
}

/**
 * Cash Flow Statement
 */
export interface CashFlowStatement {
  id: string
  /** Report period */
  period: ReportPeriod
  /** Beginning cash balance */
  beginningCash: number
  /** Operating activities */
  operatingActivities: CashFlowSection
  /** Investing activities */
  investingActivities: CashFlowSection
  /** Financing activities */
  financingActivities: CashFlowSection
  /** Net change in cash */
  netChange: number
  /** Ending cash balance */
  endingCash: number
  /** Generated timestamp */
  generatedAt: number
}

export interface CashFlowSection {
  name: string
  items: CashFlowLineItem[]
  total: number
}

export interface CashFlowLineItem {
  description: string
  amount: number
  category?: string
}

// =============================================================================
// Revenue Metrics (SaaS)
// =============================================================================

/**
 * Monthly Recurring Revenue breakdown
 */
export interface MRRMetrics {
  /** Report period */
  period: ReportPeriod
  /** Starting MRR */
  startingMRR: number
  /** New MRR (new customers) */
  newMRR: number
  /** Expansion MRR (upgrades) */
  expansionMRR: number
  /** Contraction MRR (downgrades) */
  contractionMRR: number
  /** Churned MRR (cancellations) */
  churnedMRR: number
  /** Reactivation MRR */
  reactivationMRR: number
  /** Ending MRR */
  endingMRR: number
  /** Net new MRR */
  netNewMRR: number
  /** MRR growth rate */
  growthRate: number
}

/**
 * Customer metrics
 */
export interface CustomerMetrics {
  period: ReportPeriod
  /** Total customers at end of period */
  totalCustomers: number
  /** New customers */
  newCustomers: number
  /** Churned customers */
  churnedCustomers: number
  /** Customer churn rate */
  churnRate: number
  /** Revenue churn rate */
  revenueChurnRate: number
  /** Average revenue per customer */
  arpc: number
  /** Customer lifetime value */
  ltv?: number
  /** Customer acquisition cost */
  cac?: number
  /** LTV/CAC ratio */
  ltvCacRatio?: number
}

// =============================================================================
// Platform Revenue (Stripe Connect)
// =============================================================================

/**
 * Platform fee structure
 */
export interface PlatformFeeConfig {
  /** Fee type */
  type: 'Percentage' | 'Fixed' | 'PercentagePlusFixed'
  /** Percentage fee (0-100) */
  percentage?: number
  /** Fixed fee in smallest currency unit */
  fixedAmount?: number
  /** Currency for fixed fee */
  currency?: string
  /** Minimum fee */
  minimumFee?: number
  /** Maximum fee */
  maximumFee?: number
}

/**
 * Application fee (platform revenue from connected account)
 */
export interface ApplicationFee {
  id: string
  /** Stripe application fee ID */
  stripeApplicationFeeId?: string
  /** Connected account ID */
  connectedAccountId: string
  /** Original payment/charge ID */
  chargeId: string
  /** Fee amount */
  amount: number
  /** Currency */
  currency: string
  /** Amount refunded */
  amountRefunded: number
  /** Created timestamp */
  createdAt: number
}

// =============================================================================
// Financial Operations Interface
// =============================================================================

/**
 * Financial operations for a Business DO
 */
export interface FinancialOperations {
  // Stripe Connect
  createConnectAccount(type: StripeAccountType): Promise<StripeConnectAccount>
  getConnectAccount(): Promise<StripeConnectAccount | null>
  createAccountLink(returnUrl: string, refreshUrl: string): Promise<string>

  // Bank Accounts
  addBankAccount(details: Omit<BankAccount, 'id' | 'createdAt'>): Promise<BankAccount>
  listBankAccounts(): Promise<BankAccount[]>
  setDefaultBankAccount(bankAccountId: string): Promise<void>

  // Payments
  createPayment(amount: number, currency: string, options?: PaymentOptions): Promise<Payment>
  capturePayment(paymentId: string): Promise<Payment>
  refundPayment(paymentId: string, amount?: number): Promise<Payment>
  listPayments(options?: ListPaymentsOptions): Promise<Payment[]>

  // Transfers & Payouts
  createTransfer(destinationAccountId: string, amount: number, currency: string): Promise<Transfer>
  createPayout(bankAccountId: string, amount: number, currency: string): Promise<Payout>

  // Subscriptions
  createSubscription(customerRef: DigitalObjectRef, priceId: string): Promise<Subscription>
  cancelSubscription(subscriptionId: string, atPeriodEnd?: boolean): Promise<Subscription>
  listSubscriptions(options?: ListSubscriptionsOptions): Promise<Subscription[]>

  // Accounting
  createJournalEntry(entry: Omit<JournalEntry, 'id' | 'createdAt'>): Promise<JournalEntry>
  postJournalEntry(entryId: string): Promise<JournalEntry>
  getAccountBalance(accountId: string, asOf?: number): Promise<AccountBalance>

  // Reporting
  generateProfitAndLoss(period: ReportPeriod): Promise<ProfitAndLoss>
  generateBalanceSheet(asOf: number): Promise<BalanceSheet>
  generateCashFlow(period: ReportPeriod): Promise<CashFlowStatement>
  getMRRMetrics(period: ReportPeriod): Promise<MRRMetrics>
  getCustomerMetrics(period: ReportPeriod): Promise<CustomerMetrics>
}

export interface PaymentOptions {
  customerRef?: DigitalObjectRef
  description?: string
  metadata?: Record<string, string>
  applicationFeeAmount?: number
  transferDestination?: string
}

export interface ListPaymentsOptions {
  limit?: number
  startingAfter?: string
  status?: PaymentStatus
  customerRef?: DigitalObjectRef
  createdAfter?: number
  createdBefore?: number
}

export interface ListSubscriptionsOptions {
  limit?: number
  startingAfter?: string
  status?: SubscriptionStatus
  customerRef?: DigitalObjectRef
  priceId?: string
}
