/**
 * @dotdo/do/rpc - JSON-RPC 2.0 Implementation
 *
 * Implements JSON-RPC 2.0 specification (https://www.jsonrpc.org/specification)
 */

// ============================================================================
// JSON-RPC 2.0 Constants
// ============================================================================

export const JSONRPC_VERSION = '2.0' as const

// ============================================================================
// JSON-RPC 2.0 Error Codes (as per spec)
// ============================================================================

export const JsonRpcErrorCode = {
  /** Invalid JSON was received by the server */
  PARSE_ERROR: -32700,
  /** The JSON sent is not a valid Request object */
  INVALID_REQUEST: -32600,
  /** The method does not exist / is not available */
  METHOD_NOT_FOUND: -32601,
  /** Invalid method parameter(s) */
  INVALID_PARAMS: -32602,
  /** Internal JSON-RPC error */
  INTERNAL_ERROR: -32603,
  // Server errors (-32000 to -32099 reserved for implementation-defined server-errors)
  /** Server error - generic */
  SERVER_ERROR: -32000,
  /** Server error - method execution failed */
  EXECUTION_ERROR: -32001,
  /** Server error - timeout */
  TIMEOUT_ERROR: -32002,
} as const

export type JsonRpcErrorCode = (typeof JsonRpcErrorCode)[keyof typeof JsonRpcErrorCode]

// ============================================================================
// JSON-RPC 2.0 Types
// ============================================================================

/**
 * JSON-RPC 2.0 Request object
 */
export interface JsonRpcRequest {
  /** A String specifying the version of the JSON-RPC protocol. MUST be exactly "2.0" */
  jsonrpc: '2.0'
  /** A String containing the name of the method to be invoked */
  method: string
  /** A Structured value that holds the parameter values to be used during the invocation of the method */
  params?: JsonRpcParams
  /** An identifier established by the Client. MUST be a String, Number, or NULL if included */
  id?: JsonRpcId
}

/**
 * JSON-RPC 2.0 Notification (request without id)
 */
export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: JsonRpcParams
}

/**
 * JSON-RPC 2.0 Response object
 */
export interface JsonRpcResponse {
  /** A String specifying the version of the JSON-RPC protocol. MUST be exactly "2.0" */
  jsonrpc: '2.0'
  /** This member is REQUIRED on success. The value is determined by the method invoked */
  result?: unknown
  /** This member is REQUIRED on error. This member MUST NOT exist if there was no error */
  error?: JsonRpcError
  /** This member is REQUIRED. It MUST be the same as the value of the id member in the Request Object */
  id: JsonRpcId
}

/**
 * JSON-RPC 2.0 Error object
 */
export interface JsonRpcError {
  /** A Number that indicates the error type that occurred */
  code: number
  /** A String providing a short description of the error */
  message: string
  /** A Primitive or Structured value that contains additional information about the error */
  data?: unknown
}

/**
 * JSON-RPC 2.0 ID type (can be string, number, or null)
 */
export type JsonRpcId = string | number | null

/**
 * JSON-RPC 2.0 Parameters (can be array or object)
 */
export type JsonRpcParams = unknown[] | Record<string, unknown>

/**
 * JSON-RPC 2.0 Batch Request
 */
export type JsonRpcBatchRequest = JsonRpcRequest[]

/**
 * JSON-RPC 2.0 Batch Response
 */
export type JsonRpcBatchResponse = JsonRpcResponse[]

// ============================================================================
// Method Handler Types
// ============================================================================

/**
 * Method handler function type
 */
export type JsonRpcMethodHandler = (
  params: JsonRpcParams | undefined,
  context?: JsonRpcContext
) => Promise<unknown> | unknown

/**
 * Context passed to method handlers
 */
