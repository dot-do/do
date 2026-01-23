/**
 * CapnWeb RPC Types
 *
 * Schema-free RPC with WebSocket hibernation
 * Provides 95% cost savings through efficient connection handling
 */

import type { DigitalObjectIdentity, DigitalObjectRef, DOType } from './identity'
import type {
  Noun,
  Verb,
  Thing,
  Action,
  Relationship,
  Function,
  Workflow,
  Event,
  Experiment,
  Org,
  Role,
  User,
  Agent,
  Integration,
  Webhook,
  CollectionMethods,
} from './collections'
import type { CDCOptions, CDCBatch, CDCCursor, CDCEvent } from './storage'
import type { ColoInfo } from './colo'
import type { ExecResult, BashResult, ExecOptions } from './execution'

// =============================================================================
// RPC Message Types
// =============================================================================

/**
 * RPC request message
 */
export interface RPCRequest<T = unknown> {
  /** Unique request ID */
  id: string
  /** Method name (e.g., 'do.nouns.list') */
  method: string
  /** Method parameters */
  params?: T
  /** Request metadata */
  meta?: RPCMeta
}

/**
 * RPC response message
 */
export interface RPCResponse<T = unknown> {
  /** Request ID this is responding to */
  id: string
  /** Result on success */
  result?: T
  /** Error on failure */
  error?: RPCError
  /** Response metadata */
  meta?: RPCMeta
}

/**
 * RPC error
 */
export interface RPCError {
  code: number
  message: string
  data?: unknown
}

/**
 * Standard RPC error codes
 */
export const RpcErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  // Custom codes
  Unauthorized: -32001,
  Forbidden: -32002,
  NotFound: -32003,
  Conflict: -32004,
  RateLimited: -32005,
  Timeout: -32006,
} as const

/**
 * RPC metadata (headers-like)
 */
export interface RPCMeta {
  /** Request/response timestamp */
  timestamp?: number
  /** Request duration in ms */
  duration?: number
  /** Trace ID for distributed tracing */
  traceId?: string
  /** Span ID */
  spanId?: string
  /** Authentication token */
  auth?: string
  /** Custom headers */
  headers?: Record<string, string>
}

// =============================================================================
// RPC Batch (Promise Pipelining)
// =============================================================================

/**
 * Batch request for promise pipelining
 */
export interface RPCBatchRequest {
  /** Batch ID */
  id: string
  /** Individual requests */
  requests: RPCRequest[]
  /** Whether to abort on first error */
  abortOnError?: boolean
}

/**
 * Batch response
 */
export interface RPCBatchResponse {
  /** Batch ID */
  id: string
  /** Individual responses (same order as requests) */
  responses: RPCResponse[]
  /** Overall success */
  success: boolean
  /** Total duration */
  duration?: number
}

// =============================================================================
// WebSocket Hibernation
// =============================================================================

/**
 * WebSocket connection state
 */
export interface WebSocketState {
  /** Connection ID */
  id: string
  /** Connection status */
  status: 'Connecting' | 'Open' | 'Hibernating' | 'Closed'
  /** When the connection was established */
  connectedAt: number
  /** When hibernation started (if hibernating) */
  hibernatedAt?: number
  /** Last message timestamp */
  lastMessageAt: number
  /** Subscriptions this connection has */
  subscriptions: string[]
  /** Custom connection data */
  data?: Record<string, unknown>
}

/**
 * Hibernation options
 */
export interface HibernationOptions {
  /** Idle timeout before hibernation (default: 10s) */
  idleTimeout?: number
  /** Maximum hibernation duration (default: 24h) */
  maxHibernationDuration?: number
  /** Whether to automatically reconnect */
  autoReconnect?: boolean
}

// =============================================================================
// DO RPC Methods
// =============================================================================

/**
 * All RPC methods exposed by a Digital Object
 */
export interface DORPCMethods {
  // =========================================================================
  // Identity Methods
  // =========================================================================

  /** Get DO identity */
  'do.identity.get': () => Promise<DigitalObjectIdentity>

  /** Set parent context for CDC streaming */
  'do.identity.setContext': (ref: DigitalObjectRef) => Promise<void>

  /** Get parent context */
  'do.identity.getContext': () => Promise<DigitalObjectRef | null>

  // =========================================================================
  // Collection Methods (CRUD for each collection type)
  // =========================================================================

  // Nouns
  'do.nouns.list': CollectionMethods<Noun>['list']
  'do.nouns.get': CollectionMethods<Noun>['get']
  'do.nouns.create': CollectionMethods<Noun>['create']
  'do.nouns.update': CollectionMethods<Noun>['update']
  'do.nouns.delete': CollectionMethods<Noun>['delete']

  // Verbs
  'do.verbs.list': CollectionMethods<Verb>['list']
  'do.verbs.get': CollectionMethods<Verb>['get']
  'do.verbs.create': CollectionMethods<Verb>['create']
  'do.verbs.update': CollectionMethods<Verb>['update']
  'do.verbs.delete': CollectionMethods<Verb>['delete']

