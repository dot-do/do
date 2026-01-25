/**
 * Tests for AI Context
 *
 * @module context/__tests__/ai
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createAIContext } from './ai'
import type { AIContext } from '../types/context'

describe('AIContext', () => {
  let ai: AIContext
  let mockState: { env: Record<string, unknown> }

  beforeEach(() => {
    mockState = { env: {} }
    ai = createAIContext(mockState)
  })

  describe('$.ai`template`', () => {
    it('should be a function', () => {
      expect(typeof ai).toBe('function')
    })

    it('should handle tagged template calls', async () => {
      const result = await ai`hello world`
      expect(result).toBeDefined()
    })

    it('should interpolate template values', async () => {
      const name = 'Claude'
      const result = await ai`hello ${name}`
      expect(result).toContain('hello Claude')
    })
  })

  describe('$.ai.is`template`', () => {
    it('should return a boolean', async () => {
      const result = await ai.is`the sky is blue`
      expect(typeof result).toBe('boolean')
    })
  })

  describe('$.ai.list`template`', () => {
    it('should return an array', async () => {
      const result = await ai.list`5 items`
      expect(Array.isArray(result)).toBe(true)
    })

    it('should be chainable', async () => {
      const list = await ai.list`5 items`
      const result = list.map((item: string) => item.toUpperCase())

      expect(Array.isArray(result)).toBe(true)
    })

    it('should support filter chaining', async () => {
      const list = await ai.list`5 items`
      const result = list.filter((item: string) => item.includes('1'))

      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('$.ai.write`template`', () => {
    it('should return a string', async () => {
      const result = await ai.write`marketing copy for product`
      expect(typeof result).toBe('string')
    })
  })

  describe('$.ai.summarize`template`', () => {
    it('should return a string', async () => {
      const result = await ai.summarize`long document text here`
      expect(typeof result).toBe('string')
    })
  })

  describe('$.ai.code`template`', () => {
    it('should return a string', async () => {
      const result = await ai.code`function to add two numbers`
      expect(typeof result).toBe('string')
    })
  })

  describe('$.ai.do`template`', () => {
    it('should return summary and actions', async () => {
      const result = await ai.do`research topic and summarize`
      expect(result).toHaveProperty('summary')
      expect(result).toHaveProperty('actions')
      expect(Array.isArray(result.actions)).toBe(true)
    })
  })

  describe('$.ai.extract`template`', () => {
    // TODO: generateStructured returns {} - needs proper implementation
    it.skip('should return an array', async () => {
      const result = await ai.extract`named entities from text`
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('$.ai.embed(text)', () => {
    it('should return a number array', async () => {
      const result = await ai.embed('hello world')
      expect(Array.isArray(result)).toBe(true)
      expect(result.every(n => typeof n === 'number')).toBe(true)
    })

    it('should return a vector of expected dimensions', async () => {
      const result = await ai.embed('hello world')
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('$.ai.image`template`', () => {
    it('should return an object with url', async () => {
      const result = await ai.image`hero image for product`
      expect(result).toHaveProperty('url')
      expect(typeof result.url).toBe('string')
    })
  })

  describe('$.ai.video`template`', () => {
    it('should return an object with url', async () => {
      const result = await ai.video`explainer video`
      expect(result).toHaveProperty('url')
      expect(typeof result.url).toBe('string')
    })
  })

  describe('$.ai.speak`template`', () => {
    it('should return an ArrayBuffer', async () => {
      const result = await ai.speak`hello world`
      expect(result).toBeInstanceOf(ArrayBuffer)
    })
  })

  describe('$.ai.transcribe(audio)', () => {
    it('should return a string', async () => {
      const audio = new ArrayBuffer(1000)
      const result = await ai.transcribe(audio)
      expect(typeof result).toBe('string')
    })
  })
})
