/**
 * objects.do - Universal DO Runtime & Service Hub
 *
 * - `do` = universal RPC execution (service hub)
 * - `DO` = Digital/Durable Object (the universal runtime class)
 *
 * Usage in any worker:
 * ```jsonc
 * // wrangler.jsonc
 * { "services": [{ "binding": "do", "service": "objects-do" }] }
 * ```
 *
 * ```typescript
 * // Access services via `do`
 * await env.do.auth.verify(token)
 * await env.do.stripe.customers.create({ email })
 * await env.do.ai.generate(prompt)
 *
 * // Access any DO via `do`
 * const startup = await env.do.get('startup.do')
 * await startup.customers.create({ name: 'Acme' })
 * ```
 */

// =============================================================================
// Type Exports
// =============================================================================

export type {
  DODefinition,
  APIDefinition,
  APIMethodOrNamespace,
  APIMethodDefinition,
  AgentDefinition,
  AgentVoiceConfig,
  ModelSelector,
  DOContext,
  AIContext,
  DBContext,
  DBCollection,
  FSXContext,
  GitXContext,
  BashXContext,
  LogContext,
  StripeContext,
  TaggedTemplate,
  ExecutionResult,
  ExecutionError,
  LogEntry,
  RPCRequest,
  RPCResponse,
  RPCError,
  RegistryEntry,
  AccessControl,
  RegistryMetrics,
  ListOptions,
  GitCommit,
  GitStatus,
  BashResult,
  StripeCustomer,
  StripeSubscription,
  StripePaymentIntent,
  R2Bucket,
  R2Object,
  R2ListOptions,
  R2Objects,
  DurableObjectNamespace,
  DurableObjectId,
  DurableObjectStub,
  Fetcher,
  // Service interfaces (chainable RPC)
  MDXService,
  MDXCompileOptions,
  MDXEvaluateOptions,
  MDXRenderOptions,
  AuthService,
  OAuthService,
  GitHubService,
  ESBuildService,
  ESBuildBuildOptions,
  ESBuildTransformOptions,
  MCPService,
} from './types'

// =============================================================================
// Schema Exports
// =============================================================================

export {
  DODefinitionSchema,
  DODefinitionStrictSchema,
  APIDefinitionSchema,
  APIMethodDefinitionSchema,
  AgentDefinitionSchema,
  validateDODefinition,
  validateDODefinitionStrict,
  safeParseDODefinition,
  validateRPCRequest,
  RPC_ERROR_CODES,
  createRPCError,
  createRPCSuccess,
} from './schema'

// =============================================================================
// Context & Executor Exports
// =============================================================================

export { createContext, type CreateContextOptions } from './context'
export { executeFunction, validateFunctionCode, type ExecuteOptions } from './executor'

// =============================================================================
// DO Class Export
// =============================================================================

export { DO } from './DO'

// =============================================================================
// Error & CORS Exports
// =============================================================================

export { APIError, ERROR_CODES, type ErrorCode, unauthorized, invalidToken, forbidden, notFound, invalidJSON, internalError } from './errors'

export { CORS_HEADERS, jsonResponse, errorResponse, preflightResponse, handlePreflight, addCorsHeaders } from './cors'

// =============================================================================
// Auth Export
// =============================================================================

export { authenticate, type AuthResult, requiresAuth } from './auth'

// =============================================================================
// Registry Export
// =============================================================================

export { handleRegistryAPI, extractSchema } from './registry'

// =============================================================================
// Worker Environment
// =============================================================================

export interface Env {
  // The universal DO class
  DO: DurableObjectNamespace

  // DO definition registry
  REGISTRY: R2Bucket

  // Service bindings to specialized workers
  AUTH: Fetcher
  OAUTH: Fetcher
  MCP: Fetcher
  ESBUILD: Fetcher
  STRIPE: Fetcher
  GITHUB: Fetcher
  AI: Fetcher
  MDX: Fetcher
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): DurableObjectStub
}

interface DurableObjectId {
  toString(): string
}

interface DurableObjectStub {
  fetch(request: Request): Promise<Response>
}

interface R2Bucket {
  get(key: string): Promise<R2Object | null>
  put(key: string, value: string | ArrayBuffer | ReadableStream): Promise<R2Object>
  delete(key: string): Promise<void>
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ objects: R2Object[]; truncated: boolean; cursor?: string }>
}

interface R2Object {
  key: string
  body: ReadableStream
  text(): Promise<string>
  json<T = unknown>(): Promise<T>
}

