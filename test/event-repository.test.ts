/**
 * @dotdo/do - EventRepository Tests
 *
 * Tests for extracting event storage operations into a dedicated repository class.
 * This follows the Repository Pattern to:
 * - Separate data access logic from domain logic
 * - Make storage operations testable in isolation
 * - Enable different storage backends (SQLite, KV, R2, etc.)
 *
 * Events are IMMUTABLE - they can only be created and queried, never updated or deleted.
 * This is fundamental to event sourcing architecture.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Event, CreateEventOptions, EventQueryOptions } from '../src/types'
import { EventRepository } from '../src/repositories/event-repository'

/**
 * Mock SQL storage interface for testing
 */
interface MockSqlStorage {
  exec(query: string, ...params: unknown[]): { toArray(): unknown[] }
}

/**
 * Create mock SQL storage for testing events
 */
function createMockSqlStorage(): MockSqlStorage {
  const events: Map<string, Record<string, unknown>> = new Map()

  return {
    exec(query: string, ...params: unknown[]) {
      const results: unknown[] = []
      const normalizedQuery = query.trim().toUpperCase()

      if (normalizedQuery.startsWith('CREATE TABLE')) {
        // Schema initialization - no-op for mock
      } else if (normalizedQuery.startsWith('INSERT INTO EVENTS')) {
        const [id, type, timestamp, source, data, correlationId, causationId] = params as [
          string, string, string, string, string, string | null, string | null
        ]

        events.set(id, {
          id,
          type,
          timestamp,
          source,
          data,
          correlation_id: correlationId,
          causation_id: causationId,
        })
      } else if (normalizedQuery.startsWith('SELECT') && query.toLowerCase().includes('from events')) {
        if (query.toLowerCase().includes('count(*)')) {
          // Count query
          let filteredEvents = Array.from(events.values())

          // Apply type filter
          const typeMatch = query.match(/type = \?/i)
          if (typeMatch && params.length > 0) {
            const typeParam = params[0] as string
            filteredEvents = filteredEvents.filter(e => e.type === typeParam)
          }

          results.push({ count: filteredEvents.length })
        } else if (query.toLowerCase().includes('where id = ?')) {
          const [id] = params as [string]
          const event = events.get(id)
          if (event) results.push(event)
        } else if (query.toLowerCase().includes('where causation_id = ?')) {
          const [causationId] = params as [string]
          const filtered = Array.from(events.values()).filter(
            e => e.causation_id === causationId
          )
          filtered.sort((a, b) =>
            (a.timestamp as string).localeCompare(b.timestamp as string)
          )
          results.push(...filtered)
        } else if (query.toLowerCase().includes('where type like ?')) {
          const [prefix] = params as [string]
          const prefixWithoutWildcard = prefix.replace('%', '')
          const filtered = Array.from(events.values()).filter(
            e => (e.type as string).startsWith(prefixWithoutWildcard)
          )
          filtered.sort((a, b) =>
            (a.timestamp as string).localeCompare(b.timestamp as string)
          )
          results.push(...filtered)
        } else {
          // Query with filters
          let filteredEvents = Array.from(events.values())

          // Parse WHERE conditions
          const lowerQuery = query.toLowerCase()
          let paramIndex = 0

          if (lowerQuery.includes('type = ?')) {
            const typeParam = params[paramIndex++] as string
            filteredEvents = filteredEvents.filter(e => e.type === typeParam)
          }

          if (lowerQuery.includes('source = ?')) {
            const sourceParam = params[paramIndex++] as string
            filteredEvents = filteredEvents.filter(e => e.source === sourceParam)
          }

          if (lowerQuery.includes('correlation_id = ?')) {
            const corrParam = params[paramIndex++] as string
            filteredEvents = filteredEvents.filter(e => e.correlation_id === corrParam)
          }

          if (lowerQuery.includes('timestamp > ?')) {
            const afterParam = params[paramIndex++] as string
            filteredEvents = filteredEvents.filter(e =>
              (e.timestamp as string) > afterParam
            )
          }

          if (lowerQuery.includes('timestamp < ?')) {
            const beforeParam = params[paramIndex++] as string
            filteredEvents = filteredEvents.filter(e =>
              (e.timestamp as string) < beforeParam
            )
          }

          // Sort by timestamp
          filteredEvents.sort((a, b) =>
            (a.timestamp as string).localeCompare(b.timestamp as string)
          )

          // Apply LIMIT
          const limitMatch = query.match(/LIMIT\s+(\d+)/i)
          if (limitMatch) {
            const limit = parseInt(limitMatch[1], 10)
            const offsetMatch = query.match(/OFFSET\s+(\d+)/i)
            const offset = offsetMatch ? parseInt(offsetMatch[1], 10) : 0
            filteredEvents = filteredEvents.slice(offset, offset + limit)
          }

          results.push(...filteredEvents)
        }
      }
      // NOTE: No UPDATE or DELETE for events - they are immutable

      return { toArray: () => results }
    }
  }
}

