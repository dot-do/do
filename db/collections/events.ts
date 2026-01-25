/**
 * Event Collection - Immutable event storage for Digital Objects
 *
 * @module collections/events
 *
 * @description
 * Manages immutable Events within a Digital Object. Events are records of
 * things that happened and CANNOT be modified or deleted after creation.
 * This provides a complete audit trail and enables event sourcing patterns.
 *
 * Events are different from Actions:
 * - Actions are MUTABLE (have lifecycle: pending -> running -> completed)
 * - Events are IMMUTABLE (once created, never changed)
 *
 * Events support correlation and causation tracking:
 * - correlationId: Links events to the same business transaction (e.g., action ID)
 * - causationId: Links events in a causal chain (event A caused event B)
 *
 * @example
 * ```typescript
 * const events = new EventCollection(storage)
 *
 * // Emit an event
 * const event = await events.emit({
 *   type: 'function.completed',
 *   payload: { actionId: 'action_123', output: { result: 'success' } },
 *   source: 'execution-manager',
 *   correlationId: 'action_123'
 * })
 *
 * // Query events
 * const actionEvents = await events.findByActionId('action_123')
 * const completedEvents = await events.findByType('function.completed')
 * ```
 */

import type { Event, ListOptions, ListResult } from '../../types/collections'
import { DOStorage } from './base'

/**
 * Options for emitting an event
 */
export interface EmitEventOptions<T = unknown> {
  /**
   * Event type (e.g., 'function.completed', 'user.created')
   */
  type: string

  /**
   * Event payload data
   */
  payload: T

  /**
   * Source of the event (e.g., 'execution-manager', 'user-service')
   */
  source: string

  /**
   * Correlation ID - links events to the same business transaction
   * Often the action ID that triggered this event
   */
  correlationId?: string

  /**
   * Causation ID - ID of the event that caused this event
   * Creates a chain of causation for event sourcing
   */
  causationId?: string

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>
}

/**
 * Event Collection - Immutable event storage
 *
 * @description
 * Provides immutable event storage with no update or delete methods.
 * Events can only be created (emitted) and queried.
 *
 * Key design principles:
 * 1. IMMUTABLE: No update() or delete() methods
 * 2. Append-only: Events can only be added, never removed
 * 3. Timestamped: All events have creation timestamp
 * 4. Traceable: Support for correlation and causation IDs
 *
 * @example
 * ```typescript
 * const events = new EventCollection(storage)
 *
 * // Emit events
 * const started = await events.emit({
 *   type: 'workflow.started',
 *   payload: { workflowId: 'wf_123' },
 *   source: 'workflow-engine'
 * })
 *
 * const completed = await events.emit({
 *   type: 'step.completed',
 *   payload: { stepId: 'step_1', output: {} },
 *   source: 'workflow-engine',
 *   causationId: started.id
 * })
 *
 * // Query by type
 * const allCompleted = await events.findByType('step.completed')
 * ```
 */
export class EventCollection {
  /**
   * Storage interface
   */
  protected readonly storage: DOStorage

  /**
   * Collection name for storage keys
   */
  protected readonly name = 'events'

  /**
   * ID prefix for generated event IDs
   */
  protected readonly idPrefix = 'event'

  /**
   * Create a new EventCollection instance
   *
   * @param storage - DO storage interface
   */
  constructor(storage: DOStorage) {
    this.storage = storage
  }

  /**
   * Generate a unique ID for a new event
   *
   * @returns A unique ID in format 'event_{random}'
   */
  protected generateId(): string {
    const random = Math.random().toString(36).substring(2, 15)
    return `${this.idPrefix}_${random}`
  }

  /**
   * Get current timestamp in Unix milliseconds
   *
   * @returns Current time as Unix timestamp (ms)
   */
  protected now(): number {
    return Date.now()
  }

  /**
   * Emit (create) a new event
   *
   * @description
   * Creates an immutable event record. Once created, the event cannot
   * be modified or deleted. The event is assigned an auto-generated ID
   * and timestamp.
   *
   * @param options - Event creation options
   * @returns The created event with ID and timestamp
   *
   * @example
   * ```typescript
   * const event = await events.emit({
   *   type: 'user.created',
   *   payload: { userId: 'user_123', email: 'test@example.com' },
   *   source: 'user-service',
   *   correlationId: 'request_456'
   * })
   * ```
   */
  async emit<T = unknown>(options: EmitEventOptions<T>): Promise<Event<T>> {
    const id = this.generateId()
    const timestamp = this.now()

    const event: Event<T> = {
      id,
      type: options.type,
      payload: options.payload,
      source: options.source,
      timestamp,
      correlationId: options.correlationId,
      causationId: options.causationId,
      metadata: options.metadata,
    }

    const key = `${this.name}:${id}`
    await this.storage.put(key, event)

    return event
  }

  /**
   * Get an event by ID
   *
   * @param id - Event ID
   * @returns The event or undefined if not found
   *
   * @example
   * ```typescript
   * const event = await events.get('event_abc123')
   * if (event) {
   *   console.log(event.type, event.payload)
   * }
   * ```
   */
  async get<T = unknown>(id: string): Promise<Event<T> | undefined> {
    if (!id) return undefined
    const key = `${this.name}:${id}`
    return this.storage.get<Event<T>>(key)
  }

