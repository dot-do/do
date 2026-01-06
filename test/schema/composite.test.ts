/**
 * @dotdo/do - Schema Validation Tests: Composite Types (RED Phase)
 *
 * These tests define the expected behavior of $.array() and $.object() validation.
 * They should FAIL initially (RED), then pass after implementation (GREEN).
 */

import { describe, it, expect } from 'vitest'
import { $ } from '../../src/schema/$'

// =============================================================================
// $.array() Tests
// =============================================================================

describe('$.array()', () => {
  describe('basic validation', () => {
    it('validates arrays of strings', () => {
      const result = $.array($.string()).validate(['a', 'b', 'c'])
      expect(result).toEqual({ success: true, data: ['a', 'b', 'c'] })
    })

    it('validates empty arrays', () => {
      const result = $.array($.string()).validate([])
      expect(result).toEqual({ success: true, data: [] })
    })

    it('validates single-item arrays', () => {
      const result = $.array($.string()).validate(['hello'])
      expect(result).toEqual({ success: true, data: ['hello'] })
    })
  })

  describe('item validation', () => {
    it('rejects arrays with invalid items', () => {
      const result = $.array($.string()).validate(['a', 123, 'c'])
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors!.length).toBeGreaterThanOrEqual(1)
    })

    it('includes index in path for invalid items', () => {
      const result = $.array($.string()).validate(['a', 123])
      expect(result.success).toBe(false)
      expect(result.errors![0].path).toContain('1')
    })

    it('reports all invalid items', () => {
      const result = $.array($.string()).validate([1, 'valid', 2, 3])
      expect(result.success).toBe(false)
      expect(result.errors!.length).toBe(3) // items at indices 0, 2, 3
    })

    it('includes item index in error path', () => {
      const result = $.array($.string()).validate(['a', 'b', 123, 'd'])
      expect(result.success).toBe(false)
      expect(result.errors![0].path).toEqual(['2'])
    })
  })

  describe('type rejection', () => {
    it('rejects non-array values', () => {
      const result = $.array($.string()).validate('not an array')
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0].code).toBe('invalid_type')
    })

    it('rejects null', () => {
      const result = $.array($.string()).validate(null)
      expect(result.success).toBe(false)
      expect(result.errors![0].code).toBe('invalid_type')
    })

    it('rejects undefined', () => {
      const result = $.array($.string()).validate(undefined)
      expect(result.success).toBe(false)
      expect(result.errors![0].code).toBe('invalid_type')
    })

    it('rejects objects', () => {
      const result = $.array($.string()).validate({ 0: 'a', 1: 'b' })
      expect(result.success).toBe(false)
      expect(result.errors![0].code).toBe('invalid_type')
    })

    it('rejects numbers', () => {
      const result = $.array($.string()).validate(123)
      expect(result.success).toBe(false)
      expect(result.errors![0].code).toBe('invalid_type')
    })
  })

  describe('nested arrays', () => {
    it('validates nested arrays', () => {
      const result = $.array($.array($.string())).validate([['a', 'b'], ['c']])
      expect(result).toEqual({ success: true, data: [['a', 'b'], ['c']] })
    })

    it('includes nested path for nested array errors', () => {
      const result = $.array($.array($.string())).validate([['a'], [123]])
      expect(result.success).toBe(false)
      expect(result.errors![0].path).toEqual(['1', '0'])
    })
  })

  describe('error messages', () => {
    it('provides descriptive error message for invalid type', () => {
      const result = $.array($.string()).validate('string')
      expect(result.errors![0].message).toContain('array')
    })

    it('provides descriptive error message for invalid items', () => {
      const result = $.array($.string()).validate([123])
      expect(result.errors![0].message).toContain('string')
    })
  })
})

// =============================================================================
// $.object() Tests
// =============================================================================

