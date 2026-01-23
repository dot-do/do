/**
 * Client SDK Module
 *
 * SDK for consuming Digital Objects from external applications:
 * - Type-safe DO client
 * - Real-time subscriptions
 * - Offline support
 * - React/Vue/Svelte bindings
 */

import type {
  DigitalObjectIdentity,
  DigitalObjectRef,
  DOType,
  Thing,
  Action,
  RPCClient,
  CDCEvent,
} from '../types'
import { RPCClientImpl, type RPCClientOptions } from '../rpc'

/**
 * Create an RPC client
 */
function createRPCClient(options: RPCClientOptions): RPCClient {
  return new RPCClientImpl(options.url, options) as unknown as RPCClient
}

/**
 * DO Client options
 */
export interface DOClientOptions {
  /** Base URL for the DO platform */
  baseUrl?: string
  /** Authentication token */
  auth?: string
  /** Custom headers */
  headers?: Record<string, string>
  /** Enable offline support */
  offline?: boolean
  /** Cache TTL in ms */
  cacheTTL?: number
}

/**
 * DO Client - main entry point for SDK consumers
 */
class DOClientLegacy {
  private options: Required<DOClientOptions>
  private rpcClients: Map<string, RPCClient> = new Map()
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map()

  constructor(options: DOClientOptions = {}) {
    this.options = {
      baseUrl: 'https://do.md',
      auth: '',
      headers: {},
      offline: false,
      cacheTTL: 60000, // 1 minute
      ...options,
    }
  }

  /**
   * Connect to a Digital Object
   */
  async connect(doRef: DigitalObjectRef): Promise<DOConnection> {
    const url = this.resolveUrl(doRef)

    // Reuse existing RPC client if available
    let rpcClient = this.rpcClients.get(url)
    if (!rpcClient) {
      rpcClient = createRPCClient({
        url,
        auth: this.options.auth,
        headers: this.options.headers,
      })
      this.rpcClients.set(url, rpcClient)
    }

    return new DOConnection(doRef, rpcClient!, this.options)
  }

  /**
   * Disconnect from a Digital Object
   */
  async disconnect(doRef: DigitalObjectRef): Promise<void> {
    const url = this.resolveUrl(doRef)
    const rpcClient = this.rpcClients.get(url)
    if (rpcClient) {
      await rpcClient.close()
      this.rpcClients.delete(url)
    }
  }

  /**
   * Disconnect from all Digital Objects
   */
  async disconnectAll(): Promise<void> {
    for (const [url, client] of this.rpcClients) {
      await client.close()
    }
    this.rpcClients.clear()
  }

  /**
   * Set authentication token
   */
  setAuth(token: string): void {
    this.options.auth = token
    // Update all existing clients would require reconnection
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear()
  }

  private resolveUrl(doRef: DigitalObjectRef): string {
    if (doRef.startsWith('https://')) {
      return doRef
    }
    return `${this.options.baseUrl}/${doRef}`
  }
}

/**
 * Connection to a specific Digital Object
 */
export class DOConnection {
  private doRef: DigitalObjectRef
  private rpcClient: RPCClient
  private options: Required<DOClientOptions>
  private subscriptions: Map<string, () => void> = new Map()

  constructor(
    doRef: DigitalObjectRef,
    rpcClient: RPCClient,
    options: Required<DOClientOptions>
  ) {
    this.doRef = doRef
    this.rpcClient = rpcClient
    this.options = options
  }

  /**
   * Get the DO identity
   */
  async getIdentity(): Promise<DigitalObjectIdentity> {
    return this.rpcClient.call('do.identity.get')
  }

  /**
   * List things of a specific type
   */
  async listThings<T = unknown>(type?: string): Promise<Thing<T>[]> {
    const result = await this.rpcClient.call('do.things.list', {
      filter: type ? { field: 'type', op: 'eq', value: type } : undefined,
    })
    return result.items as Thing<T>[]
  }

  /**
   * Get a thing by ID
   */
  async getThing<T = unknown>(id: string): Promise<Thing<T> | null> {
    return this.rpcClient.call('do.things.get', id) as Promise<Thing<T> | null>
  }

  /**
   * Create a thing
   */
  async createThing<T = unknown>(
    data: Omit<Thing<T>, 'id'>
  ): Promise<Thing<T>> {
    return this.rpcClient.call('do.things.create', data) as Promise<Thing<T>>
  }

  /**
   * Update a thing
   */
  async updateThing<T = unknown>(
    id: string,
    data: Partial<Thing<T>>
  ): Promise<Thing<T>> {
    return this.rpcClient.call('do.things.update', id, data) as Promise<Thing<T>>
  }

