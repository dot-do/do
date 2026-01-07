/**
 * @dotdo/rpc - Type Definitions
 *
 * Core types for RPC operations. This module is self-contained
 * and can be extracted to @dotdo/rpc as a standalone package.
 */

// ============================================================================
// RPC Request/Response Types
// ============================================================================

/**
 * RPC request format (Workers RPC style)
 */
export interface RpcRequest {
  /** Request identifier */
  id: string
  /** Method name to invoke */
  method: string
  /** Parameters to pass to the method */
  params: unknown[]
}

/**
 * RPC response format (Workers RPC style)
 */
export interface RpcResponse {
  /** Request identifier (matching the request) */
  id: string
  /** Result of the method invocation (on success) */
  result?: unknown
  /** Error message (on failure) */
  error?: string
}

/**
 * RPC batch response format
 */
export interface RpcBatchResponse {
  /** Array of individual responses */
  results: RpcResponse[]
}

// ============================================================================
// RPC Target Types
// ============================================================================

/**
 * Method allowlist for RpcTarget
 */
export type AllowedMethods = Set<string>

/**
 * Method handler type for RPC methods
 */
export type RpcMethodHandler = (...args: unknown[]) => Promise<unknown>

// ============================================================================
// Batched RPC Types
// ============================================================================

/**
 * Stub interface for BatchedRpcExecutor
 */
export interface RpcStub {
  fetch: (url: string, init: RequestInit) => Promise<Response>
}

/**
 * Options for BatchedRpcExecutor
 */
export interface BatchedRpcOptions {
  /** Maximum number of requests to batch together (default: 100) */
  maxBatchSize?: number
  /** Interval in ms to wait before flushing (default: 10) */
  flushInterval?: number
}

/**
 * Internal batch item type
 */
export interface BatchItem {
  method: string
  params: Record<string, unknown>
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}
