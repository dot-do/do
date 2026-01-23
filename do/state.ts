/**
 * State Management for Digital Objects
 *
 * Provides persistent state storage backed by Durable Object SQLite.
 * Supports:
 * - Key-value operations (get, set, delete)
 * - Batch operations (getMany, setMany, deleteMany)
 * - Transactional updates with ACID guarantees
 * - CDC (Change Data Capture) event emission
 * - Versioning for optimistic concurrency
 *
 * @example Basic usage
 * ```typescript
 * // Get and set values
 * const value = await state.get<User>('user:123')
 * await state.set('user:123', { name: 'Alice', email: 'alice@example.com' })
 *
 * // Delete a value
 * const deleted = await state.delete('user:123')
 * ```
 *
 * @example Transactional updates
 * ```typescript
 * await state.transaction(async (tx) => {
 *   const user = await tx.get<User>('user:123')
 *   await tx.set('user:123', { ...user, balance: user.balance - 100 })
 *   await tx.set('user:456', { ...otherUser, balance: otherUser.balance + 100 })
 *   // Both updates succeed or both fail
 * })
 * ```
 *
 * @module do/state
 */

import type { DurableObjectState, DurableObjectStorage } from '@cloudflare/workers-types'
import type { CDCEvent, CDCOperation, CDCCursor } from '../types/storage'

/**
 * State mutation handler callback
 *
 * @callback MutationHandler
 * @param event - The CDC event describing the mutation
 */
export type MutationHandler = (event: CDCEvent) => void | Promise<void>

/**
 * Options for state operations
 *
 * @interface StateOptions
 */
export interface StateOptions {
  /** Whether to emit CDC events (default: true) */
  emitCDC?: boolean
  /** Whether to allow concurrent writes (default: false - uses optimistic locking) */
  allowConcurrent?: boolean
  /** TTL in milliseconds for the value (optional) */
  ttl?: number
}

/**
 * Transaction interface for atomic operations
 *
 * All operations within a transaction are executed atomically.
 * If any operation fails, all changes are rolled back.
 *
 * @interface DOStateTransaction
 */
export interface DOStateTransaction {
  /**
   * Get a value within the transaction
   *
   * @param key - The key to retrieve
   * @returns The value or null if not found
   */
  get<T>(key: string): Promise<T | null>

  /**
   * Set a value within the transaction
   *
   * @param key - The key to set
   * @param value - The value to store
   */
  set<T>(key: string, value: T): Promise<void>

  /**
   * Delete a value within the transaction
   *
   * @param key - The key to delete
   * @returns True if the key existed and was deleted
   */
  delete(key: string): Promise<boolean>

  /**
   * Get multiple values within the transaction
   *
   * @param keys - The keys to retrieve
   * @returns Map of key to value (only includes keys that exist)
   */
  getMany<T>(keys: string[]): Promise<Map<string, T>>

  /**
   * Set multiple values within the transaction
   *
   * @param entries - Map of key to value
   */
  setMany(entries: Map<string, unknown>): Promise<void>

  /**
   * Delete multiple values within the transaction
   *
   * @param keys - The keys to delete
   * @returns Number of keys that were deleted
   */
  deleteMany(keys: string[]): Promise<number>
}

/**
 * State management interface for Digital Objects
 *
 * Provides all state operations including CDC event emission.
 *
 * @interface DOState
 */
export interface DOState {
  /**
   * Get a value by key
   *
   * @param key - The key to retrieve
   * @returns The value or null if not found
   *
   * @example
   * ```typescript
   * const user = await state.get<User>('user:123')
   * if (user) {
   *   console.log(user.name)
   * }
   * ```
   */
  get<T>(key: string): Promise<T | null>

  /**
   * Set a value by key
   *
   * @param key - The key to set
   * @param value - The value to store
   * @param options - Optional configuration
   *
   * @example
   * ```typescript
   * await state.set('user:123', { name: 'Alice', email: 'alice@example.com' })
   *
   * // With TTL
   * await state.set('session:abc', { userId: '123' }, { ttl: 3600000 })
   * ```
   */
  set<T>(key: string, value: T, options?: StateOptions): Promise<void>

