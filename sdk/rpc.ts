/**
 * DO RPC Client - Wraps rpc.do for Digital Object operations
 *
 * Provides a type-safe client for interacting with Digital Objects via RPC.
 * Uses rpc.do as the underlying transport with DO-specific API definitions.
 *
 * @example
 * ```typescript
 * import { createDOClient } from '@do/sdk/rpc'
 *
 * const $ = createDOClient('https://my-do.workers.dev')
 *
 * // SQL queries
 * const users = await $.sql`SELECT * FROM users`.all()
 *
 * // Collections (MongoDB-style)
 * const admins = await $.collection('users').find({ role: 'admin' })
 *
 * // Storage
 * const config = await $.storage.get('config')
 *
 * // Colo info
 * console.log($.colo.code) // 'SJC'
 * ```
 *
 * @module @do/sdk/rpc
 */

import { http, capnweb, binding } from 'rpc.do'
import type {
  Noun,
  Verb,
  Thing,
  ThingExpanded,
  ThingCompact,
  Action,
  Relationship,
  Function,
  Workflow,
  User,
  Org,
  Agent,
  Role,
  ListOptions,
  ListResult,
  FilterExpression,
} from '../types/collections'

// =============================================================================
// Transport Type (from rpc.do)
// =============================================================================

/**
 * Transport interface for RPC calls
 */
export interface Transport {
  call(method: string, args: unknown[]): Promise<unknown>
  close?(): void
}

/**
 * Transport factory function type
 */
export type TransportFactory = () => Transport | Promise<Transport>

/**
 * Auth provider function type
 */
export type AuthProvider = () => string | null | undefined | Promise<string | null | undefined>

// Re-export transports
export { http, capnweb, binding }

// =============================================================================
// SQL Query Types
// =============================================================================

/**
 * SQL query result
 */
export interface SqlQueryResult<T = Record<string, unknown>> {
  results: T[]
  meta: {
    rows_read: number
    rows_written: number
  }
}

/**
 * SQL query builder (returned by $.sql`...`)
 */
export interface SqlQuery<T = Record<string, unknown>> {
  /** Execute and return all rows */
  all(): Promise<T[]>
  /** Execute and return first row */
  first(): Promise<T | null>
  /** Execute for side effects (INSERT, UPDATE, DELETE) */
  run(): Promise<{ rowsWritten: number }>
  /** Get the raw result with metadata */
  raw(): Promise<SqlQueryResult<T>>
}

// =============================================================================
// Storage Types
// =============================================================================

/**
 * Remote storage interface
 */
export interface RemoteStorage {
  get<T = unknown>(key: string): Promise<T | undefined>
  get<T = unknown>(keys: string[]): Promise<Map<string, T>>
  put<T = unknown>(key: string, value: T): Promise<void>
  put<T = unknown>(entries: Record<string, T>): Promise<void>
  delete(key: string): Promise<boolean>
  delete(keys: string[]): Promise<number>
  list<T = unknown>(options?: { prefix?: string; limit?: number; start?: string; end?: string }): Promise<Map<string, T>>
  keys(prefix?: string): Promise<string[]>
}

// =============================================================================
// Collection Types (MongoDB-style)
// =============================================================================

/**
 * MongoDB-style filter operators
 */
export type FilterOperator =
  | { $eq: unknown }
  | { $ne: unknown }
  | { $gt: number }
  | { $gte: number }
  | { $lt: number }
  | { $lte: number }
  | { $in: unknown[] }
  | { $nin: unknown[] }
  | { $exists: boolean }
  | { $regex: string }

/**
 * MongoDB-style filter query
 */
export type Filter<T> = {
  [K in keyof T]?: T[K] | FilterOperator
} & {
  $and?: Filter<T>[]
  $or?: Filter<T>[]
}

/**
 * Query options for find/list
 */
export interface QueryOptions {
  /** Maximum number of results */
  limit?: number
  /** Number of results to skip */
  offset?: number
  /** Sort by field (prefix with - for descending) */
  sort?: string
}

