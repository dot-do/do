/**
 * SaaS DO - Multi-Tenancy and Tenant Isolation
 *
 * Multi-tenant SaaS application platform with configurable tenant isolation.
 * Manages subscriptions, billing, feature flags, and usage limits.
 *
 * Key capabilities:
 * - Multi-tenant architecture with isolation levels
 * - Subscription and billing management
 * - Feature flags per plan
 * - Usage tracking and rate limiting
 * - Tenant provisioning and lifecycle
 *
 * @example
 * ```typescript
 * const saas: SaaSDO = {
 *   $id: 'https://crm.headless.ly',
 *   $type: 'SaaS',
 *   $context: 'https://headless.ly',
 *   $version: 1,
 *   $createdAt: Date.now(),
 *   $updatedAt: Date.now(),
 *   name: 'Headless CRM',
 *   tenantIsolation: 'Database',
 *   plans: ['free', 'pro', 'enterprise']
 * }
 * ```
 */

import type { DigitalObjectIdentity, DigitalObjectRef } from './identity'
import type { CollectionMethods } from './collections'

// =============================================================================
// SaaS DO Identity
// =============================================================================

/**
 * Tenant isolation level
 *
 * - `Database`: Each tenant gets its own database (highest isolation)
 * - `Schema`: Each tenant gets its own schema in shared database
 * - `Row`: All tenants share tables with row-level filtering
 * - `Hybrid`: Mix of isolation levels based on tenant tier
 */
export type TenantIsolationLevel = 'Database' | 'Schema' | 'Row' | 'Hybrid'

/**
 * SaaS DO configuration extending base identity
 */
export interface SaaSDO extends DigitalObjectIdentity {
  /** Always 'SaaS' for this DO type */
  $type: 'SaaS'

  /** Parent Startup or Business DO reference */
  $context: DigitalObjectRef

  /** SaaS product name */
  name: string

  /** Product description */
  description?: string

  /** Logo URL */
  logo?: string

  /** Primary domain */
  domain?: string

  /** Tenant isolation level */
  tenantIsolation: TenantIsolationLevel

  /** Available plan IDs */
  plans: string[]

  /** SaaS settings */
  settings?: SaaSSettings

  /** SaaS metrics */
  metrics?: SaaSMetrics
}

// =============================================================================
// Settings and Configuration
// =============================================================================

/**
 * SaaS settings
 */
export interface SaaSSettings {
  /** Default plan for new tenants */
  defaultPlan?: string

  /** Allow self-service signup */
  selfServiceSignup?: boolean

  /** Require approval for new tenants */
  requireApproval?: boolean

  /** Trial period in days */
  trialDays?: number

  /** Default billing currency */
  currency?: string

  /** Billing provider */
  billingProvider?: 'Stripe' | 'Paddle' | 'Chargebee' | 'Custom'

  /** Default rate limit tier */
  defaultRateLimitTier?: string

  /** Enable usage-based billing */
  usageBasedBilling?: boolean

  /** Custom domain support */
  customDomainSupport?: boolean

  /** SSO support */
  ssoSupport?: boolean
}

/**
 * SaaS metrics
 */
export interface SaaSMetrics {
  /** Total tenants */
  totalTenants: number

  /** Active tenants (last 30 days) */
  activeTenants: number

  /** Monthly Recurring Revenue */
  mrr: number

  /** Annual Recurring Revenue */
  arr: number

  /** Average Revenue Per User */
  arpu: number

  /** Churn rate (percentage) */
  churnRate: number

  /** Net Revenue Retention */
  nrr: number

  /** Last updated */
  updatedAt: number
}

// =============================================================================
// Tenant Types
// =============================================================================

/**
 * Tenant status
 */
export type TenantStatus =
  | 'Pending'      // Awaiting approval
  | 'Provisioning' // Being set up
  | 'Trial'        // In trial period
  | 'Active'       // Active subscription
  | 'PastDue'      // Payment overdue
  | 'Suspended'    // Temporarily suspended
  | 'Cancelled'    // Subscription cancelled
  | 'Churned'      // Left the platform

/**
 * Tenant definition (stored in SaaS DO, references Tenant DO)
 */
export interface Tenant {
  /** Tenant ID */
  id: string

  /** Tenant name */
  name: string

  /** Tenant slug (URL-friendly) */
  slug: string

  /** Reference to Tenant DO */
  $ref?: DigitalObjectRef

  /** Current status */
  status: TenantStatus

  /** Current plan ID */
  planId: string

  /** Subscription ID (from billing provider) */
  subscriptionId?: string

  /** Owner user ID */
  ownerId: string

  /** Owner email */
  ownerEmail: string

  /** Tenant settings */
  settings?: TenantSettings

