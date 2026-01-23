/**
 * Cascade Context Implementation
 *
 * Provides cascade execution with fallback tiers:
 * code -> generative -> agentic -> human
 *
 * Each tier is tried in order until one succeeds.
 * This enables graceful degradation from fast/cheap to slow/expensive operations.
 *
 * @example
 * ```typescript
 * const { result, tier } = await $.cascade({
 *   // Try deterministic code first
 *   code: () => lookupInCache(query),
 *
 *   // Fall back to AI generation
 *   generative: () => $.ai`answer ${query}`,
 *
 *   // Use agent for complex tasks
 *   agentic: () => $.ai.do`research and answer ${query}`,
 *
 *   // Final fallback to human
 *   human: () => requestHumanHelp(query)
 * })
 *
 * console.log(`Resolved at tier: ${tier}`)
 * ```
 *
 * @module context/cascade
 */

import type { DOCascadeContext } from '../types/context'

/**
 * Cascade tier names in execution order
 */
export const CASCADE_TIERS = ['code', 'generative', 'agentic', 'human'] as const

/**
 * Cascade tier type
 */
export type CascadeTier = typeof CASCADE_TIERS[number]

/**
 * Cascade options
 */
export interface CascadeOptions<T> {
  /** Deterministic code execution (fastest, cheapest) */
  code?: () => T | Promise<T>
  /** AI generation (fast, moderate cost) */
  generative?: () => T | Promise<T>
  /** Agentic execution with tools (slower, higher cost) */
  agentic?: () => T | Promise<T>
  /** Human-in-the-loop (slowest, highest cost) */
  human?: () => T | Promise<T>
}

/**
 * Cascade result
 */
export interface CascadeResult<T> {
  /** The result value */
  result: T
  /** The tier that produced the result */
  tier: CascadeTier
}

/**
 * Cascade execution error
 */
export class CascadeError extends Error {
  constructor(
    public readonly failedTiers: CascadeTier[],
    public readonly errors: Map<CascadeTier, Error>
  ) {
    const tierList = failedTiers.join(', ')
    super(`All cascade tiers failed: ${tierList}`)
    this.name = 'CascadeError'
  }
}

/**
 * Execute cascade with fallback tiers
 *
 * Tries each tier in order (code -> generative -> agentic -> human)
 * until one succeeds. A tier "succeeds" if it:
 * - Returns a non-undefined value
 * - Does not throw an error
 *
 * @param options - Cascade options with tier functions
 * @returns Result with value and tier name
 * @throws CascadeError if all tiers fail
 */
async function executeCascade<T>(
  options: CascadeOptions<T>
): Promise<CascadeResult<T>> {
  const failedTiers: CascadeTier[] = []
  const errors = new Map<CascadeTier, Error>()

  for (const tier of CASCADE_TIERS) {
    const fn = options[tier]

    // Skip if tier not provided
    if (!fn) {
      continue
    }

    try {
      console.log(`[Cascade] Trying tier: ${tier}`)
      const result = await fn()

      // Check if result is valid (not undefined)
      if (result !== undefined) {
        console.log(`[Cascade] Success at tier: ${tier}`)
        return { result, tier }
      }

      // Result was undefined, try next tier
      console.log(`[Cascade] Tier ${tier} returned undefined, trying next`)
      failedTiers.push(tier)
    } catch (error) {
      // Tier threw an error, record it and try next
      console.log(`[Cascade] Tier ${tier} failed:`, error)
      failedTiers.push(tier)
      errors.set(tier, error instanceof Error ? error : new Error(String(error)))
    }
  }

  // All tiers failed
  throw new CascadeError(failedTiers, errors)
}

/**
 * Create the Cascade Context
 *
 * @returns DOCascadeContext implementation
 */
export function createCascadeContext(): DOCascadeContext {
  return executeCascade as DOCascadeContext
}

// =============================================================================
// Cascade Utilities
// =============================================================================

/**
 * Create a cached code tier function
 *
 * Wraps a function with caching to make the code tier faster on subsequent calls.
 *
 * @param fn - Function to cache
 * @param cache - Cache storage (Map-like)
 * @param keyFn - Function to generate cache key
 * @returns Cached function
 */
export function withCache<T, Args extends unknown[]>(
  fn: (...args: Args) => T | Promise<T>,
  cache: Map<string, T>,
  keyFn: (...args: Args) => string
): (...args: Args) => T | Promise<T> {
  return async (...args: Args): Promise<T> => {
    const key = keyFn(...args)

    // Check cache
    const cached = cache.get(key)
    if (cached !== undefined) {
      console.log(`[Cascade] Cache hit for key: ${key}`)
      return cached
    }

    // Execute and cache
    const result = await fn(...args)
    cache.set(key, result)
    console.log(`[Cascade] Cached result for key: ${key}`)

    return result
  }
}

/**
 * Create a timeout wrapper for tier functions
 *
 * If the function doesn't complete within the timeout, it rejects
 * and the cascade moves to the next tier.
 *
 * @param fn - Function to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @returns Wrapped function with timeout
 */
export function withTimeout<T>(
  fn: () => T | Promise<T>,
  timeoutMs: number
): () => Promise<T> {
  return (): Promise<T> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout after ${timeoutMs}ms`))
      }, timeoutMs)

      Promise.resolve(fn())
        .then((result) => {
          clearTimeout(timeout)
          resolve(result)
        })
        .catch((error) => {
          clearTimeout(timeout)
          reject(error)
        })
    })
  }
}

/**
 * Create a retry wrapper for tier functions
 *
 * Retries the function a specified number of times before giving up.
 *
 * @param fn - Function to wrap
 * @param maxRetries - Maximum retry attempts
 * @param delayMs - Delay between retries
 * @returns Wrapped function with retry logic
 */
export function withRetry<T>(
  fn: () => T | Promise<T>,
  maxRetries: number,
  delayMs = 1000
): () => Promise<T> {
  return async (): Promise<T> => {
    let lastError: Error | undefined

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.log(`[Cascade] Retry attempt ${attempt + 1}/${maxRetries + 1} failed`)

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delayMs))
        }
      }
    }

    throw lastError
  }
}

/**
 * Tier cost estimates (relative units)
 */
export const TIER_COSTS: Record<CascadeTier, number> = {
  code: 1,        // Cheapest - just CPU
  generative: 10, // AI inference costs
  agentic: 100,   // Multiple AI calls + tools
  human: 1000,    // Human labor costs
}

/**
 * Tier latency estimates (milliseconds)
 */
export const TIER_LATENCIES: Record<CascadeTier, number> = {
  code: 10,        // Sub-millisecond to milliseconds
  generative: 1000, // 1-5 seconds typical
  agentic: 10000,   // 10-60 seconds typical
  human: 3600000,   // Minutes to hours
}
