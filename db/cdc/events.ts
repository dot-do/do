/**
 * CDC Event Generation
 *
 * Generates Change Data Capture events for all mutations within a Digital Object.
 * Events capture INSERT, UPDATE, DELETE operations with before/after state.
 *
 * @module cdc/events
 */

import type { CDCEvent, CDCOperation, CDCCursor, CDCOptions, CDCBatch } from '../../types/storage'

/**
 * Configuration options for the CDC event emitter
 */
export interface CDCEmitterOptions {
  /**
   * Whether to include full document in before/after fields
   * @default true
   */
  includeDocuments?: boolean

  /**
   * Whether to compute and include changed fields for UPDATE operations
   * @default true
   */
  includeChangedFields?: boolean

  /**
   * Source identifier for this DO (usually the $id)
   */
  source?: string

  /**
   * Collection name for events
   */
  collection?: string

  /**
   * Starting sequence number
   * @default 0
   */
  startSequence?: number

  /**
   * Maximum events to buffer before forcing a flush
   * @default 100
   */
  bufferSize?: number

  /**
   * Maximum time in ms to buffer events before flushing
   * @default 1000
   */
  bufferTimeout?: number

  /**
   * Maximum events per batch
   * @default 100
   */
  batchSize?: number

  /**
   * Maximum time in ms to wait before sending batch
   * @default 1000
   */
  batchTimeout?: number
}

/**
 * Callback invoked when events are ready to be processed
 * Return value is ignored - can return void, Promise, or any other value
 */
export type CDCEventHandler = (events: CDCEvent[]) => unknown

/**
 * CDCEventEmitter - Generates CDC events for mutations
 *
 * @example
 * ```typescript
 * const emitter = new CDCEventEmitter({
 *   source: 'https://my.do',
 *   includeDocuments: true,
 * })
 *
 * // Emit an INSERT event
 * const event = await emitter.emit('INSERT', 'users', 'user-123', {
 *   after: { name: 'Alice', email: 'alice@example.com' },
 * })
 *
 * // Emit an UPDATE event
 * const updateEvent = await emitter.emit('UPDATE', 'users', 'user-123', {
 *   before: { name: 'Alice', email: 'alice@example.com' },
 *   after: { name: 'Alice Smith', email: 'alice@example.com' },
 * })
 *
 * // Emit a DELETE event
 * const deleteEvent = await emitter.emit('DELETE', 'users', 'user-123', {
 *   before: { name: 'Alice Smith', email: 'alice@example.com' },
 * })
 * ```
 */
export class CDCEventEmitter {
  private options: CDCEmitterOptions
  private sequence: number
  private lastTimestamp: number = 0
  private buffer: CDCEvent[] = []
  private batchHandlers: CDCEventHandler[] = []
  private batchTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Creates a new CDC event emitter
   *
   * @param options - Configuration options
   */
  constructor(options?: CDCEmitterOptions) {
    this.options = {
      includeDocuments: true,
      includeChangedFields: true,
      batchSize: 100,
      batchTimeout: 1000,
      startSequence: 0,
      ...options,
    }
    this.sequence = this.options.startSequence ?? 0
  }

  /**
   * Emits a CDC event for a mutation
   *
   * @param operation - The type of mutation (INSERT, UPDATE, DELETE)
   * @param data - The before/after state data with optional correlation ID
   * @returns The generated CDC event
   *
   * @example
   * ```typescript
   * const event = await emitter.emit('UPDATE', {
   *   before: { id: 'prod-456', price: 99 },
   *   after: { id: 'prod-456', price: 79 },
   *   correlationId: 'req-789',
   * })
   * ```
   */
  async emit<T extends { id: string }>(
    operation: CDCOperation,
    data: { before?: T; after?: T; correlationId?: string }
  ): Promise<CDCEvent<T>> {
    const documentId = data.after?.id ?? data.before?.id ?? ''
    const currentSequence = this.sequence++

    let changedFields: string[] | undefined
    if (operation === 'UPDATE' && data.before && data.after && this.options.includeChangedFields) {
      changedFields = computeChangedFields(data.before as Record<string, unknown>, data.after as Record<string, unknown>)
    }

    const event = createEvent<T>({
      operation,
      collection: this.options.collection ?? '',
      documentId,
      sequence: currentSequence,
      before: operation === 'INSERT' ? undefined : data.before,
      after: operation === 'DELETE' ? undefined : data.after,
      source: this.options.source,
      correlationId: data.correlationId,
      changedFields,
    })

    this.lastTimestamp = event.timestamp

    // Add to buffer for batching
    this.buffer.push(event as CDCEvent)

    // Check if we need to flush
    if (this.options.batchSize && this.buffer.length >= this.options.batchSize) {
      await this.flushBatch()
    } else if (this.options.batchTimeout && !this.batchTimer && this.batchHandlers.length > 0) {
      this.batchTimer = setTimeout(() => {
        this.flushBatch()
      }, this.options.batchTimeout)
    }

    return event
  }

