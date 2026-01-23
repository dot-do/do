/**
 * Business DO - Portfolio Management and Analytics Aggregation
 *
 * Top-level organization managing a portfolio of startups, SaaS products, and services.
 * Acts as the root of the DO hierarchy with no $context (it IS the context).
 *
 * Key capabilities:
 * - Portfolio management across multiple startups
 * - Analytics aggregation from all child DOs
 * - Investment tracking and KPI monitoring
 * - CDC event sink for data lake (R2/Iceberg)
 *
 * @example
 * ```typescript
 * const business: BusinessDO = {
 *   $id: 'https://startups.studio',
 *   $type: 'Business',
 *   $version: 1,
 *   $createdAt: Date.now(),
 *   $updatedAt: Date.now(),
 *   name: 'Startups.Studio',
 *   portfolio: {
 *     startupRefs: ['https://headless.ly', 'https://agents.do'],
 *     saasRefs: [],
 *     serviceRefs: ['https://llm.do']
 *   }
 * }
 * ```
 */

import type { DigitalObjectIdentity, DigitalObjectRef } from './identity'
import type { CollectionMethods, ListOptions, ListResult } from './collections'

// =============================================================================
// Business DO Identity
// =============================================================================

/**
 * Business DO configuration extending base identity
 *
 * @remarks
 * Business DO is the top-level organization. It does not have a $context
 * because it IS the root context for all child DOs.
 */
export interface BusinessDO extends DigitalObjectIdentity {
  /** Always 'Business' for this DO type */
  $type: 'Business'

  /** Business has no parent context - it's the root */
  $context?: never

  /** Business name */
  name: string

  /** Business description */
  description?: string

  /** Business logo URL */
  logo?: string

  /** Primary domain */
  domain?: string

  /** Portfolio configuration */
  portfolio: BusinessPortfolio

  /** Business settings */
  settings?: BusinessSettings

  /** Business metadata */
  metadata?: BusinessMetadata
}

// =============================================================================
// Portfolio Types
// =============================================================================

/**
 * Portfolio of startups, SaaS products, and services
 */
export interface BusinessPortfolio {
  /** References to Startup DOs */
  startupRefs: DigitalObjectRef[]

  /** References to SaaS DOs */
  saasRefs: DigitalObjectRef[]

  /** References to Service DOs */
  serviceRefs: DigitalObjectRef[]

  /** Total portfolio value */
  totalValue?: number

  /** Portfolio health score (0-100) */
  healthScore?: number
}

/**
 * Business settings
 */
export interface BusinessSettings {
  /** Default timezone */
  timezone?: string

  /** Default currency */
  currency?: string

  /** Fiscal year start month (1-12) */
  fiscalYearStart?: number

  /** Enable analytics aggregation */
  aggregateAnalytics?: boolean

  /** Analytics retention days */
  analyticsRetentionDays?: number

  /** CDC streaming to data lake */
  cdcToDataLake?: boolean

  /** Data lake destination */
  dataLakeDestination?: 'R2' | 'Iceberg' | 'S3'
}

/**
 * Business metadata
 */
export interface BusinessMetadata {
  /** Founded date */
  foundedAt?: number

  /** Industry classification */
  industry?: string

  /** Headquarters location */
  headquarters?: string

  /** Team size */
  teamSize?: number

  /** Custom labels */
  labels?: Record<string, string>
}

// =============================================================================
// Collection Types
// =============================================================================

/**
 * Startup reference in portfolio
 */
export interface StartupRef {
  /** Startup DO reference URL */
  $ref: DigitalObjectRef

  /** Startup name */
  name: string

  /** Current stage */
  stage: string

  /** Revenue (if any) */
  revenue?: number

  /** Growth rate */
  growth?: number

  /** Last updated */
  updatedAt: number
}

/**
 * SaaS product reference in portfolio
 */
export interface SaaSRef {
  /** SaaS DO reference URL */
  $ref: DigitalObjectRef

  /** Product name */
  name: string

  /** MRR (Monthly Recurring Revenue) */
  mrr?: number

  /** Active tenants */
  tenantCount?: number

  /** Churn rate */
  churnRate?: number

  /** Last updated */
  updatedAt: number
}

/**
 * Service reference in portfolio
 */
export interface ServiceRef {
  /** Service DO reference URL */
  $ref: DigitalObjectRef

  /** Service name */
  name: string

  /** Monthly usage */
  monthlyUsage?: number

  /** Monthly revenue */
  monthlyRevenue?: number

