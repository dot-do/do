/**
 * CDC Replay Tests - Epic 3: CDC Streaming
 *
 * RED PHASE: These tests define the expected behavior for CDC event
 * replay from storage with checkpoint management.
 *
 * Coverage:
 * - Cursor-based replay
 * - Replay from timestamp
 * - Replay from sequence
 * - Checkpoint creation
 * - Checkpoint restoration
 *
 * @module cdc/__tests__/replay.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
  EventReplayer,
  CheckpointManager,
  createSubscription,
  mergeEventStreams,
  validateSequence,
} from './replay'

import type { CDCStorage } from './storage'
import type { CDCEvent, CDCCursor, CDCOptions } from '../../types/storage'

// Mock interfaces
interface HotStorageInterface {
  getEvents(options: CDCOptions): Promise<CDCEvent[]>
  getCurrentSequence(): Promise<number>
  getOldestSequence(): Promise<number>
}

interface CheckpointStorage {
  get(subscriberId: string): Promise<Checkpoint | null>
  put(checkpoint: Checkpoint): Promise<Checkpoint>
  delete(subscriberId: string): Promise<boolean>
  list(): Promise<Checkpoint[]>
}

interface Checkpoint {
  subscriberId: string
  cursor: CDCCursor
  metadata?: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

// Mock storage factories
const createMockColdStorage = (): CDCStorage =>
  ({
    query: vi.fn(),
    listFiles: vi.fn(),
    read: vi.fn(),
    write: vi.fn(),
    list: vi.fn(),
  }) as unknown as CDCStorage

const createMockHotStorage = (): HotStorageInterface => ({
  getEvents: vi.fn(),
  getCurrentSequence: vi.fn(),
  getOldestSequence: vi.fn(),
})

const createMockCheckpointStorage = (): CheckpointStorage => ({
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  list: vi.fn(),
})

describe('EventReplayer', () => {
  let replayer: EventReplayer
  let mockColdStorage: CDCStorage
  let mockHotStorage: HotStorageInterface

  beforeEach(() => {
    mockColdStorage = createMockColdStorage()
    mockHotStorage = createMockHotStorage()
    replayer = new EventReplayer({
      coldStorage: mockColdStorage,
      hotStorage: mockHotStorage,
    })
  })

  describe('Cursor-based replay', () => {
    it('should replay events from a cursor position', async () => {
      const cursor: CDCCursor = { sequence: 100, timestamp: Date.now() - 3600000 }

      vi.mocked(mockHotStorage.getEvents).mockResolvedValue([
        createEvent(101, 'INSERT'),
        createEvent(102, 'UPDATE'),
        createEvent(103, 'DELETE'),
      ])

      const batch = await replayer.getBatch({ fromCursor: cursor, batchSize: 10 })

      expect(batch.events).toHaveLength(3)
      expect(batch.events[0].sequence).toBe(101)
      expect(batch.cursor.sequence).toBe(103)
    })

    it('should return correct cursor for next page', async () => {
      vi.mocked(mockHotStorage.getEvents).mockResolvedValue([
        createEvent(1, 'INSERT'),
        createEvent(2, 'INSERT'),
        createEvent(3, 'INSERT'),
      ])

      const batch = await replayer.getBatch({ batchSize: 3 })

      expect(batch.cursor).toEqual({
        sequence: 3,
        timestamp: batch.events[2].timestamp,
      })
    })

    it('should indicate hasMore when more events exist', async () => {
      vi.mocked(mockHotStorage.getEvents).mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => createEvent(i + 1, 'INSERT'))
      )
      vi.mocked(mockHotStorage.getCurrentSequence).mockResolvedValue(100)

      const batch = await replayer.getBatch({ batchSize: 10 })

      expect(batch.hasMore).toBe(true)
    })

    it('should indicate hasMore=false when at end', async () => {
      vi.mocked(mockHotStorage.getEvents).mockResolvedValue([createEvent(100, 'INSERT')])
      vi.mocked(mockHotStorage.getCurrentSequence).mockResolvedValue(100)

      const batch = await replayer.getBatch({ fromCursor: { sequence: 99, timestamp: 0 }, batchSize: 10 })

      expect(batch.hasMore).toBe(false)
    })

    it('should support async iteration', async () => {
      const allEvents = Array.from({ length: 25 }, (_, i) => createEvent(i + 1, 'INSERT'))

      vi.mocked(mockHotStorage.getEvents)
        .mockResolvedValueOnce(allEvents.slice(0, 10))
        .mockResolvedValueOnce(allEvents.slice(10, 20))
        .mockResolvedValueOnce(allEvents.slice(20, 25))
        .mockResolvedValueOnce([])

      vi.mocked(mockHotStorage.getCurrentSequence).mockResolvedValue(25)

      const events: CDCEvent[] = []
      for await (const batch of replayer.replay({ batchSize: 10 })) {
        events.push(...batch.events)
        if (!batch.hasMore) break
      }

      expect(events).toHaveLength(25)
    })
  })

  describe('Replay from timestamp', () => {
    it('should replay events from a specific timestamp', async () => {
      const startTime = Date.now() - 3600000 // 1 hour ago

      vi.mocked(mockColdStorage.query).mockResolvedValue({
        events: [
          createEventWithTimestamp(1, startTime + 1000),
          createEventWithTimestamp(2, startTime + 2000),
        ],
        cursor: { sequence: 2, timestamp: startTime + 2000 },
        hasMore: false,
      })

      const batch = await replayer.getBatch({ fromTimestamp: startTime })

      expect(batch.events).toHaveLength(2)
      expect(batch.events[0].timestamp).toBeGreaterThan(startTime)
    })

    it('should merge hot and cold storage for timestamp replay', async () => {
      const startTime = Date.now() - 3600000

      vi.mocked(mockColdStorage.query).mockResolvedValue({
        events: [createEventWithTimestamp(1, startTime + 1000)],
        cursor: { sequence: 1, timestamp: startTime + 1000 },
        hasMore: false,
      })

      vi.mocked(mockHotStorage.getEvents).mockResolvedValue([
        createEventWithTimestamp(2, startTime + 2000),
        createEventWithTimestamp(3, startTime + 3000),
      ])

      vi.mocked(mockHotStorage.getOldestSequence).mockResolvedValue(1)

      const batch = await replayer.getBatch({ fromTimestamp: startTime })

      expect(batch.events).toHaveLength(3)
    })

    it('should filter events before timestamp', async () => {
      const startTime = Date.now()

      vi.mocked(mockHotStorage.getEvents).mockResolvedValue([
        createEventWithTimestamp(1, startTime - 1000), // Before - should be filtered
        createEventWithTimestamp(2, startTime + 1000), // After - should be included
      ])

      const batch = await replayer.getBatch({ fromTimestamp: startTime })

      expect(batch.events).toHaveLength(1)
      expect(batch.events[0].sequence).toBe(2)
    })
  })

  describe('Replay from sequence', () => {
    it('should replay events from a specific sequence number', async () => {
      vi.mocked(mockHotStorage.getEvents).mockResolvedValue([
        createEvent(101, 'INSERT'),
        createEvent(102, 'UPDATE'),
        createEvent(103, 'DELETE'),
      ])

      const batch = await replayer.getBatch({ fromSequence: 100 })

      expect(batch.events).toHaveLength(3)
      expect(batch.events[0].sequence).toBe(101)
    })

    it('should query cold storage for old sequences', async () => {
      vi.mocked(mockHotStorage.getOldestSequence).mockResolvedValue(1000)

      vi.mocked(mockColdStorage.query).mockResolvedValue({
        events: [createEvent(500, 'INSERT'), createEvent(501, 'UPDATE')],
        cursor: { sequence: 501, timestamp: Date.now() },
        hasMore: true,
      })

      const batch = await replayer.getBatch({ fromSequence: 499 })

      expect(mockColdStorage.query).toHaveBeenCalled()
      expect(batch.events[0].sequence).toBe(500)
    })

    it('should handle sequence gaps gracefully', async () => {
      vi.mocked(mockHotStorage.getEvents).mockResolvedValue([
        createEvent(100, 'INSERT'),
        createEvent(105, 'INSERT'), // Gap: 101-104 missing
        createEvent(106, 'INSERT'),
      ])

      const batch = await replayer.getBatch({ fromSequence: 99 })

      expect(batch.events).toHaveLength(3)
    })
  })

  describe('Filtering', () => {
    it('should filter by collections', async () => {
      vi.mocked(mockHotStorage.getEvents).mockResolvedValue([
        { ...createEvent(1, 'INSERT'), collection: 'users' },
        { ...createEvent(2, 'INSERT'), collection: 'orders' },
        { ...createEvent(3, 'INSERT'), collection: 'users' },
      ])

      const batch = await replayer.getBatch({ collections: ['users'] })

      expect(batch.events).toHaveLength(2)
      expect(batch.events.every((e) => e.collection === 'users')).toBe(true)
    })

    it('should filter by operations', async () => {
      vi.mocked(mockHotStorage.getEvents).mockResolvedValue([
        createEvent(1, 'INSERT'),
        createEvent(2, 'UPDATE'),
        createEvent(3, 'DELETE'),
        createEvent(4, 'INSERT'),
      ])

      const batch = await replayer.getBatch({ operations: ['INSERT', 'UPDATE'] })

      expect(batch.events).toHaveLength(3)
      expect(batch.events.every((e) => e.operation !== 'DELETE')).toBe(true)
    })

    it('should apply multiple filters together', async () => {
      vi.mocked(mockHotStorage.getEvents).mockResolvedValue([
        { ...createEvent(1, 'INSERT'), collection: 'users' },
        { ...createEvent(2, 'UPDATE'), collection: 'users' },
        { ...createEvent(3, 'INSERT'), collection: 'orders' },
        { ...createEvent(4, 'DELETE'), collection: 'users' },
      ])

      const batch = await replayer.getBatch({
        collections: ['users'],
        operations: ['INSERT', 'UPDATE'],
      })

      expect(batch.events).toHaveLength(2)
    })
  })

  describe('Progress tracking', () => {
    it('should report replay progress', async () => {
      vi.mocked(mockHotStorage.getCurrentSequence).mockResolvedValue(1000)

      const progress = await replayer.getProgress({ sequence: 500, timestamp: Date.now() })

      expect(progress).toMatchObject({
        currentSequence: 500,
        latestSequence: 1000,
        eventsRemaining: 500,
        percentComplete: 50,
      })
    })

    it('should call onProgress callback during replay', async () => {
      const onProgress = vi.fn()

      vi.mocked(mockHotStorage.getEvents)
        .mockResolvedValueOnce(Array.from({ length: 10 }, (_, i) => createEvent(i + 1, 'INSERT')))
        .mockResolvedValueOnce([])

      vi.mocked(mockHotStorage.getCurrentSequence).mockResolvedValue(10)

      await replayer.replayWithHandler(async () => {}, { onProgress })

      expect(onProgress).toHaveBeenCalled()
    })

    it('should estimate replay time', async () => {
      vi.mocked(mockHotStorage.getCurrentSequence).mockResolvedValue(10000)

      const estimate = await replayer.estimateReplayTime(
        { sequence: 0, timestamp: 0 },
        { eventsPerSecond: 1000 }
      )

      expect(estimate.estimatedSeconds).toBeCloseTo(10, 0)
    })
  })
})

describe('CheckpointManager', () => {
  let manager: CheckpointManager
  let mockStorage: CheckpointStorage

  beforeEach(() => {
    mockStorage = createMockCheckpointStorage()
    manager = new CheckpointManager(mockStorage)
  })

  describe('Checkpoint creation', () => {
    it('should save a checkpoint with cursor', async () => {
      const cursor: CDCCursor = { sequence: 100, timestamp: Date.now() }

      vi.mocked(mockStorage.put).mockImplementation(async (cp) => cp)

      const checkpoint = await manager.save('subscriber-1', cursor)

      expect(checkpoint.subscriberId).toBe('subscriber-1')
      expect(checkpoint.cursor).toEqual(cursor)
      expect(checkpoint.createdAt).toBeDefined()
      expect(checkpoint.updatedAt).toBeDefined()
    })

    it('should include metadata if provided', async () => {
      const cursor: CDCCursor = { sequence: 100, timestamp: Date.now() }
      const metadata = { processedCount: 1000, lastError: null }

      vi.mocked(mockStorage.put).mockImplementation(async (cp) => cp)

      const checkpoint = await manager.save('subscriber-1', cursor, metadata)

      expect(checkpoint.metadata).toEqual(metadata)
    })

    it('should update existing checkpoint', async () => {
      const existingCheckpoint: Checkpoint = {
        subscriberId: 'subscriber-1',
        cursor: { sequence: 50, timestamp: Date.now() - 10000 },
        createdAt: Date.now() - 60000,
        updatedAt: Date.now() - 10000,
      }

      vi.mocked(mockStorage.get).mockResolvedValue(existingCheckpoint)
      vi.mocked(mockStorage.put).mockImplementation(async (cp) => cp)

      const newCursor: CDCCursor = { sequence: 100, timestamp: Date.now() }
      const checkpoint = await manager.save('subscriber-1', newCursor)

      expect(checkpoint.cursor.sequence).toBe(100)
      expect(checkpoint.createdAt).toBe(existingCheckpoint.createdAt)
      expect(checkpoint.updatedAt).toBeGreaterThan(existingCheckpoint.updatedAt)
    })
  })

  describe('Checkpoint restoration', () => {
    it('should get checkpoint by subscriber ID', async () => {
      const storedCheckpoint: Checkpoint = {
        subscriberId: 'subscriber-1',
        cursor: { sequence: 100, timestamp: Date.now() },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      vi.mocked(mockStorage.get).mockResolvedValue(storedCheckpoint)

      const checkpoint = await manager.get('subscriber-1')

      expect(checkpoint).toEqual(storedCheckpoint)
    })

    it('should return null for non-existent checkpoint', async () => {
      vi.mocked(mockStorage.get).mockResolvedValue(null)

      const checkpoint = await manager.get('non-existent')

      expect(checkpoint).toBeNull()
    })

    it('should list all checkpoints', async () => {
      const checkpoints: Checkpoint[] = [
        {
          subscriberId: 'sub-1',
          cursor: { sequence: 100, timestamp: Date.now() },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          subscriberId: 'sub-2',
          cursor: { sequence: 200, timestamp: Date.now() },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]

      vi.mocked(mockStorage.list).mockResolvedValue(checkpoints)

      const result = await manager.list()

      expect(result).toHaveLength(2)
    })
  })

  describe('Checkpoint deletion', () => {
    it('should delete checkpoint', async () => {
      vi.mocked(mockStorage.delete).mockResolvedValue(true)

      const result = await manager.delete('subscriber-1')

      expect(result).toBe(true)
      expect(mockStorage.delete).toHaveBeenCalledWith('subscriber-1')
    })

    it('should return false if checkpoint did not exist', async () => {
      vi.mocked(mockStorage.delete).mockResolvedValue(false)

      const result = await manager.delete('non-existent')

      expect(result).toBe(false)
    })
  })

  describe('Lagging checkpoint detection', () => {
    it('should find checkpoints behind threshold', async () => {
      const currentCursor: CDCCursor = { sequence: 1000, timestamp: Date.now() }
      const checkpoints: Checkpoint[] = [
        {
          subscriberId: 'fast',
          cursor: { sequence: 990, timestamp: Date.now() },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          subscriberId: 'slow',
          cursor: { sequence: 500, timestamp: Date.now() },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          subscriberId: 'very-slow',
          cursor: { sequence: 100, timestamp: Date.now() },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]

      vi.mocked(mockStorage.list).mockResolvedValue(checkpoints)

      const lagging = await manager.getLagging(currentCursor, { minLagSequence: 100 })

      expect(lagging).toHaveLength(2)
      expect(lagging.map((c) => c.subscriberId)).toEqual(['slow', 'very-slow'])
    })
  })
})

describe('createSubscription', () => {
  it('should create subscription with handler', () => {
    const handler = vi.fn()
    const subscription = createSubscription({
      subscriberId: 'test-sub',
      handler,
    })

    expect(subscription.subscriberId).toBe('test-sub')
    expect(subscription.status).toBe('stopped')
  })

  it('should start processing events', async () => {
    const handler = vi.fn()
    const subscription = createSubscription({
      subscriberId: 'test-sub',
      handler,
    })

    await subscription.start()

    expect(subscription.status).toBe('running')
  })

  it('should stop processing', async () => {
    const handler = vi.fn()
    const subscription = createSubscription({
      subscriberId: 'test-sub',
      handler,
    })

    await subscription.start()
    await subscription.stop()

    expect(subscription.status).toBe('stopped')
  })

  it('should pause and resume', async () => {
    const handler = vi.fn()
    const subscription = createSubscription({
      subscriberId: 'test-sub',
      handler,
    })

    await subscription.start()
    await subscription.pause()

    expect(subscription.status).toBe('paused')

    await subscription.resume()

    expect(subscription.status).toBe('running')
  })

  it('should call handler for each batch', async () => {
    const handler = vi.fn()
    const mockReplayer = {
      replay: vi.fn().mockImplementation(async function* () {
        yield {
          events: [createEvent(1, 'INSERT')],
          cursor: { sequence: 1, timestamp: Date.now() },
          hasMore: false,
        }
      }),
    }

    const subscription = createSubscription({
      subscriberId: 'test-sub',
      handler,
      replayer: mockReplayer as unknown as EventReplayer,
    })

    await subscription.start()
    await new Promise((resolve) => setTimeout(resolve, 100))
    await subscription.stop()

    expect(handler).toHaveBeenCalled()
  })

  it('should handle errors gracefully', async () => {
    const onError = vi.fn()
    const handler = vi.fn().mockRejectedValue(new Error('Handler error'))

    const subscription = createSubscription({
      subscriberId: 'test-sub',
      handler,
      onError,
    })

    await subscription.start()
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(onError).toHaveBeenCalled()
  })
})

describe('mergeEventStreams', () => {
  it('should merge in sequence order', () => {
    const hot: CDCEvent[] = [createEvent(2, 'INSERT'), createEvent(4, 'INSERT')]
    const cold: CDCEvent[] = [createEvent(1, 'INSERT'), createEvent(3, 'INSERT')]

    const merged = mergeEventStreams(hot, cold)

    expect(merged.map((e) => e.sequence)).toEqual([1, 2, 3, 4])
  })

  it('should handle empty hot stream', () => {
    const hot: CDCEvent[] = []
    const cold: CDCEvent[] = [createEvent(1, 'INSERT'), createEvent(2, 'INSERT')]

    const merged = mergeEventStreams(hot, cold)

    expect(merged).toHaveLength(2)
  })

  it('should handle empty cold stream', () => {
    const hot: CDCEvent[] = [createEvent(1, 'INSERT'), createEvent(2, 'INSERT')]
    const cold: CDCEvent[] = []

    const merged = mergeEventStreams(hot, cold)

    expect(merged).toHaveLength(2)
  })

  it('should deduplicate by event ID', () => {
    const event = createEvent(1, 'INSERT')
    const hot: CDCEvent[] = [event]
    const cold: CDCEvent[] = [event] // Same event in both

    const merged = mergeEventStreams(hot, cold)

    expect(merged).toHaveLength(1)
  })

  it('should prefer hot events for duplicates', () => {
    const hotEvent = { ...createEvent(1, 'INSERT'), source: 'hot' }
    const coldEvent = { ...createEvent(1, 'INSERT'), id: hotEvent.id, source: 'cold' }

    const hot: CDCEvent[] = [hotEvent]
    const cold: CDCEvent[] = [coldEvent]

    const merged = mergeEventStreams(hot, cold)

    expect(merged[0].source).toBe('hot')
  })

  it('should handle interleaved sequences', () => {
    const hot: CDCEvent[] = [
      createEvent(1, 'INSERT'),
      createEvent(3, 'INSERT'),
      createEvent(5, 'INSERT'),
    ]
    const cold: CDCEvent[] = [
      createEvent(2, 'INSERT'),
      createEvent(4, 'INSERT'),
      createEvent(6, 'INSERT'),
    ]

    const merged = mergeEventStreams(hot, cold)

    expect(merged.map((e) => e.sequence)).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe('validateSequence', () => {
  it('should return valid for sequential events', () => {
    const events = [
      createEvent(1, 'INSERT'),
      createEvent(2, 'INSERT'),
      createEvent(3, 'INSERT'),
    ]

    const result = validateSequence(events)

    expect(result.valid).toBe(true)
    expect(result.gaps).toEqual([])
  })

  it('should detect gaps', () => {
    const events = [createEvent(1, 'INSERT'), createEvent(5, 'INSERT')] // Gap: 2,3,4

    const result = validateSequence(events)

    expect(result.valid).toBe(false)
    expect(result.gaps).toContainEqual({ start: 2, end: 4 })
  })

  it('should report multiple gap ranges', () => {
    const events = [
      createEvent(1, 'INSERT'),
      createEvent(5, 'INSERT'), // Gap: 2-4
      createEvent(10, 'INSERT'), // Gap: 6-9
    ]

    const result = validateSequence(events)

    expect(result.gaps).toHaveLength(2)
    expect(result.gaps).toContainEqual({ start: 2, end: 4 })
    expect(result.gaps).toContainEqual({ start: 6, end: 9 })
  })

  it('should handle empty array', () => {
    const result = validateSequence([])

    expect(result.valid).toBe(true)
    expect(result.gaps).toEqual([])
  })

  it('should handle single event', () => {
    const events = [createEvent(1, 'INSERT')]

    const result = validateSequence(events)

    expect(result.valid).toBe(true)
    expect(result.gaps).toEqual([])
  })

  it('should handle out-of-order events', () => {
    const events = [
      createEvent(3, 'INSERT'),
      createEvent(1, 'INSERT'),
      createEvent(2, 'INSERT'),
    ]

    const result = validateSequence(events)

    // Should sort and validate
    expect(result.valid).toBe(true)
  })
})

// Helper functions
function createEvent(
  sequence: number,
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
): CDCEvent {
  return {
    id: `evt-${sequence}`,
    operation,
    collection: 'test',
    documentId: `doc-${sequence}`,
    timestamp: Date.now(),
    sequence,
    source: 'https://test.do',
  }
}

function createEventWithTimestamp(sequence: number, timestamp: number): CDCEvent {
  return {
    id: `evt-${sequence}`,
    operation: 'INSERT',
    collection: 'test',
    documentId: `doc-${sequence}`,
    timestamp,
    sequence,
    source: 'https://test.do',
  }
}