interface Fetcher {
  fetch(request: Request): Promise<Response>
}

// =============================================================================
// Worker Entry Point - The Service Hub (`do`)
// =============================================================================

import { handleRegistryAPI } from './registry'
import { handlePreflight } from './cors'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const host = url.hostname
    const method = request.method

    // Handle OPTIONS preflight
    const preflightResponse = handlePreflight(request)
    if (preflightResponse) {
      return preflightResponse
    }

    // Registry API routes
    if (path.startsWith('/registry')) {
      return handleRegistryAPI(request, env, path, method, url)
    }

    // Service routing by path prefix
    if (path.startsWith('/auth/') || path === '/auth') {
      return routeToService(env.AUTH, request, '/auth')
    }
    if (path.startsWith('/oauth/') || path === '/oauth') {
      return routeToService(env.OAUTH, request, '/oauth')
    }
    if (path.startsWith('/mcp/') || path === '/mcp') {
      return routeToService(env.MCP, request, '/mcp')
    }
    if (path.startsWith('/esbuild/') || path === '/esbuild') {
      return routeToService(env.ESBUILD, request, '/esbuild')
    }
    if (path.startsWith('/stripe/') || path === '/stripe') {
      return routeToService(env.STRIPE, request, '/stripe')
    }
    if (path.startsWith('/github/') || path === '/github') {
      return routeToService(env.GITHUB, request, '/github')
    }
    if (path.startsWith('/ai/') || path === '/ai') {
      return routeToService(env.AI, request, '/ai')
    }
    if (path.startsWith('/mdx/') || path === '/mdx') {
      return routeToService(env.MDX, request, '/mdx')
    }

    // Unified RPC endpoint - routes to any service
    if (path === '/rpc' && request.method === 'POST') {
      return handleUnifiedRPC(request, env)
    }

    // Health check
    if (path === '/health' || path === '/ping') {
      return Response.json({ status: 'ok', service: 'objects.do' })
    }

    // Schema for the hub itself
    if (path === '/__schema') {
      return Response.json({
        version: 1,
        services: ['auth', 'oauth', 'mcp', 'esbuild', 'stripe', 'github', 'ai', 'mdx'],
        description: 'objects.do - Universal DO Runtime & Service Hub',
        usage: {
          do: 'Service binding name for RPC execution',
          DO: 'Durable Object class for Digital Objects',
        },
      })
    }

    // Everything else routes to the DO
    const doId = extractDOId(host, path)
    if (!doId) {
      return Response.json({
        name: 'objects.do',
        description: 'Universal DO Runtime & Service Hub',
        bindings: {
          do: 'Universal RPC execution (services + DOs)',
          DO: 'Digital/Durable Object class',
        },
        services: ['auth', 'oauth', 'mcp', 'esbuild', 'stripe', 'github', 'ai', 'mdx'],
        usage: {
          services: 'GET /auth, /oauth, /stripe, /github, /ai, /esbuild, /mcp',
          rpc: 'POST /rpc { method: "service.method", params: [...] }',
          do: 'GET|POST /:doId/...',
        },
      })
    }

    // Route to the DO
    const id = env.DO.idFromName(doId)
    const stub = env.DO.get(id)

    // Rewrite the path to remove the DO ID prefix if present
    const doPath = path.startsWith(`/${doId}`) ? path.slice(doId.length + 1) || '/' : path

    const doUrl = new URL(request.url)
    doUrl.pathname = doPath

    return stub.fetch(new Request(doUrl.toString(), request))
  },
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Routes a request to a service binding
 */
function routeToService(service: Fetcher, request: Request, prefix: string): Promise<Response> {
  const url = new URL(request.url)
  url.pathname = url.pathname.slice(prefix.length) || '/'
  return service.fetch(new Request(url.toString(), request))
}

/**
 * Handles unified RPC requests that route to services
 */
async function handleUnifiedRPC(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as { method: string; params?: unknown[]; id?: string | number }
    const { method, params = [], id } = body

    const dotIndex = method.indexOf('.')
    if (dotIndex === -1) {
      return Response.json(
        {
          error: { code: -32601, message: 'Method must be service.method format' },
          id,
        },
        { status: 400 }
      )
    }

    const service = method.slice(0, dotIndex)
    const serviceMethod = method.slice(dotIndex + 1)

    const fetcher = getService(service, env)
    if (!fetcher) {
      return Response.json(
        {
          error: { code: -32601, message: `Unknown service: ${service}` },
          id,
        },
        { status: 404 }
      )
    }

    return fetcher.fetch(
      new Request('http://internal/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: serviceMethod, params, id }),
      })
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json(
      {
        error: { code: -32700, message },
      },
      { status: 400 }
    )
  }
}

