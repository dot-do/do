/**
 * CapnWeb RPC Method Registry and Dispatch
 *
 * Manages registration of RPC methods and dispatches incoming requests
 * to the appropriate handlers. Supports middleware/hooks for cross-cutting
 * concerns like authentication, logging, and rate limiting.
 *
 * @module rpc/methods
 *
 * @example
 * ```typescript
 * import { MethodRegistry, dispatch } from 'do/rpc/methods'
 *
 * // Create registry and register methods
 * const registry = new MethodRegistry()
 *
 * registry.register('do.things.list', async (params, ctx) => {
 *   return ctx.state.storage.list('things')
 * })
 *
 * // Add middleware
 * registry.use(async (request, ctx, next) => {
 *   console.log(`Calling ${request.method}`)
 *   const result = await next()
 *   console.log(`Completed ${request.method}`)
 *   return result
 * })
 *
 * // Dispatch a request
 * const response = await dispatch(registry, request, context)
 * ```
 */

import type { RPCRequest, RPCResponse, RPCError, RPCMeta, DORPCMethods } from '../types/rpc'
import { RpcErrorCodes } from '../types/rpc'

// =============================================================================
// Types
// =============================================================================

/**
 * Context passed to method handlers
 *
 * Contains access to Durable Object state, environment bindings,
 * and request metadata.
 */
export interface MethodContext {
  /** Durable Object state (storage, id, etc.) - typed as unknown to avoid version conflicts */
  state: unknown
  /** Environment bindings */
  env: unknown
  /** Request metadata */
  meta?: RPCMeta
  /** WebSocket connection (if WS transport) */
  websocket?: WebSocket
  /** Original HTTP request (if HTTP transport) */
  request?: Request
}

/**
 * Method handler function type
 *
 * @typeParam TParams - Type of the params object
 * @typeParam TResult - Type of the result
 */
export type MethodHandler<TParams = unknown, TResult = unknown> = (
  params: TParams,
  ctx: MethodContext
) => Promise<TResult>

/**
 * Middleware function type
 *
 * Middleware can intercept requests before/after handler execution.
 * Call `next()` to continue to the next middleware or handler.
 */
export type Middleware = (
  request: RPCRequest,
  ctx: MethodContext,
  next: () => Promise<unknown>
) => Promise<unknown>

/**
 * Method registration options
 */
export interface MethodOptions {
  /** Human-readable description */
  description?: string
  /** Parameter schema (for validation and docs) */
  params?: Record<string, ParamSchema>
  /** Return type description */
  returns?: string
  /** Required permissions */
  permissions?: string[]
  /** Rate limit (requests per minute) */
  rateLimit?: number
}

/**
 * Parameter schema for documentation and validation
 */
export interface ParamSchema {
  /** Parameter type */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  /** Whether the parameter is required */
  required?: boolean
  /** Description */
  description?: string
  /** Default value */
  default?: unknown
}

/**
 * Registered method with metadata
 */
export interface RegisteredMethod {
  /** Method name */
  name: string
  /** Handler function */
  handler: MethodHandler
  /** Method options/metadata */
  options: MethodOptions
}

// =============================================================================
// Method Registry Class
// =============================================================================

/**
 * Registry for RPC methods
 *
 * Manages method registration, middleware, and provides dispatch functionality.
 *
 * @example
 * ```typescript
 * const registry = new MethodRegistry()
 *
 * // Register with options
 * registry.register('do.things.list', handler, {
 *   description: 'List all things',
 *   params: {
 *     limit: { type: 'number', required: false, default: 100 },
 *     offset: { type: 'number', required: false, default: 0 },
 *   },
 *   returns: 'Thing[]',
 *   rateLimit: 100,
 * })
 *
 * // Get method info
 * const method = registry.get('do.things.list')
 *
 * // List all methods
 * const methods = registry.list()
 * ```
 */
export class MethodRegistry {
  /** Map of method names to registered methods */
  private methods: Map<string, RegisteredMethod> = new Map()

  /** Middleware chain */
  private middleware: Middleware[] = []

  /**
   * Create a new method registry
   */
  constructor() {
    // Initialize internal maps for methods and middleware
    this.methods = new Map()
    this.middleware = []
  }

