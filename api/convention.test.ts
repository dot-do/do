/**
 * TDD-GREEN Tests: @dotdo/apis Database Convention Usage
 *
 * These tests verify that DO uses the @dotdo/apis database convention
 * instead of manual Hono route definitions.
 *
 * GREEN phase complete: Manual routes have been replaced by schema-driven
 * convention from @dotdo/apis that auto-generates CRUD endpoints, MCP tools,
 * and CDC events.
 *
 * @see ~/projects/api/README.md for @dotdo/apis documentation
 * @module api/convention.test
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Read file content synchronously for test assertions
 */
function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8')
}

/**
 * Check if a file exists
 */
function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath)
}

/**
 * Get all TypeScript files in a directory recursively
 */
function getTypeScriptFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return []
  }

  const files: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      files.push(...getTypeScriptFiles(fullPath))
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      if (!entry.name.endsWith('.test.ts') && !entry.name.endsWith('.spec.ts')) {
        files.push(fullPath)
      }
    }
  }

  return files
}

/**
 * Count lines of code in a file (excluding comments and blank lines)
 */
function countLinesOfCode(content: string): number {
  const lines = content.split('\n')
  let count = 0
  let inBlockComment = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (inBlockComment) {
      if (trimmed.includes('*/')) {
        inBlockComment = false
      }
      continue
    }

    if (trimmed.startsWith('/*')) {
      inBlockComment = !trimmed.includes('*/')
      continue
    }

    if (trimmed === '' || trimmed.startsWith('//')) {
      continue
    }

    count++
  }

  return count
}

// =============================================================================
// Test Constants
// =============================================================================

const PROJECT_ROOT = '/Users/nathanclevenger/projects/do'
const API_ROUTES_DIR = path.join(PROJECT_ROOT, 'api/routes')
const API_INDEX = path.join(PROJECT_ROOT, 'api/index.ts')

// Collections that should be schema-driven (from CLAUDE.md)
const EXPECTED_COLLECTIONS = [
  'nouns',
  'verbs',
  'things',
  'actions',
  'relationships',
  'functions',
  'workflows',
  'events',
  'experiments',
  'orgs',
  'roles',
  'users',
  'agents',
  'integrations',
  'webhooks',
]

// =============================================================================
// Test Suite: Database Convention Usage
// =============================================================================

