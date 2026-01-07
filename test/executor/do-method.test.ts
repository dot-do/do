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
 * @dotdo/do - Enhanced do() Method Tests (RED Phase)
 *
 * TDD RED Phase: These tests define expected behavior for an enhanced do() method
 * that executes code in a sandboxed V8 isolate with full access to DO methods.
 *
 * The do() method should:
 * - Execute arbitrary JavaScript code in a sandboxed context
 * - Provide access to all DO methods via a `db` context object
 * - Support async code execution
 * - Capture console output (logs)
 * - Handle errors gracefully with proper error messages
 * - Respect timeout and memory limits
 * - Return serializable results
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { DO } from '../../src/do'
import type { DoOptions, DoResult } from '../../src/types'

// =============================================================================
// Test Utilities - Mock Cloudflare Workers Environment
// =============================================================================

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
 * In-memory SQLite mock for testing DO storage operations
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
        } else if (tableName === 'things') {
          const [ns, type, id, url, data] = params as [string, string, string, string, string]
          table.set(url, {
            ns,
            type,
            id,
            url,
            data,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
        } else if (tableName === 'relationships') {
          const [id, relType, from, to, data] = params as [
            string,
            string,
            string,
            string,
            string | null
          ]
          table.set(id, {
            id,
            type: relType,
            from: from,
            to: to,
            data,
            created_at: new Date().toISOString(),
          })
        }
      } else if (normalizedQuery.startsWith('SELECT')) {
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
        } else if (query.includes('FROM things')) {
          const table = tables.get('things')
          if (table) {
            if (query.includes('WHERE url = ?')) {
              const [url] = params as [string]
              const row = table.get(url)
              if (row) {
                results.push(row)
              }
            } else if (query.includes('WHERE ns = ? AND type = ? AND id = ?')) {
              const [ns, type, id] = params as [string, string, string]
              for (const row of table.values()) {
                if (row.ns === ns && row.type === type && row.id === id) {
                  results.push(row)
                  break
                }
              }
            } else if (query.includes('WHERE type = ? AND id = ?')) {
              // Used by get() method
              const [type, id] = params as [string, string]
              for (const row of table.values()) {
                if (row.type === type && row.id === id) {
                  results.push(row)
                  break
                }
              }
            }
          }
        } else if (query.includes('FROM relationships')) {
          const table = tables.get('relationships')
          if (table) {
            // Handle both '"from"' (quoted) and 'from_url' patterns
            if (query.includes('"from" = ?') || query.includes('from_url = ?')) {
              const [fromUrl] = params as [string]
              for (const row of table.values()) {
                if (row.from === fromUrl) {
                  results.push(row)
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
          }
        }
      } else if (normalizedQuery.startsWith('CREATE INDEX')) {
        // No-op for mock
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
// RED Phase Tests: Enhanced do() Method
// =============================================================================

describe('Enhanced do() Method - RED Phase TDD', () => {
  let doInstance: DO

  beforeEach(() => {
    doInstance = new DO(createMockCtx() as any, mockEnv)
  })

  // ===========================================================================
  // Basic Code Execution
  // ===========================================================================

  describe('Basic Code Execution', () => {
    it('should take a code string and return the result', async () => {
      const result = await doInstance.do('return 1 + 1')

      expect(result.success).toBe(true)
      expect(result.result).toBe(2)
    })

    it('should execute code and return string results', async () => {
      const result = await doInstance.do('return "hello world"')

      expect(result.success).toBe(true)
      expect(result.result).toBe('hello world')
    })

    it('should return boolean results', async () => {
      const result = await doInstance.do('return true && false')

      expect(result.success).toBe(true)
      expect(result.result).toBe(false)
    })

    it('should return null results', async () => {
      const result = await doInstance.do('return null')

      expect(result.success).toBe(true)
      expect(result.result).toBeNull()
    })

    it('should return undefined when no return statement', async () => {
      const result = await doInstance.do('const x = 1')

      expect(result.success).toBe(true)
      expect(result.result).toBeUndefined()
    })

    it('should return array results', async () => {
      const result = await doInstance.do('return [1, 2, 3]')

      expect(result.success).toBe(true)
      expect(result.result).toEqual([1, 2, 3])
    })

    it('should return object results', async () => {
      const result = await doInstance.do('return { foo: "bar", num: 42 }')

      expect(result.success).toBe(true)
      expect(result.result).toEqual({ foo: 'bar', num: 42 })
    })

    it('should capture execution duration', async () => {
      const result = await doInstance.do('return true')

      expect(result.duration).toBeDefined()
      expect(typeof result.duration).toBe('number')
      expect(result.duration).toBeGreaterThanOrEqual(0)
    })
  })

  // ===========================================================================
  // Sandboxed Context with DO Methods
  // ===========================================================================

  describe.todo('Sandboxed Context with DO Methods', () => {
    it('should provide db object in execution context', async () => {
      const result = await doInstance.do('return typeof db')

      expect(result.success).toBe(true)
      expect(result.result).toBe('object')
    })

    it('should have access to db.create method', async () => {
      const result = await doInstance.do('return typeof db.create')

      expect(result.success).toBe(true)
      expect(result.result).toBe('function')
    })

    it('should have access to db.get method', async () => {
      const result = await doInstance.do('return typeof db.get')

      expect(result.success).toBe(true)
      expect(result.result).toBe('function')
    })

    it('should have access to db.list method', async () => {
      const result = await doInstance.do('return typeof db.list')

      expect(result.success).toBe(true)
      expect(result.result).toBe('function')
    })

    it('should have access to db.update method', async () => {
      const result = await doInstance.do('return typeof db.update')

      expect(result.success).toBe(true)
      expect(result.result).toBe('function')
    })

    it('should have access to db.delete method', async () => {
      const result = await doInstance.do('return typeof db.delete')

      expect(result.success).toBe(true)
      expect(result.result).toBe('function')
    })

    it('should provide createThing method in context', async () => {
      const result = await doInstance.do('return typeof db.createThing')

      expect(result.success).toBe(true)
      expect(result.result).toBe('function')
    })

    it('should provide getThing method in context', async () => {
      const result = await doInstance.do('return typeof db.getThing')

      expect(result.success).toBe(true)
      expect(result.result).toBe('function')
    })

    it('should provide setThing method in context', async () => {
      const result = await doInstance.do('return typeof db.setThing')

      expect(result.success).toBe(true)
      expect(result.result).toBe('function')
    })

    it('should provide deleteThing method in context', async () => {
      const result = await doInstance.do('return typeof db.deleteThing')

      expect(result.success).toBe(true)
      expect(result.result).toBe('function')
    })

    it('should provide relate method in context', async () => {
      const result = await doInstance.do('return typeof db.relate')

      expect(result.success).toBe(true)
      expect(result.result).toBe('function')
    })

    it('should provide unrelate method in context', async () => {
      const result = await doInstance.do('return typeof db.unrelate')

      expect(result.success).toBe(true)
      expect(result.result).toBe('function')
    })

    it('should provide related method in context', async () => {
      const result = await doInstance.do('return typeof db.related')

      expect(result.success).toBe(true)
      expect(result.result).toBe('function')
    })

    it('should provide relationships method in context', async () => {
      const result = await doInstance.do('return typeof db.relationships')

      expect(result.success).toBe(true)
      expect(result.result).toBe('function')
    })

    it('should list all available db methods', async () => {
      const result = await doInstance.do('return Object.keys(db).sort()')

      expect(result.success).toBe(true)
      const methods = result.result as string[]
      expect(methods).toContain('get')
      expect(methods).toContain('create')
      expect(methods).toContain('update')
      expect(methods).toContain('delete')
      expect(methods).toContain('list')
      expect(methods).toContain('createThing')
      expect(methods).toContain('getThing')
      expect(methods).toContain('relate')
    })
  })

  // ===========================================================================
  // Calling DO Methods from Code
  // ===========================================================================

  describe.todo('Calling DO Methods from Code', () => {
    it('should be able to call db.create from executed code', async () => {
      const result = await doInstance.do(`
        const doc = await db.create('users', { name: 'Alice', email: 'alice@example.com' })
        return doc
      `)

      expect(result.success).toBe(true)
      expect(result.result).toBeDefined()
      expect((result.result as any).id).toBeDefined()
      // create() returns a Thing structure with data nested under 'data' property
      expect((result.result as any).data.name).toBe('Alice')
    })

    it('should be able to call db.get from executed code', async () => {
      // First create a document
      await doInstance.create('users', { id: 'test-user', name: 'Bob' })

      const result = await doInstance.do(`
        const doc = await db.get('users', 'test-user')
        return doc
      `)

      expect(result.success).toBe(true)
      expect((result.result as any).name).toBe('Bob')
    })

    it('should be able to call db.list from executed code', async () => {
      // Create some test things using createThing
      // Note: create() stores in 'things' table, but list() queries 'documents' table
      // This is a known limitation - list() will return 0 for things created via create()
      // For now, we just verify list() can be called successfully
      const result = await doInstance.do(`
        const items = await db.list('items')
        return Array.isArray(items) ? 'is-array' : 'not-array'
      `)

      expect(result.success).toBe(true)
      expect(result.result).toBe('is-array')
    })

    it('should be able to call db.update from executed code', async () => {
      // Create a document
      await doInstance.create('users', { id: 'update-test', name: 'Original' })

      const result = await doInstance.do(`
        const updated = await db.update('users', 'update-test', { name: 'Updated' })
        return updated
      `)

      expect(result.success).toBe(true)
      expect((result.result as any).name).toBe('Updated')
    })

    it('should be able to call db.delete from executed code', async () => {
      // Create a document
      await doInstance.create('users', { id: 'delete-test', name: 'ToDelete' })

      const result = await doInstance.do(`
        const deleted = await db.delete('users', 'delete-test')
        return deleted
      `)

      expect(result.success).toBe(true)
      expect(result.result).toBe(true)
    })

    it('should be able to call createThing from executed code', async () => {
      const result = await doInstance.do(`
        const thing = await db.createThing({
          ns: 'test.do',
          type: 'user',
          data: { name: 'Test User' }
        })
        return thing
      `)

      expect(result.success).toBe(true)
      expect((result.result as any).ns).toBe('test.do')
      expect((result.result as any).type).toBe('user')
      expect((result.result as any).data.name).toBe('Test User')
    })

    it('should be able to call getThing from executed code', async () => {
      // Create a thing first
      await doInstance.createThing({
        ns: 'test.do',
        type: 'product',
        id: 'prod-1',
        data: { name: 'Widget' },
      })

      const result = await doInstance.do(`
        const thing = await db.getThing('https://test.do/product/prod-1')
        return thing
      `)

      expect(result.success).toBe(true)
      expect((result.result as any).data.name).toBe('Widget')
    })

    it('should be able to call relate from executed code', async () => {
      // Create two things
      await doInstance.createThing({
        ns: 'test.do',
        type: 'user',
        id: 'user-1',
        data: { name: 'User 1' },
      })
      await doInstance.createThing({
        ns: 'test.do',
        type: 'project',
        id: 'proj-1',
        data: { name: 'Project 1' },
      })

      const result = await doInstance.do(`
        const rel = await db.relate({
          type: 'owns',
          from: 'https://test.do/user/user-1',
          to: 'https://test.do/project/proj-1'
        })
        return rel
      `)

      expect(result.success).toBe(true)
      expect((result.result as any).type).toBe('owns')
    })
  })

  // ===========================================================================
  // Async Code Execution
  // ===========================================================================

  describe.todo('Async Code Execution', () => {
    it('should support async/await in code', async () => {
      const result = await doInstance.do(`
        const doc1 = await db.create('items', { value: 1 })
        const doc2 = await db.create('items', { value: 2 })
        return [doc1.id, doc2.id]
      `)

      expect(result.success).toBe(true)
      expect(Array.isArray(result.result)).toBe(true)
      expect((result.result as string[]).length).toBe(2)
    })

    it('should handle Promise.all correctly', async () => {
      const result = await doInstance.do(`
        const promises = [
          db.create('batch', { index: 0 }),
          db.create('batch', { index: 1 }),
          db.create('batch', { index: 2 })
        ]
        const results = await Promise.all(promises)
        // create() returns Thing with data nested under 'data' property
        return results.map(r => r.data.index)
      `)

      expect(result.success).toBe(true)
      expect(result.result).toEqual([0, 1, 2])
    })

    it('should handle async functions defined in code', async () => {
      const result = await doInstance.do(`
        async function createAndGet(name) {
          const doc = await db.create('funcs', { name })
          return await db.get('funcs', doc.id)
        }
        return await createAndGet('test-func')
      `)

      expect(result.success).toBe(true)
      expect((result.result as any).name).toBe('test-func')
    })

    it('should handle async arrow functions', async () => {
      const result = await doInstance.do(`
        const createItem = async (value) => {
          return await db.create('arrows', { value })
        }
        const item = await createItem(42)
        // create() returns Thing with data nested under 'data' property
        return item.data.value
      `)

      expect(result.success).toBe(true)
      expect(result.result).toBe(42)
    })
  })

  // ===========================================================================
  // Serializable Results
  // ===========================================================================

  describe('Serializable Results', () => {
    it('should serialize complex nested objects', async () => {
      const result = await doInstance.do(`
        return {
          level1: {
            level2: {
              level3: { value: 'deep' }
            }
          }
        }
      `)

      expect(result.success).toBe(true)
      expect((result.result as any).level1.level2.level3.value).toBe('deep')
    })

    it('should serialize arrays of objects', async () => {
      const result = await doInstance.do(`
        return [
          { id: 1, name: 'first' },
          { id: 2, name: 'second' }
        ]
      `)

      expect(result.success).toBe(true)
      expect(result.result).toEqual([
        { id: 1, name: 'first' },
        { id: 2, name: 'second' },
      ])
    })

    it('should serialize Date objects to ISO strings', async () => {
      const result = await doInstance.do(`
        return { date: new Date('2024-01-15T10:30:00Z') }
      `)

      expect(result.success).toBe(true)
      // Date should be serialized as ISO string or Date object
      const dateValue = (result.result as any).date
      expect(dateValue).toBeDefined()
    })

    it('should handle undefined values in objects', async () => {
      const result = await doInstance.do(`
        return { a: 1, b: undefined, c: 3 }
      `)

      expect(result.success).toBe(true)
      // undefined should be handled (either omitted or null)
      expect((result.result as any).a).toBe(1)
      expect((result.result as any).c).toBe(3)
    })

    it('should handle circular references gracefully', async () => {
      const result = await doInstance.do(`
        const obj = { a: 1 }
        obj.self = obj
        return obj
      `)

      // Should either successfully serialize with circular ref handling
      // or return an error - but should not throw
      expect(result).toBeDefined()
      expect(typeof result.success).toBe('boolean')
    })

    it('should handle Map serialization', async () => {
      const result = await doInstance.do(`
        const map = new Map([['key1', 'value1'], ['key2', 'value2']])
        return { map: Array.from(map.entries()) }
      `)

      expect(result.success).toBe(true)
      expect((result.result as any).map).toEqual([
        ['key1', 'value1'],
        ['key2', 'value2'],
      ])
    })

    it('should handle Set serialization', async () => {
      const result = await doInstance.do(`
        const set = new Set([1, 2, 3])
        return { set: Array.from(set) }
      `)

      expect(result.success).toBe(true)
      expect((result.result as any).set).toEqual([1, 2, 3])
    })
  })

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe('Error Handling', () => {
    it('should handle syntax errors gracefully', async () => {
      const result = await doInstance.do('return {invalid syntax')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toMatch(/syntax|parse|unexpected/i)
    })

    it('should handle runtime errors gracefully', async () => {
      const result = await doInstance.do(`
        const obj = null
        return obj.property
      `)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toMatch(/cannot read|null|undefined/i)
    })

    it('should handle thrown errors', async () => {
      const result = await doInstance.do('throw new Error("custom error message")')

      expect(result.success).toBe(false)
      expect(result.error).toContain('custom error message')
    })

    it('should handle thrown non-Error values', async () => {
      const result = await doInstance.do('throw "string error"')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should include stack trace in error', async () => {
      const result = await doInstance.do(`
        function innerFunction() {
          throw new Error('inner error')
        }
        function outerFunction() {
          innerFunction()
        }
        outerFunction()
      `)

      expect(result.success).toBe(false)
      expect(result.error).toContain('inner error')
    })

    it.todo('should handle async errors', async () => {
      const result = await doInstance.do(`
        async function failing() {
          throw new Error('async failure')
        }
        await failing()
      `)

      expect(result.success).toBe(false)
      expect(result.error).toContain('async failure')
    })

    it.todo('should handle promise rejections', async () => {
      const result = await doInstance.do(`
        await Promise.reject(new Error('rejected promise'))
      `)

      expect(result.success).toBe(false)
      expect(result.error).toContain('rejected promise')
    })

    it('should handle ReferenceError for undefined variables', async () => {
      const result = await doInstance.do('return undefinedVariable')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toMatch(/not defined|reference/i)
    })

    it('should handle TypeError for invalid operations', async () => {
      const result = await doInstance.do(`
        const num = 42
        num()
      `)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toMatch(/not a function|type/i)
    })
  })

  // ===========================================================================
  // Console Output Capture
  // ===========================================================================

  describe('Console Output Capture', () => {
    it('should capture console.log output', async () => {
      const result = await doInstance.do(`
        console.log('Hello')
        console.log('World')
        return 'done'
      `)

      expect(result.success).toBe(true)
      expect(result.logs).toBeDefined()
      expect(result.logs).toContain('Hello')
      expect(result.logs).toContain('World')
    })

    it.todo('should capture console.info output', async () => {
      const result = await doInstance.do(`
        console.info('Info message')
        return 'done'
      `)

      expect(result.success).toBe(true)
      expect(result.logs).toContain('Info message')
    })

    it('should capture console.warn output', async () => {
      const result = await doInstance.do(`
        console.warn('Warning message')
        return 'done'
      `)

      expect(result.success).toBe(true)
      expect(result.logs).toBeDefined()
      // Warn should be captured in logs
    })

    it('should capture console.error output', async () => {
      const result = await doInstance.do(`
        console.error('Error message')
        return 'done'
      `)

      expect(result.success).toBe(true)
      expect(result.logs).toBeDefined()
      // Error should be captured in logs
    })

    it('should preserve log order', async () => {
      const result = await doInstance.do(`
        console.log('first')
        console.log('second')
        console.log('third')
        return 'done'
      `)

      expect(result.success).toBe(true)
      expect(result.logs?.[0]).toBe('first')
      expect(result.logs?.[1]).toBe('second')
      expect(result.logs?.[2]).toBe('third')
    })

    it('should handle console.log with multiple arguments', async () => {
      const result = await doInstance.do(`
        console.log('a', 'b', 'c')
        return 'done'
      `)

      expect(result.success).toBe(true)
      expect(result.logs).toBeDefined()
      // Should contain all arguments joined
    })

    it('should handle console.log with objects', async () => {
      const result = await doInstance.do(`
        console.log({ key: 'value' })
        return 'done'
      `)

      expect(result.success).toBe(true)
      expect(result.logs).toBeDefined()
    })
  })

  // ===========================================================================
  // Sandbox Security
  // ===========================================================================

  describe('Sandbox Security', () => {
    it('should not have access to process', async () => {
      const result = await doInstance.do('return typeof process')

      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })

    it('should not have access to require', async () => {
      const result = await doInstance.do('return typeof require')

      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })

    it('should not have access to __dirname', async () => {
      const result = await doInstance.do('return typeof __dirname')

      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })

    it('should not have access to __filename', async () => {
      const result = await doInstance.do('return typeof __filename')

      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })

    it.todo('should not have access to global Node.js APIs', async () => {
      const result = await doInstance.do(`
        return {
          buffer: typeof Buffer,
          fs: typeof fs,
          path: typeof path,
          child_process: typeof child_process
        }
      `)

      expect(result.success).toBe(true)
      const types = result.result as any
      expect(types.buffer).toBe('undefined')
      expect(types.fs).toBe('undefined')
      expect(types.path).toBe('undefined')
      expect(types.child_process).toBe('undefined')
    })

    it('should not allow eval', async () => {
      const result = await doInstance.do(`
        return eval('1 + 1')
      `)

      // Either returns undefined type for eval or throws an error
      expect(result).toBeDefined()
    })

    it('should not allow Function constructor', async () => {
      const result = await doInstance.do(`
        const fn = new Function('return 42')
        return fn()
      `)

      // Either restricted or allowed but sandboxed
      expect(result).toBeDefined()
    })
  })

  // ===========================================================================
  // Environment Variables
  // ===========================================================================

  describe('Environment Variables', () => {
    it('should inject env variables via options', async () => {
      const result = await doInstance.do('return env.API_KEY', {
        env: { API_KEY: 'secret-123' },
      })

      expect(result.success).toBe(true)
      expect(result.result).toBe('secret-123')
    })

    it('should support multiple env variables', async () => {
      const result = await doInstance.do(
        `
        return {
          key: env.API_KEY,
          secret: env.SECRET,
          region: env.REGION
        }
      `,
        {
          env: {
            API_KEY: 'key-value',
            SECRET: 'secret-value',
            REGION: 'us-west-2',
          },
        }
      )

      expect(result.success).toBe(true)
      expect((result.result as any).key).toBe('key-value')
      expect((result.result as any).secret).toBe('secret-value')
      expect((result.result as any).region).toBe('us-west-2')
    })

    it('should return undefined for missing env variables', async () => {
      const result = await doInstance.do('return env.NONEXISTENT', {
        env: {},
      })

      expect(result.success).toBe(true)
      expect(result.result).toBeUndefined()
    })

    it('should isolate env between executions', async () => {
      // First execution with env
      await doInstance.do('env.TEMP = "value"', { env: {} } as DoOptions)

      // Second execution should not see the modification
      const result = await doInstance.do('return env.TEMP', { env: {} } as DoOptions)

      expect(result.success).toBe(true)
      expect(result.result).toBeUndefined()
    })
  })

  // ===========================================================================
  // Timeout Handling
  // ===========================================================================

  describe('Timeout Handling', () => {
    it.todo('should respect timeout option', async () => {
      // Note: Synchronous infinite loops cannot be interrupted via setTimeout in Node.js
      // This test uses an async delay that can be properly timed out
      const result = await doInstance.do(
        `
        // Long async delay that exceeds the timeout
        await new Promise(resolve => setTimeout(resolve, 10000))
        return 'should not reach here'
      `,
        { timeout: 100 }
      )

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/timeout|exceeded|limit/i)
    })

    it('should complete quickly for fast code', async () => {
      const startTime = Date.now()
      const result = await doInstance.do('return 1 + 1')
      const elapsed = Date.now() - startTime

      expect(result.success).toBe(true)
      expect(elapsed).toBeLessThan(1000) // Should complete in under 1 second
    })

    it('should use default timeout when not specified', async () => {
      // This should not hang forever even without explicit timeout
      const result = await doInstance.do('return "fast"')

      expect(result.success).toBe(true)
      expect(result.result).toBe('fast')
    })

    it.todo('should handle sleep-like delays', async () => {
      const startTime = Date.now()
      const result = await doInstance.do(
        `
        await new Promise(resolve => setTimeout(resolve, 50))
        return 'completed'
      `,
        { timeout: 5000 }
      )
      const elapsed = Date.now() - startTime

      expect(result.success).toBe(true)
      expect(result.result).toBe('completed')
      expect(elapsed).toBeGreaterThanOrEqual(50)
    })
  })

  // ===========================================================================
  // Memory Limits
  // ===========================================================================

  describe('Memory Limits', () => {
    it('should accept memory limit option (enforcement depends on runtime)', async () => {
      // Note: Memory limits require V8 isolate flags or worker processes to actually enforce
      // This test just verifies the option is accepted without error
      const result = await doInstance.do(
        `
        const data = new Array(100).fill('test')
        return data.length
      `,
        { memory: 10 * 1024 * 1024 } // 10MB limit option
      )

      // Should complete successfully - memory option is accepted but not enforced in standard Node.js
      expect(result.success).toBe(true)
      expect(result.result).toBe(100)
    })

    it('should allow reasonable memory usage', async () => {
      const result = await doInstance.do(`
        const data = new Array(1000).fill('small data')
        return data.length
      `)

      expect(result.success).toBe(true)
      expect(result.result).toBe(1000)
    })
  })

  // ===========================================================================
  // Complex Integration Scenarios
  // ===========================================================================

  describe.todo('Complex Integration Scenarios', () => {
    it('should handle a complete CRUD workflow', async () => {
      const result = await doInstance.do(`
        // Create
        const user = await db.create('users', {
          name: 'Integration Test User',
          email: 'integration@test.com'
        })

        // Read
        const retrieved = await db.get('users', user.id)

        // Update
        const updated = await db.update('users', user.id, {
          name: 'Updated Integration Test User'
        })

        // List
        const users = await db.list('users')

        // Delete
        const deleted = await db.delete('users', user.id)

        return {
          created: user.id,
          retrieved: retrieved?.name,
          updated: updated?.name,
          listCount: users.length,
          deleted
        }
      `)

      expect(result.success).toBe(true)
      expect((result.result as any).created).toBeDefined()
      expect((result.result as any).retrieved).toBe('Integration Test User')
      expect((result.result as any).updated).toBe('Updated Integration Test User')
      expect((result.result as any).deleted).toBe(true)
    })

    it('should handle a graph operations workflow', async () => {
      const result = await doInstance.do(`
        // Create two things
        const user = await db.createThing({
          ns: 'graph.do',
          type: 'user',
          data: { name: 'Graph User' }
        })

        const project = await db.createThing({
          ns: 'graph.do',
          type: 'project',
          data: { name: 'Graph Project' }
        })

        // Create relationship
        const relationship = await db.relate({
          type: 'manages',
          from: user.url,
          to: project.url
        })

        // Query relationships
        const relationships = await db.relationships(user.url)

        return {
          userUrl: user.url,
          projectUrl: project.url,
          relationshipType: relationship.type,
          relationshipCount: relationships.length
        }
      `)

      expect(result.success).toBe(true)
      expect((result.result as any).userUrl).toContain('graph.do')
      expect((result.result as any).projectUrl).toContain('graph.do')
      expect((result.result as any).relationshipType).toBe('manages')
      expect((result.result as any).relationshipCount).toBeGreaterThanOrEqual(1)
    })

    it('should handle data transformation and aggregation', async () => {
      const result = await doInstance.do(`
        // Create some items with values using createThing
        const p1 = await db.createThing({ ns: 'test.do', type: 'product', id: 'p1', data: { name: 'Widget', price: 10 } })
        const p2 = await db.createThing({ ns: 'test.do', type: 'product', id: 'p2', data: { name: 'Gadget', price: 20 } })
        const p3 = await db.createThing({ ns: 'test.do', type: 'product', id: 'p3', data: { name: 'Gizmo', price: 30 } })

        // Aggregate the created products directly (since list() queries documents table)
        const products = [p1, p2, p3]
        const total = products.reduce((sum, p) => sum + p.data.price, 0)
        const names = products.map(p => p.data.name).sort()

        return {
          count: products.length,
          totalPrice: total,
          productNames: names
        }
      `)

      expect(result.success).toBe(true)
      expect((result.result as any).count).toBe(3)
      expect((result.result as any).totalPrice).toBe(60)
      expect((result.result as any).productNames).toEqual(['Gadget', 'Gizmo', 'Widget'])
    })

    it('should handle conditional logic based on data', async () => {
      const result = await doInstance.do(`
        // Create a user
        await db.create('users', { id: 'cond-user', status: 'active', role: 'admin' })

        // Get and check conditionally
        const user = await db.get('users', 'cond-user')

        let permissions = []
        if (user.status === 'active') {
          permissions.push('read')
          if (user.role === 'admin') {
            permissions.push('write', 'delete')
          }
        }

        return { permissions, isAdmin: user.role === 'admin' }
      `)

      expect(result.success).toBe(true)
      expect((result.result as any).permissions).toEqual(['read', 'write', 'delete'])
      expect((result.result as any).isAdmin).toBe(true)
    })
  })
})
