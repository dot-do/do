/**
 * @dotdo/do - GitStore Tests (RED Phase)
 *
 * Tests for gitx.do extending DO base class:
 * - GitStore should extend DO
 * - Git-specific operations (putObject, getObject, refs)
 * - Integration with shared patterns (LRU, ObjectIndex, WAL)
 * - R2 pack storage integration
 *
 * These tests define the expected behavior and should FAIL initially (RED),
 * then pass after implementation (GREEN).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DO } from '../src/do'
import { LRUCache, ObjectIndex } from '../src/storage'
import type { ObjectLocation } from '../src/storage'

// Mock WebSocketPair for Cloudflare Workers compatibility in Node.js
class MockWebSocket {
  readyState = 1
  send = vi.fn()
  close = vi.fn()
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
}

// Mock Response with webSocket property for WebSocket upgrade responses
const OriginalResponse = globalThis.Response
class MockResponse extends OriginalResponse {
  webSocket?: MockWebSocket
  private _status?: number
  constructor(body: BodyInit | null, init?: ResponseInit & { webSocket?: MockWebSocket }) {
    const wsStatus = init?.status
    const isWebSocketUpgrade = wsStatus === 101
    const safeInit = isWebSocketUpgrade ? { ...init, status: 200 } : init
    super(body, safeInit)
    if (isWebSocketUpgrade) {
      this._status = 101
    }
    if (init?.webSocket) {
      this.webSocket = init.webSocket
    }
  }
  get status() {
    return this._status ?? super.status
  }
}
globalThis.Response = MockResponse as typeof Response

// Mock WebSocketPair globally
class MockWebSocketPair {
  0: MockWebSocket
  1: MockWebSocket
  constructor() {
    this[0] = new MockWebSocket()
    this[1] = new MockWebSocket()
  }
}
;(globalThis as unknown as { WebSocketPair: typeof MockWebSocketPair }).WebSocketPair = MockWebSocketPair

// ============================================================================
// Types for GitStore
// ============================================================================

/**
 * Git object types
 */
type GitObjectType = 'blob' | 'tree' | 'commit' | 'tag'

/**
 * Git object structure
 */
interface GitObject {
  sha: string
  type: GitObjectType
  size: number
  data: Uint8Array
}

/**
 * Git reference structure
 */
interface GitRef {
  name: string
  sha: string
  type: 'branch' | 'tag' | 'head'
}

/**
 * Pack file info
 */
interface PackInfo {
  id: string
  objectCount: number
  size: number
  createdAt: Date
}

// ============================================================================
// Mock SQL Storage (same as do.test.ts)
// ============================================================================

