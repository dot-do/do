/**
 * @fileoverview SDK-specific type definitions for DO client
 *
 * This module provides type definitions for:
 * - DO schema inference
 * - Client configuration
 * - Transport layer
 * - Request/response handling
 * - Event system
 *
 * @module @do/sdk/types
 */

// =============================================================================
// DO Schema Types
// =============================================================================

/**
 * Base interface for defining a Durable Object schema.
 *
 * @example
 * ```typescript
 * interface MyDO extends DOSchema {
 *   methods: {
 *     greet: { input: { name: string }; output: { message: string } }
 *   }
 *   state: {
 *     greeting: string
 *   }
 * }
 * ```
 */
export interface DOSchema {
  /** Method definitions with input/output types */
  methods: Record<string, MethodDefinition>
  /** State keys and their value types */
  state?: Record<string, unknown>
}

/**
 * Definition for a single DO method
 */
export interface MethodDefinition {
  /** Input type for the method (void if no input required) */
  input: unknown
  /** Output type for the method */
  output: unknown
}

/**
 * Extract method names from a DO schema
 */
export type MethodNames<T extends DOSchema> = keyof T['methods'] & string

/**
 * Extract input type for a specific method
 */
export type MethodInput<
  T extends DOSchema,
  M extends MethodNames<T>
> = T['methods'][M]['input']

/**
 * Extract output type for a specific method
 */
export type MethodOutput<
  T extends DOSchema,
  M extends MethodNames<T>
> = T['methods'][M]['output']

/**
 * Extract state keys from a DO schema
 */
export type StateKeys<T extends DOSchema> = T['state'] extends Record<string, unknown>
  ? keyof T['state'] & string
  : never

/**
 * Extract state value type for a specific key
 */
export type StateValue<
  T extends DOSchema,
  K extends StateKeys<T>
> = T['state'] extends Record<string, unknown> ? T['state'][K] : never

// =============================================================================
// Transport Types
// =============================================================================

/**
 * Supported transport types
 */
export type TransportType = 'websocket' | 'http' | 'auto'

/**
 * Transport connection state
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

/**
 * Configuration for auto-reconnection behavior
 */
export interface ReconnectConfig {
  /** Enable auto-reconnection (default: true) */
  enabled?: boolean
  /** Initial delay in milliseconds (default: 1000) */
  delay?: number
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay?: number
  /** Backoff multiplier (default: 2) */
  multiplier?: number
  /** Maximum retry attempts (default: Infinity) */
  maxAttempts?: number
}

/**
 * Internal transport message format
 */
export interface TransportMessage {
  /** Unique request identifier */
  id: string
  /** Message type */
  type: MessageType
  /** Method name for RPC calls */
  method?: string
  /** Payload data */
  payload?: unknown
  /** Timestamp for timeout tracking */
  timestamp: number
}

/**
 * Message types for the CapnWeb protocol
 */
export enum MessageType {
  Request = 0x01,
  Response = 0x02,
  Error = 0x03,
  Subscribe = 0x04,
  Unsubscribe = 0x05,
  Event = 0x06,
  Ping = 0x07,
  Pong = 0x08,
}

/**
 * Interface that all transport implementations must satisfy
 */
export interface Transport {
  /** Current connection state */
  readonly state: ConnectionState

  /** Connect to the DO */
  connect(): Promise<void>

  /** Disconnect from the DO */
  disconnect(): Promise<void>

  /** Send a message and wait for response */
  send(message: TransportMessage): Promise<TransportResponse>

  /** Subscribe to transport events */
  on<E extends TransportEventType>(event: E, handler: TransportEventHandler<E>): void

  /** Unsubscribe from transport events */
  off<E extends TransportEventType>(event: E, handler: TransportEventHandler<E>): void
}

/**
 * Response from transport layer
 */
export interface TransportResponse {
  /** Request ID this response correlates to */
  id: string
  /** Whether the request succeeded */
  success: boolean
  /** Response data (if success) */
  data?: unknown
  /** Error information (if failure) */
  error?: TransportError
}

/**
 * Error information from transport
 */
