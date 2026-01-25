/**
 * Tests for the Execution Factory
 *
 * @module execution/__tests__/index.test
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  execute,
  runModule,
  bash,
  createExecutionContext,
  defaultContext,
} from './index'
import type { ESMModule } from '../types/execution'

describe('Execution Factory', () => {
  describe('execute()', () => {
    it('should route Tier 1 operations to native executor', async () => {
      const result = await execute('json.parse', ['{"key": "value"}'])

      expect(result.success).toBe(true)
      expect(result.tier).toBe(1)
      expect(result.output).toEqual({ key: 'value' })
      expect(result.duration).toBeGreaterThan(0)
    })

    it('should handle unknown operations', async () => {
      const result = await execute('unknown.operation', [])

      // Unknown operations default to tier 4
      expect(result.tier).toBe(4)
    })

    it('should respect tier override in options', async () => {
      const result = await execute('json.parse', ['{}'], { tier: 4 })

      expect(result.tier).toBe(4)
    })

    it('should return error result on failure', async () => {
      const result = await execute('json.parse', ['invalid json'])

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.code).toBe('NATIVE_ERROR')
    })

    it('should include duration on all results', async () => {
      const result = await execute('json.parse', ['{}'])

      expect(result.duration).toBeGreaterThanOrEqual(0)
    })
  })

  // TODO: Skip runModule tests - blob URL dynamic import doesn't work in Node/vitest
  // These tests require Workers runtime or browser environment
  describe.skip('runModule()', () => {
    it('should execute ESM module code', async () => {
      const module: ESMModule = {
        name: 'test-module',
        module: 'export const add = (a, b) => a + b',
      }

      const result = await runModule(module)

      expect(result.success).toBe(true)
      expect(result.tier).toBe(3)
    })

    it('should apply context constraints', async () => {
      const module: ESMModule = {
        name: 'test-module',
        module: 'export const value = 42',
      }

      const result = await runModule(module, {
        timeout: 5000,
        memoryLimit: 50 * 1024 * 1024,
      })

      expect(result.success).toBe(true)
    })
  })

  describe('bash()', () => {
    it('should execute bash commands in sandbox', async () => {
      const result = await bash('echo "Hello"')

      expect(result.tier).toBe(4)
    })
  })

  describe('createExecutionContext()', () => {
    it('should create context with memory filesystem', () => {
      const ctx = createExecutionContext('memory')

      expect(ctx.fs).toBeDefined()
      expect(ctx.execute).toBeInstanceOf(Function)
      expect(ctx.runModule).toBeInstanceOf(Function)
      expect(ctx.bash).toBeInstanceOf(Function)
    })

    it('should share filesystem across operations', async () => {
      const ctx = createExecutionContext('memory')

      await ctx.fs.mkdir('/test', { recursive: true })
      await ctx.fs.writeFile('/test/file.txt', 'content')

      const exists = await ctx.fs.exists('/test/file.txt')
      expect(exists).toBe(true)
    })
  })

  describe('defaultContext', () => {
    it('should be a valid execution context', () => {
      expect(defaultContext.fs).toBeDefined()
      expect(defaultContext.execute).toBeInstanceOf(Function)
    })
  })
})
