import { vi } from 'vitest'

vi.mock('cloudflare:workers', () => {
  class MockDurableObject<Env = unknown> {
    protected ctx: unknown
    protected env: Env
    constructor(ctx: unknown, env: Env) {
      this.ctx = ctx
      this.env = env
    }
  }
  return { DurableObject: MockDurableObject }
})

/**
 * @dotdo/do - Traversal API Tests (TDD Phase)
 *
 * These tests define the expected behavior of the traverse() method
 * which provides a more ergonomic API for graph traversal using operators.
 *
 * Tests cover:
 * - DO.traverse(url, '->author') - exact forward traversal
 * - DO.traverse(url, '<-comments') - backward traversal
 * - DO.traverse(url, '~>topics') - fuzzy forward (AI-discovered)
 * - DO.traverse(url, '<~similar') - fuzzy backward
 * - Multi-hop: DO.traverse(url, '->author', '->posts')
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { DO } from '../src/do'
import type { Thing } from '../src/types'

/**
 * Create an in-memory SQLite mock for testing traversal
 */
function createMockSqlStorage() {
  // In-memory storage using Maps
  const documents: Map<string, Record<string, unknown>> = new Map()
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

describe('Traversal API (TDD)', () => {
  describe.todo('RED: DO.traverse() with exact operators', () => {
    let doInstance: DO

    beforeEach(async () => {
      doInstance = new DO(createMockCtx() as any, mockEnv)

      // Set up test data: User -> authored -> Post -> has -> Comment
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
        data: { title: 'Hello World', content: 'My first post' },
      })

      await doInstance.createThing({
        ns: 'example.com',
        type: 'Post',
        id: 'post-2',
        data: { title: 'Second Post', content: 'Another post' },
      })

      await doInstance.createThing({
        ns: 'example.com',
        type: 'Comment',
        id: 'comment-1',
        data: { text: 'Great post!' },
      })

      // Create relationships
      await doInstance.relate({
        type: 'authored',
        from: 'https://example.com/User/alice',
        to: 'https://example.com/Post/post-1',
      })

      await doInstance.relate({
        type: 'authored',
        from: 'https://example.com/User/alice',
        to: 'https://example.com/Post/post-2',
      })

      await doInstance.relate({
        type: 'has',
        from: 'https://example.com/Post/post-1',
        to: 'https://example.com/Comment/comment-1',
      })
    })

    it('should traverse forward with -> operator', async () => {
      // DO.traverse(url, '->authored') should find posts authored by user
      const posts = await (doInstance as any).traverse(
        'https://example.com/User/alice',
        '->authored'
      )

      expect(Array.isArray(posts)).toBe(true)
      expect(posts.length).toBe(2)
      expect(posts.map((p: Thing) => p.url)).toContain('https://example.com/Post/post-1')
      expect(posts.map((p: Thing) => p.url)).toContain('https://example.com/Post/post-2')
    })

    it('should traverse backward with <- operator', async () => {
      // DO.traverse(url, '<-authored') should find users who authored this post
      const authors = await (doInstance as any).traverse(
        'https://example.com/Post/post-1',
        '<-authored'
      )

      expect(Array.isArray(authors)).toBe(true)
      expect(authors.length).toBe(1)
      expect(authors[0].url).toBe('https://example.com/User/alice')
    })

    it('should support multi-hop traversal', async () => {
      // DO.traverse(url, '->authored', '->has') should find comments on posts by user
      const comments = await (doInstance as any).traverse(
        'https://example.com/User/alice',
        '->authored',
        '->has'
      )

      expect(Array.isArray(comments)).toBe(true)
      expect(comments.length).toBe(1)
      expect(comments[0].url).toBe('https://example.com/Comment/comment-1')
    })

    it('should return empty array for no matching relationships', async () => {
      const results = await (doInstance as any).traverse(
        'https://example.com/User/alice',
        '->nonexistent'
      )

      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(0)
    })

    it('should return full Thing objects with all properties', async () => {
      const posts = await (doInstance as any).traverse(
        'https://example.com/User/alice',
        '->authored'
      )

      expect(posts.length).toBeGreaterThan(0)
      const post = posts[0]
      expect(post.ns).toBeDefined()
      expect(post.type).toBeDefined()
      expect(post.id).toBeDefined()
      expect(post.url).toBeDefined()
      expect(post.data).toBeDefined()
      expect(post.createdAt).toBeDefined()
    })

    it('should be in allowedMethods set', () => {
      expect(doInstance.allowedMethods.has('traverse')).toBe(true)
    })

    it('should be invokable via RPC', async () => {
      const posts = await doInstance.invoke('traverse', [
        'https://example.com/User/alice',
        '->authored',
      ])

      expect(Array.isArray(posts)).toBe(true)
      expect((posts as Thing[]).length).toBe(2)
    })

    it('should handle traversal from non-existent URL', async () => {
      const results = await (doInstance as any).traverse(
        'https://example.com/User/nonexistent',
        '->authored'
      )

      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(0)
    })
  })

  describe.todo('RED: Traversal with type filtering', () => {
    let doInstance: DO

    beforeEach(async () => {
      doInstance = new DO(createMockCtx() as any, mockEnv)

      // Set up mixed relationships
      await doInstance.createThing({
        ns: 'example.com',
        type: 'User',
        id: 'alice',
        data: { name: 'Alice' },
      })

      await doInstance.createThing({
        ns: 'example.com',
        type: 'Post',
        id: 'post-1',
        data: { title: 'Post 1' },
      })

      await doInstance.createThing({
        ns: 'example.com',
        type: 'Image',
        id: 'image-1',
        data: { filename: 'photo.jpg' },
      })

      // Create different relationship types
      await doInstance.relate({
        type: 'authored',
        from: 'https://example.com/User/alice',
        to: 'https://example.com/Post/post-1',
      })

      await doInstance.relate({
        type: 'uploaded',
        from: 'https://example.com/User/alice',
        to: 'https://example.com/Image/image-1',
      })
    })

    it('should filter by relationship type in operator', async () => {
      // Only get authored relationships, not uploaded
      const posts = await (doInstance as any).traverse(
        'https://example.com/User/alice',
        '->authored'
      )

      expect(posts.length).toBe(1)
      expect(posts[0].type).toBe('Post')
    })

    it('should support case-sensitive relationship types', async () => {
      // Relationship type is 'authored', not 'Authored'
      const postsWrongCase = await (doInstance as any).traverse(
        'https://example.com/User/alice',
        '->Authored'
      )

      expect(postsWrongCase.length).toBe(0)
    })
  })

  describe.todo('RED: Traversal error handling', () => {
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

    it('should throw on missing URL', async () => {
      await expect(
        (doInstance as any).traverse(null, '->authored')
      ).rejects.toThrow()
    })

    it('should throw on missing operator', async () => {
      await expect(
        (doInstance as any).traverse('https://example.com/User/alice')
      ).rejects.toThrow()
    })
  })

  describe.todo('RED: Fuzzy traversal with threshold', () => {
    let doInstance: DO

    beforeEach(async () => {
      doInstance = new DO(createMockCtx() as any, mockEnv)

      // Set up test data for fuzzy matching
      await doInstance.createThing({
        ns: 'example.com',
        type: 'Article',
        id: 'article-1',
        data: {
          title: 'Introduction to Machine Learning',
          content: 'Machine learning is a branch of AI...',
          tags: ['ai', 'ml', 'technology'],
        },
      })

      await doInstance.createThing({
        ns: 'example.com',
        type: 'Topic',
        id: 'topic-ai',
        data: { name: 'Artificial Intelligence', description: 'The study of intelligent agents' },
      })

      await doInstance.createThing({
        ns: 'example.com',
        type: 'Topic',
        id: 'topic-ml',
        data: { name: 'Machine Learning', description: 'Subset of AI focusing on data-driven learning' },
      })
    })

    it('should support ~> fuzzy forward traversal', async () => {
      // Fuzzy traversal to discover related topics
      // For now, this should return empty array (stub implementation)
      const topics = await (doInstance as any).traverse(
        'https://example.com/Article/article-1',
        '~>topics'
      )

      expect(Array.isArray(topics)).toBe(true)
      // Stub returns empty for now - full AI implementation later
    })

    it('should support <~ fuzzy backward traversal', async () => {
      // Fuzzy backward to find similar articles
      // For now, this should return empty array (stub implementation)
      const similar = await (doInstance as any).traverse(
        'https://example.com/Article/article-1',
        '<~similar'
      )

      expect(Array.isArray(similar)).toBe(true)
      // Stub returns empty for now - full AI implementation later
    })

    it('should accept optional threshold for fuzzy traversal', async () => {
      // Traverse with options object including threshold
      const results = await (doInstance as any).traverse(
        'https://example.com/Article/article-1',
        '~>topics',
        { threshold: 0.7 }
      )

      expect(Array.isArray(results)).toBe(true)
    })

    it('should accept optional limit for fuzzy traversal', async () => {
      const results = await (doInstance as any).traverse(
        'https://example.com/Article/article-1',
        '~>topics',
        { limit: 5 }
      )

      expect(Array.isArray(results)).toBe(true)
    })
  })

  describe.todo('RED: TraverseOptions interface', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    it('should support options object for advanced traversal', async () => {
      // traverse(url, operators..., options)
      const results = await (doInstance as any).traverse(
        'https://example.com/User/alice',
        '->authored',
        {
          limit: 10,
          offset: 0,
        }
      )

      expect(Array.isArray(results)).toBe(true)
    })

    it('should distinguish between operator and options arguments', async () => {
      // Last argument could be another operator OR options
      // If it's an object without direction/mode, it's options
      const results = await (doInstance as any).traverse(
        'https://example.com/User/alice',
        '->authored',
        '->has',
        { limit: 5 }
      )

      expect(Array.isArray(results)).toBe(true)
    })
  })
})
