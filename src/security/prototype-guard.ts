/**
 * @module prototype-guard
 * @dotdo/do Prototype Pollution Prevention
 *
 * Security utilities to prevent prototype pollution attacks in the code sandbox.
 * Prototype pollution is a security vulnerability where an attacker can inject
 * properties into Object.prototype or other built-in prototypes, affecting all
 * objects in the application.
 *
 * @example
 * ```typescript
 * import {
 *   freezePrototypes,
 *   isPrototypePolluted,
 *   safeObjectAssign,
 *   safeJsonParse,
 *   createSandboxedObject
 * } from '@dotdo/do/security'
 *
 * // Freeze prototypes before executing untrusted code
 * freezePrototypes()
 *
 * // Check if prototypes have been polluted
 * if (isPrototypePolluted()) {
 *   throw new Error('Prototype pollution detected!')
 * }
 *
 * // Use safe versions of Object.assign and JSON.parse
 * const safe = safeObjectAssign({}, userInput)
 * const parsed = safeJsonParse(jsonString)
 *
 * // Create objects with null prototype for maximum safety
 * const sandboxed = createSandboxedObject({ key: 'value' })
 * ```
 *
 * @security
 * This module provides defense-in-depth against prototype pollution:
 * - Freezes built-in prototypes to prevent modification
 * - Detects if prototypes have been tampered with
 * - Provides safe alternatives to common pollution vectors
 * - Creates sandboxed objects that cannot be polluted
 */

/**
 * Dangerous keys that should be filtered from objects to prevent prototype pollution.
 * These keys can be used to modify the prototype chain.
 */
export const DANGEROUS_KEYS = Object.freeze([
  '__proto__',
  'constructor',
  'prototype',
] as const)

/**
 * Type for dangerous keys that can cause prototype pollution.
 */
export type DangerousKey = (typeof DANGEROUS_KEYS)[number]

/**
 * Built-in prototypes that should be frozen to prevent modification.
 */
const BUILT_IN_PROTOTYPES = [
  Object.prototype,
  Array.prototype,
  String.prototype,
  Number.prototype,
  Boolean.prototype,
  Function.prototype,
  RegExp.prototype,
  Date.prototype,
  Error.prototype,
  Map.prototype,
  Set.prototype,
  WeakMap.prototype,
  WeakSet.prototype,
  Promise.prototype,
  Symbol.prototype,
] as const

/**
 * Storage for original prototype properties to check for pollution.
 * @internal
 */
const originalPrototypeProperties = new Map<object, Set<string>>()

/**
 * Track whether prototypes have been frozen.
 * @internal
 */
let prototypesFrozen = false

/**
 * Freeze all built-in prototypes to prevent modification.
 *
 * This function freezes Object.prototype, Array.prototype, String.prototype,
 * and other built-in prototypes to prevent attackers from adding properties
 * that would affect all objects.
 *
 * Note: This is a one-way operation and cannot be reversed. Call this
 * before executing any untrusted code.
 *
 * @example
 * ```typescript
 * import { freezePrototypes } from '@dotdo/do/security'
 *
 * // Freeze before running untrusted code
 * freezePrototypes()
 *
 * // Now attempts to modify prototypes will fail silently (or throw in strict mode)
 * Object.prototype.polluted = true // Has no effect
 * ```
 */
export function freezePrototypes(): void {
  if (prototypesFrozen) {
    return // Already frozen
  }

  // Store original properties for pollution detection
  for (const proto of BUILT_IN_PROTOTYPES) {
    const props = new Set(Object.getOwnPropertyNames(proto))
    originalPrototypeProperties.set(proto, props)
  }

  // Freeze all built-in prototypes
  for (const proto of BUILT_IN_PROTOTYPES) {
    try {
      Object.freeze(proto)
    } catch {
      // Some environments may not allow freezing certain prototypes
      // Continue with the rest
    }
  }

  prototypesFrozen = true
}

