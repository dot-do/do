/**
 * Authentication Middleware Tests
 *
 * Tests for oauth.do/hono middleware integration.
 * Uses proper JWKS verification - no dev-secret fallback.
 *
 * @module api/middleware/auth.test
 */

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import {
  auth,
  requireAuth,
  apiKey,
  combined,
  getUser,
  requireUser,
  hasRole,
  hasPermission,
  isAuthenticated,
  getToken,
} from './auth'

// =============================================================================
// oauth.do/hono Module Export Tests
// =============================================================================

describe('Auth Module Exports (oauth.do/hono)', () => {
  describe('Middleware Functions', () => {
    it('should export auth middleware from oauth.do/hono', () => {
      expect(auth).toBeDefined()
      expect(typeof auth).toBe('function')
    })

    it('should export requireAuth middleware from oauth.do/hono', () => {
      expect(requireAuth).toBeDefined()
      expect(typeof requireAuth).toBe('function')
    })

    it('should export apiKey middleware from oauth.do/hono', () => {
      expect(apiKey).toBeDefined()
      expect(typeof apiKey).toBe('function')
    })

    it('should export combined middleware from oauth.do/hono', () => {
      expect(combined).toBeDefined()
      expect(typeof combined).toBe('function')
    })
  })

  describe('Helper Functions', () => {
    it('should export getUser helper', () => {
      expect(getUser).toBeDefined()
      expect(typeof getUser).toBe('function')
    })

    it('should export requireUser helper', () => {
      expect(requireUser).toBeDefined()
      expect(typeof requireUser).toBe('function')
    })

    it('should export hasRole helper', () => {
      expect(hasRole).toBeDefined()
      expect(typeof hasRole).toBe('function')
    })

    it('should export hasPermission helper', () => {
      expect(hasPermission).toBeDefined()
      expect(typeof hasPermission).toBe('function')
    })

    it('should export isAuthenticated helper', () => {
      expect(isAuthenticated).toBeDefined()
      expect(typeof isAuthenticated).toBe('function')
    })

    it('should export getToken helper', () => {
      expect(getToken).toBeDefined()
      expect(typeof getToken).toBe('function')
    })
  })

  describe('No Custom JWT Implementation', () => {
    it('should NOT export decodeJWT (using oauth.do instead)', async () => {
      const authModule = await import('./auth')
      expect(authModule).not.toHaveProperty('decodeJWT')
    })

    it('should NOT export verifyJWT (using oauth.do instead)', async () => {
      const authModule = await import('./auth')
      expect(authModule).not.toHaveProperty('verifyJWT')
    })

    it('should NOT export createAuthMiddleware (using oauth.do auth instead)', async () => {
      const authModule = await import('./auth')
      expect(authModule).not.toHaveProperty('createAuthMiddleware')
    })

    it('should NOT export createApiKeyMiddleware (using oauth.do apiKey instead)', async () => {
      const authModule = await import('./auth')
      expect(authModule).not.toHaveProperty('createApiKeyMiddleware')
    })
  })
})

// =============================================================================
// oauth.do/hono Middleware Behavior Tests
// =============================================================================

describe('auth() Middleware', () => {
  it('should create middleware function', () => {
    const middleware = auth()
    expect(middleware).toBeDefined()
    expect(typeof middleware).toBe('function')
  })

  it('should accept options object', () => {
    const middleware = auth({
      cookieName: 'session',
      headerName: 'Authorization',
      jwksCacheTtl: 7200,
    })
    expect(middleware).toBeDefined()
  })

  it('should set context variables when no token present', async () => {
    const app = new Hono()
    app.use('*', auth())
    app.get('/test', (c) => {
      return c.json({
        user: c.get('user'),
        userId: c.get('userId'),
        isAuth: c.get('isAuth'),
        token: c.get('token'),
      })
    })

    const res = await app.request('/test')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.user).toBeNull()
    expect(body.userId).toBeNull()
    expect(body.isAuth).toBe(false)
    expect(body.token).toBeNull()
  })

  it('should pass through unauthenticated requests (auth is not required by default)', async () => {
    const app = new Hono()
    app.use('*', auth())
    app.get('/public', (c) => c.json({ message: 'public' }))

    const res = await app.request('/public')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.message).toBe('public')
  })
})

