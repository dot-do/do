/**
 * Service DO - AI Services and Usage Metering
 *
 * AI Services-as-Software platform with usage metering, rate limiting,
 * and customer management.
 *
 * Key capabilities:
 * - AI service endpoint management
 * - Usage metering for billing
 * - Rate limiting per customer/tier
 * - API key management
 * - Performance metrics tracking
 *
 * @example
 * ```typescript
 * const service: ServiceDO = {
 *   $id: 'https://llm.do',
 *   $type: 'Service',
 *   $context: 'https://startups.studio',
 *   $version: 1,
 *   $createdAt: Date.now(),
 *   $updatedAt: Date.now(),
 *   name: 'LLM.do',
 *   serviceType: 'ai-model',
 *   endpoints: ['chat', 'completion', 'embedding']
 * }
 * ```
 */

import type { DigitalObjectIdentity, DigitalObjectRef } from './identity'
import type { CollectionMethods } from './collections'

// =============================================================================
// Service DO Identity
// =============================================================================

/**
 * Service type classification
 */
export type ServiceType =
  | 'ai-model'      // LLM, embedding, image generation
  | 'ai-agent'      // Autonomous agents
  | 'ai-workflow'   // AI-powered workflows
  | 'data'          // Data services (enrichment, validation)
  | 'compute'       // Compute services
  | 'storage'       // Storage services
  | 'custom'        // Custom service type

/**
 * Service DO configuration extending base identity
 */
export interface ServiceDO extends DigitalObjectIdentity {
  /** Always 'Service' for this DO type */
  $type: 'Service'

  /** Parent Startup or Business DO reference */
  $context: DigitalObjectRef

  /** Service name */
  name: string

  /** Service description */
  description?: string

  /** Service type */
  serviceType: ServiceType

  /** Available endpoint names */
  endpoints: string[]

  /** Service version */
  version?: string

  /** Service settings */
  settings?: ServiceSettings

  /** Service status */
  status: ServiceStatus

  /** Service metrics */
  metrics?: ServiceMetrics
}

/**
 * Service status
 */
export type ServiceStatus =
  | 'development'   // In development
  | 'beta'          // Beta testing
  | 'live'          // Production
  | 'deprecated'    // Being phased out
  | 'maintenance'   // Temporarily unavailable

// =============================================================================
// Settings and Configuration
// =============================================================================

/**
 * Service settings
 */
export interface ServiceSettings {
  /** Base URL for the service */
  baseUrl?: string

  /** Default timeout in ms */
  defaultTimeout?: number

  /** Default rate limit tier */
  defaultRateLimitTier?: string

  /** Require authentication */
  requireAuth?: boolean

  /** Allowed origins (CORS) */
  allowedOrigins?: string[]

  /** Enable caching */
  cacheEnabled?: boolean

  /** Cache TTL in seconds */
  cacheTTL?: number

  /** Enable request logging */
  requestLogging?: boolean

  /** Retry configuration */
  retryConfig?: {
    maxRetries: number
    initialDelay: number
    maxDelay: number
    backoffMultiplier: number
  }
}

/**
 * Service metrics
 */
export interface ServiceMetrics {
  /** Total requests (all time) */
  totalRequests: number

  /** Requests today */
  requestsToday: number

  /** Requests this month */
  requestsThisMonth: number

  /** Average latency (ms) */
  avgLatency: number

  /** P99 latency (ms) */
  p99Latency: number

  /** Error rate (percentage) */
  errorRate: number

  /** Total tokens processed (for AI services) */
  totalTokens?: number

  /** Tokens this month */
  tokensThisMonth?: number

  /** Active customers */
  activeCustomers: number

  /** Monthly revenue */
  monthlyRevenue: number

  /** Last updated */
  updatedAt: number
}

// =============================================================================
// Endpoint Types
// =============================================================================

/**
 * Service endpoint definition
 */
export interface Endpoint {
  /** Endpoint ID */
  id: string

  /** Endpoint name (path segment) */
  name: string

  /** Display name */
  displayName?: string

  /** Description */
  description?: string

  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

  /** Full path pattern */
  path: string

  /** Input schema (JSON Schema) */
  inputSchema?: Record<string, unknown>

  /** Output schema (JSON Schema) */
  outputSchema?: Record<string, unknown>

  /** Endpoint-specific rate limit */
  rateLimit?: {
    limit: number
    windowSeconds: number
  }

  /** Endpoint-specific timeout (ms) */
  timeout?: number

  /** Is streaming endpoint */
  streaming?: boolean

