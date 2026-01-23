/**
 * Financial Reports
 *
 * Generates standard financial statements:
 * - Profit & Loss (Income Statement)
 * - Balance Sheet
 * - Cash Flow Statement
 *
 * @module financial/reports
 */

import type {
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
  AccountCategory,
} from '../../../types/financial'
import type { AccountingJournal } from './accounting'

/**
 * Configuration for financial reports
 */
export interface FinancialReporterConfig {
  /** Accounting journal instance */
  journal: AccountingJournal
  /** Default currency */
  defaultCurrency?: string
  /** Fiscal year start month (1-12) */
  fiscalYearStartMonth?: number
  /** Include zero-balance accounts in reports */
  includeZeroBalances?: boolean
}

/**
 * Options for generating reports
 */
export interface ReportOptions {
  /** Include comparison period */
  comparePeriod?: ReportPeriod
  /** Include percentage calculations */
  includePercentages?: boolean
  /** Account detail level */
  detailLevel?: 'summary' | 'detail' | 'full'
  /** Filter by specific accounts */
  accountIds?: string[]
}

/**
 * Comparative report with period-over-period analysis
 */
export interface ComparativeReport<T> {
  current: T
  previous?: T
  variance?: {
    amount: number
    percentage: number
  }
}

/**
 * Financial statement generator for Digital Objects
 *
 * Generates standard financial reports from the accounting journal
 * including P&L, Balance Sheet, and Cash Flow Statement.
 *
 * @example
 * ```typescript
 * const reporter = new FinancialReporter({ journal })
 *
 * // Generate P&L for last month
 * const pnl = await reporter.generateProfitAndLoss({
 *   start: startOfMonth,
 *   end: endOfMonth,
 *   label: 'January 2024'
 * })
 *
 * // Generate balance sheet as of today
 * const balance = await reporter.generateBalanceSheet(Date.now())
 * ```
 */
export class FinancialReporter {
  private readonly config: FinancialReporterConfig

  /**
   * Create a new FinancialReporter instance
   *
   * @param config - Financial reporter configuration
   */
  constructor(config: FinancialReporterConfig) {
    this.config = config
  }

  // =========================================================================
  // Profit & Loss Statement
  // =========================================================================

  /**
   * Generate a Profit & Loss (Income) Statement
   *
   * @param period - Report period
   * @param options - Report options
   * @returns The P&L statement
   *
   * @example
   * ```typescript
   * const pnl = await reporter.generateProfitAndLoss({
   *   start: new Date('2024-01-01').getTime(),
   *   end: new Date('2024-01-31').getTime(),
   *   label: 'January 2024'
   * })
   *
   * console.log('Net Income:', pnl.netIncome)
   * console.log('Gross Margin:', pnl.grossProfit / pnl.revenue.total)
   * ```
   */
  async generateProfitAndLoss(
    period: ReportPeriod,
    options?: ReportOptions
  ): Promise<ProfitAndLoss> {
    // TODO: Implement P&L generation
    throw new Error('Not implemented')
  }

  /**
   * Generate a comparative P&L with period-over-period analysis
   *
   * @param currentPeriod - Current report period
   * @param previousPeriod - Previous period for comparison
   * @param options - Report options
   * @returns Comparative P&L
   */
  async generateComparativeProfitAndLoss(
    currentPeriod: ReportPeriod,
    previousPeriod: ReportPeriod,
    options?: ReportOptions
  ): Promise<ComparativeReport<ProfitAndLoss>> {
    // TODO: Implement comparative P&L
    throw new Error('Not implemented')
  }

  /**
   * Build a P&L section from account balances
   *
   * @param category - Account category for the section
   * @param period - Report period
   * @param name - Section name
   * @returns The P&L section
   */
  private async buildPLSection(
    category: AccountCategory,
    period: ReportPeriod,
    name: string
  ): Promise<PLSection> {
    // TODO: Implement section building
    throw new Error('Not implemented')
  }

  // =========================================================================
  // Balance Sheet
  // =========================================================================

