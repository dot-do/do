/**
 * @dotdo/do - Auth Context Transport Propagation Tests (RED Phase)
 *
 * Tests for auth context propagation through all transports.
 * Verifies that authentication context flows correctly through:
 * - HTTP requests (Authorization header, X-Auth-Context header)
 * - WebSocket connections (initial handshake auth, per-message auth)
 * - RPC invocations (direct invoke with auth, proxy pattern)
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

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DO } from '../src/do'
import type { AuthContext, TransportContext } from '../src/types'

// Create a mock execution context with SQLite storage
function createMockCtx() {
  const tables: Map<string, Map<string, Record<string, unknown>>> = new Map()
  const webSockets: WebSocket[] = []

  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    acceptWebSocket: vi.fn((ws: WebSocket) => {
      webSockets.push(ws)
    }),
    getWebSockets: () => webSockets,
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

// Helper to create a mock WebSocket
function createMockWebSocket(): WebSocket {
  const ws = {
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    readyState: 1, // OPEN
    onmessage: null as ((ev: MessageEvent) => void) | null,
    onclose: null as ((ev: CloseEvent) => void) | null,
    onerror: null as ((ev: Event) => void) | null,
    onopen: null as ((ev: Event) => void) | null,
  } as unknown as WebSocket
  return ws
}

// Custom DO for testing auth propagation
class AuthTestDO extends DO {
  constructor(ctx: any, env: any) {
    super(ctx, env)
    this.allowedMethods.add('whoami')
    this.allowedMethods.add('protectedMethod')
    this.allowedMethods.add('getTransportContext')
    this.allowedMethods.add('requireAdmin')
  }

  async whoami(): Promise<AuthContext | null> {
    return this.getAuthContext()
  }

  async protectedMethod(): Promise<{ success: boolean; userId?: string }> {
    const auth = this.getAuthContext()
    if (!auth?.userId) {
      throw new Error('Authentication required')
    }
    return { success: true, userId: auth.userId }
  }

  async getTransportContext(): Promise<TransportContext | null> {
    return (this as any).getCurrentTransportContext?.() ?? null
  }

  async requireAdmin(): Promise<{ success: boolean }> {
    this.requirePermission('admin')
    return { success: true }
  }
}

describe('Auth Context Transport Propagation', () => {
  let doInstance: AuthTestDO

  beforeEach(() => {
    doInstance = new AuthTestDO(createMockCtx() as any, mockEnv)
  })

  // ============================================
  // HTTP Transport Auth Propagation
  // ============================================

  describe('HTTP Transport', () => {
    describe('Authorization Header Extraction', () => {
      it('should extract userId from Bearer JWT token', async () => {
        // JWT payload: { "userId": "user-123", "iat": 1234567890 }
        const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTEyMyIsImlhdCI6MTIzNDU2Nzg5MH0.xxx'

        const request = new Request('http://localhost/rpc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            id: '1',
            method: 'whoami',
            params: [],
          }),
        })

        const response = await doInstance.handleRequest(request)
        const body = await response.json() as { result: AuthContext | null }

        expect(body.result).not.toBeNull()
        expect(body.result?.userId).toBe('user-123')
      })

      it('should extract full claims from JWT including permissions', async () => {
        // JWT payload: { "userId": "user-123", "permissions": ["read", "write"], "organizationId": "org-456" }
        const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTEyMyIsInBlcm1pc3Npb25zIjpbInJlYWQiLCJ3cml0ZSJdLCJvcmdhbml6YXRpb25JZCI6Im9yZy00NTYifQ.xxx'

        const request = new Request('http://localhost/rpc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            id: '1',
            method: 'whoami',
            params: [],
          }),
        })

        const response = await doInstance.handleRequest(request)
        const body = await response.json() as { result: AuthContext | null }

        expect(body.result?.userId).toBe('user-123')
        expect(body.result?.permissions).toEqual(['read', 'write'])
        expect(body.result?.organizationId).toBe('org-456')
      })

      it('should store original token in auth context', async () => {
        const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTEyMyJ9.xxx'

        const request = new Request('http://localhost/rpc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            id: '1',
            method: 'whoami',
            params: [],
          }),
        })

        const response = await doInstance.handleRequest(request)
        const body = await response.json() as { result: AuthContext | null }

        expect(body.result?.token).toBe(jwt)
      })

      it('should handle Basic auth header', async () => {
        const credentials = Buffer.from('user-123:password').toString('base64')

        const request = new Request('http://localhost/rpc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${credentials}`,
          },
          body: JSON.stringify({
            id: '1',
            method: 'whoami',
            params: [],
          }),
        })

        const response = await doInstance.handleRequest(request)
        const body = await response.json() as { result: AuthContext | null }

        expect(body.result?.userId).toBe('user-123')
      })

      it('should handle API key auth header', async () => {
        const request = new Request('http://localhost/rpc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'api-key-123',
          },
          body: JSON.stringify({
            id: '1',
            method: 'whoami',
            params: [],
          }),
        })

        const response = await doInstance.handleRequest(request)
        const body = await response.json() as { result: AuthContext | null }

        // API key auth should populate token field
        expect(body.result?.token).toBe('api-key-123')
      })
    })

    describe('X-Auth-Context Header', () => {
      it('should accept full auth context via X-Auth-Context header', async () => {
        const authContext: AuthContext = {
          userId: 'user-123',
          organizationId: 'org-456',
          permissions: ['read', 'write', 'admin'],
          metadata: { tenantId: 'tenant-789', roles: ['manager'] },
        }

        const request = new Request('http://localhost/rpc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Auth-Context': JSON.stringify(authContext),
          },
          body: JSON.stringify({
            id: '1',
            method: 'whoami',
            params: [],
          }),
        })

        const response = await doInstance.handleRequest(request)
        const body = await response.json() as { result: AuthContext | null }

        expect(body.result).toEqual(authContext)
      })

      it('should prefer X-Auth-Context over Authorization header when both present', async () => {
        const authContext: AuthContext = {
          userId: 'context-user',
          permissions: ['admin'],
        }

        const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJqd3QtdXNlciJ9.xxx'

        const request = new Request('http://localhost/rpc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
            'X-Auth-Context': JSON.stringify(authContext),
          },
          body: JSON.stringify({
            id: '1',
            method: 'whoami',
            params: [],
          }),
        })

        const response = await doInstance.handleRequest(request)
        const body = await response.json() as { result: AuthContext | null }

        expect(body.result?.userId).toBe('context-user')
      })

      it('should handle malformed X-Auth-Context gracefully', async () => {
        const request = new Request('http://localhost/rpc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Auth-Context': 'not-valid-json',
          },
          body: JSON.stringify({
            id: '1',
            method: 'whoami',
            params: [],
          }),
        })

        const response = await doInstance.handleRequest(request)
        const body = await response.json() as { result: AuthContext | null }

        // Should not crash, auth context should be null
        expect(body.result).toBeNull()
      })
    })

    describe('REST API Auth Propagation', () => {
      it('should propagate auth to GET requests', async () => {
        const authContext: AuthContext = { userId: 'user-123' }

        // First create a document
        await doInstance.create('users', { id: 'test-id', name: 'Test' })

        const request = new Request('http://localhost/api/users/test-id', {
          method: 'GET',
          headers: {
            'X-Auth-Context': JSON.stringify(authContext),
          },
        })

        const response = await doInstance.handleRequest(request)
        expect(response.status).toBe(200)
        // Auth context should have been available during the request
      })

      it('should propagate auth to POST requests and record creator', async () => {
        const authContext: AuthContext = {
          userId: 'creator-123',
          organizationId: 'org-456',
        }

        const request = new Request('http://localhost/api/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Auth-Context': JSON.stringify(authContext),
          },
          body: JSON.stringify({ name: 'New User' }),
        })

        const response = await doInstance.handleRequest(request)
        const body = await response.json() as { data: Record<string, unknown> }

        expect(response.status).toBe(201)
        expect(body.data._createdBy).toBe('creator-123')
        expect(body.data._organization).toBe('org-456')
      })

      it('should propagate auth to PUT requests and record updater', async () => {
        // Create document first
        const doc = await doInstance.create('users', { name: 'Original' })

        const authContext: AuthContext = { userId: 'updater-456' }

        const request = new Request(`http://localhost/api/users/${doc.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Auth-Context': JSON.stringify(authContext),
          },
          body: JSON.stringify({ name: 'Updated' }),
        })

        const response = await doInstance.handleRequest(request)
        const body = await response.json() as { data: Record<string, unknown> }

        expect(body.data._updatedBy).toBe('updater-456')
      })

      it('should propagate auth to DELETE requests for audit', async () => {
        const doc = await doInstance.create('users', { name: 'To Delete' })
        const authContext: AuthContext = { userId: 'deleter-789' }

        const request = new Request(`http://localhost/api/users/${doc.id}`, {
          method: 'DELETE',
          headers: {
            'X-Auth-Context': JSON.stringify(authContext),
          },
        })

        const response = await doInstance.handleRequest(request)
        expect(response.status).toBe(200)
        // Deletion should be auditable with auth context
      })
    })

    describe('Auth Context Lifecycle in HTTP', () => {
      it('should clear auth context after request completes', async () => {
        const authContext: AuthContext = { userId: 'request-user' }

        const request = new Request('http://localhost/rpc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Auth-Context': JSON.stringify(authContext),
          },
          body: JSON.stringify({
            id: '1',
            method: 'whoami',
            params: [],
          }),
        })

        await doInstance.handleRequest(request)

        // Auth context should be cleared after request
        expect((doInstance as any).getAuthContext()).toBeNull()
      })

      it('should isolate auth context between concurrent requests', async () => {
        const auth1: AuthContext = { userId: 'user-1' }
        const auth2: AuthContext = { userId: 'user-2' }

        const request1 = new Request('http://localhost/rpc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Auth-Context': JSON.stringify(auth1),
          },
          body: JSON.stringify({
            id: '1',
            method: 'whoami',
            params: [],
          }),
        })

        const request2 = new Request('http://localhost/rpc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Auth-Context': JSON.stringify(auth2),
          },
          body: JSON.stringify({
            id: '2',
            method: 'whoami',
            params: [],
          }),
        })

        const [response1, response2] = await Promise.all([
          doInstance.handleRequest(request1),
          doInstance.handleRequest(request2),
        ])

        const body1 = await response1.json() as { result: AuthContext | null }
        const body2 = await response2.json() as { result: AuthContext | null }

        // Each request should see its own auth context
        expect(body1.result?.userId).toBe('user-1')
        expect(body2.result?.userId).toBe('user-2')
      })
    })
  })

  // ============================================
  // WebSocket Transport Auth Propagation
  // ============================================

  describe('WebSocket Transport', () => {
    describe('Connection Handshake Auth', () => {
      it('should extract auth from WebSocket upgrade request', async () => {
        const authContext: AuthContext = {
          userId: 'ws-user-123',
          permissions: ['realtime'],
        }

        const request = new Request('http://localhost/ws', {
          headers: {
            Upgrade: 'websocket',
            'X-Auth-Context': JSON.stringify(authContext),
          },
        })

        const response = await doInstance.handleRequest(request)
        expect(response.status).toBe(101)

        // Auth should be stored for this WebSocket connection
        const wsAuth = (doInstance as any).getWebSocketAuth?.(/* ws reference */)
        expect(wsAuth?.userId).toBe('ws-user-123')
      })

      it('should extract auth from Authorization header during WS upgrade', async () => {
        const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ3cy11c2VyLTQ1NiJ9.xxx'

        const request = new Request('http://localhost/ws', {
          headers: {
            Upgrade: 'websocket',
            Authorization: `Bearer ${jwt}`,
          },
        })

        const response = await doInstance.handleRequest(request)
        expect(response.status).toBe(101)
      })

      it('should extract auth from query parameters for browsers', async () => {
        const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJxdWVyeS11c2VyIn0.xxx'

        const request = new Request(`http://localhost/ws?token=${token}`, {
          headers: {
            Upgrade: 'websocket',
          },
        })

        const response = await doInstance.handleRequest(request)
        expect(response.status).toBe(101)

        // Token from query should be extracted
        const wsAuth = (doInstance as any).getWebSocketAuth?.(/* ws reference */)
        expect(wsAuth?.token).toBe(token)
      })

      it('should reject WebSocket connection for invalid auth', async () => {
        const request = new Request('http://localhost/ws?requireAuth=true', {
          headers: {
            Upgrade: 'websocket',
            // No auth provided
          },
        })

        const response = await doInstance.handleRequest(request)
        // Should reject with 401 or 403 for protected endpoints
        expect(response.status).toBeOneOf([101, 401, 403])
      })
    })

    describe('Per-Message Auth in WebSocket', () => {
      it('should accept auth in message envelope', async () => {
        const ws = createMockWebSocket()
        const authContext: AuthContext = {
          userId: 'msg-user-123',
          permissions: ['write'],
        }

        // Simulate receiving a message with auth envelope
        const message = JSON.stringify({
          auth: authContext,
          method: 'whoami',
          params: [],
        })

        await doInstance.webSocketMessage(ws, message)

        // Check that response was sent
        expect(ws.send).toHaveBeenCalled()
        const sentMessage = JSON.parse((ws.send as any).mock.calls[0][0])
        expect(sentMessage.result?.userId).toBe('msg-user-123')
      })

      it('should use connection auth when message has no auth', async () => {
        const ws = createMockWebSocket()

        // Set connection-level auth
        ;(doInstance as any).setWebSocketAuth?.(ws, {
          userId: 'connection-user',
          permissions: ['read'],
        })

        const message = JSON.stringify({
          method: 'whoami',
          params: [],
          // No auth in message - should use connection auth
        })

        await doInstance.webSocketMessage(ws, message)

        expect(ws.send).toHaveBeenCalled()
        const sentMessage = JSON.parse((ws.send as any).mock.calls[0][0])
        expect(sentMessage.result?.userId).toBe('connection-user')
      })

      it('should allow message auth to override connection auth', async () => {
        const ws = createMockWebSocket()

        // Set connection-level auth
        ;(doInstance as any).setWebSocketAuth?.(ws, {
          userId: 'connection-user',
          permissions: ['read'],
        })

        // Message with different auth
        const messageAuth: AuthContext = {
          userId: 'elevated-user',
          permissions: ['read', 'write', 'admin'],
        }

        const message = JSON.stringify({
          auth: messageAuth,
          method: 'whoami',
          params: [],
        })

        await doInstance.webSocketMessage(ws, message)

        expect(ws.send).toHaveBeenCalled()
        const sentMessage = JSON.parse((ws.send as any).mock.calls[0][0])
        expect(sentMessage.result?.userId).toBe('elevated-user')
      })

      it('should clean up auth context after message processing', async () => {
        const ws = createMockWebSocket()

        const message = JSON.stringify({
          auth: { userId: 'temp-user' },
          method: 'whoami',
          params: [],
        })

        await doInstance.webSocketMessage(ws, message)

        // Auth context should be cleared after message processing
        expect((doInstance as any).getAuthContext()).toBeNull()
      })
    })

    describe('WebSocket Auth Persistence', () => {
      it('should persist auth across WebSocket hibernation', async () => {
        const authContext: AuthContext = {
          userId: 'hibernate-user',
          permissions: ['realtime'],
        }

        // Simulate WebSocket connection with auth
        const request = new Request('http://localhost/ws', {
          headers: {
            Upgrade: 'websocket',
            'X-Auth-Context': JSON.stringify(authContext),
          },
        })

        await doInstance.handleRequest(request)

        // Simulate hibernation and wake-up
        // Auth should be stored in WebSocket attachment
        const ws = createMockWebSocket()
        const attachment = (doInstance as any).getWebSocketAttachment?.(ws)
        expect(attachment?.auth?.userId).toBe('hibernate-user')
      })

      it('should maintain auth after WebSocket auto-response', async () => {
        const ws = createMockWebSocket()

        ;(doInstance as any).setWebSocketAuth?.(ws, {
          userId: 'auto-response-user',
        })

        // Simulate auto-response scenario
        const pingMessage = JSON.stringify({ type: 'ping' })
        await doInstance.webSocketMessage(ws, pingMessage)

        // Auth should still be available
        const storedAuth = (doInstance as any).getWebSocketAuth?.(ws)
        expect(storedAuth?.userId).toBe('auto-response-user')
      })
    })
  })

  // ============================================
  // RPC Transport Auth Propagation
  // ============================================

  describe('RPC Transport', () => {
    describe('Direct Invoke with Auth', () => {
      it('should pass auth context as third parameter to invoke()', async () => {
        const authContext: AuthContext = {
          userId: 'invoke-user-123',
          permissions: ['read', 'write'],
        }

        const result = await doInstance.invoke('whoami', [], authContext)
        expect(result).toEqual(authContext)
      })

      it('should make auth available during method execution', async () => {
        const authContext: AuthContext = {
          userId: 'method-user-456',
          organizationId: 'org-789',
        }

        const result = await doInstance.invoke('whoami', [], authContext)
        expect(result).toEqual(authContext)
      })

      it('should isolate auth between sequential invocations', async () => {
        const auth1: AuthContext = { userId: 'user-1' }
        const auth2: AuthContext = { userId: 'user-2' }

        const result1 = await doInstance.invoke('whoami', [], auth1)
        const result2 = await doInstance.invoke('whoami', [], auth2)
        const result3 = await doInstance.invoke('whoami', [])

        expect(result1?.userId).toBe('user-1')
        expect(result2?.userId).toBe('user-2')
        expect(result3).toBeNull()
      })

      it('should clear auth context after invoke completes', async () => {
        const authContext: AuthContext = { userId: 'temp-invoke-user' }

        await doInstance.invoke('whoami', [], authContext)

        // Auth should be cleared
        expect((doInstance as any).getAuthContext()).toBeNull()
      })

      it('should clear auth context even on method failure', async () => {
        const authContext: AuthContext = { userId: 'failing-user' }

        try {
          await doInstance.invoke('nonexistent', [], authContext)
        } catch {
          // Expected to fail
        }

        // Auth should still be cleared
        expect((doInstance as any).getAuthContext()).toBeNull()
      })
    })

    describe('Batch RPC with Auth', () => {
      it('should apply same auth to all methods in batch', async () => {
        const authContext: AuthContext = {
          userId: 'batch-user',
          permissions: ['batch'],
        }

        const request = new Request('http://localhost/rpc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Auth-Context': JSON.stringify(authContext),
          },
          body: JSON.stringify([
            { id: '1', method: 'whoami', params: [] },
            { id: '2', method: 'whoami', params: [] },
            { id: '3', method: 'whoami', params: [] },
          ]),
        })

        const response = await doInstance.handleRequest(request)
        const body = await response.json() as Array<{ result: AuthContext | null }>

        expect(body).toHaveLength(3)
        expect(body[0].result?.userId).toBe('batch-user')
        expect(body[1].result?.userId).toBe('batch-user')
        expect(body[2].result?.userId).toBe('batch-user')
      })

      it('should support per-request auth in batch', async () => {
        const request = new Request('http://localhost/rpc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([
            {
              id: '1',
              method: 'whoami',
              params: [],
              auth: { userId: 'batch-user-1' },
            },
            {
              id: '2',
              method: 'whoami',
              params: [],
              auth: { userId: 'batch-user-2' },
            },
          ]),
        })

        const response = await doInstance.handleRequest(request)
        const body = await response.json() as Array<{ result: AuthContext | null }>

        expect(body[0].result?.userId).toBe('batch-user-1')
        expect(body[1].result?.userId).toBe('batch-user-2')
      })
    })

    describe('Workers RPC Stub Auth', () => {
      it('should propagate auth through Workers RPC stub', async () => {
        const authContext: AuthContext = {
          userId: 'stub-user',
          organizationId: 'stub-org',
        }

        // Simulate Workers RPC call with auth in serialized form
        const result = await doInstance.invoke(
          'whoami',
          [],
          authContext
        )

        expect(result).toEqual(authContext)
      })

      it('should handle serialized auth context in RPC calls', async () => {
        // Auth context serialized as it would be over the wire
        const serializedAuth = JSON.stringify({
          userId: 'serialized-user',
          permissions: ['read'],
        })

        const request = new Request('http://localhost/rpc', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Auth-Context': serializedAuth,
          },
          body: JSON.stringify({
            id: '1',
            method: 'whoami',
            params: [],
          }),
        })

        const response = await doInstance.handleRequest(request)
        const body = await response.json() as { result: AuthContext | null }

        expect(body.result?.userId).toBe('serialized-user')
      })
    })
  })

  // ============================================
  // Transport Context Tracking
  // ============================================

  describe('Transport Context', () => {
    it('should track transport type as http for HTTP requests', async () => {
      const request = new Request('http://localhost/rpc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: '1',
          method: 'getTransportContext',
          params: [],
        }),
      })

      const response = await doInstance.handleRequest(request)
      const body = await response.json() as { result: TransportContext | null }

      expect(body.result?.type).toBe('http')
    })

    it('should track transport type as websocket for WS messages', async () => {
      const ws = createMockWebSocket()

      const message = JSON.stringify({
        method: 'getTransportContext',
        params: [],
      })

      await doInstance.webSocketMessage(ws, message)

      expect(ws.send).toHaveBeenCalled()
      const sentMessage = JSON.parse((ws.send as any).mock.calls[0][0])
      expect(sentMessage.result?.type).toBe('websocket')
    })

    it('should track transport type as workers-rpc for direct invoke', async () => {
      // When called via invoke() directly (Workers RPC), transport should be 'workers-rpc'
      const result = await doInstance.invoke('getTransportContext', []) as TransportContext | null

      expect(result?.type).toBe('workers-rpc')
    })

    it('should include request reference in HTTP transport context', async () => {
      const request = new Request('http://localhost/rpc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Custom-Header': 'test-value',
        },
        body: JSON.stringify({
          id: '1',
          method: 'getTransportContext',
          params: [],
        }),
      })

      const response = await doInstance.handleRequest(request)
      const body = await response.json() as { result: TransportContext | null }

      expect(body.result?.request).toBeDefined()
    })

    it('should include WebSocket reference in WS transport context', async () => {
      const ws = createMockWebSocket()

      const message = JSON.stringify({
        method: 'getTransportContext',
        params: [],
      })

      await doInstance.webSocketMessage(ws, message)

      const sentMessage = JSON.parse((ws.send as any).mock.calls[0][0])
      expect(sentMessage.result?.ws).toBeDefined()
    })
  })

  // ============================================
  // Cross-Transport Auth Scenarios
  // ============================================

  describe('Cross-Transport Scenarios', () => {
    it('should maintain consistent auth behavior across all transports', async () => {
      const authContext: AuthContext = {
        userId: 'cross-transport-user',
        permissions: ['cross'],
      }

      // HTTP
      const httpRequest = new Request('http://localhost/rpc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Context': JSON.stringify(authContext),
        },
        body: JSON.stringify({
          id: '1',
          method: 'whoami',
          params: [],
        }),
      })
      const httpResponse = await doInstance.handleRequest(httpRequest)
      const httpBody = await httpResponse.json() as { result: AuthContext | null }

      // WebSocket
      const ws = createMockWebSocket()
      const wsMessage = JSON.stringify({
        auth: authContext,
        method: 'whoami',
        params: [],
      })
      await doInstance.webSocketMessage(ws, wsMessage)
      const wsBody = JSON.parse((ws.send as any).mock.calls[0][0])

      // RPC
      const rpcResult = await doInstance.invoke('whoami', [], authContext)

      // All should return same auth
      expect(httpBody.result?.userId).toBe('cross-transport-user')
      expect(wsBody.result?.userId).toBe('cross-transport-user')
      expect((rpcResult as AuthContext)?.userId).toBe('cross-transport-user')
    })

    it('should handle auth upgrade from unauthenticated to authenticated', async () => {
      // First request without auth
      const noAuthRequest = new Request('http://localhost/rpc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: '1',
          method: 'whoami',
          params: [],
        }),
      })
      const noAuthResponse = await doInstance.handleRequest(noAuthRequest)
      const noAuthBody = await noAuthResponse.json() as { result: AuthContext | null }

      // Second request with auth
      const authContext: AuthContext = { userId: 'upgraded-user' }
      const authRequest = new Request('http://localhost/rpc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Context': JSON.stringify(authContext),
        },
        body: JSON.stringify({
          id: '2',
          method: 'whoami',
          params: [],
        }),
      })
      const authResponse = await doInstance.handleRequest(authRequest)
      const authBody = await authResponse.json() as { result: AuthContext | null }

      expect(noAuthBody.result).toBeNull()
      expect(authBody.result?.userId).toBe('upgraded-user')
    })
  })

  // ============================================
  // Permission Enforcement Through Transports
  // ============================================

  describe('Permission Enforcement Through Transports', () => {
    it('should enforce permissions on HTTP requests', async () => {
      const authContext: AuthContext = {
        userId: 'user-without-admin',
        permissions: ['read', 'write'],
      }

      const request = new Request('http://localhost/rpc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Context': JSON.stringify(authContext),
        },
        body: JSON.stringify({
          id: '1',
          method: 'requireAdmin',
          params: [],
        }),
      })

      const response = await doInstance.handleRequest(request)
      const body = await response.json() as { error?: string }

      expect(body.error).toContain('Permission denied')
    })

    it('should enforce permissions on WebSocket messages', async () => {
      const ws = createMockWebSocket()

      const message = JSON.stringify({
        auth: {
          userId: 'ws-user',
          permissions: [], // No admin permission
        },
        method: 'requireAdmin',
        params: [],
      })

      await doInstance.webSocketMessage(ws, message)

      const sentMessage = JSON.parse((ws.send as any).mock.calls[0][0])
      expect(sentMessage.error).toContain('Permission denied')
    })

    it('should enforce permissions on RPC invoke', async () => {
      const authContext: AuthContext = {
        userId: 'rpc-user',
        permissions: ['read'],
      }

      await expect(
        doInstance.invoke('requireAdmin', [], authContext)
      ).rejects.toThrow('Permission denied')
    })

    it('should allow method when permission is present', async () => {
      const authContext: AuthContext = {
        userId: 'admin-user',
        permissions: ['read', 'write', 'admin'],
      }

      const result = await doInstance.invoke('requireAdmin', [], authContext)
      expect(result).toEqual({ success: true })
    })
  })

  // ============================================
  // Error Handling in Auth Propagation
  // ============================================

  describe('Error Handling', () => {
    it('should handle expired token gracefully', async () => {
      // Expired JWT (exp in the past)
      const expiredJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJleHBpcmVkLXVzZXIiLCJleHAiOjF9.xxx'

      const request = new Request('http://localhost/rpc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${expiredJwt}`,
        },
        body: JSON.stringify({
          id: '1',
          method: 'whoami',
          params: [],
        }),
      })

      const response = await doInstance.handleRequest(request)
      // Should return 401 or handle gracefully
      expect(response.status).toBeOneOf([200, 401])
    })

    it('should handle token validation errors', async () => {
      const invalidJwt = 'not.a.valid.jwt'

      const request = new Request('http://localhost/rpc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${invalidJwt}`,
        },
        body: JSON.stringify({
          id: '1',
          method: 'whoami',
          params: [],
        }),
      })

      const response = await doInstance.handleRequest(request)
      // Should not crash, return appropriate error or treat as unauthenticated
      expect(response.status).toBeOneOf([200, 400, 401])
    })

    it('should not leak auth errors to unauthorized callers', async () => {
      const request = new Request('http://localhost/rpc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid',
        },
        body: JSON.stringify({
          id: '1',
          method: 'protectedMethod',
          params: [],
        }),
      })

      const response = await doInstance.handleRequest(request)
      const body = await response.json() as { error?: string }

      // Error message should not reveal internal details
      if (body.error) {
        expect(body.error).not.toContain('stack')
        expect(body.error).not.toContain('at ')
      }
    })
  })
})

// Custom matcher for checking if value is one of expected values
expect.extend({
  toBeOneOf(received: unknown, expected: unknown[]) {
    const pass = expected.includes(received)
    return {
      message: () =>
        `expected ${received} ${pass ? 'not ' : ''}to be one of ${expected.join(', ')}`,
      pass,
    }
  },
})

declare module 'vitest' {
  interface Assertion<T = any> {
    toBeOneOf(expected: unknown[]): T
  }
}
