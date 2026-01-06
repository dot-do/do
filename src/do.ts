/**
 * @dotdo/do - Core DO Base Class
 *
 * An agentic database that can DO anything.
 *
 * Extends Cloudflare's Agent class with:
 * - RpcTarget implementation (capnweb style)
 * - Multi-transport support (Workers RPC, HTTP, WebSocket, MCP)
 * - Simple CRUD operations (ai-database compatible)
 * - MCP tools (search, fetch, do)
 * - WebSocket hibernation
 * - HATEOAS REST API
 * - Monaco Editor UI
 */

import { Hono } from 'hono'
import type {
  ListOptions,
  Document,
  SearchOptions,
  SearchResult,
  FetchOptions,
  FetchResult,
  DoOptions,
  DoResult,
} from './types'

// Placeholder types until we can import from agents package
type ExecutionContext = {
  waitUntil(promise: Promise<unknown>): void
  passThroughOnException(): void
}

type SqlExecResult = {
  toArray(): unknown[]
}

type DurableObjectState = {
  storage: {
    sql: {
      exec(query: string, ...params: unknown[]): SqlExecResult
    }
  }
  acceptWebSocket?(ws: WebSocket): void
  setWebSocketAutoResponse?(pair: unknown): void
}

/**
 * DO - Core Durable Object Base Class
 *
 * The foundational layer for all .do workers.
 * An agentic database that can DO anything - providing:
 * - Multi-transport RPC (Workers RPC, HTTP, WebSocket, MCP)
 * - Simple CRUD operations
 * - MCP tools for AI integration
 */
export class DO<Env = unknown, State = unknown> {
  protected ctx: DurableObjectState
  protected env: Env
  private schemaInitialized = false

