/**
 * DigitalObject - Base class for all Digital Objects
 *
 * This is the foundational class that all DOs inherit from. It provides:
 * - Core identity management ($id, $type, $context, $version)
 * - State management via DO SQLite
 * - Hibernation support (Agents SDK pattern)
 * - HTTP request handling via fetch()
 * - Child DO creation with $context linking
 *
 * @example
 * ```typescript
 * import { DigitalObject } from './DigitalObject'
 *
 * export class MyStartup extends DigitalObject {
 *   async onInitialize() {
 *     await this.state.set('status', 'active')
 *   }
 *
 *   async handlePath(request: Request, path: string): Promise<Response> {
 *     if (path === '/api/status') {
 *       const status = await this.state.get('status')
 *       return Response.json({ status })
 *     }
 *     return new Response('Not Found', { status: 404 })
 *   }
 * }
 * ```
 *
 * @module do/DigitalObject
 */

import type { DurableObjectState, DurableObjectId, DurableObject } from '@cloudflare/workers-types'
import type { DigitalObjectIdentity, DOType, DigitalObjectRef } from '../types/identity'
import type { CDCEvent, CDCOptions, CDCOperation } from '../types/storage'
import type { RPCRequest, RPCResponse } from '../types/rpc'
import { createDOState, type DOState } from './state'
import { HibernationManager, type HibernationConfig } from './hibernation'
import { ContextStreamer } from '../db/cdc/streaming'
import {
  MethodRegistry,
  dispatch,
  registerSystemMethods,
  registerIdentityMethods,
  type DOMethodContext,
} from '../rpc/methods'

/**
 * Environment bindings for the Digital Object
 *
 * @interface DOEnv
 */
export interface DOEnv {
  /** The Durable Object namespace for creating child DOs */
  DO: DurableObjectNamespace
  /** Optional R2 bucket for cold storage */
  R2?: R2Bucket
  /** Optional KV namespace for caching */
  KV?: KVNamespace
  /** Optional AI binding */
  AI?: Ai
}

/**
 * Options for creating a DigitalObject
 *
 * @interface DigitalObjectOptions
 */
export interface DigitalObjectOptions {
  /** DO type (defaults to class name) */
  type?: DOType
  /** Initial state values */
  initialState?: Record<string, unknown>
  /** Hibernation configuration */
  hibernation?: Partial<HibernationConfig>
}

/**
 * Result of handling a fetch request
 *
 * @interface FetchResult
 */
export interface FetchResult {
  /** HTTP response to return */
  response: Response
  /** Whether the request was handled */
  handled: boolean
}

/**
 * Base class for all Digital Objects
 *
 * A Digital Object is a stateful, addressable entity that:
 * - Has a unique HTTPS URL identity ($id)
 * - Belongs to a type ($type)
 * - May have a parent context ($context) for CDC streaming
 * - Maintains versioned state ($version) for optimistic concurrency
 *
 * @class DigitalObject
 * @implements {DurableObject}
 *
 * @example Creating a custom DO
 * ```typescript
 * export class TenantDO extends DigitalObject {
 *   async onInitialize() {
 *     // Set up initial tenant state
 *     await this.state.set('plan', 'free')
 *     await this.state.set('users', [])
 *   }
 * }
 * ```
 *
 * @example Handling requests
 * ```typescript
 * export class ApiDO extends DigitalObject {
 *   async handlePath(request: Request, path: string): Promise<Response> {
 *     const method = request.method
 *     const body = method === 'POST' ? await request.json() : null
 *
 *     // Route to handlers
 *     if (path.startsWith('/api/users')) {
 *       return this.handleUsers(request, path, body)
 *     }
 *
 *     return new Response('Not Found', { status: 404 })
 *   }
 * }
 * ```
 */
export abstract class DigitalObject implements DurableObject {
  /**
   * The unique HTTPS URL identifier for this DO
   * Format: https://domain or https://domain/path
   *
   * @example 'https://headless.ly'
   * @example 'https://crm.headless.ly/acme'
   */
  protected $id!: string

