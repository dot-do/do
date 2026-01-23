/**
 * Roles CRUD Routes
 *
 * REST API for Role management with DO storage integration.
 * Roles define sets of permissions for RBAC/FGA access control.
 */

import { Hono } from 'hono'
import type { Env, DOContext, APIResponse, PaginatedResponse } from '../types'
import type { Role, Permission } from '../../types/collections'

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

/**
 * Generate role ID
 */
function generateRoleId(): string {
  return `role_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Validate permission
 */
function isValidPermission(perm: unknown): perm is Permission {
  if (typeof perm !== 'object' || perm === null) return false
  const p = perm as Record<string, unknown>
  return typeof p.resource === 'string' && typeof p.action === 'string'
}

// =============================================================================
// In-memory Role Storage (fallback)
// =============================================================================

const roleStorage = new Map<string, Role>()

// =============================================================================
// Roles Routes
// =============================================================================

/**
 * Create Roles CRUD routes
 */
export function createRolesRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: DOContext }>()

  // ==========================================================================
  // List Roles
  // ==========================================================================

  /**
   * GET /api/roles - List all roles with pagination
   */
  router.get('/api/roles', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    // Parse query params
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const offset = parseInt(url.searchParams.get('offset') || '0', 10)
    const orgId = url.searchParams.get('orgId')

    try {
      const stub = getDOStub(c)
      let roles: Role[] = []
      let total = 0

      try {
        const result = await callDO(stub, 'do.roles.list', [{
          limit,
          offset,
          filter: orgId ? { field: 'orgId', op: 'eq', value: orgId } : undefined,
        }]) as { items?: Role[]; total?: number }

        roles = result.items || (Array.isArray(result) ? result : [])
        total = result.total || roles.length
      } catch {
        // Fallback to in-memory storage
        roles = Array.from(roleStorage.values())
        if (orgId) {
          roles = roles.filter((r) => r.orgId === orgId)
        }
        total = roles.length
        roles = roles.slice(offset, offset + limit)
      }

      const links: Record<string, string> = {
        self: `${url.origin}/api/roles`,
        api: `${url.origin}/api`,
        create: `${url.origin}/api/roles (POST)`,
        users: `${url.origin}/api/users`,
      }

      // Add pagination links
      if (offset > 0) {
        links.prev = `${url.origin}/api/roles?limit=${limit}&offset=${Math.max(0, offset - limit)}`
      }
      if (roles.length === limit) {
        links.next = `${url.origin}/api/roles?limit=${limit}&offset=${offset + limit}`
      }

      return c.json({
        api: url.hostname,
        data: roles,
        pagination: {
          total,
          page: Math.floor(offset / limit) + 1,
          pageSize: limit,
          totalPages: Math.ceil(total / limit),
          hasMore: roles.length === limit,
        },
        links,
        colo,
        timestamp: Date.now(),
      } as PaginatedResponse<Role>)
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'LIST_ERROR',
          message: error instanceof Error ? error.message : 'Failed to list roles',
        },
        links: { self: `${url.origin}/api/roles`, api: `${url.origin}/api` },
        timestamp: Date.now(),
      }, 500)
    }
  })

  // ==========================================================================
  // Get Role
  // ==========================================================================

  /**
   * GET /api/roles/:id - Get role by ID
   */
  router.get('/api/roles/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)
      let role: Role | null = null

      try {
        role = await callDO(stub, 'do.roles.get', [id]) as Role | null
      } catch {
        // Fallback to in-memory storage
        role = roleStorage.get(id) || null
      }

      if (!role) {
        return c.json({
          api: url.hostname,
          error: {
            code: 'NOT_FOUND',
            message: `Role not found: ${id}`,
          },
          links: { roles: `${url.origin}/api/roles`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        }, 404)
      }

      return c.json(apiResponse(url.hostname, role, {
        self: `${url.origin}/api/roles/${id}`,
        roles: `${url.origin}/api/roles`,
        update: `${url.origin}/api/roles/${id} (PUT)`,
        delete: `${url.origin}/api/roles/${id} (DELETE)`,
        permissions: `${url.origin}/api/roles/${id}/permissions`,
      }, colo))
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'GET_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get role',
        },
        links: { roles: `${url.origin}/api/roles`, api: `${url.origin}/api` },
        timestamp: Date.now(),
      }, 500)
    }
  })

  // ==========================================================================
  // Create Role
  // ==========================================================================

  /**
   * POST /api/roles - Create a new role
   */
  router.post('/api/roles', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    try {
      const body = await c.req.json() as {
        name: string
        description?: string
        permissions?: Permission[]
        orgId?: string
      }

      // Validate required fields
      if (!body.name) {
        return c.json({
          api: url.hostname,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Role name is required',
          },
          links: { roles: `${url.origin}/api/roles`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        }, 400)
      }

      // Validate permissions if provided
      if (body.permissions) {
        for (const perm of body.permissions) {
          if (!isValidPermission(perm)) {
            return c.json({
              api: url.hostname,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid permission format. Each permission must have resource and action fields.',
              },
              links: { roles: `${url.origin}/api/roles`, api: `${url.origin}/api` },
              timestamp: Date.now(),
            }, 400)
          }
        }
      }

      const role: Role = {
        id: generateRoleId(),
        name: body.name,
        description: body.description,
        permissions: body.permissions || [],
        orgId: body.orgId,
      }

      // Store in DO
      const stub = getDOStub(c)
      try {
        await callDO(stub, 'do.roles.create', [role])
      } catch {
        // Store in local fallback
        roleStorage.set(role.id, role)
      }

      return c.json(apiResponse(url.hostname, role, {
        self: `${url.origin}/api/roles/${role.id}`,
        roles: `${url.origin}/api/roles`,
        update: `${url.origin}/api/roles/${role.id} (PUT)`,
        delete: `${url.origin}/api/roles/${role.id} (DELETE)`,
      }, colo), 201)
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'CREATE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create role',
        },
        links: { roles: `${url.origin}/api/roles`, api: `${url.origin}/api` },
        timestamp: Date.now(),
      }, 400)
    }
  })

  // ==========================================================================
  // Update Role
  // ==========================================================================

  /**
   * PUT /api/roles/:id - Update a role
   */
  router.put('/api/roles/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const body = await c.req.json() as Partial<Omit<Role, 'id'>>

      // Validate permissions if provided
      if (body.permissions) {
        for (const perm of body.permissions) {
          if (!isValidPermission(perm)) {
            return c.json({
              api: url.hostname,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid permission format. Each permission must have resource and action fields.',
              },
              links: { roles: `${url.origin}/api/roles`, api: `${url.origin}/api` },
              timestamp: Date.now(),
            }, 400)
          }
        }
      }

      const stub = getDOStub(c)
      let role: Role | null = null

      try {
        role = await callDO(stub, 'do.roles.update', [id, body]) as Role | null
      } catch {
        // Fallback to in-memory storage
        const existing = roleStorage.get(id)
        if (existing) {
          role = { ...existing, ...body, id }
          roleStorage.set(id, role)
        }
      }

      if (!role) {
        return c.json({
          api: url.hostname,
          error: {
            code: 'NOT_FOUND',
            message: `Role not found: ${id}`,
          },
          links: { roles: `${url.origin}/api/roles`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        }, 404)
      }

      return c.json(apiResponse(url.hostname, role, {
        self: `${url.origin}/api/roles/${id}`,
        roles: `${url.origin}/api/roles`,
        delete: `${url.origin}/api/roles/${id} (DELETE)`,
      }, colo))
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'UPDATE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update role',
        },
        links: { self: `${url.origin}/api/roles/${id}`, roles: `${url.origin}/api/roles` },
        timestamp: Date.now(),
      }, 400)
    }
  })

  // ==========================================================================
  // Patch Role
  // ==========================================================================

  /**
   * PATCH /api/roles/:id - Partial update a role
   */
  router.patch('/api/roles/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const body = await c.req.json() as Partial<Omit<Role, 'id'>>

      // Validate permissions if provided
      if (body.permissions) {
        for (const perm of body.permissions) {
          if (!isValidPermission(perm)) {
            return c.json({
              api: url.hostname,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid permission format',
              },
              links: { roles: `${url.origin}/api/roles`, api: `${url.origin}/api` },
              timestamp: Date.now(),
            }, 400)
          }
        }
      }

      const stub = getDOStub(c)
      let role: Role | null = null

      try {
        role = await callDO(stub, 'do.roles.update', [id, body]) as Role | null
      } catch {
        // Fallback to in-memory storage
        const existing = roleStorage.get(id)
        if (existing) {
          role = { ...existing, ...body, id }
          roleStorage.set(id, role)
        }
      }

      if (!role) {
        return c.json({
          api: url.hostname,
          error: {
            code: 'NOT_FOUND',
            message: `Role not found: ${id}`,
          },
          links: { roles: `${url.origin}/api/roles`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        }, 404)
      }

      return c.json(apiResponse(url.hostname, role, {
        self: `${url.origin}/api/roles/${id}`,
        roles: `${url.origin}/api/roles`,
      }, colo))
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'UPDATE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update role',
        },
        links: { self: `${url.origin}/api/roles/${id}`, roles: `${url.origin}/api/roles` },
        timestamp: Date.now(),
      }, 400)
    }
  })

  // ==========================================================================
  // Delete Role
  // ==========================================================================

  /**
   * DELETE /api/roles/:id - Delete a role
   */
  router.delete('/api/roles/:id', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)
      let deleted = false

      try {
        await callDO(stub, 'do.roles.delete', [id])
        deleted = true
      } catch {
        // Fallback to in-memory storage
        deleted = roleStorage.delete(id)
      }

      if (!deleted) {
        return c.json({
          api: url.hostname,
          error: {
            code: 'NOT_FOUND',
            message: `Role not found: ${id}`,
          },
          links: { roles: `${url.origin}/api/roles`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        }, 404)
      }

      return c.json(apiResponse(url.hostname, { deleted: true, id }, {
        roles: `${url.origin}/api/roles`,
        api: `${url.origin}/api`,
      }, colo))
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'DELETE_ERROR',
          message: error instanceof Error ? error.message : 'Failed to delete role',
        },
        links: { self: `${url.origin}/api/roles/${id}`, roles: `${url.origin}/api/roles` },
        timestamp: Date.now(),
      }, 400)
    }
  })

  // ==========================================================================
  // Role Permissions Management
  // ==========================================================================

  /**
   * GET /api/roles/:id/permissions - Get role permissions
   */
  router.get('/api/roles/:id/permissions', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const stub = getDOStub(c)
      let role: Role | null = null

      try {
        role = await callDO(stub, 'do.roles.get', [id]) as Role | null
      } catch {
        role = roleStorage.get(id) || null
      }

      if (!role) {
        return c.json({
          api: url.hostname,
          error: {
            code: 'NOT_FOUND',
            message: `Role not found: ${id}`,
          },
          links: { roles: `${url.origin}/api/roles`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        }, 404)
      }

      return c.json(apiResponse(url.hostname, { permissions: role.permissions }, {
        self: `${url.origin}/api/roles/${id}/permissions`,
        role: `${url.origin}/api/roles/${id}`,
        roles: `${url.origin}/api/roles`,
      }, colo))
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'GET_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get role permissions',
        },
        links: { roles: `${url.origin}/api/roles`, api: `${url.origin}/api` },
        timestamp: Date.now(),
      }, 500)
    }
  })

  /**
   * POST /api/roles/:id/permissions - Add permission to role
   */
  router.post('/api/roles/:id/permissions', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const body = await c.req.json() as Permission

      if (!isValidPermission(body)) {
        return c.json({
          api: url.hostname,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Permission must have resource and action fields',
          },
          links: { role: `${url.origin}/api/roles/${id}`, roles: `${url.origin}/api/roles` },
          timestamp: Date.now(),
        }, 400)
      }

      const stub = getDOStub(c)
      let role: Role | null = null

      try {
        role = await callDO(stub, 'do.roles.get', [id]) as Role | null
      } catch {
        role = roleStorage.get(id) || null
      }

      if (!role) {
        return c.json({
          api: url.hostname,
          error: {
            code: 'NOT_FOUND',
            message: `Role not found: ${id}`,
          },
          links: { roles: `${url.origin}/api/roles`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        }, 404)
      }

      // Check if permission already exists
      const exists = role.permissions.some(
        (p) => p.resource === body.resource && p.action === body.action
      )

      if (!exists) {
        role.permissions.push(body)

        try {
          await callDO(stub, 'do.roles.update', [id, { permissions: role.permissions }])
        } catch {
          roleStorage.set(id, role)
        }
      }

      return c.json(apiResponse(url.hostname, { permissions: role.permissions }, {
        self: `${url.origin}/api/roles/${id}/permissions`,
        role: `${url.origin}/api/roles/${id}`,
        roles: `${url.origin}/api/roles`,
      }, colo), 201)
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'ADD_PERMISSION_ERROR',
          message: error instanceof Error ? error.message : 'Failed to add permission',
        },
        links: { role: `${url.origin}/api/roles/${id}`, roles: `${url.origin}/api/roles` },
        timestamp: Date.now(),
      }, 400)
    }
  })

  /**
   * DELETE /api/roles/:id/permissions - Remove permission from role
   */
  router.delete('/api/roles/:id/permissions', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const body = await c.req.json() as { resource: string; action: string }

      if (!body.resource || !body.action) {
        return c.json({
          api: url.hostname,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Must specify resource and action to remove',
          },
          links: { role: `${url.origin}/api/roles/${id}`, roles: `${url.origin}/api/roles` },
          timestamp: Date.now(),
        }, 400)
      }

      const stub = getDOStub(c)
      let role: Role | null = null

      try {
        role = await callDO(stub, 'do.roles.get', [id]) as Role | null
      } catch {
        role = roleStorage.get(id) || null
      }

      if (!role) {
        return c.json({
          api: url.hostname,
          error: {
            code: 'NOT_FOUND',
            message: `Role not found: ${id}`,
          },
          links: { roles: `${url.origin}/api/roles`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        }, 404)
      }

      // Remove the permission
      role.permissions = role.permissions.filter(
        (p) => !(p.resource === body.resource && p.action === body.action)
      )

      try {
        await callDO(stub, 'do.roles.update', [id, { permissions: role.permissions }])
      } catch {
        roleStorage.set(id, role)
      }

      return c.json(apiResponse(url.hostname, { permissions: role.permissions }, {
        self: `${url.origin}/api/roles/${id}/permissions`,
        role: `${url.origin}/api/roles/${id}`,
        roles: `${url.origin}/api/roles`,
      }, colo))
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'REMOVE_PERMISSION_ERROR',
          message: error instanceof Error ? error.message : 'Failed to remove permission',
        },
        links: { role: `${url.origin}/api/roles/${id}`, roles: `${url.origin}/api/roles` },
        timestamp: Date.now(),
      }, 400)
    }
  })

  // ==========================================================================
  // Permission Checking
  // ==========================================================================

  /**
   * POST /api/roles/:id/check - Check if role has permission
   */
  router.post('/api/roles/:id/check', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const id = c.req.param('id')

    try {
      const body = await c.req.json() as { resource: string; action: string }

      if (!body.resource || !body.action) {
        return c.json({
          api: url.hostname,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Must specify resource and action to check',
          },
          links: { role: `${url.origin}/api/roles/${id}`, roles: `${url.origin}/api/roles` },
          timestamp: Date.now(),
        }, 400)
      }

      const stub = getDOStub(c)
      let role: Role | null = null

      try {
        role = await callDO(stub, 'do.roles.get', [id]) as Role | null
      } catch {
        role = roleStorage.get(id) || null
      }

      if (!role) {
        return c.json({
          api: url.hostname,
          error: {
            code: 'NOT_FOUND',
            message: `Role not found: ${id}`,
          },
          links: { roles: `${url.origin}/api/roles`, api: `${url.origin}/api` },
          timestamp: Date.now(),
        }, 404)
      }

      // Check permission (supports wildcard matching)
      const hasPermission = role.permissions.some((p) => {
        const resourceMatch = p.resource === '*' || p.resource === body.resource ||
          (p.resource.endsWith('*') && body.resource.startsWith(p.resource.slice(0, -1)))
        const actionMatch = p.action === '*' || p.action === body.action
        return resourceMatch && actionMatch
      })

      return c.json(apiResponse(url.hostname, {
        allowed: hasPermission,
        resource: body.resource,
        action: body.action,
        roleId: id,
        roleName: role.name,
      }, {
        self: `${url.origin}/api/roles/${id}/check`,
        role: `${url.origin}/api/roles/${id}`,
        permissions: `${url.origin}/api/roles/${id}/permissions`,
      }, colo))
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'CHECK_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check permission',
        },
        links: { role: `${url.origin}/api/roles/${id}`, roles: `${url.origin}/api/roles` },
        timestamp: Date.now(),
      }, 500)
    }
  })

  return router
}

// =============================================================================
// Export
// =============================================================================

export default createRolesRoutes
