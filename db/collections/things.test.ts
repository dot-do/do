/**
 * Things Collection Tests - RED Phase
 *
 * @description
 * Tests for ThingCollection covering:
 * - ThingExpanded format ($id, $type, $content, $code, etc.)
 * - ThingCompact format (id, type, data, content, code)
 * - Format detection and conversion
 * - $ref resolution for dual nature pattern
 * - $version tracking for optimistic concurrency
 *
 * These tests should FAIL initially (Red phase) until implementation is complete.
 *
 * @see /src/collections/things.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type {
  Thing,
  ThingExpanded,
  ThingCompact,
} from '../../types/collections'
import { isThingExpanded, isThingCompact } from '../../types/collections'
import { ThingCollection, CreateThingExpandedOptions, CreateThingCompactOptions } from './things'
import { DOStorage } from './base'
import { NounCollection } from './nouns'

/**
 * Mock storage implementation
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
 * Mock noun collection
 */
class MockNounCollection {
  async get(_id: string) {
    return { id: 'mock', name: 'Mock', singular: 'mock', plural: 'mocks', slug: 'mock' }
  }
}

describe('ThingCollection', () => {
  let storage: MockStorage
  let nouns: NounCollection
  let things: ThingCollection

  beforeEach(() => {
    storage = new MockStorage()
    nouns = new MockNounCollection() as unknown as NounCollection
    things = new ThingCollection(storage, nouns)
  })

  // ===========================================================================
  // ThingExpanded FORMAT ($id, $type, etc.)
  // ===========================================================================

  describe('ThingExpanded Format', () => {
    it('should create thing in expanded format', async () => {
      const thing = await things.createExpanded({
        $type: 'Person',
        name: 'John Doe',
        email: 'john@example.com',
      })

      expect(thing.$id).toBeDefined()
      expect(thing.$type).toBe('Person')
      expect(thing.name).toBe('John Doe')
      expect(thing.email).toBe('john@example.com')
    })

    it('should use $ prefix for metadata fields', async () => {
      const thing = await things.createExpanded({
        $type: 'Document',
        $content: '# Hello World',
        $code: 'console.log("test")',
        title: 'My Document',
      })

      expect(thing.$id).toBeDefined()
      expect(thing.$type).toBe('Document')
      expect(thing.$content).toBe('# Hello World')
      expect(thing.$code).toBe('console.log("test")')
      expect(thing.title).toBe('My Document')
    })

    it('should auto-generate $id with prefix', async () => {
      const thing = await things.createExpanded({
        $type: 'Entity',
        data: 'test',
      })

      expect(thing.$id).toBeDefined()
      expect(typeof thing.$id).toBe('string')
      expect(thing.$id.startsWith('thing_')).toBe(true)
    })

    it('should set $createdAt timestamp', async () => {
      const before = Date.now()
      const thing = await things.createExpanded({
        $type: 'Timestamped',
      })
      const after = Date.now()

      expect(thing.$createdAt).toBeDefined()
      expect(thing.$createdAt).toBeGreaterThanOrEqual(before)
      expect(thing.$createdAt).toBeLessThanOrEqual(after)
    })

    it('should set $updatedAt on update', async () => {
      const thing = await things.createExpanded({
        $type: 'Updateable',
        value: 1,
      })

      const originalUpdatedAt = thing.$updatedAt

      await new Promise(resolve => setTimeout(resolve, 10))

      const updated = await things.update(thing.$id, { value: 2 })

      expect((updated as ThingExpanded).updatedAt ?? (updated as ThingExpanded).$updatedAt).toBeDefined()
      expect((updated as ThingExpanded).updatedAt ?? (updated as ThingExpanded).$updatedAt).toBeGreaterThan(originalUpdatedAt ?? 0)
    })

    it('should spread data fields at root level', async () => {
      const thing = await things.createExpanded({
        $type: 'Product',
        name: 'Widget',
        price: 99.99,
        inStock: true,
        categories: ['electronics', 'gadgets'],
      })

      expect(thing.name).toBe('Widget')
      expect(thing.price).toBe(99.99)
      expect(thing.inStock).toBe(true)
      expect(thing.categories).toEqual(['electronics', 'gadgets'])
      expect('data' in thing).toBe(false)
    })

    it('should support $ref for DO reference', async () => {
      const thing = await things.createExpanded({
        $type: 'Startup',
        $ref: 'https://headless.ly',
        name: 'Headless',
      })

      expect(thing.$ref).toBe('https://headless.ly')
    })

    it('should validate expanded format with isThingExpanded', () => {
      const expanded: ThingExpanded = {
        $id: 'test-id',
        $type: 'TestType',
        name: 'Test',
      }

      expect(isThingExpanded(expanded)).toBe(true)
      expect(isThingCompact(expanded)).toBe(false)
    })

    it('should set initial $version to 1', async () => {
      const thing = await things.createExpanded({
        $type: 'Versioned',
        name: 'First Version',
      })

      expect(thing.$version).toBe(1)
    })
  })

  // ===========================================================================
  // ThingCompact FORMAT (id, type, data)
  // ===========================================================================

  describe('ThingCompact Format', () => {
    it('should create thing in compact format', async () => {
      const thing = await things.createCompact({
        type: 'Person',
        data: {
          name: 'John Doe',
          email: 'john@example.com',
        },
      })

      expect(thing.id).toBeDefined()
      expect(thing.type).toBe('Person')
      expect(thing.data.name).toBe('John Doe')
      expect(thing.data.email).toBe('john@example.com')
    })

    it('should nest data fields in data property', async () => {
      const thing = await things.createCompact({
        type: 'Product',
        data: {
          name: 'Widget',
          price: 99.99,
          inStock: true,
        },
      })

      expect(thing.data).toBeDefined()
      expect(thing.data.name).toBe('Widget')
      expect(thing.data.price).toBe(99.99)
      expect(thing.data.inStock).toBe(true)
    })

    it('should use non-$ prefixed metadata', async () => {
      const thing = await things.createCompact({
        type: 'Document',
        data: { title: 'My Doc' },
        content: '# Markdown Content',
        code: 'const x = 1',
      })

      expect(thing.id).toBeDefined()
      expect(thing.type).toBe('Document')
      expect(thing.content).toBe('# Markdown Content')
      expect(thing.code).toBe('const x = 1')
    })

    it('should set createdAt timestamp (without $)', async () => {
      const before = Date.now()
      const thing = await things.createCompact({
        type: 'Timestamped',
        data: {},
      })
      const after = Date.now()

      expect(thing.createdAt).toBeDefined()
      expect(thing.createdAt).toBeGreaterThanOrEqual(before)
      expect(thing.createdAt).toBeLessThanOrEqual(after)
    })

    it('should support ref for DO reference (without $)', async () => {
      const thing = await things.createCompact({
        type: 'Startup',
        data: { name: 'Headless' },
        ref: 'https://headless.ly',
      })

      expect(thing.ref).toBe('https://headless.ly')
    })

    it('should validate compact format with isThingCompact', () => {
      const compact: ThingCompact<{ name: string }> = {
        id: 'test-id',
        type: 'TestType',
        data: { name: 'Test' },
      }

      expect(isThingCompact(compact)).toBe(true)
      expect(isThingExpanded(compact)).toBe(false)
    })

    it('should set initial version to 1', async () => {
      const thing = await things.createCompact({
        type: 'VersionedCompact',
        data: { name: 'V1' },
      })

      expect(thing.version).toBe(1)
    })
  })

  // ===========================================================================
  // FORMAT DETECTION
  // ===========================================================================

  describe('Format Detection', () => {
    it('should detect expanded format by $id and $type', () => {
      const expanded: ThingExpanded = {
        $id: 'test-id',
        $type: 'Test',
        name: 'Test',
      }

      expect(things.isExpanded(expanded)).toBe(true)
      expect(things.isCompact(expanded)).toBe(false)
    })

    it('should detect compact format by id, type, and data', () => {
      const compact: ThingCompact = {
        id: 'test-id',
        type: 'Test',
        data: { name: 'Test' },
      }

      expect(things.isCompact(compact)).toBe(true)
      expect(things.isExpanded(compact)).toBe(false)
    })

    it('should use isThingExpanded type guard correctly', () => {
      const expanded: ThingExpanded = {
        $id: 'test',
        $type: 'Type',
        value: 1,
      }

      expect(isThingExpanded(expanded)).toBe(true)
      expect(isThingCompact(expanded)).toBe(false)
    })

    it('should use isThingCompact type guard correctly', () => {
      const compact: ThingCompact = {
        id: 'test',
        type: 'Type',
        data: { value: 1 },
      }

      expect(isThingCompact(compact)).toBe(true)
      expect(isThingExpanded(compact)).toBe(false)
    })
  })

  // ===========================================================================
  // FORMAT CONVERSION
  // ===========================================================================

  describe('Format Conversion', () => {
    describe('toExpanded()', () => {
      it('should convert compact to expanded', () => {
        const compact: ThingCompact<{ name: string; age: number }> = {
          id: 'abc123',
          type: 'Person',
          data: { name: 'John', age: 30 },
          createdAt: 1000,
          updatedAt: 2000,
        }

        const expanded = things.toExpanded(compact)

        expect(expanded.$id).toBe('abc123')
        expect(expanded.$type).toBe('Person')
        expect(expanded.name).toBe('John')
        expect(expanded.age).toBe(30)
        expect(expanded.$createdAt).toBe(1000)
        expect(expanded.$updatedAt).toBe(2000)
      })

      it('should convert compact with content/code', () => {
        const compact: ThingCompact = {
          id: 'doc1',
          type: 'Document',
          data: { title: 'My Doc' },
          content: '# Hello',
          code: 'const x = 1',
        }

        const expanded = things.toExpanded(compact)

        expect(expanded.$content).toBe('# Hello')
        expect(expanded.$code).toBe('const x = 1')
      })

      it('should convert compact with ref', () => {
        const compact: ThingCompact = {
          id: 'startup1',
          type: 'Startup',
          data: { name: 'Acme' },
          ref: 'https://acme.com',
        }

        const expanded = things.toExpanded(compact)

        expect(expanded.$ref).toBe('https://acme.com')
      })

      it('should return expanded unchanged', () => {
        const expanded: ThingExpanded = {
          $id: 'already-expanded',
          $type: 'Test',
          value: 42,
        }

        const result = things.toExpanded(expanded)

        expect(result).toEqual(expanded)
      })
    })

    describe('toCompact()', () => {
      it('should convert expanded to compact', () => {
        const expanded: ThingExpanded = {
          $id: 'xyz789',
          $type: 'Person',
          name: 'Jane',
          age: 25,
          $createdAt: 1000,
          $updatedAt: 2000,
        }

        const compact = things.toCompact(expanded)

        expect(compact.id).toBe('xyz789')
        expect(compact.type).toBe('Person')
        expect(compact.data).toEqual({ name: 'Jane', age: 25 })
        expect(compact.createdAt).toBe(1000)
        expect(compact.updatedAt).toBe(2000)
      })

      it('should convert expanded with $content/$code', () => {
        const expanded: ThingExpanded = {
          $id: 'doc2',
          $type: 'Document',
          $content: '## Heading',
          $code: 'let y = 2',
          title: 'Another Doc',
        }

        const compact = things.toCompact(expanded)

        expect(compact.content).toBe('## Heading')
        expect(compact.code).toBe('let y = 2')
        expect(compact.data).toEqual({ title: 'Another Doc' })
      })

      it('should convert expanded with $ref', () => {
        const expanded: ThingExpanded = {
          $id: 'org1',
          $type: 'Organization',
          $ref: 'https://org.example.com',
          name: 'Example Org',
        }

        const compact = things.toCompact(expanded)

        expect(compact.ref).toBe('https://org.example.com')
      })

      it('should return compact unchanged', () => {
        const compact: ThingCompact = {
          id: 'already-compact',
          type: 'Test',
          data: { value: 42 },
        }

        const result = things.toCompact(compact)

        expect(result).toEqual(compact)
      }
      )

      it('should handle empty data', () => {
        const expanded: ThingExpanded = {
          $id: 'empty',
          $type: 'Empty',
        }

        const compact = things.toCompact(expanded)

        expect(compact.data).toEqual({})
      })
    })

    describe('Round-trip conversion', () => {
      it('should preserve data through expanded -> compact -> expanded', () => {
        const original: ThingExpanded = {
          $id: 'roundtrip1',
          $type: 'Test',
          $content: 'MDX content',
          $code: 'code here',
          $ref: 'https://example.com',
          $version: 1,
          $createdAt: 1000,
          $updatedAt: 2000,
          field1: 'value1',
          field2: 123,
          nested: { a: 1, b: 2 },
        }

        const compact = things.toCompact(original)
        const restored = things.toExpanded(compact)

        expect(restored.$id).toBe(original.$id)
        expect(restored.$type).toBe(original.$type)
        expect(restored.$content).toBe(original.$content)
        expect(restored.$code).toBe(original.$code)
        expect(restored.$ref).toBe(original.$ref)
        expect(restored.$createdAt).toBe(original.$createdAt)
        expect(restored.$updatedAt).toBe(original.$updatedAt)
        expect(restored.field1).toBe(original.field1)
        expect(restored.field2).toBe(original.field2)
        expect(restored.nested).toEqual(original.nested)
      })

      it('should preserve data through compact -> expanded -> compact', () => {
        const original: ThingCompact<{ field1: string; field2: number }> = {
          id: 'roundtrip2',
          type: 'Test',
          data: { field1: 'value1', field2: 456 },
          content: 'Content here',
          code: 'More code',
          ref: 'https://ref.example.com',
          version: 2,
          createdAt: 3000,
          updatedAt: 4000,
        }

        const expanded = things.toExpanded(original)
        const restored = things.toCompact(expanded)

        expect(restored.id).toBe(original.id)
        expect(restored.type).toBe(original.type)
        expect(restored.data).toEqual(original.data)
        expect(restored.content).toBe(original.content)
        expect(restored.code).toBe(original.code)
        expect(restored.ref).toBe(original.ref)
        expect(restored.createdAt).toBe(original.createdAt)
        expect(restored.updatedAt).toBe(original.updatedAt)
      })
    })
  })

  // ===========================================================================
  // $ref RESOLUTION
  // ===========================================================================

  describe('$ref Resolution', () => {
    it('should get thing by ref', async () => {
      const thing = await things.createExpanded({
        $type: 'Startup',
        $ref: 'https://headless.ly',
        name: 'Headless',
      })

      const found = await things.getByRef('https://headless.ly')

      expect(found).not.toBeNull()
      const foundId = found ? ((found as ThingExpanded).$id || (found as ThingCompact).id) : null
      expect(foundId).toBe(thing.$id)
    })

    it('should return null for non-existent ref', async () => {
      const found = await things.getByRef('https://nonexistent.example.com')
      expect(found).toBeNull()
    })

    it('should find things with refs', async () => {
      await things.createExpanded({
        $type: 'Startup',
        $ref: 'https://startup1.com',
        name: 'Startup 1',
      })
      await things.createExpanded({
        $type: 'Startup',
        $ref: 'https://startup2.com',
        name: 'Startup 2',
      })
      await things.createExpanded({
        $type: 'Regular',
        name: 'No Ref',
      })

      const withRefs = await things.findWithRefs()

      expect(withRefs.length).toBe(2)
    })

    it('should set ref on existing thing', async () => {
      const thing = await things.createExpanded({
        $type: 'Linkable',
        name: 'Linkable Entity',
      })

      const updated = await things.setRef(thing.$id, 'https://new-ref.example.com')

      expect((updated as ThingExpanded).$ref || (updated as ThingCompact).ref).toBe('https://new-ref.example.com')
    })

    it('should remove ref from thing', async () => {
      const thing = await things.createExpanded({
        $type: 'Unlinkable',
        $ref: 'https://to-remove.example.com',
        name: 'Will Unlink',
      })

      const updated = await things.removeRef(thing.$id)

      expect((updated as ThingExpanded).$ref).toBeUndefined()
    })
  })

  // ===========================================================================
  // $version TRACKING
  // ===========================================================================

  describe('$version Tracking', () => {
    it('should start with version 1', async () => {
      const thing = await things.createExpanded({
        $type: 'Versioned',
        name: 'First Version',
      })

      expect(thing.$version).toBe(1)
    })

    it('should increment version on update', async () => {
      const thing = await things.createExpanded({
        $type: 'Versioned',
        name: 'Version 1',
      })

      const updated = await things.update(thing.$id, { name: 'Version 2' })

      expect((updated as ThingExpanded).$version).toBe(2)
    })

    it('should increment version on each update', async () => {
      const thing = await things.createExpanded({
        $type: 'MultiVersion',
        value: 0,
      })

      let current = thing
      for (let i = 1; i <= 5; i++) {
        current = await things.update(current.$id, { value: i }) as ThingExpanded
        expect(current.$version).toBe(i + 1)
      }
    })

    it('should track version in compact format', async () => {
      const thing = await things.createCompact({
        type: 'VersionedCompact',
        data: { name: 'V1' },
      })

      expect(thing.version).toBe(1)
    })

    it('should preserve version through format conversion', () => {
      const expanded: ThingExpanded = {
        $id: 'versioned',
        $type: 'Test',
        $version: 5,
        data: 'test',
      }

      const compact = things.toCompact(expanded)
      expect(compact.version).toBe(5)

      const backToExpanded = things.toExpanded(compact)
      expect(backToExpanded.$version).toBe(5)
    })
  })

  // ===========================================================================
  // QUERYING THINGS BY TYPE
  // ===========================================================================

  describe('Querying Things by Type', () => {
    beforeEach(async () => {
      await things.createExpanded({ $type: 'Person', name: 'Alice', age: 25 })
      await things.createExpanded({ $type: 'Person', name: 'Bob', age: 30 })
      await things.createExpanded({ $type: 'Organization', name: 'Acme', size: 100 })
      await things.createExpanded({ $type: 'Organization', name: 'Widget Co', size: 50 })
      await things.createExpanded({ $type: 'Product', name: 'Gadget', price: 99 })
    })

    it('should find by $type', async () => {
      const people = await things.findByType('Person')

      expect(people.length).toBe(2)
      expect(people.every(p => (p as ThingExpanded).$type === 'Person' || (p as ThingCompact).type === 'Person')).toBe(true)
    })

    it('should return empty for non-existent type', async () => {
      const none = await things.findByType('NonExistent')

      expect(none).toEqual([])
    })

    it('should get all unique types', async () => {
      const types = await things.getTypes()

      expect(types).toContain('Person')
      expect(types).toContain('Organization')
      expect(types).toContain('Product')
      expect(types.length).toBe(3)
    })

    it('should count by type', async () => {
      const counts = await things.countByType()

      expect(counts['Person']).toBe(2)
      expect(counts['Organization']).toBe(2)
      expect(counts['Product']).toBe(1)
    })
  })

  // ===========================================================================
  // VALIDATION
  // ===========================================================================

  describe('Validation', () => {
    it('should validate thing against noun schema', async () => {
      const result = await things.validate('Customer', {
        name: 'Acme',
        email: 'valid@acme.com',
      })

      expect(result.valid).toBeDefined()
    })

    it('should reject empty $type', async () => {
      await expect(
        things.createExpanded({
          $type: '',
          name: 'No Type',
        })
      ).rejects.toThrow()
    })

    it('should reject empty type in compact', async () => {
      await expect(
        things.createCompact({
          type: '',
          data: { name: 'No Type' },
        })
      ).rejects.toThrow()
    })
  })

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle thing with only $id and $type', async () => {
      const minimal = await things.createExpanded({
        $type: 'Minimal',
      })

      expect(minimal.$id).toBeDefined()
      expect(minimal.$type).toBe('Minimal')
    })

    it('should handle deeply nested data', async () => {
      const nested = await things.createExpanded({
        $type: 'Nested',
        level1: {
          level2: {
            level3: {
              value: 'deep',
            },
          },
        },
      })

      const retrieved = await things.get(nested.$id)
      const level1 = (retrieved as ThingExpanded)?.level1 as { level2: { level3: { value: string } } } | undefined
      expect(level1?.level2?.level3?.value).toBe('deep')
    })

    it('should handle array data', async () => {
      const withArrays = await things.createExpanded({
        $type: 'Arrays',
        tags: ['a', 'b', 'c'],
        items: [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' },
        ],
      })

      const retrieved = await things.get(withArrays.$id)
      expect((retrieved as ThingExpanded)?.tags).toEqual(['a', 'b', 'c'])
      const items = (retrieved as ThingExpanded)?.items as unknown[] | undefined
      expect(items?.length).toBe(2)
    })

    it('should handle null values', async () => {
      const withNulls = await things.createExpanded({
        $type: 'Nulls',
        nullValue: null,
        definedValue: 'exists',
      })

      const retrieved = await things.get(withNulls.$id)
      expect((retrieved as ThingExpanded)?.nullValue).toBeNull()
      expect((retrieved as ThingExpanded)?.definedValue).toBe('exists')
    })

    it('should handle $type with dots', async () => {
      const special = await things.createExpanded({
        $type: 'My.Custom.Type',
        name: 'Special Type',
      })

      expect(special.$type).toBe('My.Custom.Type')
    })

    it('should auto-detect format on create', async () => {
      // Expanded format (has $type)
      const expanded = await things.create({ $type: 'Auto', name: 'Expanded' } as unknown as Omit<Thing, 'id' | '$id'>)
      expect((expanded as ThingExpanded).$id).toBeDefined()

      // Compact format (has type and data)
      const compact = await things.create({ type: 'Auto', data: { name: 'Compact' } } as unknown as Omit<Thing, 'id' | '$id'>)
      expect((compact as ThingCompact).id).toBeDefined()
    })
  })
})
