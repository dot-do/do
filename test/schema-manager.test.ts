/**
 * @dotdo/do - SchemaManager Tests (RED Phase)
 *
 * These tests define the expected behavior of the SchemaManager class.
 * They should FAIL initially (RED) because the implementation doesn't exist yet.
 *
 * SchemaManager responsibilities:
 * - Initialize all database tables for the DO system
 * - Create tables idempotently (IF NOT EXISTS)
 * - Track schema version for migrations
 * - Create required indexes for performance
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SchemaManager } from '../src/schema/manager'
import type {
  SchemaVersion,
  TableDefinition,
  Migration,
  MigrationResult,
  MigrationHistoryEntry,
} from '../src/schema/types'

/**
 * Create a mock SQL storage for testing SchemaManager
 */
function createMockSqlStorage() {
  const executedQueries: string[] = []
  const tables: Set<string> = new Set()
  const tableData: Map<string, any[]> = new Map()

  return {
    exec(query: string, ...params: unknown[]) {
      executedQueries.push(query)
      const normalizedQuery = query.trim().toUpperCase()

      if (normalizedQuery.startsWith('CREATE TABLE')) {
        const tableMatch = query.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)
        if (tableMatch) {
          const tableName = tableMatch[1]
          tables.add(tableName)
          if (!tableData.has(tableName)) {
            tableData.set(tableName, [])
          }
        }
      }

      // Handle INSERT
      if (normalizedQuery.startsWith('INSERT')) {
        const tableMatch = query.match(/INSERT (?:OR REPLACE )?INTO (\w+)/i)
        if (tableMatch) {
          const tableName = tableMatch[1]
          if (!tableData.has(tableName)) {
            tableData.set(tableName, [])
          }

          // Parse simple INSERT for schema_version
          if (tableName === 'schema_version') {
            const valuesMatch = query.match(/VALUES\s*\((\d+),\s*(\d+),\s*datetime\('now'\),\s*datetime\('now'\)\)/i)
            if (valuesMatch) {
              tableData.set(tableName, [{
                id: parseInt(valuesMatch[1]),
                version: parseInt(valuesMatch[2]),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }])
            }
          }

          // Parse simple INSERT for migration_history
          if (tableName === 'migration_history') {
            const valuesMatch = query.match(/VALUES\s*\((\d+),\s*'([^']+)',\s*datetime\('now'\),\s*'([^']+)',\s*(\d+),\s*'([^']+)'\)/i)
            if (valuesMatch) {
              const data = tableData.get(tableName) || []
              data.push({
                version: parseInt(valuesMatch[1]),
                name: valuesMatch[2],
                applied_at: new Date().toISOString(),
                checksum: valuesMatch[3],
                execution_time: parseInt(valuesMatch[4]),
                status: valuesMatch[5],
              })
              tableData.set(tableName, data)
            }
          }
        }
      }

      // Handle UPDATE
      if (normalizedQuery.startsWith('UPDATE')) {
        const tableMatch = query.match(/UPDATE (\w+)/i)
        if (tableMatch) {
          const tableName = tableMatch[1]

          if (tableName === 'schema_version') {
            const versionMatch = query.match(/SET version = (\d+)/i)
            if (versionMatch) {
              const data = tableData.get(tableName) || []
              if (data.length > 0) {
                data[0].version = parseInt(versionMatch[1])
                data[0].updated_at = new Date().toISOString()
              }
            }
          }

          if (tableName === 'migration_history') {
            const statusMatch = query.match(/SET status = '([^']+)'.*WHERE version = (\d+)/i)
            if (statusMatch) {
              const status = statusMatch[1]
              const version = parseInt(statusMatch[2])
              const data = tableData.get(tableName) || []
              const entry = data.find(d => d.version === version)
              if (entry) {
                entry.status = status
              }
            }
          }
        }
      }

      // Handle SELECT
      if (normalizedQuery.startsWith('SELECT')) {
        // Check if it's querying sqlite_master for tables
        if (query.includes('sqlite_master')) {
          const tableNameMatch = query.match(/name='(\w+)'/i)
          if (tableNameMatch && tables.has(tableNameMatch[1])) {
            return {
              toArray() {
                return [{ name: tableNameMatch[1] }]
              },
            }
          }
          return {
            toArray() {
              return []
            },
          }
        }

        // Check if it's querying schema_version
        if (query.includes('schema_version')) {
          const data = tableData.get('schema_version') || []
          return {
            toArray() {
              return data
            },
          }
        }

        // Check if it's querying migration_history
        if (query.includes('migration_history')) {
          const data = tableData.get('migration_history') || []
          return {
            toArray() {
              return data
            },
          }
        }
      }

      return {
        toArray() {
          return []
        },
      }
    },
    getExecutedQueries() {
      return executedQueries
    },
    getTables() {
      return tables
    },
    reset() {
      executedQueries.length = 0
      // Don't clear tables and tableData - those represent actual database state
      // Only clear the query log for assertion purposes
    },
  }
}

/**
 * Create a mock context with SQLite storage
 */
function createMockCtx() {
  const sqlStorage = createMockSqlStorage()
  return {
    storage: {
      sql: sqlStorage,
    },
    _sql: sqlStorage, // Direct access for test assertions
  }
}

