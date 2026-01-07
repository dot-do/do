/**
 * @dotdo/do - Error Handling Tests
 *
 * Tests for graceful handling of corrupted data and edge cases.
 */

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

import { describe, it, expect, beforeEach } from 'vitest'
import { DO } from '../src/do'

// Mock WebSocketPair for Cloudflare Workers compatibility in Node.js
class MockWebSocket {
  readyState = 1
  send = vi.fn()
  close = vi.fn()
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
}

// Mock Response with webSocket property for WebSocket upgrade responses
const OriginalResponse = globalThis.Response
class MockResponse extends OriginalResponse {
  webSocket?: MockWebSocket
  private _status?: number
  constructor(body: BodyInit | null, init?: ResponseInit & { webSocket?: MockWebSocket }) {
    const wsStatus = init?.status
    const isWebSocketUpgrade = wsStatus === 101
    const safeInit = isWebSocketUpgrade ? { ...init, status: 200 } : init
    super(body, safeInit)
    if (isWebSocketUpgrade) {
      this._status = 101
    }
    if (init?.webSocket) {
      this.webSocket = init.webSocket
    }
  }
  get status() {
    return this._status ?? super.status
  }
}
globalThis.Response = MockResponse as typeof Response

// Mock WebSocketPair globally
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
 * Create a mock SQL storage that can inject corrupted data
 */
function createMockSqlStorageWithCorruptedData(corruptedData: Map<string, string>) {
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
      } else if (normalizedQuery.startsWith('CREATE INDEX')) {
        // Ignore index creation
      } else if (normalizedQuery.startsWith('INSERT')) {
        const [collection, id, data] = params as [string, string, string]
        const tableName = 'documents'
        if (!tables.has(tableName)) {
          tables.set(tableName, new Map())
        }
        const table = tables.get(tableName)!
        const key = `${collection}:${id}`
        table.set(key, {
          collection,
          id,
          data,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      } else if (normalizedQuery.startsWith('SELECT')) {
        const tableName = 'documents'
        const table = tables.get(tableName)

        if (table) {
          if (query.includes('WHERE collection = ? AND id = ?')) {
            const [collection, id] = params as [string, string]
            const key = `${collection}:${id}`

            // Check if we should return corrupted data
            if (corruptedData.has(key)) {
              results.push({ data: corruptedData.get(key) })
            } else {
              const row = table.get(key)
              if (row) {
                results.push({ data: row.data })
              }
            }
          } else if (query.includes('WHERE collection = ?')) {
            const [collection, limit, offset] = params as [string, number, number]
            const matching: Record<string, unknown>[] = []
            for (const [tableKey, row] of table.entries()) {
              if (tableKey.startsWith(`${collection}:`)) {
                // Check for corrupted data in list results
                if (corruptedData.has(tableKey)) {
                  matching.push({ data: corruptedData.get(tableKey) })
                } else {
                  matching.push({ data: row.data })
                }
              }
            }
            const paginated = matching.slice(offset, offset + limit)
            results.push(...paginated)
          }
        }
      } else if (normalizedQuery.startsWith('UPDATE')) {
        const [data, collection, id] = params as [string, string, string]
        const tableName = 'documents'
        const table = tables.get(tableName)
        if (table) {
          const key = `${collection}:${id}`
          const existing = table.get(key)
          if (existing) {
            table.set(key, { ...existing, data, updated_at: new Date().toISOString() })
          }
        }
      } else if (normalizedQuery.startsWith('DELETE')) {
        const [collection, id] = params as [string, string]
        const tableName = 'documents'
        const table = tables.get(tableName)
        if (table) {
          const key = `${collection}:${id}`
          table.delete(key)
        }
      }

      return {
        toArray() {
          return results
        },
      }
    },
  }
}

/**
 * Create a mock context with corrupted data capability
 */
function createMockCtxWithCorruptedData(corruptedData: Map<string, string> = new Map()) {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    storage: {
      sql: createMockSqlStorageWithCorruptedData(corruptedData),
    },
  }
}

// Mock environment
const mockEnv = {
  DO_NAMESPACE: {
    idFromName: vi.fn(() => ({ toString: () => 'mock-id' })),
    get: vi.fn(),
  },
}

describe('Error Handling', () => {
  describe('JSON Parsing Errors', () => {
    describe('get() with corrupted JSON', () => {
      it('should handle corrupted JSON data gracefully without throwing', async () => {
        // Create corrupted data that will cause JSON.parse to fail
        const corruptedData = new Map<string, string>()
        corruptedData.set('users:corrupted-id', '{invalid json data here')

        const mockCtx = createMockCtxWithCorruptedData(corruptedData)
        const doInstance = new DO(mockCtx as any, mockEnv)

        // This should NOT throw, instead return null or an error response
        const result = await doInstance.get('users', 'corrupted-id')

        // The method should handle the error gracefully
        // Either returning null or some error indicator, but NOT throwing
        expect(result).toBeNull()
      })

      it('should return null for truncated JSON', async () => {
        const corruptedData = new Map<string, string>()
        corruptedData.set('users:truncated', '{"name": "test", "email":')

        const mockCtx = createMockCtxWithCorruptedData(corruptedData)
        const doInstance = new DO(mockCtx as any, mockEnv)

        const result = await doInstance.get('users', 'truncated')
        expect(result).toBeNull()
      })

      it('should return null for empty string JSON', async () => {
        const corruptedData = new Map<string, string>()
        corruptedData.set('users:empty', '')

        const mockCtx = createMockCtxWithCorruptedData(corruptedData)
        const doInstance = new DO(mockCtx as any, mockEnv)

        const result = await doInstance.get('users', 'empty')
        expect(result).toBeNull()
      })

      it('should return null for non-object JSON values', async () => {
        const corruptedData = new Map<string, string>()
        // "null" is valid JSON but might not be expected document format
        corruptedData.set('users:null-value', 'null')

        const mockCtx = createMockCtxWithCorruptedData(corruptedData)
        const doInstance = new DO(mockCtx as any, mockEnv)

        // Depending on implementation, this could return null or the parsed null
        const result = await doInstance.get('users', 'null-value')
        expect(result).toBeNull()
      })

      it('should still work correctly for valid JSON after handling corrupted data', async () => {
        const corruptedData = new Map<string, string>()
        // No corrupted data for this key
        const mockCtx = createMockCtxWithCorruptedData(corruptedData)
        const doInstance = new DO(mockCtx as any, mockEnv)

        // Create a valid document
        const created = await doInstance.create('users', { name: 'Valid User' })

        // Should retrieve it correctly
        const retrieved = await doInstance.get('users', created.id)
        expect(retrieved).toBeDefined()
        expect(retrieved?.name).toBe('Valid User')
      })
    })
  })
})