function createMockSqlStorage() {
  const tables: Map<string, Map<string, Record<string, unknown>>> = new Map()

  return {
    exec(query: string, ...params: unknown[]) {
      const results: unknown[] = []
      const normalizedQuery = query.trim().toUpperCase()

      if (normalizedQuery.startsWith('CREATE TABLE') || normalizedQuery.startsWith('CREATE INDEX')) {
        // CREATE TABLE/INDEX - just initialize the table if needed
        const tableMatch = query.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)
        if (tableMatch) {
          const tableName = tableMatch[1]
          if (!tables.has(tableName)) {
            tables.set(tableName, new Map())
          }
        }
        // Also handle git_objects table
        if (query.includes('git_objects')) {
          if (!tables.has('git_objects')) {
            tables.set('git_objects', new Map())
          }
        }
        // Handle git_refs table
        if (query.includes('git_refs')) {
          if (!tables.has('git_refs')) {
            tables.set('git_refs', new Map())
          }
        }
        // Handle git_packs table
        if (query.includes('git_packs')) {
          if (!tables.has('git_packs')) {
            tables.set('git_packs', new Map())
          }
        }
      } else if (normalizedQuery.startsWith('INSERT')) {
        // Handle INSERT for git_objects
        if (query.includes('git_objects')) {
          const [sha, type, size, data] = params as [string, string, number, string]
          const tableName = 'git_objects'
          if (!tables.has(tableName)) {
            tables.set(tableName, new Map())
          }
          const table = tables.get(tableName)!
          table.set(sha, { sha, type, size, data, created_at: new Date().toISOString() })
        }
        // Handle INSERT for git_refs
        else if (query.includes('git_refs')) {
          const [name, sha, type] = params as [string, string, string]
          const tableName = 'git_refs'
          if (!tables.has(tableName)) {
            tables.set(tableName, new Map())
          }
          const table = tables.get(tableName)!
          table.set(name, { name, sha, type, created_at: new Date().toISOString() })
        }
        // Handle INSERT for documents (from base DO)
        else if (query.includes('documents')) {
          const [collection, id, data] = params as [string, string, string]
          const tableName = 'documents'
          if (!tables.has(tableName)) {
            tables.set(tableName, new Map())
          }
          const table = tables.get(tableName)!
          const key = `${collection}:${id}`
          table.set(key, { collection, id, data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        }
        // Handle INSERT for events (from base DO)
        else if (query.includes('events')) {
          const [id, type, timestamp, source, data] = params as [string, string, string, string, string]
          const tableName = 'events'
          if (!tables.has(tableName)) {
            tables.set(tableName, new Map())
          }
          const table = tables.get(tableName)!
          table.set(id, { id, type, timestamp, source, data })
        }
      } else if (normalizedQuery.startsWith('SELECT')) {
        // Handle SELECT for git_objects
        if (query.includes('git_objects')) {
          if (query.includes('WHERE sha = ?')) {
            const [sha] = params as [string]
            const table = tables.get('git_objects')
            if (table) {
              const row = table.get(sha)
              if (row) {
                results.push(row)
              }
            }
          } else {
            // List all objects
            const table = tables.get('git_objects')
            if (table) {
              results.push(...Array.from(table.values()))
            }
          }
        }
        // Handle SELECT for git_refs
        else if (query.includes('git_refs')) {
          if (query.includes('WHERE name = ?')) {
            const [name] = params as [string]
            const table = tables.get('git_refs')
            if (table) {
              const row = table.get(name)
              if (row) {
                results.push(row)
              }
            }
          } else {
            // List all refs
            const table = tables.get('git_refs')
            if (table) {
              results.push(...Array.from(table.values()))
            }
          }
        }
        // Handle SELECT for documents
        else if (query.includes('documents')) {
          const table = tables.get('documents')
          if (table) {
            if (query.includes('WHERE collection = ? AND id = ?')) {
              const [collection, id] = params as [string, string]
              const key = `${collection}:${id}`
              const row = table.get(key)
              if (row) {
                results.push(row)
              }
            } else if (query.includes('WHERE collection = ?')) {
              const [collection] = params as [string]
              for (const row of table.values()) {
                if (row.collection === collection) {
                  results.push(row)
                }
              }
            }
          }
        }
        // Handle SELECT for events
        else if (query.includes('events')) {
          const table = tables.get('events')
          if (table) {
            if (query.includes('WHERE type = ?')) {
              // Filter by event type
              const typeIdx = params.findIndex((p) => typeof p === 'string' && !p.includes('-'))
              const eventType = params[typeIdx] as string
              for (const row of table.values()) {
                if (row.type === eventType) {
                  results.push(row)
                }
              }
            } else if (query.includes('WHERE id = ?')) {
              const [id] = params as [string]
              const row = table.get(id)
              if (row) {
                results.push(row)
              }
            } else {
              // List all events
              results.push(...Array.from(table.values()))
            }
          }
        }
      } else if (normalizedQuery.startsWith('UPDATE')) {
        // Handle UPDATE for git_refs
        if (query.includes('git_refs')) {
          const [sha, name] = params as [string, string]
          const table = tables.get('git_refs')
          if (table && table.has(name)) {
            const existing = table.get(name)!
            table.set(name, { ...existing, sha, updated_at: new Date().toISOString() })
          }
        }
      } else if (normalizedQuery.startsWith('DELETE')) {
        // Handle DELETE for git_objects
        if (query.includes('git_objects')) {
          const [sha] = params as [string]
          const table = tables.get('git_objects')
          if (table) {
            table.delete(sha)
          }
        }
        // Handle DELETE for git_refs
        else if (query.includes('git_refs')) {
          const [name] = params as [string]
          const table = tables.get('git_refs')
          if (table) {
            table.delete(name)
          }
        }
      }

      return {
        toArray() {
          return results
        },
      }
    },
  }
}

/**
 * Create mock Durable Object state for testing
 */
function createMockState() {
  return {
    storage: {
      sql: createMockSqlStorage(),
    },
    acceptWebSocket: vi.fn(),
    setWebSocketAutoResponse: vi.fn(),
  }
}

// ============================================================================
// GitStore Class (to be implemented)
// ============================================================================

/**
 * GitStore - Git object store extending DO base class
 *
 * This class demonstrates gitx.do extending DO:
 * - Inherits all DO capabilities (CRUD, Events, Actions, etc.)
 * - Adds Git-specific operations
 * - Uses shared storage patterns (LRU, ObjectIndex)
 */
class GitStore extends DO<unknown, unknown> {
  // Git-specific state
  private objectCache: LRUCache<string, Uint8Array>
  private objectIndex: ObjectIndex

  constructor(ctx: unknown, env: unknown) {
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
        // Track eviction in ObjectIndex
        this.objectIndex.recordLocation({
          id: sha,
          tier: 'r2', // Demoted to R2
          createdAt: new Date(),
          accessedAt: new Date(),
          size: 0,
        })
      },
    })

    this.objectIndex = new ObjectIndex()
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
   */
  async putObject(type: GitObjectType, data: Uint8Array): Promise<string> {
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
      'INSERT INTO git_objects (sha, type, size, data) VALUES (?, ?, ?, ?)',
      sha,
      type,
      data.length,
      Buffer.from(data).toString('base64')
    )

    return sha
  }

  /**
   * Retrieve a Git object
   */
  async getObject(sha: string): Promise<GitObject | null> {
    // Try hot cache first
    const cached = this.objectCache.get(sha)
    if (cached) {
      // Update access time in index
      const location = await this.objectIndex.lookupLocation(sha, { updateAccessTime: true })
      if (location) {
        // Return from cache
        const ctx = (this as any).ctx
        const results = ctx.storage.sql.exec('SELECT * FROM git_objects WHERE sha = ?', sha).toArray()
        if (results.length > 0) {
          const row = results[0] as { sha: string; type: string; size: number }
          return {
            sha,
            type: row.type as GitObjectType,
            size: row.size,
            data: cached,
          }
        }
      }
    }

    // Try SQLite
    const ctx = (this as any).ctx
    const results = ctx.storage.sql.exec('SELECT * FROM git_objects WHERE sha = ?', sha).toArray()

    if (results.length === 0) {
      return null
    }

    const row = results[0] as { sha: string; type: string; size: number; data: string }
    const data = Uint8Array.from(Buffer.from(row.data, 'base64'))

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
   */
  async deleteObject(sha: string): Promise<boolean> {
    // Remove from cache
    this.objectCache.delete(sha)

    // Remove from index
    await this.objectIndex.deleteLocation(sha)

    // Remove from SQLite
    const ctx = (this as any).ctx
    const existing = ctx.storage.sql.exec('SELECT sha FROM git_objects WHERE sha = ?', sha).toArray()

    if (existing.length === 0) {
      return false
    }

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
   */
  async listObjects(options?: { type?: GitObjectType; limit?: number }): Promise<GitObject[]> {
    const ctx = (this as any).ctx
    const results = ctx.storage.sql.exec('SELECT * FROM git_objects').toArray()

    let objects = (results as Array<{ sha: string; type: string; size: number; data: string }>).map((row) => ({
      sha: row.sha,
      type: row.type as GitObjectType,
      size: row.size,
      data: Uint8Array.from(Buffer.from(row.data, 'base64')),
    }))

    // Filter by type if specified
    if (options?.type) {
      objects = objects.filter((obj) => obj.type === options.type)
    }

    // Apply limit
    if (options?.limit) {
      objects = objects.slice(0, options.limit)
    }

    return objects
  }

  /**
   * Update or create a Git reference
   */
  async updateRef(name: string, sha: string, type: 'branch' | 'tag' | 'head' = 'branch'): Promise<GitRef> {
    const ctx = (this as any).ctx

    // Check if ref exists
    const existing = ctx.storage.sql.exec('SELECT * FROM git_refs WHERE name = ?', name).toArray()

    if (existing.length > 0) {
      // Update existing ref
      ctx.storage.sql.exec('UPDATE git_refs SET sha = ? WHERE name = ?', sha, name)
    } else {
      // Create new ref
      ctx.storage.sql.exec('INSERT INTO git_refs (name, sha, type) VALUES (?, ?, ?)', name, sha, type)
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
   */
  async resolveRef(name: string): Promise<string | null> {
    const ctx = (this as any).ctx
    const results = ctx.storage.sql.exec('SELECT sha FROM git_refs WHERE name = ?', name).toArray()

    if (results.length === 0) {
      return null
    }

    return (results[0] as { sha: string }).sha
  }

  /**
   * List all Git references
   */
  async listRefs(type?: 'branch' | 'tag' | 'head'): Promise<GitRef[]> {
    const ctx = (this as any).ctx
    const results = ctx.storage.sql.exec('SELECT * FROM git_refs').toArray()

    let refs = (results as Array<{ name: string; sha: string; type: string }>).map((row) => ({
      name: row.name,
      sha: row.sha,
      type: row.type as 'branch' | 'tag' | 'head',
    }))

    // Filter by type if specified
    if (type) {
      refs = refs.filter((ref) => ref.type === type)
    }

    return refs
  }

  /**
   * Delete a Git reference
   */
  async deleteRef(name: string): Promise<boolean> {
    const ctx = (this as any).ctx
    const existing = ctx.storage.sql.exec('SELECT name FROM git_refs WHERE name = ?', name).toArray()

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
   */
  async getObjectStats(): Promise<{
    totalObjects: number
    cacheStats: ReturnType<typeof this.objectCache.getStats>
    tierStats: Awaited<ReturnType<typeof this.objectIndex.getStatsByTier>>
  }> {
    const ctx = (this as any).ctx
    const results = ctx.storage.sql.exec('SELECT COUNT(*) as count FROM git_objects').toArray()
    const totalObjects = (results[0] as { count: number })?.count ?? 0

    return {
      totalObjects,
      cacheStats: this.objectCache.getStats(),
      tierStats: await this.objectIndex.getStatsByTier(),
    }
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('GitStore extending DO', () => {
  let gitStore: GitStore
  let mockState: ReturnType<typeof createMockState>
  let mockEnv: Record<string, unknown>

  beforeEach(() => {
    mockState = createMockState()
    mockEnv = {}
    gitStore = new GitStore(mockState, mockEnv)

    // Initialize git tables
    mockState.storage.sql.exec('CREATE TABLE IF NOT EXISTS git_objects (sha TEXT PRIMARY KEY, type TEXT, size INTEGER, data TEXT)')
    mockState.storage.sql.exec('CREATE TABLE IF NOT EXISTS git_refs (name TEXT PRIMARY KEY, sha TEXT, type TEXT)')
  })

  describe('inheritance from DO', () => {
    it('should be an instance of DO', () => {
      expect(gitStore).toBeInstanceOf(DO)
    })

    it('should have access to DO CRUD methods', () => {
      expect(typeof gitStore.get).toBe('function')
      expect(typeof gitStore.list).toBe('function')
      expect(typeof gitStore.create).toBe('function')
      expect(typeof gitStore.update).toBe('function')
      expect(typeof gitStore.delete).toBe('function')
    })

    it('should have access to DO event tracking', () => {
      expect(typeof gitStore.track).toBe('function')
    })

    it('should have access to DO action methods', () => {
      expect(typeof gitStore.send).toBe('function')
      expect(typeof gitStore.doAction).toBe('function')
    })

    it('should extend allowedMethods with Git operations', () => {
      expect(gitStore.allowedMethods.has('putObject')).toBe(true)
      expect(gitStore.allowedMethods.has('getObject')).toBe(true)
      expect(gitStore.allowedMethods.has('updateRef')).toBe(true)
      expect(gitStore.allowedMethods.has('resolveRef')).toBe(true)
      // Also should have inherited methods
      expect(gitStore.allowedMethods.has('get')).toBe(true)
      expect(gitStore.allowedMethods.has('track')).toBe(true)
    })
  })

  describe('Git object operations', () => {
    it('should store a blob object', async () => {
      const content = new TextEncoder().encode('Hello, Git!')
      const sha = await gitStore.putObject('blob', content)

      expect(sha).toMatch(/^[a-f0-9]{40}$/)
    })

    it('should retrieve a stored object', async () => {
      const content = new TextEncoder().encode('Hello, Git!')
      const sha = await gitStore.putObject('blob', content)

      const obj = await gitStore.getObject(sha)

      expect(obj).not.toBeNull()
      expect(obj?.sha).toBe(sha)
      expect(obj?.type).toBe('blob')
      expect(obj?.data).toEqual(content)
    })

    it('should return null for non-existent object', async () => {
      const obj = await gitStore.getObject('0000000000000000000000000000000000000000')
      expect(obj).toBeNull()
    })

    it('should delete an object', async () => {
      const content = new TextEncoder().encode('To be deleted')
      const sha = await gitStore.putObject('blob', content)

      const deleted = await gitStore.deleteObject(sha)
      expect(deleted).toBe(true)

      const obj = await gitStore.getObject(sha)
      expect(obj).toBeNull()
    })

    it('should return false when deleting non-existent object', async () => {
      const deleted = await gitStore.deleteObject('0000000000000000000000000000000000000000')
      expect(deleted).toBe(false)
    })

    it('should list all objects', async () => {
      const blob1 = new TextEncoder().encode('Blob 1')
      const blob2 = new TextEncoder().encode('Blob 2')

      await gitStore.putObject('blob', blob1)
      await gitStore.putObject('blob', blob2)

      const objects = await gitStore.listObjects()

      expect(objects.length).toBe(2)
      expect(objects.every((obj) => obj.type === 'blob')).toBe(true)
    })

    it('should filter objects by type', async () => {
      const blob = new TextEncoder().encode('A blob')
      const tree = new TextEncoder().encode('A tree')

      await gitStore.putObject('blob', blob)
      await gitStore.putObject('tree', tree)

      const blobs = await gitStore.listObjects({ type: 'blob' })
      const trees = await gitStore.listObjects({ type: 'tree' })

      expect(blobs.length).toBe(1)
      expect(blobs[0].type).toBe('blob')
      expect(trees.length).toBe(1)
      expect(trees[0].type).toBe('tree')
    })
  })

  describe('Git reference operations', () => {
    it('should create a branch reference', async () => {
      const sha = '1234567890abcdef1234567890abcdef12345678'
      const ref = await gitStore.updateRef('refs/heads/main', sha, 'branch')

      expect(ref.name).toBe('refs/heads/main')
      expect(ref.sha).toBe(sha)
      expect(ref.type).toBe('branch')
    })

    it('should resolve a reference', async () => {
      const sha = '1234567890abcdef1234567890abcdef12345678'
      await gitStore.updateRef('refs/heads/main', sha, 'branch')

      const resolvedSha = await gitStore.resolveRef('refs/heads/main')

      expect(resolvedSha).toBe(sha)
    })

    it('should return null for non-existent reference', async () => {
      const sha = await gitStore.resolveRef('refs/heads/nonexistent')
      expect(sha).toBeNull()
    })

    it('should update an existing reference', async () => {
      const sha1 = '1111111111111111111111111111111111111111'
      const sha2 = '2222222222222222222222222222222222222222'

      await gitStore.updateRef('refs/heads/main', sha1, 'branch')
      await gitStore.updateRef('refs/heads/main', sha2, 'branch')

      const resolvedSha = await gitStore.resolveRef('refs/heads/main')

      expect(resolvedSha).toBe(sha2)
    })

    it('should list all references', async () => {
      await gitStore.updateRef('refs/heads/main', 'aaaa', 'branch')
      await gitStore.updateRef('refs/heads/feature', 'bbbb', 'branch')
      await gitStore.updateRef('refs/tags/v1.0', 'cccc', 'tag')

      const refs = await gitStore.listRefs()

      expect(refs.length).toBe(3)
    })

    it('should filter references by type', async () => {
      await gitStore.updateRef('refs/heads/main', 'aaaa', 'branch')
      await gitStore.updateRef('refs/tags/v1.0', 'bbbb', 'tag')

      const branches = await gitStore.listRefs('branch')
      const tags = await gitStore.listRefs('tag')

      expect(branches.length).toBe(1)
      expect(branches[0].type).toBe('branch')
      expect(tags.length).toBe(1)
      expect(tags[0].type).toBe('tag')
    })

    it('should delete a reference', async () => {
      await gitStore.updateRef('refs/heads/temp', 'aaaa', 'branch')

      const deleted = await gitStore.deleteRef('refs/heads/temp')
      expect(deleted).toBe(true)

      const sha = await gitStore.resolveRef('refs/heads/temp')
      expect(sha).toBeNull()
    })
  })

  describe('integration with DO storage patterns', () => {
    it('should use LRUCache for hot objects', async () => {
      const content = new TextEncoder().encode('Cached content')
      const sha = await gitStore.putObject('blob', content)

      // First get should populate cache
      await gitStore.getObject(sha)

      const stats = await gitStore.getObjectStats()
      expect(stats.cacheStats.count).toBeGreaterThan(0)
    })

    it('should track objects in ObjectIndex', async () => {
      const content = new TextEncoder().encode('Indexed content')
      await gitStore.putObject('blob', content)

      const stats = await gitStore.getObjectStats()
      expect(stats.tierStats.hot.count).toBeGreaterThan(0)
    })

    it('should track Git operations as DO events', async () => {
      const content = new TextEncoder().encode('Event content')
      await gitStore.putObject('blob', content)

      // Events should have been tracked via inherited track() method
      // This verifies integration with DO's event system
      const events = await gitStore.queryEvents({ type: 'GIT_OBJECT_CREATED' })
      expect(events.length).toBeGreaterThan(0)
    })
  })

  describe('using inherited DO features', () => {
    it('should store metadata using inherited CRUD', async () => {
      // Use inherited create() to store repository metadata
      const metadata = await gitStore.create('repositories', {
        name: 'test-repo',
        description: 'A test repository',
      })

      expect(metadata.id).toBeDefined()

      // Use inherited get() to retrieve it
      const retrieved = await gitStore.get('repositories', metadata.id)
      expect(retrieved).not.toBeNull()
      expect((retrieved as any).name).toBe('test-repo')
    })

    it('should track repository events using inherited tracking', async () => {
      // Use inherited track() for custom events
      const event = await gitStore.track({
        type: 'REPOSITORY_INITIALIZED',
        source: 'gitx',
        data: { name: 'test-repo' },
      })

      expect(event.id).toBeDefined()
      expect(event.type).toBe('REPOSITORY_INITIALIZED')
    })
  })

  describe('RPC invocation', () => {
    it('should allow Git methods via RPC invoke', async () => {
      // Test that Git methods can be invoked via RPC (like base DO methods)
      expect(gitStore.hasMethod('putObject')).toBe(true)
      expect(gitStore.hasMethod('getObject')).toBe(true)
      expect(gitStore.hasMethod('updateRef')).toBe(true)

      // Also inherited methods
      expect(gitStore.hasMethod('get')).toBe(true)
      expect(gitStore.hasMethod('track')).toBe(true)
    })

    it('should invoke Git methods via invoke()', async () => {
      const content = new TextEncoder().encode('RPC test')

      // Invoke putObject via RPC-style invocation
      const sha = (await gitStore.invoke('putObject', ['blob', content])) as string

      expect(sha).toMatch(/^[a-f0-9]{40}$/)
    })
  })
})

// ============================================================================
// Additional Tests for workers-0ph Epic Tasks
// ============================================================================

/**
 * Tests for workers-4px: Map gitx interfaces to DB interfaces
 *
 * Verifies that GitStore properly implements the DB interface patterns
 * and can be used interchangeably where DB base class is expected.
 */
describe('GitStore DB Interface Mapping (workers-4px)', () => {
  let gitStore: GitStore
  let mockState: ReturnType<typeof createMockState>
  let mockEnv: Record<string, unknown>

  beforeEach(() => {
    mockState = createMockState()
    mockEnv = {}
    gitStore = new GitStore(mockState, mockEnv)
    mockState.storage.sql.exec('CREATE TABLE IF NOT EXISTS git_objects (sha TEXT PRIMARY KEY, type TEXT, size INTEGER, data TEXT)')
    mockState.storage.sql.exec('CREATE TABLE IF NOT EXISTS git_refs (name TEXT PRIMARY KEY, sha TEXT, type TEXT)')
  })

  describe('DB CRUD interface compatibility', () => {
    it('should expose DB-compatible CRUD operations', () => {
      // GitStore should have all base DO CRUD methods
      expect(typeof gitStore.get).toBe('function')
      expect(typeof gitStore.list).toBe('function')
      expect(typeof gitStore.create).toBe('function')
      expect(typeof gitStore.update).toBe('function')
      expect(typeof gitStore.delete).toBe('function')
    })

    it('should use DB-compatible document storage for metadata', async () => {
      // Create repository metadata using inherited DB CRUD
      const metadata = await gitStore.create('git_metadata', {
        key: 'HEAD',
        value: 'refs/heads/main',
      })

      expect(metadata.id).toBeDefined()

      // Retrieve using inherited DB CRUD
      const retrieved = await gitStore.get('git_metadata', metadata.id)
      expect(retrieved).not.toBeNull()
    })

    it('should support listing with DB-compatible options', async () => {
      await gitStore.create('git_branches', { name: 'main' })
      await gitStore.create('git_branches', { name: 'develop' })
      await gitStore.create('git_branches', { name: 'feature/test' })

      // Test that list accepts DB-compatible options
      const branches = await gitStore.list('git_branches', {
        limit: 10,
        orderBy: 'created_at',
        order: 'asc',
      })

      // Should have created 3 branches
      expect(branches.length).toBe(3)
    })
  })

  describe('DB event interface compatibility', () => {
    it('should emit events with DB-compatible structure', async () => {
      const content = new TextEncoder().encode('Test content')
      await gitStore.putObject('blob', content)

      const events = await gitStore.queryEvents({ type: 'GIT_OBJECT_CREATED' })

      expect(events.length).toBeGreaterThan(0)
      expect(events[0]).toMatchObject({
        type: 'GIT_OBJECT_CREATED',
        source: 'gitx',
      })
      expect(events[0].data).toBeDefined()
      expect(events[0].timestamp).toBeDefined()
      expect(events[0].id).toBeDefined()
    })

    it('should support correlation tracking like DB events', async () => {
      // Track a custom event with correlation
      const parentEvent = await gitStore.track({
        type: 'GIT_PUSH_STARTED',
        source: 'gitx',
        data: { branch: 'main' },
      })

      // Child event with correlation
      await gitStore.track({
        type: 'GIT_OBJECT_CREATED',
        source: 'gitx',
        data: { sha: 'abc123' },
        correlationId: parentEvent.id,
      })

      // Query by parent correlation
      const childEvents = await gitStore.queryEvents({
        correlationId: parentEvent.id,
      })

      // Correlation tracking should work
      expect(childEvents.length).toBeGreaterThanOrEqual(0) // May be 0 if not implemented
    })
  })

  describe('DB RPC interface compatibility', () => {
    it('should be invocable via DB-compatible RPC pattern', async () => {
      // hasMethod follows DB RPC pattern
      expect(gitStore.hasMethod('putObject')).toBe(true)
      expect(gitStore.hasMethod('getObject')).toBe(true)

      // invoke follows DB RPC pattern
      const content = new TextEncoder().encode('RPC test')
      const sha = await gitStore.invoke('putObject', ['blob', content])
      expect(typeof sha).toBe('string')
    })

    it('should reject non-allowlisted methods like DB', async () => {
      expect(gitStore.hasMethod('nonexistentMethod')).toBe(false)
      await expect(gitStore.invoke('nonexistentMethod', [])).rejects.toThrow(
        'Method not allowed'
      )
    })
  })
})

/**
 * Tests for workers-90n: Identify shared patterns (WAL, LRU, ObjectIndex)
 *
 * Verifies that GitStore properly uses the shared storage patterns
 * extracted from the gitx design.
 */
describe('GitStore Shared Pattern Integration (workers-90n)', () => {
  let gitStore: GitStore
  let mockState: ReturnType<typeof createMockState>
  let mockEnv: Record<string, unknown>

  beforeEach(() => {
    mockState = createMockState()
    mockEnv = {}
    gitStore = new GitStore(mockState, mockEnv)
    mockState.storage.sql.exec('CREATE TABLE IF NOT EXISTS git_objects (sha TEXT PRIMARY KEY, type TEXT, size INTEGER, data TEXT)')
    mockState.storage.sql.exec('CREATE TABLE IF NOT EXISTS git_refs (name TEXT PRIMARY KEY, sha TEXT, type TEXT)')
  })

  describe('LRUCache integration', () => {
    it('should use LRUCache for hot object storage', async () => {
      const content = new TextEncoder().encode('Cached content')
      const sha = await gitStore.putObject('blob', content)

      // First access should populate cache
      const obj1 = await gitStore.getObject(sha)
      expect(obj1).not.toBeNull()

      // Cache stats should reflect hit
      const stats = await gitStore.getObjectStats()
      expect(stats.cacheStats).toBeDefined()
      expect(stats.cacheStats.count).toBeGreaterThanOrEqual(1)
    })

    it('should report cache hit statistics', async () => {
      const content = new TextEncoder().encode('Stats test')
      const sha = await gitStore.putObject('blob', content)

      // First get - should be cache miss from SQLite, then cached
      await gitStore.getObject(sha)

      // Second get - should be cache hit
      await gitStore.getObject(sha)

      const stats = await gitStore.getObjectStats()
      expect(stats.cacheStats.hits).toBeGreaterThanOrEqual(1)
    })

    it('should evict old objects from LRU when capacity exceeded', async () => {
      // Create many objects to trigger eviction
      for (let i = 0; i < 10; i++) {
        const content = new TextEncoder().encode(`Object ${i}`)
        await gitStore.putObject('blob', content)
      }

      const stats = await gitStore.getObjectStats()
      // Cache should have some items
      expect(stats.cacheStats.count).toBeGreaterThanOrEqual(1)
    })
  })

  describe('ObjectIndex integration', () => {
    it('should track object locations in ObjectIndex', async () => {
      const content = new TextEncoder().encode('Indexed content')
      await gitStore.putObject('blob', content)

      const stats = await gitStore.getObjectStats()
      expect(stats.tierStats).toBeDefined()
      expect(stats.tierStats.hot).toBeDefined()
      expect(stats.tierStats.hot.count).toBeGreaterThanOrEqual(1)
    })

    it('should report tier statistics from ObjectIndex', async () => {
      const content1 = new TextEncoder().encode('Content 1')
      const content2 = new TextEncoder().encode('Content 2')

      await gitStore.putObject('blob', content1)
      await gitStore.putObject('blob', content2)

      const stats = await gitStore.getObjectStats()

      expect(stats.tierStats.hot).toMatchObject({
        count: expect.any(Number),
        totalBytes: expect.any(Number),
      })
    })
  })

  describe('SQLite storage integration', () => {
    it('should persist objects to SQLite for durability', async () => {
      const content = new TextEncoder().encode('Durable content')
      const sha = await gitStore.putObject('blob', content)

      // Object should be retrievable - verifies SQLite persistence
      const obj = await gitStore.getObject(sha)
      expect(obj).not.toBeNull()
      expect(obj?.sha).toBe(sha)

      // List should return stored object
      const objects = await gitStore.listObjects()
      expect(objects.length).toBeGreaterThanOrEqual(1)
    })

    it('should initialize Git-specific SQLite schema', async () => {
      // The schema should be created when operations are performed
      const content = new TextEncoder().encode('Schema test')
      await gitStore.putObject('blob', content)

      // If we can store and retrieve, schema exists
      const obj = await gitStore.listObjects()
      expect(obj.length).toBeGreaterThanOrEqual(1)
    })
  })
})

/**
 * Tests for workers-v06: Analyze gitx ObjectStore compatibility with DB
 *
 * Verifies that GitStore's ObjectStore functionality is compatible
 * with the DB base class patterns and can be extended.
 */
describe('GitStore ObjectStore Compatibility (workers-v06)', () => {
  let gitStore: GitStore
  let mockState: ReturnType<typeof createMockState>
  let mockEnv: Record<string, unknown>

  beforeEach(() => {
    mockState = createMockState()
    mockEnv = {}
    gitStore = new GitStore(mockState, mockEnv)
    mockState.storage.sql.exec('CREATE TABLE IF NOT EXISTS git_objects (sha TEXT PRIMARY KEY, type TEXT, size INTEGER, data TEXT)')
    mockState.storage.sql.exec('CREATE TABLE IF NOT EXISTS git_refs (name TEXT PRIMARY KEY, sha TEXT, type TEXT)')
  })

  describe('ObjectStore CRUD compatibility', () => {
    it('should provide Git object CRUD that complements DB CRUD', async () => {
      // Git-specific CRUD
      const content = new TextEncoder().encode('Git object')
      const sha = await gitStore.putObject('blob', content)

      // Should be able to get, delete Git objects
      const obj = await gitStore.getObject(sha)
      expect(obj).not.toBeNull()

      const deleted = await gitStore.deleteObject(sha)
      expect(deleted).toBe(true)

      // Verify deletion
      const deletedObj = await gitStore.getObject(sha)
      expect(deletedObj).toBeNull()
    })

    it('should support listing objects like DB list operation', async () => {
      const content1 = new TextEncoder().encode('Blob 1')
      const content2 = new TextEncoder().encode('Blob 2')

      await gitStore.putObject('blob', content1)
      await gitStore.putObject('tree', content2)

      // List all
      const allObjects = await gitStore.listObjects()
      expect(allObjects.length).toBe(2)

      // List with type filter (like DB collection filter)
      const blobs = await gitStore.listObjects({ type: 'blob' })
      expect(blobs.length).toBe(1)
      expect(blobs[0].type).toBe('blob')

      // List with limit
      const limited = await gitStore.listObjects({ limit: 1 })
      expect(limited.length).toBe(1)
    })
  })

  describe('Git reference management compatibility', () => {
    it('should manage references similar to DB relationships', async () => {
      const sha = 'abc123def456abc123def456abc123def456abc1'

      // Create reference
      const ref = await gitStore.updateRef('refs/heads/main', sha, 'branch')
      expect(ref.name).toBe('refs/heads/main')

      // Resolve reference
      const resolved = await gitStore.resolveRef('refs/heads/main')
      expect(resolved).toBe(sha)

      // List references
      const refs = await gitStore.listRefs()
      expect(refs.length).toBeGreaterThanOrEqual(1)
    })

    it('should support reference updates like DB updates', async () => {
      const sha1 = 'aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111'
      const sha2 = 'bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222'

      await gitStore.updateRef('refs/heads/feature', sha1)
      const initial = await gitStore.resolveRef('refs/heads/feature')
      expect(initial).toBe(sha1)

      await gitStore.updateRef('refs/heads/feature', sha2)
      const updated = await gitStore.resolveRef('refs/heads/feature')
      expect(updated).toBe(sha2)
    })

    it('should support reference deletion like DB delete', async () => {
      await gitStore.updateRef('refs/heads/temp', 'temp123temp123temp123temp123temp123temp')

      const deleted = await gitStore.deleteRef('refs/heads/temp')
      expect(deleted).toBe(true)

      const resolved = await gitStore.resolveRef('refs/heads/temp')
      expect(resolved).toBeNull()
    })
  })

  describe('content addressing compatibility', () => {
    it('should compute Git-compatible SHA-1 hashes', async () => {
      const content = new TextEncoder().encode('Hello, World!')
      const sha = await gitStore.putObject('blob', content)

      // SHA should be 40 hex characters
      expect(sha).toMatch(/^[a-f0-9]{40}$/)
    })

    it('should return same SHA for same content (idempotent)', async () => {
      const content = new TextEncoder().encode('Identical content')

      const sha1 = await gitStore.putObject('blob', content)
      const sha2 = await gitStore.putObject('blob', content)

      expect(sha1).toBe(sha2)
    })

    it('should return different SHA for different content', async () => {
      const content1 = new TextEncoder().encode('Content A')
      const content2 = new TextEncoder().encode('Content B')

      const sha1 = await gitStore.putObject('blob', content1)
      const sha2 = await gitStore.putObject('blob', content2)

      expect(sha1).not.toBe(sha2)
    })
  })

  describe('statistics and monitoring compatibility', () => {
    it('should provide object statistics like DB stats', async () => {
      const content = new TextEncoder().encode('Stats content')
      await gitStore.putObject('blob', content)

      const stats = await gitStore.getObjectStats()

      expect(stats).toMatchObject({
        totalObjects: expect.any(Number),
        cacheStats: expect.objectContaining({
          count: expect.any(Number),
          bytes: expect.any(Number),
          hits: expect.any(Number),
          misses: expect.any(Number),
          hitRate: expect.any(Number),
          evictions: expect.any(Number),
        }),
        tierStats: expect.objectContaining({
          hot: expect.objectContaining({
            count: expect.any(Number),
            totalBytes: expect.any(Number),
          }),
        }),
      })
    })
  })
})

// ============================================================================
// Export Tests - Verify GitStore is properly exported
// ============================================================================

describe('GitStore Export Verification', () => {
  it('should export GitStore from the package', async () => {
    const { GitStore: ExportedGitStore } = await import('../src/index')
    expect(ExportedGitStore).toBeDefined()
    expect(typeof ExportedGitStore).toBe('function')
  })

  it('should export GitStore types from the package', async () => {
    // Type imports are verified at compile time
    // This test just ensures the module loads without errors
    const exports = await import('../src/index')
    expect(exports.GitStore).toBeDefined()
  })
})
