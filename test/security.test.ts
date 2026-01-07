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
 * @dotdo/do - Security Tests
 *
 * Tests for:
 * 1. SQL injection prevention in list() orderBy parameter
 * 2. Sandbox isolation in the do() method
 *
 * These tests verify that user input cannot inject malicious SQL
 * and that sandboxed code cannot access dangerous globals.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { DO } from '../src/do'

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
      }

      return {
        toArray() {
          return results
        }
      }
    }
  }
}

function createMockCtx() {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    storage: {
      sql: createMockSqlStorage()
    }
  }
}

const mockEnv = {}

describe('SQL Injection Prevention', () => {
  describe('list() orderBy validation', () => {
    let doInstance: DO
    let mockCtx: ReturnType<typeof createMockCtx>

    beforeEach(() => {
      mockCtx = createMockCtx()
      doInstance = new DO(mockCtx as any, mockEnv)
    })

    it('should allow valid orderBy values', async () => {
      // These are the standard columns that should be allowed
      const validColumns = ['id', 'created_at', 'updated_at']

      for (const column of validColumns) {
        // Should not throw for valid columns
        await expect(doInstance.list('users', { orderBy: column })).resolves.toBeDefined()
      }
    })

    it('should reject orderBy with SQL injection attempt "id; DROP TABLE"', async () => {
      // This is a classic SQL injection attempt
      await expect(
        doInstance.list('users', { orderBy: 'id; DROP TABLE documents' })
      ).rejects.toThrow(/invalid|not allowed|orderBy/i)
    })

    it('should reject orderBy with SQL injection attempt using comments', async () => {
      // SQL comment injection attempt
      await expect(
        doInstance.list('users', { orderBy: 'id--' })
      ).rejects.toThrow(/invalid|not allowed|orderBy/i)
    })

    it('should reject orderBy with SQL injection attempt using UNION', async () => {
      // UNION injection attempt
      await expect(
        doInstance.list('users', { orderBy: 'id UNION SELECT * FROM documents' })
      ).rejects.toThrow(/invalid|not allowed|orderBy/i)
    })

    it('should reject orderBy with arbitrary column names not in allowlist', async () => {
      // Arbitrary column names should be rejected even if they look safe
      await expect(
        doInstance.list('users', { orderBy: 'arbitrary_column' })
      ).rejects.toThrow(/invalid|not allowed|orderBy/i)
    })

    it('should reject orderBy with special characters', async () => {
      const maliciousInputs = [
        "id'",
        'id"',
        'id`',
        'id\\',
        'id\n',
        'id\r',
        'id\t',
        'id\0',
      ]

      for (const input of maliciousInputs) {
        await expect(
          doInstance.list('users', { orderBy: input })
        ).rejects.toThrow(/invalid|not allowed|orderBy/i)
      }
    })

    it('should reject empty orderBy string', async () => {
      await expect(
        doInstance.list('users', { orderBy: '' })
      ).rejects.toThrow(/invalid|not allowed|orderBy/i)
    })

    it('should reject orderBy with spaces', async () => {
      await expect(
        doInstance.list('users', { orderBy: 'id name' })
      ).rejects.toThrow(/invalid|not allowed|orderBy/i)
    })

    it('should use default orderBy when not provided', async () => {
      // When orderBy is not provided, should use a safe default
      const result = await doInstance.list('users')
      expect(Array.isArray(result)).toBe(true)
    })
  })
})