  /** Custom domain (if enabled) */
  customDomain?: string

  /** Trial end date */
  trialEndsAt?: number

  /** Billing cycle anchor */
  billingCycleAnchor?: number

  /** Created timestamp */
  createdAt: number

  /** Updated timestamp */
  updatedAt: number
}

/**
 * Tenant settings
 */
export interface TenantSettings {
  /** Timezone */
  timezone?: string

  /** Locale */
  locale?: string

  /** Date format */
  dateFormat?: string

  /** SSO configuration */
  sso?: {
    enabled: boolean
    provider?: 'Okta' | 'AzureAD' | 'Google' | 'Custom'
    config?: Record<string, unknown>
  }

  /** Custom branding */
  branding?: {
    logo?: string
    primaryColor?: string
    accentColor?: string
  }
}

// =============================================================================
// Plan and Feature Types
// =============================================================================

/**
 * Subscription plan
 */
export interface Plan {
  /** Plan ID */
  id: string

  /** Plan name */
  name: string

  /** Plan description */
  description?: string

  /** Price per billing period */
  price: number

  /** Billing period */
  billingPeriod: 'Monthly' | 'Yearly' | 'Usage'

  /** Currency */
  currency: string

  /** Feature IDs included */
  features: string[]

  /** Limits for this plan */
  limits: PlanLimits

  /** Is this the default plan */
  isDefault?: boolean

  /** Is this a trial plan */
  isTrial?: boolean

  /** Sort order */
  sortOrder?: number

  /** Active status */
  active: boolean
}

/**
 * Plan limits
 */
export interface PlanLimits {
  /** Maximum users */
  maxUsers?: number

  /** Maximum storage (bytes) */
  maxStorage?: number

  /** Maximum API calls per month */
  maxApiCalls?: number

  /** Maximum records */
  maxRecords?: number

  /** Rate limit (requests per minute) */
  rateLimit?: number

  /** Custom limits */
  custom?: Record<string, number>
}

/**
 * Feature flag
 */
export interface Feature {
  /** Feature ID */
  id: string

  /** Feature name */
  name: string

  /** Feature description */
  description?: string

  /** Feature type */
  type: 'Boolean' | 'Numeric' | 'String' | 'Json'

  /** Default value */
  defaultValue: unknown

  /** Plan-specific overrides */
  planOverrides?: Record<string, unknown>

  /** Active status */
  active: boolean
}

// =============================================================================
// Billing Types
// =============================================================================

/**
 * Subscription record
 */
export interface Subscription {
  /** Subscription ID */
  id: string

  /** Tenant ID */
  tenantId: string

  /** Plan ID */
  planId: string

  /** Status */
  status: 'Active' | 'PastDue' | 'Cancelled' | 'Paused'

  /** External subscription ID (from billing provider) */
  externalId?: string

  /** Current period start */
  currentPeriodStart: number

  /** Current period end */
  currentPeriodEnd: number

  /** Cancel at period end */
  cancelAtPeriodEnd?: boolean

  /** Cancelled timestamp */
  cancelledAt?: number

  /** Created timestamp */
  createdAt: number

  /** Updated timestamp */
  updatedAt: number
}

/**
 * Invoice record
 */
export interface Invoice {
  /** Invoice ID */
  id: string

  /** Tenant ID */
  tenantId: string

  /** Subscription ID */
  subscriptionId: string

  /** Invoice number */
  invoiceNumber: string

  /** Status */
  status: 'Draft' | 'Open' | 'Paid' | 'Void' | 'Uncollectible'

  /** Total amount */
  amount: number

  /** Currency */
  currency: string

  /** Line items */
  lineItems: InvoiceLineItem[]

  /** Due date */
  dueAt: number

  /** Paid timestamp */
  paidAt?: number

  /** External invoice ID */
  externalId?: string

  /** Invoice URL */
  invoiceUrl?: string

  /** Created timestamp */
  createdAt: number
}

/**
 * Invoice line item
 */
export interface InvoiceLineItem {
  /** Description */
  description: string

  /** Quantity */
  quantity: number

  /** Unit price */
  unitPrice: number

  /** Total amount */
  amount: number

  /** Period start */
  periodStart?: number

  /** Period end */
  periodEnd?: number
}

// =============================================================================
// Usage and Rate Limiting Types
// =============================================================================

/**
 * Usage record
 */
export interface UsageRecord {
  /** Record ID */
  id: string

  /** Tenant ID */
  tenantId: string

  /** Usage metric name */
  metric: string

  /** Usage value */
  value: number

  /** Period start */
  periodStart: number

  /** Period end */
  periodEnd: number

  /** Breakdown by dimension */
  breakdown?: Record<string, number>

