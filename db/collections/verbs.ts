/**
 * Verb Collection - Action type registry for Digital Objects
 *
 * @module collections/verbs
 *
 * @description
 * Manages the registration and lookup of Verbs (action types) within a Digital Object.
 * Verbs define the grammatical forms and semantics of actions following the
 * linguistic pattern from digital-objects.
 *
 * Every verb has multiple forms:
 * - action: Imperative form (create, update, delete)
 * - act: Short form for compact references
 * - activity: Present participle (creating, updating, deleting)
 * - event: Past tense for events (created, updated, deleted)
 * - reverse: Passive form (createdBy, updatedBy, deletedBy)
 * - inverse: Opposite action (create <-> delete, start <-> stop)
 *
 * @example
 * ```typescript
 * const verbs = new VerbCollection(storage)
 *
 * // Register standard CRUD verbs
 * await verbs.registerCrudVerbs()
 *
 * // Register custom verb
 * await verbs.create({
 *   name: 'Subscribe',
 *   action: 'subscribe',
 *   act: 'sub',
 *   activity: 'subscribing',
 *   event: 'subscribed',
 *   reverse: 'subscribedBy',
 *   inverse: 'unsubscribe'
 * })
 * ```
 */

import type { Verb } from '../../types/collections'
import { BaseCollection, DOStorage, NotFoundError, ValidationError } from './base'

/**
 * Options for creating a verb
 */
export interface CreateVerbOptions {
  /**
   * Verb name (display name)
   */
  name: string

  /**
   * Imperative form
   * @example 'create', 'subscribe', 'approve'
   */
  action: string

  /**
   * Short form for compact references
   * @example 'new', 'sub', 'ok'
   */
  act: string

  /**
   * Present participle form
   * @example 'creating', 'subscribing', 'approving'
   */
  activity: string

  /**
   * Past tense / event form
   * @example 'created', 'subscribed', 'approved'
   */
  event: string

  /**
   * Passive / reverse form
   * @example 'createdBy', 'subscribedBy', 'approvedBy'
   */
  reverse: string

  /**
   * Opposite action (optional)
   * @example 'delete' for 'create', 'unsubscribe' for 'subscribe'
   */
  inverse?: string

  /**
   * Human-readable description
   */
  description?: string
}

/**
 * Standard CRUD verb definitions
 */
export const CRUD_VERBS: CreateVerbOptions[] = [
  {
    name: 'Create',
    action: 'create',
    act: 'new',
    activity: 'creating',
    event: 'created',
    reverse: 'createdBy',
    inverse: 'delete',
    description: 'Create a new entity',
  },
  {
    name: 'Read',
    action: 'read',
    act: 'get',
    activity: 'reading',
    event: 'read',
    reverse: 'readBy',
    description: 'Read/retrieve an entity',
  },
  {
    name: 'Update',
    action: 'update',
    act: 'set',
    activity: 'updating',
    event: 'updated',
    reverse: 'updatedBy',
    description: 'Update an existing entity',
  },
  {
    name: 'Delete',
    action: 'delete',
    act: 'del',
    activity: 'deleting',
    event: 'deleted',
    reverse: 'deletedBy',
    inverse: 'create',
    description: 'Delete an entity',
  },
]

/**
 * Common workflow verb definitions
 */
export const WORKFLOW_VERBS: CreateVerbOptions[] = [
  {
    name: 'Start',
    action: 'start',
    act: 'go',
    activity: 'starting',
    event: 'started',
    reverse: 'startedBy',
    inverse: 'stop',
    description: 'Start a process or workflow',
  },
  {
    name: 'Stop',
    action: 'stop',
    act: 'halt',
    activity: 'stopping',
    event: 'stopped',
    reverse: 'stoppedBy',
    inverse: 'start',
    description: 'Stop a process or workflow',
  },
  {
    name: 'Approve',
    action: 'approve',
    act: 'ok',
    activity: 'approving',
    event: 'approved',
    reverse: 'approvedBy',
    inverse: 'reject',
    description: 'Approve a request or item',
  },
  {
    name: 'Reject',
    action: 'reject',
    act: 'no',
    activity: 'rejecting',
    event: 'rejected',
    reverse: 'rejectedBy',
    inverse: 'approve',
    description: 'Reject a request or item',
  },
  {
    name: 'Submit',
    action: 'submit',
    act: 'send',
    activity: 'submitting',
    event: 'submitted',
    reverse: 'submittedBy',
    description: 'Submit for review or processing',
  },
  {
    name: 'Complete',
    action: 'complete',
    act: 'done',
    activity: 'completing',
    event: 'completed',
    reverse: 'completedBy',
    description: 'Mark as complete',
  },
  {
    name: 'Cancel',
    action: 'cancel',
    act: 'x',
    activity: 'cancelling',
    event: 'cancelled',
    reverse: 'cancelledBy',
    description: 'Cancel an operation',
  },
]

