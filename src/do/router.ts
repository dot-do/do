/**
 * HTTP Router Module
 *
 * Provides Hono-based HTTP routing for the DO:
 * - createRouter: Create Hono app with all routes
 * - handleRequest: Handle incoming HTTP requests
 */

import { Hono } from 'hono'
import type { DOContext, Document, ListOptions, AuthContext } from './types'
import * as auth from './auth'

/**
 * Interface for the DO instance methods needed by the router
 */
interface DOInstance {
  get<T extends Document>(collection: string, id: string): Promise<T | null>
  list<T extends Document>(collection: string, options?: ListOptions): Promise<T[]>
  create<T extends Document>(collection: string, doc: Omit<T, 'id'> | T): Promise<T>
  update<T extends Document>(collection: string, id: string, updates: Partial<T>): Promise<T | null>
  delete(collection: string, id: string): Promise<boolean>
  invoke(method: string, params: unknown[], authContext?: AuthContext): Promise<unknown>
  allowedMethods: Set<string>
}

// Type for Hono context variables
type HonoVariables = {
  authContext: AuthContext | null
}

/**
 * Create Hono router with all routes
 */
export function createRouter(
  ctx: DOContext,
  doInstance: DOInstance
): Hono<{ Variables: HonoVariables }> {
  const app = new Hono<{ Variables: HonoVariables }>()

  // Auth middleware - extracts and stores auth context per-request
  app.use('*', async (c, next) => {
    const authContext = auth.extractAuthFromRequest(c.req.raw)
    c.set('authContext', authContext)
    // Also set on ctx for backwards compatibility with other code paths
    ctx.currentAuthContext = authContext
    try {
      await next()
    } finally {
      // Clear the shared context after request
      ctx.currentAuthContext = null
    }
  })

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
        methods: Array.from(doInstance.allowedMethods),
        tools: ['search', 'fetch', 'do'],
      },
      request: {
        origin: c.req.header('CF-Connecting-IP') || '',
        country: c.req.header('CF-IPCountry') || '',
      },
    })
  })

  // RPC handler (supports single request or batch)
  app.post('/rpc', async (c) => {
    try {
      const body = await c.req.json()

      // Get request-local auth context
      const requestAuthContext = c.get('authContext')

      // Check if this is a batch request (array)
      if (Array.isArray(body)) {
        const results = await Promise.all(
          body.map(async (request: { id?: string; method: string; params?: unknown[]; auth?: AuthContext }) => {
            const { id, method, params = [], auth: perRequestAuth } = request
            try {
              // Use per-request auth if provided, otherwise use request-local auth
              const effectiveAuth = perRequestAuth ?? requestAuthContext ?? undefined
              const result = await doInstance.invoke(method, params, effectiveAuth)
              return { id, result }
            } catch (err) {
              return { id, error: err instanceof Error ? err.message : 'Unknown error' }
            }
          })
        )
        return c.json(results)
      }

      // Single request
      const { id, method, params = [], auth: perRequestAuth } = body as { id?: string; method: string; params?: unknown[]; auth?: AuthContext }
      try {
        // Use per-request auth if provided, otherwise use request-local auth
        const effectiveAuth = perRequestAuth ?? requestAuthContext ?? undefined
        const result = await doInstance.invoke(method, params, effectiveAuth)
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
    if (!doInstance.allowedMethods.has(tool)) {
      return c.json({ error: `Tool not found: ${tool}` }, 404)
    }
    const result = await doInstance.invoke(tool, params)
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
    const origin = url.origin
    const limit = url.searchParams.get('limit')
    const offset = url.searchParams.get('offset')
    const orderBy = url.searchParams.get('orderBy')
    const order = url.searchParams.get('order') as 'asc' | 'desc' | null

    const options: ListOptions = {}
    if (limit) options.limit = parseInt(limit, 10)
    if (offset) options.offset = parseInt(offset, 10)
    if (orderBy) options.orderBy = orderBy
    if (order) options.order = order

    const docs = await doInstance.list(resource, options)
    // Return HATEOAS response with data and links
    return c.json({
      data: docs,
      links: {
        self: `${origin}/api/${resource}`,
        collection: `${origin}/api/${resource}`,
      },
    })
  })

  // POST /api/:resource - create document
  app.post('/api/:resource', async (c) => {
    const resource = c.req.param('resource')
    const origin = new URL(c.req.url).origin
    const body = await c.req.json()

    // Add auth metadata to the document
    const docWithAuth = { ...body }
    if (ctx.currentAuthContext?.userId) {
      docWithAuth._createdBy = ctx.currentAuthContext.userId
    }
    if (ctx.currentAuthContext?.organizationId) {
      docWithAuth._organization = ctx.currentAuthContext.organizationId
    }

    const doc = await doInstance.create(resource, docWithAuth)
    // Return HATEOAS response with data and links
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
    const origin = new URL(c.req.url).origin
    const doc = await doInstance.get(resource, id)
    if (!doc) {
      return c.json({ error: 'Not found' }, 404)
    }
    // Return HATEOAS response with data and links
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
    const origin = new URL(c.req.url).origin
    const body = await c.req.json()

    // Add auth metadata to the update
    const updatesWithAuth = { ...body }
    if (ctx.currentAuthContext?.userId) {
      updatesWithAuth._updatedBy = ctx.currentAuthContext.userId
    }

    const doc = await doInstance.update(resource, id, updatesWithAuth)
    if (!doc) {
      return c.json({ error: 'Not found' }, 404)
    }
    // Return HATEOAS response with data and links
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
    const success = await doInstance.delete(resource, id)
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
    const docs = await doInstance.list(resource)
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
    const doc = await doInstance.get(resource, id)
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
 * @param ctx - DO context with state and storage
 * @param doInstance - The DO instance with methods
 * @param request - The incoming HTTP request
 * @param cachedRouter - Optional pre-created Hono router for reuse across requests
 */
export async function handleRequest(
  ctx: DOContext,
  doInstance: DOInstance,
  request: Request,
  cachedRouter?: Hono
): Promise<Response> {
  // Extract auth context from request headers
  const authContext = auth.extractAuthFromRequest(request)

  // Handle WebSocket upgrades first (works on any path)
  const upgradeHeader = request.headers.get('Upgrade')
  if (upgradeHeader?.toLowerCase() === 'websocket') {
    // Create WebSocket pair
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    // Accept the WebSocket connection
    if (ctx.ctx.acceptWebSocket) {
      ctx.ctx.acceptWebSocket(server)
    }

    // Store WebSocket auth context from headers or URL params
    const url = new URL(request.url)
    const wsAuth = authContext ?? auth.extractAuthFromUrl(url)
    if (wsAuth) {
      ctx.wsAuthContexts.set(server, wsAuth)
      // Also store as attachment for hibernation persistence
      if (ctx.setWebSocketAttachment) {
        ctx.setWebSocketAttachment(server, { auth: wsAuth })
      }
    }

    // Return 101 Switching Protocols response with WebSocket
    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }

  // Set transport context for this request (auth is handled by middleware in router)
  if (ctx.setTransportContext) {
    ctx.setTransportContext({
      type: 'http',
      request,
    })
  }

  try {
    // Use cached router if provided, otherwise create a new one (backwards compatibility)
    const router = cachedRouter ?? createRouter(ctx, doInstance)
    return await router.fetch(request)
  } finally {
    // Clear transport context
    if (ctx.setTransportContext) {
      ctx.setTransportContext(null)
    }
  }
}
