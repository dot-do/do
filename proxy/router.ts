/**
 * Clickable Link API Router
 *
 * Every URL is an API endpoint that returns JSON with clickable links.
 * Browse the API by clicking links. No docs needed.
 *
 * URL Patterns:
 * - https://{domain}/ - Root discovery
 * - https://{domain}/.do - DO identity
 * - https://{domain}/rpc - RPC endpoint (POST for calls, GET for clickable)
 * - https://{domain}/mcp - MCP server (discovery + tool calls)
 * - https://{domain}/api/* - REST-style API
 *
 * Every DO has:
 * - API (JSON responses with links)
 * - MCP (Model Context Protocol for AI tools)
 * - Site/App (optional UI served from subdomain)
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './index'
import { handleMCPDiscovery, handleMCPRequest, MCPServer } from './mcp'

// =============================================================================
// Types
// =============================================================================

export interface APIResponse<T = unknown> {
  api: string
  data: T
  links: Record<string, string>
  user?: string
  colo?: string
  timestamp: number
}

interface RouteContext {
  subdomain?: string
  service: string
  tld: string
  path: string
}

// =============================================================================
// Helper Functions
// =============================================================================

function parseHostname(hostname: string): RouteContext {
  const parts = hostname.split('.')

  // Handle various TLD patterns
  if (hostname.endsWith('.colo.do')) {
    return { subdomain: parts[0], service: 'colo', tld: 'do', path: '' }
  }
  if (hostname.endsWith('.db4.ai')) {
    return { subdomain: parts[0], service: 'db4', tld: 'ai', path: '' }
  }
  if (hostname.endsWith('.workers.do')) {
    return { subdomain: parts[0], service: 'workers', tld: 'do', path: '' }
  }

  // Default: treat entire hostname as the service
  return { service: hostname, tld: parts[parts.length - 1], path: '' }
}

function apiResponse<T>(
  api: string,
  data: T,
  links: Record<string, string>,
  colo?: string
): APIResponse<T> {
  return { api, data, links, colo, timestamp: Date.now() }
}

/**
 * Build clickable links for an RPC method response
 */
function buildRPCLinks(baseUrl: string, method: string): Record<string, string> {
  const links: Record<string, string> = {
    self: `${baseUrl}/rpc/${method}`,
    api: `${baseUrl}/.do`,
    mcp: `${baseUrl}/mcp`,
  }

  // Add navigation links based on method
  const parts = method.split('.')
  if (parts[0] === 'do' && parts.length >= 2) {
    const namespace = parts[1]

    // Add collection navigation
    if (['nouns', 'verbs', 'things', 'actions', 'users', 'agents', 'functions', 'workflows'].includes(namespace)) {
      links.list = `${baseUrl}/rpc/do.${namespace}.list`
      if (parts[2] === 'get' || parts[2] === 'list') {
        links.create = `${baseUrl}/rpc/do.${namespace}.create`
      }
    }

    // Add related methods
    if (namespace === 'identity') {
      links.getContext = `${baseUrl}/rpc/do.identity.getContext`
      links.setContext = `${baseUrl}/rpc/do.identity.setContext`
    }

    if (namespace === 'system') {
      links.ping = `${baseUrl}/rpc/do.system.ping`
      links.stats = `${baseUrl}/rpc/do.system.stats`
      links.schema = `${baseUrl}/rpc/do.system.schema`
    }

    if (namespace === 'collections') {
      links.nouns = `${baseUrl}/rpc/do.nouns.list`
      links.things = `${baseUrl}/rpc/do.things.list`
      links.actions = `${baseUrl}/rpc/do.actions.list`
      links.functions = `${baseUrl}/rpc/do.functions.list`
    }
  }

  return links
}

// =============================================================================
// Router Factory
// =============================================================================

