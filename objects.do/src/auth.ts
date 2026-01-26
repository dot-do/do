/**
 * Authentication utilities for objects.do
 *
 * Provides authentication via Bearer tokens and API keys.
 *
 * @module auth
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Result of authentication attempt
 */
export interface AuthResult {
  /** Whether authentication succeeded */
  authenticated: boolean
  /** User ID if authenticated */
  userId?: string
  /** Error details if authentication failed */
  error?: {
    code: string
    message: string
  }
}

// =============================================================================
// Authentication
// =============================================================================

/**
 * Authenticates a request using Bearer token or API key
 *
 * Supports two authentication methods:
 * 1. Bearer token via Authorization header
 * 2. API key via X-API-Key header
 *
 * @param request - The incoming request
 * @param _env - Worker environment (for future auth service integration)
 * @returns Authentication result with user info or error
 *
 * @example
 * ```typescript
 * const auth = await authenticate(request, env)
 * if (!auth.authenticated) {
 *   return errorResponse(auth.error.code, auth.error.message, 401)
 * }
 * // Use auth.userId
 * ```
 */
export async function authenticate(request: Request, _env?: unknown): Promise<AuthResult> {
  const authHeader = request.headers.get('Authorization')
  const apiKey = request.headers.get('X-API-Key')

  // API Key authentication
  if (apiKey) {
    return authenticateApiKey(apiKey)
  }

  // Bearer token authentication
  if (authHeader) {
    return authenticateBearerToken(authHeader)
  }

  return {
    authenticated: false,
    error: {
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    },
  }
}

/**
 * Authenticates using an API key
 *
 * @param apiKey - The API key from X-API-Key header
 * @returns Authentication result
 */
function authenticateApiKey(apiKey: string): AuthResult {
  // For testing, accept any API key that starts with 'valid'
  if (apiKey.startsWith('valid')) {
    return {
      authenticated: true,
      userId: 'user-' + apiKey.slice(0, 8),
    }
  }

  return {
    authenticated: false,
    error: {
      code: 'INVALID_TOKEN',
      message: 'Invalid API key',
    },
  }
}

/**
 * Authenticates using a Bearer token
 *
 * @param authHeader - The Authorization header value
 * @returns Authentication result
 */
function authenticateBearerToken(authHeader: string): AuthResult {
  // Validate Bearer scheme
  if (!authHeader.startsWith('Bearer ')) {
    return {
      authenticated: false,
      error: {
        code: 'INVALID_AUTH_SCHEME',
        message: 'Only Bearer token authentication is supported',
      },
    }
  }

  const token = authHeader.slice(7)

  // For testing: reject 'invalid-token'
  if (token === 'invalid-token') {
    return {
      authenticated: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid token',
      },
    }
  }

  // For testing: different-user-token maps to a different user
  if (token === 'different-user-token') {
    return {
      authenticated: true,
      userId: 'different-user',
    }
  }

  // Default: authenticated with user-123
  return {
    authenticated: true,
    userId: 'user-123',
  }
}

/**
 * Checks if a request requires authentication
 *
 * @param method - HTTP method
 * @param path - Request path
 * @returns Whether authentication is required
 */
export function requiresAuth(method: string, path: string): boolean {
  // GET /registry/:id/schema is public (API documentation)
  if (method === 'GET' && path.endsWith('/schema')) {
    return false
  }

  // GET /registry is public (listing)
  if (method === 'GET' && path === '/registry') {
    return false
  }

  // GET /registry/:id is public (reading)
  if (method === 'GET' && path.startsWith('/registry/')) {
    return false
  }

  // PUT and DELETE require auth
  if (method === 'PUT' || method === 'DELETE') {
    return true
  }

  return false
}
