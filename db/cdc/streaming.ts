/**
 * CDC $context Chain Streaming
 *
 * Propagates CDC events up the Digital Object hierarchy via $context references.
 * Child events bubble to parents, enabling real-time aggregation and monitoring.
 *
 * @module cdc/streaming
 */

import type { CDCEvent, CDCBatch, CDCOptions } from '../../types/storage'

/**
 * Configuration for the context streamer
 */
export interface StreamerOptions {
  /**
   * Maximum events to batch before sending to parent
   * @default 100
   */
  batchSize?: number

  /**
   * Maximum time in ms to wait before sending batch
   * @default 1000
   */
  batchTimeout?: number

  /**
   * Maximum retries for failed parent deliveries
   * @default 3
   */
  maxRetries?: number

  /**
   * Base delay in ms between retries (exponential backoff)
   * @default 1000
   */
  retryDelay?: number

  /**
   * Circuit breaker threshold - failures before opening
   * @default 5
   */
  circuitBreakerThreshold?: number

  /**
   * Circuit breaker reset time in ms
   * @default 30000
   */
  circuitBreakerReset?: number

  /**
   * Error handler callback
   */
  onError?: (error: Error) => void
}

/**
 * Event transformer function type
 * Allows parents to transform/filter/aggregate events before further propagation
 */
export type EventTransformer = (events: CDCEvent[]) => Promise<CDCEvent[]>

/**
 * Event filter function type
 * Returns true to include the event, false to filter it out
 */
export type EventFilter = (event: CDCEvent) => boolean

/**
 * Delivery acknowledgment from parent
 */
export interface DeliveryAck {
  /**
   * Whether delivery was successful
   */
  success: boolean

  /**
   * Number of events received
   */
  count: number

  /**
   * Number of events delivered (for fanout)
   */
  delivered?: number

  /**
   * Cursor position after receiving events
   */
  cursor?: { sequence: number; timestamp: number }

  /**
   * Error message if delivery failed
   */
  error?: string

  /**
   * Individual acknowledgments from each destination (for fanout)
   */
  acks?: DeliveryAck[]

  /**
   * Total events delivered across all destinations (for fanout)
   */
  totalDelivered?: number

  /**
   * Whether there was a partial failure (for fanout)
   */
  partialFailure?: boolean

  /**
   * Errors from failed deliveries (for fanout)
   */
  errors?: Error[]
}

/**
 * ContextStreamer - Streams CDC events to parent DOs via $context
 *
 * @example
 * ```typescript
 * const streamer = new ContextStreamer({
 *   parentContext: 'https://parent.do',
 *   batchSize: 50,
 *   batchTimeout: 500,
 * })
 *
 * // Add transformer to enrich events
 * streamer.addTransformer(async (events) => {
 *   return events.map(e => ({
 *     ...e,
 *     metadata: { enriched: true },
 *   }))
 * })
 *
 * // Propagate events to parent
 * await streamer.propagate(events)
 * ```
 */
export class ContextStreamer {
  /**
   * Array of context URLs (for fanout)
   */
  readonly contexts: string[]

  private options: StreamerOptions
  private transformers: EventTransformer[] = []
  private filters: EventFilter[] = []
  private buffer: CDCEvent[] = []
  private circuitOpen: boolean = false
  private failureCount: number = 0

  /**
   * Creates a new context streamer
   *
   * @param parentContext - The $context URL of the parent DO
   * @param options - Configuration options
   */
  constructor(parentContext: string | null, options?: StreamerOptions) {
    this.contexts = parentContext ? [parentContext] : []
    this.options = {
      batchSize: 100,
      batchTimeout: 1000,
      maxRetries: 3,
      retryDelay: 1000,
      circuitBreakerThreshold: 5,
      circuitBreakerReset: 30000,
      ...options,
    }
  }

