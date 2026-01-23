/**
 * @fileoverview Transport layer implementations for DO SDK
 *
 * This module provides transport implementations:
 * - WebSocketTransport: Primary transport using CapnWeb protocol
 * - HTTPTransport: Fallback transport using HTTP POST
 * - AutoTransport: Automatic selection with fallback
 *
 * @module @do/sdk/transport
 */

import type {
  Transport,
  TransportMessage,
  TransportResponse,
  TransportError,
  TransportEventType,
  TransportEventHandler,
  ConnectionState,
  ReconnectConfig,
  MessageType,
} from './types'

/**
 * Browser WebSocket interface for SDK client code
 * This extends beyond the Cloudflare Workers WebSocket type
 */
interface BrowserWebSocket {
  readonly readyState: number
  binaryType: string
  onopen: ((event: Event) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  onerror: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  close(code?: number, reason?: string): void
  send(data: string | ArrayBuffer | Blob | ArrayBufferView): void
}

interface BrowserWebSocketConstructor {
  new (url: string, protocols?: string | string[]): BrowserWebSocket
  readonly CONNECTING: number
  readonly OPEN: number
  readonly CLOSING: number
  readonly CLOSED: number
}

declare const WebSocket: BrowserWebSocketConstructor

// =============================================================================
// Constants
// =============================================================================

/** Default reconnection configuration */
const DEFAULT_RECONNECT_CONFIG: Required<ReconnectConfig> = {
  enabled: true,
  delay: 1000,
  maxDelay: 30000,
  multiplier: 2,
  maxAttempts: Infinity,
}

/** Default request timeout in milliseconds */
const DEFAULT_TIMEOUT = 30000

/** WebSocket ping interval in milliseconds */
const PING_INTERVAL = 30000

// =============================================================================
// Base Transport Class
// =============================================================================

/**
 * Abstract base class for transport implementations.
 * Provides common functionality for event handling and state management.
 */
abstract class BaseTransport implements Transport {
  protected _state: ConnectionState = 'disconnected'
  protected readonly eventHandlers: Map<TransportEventType, Set<Function>> = new Map()

  /** @inheritdoc */
  get state(): ConnectionState {
    return this._state
  }

  /** @inheritdoc */
  abstract connect(): Promise<void>

  /** @inheritdoc */
  abstract disconnect(): Promise<void>

  /** @inheritdoc */
  abstract send(message: TransportMessage): Promise<TransportResponse>

  /** @inheritdoc */
  on<E extends TransportEventType>(event: E, handler: TransportEventHandler<E>): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set())
    }
    this.eventHandlers.get(event)!.add(handler)
  }

  /** @inheritdoc */
  off<E extends TransportEventType>(event: E, handler: TransportEventHandler<E>): void {
    this.eventHandlers.get(event)?.delete(handler)
  }

  /**
   * Emit an event to all registered handlers
   *
   * @param event - Event type to emit
   * @param args - Arguments to pass to handlers
   */
  protected emit<E extends TransportEventType>(
    event: E,
    ...args: Parameters<TransportEventHandler<E>>
  ): void {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      for (const handler of handlers) {
        try {
          ;(handler as Function)(...args)
        } catch (error) {
          console.error(`Error in ${event} handler:`, error)
        }
      }
    }
  }

  /**
   * Update connection state and emit events
   *
   * @param newState - New connection state
   * @param reason - Optional reason for state change
   */
  protected setState(newState: ConnectionState, reason?: string): void {
    const oldState = this._state
    this._state = newState

    if (newState === 'connected' && oldState !== 'connected') {
      this.emit('connected')
    } else if (newState === 'disconnected' && oldState !== 'disconnected') {
      this.emit('disconnected', reason)
    } else if (newState === 'reconnecting') {
      // Reconnecting event is emitted separately with attempt count
    }
  }
}

// =============================================================================
// WebSocket Transport
// =============================================================================

/**
 * Configuration options for WebSocket transport
 */
export interface WebSocketTransportConfig {
  /** WebSocket URL (wss:// or ws://) */
  url: string
  /** DO instance ID */
  id: string
  /** Authentication token */
  token?: string
  /** Reconnection configuration */
  reconnect?: ReconnectConfig
  /** Request timeout in milliseconds */
  timeout?: number
}

/**
 * WebSocket transport using CapnWeb protocol.
 *
 * Features:
 * - Binary message format for efficiency
 * - Automatic reconnection with exponential backoff
 * - Ping/pong health checks
 * - Request/response correlation
 *
 * @example
 * ```typescript
 * const transport = new WebSocketTransport({
 *   url: 'wss://my-do.workers.dev',
 *   id: 'instance-123',
 *   token: 'my-auth-token',
 * })
 *
 * await transport.connect()
 * const response = await transport.send({
 *   id: 'req-1',
 *   type: MessageType.Request,
 *   method: 'increment',
 *   payload: { amount: 5 },
 *   timestamp: Date.now(),
 * })
 * ```
 */
