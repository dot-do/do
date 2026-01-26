/**
 * objects.do DO - Universal DO Runtime
 *
 * The DO class is a universal Durable Object runtime that interprets
 * DO definitions as data. It loads definitions from the registry and executes
 * them without any deployment.
 *
 * Every DO is data - API methods, events, schedules, site/app content.
 *
 * RPC Transport (CapnWeb only - no JSON-RPC):
 * - Root path `/` serves CapnWeb protocol exclusively
 * - HTTP POST to `/` → capnweb HTTP batch
 * - WebSocket upgrade to `/` → capnweb WebSocket
 * - GET to `/` → site content
 */

import type { DODefinition, DOContext, Env, APIMethodDefinition } from './types'
import { createContext, resolveMethod, flattenAPIMethods } from './context'
import { executeFunction, validateFunctionCode } from './executor'
import { safeParseDODefinition } from './schema'

// CapnWeb server-side types and lazy loading
interface CapnWebModule {
  newHttpBatchRpcResponse?: (request: Request, localMain: unknown) => Promise<Response>
  newWorkersWebSocketRpcResponse?: (request: Request, localMain: unknown) => Response
}

let capnwebModule: CapnWebModule | null = null

async function getCapnwebModule(): Promise<CapnWebModule> {
  if (!capnwebModule) {
    try {
      // Dynamic import - uses @dotdo/capnweb fork with additional capabilities
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capnwebModule = (await import('@dotdo/capnweb' as any)) as CapnWebModule
    } catch {
      capnwebModule = {}
    }
  }
  return capnwebModule
}

// =============================================================================
// DO Class
// =============================================================================

/**
 * DO - Universal DO Runtime
 *
 * Loads and executes DO definitions from the registry. Handles:
 * - RPC requests (JSON-RPC and REST-style)
 * - Site/App content serving
 * - Event handling
 * - Schema generation
 * - MCP (Model Context Protocol) for AI agents
 */
export class DO {
  private ctx: DurableObjectState
  private state: DurableObjectState
  private env: Env
  private definition: DODefinition | null = null
  private $: DOContext | null = null
  private doName: string | null = null

  constructor(state: DurableObjectState, env: Env) {
    this.ctx = state
    this.state = state
    this.env = env
    // Note: doName is set from X-DO-Name header on each request
    // We don't use blockConcurrencyWhile for initialization because
    // the header-based approach is more reliable and avoids race conditions
  }

  /**
   * Main request handler
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // Store the DO name from header (passed by worker) if not already stored
    const headerName = request.headers.get('X-DO-Name')
    if (headerName && !this.doName) {
      this.doName = headerName
      // Persist to storage for future requests
      await this.ctx.storage.put('__do_name', headerName)
    }

    // Handle PUT for definition update (before loading definition)
    if (request.method === 'PUT' && (path === '/' || path === '')) {
      return this.handleDefinitionUpdate(request)
    }

    // Load definition if not cached
    if (!this.definition) {
      const loadResult = await this.loadDefinition()
      if (!loadResult.success) {
        return loadResult.response
      }
    }

    // Route request based on path

    // Root path `/` - CapnWeb protocol (ONLY RPC transport)
    // POST → capnweb HTTP batch, WebSocket upgrade → capnweb WS, GET → site
    if (path === '/' || path === '') {
      const method = request.method.toUpperCase()
      const isWebSocketUpgrade = request.headers.get('Upgrade')?.toLowerCase() === 'websocket'

      if (method === 'POST' || isWebSocketUpgrade) {
        return this.handleCapnWeb(request)
      }
      // GET falls through to handleSite
    }

    if (path === '/__schema') {
      return this.handleSchema()
    }

    if (path === '/__event') {
      return this.handleEvent(request)
    }

    if (path === '/mcp') {
      return this.handleMCP(request)
    }

    if (path.startsWith('/app/') || path === '/app') {
      return this.handleApp(request, path)
    }

    // Default: site
    return this.handleSite(request, path)
  }

  // ===========================================================================
  // Definition Loading
  // ===========================================================================

  /**
   * Load DO definition from registry
   */
  private async loadDefinition(): Promise<{ success: true } | { success: false; response: Response }> {
    // Use the stored DO name (passed via X-DO-Name header and persisted to storage)
    const id = this.doName

    if (!id) {
      return {
        success: false,
        response: Response.json({ error: 'DO name not set - request must include X-DO-Name header' }, { status: 400 }),
      }
    }

    try {
      const obj = await this.env.REGISTRY.get(id)
      if (!obj) {
        return {
          success: false,
          response: Response.json({ error: 'Definition not found', id }, { status: 404 }),
        }
      }

      const entry = await obj.json<{ definition: unknown }>()
      const parseResult = safeParseDODefinition(entry.definition)

      if (!parseResult.success) {
        return {
          success: false,
          response: Response.json(
            { error: 'Invalid definition', details: parseResult.error.errors },
            { status: 400 }
          ),
        }
      }

      this.definition = parseResult.data as unknown as DODefinition
      this.$ = createContext(this.state as unknown as Parameters<typeof createContext>[0], this.env, this.definition)
      return { success: true }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      return {
        success: false,
        response: Response.json({ error: `Failed to load definition: ${err.message}` }, { status: 500 }),
      }
    }
  }

