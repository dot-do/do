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

// Create a dynamic class that extends RpcTarget with methods on prototype
function createRpcInterfaceClass(instance: DurableRPC): typeof RpcTarget {
  const methods: Record<string, Function> = {}
  const seen = new Set<string>()

  const collect = (obj: unknown) => {
    if (!obj || obj === Object.prototype) return
    for (const key of Object.getOwnPropertyNames(obj)) {
      if (seen.has(key) || SKIP_PROPS.has(key) || key.startsWith('_')) continue
      seen.add(key)
      let value: unknown
      try { value = (instance as any)[key] } catch { continue }
      if (typeof value === 'function') {
        methods[key] = value.bind(instance)
      }
    }
  }
  collect(instance)
  let proto = Object.getPrototypeOf(instance)
  while (proto && proto !== DurableRPC.prototype && proto !== Object.prototype) {
    collect(proto)
    proto = Object.getPrototypeOf(proto)
  }

  // Create a class with methods on the prototype
  class DynamicRpcInterface extends RpcTarget {
    __schema() { return instance.getSchema() }
  }

  // Add methods to prototype
  for (const [key, fn] of Object.entries(methods)) {
    (DynamicRpcInterface.prototype as any)[key] = fn
  }

  return DynamicRpcInterface
}

export class DurableRPC extends DurableObject {
  private _transportRegistry = new TransportRegistry()
  private _sessions = new Map<WebSocket, RpcSession>()
  private _rpcInterface?: RpcTarget
  protected _currentRequest?: Request

  get sql(): SqlStorage { return this.ctx.storage.sql }
  get storage(): DurableObjectStorage { return this.ctx.storage }
  get state(): DurableObjectState { return this.ctx }

  private getRpcInterface(): RpcTarget {
    if (!this._rpcInterface) {
      const InterfaceClass = createRpcInterfaceClass(this)
      this._rpcInterface = new InterfaceClass()
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
    const url = new URL(request.url)

    // Schema endpoint
    if (request.method === 'GET' && (url.pathname === '/__schema' || url.pathname === '/')) {
      return Response.json(this.getSchema())
    }

    // /$ REST-style method calls: /$methodName or /$methodName/arg1/arg2
    if (url.pathname.startsWith('/$')) {
      return this.handleRestMethodCall(request, url)
    }

    // WebSocket upgrade for live RPC
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request)
    }

