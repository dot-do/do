/**
 * Tests for the main DO Context ($)
 *
 * @module context/__tests__/context
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createContext, DO } from './index'
import type { DOContext } from '../types/context'
import type { DigitalObjectIdentity } from '../types/identity'

describe('DOContext', () => {
  let $: DOContext
  let identity: DigitalObjectIdentity

  beforeEach(() => {
    identity = {
      $id: 'https://test.do',
      $type: 'Test',
      $version: 1,
      $createdAt: Date.now(),
      $updatedAt: Date.now(),
    }
    $ = createContext(identity)
  })

  describe('createContext', () => {
    it('should create a context with identity properties', () => {
      expect($.$id).toBe('https://test.do')
      expect($.$type).toBe('Test')
    })

    it('should have all context properties defined', () => {
      expect($.ai).toBeDefined()
      expect($.db).toBeDefined()
      expect($.on).toBeDefined()
      expect($.every).toBeDefined()
      expect($.email).toBeDefined()
      expect($.slack).toBeDefined()
      expect($.sms).toBeDefined()
      expect($.call).toBeDefined()
      expect($.voice).toBeDefined()
      expect($.pay).toBeDefined()
      expect($.domain).toBeDefined()
      expect($.cascade).toBeDefined()
      expect($.log).toBeDefined()
      expect($.child).toBeDefined()
      expect($.spawn).toBeDefined()
      expect($.send).toBeDefined()
    })

    it('should lazily initialize context properties', () => {
      // Access ai multiple times - should return same instance
      const ai1 = $.ai
      const ai2 = $.ai
      expect(ai1).toBe(ai2)
    })
  })

  describe('$.child', () => {
    it('should return a child context', () => {
      const child = $.child('Service', 'api')
      expect(child.$id).toBe('https://test.do/api')
      expect(child.$type).toBe('Service')
      expect(child.$context).toBe('https://test.do')
    })

    it('should cache child contexts', () => {
      const child1 = $.child('Service', 'api')
      const child2 = $.child('Service', 'api')
      expect(child1).toBe(child2)
    })
  })

  describe('$.spawn', () => {
    it('should create a new child context', async () => {
      const child = await $.spawn('Agent', 'sales-bot')
      expect(child.$id).toBe('https://test.do/sales-bot')
      expect(child.$type).toBe('Agent')
      expect(child.$context).toBe('https://test.do')
    })
  })

  describe('$.log', () => {
    it('should log with context prefix', () => {
      const consoleSpy = vi.spyOn(console, 'log')
      $.log('test message', { data: 123 })
      expect(consoleSpy).toHaveBeenCalledWith('[https://test.do]', 'test message', { data: 123 })
      consoleSpy.mockRestore()
    })
  })
})

describe('DO Factory', () => {
  it('should create a fetch handler', () => {
    const doInstance = DO(($) => {
      // Setup code
    })

    expect(doInstance.fetch).toBeDefined()
    expect(typeof doInstance.fetch).toBe('function')
  })

  it('should handle requests', async () => {
    const doInstance = DO(($) => {
      // Setup code
    })

    const request = new Request('https://test.do/path')
    const response = await doInstance.fetch(request)

    expect(response).toBeInstanceOf(Response)
    expect(response.headers.get('Content-Type')).toBe('application/json')
  })
})
