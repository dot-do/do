/**
 * CDC Streaming Tests - Epic 3: CDC Streaming
 *
 * RED PHASE: These tests define the expected behavior for CDC streaming
 * through the $context hierarchy.
 *
 * Coverage:
 * - $context chain traversal
 * - Parent notification
 * - Multi-level hierarchy
 * - Batching
 * - Buffering
 * - Back-pressure
 *
 * @module cdc/__tests__/streaming.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import {
  ContextStreamer,
  CDCRouter,
  CDCBuffer,
  CDCBatcher,
  CDCStream,
  createFanoutStreamer,
  aggregateEvents,
} from './streaming'

import type { CDCEvent, CDCBatch, CDCOptions, CDCCursor } from '../../types/storage'
import type { DigitalObjectRef } from '../../types/identity'

describe('CDC Streaming', () => {
  describe('$context chain traversal', () => {
    let router: CDCRouter

    beforeEach(() => {
      router = new CDCRouter()
    })

    it('should resolve parent DO from $context', async () => {
      const childContext = 'https://crm.headless.ly/acme'
      const parentContext = 'https://crm.headless.ly'

      router.registerDO(childContext, { $context: parentContext })

      const parent = await router.getParent(childContext)

      expect(parent).toBe(parentContext)
    })

    it('should traverse full $context chain', async () => {
      // Setup hierarchy:
      // https://crm.headless.ly/acme -> https://crm.headless.ly -> https://headless.ly -> https://startups.studio
      router.registerDO('https://crm.headless.ly/acme', {
        $context: 'https://crm.headless.ly',
      })
      router.registerDO('https://crm.headless.ly', {
        $context: 'https://headless.ly',
      })
      router.registerDO('https://headless.ly', {
        $context: 'https://startups.studio',
      })
      router.registerDO('https://startups.studio', {
        $context: undefined,
      })

      const chain = await router.getContextChain('https://crm.headless.ly/acme')

      expect(chain).toEqual([
        'https://crm.headless.ly/acme',
        'https://crm.headless.ly',
        'https://headless.ly',
        'https://startups.studio',
      ])
    })

    it('should handle root DO with no $context', async () => {
      router.registerDO('https://root.do', { $context: undefined })

      const chain = await router.getContextChain('https://root.do')

      expect(chain).toEqual(['https://root.do'])
    })

    it('should detect circular $context references', async () => {
      // Circular: A -> B -> A
      router.registerDO('https://a.do', { $context: 'https://b.do' })
      router.registerDO('https://b.do', { $context: 'https://a.do' })

      await expect(router.getContextChain('https://a.do')).rejects.toThrow(
        /circular.*context/i
      )
    })

    it('should handle missing parent gracefully', async () => {
      router.registerDO('https://orphan.do', {
        $context: 'https://nonexistent.do',
      })

      const chain = await router.getContextChain('https://orphan.do')

      expect(chain).toContain('https://orphan.do')
    })

    it('should cache context chain lookups', async () => {
      const lookupSpy = vi.fn()

      router.registerDO('https://child.do', { $context: 'https://parent.do' })
      router.registerDO('https://parent.do', { $context: undefined })
      router.onLookup(lookupSpy)

      await router.getContextChain('https://child.do')
      await router.getContextChain('https://child.do')

      expect(lookupSpy).toHaveBeenCalledTimes(2) // child + parent, but only once
    })
  })

  describe('Parent notification', () => {
    let router: CDCRouter

    beforeEach(() => {
      router = new CDCRouter()
      router.registerDO('https://tenant.app.do', {
        $context: 'https://app.do',
      })
      router.registerDO('https://app.do', {
        $context: 'https://platform.do',
      })
      router.registerDO('https://platform.do', {
        $context: undefined,
      })
    })

    it('should notify immediate parent of CDC events', async () => {
      const parentEvents: CDCEvent[] = []

      router.onEvent('https://app.do', (event) => {
        parentEvents.push(event)
      })

      const event: CDCEvent = {
        id: 'evt-1',
        operation: 'INSERT',
        collection: 'users',
        documentId: 'user-1',
        timestamp: Date.now(),
        sequence: 1,
        source: 'https://tenant.app.do',
        after: { id: 'user-1', name: 'Alice' },
      }

      await router.routeEvent('https://tenant.app.do', event)

      expect(parentEvents).toHaveLength(1)
      expect(parentEvents[0].source).toBe('https://tenant.app.do')
    })

    it('should bubble events up entire $context chain', async () => {
      const receivedAt: Record<string, CDCEvent[]> = {
        'https://app.do': [],
        'https://platform.do': [],
      }

      router.onEvent('https://app.do', (event) => {
        receivedAt['https://app.do'].push(event)
      })

      router.onEvent('https://platform.do', (event) => {
        receivedAt['https://platform.do'].push(event)
      })

      const event: CDCEvent = {
        id: 'evt-1',
        operation: 'UPDATE',
        collection: 'orders',
        documentId: 'order-1',
        timestamp: Date.now(),
        sequence: 1,
        source: 'https://tenant.app.do',
      }

      await router.routeEvent('https://tenant.app.do', event)

      expect(receivedAt['https://app.do']).toHaveLength(1)
      expect(receivedAt['https://platform.do']).toHaveLength(1)
    })

    it('should preserve original source through bubbling', async () => {
      const events: CDCEvent[] = []

      router.onEvent('https://platform.do', (event) => {
        events.push(event)
      })

      await router.routeEvent('https://tenant.app.do', {
        id: 'evt-1',
        operation: 'DELETE',
        collection: 'items',
        documentId: 'item-1',
        timestamp: Date.now(),
        sequence: 1,
        source: 'https://tenant.app.do',
      })

      expect(events[0].source).toBe('https://tenant.app.do')
    })

    it('should add routing metadata during bubbling', async () => {
      const events: CDCEvent[] = []

      router.onEvent('https://platform.do', (event) => {
        events.push(event)
      })

      await router.routeEvent('https://tenant.app.do', {
        id: 'evt-1',
        operation: 'INSERT',
        collection: 'test',
        documentId: 'doc-1',
        timestamp: Date.now(),
        sequence: 1,
        source: 'https://tenant.app.do',
      })

      expect((events[0] as CDCEvent & { _routingPath?: string[] })._routingPath).toEqual([
        'https://tenant.app.do',
        'https://app.do',
        'https://platform.do',
      ])
    })

    it('should handle parent notification failure gracefully', async () => {
      router.onEvent('https://app.do', () => {
        throw new Error('Parent unavailable')
      })

      await expect(
        router.routeEvent('https://tenant.app.do', {
          id: 'evt-1',
          operation: 'INSERT',
          collection: 'test',
          documentId: 'doc-1',
          timestamp: Date.now(),
          sequence: 1,
          source: 'https://tenant.app.do',
        })
      ).resolves.not.toThrow()
    })

    it('should support selective event forwarding', async () => {
      const events: CDCEvent[] = []

      router.onEvent(
        'https://platform.do',
        (event) => events.push(event),
        { operations: ['DELETE'] }
      )

      await router.routeEvent('https://tenant.app.do', {
        id: 'evt-1',
        operation: 'INSERT',
        collection: 'test',
        documentId: 'doc-1',
        timestamp: Date.now(),
        sequence: 1,
        source: 'https://tenant.app.do',
      })

      expect(events).toHaveLength(0)
    })
  })

  describe('Multi-level hierarchy', () => {
    let router: CDCRouter

    beforeEach(() => {
      router = new CDCRouter()
    })

    it('should handle deep hierarchies (5+ levels)', async () => {
      const levels = [
        'https://level7.do',
        'https://level6.do',
        'https://level5.do',
        'https://level4.do',
        'https://level3.do',
        'https://level2.do',
        'https://level1.do',
      ]

      for (let i = 0; i < levels.length; i++) {
        router.registerDO(levels[i], {
          $context: i < levels.length - 1 ? levels[i + 1] : undefined,
        })
      }

      const chain = await router.getContextChain('https://level7.do')

      expect(chain).toHaveLength(7)
      expect(chain[0]).toBe('https://level7.do')
      expect(chain[6]).toBe('https://level1.do')
    })

    it('should support sibling DOs with same parent', async () => {
      router.registerDO('https://parent.do', { $context: undefined })
      router.registerDO('https://child1.do', { $context: 'https://parent.do' })
      router.registerDO('https://child2.do', { $context: 'https://parent.do' })
      router.registerDO('https://child3.do', { $context: 'https://parent.do' })

      const parentEvents: CDCEvent[] = []
      router.onEvent('https://parent.do', (e) => parentEvents.push(e))

      await router.routeEvent('https://child1.do', createEvent('child1'))
      await router.routeEvent('https://child2.do', createEvent('child2'))
      await router.routeEvent('https://child3.do', createEvent('child3'))

      expect(parentEvents).toHaveLength(3)
      expect(parentEvents.map((e) => e.source)).toEqual([
        'https://child1.do',
        'https://child2.do',
        'https://child3.do',
      ])
    })

    it('should aggregate events from entire subtree', async () => {
      router.registerDO('https://root.do', { $context: undefined })
      router.registerDO('https://app1.do', { $context: 'https://root.do' })
      router.registerDO('https://app2.do', { $context: 'https://root.do' })
      router.registerDO('https://t1.do', { $context: 'https://app1.do' })
      router.registerDO('https://t2.do', { $context: 'https://app1.do' })
      router.registerDO('https://t3.do', { $context: 'https://app2.do' })

      const rootEvents: CDCEvent[] = []
      router.onEvent('https://root.do', (e) => rootEvents.push(e))

      await router.routeEvent('https://t1.do', createEvent('t1'))
      await router.routeEvent('https://t2.do', createEvent('t2'))
      await router.routeEvent('https://t3.do', createEvent('t3'))

      expect(rootEvents).toHaveLength(3)
    })

    it('should support dynamic hierarchy changes', async () => {
      router.registerDO('https://child.do', { $context: 'https://parent1.do' })
      router.registerDO('https://parent1.do', { $context: undefined })
      router.registerDO('https://parent2.do', { $context: undefined })

      const parent1Events: CDCEvent[] = []
      const parent2Events: CDCEvent[] = []

      router.onEvent('https://parent1.do', (e) => parent1Events.push(e))
      router.onEvent('https://parent2.do', (e) => parent2Events.push(e))

      await router.routeEvent('https://child.do', createEvent('before'))

      router.updateDO('https://child.do', { $context: 'https://parent2.do' })

      await router.routeEvent('https://child.do', createEvent('after'))

      expect(parent1Events).toHaveLength(1)
      expect(parent2Events).toHaveLength(1)
    })

    function createEvent(source: string): CDCEvent {
      return {
        id: `evt-${Date.now()}-${Math.random()}`,
        operation: 'INSERT',
        collection: 'test',
        documentId: 'doc-1',
        timestamp: Date.now(),
        sequence: 1,
        source: `https://${source}.do`,
      }
    }
  })

  describe('Batching', () => {
    let batcher: CDCBatcher

    beforeEach(() => {
      batcher = new CDCBatcher({
        maxBatchSize: 10,
        maxWaitMs: 100,
      })
    })

    afterEach(() => {
      batcher.close()
    })

    it('should batch events up to maxBatchSize', async () => {
      const batches: CDCBatch[] = []

      batcher.onBatch((batch) => {
        batches.push(batch)
      })

      for (let i = 0; i < 10; i++) {
        await batcher.add(createTestEvent(i))
      }

      expect(batches).toHaveLength(1)
      expect(batches[0].events).toHaveLength(10)
    })

    it('should flush batch when maxBatchSize exceeded', async () => {
      const batches: CDCBatch[] = []

      batcher.onBatch((batch) => {
        batches.push(batch)
      })

      for (let i = 0; i < 15; i++) {
        await batcher.add(createTestEvent(i))
      }

      expect(batches).toHaveLength(1)
      expect(batches[0].events).toHaveLength(10)
    })

    it('should flush batch after timeout', async () => {
      const batches: CDCBatch[] = []

      batcher.onBatch((batch) => {
        batches.push(batch)
      })

      for (let i = 0; i < 5; i++) {
        await batcher.add(createTestEvent(i))
      }

      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(batches).toHaveLength(1)
      expect(batches[0].events).toHaveLength(5)
    })

    it('should preserve event order in batches', async () => {
      const batches: CDCBatch[] = []

      batcher.onBatch((batch) => {
        batches.push(batch)
      })

      for (let i = 0; i < 10; i++) {
        await batcher.add(createTestEvent(i))
      }

      const sequences = batches[0].events.map((e) => e.sequence)

      expect(sequences).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    })

    it('should include correct cursor in batch', async () => {
      const batches: CDCBatch[] = []

      batcher.onBatch((batch) => {
        batches.push(batch)
      })

      for (let i = 0; i < 10; i++) {
        await batcher.add(createTestEvent(i))
      }

      const batch = batches[0]
      const lastEvent = batch.events[batch.events.length - 1]

      expect(batch.cursor.sequence).toBe(lastEvent.sequence)
      expect(batch.cursor.timestamp).toBe(lastEvent.timestamp)
    })

    it('should indicate hasMore when buffer not empty', async () => {
      const batches: CDCBatch[] = []

      batcher.onBatch((batch) => {
        batches.push(batch)
      })

      for (let i = 0; i < 15; i++) {
        await batcher.add(createTestEvent(i))
      }

      expect(batches[0].hasMore).toBe(true)
    })

    it('should support manual flush', async () => {
      const batches: CDCBatch[] = []

      batcher.onBatch((batch) => {
        batches.push(batch)
      })

      for (let i = 0; i < 3; i++) {
        await batcher.add(createTestEvent(i))
      }

      await batcher.flush()

      expect(batches).toHaveLength(1)
      expect(batches[0].events).toHaveLength(3)
    })

    function createTestEvent(sequence: number): CDCEvent {
      return {
        id: `evt-${sequence}`,
        operation: 'INSERT',
        collection: 'test',
        documentId: `doc-${sequence}`,
        timestamp: Date.now(),
        sequence,
        source: 'https://test.do',
      }
    }
  })

  describe('Buffering', () => {
    let buffer: CDCBuffer

    beforeEach(() => {
      buffer = new CDCBuffer({
        maxSize: 1000,
        maxMemoryMB: 10,
      })
    })

    afterEach(() => {
      buffer.clear()
    })

    it('should buffer events in memory', async () => {
      const event: CDCEvent = {
        id: 'evt-1',
        operation: 'INSERT',
        collection: 'test',
        documentId: 'doc-1',
        timestamp: Date.now(),
        sequence: 1,
      }

      await buffer.push(event)

      expect(buffer.size).toBe(1)
    })

    it('should retrieve events by sequence', async () => {
      for (let i = 0; i < 10; i++) {
        await buffer.push({
          id: `evt-${i}`,
          operation: 'INSERT',
          collection: 'test',
          documentId: `doc-${i}`,
          timestamp: Date.now(),
          sequence: i,
        })
      }

      const events = await buffer.getFromSequence(5)

      expect(events).toHaveLength(5)
      expect(events[0].sequence).toBe(5)
    })

    it('should retrieve events by timestamp', async () => {
      const baseTime = Date.now()

      for (let i = 0; i < 10; i++) {
        await buffer.push({
          id: `evt-${i}`,
          operation: 'INSERT',
          collection: 'test',
          documentId: `doc-${i}`,
          timestamp: baseTime + i * 1000,
          sequence: i,
        })
      }

      const events = await buffer.getFromTimestamp(baseTime + 5000)

      expect(events.length).toBeGreaterThanOrEqual(5)
      expect(events[0].timestamp).toBeGreaterThanOrEqual(baseTime + 5000)
    })

    it('should evict oldest events when maxSize exceeded', async () => {
      buffer = new CDCBuffer({ maxSize: 5 })

      for (let i = 0; i < 10; i++) {
        await buffer.push({
          id: `evt-${i}`,
          operation: 'INSERT',
          collection: 'test',
          documentId: `doc-${i}`,
          timestamp: Date.now(),
          sequence: i,
        })
      }

      expect(buffer.size).toBe(5)

      const events = await buffer.getAll()
      expect(events[0].sequence).toBe(5)
    })

    it('should evict events when memory limit exceeded', async () => {
      buffer = new CDCBuffer({ maxMemoryMB: 0.001 })

      const largePayload = 'x'.repeat(1000)

      for (let i = 0; i < 100; i++) {
        await buffer.push({
          id: `evt-${i}`,
          operation: 'INSERT',
          collection: 'test',
          documentId: `doc-${i}`,
          timestamp: Date.now(),
          sequence: i,
          after: { data: largePayload },
        })
      }

      expect(buffer.memoryUsageMB).toBeLessThanOrEqual(0.001)
    })

    it('should support peek without removing', async () => {
      await buffer.push({
        id: 'evt-1',
        operation: 'INSERT',
        collection: 'test',
        documentId: 'doc-1',
        timestamp: Date.now(),
        sequence: 1,
      })

      const event1 = await buffer.peek()
      const event2 = await buffer.peek()

      expect(event1).toEqual(event2)
      expect(buffer.size).toBe(1)
    })

    it('should support pop to remove oldest', async () => {
      await buffer.push({
        id: 'evt-1',
        operation: 'INSERT',
        collection: 'test',
        documentId: 'doc-1',
        timestamp: Date.now(),
        sequence: 1,
      })

      const event = await buffer.pop()

      expect(event?.id).toBe('evt-1')
      expect(buffer.size).toBe(0)
    })

    it('should track buffer statistics', async () => {
      for (let i = 0; i < 50; i++) {
        await buffer.push({
          id: `evt-${i}`,
          operation: 'INSERT',
          collection: 'test',
          documentId: `doc-${i}`,
          timestamp: Date.now(),
          sequence: i,
        })
      }

      const stats = buffer.stats()

      expect(stats.eventCount).toBe(50)
      expect(stats.memoryUsageMB).toBeGreaterThan(0)
      expect(stats.oldestSequence).toBe(0)
      expect(stats.newestSequence).toBe(49)
    })

    it('should support filtering during retrieval', async () => {
      for (let i = 0; i < 10; i++) {
        await buffer.push({
          id: `evt-${i}`,
          operation: i % 2 === 0 ? 'INSERT' : 'UPDATE',
          collection: 'test',
          documentId: `doc-${i}`,
          timestamp: Date.now(),
          sequence: i,
        })
      }

      const insertEvents = await buffer.getFiltered({
        operations: ['INSERT'],
      })

      expect(insertEvents).toHaveLength(5)
      expect(insertEvents.every((e) => e.operation === 'INSERT')).toBe(true)
    })
  })

  describe('Back-pressure', () => {
    let stream: CDCStream

    beforeEach(() => {
      stream = new CDCStream({
        highWaterMark: 100,
        lowWaterMark: 20,
      })
    })

    afterEach(() => {
      stream.close()
    })

    it('should signal back-pressure when buffer full', async () => {
      stream = new CDCStream({ highWaterMark: 10 })

      for (let i = 0; i < 10; i++) {
        await stream.write(createTestEvent(i))
      }

      expect(stream.isPaused).toBe(true)
    })

    it('should resume when buffer drains below low water mark', async () => {
      stream = new CDCStream({
        highWaterMark: 10,
        lowWaterMark: 3,
      })

      for (let i = 0; i < 10; i++) {
        await stream.write(createTestEvent(i))
      }

      expect(stream.isPaused).toBe(true)

      for (let i = 0; i < 8; i++) {
        await stream.read()
      }

      expect(stream.isPaused).toBe(false)
    })

    it('should return write pressure status', async () => {
      stream = new CDCStream({ highWaterMark: 100 })

      for (let i = 0; i < 50; i++) {
        await stream.write(createTestEvent(i))
      }

      const pressure = stream.pressure

      expect(pressure).toBeCloseTo(0.5, 1)
    })

    it('should track throughput metrics', async () => {
      stream = new CDCStream({ highWaterMark: 100 })

      for (let i = 0; i < 100; i++) {
        await stream.write(createTestEvent(i))
      }

      for (let i = 0; i < 100; i++) {
        await stream.read()
      }

      const metrics = stream.metrics()

      expect(metrics.eventsWritten).toBe(100)
      expect(metrics.eventsRead).toBe(100)
      expect(metrics.throughputPerSecond).toBeGreaterThan(0)
    })

    it('should emit drain event when buffer empties', async () => {
      stream = new CDCStream({ highWaterMark: 5 })
      const drainPromise = new Promise<void>((resolve) => {
        stream.on('drain', resolve)
      })

      for (let i = 0; i < 5; i++) {
        await stream.write(createTestEvent(i))
      }

      for (let i = 0; i < 5; i++) {
        await stream.read()
      }

      await expect(drainPromise).resolves.not.toThrow()
    })

    function createTestEvent(sequence: number): CDCEvent {
      return {
        id: `evt-${sequence}`,
        operation: 'INSERT',
        collection: 'test',
        documentId: `doc-${sequence}`,
        timestamp: Date.now(),
        sequence,
        source: 'https://test.do',
      }
    }
  })
})

describe('createFanoutStreamer', () => {
  it('should create streamer for multiple contexts', () => {
    const contexts = ['https://parent1.do', 'https://parent2.do']
    const streamer = createFanoutStreamer(contexts)

    expect(streamer.contexts).toEqual(contexts)
  })

  it('should propagate to all contexts', async () => {
    const contexts = ['https://parent1.do', 'https://parent2.do']
    const streamer = createFanoutStreamer(contexts)

    const event: CDCEvent = {
      id: 'evt-1',
      operation: 'INSERT',
      collection: 'test',
      documentId: 'doc-1',
      timestamp: Date.now(),
      sequence: 1,
    }

    const result = await streamer.propagate(event)

    expect(result.delivered).toBe(2)
  })

  it('should aggregate acknowledgments', async () => {
    const contexts = ['https://p1.do', 'https://p2.do', 'https://p3.do']
    const streamer = createFanoutStreamer(contexts)

    const result = await streamer.propagate({
      id: 'evt-1',
      operation: 'INSERT',
      collection: 'test',
      documentId: 'doc-1',
      timestamp: Date.now(),
      sequence: 1,
    })

    expect(result.acks).toHaveLength(3)
    expect(result.totalDelivered).toBe(3)
  })

  it('should handle partial failures', async () => {
    const contexts = ['https://ok.do', 'https://fail.do']
    const streamer = createFanoutStreamer(contexts, {
      onError: vi.fn(),
    })

    const result = await streamer.propagate({
      id: 'evt-1',
      operation: 'INSERT',
      collection: 'test',
      documentId: 'doc-1',
      timestamp: Date.now(),
      sequence: 1,
    })

    expect(result.partialFailure).toBe(true)
    expect(result.errors).toHaveLength(1)
  })
})

describe('aggregateEvents', () => {
  it('should group by collection', () => {
    const events: CDCEvent[] = [
      { id: '1', operation: 'INSERT', collection: 'users', documentId: 'd1', timestamp: 1, sequence: 1 },
      { id: '2', operation: 'INSERT', collection: 'orders', documentId: 'd2', timestamp: 2, sequence: 2 },
      { id: '3', operation: 'UPDATE', collection: 'users', documentId: 'd3', timestamp: 3, sequence: 3 },
    ]

    const grouped = aggregateEvents(events, { groupBy: 'collection' })

    expect(grouped['users']).toHaveLength(2)
    expect(grouped['orders']).toHaveLength(1)
  })

  it('should group by operation', () => {
    const events: CDCEvent[] = [
      { id: '1', operation: 'INSERT', collection: 'test', documentId: 'd1', timestamp: 1, sequence: 1 },
      { id: '2', operation: 'UPDATE', collection: 'test', documentId: 'd2', timestamp: 2, sequence: 2 },
      { id: '3', operation: 'INSERT', collection: 'test', documentId: 'd3', timestamp: 3, sequence: 3 },
    ]

    const grouped = aggregateEvents(events, { groupBy: 'operation' })

    expect(grouped['INSERT']).toHaveLength(2)
    expect(grouped['UPDATE']).toHaveLength(1)
  })

  it('should group by custom function', () => {
    const events: CDCEvent[] = [
      { id: '1', operation: 'INSERT', collection: 'test', documentId: 'user-1', timestamp: 1, sequence: 1 },
      { id: '2', operation: 'INSERT', collection: 'test', documentId: 'order-1', timestamp: 2, sequence: 2 },
      { id: '3', operation: 'UPDATE', collection: 'test', documentId: 'user-2', timestamp: 3, sequence: 3 },
    ]

    const grouped = aggregateEvents(events, {
      groupBy: (e) => e.documentId.split('-')[0],
    })

    expect(grouped['user']).toHaveLength(2)
    expect(grouped['order']).toHaveLength(1)
  })

  it('should create summary event per group', () => {
    const events: CDCEvent[] = [
      { id: '1', operation: 'INSERT', collection: 'users', documentId: 'd1', timestamp: 1, sequence: 1 },
      { id: '2', operation: 'INSERT', collection: 'users', documentId: 'd2', timestamp: 2, sequence: 2 },
    ]

    const summary = aggregateEvents(events, { groupBy: 'collection', summarize: true })

    expect(summary['users'].count).toBe(2)
    expect(summary['users'].firstTimestamp).toBe(1)
    expect(summary['users'].lastTimestamp).toBe(2)
  })
})
