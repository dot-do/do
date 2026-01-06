/**
 * @dotdo/do - LRUCache Implementation (GREEN Phase - workers-ap2)
 *
 * A high-performance LRU (Least Recently Used) cache with:
 * - Count-based limit (max number of items)
 * - Size-based limit (max total bytes)
 * - TTL (time-to-live) expiration
 * - Eviction callbacks
 * - LRU eviction policy
 */

/**
 * Options for configuring the LRUCache
 */
export interface LRUCacheOptions<V> {
  /** Maximum number of items in the cache */
  maxCount?: number
  /** Maximum total size in bytes */
  maxSize?: number
  /** Function to calculate the size of a value */
  sizeCalculator?: (value: V) => number
  /** Default TTL in milliseconds for all items */
  defaultTTL?: number
  /** Whether to update TTL when an item is accessed via get() */
  updateAgeOnGet?: boolean
  /** Callback invoked when an item is evicted */
  onEvict?: (key: string, value: V, reason: EvictionReason) => void
}

/**
 * Options for the set() method
 */
export interface SetOptions {
  /** TTL in milliseconds for this specific item (0 or Infinity = no expiration) */
  ttl?: number
}

/**
 * Reason why an item was evicted from the cache
 */
export type EvictionReason = 'count' | 'size' | 'expired' | 'deleted' | 'cleared'

/**
 * Internal cache entry structure
 */
interface CacheEntry<V> {
  value: V
  size: number
  expiresAt?: number // undefined means no expiration
}

/**
 * LRU Cache with count/size limits, TTL expiration, and eviction callbacks
 */
export class LRUCache<V = unknown> {
  private cache: Map<string, CacheEntry<V>>
  private readonly _maxCount?: number
  private readonly _maxSize?: number
  private readonly sizeCalculator: (value: V) => number
  private readonly defaultTTL?: number
  private readonly updateAgeOnGet: boolean
  private readonly onEvict?: (key: string, value: V, reason: EvictionReason) => void
  private _totalSize: number = 0

  constructor(options: LRUCacheOptions<V>) {
    if (options.maxCount === undefined && options.maxSize === undefined) {
      throw new Error('LRUCache requires at least maxCount or maxSize option')
    }

    this._maxCount = options.maxCount
    this._maxSize = options.maxSize
    this.defaultTTL = options.defaultTTL
    this.updateAgeOnGet = options.updateAgeOnGet ?? false
    this.onEvict = options.onEvict
    this.cache = new Map()

    // Default size calculator uses JSON.stringify length
    this.sizeCalculator = options.sizeCalculator ?? ((value: V) => {
      try {
        return JSON.stringify(value).length
      } catch {
        return 0
      }
    })
  }

  /**
   * Get the maximum number of items allowed
   */
  get maxCount(): number | undefined {
    return this._maxCount
  }

  /**
   * Get the maximum total size allowed
   */
  get maxSize(): number | undefined {
    return this._maxSize
  }

  /**
   * Get the current number of items in the cache
   */
  get size(): number {
    return this.cache.size
  }

  /**
   * Get the current total size of all cached items
   */
  get totalSize(): number {
    return this._totalSize
  }

  /**
   * Set a value in the cache
   */
  set(key: string, value: V, options?: SetOptions): this {
    const ttl = options?.ttl

    // Validate TTL
    if (ttl !== undefined) {
      if (Number.isNaN(ttl)) {
        throw new Error('TTL cannot be NaN')
      }
      if (ttl < 0) {
        throw new Error('TTL cannot be negative')
      }
    }

    const itemSize = this._maxSize !== undefined ? this.sizeCalculator(value) : 0

    // Reject items larger than maxSize
    if (this._maxSize !== undefined && itemSize > this._maxSize) {
      return this
    }

    // Calculate expiration time
    let expiresAt: number | undefined
    const effectiveTTL = ttl ?? this.defaultTTL

    if (effectiveTTL !== undefined && effectiveTTL !== 0 && effectiveTTL !== Infinity) {
      expiresAt = Date.now() + effectiveTTL
    }

    // If updating existing key, remove its size first
    const existingEntry = this.cache.get(key)
    if (existingEntry) {
      this._totalSize -= existingEntry.size
      this.cache.delete(key)
    }

    // Evict items until we have space
    this.evictToFit(itemSize)

    // Add the new entry
    const entry: CacheEntry<V> = {
      value,
      size: itemSize,
      expiresAt,
    }

    this.cache.set(key, entry)
    this._totalSize += itemSize

    return this
  }

  /**
   * Get a value from the cache
   */
  get(key: string): V | undefined {
    const entry = this.cache.get(key)

    if (!entry) {
      return undefined
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.deleteInternal(key, entry, 'expired')
      return undefined
    }

    // Update recency by re-inserting (Map maintains insertion order)
    this.cache.delete(key)

    // Update TTL if updateAgeOnGet is enabled
    if (this.updateAgeOnGet && entry.expiresAt !== undefined) {
      const remainingTTL = entry.expiresAt - Date.now()
      const effectiveTTL = this.defaultTTL ?? remainingTTL
      entry.expiresAt = Date.now() + effectiveTTL
    }

    this.cache.set(key, entry)

    return entry.value
  }

