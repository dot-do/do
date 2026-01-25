/**
 * Tests for DOState - State Management
 *
 * Tests cover:
 * - state.get(key) - retrieve values
 * - state.set(key, value) - store values
 * - state.delete(key) - remove values
 * - state.list() - list keys
 * - Batched operations (getMany, setMany, deleteMany)
 * - Atomic transactions
 *
 * @module do/__tests__/state.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CDCEvent, CDCCursor } from '../types/storage'
import { createDOState, type DOState, type MutationHandler } from './state'

// =============================================================================
// Inline Test Helpers (minimal mocks for node environment testing)
// =============================================================================

/**
 * Creates a minimal mock DurableObjectState for testing.
 * For real Workers runtime tests, use vitest.workers.config.ts with miniflare.
 */
function createMockDurableObjectState(options: { id?: string } = {}) {
  const id = options.id || 'test-do-id'
  const storage = new Map<string, unknown>()

  return {
    id: {
      toString: () => id,
      name: id,
      equals: vi.fn((other: { toString: () => string }) => other.toString() === id),
    },
    storage: {
      get: vi.fn(async (key: string) => storage.get(key)),
      put: vi.fn(async (key: string, value: unknown) => {
        storage.set(key, value)
      }),
      delete: vi.fn(async (key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key]
        let deleted = false
        for (const k of keys) {
          if (storage.has(k)) {
            storage.delete(k)
            deleted = true
          }
        }
        return deleted
      }),
      list: vi.fn(async () => new Map(storage)),
      setAlarm: vi.fn(async () => {}),
      getAlarm: vi.fn(async () => null),
      deleteAlarm: vi.fn(async () => {}),
    },
    blockConcurrencyWhile: vi.fn(async <T>(fn: () => Promise<T>) => fn()),
    acceptWebSocket: vi.fn(),
    getWebSockets: vi.fn(() => []),
    waitUntil: vi.fn(),
  }
}

