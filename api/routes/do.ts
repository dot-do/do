/**
 * Digital Object CRUD Routes
 *
 * REST-style API for Digital Object operations.
 * All routes return clickable links for API discovery.
 */

import { Hono } from 'hono'
import type { Env, DOContext, APIResponse, PaginatedResponse } from '../types'

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build API response with links
 */
function apiResponse<T>(
  api: string,
  data: T,
  links: Record<string, string>,
  colo?: string
): APIResponse<T> {
  return {
    api,
    data,
    links,
    colo,
    timestamp: Date.now(),
  }
}

/**
 * Get DO stub for the current hostname
 */
function getDOStub(c: { env: Env; req: { url: string } }) {
  const url = new URL(c.req.url)
  const doId = c.env.DO.idFromName(url.hostname)
  return c.env.DO.get(doId)
}

/**
 * Call DO via RPC
 */
async function callDO(
  stub: DurableObjectStub,
  method: string,
  args: unknown[] = []
): Promise<unknown> {
  const response = await stub.fetch(new Request('https://do/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'rpc', id: `api-${Date.now()}`, method, args }),
  }))

  const result = await response.json() as { result?: unknown; error?: { message: string } }

  if (result.error) {
    throw new Error(result.error.message)
  }

  return result.result
}

// =============================================================================
// DO Routes
// =============================================================================

/**
 * Create DO CRUD routes
 */
