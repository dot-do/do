/**
 * @dotdo/do - Batch Checkpoint/Resume Tests (GREEN Phase)
 *
 * TDD GREEN Phase: Tests for batch processing with checkpoint/resume
 * capability using mock storage.
 *
 * Features tested:
 * - Checkpoint creation during batch processing
 * - Resume from checkpoint after failure
 * - Checkpoint cleanup after completion
 * - Progress tracking
 */

import { describe, it, expect, vi } from 'vitest'
import {
  processBatchWithCheckpoint,
  type CheckpointStore,
  type CheckpointData,
} from '../../src/batch/checkpoint'

// =============================================================================
// GREEN Phase Tests: Batch Checkpoint/Resume
// =============================================================================

describe('Batch Checkpoint/Resume - GREEN Phase TDD', () => {
  // ===========================================================================
  // Checkpoint Creation During Batch Processing
  // ===========================================================================

  describe('Checkpoint Creation', () => {
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
      const result = await processBatchWithCheckpoint({
        batchId: 'test-batch-1',
        items,
        processor: async () => { /* process item */ },
        checkpointStore: mockStore,
        checkpointInterval: 10,
      })

      // Then checkpoints should be created at intervals
      expect(checkpoints.length).toBeGreaterThanOrEqual(4) // 10, 20, 30, 40
      expect(mockStore.save).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('should include progress information in checkpoint', async () => {
      const items = Array.from({ length: 15 }, (_, i) => ({ id: `item-${i}` }))
      let savedCheckpoint: CheckpointData | null = null

      const mockStore: CheckpointStore = {
        save: vi.fn(async (checkpoint) => {
          savedCheckpoint = checkpoint
        }),
        load: vi.fn(async () => null),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => false),
      }

      // When a checkpoint is created
      await processBatchWithCheckpoint({
        batchId: 'progress-info-test',
        items,
        processor: async () => {},
        checkpointStore: mockStore,
        checkpointInterval: 10,
      })

      // Then checkpoint should contain progress info
      expect(savedCheckpoint).toBeDefined()
      expect(savedCheckpoint!.processedCount).toBeDefined()
      expect(savedCheckpoint!.totalCount).toBeDefined()
      expect(savedCheckpoint!.lastProcessedId).toBeDefined()
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
      await processBatchWithCheckpoint({
        batchId,
        items: Array.from({ length: 15 }, (_, i) => ({ id: `item-${i}` })),
        processor: async () => {},
        checkpointStore: mockStore,
        checkpointInterval: 10,
      })

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
      await processBatchWithCheckpoint({
        batchId: 'timestamp-test',
        items: Array.from({ length: 25 }, (_, i) => ({ id: `item-${i}` })),
        processor: async () => {
          // Small delay to ensure timestamp difference
          await new Promise(r => setTimeout(r, 1))
        },
        checkpointStore: mockStore,
        checkpointInterval: 5,
      })

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
      await processBatchWithCheckpoint({
        batchId: 'custom-state-test',
        items: Array.from({ length: 15 }, (_, i) => ({ id: `item-${i}` })),
        processor: async () => {},
        checkpointStore: mockStore,
        checkpointInterval: 10,
        getState: () => ({ customField: 'custom-value', counter: 42 }),
      })

      // Then checkpoint should include custom state
      expect(savedCheckpoint?.state).toBeDefined()
      expect(savedCheckpoint?.state?.customField).toBe('custom-value')
    })

    it('should trigger onCheckpoint callback when checkpoint is created', async () => {
      const checkpointCallbacks: CheckpointData[] = []

      const mockStore: CheckpointStore = {
        save: vi.fn(async () => {}),
        load: vi.fn(async () => null),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => false),
      }

      // When processing with onCheckpoint callback
      await processBatchWithCheckpoint({
        batchId: 'callback-test',
        items: Array.from({ length: 15 }, (_, i) => ({ id: `item-${i}` })),
        processor: async () => {},
        checkpointStore: mockStore,
        checkpointInterval: 10,
        onCheckpoint: (checkpoint) => checkpointCallbacks.push(checkpoint),
      })

      // Then callback should be triggered for each checkpoint
      expect(checkpointCallbacks.length).toBeGreaterThan(0)
    })
  })

  // ===========================================================================
  // Resume from Checkpoint After Failure
  // ===========================================================================

  describe('Resume from Checkpoint', () => {
    it('should check for existing checkpoint before starting batch', async () => {
      const mockStore: CheckpointStore = {
        save: vi.fn(async () => {}),
        load: vi.fn(async () => null),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => false),
      }

      // When starting batch processing
      await processBatchWithCheckpoint({
        batchId: 'test-batch',
        items: [{ id: '1' }],
        processor: async () => {},
        checkpointStore: mockStore,
      })

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
      await processBatchWithCheckpoint({
        batchId: 'test-batch',
        items,
        processor: async (item) => { processedItems.push(item.id) },
        checkpointStore: mockStore,
      })

      // Then should only process remaining items (10-19)
      expect(processedItems).not.toContain('item-0')
      expect(processedItems).not.toContain('item-9')
      expect(processedItems).toContain('item-10')
      expect(processedItems).toContain('item-19')
    })

    it('should indicate in result that batch was resumed', async () => {
      const items = Array.from({ length: 10 }, (_, i) => ({ id: `item-${i}` }))

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
      const result = await processBatchWithCheckpoint({
        batchId: 'test-batch',
        items,
        processor: async () => {},
        checkpointStore: mockStore,
      })

      // Then result should indicate resumption
      expect(result.resumed).toBe(true)
    })

    it('should restore custom state from checkpoint when resuming', async () => {
      let restoredState: Record<string, unknown> | null = null
      const items = Array.from({ length: 10 }, (_, i) => ({ id: `item-${i}` }))

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
      await processBatchWithCheckpoint({
        batchId: 'test-batch',
        items,
        processor: async () => {},
        checkpointStore: mockStore,
        onRestore: (state) => { restoredState = state },
      })

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
      const result = await processBatchWithCheckpoint({
        batchId: 'test-batch',
        items,
        processor: async () => {},
        checkpointStore: mockStore,
      })

      // Should handle gracefully (process remaining items from where we left off)
      expect(result.success).toBe(true)
      expect(result.processedCount).toBe(25) // All items eventually processed
    })

    it('should create new checkpoint after resume when interval reached', async () => {
      const checkpointSaves: CheckpointData[] = []
      const items = Array.from({ length: 20 }, (_, i) => ({ id: `item-${i}` }))

      const existingCheckpoint: CheckpointData = {
        id: 'checkpoint-1',
        batchId: 'test-batch',
        processedCount: 5,
        totalCount: 20,
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
      await processBatchWithCheckpoint({
        batchId: 'test-batch',
        items,
        processor: async () => {},
        checkpointStore: mockStore,
        checkpointInterval: 5,
      })

      // Then checkpoints should be created after resume
      expect(checkpointSaves.length).toBeGreaterThan(0)
      expect(checkpointSaves[0].processedCount).toBeGreaterThanOrEqual(5)
    })
  })

  // ===========================================================================
  // Checkpoint Cleanup After Completion
  // ===========================================================================

  describe('Checkpoint Cleanup', () => {
    it('should delete checkpoint after successful batch completion', async () => {
      const mockStore: CheckpointStore = {
        save: vi.fn(async () => {}),
        load: vi.fn(async () => null),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => false),
      }

      // When batch completes successfully
      await processBatchWithCheckpoint({
        batchId: 'cleanup-test',
        items: [{ id: '1' }, { id: '2' }],
        processor: async () => {},
        checkpointStore: mockStore,
      })

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
      try {
        await processBatchWithCheckpoint({
          batchId: 'fail-test',
          items: [{ id: '1' }, { id: '2' }, { id: '3' }],
          processor: async () => {
            processCount++
            if (processCount === 2) throw new Error('Processing failed')
          },
          checkpointStore: mockStore,
        })
      } catch {
        // Expected to throw
      }

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
      await processBatchWithCheckpoint({
        batchId: 'keep-checkpoint-test',
        items: [{ id: '1' }, { id: '2' }],
        processor: async () => {},
        checkpointStore: mockStore,
        keepCheckpointOnComplete: true,
      })

      // Then checkpoint should NOT be deleted
      expect(mockStore.delete).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // Progress Tracking
  // ===========================================================================

  describe('Progress Tracking', () => {
    it('should call onProgress callback during processing', async () => {
      const progressCalls: Array<{ processed: number; total: number }> = []

      const mockStore: CheckpointStore = {
        save: vi.fn(async () => {}),
        load: vi.fn(async () => null),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => false),
      }

      // When processing batch with onProgress callback
      await processBatchWithCheckpoint({
        batchId: 'progress-test',
        items: Array.from({ length: 10 }, (_, i) => ({ id: `${i}` })),
        processor: async () => {},
        checkpointStore: mockStore,
        onProgress: (processed, total) => {
          progressCalls.push({ processed, total })
        },
      })

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

      // When resuming from checkpoint (smaller batch for test stability)
      await processBatchWithCheckpoint({
        batchId: 'progress-test',
        items: Array.from({ length: 20 }, (_, i) => ({ id: `item-${i}` })),
        processor: async () => {},
        checkpointStore: mockStore,
        onProgress: (processed, total) => {
          progressCalls.push({ processed, total })
        },
      })

      // Then first progress call should reflect resumed state
      expect(progressCalls[0]?.processed).toBeGreaterThanOrEqual(10)
    })

    it('should provide percentage completion', async () => {
      const percentages: number[] = []

      const mockStore: CheckpointStore = {
        save: vi.fn(async () => {}),
        load: vi.fn(async () => null),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => false),
      }

      // When processing batch (smaller batch for test stability)
      await processBatchWithCheckpoint({
        batchId: 'percentage-test',
        items: Array.from({ length: 20 }, (_, i) => ({ id: `${i}` })),
        processor: async () => {},
        checkpointStore: mockStore,
        onProgress: (processed, total) => {
          percentages.push((processed / total) * 100)
        },
      })

      // Then percentages should range from 0 to 100
      expect(percentages.length).toBeGreaterThan(0)
      expect(percentages[percentages.length - 1]).toBe(100)
    })
  })

  // ===========================================================================
  // Edge Cases and Error Handling
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle empty batch gracefully', async () => {
      const mockStore: CheckpointStore = {
        save: vi.fn(async () => {}),
        load: vi.fn(async () => null),
        delete: vi.fn(async () => {}),
        exists: vi.fn(async () => false),
      }

      // When processing empty batch
      const result = await processBatchWithCheckpoint({
        batchId: 'empty-batch',
        items: [],
        processor: async () => {},
        checkpointStore: mockStore,
      })

      // Then should complete successfully
      expect(result.success).toBe(true)
      expect(result.processedCount).toBe(0)
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
      const result = await processBatchWithCheckpoint({
        batchId: 'storage-fail-test',
        items: Array.from({ length: 15 }, (_, i) => ({ id: `${i}` })),
        processor: async () => {},
        checkpointStore: mockStore,
        checkpointInterval: 10,
      })

      // Then batch should still complete (checkpoint is non-critical)
      expect(result.success).toBe(true)
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
      const result = await processBatchWithCheckpoint({
        batchId: 'test',
        items: [{ id: '1' }],
        processor: async () => {},
        checkpointStore: mockStore,
      })

      // Then should start fresh (not crash)
      expect(result.resumed).toBe(false)
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

      // When processing single item batch with checkpointInterval of 1
      await processBatchWithCheckpoint({
        batchId: 'single-item-test',
        items: [{ id: 'single' }],
        processor: async () => {},
        checkpointStore: mockStore,
        checkpointInterval: 1,
      })

      // Then checkpoint should be created
      expect(checkpointCreated).toBe(true)
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

      // When batch is cancelled mid-processing (smaller batch for test stability)
      const batchPromise = processBatchWithCheckpoint({
        batchId: 'cancel-test',
        items: Array.from({ length: 20 }, (_, i) => ({ id: `${i}` })),
        processor: async () => {
          processCount++
          if (processCount === 5) controller.abort()
        },
        checkpointStore: mockStore,
        signal: controller.signal,
      })
      await batchPromise.catch(() => {})

      // Then checkpoint should be preserved
      expect(mockStore.delete).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // Concurrency Integration
  // ===========================================================================

  describe('Concurrency Integration', () => {
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

      // When processing with concurrency (minimal batch for test stability)
      await processBatchWithCheckpoint({
        batchId: 'concurrent-test',
        items: Array.from({ length: 15 }, (_, i) => ({ id: `${i}` })),
        processor: async () => {},
        checkpointStore: mockStore,
        checkpointInterval: 5,
        concurrency: 2,
      })

      // Then checkpoints should have accurate counts
      checkpoints.forEach((cp) => {
        expect(cp.processedCount).toBeLessThanOrEqual(cp.totalCount)
      })
    })
  })
})