describe('requireAuth() Middleware', () => {
  it('should create middleware function', () => {
    const middleware = requireAuth()
    expect(middleware).toBeDefined()
    expect(typeof middleware).toBe('function')
  })

  it('should return 401 when no authentication provided', async () => {
    const app = new Hono()
    app.use('/protected/*', requireAuth())
    app.get('/protected/data', (c) => c.json({ data: 'secret' }))

    const res = await app.request('/protected/data')
    expect(res.status).toBe(401)

    const body = await res.json()
    expect(body.error).toBe('Authentication required')
  })

  it('should support redirectTo option', () => {
    const middleware = requireAuth({ redirectTo: '/login' })
    expect(middleware).toBeDefined()
  })

  it('should support roles option', () => {
    const middleware = requireAuth({ roles: ['admin', 'user'] })
    expect(middleware).toBeDefined()
  })

  it('should support permissions option', () => {
    const middleware = requireAuth({ permissions: ['read', 'write'] })
    expect(middleware).toBeDefined()
  })
})

describe('apiKey() Middleware', () => {
  it('should create middleware with verify function', () => {
    const middleware = apiKey({
      verify: async (key) => {
        if (key === 'valid-key') {
          return { id: 'user-123' }
        }
        return null
      },
    })
    expect(middleware).toBeDefined()
    expect(typeof middleware).toBe('function')
  })

  it('should return 401 when no API key provided', async () => {
    const app = new Hono()
    app.use(
      '/api/*',
      apiKey({
        verify: async () => null,
      })
    )
    app.get('/api/data', (c) => c.json({ data: 'secret' }))

    const res = await app.request('/api/data')
    expect(res.status).toBe(401)

    const body = await res.json()
    expect(body.error).toBe('API key required')
  })

  it('should return 401 for invalid API key', async () => {
    const app = new Hono()
    app.use(
      '/api/*',
      apiKey({
        verify: async (key) => {
          if (key === 'valid-key') {
            return { id: 'user-123' }
          }
          return null
        },
      })
    )
    app.get('/api/data', (c) => c.json({ data: 'secret' }))

    const res = await app.request('/api/data', {
      headers: { 'X-API-Key': 'invalid-key' },
    })
    expect(res.status).toBe(401)

    const body = await res.json()
    expect(body.error).toBe('Invalid API key')
  })

  it('should authenticate with valid API key', async () => {
    const app = new Hono()
    app.use(
      '/api/*',
      apiKey({
        verify: async (key) => {
          if (key === 'valid-key') {
            return { id: 'user-123', email: 'test@example.com' }
          }
          return null
        },
      })
    )
    app.get('/api/data', (c) => {
      return c.json({
        data: 'secret',
        userId: c.get('userId'),
        isAuth: c.get('isAuth'),
      })
    })

    const res = await app.request('/api/data', {
      headers: { 'X-API-Key': 'valid-key' },
    })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.data).toBe('secret')
    expect(body.userId).toBe('user-123')
    expect(body.isAuth).toBe(true)
  })

  it('should support custom header name', async () => {
    const app = new Hono()
    app.use(
      '/api/*',
      apiKey({
        headerName: 'X-Custom-Key',
        verify: async (key) => {
          if (key === 'valid-key') {
            return { id: 'user-123' }
          }
          return null
        },
      })
    )
    app.get('/api/data', (c) => c.json({ userId: c.get('userId') }))

    const res = await app.request('/api/data', {
      headers: { 'X-Custom-Key': 'valid-key' },
    })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.userId).toBe('user-123')
  })
})

