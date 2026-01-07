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

/**
 * @dotdo/do - WebSocket Handler Tests
 *
 * Tests for WebSocket handlers including:
 * - webSocketMessage: JSON-RPC message parsing and method routing
 * - webSocketClose: Connection cleanup and subscriber notification
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { DO } from '../src/do'

// Mock WebSocket class
class MockWebSocket {
  readyState = 1 // WebSocket.OPEN
  sent: string[] = []
  send = vi.fn((data: string) => {
    this.sent.push(data)
  })
  close = vi.fn()
  addEventListener = vi.fn()
  removeEventListener = vi.fn()

  // Custom properties for testing
  _id?: string
  _subscriptions: Set<string> = new Set()
}

// Mock WebSocketPair for Cloudflare Workers compatibility
class MockWebSocketPair {
  0: MockWebSocket
  1: MockWebSocket
  constructor() {
    this[0] = new MockWebSocket()
    this[1] = new MockWebSocket()
  }
}
(globalThis as unknown as { WebSocketPair: typeof MockWebSocketPair }).WebSocketPair = MockWebSocketPair

/**
 * Create a mock context with SQLite storage for WebSocket tests
 */
function createMockCtx() {
  const acceptedWebSockets: WebSocket[] = []

  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    storage: {
      sql: {
        exec: vi.fn().mockReturnValue({ toArray: () => [] })
      }
    },
    acceptWebSocket: vi.fn((ws: WebSocket) => {
      acceptedWebSockets.push(ws)
    }),
    getWebSockets: vi.fn(() => acceptedWebSockets),
    setWebSocketAutoResponse: vi.fn(),
  }
}

/**
 * Create a more complete mock SQL storage for JSON-RPC tests
 */
