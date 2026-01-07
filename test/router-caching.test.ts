/**
 * @dotdo/do - Router Caching Tests (RED Phase)
 *
 * Tests for Hono router caching between requests.
 *
 * The Hono router should be created once and cached for reuse across
 * multiple requests to the same DO instance, rather than being recreated
 * on every request.
 *
 * Current behavior (BUG):
 *   handleRequest() calls this.createRouter() on EVERY request
 *   This creates a new Hono instance each time, wasting CPU and memory
 *
 * Expected behavior (FIX):
 *   The router should be created once (in constructor or lazy-init) and reused
 *   e.g., `private router = this.createRouter()` as a class property
 *
 * Benefits of router caching:
 * - Performance: Avoid repeated route registration overhead
 * - Memory: Single router instance per DO
 * - Consistency: Same router state across requests
 *
 * These tests should FAIL initially (RED), then pass after implementation (GREEN).
 */

import { vi } from 'vitest'

vi.mock('cloudflare:workers', () => {
  class MockDurableObject<Env = unknown> {
    protected ctx: unknown
    protected env: Env
    constructor(ctx: unknown, env: Env) {
      this.ctx = ctx
      this.env = env
    }
  }
  return { DurableObject: MockDurableObject }
})

import { describe, it, expect, beforeEach } from 'vitest'
import { DO } from '../src/do'
import { Hono } from 'hono'

// Mock WebSocketPair for tests that involve WebSocket upgrade
class MockWebSocket {
  readyState = 1
  send = vi.fn()
  close = vi.fn()
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
}

class MockWebSocketPair {
  0: MockWebSocket
  1: MockWebSocket
  constructor() {
    this[0] = new MockWebSocket()
    this[1] = new MockWebSocket()
  }
}

// Set up global mocks
;(globalThis as any).WebSocketPair = MockWebSocketPair

/**
 * Create an in-memory SQLite mock for testing
 */
function createMockSqlStorage() {
  const tables: Map<string, Map<string, Record<string, unknown>>> = new Map()

  return {
    exec(query: string, ...params: unknown[]) {
      const results: unknown[] = []
      const normalizedQuery = query.trim().toUpperCase()

      if (normalizedQuery.startsWith('CREATE TABLE') || normalizedQuery.startsWith('CREATE INDEX')) {
        const tableMatch = query.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)
        if (tableMatch) {
          const tableName = tableMatch[1]
          if (!tables.has(tableName)) {
            tables.set(tableName, new Map())
          }
        }
      } else if (normalizedQuery.startsWith('INSERT')) {
        const tableMatch = query.match(/INSERT INTO (\w+)/i)
        if (tableMatch) {
          const tableName = tableMatch[1]
          if (!tables.has(tableName)) {
            tables.set(tableName, new Map())
          }
          const table = tables.get(tableName)!
          if (tableName === 'documents') {
            const [collection, id, data] = params as [string, string, string]
            const key = `${collection}:${id}`
            table.set(key, { collection, id, data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          }
        }
      } else if (normalizedQuery.startsWith('SELECT')) {
        const tableName = 'documents'
        const table = tables.get(tableName)

        if (table) {
          if (query.includes('WHERE collection = ? AND id = ?')) {
            const [collection, id] = params as [string, string]
            const key = `${collection}:${id}`
            const row = table.get(key)
            if (row) {
              results.push({ data: row.data })
            }
          } else if (query.includes('WHERE collection = ?')) {
            const [collection, limit, offset] = params as [string, number, number]
            const matching: Record<string, unknown>[] = []
            for (const [key, row] of table.entries()) {
              if (key.startsWith(`${collection}:`)) {
                matching.push({ data: row.data })
              }
            }
            const paginated = matching.slice(offset, offset + limit)
            results.push(...paginated)
          }
        }
      }

      return {
        toArray() {
          return results
        }
      }
    }
  }
}

/**
 * Create a mock context with SQLite storage
 */
function createMockCtx() {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    storage: {
      sql: createMockSqlStorage()
    },
    acceptWebSocket: vi.fn(),
    setWebSocketAutoResponse: vi.fn(),
  }
}

// Mock environment
const mockEnv = {
  DO_NAMESPACE: {
    idFromName: vi.fn(() => ({ toString: () => 'mock-id' })),
    get: vi.fn(),
  },
}