  /** Active status */
  active: boolean
}

/**
 * AI model configuration (for ai-model service type)
 */
export interface AIModel {
  /** Model ID */
  id: string

  /** Model name */
  name: string

  /** Model provider */
  provider: 'openai' | 'anthropic' | 'google' | 'mistral' | 'custom'

  /** Model identifier (e.g., 'gpt-4', 'claude-3-opus') */
  modelId: string

  /** Model capabilities */
  capabilities: ('chat' | 'completion' | 'embedding' | 'image' | 'audio' | 'video')[]

  /** Context window size */
  contextWindow?: number

  /** Max output tokens */
  maxOutputTokens?: number

  /** Input token price (per 1M tokens) */
  inputTokenPrice?: number

  /** Output token price (per 1M tokens) */
  outputTokenPrice?: number

  /** Active status */
  active: boolean
}

// =============================================================================
// Customer and API Key Types
// =============================================================================

/**
 * Service customer
 */
export interface ServiceCustomer {
  /** Customer ID */
  id: string

  /** Customer name */
  name: string

  /** Customer email */
  email: string

  /** Pricing tier */
  tier: string

  /** Status */
  status: 'active' | 'suspended' | 'churned'

  /** Custom rate limits */
  rateLimits?: Record<string, { limit: number; windowSeconds: number }>

  /** Monthly quota */
  monthlyQuota?: number

  /** Usage this month */
  usageThisMonth?: number

  /** Billing email */
  billingEmail?: string

  /** External customer ID (Stripe, etc.) */
  externalId?: string

  /** Created timestamp */
  createdAt: number

  /** Updated timestamp */
  updatedAt: number
}

/**
 * API key for authentication
 */
export interface APIKey {
  /** Key ID */
  id: string

  /** Customer ID */
  customerId: string

  /** Key name */
  name: string

  /** Key prefix (visible part, e.g., 'sk_live_abc') */
  prefix: string

  /** Key hash (for verification) */
  keyHash: string

  /** Scopes/permissions */
  scopes?: string[]

  /** Allowed endpoints */
  allowedEndpoints?: string[]

  /** Allowed IP addresses */
  allowedIPs?: string[]

  /** Expires at */
  expiresAt?: number

  /** Last used */
  lastUsedAt?: number

  /** Active status */
  active: boolean

  /** Created timestamp */
  createdAt: number
}

// =============================================================================
// Usage and Pricing Types
// =============================================================================

/**
 * Usage record
 */
export interface ServiceUsageRecord {
  /** Record ID */
  id: string

  /** Customer ID */
  customerId: string

  /** Endpoint */
  endpoint: string

  /** Request count */
  requests: number

  /** Tokens (input) */
  inputTokens?: number

  /** Tokens (output) */
  outputTokens?: number

  /** Total tokens */
  totalTokens?: number

  /** Latency sum (for avg calculation) */
  latencySum?: number

  /** Error count */
  errors?: number

  /** Period start */
  periodStart: number

  /** Period end */
  periodEnd: number

  /** Cost */
  cost?: number

  /** Created timestamp */
  createdAt: number
}

/**
 * Pricing tier
 */
export interface PricingTier {
  /** Tier ID */
  id: string

  /** Tier name */
  name: string

  /** Description */
  description?: string

  /** Base monthly fee */
  baseMonthlyFee: number

  /** Price per 1K requests */
  pricePerRequest?: number

  /** Price per 1M tokens */
  pricePerToken?: number

  /** Included requests per month */
  includedRequests?: number

  /** Included tokens per month */
  includedTokens?: number

  /** Rate limits */
  rateLimits: {
    requestsPerMinute: number
    tokensPerMinute?: number
  }

  /** Features included */
  features?: string[]

  /** Active status */
  active: boolean
}

// =============================================================================
// Rate Limiting Types
// =============================================================================

/**
 * Rate limit configuration
 */
export interface ServiceRateLimitConfig {
  /** Config ID */
  id: string

  /** Name */
  name: string

  /** Tier ID this applies to */
  tierId?: string

  /** Endpoint this applies to */
  endpoint?: string

  /** Requests per window */
  requestLimit: number

  /** Tokens per window (for AI services) */
  tokenLimit?: number

  /** Window size in seconds */
  windowSeconds: number

  /** Burst allowance */
  burstLimit?: number

  /** Active status */
  active: boolean
}

/**
 * Rate limit status
 */
export interface ServiceRateLimitStatus {
  /** Customer ID */
  customerId: string

  /** Endpoint (if endpoint-specific) */
  endpoint?: string

