/**
 * Organization Routes
 *
 * CRUD API for Org collection.
 * Organizations are groups of users with hierarchical structure support.
 */

import { Hono } from 'hono'
import type { Env, DOContext, APIResponse, PaginatedResponse } from '../types'
import type { Org, User } from '../../types/collections'

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
// Org Routes
// =============================================================================

/**
 * Create Org CRUD routes
 */
export function createOrgRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: DOContext }>()

  // ==========================================================================
  // List Orgs
  // ==========================================================================

  /**
   * GET /api/orgs - List all organizations with pagination
   */
  router.get('/api/orgs', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    // Parse pagination params
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const offset = parseInt(url.searchParams.get('offset') || '0', 10)
    const orderBy = url.searchParams.get('orderBy') || 'createdAt'
    const orderDir = (url.searchParams.get('orderDir') as 'asc' | 'desc') || 'desc'

    // Parse filter params
    const parentId = url.searchParams.get('parentId')
    const name = url.searchParams.get('name')

    try {
      const stub = getDOStub(c)
      const options: Record<string, unknown> = { limit, offset, orderBy, orderDir }

      // Build filter if params provided
      if (parentId || name) {
        const filters: Array<{ field: string; op: string; value: unknown }> = []
        if (parentId) filters.push({ field: 'parentId', op: 'eq', value: parentId })
        if (name) filters.push({ field: 'name', op: 'contains', value: name })
        options.filter = filters.length === 1 ? filters[0] : { and: filters }
      }

      const result = (await callDO(stub, 'do.orgs.list', [options])) as {
        items?: Org[]
        total?: number
        cursor?: string
        hasMore?: boolean
      }

      const items = result.items || (Array.isArray(result) ? result : [])
      const total = result.total || items.length

      const links: Record<string, string> = {
        self: `${url.origin}/api/orgs`,
        api: `${url.origin}/api`,
        create: `${url.origin}/api/orgs (POST)`,
        users: `${url.origin}/api/users`,
      }

      // Pagination links
      if (offset > 0) {
        links.prev = `${url.origin}/api/orgs?limit=${limit}&offset=${Math.max(0, offset - limit)}`
      }
      if (items.length === limit) {
        links.next = `${url.origin}/api/orgs?limit=${limit}&offset=${offset + limit}`
      }

      return c.json({
        api: url.hostname,
        data: items,
        pagination: {
          total,
          page: Math.floor(offset / limit) + 1,
          pageSize: limit,
          totalPages: Math.ceil(total / limit),
          hasMore: result.hasMore ?? items.length === limit,
        },
        links,
        colo,
        timestamp: Date.now(),
      } as PaginatedResponse<Org>)
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'LIST_ORGS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to list organizations',
          },
          links: { self: `${url.origin}/api/orgs`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Get Org
  // ==========================================================================

  /**
   * GET /api/orgs/:id - Get a single organization by ID
   */
  router.get('/api/orgs/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)
      const org = (await callDO(stub, 'do.orgs.get', [id])) as Org | null

      if (!org) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'ORG_NOT_FOUND',
              message: `Organization not found: ${id}`,
            },
            links: { orgs: `${url.origin}/api/orgs`, api: `${url.origin}/api` },
            timestamp: Date.now(),
          },
          404
        )
      }

      const links: Record<string, string> = {
        self: `${url.origin}/api/orgs/${id}`,
        orgs: `${url.origin}/api/orgs`,
        update: `${url.origin}/api/orgs/${id} (PUT)`,
        delete: `${url.origin}/api/orgs/${id} (DELETE)`,
        members: `${url.origin}/api/orgs/${id}/members`,
        children: `${url.origin}/api/orgs?parentId=${id}`,
      }

      // Add parent link if exists
      if (org.parentId) {
        links.parent = `${url.origin}/api/orgs/${org.parentId}`
      }

      return c.json(apiResponse(url.hostname, org, links, colo))
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'GET_ORG_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get organization',
          },
          links: { orgs: `${url.origin}/api/orgs`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Create Org
  // ==========================================================================

  /**
   * POST /api/orgs - Create a new organization
   */
  router.post('/api/orgs', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    try {
      const body = (await c.req.json()) as Partial<Org>

      // Validate required fields
      if (!body.name) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'name is required',
            },
            links: { self: `${url.origin}/api/orgs`, api: `${url.origin}/api` },
            timestamp: Date.now(),
          },
          400
        )
      }

      // Validate name length
      if (body.name.length < 2 || body.name.length > 100) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'name must be between 2 and 100 characters',
            },
            links: { self: `${url.origin}/api/orgs`, api: `${url.origin}/api` },
            timestamp: Date.now(),
          },
          400
        )
      }

      const stub = getDOStub(c)

      // Validate parent exists if provided
      if (body.parentId) {
        const parent = await callDO(stub, 'do.orgs.get', [body.parentId])
        if (!parent) {
          return c.json(
            {
              api: url.hostname,
              error: {
                code: 'VALIDATION_ERROR',
                message: `Parent organization not found: ${body.parentId}`,
              },
              links: { self: `${url.origin}/api/orgs`, api: `${url.origin}/api` },
              timestamp: Date.now(),
            },
            400
          )
        }
      }

      // Prepare org data with defaults
      const orgData: Omit<Org, 'id'> = {
        name: body.name,
        parentId: body.parentId,
        metadata: body.metadata,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      const org = (await callDO(stub, 'do.orgs.create', [orgData])) as Org

      return c.json(
        apiResponse(
          url.hostname,
          org,
          {
            self: `${url.origin}/api/orgs/${org.id}`,
            orgs: `${url.origin}/api/orgs`,
            update: `${url.origin}/api/orgs/${org.id} (PUT)`,
            delete: `${url.origin}/api/orgs/${org.id} (DELETE)`,
            members: `${url.origin}/api/orgs/${org.id}/members`,
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
            code: 'CREATE_ORG_ERROR',
            message: error instanceof Error ? error.message : 'Failed to create organization',
          },
          links: { self: `${url.origin}/api/orgs`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // Update Org
  // ==========================================================================

  /**
   * PUT /api/orgs/:id - Update an organization
   */
  router.put('/api/orgs/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const body = (await c.req.json()) as Partial<Org>

      // Validate name length if provided
      if (body.name !== undefined) {
        if (body.name.length < 2 || body.name.length > 100) {
          return c.json(
            {
              api: url.hostname,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'name must be between 2 and 100 characters',
              },
              links: { self: `${url.origin}/api/orgs/${id}`, orgs: `${url.origin}/api/orgs` },
              timestamp: Date.now(),
            },
            400
          )
        }
      }

      const stub = getDOStub(c)

      // Prevent circular parent references
      if (body.parentId) {
        if (body.parentId === id) {
          return c.json(
            {
              api: url.hostname,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Organization cannot be its own parent',
              },
              links: { self: `${url.origin}/api/orgs/${id}`, orgs: `${url.origin}/api/orgs` },
              timestamp: Date.now(),
            },
            400
          )
        }

        // Validate parent exists
        const parent = await callDO(stub, 'do.orgs.get', [body.parentId])
        if (!parent) {
          return c.json(
            {
              api: url.hostname,
              error: {
                code: 'VALIDATION_ERROR',
                message: `Parent organization not found: ${body.parentId}`,
              },
              links: { self: `${url.origin}/api/orgs/${id}`, orgs: `${url.origin}/api/orgs` },
              timestamp: Date.now(),
            },
            400
          )
        }
      }

      // Add updatedAt timestamp
      const updateData = {
        ...body,
        updatedAt: Date.now(),
      }

      const org = (await callDO(stub, 'do.orgs.update', [id, updateData])) as Org

      return c.json(
        apiResponse(
          url.hostname,
          org,
          {
            self: `${url.origin}/api/orgs/${id}`,
            orgs: `${url.origin}/api/orgs`,
            delete: `${url.origin}/api/orgs/${id} (DELETE)`,
            members: `${url.origin}/api/orgs/${id}/members`,
          },
          colo
        )
      )
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'UPDATE_ORG_ERROR',
            message: error instanceof Error ? error.message : 'Failed to update organization',
          },
          links: { self: `${url.origin}/api/orgs/${id}`, orgs: `${url.origin}/api/orgs` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // Delete Org
  // ==========================================================================

  /**
   * DELETE /api/orgs/:id - Delete an organization
   */
  router.delete('/api/orgs/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)

      // Check if org has children
      const children = (await callDO(stub, 'do.orgs.list', [{ filter: { field: 'parentId', op: 'eq', value: id }, limit: 1 }])) as {
        items?: Org[]
      }

      if (children.items && children.items.length > 0) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'HAS_CHILDREN',
              message: 'Cannot delete organization with child organizations',
            },
            links: {
              self: `${url.origin}/api/orgs/${id}`,
              children: `${url.origin}/api/orgs?parentId=${id}`,
              orgs: `${url.origin}/api/orgs`,
            },
            timestamp: Date.now(),
          },
          400
        )
      }

      // Check if org has members
      const members = (await callDO(stub, 'do.users.list', [{ filter: { field: 'orgId', op: 'eq', value: id }, limit: 1 }])) as {
        items?: User[]
      }

      if (members.items && members.items.length > 0) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'HAS_MEMBERS',
              message: 'Cannot delete organization with members. Remove or reassign members first.',
            },
            links: {
              self: `${url.origin}/api/orgs/${id}`,
              members: `${url.origin}/api/orgs/${id}/members`,
              orgs: `${url.origin}/api/orgs`,
            },
            timestamp: Date.now(),
          },
          400
        )
      }

      await callDO(stub, 'do.orgs.delete', [id])

      return c.json(
        apiResponse(
          url.hostname,
          { deleted: true, id },
          {
            orgs: `${url.origin}/api/orgs`,
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
            code: 'DELETE_ORG_ERROR',
            message: error instanceof Error ? error.message : 'Failed to delete organization',
          },
          links: { self: `${url.origin}/api/orgs/${id}`, orgs: `${url.origin}/api/orgs` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // Org Members
  // ==========================================================================

  /**
   * GET /api/orgs/:id/members - List all members of an organization
   */
  router.get('/api/orgs/:id/members', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const orgId = c.req.param('id')

    // Parse pagination params
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const offset = parseInt(url.searchParams.get('offset') || '0', 10)

    try {
      const stub = getDOStub(c)

      // First verify org exists
      const org = await callDO(stub, 'do.orgs.get', [orgId])
      if (!org) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'ORG_NOT_FOUND',
              message: `Organization not found: ${orgId}`,
            },
            links: { orgs: `${url.origin}/api/orgs`, api: `${url.origin}/api` },
            timestamp: Date.now(),
          },
          404
        )
      }

      // Get users with this orgId
      const result = (await callDO(stub, 'do.users.list', [
        {
          limit,
          offset,
          filter: { field: 'orgId', op: 'eq', value: orgId },
        },
      ])) as {
        items?: User[]
        total?: number
        hasMore?: boolean
      }

      const items = result.items || []
      const total = result.total || items.length

      const links: Record<string, string> = {
        self: `${url.origin}/api/orgs/${orgId}/members`,
        org: `${url.origin}/api/orgs/${orgId}`,
        orgs: `${url.origin}/api/orgs`,
        users: `${url.origin}/api/users`,
      }

      // Pagination links
      if (offset > 0) {
        links.prev = `${url.origin}/api/orgs/${orgId}/members?limit=${limit}&offset=${Math.max(0, offset - limit)}`
      }
      if (items.length === limit) {
        links.next = `${url.origin}/api/orgs/${orgId}/members?limit=${limit}&offset=${offset + limit}`
      }

      return c.json({
        api: url.hostname,
        data: items,
        pagination: {
          total,
          page: Math.floor(offset / limit) + 1,
          pageSize: limit,
          totalPages: Math.ceil(total / limit),
          hasMore: result.hasMore ?? items.length === limit,
        },
        links,
        colo,
        timestamp: Date.now(),
      } as PaginatedResponse<User>)
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'LIST_MEMBERS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to list organization members',
          },
          links: { org: `${url.origin}/api/orgs/${orgId}`, orgs: `${url.origin}/api/orgs` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Child Organizations
  // ==========================================================================

  /**
   * GET /api/orgs/:id/children - List child organizations
   */
  router.get('/api/orgs/:id/children', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const parentId = c.req.param('id')

    // Parse pagination params
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const offset = parseInt(url.searchParams.get('offset') || '0', 10)

    try {
      const stub = getDOStub(c)

      // First verify parent org exists
      const parent = await callDO(stub, 'do.orgs.get', [parentId])
      if (!parent) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'ORG_NOT_FOUND',
              message: `Organization not found: ${parentId}`,
            },
            links: { orgs: `${url.origin}/api/orgs`, api: `${url.origin}/api` },
            timestamp: Date.now(),
          },
          404
        )
      }

      // Get child orgs
      const result = (await callDO(stub, 'do.orgs.list', [
        {
          limit,
          offset,
          filter: { field: 'parentId', op: 'eq', value: parentId },
        },
      ])) as {
        items?: Org[]
        total?: number
        hasMore?: boolean
      }

      const items = result.items || []
      const total = result.total || items.length

      const links: Record<string, string> = {
        self: `${url.origin}/api/orgs/${parentId}/children`,
        parent: `${url.origin}/api/orgs/${parentId}`,
        orgs: `${url.origin}/api/orgs`,
      }

      // Pagination links
      if (offset > 0) {
        links.prev = `${url.origin}/api/orgs/${parentId}/children?limit=${limit}&offset=${Math.max(0, offset - limit)}`
      }
      if (items.length === limit) {
        links.next = `${url.origin}/api/orgs/${parentId}/children?limit=${limit}&offset=${offset + limit}`
      }

      return c.json({
        api: url.hostname,
        data: items,
        pagination: {
          total,
          page: Math.floor(offset / limit) + 1,
          pageSize: limit,
          totalPages: Math.ceil(total / limit),
          hasMore: result.hasMore ?? items.length === limit,
        },
        links,
        colo,
        timestamp: Date.now(),
      } as PaginatedResponse<Org>)
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'LIST_CHILDREN_ERROR',
            message: error instanceof Error ? error.message : 'Failed to list child organizations',
          },
          links: { org: `${url.origin}/api/orgs/${parentId}`, orgs: `${url.origin}/api/orgs` },
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

export default createOrgRoutes
