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
 * @dotdo/do - DO.create() with Schema Validation Tests (RED Phase)
 *
 * These tests define the expected behavior of DO.create() with schema validation.
 * They should FAIL initially (RED), then pass after implementation (GREEN).
 *
 * Features tested:
 * - DO.create('User', { name: 'Alice' }) creates a Thing
 * - DO.create validates against registered schema
 * - Returns validation errors for invalid data
 * - Supports nested object validation
 * - Generates IDs for created Things
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { DO } from '../../src/do'
import { $ } from '../../src/schema/$'
import type { Thing } from '../../src/types'

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
      } else if (normalizedQuery.startsWith('INSERT')) {
        if (query.includes('things')) {
          const [ns, type, id, url, data] = params as [string, string, string, string, string]
          const tableName = 'things'
          if (!tables.has(tableName)) {
            tables.set(tableName, new Map())
          }
          const table = tables.get(tableName)!
          table.set(url, {
            ns,
            type,
            id,
            url,
            data,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
        }
      } else if (normalizedQuery.startsWith('SELECT')) {
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
            }
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

describe('DO.create() with Schema Validation (RED Phase)', () => {
  let doInstance: DO

  beforeEach(() => {
    doInstance = new DO(createMockCtx() as any, mockEnv)
  })

  // ===========================================================================
  // Basic DO.create() with Type Name
  // ===========================================================================

  describe('DO.create(typeName, data)', () => {
    it('should create a Thing with type name and data', async () => {
      // DO.create('User', { name: 'Alice' }) should create a Thing
      const thing = await (doInstance as any).create('User', { name: 'Alice' })

      expect(thing).toBeDefined()
      expect(thing.type).toBe('User')
      expect(thing.data.name).toBe('Alice')
    })

    it('should generate an ID for the created Thing', async () => {
      const thing = await (doInstance as any).create('User', { name: 'Bob' })

      expect(thing.id).toBeDefined()
      expect(typeof thing.id).toBe('string')
      expect(thing.id.length).toBeGreaterThan(0)
    })

    it('should generate a URL from type and ID', async () => {
      const thing = await (doInstance as any).create('User', { name: 'Charlie' })

      expect(thing.url).toBeDefined()
      expect(thing.url).toContain('User')
      expect(thing.url).toContain(thing.id)
    })

    it('should set createdAt and updatedAt timestamps', async () => {
      const before = new Date()
      const thing = await (doInstance as any).create('User', { name: 'Diana' })
      const after = new Date()

      expect(thing.createdAt).toBeInstanceOf(Date)
      expect(thing.updatedAt).toBeInstanceOf(Date)
      expect(thing.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(thing.createdAt.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    it('should use provided ID if specified in data', async () => {
      const thing = await (doInstance as any).create('User', {
        id: 'custom-id-123',
        name: 'Eve',
      })

      expect(thing.id).toBe('custom-id-123')
    })

    it('should default namespace to current DO namespace', async () => {
      const thing = await (doInstance as any).create('User', { name: 'Frank' })

      expect(thing.ns).toBeDefined()
      expect(typeof thing.ns).toBe('string')
    })
  })

  // ===========================================================================
  // Schema Registration and Validation
  // ===========================================================================

  describe('Schema Registration', () => {
    it('should allow registering a schema for a type', () => {
      const userSchema = $.schema({
        name: $.string(),
        email: $.string(),
      })

      // Register schema for 'User' type
      ;(doInstance as any).registerSchema('User', userSchema)

      // Should have the schema registered
      expect((doInstance as any).getSchema('User')).toBeDefined()
    })

    it('should support $.schema() fluent builder for registration', () => {
      const schema = $.schema({
        title: $.string(),
        content: $.string(),
      })

      ;(doInstance as any).registerSchema('Post', schema)

      expect((doInstance as any).getSchema('Post')).toBe(schema)
    })
  })

  describe('Schema Validation on Create', () => {
    it('should validate data against registered schema', async () => {
      const userSchema = $.schema({
        name: $.string(),
        email: $.string(),
      })

      ;(doInstance as any).registerSchema('User', userSchema)

      // Valid data should succeed
      const thing = await (doInstance as any).create('User', {
        name: 'Grace',
        email: 'grace@example.com',
      })

      expect(thing).toBeDefined()
      expect(thing.data.name).toBe('Grace')
      expect(thing.data.email).toBe('grace@example.com')
    })

    it('should return validation errors for invalid data', async () => {
      const userSchema = $.schema({
        name: $.string(),
        email: $.string(),
      })

      ;(doInstance as any).registerSchema('User', userSchema)

      // Invalid data should return validation errors
      const result = await (doInstance as any).create('User', {
        name: 123, // Should be string
        email: 'test@example.com',
      })

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0].path).toContain('name')
    })

    it('should return validation errors for missing required fields', async () => {
      const userSchema = $.schema({
        name: $.string(),
        email: $.string(),
      })

      ;(doInstance as any).registerSchema('User', userSchema)

      // Missing required field
      const result = await (doInstance as any).create('User', {
        name: 'Henry',
        // email is missing
      })

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors.some((e: any) => e.path.includes('email'))).toBe(true)
    })

    it('should skip validation if no schema is registered for type', async () => {
      // No schema registered for 'Product'
      const thing = await (doInstance as any).create('Product', {
        name: 'Widget',
        price: 99.99,
        inStock: true,
      })

      // Should create successfully without validation
      expect(thing).toBeDefined()
      expect(thing.type).toBe('Product')
      expect(thing.data.name).toBe('Widget')
    })

    it('should collect multiple validation errors', async () => {
      const userSchema = $.schema({
        name: $.string(),
        email: $.string(),
        age: $.number(),
      })

      ;(doInstance as any).registerSchema('User', userSchema)

      // Multiple invalid fields
      const result = await (doInstance as any).create('User', {
        name: 123, // Should be string
        email: true, // Should be string
        age: 'twenty', // Should be number
      })

      expect(result.success).toBe(false)
      expect(result.errors.length).toBe(3)
    })
  })

  // ===========================================================================
  // Nested Object Validation
  // ===========================================================================

  describe('Nested Object Validation', () => {
    it('should validate nested objects', async () => {
      const userSchema = $.schema({
        name: $.string(),
        address: $.object({
          street: $.string(),
          city: $.string(),
          zip: $.string(),
        }),
      })

      ;(doInstance as any).registerSchema('User', userSchema)

      // Valid nested data
      const thing = await (doInstance as any).create('User', {
        name: 'Ivy',
        address: {
          street: '123 Main St',
          city: 'Springfield',
          zip: '12345',
        },
      })

      expect(thing).toBeDefined()
      expect(thing.data.address.city).toBe('Springfield')
    })

    it('should return errors for invalid nested object fields', async () => {
      const userSchema = $.schema({
        name: $.string(),
        address: $.object({
          street: $.string(),
          city: $.string(),
          zip: $.string(),
        }),
      })

      ;(doInstance as any).registerSchema('User', userSchema)

      // Invalid nested field
      const result = await (doInstance as any).create('User', {
        name: 'Jack',
        address: {
          street: '456 Oak Ave',
          city: 12345, // Should be string
          zip: '67890',
        },
      })

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors[0].path).toEqual(['address', 'city'])
    })

    it('should validate deeply nested objects', async () => {
      const orgSchema = $.schema({
        name: $.string(),
        headquarters: $.object({
          building: $.object({
            name: $.string(),
            floor: $.number(),
          }),
        }),
      })

      ;(doInstance as any).registerSchema('Organization', orgSchema)

      // Invalid deeply nested field
      const result = await (doInstance as any).create('Organization', {
        name: 'Acme Corp',
        headquarters: {
          building: {
            name: 'Tower A',
            floor: 'fifth', // Should be number
          },
        },
      })

      expect(result.success).toBe(false)
      expect(result.errors[0].path).toEqual(['headquarters', 'building', 'floor'])
    })

    it('should handle missing nested objects', async () => {
      const userSchema = $.schema({
        name: $.string(),
        profile: $.object({
          bio: $.string(),
        }),
      })

      ;(doInstance as any).registerSchema('User', userSchema)

      // Missing nested object
      const result = await (doInstance as any).create('User', {
        name: 'Kate',
        // profile is missing
      })

      expect(result.success).toBe(false)
      expect(result.errors.some((e: any) => e.path.includes('profile'))).toBe(true)
    })
  })

  // ===========================================================================
  // ID Generation
  // ===========================================================================

  describe('ID Generation', () => {
    it('should generate unique IDs for each created Thing', async () => {
      const thing1 = await (doInstance as any).create('User', { name: 'Leo' })
      const thing2 = await (doInstance as any).create('User', { name: 'Mia' })

      expect(thing1.id).not.toBe(thing2.id)
    })

    it('should generate valid UUID format IDs', async () => {
      const thing = await (doInstance as any).create('User', { name: 'Noah' })

      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      expect(thing.id).toMatch(uuidRegex)
    })

    it('should not overwrite provided IDs', async () => {
      const thing = await (doInstance as any).create('User', {
        id: 'my-custom-id',
        name: 'Olivia',
      })

      expect(thing.id).toBe('my-custom-id')
    })

    it('should support custom ID generators', async () => {
      // Register a custom ID generator
      ;(doInstance as any).setIdGenerator((type: string) => `${type.toLowerCase()}-${Date.now()}`)

      const thing = await (doInstance as any).create('User', { name: 'Paul' })

      expect(thing.id).toMatch(/^user-\d+$/)
    })
  })

  // ===========================================================================
  // Return Value Structure
  // ===========================================================================

  describe('Return Value Structure', () => {
    it('should return Thing on successful creation', async () => {
      const thing = await (doInstance as any).create('User', { name: 'Quinn' })

      // Should have all Thing properties
      expect(thing).toHaveProperty('ns')
      expect(thing).toHaveProperty('type')
      expect(thing).toHaveProperty('id')
      expect(thing).toHaveProperty('url')
      expect(thing).toHaveProperty('data')
      expect(thing).toHaveProperty('createdAt')
      expect(thing).toHaveProperty('updatedAt')
    })

    it('should return validation result object on failure', async () => {
      const userSchema = $.schema({
        name: $.string(),
      })

      ;(doInstance as any).registerSchema('User', userSchema)

      const result = await (doInstance as any).create('User', { name: 123 })

      expect(result).toHaveProperty('success', false)
      expect(result).toHaveProperty('errors')
      expect(Array.isArray(result.errors)).toBe(true)
    })

    it('should include validated and transformed data in successful creation', async () => {
      const userSchema = $.schema({
        name: $.string(),
        email: $.string(),
      })

      ;(doInstance as any).registerSchema('User', userSchema)

      const thing = await (doInstance as any).create('User', {
        name: 'Rose',
        email: 'rose@example.com',
        extraField: 'ignored', // Should be stripped by schema validation
      })

      expect(thing.data.name).toBe('Rose')
      expect(thing.data.email).toBe('rose@example.com')
      expect(thing.data.extraField).toBeUndefined()
    })
  })

  // ===========================================================================
  // Schema Types Support
  // ===========================================================================

  describe('Schema Types Support', () => {
    it('should validate $.string() fields', async () => {
      const schema = $.schema({ name: $.string() })
      ;(doInstance as any).registerSchema('Test', schema)

      const result = await (doInstance as any).create('Test', { name: 42 })
      expect(result.success).toBe(false)
    })

    it('should validate $.number() fields', async () => {
      const schema = $.schema({ age: $.number() })
      ;(doInstance as any).registerSchema('Test', schema)

      const result = await (doInstance as any).create('Test', { age: 'twenty' })
      expect(result.success).toBe(false)
    })

    it('should validate $.boolean() fields', async () => {
      const schema = $.schema({ active: $.boolean() })
      ;(doInstance as any).registerSchema('Test', schema)

      const result = await (doInstance as any).create('Test', { active: 'yes' })
      expect(result.success).toBe(false)
    })

    it('should validate $.array() fields', async () => {
      const schema = $.schema({ tags: $.array($.string()) })
      ;(doInstance as any).registerSchema('Test', schema)

      const result = await (doInstance as any).create('Test', { tags: 'not-an-array' })
      expect(result.success).toBe(false)
    })

    it('should validate $.object() fields', async () => {
      const schema = $.schema({
        config: $.object({ enabled: $.boolean() }),
      })
      ;(doInstance as any).registerSchema('Test', schema)

      const result = await (doInstance as any).create('Test', { config: 'not-an-object' })
      expect(result.success).toBe(false)
    })
  })

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle empty data object', async () => {
      const schema = $.schema({})
      ;(doInstance as any).registerSchema('Empty', schema)

      const thing = await (doInstance as any).create('Empty', {})
      expect(thing).toBeDefined()
      expect(thing.type).toBe('Empty')
    })

    it('should handle null values in optional fields', async () => {
      const schema = $.schema({
        name: $.string(),
        nickname: $.string().optional(),
      })
      ;(doInstance as any).registerSchema('User', schema)

      const thing = await (doInstance as any).create('User', {
        name: 'Sam',
        nickname: null,
      })

      // Behavior depends on how optional handles null - this tests the behavior
      expect(thing).toBeDefined()
    })

    it('should handle special characters in type names', async () => {
      const thing = await (doInstance as any).create('My-Special_Type', { value: 'test' })
      expect(thing.type).toBe('My-Special_Type')
    })

    it('should handle very large data objects', async () => {
      const largeData: Record<string, string> = {}
      for (let i = 0; i < 100; i++) {
        largeData[`field${i}`] = `value${i}`
      }

      const thing = await (doInstance as any).create('LargeObject', largeData)
      expect(thing).toBeDefined()
      expect(thing.data.field50).toBe('value50')
    })
  })
})
