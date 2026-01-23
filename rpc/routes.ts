/**
 * CapnWeb RPC HTTP Route Handlers
 *
 * Handles GET requests to /rpc/* for schema discovery and method documentation.
 * Returns JSON-LD style responses with clickable links for API navigation.
 *
 * @module rpc/routes
 *
 * @example
 * ```typescript
 * import { RPCRouteHandler } from 'do/rpc/routes'
 * import { MethodRegistry } from 'do/rpc/methods'
 *
 * const registry = new MethodRegistry()
 * // Register methods...
 *
 * const handler = new RPCRouteHandler(registry, 'https://my-do.example.com')
 *
 * // Handle GET /rpc
 * const schemaResponse = await handler.handleSchemaRequest()
 *
 * // Handle GET /rpc/do.things.list
 * const methodResponse = await handler.handleMethodRequest('do.things.list')
 * ```
 */

import type { MethodRegistry, RegisteredMethod, MethodOptions } from './methods'

// =============================================================================
// Types
// =============================================================================

/**
 * JSON-LD style link
 */
export interface Link {
  /** Link relation type */
  rel: string
  /** Target URL */
  href: string
  /** HTTP method (if not GET) */
  method?: string
  /** Link title */
  title?: string
}

/**
 * Schema response for GET /rpc
 */
export interface SchemaResponse {
  /** JSON-LD ID */
  $id: string
  /** JSON-LD type */
  $type: 'RPCSchema'
  /** Methods grouped by namespace (legacy) */
  methods?: Record<string, NamespaceInfo>
  /** Namespaces with their methods */
  namespaces: Record<string, NamespaceInfo>
  /** Quick links to common operations */
  links: Link[]
  /** Total number of methods */
  methodCount: number
}

/**
 * Namespace information
 */
export interface NamespaceInfo {
  /** Link to namespace documentation */
  $ref: string
  /** Available methods in this namespace */
  methods: string[]
  /** Description */
  description?: string
}

/**
 * Example request/response for method documentation
 */
export interface MethodExample {
  /** Example request body */
  request: unknown
  /** Example response body */
  response: unknown
}

/**
 * Method documentation response
 */
export interface MethodResponse {
  /** JSON-LD ID */
  $id: string
  /** JSON-LD type */
  $type: 'RPCMethod'
  /** Full method name */
  name: string
  /** Method description */
  description?: string
  /** Parameter documentation */
  params?: Record<string, ParamDoc> | null
  /** Return type */
  returns?: string
  /** Related links */
  links: Link[]
  /** Example request/response */
  example?: MethodExample
}

/**
 * Parameter documentation
 */
export interface ParamDoc {
  /** Parameter type */
  type: string
  /** Whether required */
  required?: boolean
  /** Description */
  description?: string
  /** Default value */
  default?: unknown
}

/**
 * Namespace documentation response
 */
export interface NamespaceResponse {
  /** JSON-LD ID */
  $id: string
  /** JSON-LD type */
  $type: 'RPCNamespace'
  /** Namespace name (full, e.g., 'do.identity') */
  name: string
  /** Namespace short name (e.g., 'identity') */
  namespace: string
  /** Description */
  description?: string
  /** Methods in this namespace */
  methods: MethodSummary[]
  /** Navigation links */
  links: Link[]
}

/**
 * Method summary for namespace listing
 */
export interface MethodSummary {
  /** Method name (action part only) */
  name: string
  /** Full method name */
  fullName: string
  /** Link to method documentation */
  href: string
  /** Description */
  description?: string
}

/**
 * Collections listing response
 */
export interface CollectionsResponse {
  /** JSON-LD ID */
  $id: string
  /** JSON-LD type */
  $type: 'RPCMethod'
  /** Method name */
  name: 'do.collections.list'
  /** Description */
  description: string
  /** Return type */
  returns: 'string[]'
  /** Available collections */
  collections: CollectionInfo[]
}

/**
 * Collection operation links
 */
export interface CollectionLinks {
  /** Link to list method */
  list?: string
  /** Link to get method */
  get?: string
  /** Link to create method */
  create?: string
  /** Link to update method */
  update?: string
  /** Link to delete method */
  delete?: string
}

/**
 * Collection information
 */
