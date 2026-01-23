/**
 * CDC Event Generation Tests - Epic 3: CDC Streaming
 *
 * RED PHASE: These tests define the expected behavior for CDC event generation.
 * Tests should FAIL until the implementation is complete.
 *
 * Coverage:
 * - INSERT event generation
 * - UPDATE event generation
 * - DELETE event generation
 * - Event sequencing
 * - changedFields tracking
 * - before/after snapshots
 *
 * @module cdc/__tests__/events.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
  CDCEventEmitter,
  computeChangedFields,
  generateEventId,
  createEvent,
} from './events'

import type { CDCEvent, CDCOperation, CDCCursor } from '../../types/storage'

describe('CDCEventEmitter', () => {
  let emitter: CDCEventEmitter

  beforeEach(() => {
    emitter = new CDCEventEmitter({
      source: 'https://test.do/users',
      collection: 'users',
    })
  })

  describe('INSERT event generation', () => {
    it('should generate INSERT event with correct structure', async () => {
      const document = {
        id: 'user-123',
        name: 'Alice',
        email: 'alice@example.com',
        createdAt: Date.now(),
      }

      const event = await emitter.emit('INSERT', { after: document })

      expect(event).toMatchObject({
        id: expect.any(String),
        operation: 'INSERT',
        collection: 'users',
        documentId: 'user-123',
        timestamp: expect.any(Number),
        sequence: expect.any(Number),
        after: document,
      })
    })

    it('should not include before snapshot for INSERT', async () => {
      const document = { id: 'user-456', name: 'Bob' }

      const event = await emitter.emit('INSERT', { after: document })

      expect(event.before).toBeUndefined()
      expect(event.after).toEqual(document)
    })

    it('should generate unique event IDs', async () => {
      const events = await Promise.all([
        emitter.emit('INSERT', { after: { id: '1', name: 'A' } }),
        emitter.emit('INSERT', { after: { id: '2', name: 'B' } }),
        emitter.emit('INSERT', { after: { id: '3', name: 'C' } }),
      ])

      const ids = events.map((e) => e.id)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(3)
    })

    it('should include correlation ID when provided', async () => {
      const correlationId = 'req-abc-123'
      const event = await emitter.emit('INSERT', {
        after: { id: 'user-789', name: 'Charlie' },
        correlationId,
      })

      expect(event.correlationId).toBe(correlationId)
    })

    it('should set source DO URL', async () => {
      const event = await emitter.emit('INSERT', { after: { id: 'doc-1', title: 'Test' } })

      expect(event.source).toBe('https://test.do/users')
    })

    it('should not have changedFields for INSERT', async () => {
      const event = await emitter.emit('INSERT', { after: { id: 'doc-2', data: 'test' } })

      expect(event.changedFields).toBeUndefined()
    })

    it('should handle nested document structures', async () => {
      const document = {
        id: 'order-1',
        customer: {
          id: 'cust-1',
          name: 'Alice',
          address: {
            street: '123 Main St',
            city: 'Springfield',
          },
        },
        items: [
          { sku: 'ITEM-A', qty: 2 },
          { sku: 'ITEM-B', qty: 1 },
        ],
      }

      const event = await emitter.emit('INSERT', { after: document })

      expect(event.after).toEqual(document)
      expect((event.after as typeof document)?.customer.address.city).toBe('Springfield')
    })
  })

  describe('UPDATE event generation', () => {
    it('should generate UPDATE event with before and after snapshots', async () => {
      const before = {
        id: 'user-123',
        name: 'Alice',
        email: 'alice@example.com',
        status: 'active',
      }

      const after = {
        id: 'user-123',
        name: 'Alice Smith',
        email: 'alice@example.com',
        status: 'active',
      }

      const event = await emitter.emit('UPDATE', { before, after })

      expect(event.operation).toBe('UPDATE')
      expect(event.before).toEqual(before)
      expect(event.after).toEqual(after)
    })

    it('should track changedFields correctly', async () => {
      const before = {
        id: 'user-123',
        name: 'Alice',
        email: 'alice@example.com',
        age: 30,
      }

      const after = {
        id: 'user-123',
        name: 'Alice Smith',
        email: 'alice.smith@example.com',
        age: 30,
      }

      const event = await emitter.emit('UPDATE', { before, after })

      expect(event.changedFields).toContain('name')
      expect(event.changedFields).toContain('email')
      expect(event.changedFields).not.toContain('id')
      expect(event.changedFields).not.toContain('age')
    })

    it('should detect nested field changes', async () => {
      const before = {
        id: 'order-1',
        customer: { name: 'Alice', tier: 'standard' },
        total: 100,
      }

      const after = {
        id: 'order-1',
        customer: { name: 'Alice', tier: 'premium' },
        total: 100,
      }

      const event = await emitter.emit('UPDATE', { before, after })

      expect(event.changedFields).toContain('customer.tier')
    })

    it('should detect array field changes', async () => {
      const before = {
        id: 'list-1',
        items: ['a', 'b', 'c'],
      }

      const after = {
        id: 'list-1',
        items: ['a', 'b', 'c', 'd'],
      }

      const event = await emitter.emit('UPDATE', { before, after })

      expect(event.changedFields).toContain('items')
    })

    it('should detect field addition', async () => {
      const before = {
        id: 'user-1',
        name: 'Alice',
      }

      const after = {
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
      }

      const event = await emitter.emit('UPDATE', { before, after })

      expect(event.changedFields).toContain('email')
    })

    it('should detect field removal', async () => {
      const before = {
        id: 'user-1',
        name: 'Alice',
        temporaryToken: 'abc123',
      }

      const after = {
        id: 'user-1',
        name: 'Alice',
      }

      const event = await emitter.emit('UPDATE', { before, after })

      expect(event.changedFields).toContain('temporaryToken')
    })

    it('should preserve document ID consistency', async () => {
      const before = { id: 'doc-abc', data: 'old' }
      const after = { id: 'doc-abc', data: 'new' }

      const event = await emitter.emit('UPDATE', { before, after })

      expect(event.documentId).toBe('doc-abc')
      expect((event.before as typeof before)?.id).toBe((event.after as typeof after)?.id)
    })
  })

  describe('DELETE event generation', () => {
    it('should generate DELETE event with before snapshot', async () => {
      const document = {
        id: 'user-123',
        name: 'Alice',
        email: 'alice@example.com',
      }

      const event = await emitter.emit('DELETE', { before: document })

      expect(event.operation).toBe('DELETE')
      expect(event.before).toEqual(document)
      expect(event.after).toBeUndefined()
    })

    it('should not include after snapshot for DELETE', async () => {
      const document = { id: 'doc-1', data: 'to be deleted' }

      const event = await emitter.emit('DELETE', { before: document })

      expect(event.after).toBeUndefined()
    })

    it('should not include changedFields for DELETE', async () => {
      const document = { id: 'doc-2', field: 'value' }

      const event = await emitter.emit('DELETE', { before: document })

      expect(event.changedFields).toBeUndefined()
    })

    it('should preserve full document state in before', async () => {
      const document = {
        id: 'complex-doc',
        nested: { deep: { value: 42 } },
        array: [1, 2, 3],
        metadata: { tags: ['important', 'archive'] },
      }

      const event = await emitter.emit('DELETE', { before: document })

      expect(event.before).toEqual(document)
    })

    it('should set correct documentId', async () => {
      const document = { id: 'specific-id-123', name: 'Test' }

      const event = await emitter.emit('DELETE', { before: document })

      expect(event.documentId).toBe('specific-id-123')
    })
  })

  describe('Event sequencing', () => {
    it('should generate monotonically increasing sequence numbers', async () => {
      const events: CDCEvent[] = []

      for (let i = 0; i < 10; i++) {
        const event = await emitter.emit('INSERT', { after: { id: `doc-${i}`, index: i } })
        events.push(event)
      }

      for (let i = 1; i < events.length; i++) {
        expect(events[i].sequence).toBeGreaterThan(events[i - 1].sequence)
      }
    })

    it('should maintain sequence across different operations', async () => {
      const insertEvent = await emitter.emit('INSERT', { after: { id: 'doc-1', name: 'Test' } })
      const updateEvent = await emitter.emit('UPDATE', {
        before: { id: 'doc-1', name: 'Test' },
        after: { id: 'doc-1', name: 'Updated' },
      })
      const deleteEvent = await emitter.emit('DELETE', { before: { id: 'doc-1', name: 'Updated' } })

      expect(updateEvent.sequence).toBeGreaterThan(insertEvent.sequence)
      expect(deleteEvent.sequence).toBeGreaterThan(updateEvent.sequence)
    })

    it('should handle concurrent event generation', async () => {
      const promises = Array.from({ length: 100 }, (_, i) =>
        emitter.emit('INSERT', { after: { id: `concurrent-${i}`, index: i } })
      )

      const events = await Promise.all(promises)
      const sequences = events.map((e) => e.sequence)
      const uniqueSequences = new Set(sequences)

      // All sequences should be unique
      expect(uniqueSequences.size).toBe(100)
    })

    it('should generate timestamps in correct order', async () => {
      const event1 = await emitter.emit('INSERT', { after: { id: 'doc-1' } })
      await new Promise((resolve) => setTimeout(resolve, 10))
      const event2 = await emitter.emit('INSERT', { after: { id: 'doc-2' } })

      expect(event2.timestamp).toBeGreaterThanOrEqual(event1.timestamp)
    })

    it('should support sequence reset for new sessions', () => {
      const emitter2 = new CDCEventEmitter({
        source: 'https://test.do/a',
        collection: 'test',
        startSequence: 1000,
      })

      expect(emitter2.getSequence()).toBe(1000)
    })

    it('should track sequence in cursor format', async () => {
      const event = await emitter.emit('INSERT', { after: { id: 'doc-cursor' } })

      const cursor: CDCCursor = emitter.getCursor()

      expect(cursor.sequence).toBe(event.sequence)
      expect(cursor.timestamp).toBe(event.timestamp)
    })
  })

  describe('batching', () => {
    it('should buffer events until batchSize reached', async () => {
      const batchEmitter = new CDCEventEmitter({
        source: 'https://test.do',
        collection: 'test',
        batchSize: 5,
      })

      const batches: CDCEvent[][] = []
      batchEmitter.onBatch((events) => batches.push(events))

      for (let i = 0; i < 4; i++) {
        await batchEmitter.emit('INSERT', { after: { id: `doc-${i}` } })
      }

      expect(batches).toHaveLength(0)

      await batchEmitter.emit('INSERT', { after: { id: 'doc-4' } })

      expect(batches).toHaveLength(1)
      expect(batches[0]).toHaveLength(5)
    })

    it('should flush after batchTimeout', async () => {
      vi.useFakeTimers()

      const batchEmitter = new CDCEventEmitter({
        source: 'https://test.do',
        collection: 'test',
        batchSize: 100,
        batchTimeout: 100,
      })

      const batches: CDCEvent[][] = []
      batchEmitter.onBatch((events) => batches.push(events))

      await batchEmitter.emit('INSERT', { after: { id: 'doc-1' } })

      expect(batches).toHaveLength(0)

      await vi.advanceTimersByTimeAsync(150)

      expect(batches).toHaveLength(1)

      vi.useRealTimers()
    })
  })
})

describe('computeChangedFields', () => {
  it('should return empty array for identical objects', () => {
    const obj = { id: 'doc-1', name: 'Same', value: 100 }

    const changed = computeChangedFields(obj, { ...obj })

    expect(changed).toEqual([])
  })

  it('should detect primitive field changes', () => {
    const before = {
      id: 'doc-1',
      string: 'hello',
      number: 42,
      boolean: true,
    }

    const after = {
      id: 'doc-1',
      string: 'world',
      number: 43,
      boolean: false,
    }

    const changed = computeChangedFields(before, after)

    expect(changed).toContain('string')
    expect(changed).toContain('number')
    expect(changed).toContain('boolean')
  })

  it('should detect added fields', () => {
    const before = { id: 'doc-1', name: 'Test' }
    const after = { id: 'doc-1', name: 'Test', email: 'test@example.com' }

    const changed = computeChangedFields(before, after)

    expect(changed).toContain('email')
  })

  it('should detect removed fields', () => {
    const before = { id: 'doc-1', name: 'Test', token: 'abc123' }
    const after = { id: 'doc-1', name: 'Test' }

    const changed = computeChangedFields(before, after)

    expect(changed).toContain('token')
  })

  it('should detect nested object changes', () => {
    const before = {
      id: 'doc-1',
      level1: { level2: { value: 'old' } },
    }

    const after = {
      id: 'doc-1',
      level1: { level2: { value: 'new' } },
    }

    const changed = computeChangedFields(before, after)

    expect(changed).toContain('level1.level2.value')
  })

  it('should detect array changes', () => {
    const before = { id: 'doc-1', items: [1, 2, 3] }
    const after = { id: 'doc-1', items: [1, 2, 3, 4] }

    const changed = computeChangedFields(before, after)

    expect(changed).toContain('items')
  })

  it('should handle null values', () => {
    const before = { id: 'doc-1', value: 'test' as string | null }
    const after = { id: 'doc-1', value: null as string | null }

    const changed = computeChangedFields(before, after)

    expect(changed).toContain('value')
  })

  it('should use dot notation for nested paths', () => {
    const before = { a: { b: { c: 1 } } }
    const after = { a: { b: { c: 2 } } }

    const changed = computeChangedFields(before, after)

    expect(changed).toContain('a.b.c')
  })
})

describe('generateEventId', () => {
  it('should generate valid UUID v4 format', () => {
    const id = generateEventId()

    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('should generate unique IDs', () => {
    const ids = Array.from({ length: 100 }, () => generateEventId())
    const uniqueIds = new Set(ids)

    expect(uniqueIds.size).toBe(100)
  })
})

describe('createEvent', () => {
  it('should create valid CDCEvent with all required fields', () => {
    const event = createEvent({
      operation: 'INSERT',
      collection: 'users',
      documentId: 'user-1',
      sequence: 1,
      after: { id: 'user-1', name: 'Alice' },
    })

    expect(event.id).toBeDefined()
    expect(event.operation).toBe('INSERT')
    expect(event.collection).toBe('users')
    expect(event.documentId).toBe('user-1')
    expect(event.sequence).toBe(1)
    expect(event.timestamp).toBeDefined()
    expect(event.after).toEqual({ id: 'user-1', name: 'Alice' })
  })

  it('should set timestamp to current time', () => {
    const before = Date.now()
    const event = createEvent({
      operation: 'INSERT',
      collection: 'test',
      documentId: 'doc-1',
      sequence: 1,
    })
    const after = Date.now()

    expect(event.timestamp).toBeGreaterThanOrEqual(before)
    expect(event.timestamp).toBeLessThanOrEqual(after)
  })

  it('should include optional fields when provided', () => {
    const event = createEvent({
      operation: 'UPDATE',
      collection: 'test',
      documentId: 'doc-1',
      sequence: 1,
      before: { id: 'doc-1', value: 'old' },
      after: { id: 'doc-1', value: 'new' },
      changedFields: ['value'],
      source: 'https://test.do',
      correlationId: 'req-123',
    })

    expect(event.before).toEqual({ id: 'doc-1', value: 'old' })
    expect(event.after).toEqual({ id: 'doc-1', value: 'new' })
    expect(event.changedFields).toEqual(['value'])
    expect(event.source).toBe('https://test.do')
    expect(event.correlationId).toBe('req-123')
  })
})
