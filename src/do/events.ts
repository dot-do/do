/**
 * Event Operations Module
 *
 * Provides immutable, append-only event tracking:
 * - track: Create an immutable event record
 * - getEvent: Get an event by ID
 * - queryEvents: Query events with filters
 */

import {
  EventDataSchema,
  safeJsonParse,
} from '../sqlite'

import type {
  DOContext,
  Event,
  CreateEventOptions,
  EventQueryOptions,
} from './types'

/**
 * Track an event (create immutable event record)
 */
export async function track<T extends Record<string, unknown>>(
  ctx: DOContext,
  options: CreateEventOptions<T>
): Promise<Event<T>> {
  ctx.initSchema()

  const id = ctx.generateId()
  const timestamp = new Date()

  ctx.ctx.storage.sql.exec(
    'INSERT INTO events (id, type, timestamp, source, data, correlation_id, causation_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id,
    options.type,
    timestamp.toISOString(),
    options.source,
    JSON.stringify(options.data),
    options.correlationId ?? null,
    options.causationId ?? null
  )

  return {
    id,
    type: options.type,
    timestamp,
    source: options.source,
    data: options.data,
    correlationId: options.correlationId,
    causationId: options.causationId,
  }
}

/**
 * Get event by ID
 */
export async function getEvent(
  ctx: DOContext,
  id: string
): Promise<Event | null> {
  ctx.initSchema()

  const results = ctx.ctx.storage.sql
    .exec('SELECT * FROM events WHERE id = ?', id)
    .toArray()

  if (results.length === 0) {
    return null
  }

  const row = results[0] as {
    id: string
    type: string
    timestamp: string
    source: string
    data: string
    correlation_id: string | null
    causation_id: string | null
  }

  // Use safe JSON parsing for event data
  const eventData = safeJsonParse(row.data, EventDataSchema)
  if (eventData === null) {
    return null
  }

  return {
    id: row.id,
    type: row.type,
    timestamp: new Date(row.timestamp),
    source: row.source,
    data: eventData,
    correlationId: row.correlation_id ?? undefined,
    causationId: row.causation_id ?? undefined,
  }
}

/**
 * Query events with filters
 */
export async function queryEvents(
  ctx: DOContext,
  options?: EventQueryOptions
): Promise<Event[]> {
  ctx.initSchema()

  const conditions: string[] = []
  const params: unknown[] = []

  if (options?.type) {
    conditions.push('type = ?')
    params.push(options.type)
  }

  if (options?.source) {
    conditions.push('source = ?')
    params.push(options.source)
  }

  if (options?.correlationId) {
    conditions.push('correlation_id = ?')
    params.push(options.correlationId)
  }

  if (options?.after) {
    conditions.push('timestamp > ?')
    params.push(options.after.toISOString())
  }

  if (options?.before) {
    conditions.push('timestamp < ?')
    params.push(options.before.toISOString())
  }

  const limit = options?.limit ?? 100
  const offset = options?.offset ?? 0

  let query = 'SELECT * FROM events'
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ')
  }
  query += ' ORDER BY timestamp ASC LIMIT ? OFFSET ?'
  params.push(limit, offset)

  const results = ctx.ctx.storage.sql.exec(query, ...params).toArray()

  return results
    .map((row) => {
      const r = row as {
        id: string
        type: string
        timestamp: string
        source: string
        data: string
        correlation_id: string | null
        causation_id: string | null
      }
      // Use safe JSON parsing for event data
      const eventData = safeJsonParse(r.data, EventDataSchema)
      if (eventData === null) {
        return null // Skip corrupted events
      }
      return {
        id: r.id,
        type: r.type,
        timestamp: new Date(r.timestamp),
        source: r.source,
        data: eventData,
        correlationId: r.correlation_id ?? undefined,
        causationId: r.causation_id ?? undefined,
      } as Event
    })
    .filter((event): event is Event => event !== null)
}
