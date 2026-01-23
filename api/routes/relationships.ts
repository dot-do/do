/**
 * Relationships Routes - CRUD API for the Relationships collection
 *
 * Provides REST-style endpoints for managing graph-style relationships
 * between Things in a Digital Object. Includes a special traverse endpoint
 * for graph traversal.
 *
 * @module api/routes/relationships
 *
 * Endpoints:
 * - GET /api/relationships - List all relationships (with pagination)
 * - GET /api/relationships/:id - Get a relationship by ID
 * - POST /api/relationships - Create a new relationship
 * - PUT /api/relationships/:id - Update a relationship
 * - DELETE /api/relationships/:id - Delete a relationship
 * - POST /api/relationships/traverse - Traverse relationships (graph traversal)
 */

import { Hono } from 'hono'
import type { Env, DOContext, APIResponse, PaginatedResponse } from '../types'

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

// =============================================================================
// Relationships Routes
// =============================================================================

/**
 * Create relationships routes
 *
 * @returns Hono router with relationships endpoints
 */
export function createRelationshipsRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: DOContext }>()

  // ==========================================================================
  // List Relationships
  // ==========================================================================

  /**
   * GET /api/relationships - List all relationships
   *
   * Query params:
   * - limit: Number of items per page (default: 50)
   * - offset: Starting index (default: 0)
   * - orderBy: Field to sort by
   * - orderDir: Sort direction (asc/desc)
   * - from: Filter by source entity ID
   * - to: Filter by target entity ID
   * - type: Filter by relationship type
   */
  router.get('/api/relationships', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    // Parse query params
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const offset = parseInt(url.searchParams.get('offset') || '0', 10)
    const orderBy = url.searchParams.get('orderBy') || undefined
    const orderDir = (url.searchParams.get('orderDir') as 'asc' | 'desc') || undefined
    const from = url.searchParams.get('from') || undefined
    const to = url.searchParams.get('to') || undefined
    const type = url.searchParams.get('type') || undefined

    try {
      const stub = getDOStub(c)
      const result = (await callDO(stub, 'do.relationships.list', [{ limit, offset, orderBy, orderDir, from, to, type }])) as {
        items?: unknown[]
        total?: number
        cursor?: string
      }

      const items = result.items || result
      const total = result.total || (Array.isArray(items) ? items.length : 0)

      const links: Record<string, string> = {
        self: `${url.origin}/api/relationships`,
        api: `${url.origin}/api`,
        create: `${url.origin}/api/relationships (POST)`,
        traverse: `${url.origin}/api/relationships/traverse (POST)`,
      }

      // Add pagination links
      if (offset > 0) {
        links.prev = `${url.origin}/api/relationships?limit=${limit}&offset=${Math.max(0, offset - limit)}`
      }
      if (Array.isArray(items) && items.length === limit) {
        links.next = `${url.origin}/api/relationships?limit=${limit}&offset=${offset + limit}`
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
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'LIST_ERROR',
            message: error instanceof Error ? error.message : 'Failed to list relationships',
          },
          links: { self: `${url.origin}/api/relationships`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Get Relationship by ID
  // ==========================================================================

  /**
   * GET /api/relationships/:id - Get a relationship by ID
   */
  router.get('/api/relationships/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)
      const result = await callDO(stub, 'do.relationships.get', [id])

      if (!result) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'NOT_FOUND',
              message: `Relationship not found: ${id}`,
            },
            links: { collection: `${url.origin}/api/relationships`, api: `${url.origin}/api` },
            timestamp: Date.now(),
          },
          404
        )
      }

      return c.json(
        apiResponse(
          url.hostname,
          result,
          {
            self: `${url.origin}/api/relationships/${id}`,
            collection: `${url.origin}/api/relationships`,
            update: `${url.origin}/api/relationships/${id} (PUT)`,
            delete: `${url.origin}/api/relationships/${id} (DELETE)`,
          },
          colo
        )
      )
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'GET_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get relationship',
          },
          links: { collection: `${url.origin}/api/relationships`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Create Relationship
  // ==========================================================================

  /**
   * POST /api/relationships - Create a new relationship
   *
   * Request body:
   * {
   *   from: string,   // Source entity ID
   *   to: string,     // Target entity ID
   *   type: string,   // Relationship type
   *   data?: object   // Additional metadata
   * }
   */
  router.post('/api/relationships', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    try {
      const body = await c.req.json()
      const stub = getDOStub(c)
      const result = await callDO(stub, 'do.relationships.create', [body])

      const id = (result as { id?: string })?.id || 'unknown'

      return c.json(
        apiResponse(
          url.hostname,
          result,
          {
            self: `${url.origin}/api/relationships/${id}`,
            collection: `${url.origin}/api/relationships`,
            update: `${url.origin}/api/relationships/${id} (PUT)`,
            delete: `${url.origin}/api/relationships/${id} (DELETE)`,
            traverse: `${url.origin}/api/relationships/traverse (POST)`,
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
            code: 'CREATE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to create relationship',
          },
          links: { self: `${url.origin}/api/relationships`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // Update Relationship
  // ==========================================================================

  /**
   * PUT /api/relationships/:id - Update a relationship
   *
   * Request body:
   * {
   *   type?: string,  // Relationship type
   *   data?: object   // Additional metadata
   * }
   */
  router.put('/api/relationships/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const body = await c.req.json()
      const stub = getDOStub(c)
      const result = await callDO(stub, 'do.relationships.update', [id, body])

      return c.json(
        apiResponse(
          url.hostname,
          result,
          {
            self: `${url.origin}/api/relationships/${id}`,
            collection: `${url.origin}/api/relationships`,
            delete: `${url.origin}/api/relationships/${id} (DELETE)`,
          },
          colo
        )
      )
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'UPDATE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to update relationship',
          },
          links: { self: `${url.origin}/api/relationships/${id}`, collection: `${url.origin}/api/relationships` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // Delete Relationship
  // ==========================================================================

  /**
   * DELETE /api/relationships/:id - Delete a relationship
   */
  router.delete('/api/relationships/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)
      await callDO(stub, 'do.relationships.delete', [id])

      return c.json(
        apiResponse(
          url.hostname,
          { deleted: true, id },
          {
            collection: `${url.origin}/api/relationships`,
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
            message: error instanceof Error ? error.message : 'Failed to delete relationship',
          },
          links: { self: `${url.origin}/api/relationships/${id}`, collection: `${url.origin}/api/relationships` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // Traverse Relationships (Special Endpoint)
  // ==========================================================================

  /**
   * POST /api/relationships/traverse - Traverse relationships graph
   *
   * Performs graph traversal from a starting node following relationships.
   *
   * Request body:
   * {
   *   from: string,           // Starting node ID
   *   type?: string,          // Relationship type to follow (optional)
   *   direction?: 'outgoing' | 'incoming' | 'both', // Traversal direction (default: 'both')
   *   depth?: number,         // Maximum depth (default: 1)
   *   filter?: FilterExpression, // Filter for target nodes (optional)
   *   limit?: number          // Maximum results (optional)
   * }
   *
   * Response:
   * {
   *   nodes: Array<{ id: string, depth: number, data?: unknown }>,
   *   edges: Relationship[],
   *   visited: number
   * }
   */
  router.post('/api/relationships/traverse', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    try {
      const body = await c.req.json()

      // Validate required fields
      if (!body.from) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Missing required field: from',
            },
            links: { self: `${url.origin}/api/relationships/traverse`, collection: `${url.origin}/api/relationships` },
            timestamp: Date.now(),
          },
          400
        )
      }

      const stub = getDOStub(c)
      const result = await callDO(stub, 'do.relationships.traverse', [body])

      return c.json(
        apiResponse(
          url.hostname,
          result,
          {
            self: `${url.origin}/api/relationships/traverse`,
            collection: `${url.origin}/api/relationships`,
            api: `${url.origin}/api`,
            from: `${url.origin}/api/things/${body.from}`,
          },
          colo
        )
      )
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'TRAVERSE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to traverse relationships',
          },
          links: { self: `${url.origin}/api/relationships/traverse`, collection: `${url.origin}/api/relationships` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  return router
}

// =============================================================================
// Export
// =============================================================================

export default createRelationshipsRoutes
