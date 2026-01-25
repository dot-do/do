/**
 * Tests for Unified DigitalObject Implementation
 *
 * TDD-RED: These tests verify that there is EXACTLY ONE DigitalObject
 * implementation in the codebase. Currently, there are TWO separate
 * implementations which violates the single source of truth principle.
 *
 * Current state (tests should FAIL):
 * - do/DigitalObject.ts: Abstract base class (~1147 lines)
 * - proxy/do.ts: Concrete class (~549 lines)
 *
 * Expected state (tests should PASS):
 * - Single DigitalObject implementation exported from one location
 * - All imports should reference the same implementation
 *
 * @module do/unified-digitalobject.test
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// =============================================================================
// Test: Single DigitalObject Implementation
// =============================================================================

describe('Unified DigitalObject Implementation', () => {
  const rootDir = path.resolve(__dirname, '..')

  // ===========================================================================
  // Test: Only one file should define DigitalObject class
  // ===========================================================================

  describe('Single Source of Truth', () => {
    it('should have exactly ONE file that exports a DigitalObject class', () => {
      // Files that currently define DigitalObject class
      const doDigitalObject = path.join(rootDir, 'do', 'DigitalObject.ts')
      const proxyDo = path.join(rootDir, 'proxy', 'do.ts')

      const doContent = fs.readFileSync(doDigitalObject, 'utf-8')
      const proxyContent = fs.readFileSync(proxyDo, 'utf-8')

      // Check for class definitions
      const doDefinesClass = /export\s+(abstract\s+)?class\s+DigitalObject/.test(doContent)
      const proxyDefinesClass = /export\s+class\s+DigitalObject/.test(proxyContent)

      // Count how many files define the class
      const filesDefiningClass = [doDefinesClass, proxyDefinesClass].filter(Boolean).length

      // Should be exactly 1, but currently there are 2
      expect(filesDefiningClass).toBe(1)
    })

    it('should NOT have DigitalObject class defined in proxy/do.ts', () => {
      const proxyDo = path.join(rootDir, 'proxy', 'do.ts')
      const content = fs.readFileSync(proxyDo, 'utf-8')

      // proxy/do.ts should NOT define its own DigitalObject
      // It should import from do/DigitalObject.ts instead
      const definesClass = /export\s+class\s+DigitalObject/.test(content)

      expect(definesClass).toBe(false)
    })

    it('should have DigitalObject exported ONLY from do/index.ts', () => {
      const doIndex = path.join(rootDir, 'do', 'index.ts')
      const proxyIndex = path.join(rootDir, 'proxy', 'index.ts')

      const doIndexContent = fs.readFileSync(doIndex, 'utf-8')
      const proxyIndexContent = fs.readFileSync(proxyIndex, 'utf-8')

      // do/index.ts should export DigitalObject
      const doExportsDigitalObject = /export\s*\{[^}]*DigitalObject[^}]*\}/.test(doIndexContent)

      // proxy/index.ts should NOT re-export its own DigitalObject
      // It should either not export DigitalObject, or re-export from do/
      const proxyExportsFromLocal = /export\s*\{[^}]*DigitalObject[^}]*\}\s*from\s*['"]\.\/do['"]/.test(proxyIndexContent)

      expect(doExportsDigitalObject).toBe(true)
      // proxy should NOT export a local DigitalObject
      expect(proxyExportsFromLocal).toBe(false)
    })
  })

  // ===========================================================================
  // Test: All imports should use the canonical location
  // ===========================================================================

  describe('Import Consistency', () => {
    it('should have proxy/index.ts import DigitalObject from do/, not define it locally', () => {
      const proxyIndex = path.join(rootDir, 'proxy', 'index.ts')
      const content = fs.readFileSync(proxyIndex, 'utf-8')

      // Check if it imports from the local ./do file (bad)
      const importsFromLocalDo = /import\s*\{[^}]*DigitalObject[^}]*\}\s*from\s*['"]\.\/do['"]/.test(content)

      // Should import from '../do' or '@dotdo/do' instead
      const importsFromCanonical =
        /import\s*\{[^}]*DigitalObject[^}]*\}\s*from\s*['"]\.\.\/do['"]/.test(content) ||
        /import\s*\{[^}]*DigitalObject[^}]*\}\s*from\s*['"]@dotdo\/do['"]/.test(content)

      // Currently imports from ./do (fails)
      expect(importsFromLocalDo).toBe(false)
    })

    it('should not have two different DigitalObject implementations with different features', () => {
      const doDigitalObject = path.join(rootDir, 'do', 'DigitalObject.ts')
      const proxyDo = path.join(rootDir, 'proxy', 'do.ts')

      const doContent = fs.readFileSync(doDigitalObject, 'utf-8')
      const proxyContent = fs.readFileSync(proxyDo, 'utf-8')

      // Check for implementation differences that shouldn't exist

      // Both define their own identity management
      const doHasIdentity = /\$id.*\$type.*\$context/.test(doContent)
      const proxyHasIdentity = /\$id.*\$type.*\$context/.test(proxyContent)

      // Both define their own fetch handler
      const doHasFetch = /async\s+fetch\s*\(/.test(doContent)
      const proxyHasFetch = /async\s+fetch\s*\(/.test(proxyContent)

      // Both define CDC handling
      const doHasCDC = /handleCDC|emitCDC|CDC/.test(doContent)
      const proxyHasCDC = /emitCDC|flushCDC|_cdc/.test(proxyContent)

      // If both have these features, they are divergent implementations
      const bothHaveIdentity = doHasIdentity && proxyHasIdentity
      const bothHaveFetch = doHasFetch && proxyHasFetch
      const bothHaveCDC = doHasCDC && proxyHasCDC

      // This should fail because we have two divergent implementations
      const hasDivergentImplementations = bothHaveIdentity && bothHaveFetch && bothHaveCDC

      expect(hasDivergentImplementations).toBe(false)
    })
  })

  // ===========================================================================
  // Test: Behavioral Consistency
  // ===========================================================================

  describe('Behavioral Consistency', () => {
    it('should have only one class that implements DurableObject interface', () => {
      const doDigitalObject = path.join(rootDir, 'do', 'DigitalObject.ts')
      const proxyDo = path.join(rootDir, 'proxy', 'do.ts')

      const doContent = fs.readFileSync(doDigitalObject, 'utf-8')
      const proxyContent = fs.readFileSync(proxyDo, 'utf-8')

      // Check for DurableObject implementation
      const doImplementsDO = /class\s+DigitalObject[^{]*implements\s+DurableObject/.test(doContent)
      const proxyImplementsDO = /class\s+DigitalObject[^{]*implements\s+DurableObject/.test(proxyContent)

      const implementationCount = [doImplementsDO, proxyImplementsDO].filter(Boolean).length

      // Should be exactly 1
      expect(implementationCount).toBe(1)
    })

    it('should not have two different RPC dispatch mechanisms', () => {
      const doDigitalObject = path.join(rootDir, 'do', 'DigitalObject.ts')
      const proxyDo = path.join(rootDir, 'proxy', 'do.ts')

      const doContent = fs.readFileSync(doDigitalObject, 'utf-8')
      const proxyContent = fs.readFileSync(proxyDo, 'utf-8')

      // do/DigitalObject.ts uses rpc/methods registry
      const doUsesMethodRegistry = /MethodRegistry|registerRPCMethods|rpcRegistry/.test(doContent)

      // proxy/do.ts uses rpc.do handler and internal dispatch
      const proxyUsesRpcDo = /createRpcHandler|dispatch\(path,\s*args\)/.test(proxyContent)

      // Having two different RPC mechanisms is a problem
      const hasTwoRpcMechanisms = doUsesMethodRegistry && proxyUsesRpcDo

      expect(hasTwoRpcMechanisms).toBe(false)
    })

    it('should not have two different state management approaches', () => {
      const doDigitalObject = path.join(rootDir, 'do', 'DigitalObject.ts')
      const proxyDo = path.join(rootDir, 'proxy', 'do.ts')

      const doContent = fs.readFileSync(doDigitalObject, 'utf-8')
      const proxyContent = fs.readFileSync(proxyDo, 'utf-8')

      // do/DigitalObject.ts uses createDOState wrapper
      const doUsesDOState = /createDOState|DOState/.test(doContent)

      // proxy/do.ts uses raw SqlStorage
      const proxyUsesSqlStorage = /SqlStorage|this\.sql\.exec/.test(proxyContent)

      // Having two different state approaches is a problem
      const hasTwoStateApproaches = doUsesDOState && proxyUsesSqlStorage

      expect(hasTwoStateApproaches).toBe(false)
    })
  })

  // ===========================================================================
  // Test: Export Consistency
  // ===========================================================================

  describe('Export Consistency', () => {
    it('should not export DigitalObject from multiple package entry points', () => {
      const doIndex = path.join(rootDir, 'do', 'index.ts')
      const proxyIndex = path.join(rootDir, 'proxy', 'index.ts')

      const doIndexContent = fs.readFileSync(doIndex, 'utf-8')
      const proxyIndexContent = fs.readFileSync(proxyIndex, 'utf-8')

      // Count export statements for DigitalObject
      const doExports = (doIndexContent.match(/export\s*\{[^}]*DigitalObject/g) || []).length
      const proxyExports = (proxyIndexContent.match(/export\s*\{?\s*DigitalObject/g) || []).length

      // Total exports should be 1 (from do/index.ts only)
      const totalExports = doExports + proxyExports

      // Currently this fails because proxy/index.ts also exports DigitalObject
      expect(totalExports).toBe(1)
    })

    it('should have consistent type exports alongside DigitalObject', () => {
      const doIndex = path.join(rootDir, 'do', 'index.ts')
      const content = fs.readFileSync(doIndex, 'utf-8')

      // do/index.ts should export all related types
      const exportsDigitalObject = /DigitalObject/.test(content)
      const exportsDOEnv = /DOEnv/.test(content)
      const exportsDOError = /DOError/.test(content)

      // These should all come from the same place
      expect(exportsDigitalObject).toBe(true)
      expect(exportsDOEnv).toBe(true)
      expect(exportsDOError).toBe(true)
    })
  })

  // ===========================================================================
  // Summary Test: Overall Architecture
  // ===========================================================================

  describe('Architecture Violation Detection', () => {
    it('should detect the current dual-implementation anti-pattern', () => {
      // This test explicitly documents the current problem
      const doDigitalObject = path.join(rootDir, 'do', 'DigitalObject.ts')
      const proxyDo = path.join(rootDir, 'proxy', 'do.ts')

      const doExists = fs.existsSync(doDigitalObject)
      const proxyExists = fs.existsSync(proxyDo)

      // Both files exist (expected to fail when fixed)
      const doDefinesClass = doExists && /export\s+(abstract\s+)?class\s+DigitalObject/.test(fs.readFileSync(doDigitalObject, 'utf-8'))
      const proxyDefinesClass = proxyExists && /export\s+class\s+DigitalObject/.test(fs.readFileSync(proxyDo, 'utf-8'))

      // The anti-pattern is: both files define DigitalObject
      const hasAntiPattern = doDefinesClass && proxyDefinesClass

      // This test SHOULD FAIL currently, confirming the anti-pattern exists
      // When fixed, proxy/do.ts should extend or import from do/DigitalObject.ts
      expect(hasAntiPattern).toBe(false)
    })
  })
})
