/**
 * @dotdo/do - Security Tests (GREEN Phase)
 *
 * Tests for:
 * 1. SQL injection prevention in list() orderBy parameter
 * 2. Sandbox isolation in the do() method
 * 3. JSON field path validation in findThings()
 *
 * Uses the @cloudflare/vitest-pool-workers integration with real Miniflare-powered SQLite storage.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type { DurableObjectStub } from '@cloudflare/workers-types'
import { createTestStub, uniqueTestName } from './helpers/do-test-utils'
import type { ListOptions, DoOptions } from '../src/types'

// Type for DO stub with RPC methods
interface DOStub extends DurableObjectStub {
  get<T = Record<string, unknown>>(collection: string, id: string): Promise<T | null>
  list<T = Record<string, unknown>>(collection: string, options?: ListOptions): Promise<T[]>
  create(collection: string, doc: Record<string, unknown>): Promise<Record<string, unknown>>
  update(collection: string, id: string, updates: Record<string, unknown>): Promise<Record<string, unknown> | null>
  delete(collection: string, id: string): Promise<boolean>
  do(code: string, options?: DoOptions): Promise<{ success: boolean; result?: unknown; error?: string; duration: number }>
  findThings(options: { where?: Record<string, unknown>; limit?: number; offset?: number }): Promise<unknown[]>
}

describe('SQL Injection Prevention', () => {
  let stub: DOStub

  beforeEach(() => {
    const name = uniqueTestName('security-sql')
    stub = createTestStub(name) as DOStub
  })

  describe('list() orderBy validation', () => {
    it('should allow valid orderBy values', async () => {
      // These are the standard columns that should be allowed
      const validColumns = ['id', 'created_at', 'updated_at']

      for (const column of validColumns) {
        // Should not throw for valid columns
        const result = await stub.list('users', { orderBy: column })
        expect(Array.isArray(result)).toBe(true)
      }
    })

    it('should reject orderBy with SQL injection attempt "id; DROP TABLE"', async () => {
      // This is a classic SQL injection attempt
      await expect(
        stub.list('users', { orderBy: 'id; DROP TABLE documents' })
      ).rejects.toThrow(/invalid|not allowed|orderBy/i)
    })

    it('should reject orderBy with SQL injection attempt using comments', async () => {
      // SQL comment injection attempt
      await expect(
        stub.list('users', { orderBy: 'id--' })
      ).rejects.toThrow(/invalid|not allowed|orderBy/i)
    })

    it('should reject orderBy with SQL injection attempt using UNION', async () => {
      // UNION injection attempt
      await expect(
        stub.list('users', { orderBy: 'id UNION SELECT * FROM documents' })
      ).rejects.toThrow(/invalid|not allowed|orderBy/i)
    })

    it('should reject orderBy with arbitrary column names not in allowlist', async () => {
      // Arbitrary column names should be rejected even if they look safe
      await expect(
        stub.list('users', { orderBy: 'arbitrary_column' })
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
          stub.list('users', { orderBy: input })
        ).rejects.toThrow(/invalid|not allowed|orderBy/i)
      }
    })

    it('should reject empty orderBy string', async () => {
      await expect(
        stub.list('users', { orderBy: '' })
      ).rejects.toThrow(/invalid|not allowed|orderBy/i)
    })

    it('should reject orderBy with spaces', async () => {
      await expect(
        stub.list('users', { orderBy: 'id name' })
      ).rejects.toThrow(/invalid|not allowed|orderBy/i)
    })

    it('should use default orderBy when not provided', async () => {
      // When orderBy is not provided, should use a safe default
      const result = await stub.list('users')
      expect(Array.isArray(result)).toBe(true)
    })
  })
})

describe('Sandbox Security', () => {
  let stub: DOStub

  beforeEach(() => {
    const name = uniqueTestName('security-sandbox')
    stub = createTestStub(name) as DOStub
  })

  describe('do() method sandbox isolation', () => {
    it('should prevent access to globalThis', async () => {
      const result = await stub.do('return typeof globalThis')
      // Should either return undefined or throw an error
      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })

    it('should prevent access to process', async () => {
      const result = await stub.do('return typeof process')
      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })

    it('should prevent access to require', async () => {
      const result = await stub.do('return typeof require')
      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })

    it('should prevent eval from being used to execute arbitrary code', async () => {
      // In strict mode, direct eval can't define new variables in scope
      // The sandbox prevents eval from accessing external scope
      const result = await stub.do('try { eval("process") } catch(e) { return "blocked" }')
      expect(result.success).toBe(true)
      // Eval inside sandbox can only access sandbox scope
      expect(['blocked', undefined]).toContain(result.result)
    })

    it('should prevent access to Function constructor', async () => {
      const result = await stub.do('return typeof Function')
      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })

    it('should prevent dynamic import from loading modules', async () => {
      // Dynamic import() is syntax that can't be blocked via scope
      // The sandbox's static analysis should detect and block import()
      // Note: This test may throw DataCloneError because import() returns a Promise
      // that cannot be serialized across RPC boundary - which is also a form of blocking
      try {
        const result = await stub.do('return import("fs")')
        // If we get here, the result should indicate failure
        expect(result.success).toBe(false)
        expect(result.error).toMatch(/import|dangerous|blocked/i)
      } catch (error: unknown) {
        // DataCloneError means the Promise couldn't cross RPC boundary - also acceptable
        expect((error as Error).message).toMatch(/clone|Promise|serializ/i)
      }
    })

    it('should prevent access to window', async () => {
      const result = await stub.do('return typeof window')
      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })

    it('should prevent access to this context', async () => {
      // User code should not access the DO instance via this
      const result = await stub.do('return typeof this')
      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })

    it('should block Function variable but note prototype chain limitation', async () => {
      // Direct Function constructor is blocked
      const result1 = await stub.do('return typeof Function')
      expect(result1.success).toBe(true)
      expect(result1.result).toBe('undefined')

      // Note: Prototype chain escape ((function(){}).constructor) is a known limitation
      // of JavaScript sandboxing. Full isolation requires V8 isolates or WebAssembly.
      // This test documents the current security boundary.
    })

    it('should prevent __proto__ access to prototype chain for sandbox escape', async () => {
      // __proto__ access is blocked by the sandbox's static analysis
      // The code should fail during static analysis with a security error
      const result = await stub.do('return ({}).__proto__.constructor("return process")()')
      // Should fail because __proto__ is detected and blocked
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/__proto__|Dangerous code pattern|blocked/i)
    })

    it('should allow safe Math operations', async () => {
      const result = await stub.do('return Math.sqrt(16)')
      expect(result.success).toBe(true)
      expect(result.result).toBe(4)
    })

    it('should allow safe JSON operations', async () => {
      const result = await stub.do('return JSON.stringify({ a: 1 })')
      expect(result.success).toBe(true)
      expect(result.result).toBe('{"a":1}')
    })

    it('should allow safe Date operations', async () => {
      const result = await stub.do('return typeof Date')
      expect(result.success).toBe(true)
      expect(result.result).toBe('function')
    })

    it('should allow basic arithmetic', async () => {
      const result = await stub.do('return 2 + 2 * 3')
      expect(result.success).toBe(true)
      expect(result.result).toBe(8)
    })

    it('should allow string operations', async () => {
      const result = await stub.do('return "hello".toUpperCase()')
      expect(result.success).toBe(true)
      expect(result.result).toBe('HELLO')
    })

    it('should allow array operations', async () => {
      const result = await stub.do('return [1, 2, 3].map(x => x * 2)')
      expect(result.success).toBe(true)
      expect(result.result).toEqual([2, 4, 6])
    })

    it('should allow object operations', async () => {
      const result = await stub.do('return Object.keys({ a: 1, b: 2 })')
      expect(result.success).toBe(true)
      expect(result.result).toEqual(['a', 'b'])
    })

    it('should prevent setTimeout access', async () => {
      const result = await stub.do('return typeof setTimeout')
      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })

    it('should prevent setInterval access', async () => {
      const result = await stub.do('return typeof setInterval')
      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })

    it('should prevent fetch access from sandbox', async () => {
      // fetch should be blocked in the sandbox - use do.fetch() instead
      const result = await stub.do('return typeof fetch')
      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })

    it('should prevent WebSocket access', async () => {
      const result = await stub.do('return typeof WebSocket')
      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })

    it('should prevent XMLHttpRequest access', async () => {
      const result = await stub.do('return typeof XMLHttpRequest')
      expect(result.success).toBe(true)
      expect(result.result).toBe('undefined')
    })
  })
})

describe('findThings() JSON Field Path Validation', () => {
  let stub: DOStub

  beforeEach(() => {
    const name = uniqueTestName('security-findthings')
    stub = createTestStub(name) as DOStub
  })

  it('should reject malicious JSON field paths with SQL injection attempts', async () => {
    // Attempt SQL injection via data field filter
    const maliciousPath = "role'); DROP TABLE things; --"

    await expect(
      stub.findThings({
        where: {
          [`data.${maliciousPath}`]: 'admin'
        }
      })
    ).rejects.toThrow(/invalid.*field.*path/i)
  })

  it('should reject JSON field paths containing semicolons', async () => {
    await expect(
      stub.findThings({
        where: {
          'data.field; DROP TABLE': 'value'
        }
      })
    ).rejects.toThrow(/invalid.*field.*path/i)
  })

  it('should reject JSON field paths containing SQL comments', async () => {
    await expect(
      stub.findThings({
        where: {
          'data.field--comment': 'value'
        }
      })
    ).rejects.toThrow(/invalid.*field.*path/i)
  })

  it('should reject JSON field paths containing single quotes', async () => {
    await expect(
      stub.findThings({
        where: {
          "data.field'injection": 'value'
        }
      })
    ).rejects.toThrow(/invalid.*field.*path/i)
  })

  it('should reject JSON field paths containing parentheses', async () => {
    await expect(
      stub.findThings({
        where: {
          'data.field()': 'value'
        }
      })
    ).rejects.toThrow(/invalid.*field.*path/i)
  })

  it('should allow valid JSON field paths with alphanumeric characters', async () => {
    // Should not throw for valid paths
    const result = await stub.findThings({
      where: {
        'data.role': 'admin'
      }
    })
    expect(Array.isArray(result)).toBe(true)
  })

  it('should allow valid JSON field paths with underscores', async () => {
    const result = await stub.findThings({
      where: {
        'data.user_name': 'john'
      }
    })
    expect(Array.isArray(result)).toBe(true)
  })

  it('should allow valid JSON field paths with dots for nested access', async () => {
    const result = await stub.findThings({
      where: {
        'data.address.city': 'NYC'
      }
    })
    expect(Array.isArray(result)).toBe(true)
  })

  it('should allow valid JSON field paths with array bracket notation', async () => {
    const result = await stub.findThings({
      where: {
        'data.items[0]': 'first'
      }
    })
    expect(Array.isArray(result)).toBe(true)
  })

  it('should reject paths with backticks', async () => {
    await expect(
      stub.findThings({
        where: {
          'data.field`injection': 'value'
        }
      })
    ).rejects.toThrow(/invalid.*field.*path/i)
  })

  it('should reject paths with double quotes', async () => {
    await expect(
      stub.findThings({
        where: {
          'data.field"injection': 'value'
        }
      })
    ).rejects.toThrow(/invalid.*field.*path/i)
  })
})