/**
 * Remote collection interface (MongoDB-style document store)
 */
export interface RemoteCollection<T extends Record<string, unknown> = Record<string, unknown>> {
  /** Get a document by ID */
  get(id: string): Promise<T | null>
  /** Put a document (insert or update) */
  put(id: string, doc: T): Promise<void>
  /** Delete a document */
  delete(id: string): Promise<boolean>
  /** Check if document exists */
  has(id: string): Promise<boolean>
  /** Find documents matching filter */
  find(filter?: Filter<T>, options?: QueryOptions): Promise<T[]>
  /** Count documents matching filter */
  count(filter?: Filter<T>): Promise<number>
  /** List all documents */
  list(options?: QueryOptions): Promise<T[]>
  /** Get all IDs */
  keys(): Promise<string[]>
  /** Delete all documents in collection */
  clear(): Promise<number>
}

/**
 * Collections manager interface
 */
export interface RemoteCollections {
  /** Get or create a collection by name */
  <T extends Record<string, unknown> = Record<string, unknown>>(name: string): RemoteCollection<T>
  /** List all collection names */
  names(): Promise<string[]>
  /** Get stats for all collections */
  stats(): Promise<Array<{ name: string; count: number; size: number }>>
}

// =============================================================================
// Schema Types
// =============================================================================

/**
 * Column schema for database introspection
 */
export interface ColumnSchema {
  name: string
  type: string
  nullable: boolean
  primaryKey: boolean
  defaultValue?: string
}

/**
 * Table schema for database introspection
 */
export interface TableSchema {
  name: string
  columns: ColumnSchema[]
  indexes: IndexSchema[]
}

/**
 * Index schema for database introspection
 */
export interface IndexSchema {
  name: string
  columns: string[]
  unique: boolean
}

/**
 * Database schema
 */
export interface DatabaseSchema {
  tables: TableSchema[]
  version?: number
}

/**
 * Full RPC schema
 */
export interface RpcSchema {
  version: 1
  methods: Array<{ name: string; path: string; params: number }>
  namespaces: Array<{ name: string; methods: Array<{ name: string; path: string; params: number }> }>
  database?: DatabaseSchema
  storageKeys?: string[]
  colo?: string
}

// =============================================================================
// Colo Types
// =============================================================================

/**
 * Colo (colocation) information for edge awareness
 */
export interface ColoInfo {
  /** Cloudflare colo code (e.g., 'SJC', 'AMS', 'NRT') */
  code: string
  /** Human-readable name (e.g., 'San Jose', 'Amsterdam', 'Tokyo') */
  name: string
  /** Region (e.g., 'North America', 'Europe', 'Asia') */
  region: string
  /** Country code (e.g., 'US', 'NL', 'JP') */
  country: string
  /** Coordinates [latitude, longitude] */
  coordinates?: [number, number]
}

// =============================================================================
// RPC Proxy Types
// =============================================================================

/**
 * Converts a sync function to async
 */
export type AsyncFunction<T> = T extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never

/**
 * Recursively converts an API definition to async proxy type
 */
export type RPCProxy<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : T[K] extends object ? RPCProxy<T[K]> : T[K]
}

// =============================================================================
// DO Client Type
// =============================================================================

/**
 * DO Client type - combines remote sql/storage/collections with custom methods
 */
export type DOClient<T = unknown> = {
  /** Tagged template SQL query */
  sql: <R = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) => SqlQuery<R>
  /** Remote storage access */
  storage: RemoteStorage
  /** Remote collection access (MongoDB-style) */
  collection: RemoteCollections
  /** Get database schema */
  dbSchema: () => Promise<DatabaseSchema>
  /** Get full RPC schema */
  schema: () => Promise<RpcSchema>
  /** Current colo information */
  colo: ColoInfo
  /** Close the connection */
  close: () => Promise<void>
} & RPCProxy<T>

// =============================================================================
// Implementation Helpers
// =============================================================================

/**
 * Create a serialized SQL query from tagged template
 */
