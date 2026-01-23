/**
 * @fileoverview Main SDK client for DO RPC
 *
 * This module provides the primary client interface for interacting with
 * Durable Objects via RPC. It handles:
 * - Type-safe method calls with full inference
 * - State subscriptions
 * - Request batching
 * - Connection lifecycle management
 *
 * @module @do/sdk/client
 */

import type {
  DOSchema,
  DOClient,
  ClientConfig,
  ClientEventType,
  ClientEventHandler,
  MethodNames,
  MethodInput,
  MethodOutput,
  StateKeys,
  StateValue,
  BatchCall,
  BatchResult,
  ConnectionState,
  TransportMessage,
  MessageType,
} from './types'
import { createTransport, type AutoTransportConfig } from './transport'

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Base error class for DO SDK errors
 */
export class DOError extends Error {
  /** Error code for programmatic handling */
  readonly code: string
  /** Additional error details */
  readonly details?: unknown

  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'DOError'
    this.code = code
    this.details = details
  }
}

/**
 * Error thrown when a request times out
 */
export class TimeoutError extends DOError {
  constructor(message = 'Request timed out') {
    super('TIMEOUT', message)
    this.name = 'TimeoutError'
  }
}

/**
 * Error thrown when transport fails
 */
export class TransportError extends DOError {
  constructor(message: string, details?: unknown) {
    super('TRANSPORT_ERROR', message, details)
    this.name = 'TransportError'
  }
}

// =============================================================================
// Client Implementation
// =============================================================================

/**
 * Internal client implementation class
 */
class DOClientImpl<T extends DOSchema> implements DOClient<T> {
  private readonly config: Required<Omit<ClientConfig, 'token' | 'headers' | 'reconnect'>> &
    Pick<ClientConfig, 'token' | 'headers' | 'reconnect'>
  private readonly transport: ReturnType<typeof createTransport>
  private readonly eventHandlers: Map<ClientEventType, Set<Function>> = new Map()
  private readonly subscriptions: Map<string, Set<(value: unknown) => void>> = new Map()
  private requestCounter = 0
  private closed = false

  /**
   * Create a new DO client
   *
   * @param config - Client configuration
   */
  constructor(config: ClientConfig) {
    this.config = {
      transport: 'auto',
      timeout: 30000,
      debug: false,
      ...config,
    }

    const transportConfig: AutoTransportConfig = {
      url: this.config.url,
      id: this.config.id,
      token: this.config.token,
      headers: this.config.headers,
      reconnect: this.config.reconnect,
      timeout: this.config.timeout,
    }

    this.transport = createTransport(this.config.transport, transportConfig)
    this.setupTransportEvents()
  }

  /** @inheritdoc */
  get state(): ConnectionState {
    return this.transport.state
  }

  /**
   * Initialize the client connection
   *
   * @returns Promise that resolves when connected
   */
  async connect(): Promise<void> {
    if (this.closed) {
      throw new DOError('CLIENT_CLOSED', 'Client has been closed')
    }
    await this.transport.connect()
  }

  /** @inheritdoc */
  async call<M extends MethodNames<T>>(
    method: M,
    ...args: MethodInput<T, M> extends void ? [] : [input: MethodInput<T, M>]
  ): Promise<MethodOutput<T, M>> {
    if (this.closed) {
      throw new DOError('CLIENT_CLOSED', 'Client has been closed')
    }

    if (this.transport.state !== 'connected') {
      throw new DOError('NOT_CONNECTED', 'Client is not connected')
    }

    const input = args[0]
    const requestId = this.generateRequestId()

    const message: TransportMessage = {
      id: requestId,
      type: 0x01 as MessageType, // MessageType.Request
      method: method as string,
      payload: input,
      timestamp: Date.now(),
    }

    this.debug(`Calling method '${method}' with id '${requestId}'`, input)

    const response = await this.transport.send(message)

    if (!response.success) {
      const error = response.error!
      throw new DOError(error.code, error.message, error.details)
    }

    this.debug(`Method '${method}' returned`, response.data)

    return response.data as MethodOutput<T, M>
  }

