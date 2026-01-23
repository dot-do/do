/**
 * Verb Collection Routes
 *
 * REST-style API for Verb operations.
 * Verbs define action types with grammatical forms (action, activity, event, reverse, inverse).
 *
 * Standard CRUD:
 * - GET /verbs - List all verbs
 * - GET /verbs/:id - Get a verb by ID
 * - POST /verbs - Create a new verb
 * - PUT /verbs/:id - Update a verb
 * - DELETE /verbs/:id - Delete a verb
 *
 * Verb-specific:
 * - GET /verbs/action/:action - Get verb by action form
 * - GET /verbs/event/:event - Get verb by event form
 * - POST /verbs/register/crud - Register standard CRUD verbs
 * - POST /verbs/register/workflow - Register workflow verbs
 * - GET /verbs/:id/inverse - Get the inverse verb
 */

import { Hono } from 'hono'
import type { Env, DOContext, APIResponse, PaginatedResponse } from '../types'
import type { Verb } from '../../types/collections'

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build API response with links
 */
function apiResponse<T>(api: string, data: T, links: Record<string, string>, colo?: string): APIResponse<T> {
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
async function callDO(stub: DurableObjectStub, method: string, args: unknown[] = []): Promise<unknown> {
  const response = await stub.fetch(
    new Request('https://do/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'rpc', id: `api-${Date.now()}`, method, args }),
    })
  )

  const result = (await response.json()) as { result?: unknown; error?: { message: string } }

  if (result.error) {
    throw new Error(result.error.message)
  }

  return result.result
}

/**
 * Build standard verb links
 */
function buildVerbLinks(url: URL, verb?: Verb): Record<string, string> {
  const links: Record<string, string> = {
    self: verb ? `${url.origin}/api/verbs/${verb.id}` : `${url.origin}/api/verbs`,
    collection: `${url.origin}/api/verbs`,
    api: `${url.origin}/api`,
    registerCrud: `${url.origin}/api/verbs/register/crud (POST)`,
    registerWorkflow: `${url.origin}/api/verbs/register/workflow (POST)`,
  }

  if (verb) {
    links.update = `${url.origin}/api/verbs/${verb.id} (PUT)`
    links.delete = `${url.origin}/api/verbs/${verb.id} (DELETE)`
    links.byAction = `${url.origin}/api/verbs/action/${verb.action}`
    links.byEvent = `${url.origin}/api/verbs/event/${verb.event}`
    if (verb.inverse) {
      links.inverse = `${url.origin}/api/verbs/action/${verb.inverse}`
    }
  }

  return links
}

// =============================================================================
// Verb Routes
// =============================================================================

/**
 * Create Verb CRUD routes
 */
