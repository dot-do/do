/**
 * Financial Metrics
 *
 * Calculates SaaS and revenue metrics:
 * - MRR/ARR tracking and movements
 * - Customer metrics and churn
 * - Unit economics (LTV, CAC, payback)
 *
 * @module financial/metrics
 */

import type {
  ReportPeriod,
  MRRMetrics,
  CustomerMetrics,
  Subscription,
  SubscriptionStatus,
} from '../../../types/financial'
import type { DigitalObjectRef } from '../../../types/identity'

/**
 * Configuration for metrics calculator
 */
export interface MetricsCalculatorConfig {
  /** Default currency */
  defaultCurrency?: string
  /** Active subscription statuses */
  activeStatuses?: SubscriptionStatus[]
  /** Trial statuses (excluded from MRR) */
  trialStatuses?: SubscriptionStatus[]
}

/**
 * Detailed MRR movement breakdown
 */
export interface MRRMovement {
  /** Movement type */
  type: 'new' | 'expansion' | 'contraction' | 'churn' | 'reactivation'
  /** Customer reference */
  customerRef: DigitalObjectRef
  /** Subscription ID */
  subscriptionId: string
  /** Previous MRR (0 for new) */
  previousMRR: number
  /** New MRR (0 for churn) */
  newMRR: number
  /** MRR change amount */
  change: number
  /** Movement date */
  date: number
  /** Movement reason */
  reason?: string
}

/**
 * Customer cohort for analysis
 */
export interface CustomerCohort {
  /** Cohort identifier (e.g., "2024-01") */
  cohortId: string
  /** Cohort start date */
  startDate: number
  /** Number of customers in cohort */
  customerCount: number
  /** Initial MRR */
  initialMRR: number
  /** Retention by month */
  retention: Array<{
    month: number
    customersRemaining: number
    mrrRemaining: number
    retentionRate: number
    revenueRetentionRate: number
  }>
}

/**
 * Revenue per customer analysis
 */
export interface RevenueAnalysis {
  /** Period */
  period: ReportPeriod
  /** Average revenue per user */
  arpu: number
  /** Average revenue per paying user */
  arppu: number
  /** Revenue by plan tier */
  byTier: Array<{
    tierId: string
    tierName: string
    customerCount: number
    mrr: number
    percentage: number
  }>
  /** Revenue concentration */
  concentration: {
    top10Percent: number
    top20Percent: number
  }
}

/**
 * Unit economics metrics
 */
export interface UnitEconomics {
  /** Period */
  period: ReportPeriod
  /** Customer lifetime value */
  ltv: number
  /** Customer acquisition cost */
  cac: number
  /** LTV/CAC ratio */
  ltvCacRatio: number
  /** CAC payback period (months) */
  cacPaybackMonths: number
  /** Gross margin */
  grossMargin: number
  /** Net revenue retention */
  netRevenueRetention: number
}

/**
 * Subscription cohort analysis
 */
export interface CohortAnalysis {
  /** Cohorts */
  cohorts: CustomerCohort[]
  /** Average retention by month */
  averageRetention: Array<{
    month: number
    customerRetention: number
    revenueRetention: number
  }>
}

/**
 * Metrics calculator for Digital Objects
 *
 * Calculates SaaS revenue metrics including MRR, churn,
 * and customer lifetime value.
 *
 * @example
 * ```typescript
 * const metrics = new MetricsCalculator()
 *
 * // Get MRR metrics for last month
 * const mrr = await metrics.getMRRMetrics({
 *   start: startOfMonth,
 *   end: endOfMonth
 * }, subscriptions)
 *
 * console.log('Ending MRR:', mrr.endingMRR)
 * console.log('Net New MRR:', mrr.netNewMRR)
 * console.log('Growth Rate:', mrr.growthRate, '%')
 * ```
 */
export class MetricsCalculator {
  private readonly config: MetricsCalculatorConfig

  /**
   * Create a new MetricsCalculator instance
   *
   * @param config - Metrics calculator configuration
   */
  constructor(config: MetricsCalculatorConfig = {}) {
    this.config = {
      defaultCurrency: 'usd',
      activeStatuses: ['Active', 'PastDue'],
      trialStatuses: ['Trialing'],
      ...config,
    }
  }

  // =========================================================================
  // MRR Metrics
  // =========================================================================

  /**
   * Calculate MRR metrics for a period
   *
   * @param period - Report period
   * @param subscriptions - List of subscriptions to analyze
   * @returns MRR metrics
   *
   * @example
   * ```typescript
   * const mrr = await metrics.getMRRMetrics(period, subscriptions)
   *
   * // MRR breakdown
   * console.log('New MRR:', mrr.newMRR)
   * console.log('Expansion MRR:', mrr.expansionMRR)
   * console.log('Contraction MRR:', mrr.contractionMRR)
   * console.log('Churned MRR:', mrr.churnedMRR)
   * ```
   */
  async getMRRMetrics(
    period: ReportPeriod,
    subscriptions: Subscription[]
  ): Promise<MRRMetrics> {
    // TODO: Implement MRR calculation
    throw new Error('Not implemented')
  }

