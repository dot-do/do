/**
 * RPC Client SDK: Remote DO Access
 *
 * The RPC client provides WebSocket-based communication with DOs.
 * Features include:
 * - Schema-free RPC with promise pipelining
 * - WebSocket hibernation (95% cost savings)
 * - Automatic reconnection
 * - Batch requests
 * - Event subscriptions
 */

import type {
  RPCRequest,
  RPCResponse,
  RPCError,
  RpcErrorCodes,
  RPCMeta,
  RPCBatchRequest,
  RPCBatchResponse,
  WebSocketState,
  HibernationOptions,
  DORPCMethods,
  RPCClient,
  DOStats,
  DOSchema,
  Thing,
  Action,
  CDCOptions,
  CDCBatch,
} from '../types'

// =============================================================================
// RPC Message Types
// =============================================================================

/**
 * Create an RPC request
 */
function createRequest<T>(method: string, params?: T): RPCRequest<T> {
  return {
    id: crypto.randomUUID(),
    method,
    params,
    meta: {
      timestamp: Date.now(),
      traceId: crypto.randomUUID(),
    },
  }
}

/**
 * Create a successful RPC response
 */
function createSuccessResponse<T>(requestId: string, result: T): RPCResponse<T> {
  return {
    id: requestId,
    result,
    meta: {
      timestamp: Date.now(),
    },
  }
}

/**
 * Create an error RPC response
 */
function createErrorResponse(requestId: string, error: RPCError): RPCResponse {
  return {
    id: requestId,
    error,
    meta: {
      timestamp: Date.now(),
    },
  }
}

/**
 * Standard RPC errors
 */
const errors = {
  notFound: (message: string): RPCError => ({
    code: -32003,  // RpcErrorCodes.NotFound
    message,
  }),
  unauthorized: (message: string): RPCError => ({
    code: -32001,  // RpcErrorCodes.Unauthorized
    message,
  }),
  invalidParams: (message: string): RPCError => ({
    code: -32602,  // RpcErrorCodes.InvalidParams
    message,
  }),
}

// =============================================================================
// DO RPC Client Implementation
// =============================================================================

/**
 * Create an RPC client for a Digital Object
 */
