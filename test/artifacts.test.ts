/**
 * @dotdo/do - Artifact Operations Tests (RED Phase - Phase 10: Cached Artifacts)
 *
 * These tests define the expected behavior of Artifact caching operations.
 * They should FAIL initially (RED) because the implementation doesn't exist yet.
 *
 * Artifact operations:
 * - storeArtifact() - store artifact with key, type, source, sourceHash, content
 * - getArtifact() - retrieve artifact by key
 * - getArtifactBySource() - retrieve artifact by source and type
 * - deleteArtifact() - delete artifact by key
 * - cleanExpiredArtifacts() - clean up artifacts past their TTL
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DO } from '../src/do'
import type { Artifact, ArtifactType, StoreArtifactOptions } from '../src/types'

/**
 * Create an in-memory SQLite mock for testing
 * Extended to support artifacts table
 */
function createMockSqlStorage() {
  const tables: Map<string, Map<string, Record<string, unknown>>> = new Map()

  return {
    exec(query: string, ...params: unknown[]) {
      const results: unknown[] = []
      const normalizedQuery = query.trim().toUpperCase()

      if (normalizedQuery.startsWith('CREATE TABLE')) {
        const tableMatch = query.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)
        if (tableMatch) {
          const tableName = tableMatch[1]
          if (!tables.has(tableName)) {
            tables.set(tableName, new Map())
          }
        }
      } else if (normalizedQuery.startsWith('CREATE INDEX')) {
        // Ignore index creation for mock
      } else if (normalizedQuery.startsWith('INSERT')) {
        // Handle documents table
        if (query.includes('documents')) {
          const [collection, id, data] = params as [string, string, string]
          const tableName = 'documents'
          if (!tables.has(tableName)) {
            tables.set(tableName, new Map())
          }
          const table = tables.get(tableName)!
          const key = `${collection}:${id}`
          table.set(key, {
            collection,
            id,
            data,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
        }
        // Handle artifacts table
        else if (query.includes('artifacts')) {
          const [key, type, source, sourceHash, content, size, metadata, createdAt, expiresAt] =
            params as [
              string,
              string,
              string,
              string,
              string,
              number | null,
              string | null,
              string,
              string | null,
            ]
          const tableName = 'artifacts'
          if (!tables.has(tableName)) {
            tables.set(tableName, new Map())
          }
          const table = tables.get(tableName)!
          table.set(key, {
            key,
            type,
            source,
            source_hash: sourceHash,
            content,
            size,
            metadata,
            created_at: createdAt,
            expires_at: expiresAt,
          })
        }
      } else if (normalizedQuery.startsWith('SELECT')) {
        // Handle artifacts table SELECT
        if (query.includes('FROM artifacts')) {
          const artifactsTable = tables.get('artifacts')
          if (artifactsTable) {
            // Handle COUNT(*) query for expired artifacts
            if (query.includes('COUNT(*)')) {
              let count = 0
              if (query.includes('expires_at IS NOT NULL AND expires_at <')) {
                const currentTime = params[0] as string
                for (const artifact of artifactsTable.values()) {
                  if (artifact.expires_at && (artifact.expires_at as string) < currentTime) {
                    count++
                  }
                }
              }
              results.push({ count })
            } else {
              let allArtifacts = Array.from(artifactsTable.values())

              // Handle WHERE key = ?
              if (query.includes('WHERE key = ?')) {
                const keyValue = params[0] as string
                allArtifacts = allArtifacts.filter((a) => a.key === keyValue)
              }
              // Handle WHERE source = ? AND type = ?
              else if (query.includes('WHERE source = ? AND type = ?')) {
                const sourceValue = params[0] as string
                const typeValue = params[1] as string
                allArtifacts = allArtifacts.filter(
                  (a) => a.source === sourceValue && a.type === typeValue
                )
              }

              results.push(...allArtifacts)
            }
          }
        }
        // Handle documents table SELECT
        else {
          const tableName = 'documents'
          const table = tables.get(tableName)

          if (table) {
            if (query.includes('WHERE collection = ? AND id = ?')) {
              const [collection, id] = params as [string, string]
              const key = `${collection}:${id}`
              const row = table.get(key)
              if (row) {
                results.push({ data: row.data })
              }
            } else if (query.includes('WHERE collection = ?')) {
              const [collection, limit, offset] = params as [string, number, number]
              const matching: Record<string, unknown>[] = []
              for (const [key, row] of table.entries()) {
                if (key.startsWith(`${collection}:`)) {
                  matching.push({ data: row.data })
                }
              }
              const paginated = matching.slice(offset, offset + limit)
              results.push(...paginated)
            }
          }
        }
      } else if (normalizedQuery.startsWith('UPDATE')) {
        // Handle artifacts table UPDATE
        if (query.includes('artifacts')) {
          // Parse update based on query pattern
          const artifactsTable = tables.get('artifacts')
          if (artifactsTable) {
            // For upsert-style updates
            const keyParam = params[params.length - 1] as string
            const existing = artifactsTable.get(keyParam)
            if (existing) {
              // Update fields based on params
              artifactsTable.set(keyParam, {
                ...existing,
                ...params.reduce(
                  (acc, p, i) => {
                    // This is simplified - real implementation would parse the SET clause
                    return acc
                  },
                  {} as Record<string, unknown>
                ),
              })
            }
          }
        } else {
          const [data, collection, id] = params as [string, string, string]
          const tableName = 'documents'
          const table = tables.get(tableName)
          if (table) {
            const key = `${collection}:${id}`
            const existing = table.get(key)
            if (existing) {
              table.set(key, { ...existing, data, updated_at: new Date().toISOString() })
            }
          }
        }
      } else if (normalizedQuery.startsWith('DELETE')) {
        // Handle artifacts table DELETE
        if (query.includes('FROM artifacts')) {
          const artifactsTable = tables.get('artifacts')
          if (artifactsTable) {
            // Handle DELETE WHERE key = ?
            if (query.includes('WHERE key = ?')) {
              const keyValue = params[0] as string
              const deleted = artifactsTable.delete(keyValue)
              // Return count of deleted rows (mock)
              if (deleted) {
                results.push({ deleted: 1 })
              }
            }
            // Handle DELETE WHERE expires_at IS NOT NULL AND expires_at < ?
            else if (query.includes('expires_at IS NOT NULL AND expires_at <')) {
              const currentTime = params[0] as string
              let deletedCount = 0
              for (const [key, artifact] of artifactsTable.entries()) {
                if (artifact.expires_at && (artifact.expires_at as string) < currentTime) {
                  artifactsTable.delete(key)
                  deletedCount++
                }
              }
              results.push({ deleted: deletedCount })
            }
          }
        } else {
          const [collection, id] = params as [string, string]
          const tableName = 'documents'
          const table = tables.get(tableName)
          if (table) {
            const key = `${collection}:${id}`
            table.delete(key)
          }
        }
      }

      return {
        toArray() {
          return results
        },
        rowsWritten: results.length > 0 ? 1 : 0,
      }
    },
  }
}

/**
 * Create a mock context with SQLite storage
 */
function createMockCtx() {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    storage: {
      sql: createMockSqlStorage(),
    },
  }
}

