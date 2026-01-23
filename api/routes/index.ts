/**
 * Route Exports
 *
 * Aggregates all route modules for the DO API
 */

import { Hono } from 'hono'
import type { Env, DOContext, APIResponse } from '../types'
import { createDORoutes } from './do'
import { createAIRoutes } from './ai'
import { createHealthRoutes } from './health'
import { createNounsRoutes } from './nouns'
import { createVerbRoutes } from './verbs'
import { createRelationshipsRoutes } from './relationships'
import { createThingsRoutes } from './things'
import { createFunctionsRoutes } from './functions'
import { createUserRoutes } from './users'
import { createOrgRoutes } from './orgs'
import { createWorkflowRoutes } from './workflows'
// Agents routes excluded from 0.0.1 - depends on workers module
// import { createAgentsRoutes } from './agents'
import { createRolesRoutes } from './roles'

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

// =============================================================================
// Route Exports
// =============================================================================

export { createDORoutes } from './do'
export { createAIRoutes } from './ai'
export { createHealthRoutes } from './health'
export { createNounsRoutes } from './nouns'
export { createVerbRoutes } from './verbs'
export { createRelationshipsRoutes } from './relationships'
export { createThingsRoutes } from './things'
export { createFunctionsRoutes } from './functions'
export { createUserRoutes } from './users'
export { createOrgRoutes } from './orgs'
export { createWorkflowRoutes } from './workflows'
// Agents routes excluded from 0.0.1 - depends on workers module
// export { createAgentsRoutes } from './agents'
export { createRolesRoutes } from './roles'

// =============================================================================
// Combined Routes
// =============================================================================

/**
 * Create all routes combined into a single router
 */
export function createAllRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: DOContext }>()

  // Mount health routes
  router.route('/', createHealthRoutes())

  // Mount nouns routes (before generic DO routes for specific path matching)
  router.route('/', createNounsRoutes())

  // Mount verbs routes (before generic DO routes for specific path matching)
  router.route('/', createVerbRoutes())

  // Mount relationships routes (before generic DO routes for specific path matching)
  router.route('/', createRelationshipsRoutes())

  // Mount things routes (before generic DO routes for specific path matching)
  router.route('/', createThingsRoutes())

  // Mount functions routes (before generic DO routes for specific path matching)
  router.route('/', createFunctionsRoutes())

  // Mount user routes (before generic DO routes for specific path matching)
  router.route('/', createUserRoutes())

  // Mount org routes (before generic DO routes for specific path matching)
  router.route('/', createOrgRoutes())

  // Mount workflow routes (before generic DO routes for specific path matching)
  router.route('/', createWorkflowRoutes())

  // Agents routes excluded from 0.0.1 - depends on workers module
  // router.route('/', createAgentsRoutes())

  // Mount roles routes (before generic DO routes for specific path matching)
  router.route('/', createRolesRoutes())

  // Mount DO routes
  router.route('/', createDORoutes())

  // Mount AI routes
  router.route('/', createAIRoutes())

  return router
}

// =============================================================================
// Root Discovery
// =============================================================================

/**
 * Create root discovery route
 */
export function createRootRoute() {
  const router = new Hono<{ Bindings: Env; Variables: DOContext }>()

  /**
   * GET / - Root API discovery
   */
  router.get('/', (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    return c.json(apiResponse(url.hostname, {
      name: 'Digital Object API',
      description: 'Every business entity IS a Durable Object',
      version: '1.0.0',
    }, {
      self: url.origin,
      identity: `${url.origin}/.do`,
      api: `${url.origin}/api`,
      rpc: `${url.origin}/rpc`,
      mcp: `${url.origin}/mcp`,
      health: `${url.origin}/_health`,
      ai: `${url.origin}/api/ai`,
      docs: 'https://do.md',
    }, colo))
  })

  return router
}

// =============================================================================
// RPC Routes
// =============================================================================

/**
 * Create RPC discovery and handler routes
 */
