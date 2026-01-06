/**
 * @dotdo/do - Graph Traversal API Tests (RED Phase)
 *
 * These tests define the expected behavior of DO.traverse() method
 * which provides graph traversal using relationship operators.
 *
 * Tests cover:
 * - DO.traverse(startId, '->knows') - follows outgoing edges
 * - DO.traverse(startId, '<-follows') - follows incoming edges
 * - DO.traverse(startId, '<->friend') - follows bidirectional edges
 * - Multi-hop traversal: DO.traverse(id, '->knows->works_at')
 * - Traversal with depth limits
 * - Returns array of matched Things
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DO } from '../../src/do'
import type { Thing } from '../../src/types'

/**
 * Create an in-memory SQLite mock for testing traversal
 */
function createMockSqlStorage() {
  const things: Map<string, Record<string, unknown>> = new Map()
  const relationships: Map<string, Record<string, unknown>> = new Map()

  return {
    exec(query: string, ...params: unknown[]) {
      const results: unknown[] = []
      const normalizedQuery = query.trim().toUpperCase()

      // CREATE TABLE / CREATE INDEX statements
      if (normalizedQuery.startsWith('CREATE TABLE') || normalizedQuery.startsWith('CREATE INDEX')) {
        return { toArray: () => results }
      }

      // INSERT INTO things
      if (normalizedQuery.startsWith('INSERT') && query.toLowerCase().includes('things')) {
        const [ns, type, id, url, data, created_at, updated_at] = params as [string, string, string, string, string, string, string]
        things.set(url, {
          ns,
          type,
          id,
          url,
          data,
          created_at,
          updated_at,
        })
      }

      // INSERT INTO relationships
      if (normalizedQuery.startsWith('INSERT') && query.toLowerCase().includes('relationships')) {
        const [id, type, from, to, data, created_at] = params as [string, string, string, string, string, string]
        relationships.set(id, {
          id,
          type,
          from,
          to,
          data: data || null,
          created_at,
        })
      }

      // SELECT from things by URL
      if (normalizedQuery.startsWith('SELECT') && query.toLowerCase().includes('things')) {
        if (query.includes('WHERE url = ?')) {
          const [url] = params as [string]
          const thing = things.get(url)
          if (thing) {
            results.push(thing)
          }
        }
        // Get thing by ns/type/id
        else if (query.includes('WHERE ns = ?') && query.includes('type = ?') && query.includes('id = ?')) {
          const [ns, type, id] = params as [string, string, string]
          for (const thing of things.values()) {
            if (thing.ns === ns && thing.type === type && thing.id === id) {
              results.push(thing)
              break
            }
          }
        }
        // List all things
        else if (query.includes('ORDER BY')) {
          const allThings = Array.from(things.values())
          results.push(...allThings.slice(0, params[params.length - 2] as number || 100))
        }
      }

      // SELECT from relationships
      if (normalizedQuery.startsWith('SELECT') && query.toLowerCase().includes('relationships')) {
        // Get relationship by unique constraint (from, type, to)
        if (query.includes('"from" = ?') && query.includes('type = ?') && query.includes('"to" = ?')) {
          const [from, type, to] = params as [string, string, string]
          for (const rel of relationships.values()) {
            if (rel.from === from && rel.type === type && rel.to === to) {
              results.push(rel)
            }
          }
        }
        // Get relationships by from URL
        else if (query.includes('WHERE "from" = ?') && !query.includes('"to" = ?')) {
          const [from, type] = params as [string, string | undefined]
          for (const rel of relationships.values()) {
            if (rel.from === from && (!type || rel.type === type)) {
              results.push(rel)
            }
          }
        }
        // Get relationships by to URL
        else if (query.includes('WHERE "to" = ?') && !query.includes('"from" = ?')) {
          const [to, type] = params as [string, string | undefined]
          for (const rel of relationships.values()) {
            if (rel.to === to && (!type || rel.type === type)) {
              results.push(rel)
            }
          }
        }
        // Get all relationships for a URL (both directions)
        else if (query.includes('WHERE "from" = ? OR "to" = ?')) {
          const [url1, url2, type] = params as [string, string, string | undefined]
          for (const rel of relationships.values()) {
            if ((rel.from === url1 || rel.to === url2) && (!type || rel.type === type)) {
              results.push(rel)
            }
          }
        }
      }

      // UPDATE things
      if (normalizedQuery.startsWith('UPDATE') && query.toLowerCase().includes('things')) {
        const [data, updated_at, url] = params as [string, string, string]
        const existing = things.get(url)
        if (existing) {
          things.set(url, { ...existing, data, updated_at })
        }
      }

      // DELETE from things
      if (normalizedQuery.startsWith('DELETE') && query.toLowerCase().includes('things')) {
        const [url] = params as [string]
        things.delete(url)
      }

      // DELETE from relationships
      if (normalizedQuery.startsWith('DELETE') && query.toLowerCase().includes('relationships')) {
        const [from, type, to] = params as [string, string, string]
        for (const [id, rel] of relationships.entries()) {
          if (rel.from === from && rel.to === to && rel.type === type) {
            relationships.delete(id)
          }
        }
      }

      return { toArray: () => results }
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

describe('Graph Traversal API (RED Phase)', () => {
  describe('DO.traverse() with outgoing edges (->)', () => {
    let doInstance: DO

    beforeEach(async () => {
      doInstance = new DO(createMockCtx() as any, mockEnv)

      // Set up test graph:
      // Alice --knows--> Bob
      // Alice --knows--> Carol
      // Bob --works_at--> Acme
      await doInstance.createThing({
        ns: 'example.com',
        type: 'Person',
        id: 'alice',
        data: { name: 'Alice' },
      })

      await doInstance.createThing({
        ns: 'example.com',
        type: 'Person',
        id: 'bob',
        data: { name: 'Bob' },
      })

      await doInstance.createThing({
        ns: 'example.com',
        type: 'Person',
        id: 'carol',
        data: { name: 'Carol' },
      })

      await doInstance.createThing({
        ns: 'example.com',
        type: 'Company',
        id: 'acme',
        data: { name: 'Acme Corp' },
      })

      // Create relationships
      await doInstance.relate({
        type: 'knows',
        from: 'https://example.com/Person/alice',
        to: 'https://example.com/Person/bob',
      })

      await doInstance.relate({
        type: 'knows',
        from: 'https://example.com/Person/alice',
        to: 'https://example.com/Person/carol',
      })

      await doInstance.relate({
        type: 'works_at',
        from: 'https://example.com/Person/bob',
        to: 'https://example.com/Company/acme',
      })
    })

    it('should follow outgoing edges with ->knows operator', async () => {
      // DO.traverse(startId, '->knows') follows outgoing "knows" edges
      const results = await (doInstance as any).traverse(
        'https://example.com/Person/alice',
        '->knows'
      )

      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(2)
      const urls = results.map((r: Thing) => r.url)
      expect(urls).toContain('https://example.com/Person/bob')
      expect(urls).toContain('https://example.com/Person/carol')
    })

    it('should return Thing objects with all required properties', async () => {
      const results = await (doInstance as any).traverse(
        'https://example.com/Person/alice',
        '->knows'
      )

      expect(results.length).toBeGreaterThan(0)
      const thing = results[0]
      expect(thing.ns).toBe('example.com')
      expect(thing.type).toBe('Person')
      expect(thing.id).toBeDefined()
      expect(thing.url).toBeDefined()
      expect(thing.data).toBeDefined()
      expect(thing.createdAt).toBeDefined()
    })

    it('should return empty array when no outgoing edges exist', async () => {
      const results = await (doInstance as any).traverse(
        'https://example.com/Person/carol',
        '->knows'
      )

      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(0)
    })
  })

  describe('DO.traverse() with incoming edges (<-)', () => {
    let doInstance: DO

    beforeEach(async () => {
      doInstance = new DO(createMockCtx() as any, mockEnv)

      // Set up test graph:
      // Alice --follows--> Bob
      // Carol --follows--> Bob
      // Dave --follows--> Bob
      await doInstance.createThing({
        ns: 'example.com',
        type: 'User',
        id: 'alice',
        data: { name: 'Alice' },
      })

      await doInstance.createThing({
        ns: 'example.com',
        type: 'User',
        id: 'bob',
        data: { name: 'Bob' },
      })

      await doInstance.createThing({
        ns: 'example.com',
        type: 'User',
        id: 'carol',
        data: { name: 'Carol' },
      })

      await doInstance.createThing({
        ns: 'example.com',
        type: 'User',
        id: 'dave',
        data: { name: 'Dave' },
      })

      // Create follows relationships
      await doInstance.relate({
        type: 'follows',
        from: 'https://example.com/User/alice',
        to: 'https://example.com/User/bob',
      })

      await doInstance.relate({
        type: 'follows',
        from: 'https://example.com/User/carol',
        to: 'https://example.com/User/bob',
      })

      await doInstance.relate({
        type: 'follows',
        from: 'https://example.com/User/dave',
        to: 'https://example.com/User/bob',
      })
    })

    it('should follow incoming edges with <-follows operator', async () => {
      // DO.traverse(startId, '<-follows') follows incoming "follows" edges
      const results = await (doInstance as any).traverse(
        'https://example.com/User/bob',
        '<-follows'
      )

      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(3)
      const urls = results.map((r: Thing) => r.url)
      expect(urls).toContain('https://example.com/User/alice')
      expect(urls).toContain('https://example.com/User/carol')
      expect(urls).toContain('https://example.com/User/dave')
    })

    it('should return empty array when no incoming edges exist', async () => {
      const results = await (doInstance as any).traverse(
        'https://example.com/User/alice',
        '<-follows'
      )

      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(0)
    })
  })

  describe('DO.traverse() with bidirectional edges (<->)', () => {
    let doInstance: DO

    beforeEach(async () => {
      doInstance = new DO(createMockCtx() as any, mockEnv)

      // Set up test graph with bidirectional friendships:
      // Alice --friend--> Bob (Alice initiated)
      // Carol --friend--> Alice (Carol initiated)
      await doInstance.createThing({
        ns: 'example.com',
        type: 'User',
        id: 'alice',
        data: { name: 'Alice' },
      })

      await doInstance.createThing({
        ns: 'example.com',
        type: 'User',
        id: 'bob',
        data: { name: 'Bob' },
      })

      await doInstance.createThing({
        ns: 'example.com',
        type: 'User',
        id: 'carol',
        data: { name: 'Carol' },
      })

      // Create friend relationships (unidirectional storage, bidirectional query)
      await doInstance.relate({
        type: 'friend',
        from: 'https://example.com/User/alice',
        to: 'https://example.com/User/bob',
      })

      await doInstance.relate({
        type: 'friend',
        from: 'https://example.com/User/carol',
        to: 'https://example.com/User/alice',
      })
    })

    it('should follow bidirectional edges with <->friend operator', async () => {
      // DO.traverse(startId, '<->friend') follows both incoming and outgoing "friend" edges
      const results = await (doInstance as any).traverse(
        'https://example.com/User/alice',
        '<->friend'
      )

      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(2)
      const urls = results.map((r: Thing) => r.url)
      expect(urls).toContain('https://example.com/User/bob')  // outgoing
      expect(urls).toContain('https://example.com/User/carol') // incoming
    })

    it('should not include the starting node in results', async () => {
      const results = await (doInstance as any).traverse(
        'https://example.com/User/alice',
        '<->friend'
      )

      const urls = results.map((r: Thing) => r.url)
      expect(urls).not.toContain('https://example.com/User/alice')
    })
  })

  describe('Multi-hop traversal', () => {
    let doInstance: DO

    beforeEach(async () => {
      doInstance = new DO(createMockCtx() as any, mockEnv)

      // Set up multi-hop graph:
      // Alice --knows--> Bob --works_at--> Acme
      // Alice --knows--> Carol --works_at--> TechCorp
      await doInstance.createThing({
        ns: 'example.com',
        type: 'Person',
        id: 'alice',
        data: { name: 'Alice' },
      })

      await doInstance.createThing({
        ns: 'example.com',
        type: 'Person',
        id: 'bob',
        data: { name: 'Bob' },
      })

      await doInstance.createThing({
        ns: 'example.com',
        type: 'Person',
        id: 'carol',
        data: { name: 'Carol' },
      })

      await doInstance.createThing({
        ns: 'example.com',
        type: 'Company',
        id: 'acme',
        data: { name: 'Acme Corp' },
      })

      await doInstance.createThing({
        ns: 'example.com',
        type: 'Company',
        id: 'techcorp',
        data: { name: 'TechCorp' },
      })

      // Create relationships
      await doInstance.relate({
        type: 'knows',
        from: 'https://example.com/Person/alice',
        to: 'https://example.com/Person/bob',
      })

      await doInstance.relate({
        type: 'knows',
        from: 'https://example.com/Person/alice',
        to: 'https://example.com/Person/carol',
      })

      await doInstance.relate({
        type: 'works_at',
        from: 'https://example.com/Person/bob',
        to: 'https://example.com/Company/acme',
      })

      await doInstance.relate({
        type: 'works_at',
        from: 'https://example.com/Person/carol',
        to: 'https://example.com/Company/techcorp',
      })
    })

    it('should support chained path: DO.traverse(id, "->knows->works_at")', async () => {
      // Multi-hop traversal using chained operators in single string
      const results = await (doInstance as any).traverse(
        'https://example.com/Person/alice',
        '->knows->works_at'
      )

      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(2)
      const urls = results.map((r: Thing) => r.url)
      expect(urls).toContain('https://example.com/Company/acme')
      expect(urls).toContain('https://example.com/Company/techcorp')
    })

    it('should support variadic operators: DO.traverse(id, "->knows", "->works_at")', async () => {
      // Multi-hop traversal using separate operator arguments
      const results = await (doInstance as any).traverse(
        'https://example.com/Person/alice',
        '->knows',
        '->works_at'
      )

      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(2)
      const urls = results.map((r: Thing) => r.url)
      expect(urls).toContain('https://example.com/Company/acme')
      expect(urls).toContain('https://example.com/Company/techcorp')
    })

    it('should return intermediate nodes with depth=1', async () => {
      // With depth limit of 1, should only get first hop
      const results = await (doInstance as any).traverse(
        'https://example.com/Person/alice',
        '->knows->works_at',
        { depth: 1 }
      )

      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(2)
      // Should return Bob and Carol (knows), not companies
      const types = results.map((r: Thing) => r.type)
      expect(types).toContain('Person')
      expect(types).not.toContain('Company')
    })
  })

  describe('Traversal with depth limits', () => {
    let doInstance: DO

    beforeEach(async () => {
      doInstance = new DO(createMockCtx() as any, mockEnv)

      // Set up a chain: A -> B -> C -> D -> E
      for (const id of ['a', 'b', 'c', 'd', 'e']) {
        await doInstance.createThing({
          ns: 'example.com',
          type: 'Node',
          id,
          data: { name: id.toUpperCase() },
        })
      }

      // Create chain relationships
      await doInstance.relate({
        type: 'next',
        from: 'https://example.com/Node/a',
        to: 'https://example.com/Node/b',
      })

      await doInstance.relate({
        type: 'next',
        from: 'https://example.com/Node/b',
        to: 'https://example.com/Node/c',
      })

      await doInstance.relate({
        type: 'next',
        from: 'https://example.com/Node/c',
        to: 'https://example.com/Node/d',
      })

      await doInstance.relate({
        type: 'next',
        from: 'https://example.com/Node/d',
        to: 'https://example.com/Node/e',
      })
    })

    it('should respect maxDepth option', async () => {
      // Traverse with maxDepth of 2
      const results = await (doInstance as any).traverse(
        'https://example.com/Node/a',
        '->next',
        { maxDepth: 2 }
      )

      expect(Array.isArray(results)).toBe(true)
      // Should get B and C (2 hops max), not D or E
      expect(results.length).toBe(2)
      const ids = results.map((r: Thing) => r.id)
      expect(ids).toContain('b')
      expect(ids).toContain('c')
      expect(ids).not.toContain('d')
      expect(ids).not.toContain('e')
    })

    it('should default to depth 1 for single hop traversal', async () => {
      const results = await (doInstance as any).traverse(
        'https://example.com/Node/a',
        '->next'
      )

      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(1)
      expect(results[0].id).toBe('b')
    })

    it('should support unlimited depth with maxDepth: Infinity', async () => {
      const results = await (doInstance as any).traverse(
        'https://example.com/Node/a',
        '->next',
        { maxDepth: Infinity }
      )

      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(4) // B, C, D, E
      const ids = results.map((r: Thing) => r.id)
      expect(ids).toContain('b')
      expect(ids).toContain('c')
      expect(ids).toContain('d')
      expect(ids).toContain('e')
    })
  })

  describe('Traversal return types', () => {
    let doInstance: DO

    beforeEach(async () => {
      doInstance = new DO(createMockCtx() as any, mockEnv)

      await doInstance.createThing({
        ns: 'example.com',
        type: 'User',
        id: 'alice',
        data: { name: 'Alice', email: 'alice@example.com' },
      })

      await doInstance.createThing({
        ns: 'example.com',
        type: 'Post',
        id: 'post-1',
        data: { title: 'Hello World', body: 'My first post' },
      })

      await doInstance.relate({
        type: 'authored',
        from: 'https://example.com/User/alice',
        to: 'https://example.com/Post/post-1',
      })
    })

    it('should return array of Things', async () => {
      const results = await (doInstance as any).traverse(
        'https://example.com/User/alice',
        '->authored'
      )

      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(1)

      const post = results[0] as Thing
      expect(post.ns).toBe('example.com')
      expect(post.type).toBe('Post')
      expect(post.id).toBe('post-1')
      expect(post.url).toBe('https://example.com/Post/post-1')
      expect(post.data).toEqual({ title: 'Hello World', body: 'My first post' })
      expect(post.createdAt).toBeDefined()
      expect(post.updatedAt).toBeDefined()
    })

    it('should preserve data integrity', async () => {
      const results = await (doInstance as any).traverse(
        'https://example.com/User/alice',
        '->authored'
      )

      const post = results[0]
      expect(post.data.title).toBe('Hello World')
      expect(post.data.body).toBe('My first post')
    })
  })

  describe('Error handling', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    it('should throw on invalid operator format', async () => {
      await expect(
        (doInstance as any).traverse('https://example.com/User/alice', '>>invalid')
      ).rejects.toThrow()
    })

    it('should throw on empty operator', async () => {
      await expect(
        (doInstance as any).traverse('https://example.com/User/alice', '')
      ).rejects.toThrow()
    })

    it('should throw on missing startId', async () => {
      await expect(
        (doInstance as any).traverse(null, '->knows')
      ).rejects.toThrow()
    })

    it('should throw on missing operator', async () => {
      await expect(
        (doInstance as any).traverse('https://example.com/User/alice')
      ).rejects.toThrow()
    })

    it('should return empty array for non-existent start node', async () => {
      const results = await (doInstance as any).traverse(
        'https://example.com/User/nonexistent',
        '->knows'
      )

      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(0)
    })
  })

  describe('RPC integration', () => {
    let doInstance: DO

    beforeEach(async () => {
      doInstance = new DO(createMockCtx() as any, mockEnv)

      await doInstance.createThing({
        ns: 'example.com',
        type: 'User',
        id: 'alice',
        data: { name: 'Alice' },
      })

      await doInstance.createThing({
        ns: 'example.com',
        type: 'User',
        id: 'bob',
        data: { name: 'Bob' },
      })

      await doInstance.relate({
        type: 'knows',
        from: 'https://example.com/User/alice',
        to: 'https://example.com/User/bob',
      })
    })

    it('should have traverse in allowedMethods', () => {
      expect(doInstance.allowedMethods.has('traverse')).toBe(true)
    })

    it('should be invokable via RPC invoke()', async () => {
      const results = await doInstance.invoke('traverse', [
        'https://example.com/User/alice',
        '->knows',
      ])

      expect(Array.isArray(results)).toBe(true)
      expect((results as Thing[]).length).toBe(1)
      expect((results as Thing[])[0].id).toBe('bob')
    })
  })
})
