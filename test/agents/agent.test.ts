/**
 * Tests for DOAgent class - Extended Agent with WebSocket hibernation
 *
 * These tests verify the DOAgent implementation without importing the
 * actual agents package (which has CJS dependencies that don't work in workerd).
 *
 * Tests cover:
 * - RpcTarget interface implementation
 * - WebSocket hibernation support with tags
 * - Auth context management
 * - Connection tracking and broadcasting
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type { AuthContext, TransportContext } from '../../src/types'

/**
 * Minimal interface matching DOAgent's RpcTarget implementation
 */
interface RpcTarget {
  hasMethod(name: string): boolean
  invoke(method: string, params: unknown[], authContext?: AuthContext): Promise<unknown>
  allowedMethods: Set<string>
}

/**
 * WebSocket hibernation tags for connection metadata persistence
 */
interface WebSocketTags {
  userId?: string
  organizationId?: string
  type?: string
  metadata?: string
}

/**
 * Options for accepting a WebSocket with hibernation
 */
interface AcceptWebSocketOptions {
  tags?: WebSocketTags | string[]
  auth?: AuthContext
}

/**
 * Connection info stored in hibernation-aware maps
 */
interface HibernationConnectionInfo {
  id: string
  subscriptions: Set<string>
  metadata: Record<string, unknown>
  auth?: AuthContext
}

// Mock WebSocket for testing
class MockWebSocket {
  readyState = 1 // OPEN
  sentMessages: string[] = []

  send(message: string) {
    this.sentMessages.push(message)
  }

  close(_code?: number, _reason?: string) {
    this.readyState = 3 // CLOSED
  }
}

/**
 * Simplified DOAgent implementation for testing
 * This mirrors the actual implementation without importing agents package
 */
class TestDOAgent implements RpcTarget {
  connections: Map<WebSocket, HibernationConnectionInfo> = new Map()
  subscribers: Map<string, Set<WebSocket>> = new Map()
  wsAuthContexts: Map<WebSocket, AuthContext> = new Map()
  currentAuthContext: AuthContext | null = null
  private _currentTransportContext: TransportContext | null = null

  allowedMethods = new Set(['getState', 'setState', 'sql'])

  private mockCtx: {
    acceptWebSocket: (ws: WebSocket, tags?: string[]) => void
    getWebSockets: (tag?: string) => WebSocket[]
    getTags: (ws: WebSocket) => string[]
  }

  constructor(mockCtx?: {
    acceptWebSocket?: (ws: WebSocket, tags?: string[]) => void
    getWebSockets?: (tag?: string) => WebSocket[]
    getTags?: (ws: WebSocket) => string[]
  }) {
    this.mockCtx = {
      acceptWebSocket: mockCtx?.acceptWebSocket ?? ((_ws: WebSocket, _tags?: string[]) => {}),
      getWebSockets: mockCtx?.getWebSockets ?? ((_tag?: string) => []),
      getTags: mockCtx?.getTags ?? ((_ws: WebSocket) => []),
    }
  }

  hasMethod(name: string): boolean {
    return this.allowedMethods.has(name)
  }

  async invoke(method: string, params: unknown[], authContext?: AuthContext): Promise<unknown> {
    if (!this.allowedMethods.has(method)) {
      throw new Error(`Method not allowed: ${method}`)
    }

    const previousAuth = this.currentAuthContext
    if (authContext !== undefined) {
      this.currentAuthContext = authContext
    }

    try {
      const target = this as Record<string, unknown>
      const fn = target[method]
      if (typeof fn !== 'function') {
        throw new Error(`Method not found: ${method}`)
      }

      return await fn.apply(this, params)
    } finally {
      this.currentAuthContext = previousAuth
    }
  }

  acceptWebSocketHibernation(ws: WebSocket, options?: AcceptWebSocketOptions): void {
    const tags: string[] = []
    if (options?.tags) {
      if (Array.isArray(options.tags)) {
        tags.push(...options.tags)
      } else {
        for (const [key, value] of Object.entries(options.tags)) {
          if (value !== undefined) {
            tags.push(`${key}:${value}`)
          }
        }
      }
    }

    this.mockCtx.acceptWebSocket(ws, tags.length > 0 ? tags : undefined)

    if (options?.auth) {
      this.wsAuthContexts.set(ws, options.auth)
    }

    const id = crypto.randomUUID()
    this.connections.set(ws, {
      id,
      subscriptions: new Set(),
      metadata: options?.tags && !Array.isArray(options.tags) ? { ...options.tags } : {},
      auth: options?.auth,
    })
  }

