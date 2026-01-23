/**
 * User Routes
 *
 * CRUD API for User collection.
 * Users represent human identities with roles, organizations, and metadata.
 */

import { Hono } from 'hono'
import type { Env, DOContext, APIResponse, PaginatedResponse } from '../types'
import type { User } from '../../types/collections'

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
// User Routes
// =============================================================================

/**
 * Create User CRUD routes
 */
export function createUserRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: DOContext }>()

  // ==========================================================================
  // List Users
  // ==========================================================================

  /**
   * GET /api/users - List all users with pagination
   */
  router.get('/api/users', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    // Parse pagination params
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const offset = parseInt(url.searchParams.get('offset') || '0', 10)
    const orderBy = url.searchParams.get('orderBy') || 'createdAt'
    const orderDir = (url.searchParams.get('orderDir') as 'asc' | 'desc') || 'desc'

    // Parse filter params
    const orgId = url.searchParams.get('orgId')
    const email = url.searchParams.get('email')
    const role = url.searchParams.get('role')

    try {
      const stub = getDOStub(c)
      const options: Record<string, unknown> = { limit, offset, orderBy, orderDir }

      // Build filter if params provided
      if (orgId || email || role) {
        const filters: Array<{ field: string; op: string; value: unknown }> = []
        if (orgId) filters.push({ field: 'orgId', op: 'eq', value: orgId })
        if (email) filters.push({ field: 'email', op: 'eq', value: email })
        if (role) filters.push({ field: 'roles', op: 'contains', value: role })
        options.filter = filters.length === 1 ? filters[0] : { and: filters }
      }

      const result = (await callDO(stub, 'do.users.list', [options])) as {
        items?: User[]
        total?: number
        cursor?: string
        hasMore?: boolean
      }

      const items = result.items || (Array.isArray(result) ? result : [])
      const total = result.total || items.length

      const links: Record<string, string> = {
        self: `${url.origin}/api/users`,
        api: `${url.origin}/api`,
        create: `${url.origin}/api/users (POST)`,
        orgs: `${url.origin}/api/orgs`,
      }

      // Pagination links
      if (offset > 0) {
        links.prev = `${url.origin}/api/users?limit=${limit}&offset=${Math.max(0, offset - limit)}`
      }
      if (items.length === limit) {
        links.next = `${url.origin}/api/users?limit=${limit}&offset=${offset + limit}`
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
            code: 'LIST_USERS_ERROR',
            message: error instanceof Error ? error.message : 'Failed to list users',
          },
          links: { self: `${url.origin}/api/users`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Get User
  // ==========================================================================

  /**
   * GET /api/users/:id - Get a single user by ID
   */
  router.get('/api/users/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)
      const user = (await callDO(stub, 'do.users.get', [id])) as User | null

      if (!user) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'USER_NOT_FOUND',
              message: `User not found: ${id}`,
            },
            links: { users: `${url.origin}/api/users`, api: `${url.origin}/api` },
            timestamp: Date.now(),
          },
          404
        )
      }

      return c.json(
        apiResponse(
          url.hostname,
          user,
          {
            self: `${url.origin}/api/users/${id}`,
            users: `${url.origin}/api/users`,
            update: `${url.origin}/api/users/${id} (PUT)`,
            delete: `${url.origin}/api/users/${id} (DELETE)`,
            assignRole: `${url.origin}/api/users/${id}/roles (POST)`,
            org: user.orgId ? `${url.origin}/api/orgs/${user.orgId}` : undefined,
          } as Record<string, string>,
          colo
        )
      )
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'GET_USER_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get user',
          },
          links: { users: `${url.origin}/api/users`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        500
      )
    }
  })

  // ==========================================================================
  // Create User
  // ==========================================================================

  /**
   * POST /api/users - Create a new user
   */
  router.post('/api/users', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    try {
      const body = (await c.req.json()) as Partial<User>

      // Validate required fields
      if (!body.email) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'email is required',
            },
            links: { self: `${url.origin}/api/users`, api: `${url.origin}/api` },
            timestamp: Date.now(),
          },
          400
        )
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(body.email)) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid email format',
            },
            links: { self: `${url.origin}/api/users`, api: `${url.origin}/api` },
            timestamp: Date.now(),
          },
          400
        )
      }

      const stub = getDOStub(c)

      // Prepare user data with defaults
      const userData: Omit<User, 'id'> = {
        email: body.email,
        name: body.name,
        roles: body.roles || [],
        orgId: body.orgId,
        metadata: body.metadata,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      const user = (await callDO(stub, 'do.users.create', [userData])) as User

      return c.json(
        apiResponse(
          url.hostname,
          user,
          {
            self: `${url.origin}/api/users/${user.id}`,
            users: `${url.origin}/api/users`,
            update: `${url.origin}/api/users/${user.id} (PUT)`,
            delete: `${url.origin}/api/users/${user.id} (DELETE)`,
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
            code: 'CREATE_USER_ERROR',
            message: error instanceof Error ? error.message : 'Failed to create user',
          },
          links: { self: `${url.origin}/api/users`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // Update User
  // ==========================================================================

  /**
   * PUT /api/users/:id - Update a user
   */
  router.put('/api/users/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const body = (await c.req.json()) as Partial<User>

      // Validate email format if provided
      if (body.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(body.email)) {
          return c.json(
            {
              api: url.hostname,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid email format',
              },
              links: { self: `${url.origin}/api/users/${id}`, users: `${url.origin}/api/users` },
              timestamp: Date.now(),
            },
            400
          )
        }
      }

      const stub = getDOStub(c)

      // Add updatedAt timestamp
      const updateData = {
        ...body,
        updatedAt: Date.now(),
      }

      const user = (await callDO(stub, 'do.users.update', [id, updateData])) as User

      return c.json(
        apiResponse(
          url.hostname,
          user,
          {
            self: `${url.origin}/api/users/${id}`,
            users: `${url.origin}/api/users`,
            delete: `${url.origin}/api/users/${id} (DELETE)`,
          },
          colo
        )
      )
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'UPDATE_USER_ERROR',
            message: error instanceof Error ? error.message : 'Failed to update user',
          },
          links: { self: `${url.origin}/api/users/${id}`, users: `${url.origin}/api/users` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // Delete User
  // ==========================================================================

  /**
   * DELETE /api/users/:id - Delete a user
   */
  router.delete('/api/users/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)
      await callDO(stub, 'do.users.delete', [id])

      return c.json(
        apiResponse(
          url.hostname,
          { deleted: true, id },
          {
            users: `${url.origin}/api/users`,
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
            code: 'DELETE_USER_ERROR',
            message: error instanceof Error ? error.message : 'Failed to delete user',
          },
          links: { self: `${url.origin}/api/users/${id}`, users: `${url.origin}/api/users` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  // ==========================================================================
  // Role Operations
  // ==========================================================================

  /**
   * POST /api/users/:id/roles - Assign a role to a user
   */
  router.post('/api/users/:id/roles', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const userId = c.req.param('id')

    try {
      const body = (await c.req.json()) as { roleId: string }

      if (!body.roleId) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'roleId is required',
            },
            links: { self: `${url.origin}/api/users/${userId}/roles`, user: `${url.origin}/api/users/${userId}` },
            timestamp: Date.now(),
          },
          400
        )
      }

      const stub = getDOStub(c)
      const user = (await callDO(stub, 'do.users.assignRole', [userId, body.roleId])) as User

      return c.json(
        apiResponse(
          url.hostname,
          user,
          {
            self: `${url.origin}/api/users/${userId}`,
            users: `${url.origin}/api/users`,
            removeRole: `${url.origin}/api/users/${userId}/roles/${body.roleId} (DELETE)`,
          },
          colo
        )
      )
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'ASSIGN_ROLE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to assign role',
          },
          links: { user: `${url.origin}/api/users/${userId}`, users: `${url.origin}/api/users` },
          timestamp: Date.now(),
        },
        400
      )
    }
  })

  /**
   * DELETE /api/users/:id/roles/:roleId - Remove a role from a user
   */
  router.delete('/api/users/:id/roles/:roleId', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const userId = c.req.param('id')
    const roleId = c.req.param('roleId')

    try {
      const stub = getDOStub(c)
      const user = (await callDO(stub, 'do.users.removeRole', [userId, roleId])) as User

      return c.json(
        apiResponse(
          url.hostname,
          user,
          {
            self: `${url.origin}/api/users/${userId}`,
            users: `${url.origin}/api/users`,
            assignRole: `${url.origin}/api/users/${userId}/roles (POST)`,
          },
          colo
        )
      )
    } catch (error) {
      return c.json(
        {
          api: url.hostname,
          error: {
            code: 'REMOVE_ROLE_ERROR',
            message: error instanceof Error ? error.message : 'Failed to remove role',
          },
          links: { user: `${url.origin}/api/users/${userId}`, users: `${url.origin}/api/users` },
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

export default createUserRoutes