  /**
   * Generate a Balance Sheet
   *
   * @param asOf - Point-in-time for the balance sheet
   * @param options - Report options
   * @returns The balance sheet
   *
   * @example
   * ```typescript
   * const balance = await reporter.generateBalanceSheet(Date.now())
   *
   * console.log('Total Assets:', balance.totalAssets)
   * console.log('Total Liabilities:', balance.totalLiabilities)
   * console.log('Total Equity:', balance.totalEquity)
   *
   * // Verify accounting equation
   * const isBalanced = balance.totalAssets ===
   *   balance.totalLiabilities + balance.totalEquity
   * ```
   */
  async generateBalanceSheet(
    asOf: number,
    options?: ReportOptions
  ): Promise<BalanceSheet> {
    // TODO: Implement balance sheet generation
    throw new Error('Not implemented')
  }

  /**
   * Generate a comparative balance sheet
   *
   * @param currentDate - Current balance sheet date
   * @param previousDate - Previous date for comparison
   * @param options - Report options
   * @returns Comparative balance sheet
   */
  async generateComparativeBalanceSheet(
    currentDate: number,
    previousDate: number,
    options?: ReportOptions
  ): Promise<ComparativeReport<BalanceSheet>> {
    // TODO: Implement comparative balance sheet
    throw new Error('Not implemented')
  }

  /**
   * Build a balance sheet section from accounts
   *
   * @param category - Account category
   * @param asOf - Point-in-time
   * @param name - Section name
   * @returns The balance sheet section
   */
  private async buildBalanceSheetSection(
    category: AccountCategory,
    asOf: number,
    name: string
  ): Promise<BalanceSheetSection> {
    // TODO: Implement section building
    throw new Error('Not implemented')
  }

  /**
   * Verify that the balance sheet balances
   *
   * @param balanceSheet - Balance sheet to verify
   * @returns True if assets = liabilities + equity
   */
  verifyBalanceSheet(balanceSheet: BalanceSheet): boolean {
    const tolerance = 0.01 // Allow for small rounding differences
    const difference = Math.abs(
      balanceSheet.totalAssets -
      (balanceSheet.totalLiabilities + balanceSheet.totalEquity)
    )
    return difference <= tolerance
  }

  // =========================================================================
  // Cash Flow Statement
  // =========================================================================

  /**
   * Generate a Cash Flow Statement
   *
   * Uses the indirect method, starting with net income and
   * adjusting for non-cash items and working capital changes.
   *
   * @param period - Report period
   * @param options - Report options
   * @returns The cash flow statement
   *
   * @example
   * ```typescript
   * const cashFlow = await reporter.generateCashFlow({
   *   start: startOfMonth,
   *   end: endOfMonth
   * })
   *
   * console.log('Net Cash from Operations:', cashFlow.operatingActivities.total)
   * console.log('Ending Cash:', cashFlow.endingCash)
   * ```
   */
  async generateCashFlow(
    period: ReportPeriod,
    options?: ReportOptions
  ): Promise<CashFlowStatement> {
    // TODO: Implement cash flow generation
    throw new Error('Not implemented')
  }

  /**
   * Generate a comparative cash flow statement
   *
   * @param currentPeriod - Current report period
   * @param previousPeriod - Previous period for comparison
   * @param options - Report options
   * @returns Comparative cash flow statement
   */
  async generateComparativeCashFlow(
    currentPeriod: ReportPeriod,
    previousPeriod: ReportPeriod,
    options?: ReportOptions
  ): Promise<ComparativeReport<CashFlowStatement>> {
    // TODO: Implement comparative cash flow
    throw new Error('Not implemented')
  }

  /**
   * Build operating activities section
   *
   * @param period - Report period
   * @returns Operating activities section
   */
  private async buildOperatingActivities(period: ReportPeriod): Promise<CashFlowSection> {
    // TODO: Implement operating activities
    throw new Error('Not implemented')
  }