function createMockSqlStorageFull() {
  const tables: Map<string, Map<string, Record<string, unknown>>> = new Map()

  return {
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
        const tableMatch = query.match(/INSERT.*INTO\s+(\w+)/i)
        const tableName = tableMatch?.[1] || 'documents'
        if (!tables.has(tableName)) {
          tables.set(tableName, new Map())
        }
        const table = tables.get(tableName)!
        if (tableName === 'documents') {
          const [collection, id, data] = params as [string, string, string]
          const key = `${collection}:${id}`
          table.set(key, { collection, id, data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
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
          } else if (query.includes('WHERE collection = ?') && query.includes('LIMIT')) {
            const [collection, limit, offset] = params as [string, number, number]
            const matching: Record<string, unknown>[] = []
            for (const [key, row] of table.entries()) {
              if (key.startsWith(`${collection}:`)) {
                matching.push({ data: row.data })
              }
            }
            const paginated = matching.slice(offset, offset + limit)
            results.push(...paginated)
          } else if (query.includes('WHERE data LIKE')) {
            const [searchPattern, limit] = params as [string, number]
            const pattern = searchPattern.replace(/%/g, '')
            for (const [, row] of table.entries()) {
              if (results.length >= limit) break
              const rowData = row.data as string
              if (rowData.toLowerCase().includes(pattern.toLowerCase())) {
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
        }
      }
    }
  }
}

/**
 * Create a mock context with full SQL storage for message handler tests
 */
function createMockCtxFull() {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    storage: {
      sql: createMockSqlStorageFull()
    },
    acceptWebSocket: vi.fn(),
    setWebSocketAutoResponse: vi.fn(),
  }
}

// Mock environment
const mockEnv = {}

describe('WebSocket Message Handler', () => {
  let doInstance: DO
  let mockWs: MockWebSocket
  let fullMockCtx: ReturnType<typeof createMockCtxFull>

  beforeEach(() => {
    fullMockCtx = createMockCtxFull()
    doInstance = new DO(fullMockCtx as any, mockEnv)
    mockWs = new MockWebSocket()
  })

  describe('JSON-RPC Message Parsing', () => {
    it('should parse valid JSON-RPC message and call correct method', async () => {
      // Create a document first
      await doInstance.create('users', { id: 'test-1', name: 'Test User' })

      // Send JSON-RPC message via WebSocket
      const message = JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        method: 'get',
        params: ['users', 'test-1']
      })

      await doInstance.webSocketMessage(mockWs as any, message)

      // Verify response was sent back
      expect(mockWs.send).toHaveBeenCalled()
      const response = JSON.parse(mockWs.sent[0])
      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe('1')
      expect(response.result).toBeDefined()
      expect(response.result.name).toBe('Test User')
    })

    it('should handle list method via WebSocket', async () => {
      // Create some documents
      await doInstance.create('users', { id: 'user-1', name: 'User 1' })
      await doInstance.create('users', { id: 'user-2', name: 'User 2' })

      const message = JSON.stringify({
        jsonrpc: '2.0',
        id: '2',
        method: 'list',
        params: ['users']
      })

      await doInstance.webSocketMessage(mockWs as any, message)

      expect(mockWs.send).toHaveBeenCalled()
      const response = JSON.parse(mockWs.sent[0])
      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe('2')
      expect(Array.isArray(response.result)).toBe(true)
      expect(response.result.length).toBe(2)
    })

    it('should handle create method via WebSocket', async () => {
      const message = JSON.stringify({
        jsonrpc: '2.0',
        id: '3',
        method: 'create',
        params: ['users', { name: 'New User', email: 'new@example.com' }]
      })

      await doInstance.webSocketMessage(mockWs as any, message)

      expect(mockWs.send).toHaveBeenCalled()
      const response = JSON.parse(mockWs.sent[0])
      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe('3')
      expect(response.result).toBeDefined()
      expect(response.result.name).toBe('New User')
      expect(response.result.id).toBeDefined()
    })

    it('should return error for invalid JSON', async () => {
      const message = 'invalid json {'

      await doInstance.webSocketMessage(mockWs as any, message)

      expect(mockWs.send).toHaveBeenCalled()
      const response = JSON.parse(mockWs.sent[0])
      expect(response.jsonrpc).toBe('2.0')
      expect(response.error).toBeDefined()
      expect(response.error.code).toBe(-32700) // Parse error
    })

    it('should return error for unknown method', async () => {
      const message = JSON.stringify({
        jsonrpc: '2.0',
        id: '4',
        method: 'unknownMethod',
        params: []
      })

      await doInstance.webSocketMessage(mockWs as any, message)

      expect(mockWs.send).toHaveBeenCalled()
      const response = JSON.parse(mockWs.sent[0])
      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe('4')
      expect(response.error).toBeDefined()
      expect(response.error.code).toBe(-32601) // Method not found
    })

    it('should return error for disallowed method', async () => {
      const message = JSON.stringify({
        jsonrpc: '2.0',
        id: '5',
        method: 'constructor',
        params: []
      })

      await doInstance.webSocketMessage(mockWs as any, message)

      expect(mockWs.send).toHaveBeenCalled()
      const response = JSON.parse(mockWs.sent[0])
      expect(response.error).toBeDefined()
      expect(response.error.code).toBe(-32601) // Method not found
    })

    it('should return error for missing method field', async () => {
      const message = JSON.stringify({
        jsonrpc: '2.0',
        id: '6',
        params: ['users']
      })

      await doInstance.webSocketMessage(mockWs as any, message)

      expect(mockWs.send).toHaveBeenCalled()
      const response = JSON.parse(mockWs.sent[0])
      expect(response.error).toBeDefined()
      expect(response.error.code).toBe(-32600) // Invalid Request
    })

    it('should handle ArrayBuffer messages', async () => {
      // Create a document first
      await doInstance.create('items', { id: 'item-1', value: 42 })

      const messageObj = {
        jsonrpc: '2.0',
        id: '7',
        method: 'get',
        params: ['items', 'item-1']
      }
      const messageStr = JSON.stringify(messageObj)
      const encoder = new TextEncoder()
      const arrayBuffer = encoder.encode(messageStr).buffer

      await doInstance.webSocketMessage(mockWs as any, arrayBuffer)

      expect(mockWs.send).toHaveBeenCalled()
      const response = JSON.parse(mockWs.sent[0])
      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe('7')
      expect(response.result).toBeDefined()
      expect(response.result.value).toBe(42)
    })

    it('should handle method that returns null', async () => {
      const message = JSON.stringify({
        jsonrpc: '2.0',
        id: '8',
        method: 'get',
        params: ['nonexistent', 'id-that-does-not-exist']
      })

      await doInstance.webSocketMessage(mockWs as any, message)

      expect(mockWs.send).toHaveBeenCalled()
      const response = JSON.parse(mockWs.sent[0])
      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe('8')
      expect(response.result).toBeNull()
      expect(response.error).toBeUndefined()
    })

    it('should handle search method via WebSocket', async () => {
      await doInstance.create('articles', { id: 'article-1', title: 'Hello World' })

      const message = JSON.stringify({
        jsonrpc: '2.0',
        id: '9',
        method: 'search',
        params: ['Hello']
      })

      await doInstance.webSocketMessage(mockWs as any, message)

      expect(mockWs.send).toHaveBeenCalled()
      const response = JSON.parse(mockWs.sent[0])
      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe('9')
      expect(Array.isArray(response.result)).toBe(true)
    })

    it('should handle notification (no id) without sending response', async () => {
      // JSON-RPC notifications have no id and expect no response
      const message = JSON.stringify({
        jsonrpc: '2.0',
        method: 'create',
        params: ['logs', { message: 'log entry' }]
      })

      await doInstance.webSocketMessage(mockWs as any, message)

      // For notifications, no response should be sent
      expect(mockWs.send).not.toHaveBeenCalled()
    })
  })

  describe('Method Routing', () => {
    it('should route to update method correctly', async () => {
      await doInstance.create('users', { id: 'user-to-update', name: 'Original' })

      const message = JSON.stringify({
        jsonrpc: '2.0',
        id: '10',
        method: 'update',
        params: ['users', 'user-to-update', { name: 'Updated' }]
      })

      await doInstance.webSocketMessage(mockWs as any, message)

      expect(mockWs.send).toHaveBeenCalled()
      const response = JSON.parse(mockWs.sent[0])
      expect(response.result.name).toBe('Updated')
    })

    it('should route to delete method correctly', async () => {
      await doInstance.create('users', { id: 'user-to-delete', name: 'Delete Me' })

      const message = JSON.stringify({
        jsonrpc: '2.0',
        id: '11',
        method: 'delete',
        params: ['users', 'user-to-delete']
      })

      await doInstance.webSocketMessage(mockWs as any, message)

      expect(mockWs.send).toHaveBeenCalled()
      const response = JSON.parse(mockWs.sent[0])
      expect(response.result).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle method execution errors', async () => {
      // Trying to start a non-existent action should throw
      const message = JSON.stringify({
        jsonrpc: '2.0',
        id: '12',
        method: 'startAction',
        params: ['non-existent-action-id']
      })

      await doInstance.webSocketMessage(mockWs as any, message)

      expect(mockWs.send).toHaveBeenCalled()
      const response = JSON.parse(mockWs.sent[0])
      expect(response.error).toBeDefined()
      expect(response.error.code).toBe(-32000) // Server error
      expect(response.error.message).toBeDefined()
    })
  })
})

