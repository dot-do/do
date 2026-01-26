/**
 * objects.do GenericDO - Universal DO Runtime
 *
 * The GenericDO class is a universal Durable Object runtime that interprets
 * DO definitions as data. It loads definitions from the registry and executes
 * them without any deployment.
 *
 * Every DO is data - API methods, events, schedules, site/app content.
 */

import type { DODefinition, DOContext, Env, RPCRequest, RPCResponse, APIMethodDefinition } from './types'
import { createContext, resolveMethodCode, flattenAPIMethods } from './context'
import { executeFunction, validateFunctionCode } from './executor'
import { safeParseDODefinition, RPC_ERROR_CODES, createRPCError, createRPCSuccess } from './schema'

// =============================================================================
// GenericDO Class
// =============================================================================

/**
 * GenericDO - Universal DO Runtime
 *
 * Loads and executes DO definitions from the registry. Handles:
 * - RPC requests (JSON-RPC and REST-style)
 * - Site/App content serving
 * - Event handling
 * - Schema generation
 * - MCP (Model Context Protocol) for AI agents
 */
export class GenericDO {
  private state: DurableObjectState
  private env: Env
  private definition: DODefinition | null = null
  private $: DOContext | null = null

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
  }

  /**
   * Main request handler
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

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
    if (path === '/rpc' || path.startsWith('/api/')) {
      return this.handleRPC(request, path)
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
    const id = this.state.id.name || this.state.id.toString()

    try {
      const obj = await this.env.REGISTRY.get(id)
      if (!obj) {
        return {
          success: false,
          response: Response.json({ error: 'Definition not found' }, { status: 404 }),
        }
      }

      const data = await obj.json()
      const parseResult = safeParseDODefinition(data)

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
  // RPC Handling
  // ===========================================================================

  /**
   * Handle RPC requests (JSON-RPC and REST-style)
   */
  private async handleRPC(request: Request, path: string): Promise<Response> {
    const { definition, $ } = this.ensureLoaded()

    // Handle REST-style API routes
    if (path.startsWith('/api/')) {
      return this.handleRESTRoute(request, path, definition, $)
    }

    // Handle JSON-RPC
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json(createRPCError(RPC_ERROR_CODES.PARSE_ERROR, 'Invalid JSON'), { status: 400 })
    }

    // Handle batch requests
    if (Array.isArray(body)) {
      const results = await Promise.all(body.map((req) => this.executeRPCRequest(req, definition, $)))
      return Response.json(results)
    }

    // Handle single request
    const result = await this.executeRPCRequest(body as RPCRequest, definition, $)

    // Return 404 for method not found
    if (result.error?.code === RPC_ERROR_CODES.METHOD_NOT_FOUND) {
      return Response.json(result, { status: 404 })
    }

    return Response.json(result)
  }

  /**
   * Execute a single RPC request
   */
  private async executeRPCRequest(
    request: RPCRequest,
    definition: DODefinition,
    $: DOContext
  ): Promise<RPCResponse> {
    const { method, params = [], id } = request
    const isJsonRpc = 'jsonrpc' in request

    // Find method code
    const code = resolveMethodCode(definition.api, method)
    if (!code) {
      const error = createRPCError(RPC_ERROR_CODES.METHOD_NOT_FOUND, `Method not found: ${method}`, undefined, id)
      if (isJsonRpc) {
        return { jsonrpc: '2.0', ...error } as RPCResponse
      }
      return error
    }

    // Validate code for security
    const validation = validateFunctionCode(code)
    if (!validation.valid) {
      const error = createRPCError(RPC_ERROR_CODES.EXECUTION_ERROR, validation.reason || 'Security error', undefined, id)
      if (isJsonRpc) {
        return { jsonrpc: '2.0', ...error } as RPCResponse
      }
      return error
    }

    // Execute function
    const result = await executeFunction(code, $, params)

    if (!result.success) {
      // Use -32000 (generic server error) for execution failures per JSON-RPC convention
      const error = createRPCError(
        -32000 as typeof RPC_ERROR_CODES[keyof typeof RPC_ERROR_CODES],
        result.error?.message || 'Execution failed',
        result.error,
        id
      )
      if (isJsonRpc) {
        return { jsonrpc: '2.0', ...error } as RPCResponse
      }
      return error
    }

    const response = createRPCSuccess(result.result, id)
    if (isJsonRpc) {
      return { jsonrpc: '2.0', ...response } as RPCResponse
    }
    return response
  }

  /**
   * Handle REST-style API routes
   */
  private async handleRESTRoute(
    request: Request,
    path: string,
    definition: DODefinition,
    $: DOContext
  ): Promise<Response> {
    // Parse path: /api/users/123 -> namespace=users, id=123
    const apiPath = path.replace(/^\/api\//, '')
    const parts = apiPath.split('/').filter(Boolean)

    if (parts.length === 0) {
      return Response.json({ error: 'Invalid API path' }, { status: 400 })
    }

    const method = request.method.toUpperCase()
    let methodName: string
    let params: unknown[] = []

    if (parts.length === 1) {
      // /api/users -> users.list (GET) or users.create (POST)
      const namespace = parts[0]
      methodName = method === 'POST' ? `${namespace}.create` : `${namespace}.list`
    } else {
      // /api/users/123 -> users.get (GET) or users.update (PUT) or users.delete (DELETE)
      const namespace = parts[0]
      const id = parts[1]

      switch (method) {
        case 'GET':
          methodName = `${namespace}.get`
          params = [id]
          break
        case 'PUT':
        case 'PATCH':
          methodName = `${namespace}.update`
          params = [id, await request.json().catch(() => ({}))]
          break
        case 'DELETE':
          methodName = `${namespace}.delete`
          params = [id]
          break
        default:
          methodName = `${namespace}.${parts.slice(1).join('.')}`
      }
    }

    // If POST/PUT/PATCH with body, add body to params
    if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && parts.length === 1) {
      try {
        const body = await request.json()
        params.push(body)
      } catch {
        // No body
      }
    }

    // Find and execute method
    const code = resolveMethodCode(definition.api, methodName)
    if (!code) {
      return Response.json({ error: `Method not found: ${methodName}` }, { status: 404 })
    }

    const result = await executeFunction(code, $, params)
    if (!result.success) {
      return Response.json({ error: result.error?.message }, { status: 500 })
    }

    return Response.json(result.result)
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
    const result = await executeFunction(handler, $, [data])
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

    // Find method code
    const code = resolveMethodCode(definition.api, name)
    if (!code) {
      return Response.json(
        {
          content: [{ type: 'text', text: `Method not found: ${name}` }],
          isError: true,
        },
        { status: 404 }
      )
    }

    // Convert arguments object to array
    const paramMatch = code.match(/^\s*(?:async\s+)?\(?\s*([^)=]*?)\s*\)?\s*=>/)
    const paramNames = paramMatch
      ? paramMatch[1]
          .split(',')
          .map((p) => p.trim().split('=')[0].trim())
          .filter(Boolean)
      : []

    const paramValues = paramNames.map((name) => args[name])

    // Execute function
    const result = await executeFunction(code, $, paramValues)
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