  /**
   * Delete a thing
   */
  async deleteThing(id: string): Promise<void> {
    await this.rpcClient.call('do.things.delete', id)
  }

  /**
   * Execute an action
   */
  async executeAction<TInput = unknown, TOutput = unknown>(
    verb: string,
    input: TInput
  ): Promise<Action<TInput, TOutput>> {
    // Cast to unknown first to bypass strict type checking since Action uses $id not id
    const actionData = {
      verb,
      input,
      status: 'pending' as const,
      actor: { type: 'User' as const, id: 'anonymous' },
      createdAt: Date.now(),
    }
    return this.rpcClient.call('do.actions.create', actionData as unknown as Omit<Action, 'id'>) as Promise<Action<TInput, TOutput>>
  }

  /**
   * Subscribe to CDC events
   */
  subscribe(
    handler: (event: CDCEvent) => void,
    options?: { eventTypes?: string[]; collections?: string[] }
  ): () => void {
    const channel = `cdc:${this.doRef}`
    const unsubscribe = this.rpcClient.subscribe(channel, (event) => {
      const cdcEvent = event as CDCEvent

      // Apply filters
      if (options?.eventTypes && !options.eventTypes.includes(cdcEvent.operation)) {
        return
      }
      if (
        options?.collections &&
        !options.collections.includes(cdcEvent.collection)
      ) {
        return
      }

      handler(cdcEvent)
    })

    const subscriptionId = `${channel}:${Date.now()}`
    this.subscriptions.set(subscriptionId, unsubscribe)

    return () => {
      unsubscribe()
      this.subscriptions.delete(subscriptionId)
    }
  }

  /**
   * Unsubscribe from all events
   */
  unsubscribeAll(): void {
    for (const unsubscribe of this.subscriptions.values()) {
      unsubscribe()
    }
    this.subscriptions.clear()
  }

  /**
   * Get the underlying RPC client
   */
  get rpc(): RPCClient {
    return this.rpcClient
  }
}

/**
 * Create a DO client (legacy)
 */
export function createDOClient(options?: DOClientOptions): DOClientLegacy {
  return new DOClientLegacy(options)
}

// Export legacy client as named export
export { DOClientLegacy }

// =============================================================================
// New SDK Client Exports
// =============================================================================

// Re-export from new typed client
export {
  createClient,
  createClients,
  DOError,
  TimeoutError,
  TransportError,
} from './client'

export type { DOClient, ClientConfig, DOSchema } from './client'

// Re-export transport layer
export {
  WebSocketTransport,
  HTTPTransport,
  AutoTransport,
  createTransport,
} from './transport'

export type {
  WebSocketTransportConfig,
  HTTPTransportConfig,
  AutoTransportConfig,
} from './transport'

// Re-export types
export type {
  MethodNames,
  MethodInput,
  MethodOutput,
  StateKeys,
  StateValue,
  TransportType,
  ConnectionState,
  ReconnectConfig,
  TransportMessage,
  MessageType,
  Transport,
  TransportResponse,
  TransportError as TransportErrorType,
  ClientEventType,
  ClientEventHandler,
  BatchCall,
  BatchResult,
} from './types'

// =============================================================================
// RPC.do Integration
// =============================================================================

// Re-export from rpc.do integration
export {
  // Client factories
  createDOApiClient,
  connectDO,
  createDOClientFromBinding,
  doClient,
  // Environment configuration
  setEnv,
  getEnv,
  getEnvVar,
  isEnvConfigured,
  getDefaultApiKey,
  getDefaultApiKeySync,
  // rpc.do re-exports
  RPC,
  http,
  ws,
  capnweb,
  composite,
  binding,
  // Error class
  RPCError,
} from './rpc'

export type {
  // API types
  DOApi,
  DOApiClient,
  DOClientConfig,
  // Collection interfaces
  CollectionAPI,
  ExtendedCollectionAPI,
  RelationshipAPI,
  TraverseOptions,
  TraverseResult,
  // Type utilities
  CollectionItem,
  CollectionName,
  CollectionItemType,
  // rpc.do types
  Transport as RPCTransport,
  RPCProxy,
  AuthProvider,
} from './rpc'

// =============================================================================
// Authentication (oauth.do)
// =============================================================================

// Re-export auth module
export {
  ensureDOAuth,
  getDOToken,
  isDOAuthenticated,
  forceReauthDO,
  logoutDO,
  configureDOAuth,
  startDODeviceFlow,
  completeDODeviceFlow,
  createSecureStorage,
} from './auth'

export type {
  DOAuthOptions,
  DOAuthResult,
  DOStorageConfig,
  DeviceAuthResponse,
  TokenStorage,
  StoredTokenData,
} from './auth'
