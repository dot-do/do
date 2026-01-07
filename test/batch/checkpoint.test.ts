/**
 * @dotdo/do - Batch Checkpoint/Resume Tests (RED Phase)
 *
 * TDD RED Phase: These tests define expected behavior for batch processing
 * with checkpoint/resume capability using SQLite-based storage.
 *
 * Features tested:
 * - Checkpoint creation during batch processing
 * - Resume from checkpoint after failure
 * - SQLite-based checkpoint storage
 * - Checkpoint cleanup after completion
 * - Progress tracking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Types for the checkpoint system (to be implemented)
interface CheckpointData {
  id: string
  batchId: string
  processedCount: number
  totalCount: number
  lastProcessedId: string | null
  state: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface CheckpointStore {
  save(checkpoint: CheckpointData): Promise<void>
  load(batchId: string): Promise<CheckpointData | null>
  delete(batchId: string): Promise<void>
  exists(batchId: string): Promise<boolean>
}

interface BatchProcessorOptions<T> {
  batchId: string
  items: T[]
  processor: (item: T, index: number) => Promise<void>
  checkpointStore: CheckpointStore
  checkpointInterval?: number // Save checkpoint every N items
  onProgress?: (processed: number, total: number) => void
  onCheckpoint?: (checkpoint: CheckpointData) => void
}

interface BatchResult {
  success: boolean
  processedCount: number
  totalCount: number
  resumed: boolean
  checkpointsCreated: number
  errors: Error[]
}

// =============================================================================
// RED Phase Tests: Batch Checkpoint/Resume
// =============================================================================

describe('Batch Checkpoint/Resume - RED Phase TDD', () => {
  // ===========================================================================
  // Checkpoint Creation During Batch Processing
  // ===========================================================================

  describe.todo('Checkpoint Creation', () => {
    it('should create checkpoint at specified interval during processing', async () => {
      // Given a batch processor with checkpoint interval of 10
      const items = Array.from({ length: 50 }, (_, i) => ({ id: `item-${i}`, value: i }))
      const checkpoints: CheckpointData[] = []

      const mockStore: CheckpointStore = {
        save: vi.fn(async (checkpoint) => {
          checkpoints.push({ ...checkpoint })
        }),
        load: vi.fn(async () => null),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => false),
      }

      // When processing the batch
      // const result = await processBatch({
      //   batchId: 'test-batch-1',
      //   items,
      //   processor: async (item) => { /* process item */ },
      //   checkpointStore: mockStore,
      //   checkpointInterval: 10,
      // })

      // Then checkpoints should be created at intervals
      expect(checkpoints.length).toBeGreaterThanOrEqual(4) // 10, 20, 30, 40
      expect(mockStore.save).toHaveBeenCalled()
    })

    it('should include progress information in checkpoint', async () => {
      const mockStore: CheckpointStore = {
        save: vi.fn(async () => {}),
        load: vi.fn(async () => null),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => false),
      }

      // When a checkpoint is created
      // const result = await processBatch({ ... })

      // Then checkpoint should contain progress info
      const savedCheckpoint = (mockStore.save as any).mock.calls[0]?.[0] as CheckpointData
      expect(savedCheckpoint).toBeDefined()
      expect(savedCheckpoint.processedCount).toBeDefined()
      expect(savedCheckpoint.totalCount).toBeDefined()
      expect(savedCheckpoint.lastProcessedId).toBeDefined()
    })

    it('should store batch ID in checkpoint', async () => {
      const batchId = 'unique-batch-123'
      let savedCheckpoint: CheckpointData | null = null

      const mockStore: CheckpointStore = {
        save: vi.fn(async (checkpoint) => {
          savedCheckpoint = checkpoint
        }),
        load: vi.fn(async () => null),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => false),
      }

      // When processing a batch
      // await processBatch({ batchId, ... })

      // Then checkpoint should include the batch ID
      expect(savedCheckpoint?.batchId).toBe(batchId)
    })

    it('should update checkpoint timestamps on each save', async () => {
      const checkpoints: CheckpointData[] = []

      const mockStore: CheckpointStore = {
        save: vi.fn(async (checkpoint) => {
          checkpoints.push({ ...checkpoint })
        }),
        load: vi.fn(async () => null),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => false),
      }

      // When multiple checkpoints are created
      // await processBatch({ checkpointInterval: 5, ... })

      // Then each checkpoint should have updated timestamps
      if (checkpoints.length > 1) {
        const first = new Date(checkpoints[0].updatedAt).getTime()
        const second = new Date(checkpoints[1].updatedAt).getTime()
        expect(second).toBeGreaterThanOrEqual(first)
      }
    })

    it('should allow custom state to be stored in checkpoint', async () => {
      let savedCheckpoint: CheckpointData | null = null

      const mockStore: CheckpointStore = {
        save: vi.fn(async (checkpoint) => {
          savedCheckpoint = checkpoint
        }),
        load: vi.fn(async () => null),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => false),
      }

      // When processing with custom state
      // await processBatch({
      //   ...,
      //   getState: () => ({ customField: 'custom-value', counter: 42 }),
      // })

      // Then checkpoint should include custom state
      expect(savedCheckpoint?.state).toBeDefined()
      expect(savedCheckpoint?.state?.customField).toBe('custom-value')
    })

    it('should trigger onCheckpoint callback when checkpoint is created', async () => {
      const checkpointCallbacks: CheckpointData[] = []

      // When processing with onCheckpoint callback
      // await processBatch({
      //   ...,
      //   onCheckpoint: (checkpoint) => checkpointCallbacks.push(checkpoint),
      // })

      // Then callback should be triggered for each checkpoint
      expect(checkpointCallbacks.length).toBeGreaterThan(0)
    })
  })

  // ===========================================================================
  // Resume from Checkpoint After Failure
  // ===========================================================================

  describe.todo('Resume from Checkpoint', () => {
    it('should check for existing checkpoint before starting batch', async () => {
      const mockStore: CheckpointStore = {
        save: vi.fn(async () => {}),
        load: vi.fn(async () => null),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => false),
      }

      // When starting batch processing
      // await processBatch({ batchId: 'test-batch', ... })

      // Then should check for existing checkpoint
      expect(mockStore.load).toHaveBeenCalledWith('test-batch')
    })

    it('should resume from last processed item when checkpoint exists', async () => {
      const processedItems: string[] = []
      const items = Array.from({ length: 20 }, (_, i) => ({ id: `item-${i}`, value: i }))

      const existingCheckpoint: CheckpointData = {
        id: 'checkpoint-1',
        batchId: 'test-batch',
        processedCount: 10,
        totalCount: 20,
        lastProcessedId: 'item-9',
        state: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const mockStore: CheckpointStore = {
        save: vi.fn(async () => {}),
        load: vi.fn(async () => existingCheckpoint),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => true),
      }

      // When processing with existing checkpoint
      // await processBatch({
      //   batchId: 'test-batch',
      //   items,
      //   processor: async (item) => { processedItems.push(item.id) },
      //   checkpointStore: mockStore,
      // })

      // Then should only process remaining items (10-19)
      expect(processedItems).not.toContain('item-0')
      expect(processedItems).not.toContain('item-9')
      expect(processedItems).toContain('item-10')
      expect(processedItems).toContain('item-19')
    })

    it('should indicate in result that batch was resumed', async () => {
      const existingCheckpoint: CheckpointData = {
        id: 'checkpoint-1',
        batchId: 'test-batch',
        processedCount: 5,
        totalCount: 10,
        lastProcessedId: 'item-4',
        state: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const mockStore: CheckpointStore = {
        save: vi.fn(async () => {}),
        load: vi.fn(async () => existingCheckpoint),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => true),
      }

      // When processing with existing checkpoint
      // const result = await processBatch({ ... })

      // Then result should indicate resumption
      // expect(result.resumed).toBe(true)
    })

    it('should restore custom state from checkpoint when resuming', async () => {
      let restoredState: Record<string, unknown> | null = null

      const existingCheckpoint: CheckpointData = {
        id: 'checkpoint-1',
        batchId: 'test-batch',
        processedCount: 5,
        totalCount: 10,
        lastProcessedId: 'item-4',
        state: { accumulator: 100, lastError: null },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const mockStore: CheckpointStore = {
        save: vi.fn(async () => {}),
        load: vi.fn(async () => existingCheckpoint),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => true),
      }

      // When processing with state restoration callback
      // await processBatch({
      //   ...,
      //   onRestore: (state) => { restoredState = state },
      // })

      // Then custom state should be restored
      expect(restoredState?.accumulator).toBe(100)
    })

    it('should handle checkpoint with mismatched total count', async () => {
      const items = Array.from({ length: 25 }, (_, i) => ({ id: `item-${i}` }))

      // Checkpoint was created when batch had 20 items, now has 25
      const existingCheckpoint: CheckpointData = {
        id: 'checkpoint-1',
        batchId: 'test-batch',
        processedCount: 10,
        totalCount: 20, // Original count
        lastProcessedId: 'item-9',
        state: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const mockStore: CheckpointStore = {
        save: vi.fn(async () => {}),
        load: vi.fn(async () => existingCheckpoint),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => true),
      }

      // When processing with changed item count
      // const result = await processBatch({ items, ... })

      // Should handle gracefully (implementation decision: process remaining or restart)
      // expect(result.success).toBe(true)
    })

    it('should create new checkpoint immediately after resume', async () => {
      const checkpointSaves: CheckpointData[] = []

      const existingCheckpoint: CheckpointData = {
        id: 'checkpoint-1',
        batchId: 'test-batch',
        processedCount: 5,
        totalCount: 10,
        lastProcessedId: 'item-4',
        state: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const mockStore: CheckpointStore = {
        save: vi.fn(async (checkpoint) => {
          checkpointSaves.push({ ...checkpoint })
        }),
        load: vi.fn(async () => existingCheckpoint),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => true),
      }

      // When resuming from checkpoint
      // await processBatch({ checkpointInterval: 10, ... })

      // Then first checkpoint should indicate resumed state
      expect(checkpointSaves.length).toBeGreaterThan(0)
      expect(checkpointSaves[0].processedCount).toBeGreaterThanOrEqual(5)
    })
  })

  // ===========================================================================
  // SQLite-based Checkpoint Storage
  // ===========================================================================

  describe.todo('SQLite Checkpoint Storage', () => {
    it('should create checkpoints table if not exists', async () => {
      // When initializing SQLite checkpoint store
      // const store = new SQLiteCheckpointStore(sql)

      // Then checkpoints table should exist
      // const result = sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='batch_checkpoints'")
      // expect(result.toArray().length).toBe(1)
    })

    it('should save checkpoint to SQLite', async () => {
      const checkpoint: CheckpointData = {
        id: 'cp-1',
        batchId: 'batch-123',
        processedCount: 50,
        totalCount: 100,
        lastProcessedId: 'item-49',
        state: { key: 'value' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      // When saving checkpoint
      // await store.save(checkpoint)

      // Then should be retrievable from SQLite
      // const loaded = await store.load('batch-123')
      // expect(loaded?.processedCount).toBe(50)
    })

    it('should update existing checkpoint for same batch ID', async () => {
      const checkpoint1: CheckpointData = {
        id: 'cp-1',
        batchId: 'batch-123',
        processedCount: 25,
        totalCount: 100,
        lastProcessedId: 'item-24',
        state: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const checkpoint2: CheckpointData = {
        ...checkpoint1,
        processedCount: 50,
        lastProcessedId: 'item-49',
        updatedAt: new Date().toISOString(),
      }

      // When saving multiple checkpoints for same batch
      // await store.save(checkpoint1)
      // await store.save(checkpoint2)

      // Then should only have one record with latest data
      // const loaded = await store.load('batch-123')
      // expect(loaded?.processedCount).toBe(50)
    })

    it('should load checkpoint by batch ID', async () => {
      // Given saved checkpoint
      // await store.save({ batchId: 'my-batch', ... })

      // When loading by batch ID
      // const loaded = await store.load('my-batch')

      // Then should return correct checkpoint
      // expect(loaded?.batchId).toBe('my-batch')
    })

    it('should return null when checkpoint does not exist', async () => {
      // When loading non-existent checkpoint
      // const loaded = await store.load('non-existent-batch')

      // Then should return null
      // expect(loaded).toBeNull()
    })

    it('should delete checkpoint by batch ID', async () => {
      // Given saved checkpoint
      // await store.save({ batchId: 'delete-me', ... })

      // When deleting
      // await store.delete('delete-me')

      // Then should not be loadable
      // const loaded = await store.load('delete-me')
      // expect(loaded).toBeNull()
    })

    it('should check if checkpoint exists', async () => {
      // Given saved checkpoint
      // await store.save({ batchId: 'exists-batch', ... })

      // Then exists should return true
      // expect(await store.exists('exists-batch')).toBe(true)
      // expect(await store.exists('not-exists')).toBe(false)
    })

    it('should serialize and deserialize state JSON correctly', async () => {
      const complexState = {
        nested: { deep: { value: 42 } },
        array: [1, 2, 3],
        date: '2024-01-15T10:00:00Z',
        nullValue: null,
      }

      const checkpoint: CheckpointData = {
        id: 'cp-1',
        batchId: 'json-test',
        processedCount: 10,
        totalCount: 20,
        lastProcessedId: 'item-9',
        state: complexState,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      // When saving and loading
      // await store.save(checkpoint)
      // const loaded = await store.load('json-test')

      // Then state should be correctly restored
      // expect(loaded?.state.nested.deep.value).toBe(42)
      // expect(loaded?.state.array).toEqual([1, 2, 3])
    })

    it('should handle concurrent checkpoint saves', async () => {
      // Given multiple concurrent saves
      // const saves = Promise.all([
      //   store.save({ batchId: 'concurrent-1', processedCount: 10, ... }),
      //   store.save({ batchId: 'concurrent-2', processedCount: 20, ... }),
      //   store.save({ batchId: 'concurrent-3', processedCount: 30, ... }),
      // ])

      // When all complete
      // await saves

      // Then all should be saved
      // expect(await store.exists('concurrent-1')).toBe(true)
      // expect(await store.exists('concurrent-2')).toBe(true)
      // expect(await store.exists('concurrent-3')).toBe(true)
    })
  })

  // ===========================================================================
  // Checkpoint Cleanup After Completion
  // ===========================================================================

  describe.todo('Checkpoint Cleanup', () => {
    it('should delete checkpoint after successful batch completion', async () => {
      const mockStore: CheckpointStore = {
        save: vi.fn(async () => {}),
        load: vi.fn(async () => null),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => false),
      }

      // When batch completes successfully
      // const result = await processBatch({
      //   batchId: 'cleanup-test',
      //   items: [{ id: '1' }, { id: '2' }],
      //   processor: async () => {},
      //   checkpointStore: mockStore,
      // })

      // Then checkpoint should be deleted
      expect(mockStore.delete).toHaveBeenCalledWith('cleanup-test')
    })

    it('should not delete checkpoint when batch fails', async () => {
      const mockStore: CheckpointStore = {
        save: vi.fn(async () => {}),
        load: vi.fn(async () => null),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => false),
      }

      let processCount = 0

      // When batch fails mid-processing
      // try {
      //   await processBatch({
      //     batchId: 'fail-test',
      //     items: [{ id: '1' }, { id: '2' }, { id: '3' }],
      //     processor: async () => {
      //       processCount++
      //       if (processCount === 2) throw new Error('Processing failed')
      //     },
      //     checkpointStore: mockStore,
      //   })
      // } catch (e) {}

      // Then checkpoint should NOT be deleted (for resume)
      expect(mockStore.delete).not.toHaveBeenCalled()
    })

    it('should provide option to keep checkpoint after completion', async () => {
      const mockStore: CheckpointStore = {
        save: vi.fn(async () => {}),
        load: vi.fn(async () => null),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => false),
      }

      // When batch completes with keepCheckpoint option
      // await processBatch({
      //   batchId: 'keep-checkpoint-test',
      //   keepCheckpointOnComplete: true,
      //   ...
      // })

      // Then checkpoint should NOT be deleted
      expect(mockStore.delete).not.toHaveBeenCalled()
    })

    it('should clean up old checkpoints by age', async () => {
      // Given checkpoints older than threshold
      // await store.save({ batchId: 'old-1', updatedAt: '2024-01-01T00:00:00Z', ... })
      // await store.save({ batchId: 'old-2', updatedAt: '2024-01-02T00:00:00Z', ... })
      // await store.save({ batchId: 'new-1', updatedAt: new Date().toISOString(), ... })

      // When cleaning up checkpoints older than 7 days
      // await store.cleanupOlderThan(7 * 24 * 60 * 60 * 1000)

      // Then old checkpoints should be removed
      // expect(await store.exists('old-1')).toBe(false)
      // expect(await store.exists('old-2')).toBe(false)
      // expect(await store.exists('new-1')).toBe(true)
    })

    it('should list all stored checkpoints', async () => {
      // Given multiple checkpoints
      // await store.save({ batchId: 'batch-1', ... })
      // await store.save({ batchId: 'batch-2', ... })

      // When listing all checkpoints
      // const checkpoints = await store.list()

      // Then should return all stored checkpoints
      // expect(checkpoints.length).toBe(2)
      // expect(checkpoints.map(c => c.batchId)).toContain('batch-1')
      // expect(checkpoints.map(c => c.batchId)).toContain('batch-2')
    })
  })

  // ===========================================================================
  // Progress Tracking
  // ===========================================================================

  describe.todo('Progress Tracking', () => {
    it('should call onProgress callback during processing', async () => {
      const progressCalls: Array<{ processed: number; total: number }> = []

      // When processing batch with onProgress callback
      // await processBatch({
      //   items: Array.from({ length: 10 }, (_, i) => ({ id: `${i}` })),
      //   onProgress: (processed, total) => {
      //     progressCalls.push({ processed, total })
      //   },
      //   ...
      // })

      // Then progress should be reported
      expect(progressCalls.length).toBeGreaterThan(0)
      expect(progressCalls[progressCalls.length - 1].processed).toBe(10)
      expect(progressCalls[progressCalls.length - 1].total).toBe(10)
    })

    it('should report accurate progress when resuming', async () => {
      const progressCalls: Array<{ processed: number; total: number }> = []

      const existingCheckpoint: CheckpointData = {
        id: 'cp-1',
        batchId: 'progress-test',
        processedCount: 50,
        totalCount: 100,
        lastProcessedId: 'item-49',
        state: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const mockStore: CheckpointStore = {
        save: vi.fn(async () => {}),
        load: vi.fn(async () => existingCheckpoint),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => true),
      }

      // When resuming from checkpoint
      // await processBatch({
      //   items: Array.from({ length: 100 }, (_, i) => ({ id: `item-${i}` })),
      //   onProgress: (processed, total) => {
      //     progressCalls.push({ processed, total })
      //   },
      //   checkpointStore: mockStore,
      // })

      // Then first progress call should reflect resumed state
      expect(progressCalls[0]?.processed).toBeGreaterThanOrEqual(50)
    })

    it('should include processing rate in progress', async () => {
      interface ExtendedProgress {
        processed: number
        total: number
        itemsPerSecond: number
        estimatedTimeRemaining: number
      }

      const progressCalls: ExtendedProgress[] = []

      // When processing with extended progress info
      // await processBatch({
      //   onProgress: (progress: ExtendedProgress) => {
      //     progressCalls.push(progress)
      //   },
      //   ...
      // })

      // Then should include rate information
      expect(progressCalls.length).toBeGreaterThan(0)
      // expect(progressCalls[progressCalls.length - 1].itemsPerSecond).toBeGreaterThan(0)
    })

    it('should track errors in progress', async () => {
      interface ProgressWithErrors {
        processed: number
        total: number
        errors: number
        successRate: number
      }

      const progressCalls: ProgressWithErrors[] = []
      let processCount = 0

      // When processing with some failures
      // await processBatch({
      //   items: Array.from({ length: 10 }, (_, i) => ({ id: `${i}` })),
      //   processor: async () => {
      //     processCount++
      //     if (processCount % 3 === 0) throw new Error('Intermittent failure')
      //   },
      //   continueOnError: true,
      //   onProgress: (progress: ProgressWithErrors) => {
      //     progressCalls.push(progress)
      //   },
      // })

      // Then error count should be tracked
      // expect(progressCalls[progressCalls.length - 1].errors).toBeGreaterThan(0)
    })

    it('should provide percentage completion', async () => {
      const percentages: number[] = []

      // When processing batch
      // await processBatch({
      //   items: Array.from({ length: 100 }, (_, i) => ({ id: `${i}` })),
      //   onProgress: (processed, total) => {
      //     percentages.push((processed / total) * 100)
      //   },
      // })

      // Then percentages should range from 0 to 100
      expect(percentages.length).toBeGreaterThan(0)
      expect(percentages[percentages.length - 1]).toBe(100)
    })
  })

  // ===========================================================================
  // Edge Cases and Error Handling
  // ===========================================================================

  describe.todo('Edge Cases', () => {
    it('should handle empty batch gracefully', async () => {
      const mockStore: CheckpointStore = {
        save: vi.fn(async () => {}),
        load: vi.fn(async () => null),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => false),
      }

      // When processing empty batch
      // const result = await processBatch({
      //   batchId: 'empty-batch',
      //   items: [],
      //   processor: async () => {},
      //   checkpointStore: mockStore,
      // })

      // Then should complete successfully
      // expect(result.success).toBe(true)
      // expect(result.processedCount).toBe(0)
    })

    it('should handle checkpoint store failures gracefully', async () => {
      const mockStore: CheckpointStore = {
        save: vi.fn(async () => {
          throw new Error('Storage failure')
        }),
        load: vi.fn(async () => null),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => false),
      }

      // When checkpoint save fails
      // const result = await processBatch({
      //   items: [{ id: '1' }],
      //   checkpointStore: mockStore,
      //   ...
      // })

      // Then batch should still complete (checkpoint is non-critical)
      // expect(result.success).toBe(true)
    })

    it('should handle corrupted checkpoint data', async () => {
      const mockStore: CheckpointStore = {
        save: vi.fn(async () => {}),
        load: vi.fn(async () => {
          // Return malformed checkpoint
          return {
            batchId: 'test',
            // Missing required fields
          } as unknown as CheckpointData
        }),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => true),
      }

      // When loading corrupted checkpoint
      // const result = await processBatch({
      //   batchId: 'test',
      //   items: [{ id: '1' }],
      //   checkpointStore: mockStore,
      // })

      // Then should start fresh (not crash)
      // expect(result.resumed).toBe(false)
    })

    it('should handle checkpoint for batch with single item', async () => {
      let checkpointCreated = false
      const mockStore: CheckpointStore = {
        save: vi.fn(async () => {
          checkpointCreated = true
        }),
        load: vi.fn(async () => null),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => false),
      }

      // When processing single item batch
      // await processBatch({
      //   items: [{ id: 'single' }],
      //   checkpointStore: mockStore,
      //   checkpointInterval: 1,
      // })

      // Then checkpoint should still work
      // expect(checkpointCreated).toBe(true)
    })

    it('should preserve checkpoint when batch is cancelled', async () => {
      const mockStore: CheckpointStore = {
        save: vi.fn(async () => {}),
        load: vi.fn(async () => null),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => false),
      }

      const controller = new AbortController()
      let processCount = 0

      // When batch is cancelled mid-processing
      // const batchPromise = processBatch({
      //   items: Array.from({ length: 100 }, (_, i) => ({ id: `${i}` })),
      //   processor: async () => {
      //     processCount++
      //     if (processCount === 10) controller.abort()
      //     await new Promise(r => setTimeout(r, 10))
      //   },
      //   checkpointStore: mockStore,
      //   signal: controller.signal,
      // })
      // await batchPromise.catch(() => {})

      // Then checkpoint should be preserved
      expect(mockStore.delete).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // Integration with ConcurrencyController
  // ===========================================================================

  describe.todo('Concurrency Integration', () => {
    it('should checkpoint correctly with concurrent processing', async () => {
      const checkpoints: CheckpointData[] = []

      const mockStore: CheckpointStore = {
        save: vi.fn(async (checkpoint) => {
          checkpoints.push({ ...checkpoint })
        }),
        load: vi.fn(async () => null),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => false),
      }

      // When processing with concurrency
      // await processBatch({
      //   items: Array.from({ length: 50 }, (_, i) => ({ id: `${i}` })),
      //   processor: async () => {
      //     await new Promise(r => setTimeout(r, 10))
      //   },
      //   checkpointStore: mockStore,
      //   checkpointInterval: 10,
      //   concurrency: 5,
      // })

      // Then checkpoints should have accurate counts
      checkpoints.forEach((cp) => {
        expect(cp.processedCount).toBeLessThanOrEqual(cp.totalCount)
      })
    })

    it('should wait for in-flight items before checkpointing', async () => {
      const processOrder: string[] = []
      let checkpointProcessedCount = 0

      const mockStore: CheckpointStore = {
        save: vi.fn(async (checkpoint) => {
          checkpointProcessedCount = checkpoint.processedCount
        }),
        load: vi.fn(async () => null),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => false),
      }

      // When processing with varying delays
      // await processBatch({
      //   items: Array.from({ length: 20 }, (_, i) => ({ id: `${i}`, delay: i * 5 })),
      //   processor: async (item) => {
      //     await new Promise(r => setTimeout(r, item.delay))
      //     processOrder.push(item.id)
      //   },
      //   checkpointStore: mockStore,
      //   checkpointInterval: 10,
      //   concurrency: 5,
      // })

      // Then checkpoint count should only include completed items
      // (not items that started but didn't finish at checkpoint time)
    })
  })
})
