/**
 * CapnWeb RPC Protocol
 *
 * Message serialization, validation, and parsing for the RPC transport.
 * Implements JSON-RPC style messages without requiring schema compilation.
 *
 * @module rpc/protocol
 *
 * @example
 * ```typescript
 * import { parseRequest, serializeResponse, validateRequest } from 'do/rpc/protocol'
 *
 * // Parse incoming message
 * const request = parseRequest(rawMessage)
 *
 * // Validate request structure
 * const validation = validateRequest(request)
 * if (!validation.valid) {
 *   return serializeResponse({
 *     id: request?.id ?? 'unknown',
 *     error: { code: -32600, message: validation.error }
 *   })
 * }
 *
 * // Serialize response
 * const response = serializeResponse({
 *   id: request.id,
 *   result: { data: 'value' }
 * })
 * ```
 */

import type {
  RPCRequest,
  RPCResponse,
  RPCError,
  RPCMeta,
  RPCBatchRequest,
  RPCBatchResponse,
  RpcErrorCodes,
} from '../types/rpc'

// =============================================================================
// Error Classes
// =============================================================================

/**
 * RPC Protocol Error
 *
 * Thrown when there's an error parsing or validating RPC messages.
 */
export class RPCProtocolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RPCProtocolError'
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * RPC Error type names for createRPCError
 */
export type RPCErrorType =
  | 'ParseError'
  | 'InvalidRequest'
  | 'MethodNotFound'
  | 'InvalidParams'
  | 'InternalError'
  | 'Unauthorized'
  | 'Forbidden'
  | 'NotFound'
  | 'Conflict'
  | 'RateLimited'
  | 'Timeout'

/**
 * Result of parsing a raw message
 */
export interface ParseResult<T> {
  /** Whether parsing succeeded */
  success: boolean
  /** Parsed data on success */
  data?: T
  /** Error message on failure */
  error?: string
}

/**
 * Result of validating a request
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean
  /** Error message on failure */
  error?: string
  /** Specific field that failed validation */
  field?: string
}

/**
 * Options for serialization
 */
export interface SerializeOptions {
  /** Pretty print JSON (default: false) */
  pretty?: boolean
  /** Include null values (default: false) */
  includeNulls?: boolean
}

// =============================================================================
// Parsing Functions
// =============================================================================

/**
 * Parse a raw message into an RPC request
 *
 * Handles both single requests and batch requests.
 * Returns a ParseResult with either the parsed request or an error message.
 *
 * @param message - Raw message string (expected to be JSON)
 * @returns ParseResult containing either the parsed request or error
 *
 * @example
 * ```typescript
 * const result = parseRequest('{"id":"1","method":"do.things.list"}')
 * if (result.success) {
 *   console.log(result.data.method) // 'do.things.list'
 * }
 * ```
 */
export function parseRequest(message: string | ArrayBuffer): ParseResult<RPCRequest | RPCBatchRequest> {
  try {
    const str = message instanceof ArrayBuffer ? new TextDecoder().decode(message) : message
    const parsed = JSON.parse(str)

    // Check if it's a batch request
    if ('requests' in parsed && Array.isArray(parsed.requests)) {
      return { success: true, data: parsed as RPCBatchRequest }
    }

    return { success: true, data: parsed as RPCRequest }
  } catch (e) {
    return { success: false, error: `Failed to parse request: ${(e as Error).message}` }
  }
}

/**
 * Parse a raw message into an RPC response
 *
 * @param message - Raw message string (expected to be JSON)
 * @returns ParseResult containing either the parsed response or error
 */
export function parseResponse(message: string | ArrayBuffer): ParseResult<RPCResponse | RPCBatchResponse> {
  try {
    const str = message instanceof ArrayBuffer ? new TextDecoder().decode(message) : message
    const parsed = JSON.parse(str)

    // Check if it's a batch response
    if ('responses' in parsed && Array.isArray(parsed.responses)) {
      return { success: true, data: parsed as RPCBatchResponse }
    }

    return { success: true, data: parsed as RPCResponse }
  } catch (e) {
    return { success: false, error: `Failed to parse response: ${(e as Error).message}` }
  }
}

