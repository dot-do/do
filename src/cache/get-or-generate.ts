/**
 * @dotdo/do - getOrGenerate() Implementation (GREEN Phase - do-a06)
 *
 * A lazy caching function that:
 * - Returns cached value if available (cache hit)
 * - Calls generator and caches result if not available (cache miss)
 * - Supports TTL expiration
 * - Supports stale-while-revalidate pattern
 * - Handles errors gracefully (don't cache failures by default)
 * - Deduplicates concurrent generator calls for same key
 */

import { LRUCache, type LRUCacheOptions } from '../lru-cache'

/**
 * Options for getOrGenerate() calls
 */
export interface GetOrGenerateOptions<C = unknown> {
  /** TTL in milliseconds for this specific item */
  ttl?: number
  /** Stale-while-revalidate window in milliseconds after TTL */
  staleWhileRevalidate?: number
  /** Whether to cache errors (default: false) */
  cacheErrors?: boolean
  /** TTL for cached errors in milliseconds */
  errorTTL?: number
  /** Skip cache and force regeneration */
  skipCache?: boolean
  /** Timeout for generator function in milliseconds */
  timeout?: number
  /** Context to pass to generator function */
  context?: C
  /** Callback when cache hit occurs */
  onHit?: (key: string, value: unknown) => void
  /** Callback when cache miss occurs */
  onMiss?: (key: string) => void
  /** Callback after successful generation */
  onGenerate?: (key: string, value: unknown) => void
}

/**
 * Options for creating a cache with getOrGenerate support
 */
export interface CacheOptions<V = unknown> extends LRUCacheOptions<V> {
  /** Default TTL for getOrGenerate calls */
  defaultTTL?: number
}

/**
 * Internal entry with metadata for TTL and SWR support
 */
interface CacheEntryMeta {
  /** When the value was cached */
  cachedAt: number
  /** TTL used when caching */
  ttl?: number
  /** Stale-while-revalidate window */
  staleWhileRevalidate?: number
  /** Whether this is a cached error */
  isError?: boolean
}

/**
 * Wrapper to store value with metadata
 */
interface CacheEntryWrapper<V> {
  value: V
  meta: CacheEntryMeta
}

/**
 * Type for generator functions
 */
export type GeneratorFn<V, C = unknown> = (key: string, context?: C) => V | Promise<V>

/**
 * Cache with getOrGenerate support
 */
export class Cache<V = unknown> {
  private lru: LRUCache<CacheEntryWrapper<V>>
  private readonly _defaultTTL?: number
  private readonly inflight = new Map<string, Promise<V>>()
  private readonly revalidating = new Set<string>()

  constructor(options: CacheOptions<V>) {
    // Adjust size calculator to account for wrapper
    const originalSizeCalc = options.sizeCalculator
    const wrappedSizeCalc = originalSizeCalc
      ? (wrapper: CacheEntryWrapper<V>) => originalSizeCalc(wrapper.value)
      : undefined

    this.lru = new LRUCache<CacheEntryWrapper<V>>({
      ...options,
      sizeCalculator: wrappedSizeCalc,
    })
    this._defaultTTL = options.defaultTTL
  }

  /**
   * Get a value from cache, or generate and cache it if not present
   */
  getOrGenerate<T extends V = V, C = unknown>(
    key: string,
    generator: GeneratorFn<T, C>,
    options?: GetOrGenerateOptions<C>
  ): T | Promise<T> {
    const {
      ttl = this._defaultTTL,
      staleWhileRevalidate,
      cacheErrors = false,
      errorTTL,
      skipCache = false,
      timeout,
      context,
      onHit,
      onMiss,
      onGenerate,
    } = options ?? {}

    // Skip cache if requested
    if (!skipCache) {
      const wrapper = this.lru.get(key) as CacheEntryWrapper<T> | undefined

      if (wrapper !== undefined) {
        const { value, meta } = wrapper

        // Check if it's a cached error
        if (meta.isError) {
          onHit?.(key, value)
          throw value
        }

        // Check TTL expiration
        if (meta.ttl !== undefined) {
          const age = Date.now() - meta.cachedAt
          const isExpired = age > meta.ttl
          const isStale = isExpired && meta.staleWhileRevalidate !== undefined
          const isPastStaleWindow = isExpired && meta.staleWhileRevalidate !== undefined
            && age > meta.ttl + meta.staleWhileRevalidate

          if (!isExpired) {
            // Fresh value
            onHit?.(key, value)
            return value
          }

          if (isStale && !isPastStaleWindow) {
            // Return stale value, trigger background revalidation
            onHit?.(key, value)
            this.backgroundRevalidate(key, generator, {
              ttl,
              staleWhileRevalidate,
              cacheErrors,
              errorTTL,
              context,
            })
            return value
          }

          // Past stale window or no SWR, need to regenerate
        } else {
          // No TTL, value is always fresh
          onHit?.(key, value)
          return value
        }
      }
    }

    // Cache miss
    onMiss?.(key)

    // Check for in-flight request (deduplication)
    const inflight = this.inflight.get(key)
    if (inflight) {
      return inflight as Promise<T>
    }

    // Generate value
    try {
      const result = generator(key, context)

      // Handle async generator
      if (result instanceof Promise) {
        const promise = this.handleAsyncGenerator<T, C>(
          key,
          result,
          { ttl, staleWhileRevalidate, cacheErrors, errorTTL, timeout, onGenerate }
        )
        this.inflight.set(key, promise as Promise<V>)
        return promise
      }

      // Sync generator
      this.cacheValue(key, result as T, { ttl, staleWhileRevalidate })
      onGenerate?.(key, result)
      return result as T
    } catch (error) {
      if (cacheErrors) {
        this.cacheError(key, error as T, errorTTL)
      }
      throw error
    }
  }

