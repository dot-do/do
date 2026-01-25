/**
 * Benchmark 04: Minimal Routing Strategies
 *
 * Pure inline routing logic without external deps.
 * Measures routing overhead only.
 */
import { DurableObject } from 'cloudflare:workers'

type Strategy = 'user' | 'hostname' | 'hostname-user' | 'tenant-user'

export class RoutedDO extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    return Response.json({
      id: this.ctx.id.toString(),
      name: this.ctx.id.name,
    })
  }
}

function getDOId(env: Env, request: Request): DurableObjectId {
  const url = new URL(request.url)
  const strategy = (env.ROUTING_STRATEGY || 'hostname-user') as Strategy
  const hostname = url.hostname
  const userId = request.headers.get('x-user-id') || 'anon'

  switch (strategy) {
    case 'user':
      return env.DO.idFromName(`u:${userId}`)
    case 'hostname':
      return env.DO.idFromName(`h:${hostname}`)
    case 'hostname-user':
      return env.DO.idFromName(`h:${hostname}:u:${userId}`)
    case 'tenant-user': {
      const tenant = url.pathname.split('/')[1] || 'default'
      return env.DO.idFromName(`t:${tenant}:u:${userId}`)
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = getDOId(env, request)
    return env.DO.get(id).fetch(request)
  },
}

interface Env {
  DO: DurableObjectNamespace<RoutedDO>
  ROUTING_STRATEGY?: string
}