describe('WebSocket Close Handler', () => {
  describe('webSocketClose - Connection Cleanup', () => {
    let doInstance: DO
    let mockCtx: ReturnType<typeof createMockCtx>

    beforeEach(() => {
      mockCtx = createMockCtx()
      doInstance = new DO(mockCtx as any, mockEnv)
    })

    it('should have webSocketClose method', () => {
      expect(doInstance.webSocketClose).toBeDefined()
      expect(typeof doInstance.webSocketClose).toBe('function')
    })

    it('should accept close event parameters', async () => {
      const ws = new MockWebSocket() as unknown as WebSocket

      // Should not throw when called with valid parameters
      await doInstance.webSocketClose(ws, 1000, 'Normal closure', true)
      // Test passes if no error is thrown
    })

    it('should remove connection from tracking map on close', async () => {
      const ws = new MockWebSocket() as unknown as WebSocket

      // First, simulate adding a connection (when webSocketOpen is called)
      // Access internal connections map if exposed, or test via behavior
      const doAny = doInstance as any

      // If there's a connections map, add the websocket
      if (!doAny.connections) {
        doAny.connections = new Map()
      }
      doAny.connections.set(ws, { id: 'test-connection-1', subscriptions: new Set() })

      expect(doAny.connections.has(ws)).toBe(true)

      // Call webSocketClose
      await doInstance.webSocketClose(ws, 1000, 'Normal closure', true)

      // Connection should be removed from tracking map
      expect(doAny.connections.has(ws)).toBe(false)
    })

    it('should clean up subscriptions when connection closes', async () => {
      const ws = new MockWebSocket() as unknown as WebSocket
      const doAny = doInstance as any

      // Setup: Create connections and subscribers maps
      if (!doAny.connections) {
        doAny.connections = new Map()
      }
      if (!doAny.subscribers) {
        doAny.subscribers = new Map()
      }

      // Add connection with subscriptions
      const subscriptions = new Set(['topic:users', 'topic:messages'])
      doAny.connections.set(ws, {
        id: 'test-connection-2',
        subscriptions
      })

      // Add to subscribers map
      doAny.subscribers.set('topic:users', new Set([ws]))
      doAny.subscribers.set('topic:messages', new Set([ws]))

      // Call webSocketClose
      await doInstance.webSocketClose(ws, 1000, 'Normal closure', true)

      // Connection should be removed from all subscription topics
      const usersSubscribers = doAny.subscribers.get('topic:users')
      const messagesSubscribers = doAny.subscribers.get('topic:messages')

      expect(usersSubscribers?.has(ws) ?? false).toBe(false)
      expect(messagesSubscribers?.has(ws) ?? false).toBe(false)
    })

    it('should handle close without error when connection not in tracking map', async () => {
      const ws = new MockWebSocket() as unknown as WebSocket

      // Should not throw even if connection wasn't tracked
      await doInstance.webSocketClose(ws, 1000, 'Normal closure', true)
      // Test passes if no error is thrown
    })

    it('should handle abnormal close codes', async () => {
      const ws = new MockWebSocket() as unknown as WebSocket

      // Various abnormal close codes should be handled gracefully
      await doInstance.webSocketClose(ws, 1006, 'Abnormal closure', false)
      await doInstance.webSocketClose(ws, 1001, 'Going away', false)
      // Test passes if no error is thrown
    })
  })

  describe('webSocketClose - Subscriber Notification', () => {
    let doInstance: DO
    let mockCtx: ReturnType<typeof createMockCtx>

    beforeEach(() => {
      mockCtx = createMockCtx()
      doInstance = new DO(mockCtx as any, mockEnv)
    })

    it('should notify other subscribers when a connection disconnects', async () => {
      const ws1 = new MockWebSocket() as unknown as WebSocket
      const ws2 = new MockWebSocket()
      const doAny = doInstance as any

      // Setup connections and subscribers
      if (!doAny.connections) {
        doAny.connections = new Map()
      }
      if (!doAny.subscribers) {
        doAny.subscribers = new Map()
      }

      // Both connections subscribed to same topic
      const topic = 'presence:room1'
      doAny.connections.set(ws1, {
        id: 'user-1',
        subscriptions: new Set([topic])
      })
      doAny.connections.set(ws2, {
        id: 'user-2',
        subscriptions: new Set([topic])
      })

      doAny.subscribers.set(topic, new Set([ws1, ws2]))

      // Disconnect ws1
      await doInstance.webSocketClose(ws1, 1000, 'Normal closure', true)

      // ws2 should have been notified of the disconnect
      expect(ws2.send).toHaveBeenCalled()

      // The notification should contain disconnect info
      const callArg = ws2.send.mock.calls[0][0]
      const notification = JSON.parse(callArg)
      expect(notification.type).toBe('disconnect')
      expect(notification.connectionId).toBe('user-1')
    })

    it('should not notify the disconnecting connection', async () => {
      const ws = new MockWebSocket() as unknown as WebSocket
      const doAny = doInstance as any

      if (!doAny.connections) {
        doAny.connections = new Map()
      }
      if (!doAny.subscribers) {
        doAny.subscribers = new Map()
      }

      const topic = 'presence:room1'
      doAny.connections.set(ws, {
        id: 'user-1',
        subscriptions: new Set([topic])
      })
      doAny.subscribers.set(topic, new Set([ws]))

      await doInstance.webSocketClose(ws, 1000, 'Normal closure', true)

      // The closing connection should NOT receive any messages
      expect((ws as unknown as MockWebSocket).send).not.toHaveBeenCalled()
    })

    it('should handle notification errors gracefully', async () => {
      const ws1 = new MockWebSocket() as unknown as WebSocket
      const ws2 = new MockWebSocket()
      const doAny = doInstance as any

      // Make ws2.send throw an error
      ws2.send.mockImplementation(() => {
        throw new Error('Connection already closed')
      })

      if (!doAny.connections) {
        doAny.connections = new Map()
      }
      if (!doAny.subscribers) {
        doAny.subscribers = new Map()
      }

      const topic = 'presence:room1'
      doAny.connections.set(ws1, {
        id: 'user-1',
        subscriptions: new Set([topic])
      })
      doAny.connections.set(ws2, {
        id: 'user-2',
        subscriptions: new Set([topic])
      })
      doAny.subscribers.set(topic, new Set([ws1, ws2]))

      // Should not throw even if notification fails
      await doInstance.webSocketClose(ws1, 1000, 'Normal closure', true)
      // Test passes if no error is thrown
    })

    it('should clean up empty subscriber sets after last connection leaves', async () => {
      const ws = new MockWebSocket() as unknown as WebSocket
      const doAny = doInstance as any

      if (!doAny.connections) {
        doAny.connections = new Map()
      }
      if (!doAny.subscribers) {
        doAny.subscribers = new Map()
      }

      const topic = 'presence:room1'
      doAny.connections.set(ws, {
        id: 'user-1',
        subscriptions: new Set([topic])
      })
      doAny.subscribers.set(topic, new Set([ws]))

      await doInstance.webSocketClose(ws, 1000, 'Normal closure', true)

      // The topic should be cleaned up when no subscribers remain
      expect(doAny.subscribers.has(topic)).toBe(false)
    })
  })

  describe('webSocketClose - Close Code Handling', () => {
    let doInstance: DO
    let mockCtx: ReturnType<typeof createMockCtx>

    beforeEach(() => {
      mockCtx = createMockCtx()
      doInstance = new DO(mockCtx as any, mockEnv)
    })

    it('should handle normal closure (1000)', async () => {
      const ws = new MockWebSocket() as unknown as WebSocket
      await doInstance.webSocketClose(ws, 1000, 'Normal closure', true)
      // Should complete without error
    })

    it('should handle going away (1001)', async () => {
      const ws = new MockWebSocket() as unknown as WebSocket
      await doInstance.webSocketClose(ws, 1001, 'Going away', false)
      // Should complete without error
    })

    it('should handle protocol error (1002)', async () => {
      const ws = new MockWebSocket() as unknown as WebSocket
      await doInstance.webSocketClose(ws, 1002, 'Protocol error', false)
      // Should complete without error
    })

    it('should handle abnormal closure (1006)', async () => {
      const ws = new MockWebSocket() as unknown as WebSocket
      await doInstance.webSocketClose(ws, 1006, '', false)
      // Should complete without error - 1006 indicates network issue
    })
  })
})