export interface JsonRpcContext {
  /** Request ID (if not a notification) */
  id?: JsonRpcId
  /** Original request */
  request?: Request
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

// ============================================================================
// JSON-RPC 2.0 Error Factory
// ============================================================================

/**
 * Create a JSON-RPC 2.0 error object
 */
export function createJsonRpcError(
  code: number,
  message: string,
  data?: unknown
): JsonRpcError {
  const error: JsonRpcError = { code, message }
  if (data !== undefined) {
    error.data = data
  }
  return error
}

/**
 * Create common JSON-RPC 2.0 errors
 */
export const JsonRpcErrors = {
  parseError: (data?: unknown) =>
    createJsonRpcError(JsonRpcErrorCode.PARSE_ERROR, 'Parse error', data),

  invalidRequest: (data?: unknown) =>
    createJsonRpcError(JsonRpcErrorCode.INVALID_REQUEST, 'Invalid Request', data),

  methodNotFound: (method?: string) =>
    createJsonRpcError(
      JsonRpcErrorCode.METHOD_NOT_FOUND,
      'Method not found',
      method ? { method } : undefined
    ),

  invalidParams: (data?: unknown) =>
    createJsonRpcError(JsonRpcErrorCode.INVALID_PARAMS, 'Invalid params', data),

  internalError: (data?: unknown) =>
    createJsonRpcError(JsonRpcErrorCode.INTERNAL_ERROR, 'Internal error', data),

  serverError: (message: string, data?: unknown) =>
    createJsonRpcError(JsonRpcErrorCode.SERVER_ERROR, message, data),

  executionError: (message: string, data?: unknown) =>
    createJsonRpcError(JsonRpcErrorCode.EXECUTION_ERROR, message, data),

  timeoutError: (data?: unknown) =>
    createJsonRpcError(JsonRpcErrorCode.TIMEOUT_ERROR, 'Timeout', data),
}

// ============================================================================
// JSON-RPC 2.0 Server
// ============================================================================

/**
 * JSON-RPC 2.0 Server options
 */
export interface JsonRpcServerOptions {
  /** Whether to allow notifications (requests without id) */
  allowNotifications?: boolean
  /** Whether to allow batch requests */
  allowBatch?: boolean
  /** Maximum batch size (default: 100) */
  maxBatchSize?: number
  /** Method timeout in milliseconds (default: 30000) */
  timeout?: number
}

/**
 * JSON-RPC 2.0 Server
 *
 * Handles method registration and request processing according to JSON-RPC 2.0 spec.
 */
export class JsonRpcServer {
  private methods: Map<string, JsonRpcMethodHandler> = new Map()
  private options: Required<JsonRpcServerOptions>

  constructor(options: JsonRpcServerOptions = {}) {
    this.options = {
      allowNotifications: options.allowNotifications ?? true,
      allowBatch: options.allowBatch ?? true,
      maxBatchSize: options.maxBatchSize ?? 100,
      timeout: options.timeout ?? 30000,
    }
  }

  /**
   * Register a method handler
   */
  registerMethod(name: string, handler: JsonRpcMethodHandler): this {
    if (!name || typeof name !== 'string') {
      throw new Error('Method name must be a non-empty string')
    }
    if (typeof handler !== 'function') {
      throw new Error('Handler must be a function')
    }
    // Prevent registering internal methods starting with "rpc."
    if (name.startsWith('rpc.')) {
      throw new Error('Method names starting with "rpc." are reserved')
    }
    this.methods.set(name, handler)
    return this
  }

  /**
   * Unregister a method handler
   */
  unregisterMethod(name: string): boolean {
    return this.methods.delete(name)
  }

  /**
   * Check if a method is registered
   */
  hasMethod(name: string): boolean {
    return this.methods.has(name)
  }

  /**
   * Get all registered method names
   */
  getMethods(): string[] {
    return Array.from(this.methods.keys())
  }

  /**
   * Process a JSON-RPC request (single or batch)
   */
  async process(
    input: unknown,
    context?: JsonRpcContext
  ): Promise<JsonRpcResponse | JsonRpcBatchResponse | null> {
    // Handle batch requests
    if (Array.isArray(input)) {
      if (!this.options.allowBatch) {
        return this.createErrorResponse(null, JsonRpcErrors.invalidRequest('Batch requests not allowed'))
      }
      if (input.length === 0) {
        return this.createErrorResponse(null, JsonRpcErrors.invalidRequest('Empty batch'))
      }
      if (input.length > this.options.maxBatchSize) {
        return this.createErrorResponse(
          null,
          JsonRpcErrors.invalidRequest(`Batch size exceeds maximum of ${this.options.maxBatchSize}`)
        )
      }
      return this.processBatch(input as JsonRpcRequest[], context)
    }

    // Handle single request
    return this.processSingle(input as JsonRpcRequest, context)
  }

