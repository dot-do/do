/**
 * Benchmark 08: sdb DO Only (no Hono, no worker routes)
 *
 * Tests just the SDB Durable Object without HTTP layer.
 */
import { DurableObject } from 'cloudflare:workers'

// Would be: import { SDB } from '@dotdo/sdb/do' or similar
// For now, minimal inline to show what the baseline could be

export class MinimalSDB extends DurableObject<Env> {
  private things = new Map<string, any>()
  private actions: any[] = []

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'POST') {
      const body = await request.json() as { method: string; params: any[] }
      const result = await this.rpc(body.method, body.params)
      return Response.json({ result })
    }

    return Response.json({
      things: this.things.size,
      actions: this.actions.length
    })
  }

  private async rpc(method: string, params: any[]): Promise<any> {
    switch (method) {
      case 'things.get':
        return this.things.get(params[0]) || null
      case 'things.put':
        this.things.set(params[0], params[1])
        this.actions.push({ verb: 'put', to: params[0], at: Date.now() })
        return { ok: true }
      case 'things.list':
        return Array.from(this.things.values())
      default:
        throw new Error(`Unknown method: ${method}`)
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.DO.idFromName('default')
    return env.DO.get(id).fetch(request)
  },
}

interface Env {
  DO: DurableObjectNamespace<MinimalSDB>
}