  /**
   * List all events with pagination
   *
   * @param options - List options (limit, offset, cursor)
   * @returns Paginated list of events
   *
   * @example
   * ```typescript
   * const result = await events.list({ limit: 10 })
   * console.log(`Found ${result.items.length} events, hasMore: ${result.hasMore}`)
   * ```
   */
  async list<T = unknown>(options: ListOptions = {}): Promise<ListResult<Event<T>>> {
    const limit = Math.min(options.limit ?? 50, 1000)
    const offset = options.offset ?? 0

    const prefix = `${this.name}:`
    const allItems = await this.storage.list<Event<T>>({ prefix })

    let items = Array.from(allItems.values())

    // Sort by timestamp descending (newest first) by default
    items.sort((a, b) => b.timestamp - a.timestamp)

    const total = items.length

    // Handle cursor-based pagination
    let startIndex = offset
    if (options.cursor) {
      const cursorIndex = items.findIndex(item => item.id === options.cursor)
      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1
      }
    }

    // Apply pagination
    const paginatedItems = items.slice(startIndex, startIndex + limit)
    const hasMore = startIndex + limit < items.length

    // Generate cursor for next page
    const cursor = paginatedItems.length > 0 ? paginatedItems[paginatedItems.length - 1].id : undefined

    return {
      items: paginatedItems,
      total,
      cursor,
      hasMore,
    }
  }

  /**
   * Find events by action ID
   *
   * @description
   * Finds all events associated with a specific action. This searches both:
   * - Events with correlationId matching the action ID
   * - Events with actionId in their payload
   *
   * @param actionId - The action ID to search for
   * @returns Array of events related to the action
   *
   * @example
   * ```typescript
   * const actionEvents = await events.findByActionId('action_123')
   * const completed = actionEvents.filter(e => e.type === 'function.completed')
   * ```
   */
  async findByActionId<T = unknown>(actionId: string): Promise<Event<T>[]> {
    const prefix = `${this.name}:`
    const allItems = await this.storage.list<Event<T>>({ prefix })

    const results: Event<T>[] = []
    for (const item of allItems.values()) {
      // Check correlationId
      if (item.correlationId === actionId) {
        results.push(item)
        continue
      }
      // Check payload.actionId
      const payload = item.payload as Record<string, unknown> | null
      if (payload && typeof payload === 'object' && payload.actionId === actionId) {
        results.push(item)
      }
    }

    // Sort by timestamp
    results.sort((a, b) => a.timestamp - b.timestamp)

    return results
  }

  /**
   * Find events by event type
   *
   * @param eventType - The event type to filter by (e.g., 'function.completed')
   * @returns Array of events of the specified type
   *
   * @example
   * ```typescript
   * const completedEvents = await events.findByType('function.completed')
   * const failedEvents = await events.findByType('function.failed')
   * ```
   */
  async findByType<T = unknown>(eventType: string): Promise<Event<T>[]> {
    const prefix = `${this.name}:`
    const allItems = await this.storage.list<Event<T>>({ prefix })

    const results: Event<T>[] = []
    for (const item of allItems.values()) {
      if (item.type === eventType) {
        results.push(item)
      }
    }

    // Sort by timestamp
    results.sort((a, b) => a.timestamp - b.timestamp)

    return results
  }

  /**
   * Find events by correlation ID
   *
   * @description
   * Correlation ID links events that belong to the same business transaction.
   * This is useful for tracing all events related to a single request or action.
   *
   * @param correlationId - The correlation ID to search for
   * @returns Array of events with the specified correlation ID
   *
   * @example
   * ```typescript
   * // Find all events for a specific action
   * const correlatedEvents = await events.findByCorrelationId('action_123')
   *
   * // Or for a specific request
   * const requestEvents = await events.findByCorrelationId('req_456')
   * ```
   */
  async findByCorrelationId<T = unknown>(correlationId: string): Promise<Event<T>[]> {
    const prefix = `${this.name}:`
    const allItems = await this.storage.list<Event<T>>({ prefix })

    const results: Event<T>[] = []
    for (const item of allItems.values()) {
      if (item.correlationId === correlationId) {
        results.push(item)
      }
    }

    // Sort by timestamp
    results.sort((a, b) => a.timestamp - b.timestamp)

    return results
  }

  /**
   * Find events by causation ID
   *
   * @description
   * Causation ID creates a chain of events where one event caused another.
   * This is useful for event sourcing and debugging event chains.
   *
   * @param causationId - The causation ID (ID of the causing event)
   * @returns Array of events caused by the specified event
   *
   * @example
   * ```typescript
   * // Find all events caused by a specific event
   * const causedEvents = await events.findByCausationId('event_123')
   * ```
   */
  async findByCausationId<T = unknown>(causationId: string): Promise<Event<T>[]> {
    const prefix = `${this.name}:`
    const allItems = await this.storage.list<Event<T>>({ prefix })

    const results: Event<T>[] = []
    for (const item of allItems.values()) {
      if (item.causationId === causationId) {
        results.push(item)
      }
    }

    // Sort by timestamp
    results.sort((a, b) => a.timestamp - b.timestamp)

    return results
  }

  /**
   * Count events matching optional criteria
   *
   * @param options - Optional filter criteria
   * @returns Count of matching events
   */
  async count(options?: { type?: string; correlationId?: string }): Promise<number> {
    const prefix = `${this.name}:`
    const allItems = await this.storage.list<Event>({ prefix })

    if (!options) {
      return allItems.size
    }

    let count = 0
    for (const item of allItems.values()) {
      let matches = true
      if (options.type && item.type !== options.type) {
        matches = false
      }
      if (options.correlationId && item.correlationId !== options.correlationId) {
        matches = false
      }
      if (matches) {
        count++
      }
    }

    return count
  }
}

export default EventCollection
