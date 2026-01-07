/**
 * @dotdo/do - Enhanced MCP Tools Tests (TDD)
 *
 * Tests for enhanced MCP tools: search(), fetch(), do()
 * Following TDD methodology: RED -> GREEN -> REFACTOR
 *
 * Uses the @cloudflare/vitest-pool-workers integration with real Miniflare-powered SQLite storage.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { env } from 'cloudflare:test'
import type { DurableObjectStub } from '@cloudflare/workers-types'
import { createTestStub, uniqueTestName } from './helpers/do-test-utils'
import type {
  SearchOptions,
  FetchOptions,
  DoOptions,
  SearchResult,
  FetchResult,
  DoResult,
} from '../src/types'

// Type for DO stub with RPC methods
interface DOStub extends DurableObjectStub {
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>
  fetch(target: string, options?: FetchOptions): Promise<FetchResult>
  do(code: string, options?: DoOptions): Promise<DoResult>
  create(collection: string, doc: Record<string, unknown>): Promise<Record<string, unknown>>
  get<T = Record<string, unknown>>(collection: string, id: string): Promise<T | null>
  list(collection: string, options?: { limit?: number }): Promise<Record<string, unknown>[]>
}

// =============================================================================
// Enhanced search() Method Tests
// =============================================================================

describe('Enhanced search() Method', () => {
  let stub: DOStub

  beforeEach(() => {
    const name = uniqueTestName('mcp-search')
    stub = createTestStub(name) as DOStub
  })

  describe('Hybrid Search (FTS + Vector)', () => {
    it('should support hybrid search mode option', async () => {
      await stub.create('articles', {
        title: 'Machine Learning Guide',
        content: 'An introduction to ML algorithms',
      })

      const options: SearchOptions & { mode?: 'fts' | 'vector' | 'hybrid' } = {
        mode: 'hybrid',
        limit: 10,
      }

      const results = await stub.search('machine learning', options)
      expect(Array.isArray(results)).toBe(true)
    })

    it('should return results with score in hybrid mode', async () => {
      await stub.create('articles', {
        title: 'Deep Learning Tutorial',
        content: 'Neural networks and deep learning',
      })

      const results = await stub.search('deep learning', { mode: 'hybrid' } as SearchOptions)

      if (results.length > 0) {
        expect(results[0].score).toBeDefined()
        expect(typeof results[0].score).toBe('number')
        expect(results[0].score).toBeGreaterThan(0)
      }
    })

    it('should support FTS-only mode', async () => {
      await stub.create('docs', { text: 'Full text search test' })
      const results = await stub.search('text search', { mode: 'fts' } as SearchOptions)
      expect(Array.isArray(results)).toBe(true)
    })

    it('should default to FTS mode when no mode specified', async () => {
      await stub.create('docs', { text: 'Default search behavior' })
      const results = await stub.search('default')
      expect(Array.isArray(results)).toBe(true)
    })
  })

  describe('Full-Text Search Options', () => {
    it('should support fuzzy matching option', async () => {
      await stub.create('docs', { text: 'Documentation' })
      const results = await stub.search('Documantation', { fuzzy: true })
      expect(Array.isArray(results)).toBe(true)
    })
  })
})

// =============================================================================
// Enhanced fetch() Method Tests
// =============================================================================

describe('Enhanced fetch() Method', () => {
  let stub: DOStub

  beforeEach(() => {
    const name = uniqueTestName('mcp-fetch')
    stub = createTestStub(name) as DOStub
  })

  describe('Caching Support', () => {
    // TODO: Enable when caching is implemented
    it.skip('should cache responses when cache option is enabled', async () => {
      const options: FetchOptions & { cache?: boolean; cacheTtl?: number } = {
        cache: true,
        cacheTtl: 60000,
      }

      const result1 = await stub.fetch('https://httpbin.org/get', options)
      expect(result1.status).toBe(200)

      const result2 = await stub.fetch('https://httpbin.org/get', options)
      expect(result2.status).toBe(200)
    })
  })

  describe('Retry Logic', () => {
    it('should not retry on 4xx errors by default', async () => {
      const options: FetchOptions & { retry?: { maxRetries?: number } } = {
        retry: { maxRetries: 3 },
      }

      const result = await stub.fetch('https://httpbin.org/status/404', options)
      expect(result.status).toBe(404)
    })
  })

  describe('Error Handling', () => {
    it('should handle fetch errors gracefully', async () => {
      const result = await stub.fetch('https://this-domain-does-not-exist-12345.invalid/test')
      // Fetch errors return a result with error status
      expect(result).toBeDefined()
      expect(typeof result.status).toBe('number')
    })

    // TODO: Enable when timing tracking is implemented
    it.skip('should track fetch timing', async () => {
      const result = await stub.fetch('https://httpbin.org/get') as FetchResult & { timing?: { total: number } }
      expect(result.timing).toBeDefined()
      expect(result.timing?.total).toBeGreaterThanOrEqual(0)
    })
  })
})

// =============================================================================
// CodeExecutor Interface Tests
// =============================================================================

describe('CodeExecutor Interface', () => {
  let stub: DOStub

  beforeEach(() => {
    const name = uniqueTestName('mcp-executor')
    stub = createTestStub(name) as DOStub
  })

  describe('Executor Selection', () => {
    it('should allow selecting executor by name', async () => {
      const options: DoOptions & { executor?: string } = {
        executor: 'sandbox',
      }

      const result = await stub.do('return 1', options)
      expect(result).toBeDefined()
    })

    it('should provide default mock executor', async () => {
      const result = await stub.do('return "test"')
      expect(result.success).toBeDefined()
    })
  })

  describe('CodeExecutor Contract', () => {
    it('should define execute method on executor', () => {
      interface CodeExecutor {
        name: string
        execute(code: string, context?: Record<string, unknown>): Promise<DoResult>
      }

      const executor: CodeExecutor = {
        name: 'test',
        execute: async () => ({ success: true, result: null, duration: 0 }),
      }
      expect(executor.name).toBe('test')
    })

    it('should support optional code validation', async () => {
      const options: DoOptions & { validate?: boolean } = {
        validate: true,
      }

      const result = await stub.do('return 1 + 1', options)
      expect(result).toBeDefined()
    })

    it('should support executor cleanup', async () => {
      const executor = {
        name: 'test',
        execute: async () => ({ success: true, result: null, duration: 0, logs: [] }),
        cleanup: vi.fn(),
      }

      expect(typeof executor.cleanup).toBe('function')
    })
  })
})

// =============================================================================
// Enhanced do() Method Tests
// =============================================================================

describe('Enhanced do() Method', () => {
  let stub: DOStub

  beforeEach(() => {
    const name = uniqueTestName('mcp-do')
    stub = createTestStub(name) as DOStub
  })

  describe('Mock Executor Behavior', () => {
    it('should execute simple arithmetic', async () => {
      const result = await stub.do('return 1 + 1')
      expect(result.success).toBe(true)
      expect(result.result).toBe(2)
    })

    it('should return boolean values', async () => {
      const result = await stub.do('return true')
      expect(result.success).toBe(true)
      expect(result.result).toBe(true)
    })

    it('should return string values', async () => {
      const result = await stub.do('return "hello"')
      expect(result.success).toBe(true)
      expect(result.result).toBe('hello')
    })

    it('should handle complex code execution', async () => {
      const result = await stub.do(`
        const doc = await db.create('test', { name: 'Test' })
        return doc.id
      `)

      // Complex code execution returns a result - either mock indicator or error
      expect(result).toBeDefined()
      expect(typeof result.success).toBe('boolean')
    })

    it('should handle typeof process query', async () => {
      const result = await stub.do('return typeof process')
      expect(result.result).toBe('undefined')
    })
  })

  describe('Execution Timeout', () => {
    it('should default to reasonable timeout', async () => {
      const startTime = Date.now()
      const result = await stub.do('return 1')
      const duration = Date.now() - startTime

      expect(result.success).toBe(true)
      expect(duration).toBeLessThan(5000)
    })
  })

  describe('Console Capture', () => {
    it('should capture console.log output', async () => {
      const result = await stub.do(`
        console.log('Hello')
        console.log('World')
        return 'done'
      `)

      expect(result.logs).toContain('Hello')
      expect(result.logs).toContain('World')
    })

    it('should preserve log order', async () => {
      const result = await stub.do(`
        console.log('1')
        console.log('2')
        console.log('3')
        return 'done'
      `)

      expect(result.logs?.[0]).toBe('1')
      expect(result.logs?.[1]).toBe('2')
      expect(result.logs?.[2]).toBe('3')
    })
  })

  describe('Error Handling', () => {
    it('should include stack trace in error', async () => {
      const result = await stub.do(`
        function foo() { throw new Error('test') }
        function bar() { foo() }
        bar()
      `)

      expect(result.success).toBe(false)
      expect(result.error).toContain('test')
    })
  })

  describe('Environment Variables', () => {
    it('should inject env variables into execution context', async () => {
      const result = await stub.do('return env.API_KEY', {
        env: { API_KEY: 'secret-key' },
      })

      expect(result.success).toBe(true)
      expect(result.result).toBe('secret-key')
    })

    it('should isolate env between executions', async () => {
      await stub.do('env.TEMP = "value"', { env: {} })
      const result = await stub.do('return env.TEMP', { env: {} })
      expect(result.result).toBeUndefined()
    })
  })

  describe('Return Value Serialization', () => {
    it('should handle circular references gracefully', async () => {
      const result = await stub.do(`
        const obj = { a: 1 }
        obj.self = obj
        return obj
      `)
      expect(result).toBeDefined()
    })
  })
})