  /**
   * Allowlist of methods that can be invoked via RPC.
   * Prevents invocation of inherited methods like constructor, __proto__, etc.
   */
  protected allowedMethods = new Set([
    // CRUD operations
    'get',
    'list',
    'create',
    'update',
    'delete',
    // MCP tools
    'search',
    'fetch',
    'do',
  ])

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx
    this.env = env
  }

  /**
   * Initialize the SQLite schema if needed
   */
  private initSchema(): void {
    if (this.schemaInitialized) return

    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (collection, id)
      )
    `)

    this.schemaInitialized = true
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return crypto.randomUUID()
  }

  // ============================================
  // RpcTarget Implementation
  // ============================================

  /**
   * Check if a method is allowed to be invoked via RPC
   */
  hasMethod(name: string): boolean {
    return this.allowedMethods.has(name)
  }

  /**
   * Invoke a method by name
   */
  async invoke(method: string, params: unknown[]): Promise<unknown> {
    if (!this.allowedMethods.has(method)) {
      throw new Error(`Method not allowed: ${method}`)
    }

    const fn = (this as unknown as Record<string, unknown>)[method]
    if (typeof fn !== 'function') {
      throw new Error(`Method not found: ${method}`)
    }

    return (fn as (...args: unknown[]) => Promise<unknown>).apply(this, params)
  }

  // ============================================
  // Simple CRUD Operations
  // ============================================

  /**
   * Get a document by ID
   */
  async get<T extends Document>(collection: string, id: string): Promise<T | null> {
    this.initSchema()

    const results = this.ctx.storage.sql
      .exec('SELECT data FROM documents WHERE collection = ? AND id = ?', collection, id)
      .toArray()

    if (results.length === 0) {
      return null
    }

    const row = results[0] as { data: string }
    return JSON.parse(row.data) as T
  }

  /**
   * List documents in a collection
   */
  async list<T extends Document>(collection: string, options?: ListOptions): Promise<T[]> {
    this.initSchema()

    const limit = options?.limit ?? 100
    const offset = options?.offset ?? 0
    const orderBy = options?.orderBy ?? 'created_at'
    const order = options?.order ?? 'asc'

    // Build query with ordering and pagination
    const query = `SELECT data FROM documents WHERE collection = ? ORDER BY ${orderBy} ${order.toUpperCase()} LIMIT ? OFFSET ?`

    const results = this.ctx.storage.sql
      .exec(query, collection, limit, offset)
      .toArray()

    return results.map((row) => JSON.parse((row as { data: string }).data) as T)
  }

  /**
   * Create a new document
   */
  async create<T extends Document>(collection: string, doc: Omit<T, 'id'> | T): Promise<T> {
    this.initSchema()

    // Use provided id or generate a new one
    const id = (doc as T).id ?? this.generateId()
    const document = { ...doc, id } as T

    this.ctx.storage.sql.exec(
      'INSERT INTO documents (collection, id, data) VALUES (?, ?, ?)',
      collection,
      id,
      JSON.stringify(document)
    )

    return document
  }

  /**
   * Update an existing document
   */
  async update<T extends Document>(
    collection: string,
    id: string,
    updates: Partial<T>
  ): Promise<T | null> {
    this.initSchema()

    // Get existing document first
    const existing = await this.get<T>(collection, id)
    if (!existing) {
      return null
    }

    // Merge updates with existing document
    const updated = { ...existing, ...updates, id } as T

    this.ctx.storage.sql.exec(
      'UPDATE documents SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE collection = ? AND id = ?',
      JSON.stringify(updated),
      collection,
      id
    )

    return updated
  }

  /**
   * Delete a document
   */
  async delete(collection: string, id: string): Promise<boolean> {
    this.initSchema()

    // Check if document exists first
    const existing = await this.get(collection, id)
    if (!existing) {
      return false
    }

    this.ctx.storage.sql.exec(
      'DELETE FROM documents WHERE collection = ? AND id = ?',
      collection,
      id
    )

    return true
  }

  // ============================================
  // MCP Tools
  // ============================================

  /**
   * Search across collections using SQLite LIKE
   */
  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    this.initSchema()

    const limit = options?.limit ?? 100
    const collections = options?.collections

    // Build the search pattern
    const searchPattern = `%${query}%`

    // Query documents matching the search pattern
    let results: { collection: string; id: string; data: string }[]

    if (collections && collections.length > 0) {
      // Search specific collections
      const placeholders = collections.map(() => '?').join(', ')
      results = this.ctx.storage.sql
        .exec(
          `SELECT collection, id, data FROM documents
           WHERE collection IN (${placeholders}) AND data LIKE ?
           LIMIT ?`,
          ...collections,
          searchPattern,
          limit
        )
        .toArray() as { collection: string; id: string; data: string }[]
    } else {
      // Search all collections
      results = this.ctx.storage.sql
        .exec(
          `SELECT collection, id, data FROM documents
           WHERE data LIKE ?
           LIMIT ?`,
          searchPattern,
          limit
        )
        .toArray() as { collection: string; id: string; data: string }[]
    }

    // Transform results with relevance scoring
    const searchResults: SearchResult[] = results.map((row) => {
      const document = JSON.parse(row.data) as Document
      // Calculate a simple relevance score based on match count
      const dataStr = row.data.toLowerCase()
      const queryLower = query.toLowerCase()
      // Escape special regex characters
      const escapedQuery = queryLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const matchCount = (dataStr.match(new RegExp(escapedQuery, 'g')) || []).length
      const score = matchCount / Math.max(dataStr.length / 100, 1)

      return {
        id: row.id,
        collection: row.collection,
        score,
        document,
      }
    })

    // Sort by score descending
    searchResults.sort((a, b) => b.score - a.score)

    return searchResults
  }

  /**
   * Fetch a URL using global fetch() and return result
   */
  async fetch(target: string, options?: FetchOptions): Promise<FetchResult> {
    const method = options?.method ?? 'GET'
    const headers = options?.headers ?? {}
    const timeout = options?.timeout ?? 30000

    try {
      // Build fetch options
      const fetchOptions: RequestInit = {
        method,
        headers,
      }

      // Add body if provided (for POST, PUT, etc.)
      if (options?.body !== undefined) {
        if (typeof options.body === 'object') {
          fetchOptions.body = JSON.stringify(options.body)
          // Set content-type if not already set
          if (!headers['Content-Type'] && !headers['content-type']) {
            fetchOptions.headers = {
              ...headers,
              'Content-Type': 'application/json',
            }
          }
        } else {
          fetchOptions.body = String(options.body)
        }
      }

      // Create abort controller for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)
      fetchOptions.signal = controller.signal

      // Perform the fetch
      const response = await globalThis.fetch(target, fetchOptions)
      clearTimeout(timeoutId)

      // Parse response headers
      const responseHeaders: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })

      // Parse response body
      let body: unknown
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        try {
          body = await response.json()
        } catch {
          body = await response.text()
        }
      } else {
        body = await response.text()
      }

      return {
        status: response.status,
        headers: responseHeaders,
        body,
        url: response.url || target,
      }
    } catch (error) {
      // Handle fetch errors (network errors, timeouts, etc.)
      const errorMessage = error instanceof Error ? error.message : 'Unknown fetch error'
      return {
        status: 500,
        headers: {},
        body: { error: errorMessage },
        url: target,
      }
    }
  }

  /**
   * Execute code in sandbox (via ai-evaluate)
   * Returns mock result for now - real implementation comes with ai-evaluate integration
   */
  async do(code: string, options?: DoOptions): Promise<DoResult> {
    const startTime = Date.now()

    try {
      // Mock execution for now
      // In real implementation, this will use ai-evaluate for sandboxed execution
      let result: unknown
      const logs: string[] = []

      // Very simple mock evaluation for basic expressions
      // SECURITY NOTE: This is a placeholder - real implementation must use ai-evaluate
      if (code.startsWith('return ')) {
        const expression = code.slice(7).trim()

        // Only evaluate simple arithmetic for the mock
        if (/^[\d\s+\-*/().]+$/.test(expression)) {
          // Safe arithmetic evaluation
          result = Function(`"use strict"; return (${expression})`)()
        } else if (expression === 'true') {
          result = true
        } else if (expression === 'false') {
          result = false
        } else if (expression === 'null') {
          result = null
        } else if (/^["'].*["']$/.test(expression)) {
          result = expression.slice(1, -1)
        } else if (expression.startsWith('process.env.')) {
          // Return mock env value for testing
          const envKey = expression.slice(12)
          result = options?.env?.[envKey] ?? undefined
        } else {
          // For complex expressions, return mock result
          result = { mock: true, code, message: 'ai-evaluate integration pending' }
        }
      } else if (code.includes('throw ')) {
        // Simulate error handling
        const errorMatch = code.match(/throw new Error\(["'](.*)["']\)/)
        const errorMessage = errorMatch ? errorMatch[1] : 'Unknown error'
        return {
          success: false,
          error: errorMessage,
          logs,
          duration: Date.now() - startTime,
        }
      } else {
        // Default mock result for other code
        result = { mock: true, code, message: 'ai-evaluate integration pending' }
      }

      return {
        success: true,
        result,
        logs,
        duration: Date.now() - startTime,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown execution error',
        logs: [],
        duration: Date.now() - startTime,
      }
    }
  }

  // ============================================
  // WebSocket Hibernation
  // ============================================

  /**
   * Handle incoming WebSocket message
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // TODO: Implement WebSocket message handling
  }

  /**
   * Handle WebSocket close
   */
  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean
  ): Promise<void> {
    // TODO: Implement WebSocket close handling
  }

  /**
   * Handle WebSocket error
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket error:', error)
  }

  // ============================================
  // Multi-Transport fetch (Hono Router)
  // ============================================

  /**
   * Create Hono router with all routes
   */
  private createRouter(): Hono {
    const app = new Hono()

    // Health check
    app.get('/health', (c) => c.json({ status: 'ok' }))

    // HATEOAS discovery response
    app.get('/', (c) => {
      const origin = new URL(c.req.url).origin
      return c.json({
        api: {
          name: '@dotdo/do',
          version: '0.0.1',
        },
        links: {
          self: origin,
          api: `${origin}/api`,
          rpc: `${origin}/rpc`,
        },
        discover: {
          collections: [],
          methods: Array.from(this.allowedMethods),
          tools: ['search', 'fetch', 'do'],
        },
        request: {
          origin: c.req.header('CF-Connecting-IP') || '',
          country: c.req.header('CF-IPCountry') || '',
        },
      })
    })

    // RPC handler
    app.post('/rpc', async (c) => {
      try {
        const body = await c.req.json() as { id: string; method: string; params: unknown[] }
        const { id, method, params } = body
        try {
          const result = await this.invoke(method, params)
          return c.json({ id, result })
        } catch (err) {
          return c.json({ id, error: err instanceof Error ? err.message : 'Unknown error' })
        }
      } catch {
        return c.json({ id: '', error: 'Invalid JSON' }, 400)
      }
    })

    // MCP handler (GET and POST)
    app.get('/mcp', (c) => {
      return c.json({
        tools: [
          { name: 'search', description: 'Search across collections' },
          { name: 'fetch', description: 'Fetch a URL or document' },
          { name: 'do', description: 'Execute code in sandbox' },
        ],
      })
    })

    app.post('/mcp', async (c) => {
      const body = await c.req.json() as { tool: string; params: unknown[] }
      const { tool, params } = body
      if (!this.allowedMethods.has(tool)) {
        return c.json({ error: `Tool not found: ${tool}` }, 404)
      }
      const result = await this.invoke(tool, params)
      return c.json({ result })
    })

    // Schema routes
    app.get('/api/.schema', (c) => {
      return c.json({
        get: { params: ['collection: string', 'id: string'], returns: 'Document | null' },
        list: { params: ['collection: string', 'options?: ListOptions'], returns: 'Document[]' },
        create: { params: ['collection: string', 'doc: Document'], returns: 'Document' },
        update: { params: ['collection: string', 'id: string', 'updates: Partial<Document>'], returns: 'Document | null' },
        delete: { params: ['collection: string', 'id: string'], returns: 'boolean' },
      })
    })

    app.get('/api/.schema/:method', (c) => {
      const method = c.req.param('method')
      const schemas: Record<string, { params: string[]; returns: string }> = {
        get: { params: ['collection: string', 'id: string'], returns: 'Document | null' },
        list: { params: ['collection: string', 'options?: ListOptions'], returns: 'Document[]' },
        create: { params: ['collection: string', 'doc: Document'], returns: 'Document' },
        update: { params: ['collection: string', 'id: string', 'updates: Partial<Document>'], returns: 'Document | null' },
        delete: { params: ['collection: string', 'id: string'], returns: 'boolean' },
      }
      if (schemas[method]) {
        return c.json(schemas[method])
      }
      return c.json({ error: 'Method not found' }, 404)
    })

    // REST API routes
    app.get('/api', (c) => {
      return c.json({ collections: [] })
    })

    // GET /api/:resource - list documents in collection
    app.get('/api/:resource', async (c) => {
      const resource = c.req.param('resource')
      const url = new URL(c.req.url)
      const limit = url.searchParams.get('limit')
      const offset = url.searchParams.get('offset')
      const orderBy = url.searchParams.get('orderBy')
      const order = url.searchParams.get('order') as 'asc' | 'desc' | null

      const options: ListOptions = {}
      if (limit) options.limit = parseInt(limit, 10)
      if (offset) options.offset = parseInt(offset, 10)
      if (orderBy) options.orderBy = orderBy
      if (order) options.order = order

      const docs = await this.list(resource, options)
      const origin = new URL(c.req.url).origin
      return c.json({
        data: docs,
        links: {
          self: `${origin}/api/${resource}`,
        },
      })
    })

    // POST /api/:resource - create document
    app.post('/api/:resource', async (c) => {
      const resource = c.req.param('resource')
      const body = await c.req.json()
      const doc = await this.create(resource, body)
      const origin = new URL(c.req.url).origin
      return c.json({
        data: doc,
        links: {
          self: `${origin}/api/${resource}/${doc.id}`,
          edit: `${origin}/~/${resource}/${doc.id}`,
          collection: `${origin}/api/${resource}`,
        },
      }, 201)
    })

    // PUT /api/:resource - not allowed without ID
    app.put('/api/:resource', (c) => {
      return c.json({ error: 'Method not allowed' }, 405)
    })

    // GET /api/:resource/:id - get single document
    app.get('/api/:resource/:id', async (c) => {
      const resource = c.req.param('resource')
      const id = c.req.param('id')
      const doc = await this.get(resource, id)
      if (!doc) {
        return c.json({ error: 'Not found' }, 404)
      }
      const origin = new URL(c.req.url).origin
      return c.json({
        data: doc,
        links: {
          self: `${origin}/api/${resource}/${id}`,
          edit: `${origin}/~/${resource}/${id}`,
          collection: `${origin}/api/${resource}`,
        },
      })
    })

    // PUT /api/:resource/:id - update document
    app.put('/api/:resource/:id', async (c) => {
      const resource = c.req.param('resource')
      const id = c.req.param('id')
      const body = await c.req.json()
      const doc = await this.update(resource, id, body)
      if (!doc) {
        return c.json({ error: 'Not found' }, 404)
      }
      const origin = new URL(c.req.url).origin
      return c.json({
        data: doc,
        links: {
          self: `${origin}/api/${resource}/${id}`,
          edit: `${origin}/~/${resource}/${id}`,
          collection: `${origin}/api/${resource}`,
        },
      })
    })

    // DELETE /api/:resource/:id - delete document
    app.delete('/api/:resource/:id', async (c) => {
      const resource = c.req.param('resource')
      const id = c.req.param('id')
      const success = await this.delete(resource, id)
      if (!success) {
        return c.json({ error: 'Not found' }, 404)
      }
      return c.json({ success: true })
    })

    // Monaco Editor routes
    app.get('/~', async (c) => {
      const collections: string[] = []  // TODO: Get actual collections
      return c.html(`<!DOCTYPE html>
