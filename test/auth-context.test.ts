/**
 * @dotdo/do - Auth Context Access Tests (RED Phase)
 *
 * Tests for methods accessing auth context.
 * Verifies that RPC methods can access authentication information
 * including userId, organizationId, permissions, token, and metadata.
 *
 * These tests should FAIL initially (RED), then pass after implementation (GREEN).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DO } from '../src/do'
import type { AuthContext } from '../src/types'

// Create a mock execution context with SQLite storage
function createMockCtx() {
  const tables: Map<string, Map<string, Record<string, unknown>>> = new Map()

  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    storage: {
      sql: {
        exec(query: string, ...params: unknown[]) {
          const results: unknown[] = []
          const normalizedQuery = query.trim().toUpperCase()

          if (normalizedQuery.startsWith('CREATE TABLE')) {
            const tableMatch = query.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)
            if (tableMatch) {
              const tableName = tableMatch[1]
              if (!tables.has(tableName)) {
                tables.set(tableName, new Map())
              }
            }
          } else if (normalizedQuery.startsWith('INSERT')) {
            const [collection, id, data] = params as [string, string, string]
            const tableName = 'documents'
            if (!tables.has(tableName)) {
              tables.set(tableName, new Map())
            }
            const table = tables.get(tableName)!
            const key = `${collection}:${id}`
            table.set(key, {
              collection,
              id,
              data,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
          } else if (normalizedQuery.startsWith('SELECT')) {
            const tableName = 'documents'
            const table = tables.get(tableName)

            if (table && query.includes('WHERE collection = ? AND id = ?')) {
              const [collection, id] = params as [string, string]
              const key = `${collection}:${id}`
              const row = table.get(key)
              if (row) {
                results.push({ data: row.data })
              }
            } else if (table && query.includes('WHERE collection = ?')) {
              // Handle list() queries
              const [collection] = params as [string]
              for (const [key, row] of table.entries()) {
                if (key.startsWith(`${collection}:`)) {
                  results.push({ data: row.data })
                }
              }
            }
          }

          return {
            toArray() {
              return results
            },
          }
        },
      },
    },
  }
}

// Mock environment
const mockEnv = {
  DO_NAMESPACE: {
    idFromName: vi.fn(() => ({ toString: () => 'mock-id' })),
    get: vi.fn(),
  },
}

describe('Auth Context Access', () => {
  let doInstance: DO

  beforeEach(() => {
    doInstance = new DO(createMockCtx() as any, mockEnv)
  })

  describe('AuthContext Type', () => {
    it('should export AuthContext type with required properties', () => {
      // This test verifies the type structure at compile time
      // The AuthContext interface should have these properties
      const authContext: AuthContext = {
        userId: 'user-123',
        organizationId: 'org-456',
        permissions: ['read', 'write'],
        token: 'jwt-token',
        metadata: { role: 'admin' },
      }

      expect(authContext.userId).toBe('user-123')
      expect(authContext.organizationId).toBe('org-456')
      expect(authContext.permissions).toEqual(['read', 'write'])
      expect(authContext.token).toBe('jwt-token')
      expect(authContext.metadata).toEqual({ role: 'admin' })
    })

    it('should allow partial AuthContext (all fields optional)', () => {
      // AuthContext fields should all be optional
      const minimalAuth: AuthContext = {}
      expect(minimalAuth).toBeDefined()

      const withOnlyUser: AuthContext = { userId: 'user-123' }
      expect(withOnlyUser.userId).toBe('user-123')
    })
  })

  describe('getAuthContext() method', () => {
    it('should have getAuthContext method', () => {
      expect((doInstance as any).getAuthContext).toBeDefined()
      expect(typeof (doInstance as any).getAuthContext).toBe('function')
    })

    it('should return null when no auth context is set', () => {
      const auth = (doInstance as any).getAuthContext()
      expect(auth).toBeNull()
    })

    it('should return auth context when set', () => {
      const authContext: AuthContext = {
        userId: 'user-123',
        organizationId: 'org-456',
        permissions: ['read'],
      }
      ;(doInstance as any).setAuthContext(authContext)

      const auth = (doInstance as any).getAuthContext()
      expect(auth).toEqual(authContext)
    })
  })

  describe('setAuthContext() method', () => {
    it('should have setAuthContext method', () => {
      expect((doInstance as any).setAuthContext).toBeDefined()
      expect(typeof (doInstance as any).setAuthContext).toBe('function')
    })

    it('should set auth context for the current request', () => {
      const authContext: AuthContext = {
        userId: 'user-123',
        organizationId: 'org-456',
      }

      ;(doInstance as any).setAuthContext(authContext)
      const auth = (doInstance as any).getAuthContext()

      expect(auth?.userId).toBe('user-123')
      expect(auth?.organizationId).toBe('org-456')
    })

    it('should allow clearing auth context by setting null', () => {
      ;(doInstance as any).setAuthContext({ userId: 'user-123' })
      ;(doInstance as any).setAuthContext(null)

      const auth = (doInstance as any).getAuthContext()
      expect(auth).toBeNull()
    })
  })

  describe('invoke() with auth context', () => {
    it('should pass auth context as third parameter to invoke()', async () => {
      const authContext: AuthContext = {
        userId: 'user-123',
        permissions: ['read'],
      }

      // invoke should accept optional auth context
      const result = await doInstance.invoke('get', ['users', '123'], authContext)
      expect(result).toBeNull() // No data yet, but should not throw
    })

    it('should make auth context available during method execution', async () => {
      // Create a custom DO that checks auth context in a method
      class AuthAwareTestDO extends DO {
        constructor(ctx: any, env: any) {
          super(ctx, env)
          this.allowedMethods.add('whoami')
        }

        async whoami(): Promise<AuthContext | null> {
          return this.getAuthContext()
        }
      }

      const testDO = new AuthAwareTestDO(createMockCtx() as any, mockEnv)
      const authContext: AuthContext = {
        userId: 'test-user-456',
        organizationId: 'test-org-789',
      }

      const result = await testDO.invoke('whoami', [], authContext)
      expect(result).toEqual(authContext)
    })

    it('should isolate auth context between invocations', async () => {
      // Create a custom DO to test isolation
      class AuthAwareTestDO extends DO {
        constructor(ctx: any, env: any) {
          super(ctx, env)
          this.allowedMethods.add('whoami')
        }

        async whoami(): Promise<AuthContext | null> {
          return this.getAuthContext()
        }
      }

      const testDO = new AuthAwareTestDO(createMockCtx() as any, mockEnv)

      // First invocation with auth
      const auth1: AuthContext = { userId: 'user-1' }
      const result1 = await testDO.invoke('whoami', [], auth1)
      expect(result1).toEqual(auth1)

      // Second invocation with different auth
      const auth2: AuthContext = { userId: 'user-2' }
      const result2 = await testDO.invoke('whoami', [], auth2)
      expect(result2).toEqual(auth2)

      // Third invocation without auth
      const result3 = await testDO.invoke('whoami', [])
      expect(result3).toBeNull()
    })
  })

  describe('RPC with auth context', () => {
    it('should extract auth from Authorization header in RPC requests', async () => {
      const request = new Request('http://localhost/rpc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-jwt-token',
        },
        body: JSON.stringify({
          id: '1',
          method: 'get',
          params: ['users', '123'],
        }),
      })

      const response = await doInstance.handleRequest(request)
      expect(response).toBeInstanceOf(Response)
      // Auth should have been extracted from header
    })

    it('should support custom X-Auth-Context header for full auth context', async () => {
      const authContext: AuthContext = {
        userId: 'user-123',
        organizationId: 'org-456',
        permissions: ['read', 'write'],
        metadata: { tenantId: 'tenant-1' },
      }

      const request = new Request('http://localhost/rpc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Context': JSON.stringify(authContext),
        },
        body: JSON.stringify({
          id: '1',
          method: 'get',
          params: ['users', '123'],
        }),
      })

      const response = await doInstance.handleRequest(request)
      expect(response).toBeInstanceOf(Response)
    })
  })

  describe('Methods accessing auth context', () => {
    describe('create() with auth', () => {
      it('should record userId in created document metadata', async () => {
        const authContext: AuthContext = { userId: 'creator-123' }
        ;(doInstance as any).setAuthContext(authContext)

        const doc = await doInstance.create('users', { name: 'Test User' })

        // Document should record who created it
        expect(doc._createdBy).toBe('creator-123')
      })

      it('should record organizationId in created document metadata', async () => {
        const authContext: AuthContext = {
          userId: 'creator-123',
          organizationId: 'org-456',
        }
        ;(doInstance as any).setAuthContext(authContext)

        const doc = await doInstance.create('users', { name: 'Test User' })

        expect(doc._organization).toBe('org-456')
      })
    })

    describe('update() with auth', () => {
      it('should record userId in update metadata', async () => {
        // Create without auth
        const doc = await doInstance.create('users', { name: 'Original' })

        // Update with auth
        const authContext: AuthContext = { userId: 'updater-456' }
        ;(doInstance as any).setAuthContext(authContext)

        const updated = await doInstance.update('users', doc.id, { name: 'Updated' })

        expect(updated?._updatedBy).toBe('updater-456')
      })
    })

    describe('delete() with auth', () => {
      it('should require auth for protected collections', async () => {
        // Create a document
        const doc = await doInstance.create('protected_data', { secret: 'value' })

        // Try to delete without auth - should fail
        await expect(doInstance.delete('protected_data', doc.id)).rejects.toThrow(
          'Authentication required'
        )
      })

      it('should allow delete with proper auth', async () => {
        const authContext: AuthContext = {
          userId: 'admin-123',
          permissions: ['delete'],
        }
        ;(doInstance as any).setAuthContext(authContext)

        const doc = await doInstance.create('protected_data', { secret: 'value' })
        const result = await doInstance.delete('protected_data', doc.id)

        expect(result).toBe(true)
      })
    })

    describe('list() with auth filtering', () => {
      it('should filter results by organizationId when set', async () => {
        // Create documents for different orgs
        ;(doInstance as any).setAuthContext({ organizationId: 'org-1' })
        await doInstance.create('items', { name: 'Item 1' })

        ;(doInstance as any).setAuthContext({ organizationId: 'org-2' })
        await doInstance.create('items', { name: 'Item 2' })

        // List with org-1 auth should only see org-1 items
        ;(doInstance as any).setAuthContext({ organizationId: 'org-1' })
        const items = await doInstance.list('items')

        expect(items.length).toBe(1)
        expect(items[0].name).toBe('Item 1')
      })
    })
  })

  describe('Permission checks', () => {
    it('should have checkPermission method', () => {
      expect((doInstance as any).checkPermission).toBeDefined()
      expect(typeof (doInstance as any).checkPermission).toBe('function')
    })

    it('should return true when user has required permission', () => {
      const authContext: AuthContext = {
        userId: 'user-123',
        permissions: ['read', 'write', 'admin'],
      }
      ;(doInstance as any).setAuthContext(authContext)

      expect((doInstance as any).checkPermission('read')).toBe(true)
      expect((doInstance as any).checkPermission('write')).toBe(true)
      expect((doInstance as any).checkPermission('admin')).toBe(true)
    })

    it('should return false when user lacks required permission', () => {
      const authContext: AuthContext = {
        userId: 'user-123',
        permissions: ['read'],
      }
      ;(doInstance as any).setAuthContext(authContext)

      expect((doInstance as any).checkPermission('write')).toBe(false)
      expect((doInstance as any).checkPermission('admin')).toBe(false)
      expect((doInstance as any).checkPermission('delete')).toBe(false)
    })

    it('should return false when no auth context is set', () => {
      expect((doInstance as any).checkPermission('read')).toBe(false)
    })

    it('should return false when permissions array is empty', () => {
      const authContext: AuthContext = {
        userId: 'user-123',
        permissions: [],
      }
      ;(doInstance as any).setAuthContext(authContext)

      expect((doInstance as any).checkPermission('read')).toBe(false)
    })

    it('should return false when permissions is undefined', () => {
      const authContext: AuthContext = {
        userId: 'user-123',
      }
      ;(doInstance as any).setAuthContext(authContext)

      expect((doInstance as any).checkPermission('read')).toBe(false)
    })
  })

  describe('requirePermission helper', () => {
    it('should have requirePermission method', () => {
      expect((doInstance as any).requirePermission).toBeDefined()
      expect(typeof (doInstance as any).requirePermission).toBe('function')
    })

    it('should not throw when user has required permission', () => {
      const authContext: AuthContext = {
        userId: 'user-123',
        permissions: ['admin'],
      }
      ;(doInstance as any).setAuthContext(authContext)

      expect(() => (doInstance as any).requirePermission('admin')).not.toThrow()
    })

    it('should throw when user lacks required permission', () => {
      const authContext: AuthContext = {
        userId: 'user-123',
        permissions: ['read'],
      }
      ;(doInstance as any).setAuthContext(authContext)

      expect(() => (doInstance as any).requirePermission('admin')).toThrow('Permission denied')
    })

    it('should throw when no auth context is set', () => {
      expect(() => (doInstance as any).requirePermission('read')).toThrow('Authentication required')
    })
  })

  describe('Auth metadata access', () => {
    it('should allow accessing custom metadata fields', () => {
      const authContext: AuthContext = {
        userId: 'user-123',
        metadata: {
          tenantId: 'tenant-456',
          roles: ['admin', 'user'],
          subscription: 'premium',
        },
      }
      ;(doInstance as any).setAuthContext(authContext)

      const auth = (doInstance as any).getAuthContext()
      expect(auth?.metadata?.tenantId).toBe('tenant-456')
      expect(auth?.metadata?.roles).toEqual(['admin', 'user'])
      expect(auth?.metadata?.subscription).toBe('premium')
    })

    it('should have getAuthMetadata helper for easy metadata access', () => {
      const authContext: AuthContext = {
        userId: 'user-123',
        metadata: {
          tenantId: 'tenant-456',
        },
      }
      ;(doInstance as any).setAuthContext(authContext)

      const tenantId = (doInstance as any).getAuthMetadata('tenantId')
      expect(tenantId).toBe('tenant-456')
    })

    it('should return undefined for missing metadata fields', () => {
      const authContext: AuthContext = {
        userId: 'user-123',
        metadata: {},
      }
      ;(doInstance as any).setAuthContext(authContext)

      const missing = (doInstance as any).getAuthMetadata('nonexistent')
      expect(missing).toBeUndefined()
    })

    it('should return undefined when metadata is not set', () => {
      const authContext: AuthContext = {
        userId: 'user-123',
      }
      ;(doInstance as any).setAuthContext(authContext)

      const result = (doInstance as any).getAuthMetadata('anything')
      expect(result).toBeUndefined()
    })
  })

  describe('Auth context in extended methods', () => {
    describe('Actions with auth', () => {
      it('should auto-populate actor from auth context if not provided', async () => {
        const authContext: AuthContext = {
          userId: 'user-123',
        }
        ;(doInstance as any).setAuthContext(authContext)

        // When creating an action without explicit actor, use authenticated user
        const action = await doInstance.send({
          object: 'https://example.com/orders/1',
          action: 'approve',
          // actor not provided - should use auth userId
        } as any)

        expect(action.actor).toBe('user-123')
      })

      it('should allow overriding actor even when authenticated', async () => {
        const authContext: AuthContext = {
          userId: 'user-123',
        }
        ;(doInstance as any).setAuthContext(authContext)

        const action = await doInstance.send({
          actor: 'system',
          object: 'https://example.com/orders/1',
          action: 'auto-process',
        } as any)

        expect(action.actor).toBe('system')
      })
    })

    describe('Events with auth', () => {
      it('should auto-populate source from auth context if not provided', async () => {
        const authContext: AuthContext = {
          userId: 'user-123',
        }
        ;(doInstance as any).setAuthContext(authContext)

        const event = await doInstance.track({
          type: 'Order.created',
          data: { orderId: '123' },
          // source not provided - should use auth userId
        } as any)

        expect(event.source).toBe('user-123')
      })
    })

    describe('Things with auth', () => {
      it('should record creator in thing metadata', async () => {
        const authContext: AuthContext = {
          userId: 'creator-123',
          organizationId: 'org-456',
        }
        ;(doInstance as any).setAuthContext(authContext)

        const thing = await doInstance.createThing({
          ns: 'example.com',
          type: 'product',
          data: { name: 'Widget' },
        })

        // Thing data should include creator info
        expect(thing.data._createdBy).toBe('creator-123')
        expect(thing.data._organization).toBe('org-456')
      })
    })
  })

  describe('Auth context inheritance', () => {
    it('should have withAuth method for creating scoped instances', () => {
      expect((doInstance as any).withAuth).toBeDefined()
      expect(typeof (doInstance as any).withAuth).toBe('function')
    })

    it('should create a scoped proxy with fixed auth context', async () => {
      const authContext: AuthContext = {
        userId: 'scoped-user',
        permissions: ['read', 'write'],
      }

      const scopedDO = (doInstance as any).withAuth(authContext)

      // Operations on scopedDO should use the fixed auth context
      const doc = await scopedDO.create('users', { name: 'Test' })
      expect(doc._createdBy).toBe('scoped-user')
    })

    it('should not affect the original instance', async () => {
      const authContext: AuthContext = {
        userId: 'scoped-user',
      }

      const scopedDO = (doInstance as any).withAuth(authContext)

      // Original instance should still have no auth
      expect((doInstance as any).getAuthContext()).toBeNull()

      // Scoped instance should have auth
      expect(scopedDO.getAuthContext()).toEqual(authContext)
    })
  })

  describe('Integration: HTTP handler auth extraction', () => {
    it('should extract userId from Bearer token', async () => {
      // This requires JWT decoding - for now just verify the header is processed
      const request = new Request('http://localhost/api/users', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTEyMyJ9.xxx',
        },
      })

      const response = await doInstance.handleRequest(request)
      expect(response).toBeInstanceOf(Response)
    })

    it('should handle missing Authorization header gracefully', async () => {
      const request = new Request('http://localhost/api/users', {
        method: 'GET',
      })

      const response = await doInstance.handleRequest(request)
      // Should still work for public endpoints
      expect(response).toBeInstanceOf(Response)
    })

    it('should handle malformed Authorization header', async () => {
      const request = new Request('http://localhost/api/users', {
        method: 'GET',
        headers: {
          Authorization: 'InvalidFormat token-value',
        },
      })

      const response = await doInstance.handleRequest(request)
      // Should handle gracefully, treating as unauthenticated
      expect(response).toBeInstanceOf(Response)
    })
  })
})

// ============================================================================
// Auth Context Transport Propagation Tests (RED Phase)
// ============================================================================

// Mock WebSocketPair for Cloudflare Workers compatibility in Node.js
class MockWebSocket {
  readyState = 1
  send = vi.fn()
  close = vi.fn()
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
}

// Mock Response with webSocket property for WebSocket upgrade responses
const OriginalResponse = globalThis.Response
class MockResponse extends OriginalResponse {
  webSocket?: MockWebSocket
  private _status?: number
  constructor(body: BodyInit | null, init?: ResponseInit & { webSocket?: MockWebSocket }) {
    const wsStatus = init?.status
    const isWebSocketUpgrade = wsStatus === 101
    const safeInit = isWebSocketUpgrade ? { ...init, status: 200 } : init
    super(body, safeInit)
    if (isWebSocketUpgrade) {
      this._status = 101
    }
    if (init?.webSocket) {
      this.webSocket = init.webSocket
    }
  }
  get status() {
    return this._status ?? super.status
  }
}
globalThis.Response = MockResponse as typeof Response

// Mock WebSocketPair globally
class MockWebSocketPair {
  0: MockWebSocket
  1: MockWebSocket
  constructor() {
    this[0] = new MockWebSocket()
    this[1] = new MockWebSocket()
  }
}
;(globalThis as unknown as { WebSocketPair: typeof MockWebSocketPair }).WebSocketPair =
  MockWebSocketPair

// Enhanced mock context with WebSocket support
function createTransportMockCtx() {
  const tables: Map<string, Map<string, Record<string, unknown>>> = new Map()

  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    acceptWebSocket: vi.fn(),
    setWebSocketAutoResponse: vi.fn(),
    storage: {
      sql: {
        exec(query: string, ...params: unknown[]) {
          const results: unknown[] = []
          const normalizedQuery = query.trim().toUpperCase()

          if (normalizedQuery.startsWith('CREATE TABLE')) {
            const tableMatch = query.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)
            if (tableMatch) {
              const tableName = tableMatch[1]
              if (!tables.has(tableName)) {
                tables.set(tableName, new Map())
              }
            }
          } else if (normalizedQuery.startsWith('CREATE INDEX')) {
            // Index creation - no-op in mock
          } else if (normalizedQuery.startsWith('INSERT')) {
            // Handle document inserts
            if (query.includes('documents')) {
              const [collection, id, data] = params as [string, string, string]
              const tableName = 'documents'
              if (!tables.has(tableName)) {
                tables.set(tableName, new Map())
              }
              const table = tables.get(tableName)!
              const key = `${collection}:${id}`
              table.set(key, {
                collection,
                id,
                data,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
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
                const paginated = matching.slice(offset || 0, (offset || 0) + (limit || 100))
                results.push(...paginated)
              } else if (query.includes('WHERE data LIKE')) {
                // Search query
                const [searchPattern, limit] = params as [string, number]
                const pattern = searchPattern.replace(/%/g, '').toLowerCase()

                for (const [, row] of table.entries()) {
                  if (results.length >= (limit || 100)) break
                  const rowData = (row.data as string).toLowerCase()
                  if (rowData.includes(pattern)) {
                    results.push({ collection: row.collection, id: row.id, data: row.data })
                  }
                }
              }
            }
          } else if (normalizedQuery.startsWith('UPDATE')) {
            const [data, collection, id] = params as [string, string, string]
            const tableName = 'documents'
            const table = tables.get(tableName)
            if (table) {
              const key = `${collection}:${id}`
              const existing = table.get(key)
              if (existing) {
                table.set(key, { ...existing, data, updated_at: new Date().toISOString() })
              }
            }
          } else if (normalizedQuery.startsWith('DELETE')) {
            const [collection, id] = params as [string, string]
            const tableName = 'documents'
            const table = tables.get(tableName)
            if (table) {
              const key = `${collection}:${id}`
              table.delete(key)
            }
          }

          return {
            toArray() {
              return results
            },
          }
        },
      },
    },
  }
}

describe('Auth Context Propagation Through All Transports', () => {
  let doInstance: DO
  let transportMockCtx: ReturnType<typeof createTransportMockCtx>

  beforeEach(() => {
    transportMockCtx = createTransportMockCtx()
    doInstance = new DO(transportMockCtx as any, mockEnv)
  })

  // ============================================================================
  // HTTP REST Transport
  // ============================================================================

  describe('HTTP REST Transport Propagation', () => {
    describe('GET requests', () => {
      it('should propagate auth to GET /api/:resource handler', async () => {
        const request = new Request('http://localhost/api/users', {
          headers: {
            Authorization: 'Bearer http-get-token',
            'X-User-ID': 'http-get-user',
          },
        })

        // Capture auth in list method
        let capturedAuth: AuthContext | undefined
        const originalList = doInstance.list.bind(doInstance)
        ;(doInstance as any).list = async function (
          this: DO,
          collection: string,
          options?: any
        ) {
          capturedAuth = (this as any).getAuthContext?.()
          return originalList(collection, options)
        }

        await doInstance.handleRequest(request)

        expect(capturedAuth).toBeDefined()
        expect(capturedAuth?.userId).toBe('http-get-user')
        expect(capturedAuth?.token).toBe('http-get-token')
      })

      it('should propagate auth to GET /api/:resource/:id handler', async () => {
        // Create a document first
        await doInstance.create('users', { id: 'test-user-1', name: 'Test' })

        const request = new Request('http://localhost/api/users/test-user-1', {
          headers: {
            Authorization: 'Bearer http-get-single-token',
            'X-User-ID': 'http-get-single-user',
          },
        })

        let capturedAuth: AuthContext | undefined
        const originalGet = doInstance.get.bind(doInstance)
        ;(doInstance as any).get = async function (
          this: DO,
          collection: string,
          id: string
        ) {
          capturedAuth = (this as any).getAuthContext?.()
          return originalGet(collection, id)
        }

        await doInstance.handleRequest(request)

        expect(capturedAuth).toBeDefined()
        expect(capturedAuth?.userId).toBe('http-get-single-user')
      })
    })

    describe('POST requests', () => {
      it('should propagate auth to POST /api/:resource handler', async () => {
        const request = new Request('http://localhost/api/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer http-post-token',
            'X-User-ID': 'http-post-user',
            'X-Organization-ID': 'http-post-org',
          },
          body: JSON.stringify({ name: 'New User' }),
        })

        let capturedAuth: AuthContext | undefined
        const originalCreate = doInstance.create.bind(doInstance)
        ;(doInstance as any).create = async function (
          this: DO,
          collection: string,
          doc: any
        ) {
          capturedAuth = (this as any).getAuthContext?.()
          return originalCreate(collection, doc)
        }

        await doInstance.handleRequest(request)

        expect(capturedAuth).toBeDefined()
        expect(capturedAuth?.userId).toBe('http-post-user')
        expect(capturedAuth?.organizationId).toBe('http-post-org')
        expect(capturedAuth?.token).toBe('http-post-token')
      })
    })

    describe('PUT requests', () => {
      it('should propagate auth to PUT /api/:resource/:id handler', async () => {
        await doInstance.create('users', { id: 'update-user', name: 'Original' })

        const request = new Request('http://localhost/api/users/update-user', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer http-put-token',
            'X-User-ID': 'http-put-user',
          },
          body: JSON.stringify({ name: 'Updated' }),
        })

        let capturedAuth: AuthContext | undefined
        const originalUpdate = doInstance.update.bind(doInstance)
        ;(doInstance as any).update = async function (
          this: DO,
          collection: string,
          id: string,
          updates: any
        ) {
          capturedAuth = (this as any).getAuthContext?.()
          return originalUpdate(collection, id, updates)
        }

        await doInstance.handleRequest(request)

        expect(capturedAuth).toBeDefined()
        expect(capturedAuth?.userId).toBe('http-put-user')
      })
    })

    describe('DELETE requests', () => {
      it('should propagate auth to DELETE /api/:resource/:id handler', async () => {
        await doInstance.create('users', { id: 'delete-user', name: 'To Delete' })

        const request = new Request('http://localhost/api/users/delete-user', {
          method: 'DELETE',
          headers: {
            Authorization: 'Bearer http-delete-token',
            'X-User-ID': 'http-delete-user',
          },
        })

        let capturedAuth: AuthContext | undefined
        const originalDelete = doInstance.delete.bind(doInstance)
        ;(doInstance as any).delete = async function (
          this: DO,
          collection: string,
          id: string
        ) {
          capturedAuth = (this as any).getAuthContext?.()
          return originalDelete(collection, id)
        }

        await doInstance.handleRequest(request)

        expect(capturedAuth).toBeDefined()
        expect(capturedAuth?.userId).toBe('http-delete-user')
      })
    })
  })

  // ============================================================================
  // RPC Transport
  // ============================================================================

  describe('RPC Transport Propagation', () => {
    describe('Single RPC requests', () => {
      it('should propagate auth to RPC method invocation', async () => {
        const request = new Request('http://localhost/rpc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer rpc-single-token',
            'X-User-ID': 'rpc-single-user',
          },
          body: JSON.stringify({
            id: '1',
            method: 'list',
            params: ['users', {}],
          }),
        })

        let capturedAuth: AuthContext | undefined
        const originalInvoke = doInstance.invoke.bind(doInstance)
        ;(doInstance as any).invoke = async function (
          this: DO,
          method: string,
          params: unknown[]
        ) {
          capturedAuth = (this as any).getAuthContext?.()
          return originalInvoke(method, params)
        }

        await doInstance.handleRequest(request)

        expect(capturedAuth).toBeDefined()
        expect(capturedAuth?.userId).toBe('rpc-single-user')
        expect(capturedAuth?.token).toBe('rpc-single-token')
      })

      it('should propagate auth from X-Auth-Context header', async () => {
        const authContext: AuthContext = {
          userId: 'rpc-context-user',
          organizationId: 'rpc-context-org',
          permissions: ['read', 'write', 'delete'],
          metadata: { role: 'admin' },
        }

        const request = new Request('http://localhost/rpc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Auth-Context': JSON.stringify(authContext),
          },
          body: JSON.stringify({
            id: '1',
            method: 'list',
            params: ['users', {}],
          }),
        })

        let capturedAuth: AuthContext | undefined
        const originalInvoke = doInstance.invoke.bind(doInstance)
        ;(doInstance as any).invoke = async function (
          this: DO,
          method: string,
          params: unknown[]
        ) {
          capturedAuth = (this as any).getAuthContext?.()
          return originalInvoke(method, params)
        }

        await doInstance.handleRequest(request)

        expect(capturedAuth).toBeDefined()
        expect(capturedAuth?.userId).toBe('rpc-context-user')
        expect(capturedAuth?.organizationId).toBe('rpc-context-org')
        expect(capturedAuth?.permissions).toEqual(['read', 'write', 'delete'])
        expect(capturedAuth?.metadata?.role).toBe('admin')
      })
    })

    describe('Batch RPC requests', () => {
      it('should propagate same auth to all batch requests', async () => {
        const request = new Request('http://localhost/rpc/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer batch-token',
            'X-User-ID': 'batch-user',
          },
          body: JSON.stringify([
            { id: '1', method: 'list', params: ['users', {}] },
            { id: '2', method: 'list', params: ['products', {}] },
            { id: '3', method: 'list', params: ['orders', {}] },
          ]),
        })

        const capturedAuths: AuthContext[] = []
        const originalInvoke = doInstance.invoke.bind(doInstance)
        ;(doInstance as any).invoke = async function (
          this: DO,
          method: string,
          params: unknown[]
        ) {
          const auth = (this as any).getAuthContext?.()
          if (auth) {
            capturedAuths.push({ ...auth })
          }
          return originalInvoke(method, params)
        }

        await doInstance.handleRequest(request)

        // All batch requests should have the same auth
        expect(capturedAuths.length).toBeGreaterThanOrEqual(3)
        capturedAuths.forEach((auth) => {
          expect(auth.userId).toBe('batch-user')
          expect(auth.token).toBe('batch-token')
        })
      })

      it('should maintain auth isolation between different batch requests', async () => {
        const request1 = new Request('http://localhost/rpc/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-ID': 'batch-user-1',
          },
          body: JSON.stringify([{ id: '1', method: 'list', params: ['users', {}] }]),
        })

        const request2 = new Request('http://localhost/rpc/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-ID': 'batch-user-2',
          },
          body: JSON.stringify([{ id: '1', method: 'list', params: ['users', {}] }]),
        })

        const capturedAuths: AuthContext[] = []
        const originalInvoke = doInstance.invoke.bind(doInstance)
        ;(doInstance as any).invoke = async function (
          this: DO,
          method: string,
          params: unknown[]
        ) {
          const auth = (this as any).getAuthContext?.()
          if (auth) {
            capturedAuths.push({ ...auth })
          }
          return originalInvoke(method, params)
        }

        await Promise.all([
          doInstance.handleRequest(request1),
          doInstance.handleRequest(request2),
        ])

        // Should have captured auths from both requests
        const userIds = capturedAuths.map((a) => a.userId)
        expect(userIds).toContain('batch-user-1')
        expect(userIds).toContain('batch-user-2')
      })
    })
  })

  // ============================================================================
  // WebSocket Transport
  // ============================================================================

  describe('WebSocket Transport Propagation', () => {
    describe('WebSocket upgrade', () => {
      it('should extract auth from WebSocket upgrade request headers', async () => {
        const request = new Request('http://localhost/ws', {
          headers: {
            Upgrade: 'websocket',
            Connection: 'Upgrade',
            Authorization: 'Bearer ws-upgrade-token',
            'X-User-ID': 'ws-upgrade-user',
          },
        })

        const response = await doInstance.handleRequest(request)

        // Should successfully upgrade
        expect(response.status).toBe(101)

        // Auth should be stored for the WebSocket connection
        const wsAuth = (doInstance as any).getWebSocketAuth?.()
        expect(wsAuth).toBeDefined()
        expect(wsAuth?.userId).toBe('ws-upgrade-user')
        expect(wsAuth?.token).toBe('ws-upgrade-token')
      })

      it('should extract auth from query string on WebSocket upgrade', async () => {
        const request = new Request(
          'http://localhost/ws?token=ws-query-token&userId=ws-query-user',
          {
            headers: {
              Upgrade: 'websocket',
              Connection: 'Upgrade',
            },
          }
        )

        const response = await doInstance.handleRequest(request)
        expect(response.status).toBe(101)

        const wsAuth = (doInstance as any).getWebSocketAuth?.()
        expect(wsAuth?.token).toBe('ws-query-token')
        expect(wsAuth?.userId).toBe('ws-query-user')
      })
    })

    describe('WebSocket message handling', () => {
      it('should propagate auth to WebSocket RPC message handlers', async () => {
        // First upgrade with auth
        const upgradeRequest = new Request('http://localhost/ws', {
          headers: {
            Upgrade: 'websocket',
            Connection: 'Upgrade',
            Authorization: 'Bearer ws-msg-token',
            'X-User-ID': 'ws-msg-user',
          },
        })

        await doInstance.handleRequest(upgradeRequest)

        // Simulate incoming WebSocket message
        const mockWs = new MockWebSocket() as unknown as WebSocket
        const rpcMessage = JSON.stringify({
          type: 'rpc',
          id: '1',
          method: 'list',
          params: ['users', {}],
        })

        let capturedAuth: AuthContext | undefined
        const originalInvoke = doInstance.invoke.bind(doInstance)
        ;(doInstance as any).invoke = async function (
          this: DO,
          method: string,
          params: unknown[]
        ) {
          capturedAuth = (this as any).getAuthContext?.()
          return originalInvoke(method, params)
        }

        await doInstance.webSocketMessage(mockWs, rpcMessage)

        expect(capturedAuth).toBeDefined()
        expect(capturedAuth?.userId).toBe('ws-msg-user')
        expect(capturedAuth?.token).toBe('ws-msg-token')
      })

      it('should allow re-authentication via auth message', async () => {
        // Upgrade without auth
        const upgradeRequest = new Request('http://localhost/ws', {
          headers: {
            Upgrade: 'websocket',
            Connection: 'Upgrade',
          },
        })

        await doInstance.handleRequest(upgradeRequest)

        const mockWs = new MockWebSocket() as unknown as WebSocket

        // Send authentication message
        const authMessage = JSON.stringify({
          type: 'auth',
          token: 'ws-reauth-token',
          userId: 'ws-reauth-user',
          permissions: ['read', 'write'],
        })

        await doInstance.webSocketMessage(mockWs, authMessage)

        // Subsequent RPC should use new auth
        let capturedAuth: AuthContext | undefined
        const originalInvoke = doInstance.invoke.bind(doInstance)
        ;(doInstance as any).invoke = async function (
          this: DO,
          method: string,
          params: unknown[]
        ) {
          capturedAuth = (this as any).getAuthContext?.()
          return originalInvoke(method, params)
        }

        const rpcMessage = JSON.stringify({
          type: 'rpc',
          id: '1',
          method: 'list',
          params: ['users', {}],
        })

        await doInstance.webSocketMessage(mockWs, rpcMessage)

        expect(capturedAuth?.userId).toBe('ws-reauth-user')
        expect(capturedAuth?.token).toBe('ws-reauth-token')
        expect(capturedAuth?.permissions).toEqual(['read', 'write'])
      })

      it('should isolate auth between different WebSocket connections', async () => {
        // Create two separate WebSocket connections with different auth
        const mockWs1 = new MockWebSocket() as unknown as WebSocket
        const mockWs2 = new MockWebSocket() as unknown as WebSocket

        // Simulate connection setup with different auth
        ;(doInstance as any).setWebSocketAuth?.(mockWs1, {
          userId: 'ws-user-1',
          token: 'ws-token-1',
        })
        ;(doInstance as any).setWebSocketAuth?.(mockWs2, {
          userId: 'ws-user-2',
          token: 'ws-token-2',
        })

        const capturedAuths: { wsId: string; auth: AuthContext }[] = []
        const originalInvoke = doInstance.invoke.bind(doInstance)
        ;(doInstance as any).invoke = async function (
          this: DO,
          method: string,
          params: unknown[]
        ) {
          const auth = (this as any).getAuthContext?.()
          if (auth) {
            capturedAuths.push({ wsId: auth.userId || '', auth })
          }
          return originalInvoke(method, params)
        }

        // Send message from ws1
        await doInstance.webSocketMessage(
          mockWs1,
          JSON.stringify({ type: 'rpc', id: '1', method: 'list', params: ['users', {}] })
        )

        // Send message from ws2
        await doInstance.webSocketMessage(
          mockWs2,
          JSON.stringify({ type: 'rpc', id: '2', method: 'list', params: ['users', {}] })
        )

        // Each message should have used its own auth
        expect(capturedAuths.find((a) => a.auth.userId === 'ws-user-1')).toBeDefined()
        expect(capturedAuths.find((a) => a.auth.userId === 'ws-user-2')).toBeDefined()
      })
    })
  })

  // ============================================================================
  // MCP Transport
  // ============================================================================

  describe('MCP Transport Propagation', () => {
    describe('MCP tool invocation', () => {
      it('should propagate auth to MCP search tool', async () => {
        const request = new Request('http://localhost/mcp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer mcp-search-token',
            'X-User-ID': 'mcp-search-user',
          },
          body: JSON.stringify({
            tool: 'search',
            params: ['test query', { limit: 10 }],
          }),
        })

        let capturedAuth: AuthContext | undefined
        const originalSearch = doInstance.search.bind(doInstance)
        ;(doInstance as any).search = async function (
          this: DO,
          query: string,
          options?: any
        ) {
          capturedAuth = (this as any).getAuthContext?.()
          return originalSearch(query, options)
        }

        await doInstance.handleRequest(request)

        expect(capturedAuth).toBeDefined()
        expect(capturedAuth?.userId).toBe('mcp-search-user')
        expect(capturedAuth?.token).toBe('mcp-search-token')
      })

      it('should propagate auth to MCP fetch tool', async () => {
        const request = new Request('http://localhost/mcp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer mcp-fetch-token',
            'X-User-ID': 'mcp-fetch-user',
          },
          body: JSON.stringify({
            tool: 'fetch',
            params: ['http://example.com', {}],
          }),
        })

        let capturedAuth: AuthContext | undefined
        const originalFetch = (doInstance as any).fetch?.bind(doInstance)
        if (originalFetch) {
          ;(doInstance as any).fetch = async function (
            this: DO,
            url: string,
            options?: any
          ) {
            capturedAuth = (this as any).getAuthContext?.()
            return originalFetch(url, options)
          }
        }

        await doInstance.handleRequest(request)

        expect(capturedAuth).toBeDefined()
        expect(capturedAuth?.userId).toBe('mcp-fetch-user')
      })

      it('should propagate auth to MCP do (execute) tool', async () => {
        const request = new Request('http://localhost/mcp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer mcp-do-token',
            'X-User-ID': 'mcp-do-user',
          },
          body: JSON.stringify({
            tool: 'do',
            params: ['return 1 + 1', {}],
          }),
        })

        let capturedAuth: AuthContext | undefined
        const originalDo = doInstance.do.bind(doInstance)
        ;(doInstance as any).do = async function (
          this: DO,
          code: string,
          options?: any
        ) {
          capturedAuth = (this as any).getAuthContext?.()
          return originalDo(code, options)
        }

        await doInstance.handleRequest(request)

        expect(capturedAuth).toBeDefined()
        expect(capturedAuth?.userId).toBe('mcp-do-user')
      })
    })

    describe('MCP discovery', () => {
      it('should include auth info in MCP tool discovery', async () => {
        const request = new Request('http://localhost/mcp', {
          method: 'GET',
          headers: {
            Authorization: 'Bearer mcp-discovery-token',
            'X-User-ID': 'mcp-discovery-user',
            'X-Permissions': 'search,fetch',
          },
        })

        const response = await doInstance.handleRequest(request)
        const body = (await response.json()) as {
          tools: unknown[]
          auth?: { authenticated: boolean; userId?: string; permissions?: string[] }
        }

        expect(body.auth).toBeDefined()
        expect(body.auth?.authenticated).toBe(true)
        expect(body.auth?.userId).toBe('mcp-discovery-user')
        expect(body.auth?.permissions).toContain('search')
        expect(body.auth?.permissions).toContain('fetch')
      })
    })
  })

  // ============================================================================
  // Cross-Transport Auth Consistency
  // ============================================================================

  describe('Cross-Transport Auth Consistency', () => {
    it('should extract same auth from identical headers across transports', async () => {
      const commonHeaders = {
        Authorization: 'Bearer cross-transport-token',
        'X-User-ID': 'cross-transport-user',
        'X-Organization-ID': 'cross-transport-org',
        'X-Permissions': 'read,write',
      }

      const capturedAuths: { transport: string; auth: AuthContext }[] = []

      // Capture auth in invoke
      const originalInvoke = doInstance.invoke.bind(doInstance)
      ;(doInstance as any).invoke = async function (
        this: DO,
        method: string,
        params: unknown[]
      ) {
        const auth = (this as any).getAuthContext?.()
        if (auth) {
          capturedAuths.push({ transport: 'invoke', auth: { ...auth } })
        }
        return originalInvoke(method, params)
      }

      // HTTP REST request
      const httpRequest = new Request('http://localhost/api/users', {
        headers: commonHeaders,
      })
      await doInstance.handleRequest(httpRequest)

      // RPC request
      const rpcRequest = new Request('http://localhost/rpc', {
        method: 'POST',
        headers: { ...commonHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '1', method: 'list', params: ['users', {}] }),
      })
      await doInstance.handleRequest(rpcRequest)

      // MCP request
      const mcpRequest = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { ...commonHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'search', params: ['test', {}] }),
      })
      await doInstance.handleRequest(mcpRequest)

      // All transports should have extracted the same auth
      expect(capturedAuths.length).toBeGreaterThanOrEqual(3)
      capturedAuths.forEach((captured) => {
        expect(captured.auth.userId).toBe('cross-transport-user')
        expect(captured.auth.organizationId).toBe('cross-transport-org')
        expect(captured.auth.token).toBe('cross-transport-token')
        expect(captured.auth.permissions).toContain('read')
        expect(captured.auth.permissions).toContain('write')
      })
    })
  })

  // ============================================================================
  // Auth Context Lifecycle
  // ============================================================================

  describe('Auth Context Lifecycle', () => {
    it('should clear auth context after request completes', async () => {
      const request = new Request('http://localhost/api/users', {
        headers: {
          Authorization: 'Bearer lifecycle-token',
          'X-User-ID': 'lifecycle-user',
        },
      })

      await doInstance.handleRequest(request)

      // After request, auth should be cleared
      const authAfterRequest = (doInstance as any).getAuthContext?.()
      expect(authAfterRequest).toBeNull()
    })

    it('should not leak auth between sequential requests', async () => {
      // First request with auth
      const request1 = new Request('http://localhost/api/users', {
        headers: {
          Authorization: 'Bearer first-token',
          'X-User-ID': 'first-user',
        },
      })
      await doInstance.handleRequest(request1)

      // Second request without auth
      const request2 = new Request('http://localhost/api/users')

      let secondRequestAuth: AuthContext | undefined
      const originalList = doInstance.list.bind(doInstance)
      ;(doInstance as any).list = async function (
        this: DO,
        collection: string,
        options?: any
      ) {
        secondRequestAuth = (this as any).getAuthContext?.()
        return originalList(collection, options)
      }

      await doInstance.handleRequest(request2)

      // Second request should NOT have first request's auth
      expect(secondRequestAuth?.userId).toBeUndefined()
      expect(secondRequestAuth?.token).toBeUndefined()
    })

    it('should maintain auth throughout async operations within a request', async () => {
      const request = new Request('http://localhost/rpc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer async-token',
          'X-User-ID': 'async-user',
        },
        body: JSON.stringify({
          id: '1',
          method: 'list',
          params: ['users', {}],
        }),
      })

      const authChecks: (AuthContext | null | undefined)[] = []

      const originalInvoke = doInstance.invoke.bind(doInstance)
      ;(doInstance as any).invoke = async function (
        this: DO,
        method: string,
        params: unknown[]
      ) {
        // Check before async work
        authChecks.push((this as any).getAuthContext?.())

        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 10))

        // Check after async work
        authChecks.push((this as any).getAuthContext?.())

        return originalInvoke(method, params)
      }

      await doInstance.handleRequest(request)

      // Auth should be consistent throughout
      expect(authChecks.length).toBe(2)
      expect(authChecks[0]?.userId).toBe('async-user')
      expect(authChecks[1]?.userId).toBe('async-user')
    })
  })

  // ============================================================================
  // Transport Context with Auth
  // ============================================================================

  describe('Transport Context with Auth', () => {
    it('should include transport type along with auth', async () => {
      interface ExtendedContext {
        auth?: AuthContext
        transport?: { type: string }
      }

      let capturedContext: ExtendedContext | undefined

      const originalInvoke = doInstance.invoke.bind(doInstance)
      ;(doInstance as any).invoke = async function (
        this: DO,
        method: string,
        params: unknown[]
      ) {
        capturedContext = {
          auth: (this as any).getAuthContext?.(),
          transport: (this as any).getTransportContext?.(),
        }
        return originalInvoke(method, params)
      }

      // HTTP request
      const httpRequest = new Request('http://localhost/api/users', {
        headers: {
          Authorization: 'Bearer http-transport-token',
        },
      })
      await doInstance.handleRequest(httpRequest)

      expect(capturedContext?.auth?.token).toBe('http-transport-token')
      expect(capturedContext?.transport?.type).toBe('http')

      // RPC request
      const rpcRequest = new Request('http://localhost/rpc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer rpc-transport-token',
        },
        body: JSON.stringify({ id: '1', method: 'list', params: ['users', {}] }),
      })
      await doInstance.handleRequest(rpcRequest)

      expect(capturedContext?.auth?.token).toBe('rpc-transport-token')
      // RPC is still HTTP-based but could be marked differently
      expect(['http', 'workers-rpc']).toContain(capturedContext?.transport?.type)
    })
  })
})
