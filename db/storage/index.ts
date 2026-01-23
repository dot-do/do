/**
 * Storage Layer
 *
 * Three-tier storage architecture for Digital Objects:
 * - Hot: DO SQLite + Vortex columnar (~4ms)
 * - Warm: Edge Cache API (~10ms, free)
 * - Cold: R2 + Iceberg (~69ms, $0.015/GB/mo)
 *
 * @module @do/core/storage
 */

import type {
  StorageTier,
  StorageTierInfo,
  StorageTiers,
  CDCEvent,
  CDCCursor,
  SyncState,
  SyncOptions,
  SyncResult,
} from '../../types/storage'

import { HotStorage } from './hot'
import { WarmStorage } from './warm'
import { ColdStorage } from './cold'
import { VortexEncoder, VortexDecoder } from './vortex'
import { SnapshotManager } from './snapshots'

// Re-export tier implementations
export { HotStorage } from './hot'
export { WarmStorage } from './warm'
export { ColdStorage } from './cold'
export { VortexEncoder, VortexDecoder } from './vortex'
export { SnapshotManager } from './snapshots'

/**
 * Storage configuration options
 */
export interface StorageConfig {
  /** DO SQLite storage binding */
  sqlite?: SqlStorage
  /** Cloudflare Cache API */
  cache?: CacheStorage
  /** R2 bucket binding */
  r2?: R2Bucket
  /** CDC event emitter */
  onCDC?: (event: CDCEvent) => void | Promise<void>
  /** Hot tier configuration */
  hot?: HotStorageConfig
  /** Warm tier configuration */
  warm?: WarmStorageConfig
  /** Cold tier configuration */
  cold?: ColdStorageConfig
  /** Sync configuration */
  sync?: SyncConfig
}

/**
 * Hot storage configuration
 */
export interface HotStorageConfig {
  /** Enable hot storage (default: true) */
  enabled?: boolean
  /** Maximum storage size in bytes */
  maxSize?: number
  /** Row count threshold for Vortex conversion */
  vortexThreshold?: number
}

/**
 * Warm storage configuration
 */
export interface WarmStorageConfig {
  /** Enable warm storage (default: true if cache available) */
  enabled?: boolean
  /** Default TTL in seconds */
  defaultTTL?: number
  /** Maximum cached entries */
  maxEntries?: number
}

/**
 * Cold storage configuration
 */
export interface ColdStorageConfig {
  /** Enable cold storage (default: true if R2 available) */
  enabled?: boolean
  /** R2 key prefix */
  prefix?: string
  /** Partition fields */
  partitionBy?: string[]
  /** Compression codec */
  compressionCodec?: 'none' | 'zstd' | 'snappy' | 'gzip'
}

/**
 * Sync configuration
 */
export interface SyncConfig {
  /** Batch size for sync operations */
  batchSize?: number
  /** Sync interval in milliseconds */
  interval?: number
  /** Auto-sync enabled */
  autoSync?: boolean
}

/**
 * Unified storage interface across all tiers
 */
export interface UnifiedStorage {
  /** Hot tier storage */
  readonly hot: HotStorage
  /** Warm tier storage (optional) */
  readonly warm?: WarmStorage
  /** Cold tier storage (optional) */
  readonly cold?: ColdStorage
  /** Snapshot manager */
  readonly snapshots: SnapshotManager

  /**
   * Insert a document (writes to hot, invalidates warm)
   * @param collection - Collection name
   * @param document - Document to insert
   */
  insert<T extends { id: string }>(collection: string, document: T): Promise<void>

  /**
   * Query documents (checks warm cache first, falls back to hot)
   * @param collection - Collection name
   * @param query - Query parameters
   */
  query<T>(collection: string, query?: QueryOptions): Promise<T[]>

  /**
   * Update a document
   * @param collection - Collection name
   * @param id - Document ID
   * @param updates - Partial document updates
   */
  update<T>(collection: string, id: string, updates: Partial<T>): Promise<void>

  /**
   * Delete a document
   * @param collection - Collection name
   * @param id - Document ID
   */
  delete(collection: string, id: string): Promise<void>