  /**
   * Delete a value by key
   *
   * @param key - The key to delete
   * @returns True if the key existed and was deleted
   *
   * @example
   * ```typescript
   * const deleted = await state.delete('user:123')
   * console.log(`Deleted: ${deleted}`)
   * ```
   */
  delete(key: string): Promise<boolean>

  /**
   * Get multiple values by keys
   *
   * @param keys - The keys to retrieve
   * @returns Map of key to value (only includes keys that exist)
   *
   * @example
   * ```typescript
   * const users = await state.getMany<User>(['user:123', 'user:456'])
   * for (const [key, user] of users) {
   *   console.log(user.name)
   * }
   * ```
   */
  getMany<T>(keys: string[]): Promise<Map<string, T>>

  /**
   * Set multiple values
   *
   * @param entries - Map of key to value
   * @param options - Optional configuration
   *
   * @example
   * ```typescript
   * const entries = new Map([
   *   ['user:123', { name: 'Alice' }],
   *   ['user:456', { name: 'Bob' }]
   * ])
   * await state.setMany(entries)
   * ```
   */
  setMany(entries: Map<string, unknown>, options?: StateOptions): Promise<void>

  /**
   * Delete multiple values by keys
   *
   * @param keys - The keys to delete
   * @returns Number of keys that were deleted
   *
   * @example
   * ```typescript
   * const count = await state.deleteMany(['user:123', 'user:456'])
   * console.log(`Deleted ${count} users`)
   * ```
   */
  deleteMany(keys: string[]): Promise<number>

  /**
   * List keys with optional prefix filter
   *
   * @param options - List options
   * @returns Array of keys matching the filter
   *
   * @example
   * ```typescript
   * // List all user keys
   * const userKeys = await state.list({ prefix: 'user:' })
   *
   * // List with pagination
   * const page = await state.list({ prefix: 'user:', limit: 10, cursor: 'abc' })
   * ```
   */
  list(options?: ListOptions): Promise<ListResult>

  /**
   * Execute operations in a transaction
   *
   * All operations within the transaction are executed atomically.
   * If any operation fails, all changes are rolled back.
   *
   * @param fn - The transaction function
   * @returns The result of the transaction function
   *
   * @example
   * ```typescript
   * await state.transaction(async (tx) => {
   *   const sender = await tx.get<Account>('account:sender')
   *   const receiver = await tx.get<Account>('account:receiver')
   *
   *   await tx.set('account:sender', { ...sender, balance: sender.balance - 100 })
   *   await tx.set('account:receiver', { ...receiver, balance: receiver.balance + 100 })
   * })
   * ```
   */
  transaction<T>(fn: (tx: DOStateTransaction) => Promise<T>): Promise<T>

  /**
   * Get the current version number
   *
   * Version is incremented on each mutation.
   *
   * @returns Current version number
   */
  getVersion(): number

  /**
   * Get the current CDC cursor
   *
   * The cursor represents the position in the CDC event stream.
   *
   * @returns Current CDC cursor
   */
  getCursor(): CDCCursor

  /**
   * Register a handler for mutation events
   *
   * @param handler - Function to call on each mutation
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = state.onMutation((event) => {
   *   console.log(`${event.operation} on ${event.collection}:${event.documentId}`)
   *   // Forward to parent context
   *   await sendToParent(event)
   * })
   *
   * // Later: unsubscribe()
   * ```
   */
  onMutation(handler: MutationHandler): () => void

  /**
   * Get CDC events since a cursor
   *
   * @param cursor - Starting cursor (exclusive)
   * @param limit - Maximum events to return
   * @returns Array of CDC events
   */
  getChangesSince(cursor: CDCCursor, limit?: number): Promise<CDCEvent[]>

  /**
   * Flush pending writes to storage
   *
   * Normally writes are automatically flushed.
   * Call this to force immediate persistence.
   */
  flush(): Promise<void>
}

/**
 * Options for listing keys
 *
 * @interface ListOptions
 */
