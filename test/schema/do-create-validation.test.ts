/**
 * @dotdo/do - DO.create() Schema Validation Tests
 *
 * Tests for schema validation integration in DO.create().
 */

import { describe, it, expect } from 'vitest'
import { $ } from '../../src/schema/$'
import { SchemaType } from '../../src/schema/types'
import { SchemaRegistry } from '../../src/schema/registry'

describe('Schema Registry', () => {
  describe('registration', () => {
    it('registers a schema for a collection', () => {
      const registry = new SchemaRegistry()
      const userSchema = $.schema({
        name: $.string(),
        email: $.string(),
      })

      registry.register('users', userSchema)
      expect(registry.get('users')).toBe(userSchema)
    })

    it('returns undefined for unregistered collection', () => {
      const registry = new SchemaRegistry()
      expect(registry.get('unknown')).toBeUndefined()
    })

    it('lists all registered collections', () => {
      const registry = new SchemaRegistry()
      registry.register('users', $.schema({ name: $.string() }))
      registry.register('posts', $.schema({ title: $.string() }))

      expect(registry.listCollections()).toEqual(['users', 'posts'])
    })

    it('overwrites existing registration', () => {
      const registry = new SchemaRegistry()
      const schema1 = $.schema({ name: $.string() })
      const schema2 = $.schema({ title: $.string() })

      registry.register('data', schema1)
      registry.register('data', schema2)

      expect(registry.get('data')).toBe(schema2)
    })
  })

  describe('validation', () => {
    it('validates data against registered schema', () => {
      const registry = new SchemaRegistry()
      const userSchema = $.schema({
        name: $.string(),
        age: $.number(),
      })
      registry.register('users', userSchema)

      const result = registry.validate('users', { name: 'John', age: 30 })
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ name: 'John', age: 30 })
    })

    it('fails validation for invalid data', () => {
      const registry = new SchemaRegistry()
      const userSchema = $.schema({
        name: $.string(),
        age: $.number(),
      })
      registry.register('users', userSchema)

      const result = registry.validate('users', { name: 'John', age: 'not a number' })
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
    })

    it('skips validation for unregistered collections', () => {
      const registry = new SchemaRegistry()
      const result = registry.validate('unknown', { anything: 'goes' })
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ anything: 'goes' })
    })
  })

  describe('schema introspection', () => {
    it('exports JSON schema for registered collection', () => {
      const registry = new SchemaRegistry()
      const userSchema = $.schema({
        name: $.string(),
        email: $.string(),
      })
      registry.register('users', userSchema)

      const jsonSchema = registry.toJSONSchema('users')
      expect(jsonSchema).toBeDefined()
      expect(jsonSchema?.type).toBe('object')
      expect(jsonSchema?.properties?.name).toEqual({ type: 'string' })
    })

    it('exports all schemas as JSON schemas', () => {
      const registry = new SchemaRegistry()
      registry.register('users', $.schema({ name: $.string() }))
      registry.register('posts', $.schema({ title: $.string() }))

      const allSchemas = registry.toJSONSchemas()
      expect(allSchemas.users).toBeDefined()
      expect(allSchemas.posts).toBeDefined()
    })
  })
})

describe('DO Schema Validation (conceptual)', () => {
  // These tests describe the expected behavior but don't test the actual DO class
  // since DO requires a Cloudflare Workers runtime

  it('validates data before insertion', () => {
    // This test validates the concept - DO.create() should:
    // 1. Check if a schema is registered for the collection
    // 2. If yes, validate the document against the schema
    // 3. If validation fails, throw an error with details
    // 4. If validation passes, proceed with insertion

    const registry = new SchemaRegistry()
    registry.register(
      'users',
      $.schema({
        name: $.string(),
        email: $.string(),
      })
    )

    // Valid data should pass
    const validResult = registry.validate('users', { name: 'John', email: 'john@example.com' })
    expect(validResult.success).toBe(true)

    // Invalid data should fail
    const invalidResult = registry.validate('users', { name: 123, email: 'john@example.com' })
    expect(invalidResult.success).toBe(false)
  })

  it('supports validation with operator references', () => {
    const registry = new SchemaRegistry()

    // Register related schemas
    registry.register(
      'users',
      $.schema({
        name: $.string(),
        manager: $.ref('->User'),
        department: $.ref('->Department'),
      })
    )

    registry.register(
      'departments',
      $.schema({
        name: $.string(),
      })
    )

    // Valid data with references
    const validResult = registry.validate('users', {
      name: 'John',
      manager: { $ref: 'https://example.com/users/123' },
      department: { $ref: 'https://example.com/departments/eng' },
    })
    expect(validResult.success).toBe(true)

    // Invalid reference
    const invalidResult = registry.validate('users', {
      name: 'John',
      manager: { invalid: 'not a reference' },
      department: { $ref: 'https://example.com/departments/eng' },
    })
    expect(invalidResult.success).toBe(false)
  })
})
