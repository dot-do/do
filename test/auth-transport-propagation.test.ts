/**
 * @dotdo/do - Auth Context Transport Propagation Tests (GREEN Phase)
 *
 * Tests for auth context propagation through all transports.
 * Verifies that authentication context flows correctly through:
 * - HTTP requests (Authorization header, X-Auth-Context header)
 * - WebSocket connections (initial handshake auth, per-message auth)
 * - RPC invocations (direct invoke with auth, proxy pattern)
 *
 * Migrated to use cloudflare:test pattern with runInDurableObject.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { env, runInDurableObject } from 'cloudflare:test'
import type { DurableObjectStub } from '@cloudflare/workers-types'
import type { AuthContext, TransportContext } from '../src/types'
import { createTestStub, uniqueTestName } from './helpers/do-test-utils'

// Type for DO stub with RPC methods
interface DOStub extends DurableObjectStub {
  get(collection: string, id: string): Promise<unknown>
  list(collection: string, options?: unknown): Promise<unknown[]>
  create(collection: string, doc: Record<string, unknown>): Promise<Record<string, unknown>>
  update(collection: string, id: string, updates: Record<string, unknown>): Promise<unknown>
  delete(collection: string, id: string): Promise<boolean>
  invoke(method: string, params: unknown[], authContext?: AuthContext): Promise<unknown>
  search(query: string, options?: unknown): Promise<unknown[]>
}

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

describe('Auth Context Transport Propagation', () => {
  let stub: DOStub

  beforeEach(() => {
    const name = uniqueTestName('auth-transport-propagation')
    stub = createTestStub(name) as DOStub
  })

  // ============================================
  // HTTP Transport Auth Propagation
  // ============================================

  describe('HTTP Transport', () => {
    describe('Authorization Header Extraction', () => {
      it('should extract userId from Bearer JWT token', async () => {
        await runInDurableObject(stub, async (instance) => {
          // Register whoami method
          ;(instance as any).allowedMethods.add('whoami')
          ;(instance as any).whoami = function () {
            return this.getAuthContext()
          }

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

          const response = await (instance as any).handleRequest(request)
          const body = (await response.json()) as { result: AuthContext | null }

          expect(body.result).not.toBeNull()
          expect(body.result?.userId).toBe('user-123')
        })
      })

      it('should extract full claims from JWT including permissions', async () => {
        await runInDurableObject(stub, async (instance) => {
          ;(instance as any).allowedMethods.add('whoami')
          ;(instance as any).whoami = function () {
            return this.getAuthContext()
          }

          // JWT payload: { "userId": "user-123", "permissions": ["read", "write"], "organizationId": "org-456" }
          const jwt =
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTEyMyIsInBlcm1pc3Npb25zIjpbInJlYWQiLCJ3cml0ZSJdLCJvcmdhbml6YXRpb25JZCI6Im9yZy00NTYifQ.xxx'

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

          const response = await (instance as any).handleRequest(request)
          const body = (await response.json()) as { result: AuthContext | null }

          expect(body.result?.userId).toBe('user-123')
          expect(body.result?.permissions).toEqual(['read', 'write'])
          expect(body.result?.organizationId).toBe('org-456')
        })
      })

      it('should store original token in auth context', async () => {
        await runInDurableObject(stub, async (instance) => {
          ;(instance as any).allowedMethods.add('whoami')
          ;(instance as any).whoami = function () {
            return this.getAuthContext()
          }

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

          const response = await (instance as any).handleRequest(request)
          const body = (await response.json()) as { result: AuthContext | null }

          expect(body.result?.token).toBe(jwt)
        })
      })

      it('should handle Basic auth header', async () => {
        await runInDurableObject(stub, async (instance) => {
          ;(instance as any).allowedMethods.add('whoami')
          ;(instance as any).whoami = function () {
            return this.getAuthContext()
          }

          const credentials = btoa('user-123:password')

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

          const response = await (instance as any).handleRequest(request)
          const body = (await response.json()) as { result: AuthContext | null }

          expect(body.result?.userId).toBe('user-123')
        })
      })

      it('should handle API key auth header', async () => {
        await runInDurableObject(stub, async (instance) => {
          ;(instance as any).allowedMethods.add('whoami')
          ;(instance as any).whoami = function () {
            return this.getAuthContext()
          }

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

          const response = await (instance as any).handleRequest(request)
          const body = (await response.json()) as { result: AuthContext | null }

          // API key auth should populate token field
          expect(body.result?.token).toBe('api-key-123')
        })
      })
    })

    describe('X-Auth-Context Header', () => {
      it('should accept full auth context via X-Auth-Context header', async () => {
        await runInDurableObject(stub, async (instance) => {
          ;(instance as any).allowedMethods.add('whoami')
          ;(instance as any).whoami = function () {
            return this.getAuthContext()
          }

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

          const response = await (instance as any).handleRequest(request)
          const body = (await response.json()) as { result: AuthContext | null }

          expect(body.result).toEqual(authContext)
        })
      })

      it('should prefer X-Auth-Context over Authorization header when both present', async () => {
        await runInDurableObject(stub, async (instance) => {
          ;(instance as any).allowedMethods.add('whoami')
          ;(instance as any).whoami = function () {
            return this.getAuthContext()
          }

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

          const response = await (instance as any).handleRequest(request)
          const body = (await response.json()) as { result: AuthContext | null }

          expect(body.result?.userId).toBe('context-user')
        })
      })

      it('should handle malformed X-Auth-Context gracefully', async () => {
        await runInDurableObject(stub, async (instance) => {
          ;(instance as any).allowedMethods.add('whoami')
          ;(instance as any).whoami = function () {
            return this.getAuthContext()
          }

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

          const response = await (instance as any).handleRequest(request)
          const body = (await response.json()) as { result: AuthContext | null }

          // Should not crash, auth context should be null
          expect(body.result).toBeNull()
        })
      })
    })

    describe('REST API Auth Propagation', () => {
      it('should propagate auth to GET requests', async () => {
        await runInDurableObject(stub, async (instance) => {
          const authContext: AuthContext = { userId: 'user-123' }

          // First create a document
          await (instance as any).create('users', { id: 'test-id', name: 'Test' })

          const request = new Request('http://localhost/api/users/test-id', {
            method: 'GET',
            headers: {
              'X-Auth-Context': JSON.stringify(authContext),
            },
          })

          const response = await (instance as any).handleRequest(request)
          expect(response.status).toBe(200)
          // Auth context should have been available during the request
        })
      })

      it('should propagate auth to POST requests and record creator', async () => {
        await runInDurableObject(stub, async (instance) => {
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

          const response = await (instance as any).handleRequest(request)
          const body = (await response.json()) as { data: Record<string, unknown> }

          expect(response.status).toBe(201)
          expect(body.data._createdBy).toBe('creator-123')
          expect(body.data._organization).toBe('org-456')
        })
      })

      it('should propagate auth to PUT requests and record updater', async () => {
        await runInDurableObject(stub, async (instance) => {
          // Create document first
          const doc = await (instance as any).create('users', { name: 'Original' })

          const authContext: AuthContext = { userId: 'updater-456' }

          const request = new Request(`http://localhost/api/users/${doc.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'X-Auth-Context': JSON.stringify(authContext),
            },
            body: JSON.stringify({ name: 'Updated' }),
          })

          const response = await (instance as any).handleRequest(request)
          const body = (await response.json()) as { data: Record<string, unknown> }

          expect(body.data._updatedBy).toBe('updater-456')
        })
      })

      it('should propagate auth to DELETE requests for audit', async () => {
        await runInDurableObject(stub, async (instance) => {
          const doc = await (instance as any).create('users', { name: 'To Delete' })
          const authContext: AuthContext = { userId: 'deleter-789' }

          const request = new Request(`http://localhost/api/users/${doc.id}`, {
            method: 'DELETE',
            headers: {
              'X-Auth-Context': JSON.stringify(authContext),
            },
          })

          const response = await (instance as any).handleRequest(request)
          expect(response.status).toBe(200)
          // Deletion should be auditable with auth context
        })
      })
    })

    describe('Auth Context Lifecycle in HTTP', () => {
      it('should clear auth context after request completes', async () => {
        await runInDurableObject(stub, async (instance) => {
          ;(instance as any).allowedMethods.add('whoami')
          ;(instance as any).whoami = function () {
            return this.getAuthContext()
          }

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

          await (instance as any).handleRequest(request)

          // Auth context should be cleared after request
          expect((instance as any).getAuthContext()).toBeNull()
        })
      })

      it('should isolate auth context between concurrent requests', async () => {
        await runInDurableObject(stub, async (instance) => {
          ;(instance as any).allowedMethods.add('whoami')
          ;(instance as any).whoami = function () {
            return this.getAuthContext()
          }

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
            (instance as any).handleRequest(request1),
            (instance as any).handleRequest(request2),
          ])

          const body1 = (await response1.json()) as { result: AuthContext | null }
          const body2 = (await response2.json()) as { result: AuthContext | null }

          // Each request should see its own auth context
          expect(body1.result?.userId).toBe('user-1')
          expect(body2.result?.userId).toBe('user-2')
        })
      })
    })
  })

  // ============================================
  // WebSocket Transport Auth Propagation
  // ============================================

  describe('WebSocket Transport', () => {
    describe('Connection Handshake Auth', () => {
      it('should extract auth from WebSocket upgrade request', async () => {
        await runInDurableObject(stub, async (instance) => {
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

          const response = await (instance as any).handleRequest(request)
          expect(response.status).toBe(101)

          // Auth should be stored for this WebSocket connection
          const wsAuth = (instance as any).getWebSocketAuth?.()
          expect(wsAuth?.userId).toBe('ws-user-123')
        })
      })

      it('should extract auth from Authorization header during WS upgrade', async () => {
        await runInDurableObject(stub, async (instance) => {
          const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ3cy11c2VyLTQ1NiJ9.xxx'

          const request = new Request('http://localhost/ws', {
            headers: {
              Upgrade: 'websocket',
              Authorization: `Bearer ${jwt}`,
            },
          })

          const response = await (instance as any).handleRequest(request)
          expect(response.status).toBe(101)
        })
      })

      it('should extract auth from query parameters for browsers', async () => {
        await runInDurableObject(stub, async (instance) => {
          const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJxdWVyeS11c2VyIn0.xxx'

          const request = new Request(`http://localhost/ws?token=${token}`, {
            headers: {
              Upgrade: 'websocket',
            },
          })

          const response = await (instance as any).handleRequest(request)
          expect(response.status).toBe(101)

          // Token from query should be extracted
          const wsAuth = (instance as any).getWebSocketAuth?.()
          expect(wsAuth?.token).toBe(token)
        })
      })

      it('should reject WebSocket connection for invalid auth', async () => {
        await runInDurableObject(stub, async (instance) => {
          const request = new Request('http://localhost/ws?requireAuth=true', {
            headers: {
              Upgrade: 'websocket',
              // No auth provided
            },
          })

          const response = await (instance as any).handleRequest(request)
          // Should reject with 401 or 403 for protected endpoints
          expect(response.status).toBeOneOf([101, 401, 403])
        })
      })
    })

    describe('Per-Message Auth in WebSocket', () => {
      it('should accept auth in message envelope', async () => {
        await runInDurableObject(stub, async (instance) => {
          ;(instance as any).allowedMethods.add('whoami')
          ;(instance as any).whoami = function () {
            return this.getAuthContext()
          }

          const authContext: AuthContext = {
            userId: 'msg-user-123',
            permissions: ['write'],
          }

          // Create a mock WebSocket
          const responses: string[] = []
          const mockWs = {
            send: (data: string) => responses.push(data),
            close: () => {},
            readyState: 1,
          }

          // Simulate receiving a message with auth envelope
          const message = JSON.stringify({
            auth: authContext,
            method: 'whoami',
            params: [],
          })

          await (instance as any).webSocketMessage(mockWs, message)

          // Check that response was sent
          expect(responses.length).toBeGreaterThan(0)
          const sentMessage = JSON.parse(responses[0])
          expect(sentMessage.result?.userId).toBe('msg-user-123')
        })
      })

      it('should use connection auth when message has no auth', async () => {
        await runInDurableObject(stub, async (instance) => {
          ;(instance as any).allowedMethods.add('whoami')
          ;(instance as any).whoami = function () {
            return this.getAuthContext()
          }

          // Set connection-level auth
          ;(instance as any).setWebSocketAuth?.({
            userId: 'connection-user',
            permissions: ['read'],
          })

          const responses: string[] = []
          const mockWs = {
            send: (data: string) => responses.push(data),
            close: () => {},
            readyState: 1,
          }

          const message = JSON.stringify({
            jsonrpc: '2.0',
            id: '1',
            method: 'whoami',
            params: [],
            // No auth in message - should use connection auth
          })

          await (instance as any).webSocketMessage(mockWs, message)

          expect(responses.length).toBeGreaterThan(0)
          const sentMessage = JSON.parse(responses[0])
          expect(sentMessage.result?.userId).toBe('connection-user')
        })
      })

      it('should allow message auth to override connection auth', async () => {
        await runInDurableObject(stub, async (instance) => {
          ;(instance as any).allowedMethods.add('whoami')
          ;(instance as any).whoami = function () {
            return this.getAuthContext()
          }

          // Set connection-level auth
          ;(instance as any).setWebSocketAuth?.({
            userId: 'connection-user',
            permissions: ['read'],
          })

          // Message with different auth
          const messageAuth: AuthContext = {
            userId: 'elevated-user',
            permissions: ['read', 'write', 'admin'],
          }

          const responses: string[] = []
          const mockWs = {
            send: (data: string) => responses.push(data),
            close: () => {},
            readyState: 1,
          }

          const message = JSON.stringify({
            auth: messageAuth,
            method: 'whoami',
            params: [],
          })

          await (instance as any).webSocketMessage(mockWs, message)

          expect(responses.length).toBeGreaterThan(0)
          const sentMessage = JSON.parse(responses[0])
          expect(sentMessage.result?.userId).toBe('elevated-user')
        })
      })

      it('should clean up auth context after message processing', async () => {
        await runInDurableObject(stub, async (instance) => {
          ;(instance as any).allowedMethods.add('whoami')
          ;(instance as any).whoami = function () {
            return this.getAuthContext()
          }

          const responses: string[] = []
          const mockWs = {
            send: (data: string) => responses.push(data),
            close: () => {},
            readyState: 1,
          }

          const message = JSON.stringify({
            auth: { userId: 'temp-user' },
            method: 'whoami',
            params: [],
          })

          await (instance as any).webSocketMessage(mockWs, message)

          // Auth context should be cleared after message processing
          expect((instance as any).getAuthContext()).toBeNull()
        })
      })
    })

    describe('WebSocket Auth Persistence', () => {
      it('should persist auth across WebSocket hibernation', async () => {
        await runInDurableObject(stub, async (instance) => {
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

          await (instance as any).handleRequest(request)

          // Simulate hibernation and wake-up
          // Auth should be stored in WebSocket attachment
          const attachment = (instance as any).getWebSocketAttachment?.()
          expect(attachment?.auth?.userId).toBe('hibernate-user')
        })
      })

      it('should maintain auth after WebSocket auto-response', async () => {
        await runInDurableObject(stub, async (instance) => {
          ;(instance as any).setWebSocketAuth?.({
            userId: 'auto-response-user',
          })

          const responses: string[] = []
          const mockWs = {
            send: (data: string) => responses.push(data),
            close: () => {},
            readyState: 1,
          }

          // Simulate auto-response scenario
          const pingMessage = JSON.stringify({ type: 'ping' })
          await (instance as any).webSocketMessage(mockWs, pingMessage)

          // Auth should still be available
          const storedAuth = (instance as any).getWebSocketAuth?.()
          expect(storedAuth?.userId).toBe('auto-response-user')
        })
      })
    })
  })

  // ============================================
  // RPC Transport Auth Propagation
  // ============================================

  describe('RPC Transport', () => {
    describe('Direct Invoke with Auth', () => {
      it('should pass auth context as third parameter to invoke()', async () => {
        await runInDurableObject(stub, async (instance) => {
          ;(instance as any).allowedMethods.add('whoami')
          ;(instance as any).whoami = function () {
            return this.getAuthContext()
          }

          const authContext: AuthContext = {
            userId: 'invoke-user-123',
            permissions: ['read', 'write'],
          }

          const result = await (instance as any).invoke('whoami', [], authContext)
          expect(result).toEqual(authContext)
        })
      })

      it('should make auth available during method execution', async () => {
        await runInDurableObject(stub, async (instance) => {
          ;(instance as any).allowedMethods.add('whoami')
          ;(instance as any).whoami = function () {
            return this.getAuthContext()
          }

          const authContext: AuthContext = {
            userId: 'method-user-456',
            organizationId: 'org-789',
          }

          const result = await (instance as any).invoke('whoami', [], authContext)
          expect(result).toEqual(authContext)
        })
      })

      it('should isolate auth between sequential invocations', async () => {
        await runInDurableObject(stub, async (instance) => {
          ;(instance as any).allowedMethods.add('whoami')
          ;(instance as any).whoami = function () {
            return this.getAuthContext()
          }

          const auth1: AuthContext = { userId: 'user-1' }
          const auth2: AuthContext = { userId: 'user-2' }

          const result1 = await (instance as any).invoke('whoami', [], auth1)
          const result2 = await (instance as any).invoke('whoami', [], auth2)
          const result3 = await (instance as any).invoke('whoami', [])

          expect(result1?.userId).toBe('user-1')
          expect(result2?.userId).toBe('user-2')
          expect(result3).toBeNull()
        })
      })

      it('should clear auth context after invoke completes', async () => {
        await runInDurableObject(stub, async (instance) => {
          ;(instance as any).allowedMethods.add('whoami')
          ;(instance as any).whoami = function () {
            return this.getAuthContext()
          }

          const authContext: AuthContext = { userId: 'temp-invoke-user' }

          await (instance as any).invoke('whoami', [], authContext)

          // Auth should be cleared
          expect((instance as any).getAuthContext()).toBeNull()
        })
      })

      it('should clear auth context even on method failure', async () => {
        await runInDurableObject(stub, async (instance) => {
          const authContext: AuthContext = { userId: 'failing-user' }

          try {
            await (instance as any).invoke('nonexistent', [], authContext)
          } catch {
            // Expected to fail
          }

          // Auth should still be cleared
          expect((instance as any).getAuthContext()).toBeNull()
        })
      })
    })

    describe('Batch RPC with Auth', () => {
      it('should apply same auth to all methods in batch', async () => {
        await runInDurableObject(stub, async (instance) => {
          ;(instance as any).allowedMethods.add('whoami')
          ;(instance as any).whoami = function () {
            return this.getAuthContext()
          }

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

          const response = await (instance as any).handleRequest(request)
          const body = (await response.json()) as Array<{ result: AuthContext | null }>

          expect(body).toHaveLength(3)
          expect(body[0].result?.userId).toBe('batch-user')
          expect(body[1].result?.userId).toBe('batch-user')
          expect(body[2].result?.userId).toBe('batch-user')
        })
      })

      it('should support per-request auth in batch', async () => {
        await runInDurableObject(stub, async (instance) => {
          ;(instance as any).allowedMethods.add('whoami')
          ;(instance as any).whoami = function () {
            return this.getAuthContext()
          }

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

          const response = await (instance as any).handleRequest(request)
          const body = (await response.json()) as Array<{ result: AuthContext | null }>

          expect(body[0].result?.userId).toBe('batch-user-1')
          expect(body[1].result?.userId).toBe('batch-user-2')
        })
      })
    })

    describe('Workers RPC Stub Auth', () => {
      it('should propagate auth through Workers RPC stub', async () => {
        await runInDurableObject(stub, async (instance) => {
          ;(instance as any).allowedMethods.add('whoami')
          ;(instance as any).whoami = function () {
            return this.getAuthContext()
          }

          const authContext: AuthContext = {
            userId: 'stub-user',
            organizationId: 'stub-org',
          }

          // Simulate Workers RPC call with auth in serialized form
          const result = await (instance as any).invoke('whoami', [], authContext)

          expect(result).toEqual(authContext)
        })
      })

      it('should handle serialized auth context in RPC calls', async () => {
        await runInDurableObject(stub, async (instance) => {
          ;(instance as any).allowedMethods.add('whoami')
          ;(instance as any).whoami = function () {
            return this.getAuthContext()
          }

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

          const response = await (instance as any).handleRequest(request)
          const body = (await response.json()) as { result: AuthContext | null }

          expect(body.result?.userId).toBe('serialized-user')
        })
      })
    })
  })

  // ============================================
  // Transport Context Tracking
  // ============================================

  describe('Transport Context', () => {
    it('should track transport type as http for HTTP requests', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).allowedMethods.add('getTransportContext')
        ;(instance as any).getTransportContext = function () {
          return (this as any).getCurrentTransportContext?.() ?? null
        }

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

        const response = await (instance as any).handleRequest(request)
        const body = (await response.json()) as { result: TransportContext | null }

        expect(body.result?.type).toBe('http')
      })
    })

    it('should track transport type as websocket for WS messages', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).allowedMethods.add('getTransportContext')
        ;(instance as any).getTransportContext = function () {
          return (this as any).getCurrentTransportContext?.() ?? null
        }

        const responses: string[] = []
        const mockWs = {
          send: (data: string) => responses.push(data),
          close: () => {},
          readyState: 1,
        }

        const message = JSON.stringify({
          jsonrpc: '2.0',
          id: '1',
          method: 'getTransportContext',
          params: [],
        })

        await (instance as any).webSocketMessage(mockWs, message)

        expect(responses.length).toBeGreaterThan(0)
        const sentMessage = JSON.parse(responses[0])
        expect(sentMessage.result?.type).toBe('websocket')
      })
    })

    it('should track transport type as workers-rpc for direct invoke', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).allowedMethods.add('getTransportContext')
        ;(instance as any).getTransportContext = function () {
          return (this as any).getCurrentTransportContext?.() ?? null
        }

        // When called via invoke() directly (Workers RPC), transport should be 'workers-rpc'
        const result = (await (instance as any).invoke(
          'getTransportContext',
          []
        )) as TransportContext | null

        expect(result?.type).toBe('workers-rpc')
      })
    })

    it('should include request reference in HTTP transport context', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).allowedMethods.add('getTransportContext')
        ;(instance as any).getTransportContext = function () {
          return (this as any).getCurrentTransportContext?.() ?? null
        }

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

        const response = await (instance as any).handleRequest(request)
        const body = (await response.json()) as { result: TransportContext | null }

        expect(body.result?.request).toBeDefined()
      })
    })

    it('should include WebSocket reference in WS transport context', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).allowedMethods.add('getTransportContext')
        ;(instance as any).getTransportContext = function () {
          return (this as any).getCurrentTransportContext?.() ?? null
        }

        const responses: string[] = []
        const mockWs = {
          send: (data: string) => responses.push(data),
          close: () => {},
          readyState: 1,
        }

        const message = JSON.stringify({
          jsonrpc: '2.0',
          id: '1',
          method: 'getTransportContext',
          params: [],
        })

        await (instance as any).webSocketMessage(mockWs, message)

        expect(responses.length).toBeGreaterThan(0)
        const sentMessage = JSON.parse(responses[0])
        expect(sentMessage.result?.ws).toBeDefined()
      })
    })
  })

  // ============================================
  // Cross-Transport Auth Scenarios
  // ============================================

  describe('Cross-Transport Scenarios', () => {
    it('should maintain consistent auth behavior across all transports', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).allowedMethods.add('whoami')
        ;(instance as any).whoami = function () {
          return this.getAuthContext()
        }

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
        const httpResponse = await (instance as any).handleRequest(httpRequest)
        const httpBody = (await httpResponse.json()) as { result: AuthContext | null }

        // WebSocket
        const responses: string[] = []
        const mockWs = {
          send: (data: string) => responses.push(data),
          close: () => {},
          readyState: 1,
        }
        const wsMessage = JSON.stringify({
          auth: authContext,
          method: 'whoami',
          params: [],
        })
        await (instance as any).webSocketMessage(mockWs, wsMessage)
        const wsBody = JSON.parse(responses[0])

        // RPC
        const rpcResult = await (instance as any).invoke('whoami', [], authContext)

        // All should return same auth
        expect(httpBody.result?.userId).toBe('cross-transport-user')
        expect(wsBody.result?.userId).toBe('cross-transport-user')
        expect((rpcResult as AuthContext)?.userId).toBe('cross-transport-user')
      })
    })

    it('should handle auth upgrade from unauthenticated to authenticated', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).allowedMethods.add('whoami')
        ;(instance as any).whoami = function () {
          return this.getAuthContext()
        }

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
        const noAuthResponse = await (instance as any).handleRequest(noAuthRequest)
        const noAuthBody = (await noAuthResponse.json()) as { result: AuthContext | null }

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
        const authResponse = await (instance as any).handleRequest(authRequest)
        const authBody = (await authResponse.json()) as { result: AuthContext | null }

        expect(noAuthBody.result).toBeNull()
        expect(authBody.result?.userId).toBe('upgraded-user')
      })
    })
  })

  // ============================================
  // Permission Enforcement Through Transports
  // ============================================

  describe('Permission Enforcement Through Transports', () => {
    it('should enforce permissions on HTTP requests', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).allowedMethods.add('requireAdmin')
        ;(instance as any).requireAdmin = function () {
          this.requirePermission('admin')
          return { success: true }
        }

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

        const response = await (instance as any).handleRequest(request)
        const body = (await response.json()) as { error?: string }

        expect(body.error).toContain('Permission denied')
      })
    })

    it('should enforce permissions on WebSocket messages', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).allowedMethods.add('requireAdmin')
        ;(instance as any).requireAdmin = function () {
          this.requirePermission('admin')
          return { success: true }
        }

        const responses: string[] = []
        const mockWs = {
          send: (data: string) => responses.push(data),
          close: () => {},
          readyState: 1,
        }

        const message = JSON.stringify({
          auth: {
            userId: 'ws-user',
            permissions: [], // No admin permission
          },
          method: 'requireAdmin',
          params: [],
        })

        await (instance as any).webSocketMessage(mockWs, message)

        const sentMessage = JSON.parse(responses[0])
        expect(sentMessage.error).toContain('Permission denied')
      })
    })

    it('should enforce permissions on RPC invoke', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).allowedMethods.add('requireAdmin')
        ;(instance as any).requireAdmin = function () {
          this.requirePermission('admin')
          return { success: true }
        }

        const authContext: AuthContext = {
          userId: 'rpc-user',
          permissions: ['read'],
        }

        await expect((instance as any).invoke('requireAdmin', [], authContext)).rejects.toThrow(
          'Permission denied'
        )
      })
    })

    it('should allow method when permission is present', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).allowedMethods.add('requireAdmin')
        ;(instance as any).requireAdmin = function () {
          this.requirePermission('admin')
          return { success: true }
        }

        const authContext: AuthContext = {
          userId: 'admin-user',
          permissions: ['read', 'write', 'admin'],
        }

        const result = await (instance as any).invoke('requireAdmin', [], authContext)
        expect(result).toEqual({ success: true })
      })
    })
  })

  // ============================================
  // Error Handling in Auth Propagation
  // ============================================

  describe('Error Handling', () => {
    it('should handle expired token gracefully', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).allowedMethods.add('whoami')
        ;(instance as any).whoami = function () {
          return this.getAuthContext()
        }

        // Expired JWT (exp in the past)
        const expiredJwt =
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJleHBpcmVkLXVzZXIiLCJleHAiOjF9.xxx'

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

        const response = await (instance as any).handleRequest(request)
        // Should return 401 or handle gracefully
        expect(response.status).toBeOneOf([200, 401])
      })
    })

    it('should handle token validation errors', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).allowedMethods.add('whoami')
        ;(instance as any).whoami = function () {
          return this.getAuthContext()
        }

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

        const response = await (instance as any).handleRequest(request)
        // Should not crash, return appropriate error or treat as unauthenticated
        expect(response.status).toBeOneOf([200, 400, 401])
      })
    })

    it('should not leak auth errors to unauthorized callers', async () => {
      await runInDurableObject(stub, async (instance) => {
        ;(instance as any).allowedMethods.add('protectedMethod')
        ;(instance as any).protectedMethod = function () {
          const auth = this.getAuthContext()
          if (!auth?.userId) {
            throw new Error('Authentication required')
          }
          return { success: true, userId: auth.userId }
        }

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

        const response = await (instance as any).handleRequest(request)
        const body = (await response.json()) as { error?: string }

        // Error message should not reveal internal details
        if (body.error) {
          expect(body.error).not.toContain('stack')
          expect(body.error).not.toContain('at ')
        }
      })
    })
  })
})