  /**
   * Ensure definition and context are loaded
   */
  private ensureLoaded(): { definition: DODefinition; $: DOContext } {
    if (!this.definition || !this.$) {
      throw new Error('Definition not loaded')
    }
    return { definition: this.definition, $: this.$ }
  }

  // ===========================================================================
  // CapnWeb Protocol Handling (Primary RPC Transport)
  // ===========================================================================

  /**
   * Handle CapnWeb RPC requests on root `/` path
   *
   * CapnWeb is the primary RPC transport for rpc.do clients. It provides:
   * - Promise pipelining for batched operations
   * - Capability-based security via RpcTarget pattern
   * - 95% cost savings via WebSocket hibernation
   *
   * The localMain object wraps all DO API methods and is navigable by clients.
   */
  private async handleCapnWeb(request: Request): Promise<Response> {
    const { definition, $ } = this.ensureLoaded()

    // Create localMain object that exposes all API methods
    const localMain = this.createCapnWebTarget(definition, $)

    // Import capnweb module (lazy loaded)
    const capnweb = await getCapnwebModule()

    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      if (capnweb.newWorkersWebSocketRpcResponse) {
        return capnweb.newWorkersWebSocketRpcResponse(request, localMain)
      }
      return new Response('WebSocket RPC not available', { status: 501 })
    }

    // Handle HTTP batch
    if (capnweb.newHttpBatchRpcResponse) {
      return capnweb.newHttpBatchRpcResponse(request, localMain)
    }

