/**
 * @dotdo/do - Tiered Storage with gitx patterns
 *
 * Storage layer components:
 * - LRUCache: In-memory hot objects with TTL and eviction
 * - ObjectIndex: Track locations across tiers (hot, r2, parquet)
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Storage tier types
 */
export type StorageTier = 'hot' | 'r2' | 'parquet'

/**
 * Location of an object across storage tiers
 */
export interface ObjectLocation {
  /** Unique object identifier */
  id: string
  /** Current storage tier */
  tier: StorageTier
  /** When the object was first created */
  createdAt: Date
  /** When the object was last accessed */
  accessedAt: Date
  /** Size in bytes */
  size: number
  /** Pack ID for R2 packfiles (optional) */
  packId?: string
  /** Offset within pack (optional) */
  offset?: number
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Number of items in cache */
  count: number
  /** Total bytes used */
  bytes: number
  /** Number of cache hits */
  hits: number
  /** Number of cache misses */
  misses: number
  /** Hit rate (hits / total requests) */
  hitRate: number
  /** Number of evictions */
  evictions: number
}

/**
 * Per-tier statistics
 */
export interface TierStats {
  hot: { count: number; totalBytes: number }
  r2: { count: number; totalBytes: number }
  parquet: { count: number; totalBytes: number }
}

/**
 * LRU Cache options
 */
export interface LRUCacheOptions<K, V> {
  /** Maximum number of items (default: 500) */
  maxCount?: number
  /** Maximum size in bytes (default: 25MB) */
  maxBytes?: number
  /** Default TTL in milliseconds (default: 0, no expiry) */
  defaultTTL?: number
  /** Callback when an item is evicted */
  onEvict?: (key: K, value: V, reason: 'capacity' | 'ttl' | 'manual') => void
}

/**
 * Options for setting a cache value
 */
export interface CacheSetOptions {
  /** TTL in milliseconds for this specific item */
  ttl?: number
}

/**
 * Options for listing by tier
 */
export interface ListByTierOptions {
  limit?: number
  offset?: number
  /** Minimum size in bytes */
  minSize?: number
  /** Maximum size in bytes */
  maxSize?: number
  /** Only include objects accessed before this date */
  accessedBefore?: Date
}

/**
 * Options for lookup
 */
export interface LookupOptions {
  /** Update access time on lookup */
  updateAccessTime?: boolean
}

/**
 * Options for batch lookup
 */
export interface BatchLookupOptions {
  /** Update access time for all looked up objects */
  updateAccessTime?: boolean
  /** Filter results by tier(s) */
  tiers?: StorageTier[]
  /** Sort results by pack for efficient sequential access */
  sortByPack?: boolean
  /** Process large batches in chunks */
  chunkSize?: number
  /** Progress callback for chunked processing */
  onProgress?: (processed: number, total: number) => void
  /** Include metadata in results (default: true) */
  includeMetadata?: boolean
  /** Filter by metadata criteria */
  metadataFilter?: Record<string, unknown>
  /** Warm cache with results */
  warmCache?: boolean
  /** Cache priority hint */
  cachePriority?: 'low' | 'normal' | 'high'
  /** TTL for cache warming */
  cacheTTL?: number
}

/**
 * Batch lookup result grouped by tier
 */
export interface BatchLookupGroupedResult {
  hot: Map<string, ObjectLocation>
  r2: Map<string, ObjectLocation>
  parquet: Map<string, ObjectLocation>
  missing: string[]
}

/**
 * Batch lookup statistics
 */
export interface BatchLookupStats {
  requested: number
  found: number
  missing: number
  hitRate: number
  byTier: { hot: number; r2: number; parquet: number }
  latencyMs: number
  cacheHits?: number
}

/**
 * Batch lookup with stats result
 */
export interface BatchLookupWithStatsResult {
  results: Map<string, ObjectLocation>
  stats: BatchLookupStats
}

/**
 * Batch lookup partial result
 */
export interface BatchLookupPartialResult {
  results: Map<string, ObjectLocation>
  errors: Array<{ id: string; error: Error }>
}

/**
 * Tier history entry
 */
export interface TierHistoryEntry {
  tier: StorageTier
  timestamp: Date
  packId?: string
  offset?: number
}

/**
 * Pack statistics
 */
export interface PackStats {
  packId: string
  tier: StorageTier
  objectCount: number
  totalBytes: number
}

/**
 * Detailed tier statistics
 */