/**
 * Check if any built-in prototype has been polluted.
 *
 * Compares current prototype properties against the original state
 * to detect if any new properties have been added (pollution).
 *
 * @returns `true` if pollution is detected, `false` otherwise
 *
 * @example
 * ```typescript
 * import { isPrototypePolluted, freezePrototypes } from '@dotdo/do/security'
 *
 * // Store original state
 * freezePrototypes()
 *
 * // Later, check for pollution
 * if (isPrototypePolluted()) {
 *   console.error('Prototype pollution detected!')
 *   // Take corrective action
 * }
 * ```
 */
export function isPrototypePolluted(): boolean {
  // Check common pollution indicators first (fast path)
  if ('polluted' in Object.prototype) {
    return true
  }

  // If we have stored original properties, do a thorough check
  if (originalPrototypeProperties.size > 0) {
    for (const [proto, originalProps] of originalPrototypeProperties) {
      const currentProps = Object.getOwnPropertyNames(proto)
      for (const prop of currentProps) {
        if (!originalProps.has(prop)) {
          return true // New property detected
        }
      }
    }
  }

  // Check for common pollution patterns on Object.prototype
  const suspiciousProps = [
    'polluted',
    'isAdmin',
    'admin',
    'role',
    '__lookupGetter__',
  ]

  for (const prop of suspiciousProps) {
    const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, prop)
    // These properties shouldn't have value descriptors on Object.prototype
    // (they're either not present or are getter/setter pairs)
    if (descriptor && 'value' in descriptor && descriptor.value !== undefined) {
      // __lookupGetter__ is a legitimate property, skip it
      if (prop === '__lookupGetter__') continue
      return true
    }
  }

  return false
}

/**
 * Check if a key is dangerous (could cause prototype pollution).
 *
 * @param key - The key to check
 * @returns `true` if the key is dangerous, `false` otherwise
 *
 * @example
 * ```typescript
 * import { isDangerousKey } from '@dotdo/do/security'
 *
 * isDangerousKey('__proto__')    // true
 * isDangerousKey('constructor')  // true
 * isDangerousKey('prototype')    // true
 * isDangerousKey('name')         // false
 * ```
 */
export function isDangerousKey(key: string): key is DangerousKey {
  return DANGEROUS_KEYS.includes(key as DangerousKey)
}

/**
 * Recursively remove dangerous keys from an object.
 *
 * @param obj - Object to sanitize
 * @param visited - Set of visited objects (for circular reference detection)
 * @returns Sanitized object (same reference, modified in place)
 *
 * @internal
 */
function sanitizeObject<T>(obj: T, visited: WeakSet<object> = new WeakSet()): T {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  // Handle circular references
  if (visited.has(obj as object)) {
    return obj
  }
  visited.add(obj as object)

  // Handle arrays
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      obj[i] = sanitizeObject(obj[i], visited)
    }
    return obj
  }

  // Handle plain objects
  const keys = Object.keys(obj)
  for (const key of keys) {
    if (isDangerousKey(key)) {
      delete (obj as Record<string, unknown>)[key]
    } else {
      (obj as Record<string, unknown>)[key] = sanitizeObject(
        (obj as Record<string, unknown>)[key],
        visited
      )
    }
  }

  return obj
}

/**
 * Safe version of Object.assign that filters out __proto__ and constructor keys.
 *
 * This function prevents prototype pollution by removing dangerous keys
 * from source objects before merging them into the target.
 *
 * @param target - Target object to merge into
 * @param sources - Source objects to merge from
 * @returns Target object with merged properties (dangerous keys filtered)
 *
 * @example
 * ```typescript
 * import { safeObjectAssign } from '@dotdo/do/security'
 *
 * const malicious = { __proto__: { polluted: true }, safe: 'value' }
 * const result = safeObjectAssign({}, malicious)
 *
 * console.log(result.safe)        // 'value'
 * console.log(({}).polluted)      // undefined (not polluted)
 * ```
 *
 * @example
 * ```typescript
 * // Multiple sources
 * const a = { x: 1 }
 * const b = { y: 2, __proto__: { bad: true } }
 * const c = { z: 3 }
 *
 * const result = safeObjectAssign({}, a, b, c)
 * // result = { x: 1, y: 2, z: 3 }
 * // Object.prototype.bad is undefined
 * ```
 */
