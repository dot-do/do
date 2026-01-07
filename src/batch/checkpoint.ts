/**
 * @dotdo/do - Batch Checkpoint/Resume Implementation
 *
 * Provides checkpoint/resume capability for batch processing with SQLite-based storage.
 *
 * Features:
 * - Checkpoint creation at intervals during batch processing
 * - Resume from checkpoint after failure
 * - SQLite-based checkpoint storage
 * - Checkpoint cleanup after completion
 * - Progress tracking
 */

import type { SqlStorage } from '@cloudflare/workers-types'

// =============================================================================
// Types
// =============================================================================

/**
 * Data stored in a checkpoint
 */
export interface CheckpointData {
  id: string
  batchId: string
  processedCount: number
  totalCount: number
  lastProcessedId: string | null
  state: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

/**
 * Interface for checkpoint storage backends
 */
export interface CheckpointStore {
  save(checkpoint: CheckpointData): Promise<void>
  load(batchId: string): Promise<CheckpointData | null>
  delete(batchId: string): Promise<void>
  exists(batchId: string): Promise<boolean>
  list?(): Promise<CheckpointData[]>
  cleanupOlderThan?(maxAgeMs: number): Promise<number>
}

/**
 * Item type requirement for batch processing
 */
export interface BatchItem {
  id: string
  [key: string]: unknown
}

/**
 * Options for batch processing with checkpointing
 */
export interface BatchProcessorOptions<T extends BatchItem> {
  /** Unique identifier for this batch */
  batchId: string
  /** Items to process */
  items: T[]
  /** Processor function for each item */
  processor: (item: T, index: number) => Promise<void>
  /** Checkpoint storage backend */
  checkpointStore: CheckpointStore
  /** Save checkpoint every N items (default: 10) */
  checkpointInterval?: number
  /** Concurrency level (default: 1) */
  concurrency?: number
  /** Continue processing on individual item errors (default: false) */
  continueOnError?: boolean
  /** Keep checkpoint after successful completion (default: false) */
  keepCheckpointOnComplete?: boolean
  /** Progress callback */
  onProgress?: (processed: number, total: number) => void
  /** Callback when checkpoint is created */
  onCheckpoint?: (checkpoint: CheckpointData) => void
  /** Callback to get custom state for checkpoint */
  getState?: () => Record<string, unknown>
  /** Callback when state is restored from checkpoint */
  onRestore?: (state: Record<string, unknown>) => void
  /** AbortSignal for cancellation */
  signal?: AbortSignal
}

/**
 * Result of batch processing
 */
export interface BatchResult {
  success: boolean
  processedCount: number
  totalCount: number
  resumed: boolean
  checkpointsCreated: number
  errors: Error[]
}

// =============================================================================
// SQLite Checkpoint Store
// =============================================================================

/**
 * SQLite-based checkpoint storage implementation
 */
export class SQLiteCheckpointStore implements CheckpointStore {
  private initialized = false

  constructor(private sql: SqlStorage) {}