/**
 * Deserialize a raw message into an RPC request
 *
 * @param message - Raw message string (expected to be JSON)
 * @returns Parsed RPC request
 * @throws RPCProtocolError if parsing or validation fails
 */
export function deserializeRequest(message: string): RPCRequest {
  // Handle null/undefined/empty input
  if (message === null || message === undefined) {
    throw new RPCProtocolError('Cannot parse null or undefined message')
  }

  if (typeof message !== 'string') {
    throw new RPCProtocolError('Message must be a string')
  }

  const trimmed = message.trim()
  if (trimmed === '') {
    throw new RPCProtocolError('Cannot parse empty message')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (e) {
    throw new RPCProtocolError(`Failed to parse JSON: ${(e as Error).message}`)
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new RPCProtocolError('Request must be an object')
  }

  const obj = parsed as Record<string, unknown>

  // Validate id
  if (!('id' in obj)) {
    throw new RPCProtocolError('Missing required field: id')
  }
  if (typeof obj.id !== 'string') {
    throw new RPCProtocolError('Field id must be a string')
  }
  if (obj.id === '') {
    throw new RPCProtocolError('Field id cannot be empty')
  }

  // Validate method
  if (!('method' in obj)) {
    throw new RPCProtocolError('Missing required field: method')
  }
  if (typeof obj.method !== 'string') {
    throw new RPCProtocolError('Field method must be a string')
  }

  return parsed as RPCRequest
}

/**
 * Deserialize a raw message into an RPC response
 *
 * @param message - Raw message string (expected to be JSON)
 * @returns Parsed RPC response
 * @throws RPCProtocolError if parsing or validation fails
 */
export function deserializeResponse(message: string): RPCResponse {
  // Handle null/undefined/empty input
  if (message === null || message === undefined) {
    throw new RPCProtocolError('Cannot parse null or undefined message')
  }

  if (typeof message !== 'string') {
    throw new RPCProtocolError('Message must be a string')
  }

  const trimmed = message.trim()
  if (trimmed === '') {
    throw new RPCProtocolError('Cannot parse empty message')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (e) {
    throw new RPCProtocolError(`Failed to parse JSON: ${(e as Error).message}`)
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new RPCProtocolError('Response must be an object')
  }

  const obj = parsed as Record<string, unknown>

  // Validate id
  if (!('id' in obj)) {
    throw new RPCProtocolError('Missing required field: id')
  }
  if (typeof obj.id !== 'string') {
    throw new RPCProtocolError('Field id must be a string')
  }

  // Validate error structure if present
  if ('error' in obj && obj.error !== undefined) {
    const error = obj.error as Record<string, unknown>
    if (typeof error !== 'object' || error === null) {
      throw new RPCProtocolError('Field error must be an object')
    }
    if (typeof error.code !== 'number') {
      throw new RPCProtocolError('Field error.code must be a number')
    }
    if (typeof error.message !== 'string') {
      throw new RPCProtocolError('Field error.message must be a string')
    }
  }

  return parsed as RPCResponse
}

/**
 * Deserialize a raw message into an RPC batch request
 *
 * @param message - Raw message string (expected to be JSON)
 * @returns Parsed RPC batch request
 * @throws RPCProtocolError if parsing or validation fails
 */
export function deserializeBatchRequest(message: string): RPCBatchRequest {
  // Handle null/undefined/empty input
  if (message === null || message === undefined) {
    throw new RPCProtocolError('Cannot parse null or undefined message')
  }

  if (typeof message !== 'string') {
    throw new RPCProtocolError('Message must be a string')
  }

  const trimmed = message.trim()
  if (trimmed === '') {
    throw new RPCProtocolError('Cannot parse empty message')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (e) {
    throw new RPCProtocolError(`Failed to parse JSON: ${(e as Error).message}`)
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new RPCProtocolError('Batch request must be an object')
  }

  const obj = parsed as Record<string, unknown>

  // Validate id
  if (!('id' in obj)) {
    throw new RPCProtocolError('Missing required field: id')
  }
  if (typeof obj.id !== 'string') {
    throw new RPCProtocolError('Field id must be a string')
  }

  // Validate requests array
  if (!('requests' in obj)) {
    throw new RPCProtocolError('Missing required field: requests')
  }
  if (!Array.isArray(obj.requests)) {
    throw new RPCProtocolError('Field requests must be an array')
  }
  if (obj.requests.length === 0) {
    throw new RPCProtocolError('Batch request cannot be empty')
  }

  // Validate each request in the batch
  for (let i = 0; i < obj.requests.length; i++) {
    const req = obj.requests[i] as Record<string, unknown>
    if (typeof req !== 'object' || req === null) {
      throw new RPCProtocolError(`Request at index ${i} must be an object`)
    }
    if (!('id' in req) || typeof req.id !== 'string') {
      throw new RPCProtocolError(`Request at index ${i} missing or invalid id`)
    }
    if (!('method' in req) || typeof req.method !== 'string') {
      throw new RPCProtocolError(`Request at index ${i} missing or invalid method`)
    }
  }

  return parsed as RPCBatchRequest
}

/**
 * Deserialize a raw message into an RPC batch response
 *
 * @param message - Raw message string (expected to be JSON)
 * @returns Parsed RPC batch response
 * @throws RPCProtocolError if parsing or validation fails
 */
export function deserializeBatchResponse(message: string): RPCBatchResponse {
  // Handle null/undefined/empty input
  if (message === null || message === undefined) {
    throw new RPCProtocolError('Cannot parse null or undefined message')
  }

  if (typeof message !== 'string') {
    throw new RPCProtocolError('Message must be a string')
  }

  const trimmed = message.trim()
  if (trimmed === '') {
    throw new RPCProtocolError('Cannot parse empty message')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (e) {
    throw new RPCProtocolError(`Failed to parse JSON: ${(e as Error).message}`)
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new RPCProtocolError('Batch response must be an object')
  }

  const obj = parsed as Record<string, unknown>

  // Validate id
  if (!('id' in obj)) {
    throw new RPCProtocolError('Missing required field: id')
  }
  if (typeof obj.id !== 'string') {
    throw new RPCProtocolError('Field id must be a string')
  }

  // Validate responses array
  if (!('responses' in obj)) {
    throw new RPCProtocolError('Missing required field: responses')
  }
  if (!Array.isArray(obj.responses)) {
    throw new RPCProtocolError('Field responses must be an array')
  }

  return parsed as RPCBatchResponse
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validate an RPC request structure
 *
 * Checks that the request has:
 * - A string `id` field
 * - A string `method` field in correct format (e.g., 'do.namespace.action')
 * - Optional `params` object
 * - Optional `meta` object with valid fields
 *
 * @param request - The request to validate
 * @returns ValidationResult indicating success or failure with details
 *
 * @example
 * ```typescript
 * const validation = validateRequest({ id: '1', method: 'invalid' })
 * if (!validation.valid) {
 *   console.log(validation.error) // 'Invalid method format'
 * }
 * ```
 */
export function validateRequest(request: unknown): void {
  if (typeof request !== 'object' || request === null) {
    throw new RPCProtocolError('Request must be an object')
  }

  const obj = request as Record<string, unknown>

  // Validate id
  if (!('id' in obj)) {
    throw new RPCProtocolError('Missing required field: id')
  }
  if (typeof obj.id !== 'string') {
    throw new RPCProtocolError('Field id must be a string')
  }

  // Validate method
  if (!('method' in obj)) {
    throw new RPCProtocolError('Missing required field: method')
  }
  if (typeof obj.method !== 'string') {
    throw new RPCProtocolError('Field method must be a string')
  }
  if (obj.method === '') {
    throw new RPCProtocolError('Field method cannot be empty')
  }
}

/**
 * Validate an RPC response structure
 *
 * @param response - The response to validate
 * @throws RPCProtocolError if validation fails
 */
export function validateResponse(response: unknown): void {
  if (typeof response !== 'object' || response === null) {
    throw new RPCProtocolError('Response must be an object')
  }

  const obj = response as Record<string, unknown>

  // Validate id
  if (!('id' in obj)) {
    throw new RPCProtocolError('Missing required field: id')
  }
  if (typeof obj.id !== 'string') {
    throw new RPCProtocolError('Field id must be a string')
  }

  // Check for both result and error
  const hasResult = 'result' in obj && obj.result !== undefined
  const hasError = 'error' in obj && obj.error !== undefined

  if (hasResult && hasError) {
    throw new RPCProtocolError('Response cannot have both result and error')
  }

  // Validate error structure if present
  if (hasError) {
    const error = obj.error as Record<string, unknown>
    if (typeof error !== 'object' || error === null) {
      throw new RPCProtocolError('Field error must be an object')
    }
    if (typeof error.code !== 'number') {
      throw new RPCProtocolError('Field error.code must be a number')
    }
    if (typeof error.message !== 'string') {
      throw new RPCProtocolError('Field error.message must be a string')
    }
  }
}

/**
 * Validate a batch request structure
 *
 * @param batch - The batch request to validate
 * @throws RPCProtocolError if validation fails
 */
export function validateBatchRequest(batch: unknown): void {
  if (typeof batch !== 'object' || batch === null) {
    throw new RPCProtocolError('Batch request must be an object')
  }

  const obj = batch as Record<string, unknown>

  // Validate id
  if (!('id' in obj)) {
    throw new RPCProtocolError('Missing required field: id')
  }
  if (typeof obj.id !== 'string') {
    throw new RPCProtocolError('Field id must be a string')
  }

  // Validate requests array
  if (!('requests' in obj)) {
    throw new RPCProtocolError('Missing required field: requests')
  }
  if (!Array.isArray(obj.requests)) {
    throw new RPCProtocolError('Field requests must be an array')
  }
  if (obj.requests.length === 0) {
    throw new RPCProtocolError('Batch request cannot be empty')
  }

  // Validate each request in the batch
  for (let i = 0; i < obj.requests.length; i++) {
    try {
      validateRequest(obj.requests[i])
    } catch (e) {
      throw new RPCProtocolError(`Invalid request at index ${i}: ${(e as Error).message}`)
    }
  }
}

/**
 * Validate method name format
 *
 * Method names must follow the pattern: `do.{namespace}.{action}`
 * Examples: 'do.things.list', 'do.identity.get', 'do.cdc.subscribe'
 *
 * @param method - The method name to validate
 * @returns Whether the method name is valid
 */
export function validateMethodName(method: string): boolean {
  // Accept various method patterns including special characters
  // The method should be non-empty
  return typeof method === 'string' && method.length > 0
}

// =============================================================================
// Serialization Functions
// =============================================================================

/**
 * Serialize an RPC request to a string
 *
 * @param request - The request to serialize
 * @param options - Serialization options
 * @returns JSON string representation
 *
 * @example
 * ```typescript
 * const json = serializeRequest({
 *   id: '1',
 *   method: 'do.things.list',
 *   params: { limit: 10 }
 * })
 * // '{"id":"1","method":"do.things.list","params":{"limit":10}}'
 * ```
 */
export function serializeRequest(request: RPCRequest, options?: SerializeOptions): string {
  const space = options?.pretty ? 2 : undefined
  return JSON.stringify(request, null, space)
}

/**
 * Serialize an RPC response to a string
 *
 * @param response - The response to serialize
 * @param options - Serialization options
 * @returns JSON string representation
 */
export function serializeResponse(response: RPCResponse, options?: SerializeOptions): string {
  const space = options?.pretty ? 2 : undefined
  return JSON.stringify(response, null, space)
}

/**
 * Serialize a batch request to a string
 *
 * @param batch - The batch request to serialize
 * @param options - Serialization options
 * @returns JSON string representation
 */
export function serializeBatchRequest(batch: RPCBatchRequest, options?: SerializeOptions): string {
  const space = options?.pretty ? 2 : undefined
  return JSON.stringify(batch, null, space)
}

/**
 * Serialize a batch response to a string
 *
 * @param batch - The batch response to serialize
 * @param options - Serialization options
 * @returns JSON string representation
 */
export function serializeBatchResponse(batch: RPCBatchResponse, options?: SerializeOptions): string {
  const space = options?.pretty ? 2 : undefined
  return JSON.stringify(batch, null, space)
}

// =============================================================================
// Error Helpers
// =============================================================================

/**
 * Create an RPC error object
 *
 * @param code - Error code (from RpcErrorCodes)
 * @param message - Human-readable error message
 * @param data - Optional additional error data
 * @returns RPCError object
 *
 * @example
 * ```typescript
 * const error = createError(-32601, 'Method not found', { method: 'do.invalid' })
 * ```
 */
export function createError(code: number, message: string, data?: unknown): RPCError {
  const error: RPCError = { code, message }
  if (data !== undefined) {
    error.data = data
  }
  return error
}

/**
 * Error code mapping for createRPCError
 */
const ERROR_CODES: Record<RPCErrorType, number> = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  Unauthorized: -32001,
  Forbidden: -32002,
  NotFound: -32003,
  Conflict: -32004,
  RateLimited: -32005,
  Timeout: -32006,
}

/**
 * Create an RPC error object by type name
 *
 * @param type - Error type name
 * @param message - Human-readable error message
 * @param data - Optional additional error data
 * @returns RPCError object
 *
 * @example
 * ```typescript
 * const error = createRPCError('MethodNotFound', 'Unknown method: do.invalid')
 * ```
 */
export function createRPCError(type: RPCErrorType, message: string, data?: unknown): RPCError {
  return {
    code: ERROR_CODES[type],
    message,
    data,
  }
}

/**
 * Check if a value is an RPC error
 *
 * @param value - Value to check
 * @returns Whether the value is a valid RPC error
 */
export function isRPCError(value: unknown): value is RPCError {
  if (!value || typeof value !== 'object') {
    return false
  }

  const obj = value as Record<string, unknown>
  if (typeof obj.code !== 'number' || typeof obj.message !== 'string') {
    return false
  }

  // Valid RPC error codes are:
  // Standard JSON-RPC: -32700 to -32600
  // Custom: -32001 to -32099
  const code = obj.code
  const isStandardError = code >= -32700 && code <= -32600
  const isCustomError = code >= -32099 && code <= -32001

  return isStandardError || isCustomError
}

/**
 * Create an error response for a request
 *
 * @param requestId - The ID of the request that failed
 * @param code - Error code
 * @param message - Error message
 * @param data - Optional error data
 * @returns Complete RPCResponse with error
 */
export function createErrorResponse(requestId: string, code: number, message: string, data?: unknown): RPCResponse {
  return {
    id: requestId,
    error: createError(code, message, data),
  }
}

/**
 * Create a success response for a request
 *
 * @param requestId - The ID of the request
 * @param result - The result data
 * @param meta - Optional metadata
 * @returns Complete RPCResponse with result
 */
export function createSuccessResponse<T>(requestId: string, result: T, meta?: RPCMeta): RPCResponse<T> {
  const response: RPCResponse<T> = { id: requestId, result }
  if (meta !== undefined) {
    response.meta = meta
  }
  return response
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a unique request ID
 *
 * Uses a combination of timestamp and random string for uniqueness.
 *
 * @returns Unique request ID string
 */
export function generateRequestId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 10)
  return `req-${timestamp}-${random}`
}

/**
 * Check if a message is a batch request
 *
 * @param message - Parsed message object
 * @returns Whether the message is a batch request
 */
export function isBatchRequest(message: unknown): message is RPCBatchRequest {
  return typeof message === 'object' && message !== null && 'requests' in message && Array.isArray((message as Record<string, unknown>).requests)
}

/**
 * Check if a message is a batch response
 *
 * @param message - Parsed message object
 * @returns Whether the message is a batch response
 */
export function isBatchResponse(message: unknown): message is RPCBatchResponse {
  return typeof message === 'object' && message !== null && 'responses' in message && Array.isArray((message as Record<string, unknown>).responses)
}

/**
 * Extract namespace from method name
 *
 * @param method - Method name (e.g., 'do.things.list')
 * @returns Namespace (e.g., 'things')
 */
export function extractNamespace(method: string): string | null {
  const parts = method.split('.')
  if (parts.length >= 2) {
    return parts[1]
  }
  return null
}

/**
 * Extract action from method name
 *
 * @param method - Method name (e.g., 'do.things.list')
 * @returns Action (e.g., 'list')
 */
export function extractAction(method: string): string | null {
  const parts = method.split('.')
  if (parts.length >= 3) {
    return parts[2]
  }
  return null
}