describe('SchemaManager', () => {
  describe('Class Structure', () => {
    it('should be a class that can be instantiated with SQL storage', () => {
      const mockCtx = createMockCtx()
      const schema = new SchemaManager(mockCtx.storage.sql)
      expect(schema).toBeDefined()
      expect(schema).toBeInstanceOf(SchemaManager)
    })

    it('should have initialize method', () => {
      const mockCtx = createMockCtx()
      const schema = new SchemaManager(mockCtx.storage.sql)
      expect(schema.initialize).toBeDefined()
      expect(typeof schema.initialize).toBe('function')
    })

    it('should have getVersion method', () => {
      const mockCtx = createMockCtx()
      const schema = new SchemaManager(mockCtx.storage.sql)
      expect(schema.getVersion).toBeDefined()
      expect(typeof schema.getVersion).toBe('function')
    })

    it('should have isInitialized method', () => {
      const mockCtx = createMockCtx()
      const schema = new SchemaManager(mockCtx.storage.sql)
      expect(schema.isInitialized).toBeDefined()
      expect(typeof schema.isInitialized).toBe('function')
    })

    it('should have getTableDefinitions method', () => {
      const mockCtx = createMockCtx()
      const schema = new SchemaManager(mockCtx.storage.sql)
      expect(schema.getTableDefinitions).toBeDefined()
      expect(typeof schema.getTableDefinitions).toBe('function')
    })
  })

  describe('initialize()', () => {
    let schema: SchemaManager
    let mockCtx: ReturnType<typeof createMockCtx>

    beforeEach(() => {
      mockCtx = createMockCtx()
      schema = new SchemaManager(mockCtx.storage.sql)
    })

    it('should create the documents table', async () => {
      await schema.initialize()

      const queries = mockCtx._sql.getExecutedQueries()
      const hasDocumentsTable = queries.some(
        (q) => q.includes('CREATE TABLE') && q.includes('documents')
      )
      expect(hasDocumentsTable).toBe(true)
    })

    it('should create the things table', async () => {
      await schema.initialize()

      const queries = mockCtx._sql.getExecutedQueries()
      const hasThingsTable = queries.some(
        (q) => q.includes('CREATE TABLE') && q.includes('things')
      )
      expect(hasThingsTable).toBe(true)
    })

    it('should create the events table', async () => {
      await schema.initialize()

      const queries = mockCtx._sql.getExecutedQueries()
      const hasEventsTable = queries.some(
        (q) => q.includes('CREATE TABLE') && q.includes('events')
      )
      expect(hasEventsTable).toBe(true)
    })

    it('should create the relationships table', async () => {
      await schema.initialize()

      const queries = mockCtx._sql.getExecutedQueries()
      const hasRelationshipsTable = queries.some(
        (q) => q.includes('CREATE TABLE') && q.includes('relationships')
      )
      expect(hasRelationshipsTable).toBe(true)
    })

    it('should create the actions table', async () => {
      await schema.initialize()

      const queries = mockCtx._sql.getExecutedQueries()
      const hasActionsTable = queries.some(
        (q) => q.includes('CREATE TABLE') && q.includes('actions')
      )
      expect(hasActionsTable).toBe(true)
    })

    it('should create the artifacts table', async () => {
      await schema.initialize()

      const queries = mockCtx._sql.getExecutedQueries()
      const hasArtifactsTable = queries.some(
        (q) => q.includes('CREATE TABLE') && q.includes('artifacts')
      )
      expect(hasArtifactsTable).toBe(true)
    })

    it('should create the workflow_state table', async () => {
      await schema.initialize()

      const queries = mockCtx._sql.getExecutedQueries()
      const hasWorkflowStateTable = queries.some(
        (q) => q.includes('CREATE TABLE') && q.includes('workflow_state')
      )
      expect(hasWorkflowStateTable).toBe(true)
    })

    it('should create the schema_version table', async () => {
      await schema.initialize()

      const queries = mockCtx._sql.getExecutedQueries()
      const hasSchemaVersionTable = queries.some(
        (q) => q.includes('CREATE TABLE') && q.includes('schema_version')
      )
      expect(hasSchemaVersionTable).toBe(true)
    })

    it('should use IF NOT EXISTS for all tables (idempotent)', async () => {
      await schema.initialize()

      const queries = mockCtx._sql.getExecutedQueries()
      const createTableQueries = queries.filter((q) => q.includes('CREATE TABLE'))

      for (const query of createTableQueries) {
        expect(query).toContain('IF NOT EXISTS')
      }
    })

    it('should create indexes for performance', async () => {
      await schema.initialize()

      const queries = mockCtx._sql.getExecutedQueries()
      const hasIndexes = queries.some((q) => q.includes('CREATE INDEX'))
      expect(hasIndexes).toBe(true)
    })

    it('should create artifacts source index', async () => {
      await schema.initialize()

      const queries = mockCtx._sql.getExecutedQueries()
      const hasArtifactsIndex = queries.some(
        (q) => q.includes('CREATE INDEX') && q.includes('artifacts') && q.includes('source')
      )
      expect(hasArtifactsIndex).toBe(true)
    })

    it('should be idempotent (safe to call multiple times)', async () => {
      await schema.initialize()
      const firstCallQueries = [...mockCtx._sql.getExecutedQueries()]

      mockCtx._sql.reset()
      await schema.initialize()
      const secondCallQueries = mockCtx._sql.getExecutedQueries()

      // Second call should work without errors
      expect(secondCallQueries.length).toBeGreaterThan(0)
    })
  })

  describe('isInitialized()', () => {
    let schema: SchemaManager
    let mockCtx: ReturnType<typeof createMockCtx>

    beforeEach(() => {
      mockCtx = createMockCtx()
      schema = new SchemaManager(mockCtx.storage.sql)
    })

    it('should return false before initialization', async () => {
      const result = await schema.isInitialized()
      expect(result).toBe(false)
    })

    it('should return true after initialization', async () => {
      await schema.initialize()
      const result = await schema.isInitialized()
      expect(result).toBe(true)
    })
  })

  describe('getVersion()', () => {
    let schema: SchemaManager
    let mockCtx: ReturnType<typeof createMockCtx>

    beforeEach(() => {
      mockCtx = createMockCtx()
      schema = new SchemaManager(mockCtx.storage.sql)
    })

    it('should return null before initialization', async () => {
      const version = await schema.getVersion()
      expect(version).toBeNull()
    })

    it('should return version info after initialization', async () => {
      await schema.initialize()
      const version = await schema.getVersion()

      expect(version).not.toBeNull()
      expect(version?.version).toBeDefined()
      expect(typeof version?.version).toBe('number')
    })

    it('should include version number', async () => {
      await schema.initialize()
      const version = await schema.getVersion()

      expect(version?.version).toBeGreaterThanOrEqual(1)
    })

    it('should include created timestamp', async () => {
      await schema.initialize()
      const version = await schema.getVersion()

      expect(version?.createdAt).toBeDefined()
      expect(version?.createdAt).toBeInstanceOf(Date)
    })

    it('should include updated timestamp', async () => {
      await schema.initialize()
      const version = await schema.getVersion()

      expect(version?.updatedAt).toBeDefined()
      expect(version?.updatedAt).toBeInstanceOf(Date)
    })
  })

  describe('getTableDefinitions()', () => {
    let schema: SchemaManager

    beforeEach(() => {
      const mockCtx = createMockCtx()
      schema = new SchemaManager(mockCtx.storage.sql)
    })

    it('should return array of table definitions', () => {
      const definitions = schema.getTableDefinitions()

      expect(Array.isArray(definitions)).toBe(true)
      expect(definitions.length).toBeGreaterThan(0)
    })

    it('should include documents table definition', () => {
      const definitions = schema.getTableDefinitions()
      const documentsTable = definitions.find((d) => d.name === 'documents')

      expect(documentsTable).toBeDefined()
      expect(documentsTable?.columns).toBeDefined()
      expect(documentsTable?.columns.length).toBeGreaterThan(0)
    })

    it('should include things table definition', () => {
      const definitions = schema.getTableDefinitions()
      const thingsTable = definitions.find((d) => d.name === 'things')

      expect(thingsTable).toBeDefined()
    })

    it('should include events table definition', () => {
      const definitions = schema.getTableDefinitions()
      const eventsTable = definitions.find((d) => d.name === 'events')

      expect(eventsTable).toBeDefined()
    })

    it('should include relationships table definition', () => {
      const definitions = schema.getTableDefinitions()
      const relationshipsTable = definitions.find((d) => d.name === 'relationships')

      expect(relationshipsTable).toBeDefined()
    })

    it('should include actions table definition', () => {
      const definitions = schema.getTableDefinitions()
      const actionsTable = definitions.find((d) => d.name === 'actions')

      expect(actionsTable).toBeDefined()
    })

    it('should include artifacts table definition', () => {
      const definitions = schema.getTableDefinitions()
      const artifactsTable = definitions.find((d) => d.name === 'artifacts')

      expect(artifactsTable).toBeDefined()
    })

    it('should include column details in definitions', () => {
      const definitions = schema.getTableDefinitions()
      const documentsTable = definitions.find((d) => d.name === 'documents')

      expect(documentsTable?.columns).toBeDefined()
      const columnNames = documentsTable?.columns.map((c) => c.name)
      expect(columnNames).toContain('id')
      expect(columnNames).toContain('collection')
      expect(columnNames).toContain('data')
    })

    it('should include primary key info in definitions', () => {
      const definitions = schema.getTableDefinitions()
      const documentsTable = definitions.find((d) => d.name === 'documents')

      expect(documentsTable?.primaryKey).toBeDefined()
    })
  })

  describe('Table Column Requirements', () => {
    let schema: SchemaManager
    let mockCtx: ReturnType<typeof createMockCtx>

    beforeEach(() => {
      mockCtx = createMockCtx()
      schema = new SchemaManager(mockCtx.storage.sql)
    })

    describe('documents table', () => {
      it('should have collection column', async () => {
        await schema.initialize()
        const queries = mockCtx._sql.getExecutedQueries()
        const documentsQuery = queries.find(
          (q) => q.includes('CREATE TABLE') && q.includes('documents')
        )
        expect(documentsQuery).toContain('collection')
      })

      it('should have id column', async () => {
        await schema.initialize()
        const queries = mockCtx._sql.getExecutedQueries()
        const documentsQuery = queries.find(
          (q) => q.includes('CREATE TABLE') && q.includes('documents')
        )
        expect(documentsQuery).toContain('id TEXT')
      })

      it('should have data column', async () => {
        await schema.initialize()
        const queries = mockCtx._sql.getExecutedQueries()
        const documentsQuery = queries.find(
          (q) => q.includes('CREATE TABLE') && q.includes('documents')
        )
        expect(documentsQuery).toContain('data TEXT')
      })

      it('should have composite primary key on collection and id', async () => {
        await schema.initialize()
        const queries = mockCtx._sql.getExecutedQueries()
        const documentsQuery = queries.find(
          (q) => q.includes('CREATE TABLE') && q.includes('documents')
        )
        expect(documentsQuery).toContain('PRIMARY KEY')
        expect(documentsQuery).toContain('collection')
        expect(documentsQuery).toContain('id')
      })

      it('should have created_at column', async () => {
        await schema.initialize()
        const queries = mockCtx._sql.getExecutedQueries()
        const documentsQuery = queries.find(
          (q) => q.includes('CREATE TABLE') && q.includes('documents')
        )
        expect(documentsQuery).toContain('created_at')
      })

      it('should have updated_at column', async () => {
        await schema.initialize()
        const queries = mockCtx._sql.getExecutedQueries()
        const documentsQuery = queries.find(
          (q) => q.includes('CREATE TABLE') && q.includes('documents')
        )
        expect(documentsQuery).toContain('updated_at')
      })
    })

    describe('things table', () => {
      it('should have ns column for namespace', async () => {
        await schema.initialize()
        const queries = mockCtx._sql.getExecutedQueries()
        const thingsQuery = queries.find(
          (q) => q.includes('CREATE TABLE') && q.includes('things')
        )
        expect(thingsQuery).toContain('ns TEXT')
      })

      it('should have type column', async () => {
        await schema.initialize()
        const queries = mockCtx._sql.getExecutedQueries()
        const thingsQuery = queries.find(
          (q) => q.includes('CREATE TABLE') && q.includes('things')
        )
        expect(thingsQuery).toContain('type TEXT')
      })

      it('should have url column with unique constraint', async () => {
        await schema.initialize()
        const queries = mockCtx._sql.getExecutedQueries()
        const thingsQuery = queries.find(
          (q) => q.includes('CREATE TABLE') && q.includes('things')
        )
        expect(thingsQuery).toContain('url TEXT')
        expect(thingsQuery).toContain('UNIQUE')
      })
    })

    describe('events table', () => {
      it('should have id as primary key', async () => {
        await schema.initialize()
        const queries = mockCtx._sql.getExecutedQueries()
        const eventsQuery = queries.find(
          (q) => q.includes('CREATE TABLE') && q.includes('events')
        )
        expect(eventsQuery).toContain('id TEXT PRIMARY KEY')
      })

      it('should have type column', async () => {
        await schema.initialize()
        const queries = mockCtx._sql.getExecutedQueries()
        const eventsQuery = queries.find(
          (q) => q.includes('CREATE TABLE') && q.includes('events')
        )
        expect(eventsQuery).toContain('type TEXT')
      })

      it('should have timestamp column', async () => {
        await schema.initialize()
        const queries = mockCtx._sql.getExecutedQueries()
        const eventsQuery = queries.find(
          (q) => q.includes('CREATE TABLE') && q.includes('events')
        )
        expect(eventsQuery).toContain('timestamp')
      })

      it('should have correlation_id for event chains', async () => {
        await schema.initialize()
        const queries = mockCtx._sql.getExecutedQueries()
        const eventsQuery = queries.find(
          (q) => q.includes('CREATE TABLE') && q.includes('events')
        )
        expect(eventsQuery).toContain('correlation_id')
      })
    })

    describe('actions table', () => {
      it('should have actor column', async () => {
        await schema.initialize()
        const queries = mockCtx._sql.getExecutedQueries()
        const actionsQuery = queries.find(
          (q) => q.includes('CREATE TABLE') && q.includes('actions')
        )
        expect(actionsQuery).toContain('actor TEXT')
      })

      it('should have object column', async () => {
        await schema.initialize()
        const queries = mockCtx._sql.getExecutedQueries()
        const actionsQuery = queries.find(
          (q) => q.includes('CREATE TABLE') && q.includes('actions')
        )
        expect(actionsQuery).toContain('object TEXT')
      })

      it('should have status column with default', async () => {
        await schema.initialize()
        const queries = mockCtx._sql.getExecutedQueries()
        const actionsQuery = queries.find(
          (q) => q.includes('CREATE TABLE') && q.includes('actions')
        )
        expect(actionsQuery).toContain('status TEXT')
        expect(actionsQuery).toContain('DEFAULT')
      })
    })
  })

  describe('Schema Types', () => {
    it('should define SchemaVersion interface with required fields', () => {
      // Type assertion test - if this compiles, the types exist
      const version: SchemaVersion = {
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(version.version).toBe(1)
      expect(version.createdAt).toBeInstanceOf(Date)
    })

    it('should define TableDefinition interface', () => {
      // Type assertion test
      const definition: TableDefinition = {
        name: 'test',
        columns: [{ name: 'id', type: 'TEXT', nullable: false }],
        primaryKey: ['id'],
      }

      expect(definition.name).toBe('test')
      expect(definition.columns).toHaveLength(1)
    })
  })

  // =============================================================================
  // MIGRATION HANDLING TESTS (RED Phase - workers-dqn)
  // =============================================================================
  // These tests define migration handling functionality for SchemaManager.
  // Migrations allow schema evolution over time without data loss.
  // =============================================================================

  describe('Migration Handling', () => {
    describe('Migration Methods', () => {
      let schema: SchemaManager
      let mockCtx: ReturnType<typeof createMockCtx>

      beforeEach(() => {
        mockCtx = createMockCtx()
        schema = new SchemaManager(mockCtx.storage.sql)
      })

      it('should have registerMigration method', () => {
        expect(schema.registerMigration).toBeDefined()
        expect(typeof schema.registerMigration).toBe('function')
      })

      it('should have migrate method', () => {
        expect(schema.migrate).toBeDefined()
        expect(typeof schema.migrate).toBe('function')
      })

      it('should have getMigrationHistory method', () => {
        expect(schema.getMigrationHistory).toBeDefined()
        expect(typeof schema.getMigrationHistory).toBe('function')
      })

      it('should have getPendingMigrations method', () => {
        expect(schema.getPendingMigrations).toBeDefined()
        expect(typeof schema.getPendingMigrations).toBe('function')
      })

      it('should have rollback method', () => {
        expect(schema.rollback).toBeDefined()
        expect(typeof schema.rollback).toBe('function')
      })

      it('should have getCurrentMigrationVersion method', () => {
        expect(schema.getCurrentMigrationVersion).toBeDefined()
        expect(typeof schema.getCurrentMigrationVersion).toBe('function')
      })
    })

    describe('registerMigration()', () => {
      let schema: SchemaManager
      let mockCtx: ReturnType<typeof createMockCtx>

      beforeEach(() => {
        mockCtx = createMockCtx()
        schema = new SchemaManager(mockCtx.storage.sql)
      })

      it('should accept a migration with version, name, up, and down', () => {
        const migration = {
          version: 2,
          name: 'add_tags_column',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        }

        // Should not throw when registering valid migration
        expect(() => schema.registerMigration(migration)).not.toThrow()
      })

      it('should reject migration without version', () => {
        const invalidMigration = {
          name: 'invalid_migration',
          up: 'ALTER TABLE things ADD COLUMN foo TEXT',
          down: 'ALTER TABLE things DROP COLUMN foo',
        } as any

        expect(() => schema.registerMigration(invalidMigration)).toThrow()
      })

      it('should reject migration without name', () => {
        const invalidMigration = {
          version: 2,
          up: 'ALTER TABLE things ADD COLUMN foo TEXT',
          down: 'ALTER TABLE things DROP COLUMN foo',
        } as any

        expect(() => schema.registerMigration(invalidMigration)).toThrow()
      })

      it('should reject migration without up SQL', () => {
        const invalidMigration = {
          version: 2,
          name: 'invalid_migration',
          down: 'ALTER TABLE things DROP COLUMN foo',
        } as any

        expect(() => schema.registerMigration(invalidMigration)).toThrow()
      })

      it('should reject duplicate version numbers', () => {
        const migration1 = {
          version: 2,
          name: 'first_migration',
          up: 'ALTER TABLE things ADD COLUMN foo TEXT',
          down: 'ALTER TABLE things DROP COLUMN foo',
        }

        const migration2 = {
          version: 2,
          name: 'duplicate_version',
          up: 'ALTER TABLE things ADD COLUMN bar TEXT',
          down: 'ALTER TABLE things DROP COLUMN bar',
        }

        schema.registerMigration(migration1)
        expect(() => schema.registerMigration(migration2)).toThrow()
      })

      it('should allow registering multiple migrations with different versions', () => {
        const migration1 = {
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        }

        const migration2 = {
          version: 3,
          name: 'add_metadata',
          up: 'ALTER TABLE things ADD COLUMN metadata TEXT',
          down: 'ALTER TABLE things DROP COLUMN metadata',
        }

        expect(() => {
          schema.registerMigration(migration1)
          schema.registerMigration(migration2)
        }).not.toThrow()
      })

      it('should accept migrations with multiple SQL statements', () => {
        const migration = {
          version: 2,
          name: 'complex_migration',
          up: `
            ALTER TABLE things ADD COLUMN tags TEXT;
            CREATE INDEX idx_things_tags ON things(tags);
          `,
          down: `
            DROP INDEX idx_things_tags;
            ALTER TABLE things DROP COLUMN tags;
          `,
        }

        expect(() => schema.registerMigration(migration)).not.toThrow()
      })
    })

    describe('migrate()', () => {
      let schema: SchemaManager
      let mockCtx: ReturnType<typeof createMockCtx>

      beforeEach(() => {
        mockCtx = createMockCtx()
        schema = new SchemaManager(mockCtx.storage.sql)
      })

      it('should run all pending migrations when called without version', async () => {
        schema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        schema.registerMigration({
          version: 3,
          name: 'add_metadata',
          up: 'ALTER TABLE things ADD COLUMN metadata TEXT',
          down: 'ALTER TABLE things DROP COLUMN metadata',
        })

        await schema.initialize()
        await schema.migrate()

        const queries = mockCtx._sql.getExecutedQueries()
        expect(queries.some((q) => q.includes('tags'))).toBe(true)
        expect(queries.some((q) => q.includes('metadata'))).toBe(true)
      })

      it('should run migrations up to specified version', async () => {
        schema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        schema.registerMigration({
          version: 3,
          name: 'add_metadata',
          up: 'ALTER TABLE things ADD COLUMN metadata TEXT',
          down: 'ALTER TABLE things DROP COLUMN metadata',
        })

        await schema.initialize()
        await schema.migrate(2) // Only migrate to version 2

        const queries = mockCtx._sql.getExecutedQueries()
        expect(queries.some((q) => q.includes('tags'))).toBe(true)
        expect(queries.some((q) => q.includes('metadata'))).toBe(false)
      })

      it('should skip already applied migrations', async () => {
        schema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        await schema.initialize()
        await schema.migrate()

        mockCtx._sql.reset()
        await schema.migrate()

        const queries = mockCtx._sql.getExecutedQueries()
        // Should not re-run the migration
        expect(queries.filter((q) => q.includes('ADD COLUMN tags')).length).toBe(0)
      })

      it('should run migrations in version order', async () => {
        // Register out of order
        schema.registerMigration({
          version: 3,
          name: 'add_metadata',
          up: 'ALTER TABLE things ADD COLUMN metadata TEXT',
          down: 'ALTER TABLE things DROP COLUMN metadata',
        })

        schema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        await schema.initialize()
        await schema.migrate()

        const queries = mockCtx._sql.getExecutedQueries()
        const tagsIndex = queries.findIndex((q) => q.includes('tags'))
        const metadataIndex = queries.findIndex((q) => q.includes('metadata'))

        expect(tagsIndex).toBeLessThan(metadataIndex)
      })

      it('should record each migration in migration_history table', async () => {
        schema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        await schema.initialize()
        await schema.migrate()

        const queries = mockCtx._sql.getExecutedQueries()
        const insertQuery = queries.find(
          (q) => q.includes('INSERT') && q.includes('migration_history')
        )
        expect(insertQuery).toBeDefined()
      })

      it('should update schema_version after successful migration', async () => {
        schema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        await schema.initialize()
        await schema.migrate()

        const version = await schema.getVersion()
        expect(version?.version).toBe(2)
      })

      it('should return migration results with status', async () => {
        schema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        await schema.initialize()
        const results = await schema.migrate()

        expect(results).toBeDefined()
        expect(Array.isArray(results)).toBe(true)
        expect(results.length).toBeGreaterThan(0)
        expect(results[0].version).toBe(2)
        expect(results[0].name).toBe('add_tags')
        expect(results[0].status).toBe('applied')
      })

      it('should return empty array when no migrations pending', async () => {
        await schema.initialize()
        const results = await schema.migrate()

        expect(results).toEqual([])
      })

      it('should not apply migrations if not initialized', async () => {
        schema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        await expect(schema.migrate()).rejects.toThrow()
      })
    })

    describe('rollback()', () => {
      let schema: SchemaManager
      let mockCtx: ReturnType<typeof createMockCtx>

      beforeEach(() => {
        mockCtx = createMockCtx()
        schema = new SchemaManager(mockCtx.storage.sql)
      })

      it('should run down migration for last applied version', async () => {
        schema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        await schema.initialize()
        await schema.migrate()

        mockCtx._sql.reset()
        await schema.rollback()

        const queries = mockCtx._sql.getExecutedQueries()
        expect(queries.some((q) => q.includes('DROP COLUMN tags'))).toBe(true)
      })

      it('should rollback to specified version', async () => {
        schema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        schema.registerMigration({
          version: 3,
          name: 'add_metadata',
          up: 'ALTER TABLE things ADD COLUMN metadata TEXT',
          down: 'ALTER TABLE things DROP COLUMN metadata',
        })

        await schema.initialize()
        await schema.migrate()

        mockCtx._sql.reset()
        await schema.rollback(1) // Rollback to version 1 (initial)

        const queries = mockCtx._sql.getExecutedQueries()
        expect(queries.some((q) => q.includes('DROP COLUMN tags'))).toBe(true)
        expect(queries.some((q) => q.includes('DROP COLUMN metadata'))).toBe(true)
      })

      it('should rollback multiple migrations in reverse order', async () => {
        schema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        schema.registerMigration({
          version: 3,
          name: 'add_metadata',
          up: 'ALTER TABLE things ADD COLUMN metadata TEXT',
          down: 'ALTER TABLE things DROP COLUMN metadata',
        })

        await schema.initialize()
        await schema.migrate()

        mockCtx._sql.reset()
        await schema.rollback(1)

        const queries = mockCtx._sql.getExecutedQueries()
        const metadataIndex = queries.findIndex((q) => q.includes('DROP COLUMN metadata'))
        const tagsIndex = queries.findIndex((q) => q.includes('DROP COLUMN tags'))

        // metadata (v3) should be rolled back before tags (v2)
        expect(metadataIndex).toBeLessThan(tagsIndex)
      })

      it('should update migration_history after rollback', async () => {
        schema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        await schema.initialize()
        await schema.migrate()

        mockCtx._sql.reset()
        await schema.rollback()

        const queries = mockCtx._sql.getExecutedQueries()
        const updateOrDeleteQuery = queries.find(
          (q) =>
            (q.includes('UPDATE') || q.includes('DELETE')) && q.includes('migration_history')
        )
        expect(updateOrDeleteQuery).toBeDefined()
      })

      it('should update schema_version after rollback', async () => {
        schema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        await schema.initialize()
        await schema.migrate()
        await schema.rollback()

        const version = await schema.getVersion()
        expect(version?.version).toBe(1)
      })

      it('should return rollback results with status', async () => {
        schema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        await schema.initialize()
        await schema.migrate()
        const results = await schema.rollback()

        expect(results).toBeDefined()
        expect(Array.isArray(results)).toBe(true)
        expect(results.length).toBe(1)
        expect(results[0].version).toBe(2)
        expect(results[0].status).toBe('rolled_back')
      })

      it('should throw when no migrations to rollback', async () => {
        await schema.initialize()

        await expect(schema.rollback()).rejects.toThrow()
      })

      it('should throw for migrations without down SQL', async () => {
        schema.registerMigration({
          version: 2,
          name: 'irreversible_migration',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          // No down migration
        })

        await schema.initialize()
        await schema.migrate()

        await expect(schema.rollback()).rejects.toThrow()
      })
    })

    describe('getMigrationHistory()', () => {
      let schema: SchemaManager
      let mockCtx: ReturnType<typeof createMockCtx>

      beforeEach(() => {
        mockCtx = createMockCtx()
        schema = new SchemaManager(mockCtx.storage.sql)
      })

      it('should return empty array before any migrations', async () => {
        await schema.initialize()
        const history = await schema.getMigrationHistory()

        expect(history).toEqual([])
      })

      it('should return applied migrations with timestamps', async () => {
        schema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        await schema.initialize()
        await schema.migrate()

        const history = await schema.getMigrationHistory()

        expect(history.length).toBe(1)
        expect(history[0].version).toBe(2)
        expect(history[0].name).toBe('add_tags')
        expect(history[0].appliedAt).toBeInstanceOf(Date)
      })

      it('should return migrations in order of application', async () => {
        schema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        schema.registerMigration({
          version: 3,
          name: 'add_metadata',
          up: 'ALTER TABLE things ADD COLUMN metadata TEXT',
          down: 'ALTER TABLE things DROP COLUMN metadata',
        })

        await schema.initialize()
        await schema.migrate()

        const history = await schema.getMigrationHistory()

        expect(history.length).toBe(2)
        expect(history[0].version).toBe(2)
        expect(history[1].version).toBe(3)
      })

      it('should include migration status (applied/rolled_back)', async () => {
        schema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        await schema.initialize()
        await schema.migrate()

        const history = await schema.getMigrationHistory()

        expect(history[0].status).toBe('applied')
      })
    })

    describe('getPendingMigrations()', () => {
      let schema: SchemaManager
      let mockCtx: ReturnType<typeof createMockCtx>

      beforeEach(() => {
        mockCtx = createMockCtx()
        schema = new SchemaManager(mockCtx.storage.sql)
      })

      it('should return all registered migrations before any applied', async () => {
        schema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        schema.registerMigration({
          version: 3,
          name: 'add_metadata',
          up: 'ALTER TABLE things ADD COLUMN metadata TEXT',
          down: 'ALTER TABLE things DROP COLUMN metadata',
        })

        await schema.initialize()
        const pending = await schema.getPendingMigrations()

        expect(pending.length).toBe(2)
        expect(pending[0].version).toBe(2)
        expect(pending[1].version).toBe(3)
      })

      it('should return empty array when all migrations applied', async () => {
        schema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        await schema.initialize()
        await schema.migrate()

        const pending = await schema.getPendingMigrations()

        expect(pending).toEqual([])
      })

      it('should return only unapplied migrations', async () => {
        schema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        schema.registerMigration({
          version: 3,
          name: 'add_metadata',
          up: 'ALTER TABLE things ADD COLUMN metadata TEXT',
          down: 'ALTER TABLE things DROP COLUMN metadata',
        })

        await schema.initialize()
        await schema.migrate(2) // Only apply version 2

        const pending = await schema.getPendingMigrations()

        expect(pending.length).toBe(1)
        expect(pending[0].version).toBe(3)
      })

      it('should return migrations sorted by version', async () => {
        // Register out of order
        schema.registerMigration({
          version: 5,
          name: 'add_priority',
          up: 'ALTER TABLE actions ADD COLUMN priority INTEGER',
          down: 'ALTER TABLE actions DROP COLUMN priority',
        })

        schema.registerMigration({
          version: 3,
          name: 'add_metadata',
          up: 'ALTER TABLE things ADD COLUMN metadata TEXT',
          down: 'ALTER TABLE things DROP COLUMN metadata',
        })

        schema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        await schema.initialize()
        const pending = await schema.getPendingMigrations()

        expect(pending[0].version).toBe(2)
        expect(pending[1].version).toBe(3)
        expect(pending[2].version).toBe(5)
      })
    })

    describe('getCurrentMigrationVersion()', () => {
      let schema: SchemaManager
      let mockCtx: ReturnType<typeof createMockCtx>

      beforeEach(() => {
        mockCtx = createMockCtx()
        schema = new SchemaManager(mockCtx.storage.sql)
      })

      it('should return 1 after initialization (base schema)', async () => {
        await schema.initialize()
        const version = await schema.getCurrentMigrationVersion()

        expect(version).toBe(1)
      })

      it('should return latest applied migration version', async () => {
        schema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        schema.registerMigration({
          version: 3,
          name: 'add_metadata',
          up: 'ALTER TABLE things ADD COLUMN metadata TEXT',
          down: 'ALTER TABLE things DROP COLUMN metadata',
        })

        await schema.initialize()
        await schema.migrate()

        const version = await schema.getCurrentMigrationVersion()

        expect(version).toBe(3)
      })

      it('should return correct version after partial migration', async () => {
        schema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        schema.registerMigration({
          version: 3,
          name: 'add_metadata',
          up: 'ALTER TABLE things ADD COLUMN metadata TEXT',
          down: 'ALTER TABLE things DROP COLUMN metadata',
        })

        await schema.initialize()
        await schema.migrate(2)

        const version = await schema.getCurrentMigrationVersion()

        expect(version).toBe(2)
      })

      it('should return correct version after rollback', async () => {
        schema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        await schema.initialize()
        await schema.migrate()
        await schema.rollback()

        const version = await schema.getCurrentMigrationVersion()

        expect(version).toBe(1)
      })

      it('should return 0 before initialization', async () => {
        const version = await schema.getCurrentMigrationVersion()

        expect(version).toBe(0)
      })
    })

    describe('Migration History Table', () => {
      let schema: SchemaManager
      let mockCtx: ReturnType<typeof createMockCtx>

      beforeEach(() => {
        mockCtx = createMockCtx()
        schema = new SchemaManager(mockCtx.storage.sql)
      })

      it('should create migration_history table on initialize', async () => {
        await schema.initialize()

        const queries = mockCtx._sql.getExecutedQueries()
        const hasMigrationHistoryTable = queries.some(
          (q) => q.includes('CREATE TABLE') && q.includes('migration_history')
        )
        expect(hasMigrationHistoryTable).toBe(true)
      })

      it('should have version column in migration_history', async () => {
        await schema.initialize()

        const queries = mockCtx._sql.getExecutedQueries()
        const migrationHistoryQuery = queries.find(
          (q) => q.includes('CREATE TABLE') && q.includes('migration_history')
        )
        expect(migrationHistoryQuery).toContain('version')
      })

      it('should have name column in migration_history', async () => {
        await schema.initialize()

        const queries = mockCtx._sql.getExecutedQueries()
        const migrationHistoryQuery = queries.find(
          (q) => q.includes('CREATE TABLE') && q.includes('migration_history')
        )
        expect(migrationHistoryQuery).toContain('name')
      })

      it('should have applied_at column in migration_history', async () => {
        await schema.initialize()

        const queries = mockCtx._sql.getExecutedQueries()
        const migrationHistoryQuery = queries.find(
          (q) => q.includes('CREATE TABLE') && q.includes('migration_history')
        )
        expect(migrationHistoryQuery).toContain('applied_at')
      })

      it('should have checksum column for migration validation', async () => {
        await schema.initialize()

        const queries = mockCtx._sql.getExecutedQueries()
        const migrationHistoryQuery = queries.find(
          (q) => q.includes('CREATE TABLE') && q.includes('migration_history')
        )
        expect(migrationHistoryQuery).toContain('checksum')
      })

      it('should have execution_time column for performance tracking', async () => {
        await schema.initialize()

        const queries = mockCtx._sql.getExecutedQueries()
        const migrationHistoryQuery = queries.find(
          (q) => q.includes('CREATE TABLE') && q.includes('migration_history')
        )
        expect(migrationHistoryQuery).toContain('execution_time')
      })
    })

    describe('Migration Validation', () => {
      let schema: SchemaManager
      let mockCtx: ReturnType<typeof createMockCtx>

      beforeEach(() => {
        mockCtx = createMockCtx()
        schema = new SchemaManager(mockCtx.storage.sql)
      })

      it('should calculate checksum for migration SQL', () => {
        const migration = {
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        }

        schema.registerMigration(migration)
        const checksum = schema.getMigrationChecksum(2)

        expect(checksum).toBeDefined()
        expect(typeof checksum).toBe('string')
        expect(checksum.length).toBeGreaterThan(0)
      })

      it('should detect checksum mismatch for modified migration', async () => {
        const migration = {
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        }

        schema.registerMigration(migration)
        await schema.initialize()
        await schema.migrate()

        // Simulate modifying the migration after it was applied
        // by creating a new schema manager with different migration
        const schema2 = new SchemaManager(mockCtx.storage.sql)
        schema2.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT NOT NULL', // Modified!
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        await expect(schema2.validateMigrationHistory()).rejects.toThrow(/checksum/i)
      })

      it('should have validateMigrationHistory method', () => {
        expect(schema.validateMigrationHistory).toBeDefined()
        expect(typeof schema.validateMigrationHistory).toBe('function')
      })

      it('should have getMigrationChecksum method', () => {
        expect(schema.getMigrationChecksum).toBeDefined()
        expect(typeof schema.getMigrationChecksum).toBe('function')
      })

      it('should pass validation when migrations match', async () => {
        const migration = {
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        }

        schema.registerMigration(migration)
        await schema.initialize()
        await schema.migrate()

        // Should not throw
        await expect(schema.validateMigrationHistory()).resolves.toBe(true)
      })
    })

    describe('Migration Error Handling', () => {
      let schema: SchemaManager
      let mockCtx: ReturnType<typeof createMockCtx>

      beforeEach(() => {
        mockCtx = createMockCtx()
        schema = new SchemaManager(mockCtx.storage.sql)
      })

      it('should not partially apply failed migration batch', async () => {
        // Create mock that fails on specific query
        const failingMockSql = {
          ...mockCtx.storage.sql,
          exec(query: string) {
            if (query.includes('WILL_FAIL')) {
              throw new Error('SQL Error: WILL_FAIL')
            }
            return mockCtx.storage.sql.exec(query)
          },
        }

        const failingSchema = new SchemaManager(failingMockSql)

        failingSchema.registerMigration({
          version: 2,
          name: 'add_tags',
          up: 'ALTER TABLE things ADD COLUMN tags TEXT',
          down: 'ALTER TABLE things DROP COLUMN tags',
        })

        failingSchema.registerMigration({
          version: 3,
          name: 'failing_migration',
          up: 'THIS_WILL_FAIL',
          down: 'ROLLBACK',
        })

        await failingSchema.initialize()

        await expect(failingSchema.migrate()).rejects.toThrow()

        // Version should remain at 1 (or 2 if atomic per-migration)
        const version = await failingSchema.getCurrentMigrationVersion()
        expect(version).toBeLessThan(3)
      })

      it('should record failed migration attempt', async () => {
        const failingMockSql = {
          ...mockCtx.storage.sql,
          exec(query: string) {
            if (query.includes('WILL_FAIL')) {
              throw new Error('SQL Error')
            }
            return mockCtx.storage.sql.exec(query)
          },
        }

        const failingSchema = new SchemaManager(failingMockSql)

        failingSchema.registerMigration({
          version: 2,
          name: 'failing_migration',
          up: 'THIS_WILL_FAIL',
          down: 'ROLLBACK',
        })

        await failingSchema.initialize()

        try {
          await failingSchema.migrate()
        } catch {
          // Expected to fail
        }

        // Should be able to retrieve failed migration info
        const history = await failingSchema.getMigrationHistory()
        const failedMigration = history.find((m) => m.version === 2)

        if (failedMigration) {
          expect(failedMigration.status).toBe('failed')
        }
      })

      it('should throw descriptive error on migration failure', async () => {
        const failingMockSql = {
          ...mockCtx.storage.sql,
          exec(query: string) {
            if (query.includes('WILL_FAIL')) {
              throw new Error('syntax error near WILL_FAIL')
            }
            return mockCtx.storage.sql.exec(query)
          },
        }

        const failingSchema = new SchemaManager(failingMockSql)

        failingSchema.registerMigration({
          version: 2,
          name: 'bad_migration',
          up: 'THIS_WILL_FAIL',
          down: 'ROLLBACK',
        })

        await failingSchema.initialize()

        await expect(failingSchema.migrate()).rejects.toThrow(/migration.*2.*bad_migration/i)
      })
    })

    describe('Migration Types', () => {
      it('should define Migration interface with required fields', () => {
        // Type assertion test - if this compiles, the types exist
        const migration: Migration = {
          version: 2,
          name: 'test_migration',
          up: 'ALTER TABLE test ADD COLUMN foo TEXT',
          down: 'ALTER TABLE test DROP COLUMN foo',
        }

        expect(migration.version).toBe(2)
        expect(migration.name).toBe('test_migration')
        expect(migration.up).toBeDefined()
      })

      it('should define MigrationResult interface', () => {
        const result: MigrationResult = {
          version: 2,
          name: 'test_migration',
          status: 'applied' as const,
          executionTime: 15,
          appliedAt: new Date(),
        }

        expect(result.status).toBe('applied')
        expect(result.executionTime).toBe(15)
      })

      it('should define MigrationHistoryEntry interface', () => {
        const entry: MigrationHistoryEntry = {
          version: 2,
          name: 'test_migration',
          appliedAt: new Date(),
          checksum: 'abc123',
          executionTime: 15,
          status: 'applied' as const,
        }

        expect(entry.checksum).toBe('abc123')
        expect(entry.appliedAt).toBeInstanceOf(Date)
      })
    })
  })
})
