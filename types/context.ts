/**
 * DO Context ($) - The Runtime Context for Digital Objects
 *
 * Every DO operation flows through $ - the context accessor.
 * $ supports tagged template syntax for natural language operations.
 *
 * Examples:
 * ```typescript
 * // Complete DO with RPC API
 * export default DO(async ($) => {
 *   // Register event handlers
 *   $.on.Customer.created(async (customer) => {
 *     await $.email`welcome ${customer.name} to ${customer.email}`
 *   })
 *
 *   // Register scheduled tasks
 *   $.every.Monday.at9am(async () => {
 *     const report = await $.ai`generate weekly report`
 *     await $.slack`#metrics ${report}`
 *   })
 *
 *   // Return RPC API methods
 *   return {
 *     ping: async () => 'pong',
 *     users: {
 *       get: async (id: string) => $.db.User.get(id),
 *       list: async () => $.db.User.list(),
 *     }
 *   }
 * })
 *
 * // AI operations
 * const ideas = await $.ai`5 startup ideas for ${industry}`
 * const summary = await $.ai`summarize ${document}`
 *
 * // Database with natural language
 * const stuck = await $.db.Order`what's stuck in processing?`
 * const users = await $.db.User.list()
 *
 * // Telephony
 * await $.sms`remind ${contact.phone} about ${appointment}`
 * await $.call(contact.phone)`schedule a demo for ${product}`
 *
 * // Voice AI
 * const agent = await $.voice.agent`sales assistant for ${product}`
 * ```
 */

import type { DOType, DigitalObjectRef } from './identity'
import type { DomainContext } from './domains'

// =============================================================================
// Tagged Template Support
// =============================================================================

/**
 * Tagged template function signature
 * Supports: fn`template ${value}` and fn`template`(options)
 */
export interface TaggedTemplate<T, Opts = Record<string, unknown>> {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<T>
  (strings: TemplateStringsArray, ...values: unknown[]): TaggedTemplateWithOpts<T, Opts>
}

export interface TaggedTemplateWithOpts<T, Opts> {
  (opts?: Opts): Promise<T>
}

/**
 * Chainable list result
 */
export interface ChainableList<T> extends Promise<T[]> {
  map<U>(fn: (item: T) => U | Promise<U>): ChainableList<U>
  filter(fn: (item: T) => boolean | Promise<boolean>): ChainableList<T>
  forEach(fn: (item: T) => void | Promise<void>): Promise<void>
}

// =============================================================================
// AI Context ($ai)
// =============================================================================

export interface AIContext {
  /** Generate text/structured output */
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>

  /** Generate a list */
  list: TaggedTemplate<string[]> & {
    (strings: TemplateStringsArray, ...values: unknown[]): ChainableList<string>
  }

  /** Boolean check */
  is: TaggedTemplate<boolean>

  /** Generate text content */
  write: TaggedTemplate<string>

  /** Execute a task */
  do: TaggedTemplate<{ summary: string; actions: string[] }>

  /** Generate code */
  code: TaggedTemplate<string>

  /** Summarize content */
  summarize: TaggedTemplate<string>

  /** Extract structured data */
  extract: <T>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T[]>

  /** Embed text for vector search */
  embed: (text: string) => Promise<number[]>

  /** Generate image */
  image: TaggedTemplate<{ url: string }>

  /** Generate video */
  video: TaggedTemplate<{ url: string }>

  /** Synthesize speech */
  speak: TaggedTemplate<ArrayBuffer>

  /** Transcribe audio */
  transcribe: (audio: ArrayBuffer) => Promise<string>
}

// =============================================================================
// Database Context ($.db)
// =============================================================================

export interface DBCollection<T = unknown> {
  /** Natural language query */
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>

  /** CRUD operations */
  get(id: string): Promise<T | null>
  list(options?: { limit?: number; offset?: number; filter?: Record<string, unknown> }): ChainableList<T>
  find(filter: Record<string, unknown>): ChainableList<T>
  search(query: string): ChainableList<T>
  create(data: Partial<T>, options?: { cascade?: boolean }): Promise<T>
  update(id: string, data: Partial<T>): Promise<T>
  delete(id: string): Promise<boolean>

  /** Batch processing */
  forEach<R>(
    fn: (item: T) => R | Promise<R>,
    options?: {
      concurrency?: number
      maxRetries?: number
      onProgress?: (p: { completed: number; total: number }) => void
    }
  ): Promise<R[]>
}

/**
 * Base DBContext interface with static methods
 */
export interface DBContextBase {
  /** SQL query */
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>

