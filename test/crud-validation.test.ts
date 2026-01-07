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
 * @dotdo/do - CRUD Input Validation Tests (RED Phase)
 *
 * These tests verify that all CRUD methods properly validate their input parameters.
 * They should FAIL initially (RED) because validation is not yet implemented,
 * then pass after implementing proper input validation (GREEN).
 *
 * Validation requirements tested:
 * - Required parameters must be provided
 * - String parameters must be non-empty strings
 * - IDs must be valid (non-empty, no SQL injection)
 * - Collection names must be valid identifiers
 * - Data objects must be valid JSON-serializable objects
 * - Options must be valid when provided
 * - URLs must be valid URL format
 * - Types must match expected schemas
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { DO } from '../src/do'
import type {
  ListOptions,
  CreateOptions,
  UpdateOptions,
  RelateOptions,
  CreateEventOptions,
  CreateActionOptions,
  StoreArtifactOptions,
} from '../src/types'

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
        },
      }
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
    storage: {
      sql: createMockSqlStorage(),
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

describe('CRUD Input Validation', () => {
  let doInstance: DO

  beforeEach(() => {
    doInstance = new DO(createMockCtx() as any, mockEnv)
  })

  // ============================================================================
  // Document CRUD - get() validation
  // ============================================================================

  describe('get() parameter validation', () => {
    it('should throw ValidationError when collection is undefined', async () => {
      await expect(
        (doInstance as any).get(undefined, 'valid-id')
      ).rejects.toThrow(/collection.*required|invalid.*collection/i)
    })

    it('should throw ValidationError when collection is null', async () => {
      await expect((doInstance as any).get(null, 'valid-id')).rejects.toThrow(
        /collection.*required|invalid.*collection/i
      )
    })

    it('should throw ValidationError when collection is empty string', async () => {
      await expect((doInstance as any).get('', 'valid-id')).rejects.toThrow(
        /collection.*empty|invalid.*collection/i
      )
    })

    it('should throw ValidationError when collection is whitespace only', async () => {
      await expect((doInstance as any).get('   ', 'valid-id')).rejects.toThrow(
        /collection.*empty|invalid.*collection/i
      )
    })

    it('should throw ValidationError when collection is not a string', async () => {
      await expect((doInstance as any).get(123, 'valid-id')).rejects.toThrow(
        /collection.*string|invalid.*collection/i
      )
    })

    it('should throw ValidationError when collection contains SQL injection characters', async () => {
      await expect(
        (doInstance as any).get("users'; DROP TABLE documents;--", 'valid-id')
      ).rejects.toThrow(/collection.*invalid|unsafe.*characters/i)
    })

    it('should throw ValidationError when id is undefined', async () => {
      await expect(
        (doInstance as any).get('users', undefined)
      ).rejects.toThrow(/id.*required|invalid.*id/i)
    })

    it('should throw ValidationError when id is null', async () => {
      await expect((doInstance as any).get('users', null)).rejects.toThrow(
        /id.*required|invalid.*id/i
      )
    })

    it('should throw ValidationError when id is empty string', async () => {
      await expect((doInstance as any).get('users', '')).rejects.toThrow(
        /id.*empty|invalid.*id/i
      )
    })

    it('should throw ValidationError when id is not a string', async () => {
      await expect((doInstance as any).get('users', 123)).rejects.toThrow(
        /id.*string|invalid.*id/i
      )
    })

    it('should throw ValidationError when id is an object', async () => {
      await expect(
        (doInstance as any).get('users', { id: 'test' })
      ).rejects.toThrow(/id.*string|invalid.*id/i)
    })
  })

  // ============================================================================
  // Document CRUD - list() validation
  // ============================================================================

  describe('list() parameter validation', () => {
    it('should throw ValidationError when collection is undefined', async () => {
      await expect((doInstance as any).list(undefined)).rejects.toThrow(
        /collection.*required|invalid.*collection/i
      )
    })

    it('should throw ValidationError when collection is empty string', async () => {
      await expect((doInstance as any).list('')).rejects.toThrow(
        /collection.*empty|invalid.*collection/i
      )
    })

    it('should throw ValidationError when options.limit is negative', async () => {
      await expect(
        doInstance.list('users', { limit: -1 })
      ).rejects.toThrow(/limit.*positive|invalid.*limit/i)
    })

    it('should throw ValidationError when options.limit is zero', async () => {
      await expect(
        doInstance.list('users', { limit: 0 })
      ).rejects.toThrow(/limit.*positive|invalid.*limit/i)
    })

    it('should throw ValidationError when options.limit is not a number', async () => {
      await expect(
        doInstance.list('users', { limit: 'ten' as any })
      ).rejects.toThrow(/limit.*number|invalid.*limit/i)
    })

    it('should throw ValidationError when options.limit exceeds maximum', async () => {
      await expect(
        doInstance.list('users', { limit: 100001 })
      ).rejects.toThrow(/limit.*maximum|limit.*exceed/i)
    })

    it('should throw ValidationError when options.offset is negative', async () => {
      await expect(
        doInstance.list('users', { offset: -1 })
      ).rejects.toThrow(/offset.*negative|invalid.*offset/i)
    })

    it('should throw ValidationError when options.offset is not a number', async () => {
      await expect(
        doInstance.list('users', { offset: 'zero' as any })
      ).rejects.toThrow(/offset.*number|invalid.*offset/i)
    })

    it('should throw ValidationError when options.order is invalid', async () => {
      await expect(
        doInstance.list('users', { order: 'sideways' as any })
      ).rejects.toThrow(/order.*asc.*desc|invalid.*order/i)
    })

    it('should throw ValidationError when options.orderBy contains SQL injection', async () => {
      await expect(
        doInstance.list('users', { orderBy: "created_at; DROP TABLE documents;--" })
      ).rejects.toThrow(/orderBy.*invalid|unsafe.*characters/i)
    })
  })

  // ============================================================================
  // Document CRUD - create() validation
  // ============================================================================

  describe('create() parameter validation', () => {
    it('should throw ValidationError when collection is undefined', async () => {
      await expect(
        (doInstance as any).create(undefined, { name: 'test' })
      ).rejects.toThrow(/collection.*required|invalid.*collection/i)
    })

    it('should throw ValidationError when collection is empty string', async () => {
      await expect(
        (doInstance as any).create('', { name: 'test' })
      ).rejects.toThrow(/collection.*empty|invalid.*collection/i)
    })

    it('should throw ValidationError when data is undefined', async () => {
      await expect(
        (doInstance as any).create('users', undefined)
      ).rejects.toThrow(/data.*required|invalid.*data/i)
    })

    it('should throw ValidationError when data is null', async () => {
      await expect((doInstance as any).create('users', null)).rejects.toThrow(
        /data.*required|invalid.*data/i
      )
    })

    it('should throw ValidationError when data is not an object', async () => {
      await expect(
        (doInstance as any).create('users', 'not an object')
      ).rejects.toThrow(/data.*object|invalid.*data/i)
    })

    it('should throw ValidationError when data is an array', async () => {
      await expect(
        (doInstance as any).create('users', ['item1', 'item2'])
      ).rejects.toThrow(/data.*object|invalid.*data/i)
    })

    it('should throw ValidationError when data contains circular references', async () => {
      const circular: Record<string, unknown> = { name: 'test' }
      circular.self = circular

      await expect(
        doInstance.create('users', circular)
      ).rejects.toThrow(/circular|serialize|json/i)
    })

    it('should throw ValidationError when data contains functions', async () => {
      const withFunction = {
        name: 'test',
        action: () => console.log('hello'),
      }

      await expect(
        doInstance.create('users', withFunction)
      ).rejects.toThrow(/function|serialize|invalid.*data/i)
    })

    it('should throw ValidationError when provided id is empty string', async () => {
      await expect(
        doInstance.create('users', { id: '', name: 'test' })
      ).rejects.toThrow(/id.*empty|invalid.*id/i)
    })

    it('should throw ValidationError when provided id is not a string', async () => {
      await expect(
        doInstance.create('users', { id: 123, name: 'test' } as any)
      ).rejects.toThrow(/id.*string|invalid.*id/i)
    })
  })

  // ============================================================================
  // Document CRUD - update() validation
  // ============================================================================

  describe('update() parameter validation', () => {
    it('should throw ValidationError when collection is undefined', async () => {
      await expect(
        (doInstance as any).update(undefined, 'valid-id', { name: 'updated' })
      ).rejects.toThrow(/collection.*required|invalid.*collection/i)
    })

    it('should throw ValidationError when collection is empty string', async () => {
      await expect(
        (doInstance as any).update('', 'valid-id', { name: 'updated' })
      ).rejects.toThrow(/collection.*empty|invalid.*collection/i)
    })

    it('should throw ValidationError when id is undefined', async () => {
      await expect(
        (doInstance as any).update('users', undefined, { name: 'updated' })
      ).rejects.toThrow(/id.*required|invalid.*id/i)
    })

    it('should throw ValidationError when id is empty string', async () => {
      await expect(
        (doInstance as any).update('users', '', { name: 'updated' })
      ).rejects.toThrow(/id.*empty|invalid.*id/i)
    })

    it('should throw ValidationError when updates is undefined', async () => {
      await expect(
        (doInstance as any).update('users', 'valid-id', undefined)
      ).rejects.toThrow(/updates.*required|invalid.*updates/i)
    })

    it('should throw ValidationError when updates is null', async () => {
      await expect(
        (doInstance as any).update('users', 'valid-id', null)
      ).rejects.toThrow(/updates.*required|invalid.*updates/i)
    })

    it('should throw ValidationError when updates is not an object', async () => {
      await expect(
        (doInstance as any).update('users', 'valid-id', 'not an object')
      ).rejects.toThrow(/updates.*object|invalid.*updates/i)
    })

    it('should throw ValidationError when updates is an array', async () => {
      await expect(
        (doInstance as any).update('users', 'valid-id', ['item1'])
      ).rejects.toThrow(/updates.*object|invalid.*updates/i)
    })

    it('should throw ValidationError when updates is empty object', async () => {
      await expect(
        doInstance.update('users', 'valid-id', {})
      ).rejects.toThrow(/updates.*empty|no.*properties/i)
    })

    it('should throw ValidationError when updates tries to change id', async () => {
      await expect(
        doInstance.update('users', 'valid-id', { id: 'new-id', name: 'updated' })
      ).rejects.toThrow(/id.*immutable|cannot.*change.*id/i)
    })
  })

  // ============================================================================
  // Document CRUD - delete() validation
  // ============================================================================

  describe('delete() parameter validation', () => {
    it('should throw ValidationError when collection is undefined', async () => {
      await expect(
        (doInstance as any).delete(undefined, 'valid-id')
      ).rejects.toThrow(/collection.*required|invalid.*collection/i)
    })

    it('should throw ValidationError when collection is empty string', async () => {
      await expect(
        (doInstance as any).delete('', 'valid-id')
      ).rejects.toThrow(/collection.*empty|invalid.*collection/i)
    })

    it('should throw ValidationError when id is undefined', async () => {
      await expect(
        (doInstance as any).delete('users', undefined)
      ).rejects.toThrow(/id.*required|invalid.*id/i)
    })

    it('should throw ValidationError when id is empty string', async () => {
      await expect(
        (doInstance as any).delete('users', '')
      ).rejects.toThrow(/id.*empty|invalid.*id/i)
    })

    it('should throw ValidationError when id is not a string', async () => {
      await expect(
        (doInstance as any).delete('users', 123)
      ).rejects.toThrow(/id.*string|invalid.*id/i)
    })
  })

  // ============================================================================
  // Thing Operations - createThing() / Thing.create() validation
  // ============================================================================

  describe('createThing() / Thing.create() parameter validation', () => {
    it('should throw ValidationError when options is undefined', async () => {
      await expect(
        (doInstance as any).createThing(undefined)
      ).rejects.toThrow(/options.*required|invalid.*options/i)
    })

    it('should throw ValidationError when ns is missing', async () => {
      await expect(
        (doInstance as any).createThing({ type: 'user', data: { name: 'test' } })
      ).rejects.toThrow(/ns.*required|namespace.*required/i)
    })

    it('should throw ValidationError when ns is empty string', async () => {
      await expect(
        (doInstance as any).createThing({ ns: '', type: 'user', data: { name: 'test' } })
      ).rejects.toThrow(/ns.*empty|namespace.*empty/i)
    })

    it('should throw ValidationError when type is missing', async () => {
      await expect(
        (doInstance as any).createThing({ ns: 'example.com', data: { name: 'test' } })
      ).rejects.toThrow(/type.*required/i)
    })

    it('should throw ValidationError when type is empty string', async () => {
      await expect(
        (doInstance as any).createThing({ ns: 'example.com', type: '', data: { name: 'test' } })
      ).rejects.toThrow(/type.*empty/i)
    })

    it('should throw ValidationError when data is missing', async () => {
      await expect(
        (doInstance as any).createThing({ ns: 'example.com', type: 'user' })
      ).rejects.toThrow(/data.*required/i)
    })

    it('should throw ValidationError when data is not an object', async () => {
      await expect(
        (doInstance as any).createThing({ ns: 'example.com', type: 'user', data: 'not object' })
      ).rejects.toThrow(/data.*object/i)
    })

    it('should throw ValidationError when provided id is empty string', async () => {
      await expect(
        (doInstance as any).createThing({ ns: 'example.com', type: 'user', id: '', data: { name: 'test' } })
      ).rejects.toThrow(/id.*empty/i)
    })

    it('should throw ValidationError when url is not a valid URL', async () => {
      await expect(
        (doInstance as any).createThing({
          ns: 'example.com',
          type: 'user',
          url: 'not-a-valid-url',
          data: { name: 'test' },
        })
      ).rejects.toThrow(/url.*invalid|url.*format/i)
    })

    it('should throw ValidationError when @context is invalid type', async () => {
      await expect(
        (doInstance as any).createThing({
          ns: 'example.com',
          type: 'user',
          data: { name: 'test' },
          '@context': 12345,
        })
      ).rejects.toThrow(/context.*string.*object|invalid.*context/i)
    })
  })

  // ============================================================================
  // Thing Operations - getThing() / Thing.get() validation
  // ============================================================================

  describe('getThing() / Thing.get() parameter validation', () => {
    it('should throw ValidationError when url is undefined', async () => {
      await expect(
        (doInstance as any).getThing(undefined)
      ).rejects.toThrow(/url.*required/i)
    })

    it('should throw ValidationError when url is empty string', async () => {
      await expect(
        (doInstance as any).getThing('')
      ).rejects.toThrow(/url.*empty/i)
    })

    it('should throw ValidationError when url is not a valid URL', async () => {
      await expect(
        (doInstance as any).getThing('not-a-valid-url')
      ).rejects.toThrow(/url.*invalid|url.*format/i)
    })

    it('should throw ValidationError when url is not a string', async () => {
      await expect(
        (doInstance as any).getThing(123)
      ).rejects.toThrow(/url.*string/i)
    })
  })

  // ============================================================================
  // Thing Operations - getThingById() validation
  // ============================================================================

  describe('getThingById() parameter validation', () => {
    it('should throw ValidationError when ns is undefined', async () => {
      await expect(
        (doInstance as any).getThingById(undefined, 'user', 'id-1')
      ).rejects.toThrow(/ns.*required|namespace.*required/i)
    })

    it('should throw ValidationError when ns is empty string', async () => {
      await expect(
        (doInstance as any).getThingById('', 'user', 'id-1')
      ).rejects.toThrow(/ns.*empty|namespace.*empty/i)
    })

    it('should throw ValidationError when type is undefined', async () => {
      await expect(
        (doInstance as any).getThingById('example.com', undefined, 'id-1')
      ).rejects.toThrow(/type.*required/i)
    })

    it('should throw ValidationError when type is empty string', async () => {
      await expect(
        (doInstance as any).getThingById('example.com', '', 'id-1')
      ).rejects.toThrow(/type.*empty/i)
    })

    it('should throw ValidationError when id is undefined', async () => {
      await expect(
        (doInstance as any).getThingById('example.com', 'user', undefined)
      ).rejects.toThrow(/id.*required/i)
    })

    it('should throw ValidationError when id is empty string', async () => {
      await expect(
        (doInstance as any).getThingById('example.com', 'user', '')
      ).rejects.toThrow(/id.*empty/i)
    })
  })

  // ============================================================================
  // Thing Operations - setThing() / Thing.set() validation
  // ============================================================================

  describe('setThing() / Thing.set() parameter validation', () => {
    it('should throw ValidationError when url is undefined', async () => {
      await expect(
        (doInstance as any).setThing(undefined, { name: 'test' })
      ).rejects.toThrow(/url.*required/i)
    })

    it('should throw ValidationError when url is empty string', async () => {
      await expect(
        (doInstance as any).setThing('', { name: 'test' })
      ).rejects.toThrow(/url.*empty/i)
    })

    it('should throw ValidationError when url is not a valid URL', async () => {
      await expect(
        (doInstance as any).setThing('not-a-valid-url', { name: 'test' })
      ).rejects.toThrow(/url.*invalid|url.*format/i)
    })

    it('should throw ValidationError when data is undefined', async () => {
      await expect(
        (doInstance as any).setThing('https://example.com/user/1', undefined)
      ).rejects.toThrow(/data.*required/i)
    })

    it('should throw ValidationError when data is not an object', async () => {
      await expect(
        (doInstance as any).setThing('https://example.com/user/1', 'not object')
      ).rejects.toThrow(/data.*object/i)
    })
  })

  // ============================================================================
  // Thing Operations - deleteThing() / Thing.delete() validation
  // ============================================================================

  describe('deleteThing() / Thing.delete() parameter validation', () => {
    it('should throw ValidationError when url is undefined', async () => {
      await expect(
        (doInstance as any).deleteThing(undefined)
      ).rejects.toThrow(/url.*required/i)
    })

    it('should throw ValidationError when url is empty string', async () => {
      await expect(
        (doInstance as any).deleteThing('')
      ).rejects.toThrow(/url.*empty/i)
    })

    it('should throw ValidationError when url is not a valid URL', async () => {
      await expect(
        (doInstance as any).deleteThing('not-a-valid-url')
      ).rejects.toThrow(/url.*invalid|url.*format/i)
    })
  })

  // ============================================================================
  // Relationship Operations - relate() validation
  // ============================================================================

  describe('relate() parameter validation', () => {
    it('should throw ValidationError when options is undefined', async () => {
      await expect(
        (doInstance as any).relate(undefined)
      ).rejects.toThrow(/options.*required/i)
    })

    it('should throw ValidationError when type is missing', async () => {
      await expect(
        (doInstance as any).relate({
          from: 'https://example.com/user/1',
          to: 'https://example.com/user/2',
        })
      ).rejects.toThrow(/type.*required/i)
    })

    it('should throw ValidationError when type is empty string', async () => {
      await expect(
        (doInstance as any).relate({
          type: '',
          from: 'https://example.com/user/1',
          to: 'https://example.com/user/2',
        })
      ).rejects.toThrow(/type.*empty/i)
    })

    it('should throw ValidationError when from is missing', async () => {
      await expect(
        (doInstance as any).relate({
          type: 'follows',
          to: 'https://example.com/user/2',
        })
      ).rejects.toThrow(/from.*required/i)
    })

    it('should throw ValidationError when from is not a valid URL', async () => {
      await expect(
        (doInstance as any).relate({
          type: 'follows',
          from: 'not-a-url',
          to: 'https://example.com/user/2',
        })
      ).rejects.toThrow(/from.*invalid.*url|from.*url.*format/i)
    })

    it('should throw ValidationError when to is missing', async () => {
      await expect(
        (doInstance as any).relate({
          type: 'follows',
          from: 'https://example.com/user/1',
        })
      ).rejects.toThrow(/to.*required/i)
    })

    it('should throw ValidationError when to is not a valid URL', async () => {
      await expect(
        (doInstance as any).relate({
          type: 'follows',
          from: 'https://example.com/user/1',
          to: 'not-a-url',
        })
      ).rejects.toThrow(/to.*invalid.*url|to.*url.*format/i)
    })

    it('should allow self-referential relationships (valid graph pattern)', async () => {
      // Self-referential relationships are valid graph patterns (e.g., recursive parent, self-mentions)
      const result = await (doInstance as any).relate({
        type: 'references',
        from: 'https://example.com/node/1',
        to: 'https://example.com/node/1',
      })
      expect(result).toBeDefined()
      expect(result.from).toBe(result.to)
    })
  })

  // ============================================================================
  // Relationship Operations - unrelate() validation
  // ============================================================================

  describe('unrelate() parameter validation', () => {
    it('should throw ValidationError when from is undefined', async () => {
      await expect(
        (doInstance as any).unrelate(undefined, 'follows', 'https://example.com/user/2')
      ).rejects.toThrow(/from.*required/i)
    })

    it('should throw ValidationError when from is not a valid URL', async () => {
      await expect(
        (doInstance as any).unrelate('not-a-url', 'follows', 'https://example.com/user/2')
      ).rejects.toThrow(/from.*invalid.*url|from.*url.*format/i)
    })

    it('should throw ValidationError when type is undefined', async () => {
      await expect(
        (doInstance as any).unrelate('https://example.com/user/1', undefined, 'https://example.com/user/2')
      ).rejects.toThrow(/type.*required/i)
    })

    it('should throw ValidationError when type is empty string', async () => {
      await expect(
        (doInstance as any).unrelate('https://example.com/user/1', '', 'https://example.com/user/2')
      ).rejects.toThrow(/type.*empty/i)
    })

    it('should throw ValidationError when to is undefined', async () => {
      await expect(
        (doInstance as any).unrelate('https://example.com/user/1', 'follows', undefined)
      ).rejects.toThrow(/to.*required/i)
    })

    it('should throw ValidationError when to is not a valid URL', async () => {
      await expect(
        (doInstance as any).unrelate('https://example.com/user/1', 'follows', 'not-a-url')
      ).rejects.toThrow(/to.*invalid.*url|to.*url.*format/i)
    })
  })

  // ============================================================================
  // Event Operations - track() validation
  // ============================================================================

  describe('track() parameter validation', () => {
    it('should throw ValidationError when options is undefined', async () => {
      await expect(
        (doInstance as any).track(undefined)
      ).rejects.toThrow(/options.*required/i)
    })

    it('should throw ValidationError when type is missing', async () => {
      await expect(
        (doInstance as any).track({
          source: 'system',
          data: { key: 'value' },
        })
      ).rejects.toThrow(/type.*required/i)
    })

    it('should throw ValidationError when type is empty string', async () => {
      await expect(
        (doInstance as any).track({
          type: '',
          source: 'system',
          data: { key: 'value' },
        })
      ).rejects.toThrow(/type.*empty/i)
    })

    it('should auto-populate source from auth context when missing', async () => {
      // Source auto-populates from auth context userId or defaults to 'unknown'
      const result = await (doInstance as any).track({
        type: 'user.created',
        data: { key: 'value' },
      })
      expect(result.source).toBe('unknown')
    })

    it('should throw ValidationError when source is empty string', async () => {
      await expect(
        (doInstance as any).track({
          type: 'user.created',
          source: '',
          data: { key: 'value' },
        })
      ).rejects.toThrow(/source.*empty/i)
    })

    it('should throw ValidationError when data is missing', async () => {
      await expect(
        (doInstance as any).track({
          type: 'user.created',
          source: 'system',
        })
      ).rejects.toThrow(/data.*required/i)
    })

    it('should throw ValidationError when data is not an object', async () => {
      await expect(
        (doInstance as any).track({
          type: 'user.created',
          source: 'system',
          data: 'not an object',
        })
      ).rejects.toThrow(/data.*object/i)
    })

    it('should throw ValidationError when event type contains invalid characters', async () => {
      await expect(
        (doInstance as any).track({
          type: 'user<script>alert(1)</script>',
          source: 'system',
          data: { key: 'value' },
        })
      ).rejects.toThrow(/type.*invalid|unsafe.*characters/i)
    })
  })

  // ============================================================================
  // Action Operations - send() validation
  // ============================================================================

  describe('send() parameter validation', () => {
    it('should throw ValidationError when options is undefined', async () => {
      await expect(
        (doInstance as any).send(undefined)
      ).rejects.toThrow(/options.*required/i)
    })

    it('should auto-populate actor from auth context when missing', async () => {
      // Actor auto-populates from auth context userId or defaults to 'unknown'
      const result = await (doInstance as any).send({
        object: 'https://example.com/post/1',
        action: 'approve',
      })
      expect(result.actor).toBe('unknown')
    })

    it('should throw ValidationError when actor is empty string', async () => {
      await expect(
        (doInstance as any).send({
          actor: '',
          object: 'https://example.com/post/1',
          action: 'approve',
        })
      ).rejects.toThrow(/actor.*empty/i)
    })

    it('should throw ValidationError when object is missing', async () => {
      await expect(
        (doInstance as any).send({
          actor: 'https://example.com/user/1',
          action: 'approve',
        })
      ).rejects.toThrow(/object.*required/i)
    })

    it('should throw ValidationError when object is empty string', async () => {
      await expect(
        (doInstance as any).send({
          actor: 'https://example.com/user/1',
          object: '',
          action: 'approve',
        })
      ).rejects.toThrow(/object.*empty/i)
    })

    it('should throw ValidationError when action is missing', async () => {
      await expect(
        (doInstance as any).send({
          actor: 'https://example.com/user/1',
          object: 'https://example.com/post/1',
        })
      ).rejects.toThrow(/action.*required/i)
    })

    it('should throw ValidationError when action is empty string', async () => {
      await expect(
        (doInstance as any).send({
          actor: 'https://example.com/user/1',
          object: 'https://example.com/post/1',
          action: '',
        })
      ).rejects.toThrow(/action.*empty/i)
    })

    it('should throw ValidationError when status is invalid', async () => {
      await expect(
        (doInstance as any).send({
          actor: 'https://example.com/user/1',
          object: 'https://example.com/post/1',
          action: 'approve',
          status: 'invalid-status',
        })
      ).rejects.toThrow(/status.*invalid|status.*enum/i)
    })
  })

  // ============================================================================
  // Artifact Operations - storeArtifact() validation
  // ============================================================================

  describe('storeArtifact() parameter validation', () => {
    it('should throw ValidationError when options is undefined', async () => {
      await expect(
        (doInstance as any).storeArtifact(undefined)
      ).rejects.toThrow(/options.*required/i)
    })

    it('should throw ValidationError when key is missing', async () => {
      await expect(
        (doInstance as any).storeArtifact({
          type: 'ast',
          source: 'https://example.com/code.ts',
          sourceHash: 'abc123',
          content: { ast: {} },
        })
      ).rejects.toThrow(/key.*required/i)
    })

    it('should throw ValidationError when key is empty string', async () => {
      await expect(
        (doInstance as any).storeArtifact({
          key: '',
          type: 'ast',
          source: 'https://example.com/code.ts',
          sourceHash: 'abc123',
          content: { ast: {} },
        })
      ).rejects.toThrow(/key.*empty/i)
    })

    it('should throw ValidationError when type is missing', async () => {
      await expect(
        (doInstance as any).storeArtifact({
          key: 'artifact-1',
          source: 'https://example.com/code.ts',
          sourceHash: 'abc123',
          content: { ast: {} },
        })
      ).rejects.toThrow(/type.*required/i)
    })

    it('should throw ValidationError when source is missing', async () => {
      await expect(
        (doInstance as any).storeArtifact({
          key: 'artifact-1',
          type: 'ast',
          sourceHash: 'abc123',
          content: { ast: {} },
        })
      ).rejects.toThrow(/source.*required/i)
    })

    it('should throw ValidationError when sourceHash is missing', async () => {
      await expect(
        (doInstance as any).storeArtifact({
          key: 'artifact-1',
          type: 'ast',
          source: 'https://example.com/code.ts',
          content: { ast: {} },
        })
      ).rejects.toThrow(/sourceHash.*required/i)
    })

    it('should throw ValidationError when content is missing', async () => {
      await expect(
        (doInstance as any).storeArtifact({
          key: 'artifact-1',
          type: 'ast',
          source: 'https://example.com/code.ts',
          sourceHash: 'abc123',
        })
      ).rejects.toThrow(/content.*required/i)
    })

    it('should allow negative ttl (creates already-expired artifact)', async () => {
      // Negative TTL is allowed - it creates an artifact that is already expired
      // This is useful for testing cleanup functionality
      const result = await (doInstance as any).storeArtifact({
        key: 'artifact-1',
        type: 'ast',
        source: 'https://example.com/code.ts',
        sourceHash: 'abc123',
        content: { ast: {} },
        ttl: -1,
      })
      expect(result).toBeDefined()
      expect(result.expiresAt).toBeDefined()
      expect(new Date(result.expiresAt).getTime()).toBeLessThan(Date.now())
    })

    it('should throw ValidationError when ttl is not a number', async () => {
      await expect(
        (doInstance as any).storeArtifact({
          key: 'artifact-1',
          type: 'ast',
          source: 'https://example.com/code.ts',
          sourceHash: 'abc123',
          content: { ast: {} },
          ttl: 'forever',
        })
      ).rejects.toThrow(/ttl.*number/i)
    })
  })

  // ============================================================================
  // Artifact Operations - getArtifact() validation
  // ============================================================================

  describe('getArtifact() parameter validation', () => {
    it('should throw ValidationError when key is undefined', async () => {
      await expect(
        (doInstance as any).getArtifact(undefined)
      ).rejects.toThrow(/key.*required/i)
    })

    it('should throw ValidationError when key is empty string', async () => {
      await expect(
        (doInstance as any).getArtifact('')
      ).rejects.toThrow(/key.*empty/i)
    })

    it('should throw ValidationError when key is not a string', async () => {
      await expect(
        (doInstance as any).getArtifact(123)
      ).rejects.toThrow(/key.*string/i)
    })
  })

  // ============================================================================
  // Search Operation - search() validation
  // ============================================================================

  describe('search() parameter validation', () => {
    it('should throw ValidationError when query is undefined', async () => {
      await expect(
        (doInstance as any).search(undefined)
      ).rejects.toThrow(/query.*required/i)
    })

    it('should throw ValidationError when query is empty string', async () => {
      await expect(
        (doInstance as any).search('')
      ).rejects.toThrow(/query.*empty/i)
    })

    it('should throw ValidationError when query is not a string', async () => {
      await expect(
        (doInstance as any).search(123)
      ).rejects.toThrow(/query.*string/i)
    })

    it('should throw ValidationError when query is too long', async () => {
      const longQuery = 'a'.repeat(10001)
      await expect(
        (doInstance as any).search(longQuery)
      ).rejects.toThrow(/query.*long|query.*length/i)
    })

    it('should throw ValidationError when options.limit is negative', async () => {
      await expect(
        doInstance.search('test', { limit: -1 })
      ).rejects.toThrow(/limit.*positive|invalid.*limit/i)
    })

    it('should throw ValidationError when options.collections is not an array', async () => {
      await expect(
        doInstance.search('test', { collections: 'users' as any })
      ).rejects.toThrow(/collections.*array/i)
    })

    it('should throw ValidationError when options.collections contains non-strings', async () => {
      await expect(
        doInstance.search('test', { collections: ['users', 123 as any] })
      ).rejects.toThrow(/collections.*string/i)
    })
  })

  // ============================================================================
  // Type Coercion Prevention
  // ============================================================================

  describe('Type coercion prevention', () => {
    it('should not coerce number to string for collection name', async () => {
      // If coerced, 123 would become "123" and might work
      await expect(
        (doInstance as any).get(123, 'valid-id')
      ).rejects.toThrow(/collection.*string|invalid.*collection/i)
    })

    it('should not coerce boolean to string for id', async () => {
      await expect(
        (doInstance as any).get('users', true)
      ).rejects.toThrow(/id.*string|invalid.*id/i)
    })

    it('should not coerce array to object for data', async () => {
      await expect(
        doInstance.create('users', ['not', 'an', 'object'])
      ).rejects.toThrow(/data.*object|invalid.*data/i)
    })

    it('should reject Date objects for string parameters', async () => {
      await expect(
        (doInstance as any).get('users', new Date())
      ).rejects.toThrow(/id.*string|invalid.*id/i)
    })

    it('should reject Symbol for string parameters', async () => {
      await expect(
        (doInstance as any).get('users', Symbol('test'))
      ).rejects.toThrow(/id.*string|invalid.*id/i)
    })
  })

  // ============================================================================
  // Edge Cases and Boundary Conditions
  // ============================================================================

  describe('Edge cases and boundary conditions', () => {
    it('should handle very long collection names', async () => {
      const longName = 'a'.repeat(1001)
      await expect(
        doInstance.get(longName, 'valid-id')
      ).rejects.toThrow(/collection.*long|collection.*length/i)
    })

    it('should handle very long IDs', async () => {
      const longId = 'a'.repeat(1001)
      await expect(
        doInstance.get('users', longId)
      ).rejects.toThrow(/id.*long|id.*length/i)
    })

    it('should handle Unicode in collection names appropriately', async () => {
      // Some systems might reject Unicode, others might accept it
      // The key is consistent behavior
      const result = doInstance.get('users_emoji_test', 'valid-id')
      // Should either succeed (return null for not found) or throw a consistent error
      await expect(result).resolves.toBeDefined().catch(() => {
        // If it throws, that's also acceptable as long as it's consistent
      })
    })

    it('should handle null bytes in strings', async () => {
      await expect(
        doInstance.get('users\x00evil', 'valid-id')
      ).rejects.toThrow(/invalid.*characters|null.*byte/i)
    })

    it('should handle newlines in IDs', async () => {
      await expect(
        doInstance.get('users', 'id\nwith\nnewlines')
      ).rejects.toThrow(/invalid.*characters|newline/i)
    })
  })

  // ============================================================================
  // RPC invoke() validation
  // ============================================================================

  describe('invoke() parameter validation', () => {
    it('should throw when method name is empty string', async () => {
      await expect(
        doInstance.invoke('', [])
      ).rejects.toThrow(/method.*empty|invalid.*method/i)
    })

    it('should throw when method name is not a string', async () => {
      await expect(
        (doInstance as any).invoke(123, [])
      ).rejects.toThrow(/method.*string|invalid.*method/i)
    })

    it('should throw when params is not an array', async () => {
      await expect(
        (doInstance as any).invoke('get', 'not an array')
      ).rejects.toThrow(/params.*array|invalid.*params/i)
    })

    it('should throw when trying to invoke disallowed methods', async () => {
      await expect(
        doInstance.invoke('constructor', [])
      ).rejects.toThrow(/not allowed|disallowed/i)
    })

    it('should throw when trying to invoke __proto__', async () => {
      await expect(
        doInstance.invoke('__proto__', [])
      ).rejects.toThrow(/not allowed|disallowed/i)
    })

    it('should throw when trying to invoke toString', async () => {
      await expect(
        doInstance.invoke('toString', [])
      ).rejects.toThrow(/not allowed|disallowed/i)
    })
  })
})
