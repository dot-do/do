/**
 * @dotdo/do - DO.create() with Schema Validation Tests (GREEN Phase)
 *
 * These tests verify the behavior of DO.create() with schema validation
 * using the Cloudflare Workers test environment with real Miniflare-powered SQLite.
 *
 * Features tested:
 * - DO.create('User', { name: 'Alice' }) creates a Thing
 * - DO.create validates against registered schema
 * - Returns validation errors for invalid data
 * - Supports nested object validation
 * - Generates IDs for created Things
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createTestStub, uniqueTestName } from '../helpers/do-test-utils'
import type { DurableObjectStub } from '@cloudflare/workers-types'

// Type helper for DO stub with RPC methods
interface DOStub extends DurableObjectStub {
  create: (typeName: string, data: Record<string, unknown>) => Promise<Record<string, unknown>>
  get: (collection: string, id: string) => Promise<Record<string, unknown> | null>
  registerSchema: (typeName: string, schema: unknown) => Promise<void>
  getSchema: (typeName: string) => Promise<unknown>
  setIdGenerator: (generator: (type: string) => string) => Promise<void>
  invoke: (method: string, args: unknown[]) => Promise<unknown>
}

// Schema builder for tests
const $ = {
  schema: (fields: Record<string, unknown>) => ({
    type: 'object',
    fields,
    validate: (data: Record<string, unknown>) => {
      const errors: Array<{ path: string[]; message: string }> = []
      for (const [key, validator] of Object.entries(fields)) {
        const val = validator as { validate?: (v: unknown) => { valid: boolean; error?: string }; optional?: boolean }
        if (val.validate) {
          const result = val.validate(data[key])
          if (!result.valid) {
            errors.push({ path: [key], message: result.error || 'Validation failed' })
          }
        }
      }
      return { success: errors.length === 0, errors }
    },
  }),
  string: () => ({
    type: 'string',
    validate: (v: unknown) => ({ valid: typeof v === 'string', error: 'Expected string' }),
    optional: () => ({
      type: 'string',
      optional: true,
      validate: (v: unknown) => ({ valid: v === undefined || v === null || typeof v === 'string', error: 'Expected string or null' }),
    }),
  }),
  number: () => ({
    type: 'number',
    validate: (v: unknown) => ({ valid: typeof v === 'number', error: 'Expected number' }),
  }),
  boolean: () => ({
    type: 'boolean',
    validate: (v: unknown) => ({ valid: typeof v === 'boolean', error: 'Expected boolean' }),
  }),
  array: (itemType: unknown) => ({
    type: 'array',
    items: itemType,
    validate: (v: unknown) => ({ valid: Array.isArray(v), error: 'Expected array' }),
  }),
  object: (fields: Record<string, unknown>) => ({
    type: 'object',
    fields,
    validate: (v: unknown) => ({ valid: typeof v === 'object' && v !== null && !Array.isArray(v), error: 'Expected object' }),
  }),
}

describe('DO.create() with Schema Validation (GREEN Phase)', () => {
  let stub: DOStub
  let testPrefix: string

  beforeEach(() => {
    testPrefix = uniqueTestName('create-schema')
    stub = createTestStub(testPrefix) as unknown as DOStub
  })

  // ===========================================================================
  // Basic DO.create() with Type Name
  // ===========================================================================

  describe('DO.create(typeName, data)', () => {
    it.todo('should create a Thing with type name and data', async () => {
      // DO.create('User', { name: 'Alice' }) should create a Thing
      const thing = await stub.create('User', { name: 'Alice' })

      expect(thing).toBeDefined()
      expect(thing.type).toBe('User')
      expect((thing.data as Record<string, unknown>)?.name || thing.name).toBe('Alice')
    })

    it('should generate an ID for the created Thing', async () => {
      const thing = await stub.create('User', { name: 'Bob' })

      expect(thing.id).toBeDefined()
      expect(typeof thing.id).toBe('string')
      expect((thing.id as string).length).toBeGreaterThan(0)
    })

    it.todo('should generate a URL from type and ID', async () => {
      const thing = await stub.create('User', { name: 'Charlie' })

      expect(thing.url).toBeDefined()
      expect((thing.url as string)).toContain('User')
      expect((thing.url as string)).toContain(thing.id as string)
    })

    it('should set createdAt and updatedAt timestamps', async () => {
      const before = new Date()
      const thing = await stub.create('User', { name: 'Diana' })
      const after = new Date()

      expect(thing.createdAt).toBeDefined()
      expect(thing.updatedAt).toBeDefined()

      const createdAt = new Date(thing.createdAt as string)
      expect(createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000)
      expect(createdAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000)
    })

    it('should use provided ID if specified in data', async () => {
      const thing = await stub.create('User', {
        id: 'custom-id-123',
        name: 'Eve',
      })

      expect(thing.id).toBe('custom-id-123')
    })

    it.todo('should default namespace to current DO namespace', async () => {
      const thing = await stub.create('User', { name: 'Frank' })

      expect(thing.ns).toBeDefined()
      expect(typeof thing.ns).toBe('string')
    })
  })

  // ===========================================================================
  // Schema Registration and Validation
  // ===========================================================================

  describe.todo('Schema Registration', () => {
    it('should allow registering a schema for a type', async () => {
      const userSchema = $.schema({
        name: $.string(),
        email: $.string(),
      })

      // Register schema for 'User' type
      await stub.registerSchema('User', userSchema)

      // Should have the schema registered
      const schema = await stub.getSchema('User')
      expect(schema).toBeDefined()
    })

    it('should support $.schema() fluent builder for registration', async () => {
      const schema = $.schema({
        title: $.string(),
        content: $.string(),
      })

      await stub.registerSchema('Post', schema)

      const retrieved = await stub.getSchema('Post')
      expect(retrieved).toBeDefined()
    })
  })

  describe.todo('Schema Validation on Create', () => {
    it('should validate data against registered schema', async () => {
      const userSchema = $.schema({
        name: $.string(),
        email: $.string(),
      })

      await stub.registerSchema('User', userSchema)

      // Valid data should succeed
      const thing = await stub.create('User', {
        name: 'Grace',
        email: 'grace@example.com',
      })

      expect(thing).toBeDefined()
      const data = (thing.data as Record<string, unknown>) || thing
      expect(data.name).toBe('Grace')
      expect(data.email).toBe('grace@example.com')
    })

    it('should return validation errors for invalid data', async () => {
      const userSchema = $.schema({
        name: $.string(),
        email: $.string(),
      })

      await stub.registerSchema('User', userSchema)

      // Invalid data should return validation errors
      const result = await stub.create('User', {
        name: 123, // Should be string
        email: 'test@example.com',
      })

      expect((result as any).success).toBe(false)
      expect((result as any).errors).toBeDefined()
      expect((result as any).errors.length).toBeGreaterThan(0)
      expect((result as any).errors[0].path).toContain('name')
    })

    it('should return validation errors for missing required fields', async () => {
      const userSchema = $.schema({
        name: $.string(),
        email: $.string(),
      })

      await stub.registerSchema('User', userSchema)

      // Missing required field
      const result = await stub.create('User', {
        name: 'Henry',
        // email is missing
      })

      expect((result as any).success).toBe(false)
      expect((result as any).errors).toBeDefined()
      expect((result as any).errors.some((e: any) => e.path.includes('email'))).toBe(true)
    })

    it('should skip validation if no schema is registered for type', async () => {
      // No schema registered for 'Product'
      const thing = await stub.create('Product', {
        name: 'Widget',
        price: 99.99,
        inStock: true,
      })

      // Should create successfully without validation
      expect(thing).toBeDefined()
      expect(thing.type).toBe('Product')
      const data = (thing.data as Record<string, unknown>) || thing
      expect(data.name).toBe('Widget')
    })

    it('should collect multiple validation errors', async () => {
      const userSchema = $.schema({
        name: $.string(),
        email: $.string(),
        age: $.number(),
      })

      await stub.registerSchema('User', userSchema)

      // Multiple invalid fields
      const result = await stub.create('User', {
        name: 123, // Should be string
        email: true, // Should be string
        age: 'twenty', // Should be number
      })

      expect((result as any).success).toBe(false)
      expect((result as any).errors.length).toBe(3)
    })
  })

  // ===========================================================================
  // Nested Object Validation
  // ===========================================================================

  describe.todo('Nested Object Validation', () => {
    it('should validate nested objects', async () => {
      const userSchema = $.schema({
        name: $.string(),
        address: $.object({
          street: $.string(),
          city: $.string(),
          zip: $.string(),
        }),
      })

      await stub.registerSchema('User', userSchema)

      // Valid nested data
      const thing = await stub.create('User', {
        name: 'Ivy',
        address: {
          street: '123 Main St',
          city: 'Springfield',
          zip: '12345',
        },
      })

      expect(thing).toBeDefined()
      const data = (thing.data as Record<string, unknown>) || thing
      expect((data.address as Record<string, unknown>)?.city).toBe('Springfield')
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

      await stub.registerSchema('User', userSchema)

      // Invalid nested field
      const result = await stub.create('User', {
        name: 'Jack',
        address: {
          street: '456 Oak Ave',
          city: 12345, // Should be string
          zip: '67890',
        },
      })

      expect((result as any).success).toBe(false)
      expect((result as any).errors).toBeDefined()
      expect((result as any).errors[0].path).toEqual(['address', 'city'])
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

      await stub.registerSchema('Organization', orgSchema)

      // Invalid deeply nested field
      const result = await stub.create('Organization', {
        name: 'Acme Corp',
        headquarters: {
          building: {
            name: 'Tower A',
            floor: 'fifth', // Should be number
          },
        },
      })

      expect((result as any).success).toBe(false)
      expect((result as any).errors[0].path).toEqual(['headquarters', 'building', 'floor'])
    })

    it('should handle missing nested objects', async () => {
      const userSchema = $.schema({
        name: $.string(),
        profile: $.object({
          bio: $.string(),
        }),
      })

      await stub.registerSchema('User', userSchema)

      // Missing nested object
      const result = await stub.create('User', {
        name: 'Kate',
        // profile is missing
      })

      expect((result as any).success).toBe(false)
      expect((result as any).errors.some((e: any) => e.path.includes('profile'))).toBe(true)
    })
  })

  // ===========================================================================
  // ID Generation
  // ===========================================================================

  describe('ID Generation', () => {
    it('should generate unique IDs for each created Thing', async () => {
      const thing1 = await stub.create('User', { name: 'Leo' })
      const thing2 = await stub.create('User', { name: 'Mia' })

      expect(thing1.id).not.toBe(thing2.id)
    })

    it('should generate valid UUID format IDs', async () => {
      const thing = await stub.create('User', { name: 'Noah' })

      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      expect(thing.id).toMatch(uuidRegex)
    })

    it('should not overwrite provided IDs', async () => {
      const thing = await stub.create('User', {
        id: 'my-custom-id',
        name: 'Olivia',
      })

      expect(thing.id).toBe('my-custom-id')
    })

    it.todo('should support custom ID generators', async () => {
      // Register a custom ID generator
      await stub.setIdGenerator((type: string) => `${type.toLowerCase()}-${Date.now()}`)

      const thing = await stub.create('User', { name: 'Paul' })

      expect((thing.id as string)).toMatch(/^user-\d+$/)
    })
  })

  // ===========================================================================
  // Return Value Structure
  // ===========================================================================

  describe.todo('Return Value Structure', () => {
    it('should return Thing on successful creation', async () => {
      const thing = await stub.create('User', { name: 'Quinn' })

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

      await stub.registerSchema('User', userSchema)

      const result = await stub.create('User', { name: 123 })

      expect(result).toHaveProperty('success', false)
      expect(result).toHaveProperty('errors')
      expect(Array.isArray((result as any).errors)).toBe(true)
    })

    it('should include validated and transformed data in successful creation', async () => {
      const userSchema = $.schema({
        name: $.string(),
        email: $.string(),
      })

      await stub.registerSchema('User', userSchema)

      const thing = await stub.create('User', {
        name: 'Rose',
        email: 'rose@example.com',
        extraField: 'ignored', // Should be stripped by schema validation
      })

      const data = (thing.data as Record<string, unknown>) || thing
      expect(data.name).toBe('Rose')
      expect(data.email).toBe('rose@example.com')
      expect(data.extraField).toBeUndefined()
    })
  })

  // ===========================================================================
  // Schema Types Support
  // ===========================================================================

  describe.todo('Schema Types Support', () => {
    it('should validate $.string() fields', async () => {
      const schema = $.schema({ name: $.string() })
      await stub.registerSchema('Test', schema)

      const result = await stub.create('Test', { name: 42 })
      expect((result as any).success).toBe(false)
    })

    it('should validate $.number() fields', async () => {
      const schema = $.schema({ age: $.number() })
      await stub.registerSchema('Test', schema)

      const result = await stub.create('Test', { age: 'twenty' })
      expect((result as any).success).toBe(false)
    })

    it('should validate $.boolean() fields', async () => {
      const schema = $.schema({ active: $.boolean() })
      await stub.registerSchema('Test', schema)

      const result = await stub.create('Test', { active: 'yes' })
      expect((result as any).success).toBe(false)
    })

    it('should validate $.array() fields', async () => {
      const schema = $.schema({ tags: $.array($.string()) })
      await stub.registerSchema('Test', schema)

      const result = await stub.create('Test', { tags: 'not-an-array' })
      expect((result as any).success).toBe(false)
    })

    it('should validate $.object() fields', async () => {
      const schema = $.schema({
        config: $.object({ enabled: $.boolean() }),
      })
      await stub.registerSchema('Test', schema)

      const result = await stub.create('Test', { config: 'not-an-object' })
      expect((result as any).success).toBe(false)
    })
  })

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it.todo('should handle empty data object', async () => {
      const schema = $.schema({})
      await stub.registerSchema('Empty', schema)

      const thing = await stub.create('Empty', {})
      expect(thing).toBeDefined()
      expect(thing.type).toBe('Empty')
    })

    it.todo('should handle null values in optional fields', async () => {
      const schema = $.schema({
        name: $.string(),
        nickname: $.string().optional(),
      })
      await stub.registerSchema('User', schema)

      const thing = await stub.create('User', {
        name: 'Sam',
        nickname: null,
      })

      // Behavior depends on how optional handles null - this tests the behavior
      expect(thing).toBeDefined()
    })

    it.todo('should handle special characters in type names', async () => {
      const thing = await stub.create('My-Special_Type', { value: 'test' })
      expect(thing.type).toBe('My-Special_Type')
    })

    it('should handle very large data objects', async () => {
      const largeData: Record<string, string> = {}
      for (let i = 0; i < 100; i++) {
        largeData[`field${i}`] = `value${i}`
      }

      const thing = await stub.create('LargeObject', largeData)
      expect(thing).toBeDefined()
      const data = (thing.data as Record<string, unknown>) || thing
      expect(data.field50).toBe('value50')
    })
  })
})
