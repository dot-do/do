/**
 * Things Collection Routes
 *
 * CRUD API for Things collection with support for:
 * - Expanded and Compact formats
 * - Type (noun) filtering
 * - $ref filtering (things that are also their own DO)
 * - Format conversion
 *
 * @module api/routes/things
 */

import { Hono } from 'hono'
import type { Env, DOContext, APIResponse, PaginatedResponse, PaginationInfo } from '../types'

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
// Things Routes
// =============================================================================

/**
 * Create Things collection routes
 *
 * Provides CRUD operations with Things-specific features:
 * - Expanded/Compact format support
 * - Type-based filtering
 * - $ref-based filtering
 */
export function createThingsRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: DOContext }>()

  // ==========================================================================
  // Things Discovery
  // ==========================================================================

  /**
   * GET /api/things - List all things with pagination and filtering
   *
   * Query params:
   * - limit: Number of items (default: 50)
   * - offset: Pagination offset (default: 0)
   * - type: Filter by noun type
   * - hasRef: Filter things that have a $ref (boolean)
   * - format: Response format ('expanded' | 'compact', default: as-stored)
   * - orderBy: Sort field
   * - orderDir: Sort direction ('asc' | 'desc')
   */
  router.get('/api/things', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    // Parse query params
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const offset = parseInt(url.searchParams.get('offset') || '0', 10)
    const type = url.searchParams.get('type') || undefined
    const hasRef = url.searchParams.get('hasRef')
    const format = url.searchParams.get('format') as 'expanded' | 'compact' | null
    const orderBy = url.searchParams.get('orderBy') || undefined
    const orderDir = url.searchParams.get('orderDir') as 'asc' | 'desc' | undefined

    try {
      const stub = getDOStub(c)
      let items: unknown[]
      let total: number

      // Use specialized methods based on filters
      if (type) {
        items = (await callDO(stub, 'do.things.findByType', [type, { limit, offset, orderBy, orderDir }])) as unknown[]
        total = items.length
      } else if (hasRef === 'true') {
        items = (await callDO(stub, 'do.things.findWithRefs', [])) as unknown[]
        total = items.length
      } else {
        const result = (await callDO(stub, 'do.things.list', [{ limit, offset, orderBy, orderDir }])) as {
          items?: unknown[]
          total?: number
        }
        items = result.items || (result as unknown as unknown[])
        total = result.total || (Array.isArray(items) ? items.length : 0)
      }

      // Convert format if requested
      if (format && Array.isArray(items)) {
        const convertMethod = format === 'expanded' ? 'do.things.toExpanded' : 'do.things.toCompact'
        items = await Promise.all(items.map((item) => callDO(stub, convertMethod, [item])))
      }

      const pagination: PaginationInfo = {
        total,
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
        hasMore: Array.isArray(items) && items.length === limit,
      }

      // Build links
      const links: Record<string, string> = {
        self: `${url.origin}/api/things`,
        api: `${url.origin}/api`,
        create: `${url.origin}/api/things (POST)`,
        types: `${url.origin}/api/things/types`,
        withRefs: `${url.origin}/api/things?hasRef=true`,
      }

      // Add pagination links
      if (offset > 0) {
        links.prev = `${url.origin}/api/things?limit=${limit}&offset=${Math.max(0, offset - limit)}`
      }
      if (pagination.hasMore) {
        links.next = `${url.origin}/api/things?limit=${limit}&offset=${offset + limit}`
      }

      // Add type filter link if filtering
      if (type) {
        links.filtered = `${url.origin}/api/things?type=${type}`
      }

      return c.json(
        {
          api: url.hostname,
          data: items,
          pagination,
          links,
          colo,
          timestamp: Date.now(),
        } as PaginatedResponse<unknown>,
        200
      )
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'LIST_ERROR',
            message: error instanceof Error ? error.message : 'Failed to list things',
          },
          links: { self: `${url.origin}/api/things`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Get Thing Types
  // ==========================================================================

  /**
   * GET /api/things/types - Get all unique thing types (nouns) used
   */
  router.get('/api/things/types', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    try {
      const stub = getDOStub(c)
      const types = (await callDO(stub, 'do.things.getTypes', [])) as string[]

      return c.json(
        apiResponse(
          url.hostname,
          { types },
          {
            self: `${url.origin}/api/things/types`,
            things: `${url.origin}/api/things`,
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
            code: 'TYPES_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get thing types',
          },
          links: { self: `${url.origin}/api/things/types`, things: `${url.origin}/api/things` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Count by Type
  // ==========================================================================

  /**
   * GET /api/things/counts - Get count of things by type
   */
  router.get('/api/things/counts', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    try {
      const stub = getDOStub(c)
      const counts = (await callDO(stub, 'do.things.countByType', [])) as Record<string, number>

      return c.json(
        apiResponse(
          url.hostname,
          { counts, total: Object.values(counts).reduce((a, b) => a + b, 0) },
          {
            self: `${url.origin}/api/things/counts`,
            things: `${url.origin}/api/things`,
            types: `${url.origin}/api/things/types`,
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
            code: 'COUNT_ERROR',
            message: error instanceof Error ? error.message : 'Failed to count things by type',
          },
          links: { self: `${url.origin}/api/things/counts`, things: `${url.origin}/api/things` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Create Thing
  // ==========================================================================

  /**
   * POST /api/things - Create a new thing
   *
   * Accepts both expanded and compact formats:
   *
   * Expanded format:
   * {
   *   "$type": "Customer",
   *   "name": "Acme Corp",
   *   "email": "contact@acme.com"
   * }
   *
   * Compact format:
   * {
   *   "type": "Customer",
   *   "data": { "name": "Acme Corp", "email": "contact@acme.com" }
   * }
   */
  router.post('/api/things', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    try {
      const body = await c.req.json()
      const stub = getDOStub(c)

      // Auto-detect format and use appropriate create method
      let result: unknown
      if ('$type' in body) {
        // Expanded format
        result = await callDO(stub, 'do.things.createExpanded', [body])
      } else if ('type' in body && 'data' in body) {
        // Compact format
        result = await callDO(stub, 'do.things.createCompact', [body])
      } else {
        // Generic create (let collection decide)
        result = await callDO(stub, 'do.things.create', [body])
      }

      const id = (result as { id?: string; $id?: string })?.id || (result as { $id?: string })?.$id || 'unknown'

      return c.json(
        apiResponse(
          url.hostname,
          result,
          {
            self: `${url.origin}/api/things/${id}`,
            collection: `${url.origin}/api/things`,
            update: `${url.origin}/api/things/${id} (PUT)`,
            delete: `${url.origin}/api/things/${id} (DELETE)`,
            expanded: `${url.origin}/api/things/${id}?format=expanded`,
            compact: `${url.origin}/api/things/${id}?format=compact`,
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
            message: error instanceof Error ? error.message : 'Failed to create thing',
          },
          links: { self: `${url.origin}/api/things`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // Get Thing by ID
  // ==========================================================================

  /**
   * GET /api/things/:id - Get a thing by ID
   *
   * Query params:
   * - format: Response format ('expanded' | 'compact')
   */
  router.get('/api/things/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')
    const format = url.searchParams.get('format') as 'expanded' | 'compact' | null

    try {
      const stub = getDOStub(c)
      let result: unknown

      // Use format-specific get if requested
      if (format === 'expanded') {
        result = await callDO(stub, 'do.things.getExpanded', [id])
      } else if (format === 'compact') {
        result = await callDO(stub, 'do.things.getCompact', [id])
      } else {
        result = await callDO(stub, 'do.things.get', [id])
      }

      if (!result) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'NOT_FOUND',
              message: `Thing not found: ${id}`,
            },
            links: { collection: `${url.origin}/api/things`, api: `${url.origin}/api` },
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
            self: `${url.origin}/api/things/${id}`,
            collection: `${url.origin}/api/things`,
            update: `${url.origin}/api/things/${id} (PUT)`,
            delete: `${url.origin}/api/things/${id} (DELETE)`,
            expanded: `${url.origin}/api/things/${id}?format=expanded`,
            compact: `${url.origin}/api/things/${id}?format=compact`,
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
            message: error instanceof Error ? error.message : 'Failed to get thing',
          },
          links: { collection: `${url.origin}/api/things`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Get Thing by $ref
  // ==========================================================================

  /**
   * GET /api/things/ref/:ref - Get a thing by its $ref URL
   */
  router.get('/api/things/ref/*', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    // Extract ref from path (everything after /api/things/ref/)
    const ref = url.pathname.replace('/api/things/ref/', '')

    try {
      const stub = getDOStub(c)
      const result = await callDO(stub, 'do.things.getByRef', [ref])

      if (!result) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'NOT_FOUND',
              message: `Thing with ref not found: ${ref}`,
            },
            links: { collection: `${url.origin}/api/things`, withRefs: `${url.origin}/api/things?hasRef=true` },
            timestamp: Date.now(),
          },
          404
        )
      }

      const id = (result as { id?: string; $id?: string })?.id || (result as { $id?: string })?.$id || 'unknown'

      return c.json(
        apiResponse(
          url.hostname,
          result,
          {
            self: `${url.origin}/api/things/${id}`,
            collection: `${url.origin}/api/things`,
            withRefs: `${url.origin}/api/things?hasRef=true`,
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
            message: error instanceof Error ? error.message : 'Failed to get thing by ref',
          },
          links: { collection: `${url.origin}/api/things`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Update Thing
  // ==========================================================================

  /**
   * PUT /api/things/:id - Update a thing
   */
  router.put('/api/things/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const body = await c.req.json()
      const stub = getDOStub(c)
      const result = await callDO(stub, 'do.things.update', [id, body])

      return c.json(
        apiResponse(
          url.hostname,
          result,
          {
            self: `${url.origin}/api/things/${id}`,
            collection: `${url.origin}/api/things`,
            delete: `${url.origin}/api/things/${id} (DELETE)`,
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
            message: error instanceof Error ? error.message : 'Failed to update thing',
          },
          links: { self: `${url.origin}/api/things/${id}`, collection: `${url.origin}/api/things` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // Set/Remove $ref
  // ==========================================================================

  /**
   * PUT /api/things/:id/ref - Set the $ref for a thing
   */
  router.put('/api/things/:id/ref', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const body = (await c.req.json()) as { ref: string }
      if (!body.ref) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'INVALID_REQUEST',
              message: 'ref field is required',
            },
            links: { self: `${url.origin}/api/things/${id}/ref`, thing: `${url.origin}/api/things/${id}` },
            timestamp: Date.now(),
          },
          400
        )
      }

      const stub = getDOStub(c)
      const result = await callDO(stub, 'do.things.setRef', [id, body.ref])

      return c.json(
        apiResponse(
          url.hostname,
          result,
          {
            self: `${url.origin}/api/things/${id}`,
            collection: `${url.origin}/api/things`,
            removeRef: `${url.origin}/api/things/${id}/ref (DELETE)`,
          },
          colo
        )
      )
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'SET_REF_ERROR',
            message: error instanceof Error ? error.message : 'Failed to set thing ref',
          },
          links: { self: `${url.origin}/api/things/${id}/ref`, thing: `${url.origin}/api/things/${id}` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  /**
   * DELETE /api/things/:id/ref - Remove the $ref from a thing
   */
  router.delete('/api/things/:id/ref', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)
      const result = await callDO(stub, 'do.things.removeRef', [id])

      return c.json(
        apiResponse(
          url.hostname,
          result,
          {
            self: `${url.origin}/api/things/${id}`,
            collection: `${url.origin}/api/things`,
            setRef: `${url.origin}/api/things/${id}/ref (PUT)`,
          },
          colo
        )
      )
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'REMOVE_REF_ERROR',
            message: error instanceof Error ? error.message : 'Failed to remove thing ref',
          },
          links: { self: `${url.origin}/api/things/${id}/ref`, thing: `${url.origin}/api/things/${id}` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // Delete Thing
  // ==========================================================================

  /**
   * DELETE /api/things/:id - Delete a thing
   */
  router.delete('/api/things/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)
      await callDO(stub, 'do.things.delete', [id])

      return c.json(
        apiResponse(
          url.hostname,
          { deleted: true, id },
          {
            collection: `${url.origin}/api/things`,
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
            message: error instanceof Error ? error.message : 'Failed to delete thing',
          },
          links: { self: `${url.origin}/api/things/${id}`, collection: `${url.origin}/api/things` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // Validate Thing Data
  // ==========================================================================

  /**
   * POST /api/things/validate - Validate thing data against noun schema
   */
  router.post('/api/things/validate', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    try {
      const body = (await c.req.json()) as { type: string; data: Record<string, unknown> }

      if (!body.type || !body.data) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'INVALID_REQUEST',
              message: 'type and data fields are required',
            },
            links: { self: `${url.origin}/api/things/validate`, things: `${url.origin}/api/things` },
            timestamp: Date.now(),
          },
          400
        )
      }

      const stub = getDOStub(c)
      const result = (await callDO(stub, 'do.things.validate', [body.type, body.data])) as { valid: boolean; errors?: string[] }

      return c.json(
        apiResponse(
          url.hostname,
          result,
          {
            self: `${url.origin}/api/things/validate`,
            things: `${url.origin}/api/things`,
            create: `${url.origin}/api/things (POST)`,
          },
          colo
        ),
        result.valid ? 200 : 422
      )
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'VALIDATE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to validate thing data',
          },
          links: { self: `${url.origin}/api/things/validate`, things: `${url.origin}/api/things` },
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

export default createThingsRoutes
