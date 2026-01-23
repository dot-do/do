/**
 * Proxy Utilities
 *
 * Shared utilities for creating Proxy-based dynamic accessors
 * and tagged template interpolation.
 *
 * @module context/proxy
 */

import type { ChainableList } from '../types/context'

// =============================================================================
// Tagged Template Utilities
// =============================================================================

/**
 * Interpolate a tagged template into a string
 *
 * Combines template strings and values into a single string.
 * Values are converted to strings using String().
 *
 * @param strings - Template strings array
 * @param values - Interpolated values
 * @returns Combined string
 *
 * @example
 * ```typescript
 * // In a tagged template function:
 * function tag(strings: TemplateStringsArray, ...values: unknown[]) {
 *   const prompt = interpolateTemplate(strings, values)
 *   // strings: ['hello ', '!'], values: ['world']
 *   // result: 'hello world!'
 * }
 *
 * tag`hello ${'world'}!`
 * ```
 */
export function interpolateTemplate(
  strings: TemplateStringsArray,
  values: unknown[]
): string {
  return strings.reduce((acc, str, i) => {
    const value = values[i]
    const valueStr = value === undefined ? '' : String(value)
    return acc + str + valueStr
  }, '')
}

/**
 * Create a tagged template function wrapper
 *
 * Wraps an executor function to work as a tagged template.
 * The executor receives the interpolated prompt string.
 *
 * @param executor - Function that processes the prompt
 * @returns Tagged template function
 *
 * @example
 * ```typescript
 * const ai = createTaggedTemplateExecutor(async (prompt) => {
 *   return generateText(prompt)
 * })
 *
 * const result = await ai`generate ${content}`
 * ```
 */
export function createTaggedTemplateExecutor<T>(
  executor: (prompt: string) => Promise<T>
): (strings: TemplateStringsArray, ...values: unknown[]) => Promise<T> {
  return (strings: TemplateStringsArray, ...values: unknown[]): Promise<T> => {
    const prompt = interpolateTemplate(strings, values)
    return executor(prompt)
  }
}

// =============================================================================
// Chainable List
// =============================================================================

/**
 * Create a chainable list from a promise
 *
 * Extends a Promise<T[]> with chainable array methods (map, filter, forEach)
 * that preserve the chainable nature.
 *
 * @param promise - Promise that resolves to an array
 * @returns ChainableList with array methods
 *
 * @example
 * ```typescript
 * const users = createChainableList(fetchUsers())
 *
 * // Chain operations
 * const emails = await users
 *   .filter(u => u.active)
 *   .map(u => u.email)
 *
 * // Or iterate
 * await users.forEach(u => sendEmail(u))
 * ```
 */
export function createChainableList<T>(promise: Promise<T[]>): ChainableList<T> {
  // Start with the base promise
  const chainable = promise as ChainableList<T>

  /**
   * Map over items, returning a new chainable list
   */
  chainable.map = <U>(fn: (item: T) => U | Promise<U>): ChainableList<U> => {
    const mapped = promise.then(async (items) => {
      const results: U[] = []
      for (const item of items) {
        results.push(await fn(item))
      }
      return results
    })
    return createChainableList(mapped)
  }

  /**
   * Filter items, returning a new chainable list
   */
  chainable.filter = (fn: (item: T) => boolean | Promise<boolean>): ChainableList<T> => {
    const filtered = promise.then(async (items) => {
      const results: T[] = []
      for (const item of items) {
        if (await fn(item)) {
          results.push(item)
        }
      }
      return results
    })
    return createChainableList(filtered)
  }

  /**
   * Iterate over items
   */
  chainable.forEach = async (fn: (item: T) => void | Promise<void>): Promise<void> => {
    const items = await promise
    for (const item of items) {
      await fn(item)
    }
  }

  return chainable
}

// =============================================================================
// Proxy Helpers
// =============================================================================

/**
 * Create a lazy property getter
 *
 * Returns a getter function that initializes the property on first access.
 *
 * @param initializer - Function that creates the property value
 * @returns Getter function
 *
 * @example
 * ```typescript
 * let _ai: AIContext | null = null
 * const getAI = createLazyGetter(() => createAIContext())
 *
 * // In context:
 * get ai() { return getAI() }
 * ```
 */
export function createLazyGetter<T>(initializer: () => T): () => T {
  let value: T | null = null
  let initialized = false

  return (): T => {
    if (!initialized) {
      value = initializer()
      initialized = true
    }
    return value as T
  }
}

/**
 * Create a proxy that catches all property access
 *
 * Useful for creating dynamic accessor patterns like $.db.User or $.on.Customer.created
 *
 * @param handler - Function called for each property access
 * @returns Proxy object
 *
 * @example
 * ```typescript
 * const db = createDynamicProxy((prop) => {
 *   if (typeof prop === 'string' && /^[A-Z]/.test(prop)) {
 *     return createCollection(prop)
 *   }
 * })
 *
 * db.User // calls handler('User')
 * db.Order // calls handler('Order')
 * ```
 */
export function createDynamicProxy<T extends object>(
  handler: (prop: string | symbol) => unknown
): T {
  return new Proxy({} as T, {
    get(_, prop) {
      return handler(prop)
    },
  })
}

/**
 * Create a nested proxy for noun.verb patterns
 *
 * @param nounHandler - Function called for noun access
 * @param verbHandler - Function called for verb access
 * @returns Nested proxy
 *
 * @example
 * ```typescript
 * const on = createNestedProxy(
 *   (noun) => createVerbProxy(noun),
 *   (noun, verb) => (handler) => register(`${noun}.${verb}`, handler)
 * )
 *
 * on.Customer.created(handler)
 * ```
 */
export function createNestedProxy<T extends object>(
  getVerbProxy: (noun: string) => object
): T {
  return new Proxy({} as T, {
    get(_, noun) {
      if (typeof noun !== 'string') return undefined
      return getVerbProxy(noun)
    },
  })
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a value is a Promise
 */
export function isPromise<T>(value: unknown): value is Promise<T> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'then' in value &&
    typeof (value as Promise<T>).then === 'function'
  )
}

/**
 * Check if a string looks like a collection name (starts with uppercase)
 */
export function isCollectionName(value: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(value)
}

/**
 * Check if a string looks like an event name (Noun.verb)
 */
export function isEventName(value: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/.test(value)
}

// =============================================================================
// String Utilities
// =============================================================================

/**
 * Convert camelCase to kebab-case
 */
export function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * Convert kebab-case to camelCase
 */
export function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

/**
 * Convert to PascalCase (for collection names)
 */
export function toPascalCase(str: string): string {
  const camel = toCamelCase(str)
  return camel.charAt(0).toUpperCase() + camel.slice(1)
}
