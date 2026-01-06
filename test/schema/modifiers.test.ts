/**
 * @dotdo/do - Schema Validation Tests: Required/Optional Modifiers (RED Phase)
 *
 * These tests define the expected behavior of .required() and .optional() modifiers.
 * They should FAIL initially (RED), then pass after implementation (GREEN).
 */

import { describe, it, expect } from 'vitest'
import { $ } from '../../src/schema/$'

describe('.required() modifier', () => {
  it('rejects undefined when required', () => {
    const result = $.string().required().validate(undefined)
    expect(result.success).toBe(false)
    expect(result.errors![0].code).toBe('required')
  })

  it('rejects undefined with descriptive error message', () => {
    const result = $.string().required().validate(undefined)
    expect(result.success).toBe(false)
    expect(result.errors![0].message).toContain('required')
  })

  it('accepts valid string values when required', () => {
    const result = $.string().required().validate('hello')
    expect(result).toEqual({ success: true, data: 'hello' })
  })

  it('still rejects invalid types when required', () => {
    const result = $.string().required().validate(123)
    expect(result.success).toBe(false)
    expect(result.errors![0].code).toBe('invalid_type')
  })

  it('rejects null when required', () => {
    const result = $.string().required().validate(null)
    expect(result.success).toBe(false)
    // null should fail type validation, not required check
    expect(result.errors![0].code).toBe('invalid_type')
  })

  it('accepts empty string when required (empty is still a value)', () => {
    const result = $.string().required().validate('')
    expect(result).toEqual({ success: true, data: '' })
  })

  it('includes path in required error', () => {
    const result = $.string().required().validate(undefined)
    expect(result.errors![0].path).toEqual([])
  })

  it('is chainable - required returns a validator', () => {
    const schema = $.string().required()
    expect(typeof schema.validate).toBe('function')
  })
})

describe('.optional() modifier', () => {
  it('accepts undefined when optional', () => {
    const result = $.string().optional().validate(undefined)
    expect(result).toEqual({ success: true, data: undefined })
  })

  it('accepts valid string values when optional', () => {
    const result = $.string().optional().validate('hello')
    expect(result).toEqual({ success: true, data: 'hello' })
  })

  it('accepts empty string when optional', () => {
    const result = $.string().optional().validate('')
    expect(result).toEqual({ success: true, data: '' })
  })

  it('still rejects invalid types when optional (not undefined)', () => {
    const result = $.string().optional().validate(123)
    expect(result.success).toBe(false)
    expect(result.errors![0].code).toBe('invalid_type')
  })

  it('rejects null when optional (null is not undefined)', () => {
    const result = $.string().optional().validate(null)
    expect(result.success).toBe(false)
    expect(result.errors![0].code).toBe('invalid_type')
  })

  it('is chainable - optional returns a validator', () => {
    const schema = $.string().optional()
    expect(typeof schema.validate).toBe('function')
  })

  it('returns success with data: undefined, not missing data property', () => {
    const result = $.string().optional().validate(undefined)
    expect(result.success).toBe(true)
    expect('data' in result).toBe(true)
    expect(result.data).toBe(undefined)
  })
})

describe('required/optional interaction', () => {
  it('optional after required makes it optional', () => {
    const result = $.string().required().optional().validate(undefined)
    expect(result).toEqual({ success: true, data: undefined })
  })

  it('required after optional makes it required', () => {
    const result = $.string().optional().required().validate(undefined)
    expect(result.success).toBe(false)
    expect(result.errors![0].code).toBe('required')
  })

  it('default behavior (without modifier) rejects undefined', () => {
    const result = $.string().validate(undefined)
    expect(result.success).toBe(false)
  })
})

