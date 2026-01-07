/**
 * Artifact Operations Module
 *
 * Provides cached content storage:
 * - storeArtifact: Store an artifact with optional TTL
 * - getArtifact: Get artifact by key
 * - getArtifactBySource: Get artifact by source URL and type
 * - deleteArtifact: Delete an artifact
 * - cleanExpiredArtifacts: Clean up expired artifacts
 */

import {
  ArtifactContentSchema,
  ArtifactMetadataSchema,
  safeJsonParse,
  safeJsonParseOptional,
} from '../sqlite'

import type {
  DOContext,
  Artifact,
  ArtifactType,
  StoreArtifactOptions,
} from './types'

/**
 * Store an artifact (cached content with optional TTL)
 */
export async function storeArtifact<T>(
  ctx: DOContext,
  options: StoreArtifactOptions<T>
): Promise<Artifact<T>> {
  ctx.initSchema()

  const { key, type, source, sourceHash, content, ttl, metadata } = options
  const now = new Date()
  const contentStr = JSON.stringify(content)
  const size = contentStr.length
  const expiresAt = ttl !== undefined ? new Date(now.getTime() + ttl) : undefined

  // Use INSERT OR REPLACE for upsert behavior
  ctx.ctx.storage.sql.exec(
    `INSERT OR REPLACE INTO artifacts (key, type, source, source_hash, content, size, metadata, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    key,
    type,
    source,
    sourceHash,
    contentStr,
    size,
    metadata ? JSON.stringify(metadata) : null,
    now.toISOString(),
    expiresAt ? expiresAt.toISOString() : null
  )

  return {
    key,
    type,
    source,
    sourceHash,
    content,
    createdAt: now,
    expiresAt,
    size,
    metadata,
  }
}

/**
 * Get an artifact by key
 */
export async function getArtifact<T = unknown>(
  ctx: DOContext,
  key: string
): Promise<Artifact<T> | null> {
  ctx.initSchema()

  const results = ctx.ctx.storage.sql
    .exec('SELECT * FROM artifacts WHERE key = ?', key)
    .toArray()

  if (results.length === 0) {
    return null
  }

  const row = results[0] as {
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

  // Use safe JSON parsing for artifact content and metadata
  const content = safeJsonParse(row.content, ArtifactContentSchema)
  if (content === null) {
    return null // Corrupted content
  }
  const metadata = safeJsonParseOptional(row.metadata, ArtifactMetadataSchema)

  return {
    key: row.key,
    type: row.type as ArtifactType,
    source: row.source,
    sourceHash: row.source_hash,
    content: content as T,
    createdAt: new Date(row.created_at),
    expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    size: row.size ?? undefined,
    metadata: metadata ?? undefined,
  }
}

/**
 * Get an artifact by source URL and type
 */
export async function getArtifactBySource(
  ctx: DOContext,
  source: string,
  type: ArtifactType
): Promise<Artifact | null> {
  ctx.initSchema()

  const results = ctx.ctx.storage.sql
    .exec('SELECT * FROM artifacts WHERE source = ? AND type = ?', source, type)
    .toArray()

  if (results.length === 0) {
    return null
  }

  const row = results[0] as {
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

  // Use safe JSON parsing for artifact content and metadata
  const content = safeJsonParse(row.content, ArtifactContentSchema)
  if (content === null) {
    return null // Corrupted content
  }
  const metadata = safeJsonParseOptional(row.metadata, ArtifactMetadataSchema)

  return {
    key: row.key,
    type: row.type as ArtifactType,
    source: row.source,
    sourceHash: row.source_hash,
    content,
    createdAt: new Date(row.created_at),
    expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    size: row.size ?? undefined,
    metadata: metadata ?? undefined,
  }
}

/**
 * Delete an artifact by key
 */
export async function deleteArtifact(
  ctx: DOContext,
  key: string
): Promise<boolean> {
  ctx.initSchema()

  // Check if artifact exists first
  const existing = await getArtifact(ctx, key)
  if (!existing) {
    return false
  }

  ctx.ctx.storage.sql.exec('DELETE FROM artifacts WHERE key = ?', key)
  return true
}

/**
 * Clean up expired artifacts
 * Returns the number of artifacts deleted
 */
export async function cleanExpiredArtifacts(
  ctx: DOContext
): Promise<number> {
  ctx.initSchema()

  const now = new Date().toISOString()

  // Get count of expired artifacts before deletion
  const expiredResults = ctx.ctx.storage.sql
    .exec(
      'SELECT COUNT(*) as count FROM artifacts WHERE expires_at IS NOT NULL AND expires_at < ?',
      now
    )
    .toArray()

  const count = (expiredResults[0] as { count: number })?.count ?? 0

  // Delete expired artifacts
  ctx.ctx.storage.sql.exec(
    'DELETE FROM artifacts WHERE expires_at IS NOT NULL AND expires_at < ?',
    now
  )

  return count
}
