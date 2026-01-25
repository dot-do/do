/**
 * Benchmark 01: Bare Minimum Durable Object
 *
 * This is the absolute minimum DO - just extends DurableObject.
 * Used to measure baseline DO overhead.
 */
import { DurableObject } from 'cloudflare:workers'

export class BareMinimumDO extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    return new Response('ok')
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.DO.idFromName('singleton')
    const stub = env.DO.get(id)
    return stub.fetch(request)
  },
}

interface Env {
  DO: DurableObjectNamespace<BareMinimumDO>
}