  /**
   * The type URL defining this DO's schema
   * Can be a well-known type (resolves to https://do.md/{type})
   * or a full URL
   *
   * @example 'Startup' (resolves to https://do.md/Startup)
   * @example 'https://schema.org.ai/Agent'
   */
  protected $type!: DOType

  /**
   * Optional parent DO URL for CDC event streaming
   * Events bubble up through the $context chain
   *
   * @example 'https://startups.studio' (parent of https://headless.ly)
   */
  protected $context?: DigitalObjectRef

  /**
   * Version number for optimistic concurrency control
   * Incremented on each state mutation
   */
  protected $version!: number

  /**
   * State management instance for this DO
   * Provides get/set/delete operations backed by SQLite
   */
  protected state!: DOState

  /**
   * Hibernation manager for this DO
   * Handles sleep/wake lifecycle and WebSocket preservation
   */
  protected hibernation!: HibernationManager

  /**
   * Environment bindings (DO namespace, R2, KV, etc.)
   */
  protected env!: DOEnv

  /**
   * Raw Durable Object state from Cloudflare runtime
   */
  protected ctx!: DurableObjectState

  /**
   * Whether the DO has been initialized
   * @internal
   */
  private initialized = false

  /**
   * RPC method registry for this DO
   * Subclasses can register additional methods here
   */
  protected rpcRegistry!: MethodRegistry

  /**
   * Creates a new DigitalObject instance
   *
   * @param ctx - Durable Object state from Cloudflare runtime
   * @param env - Environment bindings
   *
   * @example
   * ```typescript
   * // This is called automatically by Cloudflare Workers runtime
   * // You don't typically call this directly
   * const do = new MyDigitalObject(state, env)
   * ```
   */
  constructor(ctx: DurableObjectState, env: DOEnv) {
    this.ctx = ctx
    this.env = env

    // Initialize state and hibernation managers
    // These will be fully set up in initialize()
    this.state = createDOState(ctx)
    this.hibernation = new HibernationManager(ctx, this.getHibernationConfig())

    // Initialize RPC registry with default methods
    this.rpcRegistry = new MethodRegistry()
    registerSystemMethods(this.rpcRegistry)
    registerIdentityMethods(this.rpcRegistry)

    // Register state methods with access to this.state
    this.registerStateMethods()

    // Allow subclasses to register additional methods
    this.registerRPCMethods()
  }

  /**
   * Initialize the Digital Object
   *
   * Called automatically on first request. Loads identity from storage
   * or creates it if this is a new DO.
   *
   * @internal
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return

    // Load or create identity (use raw storage, not state wrapper)
    const identity = await this.ctx.storage.get<DigitalObjectIdentity>('$identity')

    if (identity) {
      this.$id = identity.$id
      this.$type = identity.$type
      this.$context = identity.$context
      this.$version = identity.$version
    } else {
      // New DO - set defaults
      this.$id = await this.resolveId()
      this.$type = this.getDefaultType()
      this.$version = 1

      // Persist identity directly to storage (bypass state wrapper for system keys)
      await this.ctx.storage.put('$identity', this.getIdentity())
    }

    // Call subclass initialization hook
    await this.onInitialize()

    this.initialized = true
  }

  /**
   * Get the DO's identity object
   *
   * @returns The complete identity with $id, $type, $context, $version
   *
   * @example
   * ```typescript
   * const identity = this.getIdentity()
   * console.log(identity.$id) // 'https://headless.ly'
   * ```
   */
  public getIdentity(): DigitalObjectIdentity {
    return {
      $id: this.$id,
      $type: this.$type,
      $context: this.$context,
      $version: this.$version,
      $createdAt: Date.now(), // TODO: Store actual creation time
      $updatedAt: Date.now(),
    }
  }

  /**
   * Set the parent context for CDC streaming
   *
   * @param context - Parent DO URL or undefined to clear
   *
   * @example
   * ```typescript
   * // Set parent context
   * await this.setContext('https://startups.studio')
   *
   * // Clear parent context
   * await this.setContext(undefined)
   * ```
   */
  public async setContext(context: DigitalObjectRef | undefined): Promise<void> {
    this.$context = context
    await this.ctx.storage.put('$identity', this.getIdentity())
  }

