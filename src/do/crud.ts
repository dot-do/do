/**
 * CRUD Operations Module
 *
 * Provides simple document CRUD operations:
 * - get: Get a document by ID
 * - list: List documents in a collection
 * - create: Create a new document
 * - update: Update an existing document
 * - delete: Delete a document
 */

import {
  DocumentSchema,
  safeJsonParse,
  ALLOWED_ORDER_COLUMNS,
} from '../sqlite'

import type { DOContext, Document, ListOptions } from './types'

/**
 * Get a document by ID
 */
export async function get<T extends Document>(
  ctx: DOContext,
  collection: string,
  id: string
): Promise<T | null> {
  ctx.initSchema()

  const results = ctx.ctx.storage.sql
    .exec('SELECT data FROM documents WHERE collection = ? AND id = ?', collection, id)
    .toArray()

  if (results.length === 0) {
    return null
  }

  const row = results[0] as { data: string }
  const parsed = safeJsonParse(row.data, DocumentSchema)
  if (parsed === null) {
    return null
  }
  return parsed as T
}

/**
 * List documents in a collection
 */
export async function list<T extends Document>(
  ctx: DOContext,
  collection: string,
  options?: ListOptions
): Promise<T[]> {
  ctx.initSchema()

  const limit = options?.limit ?? 100
  const offset = options?.offset ?? 0
  const orderBy = options?.orderBy ?? 'created_at'
  const order = options?.order ?? 'asc'

  // Validate orderBy column to prevent SQL injection
  if (!ALLOWED_ORDER_COLUMNS.has(orderBy)) {
    throw new Error(`Invalid orderBy column: ${orderBy}`)
  }

  // Build query with ordering and pagination
  const query = `SELECT data FROM documents WHERE collection = ? ORDER BY ${orderBy} ${order.toUpperCase()} LIMIT ? OFFSET ?`

  const results = ctx.ctx.storage.sql
    .exec(query, collection, limit, offset)
    .toArray()

  return results
    .map((row) => safeJsonParse((row as { data: string }).data, DocumentSchema))
    .filter((doc): doc is T => doc !== null)
}

/**
 * Create a new document
 */
export async function create<T extends Document>(
  ctx: DOContext,
  collection: string,
  doc: Omit<T, 'id'> | T
): Promise<T> {
  ctx.initSchema()

  const id = (doc as T).id ?? ctx.generateId()
  const now = new Date().toISOString()
  const document = {
    ...doc,
    id,
    createdAt: now,
    updatedAt: now,
  } as T

  ctx.ctx.storage.sql.exec(
    'INSERT INTO documents (collection, id, data) VALUES (?, ?, ?)',
    collection,
    id,
    JSON.stringify(document)
  )

  return document
}

/**
 * Update an existing document
 */
export async function update<T extends Document>(
  ctx: DOContext,
  collection: string,
  id: string,
  updates: Partial<T>
): Promise<T | null> {
  ctx.initSchema()

  // Get existing document first
  const existing = await get<T>(ctx, collection, id)
  if (!existing) {
    return null
  }

  // Merge updates with existing document and update timestamp
  const now = new Date().toISOString()
  const updated = {
    ...existing,
    ...updates,
    id,
    updatedAt: now,
  } as T

  ctx.ctx.storage.sql.exec(
    'UPDATE documents SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE collection = ? AND id = ?',
    JSON.stringify(updated),
    collection,
    id
  )

  return updated
}

/**
 * Delete a document
 */
export async function del(
  ctx: DOContext,
  collection: string,
  id: string
): Promise<boolean> {
  ctx.initSchema()

  // Check if document exists first
  const existing = await get(ctx, collection, id)
  if (!existing) {
    return false
  }

  ctx.ctx.storage.sql.exec(
    'DELETE FROM documents WHERE collection = ? AND id = ?',
    collection,
    id
  )

  return true
}
