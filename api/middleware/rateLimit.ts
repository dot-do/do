/**
 * Rate Limiting Middleware
 *
 * Implements token bucket rate limiting using KV storage.
 * Supports per-IP, per-user, and per-API-key limits.
 */

import type { Context, Next } from 'hono'
import type { Env, DOContext, RateLimitConfig, RateLimitInfo } from '../types'

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default rate limit configuration
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  windowSecs: 60, // 1 minute window
  maxRequests: 60, // 60 requests per minute
  skipPaths: ['/_health', '/favicon.ico'],
}

/**
 * Strict rate limit for expensive operations
 */
export const STRICT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  windowSecs: 60,
  maxRequests: 10,
  skipPaths: [],
}

/**
 * Generous rate limit for read-only operations
 */
export const GENEROUS_RATE_LIMIT_CONFIG: RateLimitConfig = {
  windowSecs: 60,
  maxRequests: 300,
  skipPaths: [],
}

// =============================================================================
// Rate Limit Storage Interface
// =============================================================================

interface RateLimitEntry {
  count: number
  windowStart: number
}

/**
 * Get rate limit key for a request
 */
function getDefaultKey(c: Context): string {
  // Try to get user ID first
  const user = c.get('user') as { id?: string } | undefined
  if (user?.id) {
    return `rl:user:${user.id}`
  }

  // Fall back to IP address
  const ip = c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0].trim() ||
    'unknown'

  return `rl:ip:${ip}`
}

// =============================================================================
// In-Memory Rate Limiter (for development/single instance)
// =============================================================================

const memoryStore = new Map<string, RateLimitEntry>()

async function checkMemoryRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; info: RateLimitInfo }> {
  const now = Math.floor(Date.now() / 1000)
  const windowStart = now - (now % config.windowSecs)
  const windowEnd = windowStart + config.windowSecs

  let entry = memoryStore.get(key)

  // Check if we're in a new window
  if (!entry || entry.windowStart !== windowStart) {
    entry = { count: 0, windowStart }
  }

  // Increment count
  entry.count++
  memoryStore.set(key, entry)

  const remaining = Math.max(0, config.maxRequests - entry.count)
  const allowed = entry.count <= config.maxRequests

  return {
    allowed,
    info: {
      limit: config.maxRequests,
      remaining,
      reset: windowEnd,
    },
  }
}

// =============================================================================
// KV Rate Limiter (for distributed/production)
// =============================================================================

async function checkKVRateLimit(
  kv: KVNamespace,
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; info: RateLimitInfo }> {
  const now = Math.floor(Date.now() / 1000)
  const windowStart = now - (now % config.windowSecs)
  const windowEnd = windowStart + config.windowSecs
  const kvKey = `${key}:${windowStart}`

  // Get current count
  const countStr = await kv.get(kvKey)
  let count = countStr ? parseInt(countStr, 10) : 0

  // Increment count
  count++

  // Store with TTL equal to window size
  await kv.put(kvKey, String(count), {
    expirationTtl: config.windowSecs * 2, // Keep a bit longer for safety
  })

  const remaining = Math.max(0, config.maxRequests - count)
  const allowed = count <= config.maxRequests

  return {
    allowed,
    info: {
      limit: config.maxRequests,
      remaining,
      reset: windowEnd,
    },
  }
}

// =============================================================================
// Rate Limit Middleware Factory
// =============================================================================

/**
 * Create rate limiting middleware
 *
 * @example
 * // Basic rate limiting (60 req/min)
 * app.use('*', createRateLimitMiddleware())
 *
 * @example
 * // Custom limits
 * app.use('/api/*', createRateLimitMiddleware({
 *   windowSecs: 60,
 *   maxRequests: 100,
 * }))
 *
 * @example
 * // Different limits per path
 * app.use('/api/*', createRateLimitMiddleware({
 *   windowSecs: 60,
 *   maxRequests: 60,
 *   pathLimits: {
 *     '/api/ai': 10,    // Expensive AI operations
 *     '/api/search': 120, // Generous search limits
 *   }
 * }))
 */
export function createRateLimitMiddleware(config: Partial<RateLimitConfig> = {}) {
  const mergedConfig: RateLimitConfig = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config }

  return async (c: Context<{ Bindings: Env; Variables: DOContext }>, next: Next): Promise<Response | void> => {
    // Check if path should be skipped
    const path = new URL(c.req.url).pathname
    if (mergedConfig.skipPaths?.some(skip => path.startsWith(skip))) {
      await next()
      return
    }

    // Get rate limit key
    const keyGenerator = mergedConfig.keyGenerator || getDefaultKey
    const key = keyGenerator(c)

    // Check for path-specific limits
    let effectiveLimit = mergedConfig.maxRequests
    if (mergedConfig.pathLimits) {
      for (const [pathPattern, limit] of Object.entries(mergedConfig.pathLimits)) {
        if (path.startsWith(pathPattern)) {
          effectiveLimit = limit
          break
        }
      }
    }

    const effectiveConfig = { ...mergedConfig, maxRequests: effectiveLimit }

    // Check rate limit using KV if available, otherwise use memory
    const { allowed, info } = c.env.KV
      ? await checkKVRateLimit(c.env.KV, key, effectiveConfig)
      : await checkMemoryRateLimit(key, effectiveConfig)

    // Add rate limit headers
    c.header('X-RateLimit-Limit', String(info.limit))
    c.header('X-RateLimit-Remaining', String(info.remaining))
    c.header('X-RateLimit-Reset', String(info.reset))

    if (!allowed) {
      const retryAfter = info.reset - Math.floor(Date.now() / 1000)
      c.header('Retry-After', String(retryAfter))

      return c.json({
        api: new URL(c.req.url).hostname,
        error: {
          code: 'RATE_LIMITED',
          message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          details: {
            limit: info.limit,
            remaining: info.remaining,
            reset: info.reset,
            retryAfter,
          },
        },
        links: {
          self: c.req.url,
          docs: 'https://do.md/rate-limits',
        },
        timestamp: Date.now(),
      }, 429)
    }

    await next()
  }
}