  /**
   * Registers a handler for batched events
   *
   * @param handler - Callback invoked with batches of events
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = emitter.onBatch(async (events) => {
   *   await streamer.propagate(events)
   * })
   * ```
   */
  onBatch(handler: CDCEventHandler): () => void {
    this.batchHandlers.push(handler)
    return () => {
      const index = this.batchHandlers.indexOf(handler)
      if (index >= 0) {
        this.batchHandlers.splice(index, 1)
      }
    }
  }

  private async flushBatch(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }

    if (this.buffer.length === 0) {
      return
    }

    const events = [...this.buffer]
    this.buffer = []

    for (const handler of this.batchHandlers) {
      try {
        await handler(events)
      } catch {
        // Ignore errors from handlers
      }
    }
  }

  /**
   * Forces immediate flush of buffered events
   *
   * @returns The flushed events
   */
  async flush(): Promise<CDCEvent[]> {
    const events = [...this.buffer]
    await this.flushBatch()
    return events
  }

  /**
   * Gets the current sequence number
   *
   * @returns The current sequence number
   */
  getSequence(): number {
    return this.sequence
  }

  /**
   * Gets the current cursor position
   *
   * @returns The current cursor
   */
  getCursor(): CDCCursor {
    return {
      sequence: this.sequence - 1,
      timestamp: this.lastTimestamp,
    }
  }
}

/**
 * Computes the list of fields that changed between two objects
 *
 * @param before - Object state before the change
 * @param after - Object state after the change
 * @returns Array of field names that changed
 *
 * @example
 * ```typescript
 * const changed = computeChangedFields(
 *   { name: 'Alice', age: 30 },
 *   { name: 'Alice', age: 31 }
 * )
 * // Returns: ['age']
 * ```
 */
export function computeChangedFields(before: Record<string, unknown>, after: Record<string, unknown>, prefix: string = ''): string[] {
  const changes: string[] = []
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)])

  for (const key of allKeys) {
    const fieldPath = prefix ? `${prefix}.${key}` : key
    const beforeVal = before[key]
    const afterVal = after[key]

    // Field was added or removed
    if (!(key in before) || !(key in after)) {
      changes.push(fieldPath)
      continue
    }

    // Both are arrays
    if (Array.isArray(beforeVal) && Array.isArray(afterVal)) {
      if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
        changes.push(fieldPath)
      }
      continue
    }

    // Both are objects (but not arrays or null)
    if (
      beforeVal !== null &&
      afterVal !== null &&
      typeof beforeVal === 'object' &&
      typeof afterVal === 'object' &&
      !Array.isArray(beforeVal) &&
      !Array.isArray(afterVal)
    ) {
      const nestedChanges = computeChangedFields(beforeVal as Record<string, unknown>, afterVal as Record<string, unknown>, fieldPath)
      changes.push(...nestedChanges)
      continue
    }

    // Primitive comparison
    if (beforeVal !== afterVal) {
      changes.push(fieldPath)
    }
  }

  return changes
}

/**
 * Generates a unique event ID
 *
 * @returns A unique event ID (UUID v4)
 */
export function generateEventId(): string {
  return crypto.randomUUID()
}

/**
 * Creates a CDC event from raw data
 *
 * @param params - Event parameters
 * @returns A fully populated CDC event
 */
export function createEvent<T>(params: {
  operation: CDCOperation
  collection: string
  documentId: string
  sequence: number
  before?: T
  after?: T
  source?: string
  correlationId?: string
  includeChangedFields?: boolean
  changedFields?: string[]
}): CDCEvent<T> {
  const event: CDCEvent<T> = {
    id: generateEventId(),
    operation: params.operation,
    collection: params.collection,
    documentId: params.documentId,
    timestamp: Date.now(),
    sequence: params.sequence,
  }

  if (params.before !== undefined) {
    event.before = params.before
  }

  if (params.after !== undefined) {
    event.after = params.after
  }

  if (params.changedFields !== undefined && params.changedFields.length > 0) {
    event.changedFields = params.changedFields
  }

  if (params.source !== undefined) {
    event.source = params.source
  }

  if (params.correlationId !== undefined) {
    event.correlationId = params.correlationId
  }

  return event
}
