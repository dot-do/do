/**
 * Financial Layer
 *
 * Business-as-Code financial operations with deep Stripe Connect integration.
 *
 * @module financial
 */

// Stripe Connect
export {
  StripeConnect,
  StripeConnectError,
  StripeConnectErrorCodes,
  type StripeConnectConfig,
  type CreateAccountOptions,
  type AccountLinkOptions,
  type StripeConnectErrorCode,
} from './stripe'

// Payments
export {
  PaymentProcessor,
  PaymentError,
  PaymentErrorCodes,
  type PaymentProcessorConfig,
  type CreatePaymentOptions,
  type RefundOptions,
  type CreateTransferOptions,
  type CreatePayoutOptions,
  type PaymentErrorCode,
} from './payments'

// Subscriptions
export {
  SubscriptionManager,
  SubscriptionError,
  SubscriptionErrorCodes,
  type SubscriptionManagerConfig,
  type CreateSubscriptionOptions,
  type UpdateSubscriptionOptions,
  type CancelSubscriptionOptions,
  type ListInvoicesOptions,
  type SubscriptionErrorCode,
} from './subscriptions'

// Accounting
export {
  AccountingJournal,
  AccountingError,
  AccountingErrorCodes,
  type AccountingJournalConfig,
  type CreateAccountOptions as CreateChartAccountOptions,
  type CreateJournalEntryOptions,
  type ListJournalEntriesOptions,
  type TrialBalanceEntry,
  type AccountingErrorCode,
} from './accounting'

// Reports
export {
  FinancialReporter,
  ReportError,
  ReportErrorCodes,
  type FinancialReporterConfig,
  type ReportOptions,
  type ComparativeReport,
  type ReportErrorCode,
} from './reports'

// Metrics
export {
  MetricsCalculator,
  MetricsError,
  MetricsErrorCodes,
  type MetricsCalculatorConfig,
  type MRRMovement,
  type CustomerCohort,
  type RevenueAnalysis,
  type UnitEconomics,
  type CohortAnalysis,
  type MetricsErrorCode,
} from './metrics'

// Re-export types from types/financial.ts
export type {
  // Stripe Connect
  StripeAccountType,
  StripeConnectAccount,
  StripeCapabilities,
  BankAccount,

  // Payments
  PaymentStatus,
  Payment,
  PaymentOptions,
  ListPaymentsOptions,
  Transfer,
  Payout,
  ApplicationFee,
  PlatformFeeConfig,

  // Subscriptions
  SubscriptionStatus,
  Subscription,
  ListSubscriptionsOptions,
  Invoice,
  InvoiceLineItem,

  // Accounting
  AccountCategory,
  ChartOfAccount,
  JournalEntry,
  JournalLine,
  AccountBalance,

  // Reports
  ReportPeriod,
  ProfitAndLoss,
  PLSection,
  PLLineItem,
  BalanceSheet,
  BalanceSheetSection,
  BalanceSheetSubsection,
  BalanceSheetLineItem,
  CashFlowStatement,
  CashFlowSection,
  CashFlowLineItem,

  // Metrics
  MRRMetrics,
  CustomerMetrics,

  // Operations Interface
  FinancialOperations,
} from '../../../types/financial'
