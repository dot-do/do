/**
 * Agents Module - Extended Agent Support
 *
 * Extends the Cloudflare agents package Agent class with:
 * - WebSocket hibernation support (acceptWebSocket with tags)
 * - Cap'n Proto web (RPC target) integration
 * - Integration with DO class features
 *
 * @module @dotdo/do/agents
 */

import { Agent as CloudflareAgent, type AgentContext, type Connection } from 'agents'
import type { AuthContext, TransportContext } from '../types'

/**
 * WebSocket hibernation tags for connection metadata persistence
 */
export interface WebSocketTags {
  /** User ID for the connection */
  userId?: string
  /** Organization ID for the connection */
  organizationId?: string
  /** Connection type identifier */
  type?: string
  /** Custom metadata as JSON string */
  metadata?: string
}

/**
 * Options for accepting a WebSocket with hibernation
 */
export interface AcceptWebSocketOptions {
  /** Tags to persist across hibernation cycles */
  tags?: WebSocketTags | string[]
  /** Auth context for the connection */
  auth?: AuthContext
}

/**
 * RPC invocable interface for Cap'n Proto web style invocation
 * Named differently from RpcTarget in @dotdo/rpc to avoid conflicts
 */
export interface RpcInvocable {
  /** Check if a method is allowed to be invoked */
  hasMethod(name: string): boolean
  /** Invoke a method by name with params and optional auth */
  invoke(method: string, params: unknown[], authContext?: AuthContext): Promise<unknown>
  /** Set of allowed method names */
  allowedMethods: Set<string>
}

/**
 * Connection info stored in hibernation-aware maps
 */
export interface HibernationConnectionInfo {
  /** Unique connection ID */
  id: string
  /** Topic subscriptions */
  subscriptions: Set<string>
  /** Connection metadata */
  metadata: Record<string, unknown>
  /** Auth context for this connection */
  auth?: AuthContext
}

/**
 * Extended Agent class with WebSocket hibernation and RPC support
 *
 * This class bridges the Cloudflare agents package with @dotdo/do functionality:
 * - Implements RpcInvocable for Cap'n Proto web style method invocation
 * - Provides WebSocket hibernation support with tag-based metadata persistence
 * - Integrates with DO's auth context system
 *
 * @example
 * ```typescript
 * import { DOAgent } from '@dotdo/do/agents'
 *
 * export class MyAgent extends DOAgent<Env> {
 *   // Add custom methods to allowedMethods
 *   allowedMethods = new Set([...super.allowedMethods, 'myCustomMethod'])
 *
 *   async myCustomMethod(data: unknown) {
 *     return { processed: data }
 *   }
 * }
 * ```
 */
