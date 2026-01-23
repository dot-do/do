/**
 * Tests for Proxy Utilities
 *
 * @module context/__tests__/proxy
 */

import { describe, it, expect } from 'vitest'
import {
  interpolateTemplate,
  createTaggedTemplateExecutor,
  createChainableList,
  createLazyGetter,
  createDynamicProxy,
  isPromise,
  isCollectionName,
  isEventName,
  toKebabCase,
  toCamelCase,
  toPascalCase,
} from './proxy'

describe('interpolateTemplate', () => {
  it('should combine strings and values', () => {
    const strings = ['hello ', '!'] as unknown as TemplateStringsArray
    const values = ['world']
    const result = interpolateTemplate(strings, values)
    expect(result).toBe('hello world!')
  })

  it('should handle empty values', () => {
    const strings = ['hello ', ''] as unknown as TemplateStringsArray
    const values = ['world']
    const result = interpolateTemplate(strings, values)
    expect(result).toBe('hello world')
  })

  it('should handle undefined values', () => {
    const strings = ['hello ', '!'] as unknown as TemplateStringsArray
    const values = [undefined]
    const result = interpolateTemplate(strings, values)
    expect(result).toBe('hello !')
  })

  it('should convert non-string values', () => {
    const strings = ['count: ', ''] as unknown as TemplateStringsArray
    const values = [42]
    const result = interpolateTemplate(strings, values)
    expect(result).toBe('count: 42')
  })

  it('should handle multiple values', () => {
    const strings = ['', ' + ', ' = ', ''] as unknown as TemplateStringsArray
    const values = [1, 2, 3]
    const result = interpolateTemplate(strings, values)
    expect(result).toBe('1 + 2 = 3')
  })
})

describe('createTaggedTemplateExecutor', () => {
  it('should create a tagged template function', async () => {
    const executor = async (prompt: string) => `Result: ${prompt}`
    const fn = createTaggedTemplateExecutor(executor)

    const result = await fn`hello ${'world'}`
    expect(result).toBe('Result: hello world')
  })
})

describe('createChainableList', () => {
  it('should create a promise-like object', async () => {
    const list = createChainableList(Promise.resolve([1, 2, 3]))
    const result = await list
    expect(result).toEqual([1, 2, 3])
  })

  it('should support map', async () => {
    const list = createChainableList(Promise.resolve([1, 2, 3]))
    const result = await list.map(x => x * 2)
    expect(result).toEqual([2, 4, 6])
  })

  it('should support async map', async () => {
    const list = createChainableList(Promise.resolve([1, 2, 3]))
    const result = await list.map(async x => x * 2)
    expect(result).toEqual([2, 4, 6])
  })

  it('should support filter', async () => {
    const list = createChainableList(Promise.resolve([1, 2, 3, 4]))
    const result = await list.filter(x => x % 2 === 0)
    expect(result).toEqual([2, 4])
  })

  it('should support async filter', async () => {
    const list = createChainableList(Promise.resolve([1, 2, 3, 4]))
    const result = await list.filter(async x => x % 2 === 0)
    expect(result).toEqual([2, 4])
  })

  it('should support chaining map and filter', async () => {
    const list = createChainableList(Promise.resolve([1, 2, 3, 4]))
    const result = await list
      .filter(x => x % 2 === 0)
      .map(x => x * 10)
    expect(result).toEqual([20, 40])
  })

  it('should support forEach', async () => {
    const list = createChainableList(Promise.resolve([1, 2, 3]))
    const collected: number[] = []
    await list.forEach(x => { collected.push(x) })
    expect(collected).toEqual([1, 2, 3])
  })
})

describe('createLazyGetter', () => {
  it('should initialize on first access', () => {
    let initialized = false
    const getter = createLazyGetter(() => {
      initialized = true
      return 'value'
    })

    expect(initialized).toBe(false)
    const result = getter()
    expect(initialized).toBe(true)
    expect(result).toBe('value')
  })

  it('should return same value on subsequent access', () => {
    let callCount = 0
    const getter = createLazyGetter(() => {
      callCount++
      return { id: callCount }
    })

    const result1 = getter()
    const result2 = getter()

    expect(callCount).toBe(1)
    expect(result1).toBe(result2)
  })
})

describe('createDynamicProxy', () => {
  it('should call handler for property access', () => {
    const proxy = createDynamicProxy<{ [key: string]: string }>(
      (prop) => `accessed: ${String(prop)}`
    )

    expect(proxy.foo).toBe('accessed: foo')
    expect(proxy.bar).toBe('accessed: bar')
  })
})

describe('isPromise', () => {
  it('should return true for promises', () => {
    expect(isPromise(Promise.resolve())).toBe(true)
    expect(isPromise(new Promise(() => {}))).toBe(true)
  })

  it('should return false for non-promises', () => {
    expect(isPromise(null)).toBe(false)
    expect(isPromise(undefined)).toBe(false)
    expect(isPromise(42)).toBe(false)
    expect(isPromise('string')).toBe(false)
    expect(isPromise({})).toBe(false)
    expect(isPromise({ then: 'not a function' })).toBe(false)
  })
})

describe('isCollectionName', () => {
  it('should return true for valid collection names', () => {
    expect(isCollectionName('User')).toBe(true)
    expect(isCollectionName('Order')).toBe(true)
    expect(isCollectionName('CustomerOrder')).toBe(true)
    expect(isCollectionName('Item123')).toBe(true)
  })

  it('should return false for invalid collection names', () => {
    expect(isCollectionName('user')).toBe(false)
    expect(isCollectionName('_User')).toBe(false)
    expect(isCollectionName('123User')).toBe(false)
    expect(isCollectionName('User-Order')).toBe(false)
  })
})

describe('isEventName', () => {
  it('should return true for valid event names', () => {
    expect(isEventName('Customer.created')).toBe(true)
    expect(isEventName('Order.placed')).toBe(true)
    expect(isEventName('Payment.received')).toBe(true)
  })

  it('should return false for invalid event names', () => {
    expect(isEventName('customer.created')).toBe(false)
    expect(isEventName('Customer.Created')).toBe(false)
    expect(isEventName('Customer')).toBe(false)
    expect(isEventName('customer')).toBe(false)
  })
})

describe('String utilities', () => {
  describe('toKebabCase', () => {
    it('should convert camelCase to kebab-case', () => {
      expect(toKebabCase('camelCase')).toBe('camel-case')
      expect(toKebabCase('someVariableName')).toBe('some-variable-name')
      expect(toKebabCase('already-kebab')).toBe('already-kebab')
    })
  })

  describe('toCamelCase', () => {
    it('should convert kebab-case to camelCase', () => {
      expect(toCamelCase('kebab-case')).toBe('kebabCase')
      expect(toCamelCase('some-variable-name')).toBe('someVariableName')
      expect(toCamelCase('alreadyCamel')).toBe('alreadyCamel')
    })
  })

  describe('toPascalCase', () => {
    it('should convert to PascalCase', () => {
      expect(toPascalCase('kebab-case')).toBe('KebabCase')
      expect(toPascalCase('some-name')).toBe('SomeName')
      expect(toPascalCase('already')).toBe('Already')
    })
  })
})
