/**
 * @dotdo/do - Test Helper Utility Tests (RED Phase)
 *
 * These tests define the expected behavior of test helper utilities.
 * The utilities don't exist yet - tests should FAIL.
 *
 * Test helpers provide convenient functions for:
 * - Creating named DO stubs
 * - Generating unique test names
 * - Providing scoped DO access
 * - Seeding test data
 * - Asserting DO state
 */

import { env, runInDurableObject } from 'cloudflare:test'
import { describe, it, expect, beforeEach } from 'vitest'

// Import from non-existent module - this will cause tests to fail (RED phase)
import {
  createTestStub,
  uniqueTestName,
  withTestDO,
  seedTestData,
  assertDOState,
} from './do-test-utils'

describe('Test Helper Utilities', () => {
  describe('createTestStub()', () => {
    it('should create a named DO stub', async () => {
      const stub = createTestStub('test-instance-1')

      expect(stub).toBeDefined()
      expect(typeof stub.create).toBe('function')
      expect(typeof stub.get).toBe('function')
      expect(typeof stub.list).toBe('function')
      expect(typeof stub.update).toBe('function')
      expect(typeof stub.delete).toBe('function')
    })

    it('should create unique stubs for different names', async () => {
      const stub1 = createTestStub('instance-a')
      const stub2 = createTestStub('instance-b')

      // Create data in stub1
      await stub1.create('users', { id: 'user-1', name: 'Test User' })

      // stub2 should not have the data
      const result = await stub2.get('users', 'user-1')
      expect(result).toBeNull()
    })

    it('should return same stub for same name', () => {
      const stub1 = createTestStub('same-name')
      const stub2 = createTestStub('same-name')

      // Should return equivalent stubs (same underlying DO instance)
      expect(stub1).toBeDefined()
      expect(stub2).toBeDefined()
    })

    it('should support optional config parameter', () => {
      const stub = createTestStub('config-test', { isolate: true })

      expect(stub).toBeDefined()
    })
  })

  describe('uniqueTestName()', () => {
    it('should generate unique test names', () => {
      const name1 = uniqueTestName('test')
      const name2 = uniqueTestName('test')

      expect(name1).not.toBe(name2)
      expect(name1).toContain('test')
      expect(name2).toContain('test')
    })

    it('should include prefix in generated name', () => {
      const name = uniqueTestName('my-prefix')

      expect(name.startsWith('my-prefix')).toBe(true)
    })

    it('should generate names with timestamp or counter', () => {
      const name = uniqueTestName('timestamped')

      // Should have some form of unique suffix
      expect(name.length).toBeGreaterThan('timestamped'.length)
    })

    it('should handle empty prefix', () => {
      const name = uniqueTestName('')

      expect(name).toBeDefined()
      expect(name.length).toBeGreaterThan(0)
    })

    it('should generate URL-safe names', () => {
      const name = uniqueTestName('test')

      // Should not contain special characters that could break URLs
      expect(name).toMatch(/^[a-zA-Z0-9_-]+$/)
    })
  })

  describe('withTestDO()', () => {
    it('should provide scoped DO access', async () => {
      let capturedStub: unknown

      await withTestDO('scoped-test', async (stub) => {
        capturedStub = stub
        expect(stub).toBeDefined()
        expect(typeof stub.create).toBe('function')
      })

      expect(capturedStub).toBeDefined()
    })

    it('should create documents within scope', async () => {
      await withTestDO('create-scope', async (stub) => {
        const created = await stub.create('items', { id: 'item-1', value: 'test' })

        expect(created).toBeDefined()
        expect(created.id).toBe('item-1')
      })
    })

    it('should isolate data between scopes', async () => {
      await withTestDO('scope-a', async (stub) => {
        await stub.create('data', { id: 'doc-1', content: 'scope-a data' })
      })

      await withTestDO('scope-b', async (stub) => {
        const result = await stub.get('data', 'doc-1')
        expect(result).toBeNull()
      })
    })

    it('should support async operations', async () => {
      const result = await withTestDO('async-test', async (stub) => {
        await stub.create('async', { id: 'a1', value: 1 })
        await stub.create('async', { id: 'a2', value: 2 })

        const list = await stub.list('async')
        return list.length
      })

      expect(result).toBe(2)
    })

    it('should cleanup after scope ends (optional cleanup parameter)', async () => {
      await withTestDO('cleanup-test', async (stub) => {
        await stub.create('temp', { id: 't1', data: 'temporary' })
      }, { cleanup: true })

      // Verify cleanup happened by checking the state
      await withTestDO('cleanup-test', async (stub) => {
        const result = await stub.get('temp', 't1')
        expect(result).toBeNull()
      })
    })
  })

  describe('seedTestData()', () => {
    it('should insert test documents', async () => {
      const stub = createTestStub('seed-docs-test')

      await seedTestData(stub, {
        documents: [
          { collection: 'users', id: 'user-1', data: { name: 'Alice' } },
          { collection: 'users', id: 'user-2', data: { name: 'Bob' } },
        ],
      })

      const user1 = await stub.get('users', 'user-1')
      const user2 = await stub.get('users', 'user-2')

      expect(user1).toBeDefined()
      expect(user1?.name).toBe('Alice')
      expect(user2).toBeDefined()
      expect(user2?.name).toBe('Bob')
    })

    it('should insert test things', async () => {
      const stub = createTestStub('seed-things-test')

      await seedTestData(stub, {
        things: [
          { ns: 'test', type: 'item', id: 'item-1', data: { value: 100 } },
          { ns: 'test', type: 'item', id: 'item-2', data: { value: 200 } },
        ],
      })

      // Verify things were created using the Thing API
      const thing1 = await stub.getThingById('test', 'item', 'item-1')
      const thing2 = await stub.getThingById('test', 'item', 'item-2')

      expect(thing1).toBeDefined()
      expect(thing1?.data.value).toBe(100)
      expect(thing2).toBeDefined()
      expect(thing2?.data.value).toBe(200)
    })

    it('should handle mixed documents and things', async () => {
      const stub = createTestStub('seed-mixed-test')

      await seedTestData(stub, {
        documents: [
          { collection: 'settings', id: 'config', data: { theme: 'dark' } },
        ],
        things: [
          { ns: 'app', type: 'widget', id: 'w1', data: { size: 'large' } },
        ],
      })

      const doc = await stub.get('settings', 'config')
      const thing = await stub.getThingById('app', 'widget', 'w1')

      expect(doc?.theme).toBe('dark')
      expect(thing?.data.size).toBe('large')
    })

    it('should return seeded data summary', async () => {
      const stub = createTestStub('seed-summary-test')

      const result = await seedTestData(stub, {
        documents: [
          { collection: 'logs', id: 'log-1', data: { message: 'test' } },
        ],
        things: [
          { ns: 'ns1', type: 't1', id: 'id1', data: {} },
          { ns: 'ns1', type: 't1', id: 'id2', data: {} },
        ],
      })

      expect(result.documentCount).toBe(1)
      expect(result.thingCount).toBe(2)
    })

    it('should support batch insertion for performance', async () => {
      const stub = createTestStub('seed-batch-test')

      const documents = Array.from({ length: 100 }, (_, i) => ({
        collection: 'batch',
        id: `item-${i}`,
        data: { index: i },
      }))

      const startTime = Date.now()
      await seedTestData(stub, { documents })
      const duration = Date.now() - startTime

      // Should complete in reasonable time (batch insert)
      expect(duration).toBeLessThan(5000)

      const list = await stub.list('batch', { limit: 200 })
      expect(list.length).toBe(100)
    })
  })

  describe('assertDOState()', () => {
    it('should verify document exists', async () => {
      const stub = createTestStub('assert-exists-test')
      await stub.create('users', { id: 'user-1', name: 'Test' })

      // Should not throw
      await assertDOState(stub, {
        documents: [
          { collection: 'users', id: 'user-1', exists: true },
        ],
      })
    })

    it('should verify document does not exist', async () => {
      const stub = createTestStub('assert-not-exists-test')

      // Should not throw
      await assertDOState(stub, {
        documents: [
          { collection: 'users', id: 'nonexistent', exists: false },
        ],
      })
    })

    it('should verify document content', async () => {
      const stub = createTestStub('assert-content-test')
      await stub.create('posts', { id: 'post-1', title: 'Hello', views: 42 })

      // Should not throw
      await assertDOState(stub, {
        documents: [
          {
            collection: 'posts',
            id: 'post-1',
            exists: true,
            data: { title: 'Hello', views: 42 },
          },
        ],
      })
    })

    it('should fail when document state does not match', async () => {
      const stub = createTestStub('assert-fail-test')
      await stub.create('items', { id: 'item-1', value: 'actual' })

      // Should throw because content doesn't match
      await expect(
        assertDOState(stub, {
          documents: [
            {
              collection: 'items',
              id: 'item-1',
              exists: true,
              data: { value: 'expected' },
            },
          ],
        })
      ).rejects.toThrow()
    })

    it('should verify thing state', async () => {
      const stub = createTestStub('assert-thing-test')
      await stub.createThing({ ns: 'test', type: 'entity', id: 'e1', data: { status: 'active' } })

      // Should not throw
      await assertDOState(stub, {
        things: [
          {
            ns: 'test',
            type: 'entity',
            id: 'e1',
            exists: true,
            data: { status: 'active' },
          },
        ],
      })
    })

    it('should verify collection count', async () => {
      const stub = createTestStub('assert-count-test')
      await stub.create('counters', { id: 'c1', value: 1 })
      await stub.create('counters', { id: 'c2', value: 2 })
      await stub.create('counters', { id: 'c3', value: 3 })

      // Should not throw
      await assertDOState(stub, {
        collections: [
          { name: 'counters', count: 3 },
        ],
      })
    })

    it('should support partial data matching', async () => {
      const stub = createTestStub('assert-partial-test')
      await stub.create('full', {
        id: 'doc-1',
        field1: 'value1',
        field2: 'value2',
        field3: 'value3',
      })

      // Should not throw - only checking subset of fields
      await assertDOState(stub, {
        documents: [
          {
            collection: 'full',
            id: 'doc-1',
            exists: true,
            data: { field1: 'value1' }, // partial match
            matchPartial: true,
          },
        ],
      })
    })
  })
})