  /** @inheritdoc */
  subscribe<K extends StateKeys<T>>(
    key: K,
    callback: (value: StateValue<T, K>) => void
  ): () => void {
    if (this.closed) {
      throw new DOError('CLIENT_CLOSED', 'Client has been closed')
    }

    const keyStr = key as string

    if (!this.subscriptions.has(keyStr)) {
      this.subscriptions.set(keyStr, new Set())

      // Send subscribe message to server
      if (this.transport.state === 'connected') {
        const message: TransportMessage = {
          id: this.generateRequestId(),
          type: 0x04 as MessageType, // MessageType.Subscribe
          payload: { key: keyStr },
          timestamp: Date.now(),
        }
        this.transport.send(message).catch((error) => {
          this.debug(`Failed to subscribe to '${keyStr}':`, error)
        })
      }
    }

    this.subscriptions.get(keyStr)!.add(callback as (value: unknown) => void)

    this.debug(`Subscribed to state key '${keyStr}'`)

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscriptions.get(keyStr)
      if (callbacks) {
        callbacks.delete(callback as (value: unknown) => void)

        if (callbacks.size === 0) {
          this.subscriptions.delete(keyStr)

          // Send unsubscribe message to server
          if (this.transport.state === 'connected') {
            const message: TransportMessage = {
              id: this.generateRequestId(),
              type: 0x05 as MessageType, // MessageType.Unsubscribe
              payload: { key: keyStr },
              timestamp: Date.now(),
            }
            this.transport.send(message).catch((error) => {
              this.debug(`Failed to unsubscribe from '${keyStr}':`, error)
            })
          }
        }
      }

      this.debug(`Unsubscribed from state key '${keyStr}'`)
    }
  }

  /** @inheritdoc */
  async batch<Calls extends BatchCall<T>[]>(
    calls: Calls
  ): Promise<BatchResult<T, Calls>> {
    if (this.closed) {
      throw new DOError('CLIENT_CLOSED', 'Client has been closed')
    }

    if (this.transport.state !== 'connected') {
      throw new DOError('NOT_CONNECTED', 'Client is not connected')
    }

    const requestId = this.generateRequestId()

    const message: TransportMessage = {
      id: requestId,
      type: 0x01 as MessageType, // MessageType.Request
      method: '__batch__',
      payload: calls.map((call) => ({
        method: call.method,
        input: call.input,
      })),
      timestamp: Date.now(),
    }

    this.debug(`Batch call with ${calls.length} methods`, calls)

    const response = await this.transport.send(message)

    if (!response.success) {
      const error = response.error!
      throw new DOError(error.code, error.message, error.details)
    }

    this.debug('Batch call returned', response.data)

    return response.data as BatchResult<T, Calls>
  }

  /** @inheritdoc */
  on<E extends ClientEventType>(event: E, handler: ClientEventHandler<E>): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set())
    }
    this.eventHandlers.get(event)!.add(handler)
  }

  /** @inheritdoc */
  off<E extends ClientEventType>(event: E, handler: ClientEventHandler<E>): void {
    this.eventHandlers.get(event)?.delete(handler)
  }

  /** @inheritdoc */
  async close(): Promise<void> {
    if (this.closed) {
      return
    }

    this.closed = true
    this.subscriptions.clear()
    this.eventHandlers.clear()

    await this.transport.disconnect()

    this.debug('Client closed')
  }

  /**
   * Set up event forwarding from transport to client
   */
  private setupTransportEvents(): void {
    this.transport.on('connected', () => {
      this.emit('connected')

      // Re-subscribe to all state keys
      for (const key of this.subscriptions.keys()) {
        const message: TransportMessage = {
          id: this.generateRequestId(),
          type: 0x04 as MessageType, // MessageType.Subscribe
          payload: { key },
          timestamp: Date.now(),
        }
        this.transport.send(message).catch((error) => {
          this.debug(`Failed to re-subscribe to '${key}':`, error)
        })
      }
    })

    this.transport.on('disconnected', (reason) => {
      this.emit('disconnected', reason)
    })

    this.transport.on('reconnecting', (attempt) => {
      this.emit('reconnecting', attempt)
    })

    this.transport.on('error', (error) => {
      this.emit('error', error)
    })

    this.transport.on('message', (message) => {
      // Handle state change events
      if (message.type === 0x06) { // MessageType.Event
        const payload = message.payload as { key: string; value: unknown }
        const callbacks = this.subscriptions.get(payload.key)

        if (callbacks) {
          for (const callback of callbacks) {
            try {
              callback(payload.value)
            } catch (error) {
              this.debug(`Error in subscription callback for '${payload.key}':`, error)
            }
          }
        }

        this.emit('stateChange', payload.key, payload.value)
      }
    })
  }

  /**
   * Emit an event to all registered handlers
   *
   * @param event - Event type to emit
   * @param args - Arguments to pass to handlers
   */
  private emit<E extends ClientEventType>(
    event: E,
    ...args: Parameters<ClientEventHandler<E>>
  ): void {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      for (const handler of handlers) {
        try {
          ;(handler as Function)(...args)
        } catch (error) {
          this.debug(`Error in ${event} handler:`, error)
        }
      }
    }
  }

  /**
   * Generate a unique request ID
   *
   * @returns Unique request ID
   */
  private generateRequestId(): string {
    return `${Date.now()}-${++this.requestCounter}`
  }

  /**
   * Log debug message if debug mode is enabled
   *
   * @param message - Debug message
   * @param args - Additional arguments to log
   */
  private debug(message: string, ...args: unknown[]): void {
    if (this.config.debug) {
      console.debug(`[DO SDK] ${message}`, ...args)
    }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new DO client instance.
 *
 * The client provides type-safe RPC calls to a Durable Object instance.
 * It automatically handles transport selection, connection management,
 * and reconnection.
 *
 * @typeParam T - DO schema type for type inference
 * @param config - Client configuration options
 * @returns A configured DO client instance
 *
 * @example
 * ```typescript
 * interface MyDO extends DOSchema {
 *   methods: {
 *     increment: { input: { amount: number }; output: { value: number } }
 *     getValue: { input: void; output: { value: number } }
 *   }
 *   state: {
 *     counter: number
 *   }
 * }
 *
 * const client = createClient<MyDO>({
 *   url: 'https://my-do.workers.dev',
 *   id: 'counter-123',
 *   token: 'my-auth-token',
 * })
 *
 * // Connect to the DO
 * await client.connect()
 *
 * // Call methods with type safety
 * const result = await client.call('increment', { amount: 5 })
 * console.log(result.value) // Typed as number
 *
 * // Subscribe to state changes
 * const unsubscribe = client.subscribe('counter', (value) => {
 *   console.log('Counter is now:', value)
 * })
 *
 * // Clean up
 * unsubscribe()
 * await client.close()
 * ```
 */
export function createClient<T extends DOSchema>(
  config: ClientConfig
): DOClient<T> & { connect(): Promise<void> } {
  return new DOClientImpl<T>(config)
}

/**
 * Create multiple DO clients from a configuration map.
 *
 * Useful for applications that need to communicate with multiple
 * DO instances simultaneously.
 *
 * @typeParam T - Map of DO names to their schema types
 * @param baseConfig - Base configuration shared by all clients
 * @param instances - Map of instance names to their IDs
 * @returns Map of client instances
 *
 * @example
 * ```typescript
 * interface Schemas {
 *   counter: CounterDO
 *   chat: ChatDO
 * }
 *
 * const clients = createClients<Schemas>(
 *   { url: 'https://my-do.workers.dev' },
 *   {
 *     counter: 'counter-123',
 *     chat: 'chat-456',
 *   }
 * )
 *
 * await clients.counter.call('increment', { amount: 1 })
 * await clients.chat.call('sendMessage', { text: 'Hello!' })
 * ```
 */
export function createClients<T extends Record<string, DOSchema>>(
  baseConfig: Omit<ClientConfig, 'id'>,
  instances: { [K in keyof T]: string }
): { [K in keyof T]: DOClient<T[K]> & { connect(): Promise<void> } } {
  const clients = {} as { [K in keyof T]: DOClient<T[K]> & { connect(): Promise<void> } }

  for (const [name, id] of Object.entries(instances)) {
    clients[name as keyof T] = createClient<T[keyof T]>({
      ...baseConfig,
      id,
    }) as DOClient<T[keyof T]> & { connect(): Promise<void> }
  }

  return clients
}

// =============================================================================
// Exports
// =============================================================================

// Note: DOError, TimeoutError, TransportError are already exported above as classes
export type { DOClient, ClientConfig, DOSchema }
