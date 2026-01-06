/**
 * WAL (Write-Ahead Log) Types
 *
 * Types for WAL entries and configuration.
 * These are used by WALManager for durability and recovery.
 */

/**
 * WAL entry types
 */
export type WALEntryType = 'write' | 'delete' | 'checkpoint' | 'commit' | 'rollback' | 'begin' | 'savepoint' | 'rollback_to_savepoint'

/**
 * WAL entry structure
 */
export interface WALEntry {
  /** Unique log sequence number (LSN) */
  id: string
  /** Type of operation */
  type: WALEntryType
  /** Collection/table name */
  collection: string
  /** Document ID being modified */
  documentId: string
  /** Timestamp of the entry */
  timestamp: Date
  /** Serialized data (for write operations) */
  data?: string
  /** Transaction ID (for grouping operations) */
  transactionId?: string
  /** Savepoint name (for savepoint operations) */
  savepointName?: string
}

/**
 * Options for WAL recovery
 */
export interface WALRecoverOptions {
  /** Recover entries after this LSN */
  afterLSN?: string
  /** Recover entries for specific transaction */
  transactionId?: string
  /** Only recover uncommitted entries */
  uncommittedOnly?: boolean
  /** Include commit marker entries in recovery */
  includeCommitMarkers?: boolean
  /** Include rollback marker entries in recovery */
  includeRollbackMarkers?: boolean
}

/**
 * Options for WALManager initialization
 */
export interface WALManagerOptions {
  /** Automatically rollback uncommitted transactions on recovery */
  autoRollbackOnRecovery?: boolean
}
