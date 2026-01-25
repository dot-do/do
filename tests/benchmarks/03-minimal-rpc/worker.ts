/**
 * Benchmark 03: Minimal Inline RPC
 *
 * Hand-rolled minimal JSON-RPC over WebSocket/HTTP.
 * No external dependencies - measures pure RPC overhead.
 */
import { DurableObject } from 'cloudflare:workers'

interface RpcRequest {
  jsonrpc: '2.0'
  method: string
  params?: unknown[]
  id?: string | number
}

interface RpcResponse {
  jsonrpc: '2.0'
  result?: unknown
  error?: { code: number; message: string }
  id?: string | number
}

export class MinimalRpcDO extends DurableObject<Env> {
  // RPC methods
  private methods: Record<string, (...args: unknown[]) => Promise<unknown>> = {
    ping: async () => 'pong',
    echo: async (msg: string) => msg,
    add: async (a: number, b: number) => a + b,
    getTime: async () => new Date().toISOString(),
  }

  async fetch(request: Request): Promise<Response> {
    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair()
      this.ctx.acceptWebSocket(pair[1])
      return new Response(null, { status: 101, webSocket: pair[0] })
    }

    // HTTP JSON-RPC
    if (request.method === 'POST') {
      const req = (await request.json()) as RpcRequest
      const response = await this.handleRpc(req)
      return Response.json(response)
    }

    return new Response('ok')
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const req = JSON.parse(message as string) as RpcRequest
    const response = await this.handleRpc(req)
    ws.send(JSON.stringify(response))
  }

  private async handleRpc(req: RpcRequest): Promise<RpcResponse> {
    const method = this.methods[req.method]
    if (!method) {
      return { jsonrpc: '2.0', error: { code: -32601, message: 'Method not found' }, id: req.id }
    }
    try {
      const result = await method(...(req.params || []))
      return { jsonrpc: '2.0', result, id: req.id }
    } catch (e) {
      return { jsonrpc: '2.0', error: { code: -32000, message: String(e) }, id: req.id }
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const match = url.pathname.match(/^\/do\/([^/]+)/)
    const name = match?.[1] || 'default'
    const id = env.DO.idFromName(name)
    return env.DO.get(id).fetch(request)
  },
}

interface Env {
  DO: DurableObjectNamespace<MinimalRpcDO>
}