describe('$.object()', () => {
  describe('basic validation', () => {
    it('validates objects with matching schema', () => {
      const result = $.object({ name: $.string() }).validate({ name: 'test' })
      expect(result).toEqual({ success: true, data: { name: 'test' } })
    })

    it('validates empty objects with empty schema', () => {
      const result = $.object({}).validate({})
      expect(result).toEqual({ success: true, data: {} })
    })

    it('validates objects with multiple properties', () => {
      const result = $.object({
        firstName: $.string(),
        lastName: $.string(),
      }).validate({ firstName: 'John', lastName: 'Doe' })
      expect(result).toEqual({
        success: true,
        data: { firstName: 'John', lastName: 'Doe' },
      })
    })
  })

  describe('property validation', () => {
    it('rejects objects with invalid property types', () => {
      const result = $.object({ name: $.string() }).validate({ name: 123 })
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
    })

    it('includes property name in path for errors', () => {
      const result = $.object({ name: $.string() }).validate({ name: 123 })
      expect(result.success).toBe(false)
      expect(result.errors![0].path).toContain('name')
    })

    it('rejects objects with missing required properties', () => {
      const result = $.object({ name: $.string() }).validate({})
      expect(result.success).toBe(false)
      expect(result.errors![0].path).toContain('name')
    })

    it('reports all invalid properties', () => {
      const result = $.object({
        name: $.string(),
        age: $.string(),
      }).validate({ name: 123, age: 456 })
      expect(result.success).toBe(false)
      expect(result.errors!.length).toBe(2)
    })
  })

  describe('type rejection', () => {
    it('rejects non-object values', () => {
      const result = $.object({ name: $.string() }).validate('not an object')
      expect(result.success).toBe(false)
      expect(result.errors![0].code).toBe('invalid_type')
    })

    it('rejects null', () => {
      const result = $.object({ name: $.string() }).validate(null)
      expect(result.success).toBe(false)
      expect(result.errors![0].code).toBe('invalid_type')
    })

    it('rejects undefined', () => {
      const result = $.object({ name: $.string() }).validate(undefined)
      expect(result.success).toBe(false)
      expect(result.errors![0].code).toBe('invalid_type')
    })

    it('rejects arrays', () => {
      const result = $.object({ name: $.string() }).validate(['name'])
      expect(result.success).toBe(false)
      expect(result.errors![0].code).toBe('invalid_type')
    })

    it('rejects numbers', () => {
      const result = $.object({ name: $.string() }).validate(123)
      expect(result.success).toBe(false)
      expect(result.errors![0].code).toBe('invalid_type')
    })
  })

  describe('nested objects', () => {
    it('validates nested objects', () => {
      const result = $.object({
        user: $.object({
          name: $.string(),
        }),
      }).validate({ user: { name: 'John' } })
      expect(result).toEqual({
        success: true,
        data: { user: { name: 'John' } },
      })
    })

    it('includes nested path for nested object errors', () => {
      const result = $.object({
        user: $.object({
          name: $.string(),
        }),
      }).validate({ user: { name: 123 } })
      expect(result.success).toBe(false)
      expect(result.errors![0].path).toEqual(['user', 'name'])
    })

    it('includes path for missing nested properties', () => {
      const result = $.object({
        user: $.object({
          name: $.string(),
        }),
      }).validate({ user: {} })
      expect(result.success).toBe(false)
      expect(result.errors![0].path).toEqual(['user', 'name'])
    })
  })

  describe('extra properties', () => {
    it('strips unknown properties by default', () => {
      const result = $.object({ name: $.string() }).validate({
        name: 'test',
        extra: 'ignored',
      })
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ name: 'test' })
    })
  })

  describe('error messages', () => {
    it('provides descriptive error message for invalid type', () => {
      const result = $.object({ name: $.string() }).validate('string')
      expect(result.errors![0].message).toContain('object')
    })

    it('provides descriptive error message for missing property', () => {
      const result = $.object({ name: $.string() }).validate({})
      expect(result.errors![0].message).toMatch(/required|missing|undefined/)
    })
  })
})

// =============================================================================
// Combined $.object() and $.array() Tests
// =============================================================================

describe('$.object() with $.array()', () => {
  it('validates objects containing arrays', () => {
    const result = $.object({
      tags: $.array($.string()),
    }).validate({ tags: ['a', 'b'] })
    expect(result).toEqual({ success: true, data: { tags: ['a', 'b'] } })
  })

  it('includes full path for array item errors in objects', () => {
    const result = $.object({
      tags: $.array($.string()),
    }).validate({ tags: ['a', 123] })
    expect(result.success).toBe(false)
    expect(result.errors![0].path).toEqual(['tags', '1'])
  })

  it('validates arrays of objects', () => {
    const result = $.array(
      $.object({ name: $.string() })
    ).validate([{ name: 'a' }, { name: 'b' }])
    expect(result).toEqual({
      success: true,
      data: [{ name: 'a' }, { name: 'b' }],
    })
  })

  it('includes full path for object errors in arrays', () => {
    const result = $.array(
      $.object({ name: $.string() })
    ).validate([{ name: 'a' }, { name: 123 }])
    expect(result.success).toBe(false)
    expect(result.errors![0].path).toEqual(['1', 'name'])
  })

  it('validates complex nested structures', () => {
    const schema = $.object({
      users: $.array(
        $.object({
          name: $.string(),
          emails: $.array($.string()),
        })
      ),
    })
    const result = schema.validate({
      users: [
        { name: 'John', emails: ['john@example.com'] },
        { name: 'Jane', emails: ['jane@example.com', 'jane2@example.com'] },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('includes full path for deeply nested errors', () => {
    const schema = $.object({
      users: $.array(
        $.object({
          name: $.string(),
          emails: $.array($.string()),
        })
      ),
    })
    const result = schema.validate({
      users: [
        { name: 'John', emails: ['valid'] },
        { name: 'Jane', emails: ['valid', 123] },
      ],
    })
    expect(result.success).toBe(false)
    expect(result.errors![0].path).toEqual(['users', '1', 'emails', '1'])
  })
})