describe('EventRepository', () => {
  let repository: EventRepository
  let mockSql: MockSqlStorage

  beforeEach(() => {
    mockSql = createMockSqlStorage()
    repository = new EventRepository(mockSql)
  })

  describe('Repository Interface', () => {
    it('should be importable from repositories module', async () => {
      const { EventRepository } = await import('../src/repositories/event-repository')
      expect(EventRepository).toBeDefined()
    })

    it('should implement the EventRepository interface (no update/delete)', () => {
      expect(repository.track).toBeDefined()
      expect(repository.findById).toBeDefined()
      expect(repository.findAll).toBeDefined()
      expect((repository as any).update).toBeUndefined() // Events are immutable
      expect((repository as any).delete).toBeUndefined() // Events are immutable
    })

    it('should accept a SQL storage adapter in constructor', () => {
      const repo = new EventRepository(mockSql)
      expect(repo).toBeDefined()
    })
  })

  describe('track() - Create Immutable Event', () => {
    it('should create an event with all required fields', async () => {
      const options: CreateEventOptions<{ orderId: string; amount: number }> = {
        type: 'Order.created',
        source: 'checkout-service',
        data: { orderId: 'order-123', amount: 99.99 },
      }

      const event = await repository.track(options)
      expect(event.id).toBeDefined()
      expect(event.type).toBe('Order.created')
      expect(event.source).toBe('checkout-service')
      expect(event.data).toEqual({ orderId: 'order-123', amount: 99.99 })
      expect(event.timestamp).toBeInstanceOf(Date)
    })

    it('should generate unique IDs for each event', async () => {
      const event1 = await repository.track({ type: 'Test', source: 'test', data: {} })
      const event2 = await repository.track({ type: 'Test', source: 'test', data: {} })
      expect(event1.id).not.toBe(event2.id)
    })

    it('should set timestamp automatically', async () => {
      const before = new Date()
      const event = await repository.track({ type: 'Test', source: 'test', data: {} })
      const after = new Date()
      expect(event.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(event.timestamp.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    it('should support correlationId for tracing', async () => {
      const correlationId = 'correlation-abc-123'
      const event = await repository.track({
        type: 'User.action',
        source: 'user-service',
        data: { action: 'login' },
        correlationId,
      })
      expect(event.correlationId).toBe(correlationId)
    })

    it('should support causationId for event chains', async () => {
      const firstEvent = await repository.track({
        type: 'Order.created',
        source: 'order-service',
        data: { orderId: 'order-123' },
      })
      const secondEvent = await repository.track({
        type: 'Payment.initiated',
        source: 'payment-service',
        data: { orderId: 'order-123', amount: 100 },
        causationId: firstEvent.id,
      })
      expect(secondEvent.causationId).toBe(firstEvent.id)
    })

    it('should store data as JSON', async () => {
      const complexData = {
        nested: { value: true },
        array: [1, 2, 3],
        special: 'chars: "quotes" and \'apostrophes\''
      }
      const event = await repository.track({
        type: 'Complex.event',
        source: 'test',
        data: complexData,
      })
      expect(event.data).toEqual(complexData)
    })

    it('should handle empty data', async () => {
      const event = await repository.track({
        type: 'Empty.event',
        source: 'test',
        data: {},
      })
      expect(event.data).toEqual({})
    })
  })

  describe('findById() - Retrieve Event by ID', () => {
    it('should return event when found', async () => {
      const created = await repository.track({
        type: 'Customer.created',
        source: 'customer-service',
        data: { customerId: 'cust-123', name: 'John Doe' },
      })
      const found = await repository.findById(created.id)
      expect(found).toBeDefined()
      expect(found?.id).toBe(created.id)
      expect(found?.type).toBe('Customer.created')
    })

    it('should return null when event not found', async () => {
      const found = await repository.findById('non-existent-id')
      expect(found).toBeNull()
    })

    it('should parse JSON data from storage', async () => {
      const created = await repository.track({
        type: 'Complex.event',
        source: 'test',
        data: { nested: { value: true } },
      })
      const found = await repository.findById(created.id)
      expect(found?.data.nested.value).toBe(true)
    })

    it('should convert timestamp strings to Date objects', async () => {
      const created = await repository.track({ type: 'Test', source: 'test', data: {} })
      const found = await repository.findById(created.id)
      expect(found?.timestamp).toBeInstanceOf(Date)
    })

    it('should preserve all optional fields', async () => {
      const created = await repository.track({
        type: 'Complex.event',
        source: 'test',
        data: {},
        correlationId: 'corr-123',
        causationId: 'cause-456',
      })
      const found = await repository.findById(created.id)
      expect(found?.correlationId).toBe('corr-123')
      expect(found?.causationId).toBe('cause-456')
    })
  })

  describe('findAll() - Query Events', () => {
    it('should return all events when no options provided', async () => {
      await repository.track({ type: 'Event.one', source: 'test', data: { num: 1 } })
      await repository.track({ type: 'Event.two', source: 'test', data: { num: 2 } })
      const all = await repository.findAll()
      expect(all.length).toBeGreaterThanOrEqual(2)
    })

    it('should filter by event type', async () => {
      await repository.track({ type: 'Order.created', source: 'test', data: {} })
      await repository.track({ type: 'Order.completed', source: 'test', data: {} })
      await repository.track({ type: 'Payment.received', source: 'test', data: {} })
      const orderCreated = await repository.findAll({ type: 'Order.created' })
      expect(orderCreated.length).toBe(1)
      expect(orderCreated[0].type).toBe('Order.created')
    })

    it('should filter by source', async () => {
      await repository.track({ type: 'Event.a', source: 'service-a', data: {} })
      await repository.track({ type: 'Event.b', source: 'service-b', data: {} })
      const serviceA = await repository.findAll({ source: 'service-a' })
      expect(serviceA.length).toBe(1)
      expect(serviceA[0].source).toBe('service-a')
    })

    it('should filter by correlationId', async () => {
      const correlationId = 'workflow-123'
      await repository.track({ type: 'Step.one', source: 'test', data: {}, correlationId })
      await repository.track({ type: 'Step.two', source: 'test', data: {}, correlationId })
      await repository.track({ type: 'Step.other', source: 'test', data: {}, correlationId: 'different' })
      const correlated = await repository.findAll({ correlationId })
      expect(correlated.length).toBe(2)
      correlated.forEach(e => expect(e.correlationId).toBe(correlationId))
    })

    it('should filter by time range with after option', async () => {
      await repository.track({ type: 'Old.event', source: 'test', data: {} })
      await new Promise(r => setTimeout(r, 10))
      const cutoffTime = new Date()
      await new Promise(r => setTimeout(r, 10))
      await repository.track({ type: 'New.event', source: 'test', data: {} })
      const afterCutoff = await repository.findAll({ after: cutoffTime })
      expect(afterCutoff.length).toBe(1)
      expect(afterCutoff[0].type).toBe('New.event')
    })

    it('should filter by time range with before option', async () => {
      await repository.track({ type: 'Old.event', source: 'test', data: {} })
      await new Promise(r => setTimeout(r, 10))
      const cutoffTime = new Date()
      await new Promise(r => setTimeout(r, 10))
      await repository.track({ type: 'New.event', source: 'test', data: {} })
      const beforeCutoff = await repository.findAll({ before: cutoffTime })
      expect(beforeCutoff.length).toBe(1)
      expect(beforeCutoff[0].type).toBe('Old.event')
    })

    it('should support limit option', async () => {
      for (let i = 0; i < 10; i++) {
        await repository.track({ type: 'Bulk.event', source: 'test', data: { index: i } })
      }
      const limited = await repository.findAll({ limit: 5 })
      expect(limited.length).toBe(5)
    })

    it('should support offset option for pagination', async () => {
      for (let i = 0; i < 10; i++) {
        await repository.track({ type: 'Paginated.event', source: 'test', data: { index: i } })
      }
      const page1 = await repository.findAll({ type: 'Paginated.event', limit: 3, offset: 0 })
      const page2 = await repository.findAll({ type: 'Paginated.event', limit: 3, offset: 3 })
      expect(page1.length).toBe(3)
      expect(page2.length).toBe(3)
      expect(page1[0].id).not.toBe(page2[0].id)
    })

    it('should combine multiple filter options', async () => {
      const correlationId = 'combined-workflow'
      await repository.track({ type: 'Order.created', source: 'order-service', data: {}, correlationId })
      await repository.track({ type: 'Order.shipped', source: 'order-service', data: {}, correlationId })
      await repository.track({ type: 'Order.created', source: 'different-service', data: {}, correlationId })
      const combined = await repository.findAll({
        type: 'Order.created',
        source: 'order-service',
        correlationId,
      })
      expect(combined.length).toBe(1)
    })

    it('should return events in chronological order by default', async () => {
      await repository.track({ type: 'First.event', source: 'test', data: {} })
      await new Promise(r => setTimeout(r, 5))
      await repository.track({ type: 'Second.event', source: 'test', data: {} })
      await new Promise(r => setTimeout(r, 5))
      await repository.track({ type: 'Third.event', source: 'test', data: {} })
      const all = await repository.findAll()
      expect(all[0].type).toBe('First.event')
      expect(all[1].type).toBe('Second.event')
      expect(all[2].type).toBe('Third.event')
    })
  })

  describe('Immutability Guarantees', () => {
    it('should NOT have an update method', () => {
      expect((repository as any).update).toBeUndefined()
      expect((repository as any).updateById).toBeUndefined()
      expect((repository as any).updateMany).toBeUndefined()
    })

    it('should NOT have a delete method', () => {
      expect((repository as any).delete).toBeUndefined()
      expect((repository as any).deleteById).toBeUndefined()
      expect((repository as any).deleteMany).toBeUndefined()
    })

    it('should NOT have a remove method', () => {
      expect((repository as any).remove).toBeUndefined()
      expect((repository as any).removeById).toBeUndefined()
    })

    it('should ensure events cannot be modified after creation', async () => {
      const event = await repository.track({ type: 'Test', source: 'test', data: { value: 1 } })
      // Even if we try to modify the returned object, the stored event remains unchanged
      event.data.value = 999
      const retrieved = await repository.findById(event.id)
      expect(retrieved?.data.value).toBe(1) // Original value preserved
    })
  })

  describe('Event Chain Support (Causation)', () => {
    it('should allow querying events by causationId', async () => {
      const parentEvent = await repository.track({
        type: 'Parent.event',
        source: 'test',
        data: {},
      })
      await repository.track({
        type: 'Child.event.1',
        source: 'test',
        data: {},
        causationId: parentEvent.id,
      })
      await repository.track({
        type: 'Child.event.2',
        source: 'test',
        data: {},
        causationId: parentEvent.id,
      })
      const children = await repository.findByCausationId(parentEvent.id)
      expect(children.length).toBe(2)
    })

    it('should support building event chains', async () => {
      const correlationId = 'saga-123'
      const event1 = await repository.track({
        type: 'Saga.started',
        source: 'test',
        data: {},
        correlationId,
      })
      const event2 = await repository.track({
        type: 'Saga.step2',
        source: 'test',
        data: {},
        correlationId,
        causationId: event1.id,
      })
      const event3 = await repository.track({
        type: 'Saga.completed',
        source: 'test',
        data: {},
        correlationId,
        causationId: event2.id,
      })
      // Can reconstruct the chain
      const chain = await repository.findAll({ correlationId })
      expect(chain.length).toBe(3)
    })
  })

  describe('Storage Adapter Abstraction', () => {
    it('should work with different storage backends', async () => {
      const sqlRepo = new EventRepository(mockSql)
      // Both should work the same way
      expect(sqlRepo).toBeDefined()
    })

    it('should handle storage errors gracefully', async () => {
      const failingStorage = {
        exec: () => { throw new Error('Storage unavailable') }
      }
      expect(() => new EventRepository(failingStorage)).toThrow('Storage unavailable')
    })
  })

  describe('Batch Operations', () => {
    it('should support bulk track (create multiple events)', async () => {
      const events = await repository.trackMany([
        { type: 'Batch.event.1', source: 'test', data: { index: 1 } },
        { type: 'Batch.event.2', source: 'test', data: { index: 2 } },
        { type: 'Batch.event.3', source: 'test', data: { index: 3 } },
      ])
      expect(events.length).toBe(3)
    })

    it('should assign same correlationId to batch if specified', async () => {
      const correlationId = 'batch-123'
      const events = await repository.trackMany([
        { type: 'Batch.event.1', source: 'test', data: {} },
        { type: 'Batch.event.2', source: 'test', data: {} },
      ], { correlationId })
      expect(events[0].correlationId).toBe(correlationId)
      expect(events[1].correlationId).toBe(correlationId)
    })
  })

  describe('Event Type Conventions', () => {
    it('should support dot-notation event types', async () => {
      const event = await repository.track({
        type: 'Customer.created',
        source: 'test',
        data: {},
      })
      expect(event.type).toBe('Customer.created')
    })

    it('should support nested event types', async () => {
      const event = await repository.track({
        type: 'Order.Payment.failed',
        source: 'test',
        data: {},
      })
      expect(event.type).toBe('Order.Payment.failed')
    })

    it('should support query by type prefix', async () => {
      await repository.track({ type: 'Order.created', source: 'test', data: {} })
      await repository.track({ type: 'Order.updated', source: 'test', data: {} })
      await repository.track({ type: 'Payment.received', source: 'test', data: {} })
      const orderEvents = await repository.findByTypePrefix('Order.')
      expect(orderEvents.length).toBe(2)
    })
  })

  describe('Count and Aggregation', () => {
    it('should support counting events', async () => {
      await repository.track({ type: 'Test', source: 'test', data: {} })
      await repository.track({ type: 'Test', source: 'test', data: {} })
      const count = await repository.count()
      expect(count).toBe(2)
    })

    it('should support counting with filters', async () => {
      await repository.track({ type: 'Order.created', source: 'test', data: {} })
      await repository.track({ type: 'Order.created', source: 'test', data: {} })
      await repository.track({ type: 'Payment.received', source: 'test', data: {} })
      const orderCount = await repository.count({ type: 'Order.created' })
      expect(orderCount).toBe(2)
    })
  })
})