  /** Document operations */
  documents: {
    find(options: { collection: string; filter: Record<string, unknown> }): Promise<unknown[]>
  }

  /** Graph operations */
  graph: {
    traverse(options: { startNode: string; edges: string[] }): Promise<unknown[]>
  }

  /** Analytics */
  analytics: {
    query(options: { select: string[]; from: string; groupBy?: string[] }): Promise<unknown[]>
  }

  /** Collection accessor - returns typed collection via Proxy */
  collection<T = unknown>(name: string): DBCollection<T>
}

/**
 * Dynamic collection accessor interface
 * Allows db.User, db.Order, etc. via Proxy
 */
export interface DBCollectionAccessor {
  [collectionName: string]: DBCollection<Record<string, unknown>>
}

/**
 * Full DBContext type combining static methods and dynamic collection access
 */
export type DBContext = DBContextBase & DBCollectionAccessor

// =============================================================================
// Event Context ($.on)
// =============================================================================

export interface OnEventHandler<T = unknown> {
  (handler: (data: T, $: DOContext) => Promise<void>): void
}

export interface OnContext {
  /** Dynamic event handlers: $.on.Customer.created(handler) */
  [noun: string]: {
    [verb: string]: OnEventHandler
  }
}

// =============================================================================
// Schedule Context ($.every)
// =============================================================================

export interface ScheduleHandler {
  (handler: ($: DOContext) => Promise<void>): void
}

export interface TimeSlot {
  at6am: ScheduleHandler
  at7am: ScheduleHandler
  at8am: ScheduleHandler
  at9am: ScheduleHandler
  at10am: ScheduleHandler
  at11am: ScheduleHandler
  at12pm: ScheduleHandler
  atnoon: ScheduleHandler
  at1pm: ScheduleHandler
  at2pm: ScheduleHandler
  at3pm: ScheduleHandler
  at4pm: ScheduleHandler
  at5pm: ScheduleHandler
  at6pm: ScheduleHandler
  at7pm: ScheduleHandler
  at8pm: ScheduleHandler
  at9pm: ScheduleHandler
  atmidnight: ScheduleHandler
}

export interface EveryContext {
  second: ScheduleHandler
  minute: ScheduleHandler
  hour: ScheduleHandler
  day: ScheduleHandler
  week: ScheduleHandler
  month: ScheduleHandler

  minutes: (n: number) => ScheduleHandler
  hours: (n: number) => ScheduleHandler

  Monday: TimeSlot & ScheduleHandler
  Tuesday: TimeSlot & ScheduleHandler
  Wednesday: TimeSlot & ScheduleHandler
  Thursday: TimeSlot & ScheduleHandler
  Friday: TimeSlot & ScheduleHandler
  Saturday: TimeSlot & ScheduleHandler
  Sunday: TimeSlot & ScheduleHandler

  weekday: TimeSlot & ScheduleHandler
  weekend: TimeSlot & ScheduleHandler
}

// =============================================================================
// Communication Context
// =============================================================================

export interface EmailContext {
  /** Send email with tagged template */
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<{ messageId: string }>

  /** Send to specific recipient */
  to: (email: string) => TaggedTemplate<{ messageId: string }>

  /** Send using template */
  template: (templateId: string, to: string, vars: Record<string, unknown>) => Promise<{ messageId: string }>
}

export interface SlackContext {
  /** Post to channel with tagged template: $.slack`#general ${message}` */
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<{ ts: string }>

  /** Post to specific channel */
  channel: (channelId: string) => TaggedTemplate<{ ts: string }>
}

export interface SMSContext {
  /** Send SMS with tagged template: $.sms`${phone} ${message}` */
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<{ messageId: string }>

  /** Send to specific number */
  to: (phone: string) => TaggedTemplate<{ messageId: string }>
}

// =============================================================================
// Telephony Context
// =============================================================================

export interface CallContext {
  /** Make call with tagged template: $.call(phone)`discuss ${topic}` */
  (phone: string): TaggedTemplate<{ callId: string }>

  /** Outbound call with options */
  make: (options: { from: string; to: string; twiml?: string }) => Promise<{ callId: string }>
}

// =============================================================================
// Voice AI Context
// =============================================================================

export interface VoiceContext {
  /** Create voice agent with tagged template */
  agent: TaggedTemplate<{ agentId: string; phone?: string }>

  /** Start voice session */
  session: (agentId: string) => Promise<{ sessionId: string; token: string }>

  /** Outbound campaign */
  campaign: (contacts: string[], agentId: string) => Promise<{ campaignId: string }>
}

// =============================================================================
// Financial Context
// =============================================================================

