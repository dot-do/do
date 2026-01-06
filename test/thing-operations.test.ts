/**
 * @dotdo/do - Thing Operations Tests (RED Phase - Phase 11 Graph Operations)
 *
 * These tests define the expected behavior of Thing operations following the DOClient interface.
 * They should FAIL initially (RED), then pass after implementation (GREEN).
 *
 * Thing operations use EntityId (ns/type/id) addressing and URL-based retrieval,
 * providing graph database semantics for linked data.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DO } from '../src/do'
import type { Thing, CreateOptions, UpdateOptions, ListOptions } from '../src/types'

/**
 * Create an in-memory SQLite mock for testing
 * Extended to support Thing operations with ns/type/id schema
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
        // Handle both documents and things tables
        if (query.includes('things')) {
          const [ns, type, id, url, data] = params as [string, string, string, string, string]
          const tableName = 'things'
          if (!tables.has(tableName)) {
            tables.set(tableName, new Map())
          }
          const table = tables.get(tableName)!
          table.set(url, { ns, type, id, url, data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        } else {
          const [collection, id, data] = params as [string, string, string]
          const tableName = 'documents'
          if (!tables.has(tableName)) {
            tables.set(tableName, new Map())
          }
          const table = tables.get(tableName)!
          const key = `${collection}:${id}`
          table.set(key, { collection, id, data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        }
      } else if (normalizedQuery.startsWith('SELECT')) {
        // Handle things table queries
        if (query.includes('things')) {
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
            } else if (query.includes('ORDER BY') && query.includes('LIMIT')) {
              // Handle list query with optional WHERE conditions
              let filteredRows = Array.from(table.values())

              // Parse WHERE conditions if present
              const whereMatch = query.match(/WHERE\s+(.+?)\s+ORDER BY/i)
              if (whereMatch) {
                const conditions = whereMatch[1]
                let paramIndex = 0

                // Filter by ns
                if (conditions.includes('ns = ?')) {
                  const nsValue = params[paramIndex++] as string
                  filteredRows = filteredRows.filter(row => row.ns === nsValue)
                }

                // Filter by type
                if (conditions.includes('type = ?')) {
                  const typeValue = params[paramIndex++] as string
                  filteredRows = filteredRows.filter(row => row.type === typeValue)
                }

                // Filter by data.* fields (json_extract)
                const jsonExtractMatches = conditions.matchAll(/json_extract\(data,\s*'\$.data\.(\w+)'\)\s*=\s*\?/g)
                for (const match of jsonExtractMatches) {
                  const fieldName = match[1]
                  const fieldValue = params[paramIndex++]
                  filteredRows = filteredRows.filter(row => {
                    try {
                      const parsed = JSON.parse(row.data as string)
                      return parsed.data?.[fieldName] === fieldValue
                    } catch {
                      return false
                    }
                  })
                }
              }

              // Get limit and offset from the end of params
              const limit = params[params.length - 2] as number
              const offset = params[params.length - 1] as number

              // Sort by created_at DESC
              filteredRows.sort((a, b) =>
                new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()
              )

              // Apply offset and limit
              const sliced = filteredRows.slice(offset, offset + limit)
              results.push(...sliced)
            }
          }
        } else {
          // Handle documents table (existing logic)
          const tableName = 'documents'
          const table = tables.get(tableName)
          if (table) {
            if (query.includes('WHERE collection = ? AND id = ?')) {
              const [collection, id] = params as [string, string]
              const key = `${collection}:${id}`
              const row = table.get(key)
              if (row) {
                results.push({ data: row.data })
              }
            }
          }
        }
      } else if (normalizedQuery.startsWith('DELETE')) {
        if (query.includes('things')) {
          const [url] = params as [string]
          const table = tables.get('things')
          if (table) {
            table.delete(url)
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

/**
 * Create a mock context with SQLite storage
 */
function createMockCtx() {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    storage: {
      sql: createMockSqlStorage()
    }
  }
}

// Mock environment
const mockEnv = {
  DO_NAMESPACE: {
    idFromName: vi.fn(() => ({ toString: () => 'mock-id' })),
    get: vi.fn(),
  },
}

