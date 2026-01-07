import { vi } from 'vitest'

vi.mock('cloudflare:workers', () => {
  class MockDurableObject<Env = unknown> {
    protected ctx: unknown
    protected env: Env
    constructor(ctx: unknown, env: Env) {
      this.ctx = ctx
      this.env = env
    }
  }
  return { DurableObject: MockDurableObject }
})

/**
 * @dotdo/do - Fuzzy Traversal Stubs Tests (GREEN Phase)
 *
 * Issue: do-9q2 - GREEN: Implement fuzzy traversal stubs
 *
 * GREEN Phase Implementation:
 * - Add SearchProvider interface for future vector integration
 * - Implement fuzzy traversal with stub that returns empty (no vector DB yet)
 * - Log warning when fuzzy mode used without SearchProvider
 *
 * Tests cover:
 * - ~> forward fuzzy operator (returns empty stub for now)
 * - <~ backward fuzzy operator (returns empty stub for now)
 * - Threshold option acceptance
 * - SearchProvider interface
 * - Console warnings when no SearchProvider
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DO } from '../../src/do'
import type { Thing, TraverseOptions } from '../../src/types'

/**
 * Create an in-memory SQLite mock for testing
 */
function createMockSqlStorage() {
  const things: Map<string, Record<string, unknown>> = new Map()
  const relationships: Map<string, Record<string, unknown>> = new Map()

  return {
    exec(query: string, ...params: unknown[]) {
      const results: unknown[] = []
      const normalizedQuery = query.trim().toUpperCase()

      // CREATE TABLE / CREATE INDEX statements
      if (normalizedQuery.startsWith('CREATE TABLE') || normalizedQuery.startsWith('CREATE INDEX')) {
        return { toArray: () => results }
      }

      // INSERT INTO things
      if (normalizedQuery.startsWith('INSERT') && query.toLowerCase().includes('things')) {
        const [ns, type, id, url, data, created_at, updated_at] = params as [string, string, string, string, string, string, string]
        things.set(url, { ns, type, id, url, data, created_at, updated_at })
      }

      // SELECT from things by URL
      if (normalizedQuery.startsWith('SELECT') && query.toLowerCase().includes('things')) {
        if (query.includes('WHERE url = ?')) {
          const [url] = params as [string]
          const thing = things.get(url)
          if (thing) results.push(thing)
        }
        // List all things
        else if (query.includes('ORDER BY')) {
          const allThings = Array.from(things.values())
          results.push(...allThings.slice(0, params[params.length - 2] as number || 100))
        }
      }

      // INSERT INTO relationships
      if (normalizedQuery.startsWith('INSERT') && query.toLowerCase().includes('relationships')) {
        const [id, type, from, to, data, created_at] = params as [string, string, string, string, string, string]
        relationships.set(id, { id, type, from, to, data: data || null, created_at })
      }

      // SELECT from relationships
      if (normalizedQuery.startsWith('SELECT') && query.toLowerCase().includes('relationships')) {
        if (query.includes('WHERE "from" = ?') && !query.includes('"to" = ?')) {
          const [from, type] = params as [string, string | undefined]
          for (const rel of relationships.values()) {
            if (rel.from === from && (!type || rel.type === type)) {
              results.push(rel)
            }
          }
        } else if (query.includes('WHERE "to" = ?') && !query.includes('"from" = ?')) {
          const [to, type] = params as [string, string | undefined]
          for (const rel of relationships.values()) {
            if (rel.to === to && (!type || rel.type === type)) {
              results.push(rel)
            }
          }
        }
      }

      return { toArray: () => results }
    },
  }
}

/**
 * Create a mock context with SQLite storage
 */
function createMockCtx() {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    storage: { sql: createMockSqlStorage() },
  }
}

// Mock environment
const mockEnv = {
  DO_NAMESPACE: {
    idFromName: vi.fn(() => ({ toString: () => 'mock-id' })),
    get: vi.fn(),
  },
}

