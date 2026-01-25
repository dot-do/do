/**
 * DO RPC Client - Wraps rpc.do for Digital Object operations
 *
 * Provides a type-safe client for interacting with Digital Objects via RPC.
 * Uses rpc.do as the underlying transport with DO-specific API definitions.
 *
 * @example
 * ```typescript
 * import { createDOApiClient } from '@do/sdk/rpc'
 *
 * const client = createDOApiClient({ baseURL: 'https://my-do.workers.dev' })
 * const things = await client.things.list()
 *
 * // With authentication
 * const authClient = createDOApiClient({
 *   baseURL: 'https://my-do.workers.dev',
 *   token: 'my-api-token'
 * })
 * ```
 *
 * @module @do/sdk/rpc
 */

import { RPC, http, capnweb, binding, type Transport, type RPCProxy, type AuthProvider } from 'rpc.do'
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
// Re-exports from rpc.do
// =============================================================================

export { RPC, http, capnweb, binding }
export type { Transport, RPCProxy, AuthProvider }

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
// API Types
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
export type DOApiClient = RPCProxy<DOApi>

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
 * // List all things
 * const { items } = await client.things.list({ limit: 10 })
 *
 * // Create a new thing
 * const thing = await client.things.create({
 *   $type: 'Customer',
 *   name: 'Acme Corp',
 *   email: 'contact@acme.com'
 * })
 *
 * // Traverse relationships
 * const result = await client.relationships.traverse({
 *   from: 'customer-123',
 *   type: 'purchased',
 *   depth: 2
 * })
 *
 * // Close when done
 * await client.close?.()
 * ```
 */
export function createDOApiClient(options: DOClientConfig = {}): DOApiClient {
  const { baseURL = 'https://do.md', doId, token, authProvider, transport: transportType = 'http', env, debug } = options

  // Resolve auth from options or environment
  const auth = token ?? authProvider ?? getDefaultApiKeySync(env)

  // Build endpoint URL
  const endpoint = doId ? `${baseURL}/do/${doId}` : baseURL

  // Create transport based on type
  let transport: Transport

  switch (transportType) {
    case 'capnweb':
      // Use capnweb with WebSocket for persistent connection
      transport = capnweb(endpoint, { websocket: true, auth })
      break
    case 'auto':
      // Use capnweb with WebSocket for auto mode (persistent connection preferred)
      transport = capnweb(endpoint, { websocket: true, auth })
      break
    case 'http':
    default:
      // Use capnweb without websocket for HTTP mode (stateless requests)
      transport = capnweb(endpoint, { websocket: false, auth })
  }

  if (debug) {
    console.debug(`[DO RPC] Creating client for ${endpoint} with transport: ${transportType}`)
  }

  return RPC<DOApi>(transport)
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
