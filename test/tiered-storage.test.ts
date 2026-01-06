/**
 * @dotdo/do - Tiered Storage Tests (RED Phase)
 *
 * Tests for tiered storage with gitx patterns:
 * - LRUCache: In-memory hot objects with TTL and eviction
 * - ObjectIndex: Track locations across tiers (hot, r2, parquet)
 *
 * These tests define the expected behavior and should FAIL initially (RED),
 * then pass after implementation (GREEN).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { LRUCache, ObjectIndex } from '../src/storage'
import type { ObjectLocation, CacheStats, TierStats } from '../src/storage'

// ============================================================================
// LRUCache Tests
// ============================================================================

describe('LRUCache', () => {
  let cache: LRUCache<string, unknown>

  beforeEach(() => {
    vi.useFakeTimers()
    cache = new LRUCache({
      maxCount: 100,
      maxBytes: 1024 * 1024, // 1MB
      defaultTTL: 60000, // 1 minute
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('basic operations', () => {
    it('should store and retrieve a value', () => {
      cache.set('key1', { data: 'value1' })
      const result = cache.get('key1')
      expect(result).toEqual({ data: 'value1' })
    })

    it('should return undefined for missing keys', () => {
      const result = cache.get('nonexistent')
      expect(result).toBeUndefined()
    })

    it('should overwrite existing values', () => {
      cache.set('key1', { data: 'value1' })
      cache.set('key1', { data: 'value2' })
      const result = cache.get('key1')
      expect(result).toEqual({ data: 'value2' })
    })

    it('should delete a value', () => {
      cache.set('key1', { data: 'value1' })
      const deleted = cache.delete('key1')
      expect(deleted).toBe(true)
      expect(cache.get('key1')).toBeUndefined()
    })

    it('should return false when deleting nonexistent key', () => {
      const deleted = cache.delete('nonexistent')
      expect(deleted).toBe(false)
    })

    it('should clear all entries', () => {
      cache.set('key1', { data: 'value1' })
      cache.set('key2', { data: 'value2' })
      cache.clear()
      expect(cache.get('key1')).toBeUndefined()
      expect(cache.get('key2')).toBeUndefined()
    })

    it('should check if key exists', () => {
      cache.set('key1', { data: 'value1' })
      expect(cache.has('key1')).toBe(true)
      expect(cache.has('nonexistent')).toBe(false)
    })
  })

  describe('LRU eviction', () => {
    it('should evict least recently used item when maxCount exceeded', () => {
      const smallCache = new LRUCache<string, string>({ maxCount: 3 })

      smallCache.set('a', 'value-a')
      smallCache.set('b', 'value-b')
      smallCache.set('c', 'value-c')
      smallCache.set('d', 'value-d') // Should evict 'a'

      expect(smallCache.get('a')).toBeUndefined()
      expect(smallCache.get('b')).toBe('value-b')
      expect(smallCache.get('c')).toBe('value-c')
      expect(smallCache.get('d')).toBe('value-d')
    })

    it('should update access order on get', () => {
      const smallCache = new LRUCache<string, string>({ maxCount: 3 })

      smallCache.set('a', 'value-a')
      smallCache.set('b', 'value-b')
      smallCache.set('c', 'value-c')

      // Access 'a' to make it most recently used
      smallCache.get('a')

      smallCache.set('d', 'value-d') // Should evict 'b' (now LRU)

      expect(smallCache.get('a')).toBe('value-a')
      expect(smallCache.get('b')).toBeUndefined()
      expect(smallCache.get('c')).toBe('value-c')
      expect(smallCache.get('d')).toBe('value-d')
    })

    it('should call onEvict callback when item evicted', () => {
      const onEvict = vi.fn()
      const smallCache = new LRUCache<string, string>({
        maxCount: 2,
        onEvict,
      })

      smallCache.set('a', 'value-a')
      smallCache.set('b', 'value-b')
      smallCache.set('c', 'value-c') // Should evict 'a'

      expect(onEvict).toHaveBeenCalledWith('a', 'value-a', 'capacity')
    })
  })

  describe('size-based eviction', () => {
    it('should evict when maxBytes exceeded', () => {
      const onEvict = vi.fn()
      const smallCache = new LRUCache<string, string>({
        maxBytes: 100,
        onEvict,
      })

      // Each string is roughly its byte length
      smallCache.set('a', 'x'.repeat(40))
      smallCache.set('b', 'y'.repeat(40))
      smallCache.set('c', 'z'.repeat(40)) // Should evict 'a' to make room

      expect(onEvict).toHaveBeenCalled()
    })
  })

  describe('TTL expiration', () => {
    it('should expire items after TTL', () => {
      cache.set('key1', { data: 'value1' }, { ttl: 1000 }) // 1 second TTL

      expect(cache.get('key1')).toEqual({ data: 'value1' })

      // Advance time past TTL
      vi.advanceTimersByTime(1500)

      expect(cache.get('key1')).toBeUndefined()
    })

    it('should use default TTL when not specified', () => {
      const cacheWithTTL = new LRUCache<string, string>({ defaultTTL: 1000 })
      cacheWithTTL.set('key1', 'value1')

      expect(cacheWithTTL.get('key1')).toBe('value1')

      vi.advanceTimersByTime(1500)

      expect(cacheWithTTL.get('key1')).toBeUndefined()
    })

    it('should call onEvict with TTL reason when item expires', () => {
      const onEvict = vi.fn()
      const cacheWithCallback = new LRUCache<string, string>({
        defaultTTL: 1000,
        onEvict,
      })

      cacheWithCallback.set('key1', 'value1')

      vi.advanceTimersByTime(1500)

      // Access to trigger cleanup
      cacheWithCallback.get('key1')

      expect(onEvict).toHaveBeenCalledWith('key1', 'value1', 'ttl')
    })

    it('should allow items without TTL when defaultTTL is 0', () => {
      const cacheNoTTL = new LRUCache<string, string>({ defaultTTL: 0 })
      cacheNoTTL.set('key1', 'value1')

      vi.advanceTimersByTime(100000)

      expect(cacheNoTTL.get('key1')).toBe('value1')
    })
  })

  describe('statistics', () => {
    it('should track cache statistics', () => {
      cache.set('key1', { data: 'value1' })
      cache.set('key2', { data: 'value2' })
      cache.get('key1') // Hit
      cache.get('nonexistent') // Miss

      const stats = cache.getStats()

      expect(stats.count).toBe(2)
      expect(stats.hits).toBe(1)
      expect(stats.misses).toBe(1)
      expect(stats.hitRate).toBeCloseTo(0.5)
      expect(stats.bytes).toBeGreaterThan(0)
    })

    it('should track eviction count', () => {
      const smallCache = new LRUCache<string, string>({ maxCount: 2 })

      smallCache.set('a', 'value-a')
      smallCache.set('b', 'value-b')
      smallCache.set('c', 'value-c') // Evicts 'a'
      smallCache.set('d', 'value-d') // Evicts 'b'

      const stats = smallCache.getStats()
      expect(stats.evictions).toBe(2)
    })
  })

  describe('iteration', () => {
    it('should iterate over entries', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')

      const entries: [string, unknown][] = []
      for (const [key, value] of cache.entries()) {
        entries.push([key, value])
      }

      expect(entries).toHaveLength(2)
      expect(entries).toContainEqual(['key1', 'value1'])
      expect(entries).toContainEqual(['key2', 'value2'])
    })

    it('should iterate over keys', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')

      const keys = Array.from(cache.keys())
      expect(keys).toContain('key1')
      expect(keys).toContain('key2')
    })

    it('should iterate over values', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')

      const values = Array.from(cache.values())
      expect(values).toContain('value1')
      expect(values).toContain('value2')
    })
  })
})

// ============================================================================
// ObjectIndex Tests
// ============================================================================

describe('ObjectIndex', () => {
  let index: ObjectIndex

  beforeEach(() => {
    index = new ObjectIndex()
  })

  describe('location recording', () => {
    it('should record object location', async () => {
      const location: ObjectLocation = {
        id: 'obj-123',
        tier: 'hot',
        createdAt: new Date(),
        accessedAt: new Date(),
        size: 1024,
      }

      await index.recordLocation(location)
      const result = await index.lookupLocation('obj-123')

      expect(result).toEqual(location)
    })

    it('should return null for nonexistent object', async () => {
      const result = await index.lookupLocation('nonexistent')
      expect(result).toBeNull()
    })

    it('should update existing location', async () => {
      const location1: ObjectLocation = {
        id: 'obj-123',
        tier: 'hot',
        createdAt: new Date(),
        accessedAt: new Date(),
        size: 1024,
      }

      const location2: ObjectLocation = {
        id: 'obj-123',
        tier: 'r2',
        createdAt: location1.createdAt,
        accessedAt: new Date(),
        size: 1024,
        packId: 'pack-001',
        offset: 0,
      }

      await index.recordLocation(location1)
      await index.recordLocation(location2)

      const result = await index.lookupLocation('obj-123')
      expect(result?.tier).toBe('r2')
      expect(result?.packId).toBe('pack-001')
    })
  })

  describe('batch operations', () => {
    it('should lookup multiple locations', async () => {
      const locations: ObjectLocation[] = [
        { id: 'obj-1', tier: 'hot', createdAt: new Date(), accessedAt: new Date(), size: 100 },
        { id: 'obj-2', tier: 'r2', createdAt: new Date(), accessedAt: new Date(), size: 200, packId: 'pack-001', offset: 0 },
        { id: 'obj-3', tier: 'parquet', createdAt: new Date(), accessedAt: new Date(), size: 300, packId: 'parquet-001', offset: 0 },
      ]

      for (const loc of locations) {
        await index.recordLocation(loc)
      }

      const results = await index.batchLookup(['obj-1', 'obj-2', 'obj-3', 'nonexistent'])

      expect(results.size).toBe(3)
      expect(results.get('obj-1')?.tier).toBe('hot')
      expect(results.get('obj-2')?.tier).toBe('r2')
      expect(results.get('obj-3')?.tier).toBe('parquet')
      expect(results.has('nonexistent')).toBe(false)
    })
  })

  // ==========================================================================
  // ObjectIndex Batch Lookup Tests (RED Phase - workers-ydu)
  // ==========================================================================

  describe('batch lookup advanced functionality', () => {
    beforeEach(async () => {
      // Seed index with test data across all tiers
      const testLocations: ObjectLocation[] = [
        // Hot tier objects
        { id: 'hot-1', tier: 'hot', createdAt: new Date('2024-01-01'), accessedAt: new Date('2024-06-01'), size: 100 },
        { id: 'hot-2', tier: 'hot', createdAt: new Date('2024-01-02'), accessedAt: new Date('2024-06-02'), size: 200 },
        { id: 'hot-3', tier: 'hot', createdAt: new Date('2024-01-03'), accessedAt: new Date('2024-06-03'), size: 300 },
        // R2 tier objects
        { id: 'r2-1', tier: 'r2', createdAt: new Date('2024-01-01'), accessedAt: new Date('2024-05-01'), size: 1000, packId: 'pack-001', offset: 0 },
        { id: 'r2-2', tier: 'r2', createdAt: new Date('2024-01-02'), accessedAt: new Date('2024-05-02'), size: 2000, packId: 'pack-001', offset: 1000 },
        { id: 'r2-3', tier: 'r2', createdAt: new Date('2024-01-03'), accessedAt: new Date('2024-05-03'), size: 3000, packId: 'pack-002', offset: 0 },
        // Parquet tier objects
        { id: 'parquet-1', tier: 'parquet', createdAt: new Date('2023-01-01'), accessedAt: new Date('2024-01-01'), size: 10000, packId: 'parquet-2023-Q1', offset: 0 },
        { id: 'parquet-2', tier: 'parquet', createdAt: new Date('2023-02-01'), accessedAt: new Date('2024-02-01'), size: 20000, packId: 'parquet-2023-Q1', offset: 10000 },
      ]

      for (const loc of testLocations) {
        await index.recordLocation(loc)
      }
    })

    describe('batch lookup with access time updates', () => {
      it('should update access time for all looked up objects when requested', async () => {
        vi.useFakeTimers()
        const lookupTime = new Date('2024-07-01')
        vi.setSystemTime(lookupTime)

        const results = await index.batchLookup(['hot-1', 'hot-2', 'r2-1'], {
          updateAccessTime: true,
        })

        expect(results.size).toBe(3)

        // Verify access times were updated
        const hot1 = await index.lookupLocation('hot-1')
        const hot2 = await index.lookupLocation('hot-2')
        const r21 = await index.lookupLocation('r2-1')

        expect(hot1?.accessedAt.getTime()).toBe(lookupTime.getTime())
        expect(hot2?.accessedAt.getTime()).toBe(lookupTime.getTime())
        expect(r21?.accessedAt.getTime()).toBe(lookupTime.getTime())

        vi.useRealTimers()
      })

      it('should NOT update access time when not requested', async () => {
        const originalAccessTime = new Date('2024-06-01')

        const results = await index.batchLookup(['hot-1'], {
          updateAccessTime: false,
        })

        expect(results.size).toBe(1)

        const hot1 = await index.lookupLocation('hot-1')
        expect(hot1?.accessedAt.getTime()).toBe(originalAccessTime.getTime())
      })

      it('should default to NOT updating access time', async () => {
        const originalAccessTime = new Date('2024-06-02')

        await index.batchLookup(['hot-2'])

        const hot2 = await index.lookupLocation('hot-2')
        expect(hot2?.accessedAt.getTime()).toBe(originalAccessTime.getTime())
      })
    })

    describe('batch lookup with tier filtering', () => {
      it('should filter batch results by single tier', async () => {
        const results = await index.batchLookup(
          ['hot-1', 'hot-2', 'r2-1', 'parquet-1'],
          { tiers: ['hot'] }
        )

        expect(results.size).toBe(2)
        expect(results.has('hot-1')).toBe(true)
        expect(results.has('hot-2')).toBe(true)
        expect(results.has('r2-1')).toBe(false)
        expect(results.has('parquet-1')).toBe(false)
      })

      it('should filter batch results by multiple tiers', async () => {
        const results = await index.batchLookup(
          ['hot-1', 'r2-1', 'r2-2', 'parquet-1', 'parquet-2'],
          { tiers: ['r2', 'parquet'] }
        )

        expect(results.size).toBe(4)
        expect(results.has('hot-1')).toBe(false)
        expect(results.has('r2-1')).toBe(true)
        expect(results.has('r2-2')).toBe(true)
        expect(results.has('parquet-1')).toBe(true)
        expect(results.has('parquet-2')).toBe(true)
      })

      it('should return empty map when tier filter matches no objects', async () => {
        const results = await index.batchLookup(
          ['hot-1', 'hot-2'],
          { tiers: ['parquet'] }
        )

        expect(results.size).toBe(0)
      })
    })

    describe('batch lookup result grouping', () => {
      it('should group results by tier when requested', async () => {
        const results = await index.batchLookupGrouped(['hot-1', 'hot-2', 'r2-1', 'parquet-1'])

        expect(results.hot.size).toBe(2)
        expect(results.hot.has('hot-1')).toBe(true)
        expect(results.hot.has('hot-2')).toBe(true)

        expect(results.r2.size).toBe(1)
        expect(results.r2.has('r2-1')).toBe(true)

        expect(results.parquet.size).toBe(1)
        expect(results.parquet.has('parquet-1')).toBe(true)
      })

      it('should return empty maps for tiers with no matches', async () => {
        const results = await index.batchLookupGrouped(['hot-1', 'hot-2'])

        expect(results.hot.size).toBe(2)
        expect(results.r2.size).toBe(0)
        expect(results.parquet.size).toBe(0)
      })

      it('should include found and missing IDs in grouped result', async () => {
        const results = await index.batchLookupGrouped(['hot-1', 'nonexistent-1', 'r2-1', 'nonexistent-2'])

        expect(results.hot.size).toBe(1)
        expect(results.r2.size).toBe(1)
        expect(results.missing).toHaveLength(2)
        expect(results.missing).toContain('nonexistent-1')
        expect(results.missing).toContain('nonexistent-2')
      })
    })

    describe('batch lookup with pack optimization', () => {
      it('should return objects sorted by pack for efficient sequential access', async () => {
        const results = await index.batchLookup(
          ['r2-1', 'r2-3', 'r2-2'],
          { sortByPack: true }
        )

        const locations = Array.from(results.values())

        // Objects from the same pack should be adjacent and sorted by offset
        const pack001Objects = locations.filter(l => l.packId === 'pack-001')
        expect(pack001Objects).toHaveLength(2)
        expect(pack001Objects[0].offset).toBeLessThan(pack001Objects[1].offset!)
      })

      it('should return objects grouped by pack file', async () => {
        const grouped = await index.batchLookupByPack(['r2-1', 'r2-2', 'r2-3', 'parquet-1', 'parquet-2'])

        expect(grouped.has('pack-001')).toBe(true)
        expect(grouped.has('pack-002')).toBe(true)
        expect(grouped.has('parquet-2023-Q1')).toBe(true)

        expect(grouped.get('pack-001')?.length).toBe(2)
        expect(grouped.get('pack-002')?.length).toBe(1)
        expect(grouped.get('parquet-2023-Q1')?.length).toBe(2)
      })

      it('should include hot tier objects in a null pack group', async () => {
        const grouped = await index.batchLookupByPack(['hot-1', 'r2-1', 'parquet-1'])

        expect(grouped.has(null)).toBe(true) // Hot tier has no pack
        expect(grouped.get(null)?.length).toBe(1)
        expect(grouped.get(null)?.[0].id).toBe('hot-1')
      })
    })

    describe('batch lookup statistics', () => {
      it('should return lookup statistics with results', async () => {
        const { results, stats } = await index.batchLookupWithStats(
          ['hot-1', 'hot-2', 'r2-1', 'nonexistent-1', 'nonexistent-2']
        )

        expect(results.size).toBe(3)
        expect(stats.requested).toBe(5)
        expect(stats.found).toBe(3)
        expect(stats.missing).toBe(2)
        expect(stats.hitRate).toBeCloseTo(0.6)
      })

      it('should track statistics by tier', async () => {
        const { stats } = await index.batchLookupWithStats(
          ['hot-1', 'hot-2', 'hot-3', 'r2-1', 'parquet-1']
        )

        expect(stats.byTier.hot).toBe(3)
        expect(stats.byTier.r2).toBe(1)
        expect(stats.byTier.parquet).toBe(1)
      })

      it('should measure lookup latency', async () => {
        const { stats } = await index.batchLookupWithStats(['hot-1', 'hot-2'])

        expect(stats.latencyMs).toBeGreaterThanOrEqual(0)
        expect(typeof stats.latencyMs).toBe('number')
      })
    })

    describe('batch lookup chunked processing', () => {
      it('should process large batches in chunks', async () => {
        // Add many more objects
        for (let i = 0; i < 1000; i++) {
          await index.recordLocation({
            id: `large-batch-${i}`,
            tier: 'hot',
            createdAt: new Date(),
            accessedAt: new Date(),
            size: 100,
          })
        }

        const ids = Array.from({ length: 1000 }, (_, i) => `large-batch-${i}`)
        const results = await index.batchLookup(ids, { chunkSize: 100 })

        expect(results.size).toBe(1000)
      })

      it('should emit progress events for chunked batch lookups', async () => {
        // Add objects for batch
        for (let i = 0; i < 100; i++) {
          await index.recordLocation({
            id: `progress-test-${i}`,
            tier: 'hot',
            createdAt: new Date(),
            accessedAt: new Date(),
            size: 100,
          })
        }

        const ids = Array.from({ length: 100 }, (_, i) => `progress-test-${i}`)
        const progressEvents: { processed: number; total: number }[] = []

        await index.batchLookup(ids, {
          chunkSize: 25,
          onProgress: (processed, total) => {
            progressEvents.push({ processed, total })
          },
        })

        expect(progressEvents.length).toBe(4) // 100 / 25 = 4 chunks
        expect(progressEvents[0]).toEqual({ processed: 25, total: 100 })
        expect(progressEvents[3]).toEqual({ processed: 100, total: 100 })
      })

      it('should support async iteration over batch results', async () => {
        for (let i = 0; i < 50; i++) {
          await index.recordLocation({
            id: `async-iter-${i}`,
            tier: 'hot',
            createdAt: new Date(),
            accessedAt: new Date(),
            size: 100,
          })
        }

        const ids = Array.from({ length: 50 }, (_, i) => `async-iter-${i}`)
        let count = 0

        for await (const batch of index.batchLookupIterator(ids, { chunkSize: 10 })) {
          expect(batch.size).toBeLessThanOrEqual(10)
          count += batch.size
        }

        expect(count).toBe(50)
      })
    })

    describe('batch lookup with metadata options', () => {
      beforeEach(async () => {
        // Add objects with metadata
        await index.recordLocation({
          id: 'meta-obj-1',
          tier: 'r2',
          createdAt: new Date(),
          accessedAt: new Date(),
          size: 1024,
          packId: 'meta-pack',
          offset: 0,
          metadata: {
            compression: 'zstd',
            contentType: 'application/json',
            checksum: 'abc123',
          },
        })

        await index.recordLocation({
          id: 'meta-obj-2',
          tier: 'parquet',
          createdAt: new Date(),
          accessedAt: new Date(),
          size: 2048,
          packId: 'parquet-meta',
          offset: 0,
          metadata: {
            rowGroup: 0,
            columnChunk: 'data',
            encoding: 'PLAIN',
          },
        })
      })

      it('should include metadata by default', async () => {
        const results = await index.batchLookup(['meta-obj-1', 'meta-obj-2'])

        const obj1 = results.get('meta-obj-1')
        expect(obj1?.metadata).toBeDefined()
        expect(obj1?.metadata?.compression).toBe('zstd')
      })

      it('should exclude metadata when requested for lighter response', async () => {
        const results = await index.batchLookup(['meta-obj-1', 'meta-obj-2'], {
          includeMetadata: false,
        })

        const obj1 = results.get('meta-obj-1')
        expect(obj1?.metadata).toBeUndefined()
      })

      it('should filter by metadata criteria', async () => {
        const results = await index.batchLookup(['meta-obj-1', 'meta-obj-2'], {
          metadataFilter: { compression: 'zstd' },
        })

        expect(results.size).toBe(1)
        expect(results.has('meta-obj-1')).toBe(true)
        expect(results.has('meta-obj-2')).toBe(false)
      })
    })

    describe('batch lookup error handling', () => {
      it('should handle empty ID array', async () => {
        const results = await index.batchLookup([])
        expect(results.size).toBe(0)
      })

      it('should handle duplicate IDs in request', async () => {
        const results = await index.batchLookup(['hot-1', 'hot-1', 'hot-1'])

        expect(results.size).toBe(1)
        expect(results.has('hot-1')).toBe(true)
      })

      it('should validate ID format and reject invalid IDs', async () => {
        await expect(
          index.batchLookup(['hot-1', '', null as any, undefined as any])
        ).rejects.toThrow('Invalid ID')
      })

      it('should support partial failure mode', async () => {
        // Create an index with a simulated failure condition
        const { results, errors } = await index.batchLookupPartial(
          ['hot-1', 'hot-2', 'invalid-trigger'],
          { continueOnError: true }
        )

        expect(results.size).toBeGreaterThan(0)
        expect(errors.length).toBeGreaterThan(0)
      })
    })

    describe('batch lookup concurrency', () => {
      it('should support concurrent batch lookups without interference', async () => {
        // Launch multiple concurrent batch lookups
        const batch1Promise = index.batchLookup(['hot-1', 'hot-2'])
        const batch2Promise = index.batchLookup(['r2-1', 'r2-2'])
        const batch3Promise = index.batchLookup(['parquet-1', 'parquet-2'])

        const [batch1, batch2, batch3] = await Promise.all([
          batch1Promise,
          batch2Promise,
          batch3Promise,
        ])

        expect(batch1.size).toBe(2)
        expect(batch2.size).toBe(2)
        expect(batch3.size).toBe(2)

        expect(batch1.has('hot-1')).toBe(true)
        expect(batch2.has('r2-1')).toBe(true)
        expect(batch3.has('parquet-1')).toBe(true)
      })

      it('should handle concurrent lookups with access time updates atomically', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2024-07-01'))

        // Multiple concurrent lookups with access time updates
        await Promise.all([
          index.batchLookup(['hot-1'], { updateAccessTime: true }),
          index.batchLookup(['hot-1'], { updateAccessTime: true }),
          index.batchLookup(['hot-1'], { updateAccessTime: true }),
        ])

        const hot1 = await index.lookupLocation('hot-1')
        expect(hot1?.accessedAt.getTime()).toBe(new Date('2024-07-01').getTime())

        vi.useRealTimers()
      })
    })

    describe('batch lookup caching integration', () => {
      it('should support warm cache hint for batch lookup results', async () => {
        // Perform batch lookup with cache warming
        await index.batchLookup(['parquet-1', 'parquet-2'], {
          warmCache: true,
          cacheTTL: 60000, // 1 minute
        })

        // Subsequent lookup should indicate cache hit
        const { stats } = await index.batchLookupWithStats(['parquet-1', 'parquet-2'])
        expect(stats.cacheHits).toBe(2)
      })

      it('should respect cache priority hints', async () => {
        const results = await index.batchLookup(['hot-1', 'parquet-1'], {
          cachePriority: 'high',
        })

        expect(results.size).toBe(2)
        // Cache priority should be reflected in internal state
        // (Implementation would track this for LRU eviction decisions)
      })
    })
  })

  describe('tier tracking', () => {
    it('should get stats by tier', async () => {
      const locations: ObjectLocation[] = [
        { id: 'obj-1', tier: 'hot', createdAt: new Date(), accessedAt: new Date(), size: 100 },
        { id: 'obj-2', tier: 'hot', createdAt: new Date(), accessedAt: new Date(), size: 200 },
        { id: 'obj-3', tier: 'r2', createdAt: new Date(), accessedAt: new Date(), size: 1000, packId: 'pack-001', offset: 0 },
        { id: 'obj-4', tier: 'parquet', createdAt: new Date(), accessedAt: new Date(), size: 5000, packId: 'parquet-001', offset: 0 },
      ]

      for (const loc of locations) {
        await index.recordLocation(loc)
      }

      const stats = await index.getStatsByTier()

      expect(stats.hot.count).toBe(2)
      expect(stats.hot.totalBytes).toBe(300)
      expect(stats.r2.count).toBe(1)
      expect(stats.r2.totalBytes).toBe(1000)
      expect(stats.parquet.count).toBe(1)
      expect(stats.parquet.totalBytes).toBe(5000)
    })
  })

  describe('tier-specific queries', () => {
    it('should list objects in a tier', async () => {
      const locations: ObjectLocation[] = [
        { id: 'obj-1', tier: 'hot', createdAt: new Date(), accessedAt: new Date(), size: 100 },
        { id: 'obj-2', tier: 'hot', createdAt: new Date(), accessedAt: new Date(), size: 200 },
        { id: 'obj-3', tier: 'r2', createdAt: new Date(), accessedAt: new Date(), size: 1000, packId: 'pack-001', offset: 0 },
      ]

      for (const loc of locations) {
        await index.recordLocation(loc)
      }

      const hotObjects = await index.listByTier('hot')
      const r2Objects = await index.listByTier('r2')

      expect(hotObjects).toHaveLength(2)
      expect(r2Objects).toHaveLength(1)
      expect(hotObjects.map((o) => o.id)).toContain('obj-1')
      expect(hotObjects.map((o) => o.id)).toContain('obj-2')
    })

    it('should support pagination for tier listing', async () => {
      const locations: ObjectLocation[] = Array.from({ length: 10 }, (_, i) => ({
        id: `obj-${i}`,
        tier: 'hot' as const,
        createdAt: new Date(),
        accessedAt: new Date(),
        size: 100,
      }))

      for (const loc of locations) {
        await index.recordLocation(loc)
      }

      const page1 = await index.listByTier('hot', { limit: 5 })
      const page2 = await index.listByTier('hot', { limit: 5, offset: 5 })

      expect(page1).toHaveLength(5)
      expect(page2).toHaveLength(5)
    })
  })

  describe('deletion', () => {
    it('should delete object location', async () => {
      const location: ObjectLocation = {
        id: 'obj-123',
        tier: 'hot',
        createdAt: new Date(),
        accessedAt: new Date(),
        size: 1024,
      }

      await index.recordLocation(location)
      await index.deleteLocation('obj-123')

      const result = await index.lookupLocation('obj-123')
      expect(result).toBeNull()
    })

    it('should handle deleting nonexistent location', async () => {
      // Should not throw
      await expect(index.deleteLocation('nonexistent')).resolves.not.toThrow()
    })
  })

  describe('access time tracking', () => {
    it('should update access time on lookup', async () => {
      const originalTime = new Date('2024-01-01')
      const location: ObjectLocation = {
        id: 'obj-123',
        tier: 'hot',
        createdAt: originalTime,
        accessedAt: originalTime,
        size: 1024,
      }

      await index.recordLocation(location)

      // Wait a bit and lookup
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-02'))

      await index.lookupLocation('obj-123', { updateAccessTime: true })

      const result = await index.lookupLocation('obj-123')
      expect(result?.accessedAt.getTime()).toBeGreaterThan(originalTime.getTime())

      vi.useRealTimers()
    })
  })
})

// ============================================================================
// ObjectIndex Tier Tracking Tests (RED Phase - workers-xr4)
// ============================================================================

describe('ObjectIndex Tier Tracking', () => {
  let index: ObjectIndex

  beforeEach(() => {
    index = new ObjectIndex()
  })

  describe('tier types and validation', () => {
    it('should only accept valid tier types: hot, r2, parquet', async () => {
      // hot tier - no packId needed
      await expect(index.recordLocation({
        id: 'obj-hot',
        tier: 'hot',
        createdAt: new Date(),
        accessedAt: new Date(),
        size: 1024,
      })).resolves.not.toThrow()

      // r2 tier - packId required
      await expect(index.recordLocation({
        id: 'obj-r2',
        tier: 'r2',
        createdAt: new Date(),
        accessedAt: new Date(),
        size: 1024,
        packId: 'pack-001',
        offset: 0,
      })).resolves.not.toThrow()

      // parquet tier - packId and offset required
      await expect(index.recordLocation({
        id: 'obj-parquet',
        tier: 'parquet',
        createdAt: new Date(),
        accessedAt: new Date(),
        size: 1024,
        packId: 'parquet-001',
        offset: 0,
      })).resolves.not.toThrow()
    })

    it('should reject invalid tier types', async () => {
      const invalidLocation = {
        id: 'obj-invalid',
        tier: 'invalid' as any,
        createdAt: new Date(),
        accessedAt: new Date(),
        size: 1024,
      }

      await expect(index.recordLocation(invalidLocation)).rejects.toThrow('Invalid tier')
    })

    it('should require packId for r2 tier', async () => {
      const r2LocationWithoutPack: ObjectLocation = {
        id: 'obj-r2-no-pack',
        tier: 'r2',
        createdAt: new Date(),
        accessedAt: new Date(),
        size: 1024,
        // missing packId
      }

      await expect(index.recordLocation(r2LocationWithoutPack)).rejects.toThrow(
        'packId required for r2 tier'
      )
    })

    it('should require packId and offset for parquet tier', async () => {
      const parquetLocationMissingFields: ObjectLocation = {
        id: 'obj-parquet-incomplete',
        tier: 'parquet',
        createdAt: new Date(),
        accessedAt: new Date(),
        size: 1024,
        // missing packId and offset
      }

      await expect(index.recordLocation(parquetLocationMissingFields)).rejects.toThrow(
        'packId and offset required for parquet tier'
      )
    })
  })

  describe('tier transitions', () => {
    it('should track tier transition from hot to r2', async () => {
      const hotLocation: ObjectLocation = {
        id: 'obj-transition',
        tier: 'hot',
        createdAt: new Date(),
        accessedAt: new Date(),
        size: 1024,
      }

      await index.recordLocation(hotLocation)

      const r2Location: ObjectLocation = {
        ...hotLocation,
        tier: 'r2',
        packId: 'pack-001',
        offset: 0,
        accessedAt: new Date(),
      }

      await index.recordLocation(r2Location)

      const history = await index.getTierHistory('obj-transition')
      expect(history).toHaveLength(2)
      expect(history[0].tier).toBe('hot')
      expect(history[1].tier).toBe('r2')
    })

    it('should track tier transition from r2 to parquet', async () => {
      const r2Location: ObjectLocation = {
        id: 'obj-r2-to-parquet',
        tier: 'r2',
        createdAt: new Date(),
        accessedAt: new Date(),
        size: 1024,
        packId: 'pack-001',
        offset: 0,
      }

      await index.recordLocation(r2Location)

      const parquetLocation: ObjectLocation = {
        ...r2Location,
        tier: 'parquet',
        packId: 'parquet-2024-01',
        offset: 4096,
        accessedAt: new Date(),
      }

      await index.recordLocation(parquetLocation)

      const history = await index.getTierHistory('obj-r2-to-parquet')
      expect(history).toHaveLength(2)
      expect(history[0].tier).toBe('r2')
      expect(history[1].tier).toBe('parquet')
    })

    it('should track full lifecycle: hot -> r2 -> parquet', async () => {
      const id = 'obj-full-lifecycle'
      const createdAt = new Date('2024-01-01')

      // Start in hot tier
      await index.recordLocation({
        id,
        tier: 'hot',
        createdAt,
        accessedAt: new Date('2024-01-01'),
        size: 1024,
      })

      // Move to r2
      await index.recordLocation({
        id,
        tier: 'r2',
        createdAt,
        accessedAt: new Date('2024-01-15'),
        size: 1024,
        packId: 'pack-001',
        offset: 0,
      })

      // Move to parquet
      await index.recordLocation({
        id,
        tier: 'parquet',
        createdAt,
        accessedAt: new Date('2024-02-01'),
        size: 1024,
        packId: 'parquet-2024-01',
        offset: 8192,
      })

      const history = await index.getTierHistory(id)
      expect(history).toHaveLength(3)
      expect(history.map((h) => h.tier)).toEqual(['hot', 'r2', 'parquet'])
    })

    it('should allow promotion from cold tier back to hot', async () => {
      const id = 'obj-promoted'
      const createdAt = new Date()

      // Start in parquet (cold)
      await index.recordLocation({
        id,
        tier: 'parquet',
        createdAt,
        accessedAt: new Date(),
        size: 1024,
        packId: 'parquet-archive',
        offset: 0,
      })

      // Promote back to hot due to frequent access
      await index.recordLocation({
        id,
        tier: 'hot',
        createdAt,
        accessedAt: new Date(),
        size: 1024,
      })

      const current = await index.lookupLocation(id)
      expect(current?.tier).toBe('hot')

      const history = await index.getTierHistory(id)
      expect(history).toHaveLength(2)
      expect(history[1].tier).toBe('hot')
    })
  })

  describe('pack file tracking', () => {
    it('should track objects within the same pack', async () => {
      const packId = 'pack-001'

      const objects: ObjectLocation[] = [
        { id: 'obj-1', tier: 'r2', createdAt: new Date(), accessedAt: new Date(), size: 100, packId, offset: 0 },
        { id: 'obj-2', tier: 'r2', createdAt: new Date(), accessedAt: new Date(), size: 200, packId, offset: 100 },
        { id: 'obj-3', tier: 'r2', createdAt: new Date(), accessedAt: new Date(), size: 300, packId, offset: 300 },
      ]

      for (const obj of objects) {
        await index.recordLocation(obj)
      }

      const packObjects = await index.listByPack(packId)
      expect(packObjects).toHaveLength(3)
      expect(packObjects.map((o) => o.id).sort()).toEqual(['obj-1', 'obj-2', 'obj-3'])
    })

    it('should return pack statistics', async () => {
      const packId = 'pack-stats-test'

      await index.recordLocation({ id: 'obj-1', tier: 'r2', createdAt: new Date(), accessedAt: new Date(), size: 100, packId, offset: 0 })
      await index.recordLocation({ id: 'obj-2', tier: 'r2', createdAt: new Date(), accessedAt: new Date(), size: 200, packId, offset: 100 })
      await index.recordLocation({ id: 'obj-3', tier: 'r2', createdAt: new Date(), accessedAt: new Date(), size: 300, packId, offset: 300 })

      const stats = await index.getPackStats(packId)

      expect(stats.packId).toBe(packId)
      expect(stats.objectCount).toBe(3)
      expect(stats.totalBytes).toBe(600)
      expect(stats.tier).toBe('r2')
    })

    it('should list all packs in a tier', async () => {
      // Add objects to multiple packs
      await index.recordLocation({ id: 'obj-1', tier: 'r2', createdAt: new Date(), accessedAt: new Date(), size: 100, packId: 'pack-001', offset: 0 })
      await index.recordLocation({ id: 'obj-2', tier: 'r2', createdAt: new Date(), accessedAt: new Date(), size: 200, packId: 'pack-002', offset: 0 })
      await index.recordLocation({ id: 'obj-3', tier: 'parquet', createdAt: new Date(), accessedAt: new Date(), size: 300, packId: 'parquet-001', offset: 0 })

      const r2Packs = await index.listPacks('r2')
      const parquetPacks = await index.listPacks('parquet')

      expect(r2Packs).toHaveLength(2)
      expect(r2Packs).toContain('pack-001')
      expect(r2Packs).toContain('pack-002')
      expect(parquetPacks).toHaveLength(1)
      expect(parquetPacks).toContain('parquet-001')
    })

    it('should validate offset does not overlap within a pack', async () => {
      const packId = 'pack-overlap-test'

      await index.recordLocation({
        id: 'obj-1',
        tier: 'r2',
        createdAt: new Date(),
        accessedAt: new Date(),
        size: 100,
        packId,
        offset: 0,
      })

      // Try to add object with overlapping offset
      const overlapping: ObjectLocation = {
        id: 'obj-2',
        tier: 'r2',
        createdAt: new Date(),
        accessedAt: new Date(),
        size: 200,
        packId,
        offset: 50, // Overlaps with obj-1 (0-100)
      }

      await expect(index.recordLocation(overlapping)).rejects.toThrow('Offset overlaps')
    })
  })

  describe('tier-specific queries', () => {
    it('should find objects by tier and size range', async () => {
      await index.recordLocation({ id: 'small', tier: 'hot', createdAt: new Date(), accessedAt: new Date(), size: 100 })
      await index.recordLocation({ id: 'medium', tier: 'hot', createdAt: new Date(), accessedAt: new Date(), size: 5000 })
      await index.recordLocation({ id: 'large', tier: 'hot', createdAt: new Date(), accessedAt: new Date(), size: 50000 })

      const mediumObjects = await index.listByTier('hot', { minSize: 1000, maxSize: 10000 })
      expect(mediumObjects).toHaveLength(1)
      expect(mediumObjects[0].id).toBe('medium')
    })

    it('should find objects by tier and last access time', async () => {
      vi.useFakeTimers()
      const now = new Date('2024-06-01')
      vi.setSystemTime(now)

      await index.recordLocation({ id: 'recent', tier: 'hot', createdAt: new Date('2024-05-15'), accessedAt: new Date('2024-05-30'), size: 100 })
      await index.recordLocation({ id: 'old', tier: 'hot', createdAt: new Date('2024-01-01'), accessedAt: new Date('2024-01-15'), size: 100 })

      const staleObjects = await index.listByTier('hot', { accessedBefore: new Date('2024-05-01') })
      expect(staleObjects).toHaveLength(1)
      expect(staleObjects[0].id).toBe('old')

      vi.useRealTimers()
    })

    it('should list objects eligible for tier migration', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-01'))

      // Recent hot objects (should stay)
      await index.recordLocation({ id: 'hot-recent', tier: 'hot', createdAt: new Date('2024-05-01'), accessedAt: new Date('2024-05-30'), size: 100 })

      // Old hot objects (should migrate to r2)
      await index.recordLocation({ id: 'hot-old', tier: 'hot', createdAt: new Date('2024-01-01'), accessedAt: new Date('2024-02-01'), size: 100 })

      // Old r2 objects (should migrate to parquet)
      await index.recordLocation({ id: 'r2-old', tier: 'r2', createdAt: new Date('2023-01-01'), accessedAt: new Date('2023-06-01'), size: 100, packId: 'pack-old', offset: 0 })

      const hotToR2Candidates = await index.getMigrationCandidates('hot', 'r2', {
        accessedBefore: new Date('2024-03-01'),
      })
      expect(hotToR2Candidates).toHaveLength(1)
      expect(hotToR2Candidates[0].id).toBe('hot-old')

      const r2ToParquetCandidates = await index.getMigrationCandidates('r2', 'parquet', {
        accessedBefore: new Date('2024-01-01'),
      })
      expect(r2ToParquetCandidates).toHaveLength(1)
      expect(r2ToParquetCandidates[0].id).toBe('r2-old')

      vi.useRealTimers()
    })
  })

  describe('tier statistics', () => {
    it('should return detailed tier statistics', async () => {
      // Add various objects across tiers
      await index.recordLocation({ id: 'hot-1', tier: 'hot', createdAt: new Date(), accessedAt: new Date(), size: 100 })
      await index.recordLocation({ id: 'hot-2', tier: 'hot', createdAt: new Date(), accessedAt: new Date(), size: 200 })
      await index.recordLocation({ id: 'r2-1', tier: 'r2', createdAt: new Date(), accessedAt: new Date(), size: 1000, packId: 'pack-1', offset: 0 })
      await index.recordLocation({ id: 'parquet-1', tier: 'parquet', createdAt: new Date(), accessedAt: new Date(), size: 5000, packId: 'parquet-1', offset: 0 })

      const stats = await index.getDetailedStats()

      expect(stats.hot.count).toBe(2)
      expect(stats.hot.totalBytes).toBe(300)
      expect(stats.hot.avgSize).toBe(150)

      expect(stats.r2.count).toBe(1)
      expect(stats.r2.totalBytes).toBe(1000)
      expect(stats.r2.packCount).toBe(1)

      expect(stats.parquet.count).toBe(1)
      expect(stats.parquet.totalBytes).toBe(5000)
      expect(stats.parquet.packCount).toBe(1)

      expect(stats.total.count).toBe(4)
      expect(stats.total.totalBytes).toBe(6300)
    })

    it('should track tier distribution over time', async () => {
      vi.useFakeTimers()

      // Day 1: All in hot
      vi.setSystemTime(new Date('2024-01-01'))
      await index.recordLocation({ id: 'obj-1', tier: 'hot', createdAt: new Date(), accessedAt: new Date(), size: 100 })
      await index.recordLocation({ id: 'obj-2', tier: 'hot', createdAt: new Date(), accessedAt: new Date(), size: 100 })

      // Day 2: Move one to r2
      vi.setSystemTime(new Date('2024-01-02'))
      await index.recordLocation({ id: 'obj-1', tier: 'r2', createdAt: new Date('2024-01-01'), accessedAt: new Date(), size: 100, packId: 'pack-1', offset: 0 })

      // Day 3: Move one to parquet
      vi.setSystemTime(new Date('2024-01-03'))
      await index.recordLocation({ id: 'obj-1', tier: 'parquet', createdAt: new Date('2024-01-01'), accessedAt: new Date(), size: 100, packId: 'parquet-1', offset: 0 })

      const distribution = await index.getTierDistribution({
        from: new Date('2024-01-01'),
        to: new Date('2024-01-03'),
        granularity: 'day',
      })

      expect(distribution).toHaveLength(3)
      expect(distribution[0].hot).toBe(2)
      expect(distribution[1].hot).toBe(1)
      expect(distribution[1].r2).toBe(1)
      expect(distribution[2].hot).toBe(1)
      expect(distribution[2].parquet).toBe(1)

      vi.useRealTimers()
    })
  })

  describe('tier metadata', () => {
    it('should store and retrieve tier-specific metadata', async () => {
      const r2Location: ObjectLocation = {
        id: 'obj-with-metadata',
        tier: 'r2',
        createdAt: new Date(),
        accessedAt: new Date(),
        size: 1024,
        packId: 'pack-001',
        offset: 0,
        metadata: {
          compression: 'zstd',
          originalSize: 2048,
          checksumSha256: 'abc123',
        },
      }

      await index.recordLocation(r2Location)
      const result = await index.lookupLocation('obj-with-metadata')

      expect(result?.metadata).toBeDefined()
      expect(result?.metadata?.compression).toBe('zstd')
      expect(result?.metadata?.originalSize).toBe(2048)
      expect(result?.metadata?.checksumSha256).toBe('abc123')
    })

    it('should support parquet-specific metadata', async () => {
      const parquetLocation: ObjectLocation = {
        id: 'obj-parquet-meta',
        tier: 'parquet',
        createdAt: new Date(),
        accessedAt: new Date(),
        size: 10240,
        packId: 'parquet-2024-01',
        offset: 0,
        metadata: {
          rowGroup: 0,
          columnChunk: 'data',
          rowCount: 1000,
          encoding: 'PLAIN_DICTIONARY',
        },
      }

      await index.recordLocation(parquetLocation)
      const result = await index.lookupLocation('obj-parquet-meta')

      expect(result?.metadata?.rowGroup).toBe(0)
      expect(result?.metadata?.rowCount).toBe(1000)
      expect(result?.metadata?.encoding).toBe('PLAIN_DICTIONARY')
    })
  })

  describe('concurrent operations', () => {
    it('should handle concurrent location updates safely', async () => {
      const id = 'obj-concurrent'
      const createdAt = new Date()

      // Simulate concurrent updates
      const updates = Array.from({ length: 10 }, (_, i) =>
        index.recordLocation({
          id,
          tier: 'hot',
          createdAt,
          accessedAt: new Date(Date.now() + i),
          size: 1024 + i,
        })
      )

      await Promise.all(updates)

      const result = await index.lookupLocation(id)
      expect(result).not.toBeNull()
      expect(result?.tier).toBe('hot')
    })

    it('should maintain consistency during batch tier migrations', async () => {
      // Create 100 hot objects
      const objects: ObjectLocation[] = Array.from({ length: 100 }, (_, i) => ({
        id: `batch-obj-${i}`,
        tier: 'hot' as const,
        createdAt: new Date(),
        accessedAt: new Date(),
        size: 100,
      }))

      for (const obj of objects) {
        await index.recordLocation(obj)
      }

      // Batch migrate to r2
      const migrated = await index.batchMigrate(
        objects.map((o) => o.id),
        'r2',
        { packId: 'batch-pack-001' }
      )

      expect(migrated).toBe(100)

      const stats = await index.getStatsByTier()
      expect(stats.hot.count).toBe(0)
      expect(stats.r2.count).toBe(100)
    })
  })
})

// ============================================================================
// TieredStorage Integration Tests
// ============================================================================

describe('TieredStorage Integration', () => {
  it('should export all tiered storage types', async () => {
    // Verify the storage module exports the expected types and classes
    const storage = await import('../src/storage')

    expect(storage.LRUCache).toBeDefined()
    expect(storage.ObjectIndex).toBeDefined()
  })
})
