/**
 * @dotdo/do - Event Operations Tests (RED Phase - Phase 9: Durable Execution)
 *
 * These tests define the expected behavior of Event sourcing operations.
 * They should FAIL initially (RED) because the implementation doesn't exist yet.
 *
 * Event sourcing operations:
 * - track() - creates immutable events (append-only)
 * - getEvent() - retrieves event by id
 * - queryEvents() - queries by type/time/correlationId
 */

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

import { describe, it, expect, beforeEach } from 'vitest'
import { DO } from '../src/do'
import type { CreateEventOptions, EventQueryOptions, Event } from '../src/types'

/**
 * Create an in-memory SQLite mock for testing
 * Extended to support events table
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
        // Handle events table (for future implementation)
        else if (query.includes('events')) {
          const [id, type, timestamp, source, data, correlationId, causationId] = params as [
            string,
            string,
            string,
            string,
            string,
            string | null,
            string | null,
          ]
          const tableName = 'events'
          if (!tables.has(tableName)) {
            tables.set(tableName, new Map())
          }
          const table = tables.get(tableName)!
          table.set(id, {
            id,
            type,
            timestamp,
            source,
            data,
            correlationId,
            causationId,
          })
        }
      } else if (normalizedQuery.startsWith('SELECT')) {
        // Handle events table SELECT
        if (query.includes('FROM events')) {
          const eventsTable = tables.get('events')
          if (eventsTable) {
            // Get all events first
            let allEvents = Array.from(eventsTable.values())

            // Apply WHERE conditions if present
            if (query.includes('WHERE')) {
              // Parse conditions - each condition consumes one param
              // The order of conditions in the query matches the order in params
              // We need to extract them in the order they appear in the query
              const whereStart = query.indexOf('WHERE')
              const orderStart = query.indexOf('ORDER')
              const wherePart = query.substring(whereStart, orderStart > 0 ? orderStart : undefined)

              // Track position in params array
              let paramIndex = 0

              // Check each condition in the order they might appear in our implementation
              if (wherePart.includes('type = ?')) {
                const typeValue = params[paramIndex++] as string
                allEvents = allEvents.filter((e) => e.type === typeValue)
              }
              if (wherePart.includes('source = ?')) {
                const sourceValue = params[paramIndex++] as string
                allEvents = allEvents.filter((e) => e.source === sourceValue)
              }
              if (wherePart.includes('correlation_id = ?')) {
                const corrValue = params[paramIndex++] as string
                allEvents = allEvents.filter((e) => e.correlationId === corrValue)
              }
              if (wherePart.includes('timestamp > ?')) {
                const afterValue = params[paramIndex++] as string
                allEvents = allEvents.filter((e) => (e.timestamp as string) > afterValue)
              }
              if (wherePart.includes('timestamp < ?')) {
                const beforeValue = params[paramIndex++] as string
                allEvents = allEvents.filter((e) => (e.timestamp as string) < beforeValue)
              }
              // Check for exact id match (not correlation_id or causation_id)
              if (wherePart.match(/\bid = \?/)) {
                const idValue = params[paramIndex++] as string
                allEvents = allEvents.filter((e) => e.id === idValue)
              }
            }

            // Sort by timestamp ASC
            allEvents.sort((a, b) =>
              (a.timestamp as string).localeCompare(b.timestamp as string)
            )

            // Apply LIMIT and OFFSET
            const limitMatch = query.match(/LIMIT\s+\?/i)
            const offsetMatch = query.match(/OFFSET\s+\?/i)
            if (limitMatch || offsetMatch) {
              // Find the last two params for limit and offset
              const totalParams = params.length
              const offset = offsetMatch ? (params[totalParams - 1] as number) : 0
              const limit = limitMatch ? (params[totalParams - 2] as number) : allEvents.length
              allEvents = allEvents.slice(offset, offset + limit)
            }

            // Return with column names matching our schema
            results.push(
              ...allEvents.map((e) => ({
                id: e.id,
                type: e.type,
                timestamp: e.timestamp,
                source: e.source,
                data: e.data,
                correlation_id: e.correlationId,
                causation_id: e.causationId,
              }))
            )
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
      } else if (normalizedQuery.startsWith('DELETE')) {
        const [collection, id] = params as [string, string]
        const tableName = 'documents'
        const table = tables.get(tableName)
        if (table) {
          const key = `${collection}:${id}`
          table.delete(key)
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

describe('Event Operations (Phase 9 - Durable Execution)', () => {
  let doInstance: DO

  beforeEach(() => {
    doInstance = new DO(createMockCtx() as any, mockEnv)
  })

  describe('track() - Create Immutable Events', () => {
    it('should have track method defined', () => {
      expect((doInstance as any).track).toBeDefined()
      expect(typeof (doInstance as any).track).toBe('function')
    })

    it('should create an event with all required fields', async () => {
      const options: CreateEventOptions<{ orderId: string; amount: number }> = {
        type: 'Order.created',
        source: 'checkout-service',
        data: { orderId: 'order-123', amount: 99.99 },
      }

      const event = await (doInstance as any).track(options)

      expect(event).toBeDefined()
      expect(event.id).toBeDefined()
      expect(typeof event.id).toBe('string')
      expect(event.type).toBe('Order.created')
      expect(event.source).toBe('checkout-service')
      expect(event.data).toEqual({ orderId: 'order-123', amount: 99.99 })
      expect(event.timestamp).toBeDefined()
      expect(event.timestamp).toBeInstanceOf(Date)
    })

    it('should generate unique ids for each event', async () => {
      const options: CreateEventOptions<{ value: number }> = {
        type: 'Test.event',
        source: 'test',
        data: { value: 1 },
      }

      const event1 = await (doInstance as any).track(options)
      const event2 = await (doInstance as any).track(options)

      expect(event1.id).not.toBe(event2.id)
    })

    it('should support correlationId for tracing', async () => {
      const correlationId = 'correlation-abc-123'
      const options: CreateEventOptions<{ action: string }> = {
        type: 'User.action',
        source: 'user-service',
        data: { action: 'login' },
        correlationId,
      }

      const event = await (doInstance as any).track(options)

      expect(event.correlationId).toBe(correlationId)
    })

    it('should support causationId for event chains', async () => {
      // First event
      const firstEvent = await (doInstance as any).track({
        type: 'Order.created',
        source: 'order-service',
        data: { orderId: 'order-123' },
      })

      // Second event caused by first
      const secondEvent = await (doInstance as any).track({
        type: 'Payment.initiated',
        source: 'payment-service',
        data: { orderId: 'order-123', amount: 100 },
        causationId: firstEvent.id,
      })

      expect(secondEvent.causationId).toBe(firstEvent.id)
    })

    it('should create immutable events (no update method)', async () => {
      const event = await (doInstance as any).track({
        type: 'Test.event',
        source: 'test',
        data: { value: 1 },
      })

      // Events should not have an update method or be updateable
      // Attempting to modify the event should not change the stored event
      const retrievedEvent = await (doInstance as any).getEvent(event.id)
      expect(retrievedEvent.data.value).toBe(1)
    })

    it('should set timestamp automatically', async () => {
      const beforeTime = new Date()

      const event = await (doInstance as any).track({
        type: 'Test.event',
        source: 'test',
        data: {},
      })

      const afterTime = new Date()

      expect(event.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime())
      expect(event.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime())
    })

    it('should include track in allowedMethods for RPC access', () => {
      expect((doInstance as any).allowedMethods.has('track')).toBe(true)
    })
  })

  describe('getEvent() - Retrieve Event by ID', () => {
    it('should have getEvent method defined', () => {
      expect((doInstance as any).getEvent).toBeDefined()
      expect(typeof (doInstance as any).getEvent).toBe('function')
    })

    it('should retrieve event by id', async () => {
      const created = await (doInstance as any).track({
        type: 'Customer.created',
        source: 'customer-service',
        data: { customerId: 'cust-123', name: 'John Doe' },
      })

      const retrieved = await (doInstance as any).getEvent(created.id)

      expect(retrieved).toBeDefined()
      expect(retrieved.id).toBe(created.id)
      expect(retrieved.type).toBe('Customer.created')
      expect(retrieved.source).toBe('customer-service')
      expect(retrieved.data).toEqual({ customerId: 'cust-123', name: 'John Doe' })
    })

    it('should return null for non-existent event', async () => {
      const result = await (doInstance as any).getEvent('non-existent-id')
      expect(result).toBeNull()
    })

    it('should preserve all event properties on retrieval', async () => {
      const correlationId = 'corr-123'
      const causationId = 'cause-456'

      const created = await (doInstance as any).track({
        type: 'Complex.event',
        source: 'complex-service',
        data: { nested: { value: true }, array: [1, 2, 3] },
        correlationId,
        causationId,
      })

      const retrieved = await (doInstance as any).getEvent(created.id)

      expect(retrieved.correlationId).toBe(correlationId)
      expect(retrieved.causationId).toBe(causationId)
      expect(retrieved.data.nested.value).toBe(true)
      expect(retrieved.data.array).toEqual([1, 2, 3])
    })

    it('should include getEvent in allowedMethods for RPC access', () => {
      expect((doInstance as any).allowedMethods.has('getEvent')).toBe(true)
    })
  })

  describe('queryEvents() - Query Events', () => {
    it('should have queryEvents method defined', () => {
      expect((doInstance as any).queryEvents).toBeDefined()
      expect(typeof (doInstance as any).queryEvents).toBe('function')
    })

    it('should return all events when no options provided', async () => {
      await (doInstance as any).track({
        type: 'Event.one',
        source: 'test',
        data: { num: 1 },
      })
      await (doInstance as any).track({
        type: 'Event.two',
        source: 'test',
        data: { num: 2 },
      })

      const events = await (doInstance as any).queryEvents()

      expect(Array.isArray(events)).toBe(true)
      expect(events.length).toBeGreaterThanOrEqual(2)
    })

    it('should filter by event type', async () => {
      await (doInstance as any).track({
        type: 'Order.created',
        source: 'order-service',
        data: {},
      })
      await (doInstance as any).track({
        type: 'Order.completed',
        source: 'order-service',
        data: {},
      })
      await (doInstance as any).track({
        type: 'Payment.received',
        source: 'payment-service',
        data: {},
      })

      const orderEvents = await (doInstance as any).queryEvents({ type: 'Order.created' })

      expect(orderEvents.length).toBe(1)
      expect(orderEvents[0].type).toBe('Order.created')
    })

    it('should filter by source', async () => {
      await (doInstance as any).track({
        type: 'Event.a',
        source: 'service-a',
        data: {},
      })
      await (doInstance as any).track({
        type: 'Event.b',
        source: 'service-b',
        data: {},
      })

      const events = await (doInstance as any).queryEvents({ source: 'service-a' })

      expect(events.length).toBe(1)
      expect(events[0].source).toBe('service-a')
    })

    it('should filter by correlationId', async () => {
      const correlationId = 'workflow-123'

      await (doInstance as any).track({
        type: 'Step.one',
        source: 'workflow',
        data: {},
        correlationId,
      })
      await (doInstance as any).track({
        type: 'Step.two',
        source: 'workflow',
        data: {},
        correlationId,
      })
      await (doInstance as any).track({
        type: 'Step.other',
        source: 'workflow',
        data: {},
        correlationId: 'different-workflow',
      })

      const events = await (doInstance as any).queryEvents({ correlationId })

      expect(events.length).toBe(2)
      events.forEach((event: Event) => {
        expect(event.correlationId).toBe(correlationId)
      })
    })

    it('should filter by time range with after option', async () => {
      const oldEvent = await (doInstance as any).track({
        type: 'Old.event',
        source: 'test',
        data: {},
      })

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10))

      const cutoffTime = new Date()

      await new Promise((resolve) => setTimeout(resolve, 10))

      await (doInstance as any).track({
        type: 'New.event',
        source: 'test',
        data: {},
      })

      const events = await (doInstance as any).queryEvents({ after: cutoffTime })

      expect(events.length).toBe(1)
      expect(events[0].type).toBe('New.event')
    })

    it('should filter by time range with before option', async () => {
      await (doInstance as any).track({
        type: 'Old.event',
        source: 'test',
        data: {},
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      const cutoffTime = new Date()

      await new Promise((resolve) => setTimeout(resolve, 10))

      await (doInstance as any).track({
        type: 'New.event',
        source: 'test',
        data: {},
      })

      const events = await (doInstance as any).queryEvents({ before: cutoffTime })

      expect(events.length).toBe(1)
      expect(events[0].type).toBe('Old.event')
    })

    it('should support limit option', async () => {
      for (let i = 0; i < 10; i++) {
        await (doInstance as any).track({
          type: 'Bulk.event',
          source: 'test',
          data: { index: i },
        })
      }

      const events = await (doInstance as any).queryEvents({ limit: 5 })

      expect(events.length).toBe(5)
    })

    it('should support offset option for pagination', async () => {
      for (let i = 0; i < 10; i++) {
        await (doInstance as any).track({
          type: 'Paginated.event',
          source: 'test',
          data: { index: i },
        })
      }

      const page1 = await (doInstance as any).queryEvents({
        type: 'Paginated.event',
        limit: 3,
        offset: 0,
      })
      const page2 = await (doInstance as any).queryEvents({
        type: 'Paginated.event',
        limit: 3,
        offset: 3,
      })

      expect(page1.length).toBe(3)
      expect(page2.length).toBe(3)
      // Events should be different between pages
      expect(page1[0].id).not.toBe(page2[0].id)
    })

    it('should combine multiple filter options', async () => {
      const correlationId = 'combined-workflow'

      await (doInstance as any).track({
        type: 'Order.created',
        source: 'order-service',
        data: {},
        correlationId,
      })
      await (doInstance as any).track({
        type: 'Order.shipped',
        source: 'order-service',
        data: {},
        correlationId,
      })
      await (doInstance as any).track({
        type: 'Order.created',
        source: 'different-service',
        data: {},
        correlationId,
      })

      const events = await (doInstance as any).queryEvents({
        type: 'Order.created',
        source: 'order-service',
        correlationId,
      })

      expect(events.length).toBe(1)
      expect(events[0].type).toBe('Order.created')
      expect(events[0].source).toBe('order-service')
      expect(events[0].correlationId).toBe(correlationId)
    })

    it('should return events in chronological order by default', async () => {
      await (doInstance as any).track({
        type: 'First.event',
        source: 'test',
        data: {},
      })
      await new Promise((resolve) => setTimeout(resolve, 5))
      await (doInstance as any).track({
        type: 'Second.event',
        source: 'test',
        data: {},
      })
      await new Promise((resolve) => setTimeout(resolve, 5))
      await (doInstance as any).track({
        type: 'Third.event',
        source: 'test',
        data: {},
      })

      const events = await (doInstance as any).queryEvents()

      // Events should be in chronological order (oldest first)
      expect(events[0].type).toBe('First.event')
      expect(events[1].type).toBe('Second.event')
      expect(events[2].type).toBe('Third.event')
    })

    it('should include queryEvents in allowedMethods for RPC access', () => {
      expect((doInstance as any).allowedMethods.has('queryEvents')).toBe(true)
    })
  })

  describe('Event Immutability', () => {
    it('should not allow deleting events', async () => {
      const event = await (doInstance as any).track({
        type: 'Permanent.event',
        source: 'test',
        data: { important: true },
      })

      // There should be no deleteEvent method
      expect((doInstance as any).deleteEvent).toBeUndefined()

      // Event should still be retrievable
      const retrieved = await (doInstance as any).getEvent(event.id)
      expect(retrieved).toBeDefined()
      expect(retrieved.id).toBe(event.id)
    })

    it('should not allow updating events', async () => {
      const event = await (doInstance as any).track({
        type: 'Immutable.event',
        source: 'test',
        data: { original: true },
      })

      // There should be no updateEvent method
      expect((doInstance as any).updateEvent).toBeUndefined()

      // Event data should remain unchanged
      const retrieved = await (doInstance as any).getEvent(event.id)
      expect(retrieved.data.original).toBe(true)
    })
  })

  describe('Event Type Conventions', () => {
    it('should support dot-notation event types (e.g., Customer.created)', async () => {
      const event = await (doInstance as any).track({
        type: 'Customer.created',
        source: 'customer-service',
        data: { customerId: '123' },
      })

      expect(event.type).toBe('Customer.created')
    })

    it('should support nested event types (e.g., Order.Payment.failed)', async () => {
      const event = await (doInstance as any).track({
        type: 'Order.Payment.failed',
        source: 'payment-service',
        data: { reason: 'insufficient_funds' },
      })

      expect(event.type).toBe('Order.Payment.failed')
    })

    it('should preserve event source for auditing', async () => {
      const event = await (doInstance as any).track({
        type: 'Audit.action',
        source: 'user:user-123',
        data: { action: 'delete_account' },
      })

      expect(event.source).toBe('user:user-123')
    })
  })
})
