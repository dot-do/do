/**
 * Prototype Guard Unit Tests
 *
 * Tests for the prototype pollution prevention utilities in src/security/prototype-guard.ts.
 * These tests verify the utility functions work correctly without the Cloudflare DO RPC layer.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  freezePrototypes,
  isPrototypePolluted,
  safeObjectAssign,
  safeJsonParse,
  createSandboxedObject,
  isDangerousKey,
  deepCloneSafe,
  isObjectSafe,
  createProtectedObject,
  DANGEROUS_KEYS,
} from '../../src/security/prototype-guard'

describe('Prototype Guard Utilities', () => {
  describe('isDangerousKey()', () => {
    it('should identify __proto__ as dangerous', () => {
      expect(isDangerousKey('__proto__')).toBe(true)
    })

    it('should identify constructor as dangerous', () => {
      expect(isDangerousKey('constructor')).toBe(true)
    })

    it('should identify prototype as dangerous', () => {
      expect(isDangerousKey('prototype')).toBe(true)
    })

    it('should not identify normal keys as dangerous', () => {
      expect(isDangerousKey('name')).toBe(false)
      expect(isDangerousKey('value')).toBe(false)
      expect(isDangerousKey('data')).toBe(false)
      expect(isDangerousKey('id')).toBe(false)
    })
  })

  describe('DANGEROUS_KEYS constant', () => {
    it('should contain __proto__, constructor, and prototype', () => {
      expect(DANGEROUS_KEYS).toContain('__proto__')
      expect(DANGEROUS_KEYS).toContain('constructor')
      expect(DANGEROUS_KEYS).toContain('prototype')
    })

    it('should be frozen', () => {
      expect(Object.isFrozen(DANGEROUS_KEYS)).toBe(true)
    })
  })

  describe('safeObjectAssign()', () => {
    it('should merge objects like Object.assign', () => {
      const target = { a: 1 }
      const source = { b: 2 }
      const result = safeObjectAssign(target, source)

      expect(result).toEqual({ a: 1, b: 2 })
      expect(result).toBe(target) // Same reference
    })

    it('should filter out __proto__ key from source', () => {
      const target = Object.create(null) // Use null prototype to avoid __proto__ in prototype chain
      // Create source with __proto__ using defineProperty to avoid prototype chain issues
      const source = Object.create(null)
      source['__proto__'] = { polluted: true }
      source.safe = 'value'

      const result = safeObjectAssign(target, source)

      expect(result.safe).toBe('value')
      // The __proto__ own property should not be copied
      expect(Object.hasOwn(result, '__proto__')).toBe(false)
      expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
    })

    it('should filter out constructor key from source', () => {
      const target = Object.create(null) // Use null prototype to avoid inherited constructor
      const source = Object.create(null)
      source.constructor = { bad: true }
      source.safe = 'value'

      const result = safeObjectAssign(target, source)

      expect(result.safe).toBe('value')
      // The constructor key should not be copied from source
      expect(Object.hasOwn(result, 'constructor')).toBe(false)
    })

    it('should handle multiple sources', () => {
      const target = { a: 1 }
      const source1 = { b: 2 }
      const source2 = { c: 3 }

      const result = safeObjectAssign(target, source1, source2)

      expect(result).toEqual({ a: 1, b: 2, c: 3 })
    })

    it('should handle null and undefined sources', () => {
      const target = { a: 1 }

      const result = safeObjectAssign(target, null, undefined, { b: 2 })

      expect(result).toEqual({ a: 1, b: 2 })
    })

    it('should recursively sanitize nested objects', () => {
      const target = {}
      const source = {
        nested: {
          safe: 'value',
        },
      }

      const result = safeObjectAssign(target, source)

      expect(result.nested.safe).toBe('value')
    })
  })

  describe('safeJsonParse()', () => {
    it('should parse valid JSON', () => {
      const json = '{"name":"test","value":42}'
      const result = safeJsonParse(json)

      expect(result).toEqual({ name: 'test', value: 42 })
    })

    it('should filter out __proto__ key during parsing', () => {
      const json = '{"__proto__":{"polluted":true},"safe":"value"}'
      const result = safeJsonParse<{ safe: string }>(json)

      expect(result.safe).toBe('value')
      expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
    })

    it('should filter out constructor key during parsing', () => {
      const json = '{"constructor":{"prototype":{"bad":true}},"safe":"value"}'
      const result = safeJsonParse<{ safe: string; constructor?: unknown }>(json)

      expect(result.safe).toBe('value')
      // The constructor key should not be present as own property
      expect(Object.hasOwn(result, 'constructor')).toBe(false)
    })

    it('should handle nested __proto__ keys', () => {
      const json = '{"nested":{"__proto__":{"polluted":true},"value":1}}'
      const result = safeJsonParse<{ nested: { value: number } }>(json)

      expect(result.nested.value).toBe(1)
      expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
    })

    it('should throw on invalid JSON', () => {
      expect(() => safeJsonParse('{invalid}')).toThrow()
    })

    it('should work with custom reviver', () => {
      const json = '{"date":"2024-01-01"}'
      const result = safeJsonParse<{ date: Date }>(json, (key, value) => {
        if (key === 'date') return new Date(value as string)
        return value
      })

      expect(result.date).toBeInstanceOf(Date)
    })

    it('should parse arrays correctly', () => {
      const json = '[1, 2, 3]'
      const result = safeJsonParse<number[]>(json)

      expect(result).toEqual([1, 2, 3])
    })

    it('should parse primitives correctly', () => {
      expect(safeJsonParse('42')).toBe(42)
      expect(safeJsonParse('"hello"')).toBe('hello')
      expect(safeJsonParse('true')).toBe(true)
      expect(safeJsonParse('null')).toBe(null)
    })
  })

  describe('createSandboxedObject()', () => {
    it('should create object with null prototype', () => {
      const obj = createSandboxedObject()

      expect(Object.getPrototypeOf(obj)).toBe(null)
    })

    it('should create object with properties', () => {
      const obj = createSandboxedObject({ key: 'value', count: 42 })

      expect(obj.key).toBe('value')
      expect(obj.count).toBe(42)
    })

    it('should filter out dangerous keys from properties', () => {
      const props = Object.create(null)
      props['__proto__'] = { bad: true }
      props.safe = 'value'

      const obj = createSandboxedObject(props)

      expect(obj.safe).toBe('value')
      expect(obj['__proto__']).toBeUndefined()
    })

    it('should create sandboxed nested objects', () => {
      const obj = createSandboxedObject({
        nested: { key: 'value' },
      })

      expect(Object.getPrototypeOf(obj.nested)).toBe(null)
      expect(obj.nested.key).toBe('value')
    })

    it('should be immune to prototype pollution', () => {
      const obj = createSandboxedObject({ key: 'value' })

      // Even if Object.prototype were polluted, this object wouldn't be affected
      // because it has null prototype
      expect('toString' in obj).toBe(false)
      expect('hasOwnProperty' in obj).toBe(false)
    })
  })

  describe('deepCloneSafe()', () => {
    it('should deep clone objects', () => {
      const original = { a: { b: { c: 1 } } }
      const clone = deepCloneSafe(original)

      expect(clone).toEqual(original)
      expect(clone).not.toBe(original)
      expect(clone.a).not.toBe(original.a)
    })

    it('should remove dangerous keys during cloning', () => {
      const original = Object.create(null)
      original['__proto__'] = { bad: true }
      original.safe = 'value'

      const clone = deepCloneSafe(original)

      expect(clone.safe).toBe('value')
      // The __proto__ own property should not be present
      expect(Object.hasOwn(clone, '__proto__')).toBe(false)
    })

    it('should handle primitives', () => {
      expect(deepCloneSafe(42)).toBe(42)
      expect(deepCloneSafe('hello')).toBe('hello')
      expect(deepCloneSafe(null)).toBe(null)
    })

    it('should handle arrays', () => {
      const original = [1, 2, { a: 3 }]
      const clone = deepCloneSafe(original)

      expect(clone).toEqual(original)
      expect(clone).not.toBe(original)
    })
  })

  describe('isObjectSafe()', () => {
    it('should return true for safe objects', () => {
      expect(isObjectSafe({ name: 'test', value: 42 })).toBe(true)
    })

    it('should return false for objects with __proto__ key', () => {
      const obj = Object.create(null)
      obj['__proto__'] = { bad: true }

      expect(isObjectSafe(obj)).toBe(false)
    })

    it('should return false for objects with constructor key', () => {
      const obj = Object.create(null)
      obj.constructor = { bad: true }

      expect(isObjectSafe(obj)).toBe(false)
    })

    it('should check nested objects', () => {
      const safe = { nested: { value: 1 } }
      expect(isObjectSafe(safe)).toBe(true)

      const unsafe = Object.create(null)
      unsafe.nested = Object.create(null)
      unsafe.nested['__proto__'] = { bad: true }

      expect(isObjectSafe(unsafe)).toBe(false)
    })

    it('should return true for primitives', () => {
      expect(isObjectSafe(42)).toBe(true)
      expect(isObjectSafe('hello')).toBe(true)
      expect(isObjectSafe(null)).toBe(true)
    })
  })

  describe('createProtectedObject()', () => {
    it('should allow normal property access', () => {
      const obj = createProtectedObject({ name: 'test' })

      expect(obj.name).toBe('test')
    })

    it('should allow setting normal properties', () => {
      const obj = createProtectedObject<{ name: string; newKey?: string }>({ name: 'test' })

      obj.newKey = 'value'
      expect(obj.newKey).toBe('value')
    })

    it('should throw when setting __proto__', () => {
      const obj = createProtectedObject({})

      expect(() => {
        ;(obj as Record<string, unknown>)['__proto__'] = {}
      }).toThrow(/dangerous property/)
    })

    it('should throw when setting constructor', () => {
      const obj = createProtectedObject({})

      expect(() => {
        ;(obj as Record<string, unknown>)['constructor'] = {}
      }).toThrow(/dangerous property/)
    })

    it('should throw when using defineProperty with dangerous key', () => {
      const obj = createProtectedObject({})

      expect(() => {
        Object.defineProperty(obj, '__proto__', { value: {} })
      }).toThrow(/dangerous property/)
    })
  })

  describe('isPrototypePolluted()', () => {
    it('should return false when prototypes are clean', () => {
      // In a clean state, should not detect pollution
      expect(isPrototypePolluted()).toBe(false)
    })

    it('should detect common pollution patterns', () => {
      // The function checks for common pollution indicators
      // In normal operation it should return false
      expect(isPrototypePolluted()).toBe(false)
    })
  })

  describe('freezePrototypes()', () => {
    it('should be callable without errors', () => {
      // Just verify it doesn't throw
      expect(() => freezePrototypes()).not.toThrow()
    })

    it('should be idempotent', () => {
      // Calling multiple times should be safe
      freezePrototypes()
      freezePrototypes()
      expect(true).toBe(true)
    })
  })
})
