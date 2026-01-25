/**
 * Benchmark 05: Worker using rpc.do package
 *
 * Measures overhead of importing rpc.do for client-side RPC.
 * DO is still inline, but worker uses rpc.do for proxying.
 */
import { DurableObject } from 'cloudflare:workers'
import { RPC } from 'rpc.do'

// Simple inline DO (no rpc.do server-side)
export class SimpleDO extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'POST') {
      const body = await request.json()
      return Response.json({ echo: body, timestamp: Date.now() })
    }
    return Response.json({ status: 'ok', id: this.ctx.id.toString() })
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Forward to DO
    const name = url.pathname.split('/')[1] || 'default'
    const id = env.DO.idFromName(name)
    return env.DO.get(id).fetch(request)
  },
}

interface Env {
  DO: DurableObjectNamespace<SimpleDO>
}