    // Fallback to JSON error if capnweb not available
    return Response.json({ error: 'CapnWeb protocol not available' }, { status: 501 })
  }

  /**
   * Create a CapnWeb-compatible target object that wraps the DO's API
   *
   * This object is passed as `localMain` to capnweb server functions.
   * The client navigates this object tree via the capnweb proxy.
   *
   * @example Client usage:
   * const $ = RPC('https://objects.do/my.do')
   * await $.ping() // calls definition.api.ping
   * await $.users.list() // calls definition.api.users.list
   */
  private createCapnWebTarget(definition: DODefinition, $: DOContext): Record<string, unknown> {
    const self = this

    // Build target object from API definition
    const buildTarget = (api: Record<string, unknown> | undefined, prefix = ''): Record<string, unknown> => {
      if (!api) return {}

      const target: Record<string, unknown> = {}

      for (const [key, value] of Object.entries(api)) {
        const path = prefix ? `${prefix}.${key}` : key

        if (typeof value === 'string') {
          // Direct code string - wrap as callable
          target[key] = createCallable(value, path)
        } else if (typeof value === 'object' && value !== null) {
          if ('code' in value && typeof (value as { code: unknown }).code === 'string') {
            // APIMethodDefinition with code and params
            const def = value as { code: string; params?: string[] }
            target[key] = createCallable(def.code, path, def.params)
          } else {
            // Nested namespace - recurse
            target[key] = buildTarget(value as Record<string, unknown>, path)
          }
        }
      }

      return target
    }

    // Create a callable function that executes method code
    const createCallable = (code: string, path: string, methodParams?: string[]) => {
      return async (...args: unknown[]): Promise<unknown> => {
        // Validate code for security
        const validation = validateFunctionCode(code)
        if (!validation.valid) {
          throw new Error(validation.reason || 'Security error')
        }

        // Execute function
        const result = await executeFunction(code, $, args, { methodParams }, { LOADER: self.env.LOADER })
        if (!result.success) {
          throw new Error(result.error?.message || 'Execution failed')
        }

        return result.result
      }
    }

    return buildTarget(definition.api)
  }

  // ===========================================================================
  // Site/App Handling
  // ===========================================================================

  /**
   * Handle site (public pages) requests
   */
  private async handleSite(request: Request, path: string): Promise<Response> {
    const { definition } = this.ensureLoaded()

    // Normalize path
    const normalizedPath = path === '' ? '/' : path

    if (!definition.site) {
      return Response.json({ error: 'Page not found' }, { status: 404 })
    }

    // Handle site as string (root content only)
    if (typeof definition.site === 'string') {
      if (normalizedPath === '/') {
        return new Response(definition.site, {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      }
      return Response.json({ error: 'Page not found' }, { status: 404 })
    }

    // Handle site as record
    const content = definition.site[normalizedPath]
    if (!content) {
      return Response.json({ error: 'Page not found' }, { status: 404 })
    }

    return new Response(content, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  /**
   * Handle app (authenticated pages) requests
   */
  private async handleApp(request: Request, path: string): Promise<Response> {
    const { definition } = this.ensureLoaded()

    if (!definition.app) {
      return Response.json({ error: 'App page not found' }, { status: 404 })
    }

    // Remove /app prefix to get the app path
    const appPath = path.replace(/^\/app/, '') || '/'

    const content = definition.app[appPath]
    if (!content) {
      return Response.json({ error: 'App page not found' }, { status: 404 })
    }

    return new Response(content, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  // ===========================================================================
  // Schema Generation
  // ===========================================================================

  /**
   * Handle __schema requests - generate schema from definition
   */
  private async handleSchema(): Promise<Response> {
    const { definition } = this.ensureLoaded()

    // Flatten all API methods
    const methods = flattenAPIMethods(definition.api)
    const methodNames = methods.map((m) => m.path)

    // Build method details (for methods with metadata)
    const methodDetails: Record<string, { params?: string[]; returns?: string; description?: string }> = {}

    const collectMethodDetails = (
      api: Record<string, unknown> | undefined,
      prefix = ''
    ) => {
      if (!api) return

      for (const [key, value] of Object.entries(api)) {
        const path = prefix ? `${prefix}.${key}` : key

        if (typeof value === 'object' && value !== null && 'code' in value) {
          const methodDef = value as APIMethodDefinition
          methodDetails[path] = {
            params: methodDef.params,
            returns: methodDef.returns,
            description: methodDef.description,
          }
        } else if (typeof value === 'object' && value !== null && !('code' in value)) {
          // Nested namespace
          collectMethodDetails(value as Record<string, unknown>, path)
        }
      }
    }

    collectMethodDetails(definition.api)

    // Build schema response
    const schema: Record<string, unknown> = {
      $id: definition.$id,
      $type: definition.$type,
      $version: definition.$version,
      $context: definition.$context,
      methods: methodNames,
    }

    // Only include methodDetails if there are any
    if (Object.keys(methodDetails).length > 0) {
      schema.methodDetails = methodDetails
    }

    // Include site routes
    if (definition.site) {
      if (typeof definition.site === 'string') {
        schema.site = ['/']
      } else {
        schema.site = Object.keys(definition.site)
      }
    }

    // Include app routes
    if (definition.app) {
      schema.app = Object.keys(definition.app)
    }

    // Include events
    if (definition.events) {
      schema.events = Object.keys(definition.events)
    }

    // Include schedules
    if (definition.schedules) {
      schema.schedules = Object.keys(definition.schedules)
    }

    return Response.json(schema, {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  /**
   * Handle incoming events via __event endpoint
   */
  private async handleEvent(request: Request): Promise<Response> {
    const { definition, $ } = this.ensureLoaded()

    let body: { event: string; data: unknown }
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { event, data } = body

    // Check if we have a handler for this event
    const handler = definition.events?.[event]
    if (!handler) {
      return Response.json({ handled: false, message: 'No handler for event' })
    }

    // Execute the event handler
    const result = await executeFunction(handler, $, [data], {}, { LOADER: this.env.LOADER })
    if (!result.success) {
      return Response.json({ handled: true, error: result.error?.message }, { status: 500 })
    }

    return Response.json({ handled: true, result: result.result })
  }

  // ===========================================================================
  // MCP (Model Context Protocol)
  // ===========================================================================

  /**
   * Handle MCP requests for AI agent integration
   */
  private async handleMCP(request: Request): Promise<Response> {
    const { definition, $ } = this.ensureLoaded()

    // Handle GET request - return basic MCP info
    if (request.method === 'GET') {
      return Response.json({
        name: definition.$id,
        version: definition.$version || '1.0.0',
        description: `MCP interface for ${definition.$id}`,
      })
    }

    // Handle POST - MCP protocol requests
    let body: { method: string; params?: Record<string, unknown> }
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { method, params = {} } = body

    switch (method) {
      case 'tools/list':
        return this.handleMCPToolsList(definition)
      case 'tools/call':
        return this.handleMCPToolsCall(params, definition, $)
      default:
        return Response.json({ error: `Unknown MCP method: ${method}` }, { status: 400 })
    }
  }

  /**
   * Handle MCP tools/list - return available tools
   */
  private handleMCPToolsList(definition: DODefinition): Response {
    const methods = flattenAPIMethods(definition.api)

    const tools = methods.map(({ path, code }) => {
      // Extract parameters from function code
      const paramMatch = code.match(/^\s*(?:async\s+)?\(?\s*([^)=]*?)\s*\)?\s*=>/)
      const params = paramMatch
        ? paramMatch[1]
            .split(',')
            .map((p) => p.trim().split('=')[0].trim())
            .filter(Boolean)
        : []

      // Build input schema
      const properties: Record<string, { type: string }> = {}
      for (const param of params) {
        properties[param] = { type: 'string' }
      }

      return {
        name: path,
        description: `Execute ${path}`,
        inputSchema: {
          type: 'object',
          properties,
          required: params,
        },
      }
    })

    return Response.json({ tools })
  }

  /**
   * Handle MCP tools/call - execute a tool
   */
  private async handleMCPToolsCall(
    params: Record<string, unknown>,
    definition: DODefinition,
    $: DOContext
  ): Promise<Response> {
    const { name, arguments: args = {} } = params as { name: string; arguments?: Record<string, unknown> }

    // Find method code and params
    const resolved = resolveMethod(definition.api, name)
    if (!resolved) {
      return Response.json(
        {
          content: [{ type: 'text', text: `Method not found: ${name}` }],
          isError: true,
        },
        { status: 404 }
      )
    }

    const { code, params: methodParams } = resolved

    // Convert arguments object to array based on method params
    // If methodParams is defined, use it; otherwise try to extract from code
    let paramNames: string[]
    if (methodParams && methodParams.length > 0) {
      paramNames = methodParams
    } else {
      const paramMatch = code.match(/^\s*(?:async\s+)?\(?\s*([^)=]*?)\s*\)?\s*=>/)
      paramNames = paramMatch
        ? paramMatch[1]
            .split(',')
            .map((p) => p.trim().split('=')[0].trim())
            .filter(Boolean)
        : []
    }

    const paramValues = paramNames.map((pname) => args[pname])

    // Execute function
    const result = await executeFunction(code, $, paramValues, { methodParams }, { LOADER: this.env.LOADER })
    if (!result.success) {
      return Response.json({
        content: [{ type: 'text', text: result.error?.message || 'Execution failed' }],
        isError: true,
      })
    }

    return Response.json({
      content: [{ type: 'text', text: typeof result.result === 'string' ? result.result : JSON.stringify(result.result) }],
    })
  }

  // ===========================================================================
  // Definition Update
  // ===========================================================================

  /**
   * Handle PUT requests to update definition
   */
  private async handleDefinitionUpdate(request: Request): Promise<Response> {
    // Check for authentication
    const auth = request.headers.get('Authorization')
    if (!auth) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    // Validate definition
    const parseResult = safeParseDODefinition(body)
    if (!parseResult.success) {
      return Response.json(
        { error: 'Invalid definition', details: parseResult.error.errors },
        { status: 400 }
      )
    }

    const id = this.state.id.name || this.state.id.toString()

    // Store in registry
    await this.env.REGISTRY.put(id, JSON.stringify(parseResult.data))

    // Invalidate cache
    this.definition = parseResult.data as unknown as DODefinition
    this.$ = createContext(this.state as unknown as Parameters<typeof createContext>[0], this.env, this.definition)

    return Response.json({ success: true, $id: parseResult.data.$id })
  }
}

// =============================================================================
// Type Declarations for DurableObjectState
// =============================================================================

interface DurableObjectState {
  id: DurableObjectId
  storage: DurableObjectStorage
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>
}

interface DurableObjectId {
  name?: string
  toString(): string
}

interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<boolean>
  list<T = unknown>(options?: { prefix?: string }): Promise<Map<string, T>>
}