function serializeSql(strings: TemplateStringsArray, values: unknown[]): { strings: string[]; values: unknown[] } {
  return {
    strings: Array.from(strings),
    values,
  }
}

/**
 * Create a SQL query builder
 */
function createSqlQuery<T>(transport: Transport, strings: TemplateStringsArray, values: unknown[]): SqlQuery<T> {
  const serialized = serializeSql(strings, values)

  return {
    async all(): Promise<T[]> {
      const result = (await transport.call('__sql', [serialized])) as SqlQueryResult<T>
      return result.results
    },
    async first(): Promise<T | null> {
      return transport.call('__sqlFirst', [serialized]) as Promise<T | null>
    },
    async run(): Promise<{ rowsWritten: number }> {
      return transport.call('__sqlRun', [serialized]) as Promise<{ rowsWritten: number }>
    },
    async raw(): Promise<SqlQueryResult<T>> {
      return transport.call('__sql', [serialized]) as Promise<SqlQueryResult<T>>
    },
  }
}

/**
 * Create a remote collection proxy
 */
function createCollectionProxy<T extends Record<string, unknown>>(transport: Transport, name: string): RemoteCollection<T> {
  return {
    async get(id: string): Promise<T | null> {
      return transport.call('__collectionGet', [name, id]) as Promise<T | null>
    },
    async put(id: string, doc: T): Promise<void> {
      await transport.call('__collectionPut', [name, id, doc])
    },
    async delete(id: string): Promise<boolean> {
      return transport.call('__collectionDelete', [name, id]) as Promise<boolean>
    },
    async has(id: string): Promise<boolean> {
      return transport.call('__collectionHas', [name, id]) as Promise<boolean>
    },
    async find(filter?: Filter<T>, options?: QueryOptions): Promise<T[]> {
      return transport.call('__collectionFind', [name, filter, options]) as Promise<T[]>
    },
    async count(filter?: Filter<T>): Promise<number> {
      return transport.call('__collectionCount', [name, filter]) as Promise<number>
    },
    async list(options?: QueryOptions): Promise<T[]> {
      return transport.call('__collectionList', [name, options]) as Promise<T[]>
    },
    async keys(): Promise<string[]> {
      return transport.call('__collectionKeys', [name]) as Promise<string[]>
    },
    async clear(): Promise<number> {
      return transport.call('__collectionClear', [name]) as Promise<number>
    },
  }
}

/**
 * Create a remote collections manager
 */
function createCollectionsProxy(transport: Transport): RemoteCollections {
  const fn = <T extends Record<string, unknown>>(name: string): RemoteCollection<T> => {
    return createCollectionProxy<T>(transport, name)
  }

  fn.names = async (): Promise<string[]> => {
    return transport.call('__collectionNames', []) as Promise<string[]>
  }

  fn.stats = async (): Promise<Array<{ name: string; count: number; size: number }>> => {
    return transport.call('__collectionStats', []) as Promise<Array<{ name: string; count: number; size: number }>>
  }

  return fn as RemoteCollections
}

/**
 * Create a remote storage proxy
 */
function createStorageProxy(transport: Transport): RemoteStorage {
  return {
    async get<T>(keyOrKeys: string | string[]): Promise<T | undefined | Map<string, T>> {
      if (Array.isArray(keyOrKeys)) {
        const result = (await transport.call('__storageGetMultiple', [keyOrKeys])) as Record<string, T>
        return new Map(Object.entries(result))
      }
      return transport.call('__storageGet', [keyOrKeys]) as Promise<T | undefined>
    },
    async put<T>(keyOrEntries: string | Record<string, T>, value?: T): Promise<void> {
      if (typeof keyOrEntries === 'string') {
        await transport.call('__storagePut', [keyOrEntries, value])
      } else {
        await transport.call('__storagePutMultiple', [keyOrEntries])
      }
    },
    async delete(keyOrKeys: string | string[]): Promise<boolean | number> {
      if (Array.isArray(keyOrKeys)) {
        return transport.call('__storageDeleteMultiple', [keyOrKeys]) as Promise<number>
      }
      return transport.call('__storageDelete', [keyOrKeys]) as Promise<boolean>
    },
    async list<T>(options?: { prefix?: string; limit?: number; start?: string; end?: string }): Promise<Map<string, T>> {
      const result = (await transport.call('__storageList', [options])) as Record<string, T>
      return new Map(Object.entries(result))
    },
    async keys(prefix?: string): Promise<string[]> {
      return transport.call('__storageKeys', [prefix]) as Promise<string[]>
    },
  } as RemoteStorage
}

