/**
 * Authentication Middleware
 *
 * Handles JWT-based authentication and authorization.
 * Supports optional auth (for public routes) and required auth.
 */

import type { Context, Next } from 'hono'
import type { Env, DOContext, AuthUser, AuthOptions, AuthResult } from '../types'

// =============================================================================
// JWT Utilities
// =============================================================================

/**
 * Decode a JWT token (without verification for quick parsing)
 */
function decodeJWT(token: string): { header: unknown; payload: unknown } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const header = JSON.parse(atob(parts[0]))
    const payload = JSON.parse(atob(parts[1]))

    return { header, payload }
  } catch {
    return null
  }
}

/**
 * Verify a JWT token
 * In production, this would use proper crypto verification
 */
async function verifyJWT(token: string, secret: string): Promise<AuthResult> {
  const decoded = decodeJWT(token)
  if (!decoded) {
    return { success: false, error: 'Invalid token format' }
  }

  const payload = decoded.payload as Record<string, unknown>

  // Check expiration
  if (payload.exp && typeof payload.exp === 'number') {
    if (Date.now() / 1000 > payload.exp) {
      return { success: false, error: 'Token expired' }
    }
  }

  // Build user from payload
  const user: AuthUser = {
    id: String(payload.sub || payload.id || 'unknown'),
    email: payload.email as string | undefined,
    orgId: payload.orgId as string | undefined,
    roles: (payload.roles as string[]) || [],
    permissions: (payload.permissions as string[]) || [],
    exp: payload.exp as number | undefined,
  }

  return { success: true, user }
}

/**
 * Extract token from request
 * Checks Authorization header and cookies
 */
function extractToken(c: Context): string | null {
  // Check Authorization header
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }

  // Check cookie
  const cookie = c.req.header('Cookie')
  if (cookie) {
    const match = cookie.match(/auth_token=([^;]+)/)
    if (match) return match[1]
  }

  // Check query param (for WebSocket connections)
  const url = new URL(c.req.url)
  const queryToken = url.searchParams.get('token')
  if (queryToken) return queryToken

  return null
}

// =============================================================================
// Auth Middleware Factory
// =============================================================================

/**
 * Create authentication middleware
 *
 * @example
 * // Optional auth - sets user if token present
 * app.use('*', createAuthMiddleware())
 *
 * @example
 * // Required auth - returns 401 if no valid token
 * app.use('/api/*', createAuthMiddleware({ required: true }))
 *
 * @example
 * // Role-based auth
 * app.use('/admin/*', createAuthMiddleware({ required: true, roles: ['admin'] }))
 */
export function createAuthMiddleware(options: AuthOptions = {}) {
  return async (c: Context<{ Bindings: Env; Variables: DOContext }>, next: Next): Promise<Response | void> => {
    const secret = options.secret || c.env.AUTH_SECRET || 'dev-secret'
    const tokenExtractor = options.extractToken || extractToken

    // Extract token
    const token = tokenExtractor(c)

    if (!token) {
      if (options.required) {
        return c.json({
          api: new URL(c.req.url).hostname,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
          links: {
            auth: 'https://do.md/auth',
          },
          timestamp: Date.now(),
        }, 401)
      }

      // No token, continue without user
      await next()
      return
    }

    // Verify token
    const result = await verifyJWT(token, secret)

    if (!result.success) {
      if (options.required) {
        return c.json({
          api: new URL(c.req.url).hostname,
          error: {
            code: 'INVALID_TOKEN',
            message: result.error || 'Invalid authentication token',
          },
          links: {
            auth: 'https://do.md/auth',
          },
          timestamp: Date.now(),
        }, 401)
      }

      // Invalid token but not required, continue without user
      await next()
      return
    }

    const user = result.user!

    // Check roles if specified
    if (options.roles && options.roles.length > 0) {
      const hasRole = options.roles.some(role => user.roles.includes(role))
      if (!hasRole) {
        return c.json({
          api: new URL(c.req.url).hostname,
          error: {
            code: 'FORBIDDEN',
            message: `Required role: ${options.roles.join(' or ')}`,
          },
          links: {
            self: c.req.url,
          },
          timestamp: Date.now(),
        }, 403)
      }
    }

    // Check permissions if specified
    if (options.permissions && options.permissions.length > 0) {
      const hasPermission = options.permissions.some(perm => user.permissions.includes(perm))
      if (!hasPermission) {
        return c.json({
          api: new URL(c.req.url).hostname,
          error: {
            code: 'FORBIDDEN',
            message: `Required permission: ${options.permissions.join(' or ')}`,
          },
          links: {
            self: c.req.url,
          },
          timestamp: Date.now(),
        }, 403)
      }
    }

    // Set user in context
    c.set('user', user)

    await next()
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the authenticated user from context
 */
export function getUser(c: Context<{ Variables: DOContext }>): AuthUser | undefined {
  return c.get('user')
}

/**
 * Require authentication (throws if not authenticated)
 */
export function requireUser(c: Context<{ Variables: DOContext }>): AuthUser {
  const user = c.get('user')
  if (!user) {
    throw new Error('Authentication required')
  }
  return user
}

/**
 * Check if user has a specific role
 */
export function hasRole(c: Context<{ Variables: DOContext }>, role: string): boolean {
  const user = c.get('user')
  return user?.roles.includes(role) ?? false
}

/**
 * Check if user has a specific permission
 */
export function hasPermission(c: Context<{ Variables: DOContext }>, permission: string): boolean {
  const user = c.get('user')
  return user?.permissions.includes(permission) ?? false
}

// =============================================================================
// API Key Auth
// =============================================================================

/**
 * Create API key authentication middleware
 *
 * @example
 * app.use('/api/*', createApiKeyMiddleware({ required: true }))
 */
export function createApiKeyMiddleware(options: { required?: boolean; headerName?: string } = {}) {
  const headerName = options.headerName || 'X-API-Key'

  return async (c: Context<{ Bindings: Env; Variables: DOContext }>, next: Next): Promise<Response | void> => {
    const apiKey = c.req.header(headerName)

    if (!apiKey) {
      if (options.required) {
        return c.json({
          api: new URL(c.req.url).hostname,
          error: {
            code: 'UNAUTHORIZED',
            message: `API key required (${headerName} header)`,
          },
          links: {
            docs: 'https://do.md/api-keys',
          },
          timestamp: Date.now(),
        }, 401)
      }

      await next()
      return
    }

    // Validate API key against KV store
    // In production, this would check KV for the key
    // For now, accept any key that looks valid
    if (!/^do_[a-zA-Z0-9]{32,}$/.test(apiKey)) {
      if (options.required) {
        return c.json({
          api: new URL(c.req.url).hostname,
          error: {
            code: 'INVALID_API_KEY',
            message: 'Invalid API key format',
          },
          links: {
            docs: 'https://do.md/api-keys',
          },
          timestamp: Date.now(),
        }, 401)
      }

      await next()
      return
    }

    // Set a basic user for API key auth
    c.set('user', {
      id: `api:${apiKey.slice(0, 16)}`,
      roles: ['api'],
      permissions: ['api:read', 'api:write'],
    })

    await next()
  }
}
