/**
 * Schema Types
 *
 * Types for SchemaManager and database schema definitions.
 * Used by SchemaManager for table initialization and versioning.
 */

/**
 * Schema version information
 */
export interface SchemaVersion {
  /** Schema version number */
  version: number
  /** When the schema was first created */
  createdAt: Date
  /** When the schema was last updated */
  updatedAt: Date
}

/**
 * Column definition for a table
 */
export interface ColumnDefinition {
  /** Column name */
  name: string
  /** SQL data type (TEXT, INTEGER, etc.) */
  type: string
  /** Whether the column allows NULL values */
  nullable: boolean
  /** Default value expression */
  defaultValue?: string
  /** Whether the column is unique */
  unique?: boolean
}

/**
 * Index definition for a table
 */
export interface IndexDefinition {
  /** Index name */
  name: string
  /** Columns included in the index */
  columns: string[]
  /** Whether the index enforces uniqueness */
  unique?: boolean
}

/**
 * Table definition
 */
export interface TableDefinition {
  /** Table name */
  name: string
  /** Column definitions */
  columns: ColumnDefinition[]
  /** Primary key column(s) */
  primaryKey: string[]
  /** Index definitions */
  indexes?: IndexDefinition[]
}

/**
 * Migration definition for schema evolution
 */
export interface Migration {
  /** Migration version number (must be unique) */
  version: number
  /** Human-readable migration name */
  name: string
  /** SQL to apply the migration */
  up: string
  /** SQL to reverse the migration (optional for irreversible migrations) */
  down?: string
}

/**
 * Result of a migration operation
 */
export interface MigrationResult {
  /** Migration version that was processed */
  version: number
  /** Migration name */
  name: string
  /** Status of the migration */
  status: 'applied' | 'rolled_back' | 'failed' | 'skipped'
  /** Time taken to execute in milliseconds */
  executionTime: number
  /** When the migration was applied/rolled back */
  appliedAt: Date
  /** Error message if failed */
  error?: string
}

/**
 * Entry in the migration history table
 */
export interface MigrationHistoryEntry {
  /** Migration version */
  version: number
  /** Migration name */
  name: string
  /** When the migration was applied */
  appliedAt: Date
  /** Checksum of migration SQL for validation */
  checksum: string
  /** Time taken to execute in milliseconds */
  executionTime: number
  /** Current status */
  status: 'applied' | 'rolled_back' | 'failed'
}
