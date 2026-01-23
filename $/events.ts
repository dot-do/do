/**
 * Event Context Implementation
 *
 * Provides event handler registration with noun.verb pattern.
 * Uses nested Proxies to enable $.on.Customer.created(handler) syntax.
 *
 * @example
 * ```typescript
 * // Register event handlers
 * $.on.Customer.created(async (customer, $) => {
 *   await $.email.to(customer.email)`Welcome!`
 * })
 *
 * $.on.Order.updated(async (order, $) => {
 *   if (order.status === 'shipped') {
 *     await $.sms.to(order.phone)`Your order shipped!`
 *   }
 * })
 *
 * $.on.Payment.received(async (payment, $) => {
 *   await $.slack`#sales Payment received: $${payment.amount}`
 * })
 * ```
 *
 * @module context/events
 */

import type { OnContext, OnEventHandler, DOContext } from '../types/context'

/**
 * Event handler function type
 */
type EventHandlerFn<T = unknown> = (data: T, $: DOContext) => Promise<void>

/**
 * Registered event handler
 */
interface RegisteredHandler {
  /** Event name (e.g., 'Customer.created') */
  event: string
  /** Handler function */
  handler: EventHandlerFn
  /** Registration timestamp */
  registeredAt: number
}

/**
 * Event Registry
 *
 * Manages event handler registration and dispatch.
 * Handlers are keyed by event name (noun.verb format).
 */
export class EventRegistry {
  /** Registered handlers by event name */
  private handlers: Map<string, RegisteredHandler[]> = new Map()

  /**
   * Register an event handler
   *
   * @param event - Event name (e.g., 'Customer.created')
   * @param handler - Handler function
   */
  register<T = unknown>(event: string, handler: EventHandlerFn<T>): void {
    const handlers = this.handlers.get(event) || []
    handlers.push({
      event,
      handler: handler as EventHandlerFn,
      registeredAt: Date.now(),
    })
    this.handlers.set(event, handlers)
    console.log(`[Events] Registered handler for ${event}`)
  }

  /**
   * Emit an event to all registered handlers
   *
   * @param event - Event name
   * @param data - Event data
   * @param context - DO context for handlers
   */
  async emit<T = unknown>(event: string, data: T, context: DOContext): Promise<void> {
    const handlers = this.handlers.get(event) || []

    if (handlers.length === 0) {
      console.log(`[Events] No handlers for ${event}`)
      return
    }

    console.log(`[Events] Emitting ${event} to ${handlers.length} handlers`)

    // Execute all handlers in parallel
    const results = await Promise.allSettled(
      handlers.map(({ handler }) => handler(data, context))
    )

    // Log any errors
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error(`[Events] Handler error for ${event}:`, result.reason)
      }
    }
  }

  /**
   * Get all registered handlers for an event
   *
   * @param event - Event name
   * @returns Array of handlers
   */
  getHandlers(event: string): RegisteredHandler[] {
    return this.handlers.get(event) || []
  }

  /**
   * Get all registered events
   *
   * @returns Array of event names
   */
  getEvents(): string[] {
    return Array.from(this.handlers.keys())
  }

  /**
   * Unregister all handlers for an event
   *
   * @param event - Event name
   */
  unregister(event: string): void {
    this.handlers.delete(event)
    console.log(`[Events] Unregistered all handlers for ${event}`)
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    this.handlers.clear()
    console.log(`[Events] Cleared all handlers`)
  }
}

/**
 * Create verb-level proxy for event registration
 *
 * Returns a function that registers the handler for noun.verb events.
 *
 * @param registry - Event registry
 * @param noun - Entity noun (e.g., 'Customer')
 * @returns Proxy for verb access
 */
function createVerbProxy(registry: EventRegistry, noun: string): Record<string, OnEventHandler> {
  return new Proxy({} as Record<string, OnEventHandler>, {
    get(_, verb: string | symbol) {
      if (typeof verb !== 'string') return undefined

      /**
       * Return handler registration function
       * Usage: $.on.Customer.created(handler)
       */
      return <T = unknown>(handler: (data: T, $: DOContext) => Promise<void>): void => {
        const event = `${noun}.${verb}`
        registry.register(event, handler as EventHandlerFn)
      }
    },
  })
}

/**
 * Create the On Context
 *
 * Uses nested Proxies to enable $.on.Noun.verb(handler) syntax.
 * - First level: noun access ($.on.Customer)
 * - Second level: verb access ($.on.Customer.created)
 * - Third level: handler registration
 *
 * @param registry - Event registry for storing handlers
 * @returns OnContext implementation
 *
 * @example
 * ```typescript
 * const registry = new EventRegistry()
 * const on = createOnContext(registry)
 *
 * // Register handler
 * on.Customer.created(async (customer) => {
 *   console.log('Customer created:', customer)
 * })
 *
 * // Later, emit the event
 * await registry.emit('Customer.created', { id: '123', name: 'Acme' }, context)
 * ```
 */
export function createOnContext(registry: EventRegistry): OnContext {
  return new Proxy({} as OnContext, {
    get(_, noun: string | symbol) {
      if (typeof noun !== 'string') return undefined

      // Return verb-level proxy for this noun
      return createVerbProxy(registry, noun)
    },
  })
}

/**
 * Common event types for reference
 *
 * Entity lifecycle events:
 * - {Entity}.created - Entity was created
 * - {Entity}.updated - Entity was updated
 * - {Entity}.deleted - Entity was deleted
 *
 * State transition events:
 * - {Entity}.{state_entered} - Entity entered a state
 * - {Entity}.{action_completed} - Action was completed
 *
 * Integration events:
 * - {System}.connected - Integration connected
 * - {System}.error - Integration error
 *
 * @example
 * ```typescript
 * // Entity lifecycle
 * $.on.Customer.created(handler)
 * $.on.Order.updated(handler)
 * $.on.User.deleted(handler)
 *
 * // State transitions
 * $.on.Order.shipped(handler)
 * $.on.Payment.completed(handler)
 * $.on.Subscription.canceled(handler)
 *
 * // Integration events
 * $.on.Stripe.connected(handler)
 * $.on.Slack.error(handler)
 * ```
 */
export const COMMON_EVENTS = {
  // Lifecycle
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',

  // State transitions
  activated: 'activated',
  deactivated: 'deactivated',
  completed: 'completed',
  failed: 'failed',
  canceled: 'canceled',

  // Order-specific
  placed: 'placed',
  shipped: 'shipped',
  delivered: 'delivered',
  refunded: 'refunded',

  // Payment-specific
  received: 'received',
  processed: 'processed',
  declined: 'declined',

  // Subscription-specific
  started: 'started',
  renewed: 'renewed',
  expired: 'expired',

  // Integration-specific
  connected: 'connected',
  disconnected: 'disconnected',
  synced: 'synced',
  error: 'error',
} as const

export type CommonEvent = typeof COMMON_EVENTS[keyof typeof COMMON_EVENTS]
