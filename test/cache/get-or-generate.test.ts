/**
 * @dotdo/do - getOrGenerate() Tests (RED Phase - do-6ne)
 *
 * These tests define the expected behavior of the getOrGenerate() function
 * for lazy computation with caching. This is a common caching pattern where:
 * - If the value exists in cache, return it immediately
 * - If the value doesn't exist, call the generator function, cache the result, and return it
 *
 * Key features to test:
 * - getOrGenerate(key, generator, options) signature
 * - Cache hit returns cached value without calling generator
 * - Cache miss calls generator and caches result
 * - TTL expiration triggers regeneration
 * - Stale-while-revalidate pattern for background refresh
 * - Error handling in generator functions
 *
 * These tests should be marked as TODO (RED) because the implementation doesn't exist yet.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// This import will fail until getOrGenerate is implemented
// import { getOrGenerate, createCache } from '../../src/cache'

describe.todo('getOrGenerate() - Lazy Execution with Caching', () => {
  describe('Basic Signature and Behavior', () => {
    it('should have getOrGenerate function exported', () => {
      // expect(getOrGenerate).toBeDefined()
      // expect(typeof getOrGenerate).toBe('function')
    })

    it('should accept (key, generator, options) parameters', () => {
      // const cache = createCache({ maxCount: 100 })
      // const generator = () => 'generated-value'
      //
      // const result = cache.getOrGenerate('myKey', generator)
      //
      // expect(result).toBe('generated-value')
    })

    it('should support async generator functions', async () => {
      // const cache = createCache({ maxCount: 100 })
      // const asyncGenerator = async () => {
      //   await new Promise(resolve => setTimeout(resolve, 10))
      //   return 'async-value'
      // }
      //
      // const result = await cache.getOrGenerate('asyncKey', asyncGenerator)
      //
      // expect(result).toBe('async-value')
    })

    it('should return a promise for async generators', () => {
      // const cache = createCache({ maxCount: 100 })
      // const asyncGenerator = async () => 'value'
      //
      // const result = cache.getOrGenerate('key', asyncGenerator)
      //
      // expect(result).toBeInstanceOf(Promise)
    })
  })

  describe('Cache Hit - Returns Cached Value', () => {
    it('should return cached value without calling generator on cache hit', () => {
      // const cache = createCache({ maxCount: 100 })
      // const generator = vi.fn(() => 'fresh-value')
      //
      // // Pre-populate cache
      // cache.set('existingKey', 'cached-value')
      //
      // const result = cache.getOrGenerate('existingKey', generator)
      //
      // expect(result).toBe('cached-value')
      // expect(generator).not.toHaveBeenCalled()
    })

    it('should return cached value on multiple getOrGenerate calls', () => {
      // const cache = createCache({ maxCount: 100 })
      // const generator = vi.fn(() => 'value')
      //
      // // First call generates
      // cache.getOrGenerate('key', generator)
      // // Second call should use cache
      // cache.getOrGenerate('key', generator)
      // // Third call should use cache
      // cache.getOrGenerate('key', generator)
      //
      // expect(generator).toHaveBeenCalledTimes(1)
    })

    it('should return cached value even with different generator reference', () => {
      // const cache = createCache({ maxCount: 100 })
      //
      // // First call with generator A
      // cache.getOrGenerate('key', () => 'value-a')
      //
      // // Second call with generator B - should still return cached value
      // const result = cache.getOrGenerate('key', () => 'value-b')
      //
      // expect(result).toBe('value-a')
    })

    it('should handle cached undefined values correctly', () => {
      // const cache = createCache({ maxCount: 100 })
      // const generator = vi.fn(() => undefined)
      //
      // // Generate and cache undefined
      // cache.getOrGenerate('key', generator)
      //
      // // Second call should not regenerate
      // cache.getOrGenerate('key', generator)
      //
      // expect(generator).toHaveBeenCalledTimes(1)
    })

    it('should handle cached null values correctly', () => {
      // const cache = createCache({ maxCount: 100 })
      // const generator = vi.fn(() => null)
      //
      // cache.getOrGenerate('key', generator)
      // cache.getOrGenerate('key', generator)
      //
      // expect(generator).toHaveBeenCalledTimes(1)
    })
  })

  describe('Cache Miss - Calls Generator and Caches Result', () => {
    it('should call generator when key is not in cache', () => {
      // const cache = createCache({ maxCount: 100 })
      // const generator = vi.fn(() => 'generated')
      //
      // cache.getOrGenerate('newKey', generator)
      //
      // expect(generator).toHaveBeenCalledTimes(1)
    })

    it('should cache the generated value', () => {
      // const cache = createCache({ maxCount: 100 })
      // const generator = vi.fn(() => 'generated')
      //
      // cache.getOrGenerate('key', generator)
      //
      // expect(cache.has('key')).toBe(true)
      // expect(cache.get('key')).toBe('generated')
    })

    it('should return the generated value', () => {
      // const cache = createCache({ maxCount: 100 })
      //
      // const result = cache.getOrGenerate('key', () => 'generated')
      //
      // expect(result).toBe('generated')
    })

    it('should pass the key to the generator function', () => {
      // const cache = createCache({ maxCount: 100 })
      // const generator = vi.fn((key: string) => `value-for-${key}`)
      //
      // const result = cache.getOrGenerate('myKey', generator)
      //
      // expect(generator).toHaveBeenCalledWith('myKey')
      // expect(result).toBe('value-for-myKey')
    })

    it('should cache and return complex objects', () => {
      // const cache = createCache({ maxCount: 100 })
      // const complexObject = { nested: { data: [1, 2, 3] } }
      //
      // const result = cache.getOrGenerate('complex', () => complexObject)
      //
      // expect(result).toEqual(complexObject)
      // expect(cache.get('complex')).toEqual(complexObject)
    })

    it('should handle async generators on cache miss', async () => {
      // const cache = createCache({ maxCount: 100 })
      // const asyncGenerator = vi.fn(async () => {
      //   return 'async-generated'
      // })
      //
      // const result = await cache.getOrGenerate('asyncKey', asyncGenerator)
      //
      // expect(result).toBe('async-generated')
      // expect(cache.get('asyncKey')).toBe('async-generated')
    })
  })

  describe('TTL Expiration', () => {
    it('should accept TTL option', () => {
      // vi.useFakeTimers()
      //
      // const cache = createCache({ maxCount: 100 })
      // const generator = vi.fn(() => 'value')
      //
      // cache.getOrGenerate('key', generator, { ttl: 5000 })
      //
      // expect(generator).toHaveBeenCalledTimes(1)
      //
      // vi.useRealTimers()
    })

    it('should regenerate value after TTL expires', () => {
      // vi.useFakeTimers()
      //
      // const cache = createCache({ maxCount: 100 })
      // const generator = vi.fn()
      //   .mockReturnValueOnce('first-value')
      //   .mockReturnValueOnce('second-value')
      //
      // cache.getOrGenerate('key', generator, { ttl: 1000 })
      //
      // vi.advanceTimersByTime(1001)
      //
      // const result = cache.getOrGenerate('key', generator, { ttl: 1000 })
      //
      // expect(generator).toHaveBeenCalledTimes(2)
      // expect(result).toBe('second-value')
      //
      // vi.useRealTimers()
    })

    it('should not regenerate before TTL expires', () => {
      // vi.useFakeTimers()
      //
      // const cache = createCache({ maxCount: 100 })
      // const generator = vi.fn(() => 'value')
      //
      // cache.getOrGenerate('key', generator, { ttl: 5000 })
      //
      // vi.advanceTimersByTime(4999)
      //
      // cache.getOrGenerate('key', generator, { ttl: 5000 })
      //
      // expect(generator).toHaveBeenCalledTimes(1)
      //
      // vi.useRealTimers()
    })

    it('should use default TTL from cache options when not specified', () => {
      // vi.useFakeTimers()
      //
      // const cache = createCache({ maxCount: 100, defaultTTL: 2000 })
      // const generator = vi.fn(() => 'value')
      //
      // cache.getOrGenerate('key', generator)
      //
      // vi.advanceTimersByTime(2001)
      //
      // cache.getOrGenerate('key', generator)
      //
      // expect(generator).toHaveBeenCalledTimes(2)
      //
      // vi.useRealTimers()
    })

    it('should allow per-call TTL to override default TTL', () => {
      // vi.useFakeTimers()
      //
      // const cache = createCache({ maxCount: 100, defaultTTL: 5000 })
      // const generator = vi.fn(() => 'value')
      //
      // // Use shorter TTL per-call
      // cache.getOrGenerate('key', generator, { ttl: 1000 })
      //
      // vi.advanceTimersByTime(1001)
      //
      // cache.getOrGenerate('key', generator, { ttl: 1000 })
      //
      // expect(generator).toHaveBeenCalledTimes(2)
      //
      // vi.useRealTimers()
    })
  })

  describe('Stale-While-Revalidate Pattern', () => {
    it('should accept staleWhileRevalidate option', () => {
      // const cache = createCache({ maxCount: 100 })
      // const generator = vi.fn(() => 'value')
      //
      // // Should not throw
      // cache.getOrGenerate('key', generator, {
      //   ttl: 5000,
      //   staleWhileRevalidate: 10000
      // })
    })

    it('should return stale value while revalidating in background', async () => {
      // vi.useFakeTimers()
      //
      // const cache = createCache({ maxCount: 100 })
      // let callCount = 0
      // const generator = vi.fn(async () => {
      //   callCount++
      //   return `value-${callCount}`
      // })
      //
      // // Initial generation
      // await cache.getOrGenerate('key', generator, {
      //   ttl: 1000,
      //   staleWhileRevalidate: 5000
      // })
      //
      // // Move past TTL but within stale window
      // vi.advanceTimersByTime(1500)
      //
      // // Should return stale value immediately
      // const result = await cache.getOrGenerate('key', generator, {
      //   ttl: 1000,
      //   staleWhileRevalidate: 5000
      // })
      //
      // expect(result).toBe('value-1') // Returns stale value
      //
      // // Allow background revalidation to complete
      // await vi.runAllTimersAsync()
      //
      // // Now cache should have fresh value
      // expect(cache.get('key')).toBe('value-2')
      //
      // vi.useRealTimers()
    })

    it('should trigger background refresh when value is stale', async () => {
      // vi.useFakeTimers()
      //
      // const cache = createCache({ maxCount: 100 })
      // const generator = vi.fn(async () => 'value')
      //
      // await cache.getOrGenerate('key', generator, {
      //   ttl: 1000,
      //   staleWhileRevalidate: 5000
      // })
      //
      // vi.advanceTimersByTime(1500)
      //
      // // This should trigger background refresh
      // await cache.getOrGenerate('key', generator, {
      //   ttl: 1000,
      //   staleWhileRevalidate: 5000
      // })
      //
      // await vi.runAllTimersAsync()
      //
      // expect(generator).toHaveBeenCalledTimes(2)
      //
      // vi.useRealTimers()
    })

    it('should only trigger one background refresh for concurrent requests', async () => {
      // vi.useFakeTimers()
      //
      // const cache = createCache({ maxCount: 100 })
      // const generator = vi.fn(async () => {
      //   await new Promise(resolve => setTimeout(resolve, 100))
      //   return 'value'
      // })
      //
      // await cache.getOrGenerate('key', generator, {
      //   ttl: 1000,
      //   staleWhileRevalidate: 5000
      // })
      //
      // vi.advanceTimersByTime(1500)
      //
      // // Multiple concurrent requests during stale period
      // Promise.all([
      //   cache.getOrGenerate('key', generator, { ttl: 1000, staleWhileRevalidate: 5000 }),
      //   cache.getOrGenerate('key', generator, { ttl: 1000, staleWhileRevalidate: 5000 }),
      //   cache.getOrGenerate('key', generator, { ttl: 1000, staleWhileRevalidate: 5000 })
      // ])
      //
      // await vi.runAllTimersAsync()
      //
      // // Should only regenerate once (initial + 1 background refresh)
      // expect(generator).toHaveBeenCalledTimes(2)
      //
      // vi.useRealTimers()
    })

    it('should regenerate synchronously when past staleWhileRevalidate window', async () => {
      // vi.useFakeTimers()
      //
      // const cache = createCache({ maxCount: 100 })
      // let callCount = 0
      // const generator = vi.fn(async () => {
      //   callCount++
      //   return `value-${callCount}`
      // })
      //
      // await cache.getOrGenerate('key', generator, {
      //   ttl: 1000,
      //   staleWhileRevalidate: 2000
      // })
      //
      // // Move past both TTL and stale window
      // vi.advanceTimersByTime(3500) // 1000 TTL + 2000 SWR = 3000
      //
      // // Should regenerate synchronously (not return stale)
      // const result = await cache.getOrGenerate('key', generator, {
      //   ttl: 1000,
      //   staleWhileRevalidate: 2000
      // })
      //
      // expect(result).toBe('value-2') // Fresh value, not stale
      //
      // vi.useRealTimers()
    })

    it('should not use stale value if staleWhileRevalidate is not set', async () => {
      // vi.useFakeTimers()
      //
      // const cache = createCache({ maxCount: 100 })
      // let callCount = 0
      // const generator = vi.fn(async () => {
      //   callCount++
      //   return `value-${callCount}`
      // })
      //
      // await cache.getOrGenerate('key', generator, { ttl: 1000 })
      //
      // vi.advanceTimersByTime(1500)
      //
      // // Without SWR, should wait for fresh value
      // const result = await cache.getOrGenerate('key', generator, { ttl: 1000 })
      //
      // expect(result).toBe('value-2')
      // expect(generator).toHaveBeenCalledTimes(2)
      //
      // vi.useRealTimers()
    })
  })

  describe('Error Handling', () => {
    it('should propagate errors from generator function', () => {
      // const cache = createCache({ maxCount: 100 })
      // const errorGenerator = () => {
      //   throw new Error('Generator failed')
      // }
      //
      // expect(() => cache.getOrGenerate('key', errorGenerator))
      //   .toThrow('Generator failed')
    })

    it('should not cache failed generator results', () => {
      // const cache = createCache({ maxCount: 100 })
      // const failingGenerator = vi.fn(() => {
      //   throw new Error('Generator failed')
      // })
      //
      // try {
      //   cache.getOrGenerate('key', failingGenerator)
      // } catch {}
      //
      // expect(cache.has('key')).toBe(false)
    })

    it('should propagate errors from async generator', async () => {
      // const cache = createCache({ maxCount: 100 })
      // const asyncErrorGenerator = async () => {
      //   throw new Error('Async generator failed')
      // }
      //
      // await expect(cache.getOrGenerate('key', asyncErrorGenerator))
      //   .rejects.toThrow('Async generator failed')
    })

    it('should allow retry after generator failure', () => {
      // const cache = createCache({ maxCount: 100 })
      // let shouldFail = true
      // const generator = vi.fn(() => {
      //   if (shouldFail) {
      //     throw new Error('Temporary failure')
      //   }
      //   return 'success'
      // })
      //
      // // First call fails
      // try {
      //   cache.getOrGenerate('key', generator)
      // } catch {}
      //
      // // Fix the failure condition
      // shouldFail = false
      //
      // // Retry should succeed
      // const result = cache.getOrGenerate('key', generator)
      //
      // expect(result).toBe('success')
      // expect(generator).toHaveBeenCalledTimes(2)
    })

    it('should handle generator returning rejected promise', async () => {
      // const cache = createCache({ maxCount: 100 })
      // const rejectedGenerator = () => Promise.reject(new Error('Rejected'))
      //
      // await expect(cache.getOrGenerate('key', rejectedGenerator))
      //   .rejects.toThrow('Rejected')
    })

    it('should optionally cache errors with cacheErrors option', async () => {
      // const cache = createCache({ maxCount: 100 })
      // const failingGenerator = vi.fn(() => {
      //   throw new Error('Cached error')
      // })
      //
      // // With cacheErrors: true, error should be cached
      // try {
      //   cache.getOrGenerate('key', failingGenerator, { cacheErrors: true, errorTTL: 5000 })
      // } catch {}
      //
      // // Second call should throw cached error without calling generator
      // try {
      //   cache.getOrGenerate('key', failingGenerator, { cacheErrors: true, errorTTL: 5000 })
      // } catch {}
      //
      // expect(failingGenerator).toHaveBeenCalledTimes(1)
    })

    it('should return stale value on background refresh error with SWR', async () => {
      // vi.useFakeTimers()
      //
      // const cache = createCache({ maxCount: 100 })
      // let shouldFail = false
      // const generator = vi.fn(async () => {
      //   if (shouldFail) {
      //     throw new Error('Background refresh failed')
      //   }
      //   return 'value'
      // })
      //
      // // Initial successful generation
      // await cache.getOrGenerate('key', generator, {
      //   ttl: 1000,
      //   staleWhileRevalidate: 5000
      // })
      //
      // // Make generator fail
      // shouldFail = true
      //
      // vi.advanceTimersByTime(1500)
      //
      // // Should return stale value even though refresh will fail
      // const result = await cache.getOrGenerate('key', generator, {
      //   ttl: 1000,
      //   staleWhileRevalidate: 5000
      // })
      //
      // expect(result).toBe('value')
      //
      // vi.useRealTimers()
    })
  })

  describe('Concurrency and Race Conditions', () => {
    it('should deduplicate concurrent generator calls for same key', async () => {
      // const cache = createCache({ maxCount: 100 })
      // const generator = vi.fn(async () => {
      //   await new Promise(resolve => setTimeout(resolve, 100))
      //   return 'value'
      // })
      //
      // // Multiple concurrent calls
      // const results = await Promise.all([
      //   cache.getOrGenerate('key', generator),
      //   cache.getOrGenerate('key', generator),
      //   cache.getOrGenerate('key', generator)
      // ])
      //
      // // Generator should only be called once
      // expect(generator).toHaveBeenCalledTimes(1)
      // // All should get same value
      // expect(results).toEqual(['value', 'value', 'value'])
    })

    it('should allow concurrent generation for different keys', async () => {
      // const cache = createCache({ maxCount: 100 })
      // const generator = vi.fn(async (key: string) => {
      //   await new Promise(resolve => setTimeout(resolve, 50))
      //   return `value-${key}`
      // })
      //
      // await Promise.all([
      //   cache.getOrGenerate('key1', generator),
      //   cache.getOrGenerate('key2', generator),
      //   cache.getOrGenerate('key3', generator)
      // ])
      //
      // expect(generator).toHaveBeenCalledTimes(3)
    })

    it('should handle generator timeout with timeout option', async () => {
      // const cache = createCache({ maxCount: 100 })
      // const slowGenerator = async () => {
      //   await new Promise(resolve => setTimeout(resolve, 10000))
      //   return 'slow-value'
      // }
      //
      // await expect(
      //   cache.getOrGenerate('key', slowGenerator, { timeout: 100 })
      // ).rejects.toThrow('timeout')
    })
  })

  describe('Options and Configuration', () => {
    it('should support skipCache option to force regeneration', () => {
      // const cache = createCache({ maxCount: 100 })
      // let counter = 0
      // const generator = vi.fn(() => {
      //   counter++
      //   return `value-${counter}`
      // })
      //
      // cache.getOrGenerate('key', generator)
      //
      // // Force regeneration
      // const result = cache.getOrGenerate('key', generator, { skipCache: true })
      //
      // expect(generator).toHaveBeenCalledTimes(2)
      // expect(result).toBe('value-2')
    })

    it('should support context option to pass to generator', () => {
      // const cache = createCache({ maxCount: 100 })
      // const generator = vi.fn((key: string, context: { userId: string }) => {
      //   return `${key}-${context.userId}`
      // })
      //
      // const result = cache.getOrGenerate('key', generator, {
      //   context: { userId: 'user123' }
      // })
      //
      // expect(generator).toHaveBeenCalledWith('key', { userId: 'user123' })
      // expect(result).toBe('key-user123')
    })

    it('should support onHit callback', () => {
      // const cache = createCache({ maxCount: 100 })
      // const onHit = vi.fn()
      //
      // cache.set('key', 'cached-value')
      //
      // cache.getOrGenerate('key', () => 'new-value', { onHit })
      //
      // expect(onHit).toHaveBeenCalledWith('key', 'cached-value')
    })

    it('should support onMiss callback', () => {
      // const cache = createCache({ maxCount: 100 })
      // const onMiss = vi.fn()
      //
      // cache.getOrGenerate('key', () => 'new-value', { onMiss })
      //
      // expect(onMiss).toHaveBeenCalledWith('key')
    })

    it('should support onGenerate callback after successful generation', () => {
      // const cache = createCache({ maxCount: 100 })
      // const onGenerate = vi.fn()
      //
      // cache.getOrGenerate('key', () => 'generated', { onGenerate })
      //
      // expect(onGenerate).toHaveBeenCalledWith('key', 'generated')
    })
  })

  describe('Type Safety', () => {
    it('should maintain type safety for return values', () => {
      // interface User {
      //   id: number
      //   name: string
      // }
      //
      // const cache = createCache<User>({ maxCount: 100 })
      //
      // const result = cache.getOrGenerate('user:1', () => ({
      //   id: 1,
      //   name: 'Alice'
      // }))
      //
      // // TypeScript should infer result as User
      // expect(result.id).toBe(1)
      // expect(result.name).toBe('Alice')
    })

    it('should handle generic type parameters', () => {
      // const cache = createCache({ maxCount: 100 })
      //
      // const stringResult = cache.getOrGenerate<string>('key1', () => 'string')
      // const numberResult = cache.getOrGenerate<number>('key2', () => 42)
      // const objectResult = cache.getOrGenerate<{ foo: string }>('key3', () => ({ foo: 'bar' }))
      //
      // expect(stringResult).toBe('string')
      // expect(numberResult).toBe(42)
      // expect(objectResult.foo).toBe('bar')
    })
  })

  describe('Integration with LRU Eviction', () => {
    it('should work correctly when cached value is evicted', () => {
      // const cache = createCache({ maxCount: 2 })
      // const generator = vi.fn((key: string) => `value-${key}`)
      //
      // cache.getOrGenerate('key1', generator)
      // cache.getOrGenerate('key2', generator)
      // cache.getOrGenerate('key3', generator) // Should evict key1
      //
      // // key1 was evicted, so generator should be called again
      // cache.getOrGenerate('key1', generator)
      //
      // expect(generator).toHaveBeenCalledTimes(4)
    })

    it('should update LRU order on cache hit', () => {
      // const cache = createCache({ maxCount: 2 })
      // const generator = vi.fn((key: string) => `value-${key}`)
      //
      // cache.getOrGenerate('key1', generator)
      // cache.getOrGenerate('key2', generator)
      //
      // // Access key1 to make it most recently used
      // cache.getOrGenerate('key1', generator)
      //
      // // Add key3, should evict key2 (LRU)
      // cache.getOrGenerate('key3', generator)
      //
      // expect(cache.has('key1')).toBe(true)
      // expect(cache.has('key2')).toBe(false)
      // expect(cache.has('key3')).toBe(true)
    })
  })
})