  /**
   * Process a batch of requests
   */
  private async processBatch(
    requests: unknown[],
    context?: JsonRpcContext
  ): Promise<JsonRpcBatchResponse | null> {
    const responses = await Promise.all(
      requests.map((req) => this.processSingle(req as JsonRpcRequest, context))
    )

    // Filter out null responses (notifications)
    const validResponses = responses.filter(
      (r): r is JsonRpcResponse => r !== null
    )

    // If all requests were notifications, return null (no response)
    if (validResponses.length === 0) {
      return null
    }

    return validResponses
  }

  /**
   * Process a single request
   */
  private async processSingle(
    request: unknown,
    context?: JsonRpcContext
  ): Promise<JsonRpcResponse | null> {
    // Validate request structure
    const validation = this.validateRequest(request)
    if (!validation.valid) {
      // For invalid requests, we need to determine the id
      const id = this.extractId(request)
      return this.createErrorResponse(id, validation.error!)
    }

    const req = request as JsonRpcRequest
    const isNotification = req.id === undefined

    // Handle notifications
    if (isNotification) {
      if (!this.options.allowNotifications) {
        // Return error for notifications if not allowed
        return this.createErrorResponse(null, JsonRpcErrors.invalidRequest('Notifications not allowed'))
      }
      // Execute notification but don't return response
      try {
        await this.executeMethod(req.method, req.params, { ...context, id: undefined })
      } catch {
        // Notifications don't return errors
      }
      return null
    }

    // Execute method and return response
    try {
      const result = await this.executeMethod(req.method, req.params, {
        ...context,
        id: req.id,
      })
      return this.createSuccessResponse(req.id ?? null, result)
    } catch (error) {
      return this.createErrorResponse(req.id ?? null, this.errorToJsonRpcError(error))
    }
  }

