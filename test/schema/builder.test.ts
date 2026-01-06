/**
 * @dotdo/do - Schema Builder Tests: $.schema() (RED Phase)
 *
 * These tests define the expected behavior of $.schema() fluent builder.
 * They should FAIL initially (RED), then pass after implementation (GREEN).
 */

import { describe, it, expect } from 'vitest'
import { $ } from '../../src/schema/$'

describe('$.schema()', () => {
  // ===========================================================================
  // Basic Schema Creation
  // ===========================================================================

  describe('schema creation', () => {
    it('creates a schema with string fields', () => {
      const schema = $.schema({ name: $.string() })
      expect(schema).toBeDefined()
      expect(typeof schema.validate).toBe('function')
    })

    it('creates a schema with multiple fields', () => {
      const schema = $.schema({
        name: $.string(),
        email: $.string(),
        bio: $.string(),
      })
      expect(schema).toBeDefined()
    })

    it('creates an empty schema', () => {
      const schema = $.schema({})
      expect(schema).toBeDefined()
    })
  })

  // ===========================================================================
  // Validation (.validate())
  // ===========================================================================

  describe('.validate()', () => {
    it('validates valid data successfully', () => {
      const schema = $.schema({ name: $.string() })
      const result = schema.validate({ name: 'test' })
      expect(result).toEqual({ success: true, data: { name: 'test' } })
    })

    it('validates empty object against empty schema', () => {
      const schema = $.schema({})
      const result = schema.validate({})
      expect(result).toEqual({ success: true, data: {} })
    })

    it('validates multiple fields', () => {
      const schema = $.schema({
        firstName: $.string(),
        lastName: $.string(),
      })
      const result = schema.validate({ firstName: 'John', lastName: 'Doe' })
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ firstName: 'John', lastName: 'Doe' })
    })

    it('fails validation for invalid field type', () => {
      const schema = $.schema({ name: $.string() })
      const result = schema.validate({ name: 123 })
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors!.length).toBeGreaterThan(0)
    })

    it('includes field path in validation errors', () => {
      const schema = $.schema({ name: $.string() })
      const result = schema.validate({ name: 123 })
      expect(result.success).toBe(false)
      expect(result.errors![0].path).toEqual(['name'])
    })

    it('fails validation for missing required field', () => {
      const schema = $.schema({ name: $.string() })
      const result = schema.validate({})
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0].code).toBe('required')
    })

    it('collects multiple validation errors', () => {
      const schema = $.schema({
        name: $.string(),
        email: $.string(),
      })
      const result = schema.validate({ name: 123, email: 456 })
      expect(result.success).toBe(false)
      expect(result.errors!.length).toBe(2)
    })

    it('rejects non-object input', () => {
      const schema = $.schema({ name: $.string() })
      const result = schema.validate('not an object')
      expect(result.success).toBe(false)
      expect(result.errors![0].code).toBe('invalid_type')
    })

    it('rejects null input', () => {
      const schema = $.schema({ name: $.string() })
      const result = schema.validate(null)
      expect(result.success).toBe(false)
      expect(result.errors![0].code).toBe('invalid_type')
    })

    it('rejects array input', () => {
      const schema = $.schema({ name: $.string() })
      const result = schema.validate(['name'])
      expect(result.success).toBe(false)
      expect(result.errors![0].code).toBe('invalid_type')
    })

    it('strips extra properties by default', () => {
      const schema = $.schema({ name: $.string() })
      const result = schema.validate({ name: 'test', extra: 'ignored' })
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ name: 'test' })
      expect(result.data).not.toHaveProperty('extra')
    })
  })

  // ===========================================================================
  // Nested Objects
  // ===========================================================================

  describe('nested objects', () => {
    it('validates nested objects with $.object()', () => {
      const schema = $.schema({
        user: $.object({ name: $.string() }),
      })
      const result = schema.validate({ user: { name: 'Alice' } })
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ user: { name: 'Alice' } })
    })

    it('validates deeply nested objects', () => {
      const schema = $.schema({
        level1: $.object({
          level2: $.object({
            level3: $.object({
              value: $.string(),
            }),
          }),
        }),
      })
      const result = schema.validate({
        level1: { level2: { level3: { value: 'deep' } } },
      })
      expect(result.success).toBe(true)
    })

    it('includes full path in nested validation errors', () => {
      const schema = $.schema({
        user: $.object({
          profile: $.object({
            name: $.string(),
          }),
        }),
      })
      const result = schema.validate({
        user: { profile: { name: 123 } },
      })
      expect(result.success).toBe(false)
      expect(result.errors![0].path).toEqual(['user', 'profile', 'name'])
    })

    it('fails validation for invalid nested object', () => {
      const schema = $.schema({
        user: $.object({ name: $.string() }),
      })
      const result = schema.validate({ user: 'not an object' })
      expect(result.success).toBe(false)
      expect(result.errors![0].path).toEqual(['user'])
    })
  })

  // ===========================================================================
  // JSON Schema Output (.toJSONSchema())
  // ===========================================================================

  describe('.toJSONSchema()', () => {
    it('returns a valid JSON Schema object', () => {
      const schema = $.schema({ name: $.string() })
      const jsonSchema = schema.toJSONSchema()
      expect(jsonSchema).toHaveProperty('type', 'object')
      expect(jsonSchema).toHaveProperty('properties')
    })

    it('includes $schema property', () => {
      const schema = $.schema({ name: $.string() })
      const jsonSchema = schema.toJSONSchema()
      expect(jsonSchema).toHaveProperty('$schema')
      expect(jsonSchema.$schema).toContain('json-schema.org')
    })

    it('generates properties for each field', () => {
      const schema = $.schema({
        name: $.string(),
        email: $.string(),
      })
      const jsonSchema = schema.toJSONSchema()
      expect(jsonSchema.properties).toHaveProperty('name')
      expect(jsonSchema.properties).toHaveProperty('email')
    })

    it('generates correct type for string fields', () => {
      const schema = $.schema({ name: $.string() })
      const jsonSchema = schema.toJSONSchema()
      expect(jsonSchema.properties!.name).toHaveProperty('type', 'string')
    })

    it('marks all fields as required by default', () => {
      const schema = $.schema({
        name: $.string(),
        email: $.string(),
      })
      const jsonSchema = schema.toJSONSchema()
      expect(jsonSchema.required).toContain('name')
      expect(jsonSchema.required).toContain('email')
    })

    it('generates nested JSON Schema for objects', () => {
      const schema = $.schema({
        user: $.object({ name: $.string() }),
      })
      const jsonSchema = schema.toJSONSchema()
      expect(jsonSchema.properties!.user).toHaveProperty('type', 'object')
      expect(jsonSchema.properties!.user.properties).toHaveProperty('name')
      expect(jsonSchema.properties!.user.properties.name).toHaveProperty('type', 'string')
    })

    it('generates additionalProperties: false by default', () => {
      const schema = $.schema({ name: $.string() })
      const jsonSchema = schema.toJSONSchema()
      expect(jsonSchema.additionalProperties).toBe(false)
    })

    it('generates empty schema correctly', () => {
      const schema = $.schema({})
      const jsonSchema = schema.toJSONSchema()
      expect(jsonSchema.type).toBe('object')
      expect(jsonSchema.properties).toEqual({})
      expect(jsonSchema.required).toEqual([])
    })
  })

  // ===========================================================================
  // Fluent Builder Pattern
  // ===========================================================================

  describe('fluent builder', () => {
    it('supports method chaining with .strict()', () => {
      const schema = $.schema({ name: $.string() }).strict()
      expect(schema).toBeDefined()
      // strict mode should reject extra properties
      const result = schema.validate({ name: 'test', extra: 'fail' })
      expect(result.success).toBe(false)
      expect(result.errors![0].code).toBe('unrecognized_keys')
    })

    it('supports method chaining with .passthrough()', () => {
      const schema = $.schema({ name: $.string() }).passthrough()
      const result = schema.validate({ name: 'test', extra: 'allowed' })
      expect(result.success).toBe(true)
      expect(result.data).toHaveProperty('extra', 'allowed')
    })

    it('supports method chaining with .partial()', () => {
      const schema = $.schema({
        name: $.string(),
        email: $.string(),
      }).partial()
      // partial makes all fields optional
      const result = schema.validate({})
      expect(result.success).toBe(true)
    })

    it('supports method chaining with .required()', () => {
      const baseSchema = $.schema({
        name: $.string(),
        email: $.string(),
      }).partial()
      const requiredSchema = baseSchema.required()
      // required makes all fields required again
      const result = requiredSchema.validate({})
      expect(result.success).toBe(false)
    })

    it('supports method chaining with .pick()', () => {
      const schema = $.schema({
        name: $.string(),
        email: $.string(),
        age: $.string(),
      }).pick(['name', 'email'])
      const jsonSchema = schema.toJSONSchema()
      expect(Object.keys(jsonSchema.properties!)).toEqual(['name', 'email'])
    })

    it('supports method chaining with .omit()', () => {
      const schema = $.schema({
        name: $.string(),
        email: $.string(),
        password: $.string(),
      }).omit(['password'])
      const jsonSchema = schema.toJSONSchema()
      expect(Object.keys(jsonSchema.properties!)).toEqual(['name', 'email'])
    })

    it('supports method chaining with .extend()', () => {
      const baseSchema = $.schema({ name: $.string() })
      const extendedSchema = baseSchema.extend({ email: $.string() })
      const result = extendedSchema.validate({ name: 'test', email: 'test@example.com' })
      expect(result.success).toBe(true)
    })

    it('supports method chaining with .merge()', () => {
      const schema1 = $.schema({ name: $.string() })
      const schema2 = $.schema({ email: $.string() })
      const merged = schema1.merge(schema2)
      const result = merged.validate({ name: 'test', email: 'test@example.com' })
      expect(result.success).toBe(true)
    })
  })

  // ===========================================================================
  // Type Inference
  // ===========================================================================

  describe('type inference', () => {
    it('infers correct type from schema definition', () => {
      const schema = $.schema({ name: $.string() })
      const result = schema.validate({ name: 'test' })
      if (result.success) {
        // TypeScript should infer result.data.name as string
        const name: string = result.data.name
        expect(name).toBe('test')
      }
    })

    it('provides type-safe data access on success', () => {
      const schema = $.schema({
        firstName: $.string(),
        lastName: $.string(),
      })
      const result = schema.validate({ firstName: 'John', lastName: 'Doe' })
      if (result.success) {
        // TypeScript should know these are strings
        expect(result.data.firstName.toUpperCase()).toBe('JOHN')
        expect(result.data.lastName.toUpperCase()).toBe('DOE')
      }
    })
  })

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('handles undefined input', () => {
      const schema = $.schema({ name: $.string() })
      const result = schema.validate(undefined)
      expect(result.success).toBe(false)
    })

    it('handles prototype pollution attempts', () => {
      const schema = $.schema({ name: $.string() })
      const malicious = JSON.parse('{"name": "test", "__proto__": {"polluted": true}}')
      const result = schema.validate(malicious)
      expect(result.success).toBe(true)
      expect(result.data).not.toHaveProperty('__proto__')
      expect(({} as any).polluted).toBeUndefined()
    })

    it('handles fields with special characters in names', () => {
      const schema = $.schema({ 'field-name': $.string(), 'field.name': $.string() })
      const result = schema.validate({ 'field-name': 'a', 'field.name': 'b' })
      expect(result.success).toBe(true)
    })

    it('preserves field order in validation result', () => {
      const schema = $.schema({
        z: $.string(),
        a: $.string(),
        m: $.string(),
      })
      const result = schema.validate({ z: '1', a: '2', m: '3' })
      expect(result.success).toBe(true)
      expect(Object.keys(result.data!)).toEqual(['z', 'a', 'm'])
    })
  })
})

describe('$.object()', () => {
  it('creates an object validator', () => {
    const objSchema = $.object({ name: $.string() })
    expect(objSchema).toBeDefined()
    expect(typeof objSchema.validate).toBe('function')
  })

  it('validates objects standalone', () => {
    const objSchema = $.object({ name: $.string() })
    const result = objSchema.validate({ name: 'test' })
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ name: 'test' })
  })

  it('can be nested within $.schema()', () => {
    const schema = $.schema({
      user: $.object({
        name: $.string(),
        email: $.string(),
      }),
    })
    const result = schema.validate({
      user: { name: 'Alice', email: 'alice@example.com' },
    })
    expect(result.success).toBe(true)
  })

  it('supports toJSONSchema()', () => {
    const objSchema = $.object({ name: $.string() })
    const jsonSchema = objSchema.toJSONSchema()
    expect(jsonSchema.type).toBe('object')
    expect(jsonSchema.properties).toHaveProperty('name')
  })
})
