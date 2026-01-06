/**
 * @dotdo/do - Schema Validation Tests: Primitive Types (RED Phase)
 *
 * These tests define the expected behavior of $.number(), $.boolean(), and $.date() validation.
 * They should FAIL initially (RED), then pass after implementation (GREEN).
 */

import { describe, it, expect } from 'vitest'
import { $ } from '../../src/schema/$'

describe('$.number()', () => {
  it('validates numbers successfully', () => {
    const result = $.number().validate(42)
    expect(result).toEqual({ success: true, data: 42 })
  })

  it('validates zero successfully', () => {
    const result = $.number().validate(0)
    expect(result).toEqual({ success: true, data: 0 })
  })

  it('validates negative numbers successfully', () => {
    const result = $.number().validate(-123)
    expect(result).toEqual({ success: true, data: -123 })
  })

  it('validates floating point numbers successfully', () => {
    const result = $.number().validate(3.14159)
    expect(result).toEqual({ success: true, data: 3.14159 })
  })

  it('validates Infinity successfully', () => {
    const result = $.number().validate(Infinity)
    expect(result).toEqual({ success: true, data: Infinity })
  })

  it('rejects NaN', () => {
    const result = $.number().validate(NaN)
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors![0].code).toBe('invalid_type')
  })

  it('rejects strings', () => {
    const result = $.number().validate('42')
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors![0].message).toContain('number')
  })

  it('rejects null', () => {
    const result = $.number().validate(null)
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors![0].code).toBe('invalid_type')
  })

  it('rejects undefined', () => {
    const result = $.number().validate(undefined)
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors![0].code).toBe('invalid_type')
  })

  it('rejects booleans', () => {
    const result = $.number().validate(true)
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
  })

  it('rejects objects', () => {
    const result = $.number().validate({ value: 42 })
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
  })

  it('rejects arrays', () => {
    const result = $.number().validate([42])
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
  })

  it('includes path in error for root validation', () => {
    const result = $.number().validate('not a number')
    expect(result.errors![0].path).toEqual([])
  })
})

describe('$.boolean()', () => {
  it('validates true successfully', () => {
    const result = $.boolean().validate(true)
    expect(result).toEqual({ success: true, data: true })
  })

  it('validates false successfully', () => {
    const result = $.boolean().validate(false)
    expect(result).toEqual({ success: true, data: false })
  })

  it('rejects strings', () => {
    const result = $.boolean().validate('true')
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors![0].message).toContain('boolean')
  })

  it('rejects numbers', () => {
    const result = $.boolean().validate(1)
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
  })

  it('rejects null', () => {
    const result = $.boolean().validate(null)
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors![0].code).toBe('invalid_type')
  })

  it('rejects undefined', () => {
    const result = $.boolean().validate(undefined)
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors![0].code).toBe('invalid_type')
  })

  it('rejects objects', () => {
    const result = $.boolean().validate({ value: true })
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
  })

  it('rejects arrays', () => {
    const result = $.boolean().validate([true])
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
  })

  it('includes path in error for root validation', () => {
    const result = $.boolean().validate('not a boolean')
    expect(result.errors![0].path).toEqual([])
  })
})

describe('$.date()', () => {
  it('validates Date objects successfully', () => {
    const date = new Date('2024-01-15T12:00:00Z')
    const result = $.date().validate(date)
    expect(result.success).toBe(true)
    expect(result.data).toEqual(date)
  })

  it('validates ISO date strings successfully', () => {
    const isoString = '2024-01-15T12:00:00Z'
    const result = $.date().validate(isoString)
    expect(result.success).toBe(true)
    expect(result.data).toBeInstanceOf(Date)
    // Date.toISOString() always includes milliseconds, so compare timestamps
    expect(result.data!.getTime()).toBe(new Date(isoString).getTime())
  })

  it('validates date-only ISO strings successfully', () => {
    const dateString = '2024-01-15'
    const result = $.date().validate(dateString)
    expect(result.success).toBe(true)
    expect(result.data).toBeInstanceOf(Date)
  })

  it('rejects invalid date strings', () => {
    const result = $.date().validate('not-a-date')
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors![0].code).toBe('invalid_type')
  })

  it('rejects invalid Date objects', () => {
    const invalidDate = new Date('invalid')
    const result = $.date().validate(invalidDate)
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
  })

  it('rejects numbers', () => {
    const result = $.date().validate(1705320000000)
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors![0].message).toContain('date')
  })

  it('rejects null', () => {
    const result = $.date().validate(null)
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors![0].code).toBe('invalid_type')
  })

  it('rejects undefined', () => {
    const result = $.date().validate(undefined)
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors![0].code).toBe('invalid_type')
  })

  it('rejects booleans', () => {
    const result = $.date().validate(true)
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
  })

  it('rejects objects that are not Date instances', () => {
    const result = $.date().validate({ year: 2024, month: 1, day: 15 })
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
  })

  it('rejects arrays', () => {
    const result = $.date().validate([new Date()])
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
  })

  it('includes path in error for root validation', () => {
    const result = $.date().validate('not-a-date')
    expect(result.errors![0].path).toEqual([])
  })
})
