/**
 * RPC Client Tests - RED Phase
 *
 * Tests for CapnWeb RPC Client implementation
 * - WebSocket connect/disconnect
 * - HTTP fallback
 * - Auto-reconnection
 * - Method calls
 * - Promise pipelining
 * - Type inference
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type {
  RPCRequest,
  RPCResponse,
  RPCBatchRequest,
  RPCBatchResponse,
  RPCClient,
  DORPCMethods,
  WebSocketState,
} from '../types/rpc'
import type { DigitalObjectIdentity } from '../types/identity'
import type { ListResult } from '../types/collections'

// These imports will fail until implementation exists
import {
  createRPCClient,
  RPCClientImpl,
  RPCClientOptions,
  ConnectionState,
} from './client'

// =============================================================================
// Test Fixtures
// =============================================================================

const mockWebSocket = () => {
  const listeners: Record<string, Function[]> = {}

  return {
    readyState: 1, // OPEN
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn((event: string, handler: Function) => {
      listeners[event] = listeners[event] || []
      listeners[event].push(handler)
    }),
    removeEventListener: vi.fn((event: string, handler: Function) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((h) => h !== handler)
      }
    }),
    // Helper to trigger events in tests
    _trigger: (event: string, data?: any) => {
      listeners[event]?.forEach((handler) => handler(data))
    },
  }
}

// Mock WebSocket class for Node environment
class MockWebSocket {
  static instances: MockWebSocket[] = []
  readyState = 0
  onopen: (() => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: ((error: Error) => void) | null = null

  send = vi.fn()
  close = vi.fn()

  constructor(public url: string) {
    MockWebSocket.instances.push(this)
    // Simulate connection
    setTimeout(() => {
      this.readyState = 1
      this.onopen?.()
    }, 0)
  }

  static reset() {
    MockWebSocket.instances = []
  }
}

// =============================================================================
// WebSocket Connect/Disconnect Tests
// =============================================================================

describe('RPCClient - WebSocket Connect/Disconnect', () => {
  beforeEach(() => {
    MockWebSocket.reset()
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should connect to WebSocket endpoint', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
    })

    await client.connect()

    expect(MockWebSocket.instances).toHaveLength(1)
    expect(MockWebSocket.instances[0].url).toBe('wss://example.com/rpc')
  })

  it('should convert https to wss for WebSocket', async () => {
    const client = createRPCClient({
      url: 'https://api.example.com/v1',
      transport: 'websocket',
    })

    await client.connect()

    expect(MockWebSocket.instances[0].url).toBe('wss://api.example.com/v1/rpc')
  })

  it('should convert http to ws for WebSocket', async () => {
    const client = createRPCClient({
      url: 'http://localhost:8787',
      transport: 'websocket',
    })

    await client.connect()

    expect(MockWebSocket.instances[0].url).toBe('ws://localhost:8787/rpc')
  })

  it('should report connected state after successful connection', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
    })

    await client.connect()

    expect(client.getConnectionState()).toBe('connected')
  })

  it('should disconnect WebSocket connection', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
    })

    await client.connect()
    await client.close()

    expect(MockWebSocket.instances[0].close).toHaveBeenCalled()
    expect(client.getConnectionState()).toBe('disconnected')
  })

  it('should handle connection timeout', async () => {
    vi.useFakeTimers()

    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
      connectionTimeout: 5000,
    })

    // Don't trigger onopen
    const connectPromise = client.connect()

    vi.advanceTimersByTime(6000)

    await expect(connectPromise).rejects.toThrow('Connection timeout')

    vi.useRealTimers()
  })

  it('should handle connection errors', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
    })

    const connectPromise = client.connect()

    // Wait for MockWebSocket to be created
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Trigger error
    MockWebSocket.instances[0].onerror?.(new Error('Connection refused'))

    await expect(connectPromise).rejects.toThrow('Connection refused')
  })

  it('should emit connection state change events', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
    })

    const stateChanges: ConnectionState[] = []
    client.onStateChange((state) => stateChanges.push(state))

    await client.connect()
    await client.close()

    expect(stateChanges).toContain('connecting')
    expect(stateChanges).toContain('connected')
    expect(stateChanges).toContain('disconnected')
  })

  it('should prevent multiple simultaneous connections', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
    })

    await client.connect()

    await expect(client.connect()).rejects.toThrow('Already connected')
  })

  it('should allow reconnection after disconnect', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
    })

    await client.connect()
    await client.close()

    MockWebSocket.reset()

    await client.connect()

    expect(MockWebSocket.instances).toHaveLength(1)
    expect(client.getConnectionState()).toBe('connected')
  })
})

// =============================================================================
// HTTP Fallback Tests
// =============================================================================

describe('RPCClient - HTTP Fallback', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: '1', result: { pong: true } }),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should use HTTP transport when specified', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'http',
    })

    await client.call('do.system.ping')

    expect(fetch).toHaveBeenCalledWith(
      'https://example.com/rpc',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    )
  })

  it('should fallback to HTTP when WebSocket fails', async () => {
    MockWebSocket.reset()
    vi.stubGlobal('WebSocket', MockWebSocket)

    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'auto',
      fallbackToHttp: true,
    })

    // Start connection attempt
    const connectPromise = client.connect()

    // Wait for MockWebSocket
    await new Promise((resolve) => setTimeout(resolve, 0))

    // Simulate WebSocket failure
    MockWebSocket.instances[0].onerror?.(new Error('WebSocket failed'))

    // Should not reject, should fallback to HTTP
    await connectPromise

    expect(client.getTransport()).toBe('http')
  })

  it('should send correct request body over HTTP', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'http',
    })

    await client.call('do.nouns.list', { limit: 10 })

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringMatching(/"method":"do\.nouns\.list"/),
      })
    )
  })

  it('should include auth header in HTTP requests', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'http',
      auth: 'Bearer token123',
    })

    await client.call('do.system.ping')

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token123',
        }),
      })
    )
  })

  it('should handle HTTP errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ id: '1', error: { code: -32603, message: 'Internal error' } }),
      })
    )

    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'http',
    })

    await expect(client.call('do.system.ping')).rejects.toMatchObject({
      code: -32603,
    })
  })

  it('should retry HTTP requests on network failure', async () => {
    let attempts = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        attempts++
        if (attempts < 3) {
          return Promise.reject(new Error('Network error'))
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: '1', result: { pong: true } }),
        })
      })
    )

    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'http',
      retries: 3,
    })

    const result = await client.call('do.system.ping')

    expect(attempts).toBe(3)
    expect(result).toEqual({ pong: true })
  })

  it('should respect HTTP timeout', async () => {
    vi.useFakeTimers()

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            // Never resolves
          })
      )
    )

    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'http',
      timeout: 5000,
    })

    const callPromise = client.call('do.system.ping')

    vi.advanceTimersByTime(6000)

    await expect(callPromise).rejects.toThrow('Request timeout')

    vi.useRealTimers()
  })
})

// =============================================================================
// Auto-Reconnection Tests
// =============================================================================

describe('RPCClient - Auto-Reconnection', () => {
  beforeEach(() => {
    MockWebSocket.reset()
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should auto-reconnect on unexpected disconnect', async () => {
    vi.useFakeTimers()

    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
      autoReconnect: true,
      reconnectDelay: 1000,
    })

    await client.connect()

    const initialWs = MockWebSocket.instances[0]

    // Simulate unexpected disconnect
    initialWs.onclose?.({ code: 1006, reason: 'Abnormal closure' })

    // Should start reconnecting
    expect(client.getConnectionState()).toBe('reconnecting')

    // Advance time past reconnect delay
    vi.advanceTimersByTime(1500)

    // Should have created a new WebSocket
    expect(MockWebSocket.instances).toHaveLength(2)

    vi.useRealTimers()
  })

  it('should not auto-reconnect on normal close', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
      autoReconnect: true,
    })

    await client.connect()
    await client.close() // Normal close

    expect(client.getConnectionState()).toBe('disconnected')
    expect(MockWebSocket.instances).toHaveLength(1) // No new connections
  })

  it('should use exponential backoff for reconnection', async () => {
    vi.useFakeTimers()

    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
      autoReconnect: true,
      reconnectDelay: 1000,
      maxReconnectDelay: 30000,
    })

    await client.connect()

    // First disconnect
    MockWebSocket.instances[0].onclose?.({ code: 1006, reason: '' })
    MockWebSocket.instances[0].readyState = 3 // CLOSED

    vi.advanceTimersByTime(1000)
    expect(MockWebSocket.instances).toHaveLength(2)

    // Second disconnect (should wait 2s)
    MockWebSocket.instances[1].onerror?.(new Error('Connection failed'))

    vi.advanceTimersByTime(1000)
    expect(MockWebSocket.instances).toHaveLength(2) // Still 2, not reconnected yet

    vi.advanceTimersByTime(1000)
    expect(MockWebSocket.instances).toHaveLength(3)

    vi.useRealTimers()
  })

  it('should stop reconnecting after max attempts', async () => {
    vi.useFakeTimers()

    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
      autoReconnect: true,
      maxReconnectAttempts: 3,
      reconnectDelay: 100,
    })

    await client.connect()

    // Simulate multiple failures
    for (let i = 0; i < 5; i++) {
      const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]
      ws.onerror?.(new Error('Connection failed'))
      vi.advanceTimersByTime(1000)
    }

    // Should have attempted exactly 3 reconnections
    expect(MockWebSocket.instances).toHaveLength(4) // Initial + 3 attempts
    expect(client.getConnectionState()).toBe('disconnected')

    vi.useRealTimers()
  })

  it('should queue messages during reconnection', async () => {
    vi.useFakeTimers()

    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
      autoReconnect: true,
      reconnectDelay: 1000,
    })

    await client.connect()

    const ws = MockWebSocket.instances[0]
    ws.onclose?.({ code: 1006, reason: '' })
    ws.readyState = 3 // CLOSED

    // Queue a call while disconnected
    const callPromise = client.call('do.system.ping')

    // Advance past reconnect delay
    vi.advanceTimersByTime(1500)

    // Simulate successful reconnection
    const newWs = MockWebSocket.instances[1]
    newWs.readyState = 1
    newWs.onopen?.()

    // Message should be sent on new connection
    expect(newWs.send).toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('should emit reconnection events', async () => {
    vi.useFakeTimers()

    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
      autoReconnect: true,
      reconnectDelay: 1000,
    })

    const events: string[] = []
    client.on('reconnecting', () => events.push('reconnecting'))
    client.on('reconnected', () => events.push('reconnected'))

    await client.connect()

    const ws = MockWebSocket.instances[0]
    ws.onclose?.({ code: 1006, reason: '' })
    ws.readyState = 3

    expect(events).toContain('reconnecting')

    vi.advanceTimersByTime(1500)

    const newWs = MockWebSocket.instances[1]
    newWs.readyState = 1
    newWs.onopen?.()

    expect(events).toContain('reconnected')

    vi.useRealTimers()
  })

  it('should reset reconnect attempts on successful connection', async () => {
    vi.useFakeTimers()

    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
      autoReconnect: true,
      maxReconnectAttempts: 3,
      reconnectDelay: 100,
    })

    await client.connect()

    // First disconnect + reconnect
    MockWebSocket.instances[0].onclose?.({ code: 1006, reason: '' })
    vi.advanceTimersByTime(200)
    MockWebSocket.instances[1].onopen?.()

    // Second disconnect - should start from 0 attempts again
    MockWebSocket.instances[1].onclose?.({ code: 1006, reason: '' })

    // Should be able to attempt 3 more reconnections
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(500)
    }

    expect(MockWebSocket.instances.length).toBeGreaterThan(2)

    vi.useRealTimers()
  })
})

// =============================================================================
// Method Call Tests
// =============================================================================

describe('RPCClient - Method Calls', () => {
  beforeEach(() => {
    MockWebSocket.reset()
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should call method and return result', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
    })

    await client.connect()

    const ws = MockWebSocket.instances[0]
    const callPromise = client.call('do.system.ping')

    // Simulate response
    const sentMessage = JSON.parse(ws.send.mock.calls[0][0])
    ws.onmessage?.({
      data: JSON.stringify({
        id: sentMessage.id,
        result: { pong: true, timestamp: Date.now() },
      }),
    })

    const result = await callPromise

    expect(result).toEqual({ pong: true, timestamp: expect.any(Number) })
  })

  it('should pass parameters to method', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
    })

    await client.connect()

    const ws = MockWebSocket.instances[0]
    client.call('do.nouns.list', { limit: 10, offset: 5 })

    const sentMessage = JSON.parse(ws.send.mock.calls[0][0])

    expect(sentMessage.method).toBe('do.nouns.list')
    expect(sentMessage.params).toEqual({ limit: 10, offset: 5 })
  })

  it('should reject on error response', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
    })

    await client.connect()

    const ws = MockWebSocket.instances[0]
    const callPromise = client.call('do.unknown.method' as keyof DORPCMethods)

    const sentMessage = JSON.parse(ws.send.mock.calls[0][0])
    ws.onmessage?.({
      data: JSON.stringify({
        id: sentMessage.id,
        error: { code: -32601, message: 'Method not found' },
      }),
    })

    await expect(callPromise).rejects.toMatchObject({
      code: -32601,
      message: 'Method not found',
    })
  })

  it('should handle call timeout', async () => {
    vi.useFakeTimers()

    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
      timeout: 5000,
    })

    await client.connect()

    const callPromise = client.call('do.slow.method' as keyof DORPCMethods)

    vi.advanceTimersByTime(6000)

    await expect(callPromise).rejects.toThrow('timeout')

    vi.useRealTimers()
  })

  it('should generate unique request IDs', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
    })

    await client.connect()

    const ws = MockWebSocket.instances[0]

    client.call('do.system.ping')
    client.call('do.system.ping')
    client.call('do.system.ping')

    const ids = ws.send.mock.calls.map((call: unknown[]) => JSON.parse(call[0] as string).id)
    const uniqueIds = new Set(ids)

    expect(uniqueIds.size).toBe(3)
  })

  it('should match responses to correct requests', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
    })

    await client.connect()

    const ws = MockWebSocket.instances[0]

    const promise1 = client.call('do.system.ping')
    const promise2 = client.call('do.identity.get')

    const request1 = JSON.parse(ws.send.mock.calls[0][0])
    const request2 = JSON.parse(ws.send.mock.calls[1][0])

    // Respond in reverse order
    ws.onmessage?.({
      data: JSON.stringify({
        id: request2.id,
        result: { $id: 'test-do' },
      }),
    })

    ws.onmessage?.({
      data: JSON.stringify({
        id: request1.id,
        result: { pong: true },
      }),
    })

    const result1 = await promise1
    const result2 = await promise2

    expect(result1).toEqual({ pong: true })
    expect(result2).toEqual({ $id: 'test-do' })
  })

  it('should include metadata in requests', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
      auth: 'Bearer token123',
    })

    await client.connect()

    const ws = MockWebSocket.instances[0]
    client.call('do.system.ping')

    const sentMessage = JSON.parse(ws.send.mock.calls[0][0])

    expect(sentMessage.meta).toBeDefined()
    expect(sentMessage.meta.auth).toBe('Bearer token123')
    expect(sentMessage.meta.timestamp).toBeDefined()
  })
})

// =============================================================================
// Promise Pipelining Tests
// =============================================================================

describe('RPCClient - Promise Pipelining', () => {
  beforeEach(() => {
    MockWebSocket.reset()
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should batch multiple calls into single request', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
    })

    await client.connect()

    const ws = MockWebSocket.instances[0]

    const batchPromise = client.batch([
      { method: 'do.system.ping', params: undefined },
      { method: 'do.identity.get', params: undefined },
      { method: 'do.nouns.list', params: { limit: 10 } },
    ])

    // Should send single batch request
    expect(ws.send).toHaveBeenCalledTimes(1)

    const sentMessage = JSON.parse(ws.send.mock.calls[0][0])
    expect(sentMessage.requests).toHaveLength(3)

    // Send batch response
    ws.onmessage?.({
      data: JSON.stringify({
        id: sentMessage.id,
        responses: [
          { id: sentMessage.requests[0].id, result: { pong: true } },
          { id: sentMessage.requests[1].id, result: { $id: 'test' } },
          { id: sentMessage.requests[2].id, result: { items: [], hasMore: false } },
        ],
        success: true,
      }),
    })

    const result = await batchPromise

    expect(result.responses).toHaveLength(3)
    expect(result.success).toBe(true)
  })

  it('should support pipeline builder API', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
    })

    await client.connect()

    const ws = MockWebSocket.instances[0]

    const pipeline = client
      .pipeline()
      .call('do.nouns.create', { name: 'User', singular: 'user', plural: 'users', slug: 'user' })
      .call('do.verbs.create', {
        name: 'Create',
        action: 'create',
        act: 'crt',
        activity: 'creating',
        event: 'created',
        reverse: 'createdBy',
      })
      .call('do.things.create', { $id: 'user-1', $type: 'User' } as unknown as Parameters<DORPCMethods['do.things.create']>[0])

    const resultPromise = pipeline.execute()

    const sentMessage = JSON.parse(ws.send.mock.calls[0][0])

    ws.onmessage?.({
      data: JSON.stringify({
        id: sentMessage.id,
        responses: [
          { id: sentMessage.requests[0].id, result: { id: 'noun-1' } },
          { id: sentMessage.requests[1].id, result: { id: 'verb-1' } },
          { id: sentMessage.requests[2].id, result: { id: 'thing-1' } },
        ],
        success: true,
      }),
    })

    const results = await resultPromise

    expect(results).toHaveLength(3)
  })

  it('should respect abortOnError option', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
    })

    await client.connect()

    const ws = MockWebSocket.instances[0]

    const batchPromise = client.batch(
      [
        { method: 'do.system.ping', params: undefined },
        { method: 'do.unknown.method', params: undefined },
        { method: 'do.identity.get', params: undefined },
      ],
      { abortOnError: true }
    )

    const sentMessage = JSON.parse(ws.send.mock.calls[0][0])
    expect(sentMessage.abortOnError).toBe(true)

    ws.onmessage?.({
      data: JSON.stringify({
        id: sentMessage.id,
        responses: [
          { id: sentMessage.requests[0].id, result: { pong: true } },
          { id: sentMessage.requests[1].id, error: { code: -32601, message: 'Method not found' } },
        ],
        success: false,
      }),
    })

    const result = await batchPromise

    expect(result.success).toBe(false)
    expect(result.responses).toHaveLength(2) // Third call was aborted
  })

  it('should allow referencing previous results in pipeline', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
    })

    await client.connect()

    const ws = MockWebSocket.instances[0]

    // Create a noun, then create a thing using that noun's ID
    const pipeline = client
      .pipeline()
      .call('do.nouns.create', { name: 'Task', singular: 'task', plural: 'tasks', slug: 'task' })
      .call('do.things.create', ((prev: Array<{ slug: string }>) => ({
        $id: 'task-1',
        $type: prev[0].slug, // Reference result from first call
      })) as (prev: unknown[]) => unknown)

    const resultPromise = pipeline.execute()

    const sentMessage = JSON.parse(ws.send.mock.calls[0][0])

    // First request should have actual params
    expect(sentMessage.requests[0].params).toEqual({
      name: 'Task',
      singular: 'task',
      plural: 'tasks',
      slug: 'task',
    })

    // Second request should have a reference marker
    expect(sentMessage.requests[1].params).toHaveProperty('$ref')

    ws.onmessage?.({
      data: JSON.stringify({
        id: sentMessage.id,
        responses: [
          { id: sentMessage.requests[0].id, result: { id: 'noun-1', slug: 'task' } },
          { id: sentMessage.requests[1].id, result: { id: 'thing-1', $type: 'task' } },
        ],
        success: true,
      }),
    })

    const results = await resultPromise

    expect(results[1]).toMatchObject({ $type: 'task' })
  })

  it('should handle partial batch failures', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
    })

    await client.connect()

    const ws = MockWebSocket.instances[0]

    const batchPromise = client.batch([
      { method: 'do.system.ping', params: undefined },
      { method: 'do.fail', params: undefined },
      { method: 'do.identity.get', params: undefined },
    ])

    const sentMessage = JSON.parse(ws.send.mock.calls[0][0])

    ws.onmessage?.({
      data: JSON.stringify({
        id: sentMessage.id,
        responses: [
          { id: sentMessage.requests[0].id, result: { pong: true } },
          { id: sentMessage.requests[1].id, error: { code: -32603, message: 'Internal error' } },
          { id: sentMessage.requests[2].id, result: { $id: 'test' } },
        ],
        success: false, // Partial success
      }),
    })

    const result = await batchPromise

    expect(result.success).toBe(false)
    expect(result.responses[0].result).toBeDefined()
    expect(result.responses[1].error).toBeDefined()
    expect(result.responses[2].result).toBeDefined()
  })

  it('should include batch duration in response', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
    })

    await client.connect()

    const ws = MockWebSocket.instances[0]

    const batchPromise = client.batch([{ method: 'do.system.ping', params: undefined }])

    const sentMessage = JSON.parse(ws.send.mock.calls[0][0])

    ws.onmessage?.({
      data: JSON.stringify({
        id: sentMessage.id,
        responses: [{ id: sentMessage.requests[0].id, result: { pong: true } }],
        success: true,
        duration: 42,
      }),
    })

    const result = await batchPromise

    expect(result.duration).toBe(42)
  })
})

// =============================================================================
// Type Inference Tests
// =============================================================================

describe('RPCClient - Type Inference', () => {
  // These tests verify TypeScript compile-time behavior
  // They will pass at runtime but provide type safety guarantees

  it('should infer return types for known methods', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'http',
    })

    // TypeScript should infer correct return types
    // These are compile-time checks
    const pingResult = await (client.call('do.system.ping') as Promise<{ pong: true; timestamp: number }>)
    expect(pingResult).toBeDefined()

    const identityResult = await (client.call('do.identity.get') as Promise<DigitalObjectIdentity>)
    expect(identityResult).toBeDefined()
  })

  it('should type-check method parameters', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'http',
    })

    // These calls should be valid at compile time
    await client.call('do.nouns.list', { limit: 10 })
    await client.call('do.nouns.get', 'noun-id')
    await client.call('do.cdc.subscribe', { collections: ['nouns'] })

    expect(true).toBe(true) // Test passes if TypeScript doesn't complain
  })

  it('should provide typed client interface', async () => {
    // Create a strongly-typed client
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'http',
    }) as RPCClient

    // These methods should exist with correct signatures
    expect(typeof client.call).toBe('function')
    expect(typeof client.batch).toBe('function')
    expect(typeof client.subscribe).toBe('function')
    expect(typeof client.close).toBe('function')
  })

  it('should allow custom method type extensions', async () => {
    interface CustomMethods {
      'custom.hello': (name: string) => Promise<string>
      'custom.math.add': (params: { a: number; b: number }) => Promise<number>
    }

    const client = createRPCClient<CustomMethods>({
      url: 'https://example.com',
      transport: 'http',
    })

    // Should accept custom methods
    // @ts-expect-error - This tests that unknown methods are caught
    // In actual usage, this would fail type checking
    await client.call('custom.unknown')

    expect(true).toBe(true) // Test passes if type system works correctly
  })
})

// =============================================================================
// Edge Cases
// =============================================================================

describe('RPCClient - Edge Cases', () => {
  beforeEach(() => {
    MockWebSocket.reset()
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should handle empty response', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
    })

    await client.connect()

    const ws = MockWebSocket.instances[0]
    const callPromise = client.call('do.webhooks.delete', 'webhook-1')

    const sentMessage = JSON.parse(ws.send.mock.calls[0][0])
    ws.onmessage?.({
      data: JSON.stringify({
        id: sentMessage.id,
        result: undefined, // void return
      }),
    })

    const result = await callPromise

    expect(result).toBeUndefined()
  })

  it('should handle null result', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
    })

    await client.connect()

    const ws = MockWebSocket.instances[0]
    const callPromise = client.call('do.nouns.get', 'non-existent')

    const sentMessage = JSON.parse(ws.send.mock.calls[0][0])
    ws.onmessage?.({
      data: JSON.stringify({
        id: sentMessage.id,
        result: null,
      }),
    })

    const result = await callPromise

    expect(result).toBeNull()
  })

  it('should handle large payloads', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
    })

    await client.connect()

    const ws = MockWebSocket.instances[0]

    const largeData = { data: 'x'.repeat(100000) } as Parameters<DORPCMethods['do.things.create']>[0]
    client.call('do.things.create', largeData)

    expect(ws.send).toHaveBeenCalled()
    const sentMessage = JSON.parse(ws.send.mock.calls[0][0])
    expect(sentMessage.params.data.length).toBe(100000)
  })

  it('should handle special characters in params', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
    })

    await client.connect()

    const ws = MockWebSocket.instances[0]

    const specialParams = {
      name: 'Test "quoted"',
      description: "It's a\nmultiline\tstring",
      unicode: 'Hello!',
    }

    client.call('do.nouns.create', specialParams as unknown as Parameters<DORPCMethods['do.nouns.create']>[0])

    const sentMessage = JSON.parse(ws.send.mock.calls[0][0])
    expect(sentMessage.params).toEqual(specialParams)
  })

  it('should handle binary message rejection', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
    })

    await client.connect()

    const ws = MockWebSocket.instances[0]

    // Simulate binary message (should be ignored or cause error)
    ws.onmessage?.({
      data: new ArrayBuffer(10) as unknown as string,
    })

    // Client should not crash
    expect(client.getConnectionState()).toBe('connected')
  })

  it('should cleanup pending requests on disconnect', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
      autoReconnect: false,
    })

    await client.connect()

    const ws = MockWebSocket.instances[0]

    const callPromise = client.call('do.slow.method' as keyof DORPCMethods)

    // Disconnect before response
    ws.onclose?.({ code: 1000, reason: 'Normal' })

    await expect(callPromise).rejects.toThrow('Connection closed')
  })

  it('should handle malformed server response', async () => {
    const client = createRPCClient({
      url: 'https://example.com',
      transport: 'websocket',
    })

    await client.connect()

    const ws = MockWebSocket.instances[0]

    const callPromise = client.call('do.system.ping')

    // Send malformed response
    ws.onmessage?.({
      data: 'not json at all',
    })

    // Client should handle gracefully - either ignore or report error
    expect(client.getConnectionState()).toBe('connected')

    // Original call should timeout or be rejected
    vi.useFakeTimers()
    vi.advanceTimersByTime(30000)
    vi.useRealTimers()
  })
})
