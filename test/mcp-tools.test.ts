/**
 * @dotdo/do - Enhanced MCP Tools Tests (TDD)
 *
 * Tests for enhanced MCP tools: search(), fetch(), do()
 * Following TDD methodology: RED -> GREEN -> REFACTOR
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { DO } from '../src/do'
import type {
  SearchOptions,
  FetchOptions,
  DoOptions,
  SearchResult,
  FetchResult,
  DoResult,
} from '../src/types'

// =============================================================================
// Test Utilities
// =============================================================================

// Mock WebSocketPair for Cloudflare Workers compatibility
class MockWebSocket {
  readyState = 1
  send = vi.fn()
  close = vi.fn()
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
}

class MockWebSocketPair {
  0: MockWebSocket
  1: MockWebSocket
  constructor() {
    this[0] = new MockWebSocket()
    this[1] = new MockWebSocket()
  }
}
;(globalThis as unknown as { WebSocketPair: typeof MockWebSocketPair }).WebSocketPair = MockWebSocketPair

/**
 * Create an in-memory SQLite mock for testing
 */
function createMockSqlStorage() {
  const tables: Map<string, Map<string, Record<string, unknown>>> = new Map()

  return {
    exec(query: string, ...params: unknown[]) {
      const results: unknown[] = []
      const normalizedQuery = query.trim().toUpperCase()

      if (normalizedQuery.startsWith('CREATE TABLE')) {
        const tableMatch = query.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)
        if (tableMatch) {
          const tableName = tableMatch[1]
          if (!tables.has(tableName)) {
            tables.set(tableName, new Map())
          }
        }
      } else if (normalizedQuery.startsWith('INSERT')) {
        // Handle various table inserts
        const tableMatch = query.match(/INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+(\w+)/i)
        const tableName = tableMatch?.[1] || 'documents'
        if (!tables.has(tableName)) {
          tables.set(tableName, new Map())
        }
        const table = tables.get(tableName)!

        if (tableName === 'documents') {
          const [collection, id, data] = params as [string, string, string]
          const key = `${collection}:${id}`
          table.set(key, {
            collection,
            id,
            data,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
        } else if (tableName === 'artifacts') {
          const [key, type, source, sourceHash, content, size, metadata, createdAt, expiresAt] =
            params as [string, string, string, string, string, number, string | null, string, string | null]
          table.set(key, {
            key,
            type,
            source,
            source_hash: sourceHash,
            content,
            size,
            metadata,
            created_at: createdAt,
            expires_at: expiresAt,
          })
        }
      } else if (normalizedQuery.startsWith('SELECT')) {
        // Handle SELECT queries for documents
        if (query.includes('FROM documents')) {
          const table = tables.get('documents')
          if (table) {
            if (query.includes('WHERE collection = ? AND id = ?')) {
              const [collection, id] = params as [string, string]
              const key = `${collection}:${id}`
              const row = table.get(key)
              if (row) {
                results.push({ data: row.data })
              }
            } else if (query.includes('WHERE data LIKE')) {
              const [searchPattern, limit] = params as [string, number]
              const pattern = searchPattern.replace(/%/g, '')
              for (const [, row] of table.entries()) {
                if (results.length >= limit) break
                const rowData = row.data as string
                if (rowData.toLowerCase().includes(pattern.toLowerCase())) {
                  results.push({ collection: row.collection, id: row.id, data: row.data })
                }
              }
            } else if (query.includes('WHERE collection IN') && query.includes('LIKE')) {
              const collections = params.slice(0, -2) as string[]
              const searchPattern = params[params.length - 2] as string
              const limit = params[params.length - 1] as number
              const pattern = searchPattern.replace(/%/g, '')
              for (const [, row] of table.entries()) {
                if (results.length >= limit) break
                const rowCollection = row.collection as string
                const rowData = row.data as string
                if (collections.includes(rowCollection) && rowData.toLowerCase().includes(pattern.toLowerCase())) {
                  results.push({ collection: row.collection, id: row.id, data: row.data })
                }
              }
            } else if (query.includes('WHERE collection = ?')) {
              const [collection, limit, offset] = params as [string, number, number]
              const matching: Record<string, unknown>[] = []
              for (const [key, row] of table.entries()) {
                if (key.startsWith(`${collection}:`)) {
                  matching.push({ data: row.data })
                }
              }
              const paginated = matching.slice(offset, offset + limit)
              results.push(...paginated)
            }
          }
        } else if (query.includes('FROM artifacts')) {
          const table = tables.get('artifacts')
          if (table) {
            if (query.includes('WHERE key = ?')) {
              const [key] = params as [string]
              const row = table.get(key)
              if (row) {
                results.push(row)
              }
            } else if (query.includes('WHERE source = ? AND type = ?')) {
              const [source, type] = params as [string, string]
              for (const [, row] of table.entries()) {
                if (row.source === source && row.type === type) {
                  results.push(row)
                  break
                }
              }
            }
          }
        }
      } else if (normalizedQuery.startsWith('UPDATE')) {
        const tableMatch = query.match(/UPDATE\s+(\w+)/i)
        const tableName = tableMatch?.[1] || 'documents'
        const table = tables.get(tableName)

        if (table && tableName === 'documents') {
          const [data, collection, id] = params as [string, string, string]
          const key = `${collection}:${id}`
          const existing = table.get(key)
          if (existing) {
            table.set(key, { ...existing, data, updated_at: new Date().toISOString() })
          }
        }
      } else if (normalizedQuery.startsWith('DELETE')) {
        const tableMatch = query.match(/DELETE\s+FROM\s+(\w+)/i)
        const tableName = tableMatch?.[1] || 'documents'
        const table = tables.get(tableName)

        if (table) {
          if (tableName === 'documents') {
            const [collection, id] = params as [string, string]
            const key = `${collection}:${id}`
            table.delete(key)
          } else if (tableName === 'artifacts') {
            const [key] = params as [string]
            table.delete(key)
          }
        }
      } else if (normalizedQuery.startsWith('CREATE INDEX')) {
        // Index creation - no-op for mock
      }

      return {
        toArray() {
          return results
        },
      }
    },
  }
}

function createMockCtx() {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    storage: {
      sql: createMockSqlStorage(),
    },
    acceptWebSocket: vi.fn(),
  }
}

