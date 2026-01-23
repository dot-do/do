/**
 * Tests for Cascade Context
 *
 * @module context/__tests__/cascade
 */

import { describe, it, expect, vi } from 'vitest'
import {
  createCascadeContext,
  CascadeError,
  withCache,
  withTimeout,
  withRetry,
  TIER_COSTS,
  TIER_LATENCIES,
} from './cascade'

describe('CascadeContext', () => {
  const cascade = createCascadeContext()

  describe('Tier execution order', () => {
    it('should try code tier first', async () => {
      const codeFn = vi.fn().mockReturnValue('code result')
      const generativeFn = vi.fn()

      const { result, tier } = await cascade({
        code: codeFn,
        generative: generativeFn,
      })

      expect(result).toBe('code result')
      expect(tier).toBe('code')
      expect(codeFn).toHaveBeenCalled()
      expect(generativeFn).not.toHaveBeenCalled()
    })

    it('should fall back to generative if code fails', async () => {
      const codeFn = vi.fn().mockRejectedValue(new Error('Code failed'))
      const generativeFn = vi.fn().mockReturnValue('generative result')

      const { result, tier } = await cascade({
        code: codeFn,
        generative: generativeFn,
      })

      expect(result).toBe('generative result')
      expect(tier).toBe('generative')
    })

    it('should fall back to agentic if generative fails', async () => {
      const { result, tier } = await cascade({
        code: () => { throw new Error('Code failed') },
        generative: () => { throw new Error('Generative failed') },
        agentic: () => 'agentic result',
      })

      expect(result).toBe('agentic result')
      expect(tier).toBe('agentic')
    })

    it('should fall back to human as last resort', async () => {
      const { result, tier } = await cascade({
        code: () => { throw new Error('Code failed') },
        generative: () => { throw new Error('Generative failed') },
        agentic: () => { throw new Error('Agentic failed') },
        human: () => 'human result',
      })

      expect(result).toBe('human result')
      expect(tier).toBe('human')
    })
  })

  describe('Undefined results', () => {
    it('should continue if code returns undefined', async () => {
      const { result, tier } = await cascade({
        code: () => undefined,
        generative: () => 'generative result',
      })

      expect(result).toBe('generative result')
      expect(tier).toBe('generative')
    })
  })

  describe('Error handling', () => {
    it('should throw CascadeError if all tiers fail', async () => {
      await expect(
        cascade({
          code: () => { throw new Error('Code failed') },
          generative: () => { throw new Error('Generative failed') },
        })
      ).rejects.toThrow(CascadeError)
    })

    it('should include failed tiers in error', async () => {
      try {
        await cascade({
          code: () => { throw new Error('Code failed') },
          generative: () => { throw new Error('Generative failed') },
        })
      } catch (error) {
        expect(error).toBeInstanceOf(CascadeError)
        expect((error as CascadeError).failedTiers).toContain('code')
        expect((error as CascadeError).failedTiers).toContain('generative')
      }
    })

    it('should include tier errors in error', async () => {
      try {
        await cascade({
          code: () => { throw new Error('Code failed') },
        })
      } catch (error) {
        expect(error).toBeInstanceOf(CascadeError)
        expect((error as CascadeError).errors.get('code')?.message).toBe('Code failed')
      }
    })
  })

  describe('Skipping tiers', () => {
    it('should skip tiers not provided', async () => {
      const { result, tier } = await cascade({
        generative: () => 'generative result',
      })

      expect(result).toBe('generative result')
      expect(tier).toBe('generative')
    })

    it('should work with only human tier', async () => {
      const { result, tier } = await cascade({
        human: () => 'human result',
      })

      expect(result).toBe('human result')
      expect(tier).toBe('human')
    })
  })

  describe('Async functions', () => {
    it('should handle async tier functions', async () => {
      const { result, tier } = await cascade({
        code: async () => {
          await new Promise(resolve => setTimeout(resolve, 10))
          return 'async result'
        },
      })

      expect(result).toBe('async result')
      expect(tier).toBe('code')
    })
  })
})

describe('Cascade Utilities', () => {
  describe('withCache', () => {
    it('should cache results', async () => {
      const cache = new Map<string, string>()
      const fn = vi.fn().mockResolvedValue('result')
      const cachedFn = withCache(fn, cache, (key: string) => key)

      await cachedFn('key1')
      await cachedFn('key1')

      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should return cached value on hit', async () => {
      const cache = new Map<string, string>()
      cache.set('key1', 'cached value')

      const fn = vi.fn()
      const cachedFn = withCache(fn, cache, (key: string) => key)

      const result = await cachedFn('key1')

      expect(result).toBe('cached value')
      expect(fn).not.toHaveBeenCalled()
    })
  })

  describe('withTimeout', () => {
    it('should resolve if within timeout', async () => {
      const fn = () => new Promise(resolve => setTimeout(() => resolve('result'), 10))
      const timedFn = withTimeout(fn, 100)

      const result = await timedFn()
      expect(result).toBe('result')
    })

    it('should reject if timeout exceeded', async () => {
      const fn = () => new Promise(resolve => setTimeout(() => resolve('result'), 100))
      const timedFn = withTimeout(fn, 10)

      await expect(timedFn()).rejects.toThrow('Timeout')
    })
  })

  describe('withRetry', () => {
    it('should succeed without retry if first attempt works', async () => {
      const fn = vi.fn().mockResolvedValue('result')
      const retryFn = withRetry(fn, 3)

      const result = await retryFn()

      expect(result).toBe('result')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should retry on failure', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success')

      const retryFn = withRetry(fn, 3, 1)

      const result = await retryFn()

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('should fail after max retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Always fails'))
      const retryFn = withRetry(fn, 2, 1)

      await expect(retryFn()).rejects.toThrow('Always fails')
      expect(fn).toHaveBeenCalledTimes(3) // 1 initial + 2 retries
    })
  })
})

describe('Tier Constants', () => {
  it('should have costs in increasing order', () => {
    expect(TIER_COSTS.code).toBeLessThan(TIER_COSTS.generative)
    expect(TIER_COSTS.generative).toBeLessThan(TIER_COSTS.agentic)
    expect(TIER_COSTS.agentic).toBeLessThan(TIER_COSTS.human)
  })

  it('should have latencies in increasing order', () => {
    expect(TIER_LATENCIES.code).toBeLessThan(TIER_LATENCIES.generative)
    expect(TIER_LATENCIES.generative).toBeLessThan(TIER_LATENCIES.agentic)
    expect(TIER_LATENCIES.agentic).toBeLessThan(TIER_LATENCIES.human)
  })
})