/**
 * Default colo info (placeholder until fetched from server)
 */
const DEFAULT_COLO: ColoInfo = {
  code: 'UNK',
  name: 'Unknown',
  region: 'Unknown',
  country: 'XX',
}

// =============================================================================
// RPC Options
// =============================================================================

/**
 * Options for RPC client
 */
export interface RPCOptions {
  /** Auth token or provider */
  auth?: string | AuthProvider
  /** Request timeout in milliseconds */
  timeout?: number
  /** Enable WebSocket reconnection (default: true for ws/wss URLs) */
  reconnect?: boolean
}

// =============================================================================
// Main RPC Factory
// =============================================================================

/**
 * Create an RPC proxy with DOClient features
 *
 * @example
 * ```typescript
 * // Simple URL (recommended)
 * const $ = RPC('https://my-do.workers.dev')
 * await $.users.create({ name: 'John' })
 *
 * // With auth
 * const $ = RPC('https://my-do.workers.dev', { auth: 'my-token' })
 *
 * // DO features (sql, storage, collections)
 * const users = await $.sql`SELECT * FROM users`.all()
 * const config = await $.storage.get('config')
 * const admins = await $.collection('users').find({ role: 'admin' })
 *
 * // Colo info
 * console.log($.colo.code) // 'SJC'
 *
 * // With explicit transport (advanced)
 * const $ = RPC(http('https://my-do.workers.dev'))
 *
 * // Typed API
 * interface API {
 *   users: { create: (data: { name: string }) => { id: string } }
 * }
 * const $ = RPC<API>('https://my-do.workers.dev')
 * const result = await $.users.create({ name: 'John' }) // typed!
 * ```
 */