/**
 * Gets a service fetcher by name
 */
function getService(name: string, env: Env): Fetcher | null {
  const services: Record<string, Fetcher | undefined> = {
    auth: env.AUTH,
    oauth: env.OAUTH,
    mcp: env.MCP,
    esbuild: env.ESBUILD,
    stripe: env.STRIPE,
    github: env.GITHUB,
    ai: env.AI,
    mdx: env.MDX,
  }
  return services[name.toLowerCase()] || null
}

/**
 * Extracts the DO ID from host or path
 */
function extractDOId(host: string, path: string): string | null {
  // If hostname is not objects.do, the hostname IS the DO ID
  if (!host.includes('objects.do') && !host.includes('localhost')) {
    return host
  }

  // Extract from path: /:doId/...
  const match = path.match(/^\/([^/]+\.do)(\/|$)/)
  if (match) {
    return match[1]
  }

  // Check for any path segment that looks like a DO ID
  const segments = path.split('/').filter(Boolean)
  if (segments.length > 0 && segments[0].includes('.')) {
    return segments[0]
  }

  return null
}

// =============================================================================
// RPC Wrapper - for creating service workers
// =============================================================================

type RPCTarget = Record<string, unknown>

/**
 * RPC() Wrapper - Expose any library as an RPC service
 *
 * ```typescript
 * // esbuild.do
 * export default RPC(esbuild)
 *
 * // stripe.do
 * export default RPC((env) => new Stripe(env.STRIPE_KEY))
 * ```
 */
export function RPC<T extends RPCTarget>(target: T | ((env: unknown) => T | Promise<T>)): ExportedHandler {
  return {
    async fetch(request: Request, env: unknown): Promise<Response> {
      const resolvedTarget = typeof target === 'function' ? await (target as (env: unknown) => T | Promise<T>)(env) : target

      const url = new URL(request.url)

      if (url.pathname === '/__schema') {
        return Response.json(generateRPCSchema(resolvedTarget))
      }

      if (url.pathname === '/health' || url.pathname === '/ping') {
        return Response.json({ status: 'ok' })
      }

      if (request.method === 'POST') {
        return handleServiceRPC(request, resolvedTarget)
      }

      return Response.json({ endpoints: ['POST /', 'GET /__schema'] })
    },
  }
}

/**
 * Handles RPC requests to a service target
 */
async function handleServiceRPC(request: Request, target: RPCTarget): Promise<Response> {
  try {
    const { method, params = [], id } = (await request.json()) as {
      method: string
      params?: unknown[]
      id?: string | number
    }

    const fn = resolveMethod(target, method)
    if (!fn) {
      return Response.json({ error: { code: -32601, message: `Method not found: ${method}` }, id })
    }

    const result = await fn(...params)
    return Response.json({ result, id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: { code: -32603, message } }, { status: 500 })
  }
}

/**
 * Resolves a method path to a callable function
 */
function resolveMethod(target: RPCTarget, path: string): ((...args: unknown[]) => unknown) | null {
  const parts = path.split('.')
  let current: unknown = target

  for (const part of parts) {
    if (current == null || typeof current !== 'object') return null
    current = (current as Record<string, unknown>)[part]
  }

  if (typeof current === 'function') {
    const parent = parts.length > 1 ? resolveMethod(target, parts.slice(0, -1).join('.')) : target
    return current.bind(parent) as (...args: unknown[]) => unknown
  }

  return null
}

/**
 * Generates RPC schema from a target object
 */
function generateRPCSchema(target: RPCTarget, prefix = ''): object {
  const methods: Array<{ name: string; path: string }> = []
  const namespaces: Array<{ name: string; methods: Array<{ name: string; path: string }> }> = []

  for (const [key, value] of Object.entries(target)) {
    if (key.startsWith('_')) continue
    const path = prefix ? `${prefix}.${key}` : key

    if (typeof value === 'function') {
      methods.push({ name: key, path })
    } else if (value && typeof value === 'object') {
      const nested = generateRPCSchema(value as RPCTarget, path) as { methods: typeof methods }
      if (nested.methods.length > 0) {
        namespaces.push({ name: key, methods: nested.methods })
      }
    }
  }

  return { version: 1, methods, namespaces }
}

interface ExportedHandler {
  fetch(request: Request, env: unknown): Promise<Response>
}