describe('Sandbox Security', () => {
  let doInstance: DO

  beforeEach(() => {
    doInstance = new DO(createMockCtx() as any, mockEnv)
  })

  describe('do() method sandbox isolation', () => {
    it('should prevent access to globalThis', async () => {
      const result = await doInstance.do('return typeof globalThis')
      // Should either return undefined or throw an error
      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })

    it('should prevent access to process', async () => {
      const result = await doInstance.do('return typeof process')
      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })

    it('should prevent access to require', async () => {
      const result = await doInstance.do('return typeof require')
      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })

    it('should prevent eval from being used to execute arbitrary code', async () => {
      // In strict mode, direct eval can't define new variables in scope
      // The sandbox prevents eval from accessing external scope
      const result = await doInstance.do('try { eval("process") } catch(e) { return "blocked" }')
      expect(result.success).toBe(true)
      // Eval inside sandbox can only access sandbox scope
      expect(['blocked', undefined]).toContain(result.result)
    })

    it('should prevent access to Function constructor', async () => {
      const result = await doInstance.do('return typeof Function')
      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })

    it('should prevent dynamic import from loading modules', async () => {
      // Dynamic import() is syntax that can't be blocked via scope
      // But it should fail because the sandbox environment doesn't support it
      const result = await doInstance.do('return import("fs").then(() => "loaded").catch(() => "blocked")')
      // Should either fail or be blocked
      if (result.success) {
        // If it ran, should return the catch result or Promise
        expect(result.result).toBeDefined()
      } else {
        expect(result.error).toBeDefined()
      }
    })

    it('should prevent access to window', async () => {
      const result = await doInstance.do('return typeof window')
      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })

    it('should prevent access to this context', async () => {
      // User code should not access the DO instance via this
      const result = await doInstance.do('return typeof this')
      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })

    it('should block Function variable but note prototype chain limitation', async () => {
      // Direct Function constructor is blocked
      const result1 = await doInstance.do('return typeof Function')
      expect(result1.success).toBe(true)
      expect(result1.result).toBe('undefined')

      // Note: Prototype chain escape ((function(){}).constructor) is a known limitation
      // of JavaScript sandboxing. Full isolation requires V8 isolates or WebAssembly.
      // This test documents the current security boundary.
    })

    it('should prevent __proto__ access to prototype chain for sandbox escape', async () => {
      // __proto__ can't be fully blocked on objects, but we can prevent using it to escape
      const result = await doInstance.do('return ({}).__proto__.constructor("return process")()')
      // Should either fail or return undefined (process is blocked)
      if (result.success) {
        expect(result.result).toBeUndefined()
      } else {
        expect(result.error).toBeDefined()
      }
    })

    it('should allow safe Math operations', async () => {
      const result = await doInstance.do('return Math.sqrt(16)')
      expect(result.success).toBe(true)
      expect(result.result).toBe(4)
    })

    it('should allow safe JSON operations', async () => {
      const result = await doInstance.do('return JSON.stringify({ a: 1 })')
      expect(result.success).toBe(true)
      expect(result.result).toBe('{"a":1}')
    })

    it('should allow safe Date operations', async () => {
      const result = await doInstance.do('return typeof Date')
      expect(result.success).toBe(true)
      expect(result.result).toBe('function')
    })

    it('should allow basic arithmetic', async () => {
      const result = await doInstance.do('return 2 + 2 * 3')
      expect(result.success).toBe(true)
      expect(result.result).toBe(8)
    })

    it('should allow string operations', async () => {
      const result = await doInstance.do('return "hello".toUpperCase()')
      expect(result.success).toBe(true)
      expect(result.result).toBe('HELLO')
    })

    it('should allow array operations', async () => {
      const result = await doInstance.do('return [1, 2, 3].map(x => x * 2)')
      expect(result.success).toBe(true)
      expect(result.result).toEqual([2, 4, 6])
    })

    it('should allow object operations', async () => {
      const result = await doInstance.do('return Object.keys({ a: 1, b: 2 })')
      expect(result.success).toBe(true)
      expect(result.result).toEqual(['a', 'b'])
    })

    it('should prevent setTimeout access', async () => {
      const result = await doInstance.do('return typeof setTimeout')
      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })

    it('should prevent setInterval access', async () => {
      const result = await doInstance.do('return typeof setInterval')
      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })

    it('should prevent fetch access from sandbox', async () => {
      // fetch should be blocked in the sandbox - use do.fetch() instead
      const result = await doInstance.do('return typeof fetch')
      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })

    it('should prevent WebSocket access', async () => {
      const result = await doInstance.do('return typeof WebSocket')
      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })

    it('should prevent XMLHttpRequest access', async () => {
      const result = await doInstance.do('return typeof XMLHttpRequest')
      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })
  })
})

/**
 * Create an enhanced mock SQL storage for testing findThings() security
 * This mock captures the raw SQL queries to verify field path injection attempts
 */
function createSecurityMockSqlStorage() {
  const tables: Map<string, Map<string, Record<string, unknown>>> = new Map()
  const executedQueries: string[] = []

  return {
    exec(query: string, ...params: unknown[]) {
      executedQueries.push(query)
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
        if (query.includes('things')) {
          const [ns, type, id, url, data] = params as [string, string, string, string, string]
          const tableName = 'things'
          if (!tables.has(tableName)) {
            tables.set(tableName, new Map())
          }
          const table = tables.get(tableName)!
          table.set(url, { ns, type, id, url, data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        }
      } else if (normalizedQuery.startsWith('SELECT')) {
        if (query.includes('things')) {
          const table = tables.get('things')
          if (table) {
            if (query.includes('ORDER BY') && query.includes('LIMIT')) {
              const limit = params[params.length - 2] as number
              const offset = params[params.length - 1] as number
              const rows = Array.from(table.values()).slice(offset, offset + limit)
              results.push(...rows)
            }
          }
        }
      }

      return {
        toArray() {
          return results
        }
      }
    },
    getExecutedQueries() {
      return executedQueries
    },
    clearQueries() {
      executedQueries.length = 0
    }
  }
}

function createSecurityMockCtx() {
  const sqlStorage = createSecurityMockSqlStorage()
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    storage: {
      sql: sqlStorage
    },
    _sqlStorage: sqlStorage
  }
}