export function createDORoutes() {
  const router = new Hono<{ Bindings: Env; Variables: DOContext }>()

  // ==========================================================================
  // DO Identity (/.do)
  // ==========================================================================

  /**
   * GET /.do - Get DO identity
   */
  router.get('/.do', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    try {
      const stub = getDOStub(c)
      const identity = await callDO(stub, 'do.identity.get')

      return c.json(apiResponse(url.hostname, identity, {
        self: `${url.origin}/.do`,
        root: url.origin,
        api: `${url.origin}/api`,
        rpc: `${url.origin}/rpc`,
        mcp: `${url.origin}/mcp`,
        collections: `${url.origin}/api/collections`,
        schema: `${url.origin}/rpc/do.system.schema`,
      }, colo))
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'DO_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get DO identity',
        },
        links: { self: `${url.origin}/.do`, root: url.origin },
        timestamp: Date.now(),
      }, 500)
    }
  })

  // ==========================================================================
  // API Discovery
  // ==========================================================================

  /**
   * GET /api - API discovery
   */
  router.get('/api', (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    return c.json(apiResponse(url.hostname, {
      description: 'REST-style API for this Digital Object',
      version: '1.0.0',
    }, {
      self: `${url.origin}/api`,
      identity: `${url.origin}/.do`,
      collections: `${url.origin}/api/collections`,
      nouns: `${url.origin}/api/nouns`,
      verbs: `${url.origin}/api/verbs`,
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

  /**
   * GET /api/collections - List all collections
   */
  router.get('/api/collections', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    const collections = [
      { name: 'nouns', description: 'Entity type definitions' },
      { name: 'verbs', description: 'Action type definitions with grammatical forms' },
      { name: 'things', description: 'Instances of nouns' },
      { name: 'actions', description: 'Durable action instances' },
      { name: 'relationships', description: 'Connections between things' },
      { name: 'functions', description: 'Executable functions' },
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
      self: `${url.origin}/api/collections`,
      api: `${url.origin}/api`,
    }

    for (const col of collections) {
      links[col.name] = `${url.origin}/api/${col.name}`
    }

    return c.json(apiResponse(url.hostname, { collections }, links, colo))
  })

  // ==========================================================================
  // Collection CRUD
  // ==========================================================================

  /**
   * GET /api/:collection - List items in a collection
   */
  router.get('/api/:collection', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const collection = c.req.param('collection')

    // Parse query params
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const offset = parseInt(url.searchParams.get('offset') || '0', 10)
    const orderBy = url.searchParams.get('orderBy') || undefined
    const orderDir = url.searchParams.get('orderDir') as 'asc' | 'desc' | undefined

    try {
      const stub = getDOStub(c)
      const result = await callDO(stub, `do.${collection}.list`, [{ limit, offset, orderBy, orderDir }]) as {
        items?: unknown[]
        total?: number
        cursor?: string
      }

      const items = result.items || result
      const total = result.total || (Array.isArray(items) ? items.length : 0)

      const links: Record<string, string> = {
        self: `${url.origin}/api/${collection}`,
        api: `${url.origin}/api`,
        create: `${url.origin}/api/${collection} (POST)`,
      }

      // Add pagination links
      if (offset > 0) {
        links.prev = `${url.origin}/api/${collection}?limit=${limit}&offset=${Math.max(0, offset - limit)}`
      }
      if (Array.isArray(items) && items.length === limit) {
        links.next = `${url.origin}/api/${collection}?limit=${limit}&offset=${offset + limit}`
      }

      return c.json({
        api: url.hostname,
        data: items,
        pagination: {
          total,
          page: Math.floor(offset / limit) + 1,
          pageSize: limit,
          totalPages: Math.ceil(total / limit),
          hasMore: Array.isArray(items) && items.length === limit,
        },
        links,
        colo,
        timestamp: Date.now(),
      } as PaginatedResponse<unknown>)
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'LIST_ERROR',
          message: error instanceof Error ? error.message : `Failed to list ${collection}`,
        },
        links: { self: `${url.origin}/api/${collection}`, api: `${url.origin}/api` },
        timestamp: Date.now(),
      }, 500)
    }
  })

  /**
   * POST /api/:collection - Create item
   */
  router.post('/api/:collection', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const collection = c.req.param('collection')

    try {
      const body = await c.req.json()
      const stub = getDOStub(c)
      const result = await callDO(stub, `do.${collection}.create`, [body])

      const id = (result as { id?: string })?.id || 'unknown'

      return c.json(apiResponse(url.hostname, result, {
        self: `${url.origin}/api/${collection}/${id}`,
        collection: `${url.origin}/api/${collection}`,
        update: `${url.origin}/api/${collection}/${id} (PUT)`,
        delete: `${url.origin}/api/${collection}/${id} (DELETE)`,
      }, colo), 201)
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'CREATE_ERROR',
          message: error instanceof Error ? error.message : `Failed to create ${collection} item`,
        },
        links: { self: `${url.origin}/api/${collection}`, api: `${url.origin}/api` },
        timestamp: Date.now(),
      }, 400)
    }
  })

  /**
   * GET /api/:collection/:id - Get single item
   */
  router.get('/api/:collection/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const collection = c.req.param('collection')
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)
      const result = await callDO(stub, `do.${collection}.get`, [id])

      if (!result) {
        return c.json({
          api: url.hostname,
          error: {
            code: 'NOT_FOUND',
            message: `${collection} item not found: ${id}`,
          },
          links: { collection: `${url.origin}/api/${collection}`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        }, 404)
      }

      return c.json(apiResponse(url.hostname, result, {
        self: `${url.origin}/api/${collection}/${id}`,
        collection: `${url.origin}/api/${collection}`,
        update: `${url.origin}/api/${collection}/${id} (PUT)`,
        delete: `${url.origin}/api/${collection}/${id} (DELETE)`,
      }, colo))
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'GET_ERROR',
          message: error instanceof Error ? error.message : `Failed to get ${collection} item`,
        },
        links: { collection: `${url.origin}/api/${collection}`, api: `${url.origin}/api` },
        timestamp: Date.now(),
      }, 500)
    }
  })

  /**
   * PUT /api/:collection/:id - Update item
   */
  router.put('/api/:collection/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const collection = c.req.param('collection')
    const id = c.req.param('id')

    try {
      const body = await c.req.json()
      const stub = getDOStub(c)
      const result = await callDO(stub, `do.${collection}.update`, [id, body])

      return c.json(apiResponse(url.hostname, result, {
        self: `${url.origin}/api/${collection}/${id}`,
        collection: `${url.origin}/api/${collection}`,
        delete: `${url.origin}/api/${collection}/${id} (DELETE)`,
      }, colo))
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'UPDATE_ERROR',
          message: error instanceof Error ? error.message : `Failed to update ${collection} item`,
        },
        links: { self: `${url.origin}/api/${collection}/${id}`, collection: `${url.origin}/api/${collection}` },
        timestamp: Date.now(),
      }, 400)
    }
  })

  /**
   * PATCH /api/:collection/:id - Partial update item
   */
  router.patch('/api/:collection/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const collection = c.req.param('collection')
    const id = c.req.param('id')

    try {
      const body = await c.req.json()
      const stub = getDOStub(c)
      const result = await callDO(stub, `do.${collection}.update`, [id, body])

      return c.json(apiResponse(url.hostname, result, {
        self: `${url.origin}/api/${collection}/${id}`,
        collection: `${url.origin}/api/${collection}`,
      }, colo))
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'UPDATE_ERROR',
          message: error instanceof Error ? error.message : `Failed to update ${collection} item`,
        },
        links: { self: `${url.origin}/api/${collection}/${id}`, collection: `${url.origin}/api/${collection}` },
        timestamp: Date.now(),
      }, 400)
    }
  })

  /**
   * DELETE /api/:collection/:id - Delete item
   */
  router.delete('/api/:collection/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const collection = c.req.param('collection')
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)
      await callDO(stub, `do.${collection}.delete`, [id])

      return c.json(apiResponse(url.hostname, { deleted: true, id }, {
        collection: `${url.origin}/api/${collection}`,
        api: `${url.origin}/api`,
      }, colo))
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'DELETE_ERROR',
          message: error instanceof Error ? error.message : `Failed to delete ${collection} item`,
        },
        links: { self: `${url.origin}/api/${collection}/${id}`, collection: `${url.origin}/api/${collection}` },
        timestamp: Date.now(),
      }, 400)
    }
  })

  // ==========================================================================
  // Special Operations
  // ==========================================================================

  /**
   * POST /api/actions/:id/execute - Execute an action
   */
  router.post('/api/actions/:id/execute', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)
      const result = await callDO(stub, 'do.actions.execute', [id])

      return c.json(apiResponse(url.hostname, result, {
        self: `${url.origin}/api/actions/${id}`,
        actions: `${url.origin}/api/actions`,
      }, colo))
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'EXECUTE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to execute action',
        },
        links: { self: `${url.origin}/api/actions/${id}`, actions: `${url.origin}/api/actions` },
        timestamp: Date.now(),
      }, 400)
    }
  })

  /**
   * POST /api/functions/:id/invoke - Invoke a function
   */
  router.post('/api/functions/:id/invoke', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const body = await c.req.json().catch(() => ({}))
      const stub = getDOStub(c)
      const result = await callDO(stub, 'do.functions.invoke', [id, body])

      return c.json(apiResponse(url.hostname, result, {
        self: `${url.origin}/api/functions/${id}`,
        functions: `${url.origin}/api/functions`,
      }, colo))
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'INVOKE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to invoke function',
        },
        links: { self: `${url.origin}/api/functions/${id}`, functions: `${url.origin}/api/functions` },
        timestamp: Date.now(),
      }, 400)
    }
  })

  /**
   * POST /api/workflows/:id/start - Start a workflow
   */
  router.post('/api/workflows/:id/start', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const body = await c.req.json().catch(() => ({}))
      const stub = getDOStub(c)
      const result = await callDO(stub, 'do.workflows.start', [id, body])

      return c.json(apiResponse(url.hostname, result, {
        self: `${url.origin}/api/workflows/${id}`,
        workflows: `${url.origin}/api/workflows`,
      }, colo))
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'START_ERROR',
          message: error instanceof Error ? error.message : 'Failed to start workflow',
        },
        links: { self: `${url.origin}/api/workflows/${id}`, workflows: `${url.origin}/api/workflows` },
        timestamp: Date.now(),
      }, 400)
    }
  })

  return router
}

// =============================================================================
// Export
// =============================================================================

export default createDORoutes