  /**
   * Get the parent context
   *
   * @returns Parent DO URL or undefined if no parent
   */
  public getContext(): DigitalObjectRef | undefined {
    return this.$context
  }

  /**
   * Resolve the $id for this DO
   *
   * Override this method to customize ID resolution.
   * Default implementation uses the DO's name from the runtime.
   *
   * @returns The HTTPS URL identifier for this DO
   *
   * @example
   * ```typescript
   * protected async resolveId(): Promise<string> {
   *   // Custom ID resolution logic
   *   const name = this.ctx.id.name ?? this.ctx.id.toString()
   *   return `https://${name}`
   * }
   * ```
   */
  protected async resolveId(): Promise<string> {
    // Default: use the DO's name or ID as the identifier
    // In production, this would be a proper HTTPS URL
    const id = this.ctx.id
    // DurableObjectId may have a name property if created via idFromName
    const name = (id as DurableObjectId & { name?: string }).name ?? id.toString()
    return `https://${name}`
  }

  /**
   * Get the default type for this DO
   *
   * Override this method to set a custom default type.
   * Default implementation uses the class name.
   *
   * @returns The default DOType for this class
   */
  protected getDefaultType(): DOType {
    return this.constructor.name
  }

  /**
   * Get hibernation configuration
   *
   * Override this method to customize hibernation behavior.
   *
   * @returns Hibernation configuration options
   */
  protected getHibernationConfig(): Partial<HibernationConfig> {
    return {
      idleTimeout: 10_000, // 10 seconds
      maxHibernationDuration: 24 * 60 * 60 * 1000, // 24 hours
      preserveWebSockets: true,
    }
  }

  /**
   * Initialization hook for subclasses
   *
   * Override this method to perform custom initialization.
   * Called once when the DO is first accessed.
   *
   * @example
   * ```typescript
   * async onInitialize(): Promise<void> {
   *   // Set up default state
   *   const existing = await this.state.get('config')
   *   if (!existing) {
   *     await this.state.set('config', { initialized: true })
   *   }
   * }
   * ```
   */
  protected async onInitialize(): Promise<void> {
    // Override in subclasses
  }

  /**
   * Register state RPC methods (do.state.get, do.state.set, do.state.delete)
   *
   * These methods provide RPC access to the DO's state storage.
   *
   * @internal
   */
  private registerStateMethods(): void {
    this.rpcRegistry.register(
      'do.state.get',
      async (params) => {
        const { key } = params as { key: string }
        return this.state.get(key)
      },
      {
        description: 'Get a value from DO state',
        params: {
          key: { type: 'string', required: true, description: 'The key to retrieve' },
        },
      }
    )

    this.rpcRegistry.register(
      'do.state.set',
      async (params) => {
        const { key, value } = params as { key: string; value: unknown }
        await this.state.set(key, value)
        return { ok: true }
      },
      {
        description: 'Set a value in DO state',
        params: {
          key: { type: 'string', required: true, description: 'The key to set' },
          value: { type: 'object', required: true, description: 'The value to store' },
        },
      }
    )

    this.rpcRegistry.register(
      'do.state.delete',
      async (params) => {
        const { key } = params as { key: string }
        const deleted = await this.state.delete(key)
        return { deleted }
      },
      {
        description: 'Delete a value from DO state',
        params: {
          key: { type: 'string', required: true, description: 'The key to delete' },
        },
      }
    )
  }

  /**
   * Register custom RPC methods
   *
   * Override this method to register additional RPC methods
   * for your Digital Object subclass.
   *
   * @example
   * ```typescript
   * protected registerRPCMethods(): void {
   *   this.rpcRegistry.register('my.custom.method', async (params, ctx) => {
   *     return { result: 'custom method called' }
   *   })
   * }
   * ```
   */
  protected registerRPCMethods(): void {
    // Override in subclasses to register custom methods
  }