export function RPC<T = unknown>(urlOrTransport: string | Transport | TransportFactory, options?: RPCOptions): DOClient<T> {
  let transport: Transport | null = null
  let transportFactory: TransportFactory | null = null

  // Determine transport
  if (typeof urlOrTransport === 'string') {
    const url = urlOrTransport
    const isWebSocket = url.startsWith('ws://') || url.startsWith('wss://')

    if (isWebSocket) {
      transport = capnweb(url, {
        auth: options?.auth,
        websocket: true,
      } as Parameters<typeof capnweb>[1])
    } else {
      transport = http(url, {
        auth: options?.auth,
        timeout: options?.timeout,
      })
    }
  } else if (typeof urlOrTransport === 'function') {
    transportFactory = urlOrTransport
  } else {
    transport = urlOrTransport
  }

  // Get transport (initialize if factory)
  const getTransport = async (): Promise<Transport> => {
    if (transport) return transport
    if (transportFactory) {
      transport = await transportFactory()
      return transport
    }
    throw new Error('No transport configured')
  }

  // Sync transport getter for features that need immediate access
  const getTransportSync = (): Transport => {
    if (transport) return transport
    throw new Error('Transport not initialized. Call any async method first or provide a Transport directly.')
  }

  // Try to initialize transport synchronously if possible
  if (transportFactory === null && transport) {
    // Transport is already set, nothing to do
  }

  // Create the proxy for custom RPC methods
  const createMethodProxy = (path: string[]): unknown => {
    const handler: ProxyHandler<(...args: unknown[]) => Promise<unknown>> = {
      get(_, prop: string | symbol) {
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          return undefined
        }
        if (typeof prop === 'symbol') {
          return undefined
        }
        return createMethodProxy([...path, prop])
      },
      apply(_, __, args: unknown[]) {
        return (async () => {
          const t = await getTransport()
          return t.call(path.join('.'), args)
        })()
      },
    }
    return new Proxy(() => {}, handler)
  }

  // Mutable colo info (updated after first schema fetch)
  let coloInfo: ColoInfo = { ...DEFAULT_COLO }

  // The main client object with DOClient features
  const client: DOClient<T> = {
    // SQL tagged template
    sql: <R = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): SqlQuery<R> => {
      const t = getTransportSync()
      return createSqlQuery<R>(t, strings, values)
    },

    // Storage interface
    get storage(): RemoteStorage {
      return createStorageProxy(getTransportSync())
    },

    // Collection interface
    get collection(): RemoteCollections {
      return createCollectionsProxy(getTransportSync())
    },

    // Database schema
    dbSchema: async (): Promise<DatabaseSchema> => {
      const t = await getTransport()
      return t.call('__dbSchema', []) as Promise<DatabaseSchema>
    },

    // Full RPC schema
    schema: async (): Promise<RpcSchema> => {
      const t = await getTransport()
      const schema = (await t.call('__schema', [])) as RpcSchema
      // Update colo info from schema
      if (schema.colo) {
        coloInfo = getColoInfo(schema.colo)
      }
      return schema
    },

    // Colo info (getter for current value)
    get colo(): ColoInfo {
      return coloInfo
    },

    // Close connection
    close: async (): Promise<void> => {
      const t = await getTransport()
      t.close?.()
    },
  } as DOClient<T>

  // Create a proxy to handle both DOClient features and custom RPC methods
  return new Proxy(client, {
    get(target, prop: string | symbol) {
      // Handle known DOClient properties
      if (prop === 'sql' || prop === 'storage' || prop === 'collection' || prop === 'dbSchema' || prop === 'schema' || prop === 'colo' || prop === 'close') {
        return Reflect.get(target, prop)
      }

      // Handle symbols (like Symbol.dispose)
      if (typeof prop === 'symbol') {
        // Check for Symbol.dispose (available in newer runtimes)
        const symbolDispose = (Symbol as unknown as { dispose?: symbol }).dispose
        if (symbolDispose && prop === symbolDispose) {
          return async () => {
            const t = await getTransport()
            t.close?.()
          }
        }
        return undefined
      }

      // Handle promise-like checks
      if (prop === 'then' || prop === 'catch' || prop === 'finally') {
        return undefined
      }

      // Handle typeof check - return 'object' info
      if ((prop as unknown) === Symbol.toStringTag) {
        return 'DOClient'
      }

      // Proxy to RPC method calls
      return createMethodProxy([prop])
    },
  }) as DOClient<T>
}

// =============================================================================
// Colo Database
// =============================================================================

/**
 * Cloudflare colo database with region information
 */