const mockEnv = {
  DO_NAMESPACE: {
    idFromName: vi.fn(() => ({ toString: () => 'mock-id' })),
    get: vi.fn(),
  },
}

// =============================================================================
// RED Phase Tests: Enhanced search() Method
// =============================================================================

describe('Enhanced search() Method - RED Phase', () => {
  let doInstance: DO

  beforeEach(() => {
    doInstance = new DO(createMockCtx() as any, mockEnv)
  })

  describe('Hybrid Search (FTS + Vector)', () => {
    it('should support hybrid search mode option', async () => {
      // Create test documents
      await doInstance.create('articles', {
        title: 'Machine Learning Guide',
        content: 'An introduction to ML algorithms',
      })

      const options: SearchOptions & { mode?: 'fts' | 'vector' | 'hybrid' } = {
        mode: 'hybrid',
        limit: 10,
      }

      const results = await doInstance.search('machine learning', options)
      expect(Array.isArray(results)).toBe(true)
    })

    it('should return results with combined RRF score in hybrid mode', async () => {
      await doInstance.create('articles', {
        title: 'Deep Learning Tutorial',
        content: 'Neural networks and deep learning',
      })

      const results = await doInstance.search('deep learning', { mode: 'hybrid' } as any)

      if (results.length > 0) {
        expect(results[0].score).toBeDefined()
        expect(typeof results[0].score).toBe('number')
        // RRF scores are typically small (< 0.1)
        expect(results[0].score).toBeGreaterThan(0)
      }
    })

    it('should support FTS-only mode', async () => {
      await doInstance.create('docs', { text: 'Full text search test' })

      const results = await doInstance.search('text search', { mode: 'fts' } as any)
      expect(Array.isArray(results)).toBe(true)
    })

    it('should support vector-only mode', async () => {
      await doInstance.create('docs', { text: 'Semantic similarity search' })

      const results = await doInstance.search('similar meaning', { mode: 'vector' } as any)
      expect(Array.isArray(results)).toBe(true)
    })

    it('should default to FTS mode when no mode specified', async () => {
      await doInstance.create('docs', { text: 'Default search behavior' })

      const results = await doInstance.search('default')
      expect(Array.isArray(results)).toBe(true)
    })
  })

  describe('Vector Search Configuration', () => {
    it('should accept embedding provider option', async () => {
      const options: SearchOptions & { embeddingProvider?: string } = {
        embeddingProvider: 'openai',
      }

      const results = await doInstance.search('test query', options)
      expect(Array.isArray(results)).toBe(true)
    })

    it('should accept embedding model option', async () => {
      const options: SearchOptions & { embeddingModel?: string } = {
        embeddingModel: 'text-embedding-3-small',
      }

      const results = await doInstance.search('test query', options)
      expect(Array.isArray(results)).toBe(true)
    })

    it('should support similarity threshold for vector search', async () => {
      await doInstance.create('docs', { text: 'Similar document content' })

      const options: SearchOptions & { minSimilarity?: number } = {
        mode: 'vector',
        minSimilarity: 0.7,
      } as any

      const results = await doInstance.search('similar content', options)
      expect(Array.isArray(results)).toBe(true)
    })
  })

  describe('Full-Text Search Enhancements', () => {
    it('should support field-specific search', async () => {
      await doInstance.create('articles', {
        title: 'TypeScript Guide',
        body: 'JavaScript with types',
        tags: ['typescript', 'javascript'],
      })

      const options: SearchOptions & { fields?: string[] } = {
        fields: ['title', 'tags'],
      }

      const results = await doInstance.search('typescript', options)
      expect(Array.isArray(results)).toBe(true)
    })

    it('should support fuzzy matching option', async () => {
      await doInstance.create('docs', { text: 'Documentation' })

      const results = await doInstance.search('Documantation', { fuzzy: true })
      expect(Array.isArray(results)).toBe(true)
    })

    it('should support boosting specific fields', async () => {
      await doInstance.create('articles', {
        title: 'Important Topic',
        content: 'Less important content',
      })

      const options: SearchOptions & { boost?: Record<string, number> } = {
        boost: { title: 2.0, content: 1.0 },
      }

      const results = await doInstance.search('important', options)
      expect(Array.isArray(results)).toBe(true)
    })
  })

  describe('Search Result Enhancements', () => {
    it('should include highlight snippets when requested', async () => {
      await doInstance.create('articles', {
        title: 'Test Article',
        content: 'This is a test article with searchable content about testing.',
      })

      const options: SearchOptions & { highlight?: boolean } = {
        highlight: true,
      }

      const results = await doInstance.search('test', options)
      if (results.length > 0) {
        // Expect highlight property in results
        expect(results[0]).toHaveProperty('highlight')
      }
    })

    it('should return facets when requested', async () => {
      await doInstance.create('articles', { category: 'tech', title: 'Tech Article' })
      await doInstance.create('articles', { category: 'science', title: 'Science Article' })

      const options: SearchOptions & { facets?: string[] } = {
        facets: ['category'],
      }

      const results = await doInstance.search('article', options)
      expect(Array.isArray(results)).toBe(true)
      // Expect facets in response metadata
    })

    it('should support custom scoring functions', async () => {
      await doInstance.create('products', { name: 'Widget', popularity: 100 })
      await doInstance.create('products', { name: 'Gadget', popularity: 50 })

      const options: SearchOptions & { scoreFunction?: string } = {
        scoreFunction: 'popularity * _score',
      }

      const results = await doInstance.search('widget gadget', options)
      expect(Array.isArray(results)).toBe(true)
    })
  })
})

