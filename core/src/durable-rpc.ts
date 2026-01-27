/**
 * DurableRPC - RPC-enabled Durable Object base class
 *
 * Based on @dotdo/rpc/lite but with proper DurableObject import
 */

import { DurableObject } from 'cloudflare:workers'
import {
  RpcSession,
  RpcTarget,
  newHttpBatchRpcResponse,
  HibernatableWebSocketTransport,
  TransportRegistry,
  type RpcSessionOptions,
} from '@dotdo/capnweb/server'

const SKIP_PROPS = new Set([
  'fetch', 'alarm', 'webSocketMessage', 'webSocketClose', 'webSocketError',
  'constructor', 'getSchema', 'broadcast', 'connectionCount',
  'sql', 'storage', 'state', 'ctx', 'env',
  '_currentRequest', '_transportRegistry', '_sessions', '_rpcInterface',
  'handleWebSocketUpgrade', 'handleHttpRpc', 'getRpcInterface', 'getRpcSessionOptions',
])

export interface RpcMethodSchema {
  name: string
  path: string
  params: number
}

export interface RpcNamespaceSchema {
  name: string
  methods: RpcMethodSchema[]
}

export interface RpcSchema {
  version: 1
  methods: RpcMethodSchema[]
  namespaces: RpcNamespaceSchema[]
}

class RpcInterface extends RpcTarget {
  constructor(private instance: DurableRPC) {
    super()
    this.exposeInterface()
  }

  private exposeInterface(): void {
    const seen = new Set<string>()
    const collect = (obj: unknown) => {
      if (!obj || obj === Object.prototype) return
      for (const key of Object.getOwnPropertyNames(obj)) {
        if (seen.has(key) || SKIP_PROPS.has(key) || key.startsWith('_')) continue
        seen.add(key)
        let value: unknown
        try { value = (this.instance as any)[key] } catch { continue }
        if (typeof value === 'function') {
          (this as any)[key] = value.bind(this.instance)
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
          const ns: Record<string, Function> = {}
          for (const k of Object.keys(value as object)) {
            if (typeof (value as any)[k] === 'function') {
              ns[k] = (value as any)[k].bind(value)
            }
          }
          if (Object.keys(ns).length > 0) (this as any)[key] = ns
        }
      }
    }
    collect(this.instance)
    let proto = Object.getPrototypeOf(this.instance)
    while (proto && proto !== DurableRPC.prototype && proto !== Object.prototype) {
      collect(proto)
      proto = Object.getPrototypeOf(proto)
    }
  }

  __schema() { return this.instance.getSchema() }
}

export class DurableRPC extends DurableObject {
  private _transportRegistry = new TransportRegistry()
  private _sessions = new Map<WebSocket, RpcSession>()
  private _rpcInterface?: RpcInterface
  protected _currentRequest?: Request

  get sql(): SqlStorage { return this.ctx.storage.sql }
  get storage(): DurableObjectStorage { return this.ctx.storage }
  get state(): DurableObjectState { return this.ctx }

  private getRpcInterface(): RpcInterface {
    if (!this._rpcInterface) {
      this._rpcInterface = new RpcInterface(this)
    }
    return this._rpcInterface
  }

  protected getRpcSessionOptions(): RpcSessionOptions {
    return {
      onSendError: (error: Error) => {
        console.error('[DurableRPC] Error:', error.message)
        return new Error(error.message)
      },
    }
  }

  override async fetch(request: Request): Promise<Response> {
    this._currentRequest = request
    if (request.method === 'GET') {
      const url = new URL(request.url)
      if (url.pathname === '/__schema' || url.pathname === '/') {
        return Response.json(this.getSchema())
      }
    }
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request)
    }
    return this.handleHttpRpc(request)
  }

  private handleWebSocketUpgrade(request: Request): Response {
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.ctx.acceptWebSocket(server)
    const transport = new HibernatableWebSocketTransport(server)
    this._transportRegistry.register(transport)
    const session = new RpcSession(transport, this.getRpcInterface(), this.getRpcSessionOptions())
    this._sessions.set(server, session)
    server.serializeAttachment({ transportId: transport.id })
    return new Response(null, { status: 101, webSocket: client })
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return
    let transport: HibernatableWebSocketTransport | undefined
    try {
      const attachment = ws.deserializeAttachment() as { transportId?: string } | null
      if (attachment?.transportId) transport = this._transportRegistry.get(attachment.transportId)
    } catch {}
    if (!transport) {
      transport = new HibernatableWebSocketTransport(ws)
      this._transportRegistry.register(transport)
      const session = new RpcSession(transport, this.getRpcInterface(), this.getRpcSessionOptions())
      this._sessions.set(ws, session)
      ws.serializeAttachment({ transportId: transport.id })
    }
    transport.enqueueMessage(message)
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      const attachment = ws.deserializeAttachment() as { transportId?: string } | null
      if (attachment?.transportId) {
        const transport = this._transportRegistry.get(attachment.transportId)
        if (transport) {
          transport.handleClose(1000, 'closed')
          this._transportRegistry.remove(attachment.transportId)
        }
      }
    } catch {}
    this._sessions.delete(ws)
  }

  override async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    const err = error instanceof Error ? error : new Error(String(error))
    try {
      const attachment = ws.deserializeAttachment() as { transportId?: string } | null
      if (attachment?.transportId) {
        const transport = this._transportRegistry.get(attachment.transportId)
        if (transport) {
          transport.handleError(err)
          this._transportRegistry.remove(attachment.transportId)
        }
      }
    } catch {}
    this._sessions.delete(ws)
  }

  private async handleHttpRpc(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }
    try {
      return await newHttpBatchRpcResponse(request, this.getRpcInterface(), this.getRpcSessionOptions())
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'RPC error'
      return Response.json({ error: message }, { status: 500 })
    }
  }

  getSchema(): RpcSchema {
    const methods: RpcMethodSchema[] = []
    const namespaces: RpcNamespaceSchema[] = []
    const seen = new Set<string>()
    const collect = (obj: any) => {
      if (!obj || obj === Object.prototype) return
      for (const key of Object.getOwnPropertyNames(obj)) {
        if (seen.has(key) || SKIP_PROPS.has(key) || key.startsWith('_')) continue
        seen.add(key)
        let value: any
        try { value = (this as any)[key] } catch { continue }
        if (typeof value === 'function') {
          methods.push({ name: key, path: key, params: value.length })
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
          const nsMethods: RpcMethodSchema[] = []
          for (const k of Object.keys(value)) {
            if (typeof value[k] === 'function') {
              nsMethods.push({ name: k, path: `${key}.${k}`, params: value[k].length })
            }
          }
          if (nsMethods.length > 0) namespaces.push({ name: key, methods: nsMethods })
        }
      }
    }
    collect(this)
    let proto = Object.getPrototypeOf(this)
    while (proto && proto !== DurableRPC.prototype && proto !== Object.prototype) {
      collect(proto)
      proto = Object.getPrototypeOf(proto)
    }
    return { version: 1, methods, namespaces }
  }

  broadcast(message: unknown, exclude?: WebSocket): void {
    const sockets = this.ctx.getWebSockets()
    const data = typeof message === 'string' ? message : JSON.stringify(message)
    for (const ws of sockets) {
      if (ws !== exclude) try { ws.send(data) } catch {}
    }
  }

  get connectionCount(): number {
    return this.ctx.getWebSockets().length
  }
}