export function createRPCRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: DOContext }>()

  /**
   * GET /rpc - RPC discovery
   */
  router.get('/rpc', (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    return c.json(apiResponse(url.hostname, {
      description: 'RPC API - call methods via POST or explore via GET',
      usage: {
        post: 'POST /rpc with JSON body: { "method": "do.identity.get", "args": [] }',
        get: 'GET /rpc/{method} to see method info',
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

  /**
   * POST /rpc - Handle RPC calls
   */
  router.post('/rpc', async (c) => {
    const url = new URL(c.req.url)

    try {
      const body = await c.req.json()
      const doId = c.env.DO.idFromName(url.hostname)
      const stub = c.env.DO.get(doId)

      // Forward to DO
      const response = await stub.fetch(new Request(`${url.origin}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }))

      return response
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'RPC_ERROR',
          message: error instanceof Error ? error.message : 'RPC call failed',
        },
        links: { rpc: `${url.origin}/rpc` },
        timestamp: Date.now(),
      }, 500)
    }
  })

  /**
   * POST / - RPC at root (convenience)
   */
  router.post('/', async (c) => {
    const url = new URL(c.req.url)
    const contentType = c.req.header('Content-Type') || ''

    // Only handle JSON RPC requests
    if (!contentType.includes('application/json')) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'INVALID_CONTENT_TYPE',
          message: 'POST requests require Content-Type: application/json',
        },
        links: { self: url.origin, api: `${url.origin}/api` },
        timestamp: Date.now(),
      }, 400)
    }

    try {
      const body = await c.req.json()
      const doId = c.env.DO.idFromName(url.hostname)
      const stub = c.env.DO.get(doId)

      const response = await stub.fetch(new Request(`${url.origin}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }))

      return response
    } catch (error) {
      return c.json({
        api: url.hostname,
        error: {
          code: 'RPC_ERROR',
          message: error instanceof Error ? error.message : 'RPC call failed',
        },
        links: { rpc: `${url.origin}/rpc` },
        timestamp: Date.now(),
      }, 500)
    }
  })

  /**
   * GET /rpc/* - Clickable RPC method exploration
   */
  router.get('/rpc/*', async (c) => {
    const url = new URL(c.req.url)
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const method = url.pathname.replace('/rpc/', '')

    // Build contextual links based on method
    const links: Record<string, string> = {
      self: `${url.origin}/rpc/${method}`,
      rpc: `${url.origin}/rpc`,
      api: `${url.origin}/.do`,
      mcp: `${url.origin}/mcp`,
    }

    const parts = method.split('.')
    if (parts[0] === 'do' && parts.length >= 2) {
      const namespace = parts[1]

      if (['nouns', 'verbs', 'things', 'actions', 'users', 'agents', 'functions', 'workflows'].includes(namespace)) {
        links.list = `${url.origin}/rpc/do.${namespace}.list`
        links.create = `${url.origin}/rpc/do.${namespace}.create`
      }

      if (namespace === 'system') {
        links.ping = `${url.origin}/rpc/do.system.ping`
        links.stats = `${url.origin}/rpc/do.system.stats`
        links.schema = `${url.origin}/rpc/do.system.schema`
      }
    }

    // Try to call the method with no args (works for read methods)
    try {
      const doId = c.env.DO.idFromName(url.hostname)
      const stub = c.env.DO.get(doId)

      const response = await stub.fetch(new Request(`${url.origin}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'rpc', id: `get-${Date.now()}`, method, args: [] }),
      }))

      if (response.ok) {
        const result = await response.json()
        return c.json(apiResponse(url.hostname, {
          method,
          result: (result as { result?: unknown }).result ?? result,
        }, links, colo))
      }
    } catch {
      // Method needs args, return info
    }

    return c.json(apiResponse(url.hostname, {
      method,
      description: `RPC method: ${method}`,
      usage: `POST /rpc with body: { "method": "${method}", "args": [...] }`,
    }, links, colo))
  })

  return router
}
