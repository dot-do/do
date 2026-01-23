/**
 * CapnWeb RPC Client SDK
 *
 * TypeScript client for connecting to Digital Objects via WebSocket or HTTP.
 * Provides type inference for all RPC methods, auto-reconnection, and
 * subscription support.
 *
 * @module rpc/client
 *
 * @example
 * ```typescript
 * import { createRPCClient } from 'do/rpc/client'
 *
 * // Connect to a Digital Object
 * const client = await createRPCClient('wss://my-do.example.com/rpc')
 *
 * // Call methods with full type inference
 * const identity = await client.call('do.identity.get')
 * const things = await client.call('do.things.list', { limit: 10 })
 *
 * // Subscribe to events
 * const unsubscribe = client.subscribe('cdc', (event) => {
 *   console.log('Change:', event)
 * })
 *
 * // Batch operations
 * const batch = await client.batch([
 *   { id: '1', method: 'do.nouns.list' },
 *   { id: '2', method: 'do.verbs.list' },
 * ])
 *
 * // Clean up
 * await client.close()
 * ```
 */

import type { RPCRequest, RPCResponse, RPCBatchRequest, RPCBatchResponse, RPCError, RPCMeta, RPCClient, DORPCMethods } from '../types/rpc'

// =============================================================================
// Types
// =============================================================================

/**
 * Client configuration options
 */
export interface RPCClientOptions {
  /** Base URL for the RPC endpoint */
  url: string
  /** Transport to use (default: 'websocket') */
  transport?: 'websocket' | 'http' | 'auto'
  /** Authentication token */
  auth?: string
  /** Auto-reconnect on connection loss (default: true) */
  autoReconnect?: boolean
  /** Maximum reconnection attempts (default: 5) */
  maxReconnectAttempts?: number
  /** Base delay between reconnection attempts in ms (default: 1000) */
  reconnectDelay?: number
  /** Maximum delay between reconnection attempts in ms */
  maxReconnectDelay?: number
  /** Reconnection backoff multiplier (default: 2) */
  reconnectBackoff?: number
  /** Request timeout in ms (default: 30000) */
  timeout?: number
  /** Connection timeout in ms */
  connectionTimeout?: number
  /** Custom headers for HTTP transport */
  headers?: Record<string, string>
  /** Handler for connection state changes */
  onConnectionChange?: (state: ConnectionState) => void
  /** Handler for errors */
  onError?: (error: Error) => void
  /** Whether to fallback to HTTP if WebSocket fails */
  fallbackToHttp?: boolean
  /** Number of retries for HTTP requests */
  retries?: number
}

/**
 * Connection state
 */
export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'closed'

/**
 * Pending request waiting for response
 */
