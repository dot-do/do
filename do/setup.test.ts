/**
 * Setup Verification Test
 *
 * Verifies the Vitest configuration is working correctly with:
 * - Test fixtures (test data)
 * - Async utilities (waitFor, sleep, createDeferred)
 * - Node environment Web APIs
 *
 * NOTE: No mock utilities - per CLAUDE.md NO MOCKS policy.
 * For real Workers API testing, use vitest.workers.config.ts with miniflare.
 * See tests/storage.workers.test.ts for the pattern.
 */

import { describe, it, expect, vi } from 'vitest'
import {
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