  /**
   * Register a method handler
   *
   * @param name - Method name (e.g., 'do.things.list')
   * @param handler - Handler function
   * @param options - Optional metadata and configuration
   * @throws Error if method is already registered
   *
   * @example
   * ```typescript
   * registry.register('do.things.create', async (params, ctx) => {
   *   const thing = await ctx.state.storage.put('things', params)
   *   return thing
   * }, {
   *   description: 'Create a new thing',
   *   params: { name: { type: 'string', required: true } },
   * })
   * ```
   */
  register(name: string, handler: MethodHandler, options?: MethodOptions): void {
    // Validate method name format (should be dot-separated)
    if (!name || typeof name !== 'string') {
      throw new Error('Method name must be a non-empty string')
    }

    // Check for duplicate registration
    if (this.methods.has(name)) {
      throw new Error(`Method already registered: ${name}`)
    }

    // Store handler and options
    this.methods.set(name, {
      name,
      handler,
      options: options ?? {},
    })
  }

  /**
   * Register multiple methods at once
   *
   * @param methods - Map of method names to handlers
   * @param options - Shared options for all methods
   */
  registerAll(methods: Record<string, MethodHandler>, options?: MethodOptions): void {
    for (const [name, handler] of Object.entries(methods)) {
      this.register(name, handler, options)
    }
  }

  /**
   * Unregister a method
   *
   * @param name - Method name to unregister
   * @returns Whether the method was found and removed
   */
  unregister(name: string): boolean {
    return this.methods.delete(name)
  }

  /**
   * Get a registered method
   *
   * @param name - Method name
   * @returns Registered method or undefined
   */
  get(name: string): RegisteredMethod | undefined {
    return this.methods.get(name)
  }

  /**
   * Check if a method is registered
   *
   * @param name - Method name
   * @returns Whether the method exists
   */
  has(name: string): boolean {
    return this.methods.has(name)
  }

  /**
   * List all registered methods
   *
   * @param namespace - Optional namespace filter (e.g., 'things')
   * @returns Array of registered methods
   */
  list(namespace?: string): RegisteredMethod[] {
    const allMethods = Array.from(this.methods.values())

    if (!namespace) {
      return allMethods
    }

    // Filter by namespace (namespace is the part after 'do.' and before the action)
    // e.g., 'do.things.list' -> namespace is 'things'
    return allMethods.filter((method) => {
      const parts = method.name.split('.')
      // Expected format: do.{namespace}.{action}
      return parts.length >= 3 && parts[1] === namespace
    })
  }

  /**
   * List methods grouped by namespace
   *
   * @returns Map of namespace to method names
   */
  listByNamespace(): Map<string, string[]> {
    const grouped = new Map<string, string[]>()

    for (const method of this.methods.values()) {
      const parts = method.name.split('.')
      // Expected format: do.{namespace}.{action}
      const namespace = parts.length >= 3 ? parts[1] : 'other'

      if (!grouped.has(namespace)) {
        grouped.set(namespace, [])
      }
      grouped.get(namespace)!.push(method.name)
    }

    return grouped
  }

  /**
   * Add middleware to the chain
   *
   * Middleware is executed in order of registration.
   *
   * @param middleware - Middleware function
   *
   * @example
   * ```typescript
   * // Logging middleware
   * registry.use(async (request, ctx, next) => {
   *   const start = Date.now()
   *   try {
   *     return await next()
   *   } finally {
   *     console.log(`${request.method} took ${Date.now() - start}ms`)
   *   }
   * })
   *
   * // Auth middleware
   * registry.use(async (request, ctx, next) => {
   *   if (!ctx.meta?.auth) {
   *     throw new Error('Unauthorized')
   *   }
   *   return next()
   * })
   * ```
   */
  use(middleware: Middleware): void {
    this.middleware.push(middleware)
  }

  /**
   * Get all registered middleware
   *
   * @returns Array of middleware functions
   */
  getMiddleware(): Middleware[] {
    return [...this.middleware]
  }
}

// =============================================================================
// Dispatch Function
// =============================================================================

/**
 * Dispatch an RPC request to the appropriate handler
 *
 * Runs the middleware chain and then the method handler.
 * Returns an RPC response with either result or error.
 *
 * @param registry - Method registry
 * @param request - RPC request
 * @param ctx - Method context
 * @returns RPC response
 *
 * @example
 * ```typescript
 * const response = await dispatch(registry, {
 *   id: '1',
 *   method: 'do.things.list',
 *   params: { limit: 10 },
 * }, context)
 *
 * if (response.error) {
 *   console.error(response.error.message)
 * } else {
 *   console.log(response.result)
 * }
 * ```
 */
