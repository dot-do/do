/**
 * @dotdo/do - Thing Operations Tests (GREEN Phase - Phase 11 Graph Operations)
 *
 * These tests verify the behavior of Thing operations following the DOClient interface.
 * Implementation is complete - all tests should pass.
 *
 * Thing operations use EntityId (ns/type/id) addressing and URL-based retrieval,
 * providing graph database semantics for linked data.
 *
 * Uses the @cloudflare/vitest-pool-workers integration with real Miniflare-powered SQLite storage.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { env, runInDurableObject } from 'cloudflare:test'
import type { DurableObjectStub } from '@cloudflare/workers-types'
import { createTestStub, uniqueTestName } from './helpers/do-test-utils'
import type { Thing, CreateOptions, UpdateOptions, ListOptions } from '../src/types'

// Type for DO stub with Thing RPC methods
interface ThingDOStub extends DurableObjectStub {
  // Thing operations via DOClient
  createThing<T extends Record<string, unknown>>(options: CreateOptions<T>): Promise<Thing<T>>
  getThing<T extends Record<string, unknown>>(url: string): Promise<Thing<T> | null>
  getThingById<T extends Record<string, unknown>>(
    ns: string,
    type: string,
    id: string
  ): Promise<Thing<T> | null>
  setThing<T extends Record<string, unknown>>(url: string, data: T): Promise<Thing<T>>
  deleteThing(url: string): Promise<boolean>
  listThings<T extends Record<string, unknown>>(options?: ListOptions): Promise<Thing<T>[]>
  findThings<T extends Record<string, unknown>>(options: ListOptions): Promise<Thing<T>[]>
  updateThing<T extends Record<string, unknown>>(
    url: string,
    options: UpdateOptions<T>
  ): Promise<Thing<T> | null>
  upsertThing<T extends Record<string, unknown>>(options: CreateOptions<T>): Promise<Thing<T>>
}

describe('Thing Operations (Phase 11 - Graph Operations)', () => {
  let stub: ThingDOStub

  beforeEach(() => {
    const name = uniqueTestName('thing-ops')
    stub = createTestStub(name) as ThingDOStub
  })

  describe('Thing.create() with EntityId', () => {
    it('should create a Thing with ns/type/id', async () => {
      const options: CreateOptions<{ name: string; email: string }> = {
        ns: 'example.com',
        type: 'user',
        id: 'john-doe',
        data: { name: 'John Doe', email: 'john@example.com' },
      }

      const thing = await stub.createThing(options)

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
        data: { title: 'Hello World' },
      }

      const thing = await stub.createThing(options)

      expect(thing.url).toBe('https://blog.example.com/post/hello-world')
    })

    it('should use provided URL if specified', async () => {
      const options: CreateOptions<{ name: string }> = {
        ns: 'example.com',
        type: 'user',
        id: 'jane',
        url: 'https://custom.example.com/users/jane',
        data: { name: 'Jane Doe' },
      }

      const thing = await stub.createThing(options)

      expect(thing.url).toBe('https://custom.example.com/users/jane')
    })

    it('should generate id if not provided', async () => {
      const options: CreateOptions<{ name: string }> = {
        ns: 'example.com',
        type: 'user',
        data: { name: 'Anonymous User' },
      }

      const thing = await stub.createThing(options)

      expect(thing.id).toBeDefined()
      expect(typeof thing.id).toBe('string')
      expect(thing.id.length).toBeGreaterThan(0)
    })

    it('should set createdAt and updatedAt timestamps', async () => {
      const options: CreateOptions<{ name: string }> = {
        ns: 'example.com',
        type: 'user',
        id: 'timestamp-test',
        data: { name: 'Test User' },
      }

      const before = new Date()
      const thing = await stub.createThing(options)
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
        '@context': 'https://schema.org',
      }

      const thing = await stub.createThing(options)

      expect(thing['@context']).toBe('https://schema.org')
    })
  })

  describe('Thing.get() by URL', () => {
    it('should retrieve a Thing by its URL', async () => {
      // First create a thing
      const created = await stub.createThing({
        ns: 'example.com',
        type: 'user',
        id: 'get-test',
        data: { name: 'Get Test User' },
      })

      // Then get it by URL
      const thing = await stub.getThing<{ name: string }>(created.url!)

      expect(thing).toBeDefined()
      expect(thing!.ns).toBe('example.com')
      expect(thing!.type).toBe('user')
      expect(thing!.id).toBe('get-test')
      expect(thing!.data.name).toBe('Get Test User')
    })

    it('should return null for non-existent URL', async () => {
      const thing = await stub.getThing('https://example.com/user/does-not-exist')

      expect(thing).toBeNull()
    })

    it('should retrieve Thing with all properties preserved', async () => {
      const created = await stub.createThing({
        ns: 'example.com',
        type: 'product',
        id: 'widget',
        data: { name: 'Widget', price: 99.99, tags: ['electronics', 'sale'] },
        '@context': { '@vocab': 'https://schema.org/' },
      })

      const thing = await stub.getThing<{ name: string; price: number; tags: string[] }>(
        created.url!
      )

      expect(thing!.data.name).toBe('Widget')
      expect(thing!.data.price).toBe(99.99)
      expect(thing!.data.tags).toEqual(['electronics', 'sale'])
      expect(thing!['@context']).toEqual({ '@vocab': 'https://schema.org/' })
    })
  })

  describe('Thing.getById() by ns/type/id', () => {
    it('should retrieve a Thing by ns, type, and id', async () => {
      // First create a thing
      await stub.createThing({
        ns: 'example.com',
        type: 'user',
        id: 'getbyid-test',
        data: { name: 'GetById Test User' },
      })

      // Then get it by ns/type/id
      const thing = await stub.getThingById<{ name: string }>('example.com', 'user', 'getbyid-test')

      expect(thing).toBeDefined()
      expect(thing!.ns).toBe('example.com')
      expect(thing!.type).toBe('user')
      expect(thing!.id).toBe('getbyid-test')
      expect(thing!.data.name).toBe('GetById Test User')
    })

    it('should return null for non-existent entity', async () => {
      const thing = await stub.getThingById('example.com', 'user', 'nonexistent')

      expect(thing).toBeNull()
    })

    it('should distinguish between different types with same id', async () => {
      // Create two things with same id but different types
      await stub.createThing({
        ns: 'example.com',
        type: 'user',
        id: 'same-id',
        data: { name: 'User Same ID' },
      })

      await stub.createThing({
        ns: 'example.com',
        type: 'organization',
        id: 'same-id',
        data: { name: 'Org Same ID' },
      })

      const user = await stub.getThingById<{ name: string }>('example.com', 'user', 'same-id')
      const org = await stub.getThingById<{ name: string }>('example.com', 'organization', 'same-id')

      expect(user!.type).toBe('user')
      expect(user!.data.name).toBe('User Same ID')
      expect(org!.type).toBe('organization')
      expect(org!.data.name).toBe('Org Same ID')
    })

    it('should distinguish between different namespaces', async () => {
      await stub.createThing({
        ns: 'example.com',
        type: 'user',
        id: 'john',
        data: { name: 'John from Example' },
      })

      await stub.createThing({
        ns: 'other.com',
        type: 'user',
        id: 'john',
        data: { name: 'John from Other' },
      })

      const example = await stub.getThingById<{ name: string }>('example.com', 'user', 'john')
      const other = await stub.getThingById<{ name: string }>('other.com', 'user', 'john')

      expect(example!.ns).toBe('example.com')
      expect(example!.data.name).toBe('John from Example')
      expect(other!.ns).toBe('other.com')
      expect(other!.data.name).toBe('John from Other')
    })
  })

  describe('Thing.set() upsert', () => {
    it('should create a new Thing if it does not exist', async () => {
      const thing = await stub.setThing('https://example.com/user/new-user', {
        name: 'New User',
        email: 'new@example.com',
      })

      expect(thing).toBeDefined()
      expect(thing.url).toBe('https://example.com/user/new-user')
      expect(thing.data.name).toBe('New User')
    })

    it('should update an existing Thing', async () => {
      // Create a thing first
      const created = await stub.createThing({
        ns: 'example.com',
        type: 'user',
        id: 'set-update-test',
        data: { name: 'Original Name', email: 'original@example.com' },
      })

      // Then set (update) it
      const updated = await stub.setThing<{ name: string; email: string }>(created.url!, {
        name: 'Updated Name',
        email: 'updated@example.com',
      })

      expect(updated.data.name).toBe('Updated Name')
      expect(updated.data.email).toBe('updated@example.com')
    })

    it('should preserve createdAt on update', async () => {
      const created = await stub.createThing({
        ns: 'example.com',
        type: 'user',
        id: 'preserve-created',
        data: { name: 'Original' },
      })

      const originalCreatedAt = created.createdAt

      // Wait a bit to ensure time difference
      await new Promise(resolve => setTimeout(resolve, 10))

      const updated = await stub.setThing<{ name: string }>(created.url!, { name: 'Updated' })

      expect(updated.createdAt.getTime()).toBe(originalCreatedAt.getTime())
      expect(updated.updatedAt.getTime()).toBeGreaterThan(originalCreatedAt.getTime())
    })

    it('should completely replace data, not merge', async () => {
      const created = await stub.createThing({
        ns: 'example.com',
        type: 'user',
        id: 'replace-test',
        data: { name: 'Original', email: 'test@example.com', age: 30 },
      })

      const updated = await stub.setThing<{ name: string; email?: string; age?: number }>(
        created.url!,
        { name: 'New Name' } // Only name, no email or age
      )

      expect(updated.data.name).toBe('New Name')
      expect(updated.data.email).toBeUndefined()
      expect(updated.data.age).toBeUndefined()
    })

    it('should parse URL to extract ns/type/id for new Things', async () => {
      const thing = await stub.setThing('https://api.example.com/products/widget-1', {
        name: 'Widget 1',
        price: 49.99,
      })

      expect(thing.ns).toBe('api.example.com')
      expect(thing.type).toBe('products')
      expect(thing.id).toBe('widget-1')
    })
  })

  describe('Thing.delete()', () => {
    it('should delete an existing Thing by URL', async () => {
      const created = await stub.createThing({
        ns: 'example.com',
        type: 'user',
        id: 'delete-test',
        data: { name: 'To Be Deleted' },
      })

      const result = await stub.deleteThing(created.url!)

      expect(result).toBe(true)
    })

    it('should return false for non-existent Thing', async () => {
      const result = await stub.deleteThing('https://example.com/user/nonexistent')

      expect(result).toBe(false)
    })

    it('should make Thing inaccessible after deletion', async () => {
      const created = await stub.createThing({
        ns: 'example.com',
        type: 'user',
        id: 'inaccessible-after-delete',
        data: { name: 'Will Be Gone' },
      })

      await stub.deleteThing(created.url!)

      const thing = await stub.getThing(created.url!)
      expect(thing).toBeNull()
    })

    it('should not affect other Things', async () => {
      const thing1 = await stub.createThing({
        ns: 'example.com',
        type: 'user',
        id: 'keep-me',
        data: { name: 'Keep Me' },
      })

      const thing2 = await stub.createThing({
        ns: 'example.com',
        type: 'user',
        id: 'delete-me',
        data: { name: 'Delete Me' },
      })

      await stub.deleteThing(thing2.url!)

      const kept = await stub.getThing<{ name: string }>(thing1.url!)
      expect(kept).toBeDefined()
      expect(kept!.data.name).toBe('Keep Me')
    })
  })

  describe('Thing.list()', () => {
    it('should list all Things', async () => {
      await stub.createThing({
        ns: 'example.com',
        type: 'user',
        id: 'list-1',
        data: { name: 'User 1' },
      })

      await stub.createThing({
        ns: 'example.com',
        type: 'user',
        id: 'list-2',
        data: { name: 'User 2' },
      })

      const things = await stub.listThings()

      expect(Array.isArray(things)).toBe(true)
      expect(things.length).toBeGreaterThanOrEqual(2)
    })

    it('should support limit option', async () => {
      // Create several things
      for (let i = 0; i < 5; i++) {
        await stub.createThing({
          ns: 'example.com',
          type: 'item',
          id: `limit-test-${i}`,
          data: { name: `Item ${i}` },
        })
      }

      const things = await stub.listThings({ limit: 3 })

      expect(things.length).toBe(3)
    })

    it('should support offset option', async () => {
      for (let i = 0; i < 5; i++) {
        await stub.createThing({
          ns: 'example.com',
          type: 'item',
          id: `offset-test-${i}`,
          data: { name: `Item ${i}` },
        })
      }

      const allThings = await stub.listThings({ limit: 10 })
      const offsetThings = await stub.listThings({ offset: 2, limit: 10 })

      expect(offsetThings.length).toBe(allThings.length - 2)
    })
  })

  describe('Thing.find()', () => {
    it('should find Things matching filter criteria', async () => {
      await stub.createThing({
        ns: 'example.com',
        type: 'user',
        id: 'find-1',
        data: { name: 'Alice', role: 'admin' },
      })

      await stub.createThing({
        ns: 'example.com',
        type: 'user',
        id: 'find-2',
        data: { name: 'Bob', role: 'user' },
      })

      await stub.createThing({
        ns: 'example.com',
        type: 'user',
        id: 'find-3',
        data: { name: 'Charlie', role: 'admin' },
      })

      const admins = await stub.findThings({
        where: { 'data.role': 'admin' },
      })

      expect(admins.length).toBe(2)
      expect(admins.every((t: Thing) => t.data.role === 'admin')).toBe(true)
    })

    it('should filter by type', async () => {
      await stub.createThing({
        ns: 'example.com',
        type: 'user',
        id: 'type-filter-1',
        data: { name: 'User 1' },
      })

      await stub.createThing({
        ns: 'example.com',
        type: 'post',
        id: 'type-filter-2',
        data: { title: 'Post 1' },
      })

      const users = await stub.findThings({
        where: { type: 'user' },
      })

      expect(users.every((t: Thing) => t.type === 'user')).toBe(true)
    })

    it('should filter by namespace', async () => {
      await stub.createThing({
        ns: 'example.com',
        type: 'user',
        id: 'ns-filter-1',
        data: { name: 'Example User' },
      })

      await stub.createThing({
        ns: 'other.com',
        type: 'user',
        id: 'ns-filter-2',
        data: { name: 'Other User' },
      })

      const exampleThings = await stub.findThings({
        where: { ns: 'example.com' },
      })

      expect(exampleThings.every((t: Thing) => t.ns === 'example.com')).toBe(true)
    })
  })

  describe('Thing.update() partial update', () => {
    it('should merge updates with existing data', async () => {
      const created = await stub.createThing({
        ns: 'example.com',
        type: 'user',
        id: 'partial-update',
        data: { name: 'Original', email: 'test@example.com', age: 25 },
      })

      const updated = await stub.updateThing<{ name: string; email: string; age: number }>(
        created.url!,
        {
          data: { age: 26 }, // Only update age
        }
      )

      expect(updated!.data.name).toBe('Original') // Preserved
      expect(updated!.data.email).toBe('test@example.com') // Preserved
      expect(updated!.data.age).toBe(26) // Updated
    })

    it('should return null for non-existent Thing', async () => {
      const result = await stub.updateThing('https://example.com/user/nonexistent', {
        data: { name: 'Update' },
      })

      expect(result).toBeNull()
    })

    it('should update updatedAt timestamp', async () => {
      const created = await stub.createThing({
        ns: 'example.com',
        type: 'user',
        id: 'timestamp-update',
        data: { name: 'Original' },
      })

      const originalUpdatedAt = created.updatedAt

      await new Promise(resolve => setTimeout(resolve, 10))

      const updated = await stub.updateThing<{ name: string }>(created.url!, {
        data: { name: 'Updated' },
      })

      expect(updated!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime())
    })
  })

  describe('Thing.upsert()', () => {
    it('should create Thing if not exists', async () => {
      const thing = await stub.upsertThing({
        ns: 'example.com',
        type: 'user',
        id: 'upsert-new',
        data: { name: 'New via Upsert' },
      })

      expect(thing).toBeDefined()
      expect(thing.data.name).toBe('New via Upsert')
    })

    it('should update Thing if exists', async () => {
      // Create first
      await stub.createThing({
        ns: 'example.com',
        type: 'user',
        id: 'upsert-existing',
        data: { name: 'Original', version: 1 },
      })

      // Upsert with same ns/type/id
      const upserted = await stub.upsertThing({
        ns: 'example.com',
        type: 'user',
        id: 'upsert-existing',
        data: { name: 'Updated via Upsert', version: 2 },
      })

      expect(upserted.data.name).toBe('Updated via Upsert')
      expect(upserted.data.version).toBe(2)
    })
  })

  describe('DOClient integration', () => {
    it('should expose Thing operations via direct methods', async () => {
      await runInDurableObject(stub, async instance => {
        // The DO class should implement DOClient methods at the top level
        expect(typeof (instance as any).createThing).toBe('function')
        expect(typeof (instance as any).getThing).toBe('function')
        expect(typeof (instance as any).getThingById).toBe('function')
        expect(typeof (instance as any).setThing).toBe('function')
        expect(typeof (instance as any).deleteThing).toBe('function')
      })
    })

    it('should expose Thing namespace with operations', async () => {
      await runInDurableObject(stub, async instance => {
        // The DO class should also have Thing namespace
        expect(typeof (instance as any).Thing?.create).toBe('function')
        expect(typeof (instance as any).Thing?.get).toBe('function')
        expect(typeof (instance as any).Thing?.getById).toBe('function')
        expect(typeof (instance as any).Thing?.set).toBe('function')
        expect(typeof (instance as any).Thing?.delete).toBe('function')
      })
    })

    it('should include Thing methods in allowedMethods for RPC', async () => {
      await runInDurableObject(stub, async instance => {
        expect((instance as any).allowedMethods.has('createThing')).toBe(true)
        expect((instance as any).allowedMethods.has('getThing')).toBe(true)
        expect((instance as any).allowedMethods.has('getThingById')).toBe(true)
        expect((instance as any).allowedMethods.has('setThing')).toBe(true)
        expect((instance as any).allowedMethods.has('deleteThing')).toBe(true)
      })
    })
  })
})
