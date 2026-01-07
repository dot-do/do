/**
 * WebSocket Operations Module
 *
 * Provides WebSocket hibernation and connection management:
 * - webSocketMessage: Handle incoming WebSocket messages
 * - webSocketClose: Handle WebSocket close events
 * - webSocketError: Handle WebSocket errors
 * - registerConnection: Register a WebSocket connection
 * - getConnectionMetadata: Get metadata for a connection
 * - updateConnectionMetadata: Update connection metadata
 * - getActiveConnections: Get all active connections
 * - getConnectionCount: Get connection count
 * - findConnectionsByMetadata: Find connections by metadata
 * - broadcast: Broadcast to all/filtered connections
 * - destroyAllConnections: Close all connections
 * - on/off/emit: Event emitter pattern
 */

import type {
  DOContext,
  AuthContext,
  ConnectionInfo,
  ConnectionCloseEvent,
  ConnectionEventHandler,
} from './types'

/**
 * Handle incoming WebSocket message
 * Parses JSON-RPC 2.0 format messages and routes to appropriate method handlers
 */
export async function webSocketMessage(
  ctx: DOContext,
  ws: WebSocket,
  message: string | ArrayBuffer,
  invoke: (method: string, params: unknown[], authContext?: AuthContext) => Promise<unknown>
): Promise<void> {
  // Convert ArrayBuffer to string if needed
  let messageStr: string
  if (message instanceof ArrayBuffer) {
    const decoder = new TextDecoder()
    messageStr = decoder.decode(message)
  } else {
    messageStr = message
  }

  // Helper to send response (simplified format for message envelope style)
  const sendSimpleResponse = (response: { id?: string | number | null; result?: unknown; error?: string }) => {
    ws.send(JSON.stringify(response))
  }

  // Helper to send JSON-RPC response
  const sendResponse = (response: {
    jsonrpc: '2.0'
    id?: string | number | null
    result?: unknown
    error?: { code: number; message: string; data?: unknown }
  }) => {
    ws.send(JSON.stringify(response))
  }

  // Helper to send JSON-RPC error response
  const sendError = (
    id: string | number | null | undefined,
    code: number,
    errorMessage: string,
    data?: unknown
  ) => {
    sendResponse({
      jsonrpc: '2.0',
      id: id ?? null,
      error: { code, message: errorMessage, data },
    })
  }

  // Parse the message as JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(messageStr)
  } catch {
    // Parse error - can't determine id
    sendError(null, -32700, 'Parse error: Invalid JSON')
    return
  }

  // Check for auth message type
  const anyParsed = parsed as Record<string, unknown>
  if (anyParsed.type === 'auth') {
    // Handle authentication message
    const authContext: AuthContext = {}
    if (typeof anyParsed.token === 'string') authContext.token = anyParsed.token
    if (typeof anyParsed.userId === 'string') authContext.userId = anyParsed.userId
    if (typeof anyParsed.organizationId === 'string') authContext.organizationId = anyParsed.organizationId
    if (Array.isArray(anyParsed.permissions)) authContext.permissions = anyParsed.permissions as string[]
    if (typeof anyParsed.metadata === 'object' && anyParsed.metadata !== null) {
      authContext.metadata = anyParsed.metadata as Record<string, unknown>
    }
    ctx.wsAuthContexts.set(ws, authContext)
    return
  }

  // Handle ping message type
  if (anyParsed.type === 'ping') {
    ws.send(JSON.stringify({ type: 'pong' }))
    return
  }

  // Validate JSON-RPC structure
  const request = parsed as {
    jsonrpc?: string
    id?: string | number | null
    method?: string
    params?: unknown[]
    type?: string
    auth?: AuthContext
  }

  // Check for message envelope style with auth field (non-JSON-RPC)
  // This style: { auth: {...}, method: 'methodName', params: [...] }
  if (request.method && request.auth && !request.jsonrpc) {
    // Use message-level auth
    ctx.currentAuthContext = request.auth

    // Set transport context for websocket
    if (ctx.setTransportContext) {
      ctx.setTransportContext({
        type: 'websocket',
        ws,
      })
    }

    try {
      const params = Array.isArray(request.params) ? request.params : []

      // Check if method is allowed
      if (!ctx.allowedMethods.has(request.method)) {
        sendSimpleResponse({ id: request.id, error: `Method not found: ${request.method}` })
        return
      }

      const result = await invoke(request.method, params, request.auth)
      sendSimpleResponse({ id: request.id, result })
    } catch (err) {
      sendSimpleResponse({
        id: request.id,
        error: err instanceof Error ? err.message : 'Unknown error'
      })
    } finally {
      ctx.currentAuthContext = null
      if (ctx.setTransportContext) {
        ctx.setTransportContext(null)
      }
    }
    return
  }

  // Handle RPC message type (alternative to JSON-RPC)
  if (request.type === 'rpc' && request.method) {
    // Use message auth if provided, otherwise use connection auth
    const messageAuth = request.auth
    const wsAuth = ctx.wsAuthContexts.get(ws)
    ctx.currentAuthContext = messageAuth ?? wsAuth ?? null

    try {
      const params = Array.isArray(request.params) ? request.params : []
      const result = await invoke(request.method, params)
      ws.send(JSON.stringify({ type: 'rpc', id: request.id, result }))
    } catch (err) {
      ws.send(JSON.stringify({
        type: 'rpc',
        id: request.id,
        error: err instanceof Error ? err.message : 'Unknown error'
      }))
    } finally {
      ctx.currentAuthContext = null
    }
    return
  }

  // Check for required method field
  if (typeof request.method !== 'string') {
    sendError(request.id, -32600, 'Invalid Request: Missing method field')
    return
  }

  // Check if this is a notification (no id means no response expected)
  const isNotification = request.id === undefined

  // Check if method is allowed
  if (!ctx.allowedMethods.has(request.method)) {
    if (!isNotification) {
      sendError(request.id, -32601, `Method not found: ${request.method}`)
    }
    return
  }

  // Get params (default to empty array)
  const params = Array.isArray(request.params) ? request.params : []

  // Use message auth if provided, otherwise use connection auth
  const messageAuth = request.auth
  let wsAuth = ctx.wsAuthContexts.get(ws)
  // If no auth for this specific ws, check if there's a "current" auth context already set
  // This handles cases where setWebSocketAuth(authContext) was called without a ws
  if (!wsAuth && ctx.currentAuthContext) {
    wsAuth = ctx.currentAuthContext
  }
  ctx.currentAuthContext = messageAuth ?? wsAuth ?? null

  // Set transport context for websocket
  if (ctx.setTransportContext) {
    ctx.setTransportContext({
      type: 'websocket',
      ws,
    })
  }

  // Execute the method
  try {
    const result = await invoke(request.method, params)

    // Per JSON-RPC 2.0 spec: notifications (no id) should not receive a response
    if (!isNotification) {
      sendResponse({
        jsonrpc: '2.0',
        id: request.id,
        result,
      })
    }
  } catch (error) {
    // Send error response only for non-notifications
    if (!isNotification) {
      const errMessage = error instanceof Error ? error.message : 'Unknown error'
      sendError(request.id, -32000, errMessage)
    }
  } finally {
    // Clear auth context after request completes
    ctx.currentAuthContext = null
    // Clear transport context
    if (ctx.setTransportContext) {
      ctx.setTransportContext(null)
    }
  }
}

