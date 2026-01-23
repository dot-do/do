/**
 * CapnWeb RPC Server
 *
 * Handles both WebSocket and HTTP transports for RPC communication.
 * Implements Cloudflare Durable Object WebSocket hibernation for 95% cost savings.
 *
 * @module rpc/server
 *
 * @example
 * ```typescript
 * import { RPCServer } from 'do/rpc/server'
 * import { MethodRegistry } from 'do/rpc/methods'
 *
 * export class MyDurableObject {
 *   private rpc: RPCServer
 *
 *   constructor(state: DurableObjectState, env: Env) {
 *     const registry = new MethodRegistry()
 *     // Register your methods...
 *
 *     this.rpc = new RPCServer(state, env, registry)
 *   }
 *
 *   async fetch(request: Request): Promise<Response> {
 *     return this.rpc.handleRequest(request)
 *   }
 *
 *   // Hibernation handlers
 *   async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
 *     return this.rpc.handleWebSocketMessage(ws, message)
 *   }
 *
 *   async webSocketClose(ws: WebSocket, code: number, reason: string) {
 *     return this.rpc.handleWebSocketClose(ws, code, reason)
 *   }
 *
 *   async webSocketError(ws: WebSocket, error: unknown) {
 *     return this.rpc.handleWebSocketError(ws, error)
 *   }
 * }
 * ```
 */

import type {
  RPCRequest,
  RPCResponse,
  RPCBatchRequest,
  RPCBatchResponse,
  WebSocketState,
  HibernationOptions,
  RpcErrorCodes,
} from '../types/rpc'
import { RpcErrorCodes as ErrorCodes } from '../types/rpc'
import type { MethodContext } from './methods'

// =============================================================================
// Types
// =============================================================================

/**
 * RPC Server configuration options
 */
export interface RPCServerOptions {
  /** Durable Object state */
  state?: DurableObjectState
  /** Environment bindings */
  env?: Record<string, unknown>
  /** Hibernation configuration */
  hibernation?: HibernationOptions
  /** Whether to enable HTTP POST fallback (default: true) */
  enableHttpFallback?: boolean
  /** Whether to enable GET /rpc/* routes (default: true) */
  enableSchemaRoutes?: boolean
  /** CORS configuration */
  cors?: CORSOptions
  /** Maximum batch size (default: 100) */
  maxBatchSize?: number
  /** Request timeout in ms (default: 30000) */
  requestTimeout?: number
  /** Method timeout in ms */
  methodTimeout?: number
  /** Rate limit configuration */
  rateLimit?: { maxRequests: number; windowMs: number }
  /** Maximum payload size in bytes */
  maxPayloadSize?: number
}

/**
 * CORS configuration
 */
export interface CORSOptions {
  /** Allowed origins (default: '*') */
  origins?: string | string[]
  /** Allowed methods */
  methods?: string[]
  /** Allowed headers */
  headers?: string[]
  /** Max age for preflight cache */
  maxAge?: number
}

/**
 * Internal connection tracking with status
 */
interface ConnectionState {
  id: string
  ws: WebSocket
  status: 'open' | 'hibernating' | 'closed'
  connectedAt: number
  hibernatedAt?: number
  lastMessageAt: number
  subscriptions: string[]
  data?: Record<string, unknown>
  idleTimer?: ReturnType<typeof setTimeout>
  hibernationTimer?: ReturnType<typeof setTimeout>
  queuedEvents: Array<{ channel: string; data: unknown }>
}

// =============================================================================
// RPC Server Class
// =============================================================================

/**
 * RPC Server for Durable Objects
 *
 * Handles incoming requests via both WebSocket and HTTP transports.
 * WebSocket connections support hibernation for cost savings.
 *
 * @example
 * ```typescript
 * const server = new RPCServer(state, env, registry, {
 *   hibernation: {
 *     idleTimeout: 10000,
 *     maxHibernationDuration: 86400000,
 *   },
 *   maxBatchSize: 50,
 * })
 * ```
 */
