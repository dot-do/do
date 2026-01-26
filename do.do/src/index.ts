/**
 * do.do - Universal DO Runtime & Service Hub
 *
 * One binding to rule them all.
 *
 * Instead of every worker needing bindings to auth, stripe, esbuild, etc.,
 * they just need ONE binding to do.do which has all capabilities.
 *
 * Usage in user's worker:
 * ```typescript
 * // wrangler.jsonc: { "services": [{ "binding": "DO", "service": "do-do" }] }
 *
 * await env.DO.auth.verify(token)
 * await env.DO.stripe.customers.create({ email })
 * await env.DO.ai.generate(prompt)
 *
 * const startup = await env.DO.get('startup.do')
 * await startup.customers.create({ name: 'Acme' })
 * ```
 */

export interface Env {
  // Service bindings to specialized workers
  AUTH: Fetcher
  OAUTH: Fetcher
  MCP: Fetcher
  ESBUILD: Fetcher
  STRIPE: Fetcher
  GITHUB: Fetcher
  AI: Fetcher
  OBJECTS: Fetcher

  // Hub DO for caching/coordination
  HUB: DurableObjectNamespace
}

/**
 * The hub exposes all services through a unified RPC interface
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // Route to appropriate service
    if (path.startsWith('/auth')) {
      return env.AUTH.fetch(rewritePath(request, '/auth'))
    }
    if (path.startsWith('/oauth')) {
      return env.OAUTH.fetch(rewritePath(request, '/oauth'))
    }
    if (path.startsWith('/mcp')) {
      return env.MCP.fetch(rewritePath(request, '/mcp'))
    }
    if (path.startsWith('/esbuild')) {
      return env.ESBUILD.fetch(rewritePath(request, '/esbuild'))
    }
    if (path.startsWith('/stripe')) {
      return env.STRIPE.fetch(rewritePath(request, '/stripe'))
    }
    if (path.startsWith('/github')) {
      return env.GITHUB.fetch(rewritePath(request, '/github'))
    }
    if (path.startsWith('/ai')) {
      return env.AI.fetch(rewritePath(request, '/ai'))
    }

    // Handle unified RPC calls
    if (path === '/rpc' || path === '/') {
      return handleRPC(request, env)
    }

    // Route to objects.do for DO operations
    // objects.do/:id pattern
    return env.OBJECTS.fetch(request)
  }
}

/**
 * Handle unified RPC requests that can call any service
 */
async function handleRPC(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }

  try {
    const body = await request.json() as { method: string; params?: unknown[] }
    const { method, params = [] } = body

    // Parse service.method pattern
    const [service, ...methodParts] = method.split('.')
    const methodName = methodParts.join('.')

    // Route to appropriate service
    const serviceEnv = getService(service, env)
    if (!serviceEnv) {
      return Response.json({
        error: { code: -32601, message: `Service not found: ${service}` }
      }, { status: 404 })
    }

    // Forward RPC call to service
    const response = await serviceEnv.fetch(new Request('http://internal/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: methodName, params })
    }))

    return response
  } catch (err: any) {
    return Response.json({
      error: { code: -32603, message: err.message }
    }, { status: 500 })
  }
}

function getService(name: string, env: Env): Fetcher | null {
  const services: Record<string, Fetcher> = {
    auth: env.AUTH,
    oauth: env.OAUTH,
    mcp: env.MCP,
    esbuild: env.ESBUILD,
    stripe: env.STRIPE,
    github: env.GITHUB,
    ai: env.AI,
    objects: env.OBJECTS,
    do: env.OBJECTS, // alias
  }
  return services[name.toLowerCase()] || null
}

function rewritePath(request: Request, prefix: string): Request {
  const url = new URL(request.url)
  url.pathname = url.pathname.slice(prefix.length) || '/'
  return new Request(url.toString(), request)
}

/**
 * Hub DO for coordination and caching
 */
export class HubDO implements DurableObject {
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    // Hub can cache service responses, coordinate across requests, etc.
    return new Response('HubDO')
  }
}