/**
 * Verb collection for managing action type definitions
 *
 * @description
 * The VerbCollection provides methods for registering, looking up, and managing
 * action types. Each verb defines grammatical forms that are used throughout
 * the system for:
 *
 * - Actions: Active operations (e.g., "create customer")
 * - Events: What happened (e.g., "customer.created")
 * - Relationships: Reverse relations (e.g., "createdBy user")
 *
 * @example
 * ```typescript
 * const verbs = new VerbCollection(storage)
 *
 * // Register CRUD verbs
 * await verbs.registerCrudVerbs()
 *
 * // Look up by action
 * const createVerb = await verbs.getByAction('create')
 * console.log(createVerb.event) // 'created'
 *
 * // Get event name for a verb
 * const eventName = await verbs.getEventForm('subscribe')
 * console.log(eventName) // 'subscribed'
 * ```
 */
export class VerbCollection extends BaseCollection<Verb> {
  /**
   * Create a new VerbCollection instance
   *
   * @param storage - DO storage interface
   */
  constructor(storage: DOStorage) {
    super(storage, {
      name: 'verbs',
      idPrefix: 'verb',
    })
  }

  /**
   * Initialize the verbs table in SQLite
   *
   * @internal
   */
  protected async initializeTable(): Promise<void> {
    // TODO: Create verbs table with schema:
    // id TEXT PRIMARY KEY,
    // name TEXT NOT NULL,
    // action TEXT UNIQUE NOT NULL,
    // act TEXT NOT NULL,
    // activity TEXT NOT NULL,
    // event TEXT NOT NULL,
    // reverse TEXT NOT NULL,
    // inverse TEXT,
    // description TEXT,
    // createdAt INTEGER NOT NULL,
    // updatedAt INTEGER NOT NULL
    throw new Error('Not implemented')
  }

  /**
   * Create a new verb
   *
   * @param data - Verb creation options
   * @returns The created verb with generated ID
   *
   * @throws {ValidationError} If action form already exists
   *
   * @example
   * ```typescript
   * const verb = await verbs.create({
   *   name: 'Publish',
   *   action: 'publish',
   *   act: 'pub',
   *   activity: 'publishing',
   *   event: 'published',
   *   reverse: 'publishedBy'
   * })
   * ```
   */
  async create(data: Omit<Verb, 'id'>): Promise<Verb> {
    // 1. Validate action format (lowercase, alphabetic)
    if (!this.validateAction(data.action)) {
      throw new ValidationError(`Invalid action format: ${data.action}. Must be 2-32 lowercase alphabetic characters.`, 'action')
    }

    // 2. Check action uniqueness
    const existing = await this.getByAction(data.action)
    if (existing) {
      throw new ValidationError(`Verb with action '${data.action}' already exists`, 'action')
    }

    // 3. Generate ID and timestamps
    const id = this.generateId()
    const timestamp = this.now()

    const verb: Verb = {
      ...data,
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    // 4. Store in storage
    const key = `${this.config.name}:${id}`
    await this.storage.put(key, verb)

    return verb
  }

  /**
   * Get a verb by its action form
   *
   * @param action - The verb's action form (imperative)
   * @returns The verb or null if not found
   *
   * @example
   * ```typescript
   * const createVerb = await verbs.getByAction('create')
   * ```
   */
  async getByAction(action: string): Promise<Verb | null> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<Verb>({ prefix })

    for (const verb of allItems.values()) {
      if (verb.action === action) {
        return verb
      }
    }

    return null
  }

  /**
   * Get a verb by its event form
   *
   * @param event - The verb's event form (past tense)
   * @returns The verb or null if not found
   *
   * @example
   * ```typescript
   * const verb = await verbs.getByEvent('created')
   * console.log(verb.action) // 'create'
   * ```
   */
  async getByEvent(event: string): Promise<Verb | null> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<Verb>({ prefix })

    for (const verb of allItems.values()) {
      if (verb.event === event) {
        return verb
      }
    }