export function createDOClient(url: string, options?: {
  token?: string
  reconnect?: boolean
  reconnectDelay?: number
}): RPCClient {
  const wsUrl = url.replace(/^http/, 'ws')
  let ws: WebSocket | null = null
  let connectionId: string | null = null
  const pendingRequests = new Map<string, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }>()
  const eventHandlers = new Map<string, Set<(event: unknown) => void>>()
  let reconnecting = false

  // Connect to WebSocket
  async function connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        connectionId = crypto.randomUUID()
        reconnecting = false
        console.log(`Connected to ${url} (${connectionId})`)
        resolve()
      }

      ws.onerror = (event) => {
        reject(new Error('WebSocket connection failed'))
      }

      ws.onmessage = (event) => {
        handleMessage(event.data)
      }

      ws.onclose = () => {
        console.log('WebSocket closed')
        if (options?.reconnect && !reconnecting) {
          reconnecting = true
          setTimeout(() => connect(), options.reconnectDelay ?? 1000)
        }
      }
    })
  }

  // Handle incoming messages
  function handleMessage(data: string) {
    try {
      const message = JSON.parse(data)

      if (message.type === 'rpc' && message.id) {
        // RPC response
        const pending = pendingRequests.get(message.id)
        if (pending) {
          pendingRequests.delete(message.id)
          if (message.error) {
            pending.reject(new Error(message.error.message))
          } else {
            pending.resolve(message.result)
          }
        }
      } else if (message.type === 'event') {
        // Event notification
        const handlers = eventHandlers.get(message.channel)
        handlers?.forEach(handler => handler(message.data))
      }
    } catch (error) {
      console.error('Failed to parse message:', error)
    }
  }

  // Call a single RPC method
  async function call<M extends keyof DORPCMethods>(
    method: M,
    ...params: Parameters<DORPCMethods[M]>
  ): ReturnType<DORPCMethods[M]> {
    const request = createRequest(method, params)

    return new Promise((resolve, reject) => {
      pendingRequests.set(request.id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      })

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(request))
      } else {
        // HTTP fallback
        fetch(`${url}/_rpc`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(options?.token ? { Authorization: `Bearer ${options.token}` } : {}),
          },
          body: JSON.stringify(request),
        })
          .then(res => res.json())
          .then(response => {
            if (response.error) {
              reject(new Error(response.error.message))
            } else {
              resolve(response.result)
            }
          })
          .catch(reject)
      }

      // Timeout after 30 seconds
      setTimeout(() => {
        if (pendingRequests.has(request.id)) {
          pendingRequests.delete(request.id)
          reject(new Error(`RPC timeout: ${method}`))
        }
      }, 30000)
    }) as ReturnType<DORPCMethods[M]>
  }

  // Batch multiple requests
  async function batch(requests: RPCRequest[]): Promise<RPCBatchResponse> {
    const batchId = crypto.randomUUID()
    const batchRequest: RPCBatchRequest = {
      id: batchId,
      requests,
      abortOnError: false,
    }

    const response = await fetch(`${url}/_rpc/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options?.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: JSON.stringify(batchRequest),
    })

    return response.json()
  }

  // Subscribe to events
  function subscribe(channel: string, handler: (event: unknown) => void): () => void {
    const handlers = eventHandlers.get(channel) || new Set()
    handlers.add(handler)
    eventHandlers.set(channel, handlers)

    // Send subscribe message
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel,
      }))
    }

    // Return unsubscribe function
    return () => {
      handlers.delete(handler)
      if (handlers.size === 0) {
        eventHandlers.delete(channel)
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'unsubscribe',
            channel,
          }))
        }
      }
    }
  }

  // Close the connection
  async function close(): Promise<void> {
    if (ws) {
      ws.close()
      ws = null
    }
  }

  return {
    call,
    batch,
    subscribe,
    close,
  }
}

// =============================================================================
// Usage Examples
// =============================================================================

async function demonstrateRPCClient() {
  // Create client for a DO
  const client = createDOClient('https://myapp.do', {
    token: 'your-auth-token',
    reconnect: true,
    reconnectDelay: 1000,
  })

  // ==========================================================================
  // Identity Methods
  // ==========================================================================

  // Get DO identity
  const identity = await client.call('do.identity.get')
  console.log('DO Identity:', identity)

  // Set parent context for CDC streaming
  await client.call('do.identity.setContext', 'https://parent.do')

  // Get parent context
  const context = await client.call('do.identity.getContext')
  console.log('Parent context:', context)

  // ==========================================================================
  // Collection CRUD
  // ==========================================================================

  // List Things with pagination
  const things = await client.call('do.things.list', {
    limit: 10,
    offset: 0,
    orderBy: 'createdAt',
    orderDir: 'desc',
  })
  console.log('Things:', things.items.length, 'hasMore:', things.hasMore)

  // Get a specific Thing
  const thing = await client.call('do.things.get', 'thing_123')
  console.log('Thing:', thing)

  // Create a Thing
  const newThing = await client.call('do.things.create', {
    id: 'thing_new',
    type: 'Customer',
    data: { name: 'Acme Corp', email: 'hello@acme.com' },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
  console.log('Created:', newThing)

  // Update a Thing
  const updated = await client.call('do.things.update', 'thing_new', {
    data: { name: 'Acme Corporation' },
    updatedAt: Date.now(),
  })
  console.log('Updated:', updated)

  // Delete a Thing
  await client.call('do.things.delete', 'thing_new')
  console.log('Deleted')

  // ==========================================================================
  // Actions
  // ==========================================================================

  // Create an Action
  const action = await client.call('do.actions.create', {
    $id: 'action_001',
    verb: 'create',
    object: 'Order',
    status: 'pending',
    actor: { type: 'User', id: 'user_123' },
    input: { items: [{ productId: 'prod_1', quantity: 2 }] },
    createdAt: Date.now(),
  })
  console.log('Action created:', action)

  // Execute an Action
  const executed = await client.call('do.actions.execute', 'action_001')
  console.log('Action executed:', executed.status)

  // Cancel an Action
  const cancelled = await client.call('do.actions.cancel', 'action_002')
  console.log('Action cancelled:', cancelled.status)

  // ==========================================================================
  // Workflows
  // ==========================================================================

  // Start a Workflow
  const workflow = await client.call('do.workflows.start', 'workflow_onboarding', {
    userId: 'user_123',
    plan: 'pro',
  })
  console.log('Workflow started:', workflow.executionState)

  // Pause a Workflow
  await client.call('do.workflows.pause', 'workflow_001')

  // Resume a Workflow
  await client.call('do.workflows.resume', 'workflow_001')

  // ==========================================================================
  // Functions
  // ==========================================================================

  // Invoke a Function
  const result = await client.call('do.functions.invoke', 'fn_process_order', {
    orderId: 'order_123',
  })
  console.log('Function result:', result)

  // ==========================================================================
  // CDC/Streaming
  // ==========================================================================

  // Subscribe to CDC events
  const subscriptionId = await client.call('do.cdc.subscribe', {
    collections: ['Customer', 'Order'],
    operations: ['INSERT', 'UPDATE'],
    includeDocuments: true,
  })
  console.log('CDC subscription:', subscriptionId)

  // Get CDC changes (pull-based)
  const cursor = await client.call('do.cdc.getCursor')
  const changes = await client.call('do.cdc.getChanges', cursor, 100)
  console.log('CDC changes:', changes.events.length)

  // Unsubscribe
  await client.call('do.cdc.unsubscribe', subscriptionId)

  // ==========================================================================
  // System Methods
  // ==========================================================================

  // Health check
  const ping = await client.call('do.system.ping')
  console.log('Pong:', ping.timestamp)

  // Get DO stats
  const stats = await client.call('do.system.stats')
  console.log('Stats:', {
    storage: `${stats.storage.usedBytes} bytes`,
    connections: stats.connections.active,
    uptime: stats.uptime,
  })

  // Get DO schema
  const schema = await client.call('do.system.schema')
  console.log('Schema:', schema.type, 'methods:', schema.methods.length)

  // ==========================================================================
  // Batch Requests (Promise Pipelining)
  // ==========================================================================

  // Execute multiple requests in a single round-trip
  const batchResponse = await client.batch([
    createRequest('do.things.get', 'thing_1'),
    createRequest('do.things.get', 'thing_2'),
    createRequest('do.things.get', 'thing_3'),
  ])

  console.log('Batch results:', batchResponse.responses.length)
  for (const response of batchResponse.responses) {
    if (response.error) {
      console.log('  Error:', response.error.message)
    } else {
      console.log('  Result:', response.result)
    }
  }

  // ==========================================================================
  // Event Subscriptions
  // ==========================================================================

  // Subscribe to real-time events
  const unsubscribe = client.subscribe('Customer.created', (event) => {
    console.log('New customer created:', event)
  })

  // Later: unsubscribe
  unsubscribe()

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  await client.close()
  console.log('Client closed')
}

// =============================================================================
// WebSocket Hibernation
// =============================================================================

/**
 * WebSocket connections support hibernation for cost savings.
 * When idle, connections hibernate and resume on activity.
 */
const hibernationOptions: HibernationOptions = {
  // Idle timeout before hibernation (default: 10s)
  idleTimeout: 10000,

  // Maximum hibernation duration (default: 24h)
  maxHibernationDuration: 24 * 60 * 60 * 1000,

  // Automatically reconnect after hibernation
  autoReconnect: true,
}

/**
 * WebSocket state tracking
 */
function trackWebSocketState(): WebSocketState {
  return {
    id: crypto.randomUUID(),
    status: 'open',
    connectedAt: Date.now(),
    lastMessageAt: Date.now(),
    subscriptions: ['Customer.created', 'Order.placed'],
    data: {
      userId: 'user_123',
      sessionId: 'session_abc',
    },
  }
}

console.log('RPC Client example ready')
console.log('Run demonstrateRPCClient() to see it in action')
