/**
 * Base Collection Tests - RED Phase
 *
 * @description
 * Tests for the BaseCollection class covering:
 * - CRUD operations (create, read, update, delete)
 * - Pagination and cursor-based listing
 * - Filtering with various operators
 * - Sorting
 * - Error handling
 *
 * These tests should FAIL initially (Red phase) until implementation is complete.
 *
 * @see /src/collections/base.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  BaseCollection,
  DOStorage,
  CollectionError,
  NotFoundError,
  ValidationError,
} from './base'

/**
 * Mock storage implementation for testing
 */
class MockStorage implements DOStorage {
  private data: Map<string, unknown> = new Map()

  async sql<T>(_query: string, ..._params: unknown[]): Promise<T[]> {
    return []
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value)
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key)
  }

  async list<T>(options?: { prefix?: string; limit?: number }): Promise<Map<string, T>> {
    const result = new Map<string, T>()
    for (const [key, value] of this.data) {
      if (!options?.prefix || key.startsWith(options.prefix)) {
        result.set(key, value as T)
        if (options?.limit && result.size >= options.limit) break
      }
    }
    return result
  }

  clear() {
    this.data.clear()
  }
}

/**
 * Test entity interface
 */
interface TestEntity {
  id: string
  name: string
  email: string
  age: number
  status: 'active' | 'inactive'
  createdAt: number
  updatedAt: number
  tags?: string[]
}

/**
 * Concrete implementation for testing abstract BaseCollection
 */
class TestCollection extends BaseCollection<TestEntity> {
  constructor(storage: DOStorage) {
    super(storage, { name: 'test_entities', idPrefix: 'test' })
  }

  protected async initializeTable(): Promise<void> {
    // No-op for testing
  }
}

