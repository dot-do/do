/**
 * @dotdo/do - WebSocket Close Connection State Cleanup Tests (RED Phase)
 *
 * These tests define the expected behavior for webSocketClose cleanup.
 * They should FAIL initially (RED), then pass after implementation (GREEN).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DO } from '../src/do'

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
(globalThis as unknown as { WebSocketPair: typeof MockWebSocketPair }).WebSocketPair = MockWebSocketPair

// Mock execution context
const mockCtx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
}

// Mock environment
const mockEnv = {
  DO_NAMESPACE: {
    idFromName: vi.fn(() => ({ toString: () => 'mock-id' })),
    get: vi.fn(),
  },
}

describe('webSocketClose Connection State Cleanup', () => {
  /**
   * RED PHASE TESTS: webSocketClose cleans up connection state
   *
   * These tests verify that when a WebSocket connection is closed,
   * all associated connection state is properly cleaned up to prevent
   * memory leaks and stale references.
   *
   * Expected behavior:
   * 1. Connection tracking via connections Map
   * 2. Connection metadata storage (userId, roomId, etc.)
   * 3. Cleanup on close removes connection from tracking
   * 4. Cleanup removes associated metadata
   * 5. Support for multiple simultaneous connections
   */

  let doInstance: DO

  beforeEach(() => {
    doInstance = new DO(mockCtx as any, mockEnv)
  })

  it('should track connections in a connections Map', () => {
    // The DO should have a connections property to track active WebSocket connections
    expect(doInstance.connections).toBeDefined()
    expect(doInstance.connections).toBeInstanceOf(Map)
  })

  it('should add connection to tracking when registered', async () => {
    const mockWs = new MockWebSocket()

    // Register a connection with metadata
    await doInstance.registerConnection(mockWs as unknown as WebSocket, {
      userId: 'user-123',
      roomId: 'room-abc',
      connectedAt: Date.now(),
    })

    // Connection should be tracked
    expect(doInstance.connections.has(mockWs)).toBe(true)
    expect(doInstance.connections.size).toBe(1)
  })

  it('should store connection metadata when registered', async () => {
    const mockWs = new MockWebSocket()
    const metadata = {
      userId: 'user-456',
      roomId: 'room-xyz',
      connectedAt: Date.now(),
    }

    await doInstance.registerConnection(mockWs as unknown as WebSocket, metadata)

    // Should be able to retrieve metadata
    const storedMetadata = doInstance.getConnectionMetadata(mockWs as unknown as WebSocket)
    expect(storedMetadata).toEqual(metadata)
  })

  it('should remove connection from tracking on webSocketClose', async () => {
    const mockWs = new MockWebSocket()

    // Register connection
    await doInstance.registerConnection(mockWs as unknown as WebSocket, {
      userId: 'user-789',
    })

    expect(doInstance.connections.has(mockWs)).toBe(true)

    // Close the connection
    await doInstance.webSocketClose(mockWs as unknown as WebSocket, 1000, 'Normal closure', true)

    // Connection should be removed from tracking
    expect(doInstance.connections.has(mockWs)).toBe(false)
    expect(doInstance.connections.size).toBe(0)
  })

  it('should remove connection metadata on webSocketClose', async () => {
    const mockWs = new MockWebSocket()

    await doInstance.registerConnection(mockWs as unknown as WebSocket, {
      userId: 'user-cleanup',
      sessionData: { foo: 'bar' },
    })

    // Close the connection
    await doInstance.webSocketClose(mockWs as unknown as WebSocket, 1000, '', true)

    // Metadata should be cleaned up
    const metadata = doInstance.getConnectionMetadata(mockWs as unknown as WebSocket)
    expect(metadata).toBeUndefined()
  })

  it('should handle multiple connections independently', async () => {
    const mockWs1 = new MockWebSocket()
    const mockWs2 = new MockWebSocket()
    const mockWs3 = new MockWebSocket()

    // Register multiple connections
    await doInstance.registerConnection(mockWs1 as unknown as WebSocket, { userId: 'user-1' })
    await doInstance.registerConnection(mockWs2 as unknown as WebSocket, { userId: 'user-2' })
    await doInstance.registerConnection(mockWs3 as unknown as WebSocket, { userId: 'user-3' })

    expect(doInstance.connections.size).toBe(3)

    // Close middle connection
    await doInstance.webSocketClose(mockWs2 as unknown as WebSocket, 1000, '', true)

    // Only ws2 should be removed
    expect(doInstance.connections.size).toBe(2)
    expect(doInstance.connections.has(mockWs1)).toBe(true)
    expect(doInstance.connections.has(mockWs2)).toBe(false)
    expect(doInstance.connections.has(mockWs3)).toBe(true)
  })

  it('should clean up on abnormal close (code 1006)', async () => {
    const mockWs = new MockWebSocket()

    await doInstance.registerConnection(mockWs as unknown as WebSocket, {
      userId: 'user-abnormal',
    })

    // Simulate abnormal closure (connection lost)
    await doInstance.webSocketClose(mockWs as unknown as WebSocket, 1006, 'Connection lost', false)

    // Should still clean up
    expect(doInstance.connections.has(mockWs)).toBe(false)
  })

  it('should clean up on server error close (code 1011)', async () => {
    const mockWs = new MockWebSocket()

    await doInstance.registerConnection(mockWs as unknown as WebSocket, {
      userId: 'user-error',
    })

    // Simulate server error closure
    await doInstance.webSocketClose(mockWs as unknown as WebSocket, 1011, 'Server error', false)

    // Should still clean up
    expect(doInstance.connections.has(mockWs)).toBe(false)
  })

  it('should handle closing untracked connection gracefully', async () => {
    const mockWs = new MockWebSocket()

    // Don't register the connection, just close it
    // Should not throw
    await expect(
      doInstance.webSocketClose(mockWs as unknown as WebSocket, 1000, '', true)
    ).resolves.not.toThrow()
  })

  it('should emit connection:close event on cleanup', async () => {
    const mockWs = new MockWebSocket()
    const closeHandler = vi.fn()

    // Subscribe to connection close events
    doInstance.on('connection:close', closeHandler)

    await doInstance.registerConnection(mockWs as unknown as WebSocket, {
      userId: 'user-event',
    })

    await doInstance.webSocketClose(mockWs as unknown as WebSocket, 1000, 'Goodbye', true)

    // Event should be emitted with connection info
    expect(closeHandler).toHaveBeenCalledTimes(1)
    expect(closeHandler).toHaveBeenCalledWith({
      ws: mockWs,
      code: 1000,
      reason: 'Goodbye',
      wasClean: true,
      metadata: { userId: 'user-event' },
    })
  })

  it('should provide getActiveConnections() method', () => {
    expect(doInstance.getActiveConnections).toBeDefined()
    expect(typeof doInstance.getActiveConnections).toBe('function')
  })

  it('should return active connections via getActiveConnections()', async () => {
    const mockWs1 = new MockWebSocket()
    const mockWs2 = new MockWebSocket()

    await doInstance.registerConnection(mockWs1 as unknown as WebSocket, { userId: 'user-a' })
    await doInstance.registerConnection(mockWs2 as unknown as WebSocket, { userId: 'user-b' })

    const active = doInstance.getActiveConnections()

    expect(Array.isArray(active)).toBe(true)
    expect(active.length).toBe(2)
    expect(active).toContain(mockWs1)
    expect(active).toContain(mockWs2)
  })

  it('should provide getConnectionCount() method', () => {
    expect(doInstance.getConnectionCount).toBeDefined()
    expect(typeof doInstance.getConnectionCount).toBe('function')
  })

  it('should return correct count via getConnectionCount()', async () => {
    const mockWs1 = new MockWebSocket()
    const mockWs2 = new MockWebSocket()

    expect(doInstance.getConnectionCount()).toBe(0)

    await doInstance.registerConnection(mockWs1 as unknown as WebSocket, {})
    expect(doInstance.getConnectionCount()).toBe(1)

    await doInstance.registerConnection(mockWs2 as unknown as WebSocket, {})
    expect(doInstance.getConnectionCount()).toBe(2)

    await doInstance.webSocketClose(mockWs1 as unknown as WebSocket, 1000, '', true)
    expect(doInstance.getConnectionCount()).toBe(1)
  })

  it('should provide findConnectionsByMetadata() method', () => {
    expect(doInstance.findConnectionsByMetadata).toBeDefined()
    expect(typeof doInstance.findConnectionsByMetadata).toBe('function')
  })

  it('should find connections by metadata property', async () => {
    const mockWs1 = new MockWebSocket()
    const mockWs2 = new MockWebSocket()
    const mockWs3 = new MockWebSocket()

    await doInstance.registerConnection(mockWs1 as unknown as WebSocket, { roomId: 'room-1', userId: 'user-a' })
    await doInstance.registerConnection(mockWs2 as unknown as WebSocket, { roomId: 'room-1', userId: 'user-b' })
    await doInstance.registerConnection(mockWs3 as unknown as WebSocket, { roomId: 'room-2', userId: 'user-c' })

    // Find all connections in room-1
    const room1Connections = doInstance.findConnectionsByMetadata({ roomId: 'room-1' })

    expect(room1Connections.length).toBe(2)
    expect(room1Connections).toContain(mockWs1)
    expect(room1Connections).toContain(mockWs2)
    expect(room1Connections).not.toContain(mockWs3)
  })

  it('should allow updating connection metadata', async () => {
    const mockWs = new MockWebSocket()

    await doInstance.registerConnection(mockWs as unknown as WebSocket, {
      userId: 'user-update',
      status: 'idle',
    })

    // Update metadata
    doInstance.updateConnectionMetadata(mockWs as unknown as WebSocket, {
      status: 'active',
      lastActivity: Date.now(),
    })

    const metadata = doInstance.getConnectionMetadata(mockWs as unknown as WebSocket)
    expect(metadata?.userId).toBe('user-update')
    expect(metadata?.status).toBe('active')
    expect(metadata?.lastActivity).toBeDefined()
  })

  it('should broadcast to all connections', async () => {
    const mockWs1 = new MockWebSocket()
    const mockWs2 = new MockWebSocket()
    const mockWs3 = new MockWebSocket()

    await doInstance.registerConnection(mockWs1 as unknown as WebSocket, {})
    await doInstance.registerConnection(mockWs2 as unknown as WebSocket, {})
    await doInstance.registerConnection(mockWs3 as unknown as WebSocket, {})

    const message = JSON.stringify({ type: 'broadcast', data: 'hello' })
    doInstance.broadcast(message)

    expect(mockWs1.send).toHaveBeenCalledWith(message)
    expect(mockWs2.send).toHaveBeenCalledWith(message)
    expect(mockWs3.send).toHaveBeenCalledWith(message)
  })

  it('should broadcast to connections matching filter', async () => {
    const mockWs1 = new MockWebSocket()
    const mockWs2 = new MockWebSocket()
    const mockWs3 = new MockWebSocket()

    await doInstance.registerConnection(mockWs1 as unknown as WebSocket, { roomId: 'room-1' })
    await doInstance.registerConnection(mockWs2 as unknown as WebSocket, { roomId: 'room-1' })
    await doInstance.registerConnection(mockWs3 as unknown as WebSocket, { roomId: 'room-2' })

    const message = JSON.stringify({ type: 'room-message', data: 'hi room 1' })
    doInstance.broadcast(message, { roomId: 'room-1' })

    // Only room-1 connections should receive
    expect(mockWs1.send).toHaveBeenCalledWith(message)
    expect(mockWs2.send).toHaveBeenCalledWith(message)
    expect(mockWs3.send).not.toHaveBeenCalled()
  })

  it('should clean up all connections on destroy', async () => {
    const mockWs1 = new MockWebSocket()
    const mockWs2 = new MockWebSocket()

    await doInstance.registerConnection(mockWs1 as unknown as WebSocket, {})
    await doInstance.registerConnection(mockWs2 as unknown as WebSocket, {})

    expect(doInstance.connections.size).toBe(2)

    // Destroy all connections
    await doInstance.destroyAllConnections()

    expect(doInstance.connections.size).toBe(0)
    // WebSockets should be closed
    expect(mockWs1.close).toHaveBeenCalled()
    expect(mockWs2.close).toHaveBeenCalled()
  })

  it('should not leak memory after many connect/disconnect cycles', async () => {
    // Simulate many connections being created and destroyed
    for (let i = 0; i < 100; i++) {
      const mockWs = new MockWebSocket()
      await doInstance.registerConnection(mockWs as unknown as WebSocket, { iteration: i })
      await doInstance.webSocketClose(mockWs as unknown as WebSocket, 1000, '', true)
    }

    // After all connections are closed, tracking should be empty
    expect(doInstance.connections.size).toBe(0)
    expect(doInstance.getConnectionCount()).toBe(0)
  })
})
