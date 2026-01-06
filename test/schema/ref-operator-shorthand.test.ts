/**
 * @dotdo/do - RefType Operator Shorthand Tests (Updated for Implementation)
 *
 * Tests for the getOperator() method that extracts and returns
 * structured operator information from ref type definitions.
 *
 * Supported operators:
 * - '->'  = forward exact relationship (e.g., User -> Order)
 * - '~>'  = forward fuzzy relationship (e.g., User ~> Tag)
 * - '<-'  = backward exact relationship (e.g., Order <- User)
 * - '<~'  = backward fuzzy relationship (e.g., Related <~ User)
 *
 * Note: Bidirectional '<->' is not currently supported - use two separate refs.
 */

import { describe, it, expect } from 'vitest'
import { $ } from '../../src/schema/$'

describe('$.ref() operator shorthand', () => {
  // ===========================================================================
  // getOperator() returns structured operator info
  // ===========================================================================

  describe('getOperator() returns structured operator info', () => {
    it('returns forward direction for "->" operator', () => {
      const schema = $.ref('->User')
      const op = schema.getOperator()
      expect(op.direction).toBe('forward')
      expect(op.mode).toBe('exact')
      expect(op.type).toBe('User')
      expect(op.isArray).toBe(false)
    })

    it('returns backward direction for "<-" operator', () => {
      const schema = $.ref('<-Order')
      const op = schema.getOperator()
      expect(op.direction).toBe('backward')
      expect(op.mode).toBe('exact')
      expect(op.type).toBe('Order')
      expect(op.isArray).toBe(false)
    })

    it('returns forward fuzzy for "~>" operator', () => {
      const schema = $.ref('~>Tag')
      const op = schema.getOperator()
      expect(op.direction).toBe('forward')
      expect(op.mode).toBe('fuzzy')
      expect(op.type).toBe('Tag')
    })

    it('returns backward fuzzy for "<~" operator', () => {
      const schema = $.ref('<~Related')
      const op = schema.getOperator()
      expect(op.direction).toBe('backward')
      expect(op.mode).toBe('fuzzy')
      expect(op.type).toBe('Related')
    })

    it('returns default forward exact for plain type names', () => {
      const schema = $.ref('User')
      const op = schema.getOperator()
      expect(op.direction).toBe('forward')
      expect(op.mode).toBe('exact')
      expect(op.type).toBe('User')
    })
  })

  // ===========================================================================
  // Parsing operators correctly from schema field definitions
  // ===========================================================================

  describe('parsing operators from type strings', () => {
    it('extracts type name correctly from ->TypeName', () => {
      const schema = $.ref('->Customer')
      expect(schema.getTypeName()).toBe('Customer')
      expect(schema.getDirection()).toBe('forward')
    })

    it('extracts type name correctly from <-TypeName', () => {
      const schema = $.ref('<-Invoice')
      expect(schema.getTypeName()).toBe('Invoice')
      expect(schema.getDirection()).toBe('backward')
    })

    it('handles array notation with operators', () => {
      const schema = $.ref('->Product[]')
      expect(schema.getTypeName()).toBe('Product')
      expect(schema.getDirection()).toBe('forward')
      expect(schema.isArray()).toBe(true)
    })

    it('handles fuzzy array notation', () => {
      const schema = $.ref('~>Category[]')
      expect(schema.getTypeName()).toBe('Category')
      expect(schema.getMode()).toBe('fuzzy')
      expect(schema.isArray()).toBe(true)
    })
  })

  // ===========================================================================
  // Schema fields with operator shorthand validation
  // ===========================================================================

  describe('schema fields with operator shorthand', () => {
    it('validates forward references in schema', () => {
      const schema = $.schema({
        owner: $.ref('->User'),
      })

      const result = schema.validate({
        owner: { $ref: 'https://example.com/users/123' },
      })

      expect(result.success).toBe(true)
    })

    it('validates backward references in schema', () => {
      const schema = $.schema({
        orders: $.ref('<-Order[]'),
      })

      const result = schema.validate({
        orders: [
          { $ref: 'https://example.com/orders/1' },
          { $ref: 'https://example.com/orders/2' },
        ],
      })

      expect(result.success).toBe(true)
    })

    it('validates fuzzy forward references in schema', () => {
      const schema = $.schema({
        tags: $.ref('~>Tag[]'),
      })

      // Fuzzy mode allows additional properties
      const result = schema.validate({
        tags: [
          { $ref: 'https://example.com/tags/1', confidence: 0.95 },
          { $ref: 'https://example.com/tags/2', confidence: 0.87 },
        ],
      })

      expect(result.success).toBe(true)
    })

    it('stores operator metadata for schema introspection', () => {
      const schema = $.schema({
        manager: $.ref('->User'),
        subordinates: $.ref('<-User[]'),
        tags: $.ref('~>Tag[]'),
      })

      // The schema should provide introspection of field types
      const managerField = schema.getFieldType('manager')
      expect(managerField).toBeDefined()
      expect(managerField?.getDirection?.()).toBe('forward')
    })
  })

  // ===========================================================================
  // Operator introspection for relationship graph
  // ===========================================================================

  describe('operator introspection for graph building', () => {
    it('getOperator() returns structured operator info', () => {
      const schema = $.ref('~>Related')
      const info = schema.getOperator()

      expect(info).toEqual({
        direction: 'forward',
        mode: 'fuzzy',
        type: 'Related',
        isArray: false,
      })
    })

    it('returns proper direction for forward operator', () => {
      const schema = $.ref('->Target')
      const info = schema.getOperator()

      expect(info.direction).toBe('forward')
      expect(info.mode).toBe('exact')
    })

    it('returns proper direction for backward operator', () => {
      const schema = $.ref('<-Source')
      const info = schema.getOperator()

      expect(info.direction).toBe('backward')
      expect(info.mode).toBe('exact')
    })

    it('returns fuzzy mode for fuzzy operators', () => {
      const schema = $.ref('~>AIDiscovered')
      const info = schema.getOperator()

      expect(info.direction).toBe('forward')
      expect(info.mode).toBe('fuzzy')
    })
  })

  // ===========================================================================
  // Edge cases and error handling
  // ===========================================================================

  describe('edge cases', () => {
    it('handles type names that start with arrow-like characters', () => {
      // Ensure that a type named "Arrow" doesn't get confused with operators
      const schema = $.ref('Arrow')
      expect(schema.getTypeName()).toBe('Arrow')
      expect(schema.getDirection()).toBe('forward')
      expect(schema.getMode()).toBe('exact')
    })

    it('preserves mode when using exact() modifier', () => {
      const schema = $.ref('~>User').exact()
      expect(schema.getMode()).toBe('exact')
    })

    it('preserves direction when using fuzzy() modifier', () => {
      const schema = $.ref('<-Order').fuzzy()
      expect(schema.getDirection()).toBe('backward')
      expect(schema.getMode()).toBe('fuzzy')
    })

    it('handles plain PascalCase type names', () => {
      const schema = $.ref('UserProfile')
      expect(schema.getTypeName()).toBe('UserProfile')
      expect(schema.getDirection()).toBe('forward')
    })
  })
})