// Mock environment
const mockEnv = {
  DO_NAMESPACE: {
    idFromName: vi.fn(() => ({ toString: () => 'mock-id' })),
    get: vi.fn(),
  },
}

describe('Artifact Operations (Phase 10 - Cached Artifacts)', () => {
  let doInstance: DO

  beforeEach(() => {
    doInstance = new DO(createMockCtx() as any, mockEnv)
  })

  describe('storeArtifact() - Store Cached Artifacts', () => {
    it('should have storeArtifact method defined', () => {
      expect((doInstance as any).storeArtifact).toBeDefined()
      expect(typeof (doInstance as any).storeArtifact).toBe('function')
    })

    it('should store an artifact with all required fields', async () => {
      const options: StoreArtifactOptions<{ code: string }> = {
        key: 'https://example.com/script.ts:esm',
        type: 'esm',
        source: 'https://example.com/script.ts',
        sourceHash: 'abc123hash',
        content: { code: 'export const foo = 1' },
      }

      const artifact = await (doInstance as any).storeArtifact(options)

      expect(artifact).toBeDefined()
      expect(artifact.key).toBe('https://example.com/script.ts:esm')
      expect(artifact.type).toBe('esm')
      expect(artifact.source).toBe('https://example.com/script.ts')
      expect(artifact.sourceHash).toBe('abc123hash')
      expect(artifact.content).toEqual({ code: 'export const foo = 1' })
      expect(artifact.createdAt).toBeDefined()
      expect(artifact.createdAt).toBeInstanceOf(Date)
    })

    it('should store artifact with TTL and calculate expiresAt', async () => {
      const ttl = 3600000 // 1 hour in milliseconds
      const beforeTime = Date.now()

      const artifact = await (doInstance as any).storeArtifact({
        key: 'test:artifact',
        type: 'ast',
        source: 'test-source',
        sourceHash: 'hash123',
        content: { ast: 'nodes' },
        ttl,
      })

      const afterTime = Date.now()

      expect(artifact.expiresAt).toBeDefined()
      expect(artifact.expiresAt).toBeInstanceOf(Date)
      // expiresAt should be approximately ttl ms in the future
      expect(artifact.expiresAt!.getTime()).toBeGreaterThanOrEqual(beforeTime + ttl)
      expect(artifact.expiresAt!.getTime()).toBeLessThanOrEqual(afterTime + ttl)
    })

    it('should store artifact without TTL (no expiration)', async () => {
      const artifact = await (doInstance as any).storeArtifact({
        key: 'permanent:artifact',
        type: 'types',
        source: 'types-source',
        sourceHash: 'typeshash',
        content: { types: 'definitions' },
      })

      expect(artifact.expiresAt).toBeUndefined()
    })

    it('should store artifact with metadata', async () => {
      const artifact = await (doInstance as any).storeArtifact({
        key: 'with-metadata:artifact',
        type: 'bundle',
        source: 'bundle-source',
        sourceHash: 'bundlehash',
        content: { bundle: 'code' },
        metadata: { minified: true, version: '1.0.0' },
      })

      expect(artifact.metadata).toBeDefined()
      expect(artifact.metadata).toEqual({ minified: true, version: '1.0.0' })
    })

    it('should calculate and store content size', async () => {
      const content = { largeData: 'x'.repeat(1000) }

      const artifact = await (doInstance as any).storeArtifact({
        key: 'sized:artifact',
        type: 'worker',
        source: 'worker-source',
        sourceHash: 'workerhash',
        content,
      })

      expect(artifact.size).toBeDefined()
      expect(typeof artifact.size).toBe('number')
      expect(artifact.size).toBeGreaterThan(0)
    })

    it('should support various artifact types', async () => {
      const artifactTypes: ArtifactType[] = [
        'ast',
        'types',
        'esm',
        'cjs',
        'worker',
        'html',
        'markdown',
        'bundle',
        'sourcemap',
      ]

      for (const type of artifactTypes) {
        const artifact = await (doInstance as any).storeArtifact({
          key: `${type}:test`,
          type,
          source: `${type}-source`,
          sourceHash: `${type}hash`,
          content: { type },
        })

        expect(artifact.type).toBe(type)
      }
    })

    it('should support custom artifact types', async () => {
      const artifact = await (doInstance as any).storeArtifact({
        key: 'custom:artifact',
        type: 'my-custom-type',
        source: 'custom-source',
        sourceHash: 'customhash',
        content: { custom: true },
      })

      expect(artifact.type).toBe('my-custom-type')
    })

    it('should include storeArtifact in allowedMethods for RPC access', () => {
      expect((doInstance as any).allowedMethods.has('storeArtifact')).toBe(true)
    })
  })

  describe('getArtifact() - Retrieve Artifact by Key', () => {
    it('should have getArtifact method defined', () => {
      expect((doInstance as any).getArtifact).toBeDefined()
      expect(typeof (doInstance as any).getArtifact).toBe('function')
    })

    it('should retrieve artifact by key', async () => {
      const stored = await (doInstance as any).storeArtifact({
        key: 'retrieve:test',
        type: 'esm',
        source: 'https://example.com/module.ts',
        sourceHash: 'modulehash',
        content: { exports: ['foo', 'bar'] },
      })

      const retrieved = await (doInstance as any).getArtifact('retrieve:test')

      expect(retrieved).toBeDefined()
      expect(retrieved.key).toBe('retrieve:test')
      expect(retrieved.type).toBe('esm')
      expect(retrieved.source).toBe('https://example.com/module.ts')
      expect(retrieved.sourceHash).toBe('modulehash')
      expect(retrieved.content).toEqual({ exports: ['foo', 'bar'] })
    })

    it('should return null for non-existent artifact', async () => {
      const result = await (doInstance as any).getArtifact('non-existent-key')
      expect(result).toBeNull()
    })

    it('should preserve all artifact properties on retrieval', async () => {
      const ttl = 3600000
      await (doInstance as any).storeArtifact({
        key: 'full:artifact',
        type: 'bundle',
        source: 'full-source',
        sourceHash: 'fullhash',
        content: { nested: { data: true }, array: [1, 2, 3] },
        ttl,
        metadata: { version: '2.0.0' },
      })

      const retrieved = await (doInstance as any).getArtifact('full:artifact')

      expect(retrieved.type).toBe('bundle')
      expect(retrieved.source).toBe('full-source')
      expect(retrieved.sourceHash).toBe('fullhash')
      expect(retrieved.content.nested.data).toBe(true)
      expect(retrieved.content.array).toEqual([1, 2, 3])
      expect(retrieved.expiresAt).toBeDefined()
      expect(retrieved.metadata).toEqual({ version: '2.0.0' })
    })

    it('should return createdAt as Date object', async () => {
      await (doInstance as any).storeArtifact({
        key: 'date:test',
        type: 'ast',
        source: 'date-source',
        sourceHash: 'datehash',
        content: {},
      })

      const retrieved = await (doInstance as any).getArtifact('date:test')

      expect(retrieved.createdAt).toBeInstanceOf(Date)
    })

    it('should include getArtifact in allowedMethods for RPC access', () => {
      expect((doInstance as any).allowedMethods.has('getArtifact')).toBe(true)
    })
  })

  describe('getArtifactBySource() - Retrieve Artifact by Source and Type', () => {
    it('should have getArtifactBySource method defined', () => {
      expect((doInstance as any).getArtifactBySource).toBeDefined()
      expect(typeof (doInstance as any).getArtifactBySource).toBe('function')
    })

    it('should retrieve artifact by source and type', async () => {
      const source = 'https://example.com/component.tsx'

      await (doInstance as any).storeArtifact({
        key: `${source}:esm`,
        type: 'esm',
        source,
        sourceHash: 'esmhash',
        content: { esm: 'code' },
      })

      await (doInstance as any).storeArtifact({
        key: `${source}:types`,
        type: 'types',
        source,
        sourceHash: 'typeshash',
        content: { types: 'definitions' },
      })

      const esmArtifact = await (doInstance as any).getArtifactBySource(source, 'esm')
      const typesArtifact = await (doInstance as any).getArtifactBySource(source, 'types')

      expect(esmArtifact).toBeDefined()
      expect(esmArtifact.type).toBe('esm')
      expect(esmArtifact.content).toEqual({ esm: 'code' })

      expect(typesArtifact).toBeDefined()
      expect(typesArtifact.type).toBe('types')
      expect(typesArtifact.content).toEqual({ types: 'definitions' })
    })

    it('should return null when source exists but type does not match', async () => {
      const source = 'https://example.com/file.ts'

      await (doInstance as any).storeArtifact({
        key: `${source}:ast`,
        type: 'ast',
        source,
        sourceHash: 'asthash',
        content: { ast: 'nodes' },
      })

      const result = await (doInstance as any).getArtifactBySource(source, 'esm')
      expect(result).toBeNull()
    })

    it('should return null for non-existent source', async () => {
      const result = await (doInstance as any).getArtifactBySource(
        'https://nonexistent.com/file.ts',
        'esm'
      )
      expect(result).toBeNull()
    })

    it('should include getArtifactBySource in allowedMethods for RPC access', () => {
      expect((doInstance as any).allowedMethods.has('getArtifactBySource')).toBe(true)
    })
  })

  describe('deleteArtifact() - Delete Artifact', () => {
    it('should have deleteArtifact method defined', () => {
      expect((doInstance as any).deleteArtifact).toBeDefined()
      expect(typeof (doInstance as any).deleteArtifact).toBe('function')
    })

    it('should delete artifact by key', async () => {
      await (doInstance as any).storeArtifact({
        key: 'delete:test',
        type: 'bundle',
        source: 'delete-source',
        sourceHash: 'deletehash',
        content: { toDelete: true },
      })

      // Verify it exists
      let artifact = await (doInstance as any).getArtifact('delete:test')
      expect(artifact).not.toBeNull()

      // Delete it
      const result = await (doInstance as any).deleteArtifact('delete:test')
      expect(result).toBe(true)

      // Verify it's gone
      artifact = await (doInstance as any).getArtifact('delete:test')
      expect(artifact).toBeNull()
    })

    it('should return false when deleting non-existent artifact', async () => {
      const result = await (doInstance as any).deleteArtifact('non-existent-key')
      expect(result).toBe(false)
    })

    it('should include deleteArtifact in allowedMethods for RPC access', () => {
      expect((doInstance as any).allowedMethods.has('deleteArtifact')).toBe(true)
    })
  })

  describe('cleanExpiredArtifacts() - Clean Up Expired Artifacts', () => {
    it('should have cleanExpiredArtifacts method defined', () => {
      expect((doInstance as any).cleanExpiredArtifacts).toBeDefined()
      expect(typeof (doInstance as any).cleanExpiredArtifacts).toBe('function')
    })

    it('should delete expired artifacts', async () => {
      // Store artifact that expires immediately (TTL = 0)
      await (doInstance as any).storeArtifact({
        key: 'expired:artifact',
        type: 'ast',
        source: 'expired-source',
        sourceHash: 'expiredhash',
        content: { expired: true },
        ttl: -1000, // Already expired (1 second in the past)
      })

      // Store artifact that doesn't expire
      await (doInstance as any).storeArtifact({
        key: 'permanent:artifact',
        type: 'types',
        source: 'permanent-source',
        sourceHash: 'permanenthash',
        content: { permanent: true },
      })

      // Store artifact that expires in the future
      await (doInstance as any).storeArtifact({
        key: 'future:artifact',
        type: 'esm',
        source: 'future-source',
        sourceHash: 'futurehash',
        content: { future: true },
        ttl: 3600000, // 1 hour from now
      })

      // Clean expired artifacts
      const deletedCount = await (doInstance as any).cleanExpiredArtifacts()

      expect(typeof deletedCount).toBe('number')
      expect(deletedCount).toBeGreaterThanOrEqual(1) // At least the expired one

      // Verify expired artifact is gone
      const expiredArtifact = await (doInstance as any).getArtifact('expired:artifact')
      expect(expiredArtifact).toBeNull()

      // Verify permanent artifact still exists
      const permanentArtifact = await (doInstance as any).getArtifact('permanent:artifact')
      expect(permanentArtifact).not.toBeNull()

      // Verify future artifact still exists
      const futureArtifact = await (doInstance as any).getArtifact('future:artifact')
      expect(futureArtifact).not.toBeNull()
    })

    it('should return 0 when no artifacts are expired', async () => {
      // Store only non-expiring artifacts
      await (doInstance as any).storeArtifact({
        key: 'no-expiry:artifact',
        type: 'bundle',
        source: 'no-expiry-source',
        sourceHash: 'noexpiryhash',
        content: { noExpiry: true },
      })

      const deletedCount = await (doInstance as any).cleanExpiredArtifacts()

      expect(deletedCount).toBe(0)
    })

    it('should include cleanExpiredArtifacts in allowedMethods for RPC access', () => {
      expect((doInstance as any).allowedMethods.has('cleanExpiredArtifacts')).toBe(true)
    })
  })

  describe('Artifact Cache Invalidation', () => {
    it('should allow storing artifact with same key (upsert behavior)', async () => {
      const key = 'upsert:artifact'

      // Store initial artifact
      await (doInstance as any).storeArtifact({
        key,
        type: 'esm',
        source: 'upsert-source',
        sourceHash: 'hash-v1',
        content: { version: 1 },
      })

      // Store updated artifact with same key
      await (doInstance as any).storeArtifact({
        key,
        type: 'esm',
        source: 'upsert-source',
        sourceHash: 'hash-v2',
        content: { version: 2 },
      })

      // Retrieve should get the updated version
      const artifact = await (doInstance as any).getArtifact(key)

      expect(artifact.sourceHash).toBe('hash-v2')
      expect(artifact.content).toEqual({ version: 2 })
    })

    it('should use sourceHash for cache invalidation checks', async () => {
      const source = 'https://example.com/cacheable.ts'

      // Store artifact
      await (doInstance as any).storeArtifact({
        key: `${source}:esm`,
        type: 'esm',
        source,
        sourceHash: 'original-hash',
        content: { original: true },
      })

      // Retrieve and check hash
      const artifact = await (doInstance as any).getArtifactBySource(source, 'esm')
      expect(artifact.sourceHash).toBe('original-hash')

      // The sourceHash can be compared externally to determine if cache is stale
    })
  })

  describe('Artifact Content Serialization', () => {
    it('should properly serialize and deserialize complex content', async () => {
      const complexContent = {
        string: 'hello',
        number: 42,
        boolean: true,
        null: null,
        array: [1, 'two', { three: 3 }],
        nested: {
          deep: {
            value: 'found',
          },
        },
        date: '2024-01-01T00:00:00.000Z', // Dates stored as strings
      }

      await (doInstance as any).storeArtifact({
        key: 'complex:content',
        type: 'bundle',
        source: 'complex-source',
        sourceHash: 'complexhash',
        content: complexContent,
      })

      const retrieved = await (doInstance as any).getArtifact('complex:content')

      expect(retrieved.content).toEqual(complexContent)
    })

    it('should handle string content', async () => {
      await (doInstance as any).storeArtifact({
        key: 'string:content',
        type: 'html',
        source: 'html-source',
        sourceHash: 'htmlhash',
        content: '<html><body>Hello World</body></html>',
      })

      const retrieved = await (doInstance as any).getArtifact('string:content')

      expect(retrieved.content).toBe('<html><body>Hello World</body></html>')
    })

    it('should handle array content', async () => {
      await (doInstance as any).storeArtifact({
        key: 'array:content',
        type: 'ast',
        source: 'ast-source',
        sourceHash: 'asthash',
        content: ['node1', 'node2', 'node3'],
      })

      const retrieved = await (doInstance as any).getArtifact('array:content')

      expect(retrieved.content).toEqual(['node1', 'node2', 'node3'])
    })
  })
})