const COLO_DATABASE: Record<string, Omit<ColoInfo, 'code'>> = {
  SJC: { name: 'San Jose', region: 'North America', country: 'US', coordinates: [37.3639, -121.9289] },
  LAX: { name: 'Los Angeles', region: 'North America', country: 'US', coordinates: [33.9416, -118.4085] },
  SEA: { name: 'Seattle', region: 'North America', country: 'US', coordinates: [47.4502, -122.3088] },
  DFW: { name: 'Dallas', region: 'North America', country: 'US', coordinates: [32.8998, -97.0403] },
  ORD: { name: 'Chicago', region: 'North America', country: 'US', coordinates: [41.974, -87.9073] },
  IAD: { name: 'Washington DC', region: 'North America', country: 'US', coordinates: [38.9531, -77.4565] },
  EWR: { name: 'Newark', region: 'North America', country: 'US', coordinates: [40.6895, -74.1745] },
  MIA: { name: 'Miami', region: 'North America', country: 'US', coordinates: [25.7959, -80.287] },
  ATL: { name: 'Atlanta', region: 'North America', country: 'US', coordinates: [33.6407, -84.4277] },
  AMS: { name: 'Amsterdam', region: 'Europe', country: 'NL', coordinates: [52.3105, 4.7683] },
  LHR: { name: 'London', region: 'Europe', country: 'GB', coordinates: [51.47, -0.4543] },
  FRA: { name: 'Frankfurt', region: 'Europe', country: 'DE', coordinates: [50.0379, 8.5622] },
  CDG: { name: 'Paris', region: 'Europe', country: 'FR', coordinates: [49.0097, 2.5479] },
  NRT: { name: 'Tokyo', region: 'Asia', country: 'JP', coordinates: [35.765, 140.3864] },
  HKG: { name: 'Hong Kong', region: 'Asia', country: 'HK', coordinates: [22.3089, 113.9144] },
  SIN: { name: 'Singapore', region: 'Asia', country: 'SG', coordinates: [1.3644, 103.9915] },
  SYD: { name: 'Sydney', region: 'Oceania', country: 'AU', coordinates: [-33.9461, 151.1772] },
  GRU: { name: 'Sao Paulo', region: 'South America', country: 'BR', coordinates: [-23.4356, -46.4731] },
  JNB: { name: 'Johannesburg', region: 'Africa', country: 'ZA', coordinates: [-26.1367, 28.246] },
}

/**
 * Get colo info from colo code
 */
function getColoInfo(code: string): ColoInfo {
  const info = COLO_DATABASE[code]
  if (info) {
    return { code, ...info }
  }
  return { code, name: code, region: 'Unknown', country: 'XX' }
}

// =============================================================================
// Environment Configuration
// =============================================================================

type EnvRecord = Record<string, string | undefined>
let globalEnv: EnvRecord | null = null

/** Environment variable keys checked for API key (in order) */
const API_KEY_ENV_VARS = ['DO_API_KEY', 'DO_TOKEN', 'ORG_AI_API_KEY', 'ORG_AI_TOKEN']

/**
 * Set the global environment for all DO SDKs
 * Call this once at your app's entry point
 *
 * @example
 * ```typescript
 * // Workers
 * import { env } from 'cloudflare:workers'
 * import { setEnv } from '@do/sdk/rpc'
 * setEnv(env)
 *
 * // Node.js
 * import { setEnv } from '@do/sdk/rpc'
 * setEnv(process.env)
 * ```
 */
export function setEnv(env: EnvRecord): void {
  globalEnv = env
}

/**
 * Get the global environment
 * Returns null if not set
 */
export function getEnv(): EnvRecord | null {
  return globalEnv
}

/**
 * Get a specific environment variable
 */
export function getEnvVar(key: string): string | undefined {
  return globalEnv?.[key]
}

/**
 * Check if environment is configured
 */
export function isEnvConfigured(): boolean {
  return globalEnv !== null
}

/**
 * Get the effective environment (explicit > global > Node.js process.env)
 */
function getEffectiveEnv(envOverride?: EnvRecord): EnvRecord | null {
  if (envOverride) return envOverride
  if (globalEnv) return globalEnv
  // Auto-detect Node.js
  if (typeof globalThis !== 'undefined') {
    const global = globalThis as unknown as Record<string, { env?: EnvRecord }>
    if (global.process?.env) return global.process.env
  }
  return null
}

/**
 * Get default API key from environment (async version)
 * Checks: DO_API_KEY, DO_TOKEN, ORG_AI_API_KEY, ORG_AI_TOKEN
 */
export async function getDefaultApiKey(envOverride?: EnvRecord): Promise<string | undefined> {
  const env = getEffectiveEnv(envOverride)
  if (env) {
    for (const key of API_KEY_ENV_VARS) {
      const value = env[key]
      if (typeof value === 'string' && value) {
        return value
      }
    }
  }
  return undefined
}

/**
 * Get default API key from environment (sync version)
 */