  /**
   * Check if a key exists in the cache
   */
  has(key: string): boolean {
    const entry = this.cache.get(key)

    if (!entry) {
      return false
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.deleteInternal(key, entry, 'expired')
      return false
    }

    return true
  }

  /**
   * Delete a key from the cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key)

    if (!entry) {
      return false
    }

    this.deleteInternal(key, entry, 'deleted')
    return true
  }

  /**
   * Clear all items from the cache
   */
  clear(): void {
    if (this.onEvict) {
      for (const [key, entry] of this.cache) {
        this.onEvict(key, entry.value, 'cleared')
      }
    }
    this.cache.clear()
    this._totalSize = 0
  }

  /**
   * Get the remaining TTL for a key in milliseconds
   */
  getRemainingTTL(key: string): number | undefined {
    const entry = this.cache.get(key)

    if (!entry) {
      return undefined
    }

    // No expiration set
    if (entry.expiresAt === undefined) {
      return Infinity
    }

    const remaining = entry.expiresAt - Date.now()
    return remaining > 0 ? remaining : 0
  }

  /**
   * Purge all expired items from the cache
   */
  purgeStale(): number {
    let purgedCount = 0
    const now = Date.now()

    for (const [key, entry] of this.cache) {
      if (entry.expiresAt !== undefined && entry.expiresAt <= now) {
        this.deleteInternal(key, entry, 'expired')
        purgedCount++
      }
    }

    return purgedCount
  }

  /**
   * Iterate over all keys (most recently used first)
   */
  *keys(): IterableIterator<string> {
    // Convert to array and reverse to get most recent first
    const entries = Array.from(this.cache.entries()).reverse()
    const now = Date.now()

    for (const [key, entry] of entries) {
      // Skip expired items
      if (entry.expiresAt !== undefined && entry.expiresAt <= now) {
        continue
      }
      yield key
    }
  }

  /**
   * Iterate over all values (most recently used first)
   */
  *values(): IterableIterator<V> {
    const entries = Array.from(this.cache.entries()).reverse()
    const now = Date.now()

    for (const [, entry] of entries) {
      // Skip expired items
      if (entry.expiresAt !== undefined && entry.expiresAt <= now) {
        continue
      }
      yield entry.value
    }
  }

  /**
   * Iterate over all entries (most recently used first)
   */
  *entries(): IterableIterator<[string, V]> {
    const entries = Array.from(this.cache.entries()).reverse()
    const now = Date.now()

    for (const [key, entry] of entries) {
      // Skip expired items
      if (entry.expiresAt !== undefined && entry.expiresAt <= now) {
        continue
      }
      yield [key, entry.value]
    }
  }

  /**
   * Internal: Check if an entry is expired
   */
  private isExpired(entry: CacheEntry<V>): boolean {
    if (entry.expiresAt === undefined) {
      return false
    }
    return Date.now() >= entry.expiresAt
  }

  /**
   * Internal: Delete an entry and call eviction callback
   */
  private deleteInternal(key: string, entry: CacheEntry<V>, reason: EvictionReason): void {
    this.cache.delete(key)
    this._totalSize -= entry.size
    this.onEvict?.(key, entry.value, reason)
  }

  /**
   * Internal: Evict items until we have space for a new item
   */
  private evictToFit(newItemSize: number): void {
    const now = Date.now()

    // First, try to evict expired items
    if (this.defaultTTL !== undefined || this.hasItemsWithTTL()) {
      for (const [key, entry] of this.cache) {
        if (entry.expiresAt !== undefined && entry.expiresAt <= now) {
          this.deleteInternal(key, entry, 'expired')
        }
      }
    }

    // Check if we need to evict for count
    while (this._maxCount !== undefined && this.cache.size >= this._maxCount) {
      const lruKey = this.getLRUKey()
      if (lruKey === undefined) break

      const entry = this.cache.get(lruKey)
      if (entry) {
        this.deleteInternal(lruKey, entry, 'count')
      }
    }

    // Check if we need to evict for size
    while (this._maxSize !== undefined && this._totalSize + newItemSize > this._maxSize && this.cache.size > 0) {
      const lruKey = this.getLRUKey()
      if (lruKey === undefined) break

      const entry = this.cache.get(lruKey)
      if (entry) {
        this.deleteInternal(lruKey, entry, 'size')
      }
    }
  }

  /**
   * Internal: Get the least recently used key (first in Map iteration order)
   */
  private getLRUKey(): string | undefined {
    // Map iterates in insertion order, first is LRU
    const first = this.cache.keys().next()
    return first.done ? undefined : first.value
  }

  /**
   * Internal: Check if any items have TTL set
   */
  private hasItemsWithTTL(): boolean {
    for (const entry of this.cache.values()) {
      if (entry.expiresAt !== undefined) {
        return true
      }
    }
    return false
  }
}