export async function dispatch(
  registry: MethodRegistry,
  request: RPCRequest,
  ctx: MethodContext
): Promise<RPCResponse> {
  try {
    // Look up method in registry
    const method = registry.get(request.method)

    // Return MethodNotFound error if not found
    if (!method) {
      return {
        id: request.id,
        error: {
          code: RpcErrorCodes.MethodNotFound,
          message: `Method not found: ${request.method}`,
        },
      }
    }

    // Build middleware chain
    const middleware = registry.getMiddleware()

    // Execute chain with handler at the end
    let index = 0
    const executeNext = async (): Promise<unknown> => {
      if (index < middleware.length) {
        const currentMiddleware = middleware[index++]
        return currentMiddleware(request, ctx, executeNext)
      } else {
        // Execute the actual handler
        return method.handler(request.params, ctx)
      }
    }

    const result = await executeNext()

    // Return response with result
    return {
      id: request.id,
      result,
    }
  } catch (error) {
    // Catch errors and convert to RPC errors
    const rpcError: RPCError = {
      code: RpcErrorCodes.InternalError,
      message: error instanceof Error ? error.message : 'Unknown error',
      data: error instanceof Error ? { stack: error.stack } : undefined,
    }

    return {
      id: request.id,
      error: rpcError,
    }
  }
}

/**
 * Dispatch a batch of requests
 *
 * Executes requests in parallel (unless abortOnError is true).
 *
 * @param registry - Method registry
 * @param requests - Array of RPC requests
 * @param ctx - Method context
 * @param abortOnError - Stop on first error
 * @returns Array of RPC responses
 */
export async function dispatchBatch(
  registry: MethodRegistry,
  requests: RPCRequest[],
  ctx: MethodContext,
  abortOnError?: boolean
): Promise<RPCResponse[]> {
  if (abortOnError) {
    // Execute sequentially and stop on first error
    const responses: RPCResponse[] = []
    for (const request of requests) {
      const response = await dispatch(registry, request, ctx)
      responses.push(response)
      if (response.error) {
        break
      }
    }
    return responses
  } else {
    // Execute in parallel with Promise.all
    return Promise.all(requests.map((request) => dispatch(registry, request, ctx)))
  }
}

// =============================================================================
// Built-in Middleware
// =============================================================================

/**
 * Create a logging middleware
 *
 * @param logger - Logger function (defaults to console.log)
 * @returns Middleware function
 */
export function createLoggingMiddleware(logger: (message: string) => void = console.log): Middleware {
  return async (request, ctx, next) => {
    const start = Date.now()
    logger(`RPC: ${request.method} started`)
    try {
      const result = await next()
      logger(`RPC: ${request.method} completed in ${Date.now() - start}ms`)
      return result
    } catch (error) {
      logger(`RPC: ${request.method} failed in ${Date.now() - start}ms - ${error instanceof Error ? error.message : 'Unknown error'}`)
      throw error
    }
  }
}

/**
 * Create an authentication middleware
 *
 * @param validator - Function to validate auth token
 * @returns Middleware function
 */
export function createAuthMiddleware(validator: (token: string, ctx: MethodContext) => Promise<boolean>): Middleware {
  return async (request, ctx, next) => {
    const token = ctx.meta?.auth
    if (!token) {
      throw new RPCAuthError('Authentication required')
    }

    const isValid = await validator(token, ctx)
    if (!isValid) {
      throw new RPCAuthError('Invalid authentication token')
    }

    return next()
  }
}

/**
 * RPC authentication error
 */
export class RPCAuthError extends Error {
  code = RpcErrorCodes.Unauthorized
  constructor(message: string) {
    super(message)
    this.name = 'RPCAuthError'
  }
}

/**
 * RPC rate limit error
 */
export class RPCRateLimitError extends Error {
  code = RpcErrorCodes.RateLimited
  constructor(message: string) {
    super(message)
    this.name = 'RPCRateLimitError'
  }
}

/**
 * Create a rate limiting middleware
 *
 * @param maxRequests - Maximum requests per window
 * @param windowMs - Window duration in milliseconds
 * @returns Middleware function
 */
export function createRateLimitMiddleware(maxRequests: number, windowMs: number): Middleware {
  const requestCounts = new Map<string, { count: number; windowStart: number }>()

  return async (request, ctx, next) => {
    const key = ctx.meta?.auth ?? 'anonymous'
    const now = Date.now()

    let entry = requestCounts.get(key)
    if (!entry || now - entry.windowStart >= windowMs) {
      // Start new window
      entry = { count: 0, windowStart: now }
      requestCounts.set(key, entry)
    }

    entry.count++

    if (entry.count > maxRequests) {
      throw new RPCRateLimitError(`Rate limit exceeded: ${maxRequests} requests per ${windowMs}ms`)
    }

    return next()
  }
}

/**
 * Create a timing middleware that adds duration to response meta
 *
 * @returns Middleware function
 */
export function createTimingMiddleware(): Middleware {
  return async (request, ctx, next) => {
    const start = Date.now()
    const result = await next()
    const duration = Date.now() - start

    // Add duration to context meta
    if (!ctx.meta) {
      ctx.meta = {}
    }
    ctx.meta.duration = duration

    return result
  }
}

