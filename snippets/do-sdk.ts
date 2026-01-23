/**
 * DO SDK - Browser/Client SDK for Digital Objects
 *
 * This SDK provides a lightweight client for connecting to DOs via:
 * - CapnWeb RPC over WebSocket (real-time, hibernation-compatible)
 * - HTTP REST fallback
 *
 * Usage:
 * ```typescript
 * import { DO } from '@do/sdk'
 *
 * const client = DO.connect('https://headless.ly')
 *
 * // RPC calls
 * const users = await client.db.User.list()
 * const stuck = await client.db.Order`what's stuck?`
 *
 * // Subscribe to events
 * client.on('Order.created', (order) => {
 *   console.log('New order:', order)
 * })
 * ```
 */

// =============================================================================
// Types
// =============================================================================

interface RPCRequest {
  type: 'rpc'
  id: string
  method: string
  args: unknown[]
}

interface RPCResponse {
  type: 'rpc'
  id: string
  success: boolean
  result?: unknown
  error?: string
}

interface DOClientOptions {
  /** Base URL of the DO */
  url: string
  /** Use WebSocket for real-time connection */
  realtime?: boolean
  /** Auto-reconnect on disconnect */
  reconnect?: boolean
  /** Reconnect delay in ms */
  reconnectDelay?: number
  /** Auth token */
  token?: string
}

// =============================================================================
// DO Client
// =============================================================================

export class DOClient {
  private readonly url: string
  private readonly options: Required<DOClientOptions>