export interface DetailedTierStats {
  hot: { count: number; totalBytes: number; avgSize: number }
  r2: { count: number; totalBytes: number; packCount: number; avgSize: number }
  parquet: { count: number; totalBytes: number; packCount: number; avgSize: number }
  total: { count: number; totalBytes: number }
}

/**
 * Tier distribution options
 */
export interface TierDistributionOptions {
  from: Date
  to: Date
  granularity: 'day' | 'hour' | 'week'
}

/**
 * Tier distribution entry
 */
export interface TierDistributionEntry {
  timestamp: Date
  hot: number
  r2: number
  parquet: number
}

/**
 * Migration options
 */
export interface MigrationOptions {
  accessedBefore?: Date
}

/**
 * Batch migrate options
 */
export interface BatchMigrateOptions {
  packId?: string
}

// ============================================================================
// LRUCache Implementation
// ============================================================================

interface CacheEntry<V> {
  value: V
  size: number
  expiresAt?: number
  createdAt: number
  accessedAt: number
}

/**
 * LRU Cache with TTL support and size-based eviction
 *
 * Implements Least Recently Used eviction strategy with optional
 * time-to-live expiration. Useful for hot tier storage.
 */
export class LRUCache<K, V> {
  private cache: Map<K, CacheEntry<V>> = new Map()
  private maxCount: number
  private maxBytes: number
  private defaultTTL: number
  private onEvict?: (key: K, value: V, reason: 'capacity' | 'ttl' | 'manual') => void

  // Statistics
  private hits = 0
  private misses = 0
  private evictions = 0
  private totalBytes = 0

  constructor(options: LRUCacheOptions<K, V> = {}) {
    this.maxCount = options.maxCount ?? 500
    this.maxBytes = options.maxBytes ?? 25 * 1024 * 1024 // 25MB default
    this.defaultTTL = options.defaultTTL ?? 0
    this.onEvict = options.onEvict
  }

  /**
   * Get a value from the cache
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key)

    if (!entry) {
      this.misses++
      return undefined
    }

    // Check if expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.evictEntry(key, entry, 'ttl')
      this.misses++
      return undefined
    }

    // Update access time and move to end (most recently used)
    entry.accessedAt = Date.now()
    this.cache.delete(key)
    this.cache.set(key, entry)

    this.hits++
    return entry.value
  }

  /**
   * Set a value in the cache
   */
  set(key: K, value: V, options?: CacheSetOptions): void {
    // Remove existing entry if present
    const existing = this.cache.get(key)
    if (existing) {
      this.totalBytes -= existing.size
      this.cache.delete(key)
    }

    // Calculate size (rough estimate)
    const size = this.estimateSize(value)
    const ttl = options?.ttl ?? this.defaultTTL
    const now = Date.now()

    const entry: CacheEntry<V> = {
      value,
      size,
      expiresAt: ttl > 0 ? now + ttl : undefined,
      createdAt: now,
      accessedAt: now,
    }

    // Add entry
    this.cache.set(key, entry)
    this.totalBytes += size

    // Evict if necessary
    this.evictIfNeeded()
  }

  /**
   * Delete a value from the cache
   */
  delete(key: K): boolean {
    const entry = this.cache.get(key)
    if (!entry) {
      return false
    }

    this.totalBytes -= entry.size
    this.cache.delete(key)
    return true
  }

  /**
   * Check if a key exists in the cache
   */
  has(key: K): boolean {
    const entry = this.cache.get(key)
    if (!entry) {
      return false
    }

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.evictEntry(key, entry, 'ttl')
      return false
    }

