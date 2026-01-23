/**
 * Model Selection Tests
 *
 * Tests for model selection and routing logic.
 *
 * @module ai/__tests__/models.test
 */

import { describe, it, expect } from 'vitest'
import {
  selectModel,
  getModelInfo,
  listModels,
  modelSupports,
  getModelProvider,
  estimateCost,
} from './models'
import type { ModelConstraints } from '../types/ai'

describe('Model Selection', () => {
  describe('selectModel', () => {
    describe('Single characteristics', () => {
      it('should select fastest model for "fast"', () => {
        const model = selectModel('fast')
        expect(['Instant', 'Fast']).toContain(model.speedTier)
      })

      it('should select cheapest model for "cost"', () => {
        const model = selectModel('cost')
        expect(['Free', 'Cheap']).toContain(model.costTier)
      })

      it('should select highest quality for "best"', () => {
        const model = selectModel('best')
        // Should be one of the top quality models
        expect([
          'claude-opus-4-20250514',
          'o1',
          'gpt-4o',
          'claude-sonnet-4-20250514',
        ]).toContain(model.id)
      })

      it('should select reasoning model for "reasoning"', () => {
        const model = selectModel('reasoning')
        expect(['o1', 'deepseek-reasoner', 'claude-opus-4-20250514']).toContain(
          model.id
        )
      })

      it('should select vision-capable model for "vision"', () => {
        const model = selectModel('vision')
        expect(model.capabilities.vision).toBe(true)
      })

      it('should select code model for "code"', () => {
        const model = selectModel('code')
        expect([
          'claude-sonnet-4-20250514',
          'codestral-latest',
          'deepseek-chat',
        ]).toContain(model.id)
      })

      it('should select long context model for "long"', () => {
        const model = selectModel('long')
        expect(model.capabilities.contextWindow).toBeGreaterThanOrEqual(1000000)
      })
    })

    describe('Combo priorities', () => {
      it('should select fast but high quality for "fast,best"', () => {
        const model = selectModel('fast,best')
        // Should be fast tier but also high quality
        expect(['Instant', 'Fast']).toContain(model.speedTier)
      })

      it('should select best but affordable for "best,cost"', () => {
        const model = selectModel('best,cost')
        // Should not select expensive models
        expect(model.costTier).not.toBe('expensive')
      })

      it('should select code model with low latency for "code,fast"', () => {
        const model = selectModel('code,fast')
        expect(['Instant', 'Fast']).toContain(model.speedTier)
      })

      it('should select reasoning with cost consideration for "reasoning,cost"', () => {
        const model = selectModel('reasoning,cost')
        expect(model.costTier).not.toBe('expensive')
      })
    })

    describe('Specific model ID', () => {
      it('should return specific model when ID provided', () => {
        const model = selectModel('gpt-4o')
        expect(model.id).toBe('gpt-4o')
      })

      it('should return specific model for Anthropic', () => {
        const model = selectModel('claude-sonnet-4-20250514')
        expect(model.id).toBe('claude-sonnet-4-20250514')
      })
    })

    describe('With constraints', () => {
      it('should filter by required capabilities', () => {
        const constraints: ModelConstraints = {
          requires: ['vision', 'functionCalling'],
        }
        const model = selectModel('fast', constraints)
        expect(model.capabilities.vision).toBe(true)
        expect(model.capabilities.functionCalling).toBe(true)
      })

      it('should filter by max cost', () => {
        const constraints: ModelConstraints = {
          maxCost: 1, // Very low cost threshold
        }
        const model = selectModel('best', constraints)
        expect(['Free', 'Cheap']).toContain(model.costTier)
      })

      it('should filter by min quality', () => {
        const constraints: ModelConstraints = {
          minQuality: 0.9,
        }
        const model = selectModel('fast', constraints)
        // Should only include high quality models
        expect([
          'claude-opus-4-20250514',
          'o1',
          'gpt-4o',
          'claude-sonnet-4-20250514',
        ]).toContain(model.id)
      })

      it('should throw when no models match constraints', () => {
        const constraints: ModelConstraints = {
          requires: ['vision'],
          maxCost: 0.0001, // Impossibly low
          minQuality: 0.99, // Impossibly high
        }
        expect(() => selectModel('best', constraints)).toThrow()
      })
    })
  })

  describe('getModelInfo', () => {
    it('should return model info for valid ID', () => {
      const info = getModelInfo('gpt-4o')
      expect(info).toBeDefined()
      expect(info?.name).toBe('GPT-4o')
      expect(info?.provider).toBe('openai')
    })

    it('should return undefined for invalid ID', () => {
      const info = getModelInfo('nonexistent-model')
      expect(info).toBeUndefined()
    })
  })

  describe('listModels', () => {
    it('should return all models', () => {
      const models = listModels()
      expect(models.length).toBeGreaterThan(0)
    })

    it('should filter by provider', () => {
      const models = listModels('openai')
      expect(models.every((m) => m.provider === 'openai')).toBe(true)
    })

    it('should filter by anthropic provider', () => {
      const models = listModels('anthropic')
      expect(models.every((m) => m.provider === 'anthropic')).toBe(true)
      expect(models.length).toBeGreaterThan(0)
    })
  })

  describe('modelSupports', () => {
    it('should return true for supported capability', () => {
      expect(modelSupports('gpt-4o', 'vision')).toBe(true)
      expect(modelSupports('gpt-4o', 'functionCalling')).toBe(true)
    })

    it('should return false for unsupported capability', () => {
      expect(modelSupports('o1', 'functionCalling')).toBe(false)
    })

    it('should return false for invalid model', () => {
      expect(modelSupports('nonexistent', 'vision')).toBe(false)
    })
  })

  describe('getModelProvider', () => {
    it('should return provider for valid model', () => {
      expect(getModelProvider('gpt-4o')).toBe('openai')
      expect(getModelProvider('claude-sonnet-4-20250514')).toBe('anthropic')
    })

    it('should return undefined for invalid model', () => {
      expect(getModelProvider('nonexistent')).toBeUndefined()
    })
  })

  describe('estimateCost', () => {
    it('should estimate cost for GPT-4o', () => {
      // GPT-4o: $2.50 input, $10 output per 1M
      const cost = estimateCost('gpt-4o', 1000, 1000)
      expect(cost).toBeGreaterThan(0)
    })

    it('should estimate cost for Claude', () => {
      const cost = estimateCost('claude-sonnet-4-20250514', 1000, 1000)
      expect(cost).toBeGreaterThan(0)
    })

    it('should return 0 for unknown model', () => {
      const cost = estimateCost('nonexistent', 1000, 1000)
      expect(cost).toBe(0)
    })

    it('should scale with token count', () => {
      const cost1 = estimateCost('gpt-4o', 1000, 1000)
      const cost2 = estimateCost('gpt-4o', 2000, 2000)
      expect(cost2).toBeCloseTo(cost1 * 2)
    })
  })
})