export function createRouter(env: Env) {
  const app = new Hono<{ Bindings: Env }>()

  // CORS for all routes
  app.use('*', cors())

  // ==========================================================================
  // MCP Routes
  // ==========================================================================

  // GET /mcp - MCP server discovery
  app.get('/mcp', (c) => {
    const url = new URL(c.req.url)
    return handleMCPDiscovery(env, url.hostname)
  })

  // POST /mcp - MCP tool calls (JSON-RPC)
  app.post('/mcp', async (c) => {
    const url = new URL(c.req.url)
    return handleMCPRequest(c.req.raw, env, url.hostname)
  })

  // ==========================================================================
  // RPC Routes
  // ==========================================================================

  // POST / - RPC endpoint (same as /rpc for convenience)
  app.post('/', async (c) => {
    const url = new URL(c.req.url)
    const doId = env.DO.idFromName(url.hostname)
    const stub = env.DO.get(doId)
    return stub.fetch(c.req.raw)
  })

  // POST /rpc - RPC endpoint
  app.post('/rpc', async (c) => {
    const url = new URL(c.req.url)
    const doId = env.DO.idFromName(url.hostname)
    const stub = env.DO.get(doId)
    return stub.fetch(c.req.raw)
  })

  // GET /rpc - RPC method discovery with clickable links
  app.get('/rpc', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('cf-ray')?.split('-')[1]

    // Return available methods as clickable links
    return c.json(apiResponse(url.hostname, {
      description: 'RPC API - call methods via POST or explore via GET',
      usage: {
        post: 'POST /rpc with JSON body: { "method": "do.identity.get", "args": [] }',
        get: 'GET /rpc/{method} to see method info and call with no args',
      },
    }, {
      self: `${url.origin}/rpc`,
      identity: `${url.origin}/rpc/do.identity.get`,
      collections: `${url.origin}/rpc/do.collections.list`,
      system: `${url.origin}/rpc/do.system.schema`,
      ping: `${url.origin}/rpc/do.system.ping`,
      mcp: `${url.origin}/mcp`,
      api: `${url.origin}/.do`,
    }, colo))
  })

  // GET /rpc/do.collections.list - List all collections with links
  app.get('/rpc/do.collections.list', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('cf-ray')?.split('-')[1]

    const collections = [
      { name: 'nouns', description: 'Entity type definitions' },
      { name: 'verbs', description: 'Action type definitions with grammatical forms' },
      { name: 'things', description: 'Instances of nouns' },
      { name: 'actions', description: 'Durable action instances' },
      { name: 'relationships', description: 'Connections between things' },
      { name: 'functions', description: 'Executable functions (code, generative, agentic, human)' },
      { name: 'workflows', description: 'Durable workflows and state machines' },
      { name: 'events', description: 'Immutable event records' },
      { name: 'experiments', description: 'A/B tests and feature flags' },
      { name: 'orgs', description: 'Organizations' },
      { name: 'roles', description: 'Permission roles' },
      { name: 'users', description: 'User identities' },
      { name: 'agents', description: 'Autonomous AI agents' },
      { name: 'integrations', description: 'External service connections' },
      { name: 'webhooks', description: 'Outbound event notifications' },
    ]

    const links: Record<string, string> = {
      self: `${url.origin}/rpc/do.collections.list`,
      rpc: `${url.origin}/rpc`,
      api: `${url.origin}/.do`,
    }

    // Add link for each collection
    for (const col of collections) {
      links[col.name] = `${url.origin}/rpc/do.${col.name}.list`
    }

    return c.json(apiResponse(url.hostname, { collections }, links, colo))
  })

  // GET /rpc/* - Clickable link API for any RPC method
  app.get('/rpc/*', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('cf-ray')?.split('-')[1]
    const method = url.pathname.replace('/rpc/', '')

    // For GET requests, try to call the method with no arguments
    // This works for read-only methods like identity.get, *.list
    try {
      const doId = env.DO.idFromName(url.hostname)
      const stub = env.DO.get(doId)

      // Call the DO via rpc.do protocol: POST { path, args }
      const response = await stub.fetch(new Request(`${url.origin}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: method, args: [] }),
      }))

      if (response.ok) {
        const result = await response.json()

        // Wrap result in API response with links
        return c.json(apiResponse(url.hostname, {
          method,
          result,
        }, buildRPCLinks(url.origin, method), colo))
      }

      // Method failed, return info about the method
      return c.json(apiResponse(url.hostname, {
        method,
        description: `RPC method: ${method}`,
        usage: `POST /rpc with body: { "method": "${method}", "args": [...] }`,
      }, buildRPCLinks(url.origin, method), colo))
    } catch {
      // Return method info on error
      return c.json(apiResponse(url.hostname, {
        method,
        description: `RPC method: ${method}`,
        usage: `POST /rpc with body: { "method": "${method}", "args": [...] }`,
      }, buildRPCLinks(url.origin, method), colo))
    }
  })

  // ==========================================================================
  // API Routes (REST-style)
  // ==========================================================================

  // GET /api - API discovery
  app.get('/api', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('cf-ray')?.split('-')[1]

    return c.json(apiResponse(url.hostname, {
      description: 'REST-style API for this Digital Object',
      version: '1.0.0',
    }, {
      self: `${url.origin}/api`,
      identity: `${url.origin}/.do`,
      collections: `${url.origin}/api/collections`,
      nouns: `${url.origin}/api/nouns`,
      things: `${url.origin}/api/things`,
      actions: `${url.origin}/api/actions`,
      functions: `${url.origin}/api/functions`,
      workflows: `${url.origin}/api/workflows`,
      users: `${url.origin}/api/users`,
      agents: `${url.origin}/api/agents`,
      rpc: `${url.origin}/rpc`,
      mcp: `${url.origin}/mcp`,
    }, colo))
  })

  // GET /api/collections - List collections
  app.get('/api/collections', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('cf-ray')?.split('-')[1]

    // Forward to RPC
    const doId = env.DO.idFromName(url.hostname)
    const stub = env.DO.get(doId)

    try {
      const response = await stub.fetch(new Request(`${url.origin}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'system.schema', args: [] }),
      }))

      const result = await response.json()

      return c.json(apiResponse(url.hostname, result, {
        self: `${url.origin}/api/collections`,
        api: `${url.origin}/api`,
      }, colo))
    } catch {
      return c.json(apiResponse(url.hostname, {
        collections: ['nouns', 'verbs', 'things', 'actions', 'functions', 'workflows', 'events', 'users', 'agents'],
      }, {
        self: `${url.origin}/api/collections`,
        api: `${url.origin}/api`,
      }, colo))
    }
  })

  // GET /api/:collection - List items in collection
  app.get('/api/:collection', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('cf-ray')?.split('-')[1]
    const collection = c.req.param('collection')

    const doId = env.DO.idFromName(url.hostname)
    const stub = env.DO.get(doId)

    try {
      const response = await stub.fetch(new Request(`${url.origin}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: `${collection}.list`, args: [] }),
      }))

      const result = await response.json()

      return c.json(apiResponse(url.hostname, result, {
        self: `${url.origin}/api/${collection}`,
        api: `${url.origin}/api`,
        create: `${url.origin}/api/${collection} (POST)`,
      }, colo))
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: { message: error instanceof Error ? error.message : 'Unknown error' },
        links: { self: `${url.origin}/api/${collection}`, api: `${url.origin}/api` },
        timestamp: Date.now(),
      }, 500)
    }
  })

  // GET /api/:collection/:id - Get single item
  app.get('/api/:collection/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('cf-ray')?.split('-')[1]
    const collection = c.req.param('collection')
    const id = c.req.param('id')

    const doId = env.DO.idFromName(url.hostname)
    const stub = env.DO.get(doId)

    try {
      const response = await stub.fetch(new Request(`${url.origin}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: `${collection}.get`, args: [id] }),
      }))

      const result = await response.json()

      return c.json(apiResponse(url.hostname, result, {
        self: `${url.origin}/api/${collection}/${id}`,
        collection: `${url.origin}/api/${collection}`,
        update: `${url.origin}/api/${collection}/${id} (PUT)`,
        delete: `${url.origin}/api/${collection}/${id} (DELETE)`,
      }, colo))
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: { message: error instanceof Error ? error.message : 'Unknown error' },
        links: { self: `${url.origin}/api/${collection}/${id}`, collection: `${url.origin}/api/${collection}` },
        timestamp: Date.now(),
      }, 404)
    }
  })

  // POST /api/:collection - Create item
  app.post('/api/:collection', async (c) => {
    const url = new URL(c.req.url)
    const collection = c.req.param('collection')
    const body = await c.req.json()

    const doId = env.DO.idFromName(url.hostname)
    const stub = env.DO.get(doId)

    const response = await stub.fetch(new Request(`${url.origin}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `${collection}.create`, args: [body] }),
    }))

    const result = await response.json()
    return c.json(result, 201)
  })

  // PUT /api/:collection/:id - Update item
  app.put('/api/:collection/:id', async (c) => {
    const url = new URL(c.req.url)
    const collection = c.req.param('collection')
    const id = c.req.param('id')
    const body = await c.req.json()

    const doId = env.DO.idFromName(url.hostname)
    const stub = env.DO.get(doId)

    const response = await stub.fetch(new Request(`${url.origin}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `${collection}.update`, args: [id, body] }),
    }))

    const result = await response.json()
    return c.json(result)
  })

  // DELETE /api/:collection/:id - Delete item
  app.delete('/api/:collection/:id', async (c) => {
    const url = new URL(c.req.url)
    const collection = c.req.param('collection')
    const id = c.req.param('id')

    const doId = env.DO.idFromName(url.hostname)
    const stub = env.DO.get(doId)

    await stub.fetch(new Request(`${url.origin}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `${collection}.delete`, args: [id] }),
    }))

    return c.json({ success: true }, 200)
  })

  // ==========================================================================
  // Root Discovery
  // ==========================================================================

  app.get('/', (c) => {
    const url = new URL(c.req.url)
    const ctx = parseHostname(url.hostname)
    const colo = c.req.header('cf-ray')?.split('-')[1]

    return c.json(apiResponse(url.hostname, {
      service: ctx.service,
      subdomain: ctx.subdomain,
      description: 'Digital Object API',
    }, {
      self: url.origin,
      identity: `${url.origin}/.do`,
      api: `${url.origin}/api`,
      rpc: `${url.origin}/rpc`,
      mcp: `${url.origin}/mcp`,
      health: `${url.origin}/_health`,
      docs: 'https://do.md',
    }, colo))
  })

  // ==========================================================================
  // Health Check
  // ==========================================================================

  app.get('/_health', (c) => {
    const colo = c.req.header('cf-ray')?.split('-')[1]
    return c.json({
      status: 'ok',
      timestamp: Date.now(),
      colo: colo || 'unknown',
    })
  })

  // ==========================================================================
  // DO Identity (/.do)
  // ==========================================================================

  app.get('/.do', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('cf-ray')?.split('-')[1]

    // Route to the DO for this hostname
    const doId = env.DO.idFromName(url.hostname)
    const stub = env.DO.get(doId)

    try {
      const response = await stub.fetch(new Request(`${url.origin}/_identity`))
      const identity = await response.json()

      return c.json(apiResponse(url.hostname, identity, {
        self: `${url.origin}/.do`,
        root: url.origin,
        api: `${url.origin}/api`,
        rpc: `${url.origin}/rpc`,
        mcp: `${url.origin}/mcp`,
        collections: `${url.origin}/rpc/do.collections.list`,
        schema: `${url.origin}/rpc/do.system.schema`,
      }, colo))
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: { message: 'Failed to get DO identity' },
        links: { self: `${url.origin}/.do`, root: url.origin },
        timestamp: Date.now(),
      }, 500)
    }
  })

  // ==========================================================================
  // Colo Service (*.colo.do)
  // ==========================================================================

  app.get('/*/cf.json', async (c) => {
    const url = new URL(c.req.url)
    const ctx = parseHostname(url.hostname)
    const colo = c.req.header('cf-ray')?.split('-')[1]

    // Extract the target domain from path
    const target = url.pathname.replace('/cf.json', '').replace(/^\//, '')

    if (ctx.service === 'colo') {
      return c.json(apiResponse(`${ctx.subdomain}.colo.do`, {
        colo: ctx.subdomain,
        target,
        ray: c.req.header('cf-ray'),
        country: c.req.header('cf-ipcountry'),
        city: c.req.header('cf-ipcity'),
      }, {
        self: url.href,
        allColos: 'https://colo.do/all',
        coloInfo: `https://${ctx.subdomain}.colo.do`,
      }, colo))
    }

    return c.json({ error: 'Not a colo service' }, 400)
  })

  // ==========================================================================
  // Catch-All: Route to DO
  // ==========================================================================

  app.all('*', async (c) => {
    const url = new URL(c.req.url)
    const ctx = parseHostname(url.hostname)

    // Database service routes to DO
    if (ctx.service === 'db4') {
      const doId = env.DO.idFromName(`${ctx.subdomain}.db4.ai`)
      const stub = env.DO.get(doId)
      return stub.fetch(c.req.raw)
    }

    // Default: route to DO based on hostname
    const doId = env.DO.idFromName(url.hostname)
    const stub = env.DO.get(doId)
    return stub.fetch(c.req.raw)
  })

  return app
}