export class DOAgent<Env = unknown, State = unknown>
  extends CloudflareAgent<Env, State>
  implements RpcInvocable
{
  /**
   * Connection tracking for hibernation-aware connections
   * Maps WebSocket to connection info that persists across hibernation
   */
  connections: Map<WebSocket, HibernationConnectionInfo> = new Map()

  /**
   * Topic subscriptions for pub/sub messaging
   * Maps topic names to sets of subscribed WebSockets
   */
  subscribers: Map<string, Set<WebSocket>> = new Map()

  /**
   * Auth contexts per WebSocket connection
   */
  wsAuthContexts: Map<WebSocket, AuthContext> = new Map()

  /**
   * Current auth context for the active request/message
   */
  currentAuthContext: AuthContext | null = null

  /**
   * Current transport context
   */
  private _currentTransportContext: TransportContext | null = null

  /**
   * Allowlist of methods that can be invoked via RPC
   */
  allowedMethods = new Set([
    // Standard agent methods
    'getState',
    'setState',
    'sql',
  ])

  constructor(ctx: AgentContext, env: Env) {
    super(ctx, env)
  }

  // ============================================
  // RpcTarget Implementation
  // ============================================

  /**
   * Check if a method is allowed to be invoked via RPC
   */
  hasMethod(name: string): boolean {
    return this.allowedMethods.has(name)
  }

  /**
   * Invoke a method by name with optional auth context
   */
  async invoke(method: string, params: unknown[], authContext?: AuthContext): Promise<unknown> {
    if (!this.allowedMethods.has(method)) {
      throw new Error(`Method not allowed: ${method}`)
    }

    // Set auth context for this invocation
    const previousAuth = this.currentAuthContext
    if (authContext !== undefined) {
      this.currentAuthContext = authContext
    }

    try {
      // Use indexed access - safe because we verified method is allowed
      const target = this as Record<string, unknown>
      const fn = target[method]
      if (typeof fn !== 'function') {
        throw new Error(`Method not found: ${method}`)
      }

      return await fn.apply(this, params)
    } finally {
      // Restore previous auth context
      this.currentAuthContext = previousAuth
    }
  }

  // ============================================
  // WebSocket Hibernation Support
  // ============================================

  /**
   * Accept a WebSocket connection with hibernation support
   *
   * This method wraps the DurableObject's acceptWebSocket with tag support
   * for persisting connection metadata across hibernation cycles.
   *
   * @param ws - The WebSocket to accept
   * @param options - Options including tags and auth context
   *
   * @example
   * ```typescript
   * // In your fetch handler
   * const pair = new WebSocketPair()
   * const [client, server] = Object.values(pair)
   *
   * this.acceptWebSocketHibernation(server, {
   *   tags: { userId: 'user-123', type: 'chat' },
   *   auth: { userId: 'user-123', permissions: ['read', 'write'] }
   * })
   *
   * return new Response(null, { status: 101, webSocket: client })
   * ```
   */
  acceptWebSocketHibernation(ws: WebSocket, options?: AcceptWebSocketOptions): void {
    // Convert tags to string array format for Cloudflare hibernation API
    const tags: string[] = []
    if (options?.tags) {
      if (Array.isArray(options.tags)) {
        tags.push(...options.tags)
      } else {
        // Convert WebSocketTags object to string array
        for (const [key, value] of Object.entries(options.tags)) {
          if (value !== undefined) {
            tags.push(`${key}:${value}`)
          }
        }
      }
    }

    // Accept the WebSocket with hibernation tags
    // The ctx.acceptWebSocket method accepts tags for hibernation
    const doState = this.ctx as unknown as { acceptWebSocket: (ws: WebSocket, tags?: string[]) => void }
    if (typeof doState.acceptWebSocket === 'function') {
      doState.acceptWebSocket(ws, tags.length > 0 ? tags : undefined)
    }

    // Store auth context for this connection
    if (options?.auth) {
      this.wsAuthContexts.set(ws, options.auth)
    }

    // Register connection info
    const id = crypto.randomUUID()
    this.connections.set(ws, {
      id,
      subscriptions: new Set(),
      metadata: options?.tags && !Array.isArray(options.tags) ? { ...options.tags } : {},
      auth: options?.auth,
    })
  }

  /**
   * Get WebSockets by tag for hibernation-aware queries
   *
   * Uses the Cloudflare hibernation API to retrieve connections by tag.
   *
   * @param tag - The tag to search for (e.g., 'userId:user-123')
   * @returns Array of WebSocket connections matching the tag
   */
  getWebSocketsByTag(tag: string): WebSocket[] {
    const doState = this.ctx as unknown as { getWebSockets: (tag?: string) => WebSocket[] }
    if (typeof doState.getWebSockets === 'function') {
      return doState.getWebSockets(tag)
    }
    // Fallback: search local connections map
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

  /**
   * Get all hibernated WebSocket connections
   *
   * @returns Array of all WebSocket connections managed by this DO
   */
  getHibernatedWebSockets(): WebSocket[] {
    const doState = this.ctx as unknown as { getWebSockets: (tag?: string) => WebSocket[] }
    if (typeof doState.getWebSockets === 'function') {
      return doState.getWebSockets()
    }
    return Array.from(this.connections.keys())
  }

  /**
   * Get tags for a WebSocket connection
   *
   * @param ws - The WebSocket to get tags for
   * @returns Array of tags, or undefined if not found
   */
  getWebSocketTags(ws: WebSocket): string[] | undefined {
    const doState = this.ctx as unknown as { getTags: (ws: WebSocket) => string[] }
    if (typeof doState.getTags === 'function') {
      return doState.getTags(ws)
    }
    // Fallback: reconstruct from local connection info
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

  // ============================================
  // Auth Context Methods
  // ============================================

  /**
   * Get the current auth context
   */
  getAuthContext(): AuthContext | null {
    return this.currentAuthContext
  }

  /**
   * Set the current auth context
   */
  setAuthContext(authContext: AuthContext | null): void {
    this.currentAuthContext = authContext
  }

  /**
   * Get auth context for a specific WebSocket
   */
  getWebSocketAuth(ws: WebSocket): AuthContext | undefined {
    return this.wsAuthContexts.get(ws)
  }

  /**
   * Set auth context for a specific WebSocket
   */
  setWebSocketAuth(ws: WebSocket, authContext: AuthContext): void {
    this.wsAuthContexts.set(ws, authContext)
    // Also update connection info
    const info = this.connections.get(ws)
    if (info) {
      info.auth = authContext
    }
  }

  /**
   * Get the current transport context
   */
  getCurrentTransportContext(): TransportContext | null {
    return this._currentTransportContext
  }

  /**
   * Set the current transport context
   */
  setTransportContext(ctx: TransportContext | null): void {
    this._currentTransportContext = ctx
  }

  // ============================================
  // Connection Management
  // ============================================

  /**
   * Broadcast a message to all connections, optionally filtered
   *
   * @param message - Message to broadcast (string or will be JSON.stringified)
   * @param filter - Optional filter by tag or metadata
   */
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

  /**
   * Get the count of active connections
   */
  getConnectionCount(): number {
    return this.getHibernatedWebSockets().length
  }

  // ============================================
  // WebSocket Event Handlers (for subclass override)
  // ============================================

  /**
   * Handle incoming WebSocket message
   *
   * Override this method to handle messages. The base implementation
   * parses JSON-RPC style messages and routes to allowed methods.
   */
  async onMessage(connection: Connection, message: string | ArrayBuffer): Promise<void> {
    // Get the underlying WebSocket from the Connection
    // The Connection type from partyserver wraps a WebSocket
    const ws = (connection as unknown as { socket?: WebSocket }).socket ?? connection as unknown as WebSocket

    let messageStr: string
    if (message instanceof ArrayBuffer) {
      messageStr = new TextDecoder().decode(message)
    } else {
      messageStr = message
    }

    try {
      const parsed = JSON.parse(messageStr) as {
        id?: string | number
        method?: string
        params?: unknown[]
        auth?: AuthContext
        type?: string
      }

      // Handle RPC-style messages
      if (parsed.method && this.allowedMethods.has(parsed.method)) {
        const params = Array.isArray(parsed.params) ? parsed.params : []
        const auth = parsed.auth ?? this.wsAuthContexts.get(ws)

        try {
          const result = await this.invoke(parsed.method, params, auth)
          if (parsed.id !== undefined) {
            ws.send(JSON.stringify({ id: parsed.id, result }))
          }
        } catch (err) {
          if (parsed.id !== undefined) {
            ws.send(JSON.stringify({
              id: parsed.id,
              error: err instanceof Error ? err.message : 'Unknown error'
            }))
          }
        }
      }
    } catch {
      // Not JSON or not an RPC message, subclass can handle
    }
  }

  /**
   * Handle WebSocket close event
   */
  onClose(connection: Connection, code: number, reason: string, wasClean: boolean): void {
    const ws = (connection as unknown as { socket?: WebSocket }).socket ?? connection as unknown as WebSocket
    this.wsAuthContexts.delete(ws)
    this.connections.delete(ws)
  }

  /**
   * Handle WebSocket error
   */
  override onError(connectionOrError: Connection | unknown, error?: unknown): void | Promise<void> {
    // Handle both signatures: onError(connection, error) and onError(error)
    if (error !== undefined) {
      console.error('WebSocket error:', error)
    } else {
      console.error('WebSocket error:', connectionOrError)
    }
  }
}

// Re-export types from the agents package
export type { AgentContext, Connection } from 'agents'
export {
  Agent,
  routeAgentRequest,
  routeAgentEmail,
  getAgentByName,
  StreamingResponse,
  unstable_callable,
  unstable_context,
} from 'agents'
export type {
  AgentNamespace,
  AgentOptions,
  Schedule,
  RPCRequest,
  RPCResponse,
  CallableMetadata,
  StateUpdateMessage,
} from 'agents'