interface PendingRequest {
  resolve: (response: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

/**
 * Subscription handler
 */
type SubscriptionHandler = (event: unknown) => void

// =============================================================================
// RPC Client Class
// =============================================================================

/**
 * Pipeline builder for chaining RPC calls
 */
export interface RPCPipeline {
  /** Add a call to the pipeline */
  call<M extends keyof DORPCMethods>(method: M, ...params: Parameters<DORPCMethods[M]> | [(prev: unknown[]) => unknown]): RPCPipeline
  /** Execute all calls in the pipeline */
  execute(): Promise<unknown[]>
}

/**
 * Batch request options
 */
export interface BatchOptions {
  /** Abort remaining requests if one fails */
  abortOnError?: boolean
}

/**
 * RPC Error class for rejected calls
 */
class RPCCallError extends Error {
  code: number
  data?: unknown

  constructor(error: RPCError) {
    super(error.message)
    this.name = 'RPCCallError'
    this.code = error.code
    this.data = error.data
  }
}

/**
 * RPC Client for Digital Objects
 *
 * Connects to a Digital Object and provides type-safe method calling.
 * Supports both WebSocket (preferred) and HTTP transports.
 *
 * @example
 * ```typescript
 * const client = new DOClient('wss://example.com/rpc', {
 *   auth: 'Bearer token',
 *   autoReconnect: true,
 *   onConnectionChange: (state) => console.log('Connection:', state),
 * })
 *
 * await client.connect()
 * const result = await client.call('do.things.list')
 * ```
 */
export class DOClient implements RPCClient {
  private readonly url: string
  private readonly options: Omit<RPCClientOptions, 'url'>
  private state: ConnectionState = 'disconnected'
  private transport: 'websocket' | 'http' = 'websocket'
  private ws: WebSocket | null = null
  private pendingRequests = new Map<string, PendingRequest>()
  private subscriptions = new Map<string, Set<SubscriptionHandler>>()
  private stateChangeCallbacks: Array<(state: ConnectionState) => void> = []
  private eventListeners = new Map<string, Set<() => void>>()
  private requestIdCounter = 0
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private intentionalClose = false
  private messageQueue: Array<RPCRequest | RPCBatchRequest> = []

  /**
   * Create a new RPC client
   *
   * Does not connect automatically - call connect() to establish connection.
   *
   * @param url - WebSocket URL (wss://) or HTTP URL (https://)
   * @param options - Client configuration
   */
  constructor(url: string, options?: Omit<RPCClientOptions, 'url'>) {
    this.url = url
    this.options = options || {}

    // Set default transport based on options
    if (this.options.transport === 'http') {
      this.transport = 'http'
    } else if (this.options.transport === 'websocket') {
      this.transport = 'websocket'
    } else {
      // auto or undefined - default to websocket
      this.transport = 'websocket'
    }
  }

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  /**
   * Connect to the Digital Object
   *
   * Establishes WebSocket connection or validates HTTP endpoint.
   *
   * @returns Promise that resolves when connected
   * @throws Error if connection fails
   *
   * @example
   * ```typescript
   * const client = new DOClient('wss://example.com/rpc')
   * await client.connect()
   * ```
   */
  async connect(): Promise<void> {
    if (this.state === 'connected') {
      throw new Error('Already connected')
    }

    if (this.transport === 'http') {
      this.setState('connected')
      return
    }

    // WebSocket connection
    this.setState('connecting')
    this.intentionalClose = false
    const wsUrl = this.buildWebSocketUrl()

    const connectionTimeout = this.options.connectionTimeout || 30000
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let ws: WebSocket | undefined

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        if (ws) {
          ws.close()
        }
        reject(new Error('Connection timeout'))
      }, connectionTimeout)
    })

    const connectionPromise = new Promise<void>((resolve, reject) => {
      ws = new WebSocket(wsUrl)
      this.ws = ws

      ws.addEventListener('error', (event: Event) => {
        if (this.state === 'connecting' && this.options.fallbackToHttp) {
          // Fallback to HTTP
          this.transport = 'http'
          this.ws = null
          this.setState('connected')
          resolve()
        } else {
          const err = new Error('Connection refused')
          reject(err)
        }
      })

      ws.addEventListener('open', () => {
        this.reconnectAttempts = 0
        this.setState('connected')
        this.flushMessageQueue()
        resolve()
      })

      ws.addEventListener('close', (event: CloseEvent) => {
        if (this.state === 'connecting' && !this.intentionalClose) {
          reject(new Error('Connection closed'))
        }
        this.handleClose(event)
      })

      ws.addEventListener('message', (event: MessageEvent) => {
        this.handleMessage(event.data)
      })
    })

    try {
      await Promise.race([connectionPromise, timeoutPromise])
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }

  /**
   * Close the connection
   *
   * Cleans up resources and cancels pending requests.
   *
   * @example
   * ```typescript
   * await client.close()
   * ```
   */
  async close(): Promise<void> {
    this.intentionalClose = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Connection closed'))
    }
    this.pendingRequests.clear()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.setState('disconnected')
  }

  /**
   * Get current connection state
   *
   * @returns Current connection state
   */
  getState(): ConnectionState {
    return this.state
  }

  /**
   * Get current connection state (alias for getState)
   *
   * @returns Current connection state
   */
  getConnectionState(): ConnectionState {
    return this.state
  }

  /**
   * Get the current transport type
   *
   * @returns Current transport ('websocket' or 'http')
   */
  getTransport(): 'websocket' | 'http' {
    return this.transport
  }

  /**
   * Check if client is connected
   *
   * @returns Whether the client is connected
   */
  isConnected(): boolean {
    return this.state === 'connected'
  }

  /**
   * Register a callback for connection state changes
   *
   * @param callback - Callback function
   */
  onStateChange(callback: (state: ConnectionState) => void): void {
    this.stateChangeCallbacks.push(callback)
  }

  /**
   * Register an event listener
   *
   * @param event - Event name
   * @param callback - Callback function
   */
  on(event: string, callback: () => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(callback)
  }

  // ===========================================================================
  // RPC Methods
  // ===========================================================================

  /**
   * Call an RPC method
   *
   * Sends a request and waits for the response.
   * Type inference provides autocomplete and type checking.
   *
   * @typeParam M - Method name from DORPCMethods
   * @param method - Method name (e.g., 'do.things.list')
   * @param params - Method parameters
   * @returns Method result
   * @throws RPCError if the method returns an error
   *
   * @example
   * ```typescript
   * // Params and return types are inferred
   * const things = await client.call('do.things.list', { limit: 10 })
   * //    ^? Thing[]
   *
   * const identity = await client.call('do.identity.get')
   * //    ^? DigitalObjectIdentity
   * ```
   */
  call<M extends keyof DORPCMethods>(method: M, ...params: Parameters<DORPCMethods[M]>): ReturnType<DORPCMethods[M]> {
    const request: RPCRequest = {
      id: this.generateId(),
      method: method as string,
      params: params[0],
      meta: {
        timestamp: Date.now(),
        auth: this.options.auth,
      },
    }

    if (this.transport === 'http') {
      return this.sendHttp(request) as ReturnType<DORPCMethods[M]>
    }

    return this.sendWebSocket(request) as ReturnType<DORPCMethods[M]>
  }

  /**
   * Call multiple methods in a batch
   *
   * Reduces round-trips by sending multiple requests in one message.
   * Responses are returned in the same order as requests.
   *
   * @param requests - Array of RPC requests
   * @param options - Batch options
   * @returns Batch response with all results
   *
   * @example
   * ```typescript
   * const batch = await client.batch([
   *   { id: '1', method: 'do.nouns.list' },
   *   { id: '2', method: 'do.verbs.list' },
   *   { id: '3', method: 'do.things.create', params: { name: 'Widget' } },
   * ])
   *
   * console.log(batch.responses[0].result) // nouns
   * console.log(batch.responses[1].result) // verbs
   * console.log(batch.responses[2].result) // created thing
   * ```
   */
  async batch(requests: Array<{ method: string; params?: unknown }>, options?: BatchOptions): Promise<RPCBatchResponse> {
    const batchId = this.generateId()
    const batchRequests: RPCRequest[] = requests.map((req) => ({
      id: this.generateId(),
      method: req.method,
      params: req.params,
    }))

    const batchRequest: RPCBatchRequest = {
      id: batchId,
      requests: batchRequests,
      abortOnError: options?.abortOnError,
    }

    if (this.transport === 'http') {
      return this.sendHttpBatch(batchRequest)
    }

    return this.sendWebSocketBatch(batchRequest)
  }

  /**
   * Create a pipeline for chaining calls
   *
   * @returns Pipeline builder
   *
   * @example
   * ```typescript
   * const results = await client
   *   .pipeline()
   *   .call('do.nouns.create', { name: 'User' })
   *   .call('do.things.create', { $type: 'User' })
   *   .execute()
   * ```
   */
  pipeline(): RPCPipeline {
    const calls: Array<{ method: string; params: unknown | ((prev: unknown[]) => unknown) }> = []

    const builder: RPCPipeline = {
      call: (method, ...params) => {
        const param = params[0]
        calls.push({ method, params: param })
        return builder
      },
      execute: async () => {
        const batchId = this.generateId()
        const batchRequests: RPCRequest[] = calls.map((call, index) => {
          const id = this.generateId()
          // Check if params is a function (reference to previous result)
          if (typeof call.params === 'function') {
            return {
              id,
              method: call.method,
              params: { $ref: index },
            }
          }
          return {
            id,
            method: call.method,
            params: call.params,
          }
        })

        const batchRequest: RPCBatchRequest = {
          id: batchId,
          requests: batchRequests,
        }

        if (this.transport === 'http') {
          const response = await this.sendHttpBatch(batchRequest)
          return response.responses.map((r) => r.result)
        }

        const response = await this.sendWebSocketBatch(batchRequest)
        return response.responses.map((r) => r.result)
      },
    }

    return builder
  }

  // ===========================================================================
  // Subscriptions
  // ===========================================================================

  /**
   * Subscribe to events on a channel
   *
   * Returns an unsubscribe function.
   *
   * @param channel - Channel name (e.g., 'cdc', 'events')
   * @param handler - Handler function called for each event
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = client.subscribe('cdc', (event) => {
   *   console.log('Change:', event)
   * })
   *
   * // Later...
   * unsubscribe()
   * ```
   */
  subscribe(channel: string, handler: SubscriptionHandler): () => void {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set())
    }
    this.subscriptions.get(channel)!.add(handler)

    return () => {
      const handlers = this.subscriptions.get(channel)
      if (handlers) {
        handlers.delete(handler)
        if (handlers.size === 0) {
          this.subscriptions.delete(channel)
        }
      }
    }
  }

  /**
   * Unsubscribe from a channel
   *
   * @param channel - Channel to unsubscribe from
   */
  unsubscribe(channel: string): void {
    this.subscriptions.delete(channel)
  }

  // ===========================================================================
  // Internal Methods
  // ===========================================================================

  /**
   * Send a request via WebSocket
   *
   * @param request - Request to send
   * @returns Promise resolving to response
   */
  private sendWebSocket(request: RPCRequest): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = this.options.timeout || 30000
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(request.id)
        reject(new Error('Request timeout'))
      }, timeout)

      this.pendingRequests.set(request.id, {
        resolve,
        reject,
        timeout: timeoutId,
      })

      if (this.state === 'reconnecting') {
        // Queue the request
        this.messageQueue.push(request)
      } else if (this.ws && this.ws.readyState === 1) {
        this.ws.send(JSON.stringify(request))
      } else {
        this.messageQueue.push(request)
      }
    })
  }

  /**
   * Send a batch request via WebSocket
   *
   * @param batchRequest - Batch request to send
   * @returns Promise resolving to batch response
   */
  private sendWebSocketBatch(batchRequest: RPCBatchRequest): Promise<RPCBatchResponse> {
    return new Promise((resolve, reject) => {
      const timeout = this.options.timeout || 30000
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(batchRequest.id)
        reject(new Error('Request timeout'))
      }, timeout)

      this.pendingRequests.set(batchRequest.id, {
        resolve: resolve as (response: unknown) => void,
        reject,
        timeout: timeoutId,
      })

      if (this.ws && this.ws.readyState === 1) {
        this.ws.send(JSON.stringify(batchRequest))
      } else {
        this.messageQueue.push(batchRequest)
      }
    })
  }

  /**
   * Send a request via HTTP
   *
   * @param request - Request to send
   * @returns Promise resolving to response
   */
  private async sendHttp(request: RPCRequest): Promise<unknown> {
    const httpUrl = this.buildHttpUrl()
    const retries = this.options.retries || 0
    const timeout = this.options.timeout || 30000

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        const response = await fetch(httpUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.options.auth ? { Authorization: this.options.auth } : {}),
            ...(this.options.headers || {}),
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        const data = (await response.json()) as RPCResponse

        if (data.error) {
          throw new RPCCallError(data.error)
        }

        return data.result
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Request timeout')
        }
        lastError = error instanceof Error ? error : new Error(String(error))
        if (attempt === retries) {
          throw lastError
        }
        // Continue to next retry
      }
    }

    throw lastError || new Error('Request failed')
  }

  /**
   * Send a batch request via HTTP
   *
   * @param batchRequest - Batch request to send
   * @returns Promise resolving to batch response
   */
  private async sendHttpBatch(batchRequest: RPCBatchRequest): Promise<RPCBatchResponse> {
    const httpUrl = this.buildHttpUrl()

    const response = await fetch(httpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.options.auth ? { Authorization: this.options.auth } : {}),
        ...(this.options.headers || {}),
      },
      body: JSON.stringify(batchRequest),
    })

    return (await response.json()) as RPCBatchResponse
  }

  /**
   * Handle incoming WebSocket message
   *
   * @param message - Raw message data
   */
  private handleMessage(message: string | ArrayBuffer): void {
    // Ignore binary messages
    if (typeof message !== 'string') {
      return
    }

    let data: RPCResponse | RPCBatchResponse
    try {
      data = JSON.parse(message)
    } catch {
      // Ignore malformed messages
      return
    }

    const pending = this.pendingRequests.get(data.id)
    if (pending) {
      clearTimeout(pending.timeout)
      this.pendingRequests.delete(data.id)

      // Check if this is a batch response
      if ('responses' in data) {
        pending.resolve(data)
      } else if (data.error) {
        pending.reject(new RPCCallError(data.error))
      } else {
        pending.resolve(data.result)
      }
    }
  }

  /**
   * Handle WebSocket close event
   *
   * @param event - Close event
   */
  private handleClose(event: { code: number; reason: string }): void {
    // Reject all pending requests when connection closes unexpectedly
    if (!this.intentionalClose && this.options.autoReconnect !== false) {
      for (const [, pending] of this.pendingRequests) {
        // Don't reject during reconnection - queue will be flushed
        if (this.state === 'reconnecting') {
          continue
        }
      }
    } else {
      // Connection closed intentionally or without auto-reconnect
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timeout)
        pending.reject(new Error('Connection closed'))
        this.pendingRequests.delete(id)
      }
    }

    if (this.intentionalClose) {
      this.setState('disconnected')
      return
    }

    // Auto-reconnect on unexpected close
    if (this.options.autoReconnect !== false) {
      this.reconnect()
    } else {
      // Reject pending requests when not auto-reconnecting
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timeout)
        pending.reject(new Error('Connection closed'))
        this.pendingRequests.delete(id)
      }
      this.setState('disconnected')
    }
  }

  /**
   * Attempt to reconnect
   */
  private async reconnect(): Promise<void> {
    const maxAttempts = this.options.maxReconnectAttempts || 5

    if (this.reconnectAttempts >= maxAttempts) {
      // Max attempts reached - reject pending and give up
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timeout)
        pending.reject(new Error('Connection closed'))
        this.pendingRequests.delete(id)
      }
      this.setState('disconnected')
      return
    }

    this.setState('reconnecting')
    this.emitEvent('reconnecting')
    this.reconnectAttempts++

    const baseDelay = this.options.reconnectDelay || 1000
    const backoff = this.options.reconnectBackoff || 2
    const maxDelay = this.options.maxReconnectDelay || 30000
    const delay = Math.min(baseDelay * Math.pow(backoff, this.reconnectAttempts - 1), maxDelay)

    this.reconnectTimer = setTimeout(async () => {
      this.intentionalClose = false
      const wsUrl = this.buildWebSocketUrl()
      const ws = new WebSocket(wsUrl)
      this.ws = ws

      ws.addEventListener('open', () => {
        this.reconnectAttempts = 0
        this.setState('connected')
        this.emitEvent('reconnected')
        this.flushMessageQueue()
      })

      ws.addEventListener('error', () => {
        // Retry
        this.reconnect()
      })

      ws.addEventListener('close', (event: CloseEvent) => {
        this.handleClose(event)
      })

      ws.addEventListener('message', (event: MessageEvent) => {
        this.handleMessage(event.data)
      })
    }, delay)
  }

  /**
   * Set connection state and notify listeners
   *
   * @param state - New state
   */
  private setState(state: ConnectionState): void {
    this.state = state
    for (const callback of this.stateChangeCallbacks) {
      callback(state)
    }
    this.options.onConnectionChange?.(state)
  }

  /**
   * Emit an event to listeners
   *
   * @param event - Event name
   */
  private emitEvent(event: string): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      for (const listener of listeners) {
        listener()
      }
    }
  }

  /**
   * Flush queued messages after reconnection
   */
  private flushMessageQueue(): void {
    if (!this.ws || this.ws.readyState !== 1) return

    for (const message of this.messageQueue) {
      this.ws.send(JSON.stringify(message))
    }
    this.messageQueue = []
  }

  /**
   * Build WebSocket URL from base URL
   *
   * @returns WebSocket URL
   */
  private buildWebSocketUrl(): string {
    let url = this.url
    // Convert http(s) to ws(s)
    if (url.startsWith('https://')) {
      url = 'wss://' + url.slice(8)
    } else if (url.startsWith('http://')) {
      url = 'ws://' + url.slice(7)
    }
    // Append /rpc if not present
    if (!url.endsWith('/rpc')) {
      url += '/rpc'
    }
    return url
  }

  /**
   * Build HTTP URL from base URL
   *
   * @returns HTTP URL
   */
  private buildHttpUrl(): string {
    let url = this.url
    // Append /rpc if not present
    if (!url.endsWith('/rpc')) {
      url += '/rpc'
    }
    return url
  }

  /**
   * Generate a unique request ID
   *
   * @returns Unique ID string
   */
  private generateId(): string {
    return `${Date.now()}-${++this.requestIdCounter}`
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an RPC client (synchronous)
 *
 * Creates a client without connecting. Call connect() to establish connection.
 *
 * @param options - Client options including URL
 * @returns Client instance
 *
 * @example
 * ```typescript
 * const client = createRPCClient({ url: 'https://my-do.example.com', transport: 'websocket' })
 * await client.connect()
 * const things = await client.call('do.things.list')
 * ```
 */
export function createRPCClient<T = DORPCMethods>(options: RPCClientOptions): DOClient {
  return new DOClient(options.url, options)
}

/**
 * Create an HTTP-only RPC client
 *
 * For environments where WebSocket is not available.
 *
 * @param url - HTTP URL
 * @param options - Client options
 * @returns Connected client (HTTP transport)
 */
export async function createHttpClient(url: string, options?: RPCClientOptions): Promise<DOClient> {
  const client = new DOClient(url, { ...options, transport: 'http' })
  await client.connect()
  return client
}

// =============================================================================
// Type Utilities
// =============================================================================

/**
 * Extract parameter types from a method
 *
 * @typeParam M - Method name
 */
export type MethodParams<M extends keyof DORPCMethods> = Parameters<DORPCMethods[M]>

/**
 * Extract return type from a method
 *
 * @typeParam M - Method name
 */
export type MethodResult<M extends keyof DORPCMethods> = Awaited<ReturnType<DORPCMethods[M]>>

/**
 * Type-safe request builder
 *
 * @example
 * ```typescript
 * const request = buildRequest('do.things.list', { limit: 10 })
 * //    ^? RPCRequest<{ limit: number }>
 * ```
 */
export function buildRequest<M extends keyof DORPCMethods>(method: M, ...params: Parameters<DORPCMethods[M]>): RPCRequest {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    method: method as string,
    params: params[0],
    meta: {
      timestamp: Date.now(),
    },
  }
}

/**
 * RPCClientImpl class (alias for DOClient)
 *
 * Exported for compatibility with tests
 */
export const RPCClientImpl = DOClient
