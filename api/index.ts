/**
 * DO API Module
 *
 * Convention-driven API using @dotdo/apis database convention.
 * Schema defines collections, routes are auto-generated.
 *
 * @example
 * ```typescript
 * import doApi from '@dotdo/do/api'
 *
 * export default {
 *   fetch: doApi.fetch,
 * }
 * ```
 */

import { API } from '@dotdo/apis'
import { Hono } from 'hono'
import type { Context } from 'hono'
import type { ApiEnv } from '@dotdo/apis'
import type { Env, DOContext, APIResponse } from './types'
import { createAIRoutes } from './routes/ai'
import { createHealthRoutes } from './routes/health'

// =============================================================================
// Schema Definition
// =============================================================================

/**
 * DO Collections Schema
 *
 * Uses @dotdo/apis schema shorthand:
 * - 'string!' = required string
 * - 'string?' = optional string
 * - 'string = "default"' = with default
 * - 'text' = full-text searchable
 * - 'cuid!' = auto-generated CUID
 * - '-> Model!' = forward relation (required)
 * - '<- Model[]' = inverse relation (array)
 */
export const schema = {
  // =========================================================================
  // Linguistic Pattern Collections
  // =========================================================================

  Noun: {
    id: 'cuid!',
    name: 'string!',
    singular: 'string!',
    plural: 'string!',
    slug: 'string! #unique',
    schema: 'json?',
    description: 'text?',
  },

  Verb: {
    id: 'cuid!',
    name: 'string!',
    action: 'string!',
    act: 'string!',
    activity: 'string!',
    event: 'string!',
    reverse: 'string!',
    inverse: 'string?',
    description: 'text?',
  },

  Thing: {
    id: 'cuid!',
    type: 'string!',
    data: 'json!',
    ref: 'string?',
    content: 'text?',
    code: 'string?',
    version: 'number = 1',
  },

  Action: {
    id: 'cuid!',
    verb: 'string!',
    subject: 'string?',
    object: 'string?',
    input: 'json?',
    config: 'json?',
    output: 'json?',
    status: 'string = "pending"',
    actorType: 'string!',
    actorId: 'string!',
    actorName: 'string?',
    startedAt: 'number?',
    completedAt: 'number?',
    error: 'json?',
  },

  Relationship: {
    id: 'cuid!',
    sourceId: 'string!',
    sourceType: 'string!',
    targetId: 'string!',
    targetType: 'string!',
    relation: 'string!',
    operator: 'string?',
    data: 'json?',
  },

  // =========================================================================
  // Execution Collections
  // =========================================================================

  Function: {
    id: 'cuid!',
    name: 'string! #unique',
    type: 'string = "code"',
    definition: 'json!',
    description: 'text?',
  },

  Workflow: {
    id: 'cuid!',
    name: 'string! #unique',
    type: 'string = "sequence"',
    definition: 'json!',
    triggers: 'json?',
    description: 'text?',
  },

  // =========================================================================
  // Event Collections
  // =========================================================================

  Event: {
    id: 'cuid!',
    type: 'string!',
    source: 'string!',
    subject: 'string?',
    data: 'json?',
    time: 'number!',
  },

  Experiment: {
    id: 'cuid!',
    name: 'string!',
    status: 'string = "draft"',
    variants: 'json!',
    metrics: 'json?',
    startedAt: 'number?',
    endedAt: 'number?',
    description: 'text?',
  },

  // =========================================================================
  // Identity Collections
  // =========================================================================

  User: {
    id: 'cuid!',
    email: 'string! #unique',
    name: 'string!',
    avatar: 'string?',
    metadata: 'json?',
  },

  Org: {
    id: 'cuid!',
    name: 'string!',
    slug: 'string! #unique',
    ownerId: 'string!',
    metadata: 'json?',
  },

  Role: {
    id: 'cuid!',
    name: 'string!',
    orgId: 'string?',
    permissions: 'json!',
    description: 'text?',
  },

  Agent: {
    id: 'cuid!',
    name: 'string!',
    type: 'string = "agent"',
    status: 'string = "idle"',
    model: 'string = "best"',
    systemPrompt: 'text?',
    tools: 'json?',
    voice: 'json?',
    metadata: 'json?',
  },

  // =========================================================================
  // External Collections
  // =========================================================================

  Integration: {
    id: 'cuid!',
    type: 'string!',
    name: 'string!',
    status: 'string = "pending"',
    config: 'json?',
    credentials: 'json?',
  },

  Webhook: {
    id: 'cuid!',
    url: 'string!',
    events: 'json!',
    secret: 'string?',
    status: 'string = "active"',
    metadata: 'json?',
  },
}