export interface CollectionInfo {
  /** Collection name */
  name: string
  /** Link to collection namespace */
  href: string
  /** Available operations */
  operations?: string[]
  /** Links to individual operations */
  links?: CollectionLinks
}

// =============================================================================
// Route Handler Class
// =============================================================================

/**
 * Handler for /rpc/* GET routes
 *
 * Generates JSON-LD style responses with clickable links for navigating
 * the RPC API through a browser.
 *
 * @example
 * ```typescript
 * const handler = new RPCRouteHandler(registry, 'https://my-do.example.com')
 *
 * // In fetch handler:
 * const url = new URL(request.url)
 * if (request.method === 'GET' && url.pathname.startsWith('/rpc')) {
 *   return handler.handleRequest(url.pathname)
 * }
 * ```
 */
export class RPCRouteHandler {
  private registry: MethodRegistry
  private baseUrl: string

  /**
   * Create a new route handler
   *
   * @param registry - Method registry for introspection
   * @param baseUrl - Base URL for generating absolute links
   */
  constructor(registry: MethodRegistry, baseUrl: string) {
    this.registry = registry
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  }

  // ===========================================================================
  // Request Routing
  // ===========================================================================

  /**
   * Handle a GET request to /rpc/*
   *
   * Routes to appropriate handler based on path:
   * - /rpc - Schema overview
   * - /rpc/do.{namespace} - Namespace documentation
   * - /rpc/do.{namespace}.{action} - Method documentation
   * - /rpc/do.collections.list - Collections listing (special case)
   *
   * @param request - HTTP Request object or path string
   * @returns HTTP Response with JSON body
   */
  handleRequest(request: Request | string): Response | Promise<Response> {
    let path: string
    let acceptHeader = ''
    let formatParam = ''
    let method = 'GET'

    if (typeof request === 'string') {
      path = request
    } else {
      const url = new URL(request.url)
      path = decodeURIComponent(url.pathname)
      acceptHeader = request.headers.get('Accept') || ''
      formatParam = url.searchParams.get('format') || ''
      method = request.method
    }

    // Handle OPTIONS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: this.corsHeaders({
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }),
      })
    }

    // Validate path for directory traversal
    if (path.includes('..')) {
      return this.jsonResponse({ error: { code: -32600, message: 'Invalid request path' } }, 400)
    }

    // Extract the method/namespace part after /rpc
    const rpcPrefix = '/rpc'
    let methodPath = ''

    const rpcIndex = path.indexOf(rpcPrefix)
    if (rpcIndex === -1) {
      // Path doesn't contain /rpc at all (e.g. path traversal resolved away)
      return this.jsonResponse({ error: { code: -32600, message: 'Invalid request path' } }, 400)
    }

    methodPath = path.slice(rpcIndex + rpcPrefix.length)
    if (methodPath.startsWith('/')) {
      methodPath = methodPath.slice(1)
    }

    // Handle POST for method invocation
    if (method === 'POST' && methodPath) {
      return this.handlePostInvocation(request as Request, methodPath)
    }

    // Determine response format
    const wantsHtml = formatParam === 'html' || (acceptHeader.includes('text/html') && !acceptHeader.includes('application/json'))

    let responseData: unknown
    let status = 200

    if (!methodPath) {
      // GET /rpc - Schema overview
      responseData = this.handleSchemaRequest()
    } else if (methodPath === 'do.collections.list') {
      // Special case for collections listing
      responseData = this.handleCollectionsRequest()
    } else {
      // Check if it's a registered method (full match)
      if (this.registry.has(methodPath)) {
        responseData = this.handleMethodRequest(methodPath)
      } else {
        // Check if it's a namespace (do.{namespace} format)
        const parts = methodPath.split('.')
        if (parts.length === 2 && parts[0] === 'do') {
          const namespace = parts[1]
          const nsResponse = this.handleNamespaceRequest(namespace)
          if (nsResponse) {
            responseData = nsResponse
          } else {
            return this.notFoundWithSuggestions(methodPath)
          }
        } else if (parts.length >= 3 && parts[0] === 'do') {
          // Could be do.{namespace}.{action} - check for method
          const methodResult = this.handleMethodRequest(methodPath)
          if (methodResult) {
            responseData = methodResult
          } else {
            return this.notFoundWithSuggestions(methodPath)
          }
        } else {
          return this.notFoundWithSuggestions(methodPath)
        }
      }
    }

    if (wantsHtml) {
      return this.htmlResponse(responseData)
    }

    return this.jsonResponse(responseData, status)
  }

  // ===========================================================================
  // Response Generators
  // ===========================================================================

  /**
   * Generate schema overview response
   */
  handleSchemaRequest(): SchemaResponse {
    const allMethods = this.registry.list()
    const grouped = this.registry.listByNamespace()
    const namespaces: Record<string, NamespaceInfo> = {}

    for (const [ns, methodNames] of grouped) {
      const actions = methodNames.map((name) => {
        const parts = name.split('.')
        return parts.slice(2).join('.')
      })
      namespaces[ns] = {
        $ref: `${this.baseUrl}/rpc/do.${ns}`,
        methods: actions,
      }
    }

    return {
      $id: `${this.baseUrl}/rpc`,
      $type: 'RPCSchema',
      namespaces,
      links: this.generateSchemaLinks(),
      methodCount: allMethods.length,
    }
  }

  /**
   * Generate namespace documentation response
   */
  handleNamespaceRequest(namespace: string): NamespaceResponse | null {
    const methods = this.registry.list(namespace)
    if (methods.length === 0) {
      return null
    }

    const methodSummaries: MethodSummary[] = methods.map((m) => {
      const parts = m.name.split('.')
      const action = parts.slice(2).join('.')
      return {
        name: action,
        fullName: m.name,
        href: `${this.baseUrl}/rpc/${m.name}`,
        description: m.options.description,
      }
    })

    return {
      $id: `${this.baseUrl}/rpc/do.${namespace}`,
      $type: 'RPCNamespace',
      name: `do.${namespace}`,
      namespace,
      methods: methodSummaries,
      links: this.generateNamespaceLinks(namespace),
    }
  }

  /**
   * Generate method documentation response
   */
  handleMethodRequest(method: string): MethodResponse | null {
    const registered = this.registry.get(method)
    if (!registered) {
      return null
    }

    const parts = method.split('.')
    const namespace = parts.length >= 3 ? parts[1] : undefined
    const action = parts.length >= 3 ? parts.slice(2).join('.') : method

    const description = registered.options.description || `${action} operation on ${namespace || 'unknown'} namespace`

    const params: Record<string, ParamDoc> | null = registered.options.params
      ? Object.fromEntries(
          Object.entries(registered.options.params).map(([key, schema]) => [
            key,
            {
              type: schema.type,
              required: schema.required,
              description: schema.description,
              default: schema.default,
            },
          ])
        )
      : { id: { type: 'string', required: false, description: 'Resource identifier' } }

    const returns = registered.options.returns || 'unknown'

    return {
      $id: `${this.baseUrl}/rpc/${method}`,
      $type: 'RPCMethod',
      name: method,
      description,
      params,
      returns,
      links: this.generateMethodLinks(method),
      example: {
        request: { method, params: {} },
        response: { result: {} },
      },
    }
  }

  /**
   * Generate collections listing response
   */
  handleCollectionsRequest(): CollectionsResponse {
    const collections: CollectionInfo[] = STANDARD_COLLECTIONS.map((name) => {
      const operations: string[] = []
      const links: CollectionLinks = {}

      for (const op of COLLECTION_OPERATIONS) {
        const methodName = `do.${name}.${op}`
        if (this.registry.has(methodName)) {
          operations.push(op)
          links[op] = `${this.baseUrl}/rpc/${methodName}`
        }
      }

      // If no operations are registered, include all standard operations as available
      if (operations.length === 0) {
        for (const op of COLLECTION_OPERATIONS) {
          operations.push(op)
          links[op] = `${this.baseUrl}/rpc/do.${name}.${op}`
        }
      }

      return {
        name,
        href: `${this.baseUrl}/rpc/do.${name}`,
        operations,
        links,
      }
    })

    return {
      $id: `${this.baseUrl}/rpc/do.collections.list`,
      $type: 'RPCMethod',
      name: 'do.collections.list',
      description: 'List all available collections',
      returns: 'string[]',
      collections,
    }
  }

  // ===========================================================================
  // Link Generators
  // ===========================================================================

  /**
   * Generate links for a method
   */
  private generateMethodLinks(method: string): Link[] {
    const parts = method.split('.')
    const namespace = parts.length >= 3 ? parts[1] : undefined
    const links: Link[] = []

    // Invoke link
    links.push({
      rel: 'invoke',
      href: `${this.baseUrl}/rpc/${method}`,
      method: 'POST',
      title: `Invoke ${method}`,
    })

    // Parent namespace link
    if (namespace) {
      links.push({
        rel: 'namespace',
        href: `${this.baseUrl}/rpc/do.${namespace}`,
        title: `${namespace} namespace`,
      })
    }

    // Related methods in same namespace
    if (namespace) {
      const namespaceMethods = this.registry.list(namespace)
      for (const m of namespaceMethods) {
        if (m.name !== method) {
          links.push({
            rel: 'related',
            href: `${this.baseUrl}/rpc/${m.name}`,
            title: m.name,
          })
        }
      }
    }

    // Schema root link
    links.push({
      rel: 'up',
      href: `${this.baseUrl}/rpc`,
      title: 'RPC Schema',
    })

    return links
  }

  /**
   * Generate links for a namespace
   */
  private generateNamespaceLinks(namespace: string): Link[] {
    const links: Link[] = []

    // Self link
    links.push({
      rel: 'self',
      href: `${this.baseUrl}/rpc/do.${namespace}`,
      title: `${namespace} namespace`,
    })

    // Parent (schema root) link
    links.push({
      rel: 'up',
      href: `${this.baseUrl}/rpc`,
      title: 'RPC Schema',
    })

    // Links to each method
    const methods = this.registry.list(namespace)
    for (const m of methods) {
      const parts = m.name.split('.')
      const action = parts.slice(2).join('.')
      links.push({
        rel: 'method',
        href: `${this.baseUrl}/rpc/${m.name}`,
        title: action,
      })
    }

    return links
  }

  /**
   * Generate common links for schema root
   */
  private generateSchemaLinks(): Link[] {
    const links: Link[] = []

    // Identity link
    links.push({
      rel: 'identity',
      href: `${this.baseUrl}/rpc/do.identity.get`,
      title: 'Get DO identity',
    })

    // Collections link
    links.push({
      rel: 'collections',
      href: `${this.baseUrl}/rpc/do.collections.list`,
      title: 'List collections',
    })

    // WebSocket link
    const wsUrl = this.baseUrl.replace(/^http/, 'ws')
    links.push({
      rel: 'websocket',
      href: `${wsUrl}/rpc`,
      title: 'WebSocket RPC endpoint',
    })

    return links
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Build absolute URL from path
   */
  private buildUrl(path: string): string {
    return `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`
  }

  /**
   * Create JSON response
   */
  private jsonResponse(data: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(data, null, 2), {
      status,
      headers: this.corsHeaders({
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
      }),
    })
  }

  /**
   * Create HTML response
   */
  private htmlResponse(data: unknown): Response {
    const html = this.renderHtml(data)
    return new Response(html, {
      status: 200,
      headers: this.corsHeaders({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
      }),
    })
  }

  /**
   * Render data as HTML with clickable links
   */
  private renderHtml(data: unknown): string {
    const json = JSON.stringify(data, null, 2)
    // Replace URLs in JSON with clickable links
    const linkedJson = json.replace(
      /"(https?:\/\/[^"]+)"/g,
      '"<a href="$1">$1</a>"'
    )

    // Extract method names and make them linkable
    const allMethods = this.registry.list()
    let html = linkedJson
    for (const m of allMethods) {
      const methodPattern = new RegExp(`"(${m.name.replace(/\./g, '\\.')})(?!")`, 'g')
      html = html.replace(methodPattern, `"<a href="${this.baseUrl}/rpc/${m.name}">$1</a>`)
    }

    return `<!DOCTYPE html>
<html>
<head><title>RPC Schema</title></head>
<body>
<pre>${html}</pre>
</body>
</html>`
  }

  /**
   * Create 404 response
   */
  private notFound(message: string): Response {
    return this.jsonResponse(
      {
        error: {
          code: -32601,
          message,
        },
        _links: {
          methods: `${this.baseUrl}/rpc`,
        },
        links: [{ rel: 'methods', href: `${this.baseUrl}/rpc` }],
      },
      404
    )
  }

  /**
   * Create 404 response with suggestions for similar methods
   */
  private notFoundWithSuggestions(methodPath: string): Response {
    const allMethods = this.registry.list()
    const suggestions = this.findSimilarMethods(methodPath, allMethods)

    return new Response(
      JSON.stringify(
        {
          error: {
            code: -32601,
            message: `Method not found: ${methodPath}`,
          },
          suggestions,
          _links: {
            methods: `${this.baseUrl}/rpc`,
          },
          links: [{ rel: 'methods', href: `${this.baseUrl}/rpc` }],
        },
        null,
        2
      ),
      {
        status: 404,
        headers: this.corsHeaders({
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache',
        }),
      }
    )
  }

  /**
   * Find methods similar to the given path (for suggestions)
   */
  private findSimilarMethods(target: string, methods: RegisteredMethod[]): string[] {
    const suggestions: string[] = []
    const targetParts = target.split('.')

    for (const m of methods) {
      const methodParts = m.name.split('.')

      // Same namespace
      if (targetParts.length >= 2 && methodParts.length >= 2 && targetParts[1] === methodParts[1]) {
        suggestions.push(m.name)
        continue
      }

      // Levenshtein-like simple similarity: share prefix
      if (targetParts[0] === methodParts[0] && this.similarity(target, m.name) > 0.5) {
        suggestions.push(m.name)
      }
    }

    return suggestions.slice(0, 5)
  }

  /**
   * Simple string similarity (0-1)
   */
  private similarity(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length)
    if (maxLen === 0) return 1
    let matches = 0
    const minLen = Math.min(a.length, b.length)
    for (let i = 0; i < minLen; i++) {
      if (a[i] === b[i]) matches++
    }
    return matches / maxLen
  }

  /**
   * Handle POST invocation of a method
   */
  private async handlePostInvocation(request: Request, methodPath: string): Promise<Response> {
    const registered = this.registry.get(methodPath)
    if (!registered) {
      return this.notFoundWithSuggestions(methodPath)
    }

    let params: unknown = {}
    try {
      const body = await request.text()
      if (body) {
        params = JSON.parse(body)
      }
    } catch {
      // Use empty params if body isn't valid JSON
    }

    try {
      const result = await registered.handler(params, { state: null, env: null })
      return this.jsonResponse(result)
    } catch (error) {
      return this.jsonResponse(
        {
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : 'Internal error',
          },
        },
        500
      )
    }
  }

  /**
   * Generate CORS headers
   */
  private corsHeaders(additional: Record<string, string> = {}): Headers {
    const headers = new Headers(additional)
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    return headers
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a route handler
 *
 * @param registry - Method registry
 * @param baseUrl - Base URL for links
 * @returns Configured route handler
 */
export function createRouteHandler(registry: MethodRegistry, baseUrl: string): RPCRouteHandler {
  return new RPCRouteHandler(registry, baseUrl)
}

/**
 * Standard collection names
 *
 * Used for generating collection links.
 */
export const STANDARD_COLLECTIONS = [
  'nouns',
  'verbs',
  'things',
  'actions',
  'relationships',
  'functions',
  'workflows',
  'events',
  'experiments',
  'orgs',
  'roles',
  'users',
  'agents',
  'integrations',
  'webhooks',
] as const

/**
 * Standard collection operations
 *
 * Common CRUD operations available on collections.
 */
export const COLLECTION_OPERATIONS = ['list', 'get', 'create', 'update', 'delete'] as const

/**
 * Create a method link URL
 *
 * @param baseUrl - Base URL for the API
 * @param method - Method name (e.g., 'do.things.list')
 * @param isNamespace - Whether this is a namespace link (default: false)
 * @returns Full URL to the method or namespace
 *
 * @example
 * ```typescript
 * const link = createMethodLink('https://example.com', 'do.things.list')
 * // Returns: 'https://example.com/rpc/do.things.list'
 * ```
 */
export function createMethodLink(baseUrl: string, method: string, isNamespace?: boolean): string {
  // Remove trailing slash from base URL
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  return `${base}/rpc/${method}`
}
