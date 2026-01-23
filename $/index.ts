/**
 * DO Context ($) - Main Context Factory
 *
 * The context is the primary runtime interface for Digital Objects.
 * All DO operations flow through the $ context accessor.
 *
 * @example
 * ```typescript
 * import { createContext, DO } from './context'
 *
 * // Create a context directly
 * const $ = createContext({
 *   $id: 'https://example.do',
 *   $type: 'Business',
 *   $version: 1,
 *   $createdAt: Date.now(),
 *   $updatedAt: Date.now()
 * })
 *
 * // Or use the DO factory
 * export default DO($ => {
 *   $.on.Customer.created(async (customer) => {
 *     await $.email`welcome ${customer.name} to ${customer.email}`
 *   })
 * })
 * ```
 *
 * @module context
 */

import type {
  DOContext,
  DOFactory,
  AIContext,
  DBContext,
  OnContext,
  EveryContext,
  EmailContext,
  SlackContext,
  SMSContext,
  CallContext,
  VoiceContext,
  FinancialContext,
  DOCascadeContext,
} from '../types/context'
import type { DomainContext } from '../types/domains'
import type { DigitalObjectIdentity, DOType, DigitalObjectRef } from '../types/identity'

import { createAIContext } from './ai'
import { createDBContext } from './db'
import { createOnContext, EventRegistry } from './events'
import { createEveryContext, ScheduleRegistry } from './schedule'
import { createEmailContext, createSlackContext, createSMSContext } from './communication'
import { createCallContext, createVoiceContext } from './telephony'
import { createFinancialContext } from './financial'
import { createDomainContext } from './domain'
import { createCascadeContext } from './cascade'

/**
 * Environment bindings for the DO runtime
 * These are provided by the Cloudflare Workers runtime
 */
export interface DOEnvironment {
  /** AI Gateway binding */
  AI?: unknown
  /** D1 Database binding */
  DB?: unknown
  /** KV Namespace binding */
  KV?: unknown
  /** R2 Bucket binding */
  R2?: unknown
  /** Durable Objects namespace */
  DO?: unknown
  /** Queue binding */
  QUEUE?: unknown
  /** Environment variables */
  [key: string]: unknown
}

/**
 * Internal context state
 */
interface ContextState {
  /** Event handler registry */
  eventRegistry: EventRegistry
  /** Schedule handler registry */
  scheduleRegistry: ScheduleRegistry
  /** Environment bindings */
  env: DOEnvironment
}

/**
 * Create a DO Context ($) for a Digital Object
 *
 * The context provides access to all DO operations including:
 * - AI operations ($.ai)
 * - Database operations ($.db)
 * - Event handlers ($.on)
 * - Scheduled tasks ($.every)
 * - Communication ($.email, $.slack, $.sms)
 * - Telephony ($.call, $.voice)
 * - Financial operations ($.pay)
 * - Domain management ($.domain)
 * - Cascade execution ($.cascade)
 *
 * @param identity - The DO identity ($id, $type, $context)
 * @param env - Optional environment bindings
 * @returns The DO Context ($)
 *
 * @example
 * ```typescript
 * const $ = createContext({
 *   $id: 'https://acme.saas.group',
 *   $type: 'SaaS',
 *   $version: 1,
 *   $createdAt: Date.now(),
 *   $updatedAt: Date.now()
 * })
 *
 * const ideas = await $.ai`5 startup ideas`
 * const users = await $.db.User.list()
 * ```
 */