// =============================================================================
// Default Method Handlers
// =============================================================================

/**
 * Extended method context with DO-specific properties
 *
 * This extends the base MethodContext with properties needed
 * for DO system methods (identity, getIdentity, setContext, etc.)
 */
export interface DOMethodContext extends MethodContext {
  /** Get DO identity */
  getIdentity?: () => {
    $id: string
    $type: string
    $context?: string
    $version: number
    $createdAt: number
    $updatedAt: number
  }
  /** Set DO context */
  setContext?: (context: string | undefined) => Promise<void>
  /** Get DO context */
  getContext?: () => string | undefined
  /** List children (optional) */
  listChildren?: (type?: string) => Promise<string[]>
}

/**
 * Create default handlers for system methods
 *
 * Includes: do.system.ping, do.system.stats, do.system.schema
 *
 * @param registry - Registry to populate with system methods
 */
export function registerSystemMethods(registry: MethodRegistry): void {
  // Register do.system.ping
  registry.register(
    'do.system.ping',
    async () => {
      return { pong: true, timestamp: Date.now() }
    },
    {
      description: 'Health check ping',
      returns: '{ pong: true, timestamp: number }',
    }
  )

  // Register do.system.stats
  registry.register(
    'do.system.stats',
    async (_params, ctx) => {
      const doCtx = ctx as DOMethodContext
      const identity = doCtx.getIdentity?.() ?? { $id: 'unknown', $type: 'unknown', $version: 0, $createdAt: 0, $updatedAt: 0 }
      return {
        identity,
        storage: {
          usedBytes: 0, // Would need actual storage metrics
          tableCount: 0,
          rowCount: 0,
        },
        connections: {
          active: 0,
          hibernating: 0,
        },
        cdc: {
          sequence: 0,
          pendingEvents: 0,
          subscribers: 0,
        },
        uptime: Date.now() - identity.$createdAt,
        lastActivity: Date.now(),
      }
    },
    {
      description: 'Get DO statistics',
      returns: 'DOStats',
    }
  )

  // Register do.system.schema
  registry.register(
    'do.system.schema',
    async (_params, ctx) => {
      const doCtx = ctx as DOMethodContext
      const identity = doCtx.getIdentity?.()
      const methods = registry.list()

      return {
        type: identity?.$type ?? 'DigitalObject',
        methods: methods.map((m) => ({
          name: m.name,
          description: m.options.description,
          params: m.options.params,
          returns: m.options.returns,
        })),
        collections: [], // Would be populated from actual collections
      }
    },
    {
      description: 'Get DO schema (available methods)',
      returns: 'DOSchema',
    }
  )
}

/**
 * Create default handlers for identity methods
 *
 * Includes: do.identity.get, do.identity.setContext, do.identity.getContext
 *
 * @param registry - Registry to populate with identity methods
 */
export function registerIdentityMethods(registry: MethodRegistry): void {
  // Register do.identity.get
  registry.register(
    'do.identity.get',
    async (_params, ctx) => {
      const doCtx = ctx as DOMethodContext
      if (!doCtx.getIdentity) {
        throw new Error('DO context does not support getIdentity')
      }
      return doCtx.getIdentity()
    },
    {
      description: 'Get DO identity',
      returns: 'DigitalObjectIdentity',
    }
  )

  // Register do.identity.setContext
  registry.register(
    'do.identity.setContext',
    async (params, ctx) => {
      const doCtx = ctx as DOMethodContext
      if (!doCtx.setContext) {
        throw new Error('DO context does not support setContext')
      }
      const { ref } = params as { ref: string }
      await doCtx.setContext(ref)
    },
    {
      description: 'Set parent context for CDC streaming',
      params: {
        ref: { type: 'string', required: true, description: 'Parent DO reference URL' },
      },
    }
  )

  // Register do.identity.getContext
  registry.register(
    'do.identity.getContext',
    async (_params, ctx) => {
      const doCtx = ctx as DOMethodContext
      if (!doCtx.getContext) {
        throw new Error('DO context does not support getContext')
      }
      return doCtx.getContext() ?? null
    },
    {
      description: 'Get parent context',
      returns: 'DigitalObjectRef | null',
    }
  )
}

/**
 * Create a default registry with all standard DO methods registered
 *
 * @returns A new MethodRegistry with system and identity methods registered
 */
export function createDefaultRegistry(): MethodRegistry {
  const registry = new MethodRegistry()
  registerSystemMethods(registry)
  registerIdentityMethods(registry)
  return registry
}