export class WebSocketTransport extends BaseTransport {
  private readonly config: WebSocketTransportConfig
  private readonly reconnectConfig: Required<ReconnectConfig>
  private readonly timeout: number
  private readonly pendingRequests: Map<string, {
    resolve: (response: TransportResponse) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }> = new Map()

  private ws: BrowserWebSocket | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private manualDisconnect = false

  /**
   * Create a new WebSocket transport
   *
   * @param config - Transport configuration
   */
  constructor(config: WebSocketTransportConfig) {
    super()
    this.config = config
    this.reconnectConfig = { ...DEFAULT_RECONNECT_CONFIG, ...config.reconnect }
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT
  }

  /** @inheritdoc */
  async connect(): Promise<void> {
    if (this._state === 'connected' || this._state === 'connecting') {
      return
    }

    this.manualDisconnect = false
    this.setState('connecting')

    return new Promise((resolve, reject) => {
      try {
        const url = this.buildWebSocketUrl()
        this.ws = new WebSocket(url)
        this.ws.binaryType = 'arraybuffer'

        const connectTimeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'))
          this.ws?.close()
        }, this.timeout)

        this.ws.onopen = () => {
          clearTimeout(connectTimeout)
          this.reconnectAttempts = 0
          this.setState('connected')
          this.startPingInterval()
          resolve()
        }

        this.ws.onclose = (event: CloseEvent) => {
          this.handleClose(event.reason)
        }

        this.ws.onerror = (_event: Event) => {
          clearTimeout(connectTimeout)
          const error = new Error('WebSocket error')
          this.emit('error', error)
          if (this._state === 'connecting') {
            reject(error)
          }
        }

        this.ws.onmessage = (event: MessageEvent) => {
          this.handleMessage(event.data)
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /** @inheritdoc */
  async disconnect(): Promise<void> {
    this.manualDisconnect = true
    this.stopPingInterval()
    this.clearReconnectTimer()

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Transport disconnected'))
    }
    this.pendingRequests.clear()

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }

    this.setState('disconnected', 'Manual disconnect')
  }

  /** @inheritdoc */
  async send(message: TransportMessage): Promise<TransportResponse> {
    if (this._state !== 'connected' || !this.ws) {
      throw new Error('Transport not connected')
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(message.id)
        reject(new Error(`Request timeout: ${message.id}`))
      }, this.timeout)

      this.pendingRequests.set(message.id, { resolve, reject, timer })

      try {
        const encoded = this.encodeMessage(message)
        this.ws!.send(encoded)
      } catch (error) {
        clearTimeout(timer)
        this.pendingRequests.delete(message.id)
        reject(error)
      }
    })
  }

  /**
   * Build the WebSocket URL with authentication
   */
  private buildWebSocketUrl(): string {
    const url = new URL(this.config.url)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.pathname = `/do/${this.config.id}/ws`

    if (this.config.token) {
      url.searchParams.set('token', this.config.token)
    }

    return url.toString()
  }

  /**
   * Encode a message for transmission using CapnWeb binary format
   *
   * @param message - Message to encode
   * @returns Encoded message as ArrayBuffer
   */
  private encodeMessage(message: TransportMessage): ArrayBuffer {
    // CapnWeb binary format:
    // [1 byte: type][4 bytes: id length][N bytes: id][4 bytes: payload length][M bytes: payload]
    const idBytes = new TextEncoder().encode(message.id)
    const payloadStr = JSON.stringify({
      method: message.method,
      payload: message.payload,
      timestamp: message.timestamp,
    })
    const payloadBytes = new TextEncoder().encode(payloadStr)

    const buffer = new ArrayBuffer(1 + 4 + idBytes.length + 4 + payloadBytes.length)
    const view = new DataView(buffer)
    const uint8 = new Uint8Array(buffer)

    let offset = 0

    // Message type
    view.setUint8(offset, message.type)
    offset += 1

    // ID length and ID
    view.setUint32(offset, idBytes.length, true)
    offset += 4
    uint8.set(idBytes, offset)
    offset += idBytes.length

    // Payload length and payload
    view.setUint32(offset, payloadBytes.length, true)
    offset += 4
    uint8.set(payloadBytes, offset)

    return buffer
  }

  /**
   * Decode a received message from CapnWeb binary format
   *
   * @param data - Received data
   * @returns Decoded message
   */
  private decodeMessage(data: ArrayBuffer): { type: number; id: string; payload: unknown } {
    const view = new DataView(data)
    const uint8 = new Uint8Array(data)

    let offset = 0

    // Message type
    const type = view.getUint8(offset)
    offset += 1

    // ID length and ID
    const idLength = view.getUint32(offset, true)
    offset += 4
    const id = new TextDecoder().decode(uint8.slice(offset, offset + idLength))
    offset += idLength

    // Payload length and payload
    const payloadLength = view.getUint32(offset, true)
    offset += 4
    const payloadStr = new TextDecoder().decode(uint8.slice(offset, offset + payloadLength))
    const payload = JSON.parse(payloadStr)

    return { type, id, payload }
  }

  /**
   * Handle incoming WebSocket message
   *
   * @param data - Received data
   */
  private handleMessage(data: ArrayBuffer | string): void {
    try {
      let decoded: { type: number; id: string; payload: unknown }

      if (data instanceof ArrayBuffer) {
        decoded = this.decodeMessage(data)
      } else {
        // Fallback for text messages
        decoded = JSON.parse(data as string)
      }

      // Handle pong
      if (decoded.type === 0x08) { // MessageType.Pong
        return
      }

      // Handle server-initiated events
      if (decoded.type === 0x06) { // MessageType.Event
        this.emit('message', {
          id: decoded.id,
          type: decoded.type as MessageType,
          payload: decoded.payload,
          timestamp: Date.now(),
        })
        return
      }

      // Handle response to pending request
      const pending = this.pendingRequests.get(decoded.id)
      if (pending) {
        clearTimeout(pending.timer)
        this.pendingRequests.delete(decoded.id)

        if (decoded.type === 0x03) { // MessageType.Error
          pending.resolve({
            id: decoded.id,
            success: false,
            error: decoded.payload as TransportError,
          })
        } else {
          pending.resolve({
            id: decoded.id,
            success: true,
            data: decoded.payload,
          })
        }
      }
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)))
    }
  }

  /**
   * Handle WebSocket close event
   *
   * @param reason - Close reason
   */
  private handleClose(reason: string): void {
    this.stopPingInterval()
    this.ws = null

    if (this.manualDisconnect) {
      this.setState('disconnected', reason)
      return
    }

    // Attempt reconnection
    if (this.reconnectConfig.enabled && this.reconnectAttempts < this.reconnectConfig.maxAttempts) {
      this.scheduleReconnect()
    } else {
      this.setState('disconnected', reason)

      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timer)
        pending.reject(new Error('Connection lost'))
      }
      this.pendingRequests.clear()
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    this.setState('reconnecting')
    this.reconnectAttempts++

    const delay = Math.min(
      this.reconnectConfig.delay * Math.pow(this.reconnectConfig.multiplier, this.reconnectAttempts - 1),
      this.reconnectConfig.maxDelay
    )

    this.emit('reconnecting', this.reconnectAttempts)

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect()
      } catch (error) {
        // Will trigger another reconnect via handleClose
      }
    }, delay)
  }

  /**
   * Clear the reconnect timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  /**
   * Start the ping interval for connection health
   */
  private startPingInterval(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        const pingMessage: TransportMessage = {
          id: `ping-${Date.now()}`,
          type: 0x07 as MessageType, // MessageType.Ping
          timestamp: Date.now(),
        }
        const encoded = this.encodeMessage(pingMessage)
        this.ws.send(encoded)
      }
    }, PING_INTERVAL)
  }

  /**
   * Stop the ping interval
   */
  private stopPingInterval(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }
}

