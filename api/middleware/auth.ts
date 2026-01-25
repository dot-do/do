/**
 * Authentication Middleware
 *
 * This module provides JWT-based authentication using oauth.do/hono middleware.
 *
 * Key features:
 * - JWKS verification with automatic caching (no hardcoded secrets)
 * - Multiple authentication methods: Bearer tokens, cookies, API keys
 * - Role and permission-based access control
 * - Automatic token refresh handling
 *
 * @example Basic authentication (optional)
 * ```typescript
 * import { auth } from '@dotdo/do/api/middleware'
 *
 * app.use('*', auth())
 * app.get('/data', (c) => {
 *   const user = c.get('user') // null if not authenticated
 *   return c.json({ user })
 * })
 * ```
 *
 * @example Required authentication
 * ```typescript
 * import { requireAuth } from '@dotdo/do/api/middleware'
 *
 * app.use('/protected/*', requireAuth())
 * app.get('/protected/data', (c) => {
 *   const user = c.get('user') // always present
 *   return c.json({ data: 'secret', user })
 * })
 * ```
 *
 * @example API key authentication
 * ```typescript
 * import { apiKey } from '@dotdo/do/api/middleware'
 *
 * app.use('/api/*', apiKey({
 *   verify: async (key) => {
 *     const user = await lookupApiKey(key)
 *     return user // or null if invalid
 *   }
 * }))
 * ```
 *
 * @example Combined JWT + API key
 * ```typescript
 * import { combined } from '@dotdo/do/api/middleware'
 *
 * app.use('/api/*', combined({
 *   auth: {},
 *   apiKey: { verify: async (key) => lookupApiKey(key) }
 * }))
 * ```
 *
 * @module api/middleware/auth
 * @see https://oauth.do for the underlying auth service
 */

import type { Context } from 'hono'
import type { DOContext } from '../types'

// =============================================================================
// Local Type Definitions
// =============================================================================

/**
 * Authenticated user information
 *
 * This interface mirrors oauth.do's AuthUser type to ensure compatibility
 * while avoiding direct type imports that may cause resolution issues.
 */
export interface AuthUser {
  /** Unique user identifier */
  id: string
  /** User email address */
  email?: string
  /** User display name */
  name?: string
  /** User roles for RBAC */
  roles?: string[]
  /** User permissions for fine-grained access control */
  permissions?: string[]
  /** Organization/tenant ID */
  organizationId?: string
  /** Additional user metadata */
  [key: string]: unknown
}

/**
 * Options for the auth() middleware
 *
 * @see auth() middleware from oauth.do/hono
 */
export interface AuthOptions {
  /** Whether authentication is required (default: false) */
  required?: boolean
  /** Allow anonymous requests (sets user to null instead of failing) */
  allowAnonymous?: boolean
  /** Custom error handler */
  onError?: (error: Error) => Response | void
}

/**
 * Options for the requireAuth() middleware
 *
 * @see requireAuth() middleware from oauth.do/hono
 */
export interface RequireAuthOptions {
  /** Required roles (user must have at least one) */
  roles?: string[]
  /** Required permissions (user must have all) */
  permissions?: string[]
}

/**
 * Options for the apiKey() middleware
 *
 * @see apiKey() middleware from oauth.do/hono
 */
export interface ApiKeyOptions {
  /** Header name for API key (default: X-API-Key) */
  header?: string
  /** Validation function for API keys */
  validate?: (key: string) => boolean | Promise<boolean>
}

/**
 * Context variables set by auth middleware
 *
 * These are available via c.get('user'), c.get('token'), etc.
 */
export interface AuthVariables {
  /** Authenticated user (null if not authenticated) */
  user: AuthUser | null
  /** Raw JWT token (null if not authenticated) */
  token: string | null
}

// =============================================================================
// Re-export oauth.do/hono Middleware
// =============================================================================