/**
 * Handle WebSocket close
 * Cleans up connection state and notifies subscribers
 */
export async function webSocketClose(
  ctx: DOContext,
  ws: WebSocket,
  code: number,
  reason: string,
  wasClean: boolean
): Promise<void> {
  // Clean up WebSocket auth context
  ctx.wsAuthContexts.delete(ws)

  // Get connection info before removing
  const connectionInfo = ctx.connections.get(ws)

  // Emit connection:close event if there are handlers
  const metadata = connectionInfo?.metadata ?? {}
  emit(ctx, 'connection:close', {
    ws,
    code,
    reason,
    wasClean,
    metadata,
  })

  if (!connectionInfo) {
    // Connection was not tracked, nothing to clean up
    return
  }

  const connectionId = connectionInfo.id
  const subscriptions = connectionInfo.subscriptions

  // Remove connection from tracking map
  ctx.connections.delete(ws)

  // Clean up subscriptions and notify other subscribers
  for (const topic of subscriptions) {
    const topicSubscribers = ctx.subscribers.get(topic)

    if (topicSubscribers) {
      // Remove this connection from the topic
      topicSubscribers.delete(ws)

      // Notify remaining subscribers about the disconnect
      const disconnectNotification = JSON.stringify({
        type: 'disconnect',
        connectionId,
        topic,
      })

      for (const subscriber of topicSubscribers) {
        try {
          subscriber.send(disconnectNotification)
        } catch {
          // Subscriber may already be closed, ignore errors
        }
      }

      // Clean up empty subscriber sets
      if (topicSubscribers.size === 0) {
        ctx.subscribers.delete(topic)
      }
    }
  }
}

