/**
 * CDC Storage Tests - Epic 3: CDC Streaming
 *
 * RED PHASE: These tests define the expected behavior for CDC event
 * persistence to R2 in Parquet format with Iceberg table management.
 *
 * Coverage:
 * - R2 persistence
 * - Parquet format
 * - Partitioning
 * - Compaction
 * - Retention policies
 *
 * @module cdc/__tests__/storage.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
  CDCStorage,
  ParquetWriter,
  CDCPartitioner,
  CDCCompactor,
  CDCRetentionPolicy,
  eventsToParquet,
  parquetToEvents,
  getPartitionPath,
  createTableMetadata,
} from './storage'

import type {
  CDCEvent,
  R2Storage,
  R2ObjectRef,
  R2PutOptions,
  R2ListOptions,
  R2ListResult,
  R2Object,
} from '../../types/storage'

describe('CDCStorage', () => {
  let storage: CDCStorage
  let mockR2: R2Storage

  beforeEach(() => {
    mockR2 = createMockR2()
    storage = new CDCStorage({
      r2: mockR2,
      bucket: 'cdc-events',
      prefix: 'events/',
    })
  })

  describe('R2 Persistence', () => {
    it('should write CDC events to R2', async () => {
      const events: CDCEvent[] = [
        createEvent(1, 'INSERT'),
        createEvent(2, 'UPDATE'),
        createEvent(3, 'DELETE'),
      ]

      const result = await storage.write(events)

      expect(result.success).toBe(true)
      expect(result.objectKey).toMatch(/^events\/.*\.parquet$/)
    })

    it('should generate unique object keys', async () => {
      const events1 = [createEvent(1, 'INSERT')]
      const events2 = [createEvent(2, 'INSERT')]

      const result1 = await storage.write(events1)
      const result2 = await storage.write(events2)

      expect(result1.objectKey).not.toBe(result2.objectKey)
    })

    it('should include metadata in R2 object', async () => {
      const events = [createEvent(1, 'INSERT'), createEvent(2, 'UPDATE')]

      await storage.write(events)

      const putCall = vi.mocked(mockR2.put).mock.calls[0]
      const options = putCall[2] as R2PutOptions | undefined

      expect(options?.customMetadata?.eventCount).toBe('2')
      expect(options?.customMetadata?.minSequence).toBe('1')
      expect(options?.customMetadata?.maxSequence).toBe('2')
    })

    it('should set correct content type', async () => {
      const events = [createEvent(1, 'INSERT')]

      await storage.write(events)

      const putCall = vi.mocked(mockR2.put).mock.calls[0]
      const options = putCall[2] as R2PutOptions | undefined

      expect(options?.httpMetadata?.contentType).toBe('application/vnd.apache.parquet')
    })

    it('should read events from R2', async () => {
      const originalEvents = [createEvent(1, 'INSERT'), createEvent(2, 'UPDATE')]

      const writeResult = await storage.write(originalEvents)
      const readEvents = await storage.read(writeResult.objectKey)

      expect(readEvents).toHaveLength(2)
      expect(readEvents[0].sequence).toBe(1)
      expect(readEvents[1].sequence).toBe(2)
    })

    it('should list objects by prefix', async () => {
      await storage.write([createEvent(1, 'INSERT')])
      await storage.write([createEvent(2, 'INSERT')])
      await storage.write([createEvent(3, 'INSERT')])

      const objects = await storage.list({ prefix: 'events/' })

      expect(objects.length).toBeGreaterThanOrEqual(3)
    })

    it('should delete objects from R2', async () => {
      const result = await storage.write([createEvent(1, 'INSERT')])

      await storage.delete(result.objectKey)

      const object = await storage.read(result.objectKey)
      expect(object).toBeNull()
    })

    it('should handle R2 write errors gracefully', async () => {
      vi.mocked(mockR2.put).mockRejectedValueOnce(new Error('R2 unavailable'))

      await expect(storage.write([createEvent(1, 'INSERT')])).rejects.toThrow('R2 unavailable')
    })

    it('should support batch writes for large event sets', async () => {
      const largeEventSet = Array.from({ length: 10000 }, (_, i) => createEvent(i, 'INSERT'))

      const result = await storage.writeBatch(largeEventSet, { maxPerFile: 1000 })

      expect(result.files).toHaveLength(10)
      expect(result.totalEvents).toBe(10000)
    })

    it('should calculate and store checksums', async () => {
      const events = [createEvent(1, 'INSERT')]

      const result = await storage.write(events)

      expect(result.checksum).toBeDefined()
      expect(result.checksum).toMatch(/^[a-f0-9]{32,64}$/)
    })
  })

  describe('query', () => {
    it('should filter by timestamp range', async () => {
      const events = await storage.query({
        fromTimestamp: Date.now() - 3600000,
        toTimestamp: Date.now(),
      })

      expect(Array.isArray(events)).toBe(true)
    })

    it('should filter by sequence range', async () => {
      const events = await storage.query({
        fromSequence: 100,
        toSequence: 200,
      })

      expect(Array.isArray(events)).toBe(true)
    })

    it('should filter by collection', async () => {
      const events = await storage.query({
        collections: ['users', 'orders'],
      })

      expect(Array.isArray(events)).toBe(true)
    })

    it('should filter by operation', async () => {
      const events = await storage.query({
        operations: ['INSERT', 'UPDATE'],
      })

      expect(Array.isArray(events)).toBe(true)
    })

    it('should respect limit and return cursor', async () => {
      const result = await storage.query({ limit: 100 })

      expect(result.events.length).toBeLessThanOrEqual(100)
      expect(result.cursor).toBeDefined()
    })
  })

  describe('getStats', () => {
    it('should return storage statistics', async () => {
      const stats = await storage.getStats()

      expect(stats).toMatchObject({
        totalFiles: expect.any(Number),
        totalBytes: expect.any(Number),
        totalEvents: expect.any(Number),
        oldestTimestamp: expect.any(Number),
        newestTimestamp: expect.any(Number),
      })
    })
  })
})

describe('ParquetWriter', () => {
  let writer: ParquetWriter

  beforeEach(() => {
    writer = new ParquetWriter()
  })

  it('should serialize CDC events to Parquet', async () => {
    const events = [createEvent(1, 'INSERT'), createEvent(2, 'UPDATE')]

    const buffer = await writer.write(events)

    expect(buffer).toBeInstanceOf(ArrayBuffer)
    expect(buffer.byteLength).toBeGreaterThan(0)
  })

  it('should deserialize Parquet to CDC events', async () => {
    const events = [
      createEvent(1, 'INSERT', { name: 'Alice' }),
      createEvent(2, 'UPDATE', { name: 'Bob' }),
    ]

    const buffer = await writer.write(events)
    const deserialized = await writer.read(buffer)

    expect(deserialized).toHaveLength(2)
    expect((deserialized[0].after as Record<string, unknown>)?.name).toBe('Alice')
  })

  it('should preserve all CDC event fields', async () => {
    const event: CDCEvent = {
      id: 'evt-123',
      operation: 'UPDATE',
      collection: 'users',
      documentId: 'user-456',
      timestamp: Date.now(),
      sequence: 42,
      before: { id: 'user-456', name: 'Old' },
      after: { id: 'user-456', name: 'New' },
      changedFields: ['name'],
      source: 'https://app.do',
      correlationId: 'req-789',
    }

    const buffer = await writer.write([event])
    const [deserialized] = await writer.read(buffer)

    expect(deserialized).toEqual(event)
  })

  it('should use efficient column encoding for operations', async () => {
    const events = Array.from({ length: 1000 }, (_, i) =>
      createEvent(i, i % 3 === 0 ? 'INSERT' : i % 3 === 1 ? 'UPDATE' : 'DELETE')
    )

    const buffer = await writer.write(events)
    const stats = await writer.getStats(buffer)

    expect(stats.columns.operation.encoding).toBe('DICTIONARY')
  })

  it('should compress data efficiently', async () => {
    const events = Array.from({ length: 1000 }, (_, i) =>
      createEvent(i, 'INSERT', { data: 'x'.repeat(100) })
    )

    const uncompressed = await writer.write(events, { compression: 'NONE' })
    const compressed = await writer.write(events, { compression: 'SNAPPY' })

    expect(compressed.byteLength).toBeLessThan(uncompressed.byteLength * 0.5)
  })

  it('should generate valid Parquet schema', () => {
    const schema = writer.getSchema()

    expect(schema.fields).toContainEqual(expect.objectContaining({ name: 'id', type: 'STRING' }))
    expect(schema.fields).toContainEqual(expect.objectContaining({ name: 'operation', type: 'STRING' }))
    expect(schema.fields).toContainEqual(expect.objectContaining({ name: 'timestamp', type: 'INT64' }))
    expect(schema.fields).toContainEqual(expect.objectContaining({ name: 'sequence', type: 'INT64' }))
  })
})

describe('CDCPartitioner', () => {
  let partitioner: CDCPartitioner

  beforeEach(() => {
    partitioner = new CDCPartitioner({
      strategy: 'time',
      granularity: 'hour',
    })
  })

  it('should partition by hour', () => {
    const events = [
      createEventWithTimestamp(1, new Date('2024-06-15T10:30:00Z')),
      createEventWithTimestamp(2, new Date('2024-06-15T10:45:00Z')),
      createEventWithTimestamp(3, new Date('2024-06-15T11:15:00Z')),
    ]

    const partitions = partitioner.partition(events)

    expect(Object.keys(partitions)).toHaveLength(2)
    expect(partitions['2024/06/15/10']).toHaveLength(2)
    expect(partitions['2024/06/15/11']).toHaveLength(1)
  })

  it('should partition by day', () => {
    partitioner = new CDCPartitioner({ strategy: 'time', granularity: 'day' })

    const events = [
      createEventWithTimestamp(1, new Date('2024-06-15T10:30:00Z')),
      createEventWithTimestamp(2, new Date('2024-06-16T14:45:00Z')),
    ]

    const partitions = partitioner.partition(events)

    expect(Object.keys(partitions)).toHaveLength(2)
    expect(partitions['2024/06/15']).toHaveLength(1)
    expect(partitions['2024/06/16']).toHaveLength(1)
  })

  it('should partition by collection', () => {
    partitioner = new CDCPartitioner({ strategy: 'collection' })

    const events = [
      { ...createEvent(1, 'INSERT'), collection: 'users' },
      { ...createEvent(2, 'INSERT'), collection: 'orders' },
      { ...createEvent(3, 'UPDATE'), collection: 'users' },
    ]

    const partitions = partitioner.partition(events)

    expect(Object.keys(partitions)).toHaveLength(2)
    expect(partitions['users']).toHaveLength(2)
    expect(partitions['orders']).toHaveLength(1)
  })

  it('should generate partition path for storage', () => {
    const event = createEventWithTimestamp(1, new Date('2024-06-15T10:30:00Z'))

    const path = partitioner.getPath(event)

    expect(path).toBe('2024/06/15/10')
  })

  it('should list partitions within time range', () => {
    const partitions = partitioner.listPartitions({
      start: new Date('2024-06-15T08:00:00Z'),
      end: new Date('2024-06-15T12:00:00Z'),
    })

    expect(partitions).toEqual([
      '2024/06/15/08',
      '2024/06/15/09',
      '2024/06/15/10',
      '2024/06/15/11',
      '2024/06/15/12',
    ])
  })
})

describe('CDCCompactor', () => {
  let compactor: CDCCompactor
  let storage: CDCStorage
  let mockR2: R2Storage

  beforeEach(() => {
    mockR2 = createMockR2()
    storage = new CDCStorage({ r2: mockR2, bucket: 'cdc-events', prefix: 'events/' })
    compactor = new CDCCompactor({ storage, targetFileSizeMB: 128, maxFilesToCompact: 10 })
  })

  it('should merge small files into larger ones', async () => {
    const smallFiles = Array.from({ length: 10 }, (_, i) => ({
      key: `events/partition/file${i}.parquet`,
      size: 1024 * 1024,
    }))

    const result = await compactor.compact(smallFiles)

    expect(result.inputFiles).toBe(10)
    expect(result.outputFiles).toBeLessThan(10)
    expect(result.totalBytesRead).toBe(10 * 1024 * 1024)
  })

  it('should preserve event order after compaction', async () => {
    await storage.write([createEvent(1, 'INSERT'), createEvent(2, 'INSERT')])
    await storage.write([createEvent(3, 'INSERT'), createEvent(4, 'INSERT')])

    const files = await storage.list({ prefix: 'events/' })
    await compactor.compact(files.map((f) => ({ key: f.key, size: f.size })))

    const compactedFiles = await storage.list({ prefix: 'events/' })
    const events = await storage.read(compactedFiles[0].key)

    const sequences = events.map((e) => e.sequence)
    expect(sequences).toEqual([1, 2, 3, 4])
  })

  it('should deduplicate events by ID', async () => {
    const event = createEvent(1, 'INSERT')
    await storage.write([event])
    await storage.write([event])

    const files = await storage.list({ prefix: 'events/' })
    const result = await compactor.compact(
      files.map((f) => ({ key: f.key, size: f.size })),
      { deduplicate: true }
    )

    expect(result.duplicatesRemoved).toBe(1)
  })

  it('should skip compaction if below threshold', async () => {
    compactor = new CDCCompactor({ storage, minFilesToCompact: 5 })

    const files = [
      { key: 'events/file1.parquet', size: 1024 },
      { key: 'events/file2.parquet', size: 1024 },
    ]

    const result = await compactor.compact(files)

    expect(result.skipped).toBe(true)
    expect(result.reason).toBe('Below minimum file count threshold')
  })

  it('should track compaction metrics', async () => {
    const files = Array.from({ length: 10 }, (_, i) => ({
      key: `events/file${i}.parquet`,
      size: 1024 * 1024,
    }))

    const result = await compactor.compact(files)

    expect(result.metrics).toMatchObject({
      durationMs: expect.any(Number),
      bytesRead: expect.any(Number),
      bytesWritten: expect.any(Number),
      compressionRatio: expect.any(Number),
    })
  })
})

describe('CDCRetentionPolicy', () => {
  let retention: CDCRetentionPolicy
  let storage: CDCStorage
  let mockR2: R2Storage

  beforeEach(() => {
    mockR2 = createMockR2()
    storage = new CDCStorage({ r2: mockR2, bucket: 'cdc-events', prefix: 'events/' })
    retention = new CDCRetentionPolicy({ storage })
  })

  it('should delete events older than retention period', async () => {
    retention = new CDCRetentionPolicy({ storage, maxAgeDays: 30 })

    vi.mocked(mockR2.list).mockResolvedValue({
      objects: [
        { key: 'events/old.parquet', uploaded: Date.now() - 45 * 24 * 60 * 60 * 1000 } as R2ObjectRef,
        { key: 'events/recent.parquet', uploaded: Date.now() - 15 * 24 * 60 * 60 * 1000 } as R2ObjectRef,
      ],
      truncated: false,
      delimitedPrefixes: [],
    })

    const result = await retention.enforce()

    expect(mockR2.delete).toHaveBeenCalledWith(['events/old.parquet'])
    expect(result.deletedFiles).toBe(1)
    expect(result.retainedFiles).toBe(1)
  })

  it('should enforce maximum storage size', async () => {
    retention = new CDCRetentionPolicy({ storage, maxStorageGB: 1 })

    vi.mocked(mockR2.list).mockResolvedValue({
      objects: [
        { key: 'events/file1.parquet', size: 1024 * 1024 * 1024, uploaded: Date.now() - 10000 } as R2ObjectRef,
        { key: 'events/file2.parquet', size: 1024 * 1024 * 1024, uploaded: Date.now() } as R2ObjectRef,
      ],
      truncated: false,
      delimitedPrefixes: [],
    })

    const result = await retention.enforce()

    expect(mockR2.delete).toHaveBeenCalledWith(['events/file1.parquet'])
    expect(result.bytesFreed).toBe(1024 * 1024 * 1024)
  })

  it('should perform dry run without deleting', async () => {
    retention = new CDCRetentionPolicy({ storage, maxAgeDays: 30 })

    vi.mocked(mockR2.list).mockResolvedValue({
      objects: [
        { key: 'events/old.parquet', uploaded: Date.now() - 45 * 24 * 60 * 60 * 1000 } as R2ObjectRef,
      ],
      truncated: false,
      delimitedPrefixes: [],
    })

    const result = await retention.enforce({ dryRun: true })

    expect(mockR2.delete).not.toHaveBeenCalled()
    expect(result.dryRun).toBe(true)
    expect(result.wouldDelete).toContain('events/old.parquet')
  })

  it('should generate retention report', async () => {
    retention = new CDCRetentionPolicy({ storage, maxAgeDays: 30, maxStorageGB: 10 })

    const report = await retention.generateReport()

    expect(report).toMatchObject({
      totalFiles: expect.any(Number),
      totalSizeGB: expect.any(Number),
      oldestEvent: expect.any(Date),
      newestEvent: expect.any(Date),
      filesExpiringSoon: expect.any(Array),
      storageUsagePercent: expect.any(Number),
    })
  })
})

describe('eventsToParquet', () => {
  it('should convert events to Parquet bytes', async () => {
    const events = [createEvent(1, 'INSERT'), createEvent(2, 'UPDATE')]

    const bytes = await eventsToParquet(events)

    expect(bytes).toBeInstanceOf(ArrayBuffer)
    expect(bytes.byteLength).toBeGreaterThan(0)
  })

  it('should handle empty array', async () => {
    const bytes = await eventsToParquet([])

    expect(bytes.byteLength).toBeGreaterThan(0) // Still valid Parquet with schema
  })

  it('should preserve all event fields', async () => {
    const event: CDCEvent = {
      id: 'test-id',
      operation: 'INSERT',
      collection: 'test',
      documentId: 'doc-1',
      timestamp: 1234567890,
      sequence: 1,
      before: { old: 'value' },
      after: { new: 'value' },
      changedFields: ['field1'],
      source: 'https://test.do',
      correlationId: 'corr-123',
    }

    const bytes = await eventsToParquet([event])
    const restored = await parquetToEvents(bytes)

    expect(restored[0]).toEqual(event)
  })
})

describe('parquetToEvents', () => {
  it('should parse Parquet bytes to events', async () => {
    const original = [createEvent(1, 'INSERT'), createEvent(2, 'UPDATE')]
    const bytes = await eventsToParquet(original)

    const parsed = await parquetToEvents(bytes)

    expect(parsed).toHaveLength(2)
    expect(parsed[0].sequence).toBe(1)
    expect(parsed[1].sequence).toBe(2)
  })

  it('should preserve order', async () => {
    const original = Array.from({ length: 100 }, (_, i) => createEvent(i, 'INSERT'))
    const bytes = await eventsToParquet(original)

    const parsed = await parquetToEvents(bytes)

    for (let i = 0; i < 100; i++) {
      expect(parsed[i].sequence).toBe(i)
    }
  })
})

describe('getPartitionPath', () => {
  it('should format day granularity as year=YYYY/month=MM/day=DD', () => {
    const timestamp = new Date('2024-06-15T10:30:00Z').getTime()

    const path = getPartitionPath(timestamp, 'day')

    expect(path).toBe('year=2024/month=06/day=15')
  })

  it('should format hour granularity as year=YYYY/month=MM/day=DD/hour=HH', () => {
    const timestamp = new Date('2024-06-15T10:30:00Z').getTime()

    const path = getPartitionPath(timestamp, 'hour')

    expect(path).toBe('year=2024/month=06/day=15/hour=10')
  })

  it('should pad single digits', () => {
    const timestamp = new Date('2024-01-05T03:00:00Z').getTime()

    const path = getPartitionPath(timestamp, 'hour')

    expect(path).toBe('year=2024/month=01/day=05/hour=03')
  })
})

describe('createTableMetadata', () => {
  it('should create valid Iceberg table metadata', () => {
    const metadata = createTableMetadata({
      tableName: 'cdc_events',
      location: 's3://bucket/path',
    })

    expect(metadata.name).toBe('cdc_events')
    expect(metadata.location).toBe('s3://bucket/path')
    expect(metadata.schema).toBeDefined()
    expect(metadata.partitionSpec).toBeDefined()
    expect(metadata.snapshots).toEqual([])
  })

  it('should include CDCEvent schema', () => {
    const metadata = createTableMetadata({
      tableName: 'test',
      location: 's3://bucket/path',
    })

    const fieldNames = metadata.schema.fields.map((f) => f.name)

    expect(fieldNames).toContain('id')
    expect(fieldNames).toContain('operation')
    expect(fieldNames).toContain('collection')
    expect(fieldNames).toContain('documentId')
    expect(fieldNames).toContain('timestamp')
    expect(fieldNames).toContain('sequence')
  })
})

// Helper functions
function createEvent(
  sequence: number,
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  after?: Record<string, unknown>
): CDCEvent {
  return {
    id: `evt-${sequence}`,
    operation,
    collection: 'test',
    documentId: `doc-${sequence}`,
    timestamp: Date.now(),
    sequence,
    source: 'https://test.do',
    after: after ?? { id: `doc-${sequence}` },
  }
}

function createEventWithTimestamp(sequence: number, timestamp: Date): CDCEvent {
  return {
    id: `evt-${sequence}`,
    operation: 'INSERT',
    collection: 'test',
    documentId: `doc-${sequence}`,
    timestamp: timestamp.getTime(),
    sequence,
    source: 'https://test.do',
  }
}

function createMockR2(): R2Storage {
  const store = new Map<string, { data: ArrayBuffer; metadata: R2ObjectRef }>()

  return {
    put: vi.fn(async (key: string, value: ReadableStream | ArrayBuffer | string, options?: R2PutOptions) => {
      const data =
        value instanceof ArrayBuffer
          ? value
          : typeof value === 'string'
            ? (new TextEncoder().encode(value).buffer as ArrayBuffer)
            : (new Uint8Array(await new Response(value).arrayBuffer()).buffer as ArrayBuffer)

      const ref: R2ObjectRef = {
        key,
        bucket: 'test-bucket',
        size: data.byteLength,
        etag: `etag-${Date.now()}`,
        uploaded: Date.now(),
        httpMetadata: options?.httpMetadata,
        customMetadata: options?.customMetadata,
      }

      store.set(key, { data, metadata: ref })
      return ref
    }),

    get: vi.fn(async (key: string): Promise<R2Object | null> => {
      const item = store.get(key)
      if (!item) return null

      return {
        ...item.metadata,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(item.data))
            controller.close()
          },
        }),
        bodyUsed: false,
        arrayBuffer: async () => item.data,
        text: async () => new TextDecoder().decode(item.data),
        json: async <T>() => JSON.parse(new TextDecoder().decode(item.data)) as T,
      }
    }),

    delete: vi.fn(async (keys: string | string[]) => {
      const keyArray = Array.isArray(keys) ? keys : [keys]
      for (const key of keyArray) {
        store.delete(key)
      }
    }),

    list: vi.fn(async (options?: R2ListOptions): Promise<R2ListResult> => {
      const objects: R2ObjectRef[] = []
      for (const [key, item] of store.entries()) {
        if (!options?.prefix || key.startsWith(options.prefix)) {
          objects.push(item.metadata)
        }
      }
      return { objects, truncated: false, delimitedPrefixes: [] }
    }),

    head: vi.fn(async (key: string) => {
      const item = store.get(key)
      return item?.metadata ?? null
    }),
  }
}