export function safeObjectAssign<T extends object>(
  target: T,
  ...sources: Array<object | null | undefined>
): T {
  for (const source of sources) {
    if (source === null || source === undefined) {
      continue
    }

    // Get own enumerable string-keyed properties
    const keys = Object.keys(source)

    for (const key of keys) {
      // Skip dangerous keys
      if (isDangerousKey(key)) {
        continue
      }

      // Get the value safely using Object.getOwnPropertyDescriptor
      // to avoid triggering getters on __proto__
      const descriptor = Object.getOwnPropertyDescriptor(source, key)
      if (descriptor && 'value' in descriptor) {
        let value = descriptor.value

        // Recursively sanitize nested objects
        if (value !== null && typeof value === 'object') {
          value = sanitizeObject(structuredClone(value))
        }

        (target as Record<string, unknown>)[key] = value
      }
    }
  }

  return target
}

/**
 * JSON reviver function that filters out dangerous keys.
 *
 * @param key - Property key
 * @param value - Property value
 * @returns The value if safe, undefined if dangerous
 *
 * @internal
 */
function safeReviver(key: string, value: unknown): unknown {
  if (isDangerousKey(key)) {
    return undefined
  }
  return value
}

/**
 * Safe version of JSON.parse that removes __proto__ and constructor keys.
 *
 * This function prevents prototype pollution from JSON payloads by filtering
 * out dangerous keys during parsing.
 *
 * @param json - JSON string to parse
 * @param reviver - Optional additional reviver function
 * @returns Parsed object with dangerous keys removed
 * @throws {SyntaxError} If the JSON is invalid
 *
 * @example
 * ```typescript
 * import { safeJsonParse } from '@dotdo/do/security'
 *
 * const malicious = '{"__proto__":{"polluted":true},"safe":"value"}'
 * const result = safeJsonParse(malicious)
 *
 * console.log(result.safe)        // 'value'
 * console.log(({}).polluted)      // undefined (not polluted)
 * ```
 *
 * @example
 * ```typescript
 * // With custom reviver
 * const json = '{"date":"2024-01-01","__proto__":{"bad":true}}'
 * const result = safeJsonParse(json, (key, value) => {
 *   if (key === 'date') return new Date(value)
 *   return value
 * })
 * ```
 */
export function safeJsonParse<T = unknown>(
  json: string,
  reviver?: (key: string, value: unknown) => unknown
): T {
  // Combine safe reviver with custom reviver
  const combinedReviver = (key: string, value: unknown): unknown => {
    // First apply safe filtering
    const safeValue = safeReviver(key, value)
    if (safeValue === undefined && isDangerousKey(key)) {
      return undefined
    }

    // Then apply custom reviver if provided
    if (reviver) {
      return reviver(key, safeValue)
    }

    return safeValue
  }

  return JSON.parse(json, combinedReviver) as T
}

/**
 * Create an object with a null prototype, immune to prototype pollution.
 *
 * Objects created with null prototype do not inherit from Object.prototype,
 * making them immune to prototype pollution attacks. Any pollution of
 * Object.prototype will not affect these objects.
 *
 * @param properties - Optional properties to add to the object
 * @returns New object with null prototype
 *
 * @example
 * ```typescript
 * import { createSandboxedObject } from '@dotdo/do/security'
 *
 * // Create empty sandboxed object
 * const empty = createSandboxedObject()
 * console.log(Object.getPrototypeOf(empty)) // null
 *
 * // Create sandboxed object with properties
 * const data = createSandboxedObject({ key: 'value', count: 42 })
 * console.log(data.key)   // 'value'
 * console.log(data.count) // 42
 *
 * // Immune to prototype pollution
 * Object.prototype.polluted = true
 * console.log(data.polluted) // undefined (not affected!)
 * ```
 *
 * @example
 * ```typescript
 * // Safe lookup tables
 * const lookup = createSandboxedObject({
 *   admin: true,
 *   user: false
 * })
 *
 * // Even if Object.prototype.guest is set to true,
 * // lookup.guest will be undefined
 * console.log(lookup['admin'])   // true
 * console.log(lookup['guest'])   // undefined
 * ```
 */