// =============================================================================
// API Factory
// =============================================================================

/**
 * Create the DO API using @dotdo/apis convention
 */
const doApi = API({
  name: 'do',
  description: 'Digital Object API - Every business entity IS a Durable Object',
  version: '1.0.0',

  // MCP endpoint enabled
  mcp: {
    name: 'do',
    version: '1.0.0',
    tools: [],
  },

  // Custom routes (non-CRUD endpoints)
  routes: (app: Hono<ApiEnv>) => {
    // Health routes - cast to unknown to avoid type mismatch between Env types
    app.route('/', createHealthRoutes() as unknown as Hono<ApiEnv>)

    // AI routes
    app.route('/', createAIRoutes() as unknown as Hono<ApiEnv>)

    // Root discovery
    app.get('/', (c: Context<ApiEnv>) => {
      const url = new URL(c.req.url)
      const colo = c.req.header('CF-Ray')?.split('-')[1]

      return c.json({
        api: url.hostname,
        data: {
          name: 'Digital Object API',
          description: 'Every business entity IS a Durable Object',
          version: '1.0.0',
        },
        links: {
          self: url.origin,
          identity: `${url.origin}/.do`,
          api: `${url.origin}/api`,
          rpc: `${url.origin}/rpc`,
          mcp: `${url.origin}/mcp`,
          health: `${url.origin}/_health`,
          ai: `${url.origin}/api/ai`,
          docs: 'https://do.md',
        },
        colo,
        timestamp: Date.now(),
      } as APIResponse<unknown>)
    })

    // DO Identity endpoint
    app.get('/.do', async (c: Context<ApiEnv>) => {
      const url = new URL(c.req.url)
      const colo = c.req.header('CF-Ray')?.split('-')[1]
      const env = c.env as unknown as Env

      try {
        const doId = env.DO.idFromName(url.hostname)
        const stub = env.DO.get(doId)

        const response = await stub.fetch(
          new Request('https://do/rpc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'rpc', id: `api-${Date.now()}`, method: 'do.identity.get', args: [] }),
          })
        )

        const result = (await response.json()) as { result?: unknown; error?: { message: string } }

        if (result.error) {
          throw new Error(result.error.message)
        }

        return c.json({
          api: url.hostname,
          data: result.result,
          links: {
            self: `${url.origin}/.do`,
            root: url.origin,
            api: `${url.origin}/api`,
            rpc: `${url.origin}/rpc`,
            mcp: `${url.origin}/mcp`,
            collections: `${url.origin}/api/collections`,
            schema: `${url.origin}/rpc/do.system.schema`,
          },
          colo,
          timestamp: Date.now(),
        } as APIResponse<unknown>)
      } catch (error) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'DO_ERROR',
              message: error instanceof Error ? error.message : 'Failed to get DO identity',
            },
            links: { self: `${url.origin}/.do`, root: url.origin },
            timestamp: Date.now(),
          },
          500
        )
      }
    })

    // RPC discovery endpoint
    app.get('/rpc', (c: Context<ApiEnv>) => {
      const url = new URL(c.req.url)
      const colo = c.req.header('CF-Ray')?.split('-')[1]

      return c.json({
        api: url.hostname,
        data: {
          description: 'RPC API - call methods via POST or explore via GET',
          usage: {
            post: 'POST /rpc with JSON body: { "method": "do.identity.get", "args": [] }',
            get: 'GET /rpc/{method} to see method info',
          },
        },
        links: {
          self: `${url.origin}/rpc`,
          identity: `${url.origin}/rpc/do.identity.get`,
          collections: `${url.origin}/rpc/do.collections.list`,
          system: `${url.origin}/rpc/do.system.schema`,
          ping: `${url.origin}/rpc/do.system.ping`,
          mcp: `${url.origin}/mcp`,
          api: `${url.origin}/.do`,
        },
        colo,
        timestamp: Date.now(),
      } as APIResponse<unknown>)
    })

    // RPC handler - POST /rpc
    app.post('/rpc', async (c: Context<ApiEnv>) => {
      const url = new URL(c.req.url)
      const env = c.env as unknown as Env

      try {
        const body = await c.req.json()
        const doId = env.DO.idFromName(url.hostname)
        const stub = env.DO.get(doId)

        const response = await stub.fetch(
          new Request(`${url.origin}/rpc`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        )

        return response
      } catch (error) {
        return c.json(
          {
            api: url.hostname,
            error: {
              code: 'RPC_ERROR',
              message: error instanceof Error ? error.message : 'RPC call failed',
            },
            links: { rpc: `${url.origin}/rpc` },
            timestamp: Date.now(),
          },
          500
        )
      }
    })

    // Catch-all: Route to DO
    app.all('*', async (c: Context<ApiEnv>) => {
      const url = new URL(c.req.url)
      const env = c.env as unknown as Env

      const doId = env.DO.idFromName(url.hostname)
      const stub = env.DO.get(doId)

      return stub.fetch(c.req.raw)
    })
  },
})