// =============================================================================
// HTTP Transport
// =============================================================================

/**
 * Configuration options for HTTP transport
 */
export interface HTTPTransportConfig {
  /** Base HTTP URL */
  url: string
  /** DO instance ID */
  id: string
  /** Authentication token */
  token?: string
  /** Custom headers */
  headers?: Record<string, string>
  /** Request timeout in milliseconds */
  timeout?: number
}

/**
 * HTTP POST transport for DO RPC.
 *
 * Used as a fallback when WebSocket is unavailable.
 * Each RPC call is a separate HTTP request.
 *
 * @example
 * ```typescript
 * const transport = new HTTPTransport({
 *   url: 'https://my-do.workers.dev',
 *   id: 'instance-123',
 *   token: 'my-auth-token',
 * })
 *
 * await transport.connect() // No-op for HTTP
 * const response = await transport.send({
 *   id: 'req-1',
 *   type: MessageType.Request,
 *   method: 'increment',
 *   payload: { amount: 5 },
 *   timestamp: Date.now(),
 * })
 * ```
 */
export class HTTPTransport extends BaseTransport {
  private readonly config: HTTPTransportConfig
  private readonly timeout: number

  /**
   * Create a new HTTP transport
   *
   * @param config - Transport configuration
   */
  constructor(config: HTTPTransportConfig) {
    super()
    this.config = config
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT
  }

  /** @inheritdoc */
  async connect(): Promise<void> {
    // HTTP transport is always "connected"
    this.setState('connected')
  }

  /** @inheritdoc */
  async disconnect(): Promise<void> {
    this.setState('disconnected')
  }