export function createSandboxedObject<T extends Record<string, unknown>>(
  properties?: T
): T {
  const obj = Object.create(null) as T

  if (properties) {
    for (const key of Object.keys(properties)) {
      // Skip dangerous keys even in initial properties
      if (isDangerousKey(key)) {
        continue
      }

      let value = properties[key]

      // Recursively create sandboxed objects for nested objects
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        value = createSandboxedObject(value as Record<string, unknown>) as T[string]
      }

      obj[key as keyof T] = value
    }
  }

  return obj
}

/**
 * Deep clone an object while removing dangerous keys.
 *
 * Creates a deep copy of the object with all __proto__, constructor,
 * and prototype keys removed at every level.
 *
 * @param obj - Object to clone
 * @returns Deep cloned object with dangerous keys removed
 *
 * @example
 * ```typescript
 * import { deepCloneSafe } from '@dotdo/do/security'
 *
 * const dirty = {
 *   data: 'safe',
 *   nested: {
 *     __proto__: { bad: true },
 *     value: 123
 *   }
 * }
 *
 * const clean = deepCloneSafe(dirty)
 * // clean = { data: 'safe', nested: { value: 123 } }
 * ```
 */
export function deepCloneSafe<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  // Use structuredClone for the deep copy, then sanitize
  const cloned = structuredClone(obj)
  return sanitizeObject(cloned)
}

/**
 * Validate that an object has not been tampered with prototype pollution techniques.
 *
 * Checks if an object has any properties that could indicate prototype pollution,
 * such as __proto__ keys in the object's own properties.
 *
 * @param obj - Object to validate
 * @returns `true` if the object appears safe, `false` if pollution indicators found
 *
 * @example
 * ```typescript
 * import { isObjectSafe } from '@dotdo/do/security'
 *
 * const safe = { key: 'value' }
 * const unsafe = { __proto__: { polluted: true } }
 *
 * console.log(isObjectSafe(safe))   // true
 * console.log(isObjectSafe(unsafe)) // false
 * ```
 */
export function isObjectSafe(obj: unknown): boolean {
  if (obj === null || typeof obj !== 'object') {
    return true // Primitives are safe
  }

  // Check for dangerous keys in own properties
  const keys = Object.keys(obj as object)
  for (const key of keys) {
    if (isDangerousKey(key)) {
      return false
    }

    // Recursively check nested objects
    const value = (obj as Record<string, unknown>)[key]
    if (!isObjectSafe(value)) {
      return false
    }
  }

  return true
}

/**
 * Wrap an object with a Proxy that blocks prototype pollution attempts.
 *
 * The proxy intercepts all property assignments and throws an error
 * if an attempt is made to set dangerous keys like __proto__.
 *
 * @param obj - Object to wrap
 * @returns Proxy-wrapped object that blocks pollution attempts
 *
 * @example
 * ```typescript
 * import { createProtectedObject } from '@dotdo/do/security'
 *
 * const protected = createProtectedObject({ data: 'safe' })
 *
 * protected.newKey = 'allowed'     // OK
 * protected.__proto__ = {}         // Throws Error
 * protected['constructor'] = {}    // Throws Error
 * ```
 */
export function createProtectedObject<T extends object>(obj: T): T {
  return new Proxy(obj, {
    set(target, prop, value, receiver) {
      if (typeof prop === 'string' && isDangerousKey(prop)) {
        throw new Error(`Cannot set dangerous property: ${prop}`)
      }
      return Reflect.set(target, prop, value, receiver)
    },

    defineProperty(target, prop, descriptor) {
      if (typeof prop === 'string' && isDangerousKey(prop)) {
        throw new Error(`Cannot define dangerous property: ${prop}`)
      }
      return Reflect.defineProperty(target, prop, descriptor)
    },

    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)

      // Wrap nested objects automatically
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        return createProtectedObject(value)
      }

      return value
    },
  })
}