    return null
  }

  /**
   * Get a verb by any of its forms
   *
   * @param form - Any verb form (action, act, activity, event, reverse)
   * @returns The verb or null if not found
   *
   * @example
   * ```typescript
   * const verb = await verbs.getByAnyForm('creating')
   * console.log(verb.action) // 'create'
   * ```
   */
  async getByAnyForm(form: string): Promise<Verb | null> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<Verb>({ prefix })

    for (const verb of allItems.values()) {
      if (verb.action === form || verb.act === form || verb.activity === form || verb.event === form || verb.reverse === form) {
        return verb
      }
    }

    return null
  }

  /**
   * Get the event form for an action
   *
   * @param action - Action form of the verb
   * @returns Event form or null if verb not found
   *
   * @example
   * ```typescript
   * const event = await verbs.getEventForm('subscribe')
   * console.log(event) // 'subscribed'
   * ```
   */
  async getEventForm(action: string): Promise<string | null> {
    const verb = await this.getByAction(action)
    return verb?.event ?? null
  }

  /**
   * Get the reverse form for an action
   *
   * @param action - Action form of the verb
   * @returns Reverse form or null if verb not found
   *
   * @example
   * ```typescript
   * const reverse = await verbs.getReverseForm('create')
   * console.log(reverse) // 'createdBy'
   * ```
   */
  async getReverseForm(action: string): Promise<string | null> {
    const verb = await this.getByAction(action)
    return verb?.reverse ?? null
  }

  /**
   * Get the inverse verb for an action
   *
   * @param action - Action form of the verb
   * @returns Inverse verb or null if not defined
   *
   * @example
   * ```typescript
   * const inverse = await verbs.getInverse('create')
   * console.log(inverse?.action) // 'delete'
   * ```
   */
  async getInverse(action: string): Promise<Verb | null> {
    const verb = await this.getByAction(action)
    if (!verb?.inverse) return null
    return this.getByAction(verb.inverse)
  }

  /**
   * Register standard CRUD verbs
   *
   * @returns Array of created verbs
   *
   * @description
   * Registers: create, read, update, delete
   *
   * @example
   * ```typescript
   * await verbs.registerCrudVerbs()
   * ```
   */
  async registerCrudVerbs(): Promise<Verb[]> {
    const created: Verb[] = []
    for (const verbData of CRUD_VERBS) {
      const existing = await this.getByAction(verbData.action)
      if (!existing) {
        created.push(await this.create(verbData))
      }
    }
    return created
  }

  /**
   * Register common workflow verbs
   *
   * @returns Array of created verbs
   *
   * @description
   * Registers: start, stop, approve, reject, submit, complete, cancel
   *
   * @example
   * ```typescript
   * await verbs.registerWorkflowVerbs()
   * ```
   */
  async registerWorkflowVerbs(): Promise<Verb[]> {
    const created: Verb[] = []
    for (const verbData of WORKFLOW_VERBS) {
      const existing = await this.getByAction(verbData.action)
      if (!existing) {
        created.push(await this.create(verbData))
      }
    }
    return created
  }

  /**
   * Validate verb action format
   *
   * @param action - Action to validate
   * @returns True if valid
   *
   * @description
   * Valid actions:
   * - Lowercase alphabetic characters only
   * - 2-32 characters
   *
   * @example
   * ```typescript
   * verbs.validateAction('create')   // true
   * verbs.validateAction('Create')   // false (uppercase)
   * verbs.validateAction('create1')  // false (number)
   * ```
   */
  validateAction(action: string): boolean {
    // Allow lowercase letters and camelCase (for relationship verbs like memberOf, belongsTo)
    const actionRegex = /^[a-z][a-zA-Z]{1,31}$/
    return actionRegex.test(action)
  }

  /**
   * Generate verb forms from base action
   *
   * @param action - Base action form
   * @returns Generated verb forms (best effort)
   *
   * @description
   * Attempts to generate grammatical forms automatically.
   * Results should be reviewed for irregular verbs.
   *
   * @example
   * ```typescript
   * const forms = verbs.generateForms('process')
   * // { action: 'process', activity: 'processing', event: 'processed', reverse: 'processedBy' }
   * ```
   */
  generateForms(action: string): Partial<CreateVerbOptions> {
    // TODO: Implement basic English verb conjugation
    // Handle common patterns:
    // - Regular: process -> processing, processed
    // - -e ending: create -> creating, created
    // - Consonant doubling: submit -> submitting, submitted
    // - -y ending: copy -> copying, copied

    const lastChar = action.slice(-1)
    const secondLastChar = action.slice(-2, -1)

    let activity: string
    let event: string

    if (lastChar === 'e') {
      // create -> creating, created
      activity = action.slice(0, -1) + 'ing'
      event = action + 'd'
    } else if (lastChar === 'y' && !'aeiou'.includes(secondLastChar)) {
      // copy -> copying, copied
      activity = action + 'ing'
      event = action.slice(0, -1) + 'ied'
    } else if (
      'bdfgklmnprstvz'.includes(lastChar) &&
      'aeiou'.includes(secondLastChar) &&
      !'aeiou'.includes(action.slice(-3, -2))
    ) {
      // stop -> stopping, stopped (consonant doubling)
      activity = action + lastChar + 'ing'
      event = action + lastChar + 'ed'
    } else {
      // process -> processing, processed
      activity = action + 'ing'
      event = action + 'ed'
    }

    return {
      action,
      activity,
      event,
      reverse: event + 'By',
    }
  }

  /**
   * Export all verbs as a lookup map
   *
   * @returns Map of action to full verb definition
   *
   * @example
   * ```typescript
   * const lookup = await verbs.exportLookup()
   * // { create: { ... }, update: { ... }, ... }
   * ```
   */
  async exportLookup(): Promise<Record<string, Verb>> {
    const all = await this.list({ limit: 1000 })
    return Object.fromEntries(all.items.map((v) => [v.action, v]))
  }
}

export default VerbCollection
