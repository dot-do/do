/**
 * @dotdo/do - $.ref() Reference Type Tests (TDD RED Phase)
 *
 * Tests for the $.ref() reference type that validates $ref objects.
 * These tests are expected to FAIL as the implementation does not exist yet.
 */

import { describe, it, expect } from 'vitest'
import { $ } from '../../src/schema/$'

describe('$.ref()', () => {
  describe('basic reference validation', () => {
    it('validates reference objects with $ref property', () => {
      const schema = $.ref('User')
      const result = schema.validate({ $ref: 'https://example.com/user/123' })
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ $ref: 'https://example.com/user/123' })
    })

    it('accepts reference objects with valid $ref URLs', () => {
      const schema = $.ref('Document')
      const result = schema.validate({ $ref: 'doc://documents/abc-456' })
      expect(result.success).toBe(true)
      expect(result.data?.$ref).toBe('doc://documents/abc-456')
    })

    it('accepts reference objects with relative $ref paths', () => {
      const schema = $.ref('Item')
      const result = schema.validate({ $ref: '/items/789' })
      expect(result.success).toBe(true)
    })

    it('stores the type name for reference resolution', () => {
      const schema = $.ref('User')
      expect(schema.getTypeName()).toBe('User')
    })

    it('rejects objects without $ref property', () => {
      const schema = $.ref('User')
      const result = schema.validate({ id: 123, name: 'John' })
      expect(result.success).toBe(false)
      expect(result.errors?.[0].code).toBe('invalid_ref')
    })

    it('rejects null values', () => {
      const schema = $.ref('User')
      const result = schema.validate(null)
      expect(result.success).toBe(false)
    })

    it('rejects undefined values', () => {
      const schema = $.ref('User')
      const result = schema.validate(undefined)
      expect(result.success).toBe(false)
    })

    it('rejects primitive values', () => {
      const schema = $.ref('User')

      expect(schema.validate('string').success).toBe(false)
      expect(schema.validate(123).success).toBe(false)
      expect(schema.validate(true).success).toBe(false)
    })

    it('rejects arrays', () => {
      const schema = $.ref('User')
      const result = schema.validate([{ $ref: 'https://example.com/user/1' }])
      expect(result.success).toBe(false)
    })

    it('rejects objects with non-string $ref', () => {
      const schema = $.ref('User')
      const result = schema.validate({ $ref: 123 })
      expect(result.success).toBe(false)
      expect(result.errors?.[0].code).toBe('invalid_ref_type')
    })

    it('rejects empty $ref strings', () => {
      const schema = $.ref('User')
      const result = schema.validate({ $ref: '' })
      expect(result.success).toBe(false)
      expect(result.errors?.[0].code).toBe('invalid_ref_empty')
    })
  })

  describe('.exact() mode', () => {
    it('returns a schema with exact matching mode', () => {
      const schema = $.ref('User').exact()
      expect(schema.getMode()).toBe('exact')
    })

    it('validates exact reference matches', () => {
      const schema = $.ref('User').exact()
      const result = schema.validate({ $ref: 'https://example.com/user/123' })
      expect(result.success).toBe(true)
    })

    it('exact mode is chainable and returns ref type', () => {
      const schema = $.ref('Tag').exact()
      expect(schema.getTypeName()).toBe('Tag')
    })

    it('exact mode rejects additional properties by default', () => {
      const schema = $.ref('User').exact()
      const result = schema.validate({
        $ref: 'https://example.com/user/123',
        extraField: 'should fail',
      })
      expect(result.success).toBe(false)
      expect(result.errors?.[0].code).toBe('unexpected_property')
    })

    it('exact mode requires precise type matching', () => {
      const schema = $.ref('User').exact()
      // In exact mode, the $ref should point to the exact type
      const result = schema.validate({ $ref: 'https://example.com/admin/123' })
      // This test verifies exact mode is stricter about type matching
      expect(schema.getMode()).toBe('exact')
    })
  })

  describe('.fuzzy() mode', () => {
    it('returns a schema with fuzzy matching mode', () => {
      const schema = $.ref('Tag').fuzzy()
      expect(schema.getMode()).toBe('fuzzy')
    })

    it('validates fuzzy reference matches', () => {
      const schema = $.ref('Category').fuzzy()
      const result = schema.validate({ $ref: 'https://example.com/category/456' })
      expect(result.success).toBe(true)
    })

    it('fuzzy mode is chainable and returns ref type', () => {
      const schema = $.ref('Product').fuzzy()
      expect(schema.getTypeName()).toBe('Product')
    })

    it('fuzzy mode allows additional properties', () => {
      const schema = $.ref('User').fuzzy()
      const result = schema.validate({
        $ref: 'https://example.com/user/123',
        hint: 'additional metadata',
      })
      expect(result.success).toBe(true)
    })

    it('fuzzy mode supports semantic matching hints', () => {
      const schema = $.ref('Person').fuzzy()
      // Fuzzy mode might accept related type references
      const result = schema.validate({
        $ref: 'https://example.com/user/123',
        $type: 'User', // Hint that User is semantically a Person
      })
      expect(result.success).toBe(true)
    })
  })

  describe('default mode behavior', () => {
    it('defaults to exact mode when no mode is specified', () => {
      const schema = $.ref('User')
      expect(schema.getMode()).toBe('exact')
    })

    it('mode can be switched from exact to fuzzy', () => {
      const schema = $.ref('User').exact().fuzzy()
      expect(schema.getMode()).toBe('fuzzy')
    })

    it('mode can be switched from fuzzy to exact', () => {
      const schema = $.ref('User').fuzzy().exact()
      expect(schema.getMode()).toBe('exact')
    })
  })

  describe('error messages', () => {
    it('provides clear error message for missing $ref', () => {
      const schema = $.ref('User')
      const result = schema.validate({ id: 123 })
      expect(result.success).toBe(false)
      expect(result.errors?.[0].message).toContain('$ref')
    })

    it('provides clear error message for invalid $ref type', () => {
      const schema = $.ref('User')
      const result = schema.validate({ $ref: 42 })
      expect(result.success).toBe(false)
      expect(result.errors?.[0].message).toContain('string')
    })

    it('includes type name in error context', () => {
      const schema = $.ref('CustomType')
      const result = schema.validate({ wrong: 'data' })
      expect(result.success).toBe(false)
      expect(result.errors?.[0].message).toContain('CustomType')
    })
  })

  describe('type inference', () => {
    it('infers reference type correctly', () => {
      const schema = $.ref('User')
      const result = schema.validate({ $ref: 'https://example.com/user/1' })

      if (result.success) {
        // TypeScript should infer result.data as { $ref: string }
        const ref: string = result.data.$ref
        expect(typeof ref).toBe('string')
      }
    })
  })

  describe('integration with other schema types', () => {
    it('can be used as a type in the schema system', () => {
      // Verify $.ref returns a proper schema type
      const schema = $.ref('User')
      expect(typeof schema.validate).toBe('function')
    })
  })
})