  /** Active customers */
  customerCount?: number

  /** Last updated */
  updatedAt: number
}

/**
 * Investment record
 */
export interface Investment {
  /** Investment ID */
  id: string

  /** Target startup reference */
  targetRef: DigitalObjectRef

  /** Investment amount */
  amount: number

  /** Investment date */
  date: number

  /** Valuation at investment */
  valuation?: number

  /** Equity percentage */
  equity?: number

  /** Investment round */
  round?: 'PreSeed' | 'Seed' | 'SeriesA' | 'SeriesB' | 'SeriesC' | 'Later'

  /** Notes */
  notes?: string
}

/**
 * KPI record
 */
export interface KPI {
  /** KPI ID */
  id: string

  /** KPI name */
  name: string

  /** KPI type */
  type: 'Revenue' | 'Growth' | 'Engagement' | 'Efficiency' | 'Custom'

  /** Current value */
  value: number

  /** Target value */
  target?: number

  /** Previous period value */
  previousValue?: number

  /** Trend direction */
  trend?: 'Up' | 'Down' | 'Stable'

  /** Unit of measurement */
  unit?: string

  /** Last updated */
  updatedAt: number
}

/**
 * Aggregated analytics record
 */
export interface AnalyticsRecord {
  /** Record ID */
  id: string

  /** Source DO reference */
  sourceRef: DigitalObjectRef

  /** Metric name */
  metric: string

  /** Metric value */
  value: number

  /** Time period */
  period: 'Hour' | 'Day' | 'Week' | 'Month' | 'Quarter' | 'Year'

  /** Period start timestamp */
  periodStart: number

  /** Period end timestamp */
  periodEnd: number

  /** Dimensions for slicing */
  dimensions?: Record<string, string>

  /** Created timestamp */
  createdAt: number
}

// =============================================================================
// Business Collections Interface
// =============================================================================

/**
 * Business DO collections
 */
export interface BusinessCollections {
  /** Startup references */
  startups: CollectionMethods<StartupRef>

  /** SaaS product references */
  saasProducts: CollectionMethods<SaaSRef>

  /** Service references */
  services: CollectionMethods<ServiceRef>

  /** Investment records */
  investments: CollectionMethods<Investment>

  /** KPI records */
  kpis: CollectionMethods<KPI>

  /** Aggregated analytics */
  analytics: CollectionMethods<AnalyticsRecord>
}

// =============================================================================
// Business RPC Methods
// =============================================================================

/**
 * Portfolio list options
 */
export interface PortfolioListOptions extends ListOptions {
  /** Filter by type */
  type?: 'Startup' | 'SaaS' | 'Service'

  /** Filter by stage */
  stage?: string

  /** Minimum revenue */
  minRevenue?: number

  /** Include inactive */
  includeInactive?: boolean
}

/**
 * Portfolio entity (union type for list results)
 */
export type PortfolioEntity = StartupRef | SaaSRef | ServiceRef

/**
 * Aggregation options
 */
export interface AggregationOptions {
  /** Metrics to aggregate */
  metrics: string[]

  /** Time period */
  period: 'Day' | 'Week' | 'Month' | 'Quarter' | 'Year'

  /** Start date */
  startDate?: number

  /** End date */
  endDate?: number

  /** Group by dimensions */
  groupBy?: string[]
}

/**
 * Aggregation result
 */
export interface AggregationResult {
  /** Aggregated metrics */
  metrics: Record<string, number>

  /** Period */
  period: string

  /** Start timestamp */
  periodStart: number

  /** End timestamp */
  periodEnd: number

  /** Breakdown by group */
  breakdown?: Record<string, Record<string, number>>
}

/**
 * Report options
 */
export interface ReportOptions {
  /** Report type */
  type: 'Portfolio' | 'Investment' | 'Performance' | 'Custom'

  /** Report format */
  format?: 'JSON' | 'CSV' | 'PDF'

  /** Date range start */
  startDate?: number

  /** Date range end */
  endDate?: number

  /** Include sections */
  sections?: string[]
}

/**
 * Report result
 */
export interface ReportResult {
  /** Report ID */
  id: string

  /** Report type */
  type: string

  /** Generated timestamp */
  generatedAt: number

  /** Report data */
  data: Record<string, unknown>

  /** Download URL (if file format) */
  downloadUrl?: string
}

/**
 * Business DO RPC methods
 */
export interface BusinessRPCMethods {
  // =========================================================================
  // Portfolio Methods
  // =========================================================================