export function createContext(
  identity: DigitalObjectIdentity,
  env: DOEnvironment = {}
): DOContext {
  // Initialize registries
  const eventRegistry = new EventRegistry()
  const scheduleRegistry = new ScheduleRegistry()

  // Context state
  const state: ContextState = {
    eventRegistry,
    scheduleRegistry,
    env,
  }

  // Lazy-initialized context properties
  let _ai: AIContext | null = null
  let _db: DBContext | null = null
  let _on: OnContext | null = null
  let _every: EveryContext | null = null
  let _email: EmailContext | null = null
  let _slack: SlackContext | null = null
  let _sms: SMSContext | null = null
  let _call: CallContext | null = null
  let _voice: VoiceContext | null = null
  let _pay: FinancialContext | null = null
  let _domain: DomainContext | null = null
  let _cascade: DOCascadeContext | null = null

  // Child context cache
  const childCache = new Map<string, DOContext>()

  const context: DOContext = {
    // Identity
    $id: identity.$id,
    $type: identity.$type,
    $context: identity.$context,

    // AI operations
    get ai(): AIContext {
      if (!_ai) _ai = createAIContext(state)
      return _ai
    },

    // Database operations
    get db(): DBContext {
      if (!_db) _db = createDBContext(state)
      return _db
    },

    // Event handlers
    get on(): OnContext {
      if (!_on) _on = createOnContext(state.eventRegistry)
      return _on
    },

    // Scheduled tasks
    get every(): EveryContext {
      if (!_every) _every = createEveryContext(state.scheduleRegistry)
      return _every
    },

    // Send event
    send: async (event: string, data: unknown): Promise<void> => {
      await state.eventRegistry.emit(event, data, context)
    },

    // Email
    get email(): EmailContext {
      if (!_email) _email = createEmailContext(state)
      return _email
    },

    // Slack
    get slack(): SlackContext {
      if (!_slack) _slack = createSlackContext(state)
      return _slack
    },

    // SMS
    get sms(): SMSContext {
      if (!_sms) _sms = createSMSContext(state)
      return _sms
    },

    // Phone calls
    get call(): CallContext {
      if (!_call) _call = createCallContext(state)
      return _call
    },

    // Voice AI
    get voice(): VoiceContext {
      if (!_voice) _voice = createVoiceContext(state)
      return _voice
    },

    // Financial operations
    get pay(): FinancialContext {
      if (!_pay) _pay = createFinancialContext(state)
      return _pay
    },

    // Domain management
    get domain(): DomainContext {
      if (!_domain) _domain = createDomainContext(state, identity)
      return _domain
    },

    // Cascade execution
    get cascade(): DOCascadeContext {
      if (!_cascade) _cascade = createCascadeContext()
      return _cascade
    },

    // Logging
    log: (...args: unknown[]): void => {
      console.log(`[${identity.$id}]`, ...args)
    },

    // Get child DO
    child: (type: DOType, name: string): DOContext => {
      const childKey = `${type}:${name}`
      let child = childCache.get(childKey)

      if (!child) {
        const childId = `${identity.$id}/${name}`
        child = createContext(
          {
            $id: childId,
            $type: type,
            $context: identity.$id,
            $version: 1,
            $createdAt: Date.now(),
            $updatedAt: Date.now(),
          },
          env
        )
        childCache.set(childKey, child)
      }

      return child
    },

    // Spawn new child DO
    spawn: async (type: DOType, name: string): Promise<DOContext> => {
      const childId = `${identity.$id}/${name}`
      const childIdentity: DigitalObjectIdentity = {
        $id: childId,
        $type: type,
        $context: identity.$id,
        $version: 1,
        $createdAt: Date.now(),
        $updatedAt: Date.now(),
      }

      // TODO: Persist child DO to storage
      // await state.env.DO?.put(childId, childIdentity)

      const child = createContext(childIdentity, env)
      childCache.set(`${type}:${name}`, child)

      return child
    },
  }

  return context
}

/**
 * DO Factory - Create a Digital Object with $ context
 *
 * The DO factory wraps a setup function and returns a fetch handler
 * that can be used with Cloudflare Workers/Durable Objects.
 *
 * @param setup - Setup function that receives the $ context
 * @returns Object with fetch handler
 *
 * @example
 * ```typescript
 * export default DO($ => {
 *   // Register event handlers
 *   $.on.Order.placed(async (order) => {
 *     await $.ai`process ${order}`
 *   })
 *
 *   // Register scheduled tasks
 *   $.every.hour(async () => {
 *     await $.db.Cache.refresh()
 *   })
 * })
 * ```
 */
export const DO: DOFactory = (setup) => {
  return {
    async fetch(request: Request): Promise<Response> {
      // Extract identity from request URL
      const url = new URL(request.url)
      const identity: DigitalObjectIdentity = {
        $id: `https://${url.hostname}${url.pathname}`,
        $type: 'DO', // Default type, can be overridden
        $version: 1,
        $createdAt: Date.now(),
        $updatedAt: Date.now(),
      }

      // Create context
      const $ = createContext(identity)

      // Run setup
      await setup($)

      // Handle request
      // TODO: Route to appropriate handler based on request
      return new Response(JSON.stringify({
        $id: identity.$id,
        $type: identity.$type,
        status: 'ok',
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    },
  }
}

// Re-export types
export type { DOContext, DOFactory }

// Re-export sub-context creators for testing
export { createAIContext } from './ai'
export { createDBContext } from './db'
export { createOnContext, EventRegistry } from './events'
export { createEveryContext, ScheduleRegistry } from './schedule'
export { createEmailContext, createSlackContext, createSMSContext } from './communication'
export { createCallContext, createVoiceContext } from './telephony'
export { createFinancialContext } from './financial'
export { createDomainContext } from './domain'
export { createCascadeContext } from './cascade'
