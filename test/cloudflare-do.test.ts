/**
 * Cloudflare Durable Objects Tests
 *
 * These tests use the proper @cloudflare/vitest-pool-workers integration
 * to test the DO class with real Miniflare-powered SQLite storage.
 */

import { env, runInDurableObject } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'

describe('DO Durable Object with Cloudflare Test Pool', () => {
  describe('Basic CRUD Operations', () => {
    it('should create and retrieve a document', async () => {
      const id = env.DO.idFromName('test-crud')
      const stub = env.DO.get(id)

      // Create a document via RPC
      const created = await stub.create('users', { id: 'user-1', name: 'Test User' })
      expect(created).toBeDefined()
      expect(created.id).toBe('user-1')

      // Retrieve it
      const retrieved = await stub.get('users', 'user-1')
      expect(retrieved).toBeDefined()
      expect(retrieved?.name).toBe('Test User')
    })

    it('should list documents in a collection', async () => {
      const id = env.DO.idFromName('test-list')
      const stub = env.DO.get(id)

      await stub.create('items', { id: 'item-1', value: 'one' })
      await stub.create('items', { id: 'item-2', value: 'two' })

      const list = await stub.list('items')
      expect(list).toHaveLength(2)
    })

    it('should update a document', async () => {
      const id = env.DO.idFromName('test-update')
      const stub = env.DO.get(id)

      await stub.create('docs', { id: 'doc-1', title: 'Original' })
      const updated = await stub.update('docs', 'doc-1', { title: 'Updated' })

      expect(updated?.title).toBe('Updated')
    })

    it('should delete a document', async () => {
      const id = env.DO.idFromName('test-delete')
      const stub = env.DO.get(id)

      await stub.create('temp', { id: 'temp-1', data: 'temporary' })
      const deleted = await stub.delete('temp', 'temp-1')

      expect(deleted).toBe(true)

      const retrieved = await stub.get('temp', 'temp-1')
      expect(retrieved).toBeNull()
    })
  })

  describe('SQLite Storage Access', () => {
    it('should access SQLite storage directly via runInDurableObject', async () => {
      const id = env.DO.idFromName('test-sql')
      const stub = env.DO.get(id)

      // Create a document first
      await stub.create('sqltest', { id: 'sql-1', data: 'test' })

      // Access storage directly
      await runInDurableObject(stub, async (instance, state) => {
        const result = state.storage.sql
          .exec('SELECT * FROM documents WHERE collection = ?', 'sqltest')
          .toArray()

        expect(result.length).toBeGreaterThan(0)
      })
    })
  })
})
