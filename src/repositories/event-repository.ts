/**
 * EventRepository - Immutable event storage for event sourcing
 *
 * Implements the Repository Pattern for events with:
 * - Append-only semantics (no update/delete)
 * - Support for correlation and causation IDs
 * - Filtering by type, source, time range, etc.
 *
 * Events are IMMUTABLE - they can only be created and queried, never updated or deleted.
 * This is fundamental to event sourcing architecture.
 */

import type { Event, CreateEventOptions, EventQueryOptions } from '../types'

/**
 * SQL storage interface that the repository depends on
 */
export interface SqlStorage {
  exec(query: string, ...params: unknown[]): { toArray(): unknown[] }
}

/**
 * Raw event row from database
 */
interface EventRow {
  id: string
  type: string
  timestamp: string
  source: string
  data: string
  correlation_id: string | null
  causation_id: string | null
}

/**
 * Options for bulk tracking events
 */
export interface TrackManyOptions {
  correlationId?: string
}

/**
 * Generate a unique ID for events
 */
function generateEventId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `evt_${timestamp}_${random}`
}

/**
 * Convert a database row to an Event object
 */
function rowToEvent<T extends Record<string, unknown>>(row: EventRow): Event<T> {
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
 * Deep clone data to ensure immutability
 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

/**
 * EventRepository - Append-only event storage
 *
 * This repository intentionally does NOT implement update or delete operations
 * because events are immutable in event sourcing architecture.
 */
export class EventRepository {
  private sql: SqlStorage

  constructor(sql: SqlStorage) {
    this.sql = sql
    this.initSchema()
  }

  /**
   * Initialize the events table schema
   */
  private initSchema(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        source TEXT NOT NULL,
        data TEXT NOT NULL,
        correlation_id TEXT,
        causation_id TEXT
      )
    `)
  }

  /**
   * Track (create) a new event
   * Events are immutable - once created they cannot be modified
   */
  async track<T extends Record<string, unknown>>(
    options: CreateEventOptions<T>
  ): Promise<Event<T>> {
    const id = generateEventId()
    const timestamp = new Date()
    const dataJson = JSON.stringify(options.data)

    this.sql.exec(
      `INSERT INTO events (id, type, timestamp, source, data, correlation_id, causation_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      options.type,
      timestamp.toISOString(),
      options.source,
      dataJson,
      options.correlationId ?? null,
      options.causationId ?? null
    )

    // Return a deep clone to prevent mutation of stored data
    return {
      id,
      type: options.type,
      timestamp,
      source: options.source,
      data: deepClone(options.data),
      correlationId: options.correlationId,
      causationId: options.causationId,
    }
  }

  /**
   * Track multiple events in a batch
   * Optionally assign the same correlationId to all events
   */
  async trackMany<T extends Record<string, unknown>>(
    events: CreateEventOptions<T>[],
    options?: TrackManyOptions
  ): Promise<Event<T>[]> {
    const results: Event<T>[] = []

    for (const eventOptions of events) {
      const finalOptions = options?.correlationId
        ? { ...eventOptions, correlationId: options.correlationId }
        : eventOptions
      const event = await this.track(finalOptions)
      results.push(event)
    }

    return results
  }

  /**
   * Find an event by its ID
   */
  async findById<T extends Record<string, unknown>>(id: string): Promise<Event<T> | null> {
    const results = this.sql.exec(
      `SELECT id, type, timestamp, source, data, correlation_id, causation_id
       FROM events WHERE id = ?`,
      id
    ).toArray() as EventRow[]

    if (results.length === 0) {
      return null
    }

    return rowToEvent<T>(results[0])
  }

  /**
   * Find all events matching the given query options
   * Returns events in chronological order by default
   */
  async findAll<T extends Record<string, unknown>>(
    options?: EventQueryOptions
  ): Promise<Event<T>[]> {
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

    let query = `SELECT id, type, timestamp, source, data, correlation_id, causation_id FROM events`

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`
    }

    query += ' ORDER BY timestamp ASC'

    if (options?.limit) {
      query += ` LIMIT ${options.limit}`
    }

    if (options?.offset) {
      query += ` OFFSET ${options.offset}`
    }

    const results = this.sql.exec(query, ...params).toArray() as EventRow[]
    return results.map((row) => rowToEvent<T>(row))
  }

  /**
   * Find events that were caused by a specific event
   */
  async findByCausationId<T extends Record<string, unknown>>(
    causationId: string
  ): Promise<Event<T>[]> {
    const results = this.sql.exec(
      `SELECT id, type, timestamp, source, data, correlation_id, causation_id
       FROM events WHERE causation_id = ? ORDER BY timestamp ASC`,
      causationId
    ).toArray() as EventRow[]

    return results.map((row) => rowToEvent<T>(row))
  }

  /**
   * Find events by type prefix (e.g., 'Order.' matches 'Order.created', 'Order.updated')
   */
  async findByTypePrefix<T extends Record<string, unknown>>(
    prefix: string
  ): Promise<Event<T>[]> {
    const results = this.sql.exec(
      `SELECT id, type, timestamp, source, data, correlation_id, causation_id
       FROM events WHERE type LIKE ? ORDER BY timestamp ASC`,
      `${prefix}%`
    ).toArray() as EventRow[]

    return results.map((row) => rowToEvent<T>(row))
  }

  /**
   * Count events matching the given query options
   */
  async count(options?: EventQueryOptions): Promise<number> {
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

    let query = 'SELECT COUNT(*) as count FROM events'

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`
    }

    const results = this.sql.exec(query, ...params).toArray() as Array<{ count: number }>
    return results[0]?.count ?? 0
  }

  // NOTE: The following methods are intentionally NOT implemented
  // because events are IMMUTABLE in event sourcing:
  // - update / updateById / updateMany
  // - delete / deleteById / deleteMany
  // - remove / removeById
}