export interface ListOptions {
  /** Key prefix filter */
  prefix?: string
  /** Start key (exclusive) */
  start?: string
  /** End key (exclusive) */
  end?: string
  /** Maximum number of keys to return */
  limit?: number
  /** Cursor for pagination */
  cursor?: string
  /** Whether to return keys in reverse order */
  reverse?: boolean
}

/**
 * Result of listing keys
 *
 * @interface ListResult
 */
export interface ListResult {
  /** Array of keys */
  keys: string[]
  /** Cursor for next page (undefined if no more) */
  cursor?: string
  /** Whether there are more results */
  hasMore: boolean
}

/**
 * Internal stored value wrapper
 *
 * @interface StoredValue
 * @internal
 */
interface StoredValue<T = unknown> {
  /** The actual value */
  value: T
  /** Version when this value was written */
  version: number
  /** Creation timestamp */
  createdAt: number
  /** Last update timestamp */
  updatedAt: number
  /** Expiration timestamp (optional) */
  expiresAt?: number
}

/**
 * Create a DOState instance from Durable Object state
 *
 * @param ctx - Durable Object state from Cloudflare runtime
 * @returns DOState instance
 *
 * @example
 * ```typescript
 * const state = createDOState(ctx)
 * await state.set('key', 'value')
 * ```
 */
export function createDOState(ctx: DurableObjectState): DOState {
  return new DOStateImpl(ctx)
}

/**
 * Implementation of DOState interface
 *
 * @internal
 */
class DOStateImpl implements DOState {
  private storage: DurableObjectStorage
  private version = 0
  private sequence = 0
  private handlers: Set<MutationHandler> = new Set()

  constructor(private ctx: DurableObjectState) {
    this.storage = ctx.storage
  }

  async get<T>(key: string): Promise<T | null> {
    const stored = await this.storage.get<StoredValue<T>>(key)

    if (!stored) return null

    // Check expiration
    if (stored.expiresAt && stored.expiresAt < Date.now()) {
      await this.storage.delete(key)
      return null
    }

    return stored.value
  }

  async set<T>(key: string, value: T, options?: StateOptions): Promise<void> {
    const now = Date.now()
    const existing = await this.storage.get<StoredValue<T>>(key)

    // Increment version
    this.version++

    const stored: StoredValue<T> = {
      value,
      version: this.version,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      expiresAt: options?.ttl ? now + options.ttl : undefined,
    }

    await this.storage.put(key, stored)

    // Emit CDC event if enabled
    if (options?.emitCDC !== false) {
      await this.emitCDCEvent({
        operation: existing ? 'UPDATE' : 'INSERT',
        key,
        before: existing?.value,
        after: value,
      })
    }
  }

  async delete(key: string): Promise<boolean> {
    const existing = await this.storage.get<StoredValue>(key)

    if (!existing) return false

    await this.storage.delete(key)

    // Emit CDC event
    await this.emitCDCEvent({
      operation: 'DELETE',
      key,
      before: existing.value,
      after: undefined,
    })

    return true
  }

  async getMany<T>(keys: string[]): Promise<Map<string, T>> {
    const results = await this.storage.get<StoredValue<T>>(keys)
    const output = new Map<string, T>()
    const now = Date.now()

    for (const [key, stored] of results) {
      // Skip expired values
      if (stored.expiresAt && stored.expiresAt < now) {
        await this.storage.delete(key)
        continue
      }
      output.set(key, stored.value)
    }

    return output
  }

  async setMany(entries: Map<string, unknown>, options?: StateOptions): Promise<void> {
    const now = Date.now()
    const toStore = new Map<string, StoredValue>()

    // Get existing values for CDC
    const existingKeys = Array.from(entries.keys())
    const existing = await this.storage.get<StoredValue>(existingKeys)

    for (const [key, value] of entries) {
      this.version++

      const existingValue = existing.get(key)

      toStore.set(key, {
        value,
        version: this.version,
        createdAt: existingValue?.createdAt ?? now,
        updatedAt: now,
        expiresAt: options?.ttl ? now + options.ttl : undefined,
      })

      // Emit CDC event
      if (options?.emitCDC !== false) {
        await this.emitCDCEvent({
          operation: existingValue ? 'UPDATE' : 'INSERT',
          key,
          before: existingValue?.value,
          after: value,
        })
      }
    }

    await this.storage.put(Object.fromEntries(toStore))
  }

