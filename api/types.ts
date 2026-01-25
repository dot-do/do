/**
 * API Types - Type definitions for the Hono-based API layer
 *
 * Includes:
 * - Request/response types
 * - Context types for middleware
 * - Error types
 * - Configuration types
 */

import type { Context, Next, MiddlewareHandler } from 'hono'
import type { DigitalObjectIdentity, DOType } from '../types/identity'

// =============================================================================
// Environment Bindings
// =============================================================================

/**
 * Cloudflare Worker environment bindings
 */
export interface Env {
  /** Durable Object namespace for Digital Objects */
  DO: DurableObjectNamespace
  /** R2 bucket for cold storage */
  R2: R2Bucket
  /** KV namespace for caching */
  KV: KVNamespace
  /** Cloudflare AI binding */
  AI: Ai
  /** Environment (development, staging, production) */
  ENVIRONMENT: string
  /** Optional: Rate limit requests per minute */
  RATE_LIMIT_RPM?: string
}

/**
 * Extended Hono context with DO-specific variables
 */
export interface DOContext {
  /** Authenticated user info */
  user?: AuthUser
  /** Request ID for tracing */
  requestId: string
  /** Start time for latency tracking */
  startTime: number
  /** Target DO hostname */
  hostname: string
  /** Colo (datacenter) code */
  colo?: string
}

// =============================================================================
// Authentication
// =============================================================================

/**
 * Authenticated user
 */
export interface AuthUser {
  /** User ID */
  id: string
  /** Email address */
  email?: string
  /** Organization ID */
  orgId?: string
  /** Roles */
  roles: string[]
  /** Permissions */
  permissions: string[]
  /** Token expiration time */
  exp?: number
}

/**
 * Authentication result
 */
export interface AuthResult {
  /** Whether authentication succeeded */
  success: boolean
  /** Authenticated user (if success) */
  user?: AuthUser
  /** Error message (if failed) */
  error?: string
}

/**
 * Authentication options
 *
 * Note: JWT validation uses oauth.do with JWKS verification.
 * See api/middleware/auth.ts for the oauth.do integration.
 */
export interface AuthOptions {
  /** Whether to require auth (vs optional) */
  required?: boolean
  /** Required roles */
  roles?: string[]
  /** Required permissions */
  permissions?: string[]
  /** Custom token extractor */
  extractToken?: (c: Context) => string | null
}

// =============================================================================
// API Response
// =============================================================================

/**
 * Standard API response wrapper
 * Every response includes clickable links for API discovery
 */
export interface APIResponse<T = unknown> {
  /** API identifier (usually the hostname) */
  api: string
  /** Response data */
  data: T
  /** Clickable links to related endpoints */
  links: Record<string, string>
  /** Authenticated user (if any) */
  user?: string
  /** Cloudflare colo code */
  colo?: string
  /** Response timestamp */
  timestamp: number
}

/**
 * API error response
 */
export interface APIErrorResponse {
  /** API identifier */
  api: string
  /** Error details */
  error: {
    /** Error code */
    code: string
    /** Human-readable message */
    message: string
    /** Additional error details */
    details?: unknown
  }
  /** Clickable links */
  links: Record<string, string>
  /** Response timestamp */
  timestamp: number
}

/**
 * Pagination info
 */
export interface PaginationInfo {
  /** Total items */
  total: number
  /** Current page */
  page: number
  /** Items per page */
  pageSize: number
  /** Total pages */
  totalPages: number
  /** Has more pages */
  hasMore: boolean
  /** Next cursor (for cursor-based pagination) */
  nextCursor?: string
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> extends APIResponse<T[]> {
  /** Pagination info */
  pagination: PaginationInfo
}

// =============================================================================
// Rate Limiting
// =============================================================================

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Window size in seconds */
  windowSecs: number
  /** Max requests per window */
  maxRequests: number
  /** Key generator (default: IP-based) */
  keyGenerator?: (c: Context) => string
  /** Skip rate limiting for these paths */
  skipPaths?: string[]
  /** Custom rate limit by path */
  pathLimits?: Record<string, number>
}

/**
 * Rate limit info (returned in headers)
 */
export interface RateLimitInfo {
  /** Max requests allowed */
  limit: number
  /** Remaining requests */
  remaining: number
  /** Window reset time (Unix timestamp) */
  reset: number
}

// =============================================================================
// CORS
// =============================================================================

/**
 * CORS configuration
 */
