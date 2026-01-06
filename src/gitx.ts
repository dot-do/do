/**
 * @dotdo/do - GitStore (gitx.do)
 *
 * Git object store extending DO base class.
 * Demonstrates how gitx.do should extend DO:
 * - Inherits all DO capabilities (CRUD, Events, Actions, etc.)
 * - Adds Git-specific operations (putObject, getObject, refs)
 * - Uses shared storage patterns (LRU, ObjectIndex)
 */

import { DO } from './do'
import { LRUCache, ObjectIndex } from './storage'

// ============================================================================
// Types
// ============================================================================

/**
 * Git object types
 */
export type GitObjectType = 'blob' | 'tree' | 'commit' | 'tag'

/**
 * Git object structure
 */
export interface GitObject {
  sha: string
  type: GitObjectType
  size: number
  data: Uint8Array
}

/**
 * Git reference structure
 */
export interface GitRef {
  name: string
  sha: string
  type: 'branch' | 'tag' | 'head'
}

/**
 * Options for listing Git objects
 */
export interface ListObjectsOptions {
  type?: GitObjectType
  limit?: number
}

/**
 * Pack file info (for R2 storage integration)
 */
export interface PackInfo {
  id: string
  objectCount: number
  size: number
  createdAt: Date
}

/**
 * Git object stats
 */
export interface GitObjectStats {
  totalObjects: number
  cacheStats: {
    count: number
    bytes: number
    hits: number
    misses: number
    hitRate: number
    evictions: number
  }
  tierStats: {
    hot: { count: number; totalBytes: number }
    r2: { count: number; totalBytes: number }
    parquet: { count: number; totalBytes: number }
  }
}

// ============================================================================
// GitStore Implementation
// ============================================================================

/**
 * GitStore - Git object store extending DO base class
 *
 * This class demonstrates gitx.do extending DO:
 * - Inherits all DO capabilities (CRUD, Events, Actions, etc.)
 * - Adds Git-specific operations
 * - Uses shared storage patterns (LRU, ObjectIndex)
 *
 * @example
 * ```typescript
 * export class MyGitStore extends GitStore {
 *   // Add custom methods
 * }
 * ```
 */
export class GitStore<Env = unknown, State = unknown> extends DO<Env, State> {
  // Git-specific state
  private objectCache: LRUCache<string, Uint8Array>
  private objectIndex: ObjectIndex

  constructor(ctx: unknown, env: Env) {
    super(ctx as any, env)

    // Extend allowed methods with Git operations
    this.allowedMethods = new Set([
      ...this.allowedMethods,
      'putObject',
      'getObject',
      'deleteObject',
      'listObjects',
      'updateRef',
      'resolveRef',
      'listRefs',
      'deleteRef',
      'getObjectStats',
    ])

    // Initialize Git-specific storage components
    this.objectCache = new LRUCache<string, Uint8Array>({
      maxCount: 1000,
      maxBytes: 50 * 1024 * 1024, // 50MB hot cache
      defaultTTL: 60 * 60 * 1000, // 1 hour
      onEvict: (sha) => {
        // Track eviction in ObjectIndex - demote to R2
        this.objectIndex.recordLocation({
          id: sha,
          tier: 'r2',
          createdAt: new Date(),
          accessedAt: new Date(),
          size: 0,
        })
      },
    })

    this.objectIndex = new ObjectIndex()
  }