  /**
   * Get detailed MRR movements for a period
   *
   * @param period - Report period
   * @param subscriptions - List of subscriptions
   * @returns List of MRR movements
   */
  async getMRRMovements(
    period: ReportPeriod,
    subscriptions: Subscription[]
  ): Promise<MRRMovement[]> {
    // TODO: Implement MRR movement tracking
    throw new Error('Not implemented')
  }

  /**
   * Calculate MRR for a single subscription
   *
   * Normalizes annual plans to monthly equivalent.
   *
   * @param subscription - The subscription
   * @param priceAmount - Price amount in smallest currency unit
   * @param interval - Billing interval
   * @returns Monthly recurring revenue
   */
  calculateSubscriptionMRR(
    subscription: Subscription,
    priceAmount: number,
    interval: 'month' | 'year'
  ): number {
    const quantity = subscription.quantity || 1

    if (interval === 'year') {
      return Math.round((priceAmount * quantity) / 12)
    }

    return priceAmount * quantity
  }

  /**
   * Calculate ARR from MRR
   *
   * @param mrr - Monthly recurring revenue
   * @returns Annual recurring revenue
   */
  calculateARR(mrr: number): number {
    return mrr * 12
  }

  /**
   * Get MRR trend over time
   *
   * @param periods - List of periods to analyze
   * @param subscriptions - List of subscriptions
   * @returns MRR metrics for each period
   */
  async getMRRTrend(
    periods: ReportPeriod[],
    subscriptions: Subscription[]
  ): Promise<MRRMetrics[]> {
    // TODO: Implement MRR trend calculation
    throw new Error('Not implemented')
  }

  // =========================================================================
  // Customer Metrics
  // =========================================================================

  /**
   * Calculate customer metrics for a period
   *
   * @param period - Report period
   * @param subscriptions - List of subscriptions
   * @returns Customer metrics
   *
   * @example
   * ```typescript
   * const customers = await metrics.getCustomerMetrics(period, subscriptions)
   *
   * console.log('Total Customers:', customers.totalCustomers)
   * console.log('Churn Rate:', customers.churnRate, '%')
   * console.log('ARPC:', customers.arpc)
   * ```
   */
  async getCustomerMetrics(
    period: ReportPeriod,
    subscriptions: Subscription[]
  ): Promise<CustomerMetrics> {
    // TODO: Implement customer metrics calculation
    throw new Error('Not implemented')
  }

  /**
   * Calculate customer churn rate
   *
   * @param churnedCustomers - Number of churned customers
   * @param startingCustomers - Number of customers at period start
   * @returns Churn rate as percentage
   */
  calculateChurnRate(churnedCustomers: number, startingCustomers: number): number {
    if (startingCustomers === 0) return 0
    return (churnedCustomers / startingCustomers) * 100
  }

  /**
   * Calculate revenue churn rate
   *
   * @param churnedMRR - MRR lost to churn
   * @param startingMRR - MRR at period start
   * @returns Revenue churn rate as percentage
   */
  calculateRevenueChurnRate(churnedMRR: number, startingMRR: number): number {
    if (startingMRR === 0) return 0
    return (churnedMRR / startingMRR) * 100
  }

  /**
   * Calculate net revenue retention
   *
   * @param metrics - MRR metrics
   * @returns Net revenue retention as percentage
   */
  calculateNetRevenueRetention(metrics: MRRMetrics): number {
    if (metrics.startingMRR === 0) return 100
    const retained = metrics.startingMRR + metrics.expansionMRR -
      metrics.contractionMRR - metrics.churnedMRR
    return (retained / metrics.startingMRR) * 100
  }

  /**
   * Calculate gross revenue retention
   *
   * @param metrics - MRR metrics
   * @returns Gross revenue retention as percentage
   */
  calculateGrossRevenueRetention(metrics: MRRMetrics): number {
    if (metrics.startingMRR === 0) return 100
    const retained = metrics.startingMRR - metrics.contractionMRR - metrics.churnedMRR
    return (retained / metrics.startingMRR) * 100
  }

  // =========================================================================
  // Unit Economics
  // =========================================================================

  /**
   * Calculate unit economics
   *
   * @param period - Report period
   * @param subscriptions - List of subscriptions
   * @param marketingSpend - Total marketing spend in period
   * @param cogs - Cost of goods sold
   * @returns Unit economics metrics
   */
  async getUnitEconomics(
    period: ReportPeriod,
    subscriptions: Subscription[],
    marketingSpend: number,
    cogs: number
  ): Promise<UnitEconomics> {
    // TODO: Implement unit economics calculation
    throw new Error('Not implemented')
  }

  /**
   * Calculate customer lifetime value
   *
   * Uses the formula: LTV = ARPU * Gross Margin / Churn Rate
   *
   * @param arpu - Average revenue per user (monthly)
   * @param grossMargin - Gross margin percentage (0-100)
   * @param monthlyChurnRate - Monthly churn rate percentage (0-100)
   * @returns Customer lifetime value
   */
  calculateLTV(
    arpu: number,
    grossMargin: number,
    monthlyChurnRate: number
  ): number {
    if (monthlyChurnRate === 0) {
      // No churn = infinite LTV, cap at reasonable multiple
      return arpu * (grossMargin / 100) * 120 // 10 year cap
    }
    return (arpu * (grossMargin / 100)) / (monthlyChurnRate / 100)
  }

