/**
 * Noun Collection Tests (RED Phase)
 *
 * @description
 * Tests for the NounCollection class covering:
 * - Noun registration and CRUD
 * - Slug validation and uniqueness
 * - Schema management
 * - Registry export
 *
 * These tests are written to FAIL because the methods throw 'Not implemented'.
 * This is the RED phase of TDD - tests must fail before implementation.
 *
 * @see /db/collections/nouns.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { NounCollection } from './nouns'
import { DOStorage, ValidationError, NotFoundError } from './base'
import type { Noun } from '../../types/collections'

/**
 * Mock storage for testing
 *
 * Implements DOStorage interface with an in-memory Map.
 * This is the standard pattern used across all collection tests.
 */
class MockStorage implements DOStorage {
  private data: Map<string, unknown> = new Map()

  async sql<T>(query: string, ...params: unknown[]): Promise<T[]> {
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

describe('NounCollection', () => {
  let storage: MockStorage
  let nouns: NounCollection

  beforeEach(() => {
    storage = new MockStorage()
    nouns = new NounCollection(storage)
  })

  // ===========================================================================
  // create() tests
  // ===========================================================================
  describe('create', () => {
    it('should create a noun with all fields', async () => {
      const nounData = {
        name: 'Customer',
        singular: 'customer',
        plural: 'customers',
        slug: 'customer',
        schema: {
          name: { type: 'string', required: true },
          email: { type: 'string', format: 'email' },
          company: '~>Company',
        },
        description: 'A customer entity representing a business client',
      }

      const noun = await nouns.create(nounData)

      expect(noun).toBeDefined()
      expect(noun.id).toBeDefined()
      expect(noun.id).toMatch(/^noun_/)
      expect(noun.name).toBe('Customer')
      expect(noun.singular).toBe('customer')
      expect(noun.plural).toBe('customers')
      expect(noun.slug).toBe('customer')
      expect(noun.schema).toEqual(nounData.schema)
      expect(noun.description).toBe(nounData.description)
    })

    it('should create a noun with minimal fields (no schema, no description)', async () => {
      const nounData = {
        name: 'Product',
        singular: 'product',
        plural: 'products',
        slug: 'product',
      }

      const noun = await nouns.create(nounData)

      expect(noun).toBeDefined()
      expect(noun.id).toBeDefined()
      expect(noun.id).toMatch(/^noun_/)
      expect(noun.name).toBe('Product')
      expect(noun.singular).toBe('product')
      expect(noun.plural).toBe('products')
      expect(noun.slug).toBe('product')
      expect(noun.schema).toBeUndefined()
      expect(noun.description).toBeUndefined()
    })

    it('should validate slug format - lowercase alphanumeric with hyphens', async () => {
      // Valid slug should work
      const validNoun = await nouns.create({
        name: 'Order Item',
        singular: 'order item',
        plural: 'order items',
        slug: 'order-item',
      })
      expect(validNoun.slug).toBe('order-item')
    })

    it('should reject slug with uppercase letters', async () => {
      await expect(
        nouns.create({
          name: 'Customer',
          singular: 'customer',
          plural: 'customers',
          slug: 'Customer', // Invalid: uppercase
        })
      ).rejects.toThrow(ValidationError)
    })

    it('should reject slug starting with a number', async () => {
      await expect(
        nouns.create({
          name: 'Number Entity',
          singular: 'number entity',
          plural: 'number entities',
          slug: '123entity', // Invalid: starts with number
        })
      ).rejects.toThrow(ValidationError)
    })

    it('should reject slug with double hyphens', async () => {
      await expect(
        nouns.create({
          name: 'Bad Slug',
          singular: 'bad slug',
          plural: 'bad slugs',
          slug: 'bad--slug', // Invalid: double hyphen
        })
      ).rejects.toThrow(ValidationError)
    })

    it('should reject duplicate slugs', async () => {
      // Create first noun
      await nouns.create({
        name: 'Customer',
        singular: 'customer',
        plural: 'customers',
        slug: 'customer',
      })

      // Try to create another with same slug
      await expect(
        nouns.create({
          name: 'Client',
          singular: 'client',
          plural: 'clients',
          slug: 'customer', // Duplicate slug
        })
      ).rejects.toThrow(ValidationError)
    })
  })

  // ===========================================================================
  // getBySlug() tests
  // ===========================================================================
  describe('getBySlug', () => {
    it('should return noun by slug', async () => {
      // Create a noun first
      const created = await nouns.create({
        name: 'Customer',
        singular: 'customer',
        plural: 'customers',
        slug: 'customer',
        schema: { name: 'string' },
      })

      // Get by slug
      const found = await nouns.getBySlug('customer')

      expect(found).toBeDefined()
      expect(found).not.toBeNull()
      expect(found!.id).toBe(created.id)
      expect(found!.name).toBe('Customer')
      expect(found!.slug).toBe('customer')
    })

    it('should return null for non-existent slug', async () => {
      const found = await nouns.getBySlug('non-existent-slug')
      expect(found).toBeNull()
    })

    it('should return correct noun when multiple exist', async () => {
      await nouns.create({
        name: 'Customer',
        singular: 'customer',
        plural: 'customers',
        slug: 'customer',
      })

      const order = await nouns.create({
        name: 'Order',
        singular: 'order',
        plural: 'orders',
        slug: 'order',
      })

      await nouns.create({
        name: 'Product',
        singular: 'product',
        plural: 'products',
        slug: 'product',
      })

      const found = await nouns.getBySlug('order')
      expect(found).toBeDefined()
      expect(found!.id).toBe(order.id)
      expect(found!.name).toBe('Order')
    })
  })

  // ===========================================================================
  // getByName() tests
  // ===========================================================================
  describe('getByName', () => {
    it('should return noun by name (case-insensitive) - exact match', async () => {
      const created = await nouns.create({
        name: 'Customer',
        singular: 'customer',
        plural: 'customers',
        slug: 'customer',
      })

      const found = await nouns.getByName('Customer')

      expect(found).toBeDefined()
      expect(found!.id).toBe(created.id)
    })

    it('should return noun by name (case-insensitive) - lowercase query', async () => {
      const created = await nouns.create({
        name: 'Customer',
        singular: 'customer',
        plural: 'customers',
        slug: 'customer',
      })

      const found = await nouns.getByName('customer')

      expect(found).toBeDefined()
      expect(found!.id).toBe(created.id)
    })

    it('should return noun by name (case-insensitive) - uppercase query', async () => {
      const created = await nouns.create({
        name: 'Customer',
        singular: 'customer',
        plural: 'customers',
        slug: 'customer',
      })

      const found = await nouns.getByName('CUSTOMER')

      expect(found).toBeDefined()
      expect(found!.id).toBe(created.id)
    })

    it('should return noun by name (case-insensitive) - mixed case query', async () => {
      const created = await nouns.create({
        name: 'OrderItem',
        singular: 'order item',
        plural: 'order items',
        slug: 'order-item',
      })

      const found = await nouns.getByName('orderitem')

      expect(found).toBeDefined()
      expect(found!.id).toBe(created.id)
    })

    it('should return null for non-existent name', async () => {
      const found = await nouns.getByName('NonExistent')
      expect(found).toBeNull()
    })
  })

  // ===========================================================================
  // isSlugAvailable() tests
  // ===========================================================================
  describe('isSlugAvailable', () => {
    it('should return true for available slug', async () => {
      const available = await nouns.isSlugAvailable('new-entity')
      expect(available).toBe(true)
    })

    it('should return false for taken slug', async () => {
      await nouns.create({
        name: 'Customer',
        singular: 'customer',
        plural: 'customers',
        slug: 'customer',
      })

      const available = await nouns.isSlugAvailable('customer')
      expect(available).toBe(false)
    })

    it('should return true after noun with slug is deleted', async () => {
      const noun = await nouns.create({
        name: 'Customer',
        singular: 'customer',
        plural: 'customers',
        slug: 'customer',
      })

      // Delete the noun
      await nouns.delete(noun.id)

      // Slug should now be available
      const available = await nouns.isSlugAvailable('customer')
      expect(available).toBe(true)
    })
  })

  // ===========================================================================
  // updateSchema() tests
  // ===========================================================================
  describe('updateSchema', () => {
    it('should update noun schema', async () => {
      const noun = await nouns.create({
        name: 'Customer',
        singular: 'customer',
        plural: 'customers',
        slug: 'customer',
        schema: { name: 'string' },
      })

      const newSchema = {
        name: 'string',
        email: 'string',
        phone: 'string?',
      }

      const updated = await nouns.updateSchema(noun.id, newSchema)

      expect(updated.schema).toEqual(newSchema)
    })

    it('should preserve other fields when updating schema', async () => {
      const noun = await nouns.create({
        name: 'Customer',
        singular: 'customer',
        plural: 'customers',
        slug: 'customer',
        schema: { name: 'string' },
        description: 'Original description',
      })

      const updated = await nouns.updateSchema(noun.id, { name: 'string', email: 'string' })

      // Other fields should be preserved
      expect(updated.name).toBe('Customer')
      expect(updated.singular).toBe('customer')
      expect(updated.plural).toBe('customers')
      expect(updated.slug).toBe('customer')
      expect(updated.description).toBe('Original description')
    })

    it('should throw NotFoundError if noun not found', async () => {
      await expect(nouns.updateSchema('noun_nonexistent', { name: 'string' })).rejects.toThrow(NotFoundError)
    })
  })

  // ===========================================================================
  // getWithRelations() tests
  // ===========================================================================
  describe('getWithRelations', () => {
    it('should return nouns with sync forward cascade operator (->)', async () => {
      await nouns.create({
        name: 'Order',
        singular: 'order',
        plural: 'orders',
        slug: 'order',
        schema: {
          customer: '->Customer',
          total: { type: 'number' },
        },
      })

      await nouns.create({
        name: 'Product',
        singular: 'product',
        plural: 'products',
        slug: 'product',
        schema: { name: 'string' },
      })

      const relational = await nouns.getWithRelations()

      expect(relational).toHaveLength(1)
      expect(relational[0].name).toBe('Order')
    })

    it('should return nouns with async forward cascade operator (~>)', async () => {
      await nouns.create({
        name: 'Customer',
        singular: 'customer',
        plural: 'customers',
        slug: 'customer',
        schema: {
          company: '~>Company',
        },
      })

      const relational = await nouns.getWithRelations()

      expect(relational).toHaveLength(1)
      expect(relational[0].name).toBe('Customer')
    })

    it('should return nouns with backward cascade operators (<-, <~)', async () => {
      await nouns.create({
        name: 'Result',
        singular: 'result',
        plural: 'results',
        slug: 'result',
        schema: {
          experiment: '<-Experiment',
          learning: '<~Learning',
        },
      })

      const relational = await nouns.getWithRelations()

      expect(relational).toHaveLength(1)
      expect(relational[0].name).toBe('Result')
    })

    it('should return multiple nouns with relations', async () => {
      await nouns.create({
        name: 'Order',
        singular: 'order',
        plural: 'orders',
        slug: 'order',
        schema: { customer: '->Customer' },
      })

      await nouns.create({
        name: 'Customer',
        singular: 'customer',
        plural: 'customers',
        slug: 'customer',
        schema: { company: '~>Company' },
      })

      await nouns.create({
        name: 'Product',
        singular: 'product',
        plural: 'products',
        slug: 'product',
        schema: { name: 'string' },
      })

      const relational = await nouns.getWithRelations()

      expect(relational).toHaveLength(2)
      const names = relational.map((n) => n.name)
      expect(names).toContain('Order')
      expect(names).toContain('Customer')
    })

    it('should return empty array if no relational nouns', async () => {
      await nouns.create({
        name: 'Product',
        singular: 'product',
        plural: 'products',
        slug: 'product',
        schema: { name: 'string', price: 'number' },
      })

      const relational = await nouns.getWithRelations()

      expect(relational).toEqual([])
    })

    it('should return empty array if no nouns exist', async () => {
      const relational = await nouns.getWithRelations()
      expect(relational).toEqual([])
    })
  })

  // ===========================================================================
  // exportRegistry() tests
  // ===========================================================================
  describe('exportRegistry', () => {
    it('should export slug to schema map', async () => {
      await nouns.create({
        name: 'Customer',
        singular: 'customer',
        plural: 'customers',
        slug: 'customer',
        schema: { name: 'string', email: 'string' },
      })

      await nouns.create({
        name: 'Order',
        singular: 'order',
        plural: 'orders',
        slug: 'order',
        schema: { customer: '->Customer', total: 'number' },
      })

      const registry = await nouns.exportRegistry()

      expect(registry).toEqual({
        customer: { name: 'string', email: 'string' },
        order: { customer: '->Customer', total: 'number' },
      })
    })

    it('should handle nouns without schemas (empty object)', async () => {
      await nouns.create({
        name: 'Product',
        singular: 'product',
        plural: 'products',
        slug: 'product',
        // No schema
      })

      const registry = await nouns.exportRegistry()

      expect(registry).toEqual({
        product: {},
      })
    })

    it('should return empty object if no nouns exist', async () => {
      const registry = await nouns.exportRegistry()
      expect(registry).toEqual({})
    })

    it('should include all nouns in registry', async () => {
      await nouns.create({
        name: 'A',
        singular: 'a',
        plural: 'as',
        slug: 'a',
        schema: { field: 'string' },
      })

      await nouns.create({
        name: 'B',
        singular: 'b',
        plural: 'bs',
        slug: 'b',
        schema: { other: 'number' },
      })

      await nouns.create({
        name: 'C',
        singular: 'c',
        plural: 'cs',
        slug: 'c',
      })

      const registry = await nouns.exportRegistry()

      expect(Object.keys(registry)).toHaveLength(3)
      expect(registry.a).toEqual({ field: 'string' })
      expect(registry.b).toEqual({ other: 'number' })
      expect(registry.c).toEqual({})
    })
  })

  // ===========================================================================
  // validateSlug() tests (synchronous - already implemented)
  // ===========================================================================
  describe('validateSlug', () => {
    it('should accept valid slugs', () => {
      expect(nouns.validateSlug('customer')).toBe(true)
      expect(nouns.validateSlug('customer-type')).toBe(true)
      expect(nouns.validateSlug('a1')).toBe(true)
      expect(nouns.validateSlug('my-entity-type')).toBe(true)
      expect(nouns.validateSlug('abc123')).toBe(true)
      expect(nouns.validateSlug('a')).toBe(true) // single char is valid
    })

    it('should reject invalid slugs', () => {
      expect(nouns.validateSlug('Customer')).toBe(false) // uppercase
      expect(nouns.validateSlug('123customer')).toBe(false) // starts with number
      expect(nouns.validateSlug('customer--type')).toBe(false) // double hyphen
      expect(nouns.validateSlug('')).toBe(false) // empty
      expect(nouns.validateSlug('customer_type')).toBe(false) // underscore
      expect(nouns.validateSlug('customer type')).toBe(false) // space
      expect(nouns.validateSlug('-customer')).toBe(false) // starts with hyphen
    })
  })

  // ===========================================================================
  // Inherited BaseCollection methods with NounCollection specifics
  // ===========================================================================
  describe('inherited get method', () => {
    it('should return noun by ID', async () => {
      const created = await nouns.create({
        name: 'Customer',
        singular: 'customer',
        plural: 'customers',
        slug: 'customer',
      })

      const found = await nouns.get(created.id)

      expect(found).toBeDefined()
      expect(found!.id).toBe(created.id)
      expect(found!.name).toBe('Customer')
    })

    it('should return null for non-existent ID', async () => {
      const found = await nouns.get('noun_nonexistent')
      expect(found).toBeNull()
    })
  })

  describe('inherited list method', () => {
    it('should list all nouns', async () => {
      await nouns.create({
        name: 'Customer',
        singular: 'customer',
        plural: 'customers',
        slug: 'customer',
      })

      await nouns.create({
        name: 'Order',
        singular: 'order',
        plural: 'orders',
        slug: 'order',
      })

      const result = await nouns.list()

      expect(result.items).toHaveLength(2)
      expect(result.total).toBe(2)
    })

    it('should support pagination', async () => {
      // Create 5 nouns
      for (let i = 1; i <= 5; i++) {
        await nouns.create({
          name: `Entity${i}`,
          singular: `entity${i}`,
          plural: `entity${i}s`,
          slug: `entity${i}`,
        })
      }

      const page1 = await nouns.list({ limit: 2 })
      expect(page1.items).toHaveLength(2)
      expect(page1.hasMore).toBe(true)

      const page2 = await nouns.list({ limit: 2, cursor: page1.cursor })
      expect(page2.items).toHaveLength(2)
      expect(page2.hasMore).toBe(true)

      const page3 = await nouns.list({ limit: 2, cursor: page2.cursor })
      expect(page3.items).toHaveLength(1)
      expect(page3.hasMore).toBe(false)
    })
  })

  describe('inherited update method', () => {
    it('should update noun fields', async () => {
      const noun = await nouns.create({
        name: 'Customer',
        singular: 'customer',
        plural: 'customers',
        slug: 'customer',
      })

      const updated = await nouns.update(noun.id, {
        description: 'Updated description',
      })

      expect(updated.description).toBe('Updated description')
      expect(updated.name).toBe('Customer') // Other fields preserved
    })
  })

  describe('inherited delete method', () => {
    it('should delete noun by ID', async () => {
      const noun = await nouns.create({
        name: 'Customer',
        singular: 'customer',
        plural: 'customers',
        slug: 'customer',
      })

      await nouns.delete(noun.id)

      const found = await nouns.get(noun.id)
      expect(found).toBeNull()
    })
  })
})