  /**
   * Execute a method with timeout
   */
  private async executeMethod(
    method: string,
    params: JsonRpcParams | undefined,
    context?: JsonRpcContext
  ): Promise<unknown> {
    const handler = this.methods.get(method)
    if (!handler) {
      throw JsonRpcErrors.methodNotFound(method)
    }

    // Execute with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(JsonRpcErrors.timeoutError({ method, timeout: this.options.timeout }))
      }, this.options.timeout)
    })

    const resultPromise = Promise.resolve(handler(params, context))

    return Promise.race([resultPromise, timeoutPromise])
  }

  /**
   * Validate a JSON-RPC request
   */
  private validateRequest(
    request: unknown
  ): { valid: true } | { valid: false; error: JsonRpcError } {
    if (request === null || typeof request !== 'object') {
      return { valid: false, error: JsonRpcErrors.invalidRequest('Request must be an object') }
    }

    const req = request as Record<string, unknown>

    // Check jsonrpc version
    if (req.jsonrpc !== '2.0') {
      return {
        valid: false,
        error: JsonRpcErrors.invalidRequest('Invalid JSON-RPC version. Must be "2.0"'),
      }
    }

    // Check method
    if (typeof req.method !== 'string' || req.method.length === 0) {
      return {
        valid: false,
        error: JsonRpcErrors.invalidRequest('Method must be a non-empty string'),
      }
    }

    // Check params (optional, but must be array or object if present)
    if (req.params !== undefined) {
      if (!Array.isArray(req.params) && (typeof req.params !== 'object' || req.params === null)) {
        return {
          valid: false,
          error: JsonRpcErrors.invalidParams('Params must be an array or object'),
        }
      }
    }

    // Check id (optional, but must be string, number, or null if present)
    if (req.id !== undefined && req.id !== null) {
      if (typeof req.id !== 'string' && typeof req.id !== 'number') {
        return {
          valid: false,
          error: JsonRpcErrors.invalidRequest('ID must be a string, number, or null'),
        }
      }
    }

    return { valid: true }
  }

  /**
   * Extract ID from potentially invalid request
   */
  private extractId(request: unknown): JsonRpcId {
    if (request === null || typeof request !== 'object') {
      return null
    }
    const req = request as Record<string, unknown>
    if (req.id === undefined) {
      return null
    }
    if (typeof req.id === 'string' || typeof req.id === 'number' || req.id === null) {
      return req.id
    }
    return null
  }

  /**
   * Convert an error to a JSON-RPC error
   */
  private errorToJsonRpcError(error: unknown): JsonRpcError {
    // If already a JSON-RPC error object
    if (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      'message' in error &&
      typeof (error as JsonRpcError).code === 'number' &&
      typeof (error as JsonRpcError).message === 'string'
    ) {
      return error as JsonRpcError
    }

    // Convert Error instances
    if (error instanceof Error) {
      return JsonRpcErrors.executionError(error.message, {
        name: error.name,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      })
    }

    // Unknown error type
    return JsonRpcErrors.internalError(String(error))
  }

  /**
   * Create a success response
   */
  private createSuccessResponse(id: JsonRpcId, result: unknown): JsonRpcResponse {
    return {
      jsonrpc: JSONRPC_VERSION,
      result,
      id: id ?? null,
    }
  }

  /**
   * Create an error response
   */
  private createErrorResponse(id: JsonRpcId, error: JsonRpcError): JsonRpcResponse {
    return {
      jsonrpc: JSONRPC_VERSION,
      error,
      id: id ?? null,
    }
  }

  /**
   * Handle an HTTP request and return a Response
   */
  async handleRequest(request: Request): Promise<Response> {
    // Only accept POST requests
    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify(
          this.createErrorResponse(null, JsonRpcErrors.invalidRequest('Method must be POST'))
        ),
        {
          status: 405,
          headers: { 'Content-Type': 'application/json', Allow: 'POST' },
        }
      )
    }

    // Check content type
    const contentType = request.headers.get('Content-Type')
    if (!contentType || !contentType.includes('application/json')) {
      return new Response(
        JSON.stringify(
          this.createErrorResponse(null, JsonRpcErrors.invalidRequest('Content-Type must be application/json'))
        ),
        {
          status: 415,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Parse request body
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return new Response(JSON.stringify(this.createErrorResponse(null, JsonRpcErrors.parseError())), {
        status: 200, // JSON-RPC spec says to return 200 even on parse errors
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Process the request
    const context: JsonRpcContext = { request }
    const response = await this.process(body, context)

    // No response for notifications
    if (response === null) {
      return new Response(null, { status: 204 })
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// ============================================================================
// JSON-RPC 2.0 Client
// ============================================================================

/**
 * JSON-RPC 2.0 Client options
 */
export interface JsonRpcClientOptions {
  /** The endpoint URL */
  url: string
  /** Default headers to include in requests */
  headers?: Record<string, string>
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number
  /** Custom fetch implementation */
  fetch?: typeof fetch
}

/**
 * JSON-RPC 2.0 Client
 *
 * Provides a convenient way to make JSON-RPC 2.0 requests.
 */
export class JsonRpcClient {
  private options: Required<Omit<JsonRpcClientOptions, 'headers'>> & { headers: Record<string, string> }
  private idCounter = 0

  constructor(options: JsonRpcClientOptions) {
    this.options = {
      url: options.url,
      headers: options.headers ?? {},
      timeout: options.timeout ?? 30000,
      fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
    }
  }

  /**
   * Generate a unique request ID
   */
  private nextId(): number {
    return ++this.idCounter
  }

  /**
   * Make a JSON-RPC request
   */
  async call<T = unknown>(method: string, params?: JsonRpcParams): Promise<T> {
    const request: JsonRpcRequest = {
      jsonrpc: JSONRPC_VERSION,
      method,
      params,
      id: this.nextId(),
    }

    const response = await this.sendRequest(request)

    if (Array.isArray(response)) {
      throw new Error('Unexpected batch response for single request')
    }

    if ('error' in response && response.error) {
      const error = new Error(response.error.message) as Error & { code: number; data: unknown }
      error.code = response.error.code
      error.data = response.error.data
      throw error
    }

    return (response as { result?: unknown }).result as T
  }

  /**
   * Send a notification (no response expected)
   */
  async notify(method: string, params?: JsonRpcParams): Promise<void> {
    const notification: JsonRpcNotification = {
      jsonrpc: JSONRPC_VERSION,
      method,
      params,
    }

    await this.sendRequest(notification, true)
  }

  /**
   * Make a batch request
   */
  async batch<T extends unknown[] = unknown[]>(
    requests: Array<{ method: string; params?: JsonRpcParams }>
  ): Promise<T> {
    const batchRequest: JsonRpcBatchRequest = requests.map((req) => ({
      jsonrpc: JSONRPC_VERSION,
      method: req.method,
      params: req.params,
      id: this.nextId(),
    }))

    const responses = (await this.sendRequest(batchRequest)) as JsonRpcBatchResponse

    // Map responses by ID for correct ordering
    const responseMap = new Map(responses.map((r) => [r.id, r]))

    return batchRequest.map((req) => {
      const response = responseMap.get(req.id!)
      if (!response) {
        throw new Error(`Missing response for request ${req.id}`)
      }
      if (response.error) {
        const error = new Error(response.error.message) as Error & { code: number; data: unknown }
        error.code = response.error.code
        error.data = response.error.data
        throw error
      }
      return response.result
    }) as T
  }

  /**
   * Send a request to the server
   */
  private async sendRequest(
    body: JsonRpcRequest | JsonRpcNotification | JsonRpcBatchRequest,
    isNotification = false
  ): Promise<JsonRpcResponse | JsonRpcBatchResponse> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout)

    try {
      const response = await this.options.fetch(this.options.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.options.headers,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      // For notifications, no response body expected
      if (isNotification && response.status === 204) {
        return {} as JsonRpcResponse
      }

      if (!response.ok && response.status !== 200) {
        throw new Error(`HTTP error: ${response.status}`)
      }

      return (await response.json()) as JsonRpcResponse | JsonRpcBatchResponse
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a JSON-RPC 2.0 request object
 */
export function createJsonRpcRequest(
  method: string,
  params?: JsonRpcParams,
  id?: JsonRpcId
): JsonRpcRequest {
  const request: JsonRpcRequest = {
    jsonrpc: JSONRPC_VERSION,
    method,
  }
  if (params !== undefined) {
    request.params = params
  }
  if (id !== undefined) {
    request.id = id
  }
  return request
}

/**
 * Create a JSON-RPC 2.0 notification object
 */
export function createJsonRpcNotification(
  method: string,
  params?: JsonRpcParams
): JsonRpcNotification {
  const notification: JsonRpcNotification = {
    jsonrpc: JSONRPC_VERSION,
    method,
  }
  if (params !== undefined) {
    notification.params = params
  }
  return notification
}

/**
 * Check if an object is a valid JSON-RPC 2.0 request
 */
export function isJsonRpcRequest(obj: unknown): obj is JsonRpcRequest {
  if (obj === null || typeof obj !== 'object') {
    return false
  }
  const req = obj as Record<string, unknown>
  return (
    req.jsonrpc === '2.0' &&
    typeof req.method === 'string' &&
    (req.params === undefined || Array.isArray(req.params) || typeof req.params === 'object')
  )
}

/**
 * Check if an object is a valid JSON-RPC 2.0 response
 */
export function isJsonRpcResponse(obj: unknown): obj is JsonRpcResponse {
  if (obj === null || typeof obj !== 'object') {
    return false
  }
  const res = obj as Record<string, unknown>
  return (
    res.jsonrpc === '2.0' &&
    ('result' in res || 'error' in res) &&
    'id' in res
  )
}

/**
 * Check if an object is a JSON-RPC 2.0 error response
 */
export function isJsonRpcError(obj: unknown): obj is JsonRpcResponse & { error: JsonRpcError } {
  return isJsonRpcResponse(obj) && 'error' in obj && obj.error !== undefined
}