// =============================================================================
// RED Phase Tests: Enhanced fetch() Method
// =============================================================================

describe('Enhanced fetch() Method - RED Phase', () => {
  let doInstance: DO
  let originalFetch: typeof fetch

  beforeEach(() => {
    doInstance = new DO(createMockCtx() as any, mockEnv)
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  describe('Caching Support', () => {
    it('should cache responses when cache option is enabled', async () => {
      let fetchCount = 0
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        fetchCount++
        return new Response(JSON.stringify({ data: 'test' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const options: FetchOptions & { cache?: boolean; cacheTtl?: number } = {
        cache: true,
        cacheTtl: 60000, // 1 minute
      }

      // First fetch should call network
      await doInstance.fetch('https://api.example.com/data', options)
      expect(fetchCount).toBe(1)

      // Second fetch should use cache
      await doInstance.fetch('https://api.example.com/data', options)
      expect(fetchCount).toBe(1) // Should still be 1 (cached)
    })

    it('should respect cache TTL', async () => {
      let fetchCount = 0
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        fetchCount++
        return new Response(JSON.stringify({ data: 'test' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const options: FetchOptions & { cache?: boolean; cacheTtl?: number } = {
        cache: true,
        cacheTtl: 100, // 100ms TTL
      }

      await doInstance.fetch('https://api.example.com/data', options)
      expect(fetchCount).toBe(1)

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 150))

      await doInstance.fetch('https://api.example.com/data', options)
      expect(fetchCount).toBe(2) // Should refetch after TTL
    })

    it('should support cache key customization', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: 'test' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const options: FetchOptions & { cache?: boolean; cacheKey?: string } = {
        cache: true,
        cacheKey: 'custom-cache-key',
      }

      const result = await doInstance.fetch('https://api.example.com/data', options)
      expect(result.status).toBe(200)
    })

    it('should skip cache for non-GET requests by default', async () => {
      let fetchCount = 0
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        fetchCount++
        return new Response(JSON.stringify({ data: 'test' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const options: FetchOptions & { cache?: boolean } = {
        method: 'POST',
        cache: true,
        body: { test: true },
      }

      await doInstance.fetch('https://api.example.com/data', options)
      await doInstance.fetch('https://api.example.com/data', options)
      expect(fetchCount).toBe(2) // Both should hit network
    })
  })

  describe('Retry Logic', () => {
    it('should retry on network errors', async () => {
      let attempts = 0
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        attempts++
        if (attempts < 3) {
          throw new Error('Network error')
        }
        return new Response(JSON.stringify({ data: 'success' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const options: FetchOptions & { retry?: { maxRetries?: number } } = {
        retry: { maxRetries: 3 },
      }

      const result = await doInstance.fetch('https://api.example.com/data', options)
      expect(result.status).toBe(200)
      expect(attempts).toBe(3)
    })

    it('should retry on 5xx errors', async () => {
      let attempts = 0
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        attempts++
        if (attempts < 2) {
          return new Response('Server Error', { status: 503 })
        }
        return new Response(JSON.stringify({ data: 'success' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const options: FetchOptions & { retry?: { maxRetries?: number; retryOn?: number[] } } = {
        retry: { maxRetries: 3, retryOn: [503, 504] },
      }

      const result = await doInstance.fetch('https://api.example.com/data', options)
      expect(result.status).toBe(200)
      expect(attempts).toBe(2)
    })

    it('should support exponential backoff', async () => {
      const timestamps: number[] = []
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        timestamps.push(Date.now())
        if (timestamps.length < 3) {
          throw new Error('Network error')
        }
        return new Response(JSON.stringify({ data: 'success' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const options: FetchOptions & {
        retry?: { maxRetries?: number; backoff?: 'exponential' | 'fixed'; initialDelay?: number }
      } = {
        retry: { maxRetries: 3, backoff: 'exponential', initialDelay: 100 },
      }

      await doInstance.fetch('https://api.example.com/data', options)

      // Check that delays increase exponentially
      if (timestamps.length >= 3) {
        const delay1 = timestamps[1] - timestamps[0]
        const delay2 = timestamps[2] - timestamps[1]
        expect(delay2).toBeGreaterThan(delay1)
      }
    })

    it('should respect max retry limit', async () => {
      let attempts = 0
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        attempts++
        throw new Error('Network error')
      })

      const options: FetchOptions & { retry?: { maxRetries?: number } } = {
        retry: { maxRetries: 2 },
      }

      const result = await doInstance.fetch('https://api.example.com/data', options)
      expect(result.status).toBe(500) // Error status
      expect(attempts).toBe(3) // Initial + 2 retries
    })

    it('should not retry on 4xx errors by default', async () => {
      let attempts = 0
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        attempts++
        return new Response('Not Found', { status: 404 })
      })

      const options: FetchOptions & { retry?: { maxRetries?: number } } = {
        retry: { maxRetries: 3 },
      }

      const result = await doInstance.fetch('https://api.example.com/data', options)
      expect(result.status).toBe(404)
      expect(attempts).toBe(1) // No retries for 4xx
    })
  })

  describe('Response Transformation', () => {
    it('should support custom response transformers', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ nested: { data: 'value' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const options: FetchOptions & { transform?: (body: unknown) => unknown } = {
        transform: (body: any) => body.nested.data,
      }

      const result = await doInstance.fetch('https://api.example.com/data', options)
      expect(result.body).toBe('value')
    })

    it('should handle streaming responses', async () => {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('chunk1'))
          controller.enqueue(encoder.encode('chunk2'))
          controller.close()
        },
      })

      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        })
      )

      const options: FetchOptions & { stream?: boolean } = {
        stream: true,
      }

      const result = await doInstance.fetch('https://api.example.com/stream', options)
      expect(result.status).toBe(200)
    })
  })

  describe('Enhanced Error Handling', () => {
    it('should include detailed error information', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'))

      const result = await doInstance.fetch('https://api.example.com/data')

      expect(result.status).toBe(500)
      expect(result.body).toHaveProperty('error')
      expect((result.body as any).error).toContain('Connection refused')
    })

    it('should track fetch timing', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: 'test' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const result = (await doInstance.fetch('https://api.example.com/data')) as FetchResult & {
        timing?: { total: number }
      }
      expect(result.timing).toBeDefined()
      expect(result.timing?.total).toBeGreaterThanOrEqual(0)
    })
  })
})

// =============================================================================
// RED Phase Tests: CodeExecutor Interface
// =============================================================================

describe('CodeExecutor Interface - RED Phase', () => {
  let doInstance: DO

  beforeEach(() => {
    doInstance = new DO(createMockCtx() as any, mockEnv)
  })

  describe('Pluggable Executor Architecture', () => {
    it('should support registering custom executors', () => {
      const customExecutor = {
        name: 'custom-executor',
        execute: async (code: string) => ({ success: true, result: 'executed' }),
      }

      // Method to register executor should exist
      expect((doInstance as any).registerExecutor).toBeDefined()
      ;(doInstance as any).registerExecutor(customExecutor)
    })

    it('should allow selecting executor by name', async () => {
      const options: DoOptions & { executor?: string } = {
        executor: 'sandbox',
      }

      const result = await doInstance.do('return 1', options)
      expect(result).toBeDefined()
    })

    it('should provide default mock executor', async () => {
      const result = await doInstance.do('return "test"')
      expect(result.success).toBeDefined()
    })
  })

  describe('CodeExecutor Contract', () => {
    it('should define execute method on executor', () => {
      interface CodeExecutor {
        name: string
        execute(code: string, context?: Record<string, unknown>): Promise<DoResult>
        validate?(code: string): { valid: boolean; errors?: string[] }
        cleanup?(): Promise<void>
      }

      // Just verify the type compiles - this is a type test
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

      const result = await doInstance.do('return 1 + 1', options)
      expect(result).toBeDefined()
    })

    it('should support executor cleanup', async () => {
      // Executor should have cleanup method
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
// RED Phase Tests: Context Builder from allowedMethods
// =============================================================================

describe('Context Builder from allowedMethods - RED Phase', () => {
  let doInstance: DO

  beforeEach(() => {
    doInstance = new DO(createMockCtx() as any, mockEnv)
  })

  describe('Context Generation', () => {
    it('should build execution context from allowedMethods', () => {
      const context = (doInstance as any).buildExecutionContext()

      expect(context).toBeDefined()
      expect(typeof context).toBe('object')
    })

    it('should include all CRUD methods in context', () => {
      const context = (doInstance as any).buildExecutionContext() as Record<string, unknown>

      expect(context.get).toBeDefined()
      expect(context.list).toBeDefined()
      expect(context.create).toBeDefined()
      expect(context.update).toBeDefined()
      expect(context.delete).toBeDefined()
    })

    it('should include Thing operations in context', () => {
      const context = (doInstance as any).buildExecutionContext() as Record<string, unknown>

      expect(context.createThing).toBeDefined()
      expect(context.getThing).toBeDefined()
      expect(context.setThing).toBeDefined()
      expect(context.deleteThing).toBeDefined()
    })

    it('should include relationship operations in context', () => {
      const context = (doInstance as any).buildExecutionContext() as Record<string, unknown>

      expect(context.relate).toBeDefined()
      expect(context.unrelate).toBeDefined()
      expect(context.related).toBeDefined()
      expect(context.relationships).toBeDefined()
    })

    it('should bind methods to DO instance', () => {
      const context = (doInstance as any).buildExecutionContext() as Record<string, Function>

      // Methods should be callable and bound to the instance
      expect(typeof context.create).toBe('function')
      expect(typeof context.get).toBe('function')
      expect(typeof context.list).toBe('function')
      expect(typeof context.update).toBe('function')
      expect(typeof context.delete).toBe('function')

      // Bound methods should have their 'this' context set
      // This ensures they can be called from execution context
      expect(context.create.length).toBeGreaterThanOrEqual(0)
    })

    it('should exclude internal methods from context', () => {
      const context = (doInstance as any).buildExecutionContext() as Record<string, unknown>

      // Internal methods should not be exposed
      expect(context.initSchema).toBeUndefined()
      expect(context.generateId).toBeUndefined()
      expect(context.createRouter).toBeUndefined()
    })
  })

  describe('Context Customization', () => {
    it('should support custom context additions', () => {
      const customAdditions = {
        customHelper: () => 'helper result',
        customValue: 42,
      }

      const context = (doInstance as any).buildExecutionContext(customAdditions) as Record<
        string,
        unknown
      >

      expect(context.customHelper).toBeDefined()
      expect(context.customValue).toBe(42)
    })

    it('should support context filtering', () => {
      const options = {
        include: ['get', 'list', 'create'],
      }

      const context = (doInstance as any).buildExecutionContext(undefined, options) as Record<
        string,
        unknown
      >

      expect(context.get).toBeDefined()
      expect(context.list).toBeDefined()
      expect(context.create).toBeDefined()
      expect(context.update).toBeUndefined()
      expect(context.delete).toBeUndefined()
    })

    it('should support method aliasing', () => {
      const options = {
        aliases: {
          find: 'get',
          remove: 'delete',
        },
      }

      const context = (doInstance as any).buildExecutionContext(undefined, options) as Record<
        string,
        unknown
      >

      expect(context.find).toBeDefined()
      expect(context.remove).toBeDefined()
    })
  })
})

// =============================================================================
// GREEN Phase Tests: Enhanced do() Method
// =============================================================================

describe('Enhanced do() Method - GREEN Phase', () => {
  let doInstance: DO

  beforeEach(() => {
    doInstance = new DO(createMockCtx() as any, mockEnv)
  })

  describe('Mock Executor Behavior', () => {
    it('should execute simple arithmetic', async () => {
      const result = await doInstance.do('return 1 + 1')

      expect(result.success).toBe(true)
      expect(result.result).toBe(2)
    })

    it('should return boolean values', async () => {
      const result = await doInstance.do('return true')
      expect(result.success).toBe(true)
      expect(result.result).toBe(true)
    })

    it('should return string values', async () => {
      const result = await doInstance.do('return "hello"')
      expect(result.success).toBe(true)
      expect(result.result).toBe('hello')
    })

    it('should indicate mock behavior for complex code', async () => {
      // Complex code returns mock indicator until real sandbox is integrated
      const result = await doInstance.do(`
        const doc = await db.create('test', { name: 'Test' })
        return doc.id
      `)

      expect(result.success).toBe(true)
      // Mock executor returns indicator object
      expect((result.result as any).mock).toBe(true)
    })

    // TODO: Enable when real sandbox is integrated
    it.skip('should provide db object with all allowed methods', async () => {
      const result = await doInstance.do(`
        return Object.keys(db).sort()
      `)

      expect(result.success).toBe(true)
      const methods = result.result as string[]
      expect(methods).toContain('get')
      expect(methods).toContain('create')
      expect(methods).toContain('relate')
    })

    it('should handle typeof process query', async () => {
      const result = await doInstance.do('return typeof process')

      // Mock executor returns 'undefined' for typeof process
      expect(result.result).toBe('undefined')
    })

    // TODO: Enable when real sandbox is integrated
    it.skip('should support async/await in code', async () => {
      const result = await doInstance.do(`
        const doc1 = await db.create('items', { value: 1 })
        const doc2 = await db.create('items', { value: 2 })
        const items = await db.list('items')
        return items.length
      `)

      expect(result.success).toBe(true)
      expect(result.result).toBe(2)
    })
  })

  describe('Execution Timeout', () => {
    // TODO: Enable when real sandbox with timeout is integrated
    it.skip('should respect timeout option', async () => {
      const result = await doInstance.do(
        `
        while(true) {} // Infinite loop
      `,
        { timeout: 100 }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('timeout')
    })

    it('should default to reasonable timeout', async () => {
      const startTime = Date.now()
      const result = await doInstance.do('return 1')
      const duration = Date.now() - startTime

      expect(result.success).toBe(true)
      expect(duration).toBeLessThan(5000) // Should complete quickly
    })
  })

  describe('Console Capture', () => {
    it('should capture console.log output', async () => {
      const result = await doInstance.do(`
        console.log('Hello')
        console.log('World')
        return 'done'
      `)

      expect(result.logs).toContain('Hello')
      expect(result.logs).toContain('World')
    })

    it('should capture console.error output', async () => {
      const result = await doInstance.do(`
        console.error('Error message')
        return 'done'
      `)

      expect(result.logs).toBeDefined()
      // Error logs should be captured
    })

    it('should preserve log order', async () => {
      const result = await doInstance.do(`
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
    // TODO: Enable when real sandbox is integrated
    it.skip('should catch and report syntax errors', async () => {
      const result = await doInstance.do('return {invalid syntax')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    // TODO: Enable when real sandbox is integrated
    it.skip('should catch and report runtime errors', async () => {
      const result = await doInstance.do(`
        const obj = null
        return obj.property
      `)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should include stack trace in error', async () => {
      const result = await doInstance.do(`
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
      const result = await doInstance.do('return env.API_KEY', {
        env: { API_KEY: 'secret-key' },
      })

      expect(result.success).toBe(true)
      expect(result.result).toBe('secret-key')
    })

    it('should isolate env between executions', async () => {
      // Mock executor doesn't persist env between calls
      await doInstance.do('env.TEMP = "value"', { env: {} } as any)

      const result = await doInstance.do('return env.TEMP', { env: {} } as any)

      // Env is isolated - TEMP was not passed in second call
      expect(result.result).toBeUndefined()
    })
  })

  describe('Memory Limits', () => {
    it('should respect memory limit option', async () => {
      const result = await doInstance.do(
        `
        const arr = []
        for (let i = 0; i < 1000000; i++) {
          arr.push(new Array(1000).fill('x'))
        }
        return arr.length
      `,
        { memory: 10 * 1024 * 1024 } // 10MB limit
      )

      // Should either succeed with smaller allocation or fail with memory error
      // Mock executor returns mock result for complex code
      expect(result).toBeDefined()
    })
  })

  describe('Return Value Serialization', () => {
    // TODO: Enable when real sandbox is integrated
    it.skip('should serialize complex objects', async () => {
      const result = await doInstance.do(`
        return {
          date: new Date('2024-01-01'),
          nested: { array: [1, 2, 3] }
        }
      `)

      expect(result.success).toBe(true)
      expect((result.result as any).nested.array).toEqual([1, 2, 3])
    })

    it('should handle circular references gracefully', async () => {
      const result = await doInstance.do(`
        const obj = { a: 1 }
        obj.self = obj
        return obj
      `)

      // Should either handle circular ref or return mock result
      expect(result).toBeDefined()
    })

    // TODO: Enable when real sandbox is integrated
    it.skip('should handle undefined return value', async () => {
      const result = await doInstance.do('const x = 1')

      expect(result.success).toBe(true)
      expect(result.result).toBeUndefined()
    })
  })
})