describe('.default() modifier', () => {
  it('provides default for undefined', () => {
    const result = $.string().default('default').validate(undefined)
    expect(result).toEqual({ success: true, data: 'default' })
  })

  it('uses provided value when not undefined', () => {
    const result = $.string().default('default').validate('actual')
    expect(result).toEqual({ success: true, data: 'actual' })
  })

  it('uses provided value when empty string', () => {
    const result = $.string().default('default').validate('')
    expect(result).toEqual({ success: true, data: '' })
  })

  it('still rejects invalid types', () => {
    const result = $.string().default('default').validate(123)
    expect(result.success).toBe(false)
    expect(result.errors![0].code).toBe('invalid_type')
  })

  it('supports function as default value', () => {
    let callCount = 0
    const schema = $.string().default(() => {
      callCount++
      return 'generated'
    })

    // First call with undefined - should call the function
    const result1 = schema.validate(undefined)
    expect(result1).toEqual({ success: true, data: 'generated' })
    expect(callCount).toBe(1)

    // Second call with value - should not call the function
    const result2 = schema.validate('provided')
    expect(result2).toEqual({ success: true, data: 'provided' })
    expect(callCount).toBe(1)
  })

  it('is chainable - default returns a validator', () => {
    const schema = $.string().default('test')
    expect(typeof schema.validate).toBe('function')
  })
})

describe('.transform() modifier', () => {
  it('transforms valid values', () => {
    const result = $.string().transform(s => s.toUpperCase()).validate('hello')
    expect(result).toEqual({ success: true, data: 'HELLO' })
  })

  it('does not transform invalid values', () => {
    const result = $.string().transform(s => s.toUpperCase()).validate(123)
    expect(result.success).toBe(false)
  })

  it('transforms to different type', () => {
    const result = $.string().transform(s => s.length).validate('hello')
    expect(result).toEqual({ success: true, data: 5 })
  })

  it('is chainable - transform returns a validator', () => {
    const schema = $.string().transform(s => s.toUpperCase())
    expect(typeof schema.validate).toBe('function')
  })

  it('chains multiple transforms', () => {
    const result = $.string()
      .transform(s => s.trim())
      .transform(s => s.toUpperCase())
      .validate('  hello  ')
    expect(result).toEqual({ success: true, data: 'HELLO' })
  })

  it('transform receives validated data', () => {
    const result = $.string().transform(s => {
      // s should be a string at this point
      return s.split('').reverse().join('')
    }).validate('hello')
    expect(result).toEqual({ success: true, data: 'olleh' })
  })
})

describe('modifier chaining', () => {
  it('chains multiple modifiers', () => {
    const schema = $.string()
      .default('unknown')
      .transform(s => s.toUpperCase())

    expect(schema.validate(undefined)).toEqual({ success: true, data: 'UNKNOWN' })
    expect(schema.validate('hello')).toEqual({ success: true, data: 'HELLO' })
  })

  it('required + transform', () => {
    const schema = $.string()
      .required()
      .transform(s => s.toUpperCase())

    const result1 = schema.validate('hello')
    expect(result1).toEqual({ success: true, data: 'HELLO' })

    const result2 = schema.validate(undefined)
    expect(result2.success).toBe(false)
    expect(result2.errors![0].code).toBe('required')
  })

  it('optional + default', () => {
    // .optional() makes undefined valid, then .default() provides a value
    const schema = $.string()
      .optional()
      .default('fallback')

    const result1 = schema.validate(undefined)
    // Note: default after optional means undefined becomes 'fallback'
    expect(result1).toEqual({ success: true, data: 'fallback' })

    const result2 = schema.validate('provided')
    expect(result2).toEqual({ success: true, data: 'provided' })
  })

  it('default + required', () => {
    // .default() provides a value for undefined, so .required() always passes
    const schema = $.string()
      .default('fallback')
      .required()

    const result1 = schema.validate(undefined)
    expect(result1).toEqual({ success: true, data: 'fallback' })

    const result2 = schema.validate('provided')
    expect(result2).toEqual({ success: true, data: 'provided' })
  })

  it('all modifiers together', () => {
    const schema = $.string()
      .default('unknown')
      .required()
      .transform(s => s.toUpperCase())

    expect(schema.validate(undefined)).toEqual({ success: true, data: 'UNKNOWN' })
    expect(schema.validate('hello')).toEqual({ success: true, data: 'HELLO' })
  })
})
