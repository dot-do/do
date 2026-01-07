/**
 * Thing Operations Module
 *
 * Provides graph database operations for Things:
 * - createThing: Create a thing with ns/type/id addressing
 * - getThing: Get thing by URL
 * - getThingById: Get thing by ns/type/id
 * - setThing: Upsert a thing by URL
 * - deleteThing: Delete a thing
 * - listThings: List all things
 * - findThings: Find things matching criteria
 * - updateThing: Partial update a thing
 * - upsertThing: Create or update a thing
 */

import {
  ThingDataSchema,
  safeJsonParse,
  isValidFieldPath,
} from '../sqlite'

import type {
  DOContext,
  Thing,
  CreateOptions,
  UpdateOptions,
  ListOptions,
} from './types'

/**
 * Generate URL from ns/type/id
 */
export function generateThingUrl(ns: string, type: string, id: string): string {
  return `https://${ns}/${type}/${id}`
}

/**
 * Parse URL to extract ns/type/id
 */
export function parseThingUrl(url: string): { ns: string; type: string; id: string } {
  const parsed = new URL(url)
  const pathParts = parsed.pathname.split('/').filter(Boolean)
  return {
    ns: parsed.hostname,
    type: pathParts[0] || '',
    id: pathParts.slice(1).join('/') || '',
  }
}

/**
 * Convert raw database row to Thing object
 */
function rowToThing<T extends Record<string, unknown>>(row: {
  ns: string
  type: string
  id: string
  url: string
  data: string
  created_at: string
  updated_at: string
}): Thing<T> | null {
  const parsed = safeJsonParse(row.data, ThingDataSchema)
  if (parsed === null) {
    return null
  }
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
 * Validate JSON field path to prevent SQL injection
 */
function validateJsonFieldPath(path: string): void {
  if (!isValidFieldPath(path)) {
    throw new Error(`Invalid JSON field path: "${path}". Paths may only contain alphanumeric characters, underscores, dots, and brackets.`)
  }
}

/**
 * Create a thing with ns/type/id addressing
 */
export async function createThing<T extends Record<string, unknown>>(
  ctx: DOContext,
  options: CreateOptions<T>
): Promise<Thing<T>> {
  ctx.initSchema()

  const id = options.id ?? ctx.generateId()
  const url = options.url ?? generateThingUrl(options.ns, options.type, id)
  const now = new Date().toISOString()

  const dataToStore = {
    data: options.data,
    '@context': options['@context'],
  }

  ctx.ctx.storage.sql.exec(
    'INSERT INTO things (ns, type, id, url, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    options.ns,
    options.type,
    id,
    url,
    JSON.stringify(dataToStore),
    now,
    now
  )

  return {
    ns: options.ns,
    type: options.type,
    id,
    url,
    data: options.data,
    createdAt: new Date(now),
    updatedAt: new Date(now),
    '@context': options['@context'],
  }
}

/**
 * Get thing by URL
 */
export async function getThing<T extends Record<string, unknown>>(
  ctx: DOContext,
  url: string
): Promise<Thing<T> | null> {
  ctx.initSchema()

  const results = ctx.ctx.storage.sql
    .exec('SELECT ns, type, id, url, data, created_at, updated_at FROM things WHERE url = ?', url)
    .toArray()

  if (results.length === 0) {
    return null
  }

  return rowToThing<T>(results[0] as {
    ns: string
    type: string
    id: string
    url: string
    data: string
    created_at: string
    updated_at: string
  })
}

/**
 * Get thing by ns/type/id
 */
export async function getThingById<T extends Record<string, unknown>>(
  ctx: DOContext,
  ns: string,
  type: string,
  id: string
): Promise<Thing<T> | null> {
  ctx.initSchema()

  const results = ctx.ctx.storage.sql
    .exec(
      'SELECT ns, type, id, url, data, created_at, updated_at FROM things WHERE ns = ? AND type = ? AND id = ?',
      ns,
      type,
      id
    )
    .toArray()

  if (results.length === 0) {
    return null
  }

  return rowToThing<T>(results[0] as {
    ns: string
    type: string
    id: string
    url: string
    data: string
    created_at: string
    updated_at: string
  })
}

/**
 * Upsert a thing by URL
 */
export async function setThing<T extends Record<string, unknown>>(
  ctx: DOContext,
  url: string,
  data: T
): Promise<Thing<T>> {
  ctx.initSchema()

  // Check if thing exists
  const existing = await getThing<T>(ctx, url)
  const now = new Date().toISOString()

  if (existing) {
    // Update existing thing
    const dataToStore = {
      data,
      '@context': existing['@context'],
    }

    ctx.ctx.storage.sql.exec(
      'UPDATE things SET data = ?, updated_at = ? WHERE url = ?',
      JSON.stringify(dataToStore),
      now,
      url
    )

    return {
      ...existing,
      data,
      updatedAt: new Date(now),
    }
  }

  // Create new thing - parse URL to get ns/type/id
  const { ns, type, id } = parseThingUrl(url)
  const dataToStore = { data }

  ctx.ctx.storage.sql.exec(
    'INSERT INTO things (ns, type, id, url, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ns,
    type,
    id,
    url,
    JSON.stringify(dataToStore),
    now,
    now
  )

  return {
    ns,
    type,
    id,
    url,
    data,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  }
}

/**
 * Delete a thing by URL
 */
export async function deleteThing(
  ctx: DOContext,
  url: string
): Promise<boolean> {
  ctx.initSchema()

  // Check if thing exists
  const existing = await getThing(ctx, url)
  if (!existing) {
    return false
  }

  ctx.ctx.storage.sql.exec('DELETE FROM things WHERE url = ?', url)
  return true
}

/**
 * List all things with optional filtering
 */
export async function listThings<T extends Record<string, unknown>>(
  ctx: DOContext,
  options?: ListOptions
): Promise<Thing<T>[]> {
  ctx.initSchema()

  const limit = options?.limit ?? 100
  const offset = options?.offset ?? 0

  const results = ctx.ctx.storage.sql
    .exec(
      'SELECT ns, type, id, url, data, created_at, updated_at FROM things ORDER BY created_at DESC LIMIT ? OFFSET ?',
      limit,
      offset
    )
    .toArray()

  return results
    .map((row) =>
      rowToThing<T>(row as {
        ns: string
        type: string
        id: string
        url: string
        data: string
        created_at: string
        updated_at: string
      })
    )
    .filter((thing): thing is Thing<T> => thing !== null)
}

/**
 * Find things matching criteria
 */
export async function findThings<T extends Record<string, unknown>>(
  ctx: DOContext,
  options: ListOptions
): Promise<Thing<T>[]> {
  ctx.initSchema()

  const limit = options?.limit ?? 100
  const offset = options?.offset ?? 0
  const where = options?.where ?? {}

  // Build query conditions
  const conditions: string[] = []
  const params: unknown[] = []

  if (where.ns) {
    conditions.push('ns = ?')
    params.push(where.ns)
  }
  if (where.type) {
    conditions.push('type = ?')
    params.push(where.type)
  }

  // Check for data field filters (e.g., 'data.role': 'admin')
  for (const [key, value] of Object.entries(where)) {
    if (key.startsWith('data.')) {
      // Use JSON extraction for data fields
      const fieldPath = key.slice(5) // Remove 'data.' prefix

      // Validate the field path to prevent SQL injection
      validateJsonFieldPath(fieldPath)

      conditions.push(`json_extract(data, '$.data.${fieldPath}') = ?`)
      params.push(value)
    }
  }

  let query = 'SELECT ns, type, id, url, data, created_at, updated_at FROM things'
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ')
  }
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
  params.push(limit, offset)

  const results = ctx.ctx.storage.sql.exec(query, ...params).toArray()

  return results
    .map((row) =>
      rowToThing<T>(row as {
        ns: string
        type: string
        id: string
        url: string
        data: string
        created_at: string
        updated_at: string
      })
    )
    .filter((thing): thing is Thing<T> => thing !== null)
}