describe('Thing Operations (Phase 11 - Graph Operations)', () => {
  let doInstance: DO

  beforeEach(() => {
    doInstance = new DO(createMockCtx() as any, mockEnv)
  })

  describe('Thing.create() with EntityId', () => {
    it('should create a Thing with ns/type/id', async () => {
      const options: CreateOptions<{ name: string; email: string }> = {
        ns: 'example.com',
        type: 'user',
        id: 'john-doe',
        data: { name: 'John Doe', email: 'john@example.com' }
      }

      // Access the Thing operations via the DOClient interface
      const thing = await (doInstance as any).Thing.create(options)

      expect(thing).toBeDefined()
      expect(thing.ns).toBe('example.com')
      expect(thing.type).toBe('user')
      expect(thing.id).toBe('john-doe')
      expect(thing.data.name).toBe('John Doe')
      expect(thing.data.email).toBe('john@example.com')
    })

    it('should auto-generate URL from ns/type/id', async () => {
      const options: CreateOptions<{ title: string }> = {
        ns: 'blog.example.com',
        type: 'post',
        id: 'hello-world',
        data: { title: 'Hello World' }
      }

      const thing = await (doInstance as any).Thing.create(options)

      expect(thing.url).toBe('https://blog.example.com/post/hello-world')
    })

    it('should use provided URL if specified', async () => {
      const options: CreateOptions<{ name: string }> = {
        ns: 'example.com',
        type: 'user',
        id: 'jane',
        url: 'https://custom.example.com/users/jane',
        data: { name: 'Jane Doe' }
      }

      const thing = await (doInstance as any).Thing.create(options)

      expect(thing.url).toBe('https://custom.example.com/users/jane')
    })

    it('should generate id if not provided', async () => {
      const options: CreateOptions<{ name: string }> = {
        ns: 'example.com',
        type: 'user',
        data: { name: 'Anonymous User' }
      }

      const thing = await (doInstance as any).Thing.create(options)

      expect(thing.id).toBeDefined()
      expect(typeof thing.id).toBe('string')
      expect(thing.id.length).toBeGreaterThan(0)
    })

    it('should set createdAt and updatedAt timestamps', async () => {
      const options: CreateOptions<{ name: string }> = {
        ns: 'example.com',
        type: 'user',
        id: 'timestamp-test',
        data: { name: 'Test User' }
      }

      const before = new Date()
      const thing = await (doInstance as any).Thing.create(options)
      const after = new Date()

      expect(thing.createdAt).toBeInstanceOf(Date)
      expect(thing.updatedAt).toBeInstanceOf(Date)
      expect(thing.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(thing.createdAt.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    it('should support JSON-LD @context', async () => {
      const options: CreateOptions<{ name: string }> = {
        ns: 'schema.org',
        type: 'Person',
        id: 'john',
        data: { name: 'John Doe' },
        '@context': 'https://schema.org'
      }

      const thing = await (doInstance as any).Thing.create(options)

      expect(thing['@context']).toBe('https://schema.org')
    })
  })

  describe('Thing.get() by URL', () => {
    it('should retrieve a Thing by its URL', async () => {
      // First create a thing
      const created = await (doInstance as any).Thing.create({
        ns: 'example.com',
        type: 'user',
        id: 'get-test',
        data: { name: 'Get Test User' }
      })

      // Then get it by URL
      const thing = await (doInstance as any).Thing.get(created.url)

      expect(thing).toBeDefined()
      expect(thing.ns).toBe('example.com')
      expect(thing.type).toBe('user')
      expect(thing.id).toBe('get-test')
      expect(thing.data.name).toBe('Get Test User')
    })

    it('should return null for non-existent URL', async () => {
      const thing = await (doInstance as any).Thing.get('https://example.com/user/does-not-exist')

      expect(thing).toBeNull()
    })

    it('should retrieve Thing with all properties preserved', async () => {
      const created = await (doInstance as any).Thing.create({
        ns: 'example.com',
        type: 'product',
        id: 'widget',
        data: { name: 'Widget', price: 99.99, tags: ['electronics', 'sale'] },
        '@context': { '@vocab': 'https://schema.org/' }
      })

      const thing = await (doInstance as any).Thing.get(created.url)

      expect(thing.data.name).toBe('Widget')
      expect(thing.data.price).toBe(99.99)
      expect(thing.data.tags).toEqual(['electronics', 'sale'])
      expect(thing['@context']).toEqual({ '@vocab': 'https://schema.org/' })
    })
  })

  describe('Thing.getById() by ns/type/id', () => {
    it('should retrieve a Thing by ns, type, and id', async () => {
      // First create a thing
      await (doInstance as any).Thing.create({
        ns: 'example.com',
        type: 'user',
        id: 'getbyid-test',
        data: { name: 'GetById Test User' }
      })

      // Then get it by ns/type/id
      const thing = await (doInstance as any).Thing.getById('example.com', 'user', 'getbyid-test')

      expect(thing).toBeDefined()
      expect(thing.ns).toBe('example.com')
      expect(thing.type).toBe('user')
      expect(thing.id).toBe('getbyid-test')
      expect(thing.data.name).toBe('GetById Test User')
    })

    it('should return null for non-existent entity', async () => {
      const thing = await (doInstance as any).Thing.getById('example.com', 'user', 'nonexistent')

      expect(thing).toBeNull()
    })

    it('should distinguish between different types with same id', async () => {
      // Create two things with same id but different types
      await (doInstance as any).Thing.create({
        ns: 'example.com',
        type: 'user',
        id: 'same-id',
        data: { name: 'User Same ID' }
      })

      await (doInstance as any).Thing.create({
        ns: 'example.com',
        type: 'organization',
        id: 'same-id',
        data: { name: 'Org Same ID' }
      })

      const user = await (doInstance as any).Thing.getById('example.com', 'user', 'same-id')
      const org = await (doInstance as any).Thing.getById('example.com', 'organization', 'same-id')

      expect(user.type).toBe('user')
      expect(user.data.name).toBe('User Same ID')
      expect(org.type).toBe('organization')
      expect(org.data.name).toBe('Org Same ID')
    })

    it('should distinguish between different namespaces', async () => {
      await (doInstance as any).Thing.create({
        ns: 'example.com',
        type: 'user',
        id: 'john',
        data: { name: 'John from Example' }
      })

      await (doInstance as any).Thing.create({
        ns: 'other.com',
        type: 'user',
        id: 'john',
        data: { name: 'John from Other' }
      })

      const example = await (doInstance as any).Thing.getById('example.com', 'user', 'john')
      const other = await (doInstance as any).Thing.getById('other.com', 'user', 'john')

      expect(example.ns).toBe('example.com')
      expect(example.data.name).toBe('John from Example')
      expect(other.ns).toBe('other.com')
      expect(other.data.name).toBe('John from Other')
    })
  })

  describe('Thing.set() upsert', () => {
    it('should create a new Thing if it does not exist', async () => {
      const thing = await (doInstance as any).Thing.set(
        'https://example.com/user/new-user',
        { name: 'New User', email: 'new@example.com' }
      )

      expect(thing).toBeDefined()
      expect(thing.url).toBe('https://example.com/user/new-user')
      expect(thing.data.name).toBe('New User')
    })

    it('should update an existing Thing', async () => {
      // Create a thing first
      const created = await (doInstance as any).Thing.create({
        ns: 'example.com',
        type: 'user',
        id: 'set-update-test',
        data: { name: 'Original Name', email: 'original@example.com' }
      })

      // Then set (update) it
      const updated = await (doInstance as any).Thing.set(
        created.url,
        { name: 'Updated Name', email: 'updated@example.com' }
      )

      expect(updated.data.name).toBe('Updated Name')
      expect(updated.data.email).toBe('updated@example.com')
    })

    it('should preserve createdAt on update', async () => {
      const created = await (doInstance as any).Thing.create({
        ns: 'example.com',
        type: 'user',
        id: 'preserve-created',
        data: { name: 'Original' }
      })

      const originalCreatedAt = created.createdAt

      // Wait a bit to ensure time difference
      await new Promise(resolve => setTimeout(resolve, 10))

      const updated = await (doInstance as any).Thing.set(
        created.url,
        { name: 'Updated' }
      )

      expect(updated.createdAt.getTime()).toBe(originalCreatedAt.getTime())
      expect(updated.updatedAt.getTime()).toBeGreaterThan(originalCreatedAt.getTime())
    })

    it('should completely replace data, not merge', async () => {
      const created = await (doInstance as any).Thing.create({
        ns: 'example.com',
        type: 'user',
        id: 'replace-test',
        data: { name: 'Original', email: 'test@example.com', age: 30 }
      })

      const updated = await (doInstance as any).Thing.set(
        created.url,
        { name: 'New Name' }  // Only name, no email or age
      )

      expect(updated.data.name).toBe('New Name')
      expect(updated.data.email).toBeUndefined()
      expect(updated.data.age).toBeUndefined()
    })

    it('should parse URL to extract ns/type/id for new Things', async () => {
      const thing = await (doInstance as any).Thing.set(
        'https://api.example.com/products/widget-1',
        { name: 'Widget 1', price: 49.99 }
      )

      expect(thing.ns).toBe('api.example.com')
      expect(thing.type).toBe('products')
      expect(thing.id).toBe('widget-1')
    })
  })

  describe('Thing.delete()', () => {
    it('should delete an existing Thing by URL', async () => {
      const created = await (doInstance as any).Thing.create({
        ns: 'example.com',
        type: 'user',
        id: 'delete-test',
        data: { name: 'To Be Deleted' }
      })

      const result = await (doInstance as any).Thing.delete(created.url)

      expect(result).toBe(true)
    })

    it('should return false for non-existent Thing', async () => {
      const result = await (doInstance as any).Thing.delete('https://example.com/user/nonexistent')

      expect(result).toBe(false)
    })

    it('should make Thing inaccessible after deletion', async () => {
      const created = await (doInstance as any).Thing.create({
        ns: 'example.com',
        type: 'user',
        id: 'inaccessible-after-delete',
        data: { name: 'Will Be Gone' }
      })

      await (doInstance as any).Thing.delete(created.url)

      const thing = await (doInstance as any).Thing.get(created.url)
      expect(thing).toBeNull()
    })

    it('should not affect other Things', async () => {
      const thing1 = await (doInstance as any).Thing.create({
        ns: 'example.com',
        type: 'user',
        id: 'keep-me',
        data: { name: 'Keep Me' }
      })

      const thing2 = await (doInstance as any).Thing.create({
        ns: 'example.com',
        type: 'user',
        id: 'delete-me',
        data: { name: 'Delete Me' }
      })

      await (doInstance as any).Thing.delete(thing2.url)

      const kept = await (doInstance as any).Thing.get(thing1.url)
      expect(kept).toBeDefined()
      expect(kept.data.name).toBe('Keep Me')
    })
  })

  describe('Thing.list()', () => {
    it('should list all Things', async () => {
      await (doInstance as any).Thing.create({
        ns: 'example.com',
        type: 'user',
        id: 'list-1',
        data: { name: 'User 1' }
      })

      await (doInstance as any).Thing.create({
        ns: 'example.com',
        type: 'user',
        id: 'list-2',
        data: { name: 'User 2' }
      })

      const things = await (doInstance as any).Thing.list()

      expect(Array.isArray(things)).toBe(true)
      expect(things.length).toBeGreaterThanOrEqual(2)
    })

    it('should support limit option', async () => {
      // Create several things
      for (let i = 0; i < 5; i++) {
        await (doInstance as any).Thing.create({
          ns: 'example.com',
          type: 'item',
          id: `limit-test-${i}`,
          data: { name: `Item ${i}` }
        })
      }

      const things = await (doInstance as any).Thing.list({ limit: 3 })

      expect(things.length).toBe(3)
    })

    it('should support offset option', async () => {
      for (let i = 0; i < 5; i++) {
        await (doInstance as any).Thing.create({
          ns: 'example.com',
          type: 'item',
          id: `offset-test-${i}`,
          data: { name: `Item ${i}` }
        })
      }

      const allThings = await (doInstance as any).Thing.list({ limit: 10 })
      const offsetThings = await (doInstance as any).Thing.list({ offset: 2, limit: 10 })

      expect(offsetThings.length).toBe(allThings.length - 2)
    })
  })

  describe('Thing.find()', () => {
    it('should find Things matching filter criteria', async () => {
      await (doInstance as any).Thing.create({
        ns: 'example.com',
        type: 'user',
        id: 'find-1',
        data: { name: 'Alice', role: 'admin' }
      })

      await (doInstance as any).Thing.create({
        ns: 'example.com',
        type: 'user',
        id: 'find-2',
        data: { name: 'Bob', role: 'user' }
      })

      await (doInstance as any).Thing.create({
        ns: 'example.com',
        type: 'user',
        id: 'find-3',
        data: { name: 'Charlie', role: 'admin' }
      })

      const admins = await (doInstance as any).Thing.find({
        where: { 'data.role': 'admin' }
      })

      expect(admins.length).toBe(2)
      expect(admins.every((t: Thing) => t.data.role === 'admin')).toBe(true)
    })

    it('should filter by type', async () => {
      await (doInstance as any).Thing.create({
        ns: 'example.com',
        type: 'user',
        id: 'type-filter-1',
        data: { name: 'User 1' }
      })

      await (doInstance as any).Thing.create({
        ns: 'example.com',
        type: 'post',
        id: 'type-filter-2',
        data: { title: 'Post 1' }
      })

      const users = await (doInstance as any).Thing.find({
        where: { type: 'user' }
      })

      expect(users.every((t: Thing) => t.type === 'user')).toBe(true)
    })

    it('should filter by namespace', async () => {
      await (doInstance as any).Thing.create({
        ns: 'example.com',
        type: 'user',
        id: 'ns-filter-1',
        data: { name: 'Example User' }
      })

      await (doInstance as any).Thing.create({
        ns: 'other.com',
        type: 'user',
        id: 'ns-filter-2',
        data: { name: 'Other User' }
      })

      const exampleThings = await (doInstance as any).Thing.find({
        where: { ns: 'example.com' }
      })

      expect(exampleThings.every((t: Thing) => t.ns === 'example.com')).toBe(true)
    })
  })

  describe('Thing.update() partial update', () => {
    it('should merge updates with existing data', async () => {
      const created = await (doInstance as any).Thing.create({
        ns: 'example.com',
        type: 'user',
        id: 'partial-update',
        data: { name: 'Original', email: 'test@example.com', age: 25 }
      })

      const updated = await (doInstance as any).Thing.update(created.url, {
        data: { age: 26 }  // Only update age
      })

      expect(updated.data.name).toBe('Original')  // Preserved
      expect(updated.data.email).toBe('test@example.com')  // Preserved
      expect(updated.data.age).toBe(26)  // Updated
    })

    it('should return null for non-existent Thing', async () => {
      const result = await (doInstance as any).Thing.update('https://example.com/user/nonexistent', {
        data: { name: 'Update' }
      })

      expect(result).toBeNull()
    })

    it('should update updatedAt timestamp', async () => {
      const created = await (doInstance as any).Thing.create({
        ns: 'example.com',
        type: 'user',
        id: 'timestamp-update',
        data: { name: 'Original' }
      })

      const originalUpdatedAt = created.updatedAt

      await new Promise(resolve => setTimeout(resolve, 10))

      const updated = await (doInstance as any).Thing.update(created.url, {
        data: { name: 'Updated' }
      })

      expect(updated.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime())
    })
  })

  describe('Thing.upsert()', () => {
    it('should create Thing if not exists', async () => {
      const thing = await (doInstance as any).Thing.upsert({
        ns: 'example.com',
        type: 'user',
        id: 'upsert-new',
        data: { name: 'New via Upsert' }
      })

      expect(thing).toBeDefined()
      expect(thing.data.name).toBe('New via Upsert')
    })

    it('should update Thing if exists', async () => {
      // Create first
      await (doInstance as any).Thing.create({
        ns: 'example.com',
        type: 'user',
        id: 'upsert-existing',
        data: { name: 'Original', version: 1 }
      })

      // Upsert with same ns/type/id
      const upserted = await (doInstance as any).Thing.upsert({
        ns: 'example.com',
        type: 'user',
        id: 'upsert-existing',
        data: { name: 'Updated via Upsert', version: 2 }
      })

      expect(upserted.data.name).toBe('Updated via Upsert')
      expect(upserted.data.version).toBe(2)
    })
  })

  describe('DOClient integration', () => {
    it('should expose Thing operations via DOClient interface', async () => {
      // The DO class should implement DOClient methods at the top level
      expect(typeof (doInstance as any).Thing?.create).toBe('function')
      expect(typeof (doInstance as any).Thing?.get).toBe('function')
      expect(typeof (doInstance as any).Thing?.getById).toBe('function')
      expect(typeof (doInstance as any).Thing?.set).toBe('function')
      expect(typeof (doInstance as any).Thing?.delete).toBe('function')
      expect(typeof (doInstance as any).Thing?.list).toBe('function')
      expect(typeof (doInstance as any).Thing?.find).toBe('function')
      expect(typeof (doInstance as any).Thing?.update).toBe('function')
      expect(typeof (doInstance as any).Thing?.upsert).toBe('function')
    })

    it('should also expose operations directly on DOClient', async () => {
      // DOClient interface methods should be available directly
      expect(typeof (doInstance as any).createThing).toBe('function')
      expect(typeof (doInstance as any).getThing).toBe('function')
      expect(typeof (doInstance as any).getThingById).toBe('function')
      expect(typeof (doInstance as any).setThing).toBe('function')
      expect(typeof (doInstance as any).deleteThing).toBe('function')
    })

    it('should include Thing methods in allowedMethods for RPC', () => {
      expect((doInstance as any).allowedMethods.has('createThing')).toBe(true)
      expect((doInstance as any).allowedMethods.has('getThing')).toBe(true)
      expect((doInstance as any).allowedMethods.has('getThingById')).toBe(true)
      expect((doInstance as any).allowedMethods.has('setThing')).toBe(true)
      expect((doInstance as any).allowedMethods.has('deleteThing')).toBe(true)
    })
  })
})
