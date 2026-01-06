/**
 * @dotdo/do - RefType with Operator Modes Tests (TDD RED Phase)
 *
 * Tests for RefType integration with relationship operators:
 * - `->User` = forward exact relationship to User
 * - `~>User` = forward fuzzy (AI-discovered) relationship
 * - `<-User` = backward relationship from User
 * - `<~User` = backward fuzzy relationship
 * - `->User[]` = array of relationships
 *
 * These tests should FAIL initially (RED) until implementation (GREEN).
 */

import { describe, it, expect } from 'vitest'
import { $ } from '../../src/schema/$'
import { parseOperator } from '../../src/relationships/operators'

describe('RefType with Operator Modes', () => {
  // ===========================================================================
  // RED Phase: $.ref() with operator string parsing
  // ===========================================================================

  describe('$.ref() with operator string', () => {
    it('creates RefType from ->User operator', () => {
      const schema = $.ref('->User')
      expect(schema).toBeDefined()
      expect(schema.getTypeName()).toBe('User')
      expect(schema.getMode()).toBe('exact')
      expect(schema.getDirection()).toBe('forward')
    })

    it('creates RefType from ~>Tag operator', () => {
      const schema = $.ref('~>Tag')
      expect(schema).toBeDefined()
      expect(schema.getTypeName()).toBe('Tag')
      expect(schema.getMode()).toBe('fuzzy')
      expect(schema.getDirection()).toBe('forward')
    })

    it('creates RefType from <-Post operator', () => {
      const schema = $.ref('<-Post')
      expect(schema).toBeDefined()
      expect(schema.getTypeName()).toBe('Post')
      expect(schema.getMode()).toBe('exact')
      expect(schema.getDirection()).toBe('backward')
    })

    it('creates RefType from <~Article operator', () => {
      const schema = $.ref('<~Article')
      expect(schema).toBeDefined()
      expect(schema.getTypeName()).toBe('Article')
      expect(schema.getMode()).toBe('fuzzy')
      expect(schema.getDirection()).toBe('backward')
    })

    it('creates array RefType from ->User[]', () => {
      const schema = $.ref('->User[]')
      expect(schema).toBeDefined()
      expect(schema.getTypeName()).toBe('User')
      expect(schema.isArray()).toBe(true)
    })

    it('creates array RefType from ~>Category[]', () => {
      const schema = $.ref('~>Category[]')
      expect(schema).toBeDefined()
      expect(schema.isArray()).toBe(true)
      expect(schema.getMode()).toBe('fuzzy')
    })

    it('falls back to exact forward for plain type names', () => {
      // When no operator, treat as ->TypeName
      const schema = $.ref('User')
      expect(schema.getTypeName()).toBe('User')
      expect(schema.getMode()).toBe('exact')
      expect(schema.getDirection()).toBe('forward')
    })
  })

  // ===========================================================================
  // Direction-aware validation
  // ===========================================================================

  describe('direction-aware validation', () => {
    it('forward references validate outgoing relationships', () => {
      const schema = $.ref('->User')
      const result = schema.validate({ $ref: 'https://example.com/users/123' })
      expect(result.success).toBe(true)
    })

    it('backward references store direction metadata', () => {
      const schema = $.ref('<-Post')
      const result = schema.validate({ $ref: 'https://example.com/posts/456' })
      expect(result.success).toBe(true)
      expect(schema.getDirection()).toBe('backward')
    })

    it('fuzzy forward references allow semantic hints', () => {
      const schema = $.ref('~>Person')
      const result = schema.validate({
        $ref: 'https://example.com/users/789',
        $type: 'User', // hint that User is semantically Person
        confidence: 0.95,
      })
      expect(result.success).toBe(true)
    })

    it('fuzzy backward references allow discovery metadata', () => {
      const schema = $.ref('<~Related')
      const result = schema.validate({
        $ref: 'https://example.com/content/abc',
        similarityScore: 0.87,
        discoveredBy: 'ai-semantic-search',
      })
      expect(result.success).toBe(true)
    })
  })

  // ===========================================================================
  // Array RefType validation
  // ===========================================================================

  describe('array RefType validation', () => {
    it('validates array of references', () => {
      const schema = $.ref('->User[]')
      const result = schema.validate([
        { $ref: 'https://example.com/users/1' },
        { $ref: 'https://example.com/users/2' },
        { $ref: 'https://example.com/users/3' },
      ])
      expect(result.success).toBe(true)
      expect(Array.isArray(result.data)).toBe(true)
      expect(result.data?.length).toBe(3)
    })

    it('fails for non-array input when array type', () => {
      const schema = $.ref('->User[]')
      const result = schema.validate({ $ref: 'https://example.com/users/1' })
      expect(result.success).toBe(false)
      expect(result.errors?.[0].code).toBe('invalid_type')
    })

    it('validates each item in array', () => {
      const schema = $.ref('->User[]')
      const result = schema.validate([
        { $ref: 'https://example.com/users/1' },
        { invalid: 'data' }, // missing $ref
        { $ref: 'https://example.com/users/3' },
      ])
      expect(result.success).toBe(false)
      expect(result.errors?.[0].path).toEqual(['1'])
    })

    it('allows empty array', () => {
      const schema = $.ref('->User[]')
      const result = schema.validate([])
      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
    })
  })

  // ===========================================================================
  // Schema integration
  // ===========================================================================

  describe('integration with $.schema()', () => {
    it('uses operator shorthand in schema definition', () => {
      const userSchema = $.schema({
        name: $.string(),
        manager: $.ref('->User'),
        directReports: $.ref('->User[]'),
        tags: $.ref('~>Tag[]'),
      })

      expect(userSchema).toBeDefined()
    })

    it('validates schema with operator references', () => {
      const userSchema = $.schema({
        name: $.string(),
        department: $.ref('->Department'),
      })

      const result = userSchema.validate({
        name: 'John Doe',
        department: { $ref: 'https://example.com/departments/eng' },
      })

      expect(result.success).toBe(true)
    })

    it('reports errors for invalid references in schema', () => {
      const userSchema = $.schema({
        name: $.string(),
        manager: $.ref('->User'),
      })

      const result = userSchema.validate({
        name: 'John',
        manager: { invalid: 'missing $ref' },
      })

      expect(result.success).toBe(false)
      expect(result.errors?.[0].path).toEqual(['manager'])
    })

    it('generates JSON Schema with $ref fields', () => {
      const schema = $.schema({
        owner: $.ref('->User'),
        tags: $.ref('~>Tag[]'),
      })

      const jsonSchema = schema.toJSONSchema()
      expect(jsonSchema.properties?.owner).toBeDefined()
      expect(jsonSchema.properties?.tags).toBeDefined()
    })
  })

  // ===========================================================================
  // Operator introspection
  // ===========================================================================

  describe('operator introspection', () => {
    it('exposes parsed operator components', () => {
      const schema = $.ref('~>Category[]')
      expect(schema.getOperator()).toEqual({
        direction: 'forward',
        mode: 'fuzzy',
        type: 'Category',
        isArray: true,
      })
    })

    it('returns undefined operator for plain type', () => {
      const schema = $.ref('User')
      const operator = schema.getOperator()
      expect(operator.direction).toBe('forward')
      expect(operator.mode).toBe('exact')
      expect(operator.isArray).toBe(false)
    })
  })

  // ===========================================================================
  // Method chaining with operators
  // ===========================================================================

  describe('method chaining', () => {
    it('allows exact() to override fuzzy operator', () => {
      const schema = $.ref('~>User').exact()
      expect(schema.getMode()).toBe('exact')
    })

    it('allows fuzzy() to override exact operator', () => {
      const schema = $.ref('->User').fuzzy()
      expect(schema.getMode()).toBe('fuzzy')
    })

    it('preserves direction when changing mode', () => {
      const schema = $.ref('<-Post').fuzzy()
      expect(schema.getDirection()).toBe('backward')
      expect(schema.getMode()).toBe('fuzzy')
    })

    it('supports .optional() modifier', () => {
      const schema = $.ref('->User').optional()
      const result = schema.validate(undefined)
      expect(result.success).toBe(true)
    })

    it('supports .required() modifier', () => {
      const schema = $.ref('->User').required()
      const result = schema.validate(undefined)
      expect(result.success).toBe(false)
      expect(result.errors?.[0].code).toBe('required')
    })
  })

  // ===========================================================================
  // JSON Schema generation for references
  // ===========================================================================

  describe('JSON Schema generation', () => {
    it('generates $ref schema for single reference', () => {
      const schema = $.ref('->User')
      const jsonSchema = schema.toJSONSchema()

      expect(jsonSchema.type).toBe('object')
      expect(jsonSchema.properties?.$ref).toEqual({ type: 'string' })
      expect(jsonSchema.required).toContain('$ref')
    })

    it('generates array schema for array references', () => {
      const schema = $.ref('->User[]')
      const jsonSchema = schema.toJSONSchema()

      expect(jsonSchema.type).toBe('array')
      expect(jsonSchema.items?.type).toBe('object')
      expect(jsonSchema.items?.properties?.$ref).toEqual({ type: 'string' })
    })

    it('includes AI metadata for fuzzy references', () => {
      const schema = $.ref('~>Tag')
      const jsonSchema = schema.toJSONSchema()

      expect(jsonSchema['x-do-mode']).toBe('fuzzy')
      expect(jsonSchema['x-do-direction']).toBe('forward')
      expect(jsonSchema['x-do-ai-discoverable']).toBe(true)
    })

    it('includes direction metadata', () => {
      const schema = $.ref('<-Comment')
      const jsonSchema = schema.toJSONSchema()

      expect(jsonSchema['x-do-direction']).toBe('backward')
      expect(jsonSchema['x-do-target-type']).toBe('Comment')
    })
  })
})

describe('$.schema() with AI Metadata', () => {
  // ===========================================================================
  // Schema AI metadata
  // ===========================================================================

  describe('AI metadata in schema', () => {
    it('supports description for AI context', () => {
      const schema = $.schema({
        name: $.string(),
      }).describe('A user profile schema')

      expect(schema.getDescription()).toBe('A user profile schema')
    })

    it('includes description in JSON Schema', () => {
      const schema = $.schema({
        email: $.string(),
      }).describe('User contact schema')

      const jsonSchema = schema.toJSONSchema()
      expect(jsonSchema.description).toBe('User contact schema')
    })

    it('supports field-level descriptions', () => {
      const schema = $.schema({
        email: $.string().describe('Primary email address'),
        phone: $.string().describe('Contact phone number'),
      })

      const jsonSchema = schema.toJSONSchema()
      expect(jsonSchema.properties?.email?.description).toBe('Primary email address')
      expect(jsonSchema.properties?.phone?.description).toBe('Contact phone number')
    })

    it('supports examples for AI understanding', () => {
      const schema = $.schema({
        role: $.string().example('admin'),
      })

      const jsonSchema = schema.toJSONSchema()
      expect(jsonSchema.properties?.role?.examples).toContain('admin')
    })
  })
})