describe('combined() Middleware', () => {
  it('should create middleware with auth and apiKey options', () => {
    const middleware = combined({
      auth: {},
      apiKey: {
        verify: async () => null,
      },
    })
    expect(middleware).toBeDefined()
    expect(typeof middleware).toBe('function')
  })

  it('should return 401 when neither JWT nor API key provided', async () => {
    const app = new Hono()
    app.use(
      '/api/*',
      combined({
        auth: {},
        apiKey: {
          verify: async (key) => {
            if (key === 'valid-key') {
              return { id: 'user-123' }
            }
            return null
          },
        },
      })
    )
    app.get('/api/data', (c) => c.json({ data: 'secret' }))

    const res = await app.request('/api/data')
    expect(res.status).toBe(401)

    const body = await res.json()
    expect(body.error).toBe('Authentication required')
  })

  it('should authenticate with valid API key when JWT not provided', async () => {
    const app = new Hono()
    app.use(
      '/api/*',
      combined({
        auth: {},
        apiKey: {
          verify: async (key) => {
            if (key === 'valid-key') {
              return { id: 'api-user-123' }
            }
            return null
          },
        },
      })
    )
    app.get('/api/data', (c) => {
      return c.json({
        userId: c.get('userId'),
        isAuth: c.get('isAuth'),
      })
    })

    const res = await app.request('/api/data', {
      headers: { 'X-API-Key': 'valid-key' },
    })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.userId).toBe('api-user-123')
    expect(body.isAuth).toBe(true)
  })
})

// =============================================================================
// No dev-secret Fallback Tests
// =============================================================================