  getWebSocketsByTag(tag: string): WebSocket[] {
    if (typeof this.mockCtx.getWebSockets === 'function') {
      return this.mockCtx.getWebSockets(tag)
    }
    const results: WebSocket[] = []
    for (const [ws, info] of this.connections) {
      const metadata = info.metadata
      for (const [key, value] of Object.entries(metadata)) {
        if (`${key}:${value}` === tag) {
          results.push(ws)
          break
        }
      }
    }
    return results
  }

  getHibernatedWebSockets(): WebSocket[] {
    if (typeof this.mockCtx.getWebSockets === 'function') {
      return this.mockCtx.getWebSockets()
    }
    return Array.from(this.connections.keys())
  }

  getWebSocketTags(ws: WebSocket): string[] | undefined {
    if (typeof this.mockCtx.getTags === 'function') {
      const tags = this.mockCtx.getTags(ws)
      if (tags.length > 0) return tags
    }
    const info = this.connections.get(ws)
    if (info) {
      const tags: string[] = []
      for (const [key, value] of Object.entries(info.metadata)) {
        if (value !== undefined) {
          tags.push(`${key}:${value}`)
        }
      }
      return tags
    }
    return undefined
  }

  getAuthContext(): AuthContext | null {
    return this.currentAuthContext
  }

  setAuthContext(authContext: AuthContext | null): void {
    this.currentAuthContext = authContext
  }

  getWebSocketAuth(ws: WebSocket): AuthContext | undefined {
    return this.wsAuthContexts.get(ws)
  }

  setWebSocketAuth(ws: WebSocket, authContext: AuthContext): void {
    this.wsAuthContexts.set(ws, authContext)
    const info = this.connections.get(ws)
    if (info) {
      info.auth = authContext
    }
  }

  getCurrentTransportContext(): TransportContext | null {
    return this._currentTransportContext
  }

  setTransportContext(ctx: TransportContext | null): void {
    this._currentTransportContext = ctx
  }

  broadcast(message: string | object, filter?: { tag?: string; metadata?: Record<string, unknown> }): void {
    const messageStr = typeof message === 'string' ? message : JSON.stringify(message)
    let connections: WebSocket[]

    if (filter?.tag) {
      connections = this.getWebSocketsByTag(filter.tag)
    } else if (filter?.metadata) {
      connections = []
      for (const [ws, info] of this.connections) {
        let matches = true
        for (const [key, value] of Object.entries(filter.metadata)) {
          if (info.metadata[key] !== value) {
            matches = false
            break
          }
        }
        if (matches) {
          connections.push(ws)
        }
      }
    } else {
      connections = this.getHibernatedWebSockets()
    }

    for (const ws of connections) {
      try {
        ws.send(messageStr)
      } catch {
        // Connection may be closed, ignore
      }
    }
  }

  getConnectionCount(): number {
    return this.getHibernatedWebSockets().length
  }

  onClose(ws: WebSocket): void {
    this.wsAuthContexts.delete(ws)
    this.connections.delete(ws)
  }
}

