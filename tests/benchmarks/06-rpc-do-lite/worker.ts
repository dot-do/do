/**
 * Benchmark 06: rpc.do/lite (minimal DurableRPC)
 *
 * Uses the new /lite entry point from @dotdo/rpc
 * No colo.do, no collections - just RPC.
 */

// This would use: import { DurableRPC } from '@dotdo/rpc/lite'
// For now, inline minimal version to measure baseline

import { DurableObject } from 'cloudflare:workers'

// Minimal inline RPC - simulating what rpc.do/lite provides
export class LiteRpcDO extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair()
      this.ctx.acceptWebSocket(pair[1])
      return new Response(null, { status: 101, webSocket: pair[0] })
    }

    if (request.method === 'POST') {
      const body = await request.json() as { method: string; params?: unknown[] }
      const result = await this.handleRpc(body.method, body.params || [])
      return Response.json({ result })
    }

    return Response.json({ schema: this.getSchema() })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return
    const body = JSON.parse(message) as { method: string; params?: unknown[]; id?: number }
    const result = await this.handleRpc(body.method, body.params || [])
    ws.send(JSON.stringify({ result, id: body.id }))
  }

  private async handleRpc(method: string, params: unknown[]): Promise<unknown> {
    const fn = (this as any)[method]
    if (typeof fn !== 'function') throw new Error(`Unknown method: ${method}`)
    return fn.apply(this, params)
  }

  getSchema() {
    return { methods: ['ping', 'echo', 'add'] }
  }

  // RPC methods
  ping() { return 'pong' }
  echo(msg: string) { return msg }
  add(a: number, b: number) { return a + b }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.DO.idFromName('default')
    return env.DO.get(id).fetch(request)
  },
}

interface Env {
  DO: DurableObjectNamespace<LiteRpcDO>
}
