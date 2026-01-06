/**
 * @dotdo/do - Relationship Operations Tests (RED Phase)
 *
 * Phase 11 - Graph Operations
 *
 * These tests define the expected behavior of relationship (graph edge) operations.
 * They should FAIL initially (RED), then pass after implementation (GREEN).
 *
 * Tests cover:
 * - relate() - creates edge between two things
 * - unrelate() - removes edge
 * - related() - finds connected things
 * - relationships() - lists edges
 * - references() - finds backlinks
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DO } from '../src/do'
import type { Relationship, RelateOptions, Thing } from '../src/types'

/**
 * Create an in-memory SQLite mock for testing relationships
 * Extends the document storage with relationship table support
 */
function createMockSqlStorage() {
  // In-memory storage using Maps
  const documents: Map<string, Record<string, unknown>> = new Map()
  const relationships: Map<string, Record<string, unknown>> = new Map()

  return {
    exec(query: string, ...params: unknown[]) {
      const results: unknown[] = []
      const normalizedQuery = query.trim().toUpperCase()

      // CREATE TABLE statements
      if (normalizedQuery.startsWith('CREATE TABLE')) {
        const tableMatch = query.match(/CREATE TABLE IF NOT EXISTS (\w+)/i)
        if (tableMatch) {
          // Just acknowledge table creation
        }
        return { toArray: () => results }
      }

      // INSERT INTO documents
      if (normalizedQuery.startsWith('INSERT') && query.toLowerCase().includes('documents')) {
        const [collection, id, data] = params as [string, string, string]
        const key = `${collection}:${id}`
        documents.set(key, {
          collection,
          id,
          data,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      }

      // INSERT INTO relationships
      if (normalizedQuery.startsWith('INSERT') && query.toLowerCase().includes('relationships')) {
        const [id, type, from, to, data] = params as [string, string, string, string, string]
        relationships.set(id, {
          id,
          type,
          from,
          to,
          data: data || '{}',
          created_at: new Date().toISOString(),
        })
      }

      // SELECT from documents
      if (normalizedQuery.startsWith('SELECT') && query.toLowerCase().includes('documents')) {
        if (query.includes('WHERE collection = ? AND id = ?')) {
          const [collection, id] = params as [string, string]
          const key = `${collection}:${id}`
          const row = documents.get(key)
          if (row) {
            results.push({ data: row.data })
          }
        } else if (query.includes('WHERE collection = ?')) {
          const [collection, limit, offset] = params as [string, number, number]
          const matching: Record<string, unknown>[] = []
          for (const [key, row] of documents.entries()) {
            if (key.startsWith(`${collection}:`)) {
              matching.push({ data: row.data })
            }
          }
          const paginated = matching.slice(offset || 0, (offset || 0) + (limit || 100))
          results.push(...paginated)
        }
      }

      // SELECT from relationships
      if (normalizedQuery.startsWith('SELECT') && query.toLowerCase().includes('relationships')) {
        // Get relationship by ID
        if (query.includes('WHERE id = ?')) {
          const [id] = params as [string]
          const rel = relationships.get(id)
          if (rel) {
            results.push(rel)
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
        // Get relationships by from and to and type (for unrelate)
        else if (query.includes('"from" = ?') && query.includes('"to" = ?') && query.includes('type = ?')) {
          const [from, type, to] = params as [string, string, string]
          for (const rel of relationships.values()) {
            if (rel.from === from && rel.to === to && rel.type === type) {
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

      // DELETE from relationships
      if (normalizedQuery.startsWith('DELETE') && query.toLowerCase().includes('relationships')) {
        const [from, type, to] = params as [string, string, string]
        for (const [id, rel] of relationships.entries()) {
          if (rel.from === from && rel.to === to && rel.type === type) {
            relationships.delete(id)
          }
        }
      }

      // UPDATE documents
      if (normalizedQuery.startsWith('UPDATE') && query.toLowerCase().includes('documents')) {
        const [data, collection, id] = params as [string, string, string]
        const key = `${collection}:${id}`
        const existing = documents.get(key)
        if (existing) {
          documents.set(key, { ...existing, data, updated_at: new Date().toISOString() })
        }
      }

      // DELETE from documents
      if (normalizedQuery.startsWith('DELETE') && query.toLowerCase().includes('documents')) {
        const [collection, id] = params as [string, string]
        const key = `${collection}:${id}`
        documents.delete(key)
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

describe('Relationship Operations (Phase 11 - Graph Operations)', () => {
  describe('relate() - Create Edge', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    it('should create a relationship between two things', async () => {
      // First create two things to relate
      const user = await doInstance.create('users', {
        id: 'user-1',
        name: 'Alice',
      })
      const post = await doInstance.create('posts', {
        id: 'post-1',
        title: 'Hello World',
      })

      // Create relationship
      const options: RelateOptions = {
        type: 'authored',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/posts/post-1',
      }

      const relationship = await (doInstance as any).relate(options)

      expect(relationship).toBeDefined()
      expect(relationship.id).toBeDefined()
      expect(relationship.type).toBe('authored')
      expect(relationship.from).toBe('https://example.com/users/user-1')
      expect(relationship.to).toBe('https://example.com/posts/post-1')
      expect(relationship.createdAt).toBeDefined()
    })

    it('should create a relationship with metadata', async () => {
      const options: RelateOptions<{ role: string; since: string }> = {
        type: 'follows',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/users/user-2',
        data: {
          role: 'fan',
          since: '2024-01-01',
        },
      }

      const relationship = await (doInstance as any).relate(options)

      expect(relationship).toBeDefined()
      expect(relationship.data).toBeDefined()
      expect(relationship.data.role).toBe('fan')
      expect(relationship.data.since).toBe('2024-01-01')
    })

    it('should generate unique ID for each relationship', async () => {
      const options1: RelateOptions = {
        type: 'likes',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/posts/post-1',
      }
      const options2: RelateOptions = {
        type: 'likes',
        from: 'https://example.com/users/user-2',
        to: 'https://example.com/posts/post-1',
      }

      const rel1 = await (doInstance as any).relate(options1)
      const rel2 = await (doInstance as any).relate(options2)

      expect(rel1.id).not.toBe(rel2.id)
    })

    it('should allow multiple relationship types between same nodes', async () => {
      const likes: RelateOptions = {
        type: 'likes',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/posts/post-1',
      }
      const bookmarks: RelateOptions = {
        type: 'bookmarks',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/posts/post-1',
      }

      const rel1 = await (doInstance as any).relate(likes)
      const rel2 = await (doInstance as any).relate(bookmarks)

      expect(rel1.type).toBe('likes')
      expect(rel2.type).toBe('bookmarks')
      expect(rel1.id).not.toBe(rel2.id)
    })

    it('should be in allowedMethods set', () => {
      expect(doInstance.allowedMethods.has('relate')).toBe(true)
    })
  })

  describe('unrelate() - Remove Edge', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    it('should remove an existing relationship', async () => {
      // First create a relationship
      const options: RelateOptions = {
        type: 'follows',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/users/user-2',
      }
      await (doInstance as any).relate(options)

      // Then remove it
      const result = await (doInstance as any).unrelate(
        'https://example.com/users/user-1',
        'follows',
        'https://example.com/users/user-2'
      )

      expect(result).toBe(true)
    })

    it('should return false for non-existent relationship', async () => {
      const result = await (doInstance as any).unrelate(
        'https://example.com/users/nonexistent',
        'follows',
        'https://example.com/users/other'
      )

      expect(result).toBe(false)
    })

    it('should only remove the specified relationship type', async () => {
      // Create two relationships of different types
      await (doInstance as any).relate({
        type: 'follows',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/users/user-2',
      })
      await (doInstance as any).relate({
        type: 'blocks',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/users/user-2',
      })

      // Remove only 'follows'
      await (doInstance as any).unrelate(
        'https://example.com/users/user-1',
        'follows',
        'https://example.com/users/user-2'
      )

      // 'blocks' should still exist
      const rels = await (doInstance as any).relationships(
        'https://example.com/users/user-1',
        'blocks'
      )
      expect(rels.length).toBe(1)
      expect(rels[0].type).toBe('blocks')
    })

    it('should be in allowedMethods set', () => {
      expect(doInstance.allowedMethods.has('unrelate')).toBe(true)
    })
  })

  describe('related() - Find Connected Things', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    it('should find things connected by outgoing relationships', async () => {
      // Create things
      await doInstance.create('users', { id: 'user-1', name: 'Alice' })
      await doInstance.create('posts', { id: 'post-1', title: 'Post 1' })
      await doInstance.create('posts', { id: 'post-2', title: 'Post 2' })

      // Create relationships
      await (doInstance as any).relate({
        type: 'authored',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/posts/post-1',
      })
      await (doInstance as any).relate({
        type: 'authored',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/posts/post-2',
      })

      // Find related things (outgoing by default)
      const relatedPosts = await (doInstance as any).related(
        'https://example.com/users/user-1',
        'authored'
      )

      expect(Array.isArray(relatedPosts)).toBe(true)
      expect(relatedPosts.length).toBe(2)
    })

    it('should find things connected by incoming relationships', async () => {
      // Create things
      await doInstance.create('users', { id: 'user-1', name: 'Alice' })
      await doInstance.create('users', { id: 'user-2', name: 'Bob' })
      await doInstance.create('posts', { id: 'post-1', title: 'Post 1' })

      // Create relationships (both users like the post)
      await (doInstance as any).relate({
        type: 'likes',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/posts/post-1',
      })
      await (doInstance as any).relate({
        type: 'likes',
        from: 'https://example.com/users/user-2',
        to: 'https://example.com/posts/post-1',
      })

      // Find who likes the post (incoming direction)
      const likers = await (doInstance as any).related(
        'https://example.com/posts/post-1',
        'likes',
        'to' // incoming
      )

      expect(Array.isArray(likers)).toBe(true)
      expect(likers.length).toBe(2)
    })

    it('should find things in both directions when specified', async () => {
      // Create bidirectional friend relationships
      await doInstance.create('users', { id: 'user-1', name: 'Alice' })
      await doInstance.create('users', { id: 'user-2', name: 'Bob' })
      await doInstance.create('users', { id: 'user-3', name: 'Charlie' })

      await (doInstance as any).relate({
        type: 'friends',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/users/user-2',
      })
      await (doInstance as any).relate({
        type: 'friends',
        from: 'https://example.com/users/user-3',
        to: 'https://example.com/users/user-1',
      })

      // Find all friends (both directions)
      const allFriends = await (doInstance as any).related(
        'https://example.com/users/user-1',
        'friends',
        'both'
      )

      expect(Array.isArray(allFriends)).toBe(true)
      expect(allFriends.length).toBe(2)
    })

    it('should return empty array when no relationships exist', async () => {
      const related = await (doInstance as any).related(
        'https://example.com/users/nonexistent',
        'follows'
      )

      expect(Array.isArray(related)).toBe(true)
      expect(related.length).toBe(0)
    })

    it('should filter by relationship type', async () => {
      await doInstance.create('users', { id: 'user-1', name: 'Alice' })
      await doInstance.create('posts', { id: 'post-1', title: 'Post 1' })

      // Create different relationship types
      await (doInstance as any).relate({
        type: 'likes',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/posts/post-1',
      })
      await (doInstance as any).relate({
        type: 'bookmarks',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/posts/post-1',
      })

      // Find only 'likes' relationships
      const liked = await (doInstance as any).related(
        'https://example.com/users/user-1',
        'likes'
      )

      expect(liked.length).toBe(1)
    })

    it('should return all related things when type is not specified', async () => {
      await doInstance.create('users', { id: 'user-1', name: 'Alice' })
      await doInstance.create('posts', { id: 'post-1', title: 'Post 1' })
      await doInstance.create('posts', { id: 'post-2', title: 'Post 2' })

      // Create different relationship types
      await (doInstance as any).relate({
        type: 'likes',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/posts/post-1',
      })
      await (doInstance as any).relate({
        type: 'bookmarks',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/posts/post-2',
      })

      // Find all related (no type filter)
      const allRelated = await (doInstance as any).related(
        'https://example.com/users/user-1'
      )

      expect(allRelated.length).toBe(2)
    })

    it('should be in allowedMethods set', () => {
      expect(doInstance.allowedMethods.has('related')).toBe(true)
    })
  })

  describe('relationships() - List Edges', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    it('should list all outgoing relationships from a thing', async () => {
      // Create relationships
      await (doInstance as any).relate({
        type: 'follows',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/users/user-2',
      })
      await (doInstance as any).relate({
        type: 'follows',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/users/user-3',
      })

      const rels = await (doInstance as any).relationships(
        'https://example.com/users/user-1'
      )

      expect(Array.isArray(rels)).toBe(true)
      expect(rels.length).toBe(2)
      expect(rels[0].type).toBe('follows')
    })

    it('should list relationships filtered by type', async () => {
      await (doInstance as any).relate({
        type: 'follows',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/users/user-2',
      })
      await (doInstance as any).relate({
        type: 'blocks',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/users/user-3',
      })

      const followRels = await (doInstance as any).relationships(
        'https://example.com/users/user-1',
        'follows'
      )

      expect(followRels.length).toBe(1)
      expect(followRels[0].type).toBe('follows')
    })

    it('should list incoming relationships when direction is "to"', async () => {
      await (doInstance as any).relate({
        type: 'follows',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/users/user-2',
      })
      await (doInstance as any).relate({
        type: 'follows',
        from: 'https://example.com/users/user-3',
        to: 'https://example.com/users/user-2',
      })

      const incomingRels = await (doInstance as any).relationships(
        'https://example.com/users/user-2',
        undefined,
        'to'
      )

      expect(incomingRels.length).toBe(2)
    })

    it('should list all relationships in both directions', async () => {
      await (doInstance as any).relate({
        type: 'friends',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/users/user-2',
      })
      await (doInstance as any).relate({
        type: 'friends',
        from: 'https://example.com/users/user-3',
        to: 'https://example.com/users/user-1',
      })

      const allRels = await (doInstance as any).relationships(
        'https://example.com/users/user-1',
        undefined,
        'both'
      )

      expect(allRels.length).toBe(2)
    })

    it('should return relationship objects with all required fields', async () => {
      await (doInstance as any).relate({
        type: 'follows',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/users/user-2',
        data: { since: '2024-01-01' },
      })

      const rels = await (doInstance as any).relationships(
        'https://example.com/users/user-1'
      )

      expect(rels.length).toBe(1)
      const rel = rels[0]
      expect(rel.id).toBeDefined()
      expect(rel.type).toBe('follows')
      expect(rel.from).toBe('https://example.com/users/user-1')
      expect(rel.to).toBe('https://example.com/users/user-2')
      expect(rel.createdAt).toBeDefined()
      expect(rel.data).toBeDefined()
    })

    it('should return empty array when no relationships exist', async () => {
      const rels = await (doInstance as any).relationships(
        'https://example.com/users/nonexistent'
      )

      expect(Array.isArray(rels)).toBe(true)
      expect(rels.length).toBe(0)
    })

    it('should be in allowedMethods set', () => {
      expect(doInstance.allowedMethods.has('relationships')).toBe(true)
    })
  })

  describe('references() - Find Backlinks', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    it('should find things that reference a given thing', async () => {
      // Create things
      await doInstance.create('users', { id: 'user-1', name: 'Alice' })
      await doInstance.create('users', { id: 'user-2', name: 'Bob' })
      await doInstance.create('users', { id: 'user-3', name: 'Charlie' })

      // Create relationships pointing TO user-1
      await (doInstance as any).relate({
        type: 'follows',
        from: 'https://example.com/users/user-2',
        to: 'https://example.com/users/user-1',
      })
      await (doInstance as any).relate({
        type: 'follows',
        from: 'https://example.com/users/user-3',
        to: 'https://example.com/users/user-1',
      })

      // Find who references (follows) user-1
      const followers = await (doInstance as any).references(
        'https://example.com/users/user-1',
        'follows'
      )

      expect(Array.isArray(followers)).toBe(true)
      expect(followers.length).toBe(2)
    })

    it('should find all references when type is not specified', async () => {
      await doInstance.create('posts', { id: 'post-1', title: 'Post 1' })
      await doInstance.create('users', { id: 'user-1', name: 'Alice' })
      await doInstance.create('users', { id: 'user-2', name: 'Bob' })

      // Different relationship types pointing to same post
      await (doInstance as any).relate({
        type: 'likes',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/posts/post-1',
      })
      await (doInstance as any).relate({
        type: 'bookmarks',
        from: 'https://example.com/users/user-2',
        to: 'https://example.com/posts/post-1',
      })

      // Find all references to the post
      const referencers = await (doInstance as any).references(
        'https://example.com/posts/post-1'
      )

      expect(referencers.length).toBe(2)
    })

    it('should return empty array when no references exist', async () => {
      const refs = await (doInstance as any).references(
        'https://example.com/users/nonexistent'
      )

      expect(Array.isArray(refs)).toBe(true)
      expect(refs.length).toBe(0)
    })

    it('should filter references by relationship type', async () => {
      await doInstance.create('posts', { id: 'post-1', title: 'Post 1' })
      await doInstance.create('users', { id: 'user-1', name: 'Alice' })
      await doInstance.create('users', { id: 'user-2', name: 'Bob' })

      await (doInstance as any).relate({
        type: 'likes',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/posts/post-1',
      })
      await (doInstance as any).relate({
        type: 'bookmarks',
        from: 'https://example.com/users/user-2',
        to: 'https://example.com/posts/post-1',
      })

      // Find only 'likes' references
      const likers = await (doInstance as any).references(
        'https://example.com/posts/post-1',
        'likes'
      )

      expect(likers.length).toBe(1)
    })

    it('should return Thing objects, not just references', async () => {
      await doInstance.create('users', {
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
      })
      await doInstance.create('posts', { id: 'post-1', title: 'Post 1' })

      await (doInstance as any).relate({
        type: 'authored',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/posts/post-1',
      })

      // References should return the actual Thing objects
      const authors = await (doInstance as any).references(
        'https://example.com/posts/post-1',
        'authored'
      )

      expect(authors.length).toBe(1)
      // Should contain thing properties
      expect(authors[0]).toBeDefined()
    })

    it('should be in allowedMethods set', () => {
      expect(doInstance.allowedMethods.has('references')).toBe(true)
    })
  })

  describe('Graph Integrity', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    it('should not create duplicate relationships with same from/to/type', async () => {
      const options: RelateOptions = {
        type: 'follows',
        from: 'https://example.com/users/user-1',
        to: 'https://example.com/users/user-2',
      }

      // Create same relationship twice
      await (doInstance as any).relate(options)
      await (doInstance as any).relate(options)

      // Should only have one relationship
      const rels = await (doInstance as any).relationships(
        'https://example.com/users/user-1',
        'follows'
      )

      // This tests idempotency - creating the same relationship twice
      // should either be a no-op or update the existing one
      expect(rels.length).toBe(1)
    })

    it('should handle self-referential relationships', async () => {
      const options: RelateOptions = {
        type: 'mentions',
        from: 'https://example.com/posts/post-1',
        to: 'https://example.com/posts/post-1',
      }

      const rel = await (doInstance as any).relate(options)

      expect(rel).toBeDefined()
      expect(rel.from).toBe(rel.to)
    })
  })

  describe('RPC Integration', () => {
    let doInstance: DO

    beforeEach(() => {
      doInstance = new DO(createMockCtx() as any, mockEnv)
    })

    it('should invoke relate via RPC', async () => {
      const result = await doInstance.invoke('relate', [
        {
          type: 'follows',
          from: 'https://example.com/users/user-1',
          to: 'https://example.com/users/user-2',
        },
      ])

      expect(result).toBeDefined()
      expect((result as Relationship).type).toBe('follows')
    })

    it('should invoke unrelate via RPC', async () => {
      // First create a relationship
      await doInstance.invoke('relate', [
        {
          type: 'follows',
          from: 'https://example.com/users/user-1',
          to: 'https://example.com/users/user-2',
        },
      ])

      // Then remove it via RPC
      const result = await doInstance.invoke('unrelate', [
        'https://example.com/users/user-1',
        'follows',
        'https://example.com/users/user-2',
      ])

      expect(result).toBe(true)
    })

    it('should invoke related via RPC', async () => {
      const result = await doInstance.invoke('related', [
        'https://example.com/users/user-1',
        'follows',
      ])

      expect(Array.isArray(result)).toBe(true)
    })

    it('should invoke relationships via RPC', async () => {
      const result = await doInstance.invoke('relationships', [
        'https://example.com/users/user-1',
      ])

      expect(Array.isArray(result)).toBe(true)
    })

    it('should invoke references via RPC', async () => {
      const result = await doInstance.invoke('references', [
        'https://example.com/users/user-1',
      ])

      expect(Array.isArray(result)).toBe(true)
    })
  })
})