// =============================================================================
// Backwards Compatibility Exports
// =============================================================================

// The old API exported createApp and related functions. For backwards
// compatibility, we provide these as wrappers around the new convention-based API.

export interface AppConfig {
  cors?: boolean
  rateLimit?: boolean
  auth?: boolean
  logging?: boolean
  security?: boolean
  middleware?: Array<(c: unknown, next: () => Promise<void>) => Promise<void | Response>>
}

/**
 * Create a fully configured Hono app for the DO API
 * @deprecated Use the default export (doApi) instead for convention-based routing
 */
export function createApp(_config: AppConfig = {}): Hono<{ Bindings: Env; Variables: DOContext }> {
  // Return the convention-based app, cast to the expected type
  return doApi as unknown as Hono<{ Bindings: Env; Variables: DOContext }>
}

/**
 * @deprecated Use the default export (doApi) instead
 */
export function createMinimalApp(): Hono<{ Bindings: Env; Variables: DOContext }> {
  return createApp({})
}

/**
 * @deprecated Use the default export (doApi) instead
 */
export function createProductionApp(): Hono<{ Bindings: Env; Variables: DOContext }> {
  return createApp({ auth: true })
}

/**
 * @deprecated Use the default export (doApi) instead
 */
export function createDevelopmentApp(): Hono<{ Bindings: Env; Variables: DOContext }> {
  return createApp({ logging: true })
}

// =============================================================================
// Exports
// =============================================================================

// Re-export types
export type {
  Env,
  DOContext,
  AuthUser,
  AuthOptions,
  AuthResult,
  APIResponse,
  APIErrorResponse,
  PaginatedResponse,
  PaginationInfo,
  RateLimitConfig,
  RateLimitInfo,
  CORSConfig,
  HealthCheckResponse,
  AIGenerateRequest,
  AIChatRequest,
  AIEmbedRequest,
} from './types'

// Re-export routes that may be needed externally
export { createAIRoutes } from './routes/ai'
export { createHealthRoutes } from './routes/health'

// Re-export middleware (for backwards compatibility)
export {
  auth,
  requireAuth,
  apiKey,
  combined,
  getUser,
  requireUser,
  hasRole,
  hasPermission,
  isAuthenticated,
  getToken,
  createCorsMiddleware,
  createDynamicCorsMiddleware,
  createRateLimitMiddleware,
  createAIRateLimitMiddleware,
  createWriteRateLimitMiddleware,
  createContextMiddleware,
  createLoggingMiddleware,
  createErrorMiddleware,
  createSecurityMiddleware,
  composeMiddleware,
} from './middleware'

export type { AuthOptions as OAuthOptions, RequireAuthOptions, ApiKeyOptions, AuthVariables } from './middleware'

// MCP exports (for backwards compatibility)
export { createMCPRoutes, getTools, handleListTools, handleToolCall, handleInitialize } from './mcp'

export type { MCPServerInfo, MCPTool, MCPContent, MCPRequest, MCPToolCallResponse, MCPListToolsResponse } from './mcp'

// Default export
export default doApi
