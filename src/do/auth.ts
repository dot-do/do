/**
 * Auth Context Module
 *
 * Provides authentication and authorization context management:
 * - getAuthContext: Get the current auth context
 * - setAuthContext: Set the auth context for current request
 * - checkPermission: Check if current user has permission
 * - requirePermission: Require permission or throw
 * - getAuthMetadata: Get metadata from auth context
 * - getWebSocketAuth: Get auth context for a WebSocket
 * - setWebSocketAuth: Set auth context for a WebSocket
 * - withAuth: Create a scoped proxy with fixed auth context
 * - extractAuthFromRequest: Extract auth from HTTP headers
 * - extractAuthFromUrl: Extract auth from URL params
 */

import type { DOContext, AuthContext } from './types'

/**
 * Get the current auth context
 */
export function getAuthContext(ctx: DOContext): AuthContext | null {
  return ctx.currentAuthContext
}

/**
 * Set the auth context for the current request
 */
export function setAuthContext(ctx: DOContext, authContext: AuthContext | null): void {
  ctx.currentAuthContext = authContext
}

/**
 * Check if the current user has a specific permission
 */
export function checkPermission(ctx: DOContext, permission: string): boolean {
  if (!ctx.currentAuthContext) {
    return false
  }
  if (!ctx.currentAuthContext.permissions || ctx.currentAuthContext.permissions.length === 0) {
    return false
  }
  return ctx.currentAuthContext.permissions.includes(permission)
}

/**
 * Require a specific permission, throwing if not present
 */
export function requirePermission(ctx: DOContext, permission: string): void {
  if (!ctx.currentAuthContext) {
    throw new Error('Authentication required')
  }
  if (!checkPermission(ctx, permission)) {
    throw new Error('Permission denied')
  }
}

/**
 * Get a metadata value from the auth context
 */
export function getAuthMetadata(ctx: DOContext, key: string): unknown {
  if (!ctx.currentAuthContext?.metadata) {
    return undefined
  }
  return ctx.currentAuthContext.metadata[key]
}

/**
 * Get the WebSocket auth context for a specific connection
 */
export function getWebSocketAuth(ctx: DOContext, ws?: WebSocket): AuthContext | undefined {
  if (!ws) {
    // Return the current auth context if no ws specified
    return ctx.currentAuthContext ?? undefined
  }
  return ctx.wsAuthContexts.get(ws)
}

/**
 * Set the WebSocket auth context for a specific connection
 */
export function setWebSocketAuth(ctx: DOContext, ws: WebSocket, authContext: AuthContext): void {
  ctx.wsAuthContexts.set(ws, authContext)
}

/**
 * Decode JWT payload (base64url decode without signature verification)
 * Note: This does NOT verify the signature - use a proper JWT library for that
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }
    // Base64url decode the payload (second part)
    const payload = parts[1]
    // Convert base64url to base64
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    // Pad if needed
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    // Decode
    const decoded = atob(padded)
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

/**
 * Extract auth context from HTTP request headers
 */
export function extractAuthFromRequest(request: Request): AuthContext | null {
  const authContext: AuthContext = {}

  // Check for X-Auth-Context header (full auth context as JSON)
  const xAuthContext = request.headers.get('X-Auth-Context')
  if (xAuthContext) {
    try {
      const parsed = JSON.parse(xAuthContext)
      return parsed as AuthContext
    } catch {
      // Invalid JSON, return null for malformed X-Auth-Context
      return null
    }
  }

  // Extract Authorization header
  const authHeader = request.headers.get('Authorization')
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      authContext.token = token

      // Decode JWT payload to extract claims
      const payload = decodeJwtPayload(token)
      if (payload) {
        // Extract userId from common JWT claims
        if (typeof payload.userId === 'string') {
          authContext.userId = payload.userId
        } else if (typeof payload.sub === 'string') {
          authContext.userId = payload.sub
        }

        // Extract permissions
        if (Array.isArray(payload.permissions)) {
          authContext.permissions = payload.permissions as string[]
        }

        // Extract organizationId
        if (typeof payload.organizationId === 'string') {
          authContext.organizationId = payload.organizationId
        } else if (typeof payload.org === 'string') {
          authContext.organizationId = payload.org
        }

        // Store other claims as metadata
        const knownClaims = ['userId', 'sub', 'permissions', 'organizationId', 'org', 'iat', 'exp', 'iss', 'aud']
        const metadata: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(payload)) {
          if (!knownClaims.includes(key)) {
            metadata[key] = value
          }
        }
        if (Object.keys(metadata).length > 0) {
          authContext.metadata = metadata
        }
      }
    } else if (authHeader.startsWith('Basic ')) {
      // Basic auth: decode base64 credentials
      const credentials = authHeader.substring(6)
      try {
        const decoded = atob(credentials)
        const [username] = decoded.split(':')
        if (username) {
          authContext.userId = username
          authContext.token = credentials
        }
      } catch {
        // Invalid base64, ignore
      }
    }
  }

  // Check for X-API-Key header
  const apiKey = request.headers.get('X-API-Key')
  if (apiKey) {
    authContext.token = apiKey
  }

  // Extract custom headers (can override JWT claims if explicitly set)
  const userId = request.headers.get('X-User-ID')
  if (userId) {
    authContext.userId = userId
  }

  const orgId = request.headers.get('X-Organization-ID')
  if (orgId) {
    authContext.organizationId = orgId
  }

  const permissions = request.headers.get('X-Permissions')
  if (permissions) {
    authContext.permissions = permissions.split(',').map(p => p.trim())
  }

  // Return null if no auth info was found
  if (Object.keys(authContext).length === 0) {
    return null
  }

  return authContext
}

/**
 * Extract auth from WebSocket upgrade request query params
 */
export function extractAuthFromUrl(url: URL): AuthContext | null {
  const authContext: AuthContext = {}

  const token = url.searchParams.get('token')
  if (token) {
    authContext.token = token
  }

  const userId = url.searchParams.get('userId')
  if (userId) {
    authContext.userId = userId
  }

  const orgId = url.searchParams.get('organizationId')
  if (orgId) {
    authContext.organizationId = orgId
  }

  // Return null if no auth info was found
  if (Object.keys(authContext).length === 0) {
    return null
  }

  return authContext
}