export interface FinancialContext {
  /** Charge with tagged template: $.pay`charge ${customer} $${amount}` */
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<{ paymentId: string }>

  /** Payment operations */
  charge: (customerId: string, amount: number, currency?: string) => Promise<{ paymentId: string }>
  transfer: (destination: string, amount: number) => Promise<{ transferId: string }>
  payout: (amount: number, destination: string) => Promise<{ payoutId: string }>

  /** Accounting */
  journal: (entry: { debit: Array<{ account: string; amount: number }>; credit: Array<{ account: string; amount: number }> }) => Promise<{ entryId: string }>

  /** Reports */
  pnl: (period?: 'daily' | 'weekly' | 'monthly' | 'yearly') => Promise<unknown>
  mrr: () => Promise<{ mrr: number; arr: number; growth: number }>
}

// =============================================================================
// Domain Context - re-export from domains.ts
// =============================================================================

// DomainContext is defined in domains.ts

// =============================================================================
// Cascade Context
// =============================================================================

export interface DOCascadeContext {
  /** Execute with cascade: code → generative → agentic → human */
  <T>(options: {
    code?: () => T | Promise<T>
    generative?: () => T | Promise<T>
    agentic?: () => T | Promise<T>
    human?: () => T | Promise<T>
  }): Promise<{ result: T; tier: 'code' | 'generative' | 'agentic' | 'human' }>
}

// =============================================================================
// Main DO Context ($)
// =============================================================================

/**
 * The DO Context ($) - runtime context for all DO operations
 *
 * Usage:
 * ```typescript
 * // With RPC API
 * DO(async ($) => {
 *   // AI
 *   const ideas = await $.ai`5 startup ideas`
 *   const viable = await $.ai.is`${ideas[0]} is technically feasible`
 *
 *   // Database
 *   const users = await $.db.User.list()
 *   const stuck = await $.db.Order`what's stuck?`
 *
 *   // Events
 *   $.on.Customer.created(async (customer) => {
 *     await $.email.to(customer.email)`Welcome to ${product}!`
 *   })
 *
 *   // Schedules
 *   $.every.Monday.at9am(async () => {
 *     await $.slack`#team Weekly standup time!`
 *   })
 *
 *   // Return RPC API
 *   return {
 *     ideas: {
 *       generate: async (count: number) => $.ai`${count} startup ideas`,
 *     }
 *   }
 * })
 *
 * // Without RPC API (events/schedules only)
 * DO(async ($) => {
 *   $.on.Order.placed(...)
 *   $.every.hour(...)
 * })
 * ```
 */
export interface DOContext {
  /** DO identity */
  $id: string
  $type: DOType
  $context?: DigitalObjectRef

  /** AI operations */
  ai: AIContext

  /** Database operations */
  db: DBContext

  /** Event handlers */
  on: OnContext

  /** Scheduled tasks */
  every: EveryContext

  /** Send event */
  send: (event: string, data: unknown) => Promise<void>

  /** Email */
  email: EmailContext

  /** Slack */
  slack: SlackContext

  /** SMS */
  sms: SMSContext

  /** Phone calls */
  call: CallContext

  /** Voice AI */
  voice: VoiceContext

  /** Financial operations */
  pay: FinancialContext

  /** Domain management */
  domain: DomainContext

  /** Cascade execution */
  cascade: DOCascadeContext

  /** Logging */
  log: (...args: unknown[]) => void

  /** Get child DO */
  child: (type: DOType, name: string) => DOContext

  /** Create child DO */
  spawn: (type: DOType, name: string) => Promise<DOContext>
}

// =============================================================================
// DO Factory
// =============================================================================

/**
 * RPC API type - methods and namespaces that get exposed via RPC
 */
export type RPCAPI = Record<string, ((...args: any[]) => any) | Record<string, (...args: any[]) => any>>

/**
 * Create a Digital Object with $ context
 *
 * The factory can optionally return an RPC API object that defines
 * the methods exposed via RPC. If no return value, only events/schedules are configured.
 *
 * @example
 * ```typescript
 * // With RPC API
 * export default DO(async ($) => {
 *   $.on.User.created(...)
 *
 *   return {
 *     ping: async () => 'pong',
 *     users: {
 *       get: async (id: string) => {...},
 *     }
 *   }
 * })
 *
 * // Without RPC API (events/schedules only)
 * export default DO(async ($) => {
 *   $.on.Order.placed(...)
 *   $.every.hour(...)
 * })
 * ```
 */
export type DOFactory = <API extends RPCAPI | void = void>(
  setup: ($: DOContext) => API | Promise<API>
) => {
  fetch: (request: Request) => Promise<Response>
}