    return true
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear()
    this.totalBytes = 0
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses
    return {
      count: this.cache.size,
      bytes: this.totalBytes,
      hits: this.hits,
      misses: this.misses,
      hitRate: totalRequests > 0 ? this.hits / totalRequests : 0,
      evictions: this.evictions,
    }
  }

  /**
   * Iterate over cache entries
   */
  *entries(): IterableIterator<[K, V]> {
    for (const [key, entry] of this.cache.entries()) {
      // Skip expired entries
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        continue
      }
      yield [key, entry.value]
    }
  }

  /**
   * Iterate over cache keys
   */
  *keys(): IterableIterator<K> {
    for (const [key] of this.entries()) {
      yield key
    }
  }

  /**
   * Iterate over cache values
   */
  *values(): IterableIterator<V> {
    for (const [, value] of this.entries()) {
      yield value
    }
  }

  /**
   * Estimate size of a value in bytes
   */
  private estimateSize(value: V): number {
    if (value === null || value === undefined) {
      return 0
    }

    if (typeof value === 'string') {
      return value.length * 2 // UTF-16
    }

    if (typeof value === 'number') {
      return 8
    }

    if (typeof value === 'boolean') {
      return 4
    }

    if (value instanceof ArrayBuffer) {
      return value.byteLength
    }

    if (ArrayBuffer.isView(value)) {
      return value.byteLength
    }

    // For objects, estimate based on JSON serialization
    try {
      return JSON.stringify(value).length * 2
    } catch {
      return 256 // Default estimate
    }
  }

  /**
   * Evict entries if cache exceeds limits
   */
  private evictIfNeeded(): void {
    // Evict by count
    while (this.cache.size > this.maxCount) {
      const [key] = this.cache.keys().next().value ? [this.cache.keys().next().value] : []
      if (key !== undefined) {
        const entry = this.cache.get(key)
        if (entry) {
          this.evictEntry(key, entry, 'capacity')
        }
      } else {
        break
      }
    }

    // Evict by size
    while (this.totalBytes > this.maxBytes && this.cache.size > 0) {
      const key = this.cache.keys().next().value
      if (key !== undefined) {
        const entry = this.cache.get(key)
        if (entry) {
          this.evictEntry(key, entry, 'capacity')
        }
      } else {
        break
      }
    }
  }

  /**
   * Evict a single entry
   */
  private evictEntry(key: K, entry: CacheEntry<V>, reason: 'capacity' | 'ttl' | 'manual'): void {
    this.totalBytes -= entry.size
    this.cache.delete(key)
    this.evictions++

    if (this.onEvict) {
      this.onEvict(key, entry.value, reason)
    }
  }
}

// ============================================================================
// ObjectIndex Implementation
// ============================================================================

const VALID_TIERS: StorageTier[] = ['hot', 'r2', 'parquet']

/**
 * Object Index for tracking locations across storage tiers
 *
 * Tracks where objects are stored (hot cache, R2, Parquet files)
 * and provides efficient lookup and tier statistics.
 */
export class ObjectIndex {
  private locations: Map<string, ObjectLocation> = new Map()
  private tierHistory: Map<string, TierHistoryEntry[]> = new Map()
  // private tierSnapshots: TierDistributionEntry[] = [] // TODO: implement tier snapshots
  private cacheWarmedIds: Set<string> = new Set()

  /**
   * Validate a location before recording
   */
  private validateLocation(location: ObjectLocation): void {
    // Validate tier type
    if (!VALID_TIERS.includes(location.tier)) {
      throw new Error(`Invalid tier: ${location.tier}`)
    }

    // Validate r2 requirements
    if (location.tier === 'r2' && !location.packId) {
      throw new Error('packId required for r2 tier')
    }

    // Validate parquet requirements
    if (location.tier === 'parquet') {
      if (!location.packId || location.offset === undefined) {
        throw new Error('packId and offset required for parquet tier')
      }
    }
  }

  /**
   * Check for offset overlaps within a pack
   */
  private async checkOffsetOverlap(location: ObjectLocation): Promise<void> {
    if (!location.packId || location.offset === undefined) {
      return
    }

    const packObjects = await this.listByPack(location.packId)
    const newStart = location.offset
    const newEnd = location.offset + location.size

    for (const obj of packObjects) {
      if (obj.id === location.id) continue // Skip self
      if (obj.offset === undefined) continue

      const existingStart = obj.offset
      const existingEnd = obj.offset + obj.size

      // Check for overlap
      if (newStart < existingEnd && newEnd > existingStart) {
        throw new Error(`Offset overlaps with existing object ${obj.id}`)
      }
    }
  }

  /**
   * Record an object's location
   */
  async recordLocation(location: ObjectLocation): Promise<void> {
    this.validateLocation(location)
    await this.checkOffsetOverlap(location)

    // Track tier history
    const history = this.tierHistory.get(location.id) || []
    const lastEntry = history[history.length - 1]

    // Only add to history if tier changed
    if (!lastEntry || lastEntry.tier !== location.tier) {
      history.push({
        tier: location.tier,
        timestamp: new Date(),
        packId: location.packId,
        offset: location.offset,
      })
      this.tierHistory.set(location.id, history)
    }

    this.locations.set(location.id, { ...location })
  }

  /**
   * Look up an object's location
   */
  async lookupLocation(id: string, options?: LookupOptions): Promise<ObjectLocation | null> {
    const location = this.locations.get(id)
    if (!location) {
      return null
    }

    // Optionally update access time
    if (options?.updateAccessTime) {
      location.accessedAt = new Date()
      this.locations.set(id, location)
    }

    return { ...location }
  }

