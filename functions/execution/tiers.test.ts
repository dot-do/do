/**
 * Tests for Tier Detection and Routing
 *
 * @module execution/__tests__/tiers.test
 */

import { describe, it, expect } from 'vitest'
import {
  detectTier,
  getTierInfo,
  canExecuteAt,
  getOperationsForTier,
  routeOperation,
  EXECUTION_TIERS,
  NATIVE_OPS,
  RPC_SERVICES,
  DYNAMIC_MODULES,
} from './tiers'

describe('Tier Detection', () => {
  describe('detectTier()', () => {
    it('should detect Tier 1 for native operations', () => {
      expect(detectTier('fs.readFile')).toBe(1)
      expect(detectTier('json.parse')).toBe(1)
      expect(detectTier('http.fetch')).toBe(1)
      expect(detectTier('crypto.randomUUID')).toBe(1)
      expect(detectTier('posix.echo')).toBe(1)
    })

    it('should detect Tier 2 for RPC services', () => {
      expect(detectTier('jq.query')).toBe(2)
      expect(detectTier('npm.install')).toBe(2)
      expect(detectTier('git.clone')).toBe(2)
      expect(detectTier('db.query')).toBe(2)
      expect(detectTier('kv.get')).toBe(2)
    })

    it('should detect Tier 3 for dynamic modules', () => {
      expect(detectTier('esm.run')).toBe(3)
      expect(detectTier('esbuild.build')).toBe(3)
      expect(detectTier('typescript.compile')).toBe(3)
      expect(detectTier('prettier.format')).toBe(3)
      expect(detectTier('markdown.parse')).toBe(3)
    })

    it('should detect Tier 4 for unknown operations', () => {
      expect(detectTier('unknown.operation')).toBe(4)
      expect(detectTier('gcc.compile')).toBe(4)
      expect(detectTier('docker.run')).toBe(4)
    })

    it('should detect Tier 2 for .do service pattern', () => {
      expect(detectTier('custom.do/method')).toBe(2)
      expect(detectTier('api.do/endpoint')).toBe(2)
    })
  })

  describe('getTierInfo()', () => {
    it('should return correct tier metadata', () => {
      const tier1 = getTierInfo(1)
      expect(tier1.name).toBe('Native')
      expect(tier1.typicalLatency).toBe('<1ms')

      const tier2 = getTierInfo(2)
      expect(tier2.name).toBe('RPC Service')
      expect(tier2.typicalLatency).toBe('<5ms')

      const tier3 = getTierInfo(3)
      expect(tier3.name).toBe('Dynamic Module')
      expect(tier3.typicalLatency).toBe('<10ms')

      const tier4 = getTierInfo(4)
      expect(tier4.name).toBe('Linux Sandbox')
      expect(tier4.typicalLatency).toBe('2-3s')
    })
  })

  describe('canExecuteAt()', () => {
    it('should return true for matching tier', () => {
      expect(canExecuteAt('fs.readFile', 1)).toBe(true)
      expect(canExecuteAt('jq.query', 2)).toBe(true)
      expect(canExecuteAt('esbuild.build', 3)).toBe(true)
    })

    it('should return true for higher tiers', () => {
      expect(canExecuteAt('fs.readFile', 2)).toBe(true)
      expect(canExecuteAt('fs.readFile', 3)).toBe(true)
      expect(canExecuteAt('fs.readFile', 4)).toBe(true)
    })

    it('should return false for lower tiers', () => {
      expect(canExecuteAt('jq.query', 1)).toBe(false)
      expect(canExecuteAt('esbuild.build', 1)).toBe(false)
      expect(canExecuteAt('esbuild.build', 2)).toBe(false)
    })
  })

  describe('getOperationsForTier()', () => {
    it('should return native ops for tier 1', () => {
      const ops = getOperationsForTier(1)

      expect(ops.has('fs.readFile')).toBe(true)
      expect(ops.has('json.parse')).toBe(true)
      expect(ops.has('jq.query')).toBe(false)
    })

    it('should include lower tier ops for higher tiers', () => {
      const ops = getOperationsForTier(2)

      expect(ops.has('fs.readFile')).toBe(true) // Tier 1
      expect(ops.has('jq.query')).toBe(true) // Tier 2
      expect(ops.has('esbuild.build')).toBe(false) // Tier 3
    })
  })

  describe('routeOperation()', () => {
    it('should return tier and executor name', () => {
      const result = routeOperation('fs.readFile')

      expect(result.tier).toBe(1)
      expect(result.executor).toBe('native')
    })

    it('should respect tier override', () => {
      const result = routeOperation('fs.readFile', 4)

      expect(result.tier).toBe(4)
      expect(result.executor).toBe('sandbox')
    })
  })

  describe('Operation Sets', () => {
    it('should have no overlap between tier sets', () => {
      for (const op of NATIVE_OPS) {
        expect(RPC_SERVICES.has(op)).toBe(false)
        expect(DYNAMIC_MODULES.has(op)).toBe(false)
      }

      for (const op of RPC_SERVICES) {
        expect(NATIVE_OPS.has(op)).toBe(false)
        expect(DYNAMIC_MODULES.has(op)).toBe(false)
      }

      for (const op of DYNAMIC_MODULES) {
        expect(NATIVE_OPS.has(op)).toBe(false)
        expect(RPC_SERVICES.has(op)).toBe(false)
      }
    })
  })

  describe('EXECUTION_TIERS', () => {
    it('should have all four tiers defined', () => {
      expect(EXECUTION_TIERS[1]).toBeDefined()
      expect(EXECUTION_TIERS[2]).toBeDefined()
      expect(EXECUTION_TIERS[3]).toBeDefined()
      expect(EXECUTION_TIERS[4]).toBeDefined()
    })

    it('should have examples for each tier', () => {
      for (const tier of [1, 2, 3, 4] as const) {
        expect(EXECUTION_TIERS[tier].examples.length).toBeGreaterThan(0)
      }
    })
  })
})
