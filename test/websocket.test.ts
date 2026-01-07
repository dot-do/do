/**
 * @dotdo/do - WebSocket Handler Tests (GREEN Phase)
 *
 * Tests for WebSocket handlers including:
 * - webSocketMessage: JSON-RPC message parsing and method routing
 * - webSocketClose: Connection cleanup and subscriber notification
 *
 * Uses the @cloudflare/vitest-pool-workers integration with real Miniflare-powered SQLite storage.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { env, runInDurableObject } from 'cloudflare:test'
import type { DurableObjectStub } from '@cloudflare/workers-types'
import { createTestStub, uniqueTestName } from './helpers/do-test-utils'

// Type for DO stub with RPC methods
interface DOStub extends DurableObjectStub {
  get<T = Record<string, unknown>>(collection: string, id: string): Promise<T | null>
  list<T = Record<string, unknown>>(collection: string, options?: { limit?: number; offset?: number }): Promise<T[]>
  create(collection: string, doc: Record<string, unknown>): Promise<Record<string, unknown>>
  update(collection: string, id: string, updates: Record<string, unknown>): Promise<Record<string, unknown> | null>
  delete(collection: string, id: string): Promise<boolean>
  search(query: string, options?: { limit?: number }): Promise<Array<{ score: number; [key: string]: unknown }>>
}

describe('WebSocket Message Handler', () => {
  let stub: DOStub

  beforeEach(() => {
    const name = uniqueTestName('ws-message')
    stub = createTestStub(name) as DOStub
  })

  describe('JSON-RPC Message Parsing', () => {
    it('should parse valid JSON-RPC message and call correct method', async () => {
      // Create a document first via RPC
      await stub.create('users', { id: 'test-1', name: 'Test User' })

      await runInDurableObject(stub, async (instance) => {
        // Create a mock WebSocket to capture responses
        const sent: string[] = []
        const mockWs = {
          readyState: 1,
          send: (data: string) => { sent.push(data) },
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        // Send JSON-RPC message via WebSocket
        const message = JSON.stringify({
          jsonrpc: '2.0',
          id: '1',
          method: 'get',
          params: ['users', 'test-1']
        })

        await (instance as any).webSocketMessage(mockWs, message)

        // Verify response was sent back
        expect(sent.length).toBeGreaterThan(0)
        const response = JSON.parse(sent[0])
        expect(response.jsonrpc).toBe('2.0')
        expect(response.id).toBe('1')
        expect(response.result).toBeDefined()
        expect(response.result.name).toBe('Test User')
      })
    })

    it('should handle list method via WebSocket', async () => {
      // Create some documents
      await stub.create('users', { id: 'user-1', name: 'User 1' })
      await stub.create('users', { id: 'user-2', name: 'User 2' })

      await runInDurableObject(stub, async (instance) => {
        const sent: string[] = []
        const mockWs = {
          readyState: 1,
          send: (data: string) => { sent.push(data) },
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        const message = JSON.stringify({
          jsonrpc: '2.0',
          id: '2',
          method: 'list',
          params: ['users']
        })

        await (instance as any).webSocketMessage(mockWs, message)

        expect(sent.length).toBeGreaterThan(0)
        const response = JSON.parse(sent[0])
        expect(response.jsonrpc).toBe('2.0')
        expect(response.id).toBe('2')
        expect(Array.isArray(response.result)).toBe(true)
        expect(response.result.length).toBe(2)
      })
    })

    it('should handle create method via WebSocket', async () => {
      await runInDurableObject(stub, async (instance) => {
        const sent: string[] = []
        const mockWs = {
          readyState: 1,
          send: (data: string) => { sent.push(data) },
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        const message = JSON.stringify({
          jsonrpc: '2.0',
          id: '3',
          method: 'create',
          params: ['users', { name: 'New User', email: 'new@example.com' }]
        })

        await (instance as any).webSocketMessage(mockWs, message)

        expect(sent.length).toBeGreaterThan(0)
        const response = JSON.parse(sent[0])
        expect(response.jsonrpc).toBe('2.0')
        expect(response.id).toBe('3')
        expect(response.result).toBeDefined()
        expect(response.result.name).toBe('New User')
        expect(response.result.id).toBeDefined()
      })
    })

    it('should return error for invalid JSON', async () => {
      await runInDurableObject(stub, async (instance) => {
        const sent: string[] = []
        const mockWs = {
          readyState: 1,
          send: (data: string) => { sent.push(data) },
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        const message = 'invalid json {'

        await (instance as any).webSocketMessage(mockWs, message)

        expect(sent.length).toBeGreaterThan(0)
        const response = JSON.parse(sent[0])
        expect(response.jsonrpc).toBe('2.0')
        expect(response.error).toBeDefined()
        expect(response.error.code).toBe(-32700) // Parse error
      })
    })

    it('should return error for unknown method', async () => {
      await runInDurableObject(stub, async (instance) => {
        const sent: string[] = []
        const mockWs = {
          readyState: 1,
          send: (data: string) => { sent.push(data) },
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        const message = JSON.stringify({
          jsonrpc: '2.0',
          id: '4',
          method: 'unknownMethod',
          params: []
        })

        await (instance as any).webSocketMessage(mockWs, message)

        expect(sent.length).toBeGreaterThan(0)
        const response = JSON.parse(sent[0])
        expect(response.jsonrpc).toBe('2.0')
        expect(response.id).toBe('4')
        expect(response.error).toBeDefined()
        expect(response.error.code).toBe(-32601) // Method not found
      })
    })

    it('should return error for disallowed method', async () => {
      await runInDurableObject(stub, async (instance) => {
        const sent: string[] = []
        const mockWs = {
          readyState: 1,
          send: (data: string) => { sent.push(data) },
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        const message = JSON.stringify({
          jsonrpc: '2.0',
          id: '5',
          method: 'constructor',
          params: []
        })

        await (instance as any).webSocketMessage(mockWs, message)

        expect(sent.length).toBeGreaterThan(0)
        const response = JSON.parse(sent[0])
        expect(response.error).toBeDefined()
        expect(response.error.code).toBe(-32601) // Method not found
      })
    })

    it('should return error for missing method field', async () => {
      await runInDurableObject(stub, async (instance) => {
        const sent: string[] = []
        const mockWs = {
          readyState: 1,
          send: (data: string) => { sent.push(data) },
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        const message = JSON.stringify({
          jsonrpc: '2.0',
          id: '6',
          params: ['users']
        })

        await (instance as any).webSocketMessage(mockWs, message)

        expect(sent.length).toBeGreaterThan(0)
        const response = JSON.parse(sent[0])
        expect(response.error).toBeDefined()
        expect(response.error.code).toBe(-32600) // Invalid Request
      })
    })

    it('should handle ArrayBuffer messages', async () => {
      // Create a document first
      await stub.create('items', { id: 'item-1', value: 42 })

      await runInDurableObject(stub, async (instance) => {
        const sent: string[] = []
        const mockWs = {
          readyState: 1,
          send: (data: string) => { sent.push(data) },
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        const messageObj = {
          jsonrpc: '2.0',
          id: '7',
          method: 'get',
          params: ['items', 'item-1']
        }
        const messageStr = JSON.stringify(messageObj)
        const encoder = new TextEncoder()
        const arrayBuffer = encoder.encode(messageStr).buffer

        await (instance as any).webSocketMessage(mockWs, arrayBuffer)

        expect(sent.length).toBeGreaterThan(0)
        const response = JSON.parse(sent[0])
        expect(response.jsonrpc).toBe('2.0')
        expect(response.id).toBe('7')
        expect(response.result).toBeDefined()
        expect(response.result.value).toBe(42)
      })
    })

    it('should handle method that returns null', async () => {
      await runInDurableObject(stub, async (instance) => {
        const sent: string[] = []
        const mockWs = {
          readyState: 1,
          send: (data: string) => { sent.push(data) },
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        const message = JSON.stringify({
          jsonrpc: '2.0',
          id: '8',
          method: 'get',
          params: ['nonexistent', 'id-that-does-not-exist']
        })

        await (instance as any).webSocketMessage(mockWs, message)

        expect(sent.length).toBeGreaterThan(0)
        const response = JSON.parse(sent[0])
        expect(response.jsonrpc).toBe('2.0')
        expect(response.id).toBe('8')
        expect(response.result).toBeNull()
        expect(response.error).toBeUndefined()
      })
    })

    it('should handle search method via WebSocket', async () => {
      await stub.create('articles', { id: 'article-1', title: 'Hello World' })

      await runInDurableObject(stub, async (instance) => {
        const sent: string[] = []
        const mockWs = {
          readyState: 1,
          send: (data: string) => { sent.push(data) },
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        const message = JSON.stringify({
          jsonrpc: '2.0',
          id: '9',
          method: 'search',
          params: ['Hello']
        })

        await (instance as any).webSocketMessage(mockWs, message)

        expect(sent.length).toBeGreaterThan(0)
        const response = JSON.parse(sent[0])
        expect(response.jsonrpc).toBe('2.0')
        expect(response.id).toBe('9')
        expect(Array.isArray(response.result)).toBe(true)
      })
    })

    it('should handle notification (no id) without sending response', async () => {
      await runInDurableObject(stub, async (instance) => {
        const sent: string[] = []
        const mockWs = {
          readyState: 1,
          send: (data: string) => { sent.push(data) },
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        // JSON-RPC notifications have no id and expect no response
        const message = JSON.stringify({
          jsonrpc: '2.0',
          method: 'create',
          params: ['logs', { message: 'log entry' }]
        })

        await (instance as any).webSocketMessage(mockWs, message)

        // For notifications, no response should be sent
        expect(sent.length).toBe(0)
      })
    })
  })

  describe('Method Routing', () => {
    it('should route to update method correctly', async () => {
      await stub.create('users', { id: 'user-to-update', name: 'Original' })

      await runInDurableObject(stub, async (instance) => {
        const sent: string[] = []
        const mockWs = {
          readyState: 1,
          send: (data: string) => { sent.push(data) },
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        const message = JSON.stringify({
          jsonrpc: '2.0',
          id: '10',
          method: 'update',
          params: ['users', 'user-to-update', { name: 'Updated' }]
        })

        await (instance as any).webSocketMessage(mockWs, message)

        expect(sent.length).toBeGreaterThan(0)
        const response = JSON.parse(sent[0])
        expect(response.result.name).toBe('Updated')
      })
    })

    it('should route to delete method correctly', async () => {
      await stub.create('users', { id: 'user-to-delete', name: 'Delete Me' })

      await runInDurableObject(stub, async (instance) => {
        const sent: string[] = []
        const mockWs = {
          readyState: 1,
          send: (data: string) => { sent.push(data) },
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        const message = JSON.stringify({
          jsonrpc: '2.0',
          id: '11',
          method: 'delete',
          params: ['users', 'user-to-delete']
        })

        await (instance as any).webSocketMessage(mockWs, message)

        expect(sent.length).toBeGreaterThan(0)
        const response = JSON.parse(sent[0])
        expect(response.result).toBe(true)
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle method execution errors', async () => {
      await runInDurableObject(stub, async (instance) => {
        const sent: string[] = []
        const mockWs = {
          readyState: 1,
          send: (data: string) => { sent.push(data) },
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        // Trying to start a non-existent action should throw
        const message = JSON.stringify({
          jsonrpc: '2.0',
          id: '12',
          method: 'startAction',
          params: ['non-existent-action-id']
        })

        await (instance as any).webSocketMessage(mockWs, message)

        expect(sent.length).toBeGreaterThan(0)
        const response = JSON.parse(sent[0])
        expect(response.error).toBeDefined()
        expect(response.error.code).toBe(-32000) // Server error
        expect(response.error.message).toBeDefined()
      })
    })
  })
})

describe('WebSocket Close Handler', () => {
  let stub: DOStub

  beforeEach(() => {
    const name = uniqueTestName('ws-close')
    stub = createTestStub(name) as DOStub
  })

  describe('webSocketClose - Connection Cleanup', () => {
    it('should have webSocketClose method', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).webSocketClose).toBeDefined()
        expect(typeof (instance as any).webSocketClose).toBe('function')
      })
    })

    it('should accept close event parameters', async () => {
      await runInDurableObject(stub, async (instance) => {
        const mockWs = {
          readyState: 1,
          send: () => {},
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        // Should not throw when called with valid parameters
        await (instance as any).webSocketClose(mockWs, 1000, 'Normal closure', true)
        // Test passes if no error is thrown
      })
    })

    it('should remove connection from tracking map on close', async () => {
      await runInDurableObject(stub, async (instance) => {
        const mockWs = {
          readyState: 1,
          send: () => {},
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        const doAny = instance as any

        // If there's a connections map, add the websocket
        if (!doAny.connections) {
          doAny.connections = new Map()
        }
        doAny.connections.set(mockWs, { id: 'test-connection-1', subscriptions: new Set() })

        expect(doAny.connections.has(mockWs)).toBe(true)

        // Call webSocketClose
        await doAny.webSocketClose(mockWs, 1000, 'Normal closure', true)

        // Connection should be removed from tracking map
        expect(doAny.connections.has(mockWs)).toBe(false)
      })
    })

    it('should clean up subscriptions when connection closes', async () => {
      await runInDurableObject(stub, async (instance) => {
        const mockWs = {
          readyState: 1,
          send: () => {},
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        const doAny = instance as any

        // Setup: Create connections and subscribers maps
        if (!doAny.connections) {
          doAny.connections = new Map()
        }
        if (!doAny.subscribers) {
          doAny.subscribers = new Map()
        }

        // Add connection with subscriptions
        const subscriptions = new Set(['topic:users', 'topic:messages'])
        doAny.connections.set(mockWs, {
          id: 'test-connection-2',
          subscriptions
        })

        // Add to subscribers map
        doAny.subscribers.set('topic:users', new Set([mockWs]))
        doAny.subscribers.set('topic:messages', new Set([mockWs]))

        // Call webSocketClose
        await doAny.webSocketClose(mockWs, 1000, 'Normal closure', true)

        // Connection should be removed from all subscription topics
        const usersSubscribers = doAny.subscribers.get('topic:users')
        const messagesSubscribers = doAny.subscribers.get('topic:messages')

        expect(usersSubscribers?.has(mockWs) ?? false).toBe(false)
        expect(messagesSubscribers?.has(mockWs) ?? false).toBe(false)
      })
    })

    it('should handle close without error when connection not in tracking map', async () => {
      await runInDurableObject(stub, async (instance) => {
        const mockWs = {
          readyState: 1,
          send: () => {},
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        // Should not throw even if connection wasn't tracked
        await (instance as any).webSocketClose(mockWs, 1000, 'Normal closure', true)
        // Test passes if no error is thrown
      })
    })

    it('should handle abnormal close codes', async () => {
      await runInDurableObject(stub, async (instance) => {
        const mockWs = {
          readyState: 1,
          send: () => {},
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        // Various abnormal close codes should be handled gracefully
        await (instance as any).webSocketClose(mockWs, 1006, 'Abnormal closure', false)
        await (instance as any).webSocketClose(mockWs, 1001, 'Going away', false)
        // Test passes if no error is thrown
      })
    })
  })

  describe('webSocketClose - Subscriber Notification', () => {
    it('should notify other subscribers when a connection disconnects', async () => {
      await runInDurableObject(stub, async (instance) => {
        const sent1: string[] = []
        const sent2: string[] = []

        const mockWs1 = {
          readyState: 1,
          send: () => {},
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        const mockWs2 = {
          readyState: 1,
          send: (data: string) => { sent2.push(data) },
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        const doAny = instance as any

        // Setup connections and subscribers
        if (!doAny.connections) {
          doAny.connections = new Map()
        }
        if (!doAny.subscribers) {
          doAny.subscribers = new Map()
        }

        // Both connections subscribed to same topic
        const topic = 'presence:room1'
        doAny.connections.set(mockWs1, {
          id: 'user-1',
          subscriptions: new Set([topic])
        })
        doAny.connections.set(mockWs2, {
          id: 'user-2',
          subscriptions: new Set([topic])
        })

        doAny.subscribers.set(topic, new Set([mockWs1, mockWs2]))

        // Disconnect ws1
        await doAny.webSocketClose(mockWs1, 1000, 'Normal closure', true)

        // ws2 should have been notified of the disconnect
        expect(sent2.length).toBeGreaterThan(0)

        // The notification should contain disconnect info
        const notification = JSON.parse(sent2[0])
        expect(notification.type).toBe('disconnect')
        expect(notification.connectionId).toBe('user-1')
      })
    })

    it('should not notify the disconnecting connection', async () => {
      await runInDurableObject(stub, async (instance) => {
        const sent: string[] = []

        const mockWs = {
          readyState: 1,
          send: (data: string) => { sent.push(data) },
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        const doAny = instance as any

        if (!doAny.connections) {
          doAny.connections = new Map()
        }
        if (!doAny.subscribers) {
          doAny.subscribers = new Map()
        }

        const topic = 'presence:room1'
        doAny.connections.set(mockWs, {
          id: 'user-1',
          subscriptions: new Set([topic])
        })
        doAny.subscribers.set(topic, new Set([mockWs]))

        await doAny.webSocketClose(mockWs, 1000, 'Normal closure', true)

        // The closing connection should NOT receive any messages
        expect(sent.length).toBe(0)
      })
    })

    it('should handle notification errors gracefully', async () => {
      await runInDurableObject(stub, async (instance) => {
        const mockWs1 = {
          readyState: 1,
          send: () => {},
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        const mockWs2 = {
          readyState: 1,
          send: () => { throw new Error('Connection already closed') },
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        const doAny = instance as any

        if (!doAny.connections) {
          doAny.connections = new Map()
        }
        if (!doAny.subscribers) {
          doAny.subscribers = new Map()
        }

        const topic = 'presence:room1'
        doAny.connections.set(mockWs1, {
          id: 'user-1',
          subscriptions: new Set([topic])
        })
        doAny.connections.set(mockWs2, {
          id: 'user-2',
          subscriptions: new Set([topic])
        })
        doAny.subscribers.set(topic, new Set([mockWs1, mockWs2]))

        // Should not throw even if notification fails
        await doAny.webSocketClose(mockWs1, 1000, 'Normal closure', true)
        // Test passes if no error is thrown
      })
    })

    it('should clean up empty subscriber sets after last connection leaves', async () => {
      await runInDurableObject(stub, async (instance) => {
        const mockWs = {
          readyState: 1,
          send: () => {},
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }

        const doAny = instance as any

        if (!doAny.connections) {
          doAny.connections = new Map()
        }
        if (!doAny.subscribers) {
          doAny.subscribers = new Map()
        }

        const topic = 'presence:room1'
        doAny.connections.set(mockWs, {
          id: 'user-1',
          subscriptions: new Set([topic])
        })
        doAny.subscribers.set(topic, new Set([mockWs]))

        await doAny.webSocketClose(mockWs, 1000, 'Normal closure', true)

        // The topic should be cleaned up when no subscribers remain
        expect(doAny.subscribers.has(topic)).toBe(false)
      })
    })
  })

  describe('webSocketClose - Close Code Handling', () => {
    it('should handle normal closure (1000)', async () => {
      await runInDurableObject(stub, async (instance) => {
        const mockWs = {
          readyState: 1,
          send: () => {},
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }
        await (instance as any).webSocketClose(mockWs, 1000, 'Normal closure', true)
        // Should complete without error
      })
    })

    it('should handle going away (1001)', async () => {
      await runInDurableObject(stub, async (instance) => {
        const mockWs = {
          readyState: 1,
          send: () => {},
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }
        await (instance as any).webSocketClose(mockWs, 1001, 'Going away', false)
        // Should complete without error
      })
    })

    it('should handle protocol error (1002)', async () => {
      await runInDurableObject(stub, async (instance) => {
        const mockWs = {
          readyState: 1,
          send: () => {},
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }
        await (instance as any).webSocketClose(mockWs, 1002, 'Protocol error', false)
        // Should complete without error
      })
    })

    it('should handle abnormal closure (1006)', async () => {
      await runInDurableObject(stub, async (instance) => {
        const mockWs = {
          readyState: 1,
          send: () => {},
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        }
        await (instance as any).webSocketClose(mockWs, 1006, '', false)
        // Should complete without error - 1006 indicates network issue
      })
    })
  })
})