<html>
<head><title>Collections</title></head>
<body>
<h1>Collections</h1>
<ul>${collections.map(col => `<li><a href="/~/${col}">${col}</a></li>`).join('')}</ul>
</body>
</html>`)
    })

    app.get('/~/:resource', async (c) => {
      const resource = c.req.param('resource')
      const docs = await this.list(resource)
      return c.html(`<!DOCTYPE html>
<html>
<head><title>${resource}</title></head>
<body>
<h1>${resource}</h1>
<ul>${docs.map(doc => `<li><a href="/~/${resource}/${doc.id}">${doc.id}</a></li>`).join('')}</ul>
</body>
</html>`)
    })

    app.get('/~/:resource/:id', async (c) => {
      const resource = c.req.param('resource')
      const id = c.req.param('id')
      const doc = await this.get(resource, id)
      const origin = new URL(c.req.url).origin
      const json = doc ? JSON.stringify(doc, null, 2) : '{}'
      return c.html(`<!DOCTYPE html>
<html>
<head>
<title>${resource}/${id}</title>
<script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js"></script>
<style>
#editor { width: 100%; height: 400px; border: 1px solid #ccc; }
.save-btn { margin: 10px 0; padding: 10px 20px; }
</style>
</head>
<body>
<h1>${resource}/${id}</h1>
<div id="editor"></div>
<button class="save-btn" onclick="save()">Save</button>
<script>
require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
require(['vs/editor/editor.main'], function() {
  window.editor = monaco.editor.create(document.getElementById('editor'), {
    value: ${JSON.stringify(json)},
    language: 'json'
  });
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, function() { save(); });
});
function save() {
  fetch('${origin}/api/${resource}/${id}', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: editor.getValue()
  }).then(res => res.json()).then(data => alert('Saved!'));
}
</script>
</body>
</html>`)
    })

    return app
  }

  /**
   * Handle incoming HTTP requests
   */
  async handleRequest(request: Request): Promise<Response> {
    // Handle WebSocket upgrades first (works on any path)
    const upgradeHeader = request.headers.get('Upgrade')
    if (upgradeHeader?.toLowerCase() === 'websocket') {
      // Create WebSocket pair
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)

      // Accept the WebSocket connection
      if (this.ctx.acceptWebSocket) {
        this.ctx.acceptWebSocket(server)
      }

      // Return 101 Switching Protocols response with WebSocket
      return new Response(null, {
        status: 101,
        webSocket: client,
      })
    }

    // Route HTTP requests through Hono
    const router = this.createRouter()
    return router.fetch(request)
  }
}