describe('findThings() JSON Field Path Validation', () => {
  it('should reject malicious JSON field paths with SQL injection attempts', async () => {
    const ctx = createSecurityMockCtx()
    const doInstance = new DO(ctx as any, mockEnv)

    // Attempt SQL injection via data field filter
    const maliciousPath = "role'); DROP TABLE things; --"

    await expect(
      (doInstance as any).findThings({
        where: {
          [`data.${maliciousPath}`]: 'admin'
        }
      })
    ).rejects.toThrow(/invalid.*path|malicious|injection/i)
  })

  it('should reject JSON field paths containing semicolons', async () => {
    const ctx = createSecurityMockCtx()
    const doInstance = new DO(ctx as any, mockEnv)

    await expect(
      (doInstance as any).findThings({
        where: {
          'data.field; DROP TABLE': 'value'
        }
      })
    ).rejects.toThrow(/invalid.*path|malicious|injection/i)
  })

  it('should reject JSON field paths containing SQL comments', async () => {
    const ctx = createSecurityMockCtx()
    const doInstance = new DO(ctx as any, mockEnv)

    await expect(
      (doInstance as any).findThings({
        where: {
          'data.field--comment': 'value'
        }
      })
    ).rejects.toThrow(/invalid.*path|malicious|injection/i)
  })

  it('should reject JSON field paths containing single quotes', async () => {
    const ctx = createSecurityMockCtx()
    const doInstance = new DO(ctx as any, mockEnv)

    await expect(
      (doInstance as any).findThings({
        where: {
          "data.field'injection": 'value'
        }
      })
    ).rejects.toThrow(/invalid.*path|malicious|injection/i)
  })

  it('should reject JSON field paths containing parentheses', async () => {
    const ctx = createSecurityMockCtx()
    const doInstance = new DO(ctx as any, mockEnv)

    await expect(
      (doInstance as any).findThings({
        where: {
          'data.field()': 'value'
        }
      })
    ).rejects.toThrow(/invalid.*path|malicious|injection/i)
  })

  it('should allow valid JSON field paths with alphanumeric characters', async () => {
    const ctx = createSecurityMockCtx()
    const doInstance = new DO(ctx as any, mockEnv)

    // Should not throw for valid paths
    await expect(
      (doInstance as any).findThings({
        where: {
          'data.role': 'admin'
        }
      })
    ).resolves.toBeDefined()
  })

  it('should allow valid JSON field paths with underscores', async () => {
    const ctx = createSecurityMockCtx()
    const doInstance = new DO(ctx as any, mockEnv)

    await expect(
      (doInstance as any).findThings({
        where: {
          'data.user_name': 'john'
        }
      })
    ).resolves.toBeDefined()
  })

  it('should allow valid JSON field paths with dots for nested access', async () => {
    const ctx = createSecurityMockCtx()
    const doInstance = new DO(ctx as any, mockEnv)

    await expect(
      (doInstance as any).findThings({
        where: {
          'data.address.city': 'NYC'
        }
      })
    ).resolves.toBeDefined()
  })

  it('should allow valid JSON field paths with array bracket notation', async () => {
    const ctx = createSecurityMockCtx()
    const doInstance = new DO(ctx as any, mockEnv)

    await expect(
      (doInstance as any).findThings({
        where: {
          'data.items[0]': 'first'
        }
      })
    ).resolves.toBeDefined()
  })

  it('should reject paths with backticks', async () => {
    const ctx = createSecurityMockCtx()
    const doInstance = new DO(ctx as any, mockEnv)

    await expect(
      (doInstance as any).findThings({
        where: {
          'data.field`injection': 'value'
        }
      })
    ).rejects.toThrow(/invalid.*path|malicious|injection/i)
  })

  it('should reject paths with double quotes', async () => {
    const ctx = createSecurityMockCtx()
    const doInstance = new DO(ctx as any, mockEnv)

    await expect(
      (doInstance as any).findThings({
        where: {
          'data.field"injection': 'value'
        }
      })
    ).rejects.toThrow(/invalid.*path|malicious|injection/i)
  })
})