  /** Request limit */
  requestLimit: number

  /** Requests remaining */
  requestsRemaining: number

  /** Token limit (if applicable) */
  tokenLimit?: number

  /** Tokens remaining */
  tokensRemaining?: number

  /** Window reset timestamp */
  resetAt: number

  /** Is currently rate limited */
  limited: boolean

  /** Retry after (seconds) */
  retryAfter?: number
}

// =============================================================================
// Service Collections Interface
// =============================================================================

/**
 * Service DO collections
 */
export interface ServiceCollections {
  /** Service endpoints */
  endpoints: CollectionMethods<Endpoint>

  /** AI models (for ai-model type) */
  models: CollectionMethods<AIModel>

  /** Customers */
  customers: CollectionMethods<ServiceCustomer>

  /** API keys */
  apiKeys: CollectionMethods<APIKey>

  /** Usage records */
  usage: CollectionMethods<ServiceUsageRecord>

  /** Pricing tiers */
  pricing: CollectionMethods<PricingTier>

  /** Rate limit configs */
  rateLimits: CollectionMethods<ServiceRateLimitConfig>
}

// =============================================================================
// Service RPC Methods
// =============================================================================

/**
 * Service invocation options
 */
export interface InvokeOptions {
  /** API key */
  apiKey: string

  /** Endpoint to invoke */
  endpoint: string

  /** Request body */
  body: Record<string, unknown>

  /** Timeout override (ms) */
  timeout?: number

  /** Streaming callback */
  onStream?: (chunk: unknown) => void

  /** Idempotency key */
  idempotencyKey?: string
}

/**
 * Service invocation result
 */
export interface InvokeResult {
  /** Response data */
  data: unknown

  /** Tokens used (for AI services) */
  tokens?: {
    input: number
    output: number
    total: number
  }

  /** Latency (ms) */
  latency: number

  /** Request ID */
  requestId: string

  /** Cached response */
  cached?: boolean
}

/**
 * Streaming invocation result
 */
export interface StreamResult {
  /** Stream ID */
  streamId: string

  /** Async iterator for chunks */
  stream: AsyncIterable<unknown>

  /** Final result promise */
  result: Promise<InvokeResult>
}

/**
 * Usage query options
 */
export interface UsageQueryOptions {
  /** Customer ID */
  customerId?: string

  /** Endpoint filter */
  endpoint?: string

  /** Start date */
  startDate?: number

  /** End date */
  endDate?: number

  /** Group by */
  groupBy?: 'hour' | 'day' | 'week' | 'month' | 'endpoint' | 'customer'
}

/**
 * Usage query result
 */
export interface UsageQueryResult {
  /** Total requests */
  totalRequests: number

  /** Total tokens */
  totalTokens?: number

  /** Total cost */
  totalCost?: number

  /** Average latency */
  avgLatency?: number

  /** Error rate */
  errorRate?: number

  /** Breakdown by group */
  breakdown?: Record<string, {
    requests: number
    tokens?: number
    cost?: number
  }>
}

/**
 * Service DO RPC methods
 */
export interface ServiceRPCMethods {
  // =========================================================================
  // Invocation Methods
  // =========================================================================

  /**
   * Invoke service endpoint
   */
  'service.invoke': (options: InvokeOptions) => Promise<InvokeResult>

  /**
   * Stream service response
   */
  'service.stream': (options: InvokeOptions) => Promise<StreamResult>

  /**
   * Validate API key
   */
  'service.validate': (apiKey: string) => Promise<{
    valid: boolean
    customerId?: string
    scopes?: string[]
    error?: string
  }>

  // =========================================================================
  // Usage Methods
  // =========================================================================

  /**
   * Record usage
   */
  'service.usage.record': (record: Omit<ServiceUsageRecord, 'id' | 'createdAt'>) => Promise<ServiceUsageRecord>

  /**
   * Query usage
   */
  'service.usage.query': (options: UsageQueryOptions) => Promise<UsageQueryResult>

  /**
   * Get customer usage
   */
  'service.usage.customer': (customerId: string, options?: {
    startDate?: number
    endDate?: number
  }) => Promise<UsageQueryResult>

  /**
   * Get usage forecast
   */
  'service.usage.forecast': (customerId: string) => Promise<{
    projectedRequests: number
    projectedTokens?: number
    projectedCost: number
    daysRemaining: number
  }>

  // =========================================================================
  // Rate Limit Methods
  // =========================================================================

  /**
   * Check rate limit
   */
  'service.limits.check': (apiKey: string, endpoint?: string) => Promise<ServiceRateLimitStatus>