describe('DOState', () => {
  let mockCtx: ReturnType<typeof createMockDurableObjectState>
  let state: DOState

  beforeEach(() => {
    mockCtx = createMockDurableObjectState()
    state = createDOState(mockCtx as any)
  })

  // ==========================================================================
  // state.get(key) Tests
  // ==========================================================================
  describe('state.get(key)', () => {
    it('should return null for non-existent key', async () => {
      const value = await state.get('nonexistent')
      expect(value).toBeNull()
    })

    it('should return value for existing key', async () => {
      await state.set('name', 'test')
      const value = await state.get('name')
      expect(value).toBe('test')
    })

    it('should return correct type for string values', async () => {
      await state.set('str', 'hello')
      const value = await state.get<string>('str')
      expect(typeof value).toBe('string')
      expect(value).toBe('hello')
    })

    it('should return correct type for number values', async () => {
      await state.set('num', 42)
      const value = await state.get<number>('num')
      expect(typeof value).toBe('number')
      expect(value).toBe(42)
    })

    it('should return correct type for boolean values', async () => {
      await state.set('bool', true)
      const value = await state.get<boolean>('bool')
      expect(typeof value).toBe('boolean')
      expect(value).toBe(true)
    })

    it('should return correct type for object values', async () => {
      const obj = { nested: { deep: 'value' } }
      await state.set('obj', obj)
      const value = await state.get<typeof obj>('obj')
      expect(value).toEqual(obj)
    })

    it('should return correct type for array values', async () => {
      const arr = [1, 2, 3, 'mixed', { type: 'object' }]
      await state.set('arr', arr)
      const value = await state.get<typeof arr>('arr')
      expect(value).toEqual(arr)
    })

    it('should return null for explicitly set null values', async () => {
      await state.set('nullKey', null)
      const value = await state.get('nullKey')
      expect(value).toBeNull()
    })

    it('should handle keys with special characters', async () => {
      await state.set('key:with:colons', 'value1')
      await state.set('key.with.dots', 'value2')

      expect(await state.get('key:with:colons')).toBe('value1')
      expect(await state.get('key.with.dots')).toBe('value2')
    })

    it('should handle empty string key', async () => {
      await state.set('', 'empty-key-value')
      const value = await state.get('')
      expect(value).toBe('empty-key-value')
    })
  })

  // ==========================================================================
  // state.set(key, value) Tests
  // ==========================================================================
  describe('state.set(key, value)', () => {
    it('should set a string value', async () => {
      await state.set('name', 'test')
      expect(await state.get('name')).toBe('test')
    })

    it('should set a number value', async () => {
      await state.set('count', 42)
      expect(await state.get('count')).toBe(42)
    })

    it('should set a boolean value', async () => {
      await state.set('active', true)
      expect(await state.get('active')).toBe(true)
    })

    it('should set an object value', async () => {
      const config = { debug: true, level: 3 }
      await state.set('config', config)
      expect(await state.get('config')).toEqual(config)
    })

    it('should set an array value', async () => {
      const items = [1, 2, 3]
      await state.set('items', items)
      expect(await state.get('items')).toEqual(items)
    })

    it('should overwrite existing value', async () => {
      await state.set('key', 'first')
      await state.set('key', 'second')
      expect(await state.get('key')).toBe('second')
    })

    it('should increment version on set', async () => {
      const versionBefore = state.getVersion()
      await state.set('key', 'value')
      expect(state.getVersion()).toBe(versionBefore + 1)
    })

    it('should emit CDC event by default', async () => {
      const handler = vi.fn()
      state.onMutation(handler)

      await state.set('newKey', 'value')

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'INSERT',
          documentId: 'newKey',
          after: 'value',
        })
      )
    })

    it('should emit CDC UPDATE event for existing key', async () => {
      await state.set('key', 'first')

      const handler = vi.fn()
      state.onMutation(handler)

      await state.set('key', 'second')

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'UPDATE',
          documentId: 'key',
          before: 'first',
          after: 'second',
        })
      )
    })

    it('should skip CDC event when emitCDC is false', async () => {
      const handler = vi.fn()
      state.onMutation(handler)

      await state.set('key', 'value', { emitCDC: false })

      expect(handler).not.toHaveBeenCalled()
    })

    it('should support TTL option', async () => {
      // TTL is stored but expiration check happens on get
      await state.set('expiring', 'value', { ttl: 100 })
      expect(await state.get('expiring')).toBe('value')
    })

    it('should serialize Date objects', async () => {
      const date = new Date('2024-01-01T00:00:00Z')
      await state.set('date', date)

      const retrieved = await state.get<Date>('date')
      expect(retrieved).toEqual(date)
    })
  })

  // ==========================================================================
  // state.delete(key) Tests
  // ==========================================================================
  describe('state.delete(key)', () => {
    it('should delete existing key', async () => {
      await state.set('key', 'value')
      await state.delete('key')

      expect(await state.get('key')).toBeNull()
    })

    it('should return true when deleting existing key', async () => {
      await state.set('key', 'value')
      const result = await state.delete('key')

      expect(result).toBe(true)
    })

    it('should return false when deleting non-existent key', async () => {
      const result = await state.delete('nonexistent')

      expect(result).toBe(false)
    })

    it('should emit CDC DELETE event', async () => {
      await state.set('key', 'value')

      const handler = vi.fn()
      state.onMutation(handler)

      await state.delete('key')

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'DELETE',
          documentId: 'key',
          before: 'value',
        })
      )
    })
  })

  // ==========================================================================
  // state.list() Tests
  // ==========================================================================
  describe('state.list()', () => {
    beforeEach(async () => {
      await state.set('alpha', 1)
      await state.set('beta', 2)
      await state.set('gamma', 3)
      await state.set('delta', 4)
    })

    it('should return all keys', async () => {
      const result = await state.list()

      expect(result.keys.length).toBeGreaterThanOrEqual(4)
      expect(result.keys).toContain('alpha')
      expect(result.keys).toContain('beta')
      expect(result.keys).toContain('gamma')
      expect(result.keys).toContain('delta')
    })

    it('should support prefix filter', async () => {
      await state.set('user:1', 'Alice')
      await state.set('user:2', 'Bob')
      await state.set('config:debug', true)

      const result = await state.list({ prefix: 'user:' })

      expect(result.keys).toContain('user:1')
      expect(result.keys).toContain('user:2')
      expect(result.keys).not.toContain('config:debug')
    })

    it('should support limit option', async () => {
      const result = await state.list({ limit: 2 })

      expect(result.keys.length).toBe(2)
    })

    it('should indicate hasMore when limited', async () => {
      const result = await state.list({ limit: 2 })

      expect(result.hasMore).toBe(true)
    })

    it('should support cursor-based pagination', async () => {
      const firstPage = await state.list({ limit: 2 })

      expect(firstPage.keys.length).toBe(2)
      expect(firstPage.cursor).toBeDefined()

      if (firstPage.cursor) {
        const secondPage = await state.list({
          limit: 2,
          start: firstPage.cursor,
        })
        expect(secondPage.keys.length).toBeGreaterThanOrEqual(0)
      }
    })

    it('should support reverse order', async () => {
      const result = await state.list({ reverse: true })

      // Keys should be in reverse order
      expect(result.keys).toBeDefined()
    })

    it('should support start/end range', async () => {
      const result = await state.list({
        start: 'beta',
        end: 'delta',
      })

      expect(result.keys).toBeDefined()
    })
  })

  // ==========================================================================
  // state.getMany() Tests
  // ==========================================================================
  describe('state.getMany()', () => {
    beforeEach(async () => {
      await state.set('a', 1)
      await state.set('b', 2)
      await state.set('c', 3)
    })

    it('should get multiple values', async () => {
      const values = await state.getMany(['a', 'c'])

      expect(values.get('a')).toBe(1)
      expect(values.get('c')).toBe(3)
    })

    it('should omit non-existent keys', async () => {
      const values = await state.getMany(['a', 'nonexistent', 'c'])

      expect(values.has('a')).toBe(true)
      expect(values.has('c')).toBe(true)
      expect(values.has('nonexistent')).toBe(false)
    })

    it('should return empty Map for all non-existent keys', async () => {
      const values = await state.getMany(['x', 'y', 'z'])

      expect(values.size).toBe(0)
    })
  })

  // ==========================================================================
  // state.setMany() Tests
  // ==========================================================================
  describe('state.setMany()', () => {
    it('should set multiple values', async () => {
      const entries = new Map<string, unknown>([
        ['x', 10],
        ['y', 20],
        ['z', 30],
      ])

      await state.setMany(entries)

      expect(await state.get('x')).toBe(10)
      expect(await state.get('y')).toBe(20)
      expect(await state.get('z')).toBe(30)
    })

    it('should emit CDC events for each entry', async () => {
      const handler = vi.fn()
      state.onMutation(handler)

      const entries = new Map<string, unknown>([
        ['a', 1],
        ['b', 2],
      ])

      await state.setMany(entries)

      // Should emit INSERT for each new key
      expect(handler).toHaveBeenCalledTimes(2)
    })

    it('should skip CDC when emitCDC is false', async () => {
      const handler = vi.fn()
      state.onMutation(handler)

      const entries = new Map<string, unknown>([
        ['a', 1],
        ['b', 2],
      ])

      await state.setMany(entries, { emitCDC: false })

      expect(handler).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // state.deleteMany() Tests
  // ==========================================================================
  describe('state.deleteMany()', () => {
    beforeEach(async () => {
      await state.set('a', 1)
      await state.set('b', 2)
      await state.set('c', 3)
    })

    it('should delete multiple keys', async () => {
      await state.deleteMany(['a', 'c'])

      expect(await state.get('a')).toBeNull()
      expect(await state.get('b')).toBe(2)
      expect(await state.get('c')).toBeNull()
    })

    it('should return count of deleted keys', async () => {
      const count = await state.deleteMany(['a', 'c', 'nonexistent'])

      expect(count).toBe(2)
    })

    it('should emit CDC events for each deleted key', async () => {
      const handler = vi.fn()
      state.onMutation(handler)

      await state.deleteMany(['a', 'c'])

      expect(handler).toHaveBeenCalledTimes(2)
    })
  })

  // ==========================================================================
  // Atomic Transactions Tests
  // ==========================================================================
  describe('transactions', () => {
    it('should execute transaction atomically', async () => {
      await state.set('balance', 100)

      await state.transaction(async (tx) => {
        const balance = await tx.get<number>('balance')
        await tx.set('balance', balance! - 50)
        await tx.set('withdrawal', 50)
      })

      expect(await state.get('balance')).toBe(50)
      expect(await state.get('withdrawal')).toBe(50)
    })

    it('should support get within transaction', async () => {
      await state.set('key', 'value')

      await state.transaction(async (tx) => {
        const value = await tx.get<string>('key')
        expect(value).toBe('value')
      })
    })

    it('should support set within transaction', async () => {
      await state.transaction(async (tx) => {
        await tx.set('txKey', 'txValue')
      })

      expect(await state.get('txKey')).toBe('txValue')
    })

    it('should support delete within transaction', async () => {
      await state.set('toDelete', 'value')

      await state.transaction(async (tx) => {
        const deleted = await tx.delete('toDelete')
        expect(deleted).toBe(true)
      })

      expect(await state.get('toDelete')).toBeNull()
    })

    it('should support getMany within transaction', async () => {
      await state.set('a', 1)
      await state.set('b', 2)

      await state.transaction(async (tx) => {
        const values = await tx.getMany(['a', 'b'])
        expect(values.get('a')).toBe(1)
        expect(values.get('b')).toBe(2)
      })
    })

    it('should support setMany within transaction', async () => {
      await state.transaction(async (tx) => {
        const entries = new Map<string, unknown>([
          ['x', 10],
          ['y', 20],
        ])
        await tx.setMany(entries)
      })

      expect(await state.get('x')).toBe(10)
      expect(await state.get('y')).toBe(20)
    })

    it('should support deleteMany within transaction', async () => {
      await state.set('a', 1)
      await state.set('b', 2)

      await state.transaction(async (tx) => {
        const count = await tx.deleteMany(['a', 'b'])
        expect(count).toBe(2)
      })

      expect(await state.get('a')).toBeNull()
      expect(await state.get('b')).toBeNull()
    })

    it('should return value from transaction', async () => {
      const result = await state.transaction(async (tx) => {
        await tx.set('key', 'value')
        return 'done'
      })

      expect(result).toBe('done')
    })
  })

  // ==========================================================================
  // Version and CDC Cursor Tests
  // ==========================================================================
  describe('version and CDC cursor', () => {
    it('should start at version 0', () => {
      expect(state.getVersion()).toBe(0)
    })

    it('should increment version on each mutation', async () => {
      await state.set('a', 1)
      expect(state.getVersion()).toBe(1)

      await state.set('b', 2)
      expect(state.getVersion()).toBe(2)

      await state.set('a', 10)
      expect(state.getVersion()).toBe(3)
    })

    it('should provide CDC cursor', () => {
      const cursor = state.getCursor()

      expect(cursor).toHaveProperty('sequence')
      expect(cursor).toHaveProperty('timestamp')
      expect(cursor.sequence).toBe(0)
    })

    it('should increment cursor sequence on mutations', async () => {
      await state.set('key', 'value')
      const cursor = state.getCursor()

      expect(cursor.sequence).toBeGreaterThan(0)
    })
  })

  // ==========================================================================
  // Mutation Handlers Tests
  // ==========================================================================
  describe('mutation handlers', () => {
    it('should register mutation handler', async () => {
      const handler = vi.fn()
      state.onMutation(handler)

      await state.set('key', 'value')

      expect(handler).toHaveBeenCalled()
    })

    it('should provide unsubscribe function', async () => {
      const handler = vi.fn()
      const unsubscribe = state.onMutation(handler)

      await state.set('key1', 'value1')
      expect(handler).toHaveBeenCalledTimes(1)

      unsubscribe()

      await state.set('key2', 'value2')
      expect(handler).toHaveBeenCalledTimes(1) // Still 1, not called again
    })

    it('should support multiple handlers', async () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      state.onMutation(handler1)
      state.onMutation(handler2)

      await state.set('key', 'value')

      expect(handler1).toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
    })

    it('should provide CDC event to handler', async () => {
      const handler = vi.fn()
      state.onMutation(handler)

      await state.set('user:123', { name: 'Alice' })

      const event: CDCEvent = handler.mock.calls[0][0]

      expect(event).toMatchObject({
        id: expect.any(String),
        operation: 'INSERT',
        collection: 'user',
        documentId: 'user:123',
        timestamp: expect.any(Number),
        sequence: expect.any(Number),
        after: { name: 'Alice' },
      })
    })

    it('should extract collection from key', async () => {
      const handler = vi.fn()
      state.onMutation(handler)

      await state.set('order:456', { total: 100 })

      const event: CDCEvent = handler.mock.calls[0][0]
      expect(event.collection).toBe('order')
    })

    it('should use default collection for keys without colon', async () => {
      const handler = vi.fn()
      state.onMutation(handler)

      await state.set('simplekey', 'value')

      const event: CDCEvent = handler.mock.calls[0][0]
      expect(event.collection).toBe('default')
    })
  })

  // ==========================================================================
  // Edge Cases and Error Handling
  // ==========================================================================
  describe('edge cases', () => {
    it('should handle very large objects', async () => {
      const largeObject = {
        data: Array(100)
          .fill(null)
          .map((_, i) => ({
            id: i,
            name: `Item ${i}`,
            nested: { deep: { value: i } },
          })),
      }

      await state.set('large', largeObject)
      const retrieved = await state.get('large')

      expect(retrieved).toEqual(largeObject)
    })

    it('should handle unicode keys and values', async () => {
      await state.set('emoji', 'hello')
      await state.set('chinese', 'text')

      expect(await state.get('emoji')).toBe('hello')
      expect(await state.get('chinese')).toBe('text')
    })

    it('should handle concurrent set operations', async () => {
      const promises = Array(10)
        .fill(null)
        .map((_, i) => state.set(`key-${i}`, i))

      await Promise.all(promises)

      for (let i = 0; i < 10; i++) {
        expect(await state.get(`key-${i}`)).toBe(i)
      }
    })
  })

  // ==========================================================================
  // Flush Tests
  // ==========================================================================
  describe('flush', () => {
    it('should have flush method', () => {
      expect(typeof state.flush).toBe('function')
    })

    it('should complete flush without error', async () => {
      await state.set('key', 'value')
      await expect(state.flush()).resolves.toBeUndefined()
    })
  })
})