  /**
   * Archive data to cold storage
   * @param collection - Collection name
   * @param options - Archive options
   */
  archive(collection: string, options?: ArchiveOptions): Promise<SyncResult>

  /**
   * Get current sync state
   */
  getSyncState(): Promise<SyncState>

  /**
   * Sync data between tiers
   * @param options - Sync options
   */
  sync(options?: SyncOptions): Promise<SyncResult>

  /**
   * Subscribe to CDC events
   * @param callback - Event handler
   */
  onCDC(callback: (event: CDCEvent) => void | Promise<void>): () => void
}

/**
 * Query options for storage operations
 */
export interface QueryOptions {
  /** Filter conditions */
  where?: Record<string, unknown>
  /** Sort order */
  orderBy?: { field: string; direction: 'asc' | 'desc' }[]
  /** Maximum results */
  limit?: number
  /** Offset for pagination */
  offset?: number
  /** Cache TTL override (warm tier) */
  cacheTTL?: number
  /** Skip cache lookup */
  skipCache?: boolean
}

/**
 * Archive options for cold storage
 */
export interface ArchiveOptions {
  /** Archive records older than this timestamp */
  olderThan?: number
  /** Delete archived records from hot */
  deleteAfterArchive?: boolean
  /** Partition configuration */
  partition?: Record<string, string | number>
}

/**
 * Storage event types
 */
export type StorageEventType = 'insert' | 'update' | 'delete' | 'sync' | 'archive'

/**
 * Storage event
 */
export interface StorageEvent {
  type: StorageEventType
  tier: StorageTier
  collection: string
  documentId?: string
  timestamp: number
  metadata?: Record<string, unknown>
}

/**
 * Create a unified storage instance
 *
 * @param config - Storage configuration
 * @returns Unified storage interface
 *
 * @example
 * ```typescript
 * const storage = createStorage({
 *   sqlite: env.DO_STORAGE,
 *   cache: caches,
 *   r2: env.R2_BUCKET,
 * })
 *
 * await storage.insert('users', { id: '1', name: 'Alice' })
 * const users = await storage.query('users', { where: { name: 'Alice' } })
 * ```
 */
export function createStorage(config: StorageConfig): UnifiedStorage {
  // TODO: Implement unified storage factory
  throw new Error('Not implemented')
}

/**
 * Storage error class
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly tier: StorageTier,
    public readonly operation: string,
    public readonly cause?: Error,
  ) {
    super(message)
    this.name = 'StorageError'
  }
}

/**
 * Check if a tier is available
 *
 * @param tier - Storage tier to check
 * @param config - Storage configuration
 * @returns Whether the tier is available
 */
export function isTierAvailable(tier: StorageTier, config: StorageConfig): boolean {
  switch (tier) {
    case 'Hot':
      return config.sqlite !== undefined
    case 'Warm':
      return config.cache !== undefined
    case 'Cold':
      return config.r2 !== undefined
    default:
      return false
  }
}

/**
 * Get tier info
 *
 * @param tier - Storage tier
 * @returns Tier information
 */
export function getTierInfo(tier: StorageTier): StorageTierInfo {
  // Import from types to avoid duplication
  const tiers: Record<StorageTier, StorageTierInfo> = {
    Hot: {
      tier: 'Hot',
      name: 'Hot Storage',
      description: 'DO SQLite + Vortex columnar',
      latency: '~4ms',
      cost: 'Included in DO pricing',
      technology: 'SQLite + Vortex',
    },
    Warm: {
      tier: 'Warm',
      name: 'Warm Storage',
      description: 'Edge Cache API',
      latency: '~10ms',
      cost: 'Free',
      technology: 'Cloudflare Cache API',
    },
    Cold: {
      tier: 'Cold',
      name: 'Cold Storage',
      description: 'R2 + Iceberg/Parquet',
      latency: '~69ms',
      cost: '$0.015/GB/month',
      technology: 'R2 + Apache Iceberg',
    },
  }
  return tiers[tier]
}

// Type declarations for Cloudflare bindings (stub)
// Note: R2Bucket, KVNamespace, D1Database types come from @cloudflare/workers-types
declare global {
  interface SqlStorage {
    exec(query: string, params?: unknown[]): Promise<unknown>
  }
}