  /** @inheritdoc */
  async send(message: TransportMessage): Promise<TransportResponse> {
    const url = `${this.config.url}/do/${this.config.id}/rpc`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    }

    if (this.config.token) {
      headers['Authorization'] = `Bearer ${this.config.token}`
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: message.id,
          method: message.method,
          payload: message.payload,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorBody = await response.text()
        return {
          id: message.id,
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: response.statusText,
            details: errorBody,
          },
        }
      }

      const data = await response.json()

      return {
        id: message.id,
        success: true,
        data,
      }
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          id: message.id,
          success: false,
          error: {
            code: 'TIMEOUT',
            message: 'Request timed out',
          },
        }
      }

      return {
        id: message.id,
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      }
    }
  }
}

// =============================================================================
// Auto Transport
// =============================================================================

/**
 * Configuration options for auto transport
 */
export interface AutoTransportConfig {
  /** Base URL */
  url: string
  /** DO instance ID */
  id: string
  /** Authentication token */
  token?: string
  /** Custom headers (HTTP only) */
  headers?: Record<string, string>
  /** Reconnection configuration (WebSocket only) */
  reconnect?: ReconnectConfig
  /** Request timeout in milliseconds */
  timeout?: number
}

/**
 * Auto-selecting transport that prefers WebSocket with HTTP fallback.
 *
 * Attempts WebSocket connection first. If it fails or WebSocket is
 * unavailable in the environment, falls back to HTTP transport.
 *
 * @example
 * ```typescript
 * const transport = new AutoTransport({
 *   url: 'https://my-do.workers.dev',
 *   id: 'instance-123',
 * })
 *
 * await transport.connect() // Tries WebSocket, falls back to HTTP
 * ```
 */
export class AutoTransport extends BaseTransport {
  private readonly config: AutoTransportConfig
  private activeTransport: Transport | null = null
  private transportType: 'websocket' | 'http' | null = null

  /**
   * Create a new auto transport
   *
   * @param config - Transport configuration
   */
  constructor(config: AutoTransportConfig) {
    super()
    this.config = config
  }

  /** @inheritdoc */
  get state(): ConnectionState {
    return this.activeTransport?.state ?? 'disconnected'
  }

  /**
   * Get the currently active transport type
   */
  get activeTransportType(): 'websocket' | 'http' | null {
    return this.transportType
  }

  /** @inheritdoc */
  async connect(): Promise<void> {
    // Check if WebSocket is available in this environment
    if (typeof WebSocket !== 'undefined') {
      try {
        const wsTransport = new WebSocketTransport({
          url: this.config.url,
          id: this.config.id,
          token: this.config.token,
          reconnect: this.config.reconnect,
          timeout: this.config.timeout,
        })

        await wsTransport.connect()
        this.activeTransport = wsTransport
        this.transportType = 'websocket'
        this.forwardEvents(wsTransport)
        return
      } catch (error) {
        // WebSocket failed, fall through to HTTP
        console.warn('WebSocket connection failed, falling back to HTTP:', error)
      }
    }

    // Fall back to HTTP
    const httpTransport = new HTTPTransport({
      url: this.config.url,
      id: this.config.id,
      token: this.config.token,
      headers: this.config.headers,
      timeout: this.config.timeout,
    })

    await httpTransport.connect()
    this.activeTransport = httpTransport
    this.transportType = 'http'
    this.forwardEvents(httpTransport)
  }

  /** @inheritdoc */
  async disconnect(): Promise<void> {
    if (this.activeTransport) {
      await this.activeTransport.disconnect()
      this.activeTransport = null
      this.transportType = null
    }
  }

  /** @inheritdoc */
  async send(message: TransportMessage): Promise<TransportResponse> {
    if (!this.activeTransport) {
      throw new Error('Transport not connected')
    }
    return this.activeTransport.send(message)
  }

  /**
   * Forward events from the active transport to this transport's handlers
   *
   * @param transport - Transport to forward events from
   */
  private forwardEvents(transport: Transport): void {
    const events: TransportEventType[] = ['connected', 'disconnected', 'reconnecting', 'message', 'error']

    for (const event of events) {
      transport.on(event, ((...args: unknown[]) => {
        this.emit(event, ...(args as Parameters<TransportEventHandler<typeof event>>))
      }) as TransportEventHandler<typeof event>)
    }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a transport instance based on configuration
 *
 * @param type - Transport type to create
 * @param config - Transport configuration
 * @returns Transport instance
 */
export function createTransport(
  type: 'websocket' | 'http' | 'auto',
  config: AutoTransportConfig
): Transport {
  switch (type) {
    case 'websocket':
      return new WebSocketTransport(config)
    case 'http':
      return new HTTPTransport(config)
    case 'auto':
    default:
      return new AutoTransport(config)
  }
}