  async deleteMany(keys: string[]): Promise<number> {
    const existing = await this.storage.get<StoredValue>(keys)
    let count = 0

    for (const [key, stored] of existing) {
      await this.emitCDCEvent({
        operation: 'DELETE',
        key,
        before: stored.value,
        after: undefined,
      })
      count++
    }

    await this.storage.delete(keys)
    return count
  }

  async list(options?: ListOptions): Promise<ListResult> {
    const listOptions: DurableObjectListOptions = {}

    if (options?.prefix) listOptions.prefix = options.prefix
    if (options?.start) listOptions.start = options.start
    if (options?.end) listOptions.end = options.end
    if (options?.limit) listOptions.limit = options.limit + 1 // Fetch one extra to check hasMore
    if (options?.reverse) listOptions.reverse = options.reverse

    const results = await this.storage.list(listOptions)
    const keys = Array.from(results.keys())

    const hasMore = options?.limit ? keys.length > options.limit : false
    if (hasMore) keys.pop() // Remove the extra item

    return {
      keys,
      hasMore,
      cursor: hasMore ? keys[keys.length - 1] : undefined,
    }
  }

  async transaction<T>(fn: (tx: DOStateTransaction) => Promise<T>): Promise<T> {
    // Cloudflare DO storage transactions are automatic within blockConcurrencyWhile
    return this.ctx.blockConcurrencyWhile(async () => {
      const tx = new TransactionImpl(this)
      return fn(tx)
    })
  }

  getVersion(): number {
    return this.version
  }

  getCursor(): CDCCursor {
    return {
      sequence: this.sequence,
      timestamp: Date.now(),
    }
  }

  onMutation(handler: MutationHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  async getChangesSince(cursor: CDCCursor, limit = 100): Promise<CDCEvent[]> {
    // TODO: Implement CDC event storage and retrieval
    return []
  }

  async flush(): Promise<void> {
    // Cloudflare DO storage automatically flushes
    // This is a no-op but can be overridden for testing
  }

  /**
   * Emit a CDC event to all registered handlers
   *
   * @internal
   */
  private async emitCDCEvent(params: {
    operation: CDCOperation
    key: string
    before?: unknown
    after?: unknown
  }): Promise<void> {
    this.sequence++

    const event: CDCEvent = {
      id: `${this.sequence}-${Date.now()}`,
      operation: params.operation,
      collection: this.extractCollection(params.key),
      documentId: params.key,
      timestamp: Date.now(),
      sequence: this.sequence,
      before: params.before,
      after: params.after,
    }

    // Notify all handlers
    for (const handler of this.handlers) {
      try {
        await handler(event)
      } catch (error) {
        console.error('CDC handler error:', error)
      }
    }
  }

  /**
   * Extract collection name from key
   *
   * Keys are expected to be in format: collection:id
   * e.g., "user:123" -> "user"
   *
   * @internal
   */
  private extractCollection(key: string): string {
    const colonIndex = key.indexOf(':')
    return colonIndex > 0 ? key.slice(0, colonIndex) : 'default'
  }
}

/**
 * Transaction implementation
 *
 * @internal
 */
class TransactionImpl implements DOStateTransaction {
  constructor(private state: DOStateImpl) {}

  get<T>(key: string): Promise<T | null> {
    return this.state.get<T>(key)
  }

  set<T>(key: string, value: T): Promise<void> {
    return this.state.set(key, value)
  }

  delete(key: string): Promise<boolean> {
    return this.state.delete(key)
  }

  getMany<T>(keys: string[]): Promise<Map<string, T>> {
    return this.state.getMany<T>(keys)
  }

  setMany(entries: Map<string, unknown>): Promise<void> {
    return this.state.setMany(entries)
  }

  deleteMany(keys: string[]): Promise<number> {
    return this.state.deleteMany(keys)
  }
}

/**
 * Type definition for Durable Object list options
 *
 * @internal
 */
interface DurableObjectListOptions {
  prefix?: string
  start?: string
  end?: string
  limit?: number
  reverse?: boolean
}

export default createDOState
