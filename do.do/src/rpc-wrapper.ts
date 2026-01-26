/**
 * RPC() Wrapper - Expose any library as an RPC service
 *
 * Usage:
 * ```typescript
 * // esbuild.do/index.ts
 * import * as esbuild from 'esbuild'
 * export default RPC(esbuild)
 *
 * // stripe.do/index.ts
 * import Stripe from 'stripe'
 * export default RPC(new Stripe(env.STRIPE_KEY))
 *
 * // ai.do/index.ts
 * import { OpenAI } from 'openai'
 * export default RPC(new OpenAI())
 * ```
 *
 * The wrapper automatically:
 * - Exposes all methods via JSON-RPC
 * - Handles async/sync methods
 * - Generates __schema from the object structure
 * - Handles nested namespaces
 */

type RPCTarget = Record<string, unknown> | ((...args: unknown[]) => unknown)

interface RPCRequest {
  method: string
  params?: unknown[]
  id?: string | number
}

interface RPCResponse {
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
  id?: string | number
}

/**
 * Create an RPC worker from any object/library
 */
export function RPC<T extends RPCTarget>(
  target: T | ((env: unknown) => T | Promise<T>)
): ExportedHandler {
  return {
    async fetch(request: Request, env: unknown): Promise<Response> {
      // Resolve target (may be a factory function)
      const resolvedTarget = typeof target === 'function' && !isCallableMethod(target)
        ? await (target as (env: unknown) => T | Promise<T>)(env)
        : target as T

      const url = new URL(request.url)

      // Schema endpoint
      if (url.pathname === '/__schema') {
        return Response.json(generateSchema(resolvedTarget))
      }

      // Health check
      if (url.pathname === '/health' || url.pathname === '/ping') {
        return Response.json({ status: 'ok' })
      }

      // RPC endpoint
      if (request.method === 'POST') {
        return handleRPC(request, resolvedTarget)
      }

      // REST-style: GET /method/arg1/arg2
      if (request.method === 'GET' && url.pathname !== '/') {
        return handleREST(url, resolvedTarget)
      }

      return Response.json({
        name: 'RPC Service',
        endpoints: {
          'POST /': 'JSON-RPC endpoint',
          'GET /__schema': 'API schema',
          'GET /health': 'Health check',
        }
      })
    }
  }
}

async function handleRPC(request: Request, target: RPCTarget): Promise<Response> {
  try {
    const body = await request.json() as RPCRequest | RPCRequest[]

    // Batch request
    if (Array.isArray(body)) {
      const results = await Promise.all(
        body.map(req => executeRPC(req, target))
      )
      return Response.json(results)
    }

    // Single request
    const result = await executeRPC(body, target)
    return Response.json(result)
  } catch (err: any) {
    return Response.json({
      error: { code: -32700, message: 'Parse error', data: err.message }
    }, { status: 400 })
  }
}

async function executeRPC(req: RPCRequest, target: RPCTarget): Promise<RPCResponse> {
  const { method, params = [], id } = req

  try {
    // Resolve method path (e.g., "customers.create" -> target.customers.create)
    const fn = resolveMethod(target, method)
    if (!fn) {
      return { error: { code: -32601, message: `Method not found: ${method}` }, id }
    }

    // Execute
    const result = await fn(...params)
    return { result, id }
  } catch (err: any) {
    return {
      error: { code: -32603, message: err.message, data: err.stack },
      id
    }
  }
}

async function handleREST(url: URL, target: RPCTarget): Promise<Response> {
  // Parse /method/arg1/arg2
  const parts = url.pathname.slice(1).split('/')
  const method = parts[0]
  const args = parts.slice(1).map(decodeURIComponent)

  const fn = resolveMethod(target, method)
  if (!fn) {
    return Response.json({ error: `Method not found: ${method}` }, { status: 404 })
  }

  try {
    const result = await fn(...args)
    return Response.json({ result })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

function resolveMethod(target: RPCTarget, path: string): ((...args: unknown[]) => unknown) | null {
  const parts = path.split('.')
  let current: unknown = target

  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return null
    }
    current = (current as Record<string, unknown>)[part]
  }

  if (typeof current === 'function') {
    // Bind to parent for proper `this` context
    const parent = parts.length > 1
      ? resolveMethod(target, parts.slice(0, -1).join('.'))
      : target
    return current.bind(parent) as (...args: unknown[]) => unknown
  }

  return null
}

function generateSchema(target: RPCTarget, prefix = ''): object {
  const methods: Array<{ name: string; path: string }> = []
  const namespaces: Array<{ name: string; methods: Array<{ name: string; path: string }> }> = []

  for (const [key, value] of Object.entries(target)) {
    if (key.startsWith('_')) continue // Skip private

    const path = prefix ? `${prefix}.${key}` : key

    if (typeof value === 'function') {
      methods.push({ name: key, path })
    } else if (value && typeof value === 'object') {
      // Nested namespace
      const nested = generateSchema(value as RPCTarget, path) as { methods: typeof methods }
      if (nested.methods.length > 0) {
        namespaces.push({ name: key, methods: nested.methods })
      }
    }
  }

  return { version: 1, methods, namespaces }
}

function isCallableMethod(fn: unknown): fn is (...args: unknown[]) => unknown {
  // Check if it's a bound method or arrow function vs a factory
  return typeof fn === 'function' && fn.length === 0 && fn.toString().includes('=>')
}

export default RPC
