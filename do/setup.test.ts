/**
 * Setup Verification Test
 *
 * A simple test to verify the Vitest configuration is working correctly
 * with test utilities, mocks, and fixtures.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  createMockDurableObjectState,
  createMockDOIdentity,
  createMockCDCEvent,
  createMockEnv,
  fixtures,
  createIdentity,
  createDOHierarchy,
  waitFor,
  createDeferred,
  sleep,
} from '../tests/utils'

describe('Vitest Setup Verification', () => {
  describe('Basic Tests', () => {
    it('should run a simple assertion', () => {
      expect(1 + 1).toBe(2)
    })

    it('should support async tests', async () => {
      const result = await Promise.resolve('hello')
      expect(result).toBe('hello')
    })

    it('should support mocking with vi', () => {
      const mockFn = vi.fn().mockReturnValue(42)
      expect(mockFn()).toBe(42)
      expect(mockFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('Mock Utilities', () => {
    it('should create mock DurableObjectState', () => {
      const state = createMockDurableObjectState({ id: 'test-do' })

      expect(state.id.toString()).toBe('test-do')
      expect(state.storage).toBeDefined()
      expect(state.blockConcurrencyWhile).toBeDefined()
    })

    it('should create mock DurableObjectState with storage operations', async () => {
      const state = createMockDurableObjectState()
      const storage = state.storage

      // Test put and get
      await storage.put('key1', { value: 'test' })
      const result = await storage.get('key1')

      expect(result).toEqual({ value: 'test' })
    })

    it('should create mock DO identity', () => {
      const identity = createMockDOIdentity({
        $id: 'https://test.example.com',
        $type: 'Business',
      })

      expect(identity.$id).toBe('https://test.example.com')
      expect(identity.$type).toBe('Business')
      expect(identity.$version).toBe(1)
      expect(identity.$createdAt).toBeDefined()
    })

    it('should create mock CDC events', () => {
      const event = createMockCDCEvent({
        collection: 'users',
        operation: 'INSERT',
        after: { name: 'Alice' },
      })

      expect(event.collection).toBe('users')
      expect(event.operation).toBe('INSERT')
      expect(event.after).toEqual({ name: 'Alice' })
    })

    it('should create mock environment bindings', () => {
      const env = createMockEnv()

      expect(env.DO).toBeDefined()
      expect(env.KV).toBeDefined()
      expect(env.R2).toBeDefined()
      expect(env.AI).toBeDefined()
    })
  })

  describe('Test Fixtures', () => {
    it('should provide sample DO identities', () => {
      expect(fixtures.business.$id).toBe('https://startups.studio')
      expect(fixtures.business.$type).toBe('Business')

      expect(fixtures.startup.$context).toBe('https://startups.studio')
      expect(fixtures.saas.$context).toBe('https://headless.ly')
    })

    it('should create custom identities', () => {
      const identity = createIdentity({
        $type: 'CustomType',
      })

      expect(identity.$id).toContain('https://test-')
      expect(identity.$type).toBe('CustomType')
    })

    it('should create DO hierarchy', () => {
      const { parent, child, grandchild } = createDOHierarchy()

      expect(child.$context).toBe(parent.$id)
      expect(grandchild.$context).toBe(child.$id)
    })
  })

  describe('Async Utilities', () => {
    it('should support waitFor', async () => {
      let ready = false

      // Simulate async operation
      setTimeout(() => {
        ready = true
      }, 50)

      await waitFor(() => ready, { timeout: 1000 })

      expect(ready).toBe(true)
    })

    it('should support createDeferred', async () => {
      const deferred = createDeferred<string>()

      // Resolve after a delay
      setTimeout(() => {
        deferred.resolve('done')
      }, 10)

      const result = await deferred.promise
      expect(result).toBe('done')
    })

    it('should support sleep', async () => {
      const start = Date.now()
      await sleep(50)
      const elapsed = Date.now() - start

      // Allow some tolerance for timing
      expect(elapsed).toBeGreaterThanOrEqual(40)
    })
  })

  describe('Node Environment Web APIs', () => {
    it('should have access to TextEncoder/TextDecoder', () => {
      const encoder = new TextEncoder()
      const decoder = new TextDecoder()

      const encoded = encoder.encode('hello')
      const decoded = decoder.decode(encoded)

      expect(decoded).toBe('hello')
    })

    it('should have access to URL', () => {
      const url = new URL('https://example.com/path?query=value')

      expect(url.hostname).toBe('example.com')
      expect(url.pathname).toBe('/path')
      expect(url.searchParams.get('query')).toBe('value')
    })

    it('should have access to crypto.randomUUID', () => {
      const uuid = crypto.randomUUID()
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )
    })
  })
})