  /** Created timestamp */
  createdAt: number
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Config ID */
  id: string

  /** Name */
  name: string

  /** Requests per window */
  limit: number

  /** Window size in seconds */
  windowSeconds: number

  /** Apply to these plans */
  planIds?: string[]

  /** Apply to these endpoints */
  endpoints?: string[]

  /** Burst allowance */
  burstLimit?: number

  /** Active status */
  active: boolean
}

/**
 * Rate limit status for a tenant
 */
export interface RateLimitStatus {
  /** Tenant ID */
  tenantId: string

  /** Limit applied */
  limit: number

  /** Remaining requests */
  remaining: number

  /** Window reset timestamp */
  resetAt: number

  /** Is currently limited */
  limited: boolean
}

// =============================================================================
// SaaS Collections Interface
// =============================================================================

/**
 * SaaS DO collections
 */
export interface SaaSCollections {
  /** Tenants */
  tenants: CollectionMethods<Tenant>

  /** Subscription plans */
  plans: CollectionMethods<Plan>

  /** Feature flags */
  features: CollectionMethods<Feature>

  /** Subscriptions */
  subscriptions: CollectionMethods<Subscription>

  /** Invoices */
  invoices: CollectionMethods<Invoice>

  /** Usage records */
  usage: CollectionMethods<UsageRecord>

  /** Rate limit configs */
  rateLimits: CollectionMethods<RateLimitConfig>
}

// =============================================================================
// SaaS RPC Methods
// =============================================================================

/**
 * Tenant creation options
 */
export interface CreateTenantOptions {
  /** Tenant name */
  name: string

  /** Tenant slug */
  slug: string

  /** Owner email */
  ownerEmail: string

  /** Initial plan */
  planId?: string

  /** Start trial */
  startTrial?: boolean

  /** Provision Tenant DO */
  provisionDO?: boolean

  /** Initial settings */
  settings?: TenantSettings
}

/**
 * Tenant provisioning result
 */
export interface TenantProvisionResult {
  /** Tenant record */
  tenant: Tenant

  /** Tenant DO reference (if provisioned) */
  tenantDORef?: DigitalObjectRef

  /** Provisioning status */
  status: 'Completed' | 'Pending' | 'Failed'

  /** Error message (if failed) */
  error?: string
}

/**
 * Usage metering options
 */
export interface MeterUsageOptions {
  /** Tenant ID */
  tenantId: string

  /** Metric name */
  metric: string

  /** Usage value */
  value: number

  /** Idempotency key */
  idempotencyKey?: string

  /** Dimensions for breakdown */
  dimensions?: Record<string, string>
}

/**
 * Feature check result
 */
export interface FeatureCheckResult {
  /** Feature ID */
  featureId: string

  /** Is enabled */
  enabled: boolean

  /** Feature value */
  value: unknown

  /** Reason if disabled */
  reason?: 'PlanLimit' | 'Disabled' | 'NotFound'
}

/**
 * SaaS DO RPC methods
 */
export interface SaaSRPCMethods {
  // =========================================================================
  // Tenant Methods
  // =========================================================================

  /**
   * Create new tenant
   */
  'saas.tenants.create': (options: CreateTenantOptions) => Promise<TenantProvisionResult>

  /**
   * Provision tenant resources
   */
  'saas.tenants.provision': (tenantId: string) => Promise<TenantProvisionResult>

  /**
   * Get tenant by ID
   */
  'saas.tenants.get': (tenantId: string) => Promise<Tenant | null>

  /**
   * Get tenant by slug
   */
  'saas.tenants.getBySlug': (slug: string) => Promise<Tenant | null>

  /**
   * Update tenant
   */
  'saas.tenants.update': (tenantId: string, data: Partial<Tenant>) => Promise<Tenant>

  /**
   * Suspend tenant
   */
  'saas.tenants.suspend': (tenantId: string, reason?: string) => Promise<Tenant>

  /**
   * Reactivate tenant
   */
  'saas.tenants.reactivate': (tenantId: string) => Promise<Tenant>

  /**
   * Delete tenant (and associated Tenant DO)
   */
  'saas.tenants.delete': (tenantId: string) => Promise<void>

  /**
   * Verify tenant isolation
   */
  'saas.tenants.isolate': (tenantId: string) => Promise<{ isolated: boolean; issues?: string[] }>

  // =========================================================================
  // Billing Methods
  // =========================================================================

  /**
   * Record usage for billing
   */
  'saas.billing.meter': (options: MeterUsageOptions) => Promise<UsageRecord>

  /**
   * Get usage for tenant
   */
  'saas.billing.usage': (
    tenantId: string,
    options?: { metric?: string; startDate?: number; endDate?: number }
  ) => Promise<UsageRecord[]>