export function createVerbRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: DOContext }>()

  // ==========================================================================
  // List Verbs
  // ==========================================================================

  /**
   * GET /api/verbs - List all verbs with pagination
   */
  router.get('/api/verbs', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    // Parse query params
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const offset = parseInt(url.searchParams.get('offset') || '0', 10)
    const orderBy = url.searchParams.get('orderBy') || 'action'
    const orderDir = (url.searchParams.get('orderDir') as 'asc' | 'desc') || 'asc'

    try {
      const stub = getDOStub(c)
      const result = (await callDO(stub, 'do.verbs.list', [{ limit, offset, orderBy, orderDir }])) as {
        items?: Verb[]
        total?: number
        cursor?: string
        hasMore?: boolean
      }

      const items = result.items || (result as unknown as Verb[])
      const total = result.total || (Array.isArray(items) ? items.length : 0)

      const links: Record<string, string> = {
        self: `${url.origin}/api/verbs`,
        api: `${url.origin}/api`,
        create: `${url.origin}/api/verbs (POST)`,
        registerCrud: `${url.origin}/api/verbs/register/crud (POST)`,
        registerWorkflow: `${url.origin}/api/verbs/register/workflow (POST)`,
      }

      // Add pagination links
      if (offset > 0) {
        links.prev = `${url.origin}/api/verbs?limit=${limit}&offset=${Math.max(0, offset - limit)}`
      }
      if (Array.isArray(items) && items.length === limit) {
        links.next = `${url.origin}/api/verbs?limit=${limit}&offset=${offset + limit}`
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
      } as PaginatedResponse<Verb>)
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'LIST_ERROR',
            message: error instanceof Error ? error.message : 'Failed to list verbs',
          },
          links: { self: `${url.origin}/api/verbs`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Create Verb
  // ==========================================================================

  /**
   * POST /api/verbs - Create a new verb
   */
  router.post('/api/verbs', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    try {
      const body = await c.req.json()
      const stub = getDOStub(c)
      const verb = (await callDO(stub, 'do.verbs.create', [body])) as Verb

      return c.json(apiResponse(url.hostname, verb, buildVerbLinks(url, verb), colo), 201)
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'CREATE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to create verb',
          },
          links: { self: `${url.origin}/api/verbs`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // Register Standard Verbs
  // ==========================================================================

  /**
   * POST /api/verbs/register/crud - Register standard CRUD verbs
   */
  router.post('/api/verbs/register/crud', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    try {
      const stub = getDOStub(c)
      const verbs = (await callDO(stub, 'do.verbs.registerCrudVerbs', [])) as Verb[]

      return c.json(
        apiResponse(
          url.hostname,
          { registered: verbs, count: verbs.length },
          {
            self: `${url.origin}/api/verbs/register/crud`,
            collection: `${url.origin}/api/verbs`,
            api: `${url.origin}/api`,
          },
          colo
        ),
        201
      )
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'REGISTER_ERROR',
            message: error instanceof Error ? error.message : 'Failed to register CRUD verbs',
          },
          links: { self: `${url.origin}/api/verbs/register/crud`, collection: `${url.origin}/api/verbs` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  /**
   * POST /api/verbs/register/workflow - Register workflow verbs
   */
  router.post('/api/verbs/register/workflow', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    try {
      const stub = getDOStub(c)
      const verbs = (await callDO(stub, 'do.verbs.registerWorkflowVerbs', [])) as Verb[]

      return c.json(
        apiResponse(
          url.hostname,
          { registered: verbs, count: verbs.length },
          {
            self: `${url.origin}/api/verbs/register/workflow`,
            collection: `${url.origin}/api/verbs`,
            api: `${url.origin}/api`,
          },
          colo
        ),
        201
      )
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'REGISTER_ERROR',
            message: error instanceof Error ? error.message : 'Failed to register workflow verbs',
          },
          links: { self: `${url.origin}/api/verbs/register/workflow`, collection: `${url.origin}/api/verbs` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // Get Verb by Action Form
  // ==========================================================================

  /**
   * GET /api/verbs/action/:action - Get verb by action form
   */
  router.get('/api/verbs/action/:action', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const action = c.req.param('action')

    try {
      const stub = getDOStub(c)
      const verb = (await callDO(stub, 'do.verbs.getByAction', [action])) as Verb | null

      if (!verb) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'NOT_FOUND',
              message: `Verb with action '${action}' not found`,
            },
            links: {
              collection: `${url.origin}/api/verbs`,
              api: `${url.origin}/api`,
            },
            timestamp: Date.now(),
          },
          404
        )
      }

      return c.json(apiResponse(url.hostname, verb, buildVerbLinks(url, verb), colo))
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'GET_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get verb by action',
          },
          links: { collection: `${url.origin}/api/verbs`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Get Verb by Event Form
  // ==========================================================================

  /**
   * GET /api/verbs/event/:event - Get verb by event form
   */
  router.get('/api/verbs/event/:event', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const event = c.req.param('event')

    try {
      const stub = getDOStub(c)
      const verb = (await callDO(stub, 'do.verbs.getByEvent', [event])) as Verb | null

      if (!verb) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'NOT_FOUND',
              message: `Verb with event '${event}' not found`,
            },
            links: {
              collection: `${url.origin}/api/verbs`,
              api: `${url.origin}/api`,
            },
            timestamp: Date.now(),
          },
          404
        )
      }

      return c.json(apiResponse(url.hostname, verb, buildVerbLinks(url, verb), colo))
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'GET_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get verb by event',
          },
          links: { collection: `${url.origin}/api/verbs`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Get Verb by ID
  // ==========================================================================

  /**
   * GET /api/verbs/:id - Get a single verb by ID
   */
  router.get('/api/verbs/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)
      const verb = (await callDO(stub, 'do.verbs.get', [id])) as Verb | null

      if (!verb) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'NOT_FOUND',
              message: `Verb not found: ${id}`,
            },
            links: {
              collection: `${url.origin}/api/verbs`,
              api: `${url.origin}/api`,
            },
            timestamp: Date.now(),
          },
          404
        )
      }

      return c.json(apiResponse(url.hostname, verb, buildVerbLinks(url, verb), colo))
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'GET_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get verb',
          },
          links: { collection: `${url.origin}/api/verbs`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Get Inverse Verb
  // ==========================================================================

  /**
   * GET /api/verbs/:id/inverse - Get the inverse verb for a given verb
   */
  router.get('/api/verbs/:id/inverse', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)

      // First get the verb to find its action
      const verb = (await callDO(stub, 'do.verbs.get', [id])) as Verb | null

      if (!verb) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'NOT_FOUND',
              message: `Verb not found: ${id}`,
            },
            links: {
              collection: `${url.origin}/api/verbs`,
              api: `${url.origin}/api`,
            },
            timestamp: Date.now(),
          },
          404
        )
      }

      // Get the inverse verb
      const inverse = (await callDO(stub, 'do.verbs.getInverse', [verb.action])) as Verb | null

      if (!inverse) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'NOT_FOUND',
              message: `No inverse defined for verb '${verb.action}'`,
            },
            links: {
              verb: `${url.origin}/api/verbs/${id}`,
              collection: `${url.origin}/api/verbs`,
              api: `${url.origin}/api`,
            },
            timestamp: Date.now(),
          },
          404
        )
      }

      return c.json(apiResponse(url.hostname, inverse, buildVerbLinks(url, inverse), colo))
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'GET_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get inverse verb',
          },
          links: { collection: `${url.origin}/api/verbs`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Update Verb
  // ==========================================================================

  /**
   * PUT /api/verbs/:id - Update a verb
   */
  router.put('/api/verbs/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const body = await c.req.json()
      const stub = getDOStub(c)
      const verb = (await callDO(stub, 'do.verbs.update', [id, body])) as Verb

      return c.json(apiResponse(url.hostname, verb, buildVerbLinks(url, verb), colo))
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'UPDATE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to update verb',
          },
          links: { self: `${url.origin}/api/verbs/${id}`, collection: `${url.origin}/api/verbs` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  /**
   * PATCH /api/verbs/:id - Partial update a verb
   */
  router.patch('/api/verbs/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const body = await c.req.json()
      const stub = getDOStub(c)
      const verb = (await callDO(stub, 'do.verbs.update', [id, body])) as Verb

      return c.json(apiResponse(url.hostname, verb, buildVerbLinks(url, verb), colo))
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'UPDATE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to update verb',
          },
          links: { self: `${url.origin}/api/verbs/${id}`, collection: `${url.origin}/api/verbs` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // Delete Verb
  // ==========================================================================

  /**
   * DELETE /api/verbs/:id - Delete a verb
   */
  router.delete('/api/verbs/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)
      await callDO(stub, 'do.verbs.delete', [id])

      return c.json(
        apiResponse(
          url.hostname,
          { deleted: true, id },
          {
            collection: `${url.origin}/api/verbs`,
            api: `${url.origin}/api`,
          },
          colo
        )
      )
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'DELETE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to delete verb',
          },
          links: { self: `${url.origin}/api/verbs/${id}`, collection: `${url.origin}/api/verbs` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  return router
}

// =============================================================================
// Export
// =============================================================================

export default createVerbRoutes
