/**
 * Nouns CRUD Routes
 *
 * REST-style API for Noun collection operations.
 * Nouns define entity types with linguistic forms and optional schemas.
 *
 * Routes:
 * - GET /nouns - list all nouns (with pagination)
 * - GET /nouns/:id - get a noun by id
 * - GET /nouns/slug/:slug - get a noun by slug
 * - POST /nouns - create a new noun
 * - PUT /nouns/:id - update a noun
 * - PATCH /nouns/:id/schema - update noun schema only
 * - DELETE /nouns/:id - delete a noun
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
// Nouns Routes
// =============================================================================

/**
 * Create Nouns CRUD routes
 */
export function createNounsRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: DOContext }>()

  // ==========================================================================
  // List Nouns
  // ==========================================================================

  /**
   * GET /nouns - List all nouns with pagination
   */
  router.get('/nouns', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    // Parse query params
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const offset = parseInt(url.searchParams.get('offset') || '0', 10)
    const orderBy = url.searchParams.get('orderBy') || 'createdAt'
    const orderDir = (url.searchParams.get('orderDir') as 'asc' | 'desc') || 'desc'

    try {
      const stub = getDOStub(c)
      const result = (await callDO(stub, 'do.nouns.list', [{ limit, offset, orderBy, orderDir }])) as {
        items?: unknown[]
        total?: number
        cursor?: string
        hasMore?: boolean
      }

      const items = result.items || result
      const total = result.total || (Array.isArray(items) ? items.length : 0)

      const links: Record<string, string> = {
        self: `${url.origin}/nouns`,
        api: `${url.origin}/api`,
        create: `${url.origin}/nouns (POST)`,
      }

      // Add pagination links
      if (offset > 0) {
        links.prev = `${url.origin}/nouns?limit=${limit}&offset=${Math.max(0, offset - limit)}`
      }
      if (Array.isArray(items) && items.length === limit) {
        links.next = `${url.origin}/nouns?limit=${limit}&offset=${offset + limit}`
      }

      return c.json({
        api: url.hostname,
        data: items,
        pagination: {
          total,
          page: Math.floor(offset / limit) + 1,
          pageSize: limit,
          totalPages: Math.ceil(total / limit),
          hasMore: result.hasMore ?? (Array.isArray(items) && items.length === limit),
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
            message: error instanceof Error ? error.message : 'Failed to list nouns',
          },
          links: { self: `${url.origin}/nouns`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Get Noun by ID
  // ==========================================================================

  /**
   * GET /nouns/:id - Get a single noun by ID
   */
  router.get('/nouns/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)
      const result = await callDO(stub, 'do.nouns.get', [id])

      if (!result) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'NOT_FOUND',
              message: `Noun not found: ${id}`,
            },
            links: { nouns: `${url.origin}/nouns`, api: `${url.origin}/api` },
            timestamp: Date.now(),
          },
          404
        )
      }

      const noun = result as { id: string; slug?: string }

      const links: Record<string, string> = {
        self: `${url.origin}/nouns/${id}`,
        nouns: `${url.origin}/nouns`,
        things: `${url.origin}/api/things?type=${noun.slug || id}`,
        update: `${url.origin}/nouns/${id} (PUT)`,
        delete: `${url.origin}/nouns/${id} (DELETE)`,
      }
      if (noun.slug) {
        links.slug = `${url.origin}/nouns/slug/${noun.slug}`
      }

      return c.json(apiResponse(url.hostname, result, links, colo))
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'GET_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get noun',
          },
          links: { nouns: `${url.origin}/nouns`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Get Noun by Slug
  // ==========================================================================

  /**
   * GET /nouns/slug/:slug - Get a noun by its URL slug
   */
  router.get('/nouns/slug/:slug', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const slug = c.req.param('slug')

    try {
      const stub = getDOStub(c)
      const result = await callDO(stub, 'do.nouns.getBySlug', [slug])

      if (!result) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'NOT_FOUND',
              message: `Noun not found with slug: ${slug}`,
            },
            links: { nouns: `${url.origin}/nouns`, api: `${url.origin}/api` },
            timestamp: Date.now(),
          },
          404
        )
      }

      const noun = result as { id: string; slug: string }

      return c.json(
        apiResponse(
          url.hostname,
          result,
          {
            self: `${url.origin}/nouns/slug/${slug}`,
            byId: `${url.origin}/nouns/${noun.id}`,
            nouns: `${url.origin}/nouns`,
            things: `${url.origin}/api/things?type=${slug}`,
            update: `${url.origin}/nouns/${noun.id} (PUT)`,
            delete: `${url.origin}/nouns/${noun.id} (DELETE)`,
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
            message: error instanceof Error ? error.message : 'Failed to get noun by slug',
          },
          links: { nouns: `${url.origin}/nouns`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Create Noun
  // ==========================================================================

  /**
   * POST /nouns - Create a new noun
   */
  router.post('/nouns', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    try {
      const body = await c.req.json()
      const stub = getDOStub(c)
      const result = await callDO(stub, 'do.nouns.create', [body])

      const noun = result as { id: string; slug?: string }

      const links: Record<string, string> = {
        self: `${url.origin}/nouns/${noun.id}`,
        nouns: `${url.origin}/nouns`,
        things: `${url.origin}/api/things?type=${noun.slug || noun.id}`,
        update: `${url.origin}/nouns/${noun.id} (PUT)`,
        delete: `${url.origin}/nouns/${noun.id} (DELETE)`,
      }
      if (noun.slug) {
        links.slug = `${url.origin}/nouns/slug/${noun.slug}`
      }

      return c.json(apiResponse(url.hostname, result, links, colo), 201)
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'CREATE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to create noun',
          },
          links: { nouns: `${url.origin}/nouns`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // Update Noun
  // ==========================================================================

  /**
   * PUT /nouns/:id - Update a noun
   */
  router.put('/nouns/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const body = await c.req.json()
      const stub = getDOStub(c)
      const result = await callDO(stub, 'do.nouns.update', [id, body])

      const noun = result as { id: string; slug?: string }

      const links: Record<string, string> = {
        self: `${url.origin}/nouns/${id}`,
        nouns: `${url.origin}/nouns`,
        delete: `${url.origin}/nouns/${id} (DELETE)`,
      }
      if (noun.slug) {
        links.slug = `${url.origin}/nouns/slug/${noun.slug}`
      }

      return c.json(apiResponse(url.hostname, result, links, colo))
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'UPDATE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to update noun',
          },
          links: { self: `${url.origin}/nouns/${id}`, nouns: `${url.origin}/nouns` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // Update Noun Schema
  // ==========================================================================

  /**
   * PATCH /nouns/:id/schema - Update only the noun's schema
   */
  router.patch('/nouns/:id/schema', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const schema = await c.req.json()
      const stub = getDOStub(c)
      const result = await callDO(stub, 'do.nouns.updateSchema', [id, schema])

      const noun = result as { id: string; slug?: string }

      const links: Record<string, string> = {
        self: `${url.origin}/nouns/${id}`,
        schema: `${url.origin}/nouns/${id}/schema`,
        nouns: `${url.origin}/nouns`,
      }
      if (noun.slug) {
        links.slug = `${url.origin}/nouns/slug/${noun.slug}`
      }

      return c.json(apiResponse(url.hostname, result, links, colo))
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'UPDATE_SCHEMA_ERROR',
            message: error instanceof Error ? error.message : 'Failed to update noun schema',
          },
          links: { self: `${url.origin}/nouns/${id}`, nouns: `${url.origin}/nouns` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // Delete Noun
  // ==========================================================================

  /**
   * DELETE /nouns/:id - Delete a noun
   */
  router.delete('/nouns/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)
      await callDO(stub, 'do.nouns.delete', [id])

      return c.json(
        apiResponse(
          url.hostname,
          { deleted: true, id },
          {
            nouns: `${url.origin}/nouns`,
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
            message: error instanceof Error ? error.message : 'Failed to delete noun',
          },
          links: { self: `${url.origin}/nouns/${id}`, nouns: `${url.origin}/nouns` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // Check Slug Availability
  // ==========================================================================

  /**
   * GET /nouns/check-slug/:slug - Check if a slug is available
   */
  router.get('/nouns/check-slug/:slug', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const slug = c.req.param('slug')

    try {
      const stub = getDOStub(c)
      const available = await callDO(stub, 'do.nouns.isSlugAvailable', [slug])

      return c.json(
        apiResponse(
          url.hostname,
          { slug, available },
          {
            self: `${url.origin}/nouns/check-slug/${slug}`,
            nouns: `${url.origin}/nouns`,
            create: `${url.origin}/nouns (POST)`,
          },
          colo
        )
      )
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'CHECK_SLUG_ERROR',
            message: error instanceof Error ? error.message : 'Failed to check slug availability',
          },
          links: { nouns: `${url.origin}/nouns`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Export Registry
  // ==========================================================================

  /**
   * GET /nouns/registry - Export all nouns as a schema registry
   */
  router.get('/nouns/registry', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    try {
      const stub = getDOStub(c)
      const registry = await callDO(stub, 'do.nouns.exportRegistry', [])

      return c.json(
        apiResponse(
          url.hostname,
          registry,
          {
            self: `${url.origin}/nouns/registry`,
            nouns: `${url.origin}/nouns`,
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
            code: 'REGISTRY_ERROR',
            message: error instanceof Error ? error.message : 'Failed to export noun registry',
          },
          links: { nouns: `${url.origin}/nouns`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Get Nouns with Relations
  // ==========================================================================

  /**
   * GET /nouns/with-relations - Get nouns that have relation fields in their schemas
   */
  router.get('/nouns/with-relations', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    try {
      const stub = getDOStub(c)
      const nouns = await callDO(stub, 'do.nouns.getWithRelations', [])

      return c.json(
        apiResponse(
          url.hostname,
          nouns,
          {
            self: `${url.origin}/nouns/with-relations`,
            nouns: `${url.origin}/nouns`,
            relationships: `${url.origin}/api/relationships`,
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
            code: 'GET_RELATIONS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get nouns with relations',
          },
          links: { nouns: `${url.origin}/nouns`, api: `${url.origin}/api` },
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

export default createNounsRoutes
