/**
 * Authentication Middleware
 *
 * Re-exports oauth.do/hono middleware for JWT-based authentication.
 * Uses JWKS verification with caching - no dev-secret fallback.
 */

import type { Context } from 'hono'
import type { DOContext } from '../types'

// =============================================================================
// Local Type Definitions
// =============================================================================

// Define AuthUser locally to avoid import issues with oauth.do/hono types
export interface AuthUser {
  id: string
  email?: string
  name?: string
  roles?: string[]
  permissions?: string[]
  organizationId?: string
  [key: string]: unknown
}

export interface AuthOptions {
  required?: boolean
  allowAnonymous?: boolean
  onError?: (error: Error) => Response | void
}

export interface RequireAuthOptions {
  roles?: string[]
  permissions?: string[]
}

export interface ApiKeyOptions {
  header?: string
  validate?: (key: string) => boolean | Promise<boolean>
}

export interface AuthVariables {
  user: AuthUser | null
  token: string | null
}

// =============================================================================
// Re-export oauth.do/hono Middleware
// =============================================================================

// Re-export all auth middleware from oauth.do/hono
export { auth, requireAuth, apiKey, combined } from 'oauth.do/hono'

// =============================================================================
// Helper Functions (adapted for DOContext compatibility)
// =============================================================================

/**
 * Get the authenticated user from context
 * Works with both oauth.do's AuthUser and legacy DOContext patterns
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
 * Require authentication (throws if not authenticated)
 */
export function requireUser(c: Context<{ Variables: DOContext }>): NonNullable<DOContext['user']> {
  const user = getUser(c)
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
  return user?.roles?.includes(role) ?? false
}

/**
 * Check if user has a specific permission
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