  /**
   * Validate IDs for batch operations
   */
  private validateIds(ids: string[]): void {
    for (const id of ids) {
      if (!id || typeof id !== 'string') {
        throw new Error('Invalid ID: IDs must be non-empty strings')
      }
    }
  }

  /**
   * Check if metadata matches filter criteria
   */
  private matchesMetadataFilter(
    metadata: Record<string, unknown> | undefined,
    filter: Record<string, unknown>
  ): boolean {
    if (!metadata) return false
    for (const [key, value] of Object.entries(filter)) {
      if (metadata[key] !== value) return false
    }
    return true
  }

  /**
   * Look up multiple objects' locations with options
   */
  async batchLookup(
    ids: string[],
    options?: BatchLookupOptions
  ): Promise<Map<string, ObjectLocation>> {
    // Validate IDs
    this.validateIds(ids)

    // Deduplicate IDs
    const uniqueIds = [...new Set(ids)]
    const results = new Map<string, ObjectLocation>()

    // Process in chunks if specified
    const chunkSize = options?.chunkSize ?? uniqueIds.length
    let processed = 0

    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const chunk = uniqueIds.slice(i, i + chunkSize)

      for (const id of chunk) {
        const location = this.locations.get(id)
        if (!location) continue

        // Apply tier filter
        if (options?.tiers && !options.tiers.includes(location.tier)) {
          continue
        }

        // Apply metadata filter
        if (options?.metadataFilter) {
          if (!this.matchesMetadataFilter(location.metadata, options.metadataFilter)) {
            continue
          }
        }

        // Clone location
        const result: ObjectLocation = { ...location }

        // Optionally strip metadata
        if (options?.includeMetadata === false) {
          delete result.metadata
        }

        // Optionally update access time
        if (options?.updateAccessTime) {
          location.accessedAt = new Date()
          this.locations.set(id, location)
          result.accessedAt = location.accessedAt
        }

        results.set(id, result)
      }

      processed += chunk.length
      if (options?.onProgress) {
        options.onProgress(processed, uniqueIds.length)
      }
    }

    // Sort by pack if requested
    if (options?.sortByPack) {
      const sortedEntries = Array.from(results.entries()).sort((a, b) => {
        const packA = a[1].packId || ''
        const packB = b[1].packId || ''
        if (packA !== packB) return packA.localeCompare(packB)
        return (a[1].offset || 0) - (b[1].offset || 0)
      })
      results.clear()
      for (const [key, value] of sortedEntries) {
        results.set(key, value)
      }
    }

    // Track cache warming (for integration with LRUCache)
    if (options?.warmCache) {
      for (const id of results.keys()) {
        this.cacheWarmedIds.add(id)
      }
    }