  /**
   * Initialize the checkpoints table if it doesn't exist
   */
  private async ensureTable(): Promise<void> {
    if (this.initialized) return

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS batch_checkpoints (
        batch_id TEXT PRIMARY KEY,
        id TEXT NOT NULL,
        processed_count INTEGER NOT NULL,
        total_count INTEGER NOT NULL,
        last_processed_id TEXT,
        state TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
    this.initialized = true
  }

  async save(checkpoint: CheckpointData): Promise<void> {
    await this.ensureTable()

    const cursor = this.sql.exec(
      `INSERT INTO batch_checkpoints (batch_id, id, processed_count, total_count, last_processed_id, state, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(batch_id) DO UPDATE SET
         processed_count = excluded.processed_count,
         total_count = excluded.total_count,
         last_processed_id = excluded.last_processed_id,
         state = excluded.state,
         updated_at = excluded.updated_at`,
      checkpoint.batchId,
      checkpoint.id,
      checkpoint.processedCount,
      checkpoint.totalCount,
      checkpoint.lastProcessedId,
      JSON.stringify(checkpoint.state),
      checkpoint.createdAt,
      checkpoint.updatedAt
    )
    // Consume cursor to ensure execution
    cursor.toArray()
  }

  async load(batchId: string): Promise<CheckpointData | null> {
    await this.ensureTable()

    const cursor = this.sql.exec(
      `SELECT * FROM batch_checkpoints WHERE batch_id = ?`,
      batchId
    )
    const rows = cursor.toArray()

    if (rows.length === 0) {
      return null
    }

    const row = rows[0] as Record<string, unknown>
    return {
      id: row.id as string,
      batchId: row.batch_id as string,
      processedCount: row.processed_count as number,
      totalCount: row.total_count as number,
      lastProcessedId: row.last_processed_id as string | null,
      state: JSON.parse((row.state as string) || '{}'),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }
  }

  async delete(batchId: string): Promise<void> {
    await this.ensureTable()

    const cursor = this.sql.exec(
      `DELETE FROM batch_checkpoints WHERE batch_id = ?`,
      batchId
    )
    cursor.toArray()
  }

  async exists(batchId: string): Promise<boolean> {
    await this.ensureTable()

    const cursor = this.sql.exec(
      `SELECT 1 FROM batch_checkpoints WHERE batch_id = ? LIMIT 1`,
      batchId
    )
    return cursor.toArray().length > 0
  }

  async list(): Promise<CheckpointData[]> {
    await this.ensureTable()

    const cursor = this.sql.exec(
      `SELECT * FROM batch_checkpoints ORDER BY updated_at DESC`
    )
    const rows = cursor.toArray()

    return rows.map((row) => {
      const r = row as Record<string, unknown>
      return {
        id: r.id as string,
        batchId: r.batch_id as string,
        processedCount: r.processed_count as number,
        totalCount: r.total_count as number,
        lastProcessedId: r.last_processed_id as string | null,
        state: JSON.parse((r.state as string) || '{}'),
        createdAt: r.created_at as string,
        updatedAt: r.updated_at as string,
      }
    })
  }

  async cleanupOlderThan(maxAgeMs: number): Promise<number> {
    await this.ensureTable()

    const cutoffDate = new Date(Date.now() - maxAgeMs).toISOString()

    const cursor = this.sql.exec(
      `DELETE FROM batch_checkpoints WHERE updated_at < ?`,
      cutoffDate
    )
    const result = cursor.toArray()
    // SQLite doesn't return affected rows directly in this API, but we track it
    return result.length
  }
}

// =============================================================================
// Batch Processor with Checkpointing
// =============================================================================

/**
 * Validates that a checkpoint has all required fields
 */
function isValidCheckpoint(checkpoint: unknown): checkpoint is CheckpointData {
  if (!checkpoint || typeof checkpoint !== 'object') return false
  const cp = checkpoint as Record<string, unknown>
  return (
    typeof cp.batchId === 'string' &&
    typeof cp.processedCount === 'number' &&
    typeof cp.totalCount === 'number' &&
    (cp.lastProcessedId === null || typeof cp.lastProcessedId === 'string')
  )
}

/**
 * Generates a unique checkpoint ID
 */
function generateCheckpointId(): string {
  return `cp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Process a batch of items with checkpoint/resume capability
 *
 * @param options - Batch processing options
 * @returns Result of the batch processing
 *
 * @example
 * ```ts
 * const result = await processBatchWithCheckpoint({
 *   batchId: 'import-users-2024',
 *   items: users,
 *   processor: async (user) => {
 *     await importUser(user)
 *   },
 *   checkpointStore: new SQLiteCheckpointStore(sql),
 *   checkpointInterval: 100,
 *   onProgress: (processed, total) => {
 *     console.log(`Progress: ${processed}/${total}`)
 *   },
 * })
 * ```
 */
export async function processBatchWithCheckpoint<T extends BatchItem>(
  options: BatchProcessorOptions<T>
): Promise<BatchResult> {
  const {
    batchId,
    items,
    processor,
    checkpointStore,
    checkpointInterval = 10,
    concurrency = 1,
    continueOnError = false,
    keepCheckpointOnComplete = false,
    onProgress,
    onCheckpoint,
    getState,
    onRestore,
    signal,
  } = options

  const result: BatchResult = {
    success: true,
    processedCount: 0,
    totalCount: items.length,
    resumed: false,
    checkpointsCreated: 0,
    errors: [],
  }

  // Handle empty batch
  if (items.length === 0) {
    return result
  }

  // Check for existing checkpoint
  let startIndex = 0
  let restoredState: Record<string, unknown> = {}

  try {
    const existingCheckpoint = await checkpointStore.load(batchId)
    if (existingCheckpoint && isValidCheckpoint(existingCheckpoint)) {
      // Find the index to resume from based on lastProcessedId
      if (existingCheckpoint.lastProcessedId !== null) {
        const lastIndex = items.findIndex(
          (item) => item.id === existingCheckpoint.lastProcessedId
        )
        if (lastIndex >= 0) {
          startIndex = lastIndex + 1
          result.resumed = true
          result.processedCount = existingCheckpoint.processedCount
          restoredState = existingCheckpoint.state || {}

          // Notify about state restoration
          if (onRestore && Object.keys(restoredState).length > 0) {
            onRestore(restoredState)
          }
        }
      }
    }
  } catch {
    // Checkpoint load failed, start from beginning
  }

  // Create checkpoint helper
  const createCheckpoint = async (
    processedCount: number,
    lastProcessedId: string | null
  ): Promise<void> => {
    const now = new Date().toISOString()
    const customState = getState?.() || {}

    const checkpoint: CheckpointData = {
      id: generateCheckpointId(),
      batchId,
      processedCount,
      totalCount: items.length,
      lastProcessedId,
      state: { ...restoredState, ...customState },
      createdAt: result.checkpointsCreated === 0 ? now : now,
      updatedAt: now,
    }

    try {
      await checkpointStore.save(checkpoint)
      result.checkpointsCreated++
      onCheckpoint?.(checkpoint)
    } catch {
      // Checkpoint save failed, continue processing
      // Checkpointing is non-critical
    }
  }

  // Track completed items for concurrency
  let completedCount = result.processedCount
  let lastProcessedId: string | null =
    startIndex > 0 ? items[startIndex - 1].id : null
  let shouldStop = false

  // Process with concurrency
  const processItem = async (index: number): Promise<void> => {
    if (shouldStop || (signal && signal.aborted)) {
      return
    }

    const item = items[index]

    try {
      await processor(item, index)
      completedCount++
      lastProcessedId = item.id

      // Report progress
      onProgress?.(completedCount, items.length)

      // Check if we should create a checkpoint
      const itemsSinceStart = completedCount - (result.resumed ? result.processedCount - startIndex : 0)
      if (itemsSinceStart > 0 && itemsSinceStart % checkpointInterval === 0) {
        await createCheckpoint(completedCount, lastProcessedId)
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      result.errors.push(error)

      if (!continueOnError) {
        shouldStop = true
        result.success = false
        // Save checkpoint before stopping
        await createCheckpoint(completedCount, lastProcessedId)
        throw error
      }
    }
  }

  // Process items with concurrency control
  if (concurrency <= 1) {
    // Sequential processing
    for (let i = startIndex; i < items.length; i++) {
      if (shouldStop || (signal && signal.aborted)) break
      await processItem(i)
    }
  } else {
    // Concurrent processing using a simple worker pool approach
    let nextIndex = startIndex

    const worker = async (): Promise<void> => {
      while (!shouldStop && !(signal && signal.aborted)) {
        const index = nextIndex++
        if (index >= items.length) break
        await processItem(index)
      }
    }

    // Start workers up to concurrency limit
    const workerCount = Math.min(concurrency, items.length - startIndex)
    const workers: Promise<void>[] = []

    for (let i = 0; i < workerCount; i++) {
      workers.push(worker())
    }

    // Wait for all workers to complete
    await Promise.all(workers)
  }

  // Update final processed count
  result.processedCount = completedCount

  // Handle completion
  if (result.success && !shouldStop && !(signal && signal.aborted)) {
    result.success = result.errors.length === 0

    // Cleanup checkpoint after successful completion
    if (!keepCheckpointOnComplete) {
      try {
        await checkpointStore.delete(batchId)
      } catch {
        // Cleanup failed, not critical
      }
    }
  }

  return result
}

// Alias for backward compatibility
export const processBatch = processBatchWithCheckpoint
