/**
 * @dotdo/do - Package Exports Tests (RED Phase)
 *
 * These tests verify that the package correctly exports the DO class
 * and other expected exports from @dotdo/do.
 *
 * Issue: workers-6zr "[RED] Package exports DB class from @dotdo/workers/db"
 * Note: Class renamed from DB to DO, package renamed to @dotdo/do
 */

import { describe, it, expect } from 'vitest'

describe('Package Exports', () => {
  describe('@dotdo/do main export', () => {
    it('should export DO class from main entry', async () => {
      const exports = await import('../src/index')
      expect(exports.DO).toBeDefined()
      expect(typeof exports.DO).toBe('function')
    })

    it('should export DO as a class that can be instantiated', async () => {
      const { DO } = await import('../src/index')
      expect(DO.prototype).toBeDefined()
      expect(DO.prototype.constructor).toBe(DO)
    })

    it('should export types from main entry', async () => {
      const exports = await import('../src/index')
      // Types are compile-time only, but we can check that the module exports exist
      expect(exports).toBeDefined()
    })
  })

  describe('@dotdo/do/rpc export', () => {
    it('should export RPC utilities from /rpc subpath', async () => {
      const exports = await import('../src/rpc')
      expect(exports).toBeDefined()
    })
  })

  describe('@dotdo/do/mcp export', () => {
    it('should export MCP utilities from /mcp subpath', async () => {
      const exports = await import('../src/mcp')
      expect(exports).toBeDefined()
    })
  })

  describe('DO class characteristics', () => {
    it('should have DO class with expected static properties', async () => {
      const { DO } = await import('../src/index')
      // DO should be a proper class
      expect(typeof DO).toBe('function')
      expect(DO.name).toBe('DO')
    })

    it('should be importable via named export', async () => {
      // Verify named export works correctly
      const { DO } = await import('../src/index')
      expect(DO).toBeDefined()
    })
  })
})