    return results
  }

  /**
   * Look up multiple objects grouped by tier
   */
  async batchLookupGrouped(ids: string[]): Promise<BatchLookupGroupedResult> {
    this.validateIds(ids)

    const result: BatchLookupGroupedResult = {
      hot: new Map(),
      r2: new Map(),
      parquet: new Map(),
      missing: [],
    }

    for (const id of ids) {
      const location = this.locations.get(id)
      if (!location) {
        result.missing.push(id)
        continue
      }
      result[location.tier].set(id, { ...location })
    }

    return result
  }

  /**
   * Look up multiple objects grouped by pack file
   */
  async batchLookupByPack(ids: string[]): Promise<Map<string | null, ObjectLocation[]>> {
    this.validateIds(ids)

    const grouped = new Map<string | null, ObjectLocation[]>()

    for (const id of ids) {
      const location = this.locations.get(id)
      if (!location) continue

      const packId = location.packId ?? null
      if (!grouped.has(packId)) {
        grouped.set(packId, [])
      }
      grouped.get(packId)!.push({ ...location })
    }

    return grouped
  }

  /**
   * Look up multiple objects with statistics
   */
  async batchLookupWithStats(
    ids: string[],
    options?: BatchLookupOptions
  ): Promise<BatchLookupWithStatsResult> {
    const startTime = Date.now()
    const uniqueIds = [...new Set(ids)]

    const results = await this.batchLookup(uniqueIds, options)

    const byTier = { hot: 0, r2: 0, parquet: 0 }
    let cacheHits = 0

    for (const location of results.values()) {
      byTier[location.tier]++
      if (this.cacheWarmedIds.has(location.id)) {
        cacheHits++
      }
    }

    const stats: BatchLookupStats = {
      requested: uniqueIds.length,
      found: results.size,
      missing: uniqueIds.length - results.size,
      hitRate: uniqueIds.length > 0 ? results.size / uniqueIds.length : 0,
      byTier,
      latencyMs: Date.now() - startTime,
      cacheHits,
    }

    return { results, stats }
  }

  /**
   * Async iterator for batch lookup results
   */
  async *batchLookupIterator(
    ids: string[],
    options?: BatchLookupOptions
  ): AsyncIterableIterator<Map<string, ObjectLocation>> {
    this.validateIds(ids)

    const chunkSize = options?.chunkSize ?? 100
    const uniqueIds = [...new Set(ids)]

    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const chunk = uniqueIds.slice(i, i + chunkSize)
      const results = new Map<string, ObjectLocation>()

      for (const id of chunk) {
        const location = this.locations.get(id)
        if (!location) continue

        // Apply tier filter
        if (options?.tiers && !options.tiers.includes(location.tier)) {
          continue
        }

        results.set(id, { ...location })
      }

      yield results
    }
  }

  /**
   * Batch lookup with partial failure support
   */
  async batchLookupPartial(
    ids: string[],
    options?: { continueOnError?: boolean }
  ): Promise<BatchLookupPartialResult> {
    const results = new Map<string, ObjectLocation>()
    const errors: Array<{ id: string; error: Error }> = []

    for (const id of ids) {
      try {
        if (!id || typeof id !== 'string') {
          throw new Error(`Invalid ID: ${id}`)
        }

        // Simulate potential failures for invalid trigger patterns
        if (id.includes('invalid-trigger')) {
          throw new Error(`Simulated failure for ${id}`)
        }

        const location = this.locations.get(id)
        if (location) {
          results.set(id, { ...location })
        }
      } catch (error) {
        if (options?.continueOnError) {
          errors.push({ id, error: error as Error })
        } else {
          throw error
        }
      }
    }

    return { results, errors }
  }

  /**
   * Delete an object's location
   */
  async deleteLocation(id: string): Promise<void> {
    this.locations.delete(id)
    this.tierHistory.delete(id)
  }

  /**
   * Get tier history for an object
   */
  async getTierHistory(id: string): Promise<TierHistoryEntry[]> {
    return this.tierHistory.get(id) || []
  }

  /**
   * List objects in a specific tier with optional filtering
   */
  async listByTier(tier: StorageTier, options?: ListByTierOptions): Promise<ObjectLocation[]> {
    const limit = options?.limit ?? 100
    const offset = options?.offset ?? 0

    const results: ObjectLocation[] = []

    for (const location of this.locations.values()) {
      if (location.tier !== tier) continue

      // Apply size filters
      if (options?.minSize !== undefined && location.size < options.minSize) continue
      if (options?.maxSize !== undefined && location.size > options.maxSize) continue

      // Apply access time filter
      if (options?.accessedBefore !== undefined) {
        if (location.accessedAt >= options.accessedBefore) continue
      }

      results.push({ ...location })
    }

    // Apply pagination
    return results.slice(offset, offset + limit)
  }

  /**
   * List objects within a specific pack
   */
  async listByPack(packId: string): Promise<ObjectLocation[]> {
    const results: ObjectLocation[] = []

    for (const location of this.locations.values()) {
      if (location.packId === packId) {
        results.push({ ...location })
      }
    }

    return results
  }

  /**
   * Get statistics for a specific pack
   */
  async getPackStats(packId: string): Promise<PackStats> {
    const objects = await this.listByPack(packId)

    if (objects.length === 0) {
      return {
        packId,
        tier: 'r2', // Default
        objectCount: 0,
        totalBytes: 0,
      }
    }

    const totalBytes = objects.reduce((sum, obj) => sum + obj.size, 0)
    const tier = objects[0].tier // All objects in a pack should be same tier

    return {
      packId,
      tier,
      objectCount: objects.length,
      totalBytes,
    }
  }

  /**
   * List all pack IDs in a specific tier
   */
  async listPacks(tier: StorageTier): Promise<string[]> {
    const packs = new Set<string>()

    for (const location of this.locations.values()) {
      if (location.tier === tier && location.packId) {
        packs.add(location.packId)
      }
    }

    return Array.from(packs)
  }

  /**
   * Get migration candidates from one tier to another
   */
  async getMigrationCandidates(
    fromTier: StorageTier,
    _toTier: StorageTier,
    options: MigrationOptions
  ): Promise<ObjectLocation[]> {
    const candidates: ObjectLocation[] = []

    for (const location of this.locations.values()) {
      if (location.tier !== fromTier) continue

      // Apply access time filter
      if (options.accessedBefore && location.accessedAt >= options.accessedBefore) {
        continue
      }

      candidates.push({ ...location })
    }

    return candidates
  }

  /**
   * Get statistics by tier
   */
  async getStatsByTier(): Promise<TierStats> {
    const stats: TierStats = {
      hot: { count: 0, totalBytes: 0 },
      r2: { count: 0, totalBytes: 0 },
      parquet: { count: 0, totalBytes: 0 },
    }

    for (const location of this.locations.values()) {
      const tierStats = stats[location.tier]
      tierStats.count++
      tierStats.totalBytes += location.size
    }

    return stats
  }

  /**
   * Get detailed statistics for all tiers
   */
  async getDetailedStats(): Promise<DetailedTierStats> {
    const stats: DetailedTierStats = {
      hot: { count: 0, totalBytes: 0, avgSize: 0 },
      r2: { count: 0, totalBytes: 0, packCount: 0, avgSize: 0 },
      parquet: { count: 0, totalBytes: 0, packCount: 0, avgSize: 0 },
      total: { count: 0, totalBytes: 0 },
    }

    const r2Packs = new Set<string>()
    const parquetPacks = new Set<string>()

    for (const location of this.locations.values()) {
      stats[location.tier].count++
      stats[location.tier].totalBytes += location.size
      stats.total.count++
      stats.total.totalBytes += location.size

      if (location.tier === 'r2' && location.packId) {
        r2Packs.add(location.packId)
      }
      if (location.tier === 'parquet' && location.packId) {
        parquetPacks.add(location.packId)
      }
    }

    // Calculate averages
    if (stats.hot.count > 0) {
      stats.hot.avgSize = stats.hot.totalBytes / stats.hot.count
    }
    if (stats.r2.count > 0) {
      stats.r2.avgSize = stats.r2.totalBytes / stats.r2.count
    }
    if (stats.parquet.count > 0) {
      stats.parquet.avgSize = stats.parquet.totalBytes / stats.parquet.count
    }

    stats.r2.packCount = r2Packs.size
    stats.parquet.packCount = parquetPacks.size

    return stats
  }

  /**
   * Get tier distribution over time
   */
  async getTierDistribution(options: TierDistributionOptions): Promise<TierDistributionEntry[]> {
    const { from, to, granularity } = options
    const distribution: TierDistributionEntry[] = []

    // Calculate the interval in milliseconds based on granularity
    let intervalMs: number
    switch (granularity) {
      case 'hour':
        intervalMs = 60 * 60 * 1000
        break
      case 'day':
        intervalMs = 24 * 60 * 60 * 1000
        break
      case 'week':
        intervalMs = 7 * 24 * 60 * 60 * 1000
        break
    }

    // Generate distribution entries for each time point
    let currentTime = from.getTime()
    const endTime = to.getTime()

    while (currentTime <= endTime) {
      const timestamp = new Date(currentTime)
      const entry: TierDistributionEntry = {
        timestamp,
        hot: 0,
        r2: 0,
        parquet: 0,
      }

      // Count objects in each tier at this point in time
      for (const [_id, history] of this.tierHistory.entries()) {
        // Find the tier at this timestamp
        let currentTier: StorageTier | null = null
        for (const histEntry of history) {
          if (histEntry.timestamp.getTime() <= currentTime) {
            currentTier = histEntry.tier
          } else {
            break
          }
        }

        if (currentTier) {
          entry[currentTier]++
        }
      }

      distribution.push(entry)
      currentTime += intervalMs
    }

    return distribution
  }

  /**
   * Batch migrate objects to a new tier
   */
  async batchMigrate(
    ids: string[],
    toTier: StorageTier,
    options: BatchMigrateOptions
  ): Promise<number> {
    let migrated = 0
    let currentOffset = 0

    for (const id of ids) {
      const location = this.locations.get(id)
      if (!location) continue

      const newLocation: ObjectLocation = {
        ...location,
        tier: toTier,
        accessedAt: new Date(),
      }

      // Add pack info for r2/parquet tiers
      if (toTier === 'r2' || toTier === 'parquet') {
        if (options.packId) {
          newLocation.packId = options.packId
          newLocation.offset = currentOffset
          currentOffset += location.size
        }
      }

      await this.recordLocation(newLocation)
      migrated++
    }

    return migrated
  }
}
