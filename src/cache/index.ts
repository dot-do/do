/**
 * @dotdo/do - Cache Module
 *
 * High-performance caching utilities including:
 * - LRU cache with count/size limits and TTL
 * - getOrGenerate() for lazy computation with caching
 * - Stale-while-revalidate support
 */

export {
  Cache,
  createCache,
  getOrGenerate,
  type CacheOptions,
  type GetOrGenerateOptions,
  type GeneratorFn,
} from './get-or-generate'

// Re-export LRU cache types for convenience
export {
  LRUCache,
  type LRUCacheOptions,
  type SetOptions,
  type EvictionReason,
} from '../lru-cache'