export function getDefaultApiKeySync(envOverride?: EnvRecord): string | undefined {
  const env = getEffectiveEnv(envOverride)
  if (env) {
    for (const key of API_KEY_ENV_VARS) {
      const value = env[key]
      if (typeof value === 'string' && value) {
        return value
      }
    }
  }
  return undefined
}

// =============================================================================
// API Types for DO Collections
// =============================================================================

/**
 * Standard CRUD operations for a collection
 */
export interface CollectionAPI<T, TCreate = Omit<T, 'id'>, TUpdate = Partial<T>> {
  /** List items with optional filtering and pagination */
  list(options?: ListOptions): ListResult<T>
  /** Get a single item by ID */
  get(id: string): T | null
  /** Create a new item */
  create(data: TCreate): T
  /** Update an existing item */
  update(id: string, data: TUpdate): T
  /** Delete an item by ID */
  delete(id: string): void
}

/**
 * Extended collection API with additional query methods
 */
export interface ExtendedCollectionAPI<T, TCreate = Omit<T, 'id'>, TUpdate = Partial<T>> extends CollectionAPI<T, TCreate, TUpdate> {
  /** Count items matching a filter */
  count(filter?: FilterExpression): number
  /** Find items matching a filter */
  find(filter: FilterExpression): T[]
}

/**
 * Relationship-specific API with graph traversal
 */
export interface RelationshipAPI extends ExtendedCollectionAPI<Relationship> {
  /** Traverse relationships from a source node */
  traverse(options: TraverseOptions): TraverseResult
}

/**
 * Options for graph traversal
 */
export interface TraverseOptions {
  /** Starting node ID */
  from: string
  /** Relationship type to follow */
  type?: string
  /** Direction of traversal */
  direction?: 'outgoing' | 'incoming' | 'both'
  /** Maximum depth to traverse */
  depth?: number
  /** Filter for target nodes */
  filter?: FilterExpression
  /** Maximum results */
  limit?: number
}

/**
 * Result of a graph traversal
 */
export interface TraverseResult {
  /** Nodes found during traversal */
  nodes: Array<{ id: string; depth: number; data?: unknown }>
  /** Edges traversed */
  edges: Relationship[]
  /** Total nodes visited */
  visited: number
}

/**
 * Complete DO API interface with all collections
 */
export interface DOApi {
  // ==========================================================================
  // Data Collections
  // ==========================================================================

  /** Noun definitions (entity types) */
  nouns: ExtendedCollectionAPI<Noun>

  /** Verb definitions (action types) */
  verbs: ExtendedCollectionAPI<Verb>

  /** Thing instances (entities) */
  things: ExtendedCollectionAPI<Thing, Omit<ThingExpanded, '$id'> | Omit<ThingCompact, 'id'>, Partial<ThingExpanded> | Partial<ThingCompact>>

  /** Relationship instances (edges between things) */
  relationships: RelationshipAPI

  // ==========================================================================
  // Execution Collections
  // ==========================================================================

  /** Function definitions */
  functions: ExtendedCollectionAPI<Function>

  /** Workflow definitions */
  workflows: ExtendedCollectionAPI<Workflow>

  // ==========================================================================
  // Identity Collections
  // ==========================================================================

  /** User accounts */
  users: ExtendedCollectionAPI<User>

  /** Organizations */
  orgs: ExtendedCollectionAPI<Org>

  /** AI Agents */
  agents: ExtendedCollectionAPI<Agent>

  /** Roles (permissions) */
  roles: ExtendedCollectionAPI<Role>
}

// =============================================================================
// Client Configuration
// =============================================================================

/**
 * Configuration options for the DO client
 */
export interface DOClientConfig {
  /** Base URL for the DO API (default: https://do.md) */
  baseURL?: string
  /** DO instance identifier (name or ID) */
  doId?: string
  /** API token for authentication */
  token?: string
  /** Auth provider function for dynamic token retrieval */
  authProvider?: AuthProvider
  /** Transport type: 'http' | 'capnweb' | 'auto' (default: 'http') */
  transport?: 'http' | 'capnweb' | 'auto'
  /** Environment variables to use for config resolution */
  env?: EnvRecord
  /** Enable debug logging */
  debug?: boolean
}

