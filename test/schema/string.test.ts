/**
 * @dotdo/do - Schema Validation Tests: StringType (RED Phase)
 *
 * These tests define the expected behavior of $.string() validation.
 * They should FAIL initially (RED), then pass after implementation (GREEN).
 */

import { describe, it, expect } from 'vitest'
import { $ } from '../../src/schema/$'

describe('$.string()', () => {
  it('validates strings successfully', () => {
    const result = $.string().validate('hello')
    expect(result).toEqual({ success: true, data: 'hello' })
  })

  it('validates empty string successfully', () => {
    const result = $.string().validate('')
    expect(result).toEqual({ success: true, data: '' })
  })

  it('rejects non-strings', () => {
    const result = $.string().validate(123)
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors![0].message).toContain('string')
  })

  it('rejects null', () => {
    const result = $.string().validate(null)
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors![0].code).toBe('invalid_type')
  })

  it('rejects undefined by default', () => {
    const result = $.string().validate(undefined)
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors![0].code).toBe('invalid_type')
  })

  it('rejects objects', () => {
    const result = $.string().validate({ foo: 'bar' })
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
  })

  it('rejects arrays', () => {
    const result = $.string().validate(['hello'])
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
  })

  it('rejects booleans', () => {
    const result = $.string().validate(true)
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
  })

  it('includes path in error for root validation', () => {
    const result = $.string().validate(123)
    expect(result.errors![0].path).toEqual([])
  })
})