  /**
   * Consume rate limit
   */
  'service.limits.consume': (
    apiKey: string,
    options?: { requests?: number; tokens?: number; endpoint?: string }
  ) => Promise<ServiceRateLimitStatus>

  /**
   * Reset rate limit (admin)
   */
  'service.limits.reset': (customerId: string) => Promise<void>

  /**
   * Get rate limit config for customer
   */
  'service.limits.config': (customerId: string) => Promise<ServiceRateLimitConfig[]>

  // =========================================================================
  // Customer Methods
  // =========================================================================

  /**
   * Create customer
   */
  'service.customers.create': (customer: Omit<ServiceCustomer, 'id' | 'createdAt' | 'updatedAt'>) => Promise<ServiceCustomer>

  /**
   * Get customer
   */
  'service.customers.get': (customerId: string) => Promise<ServiceCustomer | null>

  /**
   * Update customer
   */
  'service.customers.update': (customerId: string, data: Partial<ServiceCustomer>) => Promise<ServiceCustomer>

  /**
   * Change customer tier
   */
  'service.customers.changeTier': (customerId: string, tierId: string) => Promise<ServiceCustomer>

  // =========================================================================
  // API Key Methods
  // =========================================================================

  /**
   * Create API key
   */
  'service.keys.create': (options: {
    customerId: string
    name: string
    scopes?: string[]
    expiresAt?: number
  }) => Promise<{ key: APIKey; secret: string }>

  /**
   * List API keys for customer
   */
  'service.keys.list': (customerId: string) => Promise<APIKey[]>

  /**
   * Revoke API key
   */
  'service.keys.revoke': (keyId: string) => Promise<void>

  /**
   * Rotate API key
   */
  'service.keys.rotate': (keyId: string) => Promise<{ key: APIKey; secret: string }>

  // =========================================================================
  // Metrics Methods
  // =========================================================================

  /**
   * Get service metrics
   */
  'service.metrics.get': () => Promise<ServiceMetrics>

  /**
   * Get endpoint metrics
   */
  'service.metrics.endpoint': (endpoint: string) => Promise<{
    requests: number
    avgLatency: number
    p99Latency: number
    errorRate: number
  }>

  /**
   * Get real-time metrics
   */
  'service.metrics.realtime': () => Promise<{
    requestsPerSecond: number
    activeConnections: number
    queueDepth: number
  }>
}

// =============================================================================
// Service CDC Events
// =============================================================================

/**
 * Service CDC event types
 */
export type ServiceCDCEvent =
  | { type: 'Service.Invoked'; payload: { requestId: string; customerId: string; endpoint: string; latency: number } }
  | { type: 'Service.Streamed'; payload: { streamId: string; customerId: string; endpoint: string; chunks: number } }
  | { type: 'Service.Error'; payload: { requestId: string; customerId: string; endpoint: string; error: string } }
  | { type: 'Service.Usage.recorded'; payload: { customerId: string; requests: number; tokens?: number } }
  | { type: 'Service.Limit.exceeded'; payload: { customerId: string; limitType: 'request' | 'token'; current: number; limit: number } }
  | { type: 'Service.Customer.created'; payload: { customerId: string; tier: string } }
  | { type: 'Service.Customer.tierChanged'; payload: { customerId: string; fromTier: string; toTier: string } }
  | { type: 'Service.Key.created'; payload: { keyId: string; customerId: string } }
  | { type: 'Service.Key.revoked'; payload: { keyId: string; customerId: string } }
  | { type: 'Service.Endpoint.added'; payload: { endpointId: string; name: string } }
  | { type: 'Service.Model.added'; payload: { modelId: string; name: string } }

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if entity is a ServiceDO
 */
export function isServiceDO(obj: unknown): obj is ServiceDO {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    '$type' in obj &&
    (obj as ServiceDO).$type === 'Service'
  )
}

/**
 * Check if service is live
 */
export function isServiceLive(service: ServiceDO): boolean {
  return service.status === 'live'
}

/**
 * Check if customer is active
 */
export function isCustomerActive(customer: ServiceCustomer): boolean {
  return customer.status === 'active'
}

/**
 * Check if API key is valid
 */
export function isAPIKeyValid(key: APIKey): boolean {
  if (!key.active) return false
  if (key.expiresAt && key.expiresAt < Date.now()) return false
  return true
}

/**
 * Check if rate limited
 */
export function isRateLimited(status: ServiceRateLimitStatus): boolean {
  return status.limited || status.requestsRemaining <= 0
}