/**
 * Update a thing (partial update)
 */
export async function updateThing<T extends Record<string, unknown>>(
  ctx: DOContext,
  url: string,
  options: UpdateOptions<T>
): Promise<Thing<T> | null> {
  ctx.initSchema()

  const existing = await getThing<T>(ctx, url)
  if (!existing) {
    return null
  }

  const now = new Date().toISOString()
  const mergedData = { ...existing.data, ...options.data }
  const dataToStore = {
    data: mergedData,
    '@context': existing['@context'],
  }

  ctx.ctx.storage.sql.exec(
    'UPDATE things SET data = ?, updated_at = ? WHERE url = ?',
    JSON.stringify(dataToStore),
    now,
    url
  )

  return {
    ...existing,
    data: mergedData as T,
    updatedAt: new Date(now),
  }
}

/**
 * Upsert a thing by CreateOptions
 */
export async function upsertThing<T extends Record<string, unknown>>(
  ctx: DOContext,
  options: CreateOptions<T>
): Promise<Thing<T>> {
  ctx.initSchema()

  const id = options.id ?? ctx.generateId()
  const url = options.url ?? generateThingUrl(options.ns, options.type, id)

  // Check if thing exists
  const existing = await getThing<T>(ctx, url)

  if (existing) {
    // Update existing
    return setThing(ctx, url, options.data)
  }

  // Create new
  return createThing(ctx, { ...options, id })
}

/**
 * Create a Thing namespace object for fluent API access
 */
export function createThingNamespace(ctx: DOContext) {
  return {
    create: <T extends Record<string, unknown>>(options: CreateOptions<T>) =>
      createThing(ctx, options),
    get: <T extends Record<string, unknown>>(url: string) =>
      getThing<T>(ctx, url),
    getById: <T extends Record<string, unknown>>(ns: string, type: string, id: string) =>
      getThingById<T>(ctx, ns, type, id),
    set: <T extends Record<string, unknown>>(url: string, data: T) =>
      setThing(ctx, url, data),
    delete: (url: string) =>
      deleteThing(ctx, url),
    list: <T extends Record<string, unknown>>(options?: ListOptions) =>
      listThings<T>(ctx, options),
    find: <T extends Record<string, unknown>>(options: ListOptions) =>
      findThings<T>(ctx, options),
    update: <T extends Record<string, unknown>>(url: string, options: UpdateOptions<T>) =>
      updateThing(ctx, url, options),
    upsert: <T extends Record<string, unknown>>(options: CreateOptions<T>) =>
      upsertThing(ctx, options),
  }
}