describe('Fuzzy Traversal Stubs (GREEN Phase)', () => {
  describe.todo('~> Forward Fuzzy Operator (Stub)', () => {
    let doInstance: DO

    beforeEach(async () => {
      doInstance = new DO(createMockCtx() as any, mockEnv)

      await doInstance.createThing({
        ns: 'example.com',
        type: 'Article',
        id: 'intro-ml',
        data: { title: 'Introduction to Machine Learning' },
      })

      await doInstance.createThing({
        ns: 'example.com',
        type: 'Topic',
        id: 'ai',
        data: { name: 'Artificial Intelligence' },
      })
    })

    it('should return empty array for fuzzy forward traversal (stub)', async () => {
      const topics = await (doInstance as any).traverse(
        'https://example.com/Article/intro-ml',
        '~>Topics'
      )

      expect(Array.isArray(topics)).toBe(true)
      expect(topics.length).toBe(0) // Stub returns empty until SearchProvider is configured
    })

    it('should accept threshold option for similarity cutoff', async () => {
      const topics = await (doInstance as any).traverse(
        'https://example.com/Article/intro-ml',
        '~>Topics',
        { threshold: 0.8 }
      )

      expect(Array.isArray(topics)).toBe(true)
      expect(topics.length).toBe(0) // Stub returns empty
    })

    it('should accept limit option for fuzzy traversal', async () => {
      const topics = await (doInstance as any).traverse(
        'https://example.com/Article/intro-ml',
        '~>Topics',
        { limit: 5 }
      )

      expect(Array.isArray(topics)).toBe(true)
      expect(topics.length).toBe(0) // Stub returns empty
    })

    it('should accept combined threshold and limit options', async () => {
      const topics = await (doInstance as any).traverse(
        'https://example.com/Article/intro-ml',
        '~>Topics',
        { threshold: 0.7, limit: 10 }
      )

      expect(Array.isArray(topics)).toBe(true)
      expect(topics.length).toBe(0)
    })
  })

  describe.todo('<~ Backward Fuzzy Operator (Stub)', () => {
    let doInstance: DO

    beforeEach(async () => {
      doInstance = new DO(createMockCtx() as any, mockEnv)

      await doInstance.createThing({
        ns: 'example.com',
        type: 'Article',
        id: 'article-1',
        data: { title: 'Deep Learning Fundamentals' },
      })

      await doInstance.createThing({
        ns: 'example.com',
        type: 'Article',
        id: 'article-2',
        data: { title: 'Neural Networks Explained' },
      })
    })

    it('should return empty array for fuzzy backward traversal (stub)', async () => {
      const similar = await (doInstance as any).traverse(
        'https://example.com/Article/article-1',
        '<~Similar'
      )

      expect(Array.isArray(similar)).toBe(true)
      expect(similar.length).toBe(0) // Stub returns empty
    })

    it('should accept threshold option for backward fuzzy', async () => {
      const similar = await (doInstance as any).traverse(
        'https://example.com/Article/article-1',
        '<~Similar',
        { threshold: 0.5 }
      )

      expect(Array.isArray(similar)).toBe(true)
      expect(similar.length).toBe(0)
    })
  })

  describe.todo('SearchProvider Interface', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    it('should expose setSearchProvider method', () => {
      expect(typeof (doInstance as any).setSearchProvider).toBe('function')
    })

    it('should expose getSearchProvider method', () => {
      expect(typeof (doInstance as any).getSearchProvider).toBe('function')
    })

    it('should return null when no SearchProvider is configured', () => {
      const provider = (doInstance as any).getSearchProvider()
      expect(provider).toBeNull()
    })

    it('should accept SearchProvider configuration', () => {
      const mockProvider = {
        search: vi.fn().mockResolvedValue([]),
        embed: vi.fn().mockResolvedValue([]),
      }

      ;(doInstance as any).setSearchProvider(mockProvider)
      const provider = (doInstance as any).getSearchProvider()
      expect(provider).toBe(mockProvider)
    })
  })

  describe.todo('Console Warnings', () => {
    let doInstance: DO
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(async () => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
      consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await doInstance.createThing({
        ns: 'example.com',
        type: 'Article',
        id: 'test',
        data: { title: 'Test' },
      })
    })

    afterEach(() => {
      consoleSpy.mockRestore()
    })

    it('should log warning when fuzzy traversal used without SearchProvider', async () => {
      await (doInstance as any).traverse(
        'https://example.com/Article/test',
        '~>Topics'
      )

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('SearchProvider')
      )
    })
  })

  describe.todo('Allowed Methods', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    it('should have traverse in allowedMethods', () => {
      expect(doInstance.allowedMethods.has('traverse')).toBe(true)
    })

    it('should have setSearchProvider in allowedMethods', () => {
      expect(doInstance.allowedMethods.has('setSearchProvider')).toBe(true)
    })

    it('should have getSearchProvider in allowedMethods', () => {
      expect(doInstance.allowedMethods.has('getSearchProvider')).toBe(true)
    })
  })

  describe.todo('Threshold Validation', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    it('should throw error for invalid threshold (> 1)', async () => {
      await expect(
        (doInstance as any).traverse(
          'https://example.com/Item/item-1',
          '~>Similar',
          { threshold: 1.5 }
        )
      ).rejects.toThrow('threshold')
    })

    it('should throw error for invalid threshold (< 0)', async () => {
      await expect(
        (doInstance as any).traverse(
          'https://example.com/Item/item-1',
          '~>Similar',
          { threshold: -0.1 }
        )
      ).rejects.toThrow('threshold')
    })

    it('should accept valid threshold values', async () => {
      // Should not throw
      const result1 = await (doInstance as any).traverse(
        'https://example.com/Item/item-1',
        '~>Similar',
        { threshold: 0 }
      )
      expect(Array.isArray(result1)).toBe(true)

      const result2 = await (doInstance as any).traverse(
        'https://example.com/Item/item-1',
        '~>Similar',
        { threshold: 1 }
      )
      expect(Array.isArray(result2)).toBe(true)

      const result3 = await (doInstance as any).traverse(
        'https://example.com/Item/item-1',
        '~>Similar',
        { threshold: 0.5 }
      )
      expect(Array.isArray(result3)).toBe(true)
    })
  })

  describe.todo('Mixed Exact and Fuzzy Traversal', () => {
    let doInstance: DO

    beforeEach(async () => {
      doInstance = new DO(createMockCtx() as any, mockEnv)

      await doInstance.createThing({
        ns: 'example.com',
        type: 'User',
        id: 'alice',
        data: { name: 'Alice' },
      })

      await doInstance.createThing({
        ns: 'example.com',
        type: 'Article',
        id: 'alice-article',
        data: { title: 'Alice ML Article' },
      })

      await doInstance.relate({
        type: 'authored',
        from: 'https://example.com/User/alice',
        to: 'https://example.com/Article/alice-article',
      })
    })

    it('should support mixing exact then fuzzy traversal', async () => {
      // First follow exact relationship, then fuzzy (returns empty for now)
      const results = await (doInstance as any).traverse(
        'https://example.com/User/alice',
        '->authored',
        '~>Similar',
        { threshold: 0.8 }
      )

      expect(Array.isArray(results)).toBe(true)
      // Exact hop finds article, fuzzy hop returns empty
      expect(results.length).toBe(0)
    })

    it('should apply threshold only to fuzzy hops', async () => {
      // Exact traversal should not be affected by threshold
      const exactResults = await (doInstance as any).traverse(
        'https://example.com/User/alice',
        '->authored',
        { threshold: 0.99 } // High threshold should not affect exact traversal
      )

      expect(exactResults.length).toBe(1)
      expect(exactResults[0].id).toBe('alice-article')
    })
  })

  describe.todo('RPC Invocation', () => {
    let doInstance: DO

    beforeEach(async () => {
      doInstance = new DO(createMockCtx() as any, mockEnv)

      await doInstance.createThing({
        ns: 'example.com',
        type: 'Item',
        id: 'item-1',
        data: { name: 'Test' },
      })
    })

    it('should be invokable via RPC with fuzzy options', async () => {
      const results = await doInstance.invoke('traverse', [
        'https://example.com/Item/item-1',
        '~>Similar',
        { threshold: 0.5 },
      ])

      expect(Array.isArray(results)).toBe(true)
      expect((results as unknown[]).length).toBe(0)
    })
  })
})