  /**
   * Generate invoice
   */
  'saas.billing.invoice': (tenantId: string, periodEnd?: number) => Promise<Invoice>

  /**
   * Get upcoming invoice
   */
  'saas.billing.upcoming': (tenantId: string) => Promise<Invoice>

  /**
   * Change subscription plan
   */
  'saas.billing.changePlan': (
    tenantId: string,
    newPlanId: string,
    options?: { prorate?: boolean; immediate?: boolean }
  ) => Promise<Subscription>

  /**
   * Cancel subscription
   */
  'saas.billing.cancel': (
    tenantId: string,
    options?: { immediate?: boolean; reason?: string }
  ) => Promise<Subscription>

  // =========================================================================
  // Feature Methods
  // =========================================================================

  /**
   * Check feature access for tenant
   */
  'saas.features.check': (tenantId: string, featureId: string) => Promise<FeatureCheckResult>

  /**
   * Check multiple features
   */
  'saas.features.checkAll': (tenantId: string, featureIds: string[]) => Promise<Record<string, FeatureCheckResult>>

  /**
   * Get all features for tenant's plan
   */
  'saas.features.list': (tenantId: string) => Promise<Array<{ feature: Feature; enabled: boolean; value: unknown }>>

  // =========================================================================
  // Rate Limit Methods
  // =========================================================================

  /**
   * Check rate limit status
   */
  'saas.limits.check': (tenantId: string, endpoint?: string) => Promise<RateLimitStatus>

  /**
   * Consume rate limit
   */
  'saas.limits.consume': (tenantId: string, count?: number, endpoint?: string) => Promise<RateLimitStatus>

  /**
   * Reset rate limit (admin)
   */
  'saas.limits.reset': (tenantId: string) => Promise<void>

  /**
   * Check plan limits
   */
  'saas.limits.plan': (tenantId: string) => Promise<{
    limits: PlanLimits
    usage: Record<string, number>
    remaining: Record<string, number>
  }>

  // =========================================================================
  // Metrics Methods
  // =========================================================================

  /**
   * Get SaaS metrics
   */
  'saas.metrics.get': () => Promise<SaaSMetrics>

  /**
   * Get metrics breakdown
   */
  'saas.metrics.breakdown': (options?: {
    metric?: keyof SaaSMetrics
    groupBy?: 'Plan' | 'Status' | 'Period'
  }) => Promise<Record<string, number>>
}

// =============================================================================
// SaaS CDC Events
// =============================================================================

/**
 * SaaS CDC event types
 */
export type SaaSCDCEvent =
  | { type: 'SaaS.Tenant.created'; payload: { tenantId: string; name: string; planId: string } }
  | { type: 'SaaS.Tenant.provisioned'; payload: { tenantId: string; tenantDORef?: DigitalObjectRef } }
  | { type: 'SaaS.Tenant.updated'; payload: { tenantId: string; changes: string[] } }
  | { type: 'SaaS.Tenant.suspended'; payload: { tenantId: string; reason?: string } }
  | { type: 'SaaS.Tenant.reactivated'; payload: { tenantId: string } }
  | { type: 'SaaS.Tenant.deleted'; payload: { tenantId: string } }
  | { type: 'SaaS.Subscription.created'; payload: { subscriptionId: string; tenantId: string; planId: string } }
  | { type: 'SaaS.Subscription.changed'; payload: { subscriptionId: string; fromPlan: string; toPlan: string } }
  | { type: 'SaaS.Subscription.cancelled'; payload: { subscriptionId: string; tenantId: string } }
  | { type: 'SaaS.Invoice.created'; payload: { invoiceId: string; tenantId: string; amount: number } }
  | { type: 'SaaS.Invoice.paid'; payload: { invoiceId: string; tenantId: string; amount: number } }
  | { type: 'SaaS.Usage.recorded'; payload: { tenantId: string; metric: string; value: number } }
  | { type: 'SaaS.Limit.exceeded'; payload: { tenantId: string; limitType: string; current: number; limit: number } }

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if entity is a SaaSDO
 */
export function isSaaSDO(obj: unknown): obj is SaaSDO {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    '$type' in obj &&
    (obj as SaaSDO).$type === 'SaaS'
  )
}

/**
 * Check if tenant is active
 */
export function isTenantActive(tenant: Tenant): boolean {
  return tenant.status === 'Active' || tenant.status === 'Trial'
}

/**
 * Check if tenant is billable
 */
export function isTenantBillable(tenant: Tenant): boolean {
  return tenant.status === 'Active' || tenant.status === 'PastDue'
}

/**
 * Check if feature is enabled for tenant
 */
export function isFeatureEnabled(result: FeatureCheckResult): boolean {
  return result.enabled === true
}