/**
 * DO client with all API methods
 */
export type DOApiClient = DOClient<DOApi>

// =============================================================================
// Client Factory
// =============================================================================

/**
 * Create a typed DO RPC client.
 *
 * The client provides type-safe access to all DO collections via RPC.
 * It automatically handles authentication and transport selection.
 *
 * @param options - Client configuration
 * @returns Typed DO API client
 *
 * @example
 * ```typescript
 * // Basic usage
 * const client = createDOApiClient({ baseURL: 'https://my-do.workers.dev' })
 *
 * // SQL queries
 * const users = await client.sql`SELECT * FROM users`.all()
 *
 * // Collections
 * const admins = await client.collection('users').find({ role: 'admin' })
 *
 * // Storage
 * const config = await client.storage.get('config')
 *
 * // Close when done
 * await client.close()
 * ```
 */
export function createDOApiClient(options: DOClientConfig = {}): DOApiClient {
  const { baseURL = 'https://do.md', doId, token, authProvider, transport: transportType = 'http', env, debug } = options

  // Resolve auth from options or environment
  const auth = token ?? authProvider ?? getDefaultApiKeySync(env)

  // Build endpoint URL
  const endpoint = doId ? `${baseURL}/do/${doId}` : baseURL

  if (debug) {
    console.debug(`[DO RPC] Creating client for ${endpoint} with transport: ${transportType}`)
  }

  return RPC<DOApi>(endpoint, { auth })
}

// =============================================================================
// Convenience Exports
// =============================================================================

/**
 * Create a client for a specific DO instance
 *
 * @param doId - DO instance identifier
 * @param options - Additional client options
 * @returns Typed DO API client
 */
export function connectDO(doId: string, options: Omit<DOClientConfig, 'doId'> = {}): DOApiClient {
  return createDOApiClient({ ...options, doId })
}

/**
 * Create a DO client (alias for RPC)
 *
 * @example
 * ```typescript
 * const $ = createDOClient('https://my-do.workers.dev')
 * const users = await $.sql`SELECT * FROM users`.all()
 * ```
 */
export function createDOClient<T = unknown>(url: string, options?: RPCOptions): DOClient<T> {
  return RPC<T>(url, options)
}

/**
 * Default DO client instance.
 *
 * Uses environment variables for configuration:
 * - DO_API_KEY or DO_TOKEN for authentication
 * - DO_BASE_URL for base URL (default: https://do.md)
 *
 * @example
 * ```typescript
 * import { doClient } from '@do/sdk/rpc'
 *
 * const things = await doClient.things.list()
 * ```
 */
export const doClient: DOApiClient = createDOApiClient()

// =============================================================================
// Service Binding Support
// =============================================================================

/**
 * Create a client from a Cloudflare Workers service binding
 *
 * @param serviceBinding - The service binding from env
 * @returns Typed DO API client
 *
 * @example
 * ```typescript
 * export default {
 *   async fetch(request, env) {
 *     const client = createDOClientFromBinding(env.DO_SERVICE)
 *     const things = await client.things.list()
 *     return Response.json(things)
 *   }
 * }
 * ```
 */
export function createDOClientFromBinding(serviceBinding: unknown): DOApiClient {
  return RPC<DOApi>(binding(serviceBinding))
}

// =============================================================================
// Type Utilities
// =============================================================================

/**
 * Extract the item type from a collection API
 */
export type CollectionItem<T> = T extends CollectionAPI<infer U> ? U : never

/**
 * Extract all collection names from the DO API
 */
export type CollectionName = keyof DOApi

/**
 * Get the item type for a specific collection
 */
export type CollectionItemType<K extends CollectionName> = CollectionItem<DOApi[K]>

// =============================================================================
// RPC Error Class
// =============================================================================

/**
 * Error class for RPC failures
 */
export class RPCError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown
  ) {
    super(message)
    this.name = 'RPCError'
  }
}