/**
 * Re-export all auth middleware from oauth.do/hono
 *
 * - auth(): Optional authentication (sets user if valid token present)
 * - requireAuth(): Required authentication (returns 401 if not authenticated)
 * - apiKey(): API key authentication with custom verification
 * - combined(): Combined JWT + API key authentication
 *
 * @see https://oauth.do for documentation
 */
export { auth, requireAuth, apiKey, combined } from 'oauth.do/hono'

// =============================================================================
// Helper Functions (adapted for DOContext compatibility)
// =============================================================================

/**
 * Get the authenticated user from context
 *
 * Works with both oauth.do's AuthUser and legacy DOContext patterns.
 * Automatically maps oauth.do's `organizationId` to DOContext's `orgId`.
 *
 * @param c - Hono context with DOContext variables
 * @returns User object or undefined if not authenticated
 *
 * @example
 * ```typescript
 * app.get('/profile', (c) => {
 *   const user = getUser(c)
 *   if (!user) return c.json({ error: 'Not authenticated' }, 401)
 *   return c.json({ user })
 * })
 * ```
 */
export function getUser(c: Context<{ Variables: DOContext }>): DOContext['user'] | undefined {
  // oauth.do sets c.var.user
  const user = c.get('user') as AuthUser | null | undefined
  if (!user) return undefined

  // Map oauth.do AuthUser to DOContext user format if needed
  // oauth.do uses 'organizationId', DOContext uses 'orgId'
  return {
    id: user.id,
    email: user.email,
    orgId: (user as { organizationId?: string }).organizationId,
    roles: user.roles || [],
    permissions: user.permissions || [],
    exp: undefined, // oauth.do doesn't expose exp directly
  }
}

/**
 * Require authentication and return the user
 *
 * Use this in route handlers when you need the user object and want
 * to throw an error if not authenticated.
 *
 * @param c - Hono context with DOContext variables
 * @returns User object (never null)
 * @throws Error if not authenticated
 *
 * @example
 * ```typescript
 * app.get('/profile', (c) => {
 *   const user = requireUser(c) // throws if not authenticated
 *   return c.json({ user })
 * })
 * ```
 */
export function requireUser(c: Context<{ Variables: DOContext }>): NonNullable<DOContext['user']> {
  const user = getUser(c)
  if (!user) {
    throw new Error('Authentication required')
  }
  return user
}

/**
 * Check if the authenticated user has a specific role
 *
 * @param c - Hono context with DOContext variables
 * @param role - Role name to check
 * @returns true if user has the role, false otherwise
 *
 * @example
 * ```typescript
 * app.get('/admin', (c) => {
 *   if (!hasRole(c, 'admin')) {
 *     return c.json({ error: 'Forbidden' }, 403)
 *   }
 *   return c.json({ data: 'admin data' })
 * })
 * ```
 */
export function hasRole(c: Context<{ Variables: DOContext }>, role: string): boolean {
  const user = c.get('user')
  return user?.roles?.includes(role) ?? false
}

/**
 * Check if the authenticated user has a specific permission
 *
 * @param c - Hono context with DOContext variables
 * @param permission - Permission name to check
 * @returns true if user has the permission, false otherwise
 *
 * @example
 * ```typescript
 * app.post('/items', (c) => {
 *   if (!hasPermission(c, 'items:write')) {
 *     return c.json({ error: 'Forbidden' }, 403)
 *   }
 *   // ... create item
 * })
 * ```
 */
export function hasPermission(c: Context<{ Variables: DOContext }>, permission: string): boolean {
  const user = c.get('user')
  return user?.permissions?.includes(permission) ?? false
}

/**
 * Check if the request is authenticated
 * Uses oauth.do's isAuth context variable
 */
export function isAuthenticated(c: Context): boolean {
  return c.get('isAuth') === true
}

/**
 * Get the raw token from context
 * Uses oauth.do's token context variable
 */
export function getToken(c: Context): string | null {
  return c.get('token') ?? null
}
