/**
 * @dotdo/do - LRUCache Tests (RED Phase - workers-q8v, workers-m8e)
 *
 * These tests define the expected behavior of the LRUCache class with
 * configurable size and count limits for cache eviction.
 *
 * They should FAIL initially (RED) because the LRUCache implementation doesn't exist yet.
 *
 * LRUCache features:
 * - Count-based limit (max number of items)
 * - Size-based limit (max total bytes)
 * - LRU eviction policy (least recently used items evicted first)
 * - Access updates recency (get/set moves item to most recently used)
 * - TTL (time-to-live) expiration (workers-m8e)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Import the LRUCache class that doesn't exist yet - this should cause the RED phase
// Once implemented, this import should work
import { LRUCache } from '../src/lru-cache'

describe('LRUCache with Size and Count Limits', () => {
  describe('Basic Cache Operations', () => {
    it('should have LRUCache class exported', () => {
      expect(LRUCache).toBeDefined()
      expect(typeof LRUCache).toBe('function')
    })

    it('should be constructable with options', () => {
      const cache = new LRUCache({ maxCount: 100 })
      expect(cache).toBeDefined()
      expect(cache).toBeInstanceOf(LRUCache)
    })

    it('should support set() and get() operations', () => {
      const cache = new LRUCache<string>({ maxCount: 10 })

      cache.set('key1', 'value1')
      const result = cache.get('key1')

      expect(result).toBe('value1')
    })

    it('should return undefined for non-existent keys', () => {
      const cache = new LRUCache<string>({ maxCount: 10 })

      const result = cache.get('nonexistent')

      expect(result).toBeUndefined()
    })

    it('should support has() method', () => {
      const cache = new LRUCache<string>({ maxCount: 10 })

      cache.set('exists', 'value')

      expect(cache.has('exists')).toBe(true)
      expect(cache.has('missing')).toBe(false)
    })

    it('should support delete() method', () => {
      const cache = new LRUCache<string>({ maxCount: 10 })

      cache.set('toDelete', 'value')
      expect(cache.has('toDelete')).toBe(true)

      const deleted = cache.delete('toDelete')

      expect(deleted).toBe(true)
      expect(cache.has('toDelete')).toBe(false)
    })

    it('should return false when deleting non-existent key', () => {
      const cache = new LRUCache<string>({ maxCount: 10 })

      const deleted = cache.delete('nonexistent')

      expect(deleted).toBe(false)
    })

    it('should support clear() method', () => {
      const cache = new LRUCache<string>({ maxCount: 10 })

      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.clear()

      expect(cache.has('key1')).toBe(false)
      expect(cache.has('key2')).toBe(false)
      expect(cache.size).toBe(0)
    })

    it('should expose size property (item count)', () => {
      const cache = new LRUCache<string>({ maxCount: 10 })

      expect(cache.size).toBe(0)

      cache.set('key1', 'value1')
      expect(cache.size).toBe(1)

      cache.set('key2', 'value2')
      expect(cache.size).toBe(2)

      cache.delete('key1')
      expect(cache.size).toBe(1)
    })
  })

  describe('Count-Based Limits (maxCount)', () => {
    it('should accept maxCount option', () => {
      const cache = new LRUCache({ maxCount: 5 })
      expect(cache).toBeDefined()
    })

    it('should evict least recently used item when maxCount is exceeded', () => {
      const cache = new LRUCache<string>({ maxCount: 3 })

      cache.set('first', 'value1')
      cache.set('second', 'value2')
      cache.set('third', 'value3')

      // At capacity (3 items)
      expect(cache.size).toBe(3)
      expect(cache.has('first')).toBe(true)

      // Adding 4th item should evict 'first' (LRU)
      cache.set('fourth', 'value4')

      expect(cache.size).toBe(3)
      expect(cache.has('first')).toBe(false) // Evicted
      expect(cache.has('second')).toBe(true)
      expect(cache.has('third')).toBe(true)
      expect(cache.has('fourth')).toBe(true)
    })

    it('should update recency on get() - accessed item should not be evicted', () => {
      const cache = new LRUCache<string>({ maxCount: 3 })

      cache.set('first', 'value1')
      cache.set('second', 'value2')
      cache.set('third', 'value3')

      // Access 'first' to make it most recently used
      cache.get('first')

      // Now add 4th item - 'second' should be evicted (it's now LRU)
      cache.set('fourth', 'value4')

      expect(cache.has('first')).toBe(true) // Was accessed, not evicted
      expect(cache.has('second')).toBe(false) // LRU, evicted
      expect(cache.has('third')).toBe(true)
      expect(cache.has('fourth')).toBe(true)
    })

    it('should update recency on set() for existing key', () => {
      const cache = new LRUCache<string>({ maxCount: 3 })

      cache.set('first', 'value1')
      cache.set('second', 'value2')
      cache.set('third', 'value3')

      // Update 'first' to make it most recently used
      cache.set('first', 'updated')

      // Now add 4th item - 'second' should be evicted
      cache.set('fourth', 'value4')

      expect(cache.has('first')).toBe(true)
      expect(cache.get('first')).toBe('updated')
      expect(cache.has('second')).toBe(false) // LRU, evicted
    })

    it('should not count updated keys twice', () => {
      const cache = new LRUCache<string>({ maxCount: 3 })

      cache.set('key1', 'value1')
      cache.set('key1', 'value1-updated')
      cache.set('key1', 'value1-updated-again')

      expect(cache.size).toBe(1)
    })

    it('should handle maxCount of 1', () => {
      const cache = new LRUCache<string>({ maxCount: 1 })

      cache.set('first', 'value1')
      expect(cache.size).toBe(1)
      expect(cache.get('first')).toBe('value1')

      cache.set('second', 'value2')
      expect(cache.size).toBe(1)
      expect(cache.has('first')).toBe(false)
      expect(cache.get('second')).toBe('value2')
    })
  })

  describe('Size-Based Limits (maxSize)', () => {
    it('should accept maxSize option in bytes', () => {
      const cache = new LRUCache({ maxSize: 1024 })
      expect(cache).toBeDefined()
    })

    it('should accept sizeCalculator function', () => {
      const sizeCalculator = (value: string) => value.length
      const cache = new LRUCache<string>({
        maxSize: 100,
        sizeCalculator,
      })
      expect(cache).toBeDefined()
    })

    it('should evict items when maxSize is exceeded', () => {
      const cache = new LRUCache<string>({
        maxSize: 30,
        sizeCalculator: (value) => value.length,
      })

      cache.set('key1', '1234567890') // 10 bytes
      cache.set('key2', '1234567890') // 10 bytes
      cache.set('key3', '1234567890') // 10 bytes

      expect(cache.size).toBe(3)
      expect(cache.totalSize).toBe(30)

      // Adding another 10 bytes should evict 'key1'
      cache.set('key4', '1234567890')

      expect(cache.has('key1')).toBe(false)
      expect(cache.size).toBe(3)
      expect(cache.totalSize).toBe(30)
    })

    it('should expose totalSize property', () => {
      const cache = new LRUCache<string>({
        maxSize: 1000,
        sizeCalculator: (value) => value.length,
      })

      expect(cache.totalSize).toBe(0)

      cache.set('key1', 'hello') // 5 bytes
      expect(cache.totalSize).toBe(5)

      cache.set('key2', 'world!') // 6 bytes
      expect(cache.totalSize).toBe(11)

      cache.delete('key1')
      expect(cache.totalSize).toBe(6)
    })

    it('should evict multiple items if single large item exceeds remaining space', () => {
      const cache = new LRUCache<string>({
        maxSize: 20,
        sizeCalculator: (value) => value.length,
      })

      cache.set('a', '12345') // 5 bytes
      cache.set('b', '12345') // 5 bytes
      cache.set('c', '12345') // 5 bytes

      expect(cache.totalSize).toBe(15)

      // Add item that needs 15 bytes - should evict 'a' and 'b' (LRU items)
      // to make room. 'c' can remain since c(5) + big(15) = 20 <= maxSize
      cache.set('big', '123456789012345') // 15 bytes

      expect(cache.has('a')).toBe(false)
      expect(cache.has('b')).toBe(false)
      expect(cache.has('c')).toBe(true) // c remains (5 + 15 = 20 <= maxSize)
      expect(cache.has('big')).toBe(true)
      expect(cache.totalSize).toBe(20) // c(5) + big(15) = 20
    })

    it('should update size when value is updated', () => {
      const cache = new LRUCache<string>({
        maxSize: 100,
        sizeCalculator: (value) => value.length,
      })

      cache.set('key', 'short') // 5 bytes
      expect(cache.totalSize).toBe(5)

      cache.set('key', 'much longer string') // 18 bytes
      expect(cache.totalSize).toBe(18)
      expect(cache.size).toBe(1)
    })

    it('should reject items larger than maxSize', () => {
      const cache = new LRUCache<string>({
        maxSize: 10,
        sizeCalculator: (value) => value.length,
      })

      // Item too large should be rejected or throw
      const result = cache.set('huge', '12345678901234567890') // 20 bytes > maxSize

      expect(cache.has('huge')).toBe(false)
    })

    it('should use default size calculator if none provided (JSON.stringify length)', () => {
      const cache = new LRUCache<object>({ maxSize: 100 })

      cache.set('obj', { foo: 'bar' })

      // Default should use JSON.stringify(value).length
      expect(cache.totalSize).toBe(JSON.stringify({ foo: 'bar' }).length)
    })
  })

  describe('Combined Count and Size Limits', () => {
    it('should accept both maxCount and maxSize options', () => {
      const cache = new LRUCache({
        maxCount: 100,
        maxSize: 1024,
        sizeCalculator: (v: string) => v.length,
      })
      expect(cache).toBeDefined()
    })

    it('should evict when count limit is reached before size limit', () => {
      const cache = new LRUCache<string>({
        maxCount: 3,
        maxSize: 1000,
        sizeCalculator: (value) => value.length,
      })

      cache.set('a', 'x') // 1 byte
      cache.set('b', 'x') // 1 byte
      cache.set('c', 'x') // 1 byte

      // Count is 3, size is 3 - count limit reached first
      cache.set('d', 'x')

      expect(cache.size).toBe(3)
      expect(cache.has('a')).toBe(false) // Evicted due to count
    })

    it('should evict when size limit is reached before count limit', () => {
      const cache = new LRUCache<string>({
        maxCount: 100,
        maxSize: 20,
        sizeCalculator: (value) => value.length,
      })

      cache.set('a', '1234567890') // 10 bytes
      cache.set('b', '1234567890') // 10 bytes

      // Count is 2, size is 20 - size limit reached
      cache.set('c', '1234567890') // Adding 10 more bytes

      expect(cache.size).toBeLessThan(3)
      expect(cache.totalSize).toBeLessThanOrEqual(20)
    })
  })

  describe('LRU Eviction Order', () => {
    it('should evict in LRU order (oldest first)', () => {
      const cache = new LRUCache<number>({ maxCount: 3 })
      const evictedKeys: string[] = []

      cache.set('first', 1)
      cache.set('second', 2)
      cache.set('third', 3)

      // Add items, track what gets evicted
      cache.set('fourth', 4)
      if (!cache.has('first')) evictedKeys.push('first')

      cache.set('fifth', 5)
      if (!cache.has('second')) evictedKeys.push('second')

      expect(evictedKeys).toEqual(['first', 'second'])
    })

    it('should correctly track LRU order across mixed get/set operations', () => {
      const cache = new LRUCache<string>({ maxCount: 4 })

      cache.set('a', 'a')
      cache.set('b', 'b')
      cache.set('c', 'c')
      cache.set('d', 'd')

      // Access pattern: b, a, d (c becomes LRU)
      cache.get('b')
      cache.get('a')
      cache.get('d')

      // Adding new item should evict 'c'
      cache.set('e', 'e')

      expect(cache.has('c')).toBe(false)
      expect(cache.has('a')).toBe(true)
      expect(cache.has('b')).toBe(true)
      expect(cache.has('d')).toBe(true)
      expect(cache.has('e')).toBe(true)
    })
  })

  describe('Cache Statistics', () => {
    it('should expose size (item count)', () => {
      const cache = new LRUCache<string>({ maxCount: 10 })
      expect(typeof cache.size).toBe('number')
    })

    it('should expose totalSize (bytes when using sizeCalculator)', () => {
      const cache = new LRUCache<string>({
        maxSize: 1000,
        sizeCalculator: (v) => v.length,
      })
      expect(typeof cache.totalSize).toBe('number')
    })

    it('should expose maxCount option', () => {
      const cache = new LRUCache({ maxCount: 50 })
      expect(cache.maxCount).toBe(50)
    })

    it('should expose maxSize option', () => {
      const cache = new LRUCache({ maxSize: 2048 })
      expect(cache.maxSize).toBe(2048)
    })
  })

  describe('Iterator Support', () => {
    it('should support keys() iterator', () => {
      const cache = new LRUCache<string>({ maxCount: 10 })

      cache.set('a', '1')
      cache.set('b', '2')
      cache.set('c', '3')

      const keys = Array.from(cache.keys())

      expect(keys).toContain('a')
      expect(keys).toContain('b')
      expect(keys).toContain('c')
      expect(keys.length).toBe(3)
    })

    it('should support values() iterator', () => {
      const cache = new LRUCache<string>({ maxCount: 10 })

      cache.set('a', '1')
      cache.set('b', '2')

      const values = Array.from(cache.values())

      expect(values).toContain('1')
      expect(values).toContain('2')
      expect(values.length).toBe(2)
    })

    it('should support entries() iterator', () => {
      const cache = new LRUCache<string>({ maxCount: 10 })

      cache.set('a', '1')
      cache.set('b', '2')

      const entries = Array.from(cache.entries())

      expect(entries).toContainEqual(['a', '1'])
      expect(entries).toContainEqual(['b', '2'])
      expect(entries.length).toBe(2)
    })

    it('should iterate in LRU order (most recent first)', () => {
      const cache = new LRUCache<string>({ maxCount: 10 })

      cache.set('first', '1')
      cache.set('second', '2')
      cache.set('third', '3')

      // Access 'first' to make it most recent
      cache.get('first')

      const keys = Array.from(cache.keys())

      // Most recently accessed should be first
      expect(keys[0]).toBe('first')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty cache operations gracefully', () => {
      const cache = new LRUCache<string>({ maxCount: 10 })

      expect(cache.get('any')).toBeUndefined()
      expect(cache.has('any')).toBe(false)
      expect(cache.delete('any')).toBe(false)
      expect(cache.size).toBe(0)
      expect(Array.from(cache.keys())).toEqual([])
    })

    it('should handle undefined values', () => {
      const cache = new LRUCache<string | undefined>({ maxCount: 10 })

      cache.set('key', undefined)

      expect(cache.has('key')).toBe(true)
      expect(cache.get('key')).toBeUndefined()
    })

    it('should handle null values', () => {
      const cache = new LRUCache<null>({ maxCount: 10 })

      cache.set('key', null)

      expect(cache.has('key')).toBe(true)
      expect(cache.get('key')).toBeNull()
    })

    it('should handle numeric keys', () => {
      const cache = new LRUCache<string>({ maxCount: 10 })

      cache.set('123', 'numeric key')

      expect(cache.get('123')).toBe('numeric key')
    })

    it('should handle empty string keys', () => {
      const cache = new LRUCache<string>({ maxCount: 10 })

      cache.set('', 'empty key')

      expect(cache.get('')).toBe('empty key')
      expect(cache.has('')).toBe(true)
    })

    it('should handle very large maxCount', () => {
      const cache = new LRUCache<string>({ maxCount: Number.MAX_SAFE_INTEGER })

      cache.set('key', 'value')

      expect(cache.get('key')).toBe('value')
    })

    it('should require at least maxCount or maxSize option', () => {
      // Should throw or warn if neither limit is set
      expect(() => new LRUCache({})).toThrow()
    })
  })

  describe('Type Safety', () => {
    it('should maintain type safety for values', () => {
      interface User {
        id: number
        name: string
      }

      const cache = new LRUCache<User>({ maxCount: 10 })

      cache.set('user1', { id: 1, name: 'Alice' })

      const user = cache.get('user1')

      // TypeScript should infer user as User | undefined
      if (user) {
        expect(user.id).toBe(1)
        expect(user.name).toBe('Alice')
      }
    })

    it('should work with complex nested types', () => {
      interface ComplexType {
        data: {
          nested: {
            value: number[]
          }
        }
      }

      const cache = new LRUCache<ComplexType>({ maxCount: 10 })

      const complex: ComplexType = {
        data: {
          nested: {
            value: [1, 2, 3],
          },
        },
      }

      cache.set('complex', complex)

      const retrieved = cache.get('complex')

      expect(retrieved?.data.nested.value).toEqual([1, 2, 3])
    })
  })

  /**
   * TTL (Time-To-Live) Expiration Tests (RED Phase - workers-m8e)
   *
   * These tests define the expected behavior for TTL-based cache expiration.
   * Items can have a TTL set either globally (defaultTTL) or per-item.
   * Expired items should be automatically removed on access or via cleanup.
   */
  describe('TTL Expiration (workers-m8e)', () => {
    describe('Global Default TTL', () => {
      it('should accept defaultTTL option in milliseconds', () => {
        const cache = new LRUCache<string>({
          maxCount: 100,
          defaultTTL: 5000, // 5 seconds
        })
        expect(cache).toBeDefined()
      })

      it('should expire items after defaultTTL has elapsed', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({
          maxCount: 100,
          defaultTTL: 1000, // 1 second
        })

        cache.set('key', 'value')
        expect(cache.get('key')).toBe('value')

        // Advance time past TTL
        vi.advanceTimersByTime(1001)

        // Item should be expired
        expect(cache.get('key')).toBeUndefined()
        expect(cache.has('key')).toBe(false)

        vi.useRealTimers()
      })

      it('should not expire items before defaultTTL has elapsed', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({
          maxCount: 100,
          defaultTTL: 5000, // 5 seconds
        })

        cache.set('key', 'value')

        // Advance time but not past TTL
        vi.advanceTimersByTime(4999)

        // Item should still be accessible
        expect(cache.get('key')).toBe('value')
        expect(cache.has('key')).toBe(true)

        vi.useRealTimers()
      })

      it('should apply defaultTTL to all items when set globally', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({
          maxCount: 100,
          defaultTTL: 1000,
        })

        cache.set('key1', 'value1')
        cache.set('key2', 'value2')
        cache.set('key3', 'value3')

        vi.advanceTimersByTime(1001)

        expect(cache.has('key1')).toBe(false)
        expect(cache.has('key2')).toBe(false)
        expect(cache.has('key3')).toBe(false)
        expect(cache.size).toBe(0)

        vi.useRealTimers()
      })

      it('should not require TTL (items without TTL never expire)', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({ maxCount: 100 })

        cache.set('key', 'value')

        // Advance time significantly
        vi.advanceTimersByTime(1000000)

        // Item should still exist
        expect(cache.get('key')).toBe('value')

        vi.useRealTimers()
      })
    })

    describe('Per-Item TTL', () => {
      it('should accept ttl option in set() method', () => {
        const cache = new LRUCache<string>({ maxCount: 100 })

        // Should not throw
        cache.set('key', 'value', { ttl: 5000 })

        expect(cache.get('key')).toBe('value')
      })

      it('should expire individual item after its specific TTL', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({ maxCount: 100 })

        cache.set('key', 'value', { ttl: 1000 })

        vi.advanceTimersByTime(1001)

        expect(cache.get('key')).toBeUndefined()

        vi.useRealTimers()
      })

      it('should override defaultTTL with per-item TTL', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({
          maxCount: 100,
          defaultTTL: 5000,
        })

        cache.set('shortLived', 'value1', { ttl: 1000 })
        cache.set('usesDefault', 'value2')

        vi.advanceTimersByTime(1001)

        // Short-lived item should be expired
        expect(cache.has('shortLived')).toBe(false)
        // Default TTL item should still exist
        expect(cache.has('usesDefault')).toBe(true)

        vi.advanceTimersByTime(4000)

        // Now default item should also be expired
        expect(cache.has('usesDefault')).toBe(false)

        vi.useRealTimers()
      })

      it('should support different TTLs for different items', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({ maxCount: 100 })

        cache.set('short', 'value1', { ttl: 1000 })
        cache.set('medium', 'value2', { ttl: 3000 })
        cache.set('long', 'value3', { ttl: 5000 })

        vi.advanceTimersByTime(1001)
        expect(cache.has('short')).toBe(false)
        expect(cache.has('medium')).toBe(true)
        expect(cache.has('long')).toBe(true)

        vi.advanceTimersByTime(2000)
        expect(cache.has('medium')).toBe(false)
        expect(cache.has('long')).toBe(true)

        vi.advanceTimersByTime(2000)
        expect(cache.has('long')).toBe(false)

        vi.useRealTimers()
      })

      it('should allow ttl: 0 to mean no expiration', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({
          maxCount: 100,
          defaultTTL: 1000,
        })

        // TTL of 0 should disable expiration for this item
        cache.set('permanent', 'value', { ttl: 0 })

        vi.advanceTimersByTime(10000)

        expect(cache.get('permanent')).toBe('value')

        vi.useRealTimers()
      })

      it('should allow Infinity TTL to mean no expiration', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({
          maxCount: 100,
          defaultTTL: 1000,
        })

        cache.set('forever', 'value', { ttl: Infinity })

        vi.advanceTimersByTime(Number.MAX_SAFE_INTEGER)

        expect(cache.get('forever')).toBe('value')

        vi.useRealTimers()
      })
    })

    describe('TTL Reset on Update', () => {
      it('should reset TTL when item is updated via set()', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({
          maxCount: 100,
          defaultTTL: 2000,
        })

        cache.set('key', 'value1')

        vi.advanceTimersByTime(1500)

        // Update the item - should reset TTL
        cache.set('key', 'value2')

        vi.advanceTimersByTime(1500)

        // Should still exist because TTL was reset
        expect(cache.get('key')).toBe('value2')

        vi.advanceTimersByTime(1000)

        // Now it should be expired (2000ms from last set)
        expect(cache.has('key')).toBe(false)

        vi.useRealTimers()
      })

      it('should optionally refresh TTL on get() with updateAgeOnGet option', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({
          maxCount: 100,
          defaultTTL: 2000,
          updateAgeOnGet: true,
        })

        cache.set('key', 'value')

        vi.advanceTimersByTime(1500)

        // Access the item - should reset TTL
        cache.get('key')

        vi.advanceTimersByTime(1500)

        // Should still exist because TTL was reset on get
        expect(cache.get('key')).toBe('value')

        vi.useRealTimers()
      })

      it('should NOT refresh TTL on get() by default', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({
          maxCount: 100,
          defaultTTL: 2000,
        })

        cache.set('key', 'value')

        vi.advanceTimersByTime(1500)

        // Access the item
        cache.get('key')

        vi.advanceTimersByTime(600)

        // Should be expired because get() doesn't reset TTL by default
        expect(cache.has('key')).toBe(false)

        vi.useRealTimers()
      })

      it('should allow new TTL to be specified when updating via set()', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({
          maxCount: 100,
          defaultTTL: 5000,
        })

        cache.set('key', 'value1')

        vi.advanceTimersByTime(1000)

        // Update with shorter TTL
        cache.set('key', 'value2', { ttl: 1000 })

        vi.advanceTimersByTime(1001)

        // Should be expired based on new TTL
        expect(cache.has('key')).toBe(false)

        vi.useRealTimers()
      })
    })

    describe('Lazy vs Active Expiration', () => {
      it('should remove expired items lazily on get() (default behavior)', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({
          maxCount: 100,
          defaultTTL: 1000,
        })

        cache.set('key', 'value')

        vi.advanceTimersByTime(1001)

        // Size might still report the item until accessed
        // But get() should return undefined and clean up
        expect(cache.get('key')).toBeUndefined()

        // After get(), item should be removed from size
        expect(cache.size).toBe(0)

        vi.useRealTimers()
      })

      it('should remove expired items lazily on has()', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({
          maxCount: 100,
          defaultTTL: 1000,
        })

        cache.set('key', 'value')

        vi.advanceTimersByTime(1001)

        // has() should return false and clean up expired item
        expect(cache.has('key')).toBe(false)

        vi.useRealTimers()
      })

      it('should support purgeStale() method to actively remove all expired items', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({
          maxCount: 100,
          defaultTTL: 1000,
        })

        cache.set('key1', 'value1')
        cache.set('key2', 'value2')
        cache.set('key3', 'value3')

        vi.advanceTimersByTime(1001)

        // Actively purge all stale items
        const purged = cache.purgeStale()

        expect(purged).toBe(3) // Number of items purged
        expect(cache.size).toBe(0)

        vi.useRealTimers()
      })

      it('should only purge expired items in purgeStale()', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({ maxCount: 100 })

        cache.set('expires', 'value1', { ttl: 1000 })
        cache.set('permanent', 'value2') // No TTL

        vi.advanceTimersByTime(1001)

        const purged = cache.purgeStale()

        expect(purged).toBe(1)
        expect(cache.has('expires')).toBe(false)
        expect(cache.has('permanent')).toBe(true)

        vi.useRealTimers()
      })
    })

    describe('TTL with getRemainingTTL()', () => {
      it('should expose getRemainingTTL() method', () => {
        const cache = new LRUCache<string>({
          maxCount: 100,
          defaultTTL: 5000,
        })

        cache.set('key', 'value')

        expect(typeof cache.getRemainingTTL).toBe('function')
      })

      it('should return remaining TTL in milliseconds', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({
          maxCount: 100,
          defaultTTL: 5000,
        })

        cache.set('key', 'value')

        vi.advanceTimersByTime(2000)

        const remaining = cache.getRemainingTTL('key')

        expect(remaining).toBe(3000)

        vi.useRealTimers()
      })

      it('should return 0 for expired items', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({
          maxCount: 100,
          defaultTTL: 1000,
        })

        cache.set('key', 'value')

        vi.advanceTimersByTime(2000)

        expect(cache.getRemainingTTL('key')).toBe(0)

        vi.useRealTimers()
      })

      it('should return Infinity for items without TTL', () => {
        const cache = new LRUCache<string>({ maxCount: 100 })

        cache.set('key', 'value')

        expect(cache.getRemainingTTL('key')).toBe(Infinity)
      })

      it('should return undefined for non-existent keys', () => {
        const cache = new LRUCache<string>({ maxCount: 100 })

        expect(cache.getRemainingTTL('nonexistent')).toBeUndefined()
      })
    })

    describe('TTL Interaction with LRU Eviction', () => {
      it('should count expired items toward size until purged', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({
          maxCount: 3,
          defaultTTL: 1000,
        })

        cache.set('key1', 'value1')
        cache.set('key2', 'value2')
        cache.set('key3', 'value3')

        vi.advanceTimersByTime(1001)

        // Items are expired but not yet purged
        // Adding new item might trigger LRU eviction or purge
        cache.set('key4', 'value4')

        // key4 should exist
        expect(cache.get('key4')).toBe('value4')

        vi.useRealTimers()
      })

      it('should prefer evicting expired items over non-expired items', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({
          maxCount: 3,
          defaultTTL: 1000,
        })

        cache.set('expires', 'value1', { ttl: 500 })
        cache.set('stays1', 'value2')
        cache.set('stays2', 'value3')

        vi.advanceTimersByTime(501)

        // 'expires' is now expired, adding new item should evict it first
        cache.set('new', 'value4')

        expect(cache.has('expires')).toBe(false)
        expect(cache.has('stays1')).toBe(true)
        expect(cache.has('stays2')).toBe(true)
        expect(cache.has('new')).toBe(true)

        vi.useRealTimers()
      })

      it('should not return expired items even if within maxCount', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({
          maxCount: 100,
          defaultTTL: 1000,
        })

        cache.set('key', 'value')

        vi.advanceTimersByTime(1001)

        // Even though we have capacity, expired item should not be returned
        expect(cache.get('key')).toBeUndefined()

        vi.useRealTimers()
      })
    })

    describe('TTL with Size-Based Limits', () => {
      it('should work with both TTL and maxSize', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({
          maxSize: 100,
          defaultTTL: 1000,
          sizeCalculator: (v) => v.length,
        })

        cache.set('key', '1234567890') // 10 bytes

        expect(cache.get('key')).toBe('1234567890')
        expect(cache.totalSize).toBe(10)

        vi.advanceTimersByTime(1001)

        expect(cache.get('key')).toBeUndefined()

        vi.useRealTimers()
      })

      it('should update totalSize when expired items are purged', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({
          maxSize: 100,
          defaultTTL: 1000,
          sizeCalculator: (v) => v.length,
        })

        cache.set('key1', '12345') // 5 bytes
        cache.set('key2', '12345') // 5 bytes

        expect(cache.totalSize).toBe(10)

        vi.advanceTimersByTime(1001)

        cache.purgeStale()

        expect(cache.totalSize).toBe(0)

        vi.useRealTimers()
      })
    })

    describe('Edge Cases for TTL', () => {
      it('should handle very small TTL values', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({
          maxCount: 100,
          defaultTTL: 1, // 1 millisecond
        })

        cache.set('key', 'value')

        vi.advanceTimersByTime(2)

        expect(cache.get('key')).toBeUndefined()

        vi.useRealTimers()
      })

      it('should handle very large TTL values', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({
          maxCount: 100,
          defaultTTL: Number.MAX_SAFE_INTEGER,
        })

        cache.set('key', 'value')

        vi.advanceTimersByTime(1000000)

        expect(cache.get('key')).toBe('value')

        vi.useRealTimers()
      })

      it('should handle negative TTL by treating as no TTL or throwing', () => {
        const cache = new LRUCache<string>({ maxCount: 100 })

        // Either throw an error or treat negative TTL as no expiration
        expect(() => cache.set('key', 'value', { ttl: -1000 })).toThrow()
      })

      it('should handle NaN TTL by throwing', () => {
        const cache = new LRUCache<string>({ maxCount: 100 })

        expect(() => cache.set('key', 'value', { ttl: NaN })).toThrow()
      })

      it('should handle concurrent TTL expirations correctly', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({
          maxCount: 100,
          defaultTTL: 1000,
        })

        // Set many items at the same time
        for (let i = 0; i < 100; i++) {
          cache.set(`key${i}`, `value${i}`)
        }

        vi.advanceTimersByTime(1001)

        // All should be expired
        for (let i = 0; i < 100; i++) {
          expect(cache.get(`key${i}`)).toBeUndefined()
        }

        expect(cache.size).toBe(0)

        vi.useRealTimers()
      })

      it('should handle items set at different times with same TTL', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({
          maxCount: 100,
          defaultTTL: 1000,
        })

        cache.set('first', 'value1')

        vi.advanceTimersByTime(500)

        cache.set('second', 'value2')

        vi.advanceTimersByTime(501)

        // 'first' should be expired (1001ms total)
        // 'second' should still be valid (501ms total)
        expect(cache.get('first')).toBeUndefined()
        expect(cache.get('second')).toBe('value2')

        vi.advanceTimersByTime(500)

        // Now 'second' should also be expired
        expect(cache.get('second')).toBeUndefined()

        vi.useRealTimers()
      })
    })

    describe('TTL Iterator Behavior', () => {
      it('should skip expired items in keys() iterator', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({ maxCount: 100 })

        cache.set('expires', 'value1', { ttl: 1000 })
        cache.set('stays', 'value2')

        vi.advanceTimersByTime(1001)

        const keys = Array.from(cache.keys())

        expect(keys).not.toContain('expires')
        expect(keys).toContain('stays')

        vi.useRealTimers()
      })

      it('should skip expired items in values() iterator', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({ maxCount: 100 })

        cache.set('expires', 'expired-value', { ttl: 1000 })
        cache.set('stays', 'valid-value')

        vi.advanceTimersByTime(1001)

        const values = Array.from(cache.values())

        expect(values).not.toContain('expired-value')
        expect(values).toContain('valid-value')

        vi.useRealTimers()
      })

      it('should skip expired items in entries() iterator', () => {
        vi.useFakeTimers()

        const cache = new LRUCache<string>({ maxCount: 100 })

        cache.set('expires', 'value1', { ttl: 1000 })
        cache.set('stays', 'value2')

        vi.advanceTimersByTime(1001)

        const entries = Array.from(cache.entries())
        const keys = entries.map(([k]) => k)

        expect(keys).not.toContain('expires')
        expect(keys).toContain('stays')

        vi.useRealTimers()
      })
    })
  })
})