  /**
   * Calculate customer acquisition cost
   *
   * @param marketingSpend - Total marketing spend
   * @param newCustomers - Number of new customers acquired
   * @returns Customer acquisition cost
   */
  calculateCAC(marketingSpend: number, newCustomers: number): number {
    if (newCustomers === 0) return 0
    return marketingSpend / newCustomers
  }

  /**
   * Calculate CAC payback period
   *
   * @param cac - Customer acquisition cost
   * @param arpu - Average revenue per user (monthly)
   * @param grossMargin - Gross margin percentage (0-100)
   * @returns Payback period in months
   */
  calculateCACPayback(cac: number, arpu: number, grossMargin: number): number {
    const monthlyContribution = arpu * (grossMargin / 100)
    if (monthlyContribution === 0) return Infinity
    return cac / monthlyContribution
  }

  /**
   * Calculate Quick Ratio
   *
   * Measures growth efficiency: (New + Expansion + Reactivation) / (Churn + Contraction)
   *
   * @param metrics - MRR metrics
   * @returns Quick ratio
   */
  calculateQuickRatio(metrics: MRRMetrics): number {
    const gains = metrics.newMRR + metrics.expansionMRR + metrics.reactivationMRR
    const losses = metrics.churnedMRR + metrics.contractionMRR
    if (losses === 0) return Infinity
    return gains / losses
  }

  // =========================================================================
  // Cohort Analysis
  // =========================================================================

  /**
   * Perform cohort analysis
   *
   * Groups customers by signup month and tracks retention over time.
   *
   * @param subscriptions - List of subscriptions
   * @param numberOfCohorts - Number of monthly cohorts to analyze
   * @returns Cohort analysis
   */
  async getCohortAnalysis(
    subscriptions: Subscription[],
    numberOfCohorts: number = 12
  ): Promise<CohortAnalysis> {
    // TODO: Implement cohort analysis
    throw new Error('Not implemented')
  }

  /**
   * Get retention curve for a cohort
   *
   * @param cohortId - Cohort identifier
   * @param subscriptions - List of subscriptions
   * @returns Customer cohort with retention data
   */
  async getCohortRetention(
    cohortId: string,
    subscriptions: Subscription[]
  ): Promise<CustomerCohort> {
    // TODO: Implement cohort retention calculation
    throw new Error('Not implemented')
  }

  // =========================================================================
  // Revenue Analysis
  // =========================================================================

  /**
   * Analyze revenue distribution
   *
   * @param period - Report period
   * @param subscriptions - List of subscriptions
   * @returns Revenue analysis
   */
  async getRevenueAnalysis(
    period: ReportPeriod,
    subscriptions: Subscription[]
  ): Promise<RevenueAnalysis> {
    // TODO: Implement revenue analysis
    throw new Error('Not implemented')
  }

  /**
   * Calculate ARPU (Average Revenue Per User)
   *
   * @param totalMRR - Total MRR
   * @param totalCustomers - Total number of customers
   * @returns ARPU
   */
  calculateARPU(totalMRR: number, totalCustomers: number): number {
    if (totalCustomers === 0) return 0
    return totalMRR / totalCustomers
  }

  // =========================================================================
  // Forecasting
  // =========================================================================

  /**
   * Forecast future MRR
   *
   * Simple linear forecast based on recent growth rate.
   *
   * @param currentMRR - Current MRR
   * @param growthRate - Monthly growth rate percentage
   * @param months - Number of months to forecast
   * @returns Forecasted MRR for each month
   */
  forecastMRR(
    currentMRR: number,
    growthRate: number,
    months: number
  ): number[] {
    const forecast: number[] = []
    let mrr = currentMRR

    for (let i = 0; i < months; i++) {
      mrr = mrr * (1 + growthRate / 100)
      forecast.push(Math.round(mrr))
    }

    return forecast
  }

  /**
   * Calculate time to target MRR
   *
   * @param currentMRR - Current MRR
   * @param targetMRR - Target MRR
   * @param growthRate - Monthly growth rate percentage
   * @returns Number of months to reach target
   */
  calculateTimeToTarget(
    currentMRR: number,
    targetMRR: number,
    growthRate: number
  ): number {
    if (growthRate <= 0 || currentMRR >= targetMRR) return 0
    return Math.ceil(
      Math.log(targetMRR / currentMRR) / Math.log(1 + growthRate / 100)
    )
  }
}

/**
 * Metrics error codes
 */
export const MetricsErrorCodes = {
  INVALID_PERIOD: 'INVALID_PERIOD',
  NO_DATA: 'NO_DATA',
  CALCULATION_ERROR: 'CALCULATION_ERROR',
} as const

export type MetricsErrorCode = typeof MetricsErrorCodes[keyof typeof MetricsErrorCodes]

/**
 * Metrics error
 */
export class MetricsError extends Error {
  constructor(
    public readonly code: MetricsErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'MetricsError'
  }
}