  // Things
  'do.things.list': CollectionMethods<Thing>['list']
  'do.things.get': CollectionMethods<Thing>['get']
  'do.things.create': CollectionMethods<Thing>['create']
  'do.things.update': CollectionMethods<Thing>['update']
  'do.things.delete': CollectionMethods<Thing>['delete']

  // Actions
  'do.actions.list': CollectionMethods<Action>['list']
  'do.actions.get': CollectionMethods<Action>['get']
  'do.actions.create': CollectionMethods<Action>['create']
  'do.actions.update': CollectionMethods<Action>['update']
  'do.actions.delete': CollectionMethods<Action>['delete']
  'do.actions.execute': (id: string) => Promise<Action>
  'do.actions.cancel': (id: string) => Promise<Action>

  // Relationships
  'do.relationships.list': CollectionMethods<Relationship>['list']
  'do.relationships.get': CollectionMethods<Relationship>['get']
  'do.relationships.create': CollectionMethods<Relationship>['create']
  'do.relationships.delete': CollectionMethods<Relationship>['delete']

  // Functions
  'do.functions.list': CollectionMethods<Function>['list']
  'do.functions.get': CollectionMethods<Function>['get']
  'do.functions.create': CollectionMethods<Function>['create']
  'do.functions.update': CollectionMethods<Function>['update']
  'do.functions.delete': CollectionMethods<Function>['delete']
  'do.functions.invoke': (id: string, input: unknown) => Promise<unknown>

  // Workflows
  'do.workflows.list': CollectionMethods<Workflow>['list']
  'do.workflows.get': CollectionMethods<Workflow>['get']
  'do.workflows.create': CollectionMethods<Workflow>['create']
  'do.workflows.update': CollectionMethods<Workflow>['update']
  'do.workflows.delete': CollectionMethods<Workflow>['delete']
  'do.workflows.start': (id: string, context?: Record<string, unknown>) => Promise<Workflow>
  'do.workflows.pause': (id: string) => Promise<Workflow>
  'do.workflows.resume': (id: string) => Promise<Workflow>
  'do.workflows.cancel': (id: string) => Promise<Workflow>

  // Events
  'do.events.list': CollectionMethods<Event>['list']
  'do.events.get': CollectionMethods<Event>['get']
  'do.events.emit': (event: Omit<Event, 'id' | 'timestamp'>) => Promise<Event>

  // Experiments
  'do.experiments.list': CollectionMethods<Experiment>['list']
  'do.experiments.get': CollectionMethods<Experiment>['get']
  'do.experiments.create': CollectionMethods<Experiment>['create']
  'do.experiments.update': CollectionMethods<Experiment>['update']
  'do.experiments.delete': CollectionMethods<Experiment>['delete']
  'do.experiments.start': (id: string) => Promise<Experiment>
  'do.experiments.conclude': (id: string) => Promise<Experiment>
  'do.experiments.allocate': (id: string, userId: string) => Promise<string>

  // Orgs
  'do.orgs.list': CollectionMethods<Org>['list']
  'do.orgs.get': CollectionMethods<Org>['get']
  'do.orgs.create': CollectionMethods<Org>['create']
  'do.orgs.update': CollectionMethods<Org>['update']
  'do.orgs.delete': CollectionMethods<Org>['delete']

  // Roles
  'do.roles.list': CollectionMethods<Role>['list']
  'do.roles.get': CollectionMethods<Role>['get']
  'do.roles.create': CollectionMethods<Role>['create']
  'do.roles.update': CollectionMethods<Role>['update']
  'do.roles.delete': CollectionMethods<Role>['delete']

  // Users
  'do.users.list': CollectionMethods<User>['list']
  'do.users.get': CollectionMethods<User>['get']
  'do.users.create': CollectionMethods<User>['create']
  'do.users.update': CollectionMethods<User>['update']
  'do.users.delete': CollectionMethods<User>['delete']
  'do.users.assignRole': (userId: string, roleId: string) => Promise<User>
  'do.users.removeRole': (userId: string, roleId: string) => Promise<User>

  // Agents
  'do.agents.list': CollectionMethods<Agent>['list']
  'do.agents.get': CollectionMethods<Agent>['get']
  'do.agents.create': CollectionMethods<Agent>['create']
  'do.agents.update': CollectionMethods<Agent>['update']
  'do.agents.delete': CollectionMethods<Agent>['delete']
  'do.agents.start': (id: string) => Promise<Agent>
  'do.agents.stop': (id: string) => Promise<Agent>
  'do.agents.message': (id: string, message: unknown) => Promise<unknown>

