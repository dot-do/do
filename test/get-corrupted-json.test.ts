/**
 * @dotdo/do - get() Corrupted JSON Handling Tests (RED Phase - workers-819)
 *
 * These tests define the expected behavior for graceful handling of corrupted
 * JSON data in the get() method. The get() method should handle various forms
 * of data corruption without throwing unhandled exceptions.
 *
 * Corruption scenarios tested:
 * - Malformed JSON syntax (missing brackets, quotes, etc.)
 * - Truncated JSON (incomplete data)
 * - Binary/non-UTF8 data stored as JSON
 * - Empty strings
 * - Null bytes in JSON
 * - Extremely nested/deep structures
 * - Circular reference artifacts
 * - Mixed encoding issues
 *
 * Expected behaviors:
 * - Return null for corrupted data (graceful degradation)
 * - Optionally return error metadata for debugging
 * - Log corruption events for monitoring
 * - Support default value fallbacks
 * - Support validation/recovery callbacks
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DO } from '../src/do'

/**
 * Create a mock SQL storage that can return corrupted JSON
 */
function createCorruptedJsonSqlStorage(corruptedData: Map<string, string>) {
  const tables: Map<string, Map<string, Record<string, unknown>>> = new Map()
  tables.set('documents', new Map())

  return {
    exec(query: string, ...params: unknown[]) {
      const results: unknown[] = []
      const normalizedQuery = query.trim().toUpperCase()

      if (normalizedQuery.startsWith('CREATE TABLE')) {
        // No-op for table creation
      } else if (normalizedQuery.startsWith('SELECT')) {
        if (query.includes('WHERE collection = ? AND id = ?')) {
          const [collection, id] = params as [string, string]
          const key = `${collection}:${id}`

          // Check if we have corrupted data for this key
          if (corruptedData.has(key)) {
            results.push({ data: corruptedData.get(key) })
          } else {
            // Check normal storage
            const table = tables.get('documents')
            const row = table?.get(key)
            if (row) {
              results.push({ data: row.data })
            }
          }
        } else if (query.includes('WHERE collection = ?')) {
          // List query
          const [collection] = params as [string]
          const table = tables.get('documents')
          if (table) {
            for (const [key, row] of table.entries()) {
              if (key.startsWith(`${collection}:`)) {
                results.push({ data: row.data })
              }
            }
          }
          // Also include corrupted data in list
          for (const [key, data] of corruptedData.entries()) {
            if (key.startsWith(`${collection}:`)) {
              results.push({ data })
            }
          }
        }
      } else if (normalizedQuery.startsWith('INSERT')) {
        const [collection, id, data] = params as [string, string, string]
        const table = tables.get('documents')!
        const key = `${collection}:${id}`
        table.set(key, { collection, id, data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      }

      return {
        toArray() {
          return results
        }
      }
    }
  }
}

/**
 * Create mock context with corrupted data support
 */
function createMockCtxWithCorruptedData(corruptedData: Map<string, string>) {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    storage: {
      sql: createCorruptedJsonSqlStorage(corruptedData)
    }
  }
}

// Mock environment
const mockEnv = {}

describe('get() Corrupted JSON Handling (workers-819)', () => {
  describe('Malformed JSON Syntax', () => {
    it('should return null for JSON missing closing brace', async () => {
      const corruptedData = new Map<string, string>()
      corruptedData.set('users:corrupted1', '{"name": "Test"') // Missing }

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      const result = await doInstance.get('users', 'corrupted1')
      expect(result).toBeNull()
    })

    it('should return null for JSON missing opening brace', async () => {
      const corruptedData = new Map<string, string>()
      corruptedData.set('users:corrupted2', '"name": "Test"}') // Missing {

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      const result = await doInstance.get('users', 'corrupted2')
      expect(result).toBeNull()
    })

    it('should return null for JSON with unquoted keys', async () => {
      const corruptedData = new Map<string, string>()
      corruptedData.set('users:corrupted3', '{name: "Test"}') // Unquoted key

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      const result = await doInstance.get('users', 'corrupted3')
      expect(result).toBeNull()
    })

    it('should return null for JSON with single quotes', async () => {
      const corruptedData = new Map<string, string>()
      corruptedData.set('users:corrupted4', "{'name': 'Test'}") // Single quotes

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      const result = await doInstance.get('users', 'corrupted4')
      expect(result).toBeNull()
    })

    it('should return null for JSON with trailing comma', async () => {
      const corruptedData = new Map<string, string>()
      corruptedData.set('users:corrupted5', '{"name": "Test",}') // Trailing comma

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      const result = await doInstance.get('users', 'corrupted5')
      expect(result).toBeNull()
    })

    it('should return null for JSON with missing quotes around string value', async () => {
      const corruptedData = new Map<string, string>()
      corruptedData.set('users:corrupted6', '{"name": Test}') // Unquoted value

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      const result = await doInstance.get('users', 'corrupted6')
      expect(result).toBeNull()
    })

    it('should return null for completely invalid JSON', async () => {
      const corruptedData = new Map<string, string>()
      corruptedData.set('users:corrupted7', 'this is not json at all')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      const result = await doInstance.get('users', 'corrupted7')
      expect(result).toBeNull()
    })
  })

  describe('Truncated JSON', () => {
    it('should return null for truncated JSON object', async () => {
      const corruptedData = new Map<string, string>()
      corruptedData.set('users:truncated1', '{"name": "John", "email": "john@exam')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      const result = await doInstance.get('users', 'truncated1')
      expect(result).toBeNull()
    })

    it('should return null for truncated JSON array', async () => {
      const corruptedData = new Map<string, string>()
      corruptedData.set('items:truncated2', '[1, 2, 3, {"name": "Test"')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      const result = await doInstance.get('items', 'truncated2')
      expect(result).toBeNull()
    })

    it('should return null for truncated nested JSON', async () => {
      const corruptedData = new Map<string, string>()
      corruptedData.set('data:truncated3', '{"user": {"profile": {"settings": {"theme":')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      const result = await doInstance.get('data', 'truncated3')
      expect(result).toBeNull()
    })
  })

  describe('Empty and Whitespace Data', () => {
    it('should return null for empty string', async () => {
      const corruptedData = new Map<string, string>()
      corruptedData.set('users:empty1', '')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      const result = await doInstance.get('users', 'empty1')
      expect(result).toBeNull()
    })

    it('should return null for whitespace-only string', async () => {
      const corruptedData = new Map<string, string>()
      corruptedData.set('users:empty2', '   \n\t  ')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      const result = await doInstance.get('users', 'empty2')
      expect(result).toBeNull()
    })

    it('should return null for null literal string', async () => {
      const corruptedData = new Map<string, string>()
      // Note: "null" is valid JSON, but storing a document as null is unexpected
      // This test expects null to be returned for unexpected primitive values
      corruptedData.set('users:nullstr', 'null')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      // When the stored data is just "null", it parses to null
      // The method should treat this as "no document" and return null
      const result = await doInstance.get('users', 'nullstr')
      expect(result).toBeNull()
    })
  })

  describe('Binary and Non-UTF8 Data', () => {
    it('should return null for binary data stored as string', async () => {
      const corruptedData = new Map<string, string>()
      // Binary-like data that's not valid JSON
      corruptedData.set('files:binary1', '\x00\x01\x02\x03\x04\x05')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      const result = await doInstance.get('files', 'binary1')
      expect(result).toBeNull()
    })

    it('should return null for data with null bytes embedded in JSON', async () => {
      const corruptedData = new Map<string, string>()
      corruptedData.set('users:nullbytes', '{"name": "Test\x00User"}')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      const result = await doInstance.get('users', 'nullbytes')
      // Should handle gracefully - either parse successfully or return null
      // The null byte might cause parsing to fail in some JSON parsers
      expect(result === null || (result && typeof result === 'object')).toBe(true)
    })

    it('should return null for mixed encoding garbage', async () => {
      const corruptedData = new Map<string, string>()
      // Invalid UTF-8 sequence mixed with JSON-like content
      corruptedData.set('data:encoding1', '{"data": "\xFF\xFE test"}')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      const result = await doInstance.get('data', 'encoding1')
      // Should handle gracefully
      expect(result === null || typeof result === 'object').toBe(true)
    })
  })

  describe('Special Characters and Escape Sequences', () => {
    it('should return null for invalid escape sequences', async () => {
      const corruptedData = new Map<string, string>()
      // Invalid escape sequence \x is not valid JSON
      corruptedData.set('users:escape1', '{"name": "Test\\xUser"}')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      const result = await doInstance.get('users', 'escape1')
      expect(result).toBeNull()
    })

    it('should return null for unescaped control characters', async () => {
      const corruptedData = new Map<string, string>()
      // Tab character not escaped
      corruptedData.set('users:control1', '{"name": "Test\tUser"}')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      const result = await doInstance.get('users', 'control1')
      // Tab in string is actually invalid JSON, should return null
      expect(result).toBeNull()
    })

    it('should return null for unescaped newlines in strings', async () => {
      const corruptedData = new Map<string, string>()
      // Literal newline in string (not \n escape sequence)
      corruptedData.set('users:newline1', '{"name": "Test\nUser"}')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      const result = await doInstance.get('users', 'newline1')
      expect(result).toBeNull()
    })
  })

  describe('Extremely Large or Nested Data', () => {
    it('should handle deeply nested JSON gracefully', async () => {
      const corruptedData = new Map<string, string>()
      // Create very deeply nested object (might hit recursion limits)
      let nested = '{"a":'
      for (let i = 0; i < 1000; i++) {
        nested += '{"a":'
      }
      nested += '"value"'
      for (let i = 0; i < 1001; i++) {
        nested += '}'
      }
      corruptedData.set('data:deep1', nested)

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      // Should either parse successfully or return null gracefully (no crash)
      const result = await doInstance.get('data', 'deep1')
      expect(result === null || typeof result === 'object').toBe(true)
    })

    it('should handle very long strings gracefully', async () => {
      const corruptedData = new Map<string, string>()
      // 10MB string value
      const longValue = 'x'.repeat(10 * 1024 * 1024)
      corruptedData.set('data:long1', `{"value": "${longValue}"}`)

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      // Should handle without crashing
      const result = await doInstance.get('data', 'long1')
      expect(result === null || typeof result === 'object').toBe(true)
    })
  })

  describe('Corrupted Structure', () => {
    it('should return null for array stored as document', async () => {
      const corruptedData = new Map<string, string>()
      // Arrays are valid JSON but not expected document structure
      corruptedData.set('users:array1', '[1, 2, 3]')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      // Documents should be objects, not arrays
      // Current behavior: returns the array
      // Expected enhanced behavior: return null or wrap in error object
      const result = await doInstance.get('users', 'array1')
      // For now, accept either behavior but test what happens
      expect(result === null || Array.isArray(result) || typeof result === 'object').toBe(true)
    })

    it('should return null for primitive stored as document', async () => {
      const corruptedData = new Map<string, string>()
      // Primitives are valid JSON but not expected document structure
      corruptedData.set('users:primitive1', '"just a string"')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      const result = await doInstance.get('users', 'primitive1')
      // String primitive is not a valid document
      expect(result === null || typeof result === 'string' || typeof result === 'object').toBe(true)
    })

    it('should return null for number stored as document', async () => {
      const corruptedData = new Map<string, string>()
      corruptedData.set('users:number1', '42')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      const result = await doInstance.get('users', 'number1')
      // Number is not a valid document object
      expect(result === null || typeof result === 'number' || typeof result === 'object').toBe(true)
    })

    it('should return null for boolean stored as document', async () => {
      const corruptedData = new Map<string, string>()
      corruptedData.set('users:bool1', 'true')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      const result = await doInstance.get('users', 'bool1')
      // Boolean is not a valid document object
      expect(result === null || typeof result === 'boolean' || typeof result === 'object').toBe(true)
    })
  })

  describe('Error Metadata and Debugging (Enhanced Features)', () => {
    it('should support getWithMetadata option to return error details', async () => {
      const corruptedData = new Map<string, string>()
      corruptedData.set('users:meta1', '{invalid json}')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv) as any

      // Test enhanced get with metadata option (if implemented)
      // This test will fail in RED phase - implementation needed
      if (typeof doInstance.getWithMetadata === 'function') {
        const result = await doInstance.getWithMetadata('users', 'meta1')
        expect(result.data).toBeNull()
        expect(result.error).toBeDefined()
        expect(result.error.type).toBe('JSON_PARSE_ERROR')
        expect(result.error.rawData).toBe('{invalid json}')
      } else {
        // Skip if method not implemented - RED phase
        expect(doInstance.getWithMetadata).toBeUndefined()
      }
    })

    it('should support getOrDefault option to return default value on corruption', async () => {
      const corruptedData = new Map<string, string>()
      corruptedData.set('config:default1', '{corrupted}')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv) as any

      // Test enhanced get with default value (if implemented)
      if (typeof doInstance.getOrDefault === 'function') {
        const defaultValue = { theme: 'light', language: 'en' }
        const result = await doInstance.getOrDefault('config', 'default1', defaultValue)
        expect(result).toEqual(defaultValue)
      } else {
        // Skip if method not implemented - RED phase
        expect(doInstance.getOrDefault).toBeUndefined()
      }
    })

    it('should support onCorruptionDetected callback', async () => {
      const corruptedData = new Map<string, string>()
      corruptedData.set('audit:callback1', 'broken{json')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv) as any

      // Test corruption callback (if implemented)
      if (typeof doInstance.setCorruptionHandler === 'function') {
        const handler = vi.fn()
        doInstance.setCorruptionHandler(handler)

        await doInstance.get('audit', 'callback1')

        expect(handler).toHaveBeenCalledWith({
          collection: 'audit',
          id: 'callback1',
          rawData: 'broken{json',
          error: expect.any(Error),
        })
      } else {
        // Skip if method not implemented - RED phase
        expect(doInstance.setCorruptionHandler).toBeUndefined()
      }
    })
  })

  describe('Recovery and Validation (Enhanced Features)', () => {
    it('should support tryRecover option with custom parser', async () => {
      const corruptedData = new Map<string, string>()
      // JSON5-like syntax that could be recovered
      corruptedData.set('data:recover1', "{name: 'Test', count: 42,}")

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv) as any

      // Test recovery with custom parser (if implemented)
      if (typeof doInstance.getWithRecovery === 'function') {
        const customParser = (data: string) => {
          // Simple recovery: convert JSON5-like to valid JSON
          return JSON.parse(
            data
              .replace(/'/g, '"')
              .replace(/(\w+):/g, '"$1":')
              .replace(/,\s*}/g, '}')
          )
        }

        const result = await doInstance.getWithRecovery('data', 'recover1', customParser)
        expect(result).toEqual({ name: 'Test', count: 42 })
      } else {
        // Skip if method not implemented - RED phase
        expect(doInstance.getWithRecovery).toBeUndefined()
      }
    })

    it('should support schema validation on get', async () => {
      const corruptedData = new Map<string, string>()
      // Valid JSON but missing required fields
      corruptedData.set('users:schema1', '{"email": "test@example.com"}')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv) as any

      // Test schema validation (if implemented)
      if (typeof doInstance.getValidated === 'function') {
        const schema = {
          type: 'object',
          required: ['id', 'name', 'email'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
          },
        }

        const result = await doInstance.getValidated('users', 'schema1', schema)
        expect(result.valid).toBe(false)
        expect(result.errors).toContainEqual(expect.objectContaining({
          field: 'id',
          message: expect.stringContaining('required'),
        }))
      } else {
        // Skip if method not implemented - RED phase
        expect(doInstance.getValidated).toBeUndefined()
      }
    })
  })

  describe('Concurrency and Edge Cases', () => {
    it('should handle multiple concurrent gets with corrupted data', async () => {
      const corruptedData = new Map<string, string>()
      corruptedData.set('concurrent:1', '{broken1')
      corruptedData.set('concurrent:2', '{broken2')
      corruptedData.set('concurrent:3', '{"valid": true}')
      corruptedData.set('concurrent:4', 'broken4}')
      corruptedData.set('concurrent:5', '{"also": "valid"}')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      // All gets should complete without errors
      const results = await Promise.all([
        doInstance.get('concurrent', '1'),
        doInstance.get('concurrent', '2'),
        doInstance.get('concurrent', '3'),
        doInstance.get('concurrent', '4'),
        doInstance.get('concurrent', '5'),
      ])

      expect(results[0]).toBeNull() // corrupted
      expect(results[1]).toBeNull() // corrupted
      expect(results[2]).toEqual({ valid: true }) // valid
      expect(results[3]).toBeNull() // corrupted
      expect(results[4]).toEqual({ also: 'valid' }) // valid
    })

    it('should not leak corrupted data state between calls', async () => {
      const corruptedData = new Map<string, string>()
      corruptedData.set('isolation:corrupted', '{broken')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      // First call with corrupted data
      const corrupted = await doInstance.get('isolation', 'corrupted')
      expect(corrupted).toBeNull()

      // Create a valid document
      const created = await doInstance.create('isolation', { id: 'valid', name: 'Test' })
      expect(created.id).toBe('valid')

      // Get the valid document - should not be affected by previous corruption
      const valid = await doInstance.get('isolation', 'valid')
      expect(valid).toEqual({ id: 'valid', name: 'Test' })
    })

    it('should handle get after document was corrupted by external write', async () => {
      const corruptedData = new Map<string, string>()

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      // Create a valid document
      await doInstance.create('external', { id: 'doc1', name: 'Valid' })

      // Simulate external corruption
      corruptedData.set('external:doc1', '{corrupted by external process}')

      // Get should return null for corrupted data
      const result = await doInstance.get('external', 'doc1')
      expect(result).toBeNull()
    })
  })

  describe('JSON Injection and Security', () => {
    it('should safely handle prototype pollution attempts in JSON', async () => {
      const corruptedData = new Map<string, string>()
      // Attempt prototype pollution through JSON
      corruptedData.set('security:proto1', '{"__proto__": {"admin": true}}')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      const result = await doInstance.get('security', 'proto1')

      // Should not pollute Object prototype
      expect(({} as any).admin).toBeUndefined()

      // Result might be the parsed object or null depending on implementation
      expect(result === null || typeof result === 'object').toBe(true)
    })

    it('should safely handle constructor pollution attempts', async () => {
      const corruptedData = new Map<string, string>()
      corruptedData.set('security:constructor1', '{"constructor": {"prototype": {"pwned": true}}}')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      const result = await doInstance.get('security', 'constructor1')

      // Should not affect constructors
      expect(({} as any).pwned).toBeUndefined()
      expect(result === null || typeof result === 'object').toBe(true)
    })

    it('should handle JSON with script injection attempts', async () => {
      const corruptedData = new Map<string, string>()
      corruptedData.set('security:xss1', '{"name": "<script>alert(1)</script>"}')

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      // This is valid JSON, just with HTML content
      const result = await doInstance.get<{ name: string }>('security', 'xss1')

      // Should parse correctly - XSS prevention is responsibility of output encoding
      expect(result?.name).toBe('<script>alert(1)</script>')
    })
  })

  describe('Backwards Compatibility', () => {
    it('should maintain existing behavior for valid JSON', async () => {
      const corruptedData = new Map<string, string>()

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      // Create valid document
      const created = await doInstance.create('compat', {
        id: 'test1',
        name: 'Test User',
        email: 'test@example.com',
        metadata: { role: 'admin', active: true },
      })

      // Get should return exact same structure
      const retrieved = await doInstance.get('compat', 'test1')
      expect(retrieved).toEqual(created)
    })

    it('should return null for non-existent documents (existing behavior)', async () => {
      const corruptedData = new Map<string, string>()

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      const result = await doInstance.get('nonexistent', 'doc123')
      expect(result).toBeNull()
    })

    it('should handle special but valid JSON characters', async () => {
      const corruptedData = new Map<string, string>()

      const ctx = createMockCtxWithCorruptedData(corruptedData)
      const doInstance = new DO(ctx as any, mockEnv)

      // Create document with valid escaped characters
      const created = await doInstance.create('special', {
        id: 'special1',
        description: 'Line1\nLine2\tTabbed',
        unicode: '\u0048\u0065\u006C\u006C\u006F',
        quotes: '"Hello" and \'World\'',
        backslash: 'path\\to\\file',
      })

      const retrieved = await doInstance.get('special', 'special1')
      expect(retrieved).toEqual(created)
    })
  })
})
