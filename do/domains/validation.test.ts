/**
 * Subdomain Validation Tests
 *
 * @module domains/__tests__/validation
 */

import { describe, it, expect } from 'vitest'
import {
  validateSubdomain,
  validateTLD,
  validateDomain,
  isReserved,
  normalizeSubdomain,
  suggestAlternatives,
  getReservedSubdomains,
  ADDITIONAL_RESERVED_SUBDOMAINS,
  ALL_RESERVED_SUBDOMAINS,
} from './validation'

describe('Subdomain Validation', () => {
  describe('validateSubdomain', () => {
    describe('valid subdomains', () => {
      it('should accept simple alphanumeric subdomain', () => {
        expect(validateSubdomain('acme')).toEqual({
          valid: true,
          details: expect.objectContaining({ value: 'acme' }),
        })
      })

      it('should accept subdomain with numbers', () => {
        expect(validateSubdomain('acme123')).toEqual({
          valid: true,
          details: expect.objectContaining({ value: 'acme123' }),
        })
      })

      it('should accept subdomain with hyphens', () => {
        expect(validateSubdomain('acme-corp')).toEqual({
          valid: true,
          details: expect.objectContaining({ value: 'acme-corp' }),
        })
      })

      it('should accept minimum length subdomain', () => {
        expect(validateSubdomain('ab')).toEqual({
          valid: true,
          details: expect.objectContaining({ value: 'ab' }),
        })
      })
    })

    describe('invalid subdomains', () => {
      it('should reject uppercase', () => {
        const result = validateSubdomain('ACME')
        expect(result.valid).toBe(false)
        expect(result.error).toContain('lowercase')
      })

      it('should reject too short', () => {
        const result = validateSubdomain('a')
        expect(result.valid).toBe(false)
        expect(result.error).toContain('2-63')
      })

      it('should reject too long', () => {
        const result = validateSubdomain('a'.repeat(64))
        expect(result.valid).toBe(false)
        expect(result.error).toContain('2-63')
      })

      it('should reject leading hyphen', () => {
        const result = validateSubdomain('-acme')
        expect(result.valid).toBe(false)
        expect(result.error).toContain('alphanumeric')
      })

      it('should reject trailing hyphen', () => {
        const result = validateSubdomain('acme-')
        expect(result.valid).toBe(false)
        expect(result.error).toContain('alphanumeric')
      })

      it('should reject consecutive hyphens', () => {
        const result = validateSubdomain('acme--corp')
        expect(result.valid).toBe(false)
        expect(result.error).toContain('consecutive')
      })

      it('should reject special characters', () => {
        const result = validateSubdomain('acme.corp')
        expect(result.valid).toBe(false)
      })

      it('should reject reserved subdomain', () => {
        const result = validateSubdomain('www')
        expect(result.valid).toBe(false)
        expect(result.error).toContain('reserved')
      })

      it('should reject additional reserved subdomain', () => {
        const result = validateSubdomain('google')
        expect(result.valid).toBe(false)
        expect(result.error).toContain('reserved')
      })
    })

    describe('options', () => {
      it('should allow uppercase with option', () => {
        const result = validateSubdomain('ACME', { allowUppercase: true })
        expect(result.valid).toBe(true)
      })

      it('should respect custom minLength', () => {
        expect(validateSubdomain('a', { minLength: 1 })).toEqual({
          valid: true,
          details: expect.anything(),
        })
      })

      it('should respect custom maxLength', () => {
        const result = validateSubdomain('abcdef', { maxLength: 5 })
        expect(result.valid).toBe(false)
      })

      it('should check additional reserved words', () => {
        const result = validateSubdomain('custom', {
          additionalReserved: ['custom', 'blocked'],
        })
        expect(result.valid).toBe(false)
      })
    })
  })

  describe('validateTLD', () => {
    it('should accept valid platform TLD', () => {
      expect(validateTLD('saas.group')).toEqual({ valid: true })
    })

    it('should accept all platform TLDs', () => {
      expect(validateTLD('agents.do')).toEqual({ valid: true })
      expect(validateTLD('workers.do')).toEqual({ valid: true })
      expect(validateTLD('io.sb')).toEqual({ valid: true })
    })

    it('should reject non-platform TLD', () => {
      const result = validateTLD('example.com')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Not a valid platform TLD')
    })
  })

  describe('validateDomain', () => {
    it('should validate both subdomain and TLD', () => {
      expect(validateDomain('acme', 'saas.group')).toEqual({ valid: true })
    })

    it('should fail on invalid subdomain', () => {
      const result = validateDomain('www', 'saas.group')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('reserved')
    })

    it('should fail on invalid TLD', () => {
      const result = validateDomain('acme', 'example.com')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('platform TLD')
    })
  })

  describe('isReserved', () => {
    it('should return true for core reserved', () => {
      expect(isReserved('www')).toBe(true)
      expect(isReserved('admin')).toBe(true)
      expect(isReserved('api')).toBe(true)
    })

    it('should return true for additional reserved', () => {
      expect(isReserved('google')).toBe(true)
      expect(isReserved('beta')).toBe(true)
    })

    it('should return false for non-reserved', () => {
      expect(isReserved('acme')).toBe(false)
      expect(isReserved('mycompany')).toBe(false)
    })

    it('should be case-insensitive', () => {
      expect(isReserved('WWW')).toBe(true)
      expect(isReserved('Admin')).toBe(true)
    })

    it('should respect includeAdditional flag', () => {
      expect(isReserved('google', false)).toBe(false)
      expect(isReserved('www', false)).toBe(true)
    })
  })

  describe('normalizeSubdomain', () => {
    it('should lowercase', () => {
      expect(normalizeSubdomain('ACME')).toBe('acme')
    })

    it('should trim whitespace', () => {
      expect(normalizeSubdomain('  acme  ')).toBe('acme')
    })

    it('should handle both', () => {
      expect(normalizeSubdomain('  ACME  ')).toBe('acme')
    })
  })

  describe('suggestAlternatives', () => {
    it.todo('should suggest suffixes')

    it.todo('should suggest prefixes')

    it.todo('should only return available suggestions')

    it.todo('should respect maxSuggestions')
  })

  describe('getReservedSubdomains', () => {
    it('should return all reserved with additional', () => {
      const reserved = getReservedSubdomains(true)
      expect(reserved).toContain('www')
      expect(reserved).toContain('google')
    })

    it('should return only core without additional', () => {
      const reserved = getReservedSubdomains(false)
      expect(reserved).toContain('www')
      expect(reserved).not.toContain('google')
    })
  })

  describe('constants', () => {
    it('should have ADDITIONAL_RESERVED_SUBDOMAINS', () => {
      expect(ADDITIONAL_RESERVED_SUBDOMAINS).toContain('google')
      expect(ADDITIONAL_RESERVED_SUBDOMAINS).toContain('beta')
    })

    it('should have ALL_RESERVED_SUBDOMAINS', () => {
      expect(ALL_RESERVED_SUBDOMAINS).toContain('www')
      expect(ALL_RESERVED_SUBDOMAINS).toContain('google')
    })
  })
})
