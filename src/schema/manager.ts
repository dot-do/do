/**
 * SchemaManager - Database Schema Manager
 *
 * Manages database schema initialization, versioning, and migrations.
 */

import type {
  SchemaVersion,
  TableDefinition,
  Migration,
  MigrationResult,
  MigrationHistoryEntry,
  ColumnDefinition,
} from './types'
import { createHash } from 'crypto'

/**
 * SQL storage interface compatible with Cloudflare Workers SQL
 */
interface SqlStorage {
  exec(query: string, ...params: unknown[]): { toArray(): unknown[] }
}

/**
 * SchemaManager handles database schema initialization and versioning.
 */
export class SchemaManager {
  private sql: SqlStorage
  private migrations: Map<number, Migration> = new Map()
  private initialized = false

  constructor(sql: SqlStorage) {
    this.sql = sql
  }

  /**
   * Initialize the database schema
   * Creates all required tables and indexes
   */
  async initialize(): Promise<void> {
    // Create all tables
    const definitions = this.getTableDefinitions()

    for (const table of definitions) {
      const createTableSQL = this.generateCreateTableSQL(table)
      this.sql.exec(createTableSQL)
    }

    // Create indexes
    this.createIndexes()

    // Create migration_history table
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS migration_history (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        checksum TEXT NOT NULL,
        execution_time INTEGER NOT NULL,
        status TEXT NOT NULL
      )
    `)

    // Create or update schema_version
    const currentVersion = await this.getCurrentMigrationVersion()
    if (currentVersion === 0) {
      // First initialization
      this.sql.exec(`
        INSERT OR REPLACE INTO schema_version (id, version, created_at, updated_at)
        VALUES (1, 1, datetime('now'), datetime('now'))
      `)
    }

    this.initialized = true
  }

  /**
   * Check if the schema has been initialized
   */
  async isInitialized(): Promise<boolean> {
    try {
      const result = this.sql.exec(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
      )
      const tables = result.toArray() as Array<{ name: string }>
      return tables.length > 0
    } catch {
      return false
    }
  }

  /**
   * Get the current schema version
   */
  async getVersion(): Promise<SchemaVersion | null> {
    try {
      const result = this.sql.exec('SELECT version, created_at, updated_at FROM schema_version WHERE id = 1')
      const rows = result.toArray() as Array<{
        version: number
        created_at: string
        updated_at: string
      }>

      if (rows.length === 0) {
        return null
      }

      const row = rows[0]
      return {
        version: row.version,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }
    } catch {
      return null
    }
  }

  /**
   * Get all table definitions
   */
  getTableDefinitions(): TableDefinition[] {
    return [
      {
        name: 'documents',
        columns: [
          { name: 'collection', type: 'TEXT', nullable: false },
          { name: 'id', type: 'TEXT', nullable: false },
          { name: 'data', type: 'TEXT', nullable: false },
          { name: 'created_at', type: 'TEXT', nullable: false },
          { name: 'updated_at', type: 'TEXT', nullable: false },
        ],
        primaryKey: ['collection', 'id'],
      },
      {
        name: 'things',
        columns: [
          { name: 'id', type: 'TEXT', nullable: false },
          { name: 'ns', type: 'TEXT', nullable: false },
          { name: 'type', type: 'TEXT', nullable: false },
          { name: 'url', type: 'TEXT', nullable: false, unique: true },
          { name: 'data', type: 'TEXT', nullable: false },
          { name: 'created_at', type: 'TEXT', nullable: false },
          { name: 'updated_at', type: 'TEXT', nullable: false },
        ],
        primaryKey: ['id'],
      },
      {
        name: 'events',
        columns: [
          { name: 'id', type: 'TEXT', nullable: false },
          { name: 'type', type: 'TEXT', nullable: false },
          { name: 'timestamp', type: 'TEXT', nullable: false },
          { name: 'correlation_id', type: 'TEXT', nullable: true },
          { name: 'data', type: 'TEXT', nullable: false },
          { name: 'created_at', type: 'TEXT', nullable: false },
        ],
        primaryKey: ['id'],
      },
      {
        name: 'relationships',
        columns: [
          { name: 'id', type: 'TEXT', nullable: false },
          { name: 'from_id', type: 'TEXT', nullable: false },
          { name: 'to_id', type: 'TEXT', nullable: false },
          { name: 'type', type: 'TEXT', nullable: false },
          { name: 'data', type: 'TEXT', nullable: true },
          { name: 'created_at', type: 'TEXT', nullable: false },
          { name: 'updated_at', type: 'TEXT', nullable: false },
        ],
        primaryKey: ['id'],
      },
      {
        name: 'actions',
        columns: [
          { name: 'id', type: 'TEXT', nullable: false },
          { name: 'actor', type: 'TEXT', nullable: false },
          { name: 'object', type: 'TEXT', nullable: false },
          { name: 'type', type: 'TEXT', nullable: false },
          { name: 'status', type: 'TEXT', nullable: false, defaultValue: "'pending'" },
          { name: 'data', type: 'TEXT', nullable: true },
          { name: 'created_at', type: 'TEXT', nullable: false },
          { name: 'updated_at', type: 'TEXT', nullable: false },
        ],
        primaryKey: ['id'],
      },
      {
        name: 'artifacts',
        columns: [
          { name: 'id', type: 'TEXT', nullable: false },
          { name: 'source', type: 'TEXT', nullable: false },
          { name: 'type', type: 'TEXT', nullable: false },
          { name: 'data', type: 'TEXT', nullable: false },
          { name: 'created_at', type: 'TEXT', nullable: false },
          { name: 'updated_at', type: 'TEXT', nullable: false },
        ],
        primaryKey: ['id'],
      },
      {
        name: 'workflow_state',
        columns: [
          { name: 'id', type: 'TEXT', nullable: false },
          { name: 'workflow_id', type: 'TEXT', nullable: false },
          { name: 'state', type: 'TEXT', nullable: false },
          { name: 'data', type: 'TEXT', nullable: true },
          { name: 'created_at', type: 'TEXT', nullable: false },
          { name: 'updated_at', type: 'TEXT', nullable: false },
        ],
        primaryKey: ['id'],
      },
      {
        name: 'schema_version',
        columns: [
          { name: 'id', type: 'INTEGER', nullable: false },
          { name: 'version', type: 'INTEGER', nullable: false },
          { name: 'created_at', type: 'TEXT', nullable: false },
          { name: 'updated_at', type: 'TEXT', nullable: false },
        ],
        primaryKey: ['id'],
      },
    ]
  }

  /**
   * Register a migration
   */
  registerMigration(migration: Migration): void {
    // Validate migration
    if (!migration.version) {
      throw new Error('Migration must have a version number')
    }
    if (!migration.name) {
      throw new Error('Migration must have a name')
    }
    if (!migration.up) {
      throw new Error('Migration must have an up SQL statement')
    }

    // Check for duplicate version
    if (this.migrations.has(migration.version)) {
      throw new Error(`Migration version ${migration.version} already registered`)
    }

    this.migrations.set(migration.version, migration)
  }

  /**
   * Run migrations up to a specific version (or all pending if not specified)
   */
  async migrate(targetVersion?: number): Promise<MigrationResult[]> {
    // Ensure schema is initialized
    const isInit = await this.isInitialized()
    if (!isInit) {
      throw new Error('Schema must be initialized before running migrations')
    }

    const currentVersion = await this.getCurrentMigrationVersion()
    const pending = await this.getPendingMigrations()
    const results: MigrationResult[] = []

    // Filter migrations to run
    const migrationsToRun = pending.filter(
      (m) => m.version > currentVersion && (targetVersion === undefined || m.version <= targetVersion)
    )

    for (const migration of migrationsToRun) {
      const startTime = Date.now()

      try {
        // Execute migration SQL
        const statements = migration.up.split(';').filter((s) => s.trim())
        for (const statement of statements) {
          if (statement.trim()) {
            this.sql.exec(statement)
          }
        }

        const executionTime = Date.now() - startTime
        const checksum = this.calculateChecksum(migration.up)

        // Record in migration_history
        this.sql.exec(`
          INSERT INTO migration_history (version, name, applied_at, checksum, execution_time, status)
          VALUES (${migration.version}, '${migration.name}', datetime('now'), '${checksum}', ${executionTime}, 'applied')
        `)

        // Update schema_version
        this.sql.exec(`
          UPDATE schema_version SET version = ${migration.version}, updated_at = datetime('now') WHERE id = 1
        `)

        results.push({
          version: migration.version,
          name: migration.name,
          status: 'applied',
          executionTime,
          appliedAt: new Date(),
        })
      } catch (error) {
        const executionTime = Date.now() - startTime
        const checksum = this.calculateChecksum(migration.up)

        // Record failed migration
        this.sql.exec(`
          INSERT INTO migration_history (version, name, applied_at, checksum, execution_time, status)
          VALUES (${migration.version}, '${migration.name}', datetime('now'), '${checksum}', ${executionTime}, 'failed')
        `)

        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        throw new Error(
          `Migration failed: version ${migration.version} (${migration.name}): ${errorMessage}`
        )
      }
    }

    return results
  }

  /**
   * Rollback migrations to a specific version
   */
  async rollback(targetVersion?: number): Promise<MigrationResult[]> {
    const currentVersion = await this.getCurrentMigrationVersion()
    const history = await this.getMigrationHistory()

    // Get applied migrations that need to be rolled back
    const appliedMigrations = history
      .filter((h) => h.status === 'applied')
      .sort((a, b) => b.version - a.version) // Reverse order for rollback

    const rollbackVersion = targetVersion ?? currentVersion - 1

    if (rollbackVersion >= currentVersion) {
      throw new Error('Target version must be less than current version')
    }

    const migrationsToRollback = appliedMigrations.filter(
      (m) => m.version > rollbackVersion
    )

    if (migrationsToRollback.length === 0) {
      throw new Error('No migrations to rollback')
    }

    const results: MigrationResult[] = []

    for (const historyEntry of migrationsToRollback) {
      const migration = this.migrations.get(historyEntry.version)

      if (!migration) {
        throw new Error(`Migration ${historyEntry.version} not found in registered migrations`)
      }

      if (!migration.down) {
        throw new Error(`Migration ${migration.version} (${migration.name}) does not have a down migration`)
      }

      const startTime = Date.now()

      try {
        // Execute down migration
        const statements = migration.down.split(';').filter((s) => s.trim())
        for (const statement of statements) {
          if (statement.trim()) {
            this.sql.exec(statement)
          }
        }

        const executionTime = Date.now() - startTime

        // Update migration_history
        this.sql.exec(`
          UPDATE migration_history
          SET status = 'rolled_back', execution_time = ${executionTime}
          WHERE version = ${migration.version}
        `)

        results.push({
          version: migration.version,
          name: migration.name,
          status: 'rolled_back',
          executionTime,
          appliedAt: new Date(),
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        throw new Error(
          `Rollback failed: version ${migration.version} (${migration.name}): ${errorMessage}`
        )
      }
    }

    // Update schema_version to target version
    this.sql.exec(`
      UPDATE schema_version SET version = ${rollbackVersion}, updated_at = datetime('now') WHERE id = 1
    `)

    return results
  }

  /**
   * Get migration history
   */
  async getMigrationHistory(): Promise<MigrationHistoryEntry[]> {
    try {
      const result = this.sql.exec(`
        SELECT version, name, applied_at, checksum, execution_time, status
        FROM migration_history
        ORDER BY version ASC
      `)

      const rows = result.toArray() as Array<{
        version: number
        name: string
        applied_at: string
        checksum: string
        execution_time: number
        status: 'applied' | 'rolled_back' | 'failed'
      }>

      return rows.map((row) => ({
        version: row.version,
        name: row.name,
        appliedAt: new Date(row.applied_at),
        checksum: row.checksum,
        executionTime: row.execution_time,
        status: row.status,
      }))
    } catch {
      return []
    }
  }

  /**
   * Get pending migrations
   */
  async getPendingMigrations(): Promise<Migration[]> {
    const currentVersion = await this.getCurrentMigrationVersion()
    const allMigrations = Array.from(this.migrations.values())
      .filter((m) => m.version > currentVersion)
      .sort((a, b) => a.version - b.version)

    return allMigrations
  }

  /**
   * Get current migration version
   */
  async getCurrentMigrationVersion(): Promise<number> {
    const isInit = await this.isInitialized()
    if (!isInit) {
      return 0
    }

    const version = await this.getVersion()
    return version?.version ?? 0
  }

  /**
   * Get migration checksum for validation
   */
  getMigrationChecksum(version: number): string {
    const migration = this.migrations.get(version)
    if (!migration) {
      throw new Error(`Migration ${version} not found`)
    }
    return this.calculateChecksum(migration.up)
  }

  /**
   * Validate migration history against registered migrations
   */
  async validateMigrationHistory(): Promise<boolean> {
    const history = await this.getMigrationHistory()

    for (const entry of history) {
      if (entry.status !== 'applied') {
        continue
      }

      const migration = this.migrations.get(entry.version)
      if (!migration) {
        throw new Error(`Migration ${entry.version} in history but not registered`)
      }

      const expectedChecksum = this.calculateChecksum(migration.up)
      if (entry.checksum !== expectedChecksum) {
        throw new Error(
          `Checksum mismatch for migration ${entry.version} (${entry.name}). ` +
            `Expected ${expectedChecksum}, got ${entry.checksum}. ` +
            `The migration SQL has been modified after it was applied.`
        )
      }
    }

    return true
  }

  /**
   * Generate CREATE TABLE SQL from table definition
   */
  private generateCreateTableSQL(table: TableDefinition): string {
    const columns = table.columns.map((col) => {
      let sql = `${col.name} ${col.type}`

      if (col.defaultValue) {
        sql += ` DEFAULT ${col.defaultValue}`
      }

      if (!col.nullable) {
        // Don't add NOT NULL to primary key columns as it's redundant
        if (!table.primaryKey.includes(col.name)) {
          sql += ' NOT NULL'
        }
      }

      if (col.unique && table.primaryKey.length === 1 && table.primaryKey[0] === col.name) {
        // For single column primary keys, unique is redundant
      } else if (col.unique) {
        sql += ' UNIQUE'
      }

      return sql
    })

    // Handle primary key
    const pkColumn = table.primaryKey[0]
    if (table.primaryKey.length === 1 && pkColumn === 'id') {
      // Single column primary key - add to column definition
      const pkIndex = columns.findIndex((c) => c.startsWith(`${pkColumn} `))
      if (pkIndex !== -1) {
        columns[pkIndex] += ' PRIMARY KEY'
      }
    } else {
      // Composite primary key or non-id primary key
      columns.push(`PRIMARY KEY (${table.primaryKey.join(', ')})`)
    }

    return `CREATE TABLE IF NOT EXISTS ${table.name} (\n  ${columns.join(',\n  ')}\n)`
  }

  /**
   * Create indexes for performance
   */
  private createIndexes(): void {
    // Create artifacts source index
    this.sql.exec(
      'CREATE INDEX IF NOT EXISTS idx_artifacts_source ON artifacts(source)'
    )

    // Additional useful indexes
    this.sql.exec(
      'CREATE INDEX IF NOT EXISTS idx_things_ns ON things(ns)'
    )
    this.sql.exec(
      'CREATE INDEX IF NOT EXISTS idx_things_type ON things(type)'
    )
    this.sql.exec(
      'CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)'
    )
    this.sql.exec(
      'CREATE INDEX IF NOT EXISTS idx_events_correlation_id ON events(correlation_id)'
    )
    this.sql.exec(
      'CREATE INDEX IF NOT EXISTS idx_relationships_from_id ON relationships(from_id)'
    )
    this.sql.exec(
      'CREATE INDEX IF NOT EXISTS idx_relationships_to_id ON relationships(to_id)'
    )
    this.sql.exec(
      'CREATE INDEX IF NOT EXISTS idx_actions_actor ON actions(actor)'
    )
    this.sql.exec(
      'CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status)'
    )
  }

  /**
   * Calculate checksum for migration SQL
   */
  private calculateChecksum(sql: string): string {
    return createHash('sha256').update(sql.trim()).digest('hex')
  }
}
