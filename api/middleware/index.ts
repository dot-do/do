/**
 * Middleware Exports
 *
 * All middleware for the DO API layer
 */

// =============================================================================
// Authentication (from oauth.do/hono)
// =============================================================================
export {
  // oauth.do middleware
  auth,
  requireAuth,
  apiKey,
  combined,
  // Helper functions
  getUser,
  requireUser,
  hasRole,
  hasPermission,
  isAuthenticated,
  getToken,
} from './auth'

// Re-export types from oauth.do
export type { AuthUser, AuthOptions, RequireAuthOptions, ApiKeyOptions, AuthVariables } from './auth'

// =============================================================================
// CORS
// =============================================================================
export {
  createCorsMiddleware,
  createDynamicCorsMiddleware,
  createPreflightHandler,
  addCorsHeaders,
  isOriginAllowed,
  DEFAULT_CORS_CONFIG,
  RESTRICTIVE_CORS_CONFIG,
} from './cors'

// =============================================================================
// Rate Limiting
// =============================================================================
export {
  createRateLimitMiddleware,
  createAIRateLimitMiddleware,
  createWriteRateLimitMiddleware,
  createSlidingWindowRateLimitMiddleware,
  getRateLimitInfo,
  resetRateLimit,
  DEFAULT_RATE_LIMIT_CONFIG,
  STRICT_RATE_LIMIT_CONFIG,
  GENEROUS_RATE_LIMIT_CONFIG,
} from './rateLimit'

// =============================================================================
// Request Context Middleware
// =============================================================================
import type { Context, Next } from 'hono'
import type { Env, DOContext } from '../types'

// Import for internal use in composeMiddleware
import { auth } from './auth'
import { createCorsMiddleware } from './cors'
import { createRateLimitMiddleware } from './rateLimit'

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `${timestamp}-${random}`
}

/**
 * Create request context middleware
 * Sets up common variables for all routes
 */
export function createContextMiddleware() {
  return async (c: Context<{ Bindings: Env; Variables: DOContext }>, next: Next) => {
    const url = new URL(c.req.url)

    // Set request context
    c.set('requestId', c.req.header('X-Request-ID') || generateRequestId())
    c.set('startTime', Date.now())
    c.set('hostname', url.hostname)
    c.set('colo', c.req.header('CF-Ray')?.split('-')[1])

    // Add request ID to response
    c.header('X-Request-ID', c.get('requestId'))

    await next()

    // Add timing header
    const duration = Date.now() - c.get('startTime')
    c.header('X-Response-Time', `${duration}ms`)
  }
}

/**
 * Create logging middleware
 */
export function createLoggingMiddleware(options: { level?: string; skipPaths?: string[] } = {}) {
  const skipPaths = options.skipPaths || ['/_health', '/favicon.ico']

  return async (c: Context<{ Bindings: Env; Variables: DOContext }>, next: Next) => {
    const path = new URL(c.req.url).pathname

    // Skip logging for certain paths
    if (skipPaths.some(skip => path.startsWith(skip))) {
      await next()
      return
    }

    const startTime = Date.now()
    const method = c.req.method
    const requestId = c.get('requestId') || 'unknown'

    // Log request
    console.log(JSON.stringify({
      type: 'request',
      requestId,
      method,
      path,
      timestamp: new Date().toISOString(),
    }))

    await next()

    // Log response
    const duration = Date.now() - startTime
    const status = c.res?.status || 0

    console.log(JSON.stringify({
      type: 'response',
      requestId,
      method,
      path,
      status,
      durationMs: duration,
      timestamp: new Date().toISOString(),
    }))
  }
}

/**
 * Create error handling middleware
 */
export function createErrorMiddleware() {
  return async (c: Context<{ Bindings: Env; Variables: DOContext }>, next: Next): Promise<Response | void> => {
    try {
      await next()
    } catch (error) {
      const url = new URL(c.req.url)
      const requestId = c.get('requestId') || 'unknown'

      // Log error
      console.error(JSON.stringify({
        type: 'error',
        requestId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      }))

      // Return error response
      return c.json({
        api: url.hostname,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
          requestId,
        },
        links: {
          self: c.req.url,
          docs: 'https://do.md/errors',
        },
        timestamp: Date.now(),
      }, 500)
    }
  }
}

/**
 * Create security headers middleware
 */
export function createSecurityMiddleware() {
  return async (c: Context<{ Bindings: Env; Variables: DOContext }>, next: Next) => {
    await next()

    // Add security headers
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('X-Frame-Options', 'DENY')
    c.header('X-XSS-Protection', '1; mode=block')
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin')

    // Don't override if already set (e.g., by specific route)
    if (!c.res?.headers.get('Content-Security-Policy')) {
      c.header('Content-Security-Policy', "default-src 'self'")
    }
  }
}

// =============================================================================
// Middleware Composer
// =============================================================================

/**
 * Compose all standard middleware
 *
 * @example
 * import { composeMiddleware } from './middleware'
 * app.use('*', ...composeMiddleware())
 */
export function composeMiddleware(options: {
  auth?: boolean
  cors?: boolean
  rateLimit?: boolean
  logging?: boolean
  security?: boolean
} = {}) {
  const middleware = []

  // Always add context
  middleware.push(createContextMiddleware())

  // Add error handling
  middleware.push(createErrorMiddleware())

  // Optional middleware
  if (options.logging !== false) {
    middleware.push(createLoggingMiddleware())
  }

  if (options.security !== false) {
    middleware.push(createSecurityMiddleware())
  }

  if (options.cors !== false) {
    middleware.push(createCorsMiddleware())
  }

  if (options.rateLimit !== false) {
    middleware.push(createRateLimitMiddleware())
  }

  if (options.auth) {
    middleware.push(auth())
  }

  return middleware
}
