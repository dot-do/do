/**
 * @dotdo/do - enrichBatch() Tests (RED Phase)
 *
 * These tests verify the behavior of enrichBatch() function that processes
 * items with concurrency control.
 *
 * Tests cover:
 * - enrichBatch(items, enrichFn, options) signature
 * - Concurrency limit (default 5)
 * - Progress callback
 * - Error handling (continue vs fail-fast)
 * - Return enriched items in order
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  enrichBatch,
  type EnrichBatchOptions,
  type EnrichProgress,
  type EnrichResult,
} from '../../src/batch/enrich'

describe('enrichBatch()', () => {
  describe('Function Signature', () => {
    it('should accept items array, enrichFn, and optional options', async () => {
      const items = ['a', 'b', 'c']
      const enrichFn = async (item: string) => item.toUpperCase()

      const results = await enrichBatch(items, enrichFn)

      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(3)
    })

    it('should return EnrichResult objects with item, result, and success fields', async () => {
      const items = [{ id: 1, name: 'Alice' }]
      const enrichFn = async (item: { id: number; name: string }) => ({
        ...item,
        enriched: true,
      })

      const results = await enrichBatch(items, enrichFn)

      expect(results[0].item).toEqual({ id: 1, name: 'Alice' })
      expect(results[0].result).toEqual({ id: 1, name: 'Alice', enriched: true })
      expect(results[0].success).toBe(true)
      expect(results[0].error).toBeUndefined()
    })

    it('should handle empty items array', async () => {
      const results = await enrichBatch([], async (x: unknown) => x)

      expect(results).toEqual([])
    })
  })

  describe('Concurrency Limit', () => {
    it('should default to concurrency of 5', async () => {
      let maxConcurrent = 0
      let currentConcurrent = 0

      const items = Array.from({ length: 20 }, (_, i) => i)
      const enrichFn = async (item: number) => {
        currentConcurrent++
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
        await new Promise((resolve) => setTimeout(resolve, 10))
        currentConcurrent--
        return item * 2
      }

      await enrichBatch(items, enrichFn)

      expect(maxConcurrent).toBe(5)
    })

    it('should respect custom concurrency option', async () => {
      let maxConcurrent = 0
      let currentConcurrent = 0

      const items = Array.from({ length: 20 }, (_, i) => i)
      const enrichFn = async (item: number) => {
        currentConcurrent++
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
        await new Promise((resolve) => setTimeout(resolve, 10))
        currentConcurrent--
        return item * 2
      }

      await enrichBatch(items, enrichFn, { concurrency: 10 })

      expect(maxConcurrent).toBe(10)
    })

    it('should process single item with concurrency 1', async () => {
      let maxConcurrent = 0
      let currentConcurrent = 0

      const items = Array.from({ length: 5 }, (_, i) => i)
      const enrichFn = async (item: number) => {
        currentConcurrent++
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
        await new Promise((resolve) => setTimeout(resolve, 5))
        currentConcurrent--
        return item * 2
      }

      await enrichBatch(items, enrichFn, { concurrency: 1 })

      expect(maxConcurrent).toBe(1)
    })

    it('should handle concurrency greater than items count', async () => {
      let maxConcurrent = 0
      let currentConcurrent = 0

      const items = [1, 2, 3]
      const enrichFn = async (item: number) => {
        currentConcurrent++
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
        await new Promise((resolve) => setTimeout(resolve, 10))
        currentConcurrent--
        return item * 2
      }

      await enrichBatch(items, enrichFn, { concurrency: 100 })

      // Max concurrent should be limited to actual items count
      expect(maxConcurrent).toBeLessThanOrEqual(3)
    })
  })

  describe('Progress Callback', () => {
    it('should call onProgress after each item completes', async () => {
      const progressCalls: EnrichProgress<number, number>[] = []
      const items = [1, 2, 3]

      await enrichBatch(items, async (item) => item * 2, {
        onProgress: (progress) => progressCalls.push(progress),
      })

      expect(progressCalls.length).toBe(3)
    })

    it('should include correct progress information', async () => {
      const progressCalls: EnrichProgress<string, string>[] = []
      const items = ['a', 'b']

      await enrichBatch(items, async (item) => item.toUpperCase(), {
        concurrency: 1, // Process sequentially for predictable order
        onProgress: (progress) => progressCalls.push(progress),
      })

      expect(progressCalls[0]).toMatchObject({
        index: 0,
        total: 2,
        item: 'a',
        result: 'A',
        success: true,
      })
      expect(progressCalls[1]).toMatchObject({
        index: 1,
        total: 2,
        item: 'b',
        result: 'B',
        success: true,
      })
    })

    it('should include error in progress callback on failure', async () => {
      const progressCalls: EnrichProgress<number, number>[] = []
      const items = [1, 2, 3]

      await enrichBatch(
        items,
        async (item) => {
          if (item === 2) throw new Error('Failed on 2')
          return item * 2
        },
        {
          concurrency: 1,
          onProgress: (progress) => progressCalls.push(progress),
        }
      )

      const failedProgress = progressCalls.find((p) => p.index === 1)
      expect(failedProgress?.success).toBe(false)
      expect(failedProgress?.error).toBeInstanceOf(Error)
      expect(failedProgress?.error?.message).toBe('Failed on 2')
      expect(failedProgress?.result).toBeUndefined()
    })

    it('should report progress in completion order when concurrent', async () => {
      const progressIndices: number[] = []
      const items = [1, 2, 3, 4]

      // Item at index 0 takes longest, others are fast
      await enrichBatch(
        items,
        async (item) => {
          const delay = item === 1 ? 50 : 5
          await new Promise((resolve) => setTimeout(resolve, delay))
          return item * 2
        },
        {
          concurrency: 4,
          onProgress: (progress) => progressIndices.push(progress.index),
        }
      )

      // Index 0 (item 1) should complete last
      expect(progressIndices.indexOf(0)).toBeGreaterThan(0)
    })
  })

  describe('Error Handling', () => {
    describe('continue mode (default)', () => {
      it('should continue processing on error by default', async () => {
        const items = [1, 2, 3, 4]
        const processedItems: number[] = []

        const results = await enrichBatch(items, async (item) => {
          processedItems.push(item)
          if (item === 2) throw new Error('Failed on 2')
          return item * 2
        })

        // All items should be processed
        expect(processedItems.sort()).toEqual([1, 2, 3, 4])
        expect(results.length).toBe(4)
      })

      it('should mark failed items with success=false', async () => {
        const items = [1, 2, 3]

        const results = await enrichBatch(items, async (item) => {
          if (item === 2) throw new Error('Failed')
          return item * 2
        })

        expect(results[0].success).toBe(true)
        expect(results[1].success).toBe(false)
        expect(results[2].success).toBe(true)
      })

      it('should include error object in failed results', async () => {
        const items = [1, 2]

        const results = await enrichBatch(items, async (item) => {
          if (item === 2) throw new Error('Custom error')
          return item
        })

        expect(results[1].error).toBeInstanceOf(Error)
        expect(results[1].error?.message).toBe('Custom error')
        expect(results[1].result).toBeUndefined()
      })
    })

    describe('fail-fast mode', () => {
      it('should stop processing on first error in fail-fast mode', async () => {
        const items = [1, 2, 3, 4, 5]
        const processedItems: number[] = []

        await expect(
          enrichBatch(
            items,
            async (item) => {
              processedItems.push(item)
              await new Promise((resolve) => setTimeout(resolve, 10))
              if (item === 2) throw new Error('Failed on 2')
              return item * 2
            },
            { concurrency: 1, errorHandling: 'fail-fast' }
          )
        ).rejects.toThrow('Failed on 2')

        // Should stop after the error (item 2)
        expect(processedItems).toEqual([1, 2])
      })

      it('should reject with the first error encountered', async () => {
        const items = [1, 2, 3]

        await expect(
          enrichBatch(
            items,
            async (item) => {
              if (item >= 2) throw new Error(`Error on ${item}`)
              return item
            },
            { errorHandling: 'fail-fast' }
          )
        ).rejects.toThrow(/Error on [23]/)
      })
    })
  })

  describe('Return Order', () => {
    it('should return results in original item order regardless of completion order', async () => {
      const items = [100, 50, 10, 200] // Different delays

      const results = await enrichBatch(
        items,
        async (item) => {
          // Items with smaller values complete faster
          await new Promise((resolve) => setTimeout(resolve, item / 10))
          return item * 2
        },
        { concurrency: 4 }
      )

      // Results should be in original order
      expect(results.map((r) => r.item)).toEqual([100, 50, 10, 200])
      expect(results.map((r) => r.result)).toEqual([200, 100, 20, 400])
    })

    it('should preserve order even with mixed success/failure', async () => {
      const items = ['a', 'b', 'c', 'd']

      const results = await enrichBatch(
        items,
        async (item) => {
          if (item === 'b') throw new Error('Failed')
          return item.toUpperCase()
        },
        { concurrency: 2 }
      )

      expect(results.map((r) => r.item)).toEqual(['a', 'b', 'c', 'd'])
      expect(results.map((r) => r.success)).toEqual([true, false, true, true])
    })

    it('should return results for all items in order with concurrent processing', async () => {
      const items = Array.from({ length: 100 }, (_, i) => i)

      const results = await enrichBatch(
        items,
        async (item) => {
          // Random delay to simulate unpredictable completion
          await new Promise((resolve) =>
            setTimeout(resolve, Math.random() * 10)
          )
          return item * 2
        },
        { concurrency: 20 }
      )

      // Verify order is preserved
      for (let i = 0; i < 100; i++) {
        expect(results[i].item).toBe(i)
        expect(results[i].result).toBe(i * 2)
      }
    })
  })

  describe('Edge Cases', () => {
    it('should handle async enrichFn that returns immediately', async () => {
      const items = [1, 2, 3]

      const results = await enrichBatch(items, async (item) => item * 2)

      expect(results.map((r) => r.result)).toEqual([2, 4, 6])
    })

    it('should handle enrichFn that returns undefined', async () => {
      const items = [1, 2]

      const results = await enrichBatch(items, async () => undefined)

      expect(results[0].result).toBeUndefined()
      expect(results[0].success).toBe(true)
    })

    it('should handle enrichFn that returns null', async () => {
      const items = [1, 2]

      const results = await enrichBatch(items, async () => null)

      expect(results[0].result).toBeNull()
      expect(results[0].success).toBe(true)
    })

    it('should work with complex object items', async () => {
      interface User {
        id: number
        name: string
      }
      interface EnrichedUser extends User {
        email: string
      }

      const users: User[] = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]

      const results = await enrichBatch(users, async (user): Promise<EnrichedUser> => ({
        ...user,
        email: `${user.name.toLowerCase()}@example.com`,
      }))

      expect(results[0].result).toEqual({
        id: 1,
        name: 'Alice',
        email: 'alice@example.com',
      })
    })

    it('should handle very large batches', async () => {
      const items = Array.from({ length: 1000 }, (_, i) => i)

      const results = await enrichBatch(
        items,
        async (item) => item * 2,
        { concurrency: 50 }
      )

      expect(results.length).toBe(1000)
      expect(results.every((r) => r.success)).toBe(true)
    })
  })
})