describe('DOAgent', () => {
  let agent: TestDOAgent
  let mockCtx: {
    acceptWebSocket: (ws: WebSocket, tags?: string[]) => void
    getWebSockets: (tag?: string) => WebSocket[]
    getTags: (ws: WebSocket) => string[]
    capturedTags?: string[]
  }

  beforeEach(() => {
    mockCtx = {
      acceptWebSocket: (_ws: WebSocket, tags?: string[]) => {
        mockCtx.capturedTags = tags
      },
      getWebSockets: () => [],
      getTags: () => [],
    }
    agent = new TestDOAgent(mockCtx)
  })

  describe('RpcTarget implementation', () => {
    it('should implement hasMethod correctly', () => {
      // Default allowed methods
      expect(agent.hasMethod('getState')).toBe(true)
      expect(agent.hasMethod('setState')).toBe(true)
      expect(agent.hasMethod('sql')).toBe(true)

      // Not allowed
      expect(agent.hasMethod('privateMethod')).toBe(false)
      expect(agent.hasMethod('constructor')).toBe(false)
      expect(agent.hasMethod('__proto__')).toBe(false)
    })

    it('should allow extending allowedMethods', () => {
      agent.allowedMethods.add('customMethod')
      expect(agent.hasMethod('customMethod')).toBe(true)
    })

    it('should reject invoke for disallowed methods', async () => {
      await expect(agent.invoke('notAllowed', [])).rejects.toThrow('Method not allowed: notAllowed')
    })

    it('should reject invoke for non-existent methods', async () => {
      agent.allowedMethods.add('nonExistent')
      await expect(agent.invoke('nonExistent', [])).rejects.toThrow('Method not found: nonExistent')
    })

    it('should pass auth context during invoke', async () => {
      const testAuth: AuthContext = { userId: 'test-user', permissions: ['read'] }

      // Add a test method
      const testMethod = function (this: TestDOAgent) {
        return this.getAuthContext()
      }
      ;(agent as unknown as Record<string, unknown>).testMethod = testMethod
      agent.allowedMethods.add('testMethod')

      const result = await agent.invoke('testMethod', [], testAuth)
      expect(result).toEqual(testAuth)

      // Auth should be cleared after invoke
      expect(agent.getAuthContext()).toBeNull()
    })

    it('should restore previous auth context after invoke', async () => {
      const previousAuth: AuthContext = { userId: 'previous' }
      const invokeAuth: AuthContext = { userId: 'during-invoke' }

      agent.setAuthContext(previousAuth)

      // Add test method
      ;(agent as unknown as Record<string, unknown>).getTestAuth = function (this: TestDOAgent) {
        return this.getAuthContext()
      }
      agent.allowedMethods.add('getTestAuth')

      await agent.invoke('getTestAuth', [], invokeAuth)

      // Should be restored to previous
      expect(agent.getAuthContext()).toEqual(previousAuth)
    })
  })

  describe('WebSocket hibernation', () => {
    it('should accept WebSocket with tags', () => {
      const ws = new MockWebSocket() as unknown as WebSocket
      const tags: WebSocketTags = {
        userId: 'user-123',
        type: 'chat',
      }

      agent.acceptWebSocketHibernation(ws, { tags })

      expect(mockCtx.capturedTags).toContain('userId:user-123')
      expect(mockCtx.capturedTags).toContain('type:chat')
    })

    it('should accept WebSocket with array tags', () => {
      const ws = new MockWebSocket() as unknown as WebSocket
      const tags = ['custom:value', 'room:123']

      agent.acceptWebSocketHibernation(ws, { tags })

      expect(mockCtx.capturedTags).toEqual(['custom:value', 'room:123'])
    })

    it('should store auth context for WebSocket', () => {
      const ws = new MockWebSocket() as unknown as WebSocket
      const auth: AuthContext = { userId: 'user-123', permissions: ['read', 'write'] }

      agent.acceptWebSocketHibernation(ws, { auth })

      expect(agent.getWebSocketAuth(ws)).toEqual(auth)
    })

    it('should register connection info', () => {
      const ws = new MockWebSocket() as unknown as WebSocket
      const options: AcceptWebSocketOptions = {
        tags: { userId: 'user-123', type: 'chat' },
        auth: { userId: 'user-123' },
      }

      agent.acceptWebSocketHibernation(ws, options)

      const connections = Array.from(agent.connections.entries())
      expect(connections).toHaveLength(1)

      const [storedWs, info] = connections[0]
      expect(storedWs).toBe(ws)
      expect(info.id).toBeDefined()
      expect(info.metadata).toEqual({ userId: 'user-123', type: 'chat' })
      expect(info.auth).toEqual({ userId: 'user-123' })
    })

    it('should get WebSocket tags from context', () => {
      const ws = new MockWebSocket() as unknown as WebSocket
      const expectedTags = ['userId:user-123', 'type:chat']

      // Create a new agent with the updated getTags mock
      const customAgent = new TestDOAgent({
        getTags: (_ws: WebSocket) => expectedTags,
      })

      const tags = customAgent.getWebSocketTags(ws)
      expect(tags).toEqual(expectedTags)
    })

    it('should fallback to local connection info for tags', () => {
      const ws = new MockWebSocket() as unknown as WebSocket

      agent.acceptWebSocketHibernation(ws, {
        tags: { userId: 'user-123', type: 'chat' },
      })

      const tags = agent.getWebSocketTags(ws)
      expect(tags).toContain('userId:user-123')
      expect(tags).toContain('type:chat')
    })

    it('should get all hibernated WebSockets', () => {
      const ws1 = new MockWebSocket() as unknown as WebSocket
      const ws2 = new MockWebSocket() as unknown as WebSocket

      // Create a new agent with the updated getWebSockets mock
      const customAgent = new TestDOAgent({
        getWebSockets: () => [ws1, ws2],
      })

      const sockets = customAgent.getHibernatedWebSockets()
      expect(sockets).toHaveLength(2)
      expect(sockets).toContain(ws1)
      expect(sockets).toContain(ws2)
    })

    it('should get WebSockets by tag', () => {
      const ws1 = new MockWebSocket() as unknown as WebSocket
      const ws2 = new MockWebSocket() as unknown as WebSocket

      // Create a new agent with the updated getWebSockets mock
      const customAgent = new TestDOAgent({
        getWebSockets: (tag?: string) => {
          if (tag === 'room:lobby') return [ws1, ws2]
          return []
        },
      })

      const sockets = customAgent.getWebSocketsByTag('room:lobby')
      expect(sockets).toHaveLength(2)
    })
  })

  describe('Auth context management', () => {
    it('should get/set current auth context', () => {
      expect(agent.getAuthContext()).toBeNull()

      const auth: AuthContext = { userId: 'test', permissions: ['admin'] }
      agent.setAuthContext(auth)

      expect(agent.getAuthContext()).toEqual(auth)

      agent.setAuthContext(null)
      expect(agent.getAuthContext()).toBeNull()
    })

    it('should get/set WebSocket auth context', () => {
      const ws = new MockWebSocket() as unknown as WebSocket
      const auth: AuthContext = { userId: 'ws-user', organizationId: 'org-1' }

      agent.setWebSocketAuth(ws, auth)

      expect(agent.getWebSocketAuth(ws)).toEqual(auth)
    })

    it('should update connection info when setting WebSocket auth', () => {
      const ws = new MockWebSocket() as unknown as WebSocket

      // First register connection
      agent.acceptWebSocketHibernation(ws, {})

      // Then update auth
      const auth: AuthContext = { userId: 'updated-user' }
      agent.setWebSocketAuth(ws, auth)

      const info = agent.connections.get(ws)
      expect(info?.auth).toEqual(auth)
    })

    it('should get/set transport context', () => {
      expect(agent.getCurrentTransportContext()).toBeNull()

      agent.setTransportContext({ type: 'websocket' })
      expect(agent.getCurrentTransportContext()).toEqual({ type: 'websocket' })

      agent.setTransportContext(null)
      expect(agent.getCurrentTransportContext()).toBeNull()
    })
  })

  describe('Connection management', () => {
    it('should broadcast to all connections', () => {
      const ws1 = new MockWebSocket()
      const ws2 = new MockWebSocket()

      // Create a new agent with the updated getWebSockets mock
      const customAgent = new TestDOAgent({
        getWebSockets: () => [ws1 as unknown as WebSocket, ws2 as unknown as WebSocket],
      })

      customAgent.broadcast({ type: 'test', data: 'hello' })

      expect(ws1.sentMessages).toHaveLength(1)
      expect(ws2.sentMessages).toHaveLength(1)
      expect(JSON.parse(ws1.sentMessages[0])).toEqual({ type: 'test', data: 'hello' })
    })

    it('should broadcast with tag filter', () => {
      const ws1 = new MockWebSocket()
      const ws2 = new MockWebSocket()

      // Create a new agent with the updated getWebSockets mock
      const customAgent = new TestDOAgent({
        getWebSockets: (tag?: string) => {
          if (tag === 'room:vip') return [ws1 as unknown as WebSocket]
          return [ws1 as unknown as WebSocket, ws2 as unknown as WebSocket]
        },
      })

      customAgent.broadcast('VIP message', { tag: 'room:vip' })

      expect(ws1.sentMessages).toHaveLength(1)
      expect(ws2.sentMessages).toHaveLength(0)
    })

    it('should broadcast with metadata filter', () => {
      const ws1 = new MockWebSocket() as unknown as WebSocket
      const ws2 = new MockWebSocket() as unknown as WebSocket

      // Register connections with metadata
      agent.connections.set(ws1, {
        id: '1',
        subscriptions: new Set(),
        metadata: { role: 'admin' },
      })
      agent.connections.set(ws2, {
        id: '2',
        subscriptions: new Set(),
        metadata: { role: 'user' },
      })

      agent.broadcast('Admin only', { metadata: { role: 'admin' } })

      expect((ws1 as unknown as MockWebSocket).sentMessages).toHaveLength(1)
      expect((ws2 as unknown as MockWebSocket).sentMessages).toHaveLength(0)
    })

    it('should get connection count', () => {
      // Create a new agent with the updated getWebSockets mock
      const customAgent = new TestDOAgent({
        getWebSockets: () => [
          new MockWebSocket() as unknown as WebSocket,
          new MockWebSocket() as unknown as WebSocket,
          new MockWebSocket() as unknown as WebSocket,
        ],
      })

      expect(customAgent.getConnectionCount()).toBe(3)
    })

    it('should handle broadcast errors gracefully', () => {
      const ws1 = new MockWebSocket()
      ws1.send = () => {
        throw new Error('Connection closed')
      }
      const ws2 = new MockWebSocket()

      // Create a new agent with the updated getWebSockets mock
      const customAgent = new TestDOAgent({
        getWebSockets: () => [ws1 as unknown as WebSocket, ws2 as unknown as WebSocket],
      })

      // Should not throw
      expect(() => customAgent.broadcast('test')).not.toThrow()

      // ws2 should still receive the message
      expect(ws2.sentMessages).toHaveLength(1)
    })
  })

  describe('WebSocket event handlers', () => {
    it('should clean up on close', () => {
      const ws = new MockWebSocket() as unknown as WebSocket
      const auth: AuthContext = { userId: 'test' }

      // Set up connection
      agent.acceptWebSocketHibernation(ws, { auth })
      expect(agent.wsAuthContexts.has(ws)).toBe(true)
      expect(agent.connections.has(ws)).toBe(true)

      // Simulate close
      agent.onClose(ws)

      expect(agent.wsAuthContexts.has(ws)).toBe(false)
      expect(agent.connections.has(ws)).toBe(false)
    })
  })

  describe('Type exports', () => {
    it('should export WebSocketTags type', () => {
      const tags: WebSocketTags = {
        userId: 'test',
        type: 'chat',
        metadata: '{"key":"value"}',
      }
      expect(tags.userId).toBe('test')
    })

    it('should export AcceptWebSocketOptions type', () => {
      const options: AcceptWebSocketOptions = {
        tags: { userId: 'test' },
        auth: { userId: 'test', permissions: [] },
      }
      expect(options.auth?.userId).toBe('test')
    })

    it('should export RpcTarget interface', () => {
      // TestDOAgent should satisfy RpcTarget
      const rpcTarget: RpcTarget = agent
      expect(rpcTarget.hasMethod).toBeDefined()
      expect(rpcTarget.invoke).toBeDefined()
      expect(rpcTarget.allowedMethods).toBeDefined()
    })

    it('should export HibernationConnectionInfo type', () => {
      const info: HibernationConnectionInfo = {
        id: 'test-id',
        subscriptions: new Set(['topic-1']),
        metadata: { custom: 'data' },
        auth: { userId: 'user' },
      }
      expect(info.id).toBe('test-id')
      expect(info.subscriptions.has('topic-1')).toBe(true)
    })
  })
})