    // capnweb HTTP batch RPC
    return this.handleHttpRpc(request)
  }

  private async handleRestMethodCall(request: Request, url: URL): Promise<Response> {
    try {
      const rawPath = url.pathname.slice(2) // Remove '/$'
      const pathAfterDollar = decodeURIComponent(rawPath)

      // Chained method syntax: /$.collection("users").find({active:true}).limit(10)
      // Detect by looking for ).(  or ).identifier patterns (method chaining after a call)
      if (pathAfterDollar.match(/\)\s*\./)) {
        return this.handleChainedCall(pathAfterDollar)
      }

      // Also handle property.method chains like $.users.find()
      // Detect: identifier.identifier( pattern (property access then method call)
      if (pathAfterDollar.match(/^\w+\.\w+\(/)) {
        return this.handleChainedCall(pathAfterDollar)
      }

      // JavaScript-style: /$methodName(arg1,arg2,...) or /$methodName("arg with spaces")
      const jsMatch = pathAfterDollar.match(/^(\w+)\((.*)\)$/)
      if (jsMatch) {
        return this.handleJsStyleCall(jsMatch[1], jsMatch[2])
      }

      // REST-style: /$methodName/arg1/arg2...
      const pathParts = pathAfterDollar.split('/').filter(Boolean)
      const methodName = pathParts[0]

      if (!methodName) {
        return Response.json({ error: 'Method name required' }, { status: 400 })
      }

      const method = (this as any)[methodName]
      if (typeof method !== 'function') {
        return Response.json({ error: `Method '${methodName}' not found` }, { status: 404 })
      }

      let args: unknown[]

      if (request.method === 'POST' || request.method === 'PUT') {
        const body = await request.json().catch(() => null)
        args = Array.isArray(body) ? body : body !== null ? [body] : []
      } else {
        if (pathParts.length > 1) {
          args = pathParts.slice(1).map(decodeURIComponent)
        } else {
          args = []
          for (const [key, value] of url.searchParams) {
            const index = key.match(/^arg(\d+)$/)?.[1]
            if (index !== undefined) {
              args[parseInt(index)] = value
            } else if (args.length === 0) {
              args[0] = Object.fromEntries(url.searchParams)
              break
            }
          }
        }
      }

      const result = await method.call(this, ...args)
      return Response.json(result ?? null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return Response.json({ error: message }, { status: 500 })
    }
  }

  private async handleJsStyleCall(methodName: string, argsStr: string): Promise<Response> {
    const method = (this as any)[methodName]
    if (typeof method !== 'function') {
      return Response.json({ error: `Method '${methodName}' not found` }, { status: 404 })
    }

    const args = this.parseJsArgs(argsStr)
    const result = await method.call(this, ...args)
    return Response.json(result ?? null)
  }

  private async handleChainedCall(expr: string): Promise<Response> {
    const calls = this.parseChainedExpression(expr)
    if (calls.length === 0) {
      return Response.json({ error: 'Invalid chained expression' }, { status: 400 })
    }

    let current: unknown = this

    for (let i = 0; i < calls.length; i++) {
      const call = calls[i]
      const isLast = i === calls.length - 1

      if (call.isMethod) {
        const method = (current as any)[call.name]
        if (typeof method !== 'function') {
          return Response.json({ error: `Method '${call.name}' not found` }, { status: 404 })
        }
        const result = method.call(current, ...call.args)
        if (isLast) {
          current = result?.then ? await result : result
        } else {
          current = result
        }
      } else {
        current = (current as any)[call.name]
        if (current === undefined) {
          return Response.json({ error: `Property '${call.name}' not found` }, { status: 404 })
        }
      }
    }

    return Response.json(current ?? null)
  }

  private parseChainedExpression(expr: string): Array<{ name: string; isMethod: boolean; args: unknown[] }> {
    const calls: Array<{ name: string; isMethod: boolean; args: unknown[] }> = []
    let remaining = expr
    let depth = 0
    let i = 0

    while (remaining.length > 0) {
      // Skip leading dot
      if (remaining.startsWith('.')) {
        remaining = remaining.slice(1)
      }

      // Find identifier
      const identMatch = remaining.match(/^(\w+)/)
      if (!identMatch) break
      const name = identMatch[1]
      remaining = remaining.slice(name.length)

      // Check if method call
      if (remaining.startsWith('(')) {
        // Find matching closing paren
        depth = 1
        let end = 1
        let inString: string | null = null
        while (end < remaining.length && depth > 0) {
          const char = remaining[end]
          const prevChar = remaining[end - 1]
          if (inString) {
            if (char === inString && prevChar !== '\\') inString = null
          } else if (char === '"' || char === "'") {
            inString = char
          } else if (char === '(') {
            depth++
          } else if (char === ')') {
            depth--
          }
          end++
        }
        const argsStr = remaining.slice(1, end - 1)
        calls.push({ name, isMethod: true, args: this.parseJsArgs(argsStr) })
        remaining = remaining.slice(end)
      } else {
        // Property access
        calls.push({ name, isMethod: false, args: [] })
      }

      // Safety limit
      if (++i > 20) break
    }

    return calls
  }

  private parseJsArgs(argsStr: string): unknown[] {
    if (!argsStr.trim()) return []

    const args: unknown[] = []
    let current = ''
    let inString: string | null = null
    let braceDepth = 0
    let bracketDepth = 0

    for (let i = 0; i < argsStr.length; i++) {
      const char = argsStr[i]
      const prevChar = argsStr[i - 1]

      if (inString) {
        current += char
        if (char === inString && prevChar !== '\\') {
          inString = null
        }
      } else if (char === '"' || char === "'") {
        current += char
        inString = char
      } else if (char === '{') {
        current += char
        braceDepth++
      } else if (char === '}') {
        current += char
        braceDepth--
      } else if (char === '[') {
        current += char
        bracketDepth++
      } else if (char === ']') {
        current += char
        bracketDepth--
      } else if (char === ',' && braceDepth === 0 && bracketDepth === 0) {
        args.push(this.parseJsValue(current.trim()))
        current = ''
      } else {
        current += char
      }
    }

    if (current.trim()) {
      args.push(this.parseJsValue(current.trim()))
    }

    return args
  }

  private parseJsValue(val: string): unknown {
    // Try JSON parse first (handles objects, arrays, strings, numbers, booleans)
    try {
      return JSON.parse(val)
    } catch {
      // Bare string (no quotes) - return as-is
      return val
    }
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
