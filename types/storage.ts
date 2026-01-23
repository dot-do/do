/**
 * Storage & CDC Types
 *
 * Three-tier storage architecture:
 * - Hot: DO SQLite + Vortex (4ms)
 * - Warm: Edge Cache API (10ms, free)
 * - Cold: R2 + Iceberg (69ms, $0.015/GB/mo)
 */

// =============================================================================
// CDC (Change Data Capture)
// =============================================================================

/**
 * CDC operation type
 */
export type CDCOperation = 'INSERT' | 'UPDATE' | 'DELETE'

/**
 * CDC event - emitted on every data change
 */
export interface CDCEvent<T = unknown> {
  /** Unique event ID */
  id: string
  /** Type of change */
  operation: CDCOperation
  /** Collection/table name */
  collection: string
  /** Document/row ID */
  documentId: string
  /** When the change occurred */
  timestamp: number
  /** Sequence number for ordering */
  sequence: number
  /** Document state before change (for UPDATE/DELETE) */
  before?: T
  /** Document state after change (for INSERT/UPDATE) */
  after?: T
  /** List of fields that changed (for UPDATE) */
  changedFields?: string[]
  /** Source DO that emitted this event */
  source?: string
  /** Correlation ID for tracing */
  correlationId?: string
}

/**
 * CDC cursor for pagination
 */
export interface CDCCursor {
  sequence: number
  timestamp: number
}

/**
 * CDC subscription options
 */
export interface CDCOptions {
  /** Collections to subscribe to (empty = all) */
  collections?: string[]
  /** Operations to subscribe to (empty = all) */
  operations?: CDCOperation[]
  /** Start from this cursor */
  fromCursor?: CDCCursor
  /** Include full document in before/after */
  includeDocuments?: boolean
  /** Maximum batch size */
  batchSize?: number
  /** Batch timeout in ms */
  batchTimeout?: number
}

/**
 * CDC batch result
 */
export interface CDCBatch {
  events: CDCEvent[]
  cursor: CDCCursor
  hasMore: boolean
}

/**
 * CDC subscription handle
 */
export interface CDCSubscription {
  id: string
  options: CDCOptions
  cursor: CDCCursor
  status: 'Active' | 'Paused' | 'Closed'
  createdAt: number
}

// =============================================================================
// Storage Tiers
// =============================================================================

/**
 * Storage tier levels
 */
export type StorageTier = 'Hot' | 'Warm' | 'Cold'

/**
 * Storage tier metadata
 */
export interface StorageTierInfo {
  tier: StorageTier
  name: string
  description: string
  latency: string
  cost: string
  technology: string
}

export const StorageTiers: Record<StorageTier, StorageTierInfo> = {
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

// =============================================================================
// Snapshots
// =============================================================================

/**
 * Snapshot of a DO's state for persistence
 */
export interface Snapshot {
  /** Unique snapshot ID */
  id: string
  /** DO ID this snapshot belongs to */
  doId: string
  /** DO type */
  doType: string
  /** When the snapshot was taken */
  timestamp: number
  /** Version number */
  version: number
  /** All tables/collections data */
  tables: Record<string, unknown[]>
  /** Metadata */
  metadata?: SnapshotMetadata
}

export interface SnapshotMetadata {
  /** Size in bytes */
  sizeBytes: number
  /** Number of rows across all tables */
  rowCount: number
  /** Compression used */
  compression?: string
  /** Checksum for integrity */
  checksum?: string
  /** Parent snapshot ID (for incremental) */
  parentId?: string
  /** Whether this is a full or incremental snapshot */
  type: 'Full' | 'Incremental'
}

// =============================================================================
// R2 Storage
// =============================================================================

/**
 * R2 object reference
 */
export interface R2ObjectRef {
  key: string
  bucket: string
  size: number
  etag: string
  uploaded: number
  httpMetadata?: R2HttpMetadata
  customMetadata?: Record<string, string>
}

export interface R2HttpMetadata {
  contentType?: string
  contentLanguage?: string
  contentDisposition?: string
  contentEncoding?: string
  cacheControl?: string
  cacheExpiry?: Date
}

/**
 * R2 storage operations
 */
export interface R2Storage {
  /** Put an object */
  put(key: string, value: ReadableStream | ArrayBuffer | string, options?: R2PutOptions): Promise<R2ObjectRef>
  /** Get an object */
  get(key: string): Promise<R2Object | null>
  /** Delete an object */
  delete(key: string | string[]): Promise<void>
  /** List objects */
  list(options?: R2ListOptions): Promise<R2ListResult>
  /** Head (get metadata only) */
  head(key: string): Promise<R2ObjectRef | null>
}

export interface R2PutOptions {
  httpMetadata?: R2HttpMetadata
  customMetadata?: Record<string, string>
  md5?: string
}

export interface R2Object extends R2ObjectRef {
  body: ReadableStream
  bodyUsed: boolean
  arrayBuffer(): Promise<ArrayBuffer>
  text(): Promise<string>
  json<T = unknown>(): Promise<T>
}

export interface R2ListOptions {
  prefix?: string
  delimiter?: string
  cursor?: string
  limit?: number
  include?: ('httpMetadata' | 'customMetadata')[]
}

export interface R2ListResult {
  objects: R2ObjectRef[]
  truncated: boolean
  cursor?: string
  delimitedPrefixes: string[]
}

// =============================================================================
// Iceberg Table Format
// =============================================================================

/**
 * Iceberg table metadata
 */
export interface IcebergTable {
  name: string
  location: string
  schema: IcebergSchema
  partitionSpec: IcebergPartitionSpec
  sortOrder?: IcebergSortOrder
  properties: Record<string, string>
  currentSnapshotId?: string
  snapshots: IcebergSnapshot[]
}

export interface IcebergSchema {
  schemaId: number
  fields: IcebergField[]
}

export interface IcebergField {
  id: number
  name: string
  type: string
  required: boolean
  doc?: string
}

export interface IcebergPartitionSpec {
  specId: number
  fields: IcebergPartitionField[]
}

export interface IcebergPartitionField {
  sourceId: number
  fieldId: number
  name: string
  transform: string
}

export interface IcebergSortOrder {
  orderId: number
  fields: IcebergSortField[]
}

export interface IcebergSortField {
  sourceId: number
  direction: 'Asc' | 'Desc'
  nullOrder: 'NullsFirst' | 'NullsLast'
  transform: string
}

export interface IcebergSnapshot {
  snapshotId: string
  parentSnapshotId?: string
  sequenceNumber: number
  timestampMs: number
  manifestList: string
  summary: Record<string, string>
}

// =============================================================================
// Storage Sync
// =============================================================================

/**
 * Sync state between storage tiers
 */
export interface SyncState {
  doId: string
  lastHotSequence: number
  lastWarmSequence: number
  lastColdSequence: number
  lastSyncTimestamp: number
  pendingChanges: number
}

/**
 * Sync options
 */
export interface SyncOptions {
  /** Force sync even if not needed */
  force?: boolean
  /** Target tier to sync to */
  targetTier?: StorageTier
  /** Maximum changes to sync in one batch */
  batchSize?: number
}

/**
 * Sync result
 */
export interface SyncResult {
  success: boolean
  changesSynced: number
  bytesWritten: number
  duration: number
  newCursor: CDCCursor
  error?: string
}
