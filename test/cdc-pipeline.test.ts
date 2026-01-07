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
 * @dotdo/do - CDCPipeline Tests (RED Phase - Durable Execution)
 *
 * These tests define the expected behavior of Change Data Capture Pipeline
 * for durable execution. The CDCPipeline enables:
 * - Batching events for efficient processing
 * - Transforming events to Parquet format for analytics
 * - Outputting batched data to R2 for durable storage
 *
 * These tests should FAIL initially (RED) because the implementation doesn't exist yet.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { DO } from '../src/do'
import type { Event, CreateEventOptions } from '../src/types'

/**
 * Create an in-memory SQLite mock for testing
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
        // Handle events table
        if (query.includes('events')) {
          const [id, type, timestamp, source, data, correlationId, causationId] = params as [
            string,
            string,
            string,
            string,
            string,
            string | null,
            string | null
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
        // Handle cdc_batches table
        else if (query.includes('cdc_batches')) {
          const [id, status, eventCount, startTime, endTime, createdAt] = params as [
            string,
            string,
            number,
            string,
            string,
            string
          ]
          const tableName = 'cdc_batches'
          if (!tables.has(tableName)) {
            tables.set(tableName, new Map())
          }
          const table = tables.get(tableName)!
          table.set(id, {
            id,
            status,
            event_count: eventCount,
            start_time: startTime,
            end_time: endTime,
            created_at: createdAt,
          })
        }
      } else if (normalizedQuery.startsWith('SELECT')) {
        // Handle COUNT queries
        if (query.includes('COUNT(*)')) {
          if (query.includes('FROM events')) {
            const eventsTable = tables.get('events')
            let allEvents = eventsTable ? Array.from(eventsTable.values()) : []

            // Apply WHERE conditions if present
            if (query.includes('WHERE')) {
              const whereStart = query.indexOf('WHERE')
              const wherePart = query.substring(whereStart)

              let paramIndex = 0

              if (wherePart.includes('type = ?')) {
                const typeValue = params[paramIndex++] as string
                allEvents = allEvents.filter((e) => e.type === typeValue)
              }
              if (wherePart.includes('timestamp >= ?')) {
                const afterValue = params[paramIndex++] as string
                allEvents = allEvents.filter((e) => (e.timestamp as string) >= afterValue)
              } else if (wherePart.includes('timestamp > ?')) {
                const afterValue = params[paramIndex++] as string
                allEvents = allEvents.filter((e) => (e.timestamp as string) > afterValue)
              }
              if (wherePart.includes('timestamp <= ?')) {
                const beforeValue = params[paramIndex++] as string
                allEvents = allEvents.filter((e) => (e.timestamp as string) <= beforeValue)
              } else if (wherePart.includes('timestamp < ?')) {
                const beforeValue = params[paramIndex++] as string
                allEvents = allEvents.filter((e) => (e.timestamp as string) < beforeValue)
              }
            }

            results.push({ count: allEvents.length })
          }
        }
        // Handle events table SELECT
        else if (query.includes('FROM events')) {
          const eventsTable = tables.get('events')
          if (eventsTable) {
            let allEvents = Array.from(eventsTable.values())

            // Apply WHERE conditions if present
            if (query.includes('WHERE')) {
              const whereStart = query.indexOf('WHERE')
              const orderStart = query.indexOf('ORDER')
              const wherePart = query.substring(whereStart, orderStart > 0 ? orderStart : undefined)

              let paramIndex = 0

              if (wherePart.includes('type = ?')) {
                const typeValue = params[paramIndex++] as string
                allEvents = allEvents.filter((e) => e.type === typeValue)
              }
              if (wherePart.includes('timestamp >= ?')) {
                const afterValue = params[paramIndex++] as string
                allEvents = allEvents.filter((e) => (e.timestamp as string) >= afterValue)
              } else if (wherePart.includes('timestamp > ?')) {
                const afterValue = params[paramIndex++] as string
                allEvents = allEvents.filter((e) => (e.timestamp as string) > afterValue)
              }
              if (wherePart.includes('timestamp <= ?')) {
                const beforeValue = params[paramIndex++] as string
                allEvents = allEvents.filter((e) => (e.timestamp as string) <= beforeValue)
              } else if (wherePart.includes('timestamp < ?')) {
                const beforeValue = params[paramIndex++] as string
                allEvents = allEvents.filter((e) => (e.timestamp as string) < beforeValue)
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
              const totalParams = params.length
              const offset = offsetMatch ? (params[totalParams - 1] as number) : 0
              const limit = limitMatch ? (params[totalParams - 2] as number) : allEvents.length
              allEvents = allEvents.slice(offset, offset + limit)
            }

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
        // Handle cdc_batches table SELECT
        else if (query.includes('FROM cdc_batches')) {
          const batchesTable = tables.get('cdc_batches')
          if (batchesTable) {
            let allBatches = Array.from(batchesTable.values())

            if (query.includes('WHERE id = ?')) {
              const idValue = params[0] as string
              allBatches = allBatches.filter((b) => b.id === idValue)
            }

            if (query.includes('WHERE status = ?')) {
              const statusValue = params[0] as string
              allBatches = allBatches.filter((b) => b.status === statusValue)
            }

            results.push(...allBatches)
          }
        }
      } else if (normalizedQuery.startsWith('UPDATE')) {
        if (query.includes('cdc_batches')) {
          const batchesTable = tables.get('cdc_batches')
          if (batchesTable) {
            const id = params[params.length - 1] as string
            const existing = batchesTable.get(id)
            if (existing) {
              // Parse SET clause to update multiple fields
              let paramIndex = 0

              if (query.includes('status = ?')) {
                existing.status = params[paramIndex++]
              }
              if (query.includes('transformed_at = ?')) {
                existing.transformed_at = params[paramIndex++]
              }
              if (query.includes('parquet_size = ?')) {
                existing.parquet_size = params[paramIndex++]
              }
              if (query.includes('completed_at = ?')) {
                existing.completed_at = params[paramIndex++]
              }
              if (query.includes('r2_key = ?')) {
                existing.r2_key = params[paramIndex++]
              }

              batchesTable.set(id, existing)
            }
          }
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

// Mock environment with R2 bucket
const mockEnv = {
  DO_NAMESPACE: {
    idFromName: vi.fn(() => ({ toString: () => 'mock-id' })),
    get: vi.fn(),
  },
  CDC_BUCKET: {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue({ objects: [] }),
  },
}

describe.todo('CDCPipeline (Durable Execution)', () => {
  let doInstance: DO

  beforeEach(() => {
    vi.clearAllMocks()
    doInstance = new DO(createMockCtx() as any, mockEnv)
  })

  describe('CDCPipeline - Batching Events', () => {
    it('should have createCDCBatch method defined', () => {
      expect((doInstance as any).createCDCBatch).toBeDefined()
      expect(typeof (doInstance as any).createCDCBatch).toBe('function')
    })

    it('should batch events by time window', async () => {
      // Create some events
      for (let i = 0; i < 5; i++) {
        await (doInstance as any).track({
          type: 'Order.created',
          source: 'order-service',
          data: { orderId: `order-${i}` },
        })
      }

      // Create a batch for the last 5 minutes
      const endTime = new Date()
      const startTime = new Date(endTime.getTime() - 5 * 60 * 1000)

      const batch = await (doInstance as any).createCDCBatch({
        startTime,
        endTime,
      })

      expect(batch).toBeDefined()
      expect(batch.id).toBeDefined()
      expect(batch.eventCount).toBe(5)
      expect(batch.status).toBe('pending')
      expect(batch.startTime).toEqual(startTime)
      expect(batch.endTime).toEqual(endTime)
    })

    it('should batch events by event type', async () => {
      // Create events of different types
      await (doInstance as any).track({
        type: 'Order.created',
        source: 'order-service',
        data: { orderId: 'order-1' },
      })
      await (doInstance as any).track({
        type: 'Payment.received',
        source: 'payment-service',
        data: { paymentId: 'pay-1' },
      })
      await (doInstance as any).track({
        type: 'Order.created',
        source: 'order-service',
        data: { orderId: 'order-2' },
      })

      // Batch only Order events
      const batch = await (doInstance as any).createCDCBatch({
        eventType: 'Order.created',
      })

      expect(batch.eventCount).toBe(2)
    })

    it('should batch events by count limit', async () => {
      // Create 10 events
      for (let i = 0; i < 10; i++) {
        await (doInstance as any).track({
          type: 'Metric.recorded',
          source: 'metrics-service',
          data: { value: i },
        })
      }

      // Create batch with max 5 events
      const batch = await (doInstance as any).createCDCBatch({
        maxEvents: 5,
      })

      expect(batch.eventCount).toBe(5)
    })

    it('should return empty batch when no events match criteria', async () => {
      const batch = await (doInstance as any).createCDCBatch({
        eventType: 'NonExistent.event',
      })

      expect(batch.eventCount).toBe(0)
      expect(batch.status).toBe('empty')
    })

    it('should include createCDCBatch in allowedMethods for RPC access', () => {
      expect((doInstance as any).allowedMethods.has('createCDCBatch')).toBe(true)
    })
  })

  describe('CDCPipeline - Transform to Parquet', () => {
    it('should have transformToParquet method defined', () => {
      expect((doInstance as any).transformToParquet).toBeDefined()
      expect(typeof (doInstance as any).transformToParquet).toBe('function')
    })

    it('should transform batch events to Parquet format', async () => {
      // Create events
      await (doInstance as any).track({
        type: 'User.created',
        source: 'user-service',
        data: { userId: 'user-1', name: 'John' },
      })
      await (doInstance as any).track({
        type: 'User.created',
        source: 'user-service',
        data: { userId: 'user-2', name: 'Jane' },
      })

      // Create and transform batch
      const batch = await (doInstance as any).createCDCBatch({
        eventType: 'User.created',
      })

      const parquetData = await (doInstance as any).transformToParquet(batch.id)

      expect(parquetData).toBeDefined()
      expect(parquetData instanceof ArrayBuffer || parquetData instanceof Uint8Array).toBe(true)
      expect(parquetData.byteLength).toBeGreaterThan(0)
    })

    it('should include schema metadata in Parquet output', async () => {
      // Create event with complex data
      await (doInstance as any).track({
        type: 'Analytics.event',
        source: 'analytics',
        data: {
          eventName: 'page_view',
          properties: { url: '/home', duration: 1500 },
          timestamp: new Date().toISOString(),
        },
      })

      const batch = await (doInstance as any).createCDCBatch({})
      const parquetData = await (doInstance as any).transformToParquet(batch.id)

      // The Parquet data should have valid magic bytes (PAR1)
      const view = new Uint8Array(parquetData)
      expect(view[0]).toBe(0x50) // P
      expect(view[1]).toBe(0x41) // A
      expect(view[2]).toBe(0x52) // R
      expect(view[3]).toBe(0x31) // 1
    })

    it('should update batch status to transformed after Parquet conversion', async () => {
      await (doInstance as any).track({
        type: 'Test.event',
        source: 'test',
        data: {},
      })

      const batch = await (doInstance as any).createCDCBatch({})
      await (doInstance as any).transformToParquet(batch.id)

      const updatedBatch = await (doInstance as any).getCDCBatch(batch.id)
      expect(updatedBatch.status).toBe('transformed')
    })

    it('should throw error for non-existent batch', async () => {
      await expect(
        (doInstance as any).transformToParquet('non-existent-batch')
      ).rejects.toThrow('Batch not found')
    })

    it('should include transformToParquet in allowedMethods for RPC access', () => {
      expect((doInstance as any).allowedMethods.has('transformToParquet')).toBe(true)
    })

    // Additional comprehensive Parquet transformation tests

    it('should handle primitive data types correctly', async () => {
      // Test various primitive types: string, number, boolean
      await (doInstance as any).track({
        type: 'TypeTest.event',
        source: 'type-test',
        data: {
          stringField: 'hello world',
          integerField: 42,
          floatField: 3.14159,
          booleanTrue: true,
          booleanFalse: false,
        },
      })

      const batch = await (doInstance as any).createCDCBatch({
        eventType: 'TypeTest.event',
      })
      const parquetData = await (doInstance as any).transformToParquet(batch.id)

      expect(parquetData).toBeDefined()
      expect(parquetData.byteLength).toBeGreaterThan(0)

      // Verify Parquet magic bytes at start and end
      const view = new Uint8Array(parquetData)
      // Start magic: PAR1
      expect(view[0]).toBe(0x50)
      expect(view[1]).toBe(0x41)
      expect(view[2]).toBe(0x52)
      expect(view[3]).toBe(0x31)
      // End magic: PAR1 (Parquet files end with PAR1 as well)
      const len = view.length
      expect(view[len - 4]).toBe(0x50)
      expect(view[len - 3]).toBe(0x41)
      expect(view[len - 2]).toBe(0x52)
      expect(view[len - 1]).toBe(0x31)
    })

    it('should handle nested object structures', async () => {
      await (doInstance as any).track({
        type: 'Nested.event',
        source: 'nested-test',
        data: {
          user: {
            id: 'user-123',
            profile: {
              name: 'Alice',
              age: 30,
              address: {
                city: 'San Francisco',
                country: 'USA',
              },
            },
          },
          metadata: {
            version: '1.0',
            tags: ['important', 'verified'],
          },
        },
      })

      const batch = await (doInstance as any).createCDCBatch({
        eventType: 'Nested.event',
      })
      const parquetData = await (doInstance as any).transformToParquet(batch.id)

      expect(parquetData).toBeDefined()
      expect(parquetData.byteLength).toBeGreaterThan(0)
    })

    it('should handle array data types', async () => {
      await (doInstance as any).track({
        type: 'Array.event',
        source: 'array-test',
        data: {
          tags: ['alpha', 'beta', 'gamma'],
          scores: [85, 90, 78, 92],
          items: [
            { id: 1, name: 'Item 1' },
            { id: 2, name: 'Item 2' },
          ],
        },
      })

      const batch = await (doInstance as any).createCDCBatch({
        eventType: 'Array.event',
      })
      const parquetData = await (doInstance as any).transformToParquet(batch.id)

      expect(parquetData).toBeDefined()
      expect(parquetData.byteLength).toBeGreaterThan(0)
    })

    it('should handle null and undefined values', async () => {
      await (doInstance as any).track({
        type: 'Nullable.event',
        source: 'nullable-test',
        data: {
          presentField: 'I exist',
          nullField: null,
          undefinedField: undefined,
          emptyString: '',
          zero: 0,
        },
      })

      const batch = await (doInstance as any).createCDCBatch({
        eventType: 'Nullable.event',
      })
      const parquetData = await (doInstance as any).transformToParquet(batch.id)

      expect(parquetData).toBeDefined()
      expect(parquetData.byteLength).toBeGreaterThan(0)
    })

    it('should handle large number of events efficiently', async () => {
      // Create 100 events
      for (let i = 0; i < 100; i++) {
        await (doInstance as any).track({
          type: 'Bulk.event',
          source: 'bulk-test',
          data: {
            index: i,
            timestamp: new Date().toISOString(),
            payload: `Event payload ${i}`,
          },
        })
      }

      const batch = await (doInstance as any).createCDCBatch({
        eventType: 'Bulk.event',
      })

      expect(batch.eventCount).toBe(100)

      const parquetData = await (doInstance as any).transformToParquet(batch.id)

      expect(parquetData).toBeDefined()
      expect(parquetData.byteLength).toBeGreaterThan(0)
    })

    it('should support compression options', async () => {
      // Create events for each compression test
      await (doInstance as any).track({
        type: 'CompressSnappy.event',
        source: 'compress-test',
        data: { message: 'SNAPPY compression test' },
      })
      await (doInstance as any).track({
        type: 'CompressGzip.event',
        source: 'compress-test',
        data: { message: 'GZIP compression test' },
      })
      await (doInstance as any).track({
        type: 'CompressNone.event',
        source: 'compress-test',
        data: { message: 'No compression test' },
      })

      // Test SNAPPY compression (default for Parquet)
      const snappyBatch = await (doInstance as any).createCDCBatch({
        eventType: 'CompressSnappy.event',
      })
      const snappyData = await (doInstance as any).transformToParquet(snappyBatch.id, {
        compression: 'SNAPPY',
      })
      expect(snappyData).toBeDefined()
      expect(snappyData.byteLength).toBeGreaterThan(0)

      // Test GZIP compression
      const gzipBatch = await (doInstance as any).createCDCBatch({
        eventType: 'CompressGzip.event',
      })
      const gzipData = await (doInstance as any).transformToParquet(gzipBatch.id, {
        compression: 'GZIP',
      })
      expect(gzipData).toBeDefined()
      expect(gzipData.byteLength).toBeGreaterThan(0)

      // Test no compression
      const uncompressedBatch = await (doInstance as any).createCDCBatch({
        eventType: 'CompressNone.event',
      })
      const uncompressedData = await (doInstance as any).transformToParquet(uncompressedBatch.id, {
        compression: 'UNCOMPRESSED',
      })
      expect(uncompressedData).toBeDefined()
      expect(uncompressedData.byteLength).toBeGreaterThan(0)
    })

    it('should support row group size configuration', async () => {
      // Create multiple events
      for (let i = 0; i < 50; i++) {
        await (doInstance as any).track({
          type: 'RowGroup.event',
          source: 'rowgroup-test',
          data: { index: i },
        })
      }

      const batch = await (doInstance as any).createCDCBatch({
        eventType: 'RowGroup.event',
      })

      const parquetData = await (doInstance as any).transformToParquet(batch.id, {
        rowGroupSize: 10, // 10 rows per group
      })

      expect(parquetData).toBeDefined()
      expect(parquetData.byteLength).toBeGreaterThan(0)
    })

    it('should preserve event metadata in Parquet columns', async () => {
      const eventTimestamp = new Date().toISOString()
      await (doInstance as any).track({
        type: 'Metadata.event',
        source: 'metadata-test',
        data: { value: 'test' },
        correlationId: 'corr-123',
        causationId: 'cause-456',
      })

      const batch = await (doInstance as any).createCDCBatch({
        eventType: 'Metadata.event',
      })

      const parquetData = await (doInstance as any).transformToParquet(batch.id)

      // The Parquet schema should include event metadata columns:
      // id, type, timestamp, source, data, correlationId, causationId
      expect(parquetData).toBeDefined()
      expect(parquetData.byteLength).toBeGreaterThan(0)
    })

    it('should handle empty batch gracefully', async () => {
      const batch = await (doInstance as any).createCDCBatch({
        eventType: 'NonExistent.event',
      })

      expect(batch.status).toBe('empty')

      // Transforming empty batch should return minimal valid Parquet or throw
      await expect(
        (doInstance as any).transformToParquet(batch.id)
      ).rejects.toThrow('Cannot transform empty batch')
    })

    it('should infer schema from event data structure', async () => {
      await (doInstance as any).track({
        type: 'Schema.event',
        source: 'schema-test',
        data: {
          name: 'Test User',
          age: 25,
          active: true,
          balance: 100.50,
          createdAt: new Date().toISOString(),
        },
      })

      const batch = await (doInstance as any).createCDCBatch({
        eventType: 'Schema.event',
      })

      const result = await (doInstance as any).transformToParquet(batch.id, {
        includeSchema: true,
      })

      // Result should include schema information
      expect(result.parquetData).toBeDefined()
      expect(result.schema).toBeDefined()
      expect(result.schema.fields).toContainEqual(
        expect.objectContaining({ name: 'data.name', type: 'STRING' })
      )
      expect(result.schema.fields).toContainEqual(
        expect.objectContaining({ name: 'data.age', type: 'INT64' })
      )
      expect(result.schema.fields).toContainEqual(
        expect.objectContaining({ name: 'data.active', type: 'BOOLEAN' })
      )
      expect(result.schema.fields).toContainEqual(
        expect.objectContaining({ name: 'data.balance', type: 'DOUBLE' })
      )
    })

    it('should handle mixed schema events within same batch', async () => {
      // Events with different data shapes
      await (doInstance as any).track({
        type: 'Mixed.event',
        source: 'mixed-test',
        data: { name: 'First', hasExtra: true },
      })
      await (doInstance as any).track({
        type: 'Mixed.event',
        source: 'mixed-test',
        data: { name: 'Second', age: 30 },
      })
      await (doInstance as any).track({
        type: 'Mixed.event',
        source: 'mixed-test',
        data: { name: 'Third', tags: ['a', 'b'] },
      })

      const batch = await (doInstance as any).createCDCBatch({
        eventType: 'Mixed.event',
      })

      const parquetData = await (doInstance as any).transformToParquet(batch.id)

      // Should handle schema merging/union
      expect(parquetData).toBeDefined()
      expect(parquetData.byteLength).toBeGreaterThan(0)
    })

    it('should reject already transformed batch', async () => {
      await (doInstance as any).track({
        type: 'Once.event',
        source: 'once-test',
        data: {},
      })

      const batch = await (doInstance as any).createCDCBatch({
        eventType: 'Once.event',
      })

      // First transformation should succeed
      await (doInstance as any).transformToParquet(batch.id)

      // Second transformation should fail
      await expect(
        (doInstance as any).transformToParquet(batch.id)
      ).rejects.toThrow('Batch already transformed')
    })

    it('should store Parquet data reference in batch after transformation', async () => {
      await (doInstance as any).track({
        type: 'Store.event',
        source: 'store-test',
        data: { value: 'test' },
      })

      const batch = await (doInstance as any).createCDCBatch({
        eventType: 'Store.event',
      })

      const parquetData = await (doInstance as any).transformToParquet(batch.id)

      const updatedBatch = await (doInstance as any).getCDCBatch(batch.id)

      expect(updatedBatch.parquetSize).toBe(parquetData.byteLength)
      expect(updatedBatch.transformedAt).toBeDefined()
    })

    it('should handle special characters in string fields', async () => {
      await (doInstance as any).track({
        type: 'Special.event',
        source: 'special-test',
        data: {
          unicode: 'Hello \u4e16\u754c \u{1F600}',
          newlines: 'line1\nline2\rline3',
          quotes: 'He said "hello"',
          backslash: 'path\\to\\file',
          nullChar: 'before\x00after',
        },
      })

      const batch = await (doInstance as any).createCDCBatch({
        eventType: 'Special.event',
      })

      const parquetData = await (doInstance as any).transformToParquet(batch.id)

      expect(parquetData).toBeDefined()
      expect(parquetData.byteLength).toBeGreaterThan(0)
    })

    it('should handle large integer values as strings', async () => {
      // BigInt values must be serialized as strings since JSON.stringify doesn't support BigInt
      await (doInstance as any).track({
        type: 'LargeInt.event',
        source: 'largeint-test',
        data: {
          largeNumber: '9007199254740993', // Larger than Number.MAX_SAFE_INTEGER, as string
          normalNumber: 42,
          maxSafeInteger: Number.MAX_SAFE_INTEGER,
        },
      })

      const batch = await (doInstance as any).createCDCBatch({
        eventType: 'LargeInt.event',
      })

      const parquetData = await (doInstance as any).transformToParquet(batch.id)

      expect(parquetData).toBeDefined()
      expect(parquetData.byteLength).toBeGreaterThan(0)
    })

    it('should handle Date objects', async () => {
      const now = new Date()
      await (doInstance as any).track({
        type: 'Date.event',
        source: 'date-test',
        data: {
          dateObject: now,
          isoString: now.toISOString(),
          timestamp: now.getTime(),
        },
      })

      const batch = await (doInstance as any).createCDCBatch({
        eventType: 'Date.event',
      })

      const parquetData = await (doInstance as any).transformToParquet(batch.id)

      expect(parquetData).toBeDefined()
      expect(parquetData.byteLength).toBeGreaterThan(0)
    })

    it('should return transformation statistics', async () => {
      for (let i = 0; i < 10; i++) {
        await (doInstance as any).track({
          type: 'Stats.event',
          source: 'stats-test',
          data: { index: i, payload: 'x'.repeat(100) },
        })
      }

      const batch = await (doInstance as any).createCDCBatch({
        eventType: 'Stats.event',
      })

      const result = await (doInstance as any).transformToParquet(batch.id, {
        includeStats: true,
      })

      expect(result.stats).toBeDefined()
      expect(result.stats.rowCount).toBe(10)
      expect(result.stats.columnCount).toBeGreaterThan(0)
      expect(result.stats.uncompressedSize).toBeGreaterThan(0)
      expect(result.stats.compressedSize).toBeGreaterThan(0)
      expect(result.stats.compressionRatio).toBeGreaterThan(0)
      expect(result.stats.transformDurationMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('CDCPipeline - Output to R2', () => {
    it('should have outputToR2 method defined', () => {
      expect((doInstance as any).outputToR2).toBeDefined()
      expect(typeof (doInstance as any).outputToR2).toBe('function')
    })

    it('should output Parquet data to R2 bucket', async () => {
      // Create events
      await (doInstance as any).track({
        type: 'Log.entry',
        source: 'logger',
        data: { level: 'info', message: 'Test log' },
      })

      // Create batch and transform
      const batch = await (doInstance as any).createCDCBatch({})
      await (doInstance as any).transformToParquet(batch.id)

      // Output to R2
      const result = await (doInstance as any).outputToR2(batch.id)

      expect(result).toBeDefined()
      expect(result.key).toBeDefined()
      expect(result.key).toMatch(/\.parquet$/)
      expect(result.bucket).toBe('CDC_BUCKET')
      expect(result.size).toBeGreaterThan(0)
    })

    it('should use partitioned path for R2 storage', async () => {
      await (doInstance as any).track({
        type: 'Event.test',
        source: 'test',
        data: {},
      })

      const batch = await (doInstance as any).createCDCBatch({})
      await (doInstance as any).transformToParquet(batch.id)
      const result = await (doInstance as any).outputToR2(batch.id)

      // Key should be partitioned by date: year=YYYY/month=MM/day=DD/batch-id.parquet
      expect(result.key).toMatch(/year=\d{4}\/month=\d{2}\/day=\d{2}\//)
    })

    it('should update batch status to completed after R2 output', async () => {
      await (doInstance as any).track({
        type: 'Event.test',
        source: 'test',
        data: {},
      })

      const batch = await (doInstance as any).createCDCBatch({})
      await (doInstance as any).transformToParquet(batch.id)
      await (doInstance as any).outputToR2(batch.id)

      const updatedBatch = await (doInstance as any).getCDCBatch(batch.id)
      expect(updatedBatch.status).toBe('completed')
    })

    it('should record R2 key in batch metadata', async () => {
      await (doInstance as any).track({
        type: 'Event.test',
        source: 'test',
        data: {},
      })

      const batch = await (doInstance as any).createCDCBatch({})
      await (doInstance as any).transformToParquet(batch.id)
      const result = await (doInstance as any).outputToR2(batch.id)

      const updatedBatch = await (doInstance as any).getCDCBatch(batch.id)
      expect(updatedBatch.r2Key).toBe(result.key)
    })

    it('should throw error if batch not transformed', async () => {
      await (doInstance as any).track({
        type: 'Event.test',
        source: 'test',
        data: {},
      })

      const batch = await (doInstance as any).createCDCBatch({})
      // Skip transform step

      await expect((doInstance as any).outputToR2(batch.id)).rejects.toThrow(
        'Batch must be transformed before output'
      )
    })

    it('should include outputToR2 in allowedMethods for RPC access', () => {
      expect((doInstance as any).allowedMethods.has('outputToR2')).toBe(true)
    })
  })

  describe('CDCPipeline - Batch Management', () => {
    it('should have getCDCBatch method defined', () => {
      expect((doInstance as any).getCDCBatch).toBeDefined()
      expect(typeof (doInstance as any).getCDCBatch).toBe('function')
    })

    it('should have queryCDCBatches method defined', () => {
      expect((doInstance as any).queryCDCBatches).toBeDefined()
      expect(typeof (doInstance as any).queryCDCBatches).toBe('function')
    })

    it('should retrieve batch by ID', async () => {
      await (doInstance as any).track({
        type: 'Test.event',
        source: 'test',
        data: {},
      })

      const batch = await (doInstance as any).createCDCBatch({})
      const retrieved = await (doInstance as any).getCDCBatch(batch.id)

      expect(retrieved).toBeDefined()
      expect(retrieved.id).toBe(batch.id)
      expect(retrieved.eventCount).toBe(batch.eventCount)
    })

    it('should return null for non-existent batch', async () => {
      const result = await (doInstance as any).getCDCBatch('non-existent')
      expect(result).toBeNull()
    })

    it('should query batches by status', async () => {
      await (doInstance as any).track({
        type: 'Test.event',
        source: 'test',
        data: {},
      })

      await (doInstance as any).createCDCBatch({})
      await (doInstance as any).createCDCBatch({})

      const pendingBatches = await (doInstance as any).queryCDCBatches({
        status: 'pending',
      })

      expect(pendingBatches.length).toBeGreaterThanOrEqual(2)
      expect(pendingBatches.every((b: any) => b.status === 'pending')).toBe(true)
    })

    it('should include getCDCBatch in allowedMethods for RPC access', () => {
      expect((doInstance as any).allowedMethods.has('getCDCBatch')).toBe(true)
    })

    it('should include queryCDCBatches in allowedMethods for RPC access', () => {
      expect((doInstance as any).allowedMethods.has('queryCDCBatches')).toBe(true)
    })
  })

  describe('CDCPipeline - Full Pipeline Execution', () => {
    it('should have processCDCPipeline method for full execution', async () => {
      expect((doInstance as any).processCDCPipeline).toBeDefined()
      expect(typeof (doInstance as any).processCDCPipeline).toBe('function')
    })

    it('should execute full pipeline: batch -> transform -> output', async () => {
      // Create events
      for (let i = 0; i < 3; i++) {
        await (doInstance as any).track({
          type: 'Pipeline.event',
          source: 'pipeline-test',
          data: { index: i },
        })
      }

      // Execute full pipeline
      const result = await (doInstance as any).processCDCPipeline({
        eventType: 'Pipeline.event',
      })

      expect(result).toBeDefined()
      expect(result.batchId).toBeDefined()
      expect(result.eventCount).toBe(3)
      expect(result.r2Key).toMatch(/\.parquet$/)
      expect(result.status).toBe('completed')
    })

    it('should skip empty batches in full pipeline', async () => {
      const result = await (doInstance as any).processCDCPipeline({
        eventType: 'NonExistent.event',
      })

      expect(result.status).toBe('skipped')
      expect(result.eventCount).toBe(0)
    })

    it('should include processCDCPipeline in allowedMethods for RPC access', () => {
      expect((doInstance as any).allowedMethods.has('processCDCPipeline')).toBe(true)
    })
  })
})