  // Integrations
  'do.integrations.list': CollectionMethods<Integration>['list']
  'do.integrations.get': CollectionMethods<Integration>['get']
  'do.integrations.create': CollectionMethods<Integration>['create']
  'do.integrations.update': CollectionMethods<Integration>['update']
  'do.integrations.delete': CollectionMethods<Integration>['delete']
  'do.integrations.sync': (id: string) => Promise<Integration>
  'do.integrations.test': (id: string) => Promise<{ success: boolean; error?: string }>

  // Webhooks
  'do.webhooks.list': CollectionMethods<Webhook>['list']
  'do.webhooks.get': CollectionMethods<Webhook>['get']
  'do.webhooks.create': CollectionMethods<Webhook>['create']
  'do.webhooks.update': CollectionMethods<Webhook>['update']
  'do.webhooks.delete': CollectionMethods<Webhook>['delete']
  'do.webhooks.test': (id: string) => Promise<{ success: boolean; statusCode?: number; error?: string }>

  // =========================================================================
  // CDC/Streaming Methods
  // =========================================================================

  /** Subscribe to CDC events */
  'do.cdc.subscribe': (options?: CDCOptions) => Promise<string>

  /** Unsubscribe from CDC events */
  'do.cdc.unsubscribe': (subscriptionId: string) => Promise<void>

  /** Get CDC changes (pull-based) */
  'do.cdc.getChanges': (cursor: CDCCursor, limit?: number) => Promise<CDCBatch>

  /** Get current CDC cursor */
  'do.cdc.getCursor': () => Promise<CDCCursor>

  /** Replay CDC events from a cursor */
  'do.cdc.replay': (fromCursor: CDCCursor, toCursor?: CDCCursor) => Promise<CDCEvent[]>

  // =========================================================================
  // Colo Methods
  // =========================================================================

  /** Get current colo info */
  'do.colo.info': () => Promise<ColoInfo>

  /** Fork DO to another colo */
  'do.colo.fork': (targetColo: string) => Promise<DigitalObjectRef>

  /** Migrate DO to another colo */
  'do.colo.migrate': (targetColo: string) => Promise<void>

  /** Add follower for replication */
  'do.colo.addFollower': (ref: DigitalObjectRef) => Promise<void>

  /** Remove follower */
  'do.colo.removeFollower': (ref: DigitalObjectRef) => Promise<void>

  /** List followers */
  'do.colo.listFollowers': () => Promise<DigitalObjectRef[]>

  // =========================================================================
  // Execution Methods
  // =========================================================================

  /** Execute code */
  'do.exec.code': (code: string, options?: ExecOptions) => Promise<ExecResult>

  /** Execute bash command */
  'do.exec.bash': (command: string, options?: ExecOptions) => Promise<BashResult>

  /** Execute a module */
  'do.exec.module': (moduleName: string, functionName: string, args?: unknown[]) => Promise<ExecResult>

  // =========================================================================
  // Children Methods
  // =========================================================================

  /** Create a child DO */
  'do.children.create': (type: DOType, name: string) => Promise<DigitalObjectRef>

  /** List child DOs */
  'do.children.list': (type?: DOType) => Promise<DigitalObjectRef[]>

  /** Get a child DO */
  'do.children.get': (name: string) => Promise<DigitalObjectRef | null>

  /** Delete a child DO */
  'do.children.delete': (name: string) => Promise<void>

  // =========================================================================
  // System Methods
  // =========================================================================

  /** Ping (health check) */
  'do.system.ping': () => Promise<{ pong: true; timestamp: number }>

  /** Get DO stats */
  'do.system.stats': () => Promise<DOStats>

  /** Get DO schema (available methods) */
  'do.system.schema': () => Promise<DOSchema>
}

/**
 * DO statistics
 */
export interface DOStats {
  identity: DigitalObjectIdentity
  storage: {
    usedBytes: number
    tableCount: number
    rowCount: number
  }
  connections: {
    active: number
    hibernating: number
  }
  cdc: {
    sequence: number
    pendingEvents: number
    subscribers: number
  }
  uptime: number
  lastActivity: number
}

/**
 * DO schema (for discovery)
 */
export interface DOSchema {
  type: DOType
  methods: MethodSchema[]
  collections: CollectionSchema[]
}

export interface MethodSchema {
  name: string
  description?: string
  params?: Record<string, string>
  returns?: string
}

export interface CollectionSchema {
  name: string
  schema?: Record<string, unknown>
}

// =============================================================================
// RPC Client
// =============================================================================

/**
 * RPC client for calling DO methods
 */
export interface RPCClient {
  /** Call a single method */
  call<M extends keyof DORPCMethods>(
    method: M,
    ...params: Parameters<DORPCMethods[M]>
  ): ReturnType<DORPCMethods[M]>

  /** Call multiple methods in a batch */
  batch(requests: RPCRequest[]): Promise<RPCBatchResponse>

  /** Subscribe to events */
  subscribe(channel: string, handler: (event: unknown) => void): () => void

  /** Close the connection */
  close(): Promise<void>
}