  private ws: WebSocket | null = null
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }>()
  private eventHandlers = new Map<string, Set<(data: unknown) => void>>()
  private reconnecting = false

  constructor(options: DOClientOptions) {
    this.url = options.url.replace(/\/$/, '')
    this.options = {
      url: this.url,
      realtime: options.realtime ?? true,
      reconnect: options.reconnect ?? true,
      reconnectDelay: options.reconnectDelay ?? 1000,
      token: options.token ?? '',
    }
  }

  // ===========================================================================
  // Connection
  // ===========================================================================

  async connect(): Promise<void> {
    if (!this.options.realtime) return

    const wsUrl = this.url.replace(/^http/, 'ws')
    this.ws = new WebSocket(wsUrl)

    return new Promise((resolve, reject) => {
      if (!this.ws) return reject(new Error('WebSocket not created'))

      this.ws.onopen = () => {
        this.reconnecting = false
        resolve()
      }

      this.ws.onerror = (error) => {
        reject(new Error('WebSocket connection failed'))
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data)
      }

      this.ws.onclose = () => {
        if (this.options.reconnect && !this.reconnecting) {
          this.reconnecting = true
          setTimeout(() => this.connect(), this.options.reconnectDelay)
        }
      }
    })
  }

  disconnect(): void {
    this.options.reconnect = false
    this.ws?.close()
    this.ws = null
  }

  // ===========================================================================
  // RPC
  // ===========================================================================

  async call<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    const id = crypto.randomUUID()

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // WebSocket RPC
      return new Promise((resolve, reject) => {
        this.pendingRequests.set(id, {
          resolve: resolve as (value: unknown) => void,
          reject,
        })

        const request: RPCRequest = { type: 'rpc', id, method, args }
        this.ws!.send(JSON.stringify(request))

        // Timeout after 30 seconds
        setTimeout(() => {
          if (this.pendingRequests.has(id)) {
            this.pendingRequests.delete(id)
            reject(new Error(`RPC timeout: ${method}`))
          }
        }, 30000)
      })
    }

    // HTTP fallback
    const response = await fetch(`${this.url}/_rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.options.token ? { Authorization: `Bearer ${this.options.token}` } : {}),
      },
      body: JSON.stringify({ method, args }),
    })

    if (!response.ok) {
      throw new Error(`RPC failed: ${response.status}`)
    }

    const result = await response.json()
    return result as T
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as RPCResponse | { type: 'event'; event: string; data: unknown }

      if (message.type === 'rpc') {
        const pending = this.pendingRequests.get(message.id)
        if (pending) {
          this.pendingRequests.delete(message.id)
          if (message.success) {
            pending.resolve(message.result)
          } else {
            pending.reject(new Error(message.error || 'Unknown error'))
          }
        }
      } else if (message.type === 'event') {
        const handlers = this.eventHandlers.get(message.event)
        handlers?.forEach(handler => handler(message.data))
      }
    } catch (error) {
      console.error('Failed to parse message:', error)
    }
  }

  // ===========================================================================
  // Events
  // ===========================================================================

  on(event: string, handler: (data: unknown) => void): () => void {
    const handlers = this.eventHandlers.get(event) || new Set()
    handlers.add(handler)
    this.eventHandlers.set(event, handlers)

    // Return unsubscribe function
    return () => {
      handlers.delete(handler)
      if (handlers.size === 0) {
        this.eventHandlers.delete(event)
      }
    }
  }

  // ===========================================================================
  // Proxy for Tagged Template Syntax
  // ===========================================================================

  /**
   * Create a proxy that supports tagged template syntax
   *
   * Usage:
   * ```typescript
   * client.db.User`find active users in ${region}`
   * ```
   */
  get db(): DODBProxy {
    return createDBProxy(this)
  }

  /**
   * AI operations with tagged template
   */
  get ai(): DOAIProxy {
    return createAIProxy(this)
  }
}

// =============================================================================
// Proxy Types
// =============================================================================

type DODBProxy = {
  [collection: string]: DODBCollection & {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>
  }
}

interface DODBCollection {
  get(id: string): Promise<unknown>
  list(options?: { limit?: number; offset?: number }): Promise<unknown[]>
  create(data: unknown): Promise<unknown>
  update(id: string, data: unknown): Promise<unknown>
  delete(id: string): Promise<boolean>
  search(query: string): Promise<unknown[]>
}

type DOAIProxy = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>
  list: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<string[]>
  is: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<boolean>
  write: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<string>
}

// =============================================================================
// Proxy Factories
// =============================================================================

function createDBProxy(client: DOClient): DODBProxy {
  return new Proxy({} as DODBProxy, {
    get(target, prop) {
      if (typeof prop !== 'string') return undefined

      const collection = prop

      // Return a function that can be used as tagged template or has methods
      const collectionFn = function(
        strings: TemplateStringsArray,
        ...values: unknown[]
      ): Promise<unknown[]> {
        const query = strings.reduce((acc, str, i) =>
          acc + str + (values[i] !== undefined ? String(values[i]) : ''), ''
        )
        return client.call<unknown[]>(`db.${collection}.query`, query)
      }

      // Add CRUD methods
      Object.assign(collectionFn, {
        get: (id: string) => client.call(`db.${collection}.get`, id),
        list: (options?: { limit?: number; offset?: number }) =>
          client.call(`db.${collection}.list`, options),
        create: (data: unknown) => client.call(`db.${collection}.create`, data),
        update: (id: string, data: unknown) =>
          client.call(`db.${collection}.update`, id, data),
        delete: (id: string) => client.call(`db.${collection}.delete`, id),
        search: (query: string) => client.call(`db.${collection}.search`, query),
      })

      return collectionFn
    },
  })
}

function createAIProxy(client: DOClient): DOAIProxy {
  const aiFn = function(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown> {
    const prompt = strings.reduce((acc, str, i) =>
      acc + str + (values[i] !== undefined ? String(values[i]) : ''), ''
    )
    return client.call('ai.generate', prompt)
  }

  // Add specialized methods
  Object.assign(aiFn, {
    list: (strings: TemplateStringsArray, ...values: unknown[]) => {
      const prompt = strings.reduce((acc, str, i) =>
        acc + str + (values[i] !== undefined ? String(values[i]) : ''), ''
      )
      return client.call<string[]>('ai.list', prompt)
    },
    is: (strings: TemplateStringsArray, ...values: unknown[]) => {
      const prompt = strings.reduce((acc, str, i) =>
        acc + str + (values[i] !== undefined ? String(values[i]) : ''), ''
      )
      return client.call<boolean>('ai.is', prompt)
    },
    write: (strings: TemplateStringsArray, ...values: unknown[]) => {
      const prompt = strings.reduce((acc, str, i) =>
        acc + str + (values[i] !== undefined ? String(values[i]) : ''), ''
      )
      return client.call<string>('ai.write', prompt)
    },
  })

  return aiFn as DOAIProxy
}

// =============================================================================
// Factory Function
// =============================================================================

export const DO = {
  connect(url: string, options?: Partial<DOClientOptions>): DOClient {
    return new DOClient({ url, ...options })
  },
}

export default DO