// =============================================================================
// Service-Specific Routers
// =============================================================================

/**
 * Colo Service Router
 *
 * Provides Cloudflare datacenter information
 */
export function createColoRouter(env: Env) {
  const app = new Hono<{ Bindings: Env }>()

  app.get('/', (c) => {
    const colo = c.req.header('cf-ray')?.split('-')[1]
    return c.json(apiResponse('colo.do', {
      description: 'Cloudflare Datacenter Information',
    }, {
      allColos: 'https://colo.do/all',
      regions: 'https://colo.do/regions',
      closest: `https://${colo}.colo.do`,
    }, colo))
  })

  app.get('/all', (c) => {
    const colo = c.req.header('cf-ray')?.split('-')[1]
    return c.json(apiResponse('colo.do', {
      colos: ['iad', 'lhr', 'sfo', 'sin', 'syd', 'fra', 'ams', 'nrt'],
    }, {
      self: 'https://colo.do/all',
      iad: 'https://iad.colo.do',
      lhr: 'https://lhr.colo.do',
      sfo: 'https://sfo.colo.do',
    }, colo))
  })

  app.get('/regions', (c) => {
    const colo = c.req.header('cf-ray')?.split('-')[1]
    return c.json(apiResponse('colo.do', {
      regions: {
        wnam: ['iad', 'sfo', 'sea', 'lax', 'den', 'dfw'],
        enam: ['iad', 'ewr', 'mia', 'atl', 'ord'],
        weur: ['lhr', 'ams', 'cdg', 'fra', 'mad'],
        eeur: ['fra', 'waw', 'vie'],
        apac: ['sin', 'hkg', 'nrt', 'icn'],
        oc: ['syd', 'mel'],
      },
    }, {
      self: 'https://colo.do/regions',
      wnam: 'https://colo.do/regions/wnam',
      enam: 'https://colo.do/regions/enam',
    }, colo))
  })

  return app
}