describe('@dotdo/apis Database Convention', () => {
  // ===========================================================================
  // API Should Import @dotdo/apis Convention
  // ===========================================================================

  describe('Convention Import', () => {
    it('should import API from @dotdo/apis', () => {
      const content = readFile(API_INDEX)

      // Should import the API factory from @dotdo/apis
      const hasApisImport = content.includes("from '@dotdo/apis'") || content.includes('from "@dotdo/apis"')

      expect(hasApisImport, 'API should import from @dotdo/apis instead of manual route modules').toBe(true)
    })

    it('should use schema-based convention from @dotdo/apis', () => {
      const content = readFile(API_INDEX)

      // API can use either database: config or define schema directly
      const hasSchemaConvention = content.includes('databaseConvention') || content.includes('database:') || content.includes('schema =')

      expect(hasSchemaConvention, 'API should use schema-based convention from @dotdo/apis').toBe(true)
    })

    it('should use API() factory pattern', () => {
      const content = readFile(API_INDEX)

      // Should use the API({...}) factory pattern from @dotdo/apis
      const hasApiFactory = /API\(\s*\{/.test(content) || /export\s+default\s+API\(/.test(content)

      expect(hasApiFactory, 'Should use API() factory from @dotdo/apis instead of manual createApp()').toBe(true)
    })
  })

  // ===========================================================================
  // Schema-Driven Routes
  // ===========================================================================

  describe('Schema-Driven Routes', () => {
    it('should NOT have manual route files for standard CRUD operations', () => {
      const routeFiles = getTypeScriptFiles(API_ROUTES_DIR)

      // Manual route files that should be replaced by convention
      const manualRouteFiles = routeFiles.filter((f) => {
        const basename = path.basename(f)
        // These are manual CRUD implementations that convention replaces
        return ['do.ts', 'things.ts', 'nouns.ts', 'verbs.ts', 'relationships.ts', 'functions.ts', 'workflows.ts', 'users.ts', 'orgs.ts', 'roles.ts', 'agents.ts'].includes(basename)
      })

      // Calculate total lines of manual route code
      let totalManualLines = 0
      for (const file of manualRouteFiles) {
        const content = readFile(file)
        totalManualLines += countLinesOfCode(content)
      }

      // With database convention, we should have ~0 lines of manual CRUD routes
      expect(manualRouteFiles.length, `Found ${manualRouteFiles.length} manual route files that should be replaced by convention: ${manualRouteFiles.map((f) => path.basename(f)).join(', ')}`).toBe(0)
      expect(totalManualLines, `Found ${totalManualLines} lines of manual route code that should be auto-generated`).toBeLessThan(100)
    })

    it('should have a schema definition for collections', () => {
      // Look for schema definition in API
      const content = readFile(API_INDEX)

      // @dotdo/apis uses schema: { Model: { field: 'type' } } format
      const hasSchemaDefinition = content.includes('schema:') || content.includes('database:')

      expect(hasSchemaDefinition, 'API should have a schema definition for auto-generating routes').toBe(true)
    })

    it('should define all collections in schema', () => {
      const content = readFile(API_INDEX)

      // Check that all expected collections are defined in schema
      const missingCollections: string[] = []
      for (const collection of EXPECTED_COLLECTIONS) {
        // Schema uses PascalCase model names
        const modelName = collection.charAt(0).toUpperCase() + collection.slice(1, -1)
        if (!content.includes(modelName)) {
          missingCollections.push(collection)
        }
      }

      expect(missingCollections, `Missing collections in schema: ${missingCollections.join(', ')}`).toHaveLength(0)
    })
  })

  // ===========================================================================
  // Auto-Generated CRUD Endpoints
  // ===========================================================================

  describe('Auto-Generated CRUD Endpoints', () => {
    it('should NOT have manual do.ts route file', () => {
      // Manual do.ts route file should not exist - routes are auto-generated
      const doRoutePath = path.join(API_ROUTES_DIR, 'do.ts')
      expect(fileExists(doRoutePath), 'Manual do.ts route file should be deleted - routes are auto-generated by convention').toBe(false)
    })

    it('should NOT have manual collection route files', () => {
      // These files should not exist - they are auto-generated by convention
      const manualRouteFiles = ['things.ts', 'nouns.ts', 'verbs.ts', 'relationships.ts', 'functions.ts', 'workflows.ts', 'users.ts', 'orgs.ts', 'roles.ts', 'agents.ts']

      for (const file of manualRouteFiles) {
        const filePath = path.join(API_ROUTES_DIR, file)
        expect(fileExists(filePath), `Manual ${file} route file should be deleted - routes are auto-generated by convention`).toBe(false)
      }
    })

    it('should have database schema with all models', () => {
      const content = readFile(API_INDEX)

      // Check that key models are defined in schema
      const requiredModels = ['Noun', 'Verb', 'Thing', 'Action', 'User', 'Agent', 'Workflow', 'Function']
      for (const model of requiredModels) {
        expect(content.includes(`${model}:`), `Schema should include ${model} model definition`).toBe(true)
      }
    })
  })

  // ===========================================================================
  // MCP Tools Auto-Generation
  // ===========================================================================

  describe('Auto-Generated MCP Tools', () => {
    it('should NOT have manual MCP tool definitions for CRUD operations', () => {
      const mcpHandlers = readFile(path.join(PROJECT_ROOT, 'api/mcp/handlers.ts'))

      // With database convention, MCP tools are auto-generated from schema
      // Manual definitions like { name: 'thing.create', ... } should not exist
      const hasManualCrudTools =
        mcpHandlers.includes('thing.create') || mcpHandlers.includes('noun.create') || mcpHandlers.includes('verb.create') || mcpHandlers.includes('action.create')

      expect(hasManualCrudTools, 'MCP CRUD tools should be auto-generated from database convention, not manually defined').toBe(false)
    })

    it('should have MCP configuration in API config', () => {
      const content = readFile(API_INDEX)

      // API should have mcp configuration
      const hasMcpConfig = content.includes('mcp:') && (content.includes("path: '/mcp'") || content.includes('prefix:') || content.includes("name: 'do'"))

      expect(hasMcpConfig, 'MCP should be configured in API').toBe(true)
    })
  })

  // ===========================================================================
  // CDC Events From Convention
  // ===========================================================================

  describe('CDC Events From Convention', () => {
    it('should configure event sinks in database convention', () => {
      const content = readFile(API_INDEX)

      // @dotdo/apis database convention accepts events config
      const hasEventSinkConfig = content.includes('events:') || content.includes('lakehouse') || content.includes('EventSink')

      expect(hasEventSinkConfig, 'CDC events should be configured in database convention, not manual CDC implementation').toBe(true)
    })

    it('should NOT have manual CDC event generation in routes', () => {
      const routeFiles = getTypeScriptFiles(API_ROUTES_DIR)

      let hasManualCdc = false
      for (const file of routeFiles) {
        const content = readFile(file)
        // Manual CDC patterns we want to eliminate
        if (content.includes('emitCdcEvent') || content.includes('generateCdcEvent') || content.includes('pushCdcEvent') || content.includes('cdcBuffer')) {
          hasManualCdc = true
          break
        }
      }

      expect(hasManualCdc, 'CDC events should be auto-generated by database convention, not manually emitted').toBe(false)
    })
  })

  // ===========================================================================
  // Code Size Verification
  // ===========================================================================

  describe('Code Size Reduction', () => {
    it('should have minimal route code (convention reduces code by 90%+)', () => {
      const routeFiles = getTypeScriptFiles(API_ROUTES_DIR)

      let totalLines = 0
      for (const file of routeFiles) {
        const content = readFile(file)
        totalLines += countLinesOfCode(content)
      }

      // With database convention, we should have <600 lines of route code
      // (only custom routes like AI, health - not CRUD which is auto-generated)
      // Original manual routes were 6,008+ lines; now only custom routes remain
      expect(totalLines, `Routes have ${totalLines} lines of code. With convention this should be <600`).toBeLessThan(600)
    })

    it('should have schema-based API index', () => {
      const content = readFile(API_INDEX)
      const lines = countLinesOfCode(content)

      // With @dotdo/apis convention, api/index.ts contains schema + custom routes
      // Should be under 400 lines (schema definitions + custom routes)
      expect(lines, `API index has ${lines} lines. With convention this should be <400`).toBeLessThan(400)
    })
  })

  // ===========================================================================
  // Input Validation From Convention
  // ===========================================================================

  describe('Input Validation From Convention', () => {
    it('should use schema-based validation', () => {
      const content = readFile(API_INDEX)

      // @dotdo/apis uses schema for validation
      const hasConventionValidation = content.includes('schema:') || content.includes('database:')

      expect(hasConventionValidation, 'Input validation should come from database convention schema').toBe(true)
    })

    it('should NOT have manual validation schemas in routes', () => {
      const routeFiles = getTypeScriptFiles(API_ROUTES_DIR)

      let hasManualValidation = false
      for (const file of routeFiles) {
        const content = readFile(file)
        // Manual validation patterns (zod, manual checks)
        if (content.includes('z.object(') || content.includes('z.string(') || content.includes('.safeParse(') || content.includes('.parse(')) {
          hasManualValidation = true
          break
        }
      }

      expect(hasManualValidation, 'Validation should be auto-generated from schema, not manual zod schemas').toBe(false)
    })
  })

  // ===========================================================================
  // Response Envelope From Convention
  // ===========================================================================

  describe('Response Envelope From Convention', () => {
    it('should use convention-based responses', () => {
      const content = readFile(API_INDEX)

      // @dotdo/apis API factory handles response formatting
      const hasApiFactory = content.includes('API({') || content.includes("from '@dotdo/apis'")

      expect(hasApiFactory, 'Response envelope should come from @dotdo/apis API factory').toBe(true)
    })

    it('should NOT have manual apiResponse helper functions in route files', () => {
      const routeFiles = getTypeScriptFiles(API_ROUTES_DIR)

      let hasManualResponseHelper = false
      for (const file of routeFiles) {
        const content = readFile(file)
        // Manual response patterns - should not exist in route files
        if (content.includes('function apiResponse') || content.includes('const apiResponse =')) {
          hasManualResponseHelper = true
          break
        }
      }

      expect(hasManualResponseHelper, 'Response envelope should come from convention, not manual helper functions').toBe(false)
    })
  })
})

// =============================================================================
// Test Suite: Package Dependencies
// =============================================================================

describe('@dotdo/apis Package Dependency', () => {
  it('should have @dotdo/apis in dependencies', () => {
    const packageJsonPath = path.join(PROJECT_ROOT, 'package.json')
    const packageJson = JSON.parse(readFile(packageJsonPath))

    const hasDependency = packageJson.dependencies?.['@dotdo/apis'] || packageJson.devDependencies?.['@dotdo/apis']

    expect(hasDependency, '@dotdo/apis should be listed as a dependency').toBeTruthy()
  })

  it('should use @dotdo/apis version that supports databaseConvention', () => {
    const packageJsonPath = path.join(PROJECT_ROOT, 'package.json')
    const packageJson = JSON.parse(readFile(packageJsonPath))

    const version = packageJson.dependencies?.['@dotdo/apis'] || packageJson.devDependencies?.['@dotdo/apis']

    // databaseConvention was added in 0.1.0
    if (version) {
      const versionNumber = version.replace(/^\^|~/, '')
      const [major, minor] = versionNumber.split('.').map(Number)
      const supportsConvention = major > 0 || (major === 0 && minor >= 1)
      expect(supportsConvention, `@dotdo/apis version ${version} should support databaseConvention (>=0.1.0)`).toBe(true)
    }
  })
})