/**
 * Handle WebSocket error
 */
export async function webSocketError(_ws: WebSocket, error: unknown): Promise<void> {
  console.error('WebSocket error:', error)
}

// ============================================
// Connection Management API
// ============================================

/**
 * Register a WebSocket connection with optional metadata
 */
export async function registerConnection(
  ctx: DOContext,
  ws: WebSocket,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const id = crypto.randomUUID()
  ctx.connections.set(ws, {
    id,
    subscriptions: new Set(),
    metadata,
  })
}

/**
 * Get metadata associated with a WebSocket connection
 */
export function getConnectionMetadata(
  ctx: DOContext,
  ws: WebSocket
): Record<string, unknown> | undefined {
  return ctx.connections.get(ws)?.metadata
}

/**
 * Update metadata for an existing WebSocket connection
 */
export function updateConnectionMetadata(
  ctx: DOContext,
  ws: WebSocket,
  metadata: Record<string, unknown>
): void {
  const connectionInfo = ctx.connections.get(ws)
  if (connectionInfo) {
    connectionInfo.metadata = { ...connectionInfo.metadata, ...metadata }
  }
}

/**
 * Get all active WebSocket connections
 */
export function getActiveConnections(ctx: DOContext): WebSocket[] {
  return Array.from(ctx.connections.keys())
}

/**
 * Get the count of active connections
 */
export function getConnectionCount(ctx: DOContext): number {
  return ctx.connections.size
}

/**
 * Find connections that match the given metadata filter
 */
export function findConnectionsByMetadata(
  ctx: DOContext,
  filter: Record<string, unknown>
): WebSocket[] {
  const results: WebSocket[] = []
  for (const [ws, info] of ctx.connections) {
    let matches = true
    for (const [key, value] of Object.entries(filter)) {
      if (info.metadata[key] !== value) {
        matches = false
        break
      }
    }
    if (matches) {
      results.push(ws)
    }
  }
  return results
}

/**
 * Broadcast a message to all connections, optionally filtered by metadata
 */
export function broadcast(
  ctx: DOContext,
  message: string,
  filter?: Record<string, unknown>
): void {
  const connections = filter
    ? findConnectionsByMetadata(ctx, filter)
    : getActiveConnections(ctx)

  for (const ws of connections) {
    try {
      ws.send(message)
    } catch {
      // Connection may be closed, ignore errors
    }
  }
}

/**
 * Close and clean up all active connections
 */
export async function destroyAllConnections(ctx: DOContext): Promise<void> {
  for (const ws of ctx.connections.keys()) {
    try {
      ws.close(1000, 'Connection destroyed')
    } catch {
      // Connection may already be closed
    }
  }
  ctx.connections.clear()
}

// ============================================
// Event Emitter API
// ============================================

/**
 * Register an event handler
 */
export function on(
  ctx: DOContext,
  event: string,
  handler: ConnectionEventHandler
): void {
  let handlers = ctx.eventHandlers.get(event)
  if (!handlers) {
    handlers = new Set()
    ctx.eventHandlers.set(event, handlers)
  }
  handlers.add(handler)
}

/**
 * Remove an event handler
 */
export function off(
  ctx: DOContext,
  event: string,
  handler: ConnectionEventHandler
): void {
  const handlers = ctx.eventHandlers.get(event)
  if (handlers) {
    handlers.delete(handler)
    if (handlers.size === 0) {
      ctx.eventHandlers.delete(event)
    }
  }
}

/**
 * Emit an event to all registered handlers
 */
export function emit(
  ctx: DOContext,
  event: string,
  data: ConnectionCloseEvent
): void {
  const handlers = ctx.eventHandlers.get(event)
  if (handlers) {
    for (const handler of handlers) {
      try {
        handler(data)
      } catch {
        // Ignore handler errors
      }
    }
  }
}
