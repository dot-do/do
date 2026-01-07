/**
 * @dotdo/sqlite - SQLite utilities for Durable Objects
 *
 * This module provides SQLite-related utilities that could become @dotdo/sqlite:
 * - Type definitions for SQL execution
 * - Schema initialization helpers
 * - Table definitions for the DO data model
 * - Safe JSON parsing with Zod validation
 * - SQL injection prevention utilities
 */

import { z } from 'zod'

// ============================================================================
// SQL Execution Types
// ============================================================================

/**
 * Result of a SQL exec() call
 */
export type SqlExecResult = {
  toArray(): unknown[]
}

/**
 * SQL storage interface that matches Cloudflare Durable Objects storage.sql
 */
export interface SqlStorage {
  exec(query: string, ...params: unknown[]): SqlExecResult
}

/**
 * Storage interface with SQL support
 */
export interface StorageWithSql {
  sql: SqlStorage
}

// ============================================================================
// Zod Schemas for JSON.parse Validation
// ============================================================================

/**
 * Schema for parsed Document objects from database
 * Documents must have an id and can have any additional properties
 */
export const DocumentSchema = z.object({
  id: z.string(),
}).passthrough()

/**
 * Schema for parsed Thing data from database
 * The data field contains the nested structure with data and optional @context
 */
export const ThingDataSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  '@context': z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
}).passthrough()

/**
 * Schema for parsed Event data - can be any object
 */
export const EventDataSchema = z.record(z.string(), z.unknown())

/**
 * Schema for parsed Artifact content - can be any JSON value
 */
export const ArtifactContentSchema = z.unknown()

/**
 * Schema for parsed Artifact metadata - must be an object if present
 */
export const ArtifactMetadataSchema = z.record(z.string(), z.unknown())

/**
 * Schema for parsed Workflow context - must be an object
 */
export const WorkflowContextSchema = z.record(z.string(), z.unknown())

/**
 * Schema for parsed Workflow history - must be an array
 */
export const WorkflowHistorySchema = z.array(z.object({
  timestamp: z.number(),
  type: z.enum(['event', 'schedule', 'transition', 'action']),
  name: z.string(),
  data: z.unknown().optional(),
}))

/**
 * Schema for parsed Relationship data - can be any object if present
 */
export const RelationshipDataSchema = z.record(z.string(), z.unknown())

/**
 * Schema for parsed Action result - can be any JSON value
 */
export const ActionResultSchema = z.unknown()

/**
 * Schema for parsed Action metadata - can be any object if present
 */
export const ActionMetadataSchema = z.record(z.string(), z.unknown())

// ============================================================================
// Safe JSON Parsing
// ============================================================================

/**
 * Safely parse JSON and validate with Zod schema
 * Returns null if parsing or validation fails
 *
 * @param json - JSON string to parse
 * @param schema - Zod schema to validate against
 * @returns Parsed and validated data, or null on failure
 *
 * @example
 * const doc = safeJsonParse(row.data, DocumentSchema)
 * if (doc === null) {
 *   // Handle invalid data
 * }
 */