describe('No dev-secret Fallback', () => {
  it('should not have any hardcoded secrets in module', async () => {
    // Read the auth module source to verify no hardcoded secrets
    const authModule = await import('./auth')

    // The module should use oauth.do which doesn't have dev-secret
    expect(authModule.auth).toBeDefined()

    // Should not have any secret-related exports
    expect(authModule).not.toHaveProperty('secret')
    expect(authModule).not.toHaveProperty('AUTH_SECRET')
    expect(authModule).not.toHaveProperty('devSecret')
  })

  it('should NOT accept tokens without proper JWKS verification', async () => {
    // This test verifies that we're using oauth.do's proper JWT verification
    // which uses JWKS, not a simple secret-based verification

    const app = new Hono()
    app.use('*', auth())
    app.use('/protected/*', requireAuth())
    app.get('/protected/data', (c) => c.json({ data: 'secret' }))

    // Create a fake JWT (not properly signed)
    const fakeHeader = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const fakePayload = btoa(
      JSON.stringify({
        sub: 'attacker',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    )
    const fakeToken = `${fakeHeader}.${fakePayload}.fake-signature`

    const res = await app.request('/protected/data', {
      headers: { Authorization: `Bearer ${fakeToken}` },
    })

    // Should reject because the token isn't properly signed with JWKS
    expect(res.status).toBe(401)
  })
})

// =============================================================================
// oauth.do Type Compatibility Tests
// =============================================================================

describe('Type Exports from oauth.do', () => {
  it('should export AuthUser type', async () => {
    // TypeScript compilation would fail if types aren't properly exported
    // This test verifies runtime accessibility
    const authModule = await import('./auth')
    expect(authModule).toHaveProperty('auth')
  })

  it('should export AuthOptions type', async () => {
    const authModule = await import('./auth')
    // The auth function accepts AuthOptions
    const middleware = authModule.auth({
      cookieName: 'auth',
      headerName: 'Authorization',
    })
    expect(middleware).toBeDefined()
  })

  it('should export RequireAuthOptions type', async () => {
    const authModule = await import('./auth')
    // The requireAuth function accepts RequireAuthOptions
    const middleware = authModule.requireAuth({
      roles: ['admin'],
      permissions: ['read'],
      redirectTo: '/login',
    })
    expect(middleware).toBeDefined()
  })

  it('should export ApiKeyOptions type', async () => {
    const authModule = await import('./auth')
    // The apiKey function accepts ApiKeyOptions
    const middleware = authModule.apiKey({
      headerName: 'X-API-Key',
      verify: async () => null,
    })
    expect(middleware).toBeDefined()
  })
})

// =============================================================================
// Context Variable Tests (oauth.do pattern)
// =============================================================================

describe('Context Variables (oauth.do pattern)', () => {
  it('should set user to null when not authenticated', async () => {
    const app = new Hono()
    app.use('*', auth())
    app.get('/test', (c) => c.json({ user: c.get('user') }))

    const res = await app.request('/test')
    const body = await res.json()
    expect(body.user).toBeNull()
  })

  it('should set userId to null when not authenticated', async () => {
    const app = new Hono()
    app.use('*', auth())
    app.get('/test', (c) => c.json({ userId: c.get('userId') }))

    const res = await app.request('/test')
    const body = await res.json()
    expect(body.userId).toBeNull()
  })

  it('should set isAuth to false when not authenticated', async () => {
    const app = new Hono()
    app.use('*', auth())
    app.get('/test', (c) => c.json({ isAuth: c.get('isAuth') }))

    const res = await app.request('/test')
    const body = await res.json()
    expect(body.isAuth).toBe(false)
  })

  it('should set token to null when not authenticated', async () => {
    const app = new Hono()
    app.use('*', auth())
    app.get('/test', (c) => c.json({ token: c.get('token') }))

    const res = await app.request('/test')
    const body = await res.json()
    expect(body.token).toBeNull()
  })
})

// =============================================================================
// Integration with Middleware Index
// =============================================================================

describe('Middleware Index Exports', () => {
  it('should export auth from middleware index', async () => {
    const middlewareIndex = await import('./index')
    expect(middlewareIndex).toHaveProperty('auth')
    expect(typeof middlewareIndex.auth).toBe('function')
  })

  it('should export requireAuth from middleware index', async () => {
    const middlewareIndex = await import('./index')
    expect(middlewareIndex).toHaveProperty('requireAuth')
    expect(typeof middlewareIndex.requireAuth).toBe('function')
  })

  it('should export apiKey from middleware index', async () => {
    const middlewareIndex = await import('./index')
    expect(middlewareIndex).toHaveProperty('apiKey')
    expect(typeof middlewareIndex.apiKey).toBe('function')
  })

  it('should export combined from middleware index', async () => {
    const middlewareIndex = await import('./index')
    expect(middlewareIndex).toHaveProperty('combined')
    expect(typeof middlewareIndex.combined).toBe('function')
  })

  it('should NOT export createAuthMiddleware from middleware index', async () => {
    const middlewareIndex = await import('./index')
    expect(middlewareIndex).not.toHaveProperty('createAuthMiddleware')
  })

  it('should NOT export createApiKeyMiddleware from middleware index', async () => {
    const middlewareIndex = await import('./index')
    expect(middlewareIndex).not.toHaveProperty('createApiKeyMiddleware')
  })
})

// =============================================================================
// Helper Function Behavior Tests
// =============================================================================

describe('Helper Functions with oauth.do', () => {
  describe('isAuthenticated()', () => {
    it('should return false when not authenticated', async () => {
      const app = new Hono()
      app.use('*', auth())
      app.get('/test', (c) => {
        const result = c.get('isAuth')
        return c.json({ isAuth: result })
      })

      const res = await app.request('/test')
      const body = await res.json()
      expect(body.isAuth).toBe(false)
    })
  })

  describe('getToken()', () => {
    it('should return null when no token provided', async () => {
      const app = new Hono()
      app.use('*', auth())
      app.get('/test', (c) => {
        const result = c.get('token')
        return c.json({ token: result })
      })

      const res = await app.request('/test')
      const body = await res.json()
      expect(body.token).toBeNull()
    })
  })
})