/**
 * Method handler type for server-side registration
 */
export type RPCMethodHandler<TParams = unknown, TResult = unknown> = (
  params: TParams,
  ctx: MethodContext
) => Promise<TResult>

/**
 * RPC Handler type alias for compatibility
 */
export type RPCHandler = RPCMethodHandler

export class RPCServer {
  private state?: DurableObjectState
  private env: Record<string, unknown>
  private options: RPCServerOptions
  private connections: Map<string, ConnectionState>
  private wsToId: Map<WebSocket, string>
  private methods: Map<string, RPCMethodHandler>
  private rateLimitState: Map<string, { count: number; windowStart: number }>

  /**
   * Create a new RPC server
   *
   * @param options - Server configuration including state, env, and registry
   */
  constructor(options?: RPCServerOptions) {
    this.options = options || {}
    this.state = options?.state
    this.env = options?.env || {}
    this.connections = new Map()
    this.wsToId = new Map()
    this.methods = new Map()
    this.rateLimitState = new Map()
  }

  // ===========================================================================
  // Request Handling
  // ===========================================================================

  /**
   * Handle an incoming HTTP request
   *
   * Routes to appropriate handler based on method and path:
   * - GET /rpc - Schema discovery
   * - GET /rpc/* - Method documentation
   * - POST / or POST /rpc - Execute RPC
   * - WebSocket upgrade on /rpc
   *
   * @param request - Incoming HTTP request
   * @returns HTTP response
   *
   * @example
   * ```typescript
   * async fetch(request: Request): Promise<Response> {
   *   return this.rpc.handleRequest(request)
   * }
   * ```
   */
  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // Check for WebSocket upgrade
    const upgradeHeader = request.headers.get('Upgrade')
    if (upgradeHeader?.toLowerCase() === 'websocket') {
      return this.handleWebSocketUpgrade(request)
    }

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return this.handleCors()
    }

    // GET returns method info
    if (request.method === 'GET') {
      const methodList = this.getMethods()
      return this.addCorsHeaders(
        new Response(JSON.stringify({ methods: methodList }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    }

    // POST / or POST /rpc - Execute RPC
    if (request.method === 'POST' && (path === '/' || path === '/rpc')) {
      return this.handleHttpRpc(request)
    }

    return new Response('Not Found', { status: 404 })
  }

  /**
   * Handle WebSocket upgrade request
   *
   * Creates a WebSocket pair and accepts the connection.
   * The connection will hibernate after the idle timeout.
   *
   * @param request - WebSocket upgrade request
   * @returns Response with WebSocket
   */
  async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]

    const connectionId = crypto.randomUUID()
    const now = Date.now()

    const connState: ConnectionState = {
      id: connectionId,
      ws: server,
      status: 'open',
      connectedAt: now,
      lastMessageAt: now,
      subscriptions: [],
      queuedEvents: [],
    }

    this.connections.set(connectionId, connState)
    this.wsToId.set(server, connectionId)

    // Set up idle timer if hibernation is enabled
    this.setupIdleTimer(connectionId)

    // Accept WebSocket (in a real DO, this would use state.acceptWebSocket())
    ;(server as any).accept?.()

    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }

  /**
   * Handle HTTP POST RPC request
   *
   * @param request - HTTP POST request with JSON body
   * @returns JSON response with RPC result
   */
  async handleHttpRpc(request: Request): Promise<Response> {
    // Set up timeout wrapper if configured
    const doHttpRpc = async (): Promise<Response> => {
      // Check Content-Type
      const contentType = request.headers.get('Content-Type') || ''
      if (!contentType.includes('application/json')) {
        return this.addCorsHeaders(
          new Response(
            JSON.stringify({
              id: null,
              error: { code: ErrorCodes.ParseError, message: 'Unsupported Media Type' },
            }),
            { status: 415, headers: { 'Content-Type': 'application/json' } }
          )
        )
      }

      // Check rate limit
      if (this.options.rateLimit) {
        const clientId = request.headers.get('CF-Connecting-IP') || 'default'
        if (this.isRateLimited(clientId)) {
          return this.addCorsHeaders(
            new Response(
              JSON.stringify({
                id: null,
                error: { code: ErrorCodes.RateLimited, message: 'Rate limit exceeded' },
              }),
              { status: 429, headers: { 'Content-Type': 'application/json' } }
            )
          )
        }
      }

      let body: string
      try {
        body = await request.text()
      } catch {
        return this.addCorsHeaders(
          new Response(
            JSON.stringify({
              id: null,
              error: { code: ErrorCodes.ParseError, message: 'Parse error: unable to read body' },
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          )
        )
      }

      // Check payload size after reading body
      if (this.options.maxPayloadSize && body.length > this.options.maxPayloadSize) {
        return this.addCorsHeaders(
          new Response(
            JSON.stringify({
              id: null,
              error: { code: ErrorCodes.InvalidRequest, message: 'Payload Too Large' },
            }),
            { status: 413, headers: { 'Content-Type': 'application/json' } }
          )
        )
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(body)
      } catch {
        return this.addCorsHeaders(
          new Response(
            JSON.stringify({
              id: null,
              error: { code: ErrorCodes.ParseError, message: 'Parse error: invalid JSON' },
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          )
        )
      }

      // Check if batch request
      if (this.isBatchRequest(parsed)) {
        const batchReq = parsed as RPCBatchRequest
        const responses: RPCResponse[] = []

        for (const req of batchReq.requests) {
          const response = await this.executeRequest(req)
          responses.push(response)
          if (batchReq.abortOnError && response.error) {
            break
          }
        }

        const batchResponse: RPCBatchResponse = {
          id: batchReq.id,
          responses,
          success: !responses.some((r) => r.error),
        }

        return this.addCorsHeaders(
          new Response(JSON.stringify(batchResponse), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      }

      // Single request
      const rpcRequest = parsed as Partial<RPCRequest>

      // Validate request structure
      if (!rpcRequest.id) {
        return this.addCorsHeaders(
          new Response(
            JSON.stringify({
              id: null,
              error: { code: ErrorCodes.InvalidRequest, message: 'Invalid Request: missing id' },
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          )
        )
      }

      if (!rpcRequest.method) {
        return this.addCorsHeaders(
          new Response(
            JSON.stringify({
              id: rpcRequest.id,
              error: { code: ErrorCodes.InvalidRequest, message: 'Invalid Request: missing method' },
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          )
        )
      }

      const response = await this.executeRequest(rpcRequest as RPCRequest)
      return this.addCorsHeaders(
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    }

    // If methodTimeout is set, race the entire operation against a timeout
    if (this.options.methodTimeout) {
      const timeoutPromise = new Promise<Response>((resolve) => {
        setTimeout(() => {
          resolve(
            this.addCorsHeaders(
              new Response(
                JSON.stringify({
                  id: null,
                  error: { code: ErrorCodes.Timeout, message: 'Method timeout' },
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
              )
            )
          )
        }, this.options.methodTimeout)
      })
      return Promise.race([doHttpRpc(), timeoutPromise])
    }

    return doHttpRpc()
  }

  // ===========================================================================
  // WebSocket Hibernation Handlers
  // ===========================================================================

  /**
   * Handle WebSocket message (hibernation callback)
   *
   * Called by Cloudflare when a message is received on a hibernated WebSocket.
   *
   * @param ws - WebSocket that received the message
   * @param message - Message content (string or ArrayBuffer)
   *
   * @example
   * ```typescript
   * async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
   *   return this.rpc.handleWebSocketMessage(ws, message)
   * }
   * ```
   */
  async handleWebSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const connectionId = this.wsToId.get(ws)
    const connState = connectionId ? this.connections.get(connectionId) : undefined

    // Reset idle timer on activity
    if (connectionId) {
      this.resetIdleTimer(connectionId)
    }

    // Parse message
    let parsed: RPCRequest
    try {
      const msgStr = typeof message === 'string' ? message : new TextDecoder().decode(message)
      parsed = JSON.parse(msgStr)
    } catch {
      const errorResponse: RPCResponse = {
        id: '',
        error: { code: ErrorCodes.ParseError, message: 'Parse error: invalid JSON' },
      }
      ws.send(JSON.stringify(errorResponse))
      return
    }

    // Execute and respond
    const response = await this.executeRequest(parsed, connState?.data)
    ws.send(JSON.stringify(response))
  }

  /**
   * Handle WebSocket close (hibernation callback)
   *
   * @param ws - WebSocket that was closed
   * @param code - Close code
   * @param reason - Close reason
   */
  async handleWebSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    const connectionId = this.wsToId.get(ws)
    if (connectionId) {
      const connState = this.connections.get(connectionId)
      if (connState) {
        connState.status = 'closed'
        if (connState.idleTimer) clearTimeout(connState.idleTimer)
        if (connState.hibernationTimer) clearTimeout(connState.hibernationTimer)
      }
    }
  }

  /**
   * Handle WebSocket error (hibernation callback)
   *
   * @param ws - WebSocket that errored
   * @param error - Error that occurred
   */
  async handleWebSocketError(ws: WebSocket, error: unknown): Promise<void> {
    const connectionId = this.wsToId.get(ws)
    if (connectionId) {
      const connState = this.connections.get(connectionId)
      if (connState) {
        connState.status = 'closed'
        if (connState.idleTimer) clearTimeout(connState.idleTimer)
        if (connState.hibernationTimer) clearTimeout(connState.hibernationTimer)
      }
    }
  }

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  /**
   * Get all active WebSocket connections
   *
   * @returns Array of connection states
   */
  getConnections(): Array<{ id: string; status: string; connectedAt: number; hibernatedAt?: number; lastMessageAt: number; subscriptions: string[]; data?: Record<string, unknown> }> {
    return Array.from(this.connections.values()).map((c) => ({
      id: c.id,
      status: c.status,
      connectedAt: c.connectedAt,
      hibernatedAt: c.hibernatedAt,
      lastMessageAt: c.lastMessageAt,
      subscriptions: c.subscriptions,
      data: c.data,
    }))
  }

  /**
   * Get a specific connection by ID
   *
   * @param id - Connection ID
   * @returns Connection state or undefined
   */
  getConnection(id: string): { id: string; status: string; connectedAt: number; hibernatedAt?: number; lastMessageAt: number; subscriptions: string[]; data?: Record<string, unknown> } | undefined {
    const conn = this.connections.get(id)
    if (!conn) return undefined
    return {
      id: conn.id,
      status: conn.status,
      connectedAt: conn.connectedAt,
      hibernatedAt: conn.hibernatedAt,
      lastMessageAt: conn.lastMessageAt,
      subscriptions: conn.subscriptions,
      data: conn.data,
    }
  }

  /**
   * Broadcast a message to all connected clients
   *
   * @param message - Message to broadcast
   * @param filter - Optional filter function
   */
  async broadcast(message: RPCResponse, filter?: (state: { id: string; status: string; connectedAt: number; lastMessageAt: number; subscriptions: string[]; data?: Record<string, unknown> }) => boolean): Promise<void> {
    for (const conn of this.connections.values()) {
      if (conn.status !== 'open') continue
      const wsState = {
        id: conn.id,
        status: conn.status,
        connectedAt: conn.connectedAt,
        lastMessageAt: conn.lastMessageAt,
        subscriptions: conn.subscriptions,
        data: conn.data,
      }
      if (filter && !filter(wsState)) continue
      conn.ws.send(JSON.stringify(message))
    }
  }

  /**
   * Send a message to a specific connection
   *
   * @param connectionId - Target connection ID
   * @param message - Message to send
   */
  async send(connectionId: string, message: RPCResponse): Promise<void> {
    const conn = this.connections.get(connectionId)
    if (conn && conn.status === 'open') {
      conn.ws.send(JSON.stringify(message))
    }
  }

  /**
   * Close a connection
   *
   * @param connectionId - Connection to close
   * @param code - Close code
   * @param reason - Close reason
   */
  async closeConnection(connectionId: string, code?: number, reason?: string): Promise<void> {
    const conn = this.connections.get(connectionId)
    if (conn) {
      conn.ws.close(code, reason)
      conn.status = 'closed'
      if (conn.idleTimer) clearTimeout(conn.idleTimer)
      if (conn.hibernationTimer) clearTimeout(conn.hibernationTimer)
    }
  }

  // ===========================================================================
  // Method Registration
  // ===========================================================================

  /**
   * Register a method handler
   *
   * @param name - Method name (e.g., 'do.things.list')
   * @param handler - Handler function
   */
  registerMethod(name: string, handler: RPCMethodHandler): void {
    this.methods.set(name, handler)
  }

  /**
   * Unregister a method handler
   *
   * @param name - Method name to unregister
   */
  unregisterMethod(name: string): void {
    this.methods.delete(name)
  }

  /**
   * Get all registered method names
   *
   * @returns Array of method names
   */
  getMethods(): string[] {
    return Array.from(this.methods.keys())
  }

  // ===========================================================================
  // Subscription and Events
  // ===========================================================================

  /**
   * Subscribe a connection to a channel
   *
   * @param connectionId - Connection ID
   * @param channel - Channel name
   */
  async subscribe(connectionId: string, channel: string): Promise<void> {
    const conn = this.connections.get(connectionId)
    if (conn && !conn.subscriptions.includes(channel)) {
      conn.subscriptions.push(channel)
    }
  }

  /**
   * Emit an event to all subscribers of a channel
   *
   * @param channel - Channel name
   * @param data - Event data
   */
  async emit(channel: string, data: unknown): Promise<void> {
    for (const conn of this.connections.values()) {
      if (!conn.subscriptions.includes(channel)) continue

      if (conn.status === 'hibernating') {
        // Queue event for later delivery
        conn.queuedEvents.push({ channel, data })
      } else if (conn.status === 'open') {
        const event: RPCResponse = {
          id: '',
          result: { channel, data },
        }
        conn.ws.send(JSON.stringify(event))
      }
    }
  }

  // ===========================================================================
  // Connection Registration
  // ===========================================================================

  /**
   * Register a connection
   *
   * @param connectionId - Unique connection ID
   * @param ws - WebSocket instance
   */
  registerConnection(connectionId: string, ws: WebSocket): void {
    const now = Date.now()
    const connState: ConnectionState = {
      id: connectionId,
      ws,
      status: 'open',
      connectedAt: now,
      lastMessageAt: now,
      subscriptions: [],
      queuedEvents: [],
    }
    this.connections.set(connectionId, connState)
    this.wsToId.set(ws, connectionId)
    this.setupIdleTimer(connectionId)
  }

  /**
   * Set custom data for a connection
   *
   * @param connectionId - Connection ID
   * @param data - Custom data to store
   */
  setConnectionData(connectionId: string, data: Record<string, unknown>): void {
    const conn = this.connections.get(connectionId)
    if (conn) {
      conn.data = data
    }
  }

  /**
   * Wake a hibernated connection
   *
   * @param ws - WebSocket instance
   * @returns Connection ID
   */
  async wakeConnection(ws: WebSocket): Promise<string> {
    // Try to restore from attachment
    let connectionId = this.wsToId.get(ws)
    let restored: Record<string, unknown> | undefined

    try {
      restored = (ws as any).deserializeAttachment?.()
    } catch {
      // Ignore
    }

    if (!connectionId) {
      connectionId = crypto.randomUUID()
    }

    const existing = this.connections.get(connectionId)
    if (existing) {
      existing.status = 'open'
      existing.hibernatedAt = undefined
      if (restored) {
        existing.data = { ...existing.data, ...restored }
      }
      // Clear hibernation timer
      if (existing.hibernationTimer) {
        clearTimeout(existing.hibernationTimer)
        existing.hibernationTimer = undefined
      }
      // Deliver queued events
      for (const event of existing.queuedEvents) {
        const response: RPCResponse = {
          id: '',
          result: { channel: event.channel, data: event.data },
        }
        ws.send(JSON.stringify(response))
      }
      existing.queuedEvents = []
      this.setupIdleTimer(connectionId)
    } else {
      // New connection
      const now = Date.now()
      const connState: ConnectionState = {
        id: connectionId,
        ws,
        status: 'open',
        connectedAt: now,
        lastMessageAt: now,
        subscriptions: [],
        data: restored,
        queuedEvents: [],
      }
      this.connections.set(connectionId, connState)
      this.wsToId.set(ws, connectionId)
      this.setupIdleTimer(connectionId)
    }

    return connectionId
  }

  // ===========================================================================
  // Fetch Handler
  // ===========================================================================

  /**
   * Handle an incoming HTTP request (convenience method)
   *
   * Alias for handleRequest for Worker fetch handler compatibility.
   *
   * @param request - Incoming HTTP request
   * @returns HTTP response
   */
  async fetch(request: Request): Promise<Response> {
    return this.handleRequest(request)
  }

  // ===========================================================================
  // Internal Helpers
  // ===========================================================================

  /**
   * Build method context from request
   *
   * @param request - Optional HTTP request
   * @param ws - Optional WebSocket
   * @returns Method context
   */
  private buildContext(request?: Request, ws?: WebSocket, meta?: Record<string, unknown>): MethodContext {
    return {
      state: this.state!,
      env: this.env,
      meta: meta as any,
      websocket: ws,
      request,
    }
  }

  /**
   * Handle CORS preflight request
   *
   * @returns CORS preflight response
   */
  private handleCors(): Response {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  /**
   * Add CORS headers to response
   *
   * @param response - Response to modify
   * @returns Response with CORS headers
   */
  private addCorsHeaders(response: Response): Response {
    const newHeaders = new Headers(response.headers)
    newHeaders.set('Access-Control-Allow-Origin', '*')
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    })
  }

  /**
   * Check if a request is a batch request
   */
  private isBatchRequest(parsed: unknown): boolean {
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      'requests' in parsed &&
      Array.isArray((parsed as any).requests)
    )
  }

  /**
   * Execute a single RPC request
   */
  private async executeRequest(request: RPCRequest, connectionData?: Record<string, unknown>): Promise<RPCResponse> {
    const startTime = Date.now()
    const meta = { ...request.meta }

    // Look up handler
    let handler = this.methods.get(request.method)

    // Check for wildcard handlers
    if (!handler) {
      const parts = request.method.split('.')
      for (let i = parts.length - 1; i > 0; i--) {
        const wildcardKey = parts.slice(0, i).join('.') + '.*'
        handler = this.methods.get(wildcardKey)
        if (handler) break
      }
    }

    if (!handler) {
      return {
        id: request.id,
        error: { code: ErrorCodes.MethodNotFound, message: `Method not found: ${request.method}` },
        meta: { ...meta, duration: Date.now() - startTime },
      }
    }

    try {
      // Execute handler
      const result = await handler(request.params, this.buildContext(undefined, undefined, meta))

      return {
        id: request.id,
        result,
        meta: { ...meta, duration: Date.now() - startTime },
      }
    } catch (error: unknown) {
      // Handle RPC errors thrown by handler
      if (typeof error === 'object' && error !== null && 'code' in error) {
        const rpcError = error as { code: number; message?: string; data?: unknown }

        // Hide internal error details in production
        if (this.env.NODE_ENV === 'production' && rpcError.code === ErrorCodes.InternalError) {
          return {
            id: request.id,
            error: { code: ErrorCodes.InternalError, message: 'Internal error' },
            meta: { ...meta, duration: Date.now() - startTime },
          }
        }

        return {
          id: request.id,
          error: {
            code: rpcError.code,
            message: rpcError.message || 'Error',
            data: rpcError.data,
          },
          meta: { ...meta, duration: Date.now() - startTime },
        }
      }

      // Handle regular errors
      const err = error as Error

      // Hide internal error details in production
      if (this.env.NODE_ENV === 'production') {
        return {
          id: request.id,
          error: { code: ErrorCodes.InternalError, message: 'Internal error' },
          meta: { ...meta, duration: Date.now() - startTime },
        }
      }

      return {
        id: request.id,
        error: {
          code: (err as any).code || ErrorCodes.InternalError,
          message: err.message || 'Internal error',
          data: (err as any).data,
        },
        meta: { ...meta, duration: Date.now() - startTime },
      }
    }
  }

  /**
   * Set up idle timer for hibernation
   */
  private setupIdleTimer(connectionId: string): void {
    if (!this.options.hibernation?.idleTimeout) return

    const conn = this.connections.get(connectionId)
    if (!conn) return

    // Clear existing timer
    if (conn.idleTimer) {
      clearTimeout(conn.idleTimer)
    }

    conn.idleTimer = setTimeout(() => {
      this.hibernateConnection(connectionId)
    }, this.options.hibernation.idleTimeout)
  }

  /**
   * Reset idle timer on activity
   */
  private resetIdleTimer(connectionId: string): void {
    const conn = this.connections.get(connectionId)
    if (!conn) return

    conn.lastMessageAt = Date.now()
    this.setupIdleTimer(connectionId)
  }

  /**
   * Hibernate a connection
   */
  private hibernateConnection(connectionId: string): void {
    const conn = this.connections.get(connectionId)
    if (!conn || conn.status !== 'open') return

    conn.status = 'hibernating'
    conn.hibernatedAt = Date.now()

    // Serialize attachment
    try {
      ;(conn.ws as any).serializeAttachment?.({
        connectionId: conn.id,
        subscriptions: conn.subscriptions,
        data: conn.data,
      })
    } catch {
      // Ignore
    }

    // Set up max hibernation timer if configured
    if (this.options.hibernation?.maxHibernationDuration) {
      conn.hibernationTimer = setTimeout(() => {
        conn.status = 'closed'
        try {
          conn.ws.close(1000, 'Max hibernation duration exceeded')
        } catch {
          // Ignore
        }
      }, this.options.hibernation.maxHibernationDuration)
    }
  }

  /**
   * Check if client is rate limited
   */
  private isRateLimited(clientId: string): boolean {
    if (!this.options.rateLimit) return false

    const now = Date.now()
    const state = this.rateLimitState.get(clientId)

    if (!state || now - state.windowStart > this.options.rateLimit.windowMs) {
      this.rateLimitState.set(clientId, { count: 1, windowStart: now })
      return false
    }

    state.count++
    return state.count > this.options.rateLimit.maxRequests
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an RPC server with default configuration
 *
 * @param options - Server options (optional)
 * @returns Configured RPC server
 */
export function createRPCServer(options?: RPCServerOptions): RPCServer {
  return new RPCServer(options)
}

/**
 * Create method context from Durable Object state
 *
 * Utility for building context outside of server class.
 *
 * @param state - Durable Object state
 * @param env - Environment bindings
 * @param meta - Optional metadata
 * @returns Method context
 */
export function createMethodContext(
  state: DurableObjectState,
  env: Record<string, unknown>,
  meta?: Record<string, string>
): MethodContext {
  return {
    state,
    env,
    meta,
  }
}