  /**
   * Initialize Git-specific tables in SQLite
   * Called automatically on first operation
   */
  private initGitSchema(): void {
    const ctx = (this as any).ctx

    // Create git_objects table
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS git_objects (
        sha TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        size INTEGER NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create git_refs table
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS git_refs (
        name TEXT PRIMARY KEY,
        sha TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create git_packs table (for R2 pack tracking)
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS git_packs (
        id TEXT PRIMARY KEY,
        object_count INTEGER NOT NULL,
        size INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create indexes for performance
    ctx.storage.sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_git_objects_type ON git_objects(type)
    `)
    ctx.storage.sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_git_refs_type ON git_refs(type)
    `)
  }

  /**
   * Hash content to get Git object SHA
   */
  private async hashObject(type: GitObjectType, data: Uint8Array): Promise<string> {
    // Git object format: "<type> <size>\0<content>"
    const header = `${type} ${data.length}\0`
    const headerBytes = new TextEncoder().encode(header)

    const content = new Uint8Array(headerBytes.length + data.length)
    content.set(headerBytes, 0)
    content.set(data, headerBytes.length)

    const hashBuffer = await crypto.subtle.digest('SHA-1', content)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  /**
   * Store a Git object
   *
   * @param type The Git object type (blob, tree, commit, tag)
   * @param data The object content as Uint8Array
   * @returns The SHA-1 hash of the stored object
   */
  async putObject(type: GitObjectType, data: Uint8Array): Promise<string> {
    this.initGitSchema()

    const sha = await this.hashObject(type, data)

    // Store in hot cache
    this.objectCache.set(sha, data)

    // Record location in index
    await this.objectIndex.recordLocation({
      id: sha,
      tier: 'hot',
      createdAt: new Date(),
      accessedAt: new Date(),
      size: data.length,
    })

    // Track as event (using inherited DO event tracking)
    await this.track({
      type: 'GIT_OBJECT_CREATED',
      source: 'gitx',
      data: { sha, type, size: data.length },
    })

    // Persist to SQLite for durability
    const ctx = (this as any).ctx
    ctx.storage.sql.exec(
      'INSERT OR REPLACE INTO git_objects (sha, type, size, data) VALUES (?, ?, ?, ?)',
      sha,
      type,
      data.length,
      this.encodeBase64(data)
    )

    return sha
  }

  /**
   * Retrieve a Git object by SHA
   *
   * @param sha The SHA-1 hash of the object
   * @returns The Git object or null if not found
   */
  async getObject(sha: string): Promise<GitObject | null> {
    this.initGitSchema()

    // Try hot cache first
    const cached = this.objectCache.get(sha)
    if (cached) {
      // Update access time in index
      await this.objectIndex.lookupLocation(sha, { updateAccessTime: true })

      // Get metadata from SQLite
      const ctx = (this as any).ctx
      const results = ctx.storage.sql.exec(
        'SELECT type, size FROM git_objects WHERE sha = ?',
        sha
      ).toArray()

      if (results.length > 0) {
        const row = results[0] as { type: string; size: number }
        return {
          sha,
          type: row.type as GitObjectType,
          size: row.size,
          data: cached,
        }
      }
    }

    // Try SQLite
    const ctx = (this as any).ctx
    const results = ctx.storage.sql.exec(
      'SELECT * FROM git_objects WHERE sha = ?',
      sha
    ).toArray()

    if (results.length === 0) {
      return null
    }

    const row = results[0] as { sha: string; type: string; size: number; data: string }
    const data = this.decodeBase64(row.data)

    // Populate cache for future access
    this.objectCache.set(sha, data)

    // Update index
    await this.objectIndex.recordLocation({
      id: sha,
      tier: 'hot',
      createdAt: new Date(),
      accessedAt: new Date(),
      size: data.length,
    })

    return {
      sha: row.sha,
      type: row.type as GitObjectType,
      size: row.size,
      data,
    }
  }

  /**
   * Delete a Git object
   *
   * @param sha The SHA-1 hash of the object to delete
   * @returns True if object was deleted, false if not found
   */
  async deleteObject(sha: string): Promise<boolean> {
    this.initGitSchema()

    // Remove from cache
    this.objectCache.delete(sha)

    // Remove from index
    await this.objectIndex.deleteLocation(sha)

    // Check if exists in SQLite
    const ctx = (this as any).ctx
    const existing = ctx.storage.sql.exec(
      'SELECT sha FROM git_objects WHERE sha = ?',
      sha
    ).toArray()

    if (existing.length === 0) {
      return false
    }

    // Remove from SQLite
    ctx.storage.sql.exec('DELETE FROM git_objects WHERE sha = ?', sha)

    // Track deletion event
    await this.track({
      type: 'GIT_OBJECT_DELETED',
      source: 'gitx',
      data: { sha },
    })

    return true
  }

  /**
   * List all Git objects
   *
   * @param options Optional filtering and pagination
   * @returns Array of Git objects
   */
  async listObjects(options?: ListObjectsOptions): Promise<GitObject[]> {
    this.initGitSchema()

    const ctx = (this as any).ctx
    let query = 'SELECT * FROM git_objects'
    const params: unknown[] = []

    if (options?.type) {
      query += ' WHERE type = ?'
      params.push(options.type)
    }

    if (options?.limit) {
      query += ' LIMIT ?'
      params.push(options.limit)
    }

    const results = ctx.storage.sql.exec(query, ...params).toArray()

    return (results as Array<{ sha: string; type: string; size: number; data: string }>).map(
      (row) => ({
        sha: row.sha,
        type: row.type as GitObjectType,
        size: row.size,
        data: this.decodeBase64(row.data),
      })
    )
  }

  /**
   * Update or create a Git reference
   *
   * @param name The reference name (e.g., 'refs/heads/main')
   * @param sha The SHA-1 hash the reference points to
   * @param type The reference type (branch, tag, head)
   * @returns The created/updated reference
   */
  async updateRef(
    name: string,
    sha: string,
    type: 'branch' | 'tag' | 'head' = 'branch'
  ): Promise<GitRef> {
    this.initGitSchema()

    const ctx = (this as any).ctx

    // Check if ref exists
    const existing = ctx.storage.sql.exec(
      'SELECT * FROM git_refs WHERE name = ?',
      name
    ).toArray()

    if (existing.length > 0) {
      // Update existing ref
      ctx.storage.sql.exec(
        'UPDATE git_refs SET sha = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?',
        sha,
        name
      )
    } else {
      // Create new ref
      ctx.storage.sql.exec(
        'INSERT INTO git_refs (name, sha, type) VALUES (?, ?, ?)',
        name,
        sha,
        type
      )
    }

    // Track ref update event
    await this.track({
      type: 'GIT_REF_UPDATED',
      source: 'gitx',
      data: { name, sha, type },
    })

    return { name, sha, type }
  }

  /**
   * Resolve a Git reference to its SHA
   *
   * @param name The reference name
   * @returns The SHA-1 hash or null if not found
   */
  async resolveRef(name: string): Promise<string | null> {
    this.initGitSchema()

    const ctx = (this as any).ctx
    const results = ctx.storage.sql.exec(
      'SELECT sha FROM git_refs WHERE name = ?',
      name
    ).toArray()

    if (results.length === 0) {
      return null
    }

    return (results[0] as { sha: string }).sha
  }

  /**
   * List all Git references
   *
   * @param type Optional filter by reference type
   * @returns Array of references
   */
  async listRefs(type?: 'branch' | 'tag' | 'head'): Promise<GitRef[]> {
    this.initGitSchema()

    const ctx = (this as any).ctx
    let query = 'SELECT * FROM git_refs'
    const params: unknown[] = []

    if (type) {
      query += ' WHERE type = ?'
      params.push(type)
    }

    const results = ctx.storage.sql.exec(query, ...params).toArray()

    return (results as Array<{ name: string; sha: string; type: string }>).map((row) => ({
      name: row.name,
      sha: row.sha,
      type: row.type as 'branch' | 'tag' | 'head',
    }))
  }

  /**
   * Delete a Git reference
   *
   * @param name The reference name to delete
   * @returns True if deleted, false if not found
   */
  async deleteRef(name: string): Promise<boolean> {
    this.initGitSchema()

    const ctx = (this as any).ctx
    const existing = ctx.storage.sql.exec(
      'SELECT name FROM git_refs WHERE name = ?',
      name
    ).toArray()

    if (existing.length === 0) {
      return false
    }

    ctx.storage.sql.exec('DELETE FROM git_refs WHERE name = ?', name)

    // Track ref deletion event
    await this.track({
      type: 'GIT_REF_DELETED',
      source: 'gitx',
      data: { name },
    })

    return true
  }

  /**
   * Get object storage statistics
   *
   * @returns Statistics about stored objects, cache, and tier distribution
   */
  async getObjectStats(): Promise<GitObjectStats> {
    this.initGitSchema()

    const ctx = (this as any).ctx
    const results = ctx.storage.sql.exec(
      'SELECT COUNT(*) as count FROM git_objects'
    ).toArray()
    const totalObjects = (results[0] as { count: number })?.count ?? 0

    return {
      totalObjects,
      cacheStats: this.objectCache.getStats(),
      tierStats: await this.objectIndex.getStatsByTier(),
    }
  }

  /**
   * Get the LRU cache for direct access (useful for testing)
   */
  protected getObjectCache(): LRUCache<string, Uint8Array> {
    return this.objectCache
  }

  /**
   * Get the ObjectIndex for direct access (useful for testing)
   */
  protected getObjectIndex(): ObjectIndex {
    return this.objectIndex
  }

  /**
   * Encode Uint8Array to base64 string
   */
  private encodeBase64(data: Uint8Array): string {
    // Use Buffer if available (Node.js), otherwise use btoa
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(data).toString('base64')
    }
    // Browser fallback
    const binary = String.fromCharCode(...data)
    return btoa(binary)
  }

  /**
   * Decode base64 string to Uint8Array
   */
  private decodeBase64(str: string): Uint8Array {
    // Use Buffer if available (Node.js), otherwise use atob
    if (typeof Buffer !== 'undefined') {
      return Uint8Array.from(Buffer.from(str, 'base64'))
    }
    // Browser fallback
    const binary = atob(str)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }
}
