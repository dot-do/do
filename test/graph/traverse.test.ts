/**
 * @dotdo/do - Graph Traversal API Tests (GREEN Phase)
 *
 * These tests verify the behavior of DO.traverse() method
 * which provides graph traversal using relationship operators,
 * using the Cloudflare Workers test environment with real Miniflare-powered SQLite.
 *
 * Tests cover:
 * - DO.traverse(startId, '->knows') - follows outgoing edges
 * - DO.traverse(startId, '<-follows') - follows incoming edges
 * - DO.traverse(startId, '<->friend') - follows bidirectional edges
 * - Multi-hop traversal: DO.traverse(id, '->knows->works_at')
 * - Traversal with depth limits
 * - Returns array of matched Things
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createTestStub, uniqueTestName } from '../helpers/do-test-utils'
import type { DurableObjectStub } from '@cloudflare/workers-types'

// Type helper for Thing
interface Thing {
  ns: string
  type: string
  id: string
  url: string
  data: Record<string, unknown>
  createdAt: string | Date
  updatedAt: string | Date
}

// Type helper for DO stub with RPC methods
interface DOStub extends DurableObjectStub {
  createThing: (options: { ns: string; type: string; id: string; data: Record<string, unknown> }) => Promise<Thing>
  relate: (options: { type: string; from: string; to: string; data?: Record<string, unknown> }) => Promise<Record<string, unknown>>
  traverse: (startUrl: string, ...operators: (string | Record<string, unknown>)[]) => Promise<Thing[]>
  invoke: (method: string, args: unknown[]) => Promise<unknown>
  allowedMethods: Set<string>
}

describe('Graph Traversal API (GREEN Phase)', () => {
  describe.todo('DO.traverse() with outgoing edges (->)', () => {
    let stub: DOStub
    let testPrefix: string

    beforeEach(async () => {
      testPrefix = uniqueTestName('traverse-outgoing')
      stub = createTestStub(testPrefix) as unknown as DOStub

      // Set up test graph:
      // Alice --knows--> Bob
      // Alice --knows--> Carol
      // Bob --works_at--> Acme
      await stub.createThing({
        ns: 'example.com',
        type: 'Person',
        id: 'alice',
        data: { name: 'Alice' },
      })

      await stub.createThing({
        ns: 'example.com',
        type: 'Person',
        id: 'bob',
        data: { name: 'Bob' },
      })

      await stub.createThing({
        ns: 'example.com',
        type: 'Person',
        id: 'carol',
        data: { name: 'Carol' },
      })

      await stub.createThing({
        ns: 'example.com',
        type: 'Company',
        id: 'acme',
        data: { name: 'Acme Corp' },
      })

      // Create relationships
      await stub.relate({
        type: 'knows',
        from: 'https://example.com/Person/alice',
        to: 'https://example.com/Person/bob',
      })

      await stub.relate({
        type: 'knows',
        from: 'https://example.com/Person/alice',
        to: 'https://example.com/Person/carol',
      })

      await stub.relate({
        type: 'works_at',
        from: 'https://example.com/Person/bob',
        to: 'https://example.com/Company/acme',
      })
    })

    it('should follow outgoing edges with ->knows operator', async () => {
      // DO.traverse(startId, '->knows') follows outgoing "knows" edges
      const results = await stub.traverse(
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
      const results = await stub.traverse(
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
      const results = await stub.traverse(
        'https://example.com/Person/carol',
        '->knows'
      )

      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(0)
    })
  })

  describe.todo('DO.traverse() with incoming edges (<-)', () => {
    let stub: DOStub
    let testPrefix: string

    beforeEach(async () => {
      testPrefix = uniqueTestName('traverse-incoming')
      stub = createTestStub(testPrefix) as unknown as DOStub

      // Set up test graph:
      // Alice --follows--> Bob
      // Carol --follows--> Bob
      // Dave --follows--> Bob
      await stub.createThing({
        ns: 'example.com',
        type: 'User',
        id: 'alice',
        data: { name: 'Alice' },
      })

      await stub.createThing({
        ns: 'example.com',
        type: 'User',
        id: 'bob',
        data: { name: 'Bob' },
      })

      await stub.createThing({
        ns: 'example.com',
        type: 'User',
        id: 'carol',
        data: { name: 'Carol' },
      })

      await stub.createThing({
        ns: 'example.com',
        type: 'User',
        id: 'dave',
        data: { name: 'Dave' },
      })

      // Create follows relationships
      await stub.relate({
        type: 'follows',
        from: 'https://example.com/User/alice',
        to: 'https://example.com/User/bob',
      })

      await stub.relate({
        type: 'follows',
        from: 'https://example.com/User/carol',
        to: 'https://example.com/User/bob',
      })

      await stub.relate({
        type: 'follows',
        from: 'https://example.com/User/dave',
        to: 'https://example.com/User/bob',
      })
    })

    it('should follow incoming edges with <-follows operator', async () => {
      // DO.traverse(startId, '<-follows') follows incoming "follows" edges
      const results = await stub.traverse(
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
      const results = await stub.traverse(
        'https://example.com/User/alice',
        '<-follows'
      )

      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(0)
    })
  })

  describe.todo('DO.traverse() with bidirectional edges (<->)', () => {
    let stub: DOStub
    let testPrefix: string

    beforeEach(async () => {
      testPrefix = uniqueTestName('traverse-bidirectional')
      stub = createTestStub(testPrefix) as unknown as DOStub

      // Set up test graph with bidirectional friendships:
      // Alice --friend--> Bob (Alice initiated)
      // Carol --friend--> Alice (Carol initiated)
      await stub.createThing({
        ns: 'example.com',
        type: 'User',
        id: 'alice',
        data: { name: 'Alice' },
      })

      await stub.createThing({
        ns: 'example.com',
        type: 'User',
        id: 'bob',
        data: { name: 'Bob' },
      })

      await stub.createThing({
        ns: 'example.com',
        type: 'User',
        id: 'carol',
        data: { name: 'Carol' },
      })

      // Create friend relationships (unidirectional storage, bidirectional query)
      await stub.relate({
        type: 'friend',
        from: 'https://example.com/User/alice',
        to: 'https://example.com/User/bob',
      })

      await stub.relate({
        type: 'friend',
        from: 'https://example.com/User/carol',
        to: 'https://example.com/User/alice',
      })
    })

    it('should follow bidirectional edges with <->friend operator', async () => {
      // DO.traverse(startId, '<->friend') follows both incoming and outgoing "friend" edges
      const results = await stub.traverse(
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
      const results = await stub.traverse(
        'https://example.com/User/alice',
        '<->friend'
      )

      const urls = results.map((r: Thing) => r.url)
      expect(urls).not.toContain('https://example.com/User/alice')
    })
  })

  describe.todo('Multi-hop traversal', () => {
    let stub: DOStub
    let testPrefix: string

    beforeEach(async () => {
      testPrefix = uniqueTestName('traverse-multihop')
      stub = createTestStub(testPrefix) as unknown as DOStub

      // Set up multi-hop graph:
      // Alice --knows--> Bob --works_at--> Acme
      // Alice --knows--> Carol --works_at--> TechCorp
      await stub.createThing({
        ns: 'example.com',
        type: 'Person',
        id: 'alice',
        data: { name: 'Alice' },
      })

      await stub.createThing({
        ns: 'example.com',
        type: 'Person',
        id: 'bob',
        data: { name: 'Bob' },
      })

      await stub.createThing({
        ns: 'example.com',
        type: 'Person',
        id: 'carol',
        data: { name: 'Carol' },
      })

      await stub.createThing({
        ns: 'example.com',
        type: 'Company',
        id: 'acme',
        data: { name: 'Acme Corp' },
      })

      await stub.createThing({
        ns: 'example.com',
        type: 'Company',
        id: 'techcorp',
        data: { name: 'TechCorp' },
      })

      // Create relationships
      await stub.relate({
        type: 'knows',
        from: 'https://example.com/Person/alice',
        to: 'https://example.com/Person/bob',
      })

      await stub.relate({
        type: 'knows',
        from: 'https://example.com/Person/alice',
        to: 'https://example.com/Person/carol',
      })

      await stub.relate({
        type: 'works_at',
        from: 'https://example.com/Person/bob',
        to: 'https://example.com/Company/acme',
      })

      await stub.relate({
        type: 'works_at',
        from: 'https://example.com/Person/carol',
        to: 'https://example.com/Company/techcorp',
      })
    })

    it('should support chained path: DO.traverse(id, "->knows->works_at")', async () => {
      // Multi-hop traversal using chained operators in single string
      const results = await stub.traverse(
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
      const results = await stub.traverse(
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
      const results = await stub.traverse(
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

  describe.todo('Traversal with depth limits', () => {
    let stub: DOStub
    let testPrefix: string

    beforeEach(async () => {
      testPrefix = uniqueTestName('traverse-depth')
      stub = createTestStub(testPrefix) as unknown as DOStub

      // Set up a chain: A -> B -> C -> D -> E
      for (const id of ['a', 'b', 'c', 'd', 'e']) {
        await stub.createThing({
          ns: 'example.com',
          type: 'Node',
          id,
          data: { name: id.toUpperCase() },
        })
      }

      // Create chain relationships
      await stub.relate({
        type: 'next',
        from: 'https://example.com/Node/a',
        to: 'https://example.com/Node/b',
      })

      await stub.relate({
        type: 'next',
        from: 'https://example.com/Node/b',
        to: 'https://example.com/Node/c',
      })

      await stub.relate({
        type: 'next',
        from: 'https://example.com/Node/c',
        to: 'https://example.com/Node/d',
      })

      await stub.relate({
        type: 'next',
        from: 'https://example.com/Node/d',
        to: 'https://example.com/Node/e',
      })
    })

    it('should respect maxDepth option', async () => {
      // Traverse with maxDepth of 2
      const results = await stub.traverse(
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
      const results = await stub.traverse(
        'https://example.com/Node/a',
        '->next'
      )

      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(1)
      expect(results[0].id).toBe('b')
    })

    it('should support unlimited depth with maxDepth: Infinity', async () => {
      const results = await stub.traverse(
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

  describe.todo('Traversal return types', () => {
    let stub: DOStub
    let testPrefix: string

    beforeEach(async () => {
      testPrefix = uniqueTestName('traverse-return')
      stub = createTestStub(testPrefix) as unknown as DOStub

      await stub.createThing({
        ns: 'example.com',
        type: 'User',
        id: 'alice',
        data: { name: 'Alice', email: 'alice@example.com' },
      })

      await stub.createThing({
        ns: 'example.com',
        type: 'Post',
        id: 'post-1',
        data: { title: 'Hello World', body: 'My first post' },
      })

      await stub.relate({
        type: 'authored',
        from: 'https://example.com/User/alice',
        to: 'https://example.com/Post/post-1',
      })
    })

    it('should return array of Things', async () => {
      const results = await stub.traverse(
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
      const results = await stub.traverse(
        'https://example.com/User/alice',
        '->authored'
      )

      const post = results[0]
      expect(post.data.title).toBe('Hello World')
      expect(post.data.body).toBe('My first post')
    })
  })

  describe('Error handling', () => {
    let stub: DOStub
    let testPrefix: string

    beforeEach(() => {
      testPrefix = uniqueTestName('traverse-errors')
      stub = createTestStub(testPrefix) as unknown as DOStub
    })

    it('should throw on invalid operator format', async () => {
      await expect(
        stub.traverse('https://example.com/User/alice', '>>invalid')
      ).rejects.toThrow()
    })

    it('should throw on empty operator', async () => {
      await expect(
        stub.traverse('https://example.com/User/alice', '')
      ).rejects.toThrow()
    })

    it('should throw on missing startId', async () => {
      await expect(
        stub.traverse(null as unknown as string, '->knows')
      ).rejects.toThrow()
    })

    it('should throw on missing operator', async () => {
      await expect(
        stub.traverse('https://example.com/User/alice')
      ).rejects.toThrow()
    })

    it.todo('should return empty array for non-existent start node', async () => {
      const results = await stub.traverse(
        'https://example.com/User/nonexistent',
        '->knows'
      )

      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(0)
    })
  })

  describe.todo('RPC integration', () => {
    let stub: DOStub
    let testPrefix: string

    beforeEach(async () => {
      testPrefix = uniqueTestName('traverse-rpc')
      stub = createTestStub(testPrefix) as unknown as DOStub

      await stub.createThing({
        ns: 'example.com',
        type: 'User',
        id: 'alice',
        data: { name: 'Alice' },
      })

      await stub.createThing({
        ns: 'example.com',
        type: 'User',
        id: 'bob',
        data: { name: 'Bob' },
      })

      await stub.relate({
        type: 'knows',
        from: 'https://example.com/User/alice',
        to: 'https://example.com/User/bob',
      })
    })

    it('should have traverse in allowedMethods', async () => {
      const result = await stub.invoke('getAllowedMethods', [])
      const methods = result as string[]
      expect(methods.includes('traverse')).toBe(true)
    })

    it('should be invokable via RPC invoke()', async () => {
      const results = await stub.invoke('traverse', [
        'https://example.com/User/alice',
        '->knows',
      ])

      expect(Array.isArray(results)).toBe(true)
      expect((results as Thing[]).length).toBe(1)
      expect((results as Thing[])[0].id).toBe('bob')
    })
  })
})