  /**
   * Handle async generator with optional timeout
   */
  private async handleAsyncGenerator<T extends V, C>(
    key: string,
    promise: Promise<T>,
    options: {
      ttl?: number
      staleWhileRevalidate?: number
      cacheErrors?: boolean
      errorTTL?: number
      timeout?: number
      onGenerate?: (key: string, value: unknown) => void
    }
  ): Promise<T> {
    const { ttl, staleWhileRevalidate, cacheErrors, errorTTL, timeout, onGenerate } = options

    try {
      let result: T

      if (timeout !== undefined) {
        result = await Promise.race([
          promise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Generator timeout')), timeout)
          ),
        ])
      } else {
        result = await promise
      }

      this.cacheValue(key, result, { ttl, staleWhileRevalidate })
      onGenerate?.(key, result)
      return result
    } catch (error) {
      if (cacheErrors) {
        this.cacheError(key, error as T, errorTTL)
      }
      throw error
    } finally {
      this.inflight.delete(key)
    }
  }

  /**
   * Background revalidation for stale-while-revalidate
   */
  private backgroundRevalidate<T extends V, C>(
    key: string,
    generator: GeneratorFn<T, C>,
    options: {
      ttl?: number
      staleWhileRevalidate?: number
      cacheErrors?: boolean
      errorTTL?: number
      context?: C
    }
  ): void {
    // Prevent multiple concurrent revalidations
    if (this.revalidating.has(key)) {
      return
    }

    this.revalidating.add(key)

    // Run revalidation in background
    Promise.resolve().then(async () => {
      try {
        const result = await generator(key, options.context)
        this.cacheValue(key, result, {
          ttl: options.ttl,
          staleWhileRevalidate: options.staleWhileRevalidate,
        })
      } catch {
        // Silently fail background revalidation, keep stale value
      } finally {
        this.revalidating.delete(key)
      }
    })
  }

  /**
   * Cache a value with metadata
   */
  private cacheValue<T extends V>(
    key: string,
    value: T,
    options: { ttl?: number; staleWhileRevalidate?: number }
  ): void {
    const wrapper: CacheEntryWrapper<T> = {
      value,
      meta: {
        cachedAt: Date.now(),
        ttl: options.ttl,
        staleWhileRevalidate: options.staleWhileRevalidate,
      },
    }

    // Set with TTL + SWR window as the LRU TTL (to keep stale values available)
    const lruTTL = options.ttl !== undefined && options.staleWhileRevalidate !== undefined
      ? options.ttl + options.staleWhileRevalidate
      : options.ttl

    this.lru.set(key, wrapper as CacheEntryWrapper<V>, { ttl: lruTTL })
  }

  /**
   * Cache an error
   */
  private cacheError<T extends V>(key: string, error: T, errorTTL?: number): void {
    const wrapper: CacheEntryWrapper<T> = {
      value: error,
      meta: {
        cachedAt: Date.now(),
        ttl: errorTTL,
        isError: true,
      },
    }

    this.lru.set(key, wrapper as CacheEntryWrapper<V>, { ttl: errorTTL })
  }

  /**
   * Set a value directly in cache
   */
  set(key: string, value: V, options?: { ttl?: number }): this {
    const wrapper: CacheEntryWrapper<V> = {
      value,
      meta: {
        cachedAt: Date.now(),
        ttl: options?.ttl,
      },
    }
    this.lru.set(key, wrapper, { ttl: options?.ttl })
    return this
  }

  /**
   * Get a value from cache
   */
  get(key: string): V | undefined {
    const wrapper = this.lru.get(key)
    if (wrapper === undefined) {
      return undefined
    }

    // Check TTL expiration
    if (wrapper.meta.ttl !== undefined) {
      const age = Date.now() - wrapper.meta.cachedAt
      if (age > wrapper.meta.ttl) {
        return undefined
      }
    }

    return wrapper.value
  }

  /**
   * Check if a key exists in cache (and is not expired)
   */
  has(key: string): boolean {
    const wrapper = this.lru.get(key)
    if (wrapper === undefined) {
      return false
    }

    // Check TTL expiration
    if (wrapper.meta.ttl !== undefined) {
      const age = Date.now() - wrapper.meta.cachedAt
      if (age > wrapper.meta.ttl) {
        return false
      }
    }

    return true
  }

  /**
   * Delete a key from cache
   */
  delete(key: string): boolean {
    return this.lru.delete(key)
  }

  /**
   * Clear all items from cache
   */
  clear(): void {
    this.lru.clear()
    this.inflight.clear()
    this.revalidating.clear()
  }

  /**
   * Get the current number of items in cache
   */
  get size(): number {
    return this.lru.size
  }
}

/**
 * Create a new cache with getOrGenerate support
 */
export function createCache<V = unknown>(options: CacheOptions<V>): Cache<V> {
  return new Cache(options)
}

/**
 * Standalone getOrGenerate function that creates a temporary cache
 * This is mainly for convenience; prefer using createCache() for better performance
 */
export function getOrGenerate<V, C = unknown>(
  key: string,
  generator: GeneratorFn<V, C>,
  options?: GetOrGenerateOptions<C> & { cache?: Cache<V> }
): V | Promise<V> {
  const cache = options?.cache ?? new Cache<V>({ maxCount: 1 })
  return cache.getOrGenerate(key, generator, options)
}