// =============================================================================
// Specialized Rate Limiters
// =============================================================================

/**
 * Create rate limiter for AI/expensive operations
 */
export function createAIRateLimitMiddleware(maxRequests: number = 10) {
  return createRateLimitMiddleware({
    windowSecs: 60,
    maxRequests,
    keyGenerator: (c) => {
      const user = c.get('user') as { id?: string } | undefined
      return `rl:ai:${user?.id || 'anon'}`
    },
  })
}

/**
 * Create rate limiter for write operations
 */
export function createWriteRateLimitMiddleware(maxRequests: number = 30) {
  return createRateLimitMiddleware({
    windowSecs: 60,
    maxRequests,
    keyGenerator: (c) => {
      const user = c.get('user') as { id?: string } | undefined
      return `rl:write:${user?.id || 'anon'}`
    },
  })
}

/**
 * Create sliding window rate limiter
 * More accurate but more expensive (uses more KV operations)
 */
export function createSlidingWindowRateLimitMiddleware(config: RateLimitConfig) {
  return async (c: Context<{ Bindings: Env; Variables: DOContext }>, next: Next): Promise<Response | void> => {
    if (!c.env.KV) {
      // Fall back to fixed window
      return createRateLimitMiddleware(config)(c, next)
    }

    const path = new URL(c.req.url).pathname
    if (config.skipPaths?.some(skip => path.startsWith(skip))) {
      await next()
      return
    }

    const keyGenerator = config.keyGenerator || getDefaultKey
    const baseKey = keyGenerator(c)
    const now = Date.now()
    const windowMs = config.windowSecs * 1000

    // Get all request timestamps in the window
    const requestKey = `${baseKey}:requests`
    const requestsStr = await c.env.KV.get(requestKey)
    let requests: number[] = requestsStr ? JSON.parse(requestsStr) : []

    // Filter to only requests within the window
    const windowStart = now - windowMs
    requests = requests.filter(ts => ts > windowStart)

    // Check if allowed
    const count = requests.length
    const allowed = count < config.maxRequests

    if (!allowed) {
      const oldestRequest = Math.min(...requests)
      const retryAfter = Math.ceil((oldestRequest + windowMs - now) / 1000)

      c.header('X-RateLimit-Limit', String(config.maxRequests))
      c.header('X-RateLimit-Remaining', '0')
      c.header('X-RateLimit-Reset', String(Math.ceil((now + windowMs) / 1000)))
      c.header('Retry-After', String(retryAfter))

      return c.json({
        api: new URL(c.req.url).hostname,
        error: {
          code: 'RATE_LIMITED',
          message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        },
        links: {
          self: c.req.url,
          docs: 'https://do.md/rate-limits',
        },
        timestamp: Date.now(),
      }, 429)
    }

    // Add current request
    requests.push(now)

    // Store with TTL
    await c.env.KV.put(requestKey, JSON.stringify(requests), {
      expirationTtl: config.windowSecs * 2,
    })

    c.header('X-RateLimit-Limit', String(config.maxRequests))
    c.header('X-RateLimit-Remaining', String(config.maxRequests - requests.length))
    c.header('X-RateLimit-Reset', String(Math.ceil((now + windowMs) / 1000)))

    await next()
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get current rate limit info without incrementing
 */
export async function getRateLimitInfo(
  c: Context<{ Bindings: Env }>,
  key: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG
): Promise<RateLimitInfo> {
  const now = Math.floor(Date.now() / 1000)
  const windowStart = now - (now % config.windowSecs)
  const windowEnd = windowStart + config.windowSecs
  const kvKey = `${key}:${windowStart}`

  let count = 0
  if (c.env.KV) {
    const countStr = await c.env.KV.get(kvKey)
    count = countStr ? parseInt(countStr, 10) : 0
  } else {
    const entry = memoryStore.get(key)
    if (entry && entry.windowStart === windowStart) {
      count = entry.count
    }
  }

  return {
    limit: config.maxRequests,
    remaining: Math.max(0, config.maxRequests - count),
    reset: windowEnd,
  }
}

/**
 * Reset rate limit for a specific key
 */
export async function resetRateLimit(
  c: Context<{ Bindings: Env }>,
  key: string
): Promise<void> {
  if (c.env.KV) {
    // Can't easily delete by prefix in KV, so we set count to 0
    const now = Math.floor(Date.now() / 1000)
    const windowStart = now - (now % 60)
    const kvKey = `${key}:${windowStart}`
    await c.env.KV.put(kvKey, '0', { expirationTtl: 120 })
  } else {
    memoryStore.delete(key)
  }
}