describe('Hono Router Caching', () => {
  /**
   * These tests verify that the Hono router is properly cached.
   *
   * The key insight is that createRouter() creates a NEW Hono instance
   * every time it's called. To verify caching works, we need to prove
   * that createRouter() is only called ONCE for multiple requests.
   */

  describe('Router Instance Reuse - CRITICAL', () => {
    it('should have a cached router property on the class instance', () => {
      /**
       * The DO class should have a router property (e.g., `private router = this.createRouter()`)
       * that stores the Hono instance for reuse.
       *
       * CURRENT: No such property exists - router is created inline in handleRequest()
       * EXPECTED: A property like `router`, `_router`, or `honoRouter` should exist
       */
      const doInstance = new DO(createMockCtx() as any, mockEnv)
      const instance = doInstance as unknown as Record<string, unknown>

      // Check for a cached router property
      const routerProps = ['router', '_router', 'honoRouter', '_honoRouter']
      let foundRouter = false
      for (const prop of routerProps) {
        if (prop in instance && instance[prop] !== undefined) {
          foundRouter = true
          break
        }
      }

      // This should FAIL because DO currently has no cached router property
      expect(foundRouter).toBe(true)
    })

    it('should reuse the same Hono instance across multiple requests', async () => {
      /**
       * Track how many times createRouter() is called AFTER construction.
       * With proper caching (eager or lazy), createRouter should NOT be called
       * during handleRequest - it should use the cached instance.
       *
       * CURRENT (without caching): Called on EVERY request (N times for N requests)
       * EXPECTED (with caching): Called 0 times after construction (already cached)
       */
      const doInstance = new DO(createMockCtx() as any, mockEnv)

      // Track calls to createRouter AFTER construction
      let createRouterCallCount = 0
      const originalCreateRouter = (doInstance as any).createRouter
      ;(doInstance as any).createRouter = function(this: any) {
        createRouterCallCount++
        return originalCreateRouter.call(this)
      }

      // Make 5 requests
      await doInstance.handleRequest(new Request('http://localhost/health'))
      await doInstance.handleRequest(new Request('http://localhost/health'))
      await doInstance.handleRequest(new Request('http://localhost/health'))
      await doInstance.handleRequest(new Request('http://localhost/health'))
      await doInstance.handleRequest(new Request('http://localhost/health'))

      // With proper caching, createRouter should NOT be called during handleRequest
      // because the router is already cached (either from constructor or first request)
      expect(createRouterCallCount).toBe(0)
    })

    it('should NOT call createRouter() after construction even with 100 requests', async () => {
      const doInstance = new DO(createMockCtx() as any, mockEnv)

      // Track calls AFTER construction
      let createRouterCallCount = 0
      const originalCreateRouter = (doInstance as any).createRouter
      ;(doInstance as any).createRouter = function(this: any) {
        createRouterCallCount++
        return originalCreateRouter.call(this)
      }

      // Make 100 requests
      for (let i = 0; i < 100; i++) {
        await doInstance.handleRequest(new Request('http://localhost/health'))
      }

      // With caching, createRouter should not be called during handleRequest
      expect(createRouterCallCount).toBe(0)
    })
  })

  describe('Eager Initialization', () => {
    it('should create router at construction time, not on first request', () => {
      /**
       * The router should be created when DO is instantiated, not lazily.
       * This ensures consistent behavior and avoids first-request latency.
       *
       * CURRENT: Router is created on every handleRequest() call
       * EXPECTED: Router is created once during construction
       */
      const doInstance = new DO(createMockCtx() as any, mockEnv)
      const instance = doInstance as unknown as Record<string, unknown>

      // Before making ANY requests, there should be a router
      const routerProps = ['router', '_router', 'honoRouter', '_honoRouter']
      let router: unknown = undefined
      for (const prop of routerProps) {
        if (prop in instance && instance[prop] instanceof Hono) {
          router = instance[prop]
          break
        }
      }

      // This should FAIL because there's no cached router property
      expect(router).toBeInstanceOf(Hono)
    })

    it('should have router available immediately after construction', () => {
      const doInstance = new DO(createMockCtx() as any, mockEnv)
      const instance = doInstance as unknown as Record<string, unknown>

      // Check for any router property with a truthy value
      const routerProps = ['router', '_router', 'honoRouter', '_honoRouter']
      let hasRouter = false
      for (const prop of routerProps) {
        if (prop in instance && instance[prop]) {
          hasRouter = true
          break
        }
      }

      // This should FAIL because there's no cached router
      expect(hasRouter).toBe(true)
    })
  })

  describe('Object Identity Verification', () => {
    it('should return exact same Hono object across requests', async () => {
      /**
       * Verify the cached router is the SAME object across requests.
       * With eager initialization, createRouter is called in constructor,
       * so we track calls AFTER construction (should be 0 with caching).
       */
      const doInstance = new DO(createMockCtx() as any, mockEnv)
      const instance = doInstance as unknown as Record<string, unknown>

      // Get the cached router reference
      const cachedRouter = instance['_router']

      // Capture any additional router instances from createRouter calls after construction
      const routerInstances: Hono[] = []
      const originalCreateRouter = (doInstance as any).createRouter
      ;(doInstance as any).createRouter = function(this: any) {
        const router = originalCreateRouter.call(this)
        routerInstances.push(router)
        return router
      }

      // Make several requests
      await doInstance.handleRequest(new Request('http://localhost/health'))
      await doInstance.handleRequest(new Request('http://localhost/api/users'))
      await doInstance.handleRequest(new Request('http://localhost/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '1', method: 'list', params: ['users'] })
      }))

      // With proper caching: createRouter should NOT be called after construction
      expect(routerInstances.length).toBe(0)

      // The cached router should still be the same instance
      expect(instance['_router']).toBe(cachedRouter)
    })
  })

  describe('Performance Impact', () => {
    it('should be significantly faster with caching than without', async () => {
      /**
       * Creating a new Hono router involves:
       * - Object allocation
       * - Route registration
       * - Internal data structure setup
       *
       * With caching, requests should be measurably faster.
       */
      const iterations = 50

      // Time with current implementation (no caching)
      const doInstance = new DO(createMockCtx() as any, mockEnv)
      await doInstance.handleRequest(new Request('http://localhost/health')) // warmup

      const startWithoutCache = performance.now()
      for (let i = 0; i < iterations; i++) {
        await doInstance.handleRequest(new Request('http://localhost/health'))
      }
      const timeWithoutCache = performance.now() - startWithoutCache

      // Calculate per-request overhead
      // With proper caching, should be < 1ms per request
      // Without caching, route registration adds overhead
      const avgTime = timeWithoutCache / iterations

      // This test documents current performance
      // The fix should improve this significantly
      console.log(`Average time per request: ${avgTime.toFixed(3)}ms`)

      // NOTE: This is a documentation test - it shows the current state
      // After implementing caching, performance should improve
    })
  })

  describe('Concurrent Request Handling', () => {
    it('should use same router for concurrent requests', async () => {
      const doInstance = new DO(createMockCtx() as any, mockEnv)

      // Track calls AFTER construction
      let createRouterCallCount = 0
      const originalCreateRouter = (doInstance as any).createRouter
      ;(doInstance as any).createRouter = function(this: any) {
        createRouterCallCount++
        return originalCreateRouter.call(this)
      }

      // Fire off concurrent requests
      const promises = Array.from({ length: 20 }, () =>
        doInstance.handleRequest(new Request('http://localhost/health'))
      )

      await Promise.all(promises)

      // With proper caching: createRouter should NOT be called after construction
      // Without caching: would be 20
      expect(createRouterCallCount).toBe(0)
    })
  })

  describe('Different Request Types', () => {
    it('should use same cached router for different HTTP methods', async () => {
      const doInstance = new DO(createMockCtx() as any, mockEnv)

      // Track calls AFTER construction
      let createRouterCallCount = 0
      const originalCreateRouter = (doInstance as any).createRouter
      ;(doInstance as any).createRouter = function(this: any) {
        createRouterCallCount++
        return originalCreateRouter.call(this)
      }

      // Different HTTP methods - should all use same cached router
      await doInstance.handleRequest(new Request('http://localhost/health', { method: 'GET' }))
      await doInstance.handleRequest(new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test' })
      }))
      await doInstance.handleRequest(new Request('http://localhost/api/users/123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' })
      }))
      await doInstance.handleRequest(new Request('http://localhost/api/users/123', { method: 'DELETE' }))

      // With caching: createRouter should NOT be called after construction
      expect(createRouterCallCount).toBe(0)
    })

    it('should use same cached router for different routes', async () => {
      const doInstance = new DO(createMockCtx() as any, mockEnv)

      // Track calls AFTER construction
      let createRouterCallCount = 0
      const originalCreateRouter = (doInstance as any).createRouter
      ;(doInstance as any).createRouter = function(this: any) {
        createRouterCallCount++
        return originalCreateRouter.call(this)
      }

      // Different routes - should all use same cached router
      await doInstance.handleRequest(new Request('http://localhost/health'))
      await doInstance.handleRequest(new Request('http://localhost/api'))
      await doInstance.handleRequest(new Request('http://localhost/api/users'))
      await doInstance.handleRequest(new Request('http://localhost/~'))
      await doInstance.handleRequest(new Request('http://localhost/mcp'))

      // With caching: createRouter should NOT be called after construction
      expect(createRouterCallCount).toBe(0)
    })
  })

  describe('Error Handling', () => {
    it('should maintain cached router after request errors', async () => {
      const doInstance = new DO(createMockCtx() as any, mockEnv)

      // Track calls AFTER construction
      let createRouterCallCount = 0
      const originalCreateRouter = (doInstance as any).createRouter
      ;(doInstance as any).createRouter = function(this: any) {
        createRouterCallCount++
        return originalCreateRouter.call(this)
      }

      // Successful request
      await doInstance.handleRequest(new Request('http://localhost/health'))

      // Requests that might return 404s
      await doInstance.handleRequest(new Request('http://localhost/nonexistent'))
      await doInstance.handleRequest(new Request('http://localhost/api/users/nonexistent'))

      // Another successful request
      await doInstance.handleRequest(new Request('http://localhost/health'))

      // With caching: createRouter should NOT be called after construction
      expect(createRouterCallCount).toBe(0)
    })
  })
})