export interface CORSConfig {
  /** Allowed origins (default: '*') */
  origin?: string | string[] | ((origin: string) => boolean)
  /** Allowed methods */
  methods?: string[]
  /** Allowed headers */
  allowedHeaders?: string[]
  /** Exposed headers */
  exposedHeaders?: string[]
  /** Allow credentials */
  credentials?: boolean
  /** Max age for preflight cache */
  maxAge?: number
}

// =============================================================================
// Route Types
// =============================================================================

/**
 * Route definition
 */
export interface RouteDefinition {
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS'
  /** Path pattern */
  path: string
  /** Handler function */
  handler: (c: Context<{ Bindings: Env; Variables: DOContext }>) => Promise<Response> | Response
  /** Middleware to apply */
  middleware?: MiddlewareHandler[]
  /** Route description (for docs) */
  description?: string
  /** Whether auth is required */
  auth?: boolean
}

/**
 * Route group
 */
export interface RouteGroup {
  /** Base path */
  basePath: string
  /** Routes in this group */
  routes: RouteDefinition[]
  /** Middleware to apply to all routes */
  middleware?: MiddlewareHandler[]
}

// =============================================================================
// DO Operations
// =============================================================================

/**
 * DO operation request
 */
export interface DOOperationRequest {
  /** Operation type */
  operation: 'create' | 'read' | 'update' | 'delete' | 'list' | 'execute'
  /** Collection name */
  collection: string
  /** Item ID (for single-item operations) */
  id?: string
  /** Data payload */
  data?: unknown
  /** Query options */
  options?: {
    limit?: number
    offset?: number
    cursor?: string
    orderBy?: string
    orderDir?: 'asc' | 'desc'
    filter?: Record<string, unknown>
  }
}

/**
 * DO operation result
 */
export interface DOOperationResult<T = unknown> {
  /** Whether operation succeeded */
  success: boolean
  /** Result data */
  data?: T
  /** Error (if failed) */
  error?: {
    code: string
    message: string
  }
  /** Affected count (for mutations) */
  affected?: number
  /** Pagination info (for list operations) */
  pagination?: PaginationInfo
}

// =============================================================================
// AI Types
// =============================================================================

/**
 * AI generation request
 */
export interface AIGenerateRequest {
  /** Prompt text */
  prompt: string
  /** Model selector (characteristic-based) */
  model?: 'best' | 'fast' | 'cost' | 'reasoning' | 'code' | 'vision' | 'long' | string
  /** System prompt */
  system?: string
  /** Temperature (0-2) */
  temperature?: number
  /** Max tokens */
  maxTokens?: number
  /** JSON mode */
  jsonMode?: boolean
  /** Stream response */
  stream?: boolean
}

/**
 * AI chat request
 */
export interface AIChatRequest {
  /** Chat messages */
  messages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
  }>
  /** Model selector */
  model?: string
  /** Temperature */
  temperature?: number
  /** Max tokens */
  maxTokens?: number
  /** Tools available */
  tools?: Array<{
    name: string
    description: string
    parameters: Record<string, unknown>
  }>
  /** Stream response */
  stream?: boolean
}

/**
 * AI embedding request
 */
export interface AIEmbedRequest {
  /** Text to embed */
  text: string | string[]
  /** Model (optional) */
  model?: string
  /** Dimensions (for models that support it) */
  dimensions?: number
}

// =============================================================================
// Health Check
// =============================================================================

/**
 * Health check response
 */
export interface HealthCheckResponse {
  /** Service status */
  status: 'ok' | 'degraded' | 'down'
  /** Current timestamp */
  timestamp: number
  /** Cloudflare colo */
  colo?: string
  /** Service version */
  version: string
  /** Component health */
  components?: Record<string, {
    status: 'ok' | 'degraded' | 'down'
    latencyMs?: number
    message?: string
  }>
}

// =============================================================================
// Middleware Types
// =============================================================================

/**
 * Middleware configuration
 */
export interface MiddlewareConfig {
  /** Whether middleware is enabled */
  enabled: boolean
  /** Paths to skip */
  skip?: string[]
  /** Additional options */
  options?: Record<string, unknown>
}

/**
 * Logging middleware options
 */
export interface LoggingOptions {
  /** Log level */
  level?: 'debug' | 'info' | 'warn' | 'error'
  /** Include request body */
  includeBody?: boolean
  /** Include response body */
  includeResponse?: boolean
  /** Paths to skip */
  skipPaths?: string[]
}

/**
 * Timing middleware options
 */
export interface TimingOptions {
  /** Header name for timing info */
  headerName?: string
  /** Include in response body */
  includeInBody?: boolean
}
