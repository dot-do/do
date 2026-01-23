/**
 * CORS Middleware
 *
 * Handles Cross-Origin Resource Sharing with configurable options.
 * Includes smart defaults for the DO platform.
 */

import type { Context, Next } from 'hono'
import { cors as honoCors } from 'hono/cors'
import type { Env, DOContext, CORSConfig } from '../types'

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default CORS configuration for DO APIs
 */
export const DEFAULT_CORS_CONFIG: CORSConfig = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-API-Key',
    'X-Request-ID',
    'X-DO-Context',
  ],
  exposedHeaders: [
    'X-Request-ID',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Response-Time',
  ],
  credentials: false,
  maxAge: 86400, // 24 hours
}

/**
 * Restrictive CORS for sensitive endpoints
 */
export const RESTRICTIVE_CORS_CONFIG: CORSConfig = {
  origin: (origin) => {
    // Allow platform domains
    if (origin.endsWith('.do') || origin.endsWith('.do.md')) {
      return true
    }
    // Allow localhost in development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return true
    }
    return false
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 3600, // 1 hour
}

// =============================================================================
// CORS Middleware Factory
// =============================================================================

/**
 * Create CORS middleware with custom configuration
 *
 * @example
 * // Use default config
 * app.use('*', createCorsMiddleware())
 *
 * @example
 * // Custom origins
 * app.use('*', createCorsMiddleware({
 *   origin: ['https://app.example.com', 'https://admin.example.com']
 * }))
 *
 * @example
 * // Restrictive config for admin routes
 * app.use('/admin/*', createCorsMiddleware(RESTRICTIVE_CORS_CONFIG))
 */
export function createCorsMiddleware(config: CORSConfig = {}) {
  const mergedConfig = { ...DEFAULT_CORS_CONFIG, ...config }

  // Use Hono's built-in CORS middleware
  return honoCors({
    origin: mergedConfig.origin as string | string[] | ((origin: string, c: Context) => string | undefined | null),
    allowMethods: mergedConfig.methods,
    allowHeaders: mergedConfig.allowedHeaders,
    exposeHeaders: mergedConfig.exposedHeaders,
    credentials: mergedConfig.credentials,
    maxAge: mergedConfig.maxAge,
  })
}

// =============================================================================
// Dynamic CORS Middleware
// =============================================================================

/**
 * Create dynamic CORS middleware that checks allowed origins from KV
 *
 * This allows runtime configuration of CORS without redeployment
 *
 * @example
 * app.use('*', createDynamicCorsMiddleware('cors:allowed-origins'))
 */
export function createDynamicCorsMiddleware(kvKey: string = 'cors:config') {
  return async (c: Context<{ Bindings: Env; Variables: DOContext }>, next: Next): Promise<Response | void> => {
    const origin = c.req.header('Origin')

    // No origin header = same-origin request
    if (!origin) {
      await next()
      return
    }

    // Handle preflight requests
    if (c.req.method === 'OPTIONS') {
      const response = new Response(null, { status: 204 })

      // Try to get config from KV
      let allowedOrigins: string[] = ['*']
      try {
        const configStr = await c.env.KV?.get(kvKey)
        if (configStr) {
          const config = JSON.parse(configStr)
          allowedOrigins = config.origins || ['*']
        }
      } catch {
        // Use default
      }

      // Check if origin is allowed
      const isAllowed = allowedOrigins.includes('*') || allowedOrigins.includes(origin)

      if (isAllowed) {
        response.headers.set('Access-Control-Allow-Origin', origin)
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Request-ID')
        response.headers.set('Access-Control-Max-Age', '86400')
      }

      return response
    }

    // Continue with request
    await next()

    // Add CORS headers to response
    if (c.res) {
      c.res.headers.set('Access-Control-Allow-Origin', origin)
    }
  }
}

// =============================================================================
// Preflight Handler
// =============================================================================

/**
 * Create a dedicated preflight handler for specific routes
 *
 * @example
 * app.options('/api/*', createPreflightHandler())
 */
export function createPreflightHandler(config: CORSConfig = DEFAULT_CORS_CONFIG) {
  return (c: Context) => {
    const origin = c.req.header('Origin') || '*'

    // Check if origin is allowed
    let allowedOrigin = '*'
    if (typeof config.origin === 'string') {
      allowedOrigin = config.origin
    } else if (Array.isArray(config.origin)) {
      allowedOrigin = config.origin.includes(origin) ? origin : config.origin[0]
    } else if (typeof config.origin === 'function') {
      allowedOrigin = config.origin(origin) ? origin : ''
    }

    if (!allowedOrigin) {
      return new Response(null, { status: 403 })
    }

    const headers = new Headers({
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': (config.methods || DEFAULT_CORS_CONFIG.methods!).join(', '),
      'Access-Control-Allow-Headers': (config.allowedHeaders || DEFAULT_CORS_CONFIG.allowedHeaders!).join(', '),
      'Access-Control-Max-Age': String(config.maxAge || DEFAULT_CORS_CONFIG.maxAge),
    })

    if (config.credentials) {
      headers.set('Access-Control-Allow-Credentials', 'true')
    }

    return new Response(null, { status: 204, headers })
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Add CORS headers to an existing response
 */
export function addCorsHeaders(
  response: Response,
  origin: string,
  config: CORSConfig = DEFAULT_CORS_CONFIG
): Response {
  const headers = new Headers(response.headers)

  // Determine allowed origin
  let allowedOrigin = '*'
  if (typeof config.origin === 'string') {
    allowedOrigin = config.origin
  } else if (Array.isArray(config.origin)) {
    allowedOrigin = config.origin.includes(origin) ? origin : config.origin[0]
  } else if (typeof config.origin === 'function') {
    allowedOrigin = config.origin(origin) ? origin : '*'
  }

  headers.set('Access-Control-Allow-Origin', allowedOrigin)

  if (config.exposedHeaders) {
    headers.set('Access-Control-Expose-Headers', config.exposedHeaders.join(', '))
  }

  if (config.credentials) {
    headers.set('Access-Control-Allow-Credentials', 'true')
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/**
 * Check if an origin is allowed
 */
export function isOriginAllowed(origin: string, config: CORSConfig = DEFAULT_CORS_CONFIG): boolean {
  if (!config.origin || config.origin === '*') return true

  if (typeof config.origin === 'string') {
    return config.origin === origin
  }

  if (Array.isArray(config.origin)) {
    return config.origin.includes(origin)
  }

  if (typeof config.origin === 'function') {
    return config.origin(origin)
  }

  return false
}