export interface TransportError {
  /** Error code */
  code: string
  /** Human-readable message */
  message: string
  /** Additional error details */
  details?: unknown
}

/**
 * Transport event types
 */
export type TransportEventType = 'connected' | 'disconnected' | 'reconnecting' | 'message' | 'error'

/**
 * Event handler type mapping
 */
export type TransportEventHandler<E extends TransportEventType> =
  E extends 'connected' ? () => void :
  E extends 'disconnected' ? (reason?: string) => void :
  E extends 'reconnecting' ? (attempt: number) => void :
  E extends 'message' ? (message: TransportMessage) => void :
  E extends 'error' ? (error: Error) => void :
  never

// =============================================================================
// Client Types
// =============================================================================

/**
 * Configuration options for creating a DO client
 */
export interface ClientConfig {
  /** Base URL of the DO worker */
  url: string

  /** DO instance ID (name or hex ID) */
  id: string

  /** Transport preference (default: 'auto') */
  transport?: TransportType

  /** Authentication token */
  token?: string

  /** Custom headers for HTTP requests */
  headers?: Record<string, string>

  /** WebSocket reconnection options */
  reconnect?: ReconnectConfig

  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number

  /** Enable debug logging (default: false) */
  debug?: boolean
}

/**
 * Typed client interface for a specific DO schema
 */
export interface DOClient<T extends DOSchema> {
  /** Current connection state */
  readonly state: ConnectionState

  /**
   * Call a method on the DO
   *
   * @param method - Method name to call
   * @param input - Input data for the method
   * @returns Promise resolving to the method output
   */
  call<M extends MethodNames<T>>(
    method: M,
    ...args: MethodInput<T, M> extends void ? [] : [input: MethodInput<T, M>]
  ): Promise<MethodOutput<T, M>>

  /**
   * Subscribe to state changes
   *
   * @param key - State key to subscribe to
   * @param callback - Function called when state changes
   * @returns Unsubscribe function
   */
  subscribe<K extends StateKeys<T>>(
    key: K,
    callback: (value: StateValue<T, K>) => void
  ): () => void

  /**
   * Batch multiple RPC calls
   *
   * @param calls - Array of call specifications
   * @returns Promise resolving to array of results
   */
  batch<Calls extends BatchCall<T>[]>(
    calls: Calls
  ): Promise<BatchResult<T, Calls>>

  /**
   * Subscribe to client events
   */
  on<E extends ClientEventType>(event: E, handler: ClientEventHandler<E>): void

  /**
   * Unsubscribe from client events
   */
  off<E extends ClientEventType>(event: E, handler: ClientEventHandler<E>): void

  /**
   * Close the client and clean up resources
   */
  close(): Promise<void>
}

/**
 * Specification for a batched call
 */
export interface BatchCall<T extends DOSchema> {
  /** Method name */
  method: MethodNames<T>
  /** Method input */
  input?: unknown
}

/**
 * Result type for batched calls
 */
export type BatchResult<
  T extends DOSchema,
  Calls extends BatchCall<T>[]
> = {
  [K in keyof Calls]: Calls[K] extends BatchCall<T>
    ? MethodOutput<T, Calls[K]['method'] & MethodNames<T>>
    : never
}

/**
 * Client event types
 */
export type ClientEventType = 'connected' | 'disconnected' | 'reconnecting' | 'error' | 'stateChange'

/**
 * Client event handler type mapping
 */
export type ClientEventHandler<E extends ClientEventType> =
  E extends 'connected' ? () => void :
  E extends 'disconnected' ? (reason?: string) => void :
  E extends 'reconnecting' ? (attempt: number) => void :
  E extends 'error' ? (error: Error) => void :
  E extends 'stateChange' ? (key: string, value: unknown) => void :
  never

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Make all properties in T optional recursively
 */
export type DeepPartial<T> = T extends object ? {
  [P in keyof T]?: DeepPartial<T[P]>
} : T

/**
 * Extract the resolved type from a Promise
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T

/**
 * Create a type that requires at least one of the properties
 */
export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> =
  Pick<T, Exclude<keyof T, Keys>> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>
  }[Keys]