describe('BaseCollection', () => {
  let storage: MockStorage
  let collection: TestCollection

  beforeEach(() => {
    storage = new MockStorage()
    collection = new TestCollection(storage)
  })

  // ===========================================================================
  // CREATE OPERATION
  // ===========================================================================

  describe('create', () => {
    it('should generate a unique ID with prefix', async () => {
      const entity = await collection.create({
        name: 'Test Entity',
        email: 'test@example.com',
        age: 25,
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })

      expect(entity.id).toBeDefined()
      expect(typeof entity.id).toBe('string')
      expect(entity.id.startsWith('test_')).toBe(true)
      expect(entity.id.length).toBeGreaterThan(5)
    })

    it('should add createdAt and updatedAt timestamps', async () => {
      const before = Date.now()
      const entity = await collection.create({
        name: 'Timestamped',
        email: 'time@example.com',
        age: 30,
        status: 'active',
        createdAt: 0,
        updatedAt: 0,
      })
      const after = Date.now()

      expect(entity.createdAt).toBeGreaterThanOrEqual(before)
      expect(entity.createdAt).toBeLessThanOrEqual(after)
      expect(entity.updatedAt).toBe(entity.createdAt)
    })

    it('should store the entity', async () => {
      const entity = await collection.create({
        name: 'Stored',
        email: 'stored@example.com',
        age: 28,
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })

      const retrieved = await collection.get(entity.id)
      expect(retrieved).toEqual(entity)
    })

    it('should return the created entity', async () => {
      const entity = await collection.create({
        name: 'Return Test',
        email: 'return@example.com',
        age: 35,
        status: 'inactive',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })

      expect(entity.name).toBe('Return Test')
      expect(entity.email).toBe('return@example.com')
      expect(entity.age).toBe(35)
      expect(entity.status).toBe('inactive')
    })

    it('should create multiple entities with unique IDs', async () => {
      const entities = await Promise.all([
        collection.create({ name: 'E1', email: 'e1@test.com', age: 20, status: 'active', createdAt: Date.now(), updatedAt: Date.now() }),
        collection.create({ name: 'E2', email: 'e2@test.com', age: 21, status: 'active', createdAt: Date.now(), updatedAt: Date.now() }),
        collection.create({ name: 'E3', email: 'e3@test.com', age: 22, status: 'active', createdAt: Date.now(), updatedAt: Date.now() }),
      ])

      const ids = entities.map(e => e.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(3)
    })

    it('should reject null data', async () => {
      // @ts-expect-error - intentionally passing invalid data
      await expect(collection.create(null)).rejects.toThrow()
    })

    it('should reject undefined data', async () => {
      // @ts-expect-error - intentionally passing invalid data
      await expect(collection.create(undefined)).rejects.toThrow()
    })
  })

  // ===========================================================================
  // GET OPERATION
  // ===========================================================================

  describe('get', () => {
    it('should return entity if found', async () => {
      const created = await collection.create({
        name: 'Find Me',
        email: 'findme@example.com',
        age: 30,
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })

      const found = await collection.get(created.id)

      expect(found).not.toBeNull()
      expect(found?.id).toBe(created.id)
      expect(found?.name).toBe('Find Me')
    })

    it('should return null if not found', async () => {
      const result = await collection.get('nonexistent_123')
      expect(result).toBeNull()
    })

    it('should return null for empty id', async () => {
      const result = await collection.get('')
      expect(result).toBeNull()
    })
  })

  // ===========================================================================
  // UPDATE OPERATION
  // ===========================================================================

  describe('update', () => {
    it('should merge partial data', async () => {
      const created = await collection.create({
        name: 'Original',
        email: 'original@example.com',
        age: 25,
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })

      const updated = await collection.update(created.id, { name: 'Updated' })

      expect(updated.name).toBe('Updated')
      expect(updated.email).toBe('original@example.com')
      expect(updated.age).toBe(25)
    })

    it('should update updatedAt timestamp', async () => {
      const created = await collection.create({
        name: 'Timestamp Update',
        email: 'ts@example.com',
        age: 30,
        status: 'active',
        createdAt: 1000,
        updatedAt: 1000,
      })

      // Wait a bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10))

      const updated = await collection.update(created.id, { age: 31 })

      expect(updated.updatedAt).toBeGreaterThan(created.updatedAt)
    })

    it('should throw NotFoundError if entity not found', async () => {
      await expect(
        collection.update('nonexistent_123', { name: 'New Name' })
      ).rejects.toThrow()
    })

    it('should preserve id on update', async () => {
      const created = await collection.create({
        name: 'ID Preservation',
        email: 'preserve@example.com',
        age: 30,
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })

      const updated = await collection.update(created.id, {
        // @ts-expect-error - id should not be updatable
        id: 'different_id',
        name: 'New Name',
      })

      expect(updated.id).toBe(created.id)
    })

    it('should update multiple fields', async () => {
      const created = await collection.create({
        name: 'Multi',
        email: 'multi@example.com',
        age: 20,
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })

      const updated = await collection.update(created.id, {
        name: 'Multi Updated',
        age: 25,
        status: 'inactive',
      })

      expect(updated.name).toBe('Multi Updated')
      expect(updated.age).toBe(25)
      expect(updated.status).toBe('inactive')
    })
  })

  // ===========================================================================
  // DELETE OPERATION
  // ===========================================================================

  describe('delete', () => {
    it('should remove entity from storage', async () => {
      const created = await collection.create({
        name: 'Delete Me',
        email: 'delete@example.com',
        age: 30,
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })

      await collection.delete(created.id)

      const retrieved = await collection.get(created.id)
      expect(retrieved).toBeNull()
    })

    it('should not throw for non-existent entity', async () => {
      await expect(collection.delete('nonexistent_123')).resolves.toBeUndefined()
    })

    it('should only delete specified entity', async () => {
      const e1 = await collection.create({ name: 'Keep', email: 'keep@test.com', age: 20, status: 'active', createdAt: Date.now(), updatedAt: Date.now() })
      const e2 = await collection.create({ name: 'Delete', email: 'del@test.com', age: 21, status: 'active', createdAt: Date.now(), updatedAt: Date.now() })

      await collection.delete(e2.id)

      expect(await collection.get(e1.id)).not.toBeNull()
      expect(await collection.get(e2.id)).toBeNull()
    })
  })

  // ===========================================================================
  // LIST OPERATION
  // ===========================================================================

  describe('list', () => {
    beforeEach(async () => {
      for (let i = 0; i < 25; i++) {
        await collection.create({
          name: `Entity ${i.toString().padStart(2, '0')}`,
          email: `entity${i}@example.com`,
          age: 20 + i,
          status: i % 2 === 0 ? 'active' : 'inactive',
          createdAt: 1000 + i,
          updatedAt: 1000 + i,
        })
      }
    })

    it('should return paginated results', async () => {
      const result = await collection.list()

      expect(result.items).toBeDefined()
      expect(Array.isArray(result.items)).toBe(true)
      expect(result.hasMore).toBeDefined()
    })

    it('should respect limit option', async () => {
      const result = await collection.list({ limit: 10 })

      expect(result.items.length).toBe(10)
      expect(result.hasMore).toBe(true)
    })

    it('should support cursor-based pagination', async () => {
      const page1 = await collection.list({ limit: 10 })
      expect(page1.cursor).toBeDefined()

      const page2 = await collection.list({ limit: 10, cursor: page1.cursor })
      expect(page2.items[0].id).not.toBe(page1.items[0].id)
    })

    it('should support ordering ascending', async () => {
      const result = await collection.list({ orderBy: 'name', orderDir: 'asc' })

      for (let i = 1; i < result.items.length; i++) {
        expect(result.items[i - 1].name.localeCompare(result.items[i].name)).toBeLessThanOrEqual(0)
      }
    })

    it('should support ordering descending', async () => {
      const result = await collection.list({ orderBy: 'name', orderDir: 'desc' })

      for (let i = 1; i < result.items.length; i++) {
        expect(result.items[i - 1].name.localeCompare(result.items[i].name)).toBeGreaterThanOrEqual(0)
      }
    })

    it('should support filtering', async () => {
      const result = await collection.list({
        filter: { field: 'status', op: 'eq', value: 'active' },
      })

      expect(result.items.every(e => e.status === 'active')).toBe(true)
    })

    it('should support offset pagination', async () => {
      const result = await collection.list({ offset: 20 })

      expect(result.items.length).toBe(5)
      expect(result.hasMore).toBe(false)
    })

    it('should return total count', async () => {
      const result = await collection.list({ limit: 5 })

      expect(result.total).toBe(25)
    })

    it('should handle empty collection', async () => {
      storage.clear()
      const emptyCollection = new TestCollection(storage)

      const result = await emptyCollection.list()

      expect(result.items).toEqual([])
      expect(result.hasMore).toBe(false)
    })
  })

  // ===========================================================================
  // FIND OPERATION
  // ===========================================================================

  describe('find', () => {
    beforeEach(async () => {
      await collection.create({ name: 'Alice', email: 'alice@example.com', age: 25, status: 'active', createdAt: 1000, updatedAt: 1000 })
      await collection.create({ name: 'Bob', email: 'bob@example.com', age: 30, status: 'inactive', createdAt: 2000, updatedAt: 2000 })
      await collection.create({ name: 'Charlie', email: 'charlie@example.com', age: 35, status: 'active', createdAt: 3000, updatedAt: 3000 })
    })

    it('should filter by eq operator', async () => {
      const results = await collection.find({ field: 'status', op: 'eq', value: 'active' })

      expect(results.length).toBe(2)
      expect(results.every(e => e.status === 'active')).toBe(true)
    })

    it('should filter by ne operator', async () => {
      const results = await collection.find({ field: 'status', op: 'ne', value: 'active' })

      expect(results.length).toBe(1)
      expect(results[0].status).toBe('inactive')
    })

    it('should filter by gt operator', async () => {
      const results = await collection.find({ field: 'age', op: 'gt', value: 28 })

      expect(results.length).toBe(2)
      expect(results.every(e => e.age > 28)).toBe(true)
    })

    it('should filter by gte operator', async () => {
      const results = await collection.find({ field: 'age', op: 'gte', value: 30 })

      expect(results.length).toBe(2)
      expect(results.every(e => e.age >= 30)).toBe(true)
    })

    it('should filter by lt operator', async () => {
      const results = await collection.find({ field: 'age', op: 'lt', value: 30 })

      expect(results.length).toBe(1)
      expect(results[0].name).toBe('Alice')
    })

    it('should filter by lte operator', async () => {
      const results = await collection.find({ field: 'age', op: 'lte', value: 30 })

      expect(results.length).toBe(2)
    })

    it('should filter by in operator', async () => {
      const results = await collection.find({ field: 'name', op: 'in', value: ['Alice', 'Charlie'] })

      expect(results.length).toBe(2)
    })

    it('should filter by nin operator', async () => {
      const results = await collection.find({ field: 'name', op: 'nin', value: ['Alice', 'Charlie'] })

      expect(results.length).toBe(1)
      expect(results[0].name).toBe('Bob')
    })

    it('should filter by contains operator', async () => {
      const results = await collection.find({ field: 'email', op: 'contains', value: 'example' })

      expect(results.length).toBe(3)
    })

    it('should filter by startsWith operator', async () => {
      const results = await collection.find({ field: 'email', op: 'startsWith', value: 'alice' })

      expect(results.length).toBe(1)
      expect(results[0].name).toBe('Alice')
    })

    it('should filter by endsWith operator', async () => {
      const results = await collection.find({ field: 'email', op: 'endsWith', value: '@example.com' })

      expect(results.length).toBe(3)
    })

    it('should support AND conditions', async () => {
      const results = await collection.find({
        and: [
          { field: 'status', op: 'eq', value: 'active' },
          { field: 'age', op: 'gt', value: 30 },
        ],
      })

      expect(results.length).toBe(1)
      expect(results[0].name).toBe('Charlie')
    })

    it('should support OR conditions', async () => {
      const results = await collection.find({
        or: [
          { field: 'name', op: 'eq', value: 'Alice' },
          { field: 'name', op: 'eq', value: 'Bob' },
        ],
      })

      expect(results.length).toBe(2)
    })

    it('should support NOT conditions', async () => {
      const results = await collection.find({
        not: { field: 'status', op: 'eq', value: 'active' },
      })

      expect(results.length).toBe(1)
      expect(results[0].name).toBe('Bob')
    })

    it('should support nested conditions', async () => {
      const results = await collection.find({
        and: [
          { field: 'status', op: 'eq', value: 'active' },
          {
            or: [
              { field: 'age', op: 'lt', value: 28 },
              { field: 'age', op: 'gt', value: 32 },
            ],
          },
        ],
      })

      expect(results.length).toBe(2)
    })

    it('should return empty array when no matches', async () => {
      const results = await collection.find({ field: 'name', op: 'eq', value: 'NonExistent' })

      expect(results).toEqual([])
    })
  })

  // ===========================================================================
  // COUNT OPERATION
  // ===========================================================================

  describe('count', () => {
    beforeEach(async () => {
      await collection.create({ name: 'A1', email: 'a1@test.com', age: 25, status: 'active', createdAt: Date.now(), updatedAt: Date.now() })
      await collection.create({ name: 'A2', email: 'a2@test.com', age: 30, status: 'active', createdAt: Date.now(), updatedAt: Date.now() })
      await collection.create({ name: 'I1', email: 'i1@test.com', age: 35, status: 'inactive', createdAt: Date.now(), updatedAt: Date.now() })
    })

    it('should return total count without filter', async () => {
      const count = await collection.count()
      expect(count).toBe(3)
    })

    it('should return filtered count with filter', async () => {
      const count = await collection.count({ field: 'status', op: 'eq', value: 'active' })
      expect(count).toBe(2)
    })

    it('should return 0 for no matches', async () => {
      const count = await collection.count({ field: 'status', op: 'eq', value: 'pending' })
      expect(count).toBe(0)
    })
  })

  // ===========================================================================
  // buildWhereClause
  // ===========================================================================

  describe('buildWhereClause', () => {
    it('should build SQL for simple equality', () => {
      // Access protected method via casting
      const col = collection as unknown as { buildWhereClause: (f: unknown) => { sql: string; params: unknown[] } }
      const result = col.buildWhereClause({ field: 'name', op: 'eq', value: 'Test' })

      expect(result.sql).toContain('name')
      expect(result.sql).toContain('=')
      expect(result.params).toContain('Test')
    })

    it('should build SQL for AND conditions', () => {
      const col = collection as unknown as { buildWhereClause: (f: unknown) => { sql: string; params: unknown[] } }
      const result = col.buildWhereClause({
        and: [
          { field: 'status', op: 'eq', value: 'active' },
          { field: 'age', op: 'gt', value: 25 },
        ],
      })

      expect(result.sql).toContain('AND')
      expect(result.params).toContain('active')
      expect(result.params).toContain(25)
    })

    it('should build SQL for OR conditions', () => {
      const col = collection as unknown as { buildWhereClause: (f: unknown) => { sql: string; params: unknown[] } }
      const result = col.buildWhereClause({
        or: [
          { field: 'name', op: 'eq', value: 'Alice' },
          { field: 'name', op: 'eq', value: 'Bob' },
        ],
      })

      expect(result.sql).toContain('OR')
      expect(result.params).toContain('Alice')
      expect(result.params).toContain('Bob')
    })

    it('should handle parameter binding correctly', () => {
      const col = collection as unknown as { buildWhereClause: (f: unknown) => { sql: string; params: unknown[] } }
      const result = col.buildWhereClause({ field: 'age', op: 'in', value: [25, 30, 35] })

      expect(result.params).toEqual([25, 30, 35])
    })
  })
})

// ===========================================================================
// ERROR CLASSES
// ===========================================================================

describe('CollectionError', () => {
  it('should create error with code', () => {
    const error = new CollectionError('Test error', 'NOT_FOUND', 'test_123')
    expect(error.message).toBe('Test error')
    expect(error.code).toBe('NOT_FOUND')
    expect(error.entityId).toBe('test_123')
    expect(error.name).toBe('CollectionError')
  })

  it('should extend Error', () => {
    const error = new CollectionError('Test', 'STORAGE')
    expect(error instanceof Error).toBe(true)
  })
})

describe('NotFoundError', () => {
  it('should create error with collection and id', () => {
    const error = new NotFoundError('customers', 'cust_123')
    expect(error.message).toBe("customers with id 'cust_123' not found")
    expect(error.code).toBe('NOT_FOUND')
    expect(error.entityId).toBe('cust_123')
    expect(error.name).toBe('NotFoundError')
  })

  it('should extend CollectionError', () => {
    const error = new NotFoundError('test', 'id')
    expect(error instanceof CollectionError).toBe(true)
  })
})

describe('ValidationError', () => {
  it('should create error with message', () => {
    const error = new ValidationError('Invalid email format', 'email')
    expect(error.message).toBe('Invalid email format')
    expect(error.code).toBe('VALIDATION')
    expect(error.field).toBe('email')
    expect(error.name).toBe('ValidationError')
  })

  it('should extend CollectionError', () => {
    const error = new ValidationError('Invalid', 'field')
    expect(error instanceof CollectionError).toBe(true)
  })
})
