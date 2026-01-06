/**
 * @dotdo/sqlite - SQLite utility functions for row conversion
 *
 * Extracted from do.ts for reuse across the codebase.
 * Provides type-safe conversion from raw SQLite database rows to domain objects.
 */

import type { Thing, Action, ActionStatus, Relationship, Event, Artifact, ArtifactType } from '../types'

// ============================================================================
// Raw Row Types (SQLite column names with snake_case)
// ============================================================================

/**
 * Raw database row for a Thing
 */
export interface ThingRow {
  ns: string
  type: string
  id: string
  url: string
  data: string
  created_at: string
  updated_at: string
}

/**
 * Raw database row for an Action
 */
export interface ActionRow {
  id: string
  actor: string
  object: string
  action: string
  status: string
  metadata: string | null
  result: string | null
  error: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  completed_at: string | null
}

/**
 * Raw database row for a Relationship
 */
export interface RelationshipRow {
  id: string
  type: string
  from: string
  to: string
  data: string | null
  created_at: string
}

/**
 * Raw database row for an Event
 */
export interface EventRow {
  id: string
  type: string
  timestamp: string
  source: string
  data: string
  correlation_id: string | null
  causation_id: string | null
}

/**
 * Raw database row for an Artifact
 */
export interface ArtifactRow {
  key: string
  type: string
  source: string
  source_hash: string
  content: string
  size: number | null
  metadata: string | null
  created_at: string
  expires_at: string | null
}

// ============================================================================
// Row Conversion Functions
// ============================================================================

/**
 * Convert a raw database row to a Thing object
 *
 * @param row - Raw SQLite row with snake_case columns
 * @returns Thing object with camelCase properties and parsed JSON data
 *
 * @example
 * const results = ctx.storage.sql.exec('SELECT * FROM things WHERE url = ?', url).toArray()
 * const thing = rowToThing<UserData>(results[0] as ThingRow)
 */
export function rowToThing<T extends Record<string, unknown> = Record<string, unknown>>(
  row: ThingRow
): Thing<T> {
  const parsed = JSON.parse(row.data)
  return {
    ns: row.ns,
    type: row.type,
    id: row.id,
    url: row.url,
    data: parsed.data as T,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    '@context': parsed['@context'],
  }
}

/**
 * Convert a raw database row to an Action object
 *
 * @param row - Raw SQLite row with snake_case columns
 * @returns Action object with camelCase properties and parsed JSON data
 *
 * @example
 * const results = ctx.storage.sql.exec('SELECT * FROM actions WHERE id = ?', id).toArray()
 * const action = rowToAction<ActionMetadata>(results[0] as ActionRow)
 */
export function rowToAction<T extends Record<string, unknown> = Record<string, unknown>>(
  row: ActionRow | Record<string, unknown>
): Action<T> {
  return {
    id: row.id as string,
    actor: row.actor as string,
    object: row.object as string,
    action: row.action as string,
    status: row.status as ActionStatus,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    startedAt: row.started_at ? new Date(row.started_at as string) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
    result: row.result ? JSON.parse(row.result as string) : undefined,
    error: row.error as string | undefined,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
  }
}

/**
 * Convert a raw database row to a Relationship object
 *
 * @param row - Raw SQLite row with snake_case columns
 * @returns Relationship object with camelCase properties and parsed JSON data
 *
 * @example
 * const results = ctx.storage.sql.exec('SELECT * FROM relationships WHERE "from" = ?', url).toArray()
 * const relationship = rowToRelationship<RelData>(results[0] as RelationshipRow)
 */
export function rowToRelationship<T extends Record<string, unknown> = Record<string, unknown>>(
  row: RelationshipRow
): Relationship<T> {
  return {
    id: row.id,
    type: row.type,
    from: row.from,
    to: row.to,
    createdAt: new Date(row.created_at),
    data: row.data ? JSON.parse(row.data) : undefined,
  }
}

/**
 * Convert a raw database row to an Event object
 *
 * @param row - Raw SQLite row with snake_case columns
 * @returns Event object with camelCase properties and parsed JSON data
 *
 * @example
 * const results = ctx.storage.sql.exec('SELECT * FROM events WHERE id = ?', id).toArray()
 * const event = rowToEvent<EventData>(results[0] as EventRow)
 */
export function rowToEvent<T extends Record<string, unknown> = Record<string, unknown>>(
  row: EventRow
): Event<T> {
  return {
    id: row.id,
    type: row.type,
    timestamp: new Date(row.timestamp),
    source: row.source,
    data: JSON.parse(row.data) as T,
    correlationId: row.correlation_id ?? undefined,
    causationId: row.causation_id ?? undefined,
  }
}

/**
 * Convert a raw database row to an Artifact object
 *
 * @param row - Raw SQLite row with snake_case columns
 * @returns Artifact object with camelCase properties and parsed JSON data
 *
 * @example
 * const results = ctx.storage.sql.exec('SELECT * FROM artifacts WHERE key = ?', key).toArray()
 * const artifact = rowToArtifact<CompiledCode>(results[0] as ArtifactRow)
 */
export function rowToArtifact<T = unknown>(row: ArtifactRow): Artifact<T> {
  return {
    key: row.key,
    type: row.type as ArtifactType,
    source: row.source,
    sourceHash: row.source_hash,
    content: JSON.parse(row.content) as T,
    size: row.size ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    createdAt: new Date(row.created_at),
    expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
  }
}