export function safeJsonParse<T>(json: string, schema: z.ZodType<T>): T | null {
  try {
    const parsed = JSON.parse(json)
    const result = schema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

/**
 * Safely parse optional JSON field and validate with Zod schema
 * Returns undefined if input is null/undefined, null if parsing fails
 *
 * @param json - JSON string to parse (or null/undefined)
 * @param schema - Zod schema to validate against
 * @returns Parsed and validated data, undefined if input is null/undefined, null if parsing/validation fails
 *
 * @example
 * const metadata = safeJsonParseOptional(row.metadata, MetadataSchema)
 * // Returns undefined if row.metadata is null
 * // Returns null if parsing fails
 * // Returns validated data on success
 */
export function safeJsonParseOptional<T>(
  json: string | null | undefined,
  schema: z.ZodType<T>
): T | null | undefined {
  if (json === null || json === undefined) {
    return undefined
  }
  return safeJsonParse(json, schema)
}

// ============================================================================
// SQL Injection Prevention
// ============================================================================

/**
 * Allowlist of valid column names for ORDER BY clauses.
 * This prevents SQL injection attacks through the orderBy parameter.
 * Only columns from the documents table are allowed.
 */
export const ALLOWED_ORDER_COLUMNS = new Set([
  'id',
  'collection',
  'data',
  'created_at',
  'updated_at',
  'createdAt',
  'updatedAt',
])

/**
 * Validate that an orderBy column is allowed
 * Throws an error if the column is not in the allowlist
 *
 * @param column - Column name to validate
 * @throws Error if column is not allowed
 */
export function validateOrderByColumn(column: string): void {
  if (!ALLOWED_ORDER_COLUMNS.has(column)) {
    throw new Error(`Invalid orderBy column: ${column}`)
  }
}

/**
 * Validate JSON field path to prevent SQL injection
 * Returns true if the field path is safe for use in SQL queries
 *
 * @param fieldPath - Field path to validate (e.g., "user.name", "items[0].id")
 * @returns true if valid, false otherwise
 */
export function isValidFieldPath(fieldPath: string): boolean {
  // Allow alphanumeric, dots, underscores, and array notation
  // This prevents SQL injection characters like ; ' " ` ( ) -- etc.
  const validPattern = /^[a-zA-Z_][a-zA-Z0-9_.\[\]]*$/
  if (!validPattern.test(fieldPath)) {
    return false
  }

  // Additional checks for specific SQL injection patterns
  const dangerous = ['--', '/*', '*/', ';', "'", '"', '`']
  return !dangerous.some(pattern => fieldPath.includes(pattern))
}

// ============================================================================
// Schema Initialization
// ============================================================================

/**
 * SQL statements for creating the documents table
 */
export const DOCUMENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS documents (
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (collection, id)
  )
`

/**
 * SQL statements for creating the things table
 */
export const THINGS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS things (
    ns TEXT NOT NULL,
    type TEXT NOT NULL,
    id TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    data TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ns, type, id)
  )
`

/**
 * SQL statements for creating the events table
 */
export const EVENTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    source TEXT NOT NULL,
    data TEXT NOT NULL,
    correlation_id TEXT,
    causation_id TEXT
  )
`

/**
 * SQL statements for creating the relationships table
 */
export const RELATIONSHIPS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS relationships (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    data TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("from", type, "to")
  )
`

/**
 * SQL statements for creating the actions table
 */
export const ACTIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS actions (
    id TEXT PRIMARY KEY,
    actor TEXT NOT NULL,
    object TEXT NOT NULL,
    action TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    metadata TEXT,
    result TEXT,
    error TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    started_at TEXT,
    completed_at TEXT,
    scheduled_for TEXT
  )
`

/**
 * SQL statements for creating the artifacts table
 */
export const ARTIFACTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS artifacts (
    key TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    source TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    content TEXT NOT NULL,
    size INTEGER,
    metadata TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT
  )
`

/**
 * SQL statements for creating the workflow_state table
 */
export const WORKFLOW_STATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS workflow_state (
    id TEXT PRIMARY KEY DEFAULT 'default',
    current TEXT,
    context TEXT DEFAULT '{}',
    history TEXT DEFAULT '[]',
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`

/**
 * SQL statements for creating the workflow_handlers table
 */
export const WORKFLOW_HANDLERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS workflow_handlers (
    id TEXT PRIMARY KEY,
    event_pattern TEXT NOT NULL,
    handler_type TEXT NOT NULL,
    schedule TEXT,
    handler_fn TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`

/**
 * SQL statements for creating the workflow_schedules table
 */
export const WORKFLOW_SCHEDULES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS workflow_schedules (
    id TEXT PRIMARY KEY,
    schedule_type TEXT NOT NULL,
    schedule_value INTEGER,
    cron_expression TEXT,
    handler_id TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`

/**
 * All table creation SQL statements in order
 */
export const ALL_TABLES_SQL = [
  DOCUMENTS_TABLE_SQL,
  THINGS_TABLE_SQL,
  EVENTS_TABLE_SQL,
  RELATIONSHIPS_TABLE_SQL,
  ACTIONS_TABLE_SQL,
  ARTIFACTS_TABLE_SQL,
  WORKFLOW_STATE_TABLE_SQL,
  WORKFLOW_HANDLERS_TABLE_SQL,
  WORKFLOW_SCHEDULES_TABLE_SQL,
]

/**
 * Index creation SQL statements
 */
export const INDEX_SQL = {
  artifacts_source: 'CREATE INDEX IF NOT EXISTS idx_artifacts_source ON artifacts(source, type)',
  events_timestamp: 'CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)',
  events_type: 'CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)',
  actions_status: 'CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status)',
  actions_scheduled_for: 'CREATE INDEX IF NOT EXISTS idx_actions_scheduled_for ON actions(scheduled_for)',
  documents_collection: 'CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection)',
  things_ns: 'CREATE INDEX IF NOT EXISTS idx_things_ns ON things(ns)',
  things_type: 'CREATE INDEX IF NOT EXISTS idx_things_type ON things(type)',
}

/**
 * All index creation SQL statements
 */
export const ALL_INDEXES_SQL = Object.values(INDEX_SQL)

/**
 * Initialize all tables and indexes in the database
 *
 * @param sql - SQL storage interface
 *
 * @example
 * initSchema(ctx.storage.sql)
 */
export function initSchema(sql: SqlStorage): void {
  // Create all tables
  for (const tableSql of ALL_TABLES_SQL) {
    sql.exec(tableSql)
  }

  // Create all indexes
  for (const indexSql of ALL_INDEXES_SQL) {
    sql.exec(indexSql)
  }
}

// ============================================================================
// Re-export row conversion utilities from utils/sqlite
// ============================================================================

export {
  type ThingRow,
  type ActionRow,
  type RelationshipRow,
  type EventRow,
  type ArtifactRow,
  rowToThing,
  rowToAction,
  rowToRelationship,
  rowToEvent,
  rowToArtifact,
} from '../utils/sqlite'