/**
 * Database Service Router
 *
 * DB4.AI - 4 paradigm database
 */
export function createDB4Router(env: Env) {
  const app = new Hono<{ Bindings: Env }>()

  app.get('/', async (c) => {
    const url = new URL(c.req.url)
    const ctx = parseHostname(url.hostname)
    const colo = c.req.header('cf-ray')?.split('-')[1]

    return c.json(apiResponse(`${ctx.subdomain}.db4.ai`, {
      database: ctx.subdomain,
      paradigms: ['relational', 'document', 'graph', 'analytics'],
    }, {
      self: url.origin,
      collections: `${url.origin}/collections`,
      query: `${url.origin}/query`,
      schema: `${url.origin}/schema`,
      rpc: `${url.origin}/rpc`,
      mcp: `${url.origin}/mcp`,
    }, colo))
  })

  app.get('/collections', async (c) => {
    const url = new URL(c.req.url)
    const doId = env.DO.idFromName(url.hostname)
    const stub = env.DO.get(doId)
    return stub.fetch(c.req.raw)
  })

  app.get('/:collection', async (c) => {
    const url = new URL(c.req.url)
    const doId = env.DO.idFromName(url.hostname)
    const stub = env.DO.get(doId)
    return stub.fetch(c.req.raw)
  })

  app.get('/:collection/:id', async (c) => {
    const url = new URL(c.req.url)
    const doId = env.DO.idFromName(url.hostname)
    const stub = env.DO.get(doId)
    return stub.fetch(c.req.raw)
  })

  return app
}