  /**
   * Handle incoming HTTP requests
   *
   * This is the main entry point for all HTTP traffic to the DO.
   * It routes requests based on path and method.
   *
   * @param request - The incoming HTTP request
   * @returns HTTP response
   *
   * @example
   * ```typescript
   * // GET https://do.example.com/api/status
   * // Routes to handlePath with path = '/api/status'
   * ```
   */
  async fetch(request: Request): Promise<Response> {
    // Ensure initialization
    await this.initialize()

    // Reset hibernation timer on activity
    this.hibernation.touch()

    const url = new URL(request.url)
    const path = url.pathname

    try {
      // Built-in routes
      switch (path) {
        case '/':
          return this.handleRoot(request)

        case '/rpc':
          return this.handleRPC(request)

        case '/ws':
          return this.handleWebSocket(request)

        case '/cdc':
          return this.handleCDC(request)

        case '/$identity':
          return Response.json(this.getIdentity())

        default:
          // Delegate to subclass
          return await this.handlePath(request, path)
      }
    } catch (error) {
      return this.handleError(error)
    }
  }

  /**
   * Handle requests to the root path (/)
   *
   * Default implementation returns DO identity.
   * Override to customize.
   *
   * @param request - The incoming request
   * @returns HTTP response with DO identity
   */
  protected async handleRoot(request: Request): Promise<Response> {
    return Response.json({
      ...this.getIdentity(),
      status: 'active',
      timestamp: Date.now(),
    })
  }

  /**
   * Handle JSON-RPC requests to /rpc
   *
   * Supports the DORPCMethods interface defined in types/rpc.ts
   *
   * @param request - The incoming RPC request
   * @returns RPC response
   */
  protected async handleRPC(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const rpcRequest: RPCRequest = await request.json()
    const response = await this.processRPC(rpcRequest)

    return Response.json(response)
  }

  /**
   * Process a single RPC request
   *
   * Dispatches the request to the appropriate handler in the RPC registry.
   *
   * @param request - The RPC request object
   * @returns RPC response object
   */
  protected async processRPC(request: RPCRequest): Promise<RPCResponse> {
    // Build method context with DO-specific properties
    const methodContext: DOMethodContext = {
      state: this.ctx,
      env: this.env,
      meta: request.meta,
      getIdentity: () => this.getIdentity(),
      setContext: (context) => this.setContext(context),
      getContext: () => this.getContext(),
      listChildren: (type) => this.listChildren(type),
    }

    // Dispatch to the registry
    return dispatch(this.rpcRegistry, request, methodContext)
  }

  /**
   * Handle WebSocket upgrade requests to /ws
   *
   * Supports hibernatable WebSockets for RPC streaming.
   *
   * @param request - The incoming WebSocket upgrade request
   * @returns WebSocket response
   */
  protected async handleWebSocket(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade')

    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }

    // Use hibernation manager to handle WebSocket
    return this.hibernation.acceptWebSocket(request)
  }

  /**
   * Handle CDC stream requests to /cdc
   *
   * Supports both WebSocket and SSE (Server-Sent Events) streaming.
   * CDC events are emitted for all state mutations and propagated up the $context chain.
   *
   * Query parameters:
   * - collections: comma-separated list of collections to subscribe to
   * - operations: comma-separated list of operations (INSERT, UPDATE, DELETE)
   * - fromSequence: starting sequence number for replay
   * - fromTimestamp: starting timestamp for replay
   * - includeDocuments: whether to include full before/after documents (default: true)
   *
   * @param request - The incoming request
   * @returns Streaming response with CDC events (WebSocket 101 or SSE stream)
   *
   * @example WebSocket subscription
   * ```typescript
   * const ws = new WebSocket('wss://my.do/cdc?collections=users,orders')
   * ws.onmessage = (event) => {
   *   const cdcEvent = JSON.parse(event.data)
   *   console.log(`${cdcEvent.operation} on ${cdcEvent.collection}`)
   * }
   * ```
   *
   * @example SSE subscription
   * ```typescript
   * const eventSource = new EventSource('https://my.do/cdc?operations=INSERT,UPDATE')
   * eventSource.onmessage = (event) => {
   *   const cdcEvent = JSON.parse(event.data)
   *   console.log(`${cdcEvent.operation} on ${cdcEvent.collection}`)
   * }
   * ```
   */
  protected async handleCDC(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const upgradeHeader = request.headers.get('Upgrade')

    // Parse CDC options from query parameters
    const options = this.parseCDCOptions(url.searchParams)

    // WebSocket upgrade for real-time streaming
    if (upgradeHeader === 'websocket') {
      return this.handleCDCWebSocket(request, options)
    }

    // SSE streaming for HTTP clients
    return this.handleCDCSSE(request, options)
  }

  /**
   * Parse CDC options from URL search parameters
   *
   * @param params - URL search parameters
   * @returns Parsed CDC options
   * @internal
   */
  private parseCDCOptions(params: URLSearchParams): CDCOptions {
    const options: CDCOptions = {}

    // Parse collections filter
    const collections = params.get('collections')
    if (collections) {
      options.collections = collections.split(',').map((c) => c.trim())
    }

    // Parse operations filter
    const operations = params.get('operations')
    if (operations) {
      options.operations = operations.split(',').map((o) => o.trim().toUpperCase()) as CDCOperation[]
    }

    // Parse cursor for replay
    const fromSequence = params.get('fromSequence')
    const fromTimestamp = params.get('fromTimestamp')
    if (fromSequence || fromTimestamp) {
      options.fromCursor = {
        sequence: fromSequence ? parseInt(fromSequence, 10) : 0,
        timestamp: fromTimestamp ? parseInt(fromTimestamp, 10) : 0,
      }
    }

    // Parse document inclusion preference
    const includeDocuments = params.get('includeDocuments')
    if (includeDocuments !== null) {
      options.includeDocuments = includeDocuments !== 'false'
    }

    // Parse batch settings
    const batchSize = params.get('batchSize')
    if (batchSize) {
      options.batchSize = parseInt(batchSize, 10)
    }

    const batchTimeout = params.get('batchTimeout')
    if (batchTimeout) {
      options.batchTimeout = parseInt(batchTimeout, 10)
    }

    return options
  }

  /**
   * Handle WebSocket CDC streaming
   *
   * @param request - The WebSocket upgrade request
   * @param options - CDC subscription options
   * @returns WebSocket response
   * @internal
   */
  private async handleCDCWebSocket(request: Request, options: CDCOptions): Promise<Response> {
    // Create WebSocket pair
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]

    // Accept the WebSocket with CDC tag for hibernation
    this.ctx.acceptWebSocket(server, ['cdc'])

    // Store subscription options on the WebSocket for later use
    ;(server as WebSocket & { cdcOptions?: CDCOptions }).cdcOptions = options

    // Set up mutation handler to forward events to this WebSocket
    const unsubscribe = this.state.onMutation(async (event) => {
      // Apply filters
      if (!this.shouldSendCDCEvent(event, options)) {
        return
      }

      // Optionally strip document content
      const eventToSend = options.includeDocuments === false ? this.stripDocuments(event) : event

      try {
        server.send(JSON.stringify(eventToSend))
      } catch {
        // WebSocket closed, ignore
      }
    })

    // Store unsubscribe function for cleanup
    ;(server as WebSocket & { cdcUnsubscribe?: () => void }).cdcUnsubscribe = unsubscribe

    // Send initial replay if cursor provided
    if (options.fromCursor) {
      const events = await this.state.getChangesSince(options.fromCursor, options.batchSize ?? 100)
      for (const event of events) {
        if (this.shouldSendCDCEvent(event, options)) {
          const eventToSend = options.includeDocuments === false ? this.stripDocuments(event) : event
          try {
            server.send(JSON.stringify(eventToSend))
          } catch {
            // WebSocket closed during replay
            break
          }
        }
      }
    }

    // Propagate events to parent context
    this.setupContextPropagation()

    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }

  /**
   * Handle SSE (Server-Sent Events) CDC streaming
   *
   * @param request - The HTTP request
   * @param options - CDC subscription options
   * @returns SSE streaming response
   * @internal
   */
  private async handleCDCSSE(request: Request, options: CDCOptions): Promise<Response> {
    // Create a TransformStream for SSE
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    const encoder = new TextEncoder()

    // Track if the stream is still open
    let isOpen = true

    // Send SSE event helper
    const sendSSE = async (event: CDCEvent) => {
      if (!isOpen) return

      try {
        const data = JSON.stringify(event)
        await writer.write(encoder.encode(`data: ${data}\n\n`))
      } catch {
        isOpen = false
      }
    }

    // Set up mutation handler
    const unsubscribe = this.state.onMutation(async (event) => {
      if (!this.shouldSendCDCEvent(event, options)) {
        return
      }

      const eventToSend = options.includeDocuments === false ? this.stripDocuments(event) : event
      await sendSSE(eventToSend)
    })

    // Handle client disconnect
    request.signal?.addEventListener('abort', () => {
      isOpen = false
      unsubscribe()
      writer.close().catch(() => {
        // Ignore close errors
      })
    })

    // Send initial replay if cursor provided
    if (options.fromCursor) {
      const events = await this.state.getChangesSince(options.fromCursor, options.batchSize ?? 100)
      for (const event of events) {
        if (this.shouldSendCDCEvent(event, options)) {
          const eventToSend = options.includeDocuments === false ? this.stripDocuments(event) : event
          await sendSSE(eventToSend)
        }
      }
    }

    // Propagate events to parent context
    this.setupContextPropagation()

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  }

  /**
   * Check if a CDC event matches the subscription filters
   *
   * @param event - The CDC event to check
   * @param options - Subscription options with filters
   * @returns True if the event should be sent
   * @internal
   */
  private shouldSendCDCEvent(event: CDCEvent, options: CDCOptions): boolean {
    // Filter by collections
    if (options.collections && options.collections.length > 0) {
      if (!options.collections.includes(event.collection)) {
        return false
      }
    }

    // Filter by operations
    if (options.operations && options.operations.length > 0) {
      if (!options.operations.includes(event.operation)) {
        return false
      }
    }

    return true
  }

  /**
   * Strip document content from CDC event
   *
   * @param event - The CDC event
   * @returns Event without before/after documents
   * @internal
   */
  private stripDocuments(event: CDCEvent): CDCEvent {
    const { before, after, ...rest } = event
    return rest as CDCEvent
  }

  /**
   * Set up CDC event propagation to parent context
   *
   * Events bubble up through the $context chain, enabling
   * parent DOs to observe changes in all descendants.
   *
   * @internal
   */
  private setupContextPropagation(): void {
    if (!this.$context || this.contextStreamerSetup) {
      return
    }

    // Create context streamer for parent propagation
    const streamer = new ContextStreamer(this.$context, {
      batchSize: 100,
      batchTimeout: 1000,
    })

    // Register mutation handler to propagate events
    this.state.onMutation(async (event) => {
      // Enrich event with source information
      const enrichedEvent: CDCEvent = {
        ...event,
        source: this.$id,
      }

      // Propagate to parent context
      await streamer.propagate(enrichedEvent)
    })

    this.contextStreamerSetup = true
  }

  /**
   * Whether context streamer has been set up
   * @internal
   */
  private contextStreamerSetup = false

  /**
   * Handle custom paths not covered by built-in routes
   *
   * Override this method to implement custom path handling.
   *
   * @param request - The incoming request
   * @param path - The URL path
   * @returns HTTP response
   *
   * @example
   * ```typescript
   * async handlePath(request: Request, path: string): Promise<Response> {
   *   if (path.startsWith('/api/')) {
   *     return this.handleApi(request, path.slice(5))
   *   }
   *   return new Response('Not Found', { status: 404 })
   * }
   * ```
   */
  protected async handlePath(request: Request, path: string): Promise<Response> {
    return new Response('Not Found', { status: 404 })
  }

  /**
   * Handle errors during request processing
   *
   * @param error - The error that occurred
   * @returns Error response
   */
  protected handleError(error: unknown): Response {
    console.error('DigitalObject error:', error)

    const message = error instanceof Error ? error.message : 'Internal Server Error'
    const status = error instanceof DOError ? error.status : 500

    return Response.json(
      {
        error: {
          message,
          code: error instanceof DOError ? error.code : 'INTERNAL_ERROR',
        },
      },
      { status }
    )
  }

  /**
   * Create a child DO with this DO as the parent context
   *
   * The child DO will have its $context set to this DO's $id,
   * enabling CDC event streaming up the hierarchy.
   *
   * @param type - The type of child DO to create
   * @param name - The name/identifier for the child
   * @returns Reference (URL) to the created child DO
   *
   * @example
   * ```typescript
   * // Create a tenant under this SaaS DO
   * const tenantRef = await this.createChild('Tenant', 'acme')
   * // tenantRef = 'https://crm.headless.ly/acme'
   * ```
   */
  async createChild(type: DOType, name: string): Promise<DigitalObjectRef> {
    // Construct child ID based on this DO's ID
    const childId = `${this.$id}/${name}`

    // Get a stub to the child DO
    const childStub = this.env.DO.get(this.env.DO.idFromName(childId))

    // Initialize the child with context pointing to this DO
    await childStub.fetch(
      new Request(`https://${childId}/$init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          $type: type,
          $context: this.$id,
        }),
      })
    )

    return childId
  }

  /**
   * Get a stub to a child DO
   *
   * @param name - The name/identifier of the child
   * @returns Durable Object stub for the child
   *
   * @example
   * ```typescript
   * const tenantStub = this.getChild('acme')
   * const response = await tenantStub.fetch(new Request('https://crm.headless.ly/acme/api'))
   * ```
   */
  getChild(name: string): DurableObjectStub {
    const childId = `${this.$id}/${name}`
    return this.env.DO.get(this.env.DO.idFromName(childId))
  }

  /**
   * List all child DOs of a specific type
   *
   * @param type - Optional type filter
   * @returns Array of child DO references
   */
  async listChildren(type?: DOType): Promise<DigitalObjectRef[]> {
    // TODO: Implement child listing via state storage
    return []
  }

  /**
   * Handle alarm for hibernation wake-up
   *
   * Called by Cloudflare Workers runtime when an alarm fires.
   *
   * @internal
   */
  async alarm(): Promise<void> {
    await this.initialize()
    await this.hibernation.handleAlarm()
    await this.onAlarm()
  }

  /**
   * Alarm hook for subclasses
   *
   * Override this method to handle scheduled tasks.
   *
   * @example
   * ```typescript
   * async onAlarm(): Promise<void> {
   *   // Perform scheduled cleanup
   *   await this.cleanupExpiredSessions()
   * }
   * ```
   */
  protected async onAlarm(): Promise<void> {
    // Override in subclasses
  }

  /**
   * Handle WebSocket message
   *
   * Called when a message is received on a hibernatable WebSocket.
   *
   * @param ws - The WebSocket that received the message
   * @param message - The message data
   *
   * @internal
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.initialize()
    this.hibernation.touch()

    // Parse and handle as RPC if it's a string
    if (typeof message === 'string') {
      try {
        const rpcRequest: RPCRequest = JSON.parse(message)
        const response = await this.processRPC(rpcRequest)
        ws.send(JSON.stringify(response))
      } catch (error) {
        ws.send(
          JSON.stringify({
            error: { code: -32700, message: 'Parse error' },
          })
        )
      }
    }
  }

  /**
   * Handle WebSocket close
   *
   * Called when a hibernatable WebSocket is closed.
   * Cleans up CDC subscriptions if this was a CDC WebSocket.
   *
   * @param ws - The WebSocket that was closed
   * @param code - Close code
   * @param reason - Close reason
   * @param wasClean - Whether the close was clean
   *
   * @internal
   */
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    // Clean up CDC subscription if this was a CDC WebSocket
    const cdcWs = ws as WebSocket & { cdcUnsubscribe?: () => void }
    if (cdcWs.cdcUnsubscribe) {
      cdcWs.cdcUnsubscribe()
    }

    this.hibernation.handleWebSocketClose(ws)
  }

  /**
   * Handle WebSocket error
   *
   * Called when an error occurs on a hibernatable WebSocket.
   *
   * @param ws - The WebSocket that errored
   * @param error - The error
   *
   * @internal
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket error:', error)
    this.hibernation.handleWebSocketClose(ws)
  }
}

/**
 * Custom error class for Digital Object errors
 *
 * @example
 * ```typescript
 * throw new DOError('NOT_FOUND', 'Resource not found', 404)
 * ```
 */
export class DOError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 500,
    public details?: unknown
  ) {
    super(message)
    this.name = 'DOError'
  }
}

/**
 * Export the DigitalObject class as default
 */
export default DigitalObject
