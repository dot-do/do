/**
 * Relationship Operations Module
 *
 * Provides relationship/graph operations:
 * - relate: Create a relationship between two things
 * - unrelate: Remove a relationship
 * - related: Find things connected via relationships
 * - relationships: List relationship objects
 * - references: Find backlinks
 */

import {
  RelationshipDataSchema,
  safeJsonParseOptional,
} from '../sqlite'

import type {
  DOContext,
  Relationship,
  RelateOptions,
} from './types'

/**
 * Create a relationship between two things
 */
export async function relate<T extends Record<string, unknown> = Record<string, unknown>>(
  ctx: DOContext,
  options: RelateOptions<T>
): Promise<Relationship<T>> {
  ctx.initSchema()

  const { type, from, to, data } = options
  const createdAt = new Date()

  // Check for existing relationship first (for idempotency)
  const existing = ctx.ctx.storage.sql
    .exec(
      'SELECT id, type, "from", "to", data, created_at FROM relationships WHERE "from" = ? AND type = ? AND "to" = ?',
      from,
      type,
      to
    )
    .toArray() as Array<{
      id: string
      type: string
      from: string
      to: string
      data: string | null
      created_at: string
    }>

  if (existing.length > 0) {
    // Return existing relationship (idempotent)
    const row = existing[0]
    return {
      id: row.id,
      type: row.type,
      from: row.from,
      to: row.to,
      createdAt: new Date(row.created_at),
      data: safeJsonParseOptional(row.data, RelationshipDataSchema) ?? undefined,
    } as Relationship<T>
  }

  // Create new relationship
  const id = ctx.generateId()
  ctx.ctx.storage.sql.exec(
    'INSERT INTO relationships (id, type, "from", "to", data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    type,
    from,
    to,
    data ? JSON.stringify(data) : null,
    createdAt.toISOString()
  )

  return {
    id,
    type,
    from,
    to,
    createdAt,
    data,
  } as Relationship<T>
}

/**
 * Remove a relationship between two things
 */
export async function unrelate(
  ctx: DOContext,
  from: string,
  type: string,
  to: string
): Promise<boolean> {
  ctx.initSchema()

  // Check if relationship exists
  const existing = ctx.ctx.storage.sql
    .exec(
      'SELECT id FROM relationships WHERE "from" = ? AND type = ? AND "to" = ?',
      from,
      type,
      to
    )
    .toArray()

  if (existing.length === 0) {
    return false
  }

  ctx.ctx.storage.sql.exec(
    'DELETE FROM relationships WHERE "from" = ? AND type = ? AND "to" = ?',
    from,
    type,
    to
  )

  return true
}

/**
 * Find things connected via relationships
 * @param url The URL of the thing to find connections for
 * @param type Optional relationship type to filter by
 * @param direction 'from' for outgoing, 'to' for incoming, 'both' for either (default: 'from')
 */
export async function related(
  ctx: DOContext,
  url: string,
  type?: string,
  direction: 'from' | 'to' | 'both' = 'from'
): Promise<string[]> {
  ctx.initSchema()

  let results: Array<{ from: string; to: string }>

  if (direction === 'from') {
    // Outgoing relationships: this thing -> other things
    if (type) {
      results = ctx.ctx.storage.sql
        .exec(
          'SELECT "from", "to" FROM relationships WHERE "from" = ? AND type = ?',
          url,
          type
        )
        .toArray() as Array<{ from: string; to: string }>
    } else {
      results = ctx.ctx.storage.sql
        .exec('SELECT "from", "to" FROM relationships WHERE "from" = ?', url)
        .toArray() as Array<{ from: string; to: string }>
    }
    return results.map((r) => r.to)
  } else if (direction === 'to') {
    // Incoming relationships: other things -> this thing
    if (type) {
      results = ctx.ctx.storage.sql
        .exec(
          'SELECT "from", "to" FROM relationships WHERE "to" = ? AND type = ?',
          url,
          type
        )
        .toArray() as Array<{ from: string; to: string }>
    } else {
      results = ctx.ctx.storage.sql
        .exec('SELECT "from", "to" FROM relationships WHERE "to" = ?', url)
        .toArray() as Array<{ from: string; to: string }>
    }
    return results.map((r) => r.from)
  } else {
    // Both directions
    results = ctx.ctx.storage.sql
      .exec(
        'SELECT "from", "to" FROM relationships WHERE "from" = ? OR "to" = ?',
        url,
        url,
        type
      )
      .toArray() as Array<{ from: string; to: string }>

    // Return the "other" URL in each relationship
    const relatedUrls: string[] = []
    for (const r of results) {
      if (r.from === url) {
        relatedUrls.push(r.to)
      } else {
        relatedUrls.push(r.from)
      }
    }
    return relatedUrls
  }
}

/**
 * List relationship objects for a thing
 * @param url The URL of the thing
 * @param type Optional relationship type to filter by
 * @param direction 'from' for outgoing, 'to' for incoming, 'both' for either (default: 'from')
 */
export async function relationships(
  ctx: DOContext,
  url: string,
  type?: string,
  direction: 'from' | 'to' | 'both' = 'from'
): Promise<Relationship[]> {
  ctx.initSchema()

  let results: Array<{
    id: string
    type: string
    from: string
    to: string
    data: string | null
    created_at: string
  }>

  if (direction === 'from') {
    if (type) {
      results = ctx.ctx.storage.sql
        .exec(
          'SELECT id, type, "from", "to", data, created_at FROM relationships WHERE "from" = ? AND type = ?',
          url,
          type
        )
        .toArray() as typeof results
    } else {
      results = ctx.ctx.storage.sql
        .exec(
          'SELECT id, type, "from", "to", data, created_at FROM relationships WHERE "from" = ?',
          url
        )
        .toArray() as typeof results
    }
  } else if (direction === 'to') {
    if (type) {
      results = ctx.ctx.storage.sql
        .exec(
          'SELECT id, type, "from", "to", data, created_at FROM relationships WHERE "to" = ? AND type = ?',
          url,
          type
        )
        .toArray() as typeof results
    } else {
      results = ctx.ctx.storage.sql
        .exec(
          'SELECT id, type, "from", "to", data, created_at FROM relationships WHERE "to" = ?',
          url
        )
        .toArray() as typeof results
    }
  } else {
    // Both directions
    if (type) {
      results = ctx.ctx.storage.sql
        .exec(
          'SELECT id, type, "from", "to", data, created_at FROM relationships WHERE ("from" = ? OR "to" = ?) AND type = ?',
          url,
          url,
          type
        )
        .toArray() as typeof results
    } else {
      results = ctx.ctx.storage.sql
        .exec(
          'SELECT id, type, "from", "to", data, created_at FROM relationships WHERE "from" = ? OR "to" = ?',
          url,
          url
        )
        .toArray() as typeof results
    }
  }

  return results.map((row) => ({
    id: row.id,
    type: row.type,
    from: row.from,
    to: row.to,
    createdAt: new Date(row.created_at),
    data: safeJsonParseOptional(row.data, RelationshipDataSchema) ?? undefined,
  }))
}

/**
 * Find things that reference (point to) this thing (backlinks)
 * @param url The URL of the thing to find references for
 * @param type Optional relationship type to filter by
 */
export async function references(
  ctx: DOContext,
  url: string,
  type?: string
): Promise<string[]> {
  return related(ctx, url, type, 'to')
}