  /**
   * List all portfolio entities
   */
  'business.portfolio.list': (options?: PortfolioListOptions) => Promise<ListResult<PortfolioEntity>>

  /**
   * Add entity to portfolio
   */
  'business.portfolio.add': (ref: DigitalObjectRef, type: 'Startup' | 'SaaS' | 'Service') => Promise<void>

  /**
   * Remove entity from portfolio
   */
  'business.portfolio.remove': (ref: DigitalObjectRef) => Promise<void>

  /**
   * Get portfolio summary
   */
  'business.portfolio.summary': () => Promise<{
    totalStartups: number
    totalSaaS: number
    totalServices: number
    totalValue: number
    healthScore: number
  }>

  /**
   * Aggregate metrics across portfolio
   */
  'business.portfolio.aggregate': (options: AggregationOptions) => Promise<AggregationResult>

  // =========================================================================
  // Analytics Methods
  // =========================================================================

  /**
   * Roll up analytics from child DOs
   */
  'business.analytics.rollup': (options: AggregationOptions) => Promise<AggregationResult[]>

  /**
   * Query analytics
   */
  'business.analytics.query': (
    metric: string,
    options?: { period?: string; startDate?: number; endDate?: number }
  ) => Promise<AnalyticsRecord[]>

  /**
   * Export analytics to data lake
   */
  'business.analytics.export': (destination: 'R2' | 'Iceberg' | 'S3') => Promise<{ exportId: string; recordCount: number }>

  // =========================================================================
  // Investment Methods
  // =========================================================================

  /**
   * Record investment
   */
  'business.investments.record': (investment: Omit<Investment, 'id'>) => Promise<Investment>

  /**
   * Get investment history
   */
  'business.investments.history': (targetRef?: DigitalObjectRef) => Promise<Investment[]>

  /**
   * Calculate portfolio ROI
   */
  'business.investments.roi': () => Promise<{
    totalInvested: number
    currentValue: number
    roi: number
    irr?: number
  }>

  // =========================================================================
  // KPI Methods
  // =========================================================================

  /**
   * Update KPI
   */
  'business.kpis.update': (kpiId: string, value: number) => Promise<KPI>

  /**
   * Get KPI dashboard
   */
  'business.kpis.dashboard': () => Promise<KPI[]>

  /**
   * Set KPI target
   */
  'business.kpis.setTarget': (kpiId: string, target: number) => Promise<KPI>

  // =========================================================================
  // Report Methods
  // =========================================================================

  /**
   * Generate report
   */
  'business.reports.generate': (options: ReportOptions) => Promise<ReportResult>

  /**
   * List available reports
   */
  'business.reports.list': () => Promise<Array<{ id: string; type: string; generatedAt: number }>>
}

// =============================================================================
// Business CDC Events
// =============================================================================

/**
 * Business CDC event types
 */
export type BusinessCDCEvent =
  | { type: 'Business.Startup.added'; payload: { ref: DigitalObjectRef; name: string } }
  | { type: 'Business.Startup.removed'; payload: { ref: DigitalObjectRef } }
  | { type: 'Business.SaaS.added'; payload: { ref: DigitalObjectRef; name: string } }
  | { type: 'Business.SaaS.removed'; payload: { ref: DigitalObjectRef } }
  | { type: 'Business.Service.added'; payload: { ref: DigitalObjectRef; name: string } }
  | { type: 'Business.Service.removed'; payload: { ref: DigitalObjectRef } }
  | { type: 'Business.Investment.recorded'; payload: Investment }
  | { type: 'Business.KPI.updated'; payload: KPI }
  | { type: 'Business.Analytics.aggregated'; payload: { recordCount: number; period: string } }
  | { type: 'Business.Report.generated'; payload: { reportId: string; type: string } }

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if entity is a BusinessDO
 */
export function isBusinessDO(obj: unknown): obj is BusinessDO {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    '$type' in obj &&
    (obj as BusinessDO).$type === 'Business'
  )
}

/**
 * Check if ref is a StartupRef
 */
export function isStartupRef(ref: PortfolioEntity): ref is StartupRef {
  return 'stage' in ref
}

/**
 * Check if ref is a SaaSRef
 */
export function isSaaSRef(ref: PortfolioEntity): ref is SaaSRef {
  return 'tenantCount' in ref || 'mrr' in ref
}

/**
 * Check if ref is a ServiceRef
 */
export function isServiceRef(ref: PortfolioEntity): ref is ServiceRef {
  return 'monthlyUsage' in ref || 'customerCount' in ref
}