  /**
   * Build investing activities section
   *
   * @param period - Report period
   * @returns Investing activities section
   */
  private async buildInvestingActivities(period: ReportPeriod): Promise<CashFlowSection> {
    // TODO: Implement investing activities
    throw new Error('Not implemented')
  }

  /**
   * Build financing activities section
   *
   * @param period - Report period
   * @returns Financing activities section
   */
  private async buildFinancingActivities(period: ReportPeriod): Promise<CashFlowSection> {
    // TODO: Implement financing activities
    throw new Error('Not implemented')
  }

  // =========================================================================
  // Utility Methods
  // =========================================================================

  /**
   * Get fiscal year dates
   *
   * @param year - Calendar year
   * @returns Start and end timestamps for the fiscal year
   */
  getFiscalYear(year: number): ReportPeriod {
    const startMonth = this.config.fiscalYearStartMonth || 1
    const start = new Date(year, startMonth - 1, 1).getTime()
    const end = new Date(year + 1, startMonth - 1, 0, 23, 59, 59, 999).getTime()

    return {
      start,
      end,
      label: `FY ${year}`,
    }
  }

  /**
   * Get fiscal quarter dates
   *
   * @param year - Calendar year
   * @param quarter - Quarter (1-4)
   * @returns Start and end timestamps for the quarter
   */
  getFiscalQuarter(year: number, quarter: number): ReportPeriod {
    const startMonth = this.config.fiscalYearStartMonth || 1
    const quarterStartMonth = startMonth + (quarter - 1) * 3 - 1

    const start = new Date(year, quarterStartMonth, 1).getTime()
    const end = new Date(year, quarterStartMonth + 3, 0, 23, 59, 59, 999).getTime()

    return {
      start,
      end,
      label: `Q${quarter} FY ${year}`,
    }
  }

  /**
   * Get calendar month dates
   *
   * @param year - Calendar year
   * @param month - Month (1-12)
   * @returns Start and end timestamps for the month
   */
  getMonth(year: number, month: number): ReportPeriod {
    const start = new Date(year, month - 1, 1).getTime()
    const end = new Date(year, month, 0, 23, 59, 59, 999).getTime()
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ]

    return {
      start,
      end,
      label: `${monthNames[month - 1]} ${year}`,
    }
  }

  /**
   * Format a currency amount
   *
   * @param amount - Amount in smallest currency unit
   * @param currency - Currency code
   * @returns Formatted string
   */
  formatCurrency(amount: number, currency?: string): string {
    const curr = currency || this.config.defaultCurrency || 'USD'
    const formatted = (amount / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: curr,
    })
    return formatted
  }

  /**
   * Calculate percentage change
   *
   * @param current - Current value
   * @param previous - Previous value
   * @returns Percentage change
   */
  calculatePercentageChange(current: number, previous: number): number {
    if (previous === 0) {
      return current === 0 ? 0 : 100
    }
    return ((current - previous) / Math.abs(previous)) * 100
  }

  /**
   * Generate all standard reports for a period
   *
   * @param period - Report period
   * @returns All financial reports
   */
  async generateAllReports(period: ReportPeriod): Promise<{
    profitAndLoss: ProfitAndLoss
    balanceSheet: BalanceSheet
    cashFlow: CashFlowStatement
  }> {
    const [profitAndLoss, balanceSheet, cashFlow] = await Promise.all([
      this.generateProfitAndLoss(period),
      this.generateBalanceSheet(period.end),
      this.generateCashFlow(period),
    ])

    return { profitAndLoss, balanceSheet, cashFlow }
  }
}

/**
 * Report error codes
 */
export const ReportErrorCodes = {
  INVALID_PERIOD: 'INVALID_PERIOD',
  NO_DATA: 'NO_DATA',
  BALANCE_MISMATCH: 'BALANCE_MISMATCH',
  MISSING_ACCOUNTS: 'MISSING_ACCOUNTS',
} as const

export type ReportErrorCode = typeof ReportErrorCodes[keyof typeof ReportErrorCodes]

/**
 * Report error
 */
export class ReportError extends Error {
  constructor(
    public readonly code: ReportErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'ReportError'
  }
}