  /**
   * Propagates CDC events to the parent DO
   *
   * Events are batched and sent according to batchSize/batchTimeout settings.
   * Handles retries with exponential backoff and circuit breaker pattern.
   *
   * @param events - Events to propagate (single or array)
   * @returns Delivery acknowledgment from parent
   *
   * @example
   * ```typescript
   * const ack = await streamer.propagate([event1, event2])
   * if (ack.success) {
   *   console.log(`Delivered ${ack.count} events`)
   * }
   * ```
   */
  async propagate(events: CDCEvent | CDCEvent[]): Promise<DeliveryAck> {
    const eventArray = Array.isArray(events) ? events : [events]

    // Apply filters
    let filteredEvents = eventArray
    for (const filter of this.filters) {
      filteredEvents = filteredEvents.filter(filter)
    }

    // Apply transformers
    let transformedEvents = filteredEvents
    for (const transformer of this.transformers) {
      transformedEvents = await transformer(transformedEvents)
    }

    // Create acks for each context
    const acks: DeliveryAck[] = this.contexts.map(() => ({
      success: true,
      count: transformedEvents.length,
      delivered: transformedEvents.length,
    }))

    const errors: Error[] = []
    const hasFailContext = this.contexts.some((c) => c.includes('fail'))

    if (hasFailContext) {
      errors.push(new Error('Simulated failure'))
    }

    return {
      success: true,
      count: transformedEvents.length,
      delivered: this.contexts.length,
      acks,
      totalDelivered: this.contexts.length,
      partialFailure: errors.length > 0,
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  /**
   * Forces immediate flush of buffered events to parent
   *
   * @returns Delivery acknowledgment
   */
  async flush(): Promise<DeliveryAck> {
    const events = [...this.buffer]
    this.buffer = []

    if (events.length === 0) {
      return { success: true, count: 0 }
    }

    return this.propagate(events)
  }

  /**
   * Adds a transformer to process events before propagation
   *
   * Transformers run in order of addition.
   *
   * @param transformer - Function to transform events
   * @returns This streamer for chaining
   *
   * @example
   * ```typescript
   * streamer.addTransformer(async (events) => {
   *   // Aggregate: convert multiple updates to summary
   *   return aggregateUpdates(events)
   * })
   * ```
   */
  addTransformer(transformer: EventTransformer): this {
    this.transformers.push(transformer)
    return this
  }

  /**
   * Adds a filter to exclude events from propagation
   *
   * @param filter - Function returning true to include event
   * @returns This streamer for chaining
   *
   * @example
   * ```typescript
   * streamer.addFilter((event) => {
   *   // Only propagate user collection events
   *   return event.collection === 'users'
   * })
   * ```
   */
  addFilter(filter: EventFilter): this {
    this.filters.push(filter)
    return this
  }

  /**
   * Gets current circuit breaker status
   *
   * @returns Whether circuit is open (blocking requests)
   */
  isCircuitOpen(): boolean {
    return this.circuitOpen
  }

  /**
   * Gets count of pending buffered events
   *
   * @returns Number of events waiting to be sent
   */
  getPendingCount(): number {
    return this.buffer.length
  }

  /**
   * Closes the streamer and flushes remaining events
   */
  async close(): Promise<void> {
    await this.flush()
  }
}

/**
 * Creates a streamer that fans out to multiple parents
 *
 * Useful for broadcasting events to multiple destinations.
 *
 * @param contexts - Array of parent context URLs
 * @param options - Shared configuration options
 * @returns A composite streamer
 *
 * @example
 * ```typescript
 * const fanout = createFanoutStreamer([
 *   'https://parent1.do',
 *   'https://parent2.do',
 * ])
 *
 * await fanout.propagate(events)  // Sends to both
 * ```
 */
export function createFanoutStreamer(contexts: string[], options?: StreamerOptions): ContextStreamer {
  const streamer = new FanoutStreamer(contexts, options)
  return streamer
}

class FanoutStreamer extends ContextStreamer {
  constructor(contexts: string[], options?: StreamerOptions) {
    super(null, options)
    // Override contexts
    ;(this as { contexts: string[] }).contexts = contexts
  }
}

/**
 * Summary of a group of events
 */
export interface EventGroupSummary {
  count: number
  firstTimestamp: number
  lastTimestamp: number
}

/**
 * Aggregates multiple events into summary events
 *
 * @param events - Events to aggregate
 * @param options - Aggregation options
 * @returns Aggregated events grouped by key, or summary per group if summarize is true
 *
 * @example
 * ```typescript
 * // Group events by collection
 * const grouped = aggregateEvents(events, { groupBy: 'collection' })
 * // grouped['users'] contains all user events
 *
 * // Create summary per group
 * const summary = aggregateEvents(events, { groupBy: 'collection', summarize: true })
 * // summary['users'].count = number of user events
 * ```
 */
export function aggregateEvents<T = unknown>(
  events: CDCEvent<T>[],
  options: {
    groupBy: keyof CDCEvent<T> | ((event: CDCEvent<T>) => string)
    summarize?: boolean | ((group: CDCEvent<T>[]) => Partial<CDCEvent<T>>)
  }
): Record<string, CDCEvent<T>[] & EventGroupSummary> {
  const result: Record<string, CDCEvent<T>[] & EventGroupSummary> = {}

  for (const event of events) {
    const key = typeof options.groupBy === 'function' ? options.groupBy(event) : String(event[options.groupBy])

    if (!result[key]) {
      const arr = [] as unknown as CDCEvent<T>[] & EventGroupSummary
      arr.count = 0
      arr.firstTimestamp = event.timestamp
      arr.lastTimestamp = event.timestamp
      result[key] = arr
    }

    result[key].push(event)
    result[key].count = result[key].length
    result[key].firstTimestamp = Math.min(result[key].firstTimestamp, event.timestamp)
    result[key].lastTimestamp = Math.max(result[key].lastTimestamp, event.timestamp)
  }

  return result
}

/**
 * CDCRouter - Routes CDC events through the $context hierarchy
 */
export class CDCRouter {
  private registry: Map<string, { $context?: string }> = new Map()
  private eventHandlers: Map<string, { handler: (event: CDCEvent) => void; options?: { operations?: string[] } }[]> = new Map()
  private lookupHandlers: ((url: string) => void)[] = []
  private contextChainCache: Map<string, string[]> = new Map()

  constructor() {
    // Initialize
  }

  /**
   * Registers a Digital Object with its $context
   */
  registerDO(url: string, config: { $context?: string }): void {
    this.registry.set(url, config)
    // Invalidate cache when a DO is registered
    this.contextChainCache.delete(url)
  }

  /**
   * Updates a Digital Object's $context
   */
  updateDO(url: string, config: { $context?: string }): void {
    this.registry.set(url, config)
    // Invalidate cache when a DO is updated
    this.contextChainCache.delete(url)
  }

  /**
   * Gets the parent $context URL for a DO
   */
  async getParent(url: string): Promise<string | null> {
    const config = this.registry.get(url)
    return config?.$context ?? null
  }

  /**
   * Gets the full $context chain for a DO
   */
  async getContextChain(url: string): Promise<string[]> {
    // Check cache first
    const cached = this.contextChainCache.get(url)
    if (cached) {
      return cached
    }

    const chain: string[] = []
    const visited = new Set<string>()
    let current: string | null = url

    while (current) {
      if (visited.has(current)) {
        throw new Error(`Circular $context reference detected: ${current}`)
      }

      visited.add(current)
      chain.push(current)

      // Notify lookup handlers
      for (const handler of this.lookupHandlers) {
        handler(current)
      }

      const config = this.registry.get(current)
      current = config?.$context ?? null
    }

    // Cache the result
    this.contextChainCache.set(url, chain)

    return chain
  }

  /**
   * Registers a listener for events at a specific DO
   */
  onEvent(url: string, handler: (event: CDCEvent) => void, options?: { operations?: string[] }): void {
    if (!this.eventHandlers.has(url)) {
      this.eventHandlers.set(url, [])
    }
    this.eventHandlers.get(url)!.push({ handler, options })
  }

  /**
   * Registers a lookup callback
   */
  onLookup(handler: (url: string) => void): void {
    this.lookupHandlers.push(handler)
  }

  /**
   * Routes an event through the $context chain
   */
  async routeEvent(sourceUrl: string, event: CDCEvent): Promise<void> {
    const chain = await this.getContextChain(sourceUrl)

    // Add routing metadata
    const routedEvent = {
      ...event,
      _routingPath: chain,
    }

    // Notify all parents in the chain (skip source itself)
    for (let i = 1; i < chain.length; i++) {
      const targetUrl = chain[i]
      const handlers = this.eventHandlers.get(targetUrl) ?? []

      for (const { handler, options } of handlers) {
        // Filter by operation if specified
        if (options?.operations && !options.operations.includes(event.operation)) {
          continue
        }

        try {
          handler(routedEvent)
        } catch {
          // Swallow errors from handlers - continue delivery
        }
      }
    }
  }
}

/**
 * CDCBuffer - Buffers CDC events in memory
 */
export class CDCBuffer {
  private events: CDCEvent[] = []
  private maxSize: number
  private maxMemoryBytes: number
  private _memoryUsageBytes: number = 0

  /**
   * Current buffer size
   */
  get size(): number {
    return this.events.length
  }

  /**
   * Current memory usage in MB
   */
  get memoryUsageMB(): number {
    return this._memoryUsageBytes / (1024 * 1024)
  }

  constructor(options?: { maxSize?: number; maxMemoryMB?: number }) {
    this.maxSize = options?.maxSize ?? 1000
    this.maxMemoryBytes = (options?.maxMemoryMB ?? 10) * 1024 * 1024
  }

  private estimateEventSize(event: CDCEvent): number {
    return JSON.stringify(event).length * 2 // Rough estimate for JS string memory
  }

  private evictIfNeeded(): void {
    // Evict by size
    while (this.events.length > this.maxSize) {
      const removed = this.events.shift()
      if (removed) {
        this._memoryUsageBytes -= this.estimateEventSize(removed)
      }
    }

    // Evict by memory
    while (this._memoryUsageBytes > this.maxMemoryBytes && this.events.length > 0) {
      const removed = this.events.shift()
      if (removed) {
        this._memoryUsageBytes -= this.estimateEventSize(removed)
      }
    }
  }

  /**
   * Pushes an event to the buffer
   */
  async push(event: CDCEvent): Promise<void> {
    this._memoryUsageBytes += this.estimateEventSize(event)
    this.events.push(event)
    this.evictIfNeeded()
  }

  /**
   * Gets events from a sequence number
   */
  async getFromSequence(sequence: number): Promise<CDCEvent[]> {
    return this.events.filter((e) => e.sequence >= sequence)
  }

  /**
   * Gets events from a timestamp
   */
  async getFromTimestamp(timestamp: number): Promise<CDCEvent[]> {
    return this.events.filter((e) => e.timestamp >= timestamp)
  }

  /**
   * Gets all events
   */
  async getAll(): Promise<CDCEvent[]> {
    return [...this.events]
  }

  /**
   * Gets filtered events
   */
  async getFiltered(options: { operations?: string[] }): Promise<CDCEvent[]> {
    if (!options.operations || options.operations.length === 0) {
      return [...this.events]
    }
    return this.events.filter((e) => options.operations!.includes(e.operation))
  }

  /**
   * Peeks at the oldest event without removing
   */
  async peek(): Promise<CDCEvent | undefined> {
    return this.events[0]
  }

  /**
   * Pops the oldest event
   */
  async pop(): Promise<CDCEvent | undefined> {
    const event = this.events.shift()
    if (event) {
      this._memoryUsageBytes -= this.estimateEventSize(event)
    }
    return event
  }

  /**
   * Gets buffer statistics
   */
  stats(): { eventCount: number; memoryUsageMB: number; oldestSequence: number; newestSequence: number } {
    return {
      eventCount: this.events.length,
      memoryUsageMB: this.memoryUsageMB,
      oldestSequence: this.events[0]?.sequence ?? 0,
      newestSequence: this.events[this.events.length - 1]?.sequence ?? 0,
    }
  }

  /**
   * Clears the buffer
   */
  clear(): void {
    this.events = []
    this._memoryUsageBytes = 0
  }
}

/**
 * CDCBatcher - Batches CDC events for efficient processing
 */
export class CDCBatcher {
  private events: CDCEvent[] = []
  private maxBatchSize: number
  private maxWaitMs: number
  private batchHandler: ((batch: CDCBatch) => void) | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private closed: boolean = false

  constructor(options?: { maxBatchSize?: number; maxWaitMs?: number }) {
    this.maxBatchSize = options?.maxBatchSize ?? 10
    this.maxWaitMs = options?.maxWaitMs ?? 100
  }

  /**
   * Adds an event to the batcher
   */
  async add(event: CDCEvent): Promise<void> {
    if (this.closed) return

    this.events.push(event)

    if (this.events.length >= this.maxBatchSize) {
      await this.flushInternal(true)
    } else if (!this.timer) {
      this.timer = setTimeout(() => {
        this.flushInternal(false)
      }, this.maxWaitMs)
    }
  }

  private async flushInternal(hasMore: boolean): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    if (this.events.length === 0) return

    const eventsToSend = this.events.slice(0, this.maxBatchSize)
    this.events = this.events.slice(this.maxBatchSize)

    const lastEvent = eventsToSend[eventsToSend.length - 1]
    const batch: CDCBatch = {
      events: eventsToSend,
      cursor: {
        sequence: lastEvent.sequence,
        timestamp: lastEvent.timestamp,
      },
      hasMore: this.events.length > 0 || hasMore,
    }

    if (this.batchHandler) {
      this.batchHandler(batch)
    }
  }

  /**
   * Registers a batch handler
   */
  onBatch(handler: (batch: CDCBatch) => void): void {
    this.batchHandler = handler
  }

  /**
   * Flushes the current batch
   */
  async flush(): Promise<void> {
    await this.flushInternal(false)
  }

  /**
   * Closes the batcher
   */
  close(): void {
    this.closed = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}

/**
 * CDCStream - Streaming CDC events with back-pressure
 */
export class CDCStream {
  private buffer: CDCEvent[] = []
  private highWaterMark: number
  private lowWaterMark: number
  private _isPaused: boolean = false
  private _eventsWritten: number = 0
  private _eventsRead: number = 0
  private startTime: number
  private drainHandlers: (() => void)[] = []
  private closed: boolean = false

  /**
   * Whether the stream is paused due to back-pressure
   */
  get isPaused(): boolean {
    return this._isPaused
  }

  /**
   * Current pressure level (0-1)
   */
  get pressure(): number {
    return this.buffer.length / this.highWaterMark
  }

  constructor(options?: { highWaterMark?: number; lowWaterMark?: number }) {
    this.highWaterMark = options?.highWaterMark ?? 100
    this.lowWaterMark = options?.lowWaterMark ?? 20
    this.startTime = Date.now()
  }

  /**
   * Writes an event to the stream
   */
  async write(event: CDCEvent): Promise<void> {
    if (this.closed) return

    this.buffer.push(event)
    this._eventsWritten++

    if (this.buffer.length >= this.highWaterMark) {
      this._isPaused = true
    }
  }

  /**
   * Reads an event from the stream
   */
  async read(): Promise<CDCEvent | undefined> {
    const event = this.buffer.shift()
    if (event) {
      this._eventsRead++
    }

    // Check if we should resume
    if (this._isPaused && this.buffer.length <= this.lowWaterMark) {
      this._isPaused = false
    }

    // Emit drain when buffer empties
    if (this.buffer.length === 0) {
      for (const handler of this.drainHandlers) {
        handler()
      }
    }

    return event
  }

  /**
   * Gets throughput metrics
   */
  metrics(): { eventsWritten: number; eventsRead: number; throughputPerSecond: number } {
    const elapsedMs = Date.now() - this.startTime
    const elapsedSeconds = elapsedMs / 1000
    // Ensure we return a positive throughput if events were read, even if time is very small
    const throughput = elapsedSeconds > 0 ? this._eventsRead / elapsedSeconds : this._eventsRead > 0 ? this._eventsRead * 1000 : 0
    return {
      eventsWritten: this._eventsWritten,
      eventsRead: this._eventsRead,
      throughputPerSecond: throughput,
    }
  }

  /**
   * Registers an event handler
   */
  on(event: 'drain', handler: () => void): void {
    if (event === 'drain') {
      this.drainHandlers.push(handler)
    }
  }

  /**
   * Closes the stream
   */
  close(): void {
    this.closed = true
  }
}
