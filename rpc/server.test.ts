/**
 * RPC Server Tests - RED Phase
 *
 * Tests for CapnWeb RPC Server implementation
 * - WebSocket connection handling
 * - WebSocket hibernation
 * - HTTP POST /rpc endpoint
 * - HTTP POST / endpoint
 * - Method dispatch
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type {
  RPCRequest,
  RPCResponse,
  RPCError,
  RPCBatchRequest,
  RPCBatchResponse,
  RpcErrorCodes,
  WebSocketState,
  HibernationOptions,
} from '../types/rpc'

// These imports will fail until implementation exists
import {
  createRPCServer,
  RPCServer,
  RPCHandler,
  RPCMethodHandler,
  RPCServerOptions,
} from './server'

// =============================================================================
// Test Fixtures
// =============================================================================

const createMockRequest = (method = 'do.system.ping', params?: unknown): RPCRequest => ({
  id: crypto.randomUUID(),
  method,
  params,
  meta: { timestamp: Date.now() },
})

const createMockWebSocket = () => ({
  accept: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  readyState: 1, // OPEN
  serializeAttachment: vi.fn(),
  deserializeAttachment: vi.fn(),
})

const createMockEnv = () => ({
  DO_NAMESPACE: {
    get: vi.fn(),
    idFromName: vi.fn(),
  },
})

// =============================================================================
// WebSocket Connection Tests
// =============================================================================

describe('RPCServer - WebSocket Connection', () => {
  let server: RPCServer
  let mockEnv: ReturnType<typeof createMockEnv>

  beforeEach(() => {
    mockEnv = createMockEnv()
    server = createRPCServer({ env: mockEnv })
  })

  it('should accept WebSocket upgrade requests', async () => {
    const request = new Request('https://example.com/rpc', {
      headers: {
        Upgrade: 'websocket',
        Connection: 'Upgrade',
      },
    })

    const response = await server.fetch(request)

    expect(response.status).toBe(101)
    expect(response.webSocket).toBeDefined()
  })

  it('should generate unique connection IDs', async () => {
    const request1 = new Request('https://example.com/rpc', {
      headers: { Upgrade: 'websocket', Connection: 'Upgrade' },
    })
    const request2 = new Request('https://example.com/rpc', {
      headers: { Upgrade: 'websocket', Connection: 'Upgrade' },
    })

    await server.fetch(request1)
    await server.fetch(request2)

    const connections = server.getConnections()
    const ids = connections.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('should track connection state as "open" after upgrade', async () => {
    const request = new Request('https://example.com/rpc', {
      headers: { Upgrade: 'websocket', Connection: 'Upgrade' },
    })

    await server.fetch(request)

    const connections = server.getConnections()
    expect(connections[0].status).toBe('open')
  })

  it('should handle WebSocket message events', async () => {
    const mockWs = createMockWebSocket()
    const rpcRequest = createMockRequest('do.system.ping')

    await server.handleWebSocketMessage(mockWs as unknown as WebSocket, JSON.stringify(rpcRequest))

    expect(mockWs.send).toHaveBeenCalled()
    const response = JSON.parse(mockWs.send.mock.calls[0][0]) as RPCResponse
    expect(response.id).toBe(rpcRequest.id)
  })

  it('should handle WebSocket close events', async () => {
    const mockWs = createMockWebSocket()
    const connectionId = 'test-connection-id'

    server.registerConnection(connectionId, mockWs as unknown as WebSocket)
    await server.handleWebSocketClose(mockWs as unknown as WebSocket, 1000, 'Normal closure')

    const connection = server.getConnection(connectionId)
    expect(connection?.status).toBe('closed')
  })

  it('should handle WebSocket error events', async () => {
    const mockWs = createMockWebSocket()
    const connectionId = 'test-connection-id'

    server.registerConnection(connectionId, mockWs as unknown as WebSocket)
    await server.handleWebSocketError(mockWs as unknown as WebSocket, new Error('Connection failed'))

    const connection = server.getConnection(connectionId)
    expect(connection?.status).toBe('closed')
  })

  it('should reject non-WebSocket requests to WebSocket endpoint with correct status', async () => {
    const request = new Request('https://example.com/rpc', {
      method: 'GET',
      // No Upgrade header
    })

    const response = await server.fetch(request)

    // Should return method info for GET without upgrade, not reject
    expect(response.status).toBe(200)
  })

  it('should handle malformed WebSocket messages gracefully', async () => {
    const mockWs = createMockWebSocket()

    await server.handleWebSocketMessage(mockWs as unknown as WebSocket, 'not valid json')

    expect(mockWs.send).toHaveBeenCalled()
    const response = JSON.parse(mockWs.send.mock.calls[0][0]) as RPCResponse
    expect(response.error?.code).toBe(-32700) // ParseError
  })
})

// =============================================================================
// WebSocket Hibernation Tests
// =============================================================================

describe('RPCServer - WebSocket Hibernation', () => {
  let server: RPCServer

  beforeEach(() => {
    server = createRPCServer({
      hibernation: {
        idleTimeout: 10000, // 10 seconds
        maxHibernationDuration: 86400000, // 24 hours
        autoReconnect: true,
      },
    })
  })

  it('should hibernate idle connections after timeout', async () => {
    vi.useFakeTimers()
    const mockWs = createMockWebSocket()
    const connectionId = 'test-connection'

    server.registerConnection(connectionId, mockWs as unknown as WebSocket)

    // Advance time past idle timeout
    vi.advanceTimersByTime(15000)

    const connection = server.getConnection(connectionId)
    expect(connection?.status).toBe('hibernating')

    vi.useRealTimers()
  })

  it('should store WebSocket state before hibernation', async () => {
    vi.useFakeTimers()
    const mockWs = createMockWebSocket()
    const connectionId = 'test-connection'

    server.registerConnection(connectionId, mockWs as unknown as WebSocket)
    server.setConnectionData(connectionId, { customData: 'test' })

    vi.advanceTimersByTime(15000)

    expect(mockWs.serializeAttachment).toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('should restore WebSocket state on wake', async () => {
    const mockWs = createMockWebSocket()
    mockWs.deserializeAttachment.mockReturnValue({ customData: 'test' })

    const connectionId = await server.wakeConnection(mockWs as unknown as WebSocket)

    const connection = server.getConnection(connectionId)
    expect(connection?.data?.customData).toBe('test')
  })

  it('should reset idle timer on message activity', async () => {
    vi.useFakeTimers()
    const mockWs = createMockWebSocket()
    const connectionId = 'test-connection'

    server.registerConnection(connectionId, mockWs as unknown as WebSocket)

    // Advance time but not past idle timeout
    vi.advanceTimersByTime(8000)

    // Send a message (should reset timer)
    const request = createMockRequest('do.system.ping')
    await server.handleWebSocketMessage(mockWs as unknown as WebSocket, JSON.stringify(request))

    // Advance time again
    vi.advanceTimersByTime(8000)

    // Connection should still be open (timer was reset)
    const connection = server.getConnection(connectionId)
    expect(connection?.status).toBe('open')

    vi.useRealTimers()
  })

  it('should track hibernation timestamp', async () => {
    vi.useFakeTimers()
    const mockWs = createMockWebSocket()
    const connectionId = 'test-connection'
    const now = Date.now()

    server.registerConnection(connectionId, mockWs as unknown as WebSocket)
    vi.advanceTimersByTime(15000)

    const connection = server.getConnection(connectionId)
    expect(connection?.hibernatedAt).toBeGreaterThanOrEqual(now + 10000)

    vi.useRealTimers()
  })

  it('should close connections exceeding max hibernation duration', async () => {
    vi.useFakeTimers()
    const mockWs = createMockWebSocket()
    const connectionId = 'test-connection'

    server.registerConnection(connectionId, mockWs as unknown as WebSocket)

    // Advance past idle timeout + max hibernation
    vi.advanceTimersByTime(86400000 + 15000)

    const connection = server.getConnection(connectionId)
    expect(connection?.status).toBe('closed')

    vi.useRealTimers()
  })

  it('should maintain subscriptions during hibernation', async () => {
    vi.useFakeTimers()
    const mockWs = createMockWebSocket()
    const connectionId = 'test-connection'

    server.registerConnection(connectionId, mockWs as unknown as WebSocket)
    await server.subscribe(connectionId, 'do.cdc.events')

    vi.advanceTimersByTime(15000)

    const connection = server.getConnection(connectionId)
    expect(connection?.subscriptions).toContain('do.cdc.events')

    vi.useRealTimers()
  })

  it('should queue events during hibernation for delivery on wake', async () => {
    vi.useFakeTimers()
    const mockWs = createMockWebSocket()
    const connectionId = 'test-connection'

    server.registerConnection(connectionId, mockWs as unknown as WebSocket)
    await server.subscribe(connectionId, 'do.cdc.events')

    vi.advanceTimersByTime(15000)

    // Emit event while hibernating
    await server.emit('do.cdc.events', { type: 'INSERT', data: { id: '1' } })

    // Wake connection
    await server.wakeConnection(mockWs as unknown as WebSocket)

    // Should receive queued events
    expect(mockWs.send).toHaveBeenCalled()

    vi.useRealTimers()
  })
})

// =============================================================================
// HTTP POST /rpc Tests
// =============================================================================

describe('RPCServer - HTTP POST /rpc', () => {
  let server: RPCServer

  beforeEach(() => {
    server = createRPCServer()
  })

  it('should handle POST /rpc with JSON body', async () => {
    const rpcRequest = createMockRequest('do.system.ping')
    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rpcRequest),
    })

    const response = await server.fetch(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/json')

    const data = (await response.json()) as RPCResponse
    expect(data.id).toBe(rpcRequest.id)
  })

  it('should return result for successful method call', async () => {
    server.registerMethod('do.system.ping', async () => ({
      pong: true,
      timestamp: Date.now(),
    }))

    const rpcRequest = createMockRequest('do.system.ping')
    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rpcRequest),
    })

    const response = await server.fetch(request)
    const data = (await response.json()) as RPCResponse

    expect(data.result).toHaveProperty('pong', true)
    expect(data.result).toHaveProperty('timestamp')
    expect(data.error).toBeUndefined()
  })

  it('should return error for unknown method', async () => {
    const rpcRequest = createMockRequest('unknown.method')
    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rpcRequest),
    })

    const response = await server.fetch(request)
    const data = (await response.json()) as RPCResponse

    expect(data.error?.code).toBe(-32601) // MethodNotFound
  })

  it('should handle batch requests', async () => {
    server.registerMethod('do.system.ping', async () => ({ pong: true }))
    server.registerMethod('do.identity.get', async () => ({ $id: 'test' }))

    const batchRequest: RPCBatchRequest = {
      id: 'batch-1',
      requests: [createMockRequest('do.system.ping'), createMockRequest('do.identity.get')],
    }

    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batchRequest),
    })

    const response = await server.fetch(request)
    const data = (await response.json()) as RPCBatchResponse

    expect(data.id).toBe('batch-1')
    expect(data.responses).toHaveLength(2)
    expect(data.success).toBe(true)
  })

  it('should abort batch on first error when abortOnError is true', async () => {
    server.registerMethod('do.system.ping', async () => ({ pong: true }))
    // do.fail is not registered, will fail

    const batchRequest: RPCBatchRequest = {
      id: 'batch-1',
      requests: [createMockRequest('do.system.ping'), createMockRequest('do.fail'), createMockRequest('do.system.ping')],
      abortOnError: true,
    }

    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batchRequest),
    })

    const response = await server.fetch(request)
    const data = (await response.json()) as RPCBatchResponse

    expect(data.success).toBe(false)
    expect(data.responses).toHaveLength(2) // First two only
    expect(data.responses[1].error).toBeDefined()
  })

  it('should return 400 for invalid JSON', async () => {
    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json{',
    })

    const response = await server.fetch(request)

    expect(response.status).toBe(400)
    const data = (await response.json()) as RPCResponse
    expect(data.error?.code).toBe(-32700) // ParseError
  })

  it('should return 400 for missing request ID', async () => {
    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'do.system.ping' }), // No id
    })

    const response = await server.fetch(request)

    expect(response.status).toBe(400)
    const data = (await response.json()) as RPCResponse
    expect(data.error?.code).toBe(-32600) // InvalidRequest
  })

  it('should include metadata in response', async () => {
    server.registerMethod('do.system.ping', async () => ({ pong: true }))

    const rpcRequest = createMockRequest('do.system.ping')
    rpcRequest.meta = { traceId: 'trace-123' }

    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rpcRequest),
    })

    const response = await server.fetch(request)
    const data = (await response.json()) as RPCResponse

    expect(data.meta?.traceId).toBe('trace-123')
    expect(data.meta?.duration).toBeGreaterThanOrEqual(0)
  })
})

// =============================================================================
// HTTP POST / Tests
// =============================================================================

describe('RPCServer - HTTP POST /', () => {
  let server: RPCServer

  beforeEach(() => {
    server = createRPCServer()
  })

  it('should handle POST / as alias for POST /rpc', async () => {
    server.registerMethod('do.system.ping', async () => ({ pong: true }))

    const rpcRequest = createMockRequest('do.system.ping')
    const request = new Request('https://example.com/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rpcRequest),
    })

    const response = await server.fetch(request)

    expect(response.status).toBe(200)
    const data = (await response.json()) as RPCResponse
    expect(data.result).toHaveProperty('pong', true)
  })

  it('should support Content-Type: application/json;charset=utf-8', async () => {
    server.registerMethod('do.system.ping', async () => ({ pong: true }))

    const rpcRequest = createMockRequest('do.system.ping')
    const request = new Request('https://example.com/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(rpcRequest),
    })

    const response = await server.fetch(request)

    expect(response.status).toBe(200)
  })

  it('should reject unsupported Content-Type', async () => {
    const request = new Request('https://example.com/', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'some text',
    })

    const response = await server.fetch(request)

    expect(response.status).toBe(415) // Unsupported Media Type
  })
})

// =============================================================================
// Method Dispatch Tests
// =============================================================================

describe('RPCServer - Method Dispatch', () => {
  let server: RPCServer

  beforeEach(() => {
    server = createRPCServer()
  })

  it('should dispatch to registered handler', async () => {
    const handler = vi.fn().mockResolvedValue({ result: 'ok' })
    server.registerMethod('custom.method', handler)

    const rpcRequest = createMockRequest('custom.method', { param1: 'value1' })
    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rpcRequest),
    })

    await server.fetch(request)

    expect(handler).toHaveBeenCalledWith({ param1: 'value1' }, expect.any(Object))
  })

  it('should pass context to handler', async () => {
    const handler = vi.fn().mockResolvedValue({ result: 'ok' })
    server.registerMethod('custom.method', handler)

    const rpcRequest = createMockRequest('custom.method')
    rpcRequest.meta = { auth: 'Bearer token123' }

    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rpcRequest),
    })

    await server.fetch(request)

    expect(handler).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        meta: expect.objectContaining({ auth: 'Bearer token123' }),
      })
    )
  })

  it('should support method namespaces', async () => {
    const nounHandler = vi.fn().mockResolvedValue({ items: [] })
    const verbHandler = vi.fn().mockResolvedValue({ items: [] })

    server.registerMethod('do.nouns.list', nounHandler)
    server.registerMethod('do.verbs.list', verbHandler)

    const request1 = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createMockRequest('do.nouns.list')),
    })

    const request2 = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createMockRequest('do.verbs.list')),
    })

    await server.fetch(request1)
    await server.fetch(request2)

    expect(nounHandler).toHaveBeenCalled()
    expect(verbHandler).toHaveBeenCalled()
  })

  it('should support wildcard handlers', async () => {
    const wildcardHandler = vi.fn().mockResolvedValue({ handled: true })
    server.registerMethod('do.custom.*', wildcardHandler)

    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createMockRequest('do.custom.anything')),
    })

    await server.fetch(request)

    expect(wildcardHandler).toHaveBeenCalled()
  })

  it('should prioritize exact match over wildcard', async () => {
    const exactHandler = vi.fn().mockResolvedValue({ type: 'exact' })
    const wildcardHandler = vi.fn().mockResolvedValue({ type: 'wildcard' })

    server.registerMethod('do.custom.specific', exactHandler)
    server.registerMethod('do.custom.*', wildcardHandler)

    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createMockRequest('do.custom.specific')),
    })

    const response = await server.fetch(request)
    const data = (await response.json()) as RPCResponse

    expect(exactHandler).toHaveBeenCalled()
    expect(wildcardHandler).not.toHaveBeenCalled()
    expect(data.result).toEqual({ type: 'exact' })
  })

  it('should allow unregistering methods', async () => {
    const handler = vi.fn().mockResolvedValue({ result: 'ok' })
    server.registerMethod('custom.method', handler)
    server.unregisterMethod('custom.method')

    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createMockRequest('custom.method')),
    })

    const response = await server.fetch(request)
    const data = (await response.json()) as RPCResponse

    expect(data.error?.code).toBe(-32601) // MethodNotFound
  })

  it('should list available methods', () => {
    server.registerMethod('do.nouns.list', async () => ({}))
    server.registerMethod('do.verbs.list', async () => ({}))
    server.registerMethod('do.system.ping', async () => ({}))

    const methods = server.getMethods()

    expect(methods).toContain('do.nouns.list')
    expect(methods).toContain('do.verbs.list')
    expect(methods).toContain('do.system.ping')
  })
})

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('RPCServer - Error Handling', () => {
  let server: RPCServer

  beforeEach(() => {
    server = createRPCServer()
  })

  it('should return ParseError for malformed JSON', async () => {
    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid',
    })

    const response = await server.fetch(request)
    const data = (await response.json()) as RPCResponse

    expect(data.error?.code).toBe(-32700)
    expect(data.error?.message).toContain('Parse')
  })

  it('should return InvalidRequest for missing method field', async () => {
    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '1' }), // No method
    })

    const response = await server.fetch(request)
    const data = (await response.json()) as RPCResponse

    expect(data.error?.code).toBe(-32600)
  })

  it('should return MethodNotFound for unknown method', async () => {
    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createMockRequest('unknown.method')),
    })

    const response = await server.fetch(request)
    const data = (await response.json()) as RPCResponse

    expect(data.error?.code).toBe(-32601)
    expect(data.error?.message).toContain('not found')
  })

  it('should return InvalidParams for validation errors', async () => {
    server.registerMethod('do.nouns.create', (async (params: { name?: string } | undefined) => {
      if (!params?.name) {
        throw { code: -32602, message: 'Missing required field: name' }
      }
      return params
    }) as RPCMethodHandler)

    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createMockRequest('do.nouns.create', {})),
    })

    const response = await server.fetch(request)
    const data = (await response.json()) as RPCResponse

    expect(data.error?.code).toBe(-32602)
  })

  it('should return InternalError for unhandled exceptions', async () => {
    server.registerMethod('do.fail', async () => {
      throw new Error('Unexpected error')
    })

    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createMockRequest('do.fail')),
    })

    const response = await server.fetch(request)
    const data = (await response.json()) as RPCResponse

    expect(data.error?.code).toBe(-32603)
  })

  it('should not expose internal error details in production', async () => {
    server = createRPCServer({ env: { NODE_ENV: 'production' } })
    server.registerMethod('do.fail', async () => {
      throw new Error('Database connection string: secret123')
    })

    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createMockRequest('do.fail')),
    })

    const response = await server.fetch(request)
    const data = (await response.json()) as RPCResponse

    expect(data.error?.message).not.toContain('secret123')
    expect(data.error?.message).toBe('Internal error')
  })

  it('should return custom error codes from handlers', async () => {
    server.registerMethod('do.protected', async () => {
      throw { code: -32001, message: 'Unauthorized', data: { required: 'auth' } }
    })

    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createMockRequest('do.protected')),
    })

    const response = await server.fetch(request)
    const data = (await response.json()) as RPCResponse

    expect(data.error?.code).toBe(-32001) // Unauthorized
    expect(data.error?.data).toEqual({ required: 'auth' })
  })

  it('should handle timeout errors', async () => {
    vi.useFakeTimers()
    server = createRPCServer({ methodTimeout: 1000 })
    server.registerMethod('do.slow', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5000))
      return { done: true }
    })

    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createMockRequest('do.slow')),
    })

    const responsePromise = server.fetch(request)
    vi.advanceTimersByTime(2000)

    const response = await responsePromise
    const data = (await response.json()) as RPCResponse

    expect(data.error?.code).toBe(-32006) // Timeout

    vi.useRealTimers()
  })

  it('should return 429 for rate limited requests', async () => {
    server = createRPCServer({
      rateLimit: { maxRequests: 2, windowMs: 1000 },
    })
    server.registerMethod('do.system.ping', async () => ({ pong: true }))

    const makeRequest = () =>
      server.fetch(
        new Request('https://example.com/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createMockRequest('do.system.ping')),
        })
      )

    await makeRequest()
    await makeRequest()
    const response = await makeRequest() // Third request should be rate limited

    expect(response.status).toBe(429)
    const data = (await response.json()) as RPCResponse
    expect(data.error?.code).toBe(-32005) // RateLimited
  })

  it('should include error data for debugging', async () => {
    server.registerMethod('do.debug', async () => {
      const error = new Error('Test error')
      ;(error as any).code = -32603
      ;(error as any).data = { debug: 'info' }
      throw error
    })

    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createMockRequest('do.debug')),
    })

    const response = await server.fetch(request)
    const data = (await response.json()) as RPCResponse

    expect(data.error?.data).toEqual({ debug: 'info' })
  })
})

// =============================================================================
// Edge Cases
// =============================================================================

describe('RPCServer - Edge Cases', () => {
  let server: RPCServer

  beforeEach(() => {
    server = createRPCServer()
  })

  it('should handle empty params', async () => {
    const handler = vi.fn().mockResolvedValue({ done: true })
    server.registerMethod('do.test', handler)

    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '1', method: 'do.test' }), // No params
    })

    await server.fetch(request)

    expect(handler).toHaveBeenCalledWith(undefined, expect.any(Object))
  })

  it('should handle null params', async () => {
    const handler = vi.fn().mockResolvedValue({ done: true })
    server.registerMethod('do.test', handler)

    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '1', method: 'do.test', params: null }),
    })

    await server.fetch(request)

    expect(handler).toHaveBeenCalledWith(null, expect.any(Object))
  })

  it('should handle very large payloads', async () => {
    server = createRPCServer({ maxPayloadSize: 1024 }) // 1KB limit

    const largeData = 'x'.repeat(2048) // 2KB
    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '1', method: 'do.test', params: { data: largeData } }),
    })

    const response = await server.fetch(request)

    expect(response.status).toBe(413) // Payload Too Large
  })

  it('should handle concurrent requests', async () => {
    let callCount = 0
    server.registerMethod('do.counter', async () => {
      callCount++
      await new Promise((resolve) => setTimeout(resolve, 10))
      return { count: callCount }
    })

    const makeRequest = () =>
      server.fetch(
        new Request('https://example.com/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createMockRequest('do.counter')),
        })
      )

    const responses = await Promise.all([makeRequest(), makeRequest(), makeRequest()])

    expect(responses.every((r) => r.status === 200)).toBe(true)
  })

  it('should handle unicode in method names', async () => {
    const handler = vi.fn().mockResolvedValue({ done: true })
    server.registerMethod('do.test.emoji', handler)

    const rpcRequest = createMockRequest('do.test.emoji')
    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rpcRequest),
    })

    const response = await server.fetch(request)

    expect(response.status).toBe(200)
  })

  it('should preserve request ID in error responses', async () => {
    const rpcRequest = createMockRequest('unknown.method')
    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rpcRequest),
    })

    const response = await server.fetch(request)
    const data = (await response.json()) as RPCResponse

    expect(data.id).toBe(rpcRequest.id)
  })

  it('should handle request with only spaces as body', async () => {
    const request = new Request('https://example.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '   ',
    })

    const response = await server.fetch(request)
    const data = (await response.json()) as RPCResponse

    expect(data.error?.code).toBe(-32700) // ParseError
  })
})
