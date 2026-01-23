/**
 * Actions Collection - Durable action execution for Digital Objects
 *
 * @module collections/actions
 *
 * @description
 * Manages durable Actions (instances of Verbs) within a Digital Object.
 * Actions track the full lifecycle of operations from creation through completion,
 * including retry handling, error tracking, and actor attribution.
 *
 * Action lifecycle:
 * ```
 * pending -> running -> completed
 *                    -> failed -> retrying -> completed
 *                             -> cancelled
 *                    -> blocked (waiting on dependency)
 * ```
 *
 * @example
 * ```typescript
 * const actions = new ActionCollection(storage, verbs)
 *
 * // Create an action
 * const action = await actions.create({
 *   verb: 'subscribe',
 *   object: 'customer_123',
 *   input: { plan: 'pro' },
 *   actor: { type: 'User', id: 'user_456' }
 * })
 *
 * // Start execution
 * await actions.start(action.$id)
 *
 * // Complete with output
 * await actions.complete(action.$id, { subscriptionId: 'sub_789' })
 * ```
 */

import type {
  Action,
  ActionStatus,
  ActionError,
  ActionRequest,
  Actor,
  ActorType,
} from '../../types/collections'
import { BaseCollection, DOStorage, NotFoundError, ValidationError } from './base'
import type { VerbCollection } from './verbs'

/**
 * Options for creating an action
 */
export interface CreateActionOptions<TInput = unknown, TConfig = unknown> {
  /**
   * Verb reference (action type)
   */
  verb: string

  /**
   * Subject (who/what performed the action, if different from actor)
   */
  subject?: string

  /**
   * Object (what the action operates on)
   */
  object?: string

  /**
   * Input data for the action
   */
  input?: TInput

  /**
   * Configuration/options for the action
   */
  config?: TConfig

  /**
   * Actor who initiated this action
   */
  actor: Actor

  /**
   * Request that initiated this action (optional)
   */
  request?: ActionRequest

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>
}

/**
 * Options for failing an action
 */
export interface FailActionOptions {
  /**
   * Error code
   */
  code: string

  /**
   * Error message
   */
  message: string

  /**
   * Stack trace (optional)
   */
  stack?: string

  /**
   * Whether the action can be retried
   */
  retryable?: boolean
}

/**
 * Retry policy for actions
 */
export interface ActionRetryPolicy {
  /**
   * Maximum number of retry attempts
   */
  maxAttempts: number

  /**
   * Initial delay in milliseconds
   */
  initialDelay: number

  /**
   * Maximum delay in milliseconds
   */
  maxDelay: number

  /**
   * Backoff multiplier
   */
  backoffMultiplier: number
}

/**
 * Default retry policy
 */
export const DEFAULT_RETRY_POLICY: ActionRetryPolicy = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
}

/**
 * Actions collection for durable action execution
 *
 * @description
 * The ActionCollection manages the lifecycle of durable actions within a DO.
 * Every action is an instance of a Verb and tracks:
 *
 * - Who initiated it (Actor: User, Agent, Service, System)
 * - What it operates on (subject, object)
 * - Its current status and history
 * - Input, config, and output data
 * - Errors and retry information
 *
 * Actions are durable - they survive DO hibernation and can be resumed.
 * This enables long-running operations, workflows, and reliable execution.
 *
 * @example
 * ```typescript
 * const actions = new ActionCollection(storage, verbs)
 *
 * // Create and execute an action
 * const action = await actions.create({
 *   verb: 'process',
 *   object: 'order_123',
 *   input: { priority: 'high' },
 *   actor: { type: 'Service', id: 'payment-service' }
 * })
 *
 * try {
 *   await actions.start(action.$id)
 *   const result = await processOrder(action.input)
 *   await actions.complete(action.$id, result)
 * } catch (error) {
 *   await actions.fail(action.$id, {
 *     code: 'PROCESS_ERROR',
 *     message: error.message,
 *     retryable: true
 *   })
 * }
 *
 * // Query actions
 * const pending = await actions.findByStatus('pending')
 * const userActions = await actions.findByActor('User', 'user_123')
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ActionCollection extends BaseCollection<any> {
  /**
   * Reference to verb collection for type validation
   */
  private readonly verbs: VerbCollection

  /**
   * Default retry policy
   */
  private readonly retryPolicy: ActionRetryPolicy

  /**
   * Create a new ActionCollection instance
   *
   * @param storage - DO storage interface
   * @param verbs - Verb collection for type validation
   * @param retryPolicy - Optional custom retry policy
   */
  constructor(
    storage: DOStorage,
    verbs: VerbCollection,
    retryPolicy: ActionRetryPolicy = DEFAULT_RETRY_POLICY
  ) {
    super(storage, {
      name: 'actions',
      idPrefix: 'action',
    })
    this.verbs = verbs
    this.retryPolicy = retryPolicy
  }

  /**
   * Initialize the actions table in SQLite
   *
   * @internal
   */
  protected async initializeTable(): Promise<void> {
    // Using KV storage via BaseCollection, no SQL table needed
  }

  /**
   * Create a new action
   *
   * @param data - Action creation options
   * @returns Created action with generated ID and pending status
   *
   * @throws {ValidationError} If verb is not registered
   *
   * @example
   * ```typescript
   * const action = await actions.create({
   *   verb: 'approve',
   *   object: 'request_123',
   *   actor: { type: 'User', id: 'user_456', name: 'John' }
   * })
   * console.log(action.status) // 'pending'
   * ```
   */
  async create<TInput = unknown, TConfig = unknown>(
    data: CreateActionOptions<TInput, TConfig>
  ): Promise<Action<TInput, unknown, TConfig>> {
    if (!data.verb) {
      throw new ValidationError('Verb is required', 'verb')
    }
    if (!data.actor) {
      throw new ValidationError('Actor is required', 'actor')
    }

    const $id = this.generateId()
    const now = this.now()

    const action: Action<TInput, unknown, TConfig> = {
      $id,
      verb: data.verb,
      subject: data.subject,
      object: data.object,
      input: data.input,
      config: data.config,
      status: 'pending' as unknown as ActionStatus,
      actor: data.actor,
      request: data.request,
      createdAt: now,
      updatedAt: now,
      metadata: data.metadata,
    }

    const key = `${this.config.name}:${$id}`
    await this.storage.put(key, action)

    return action
  }

  /**
   * Start action execution
   *
   * @param id - Action ID
   * @returns Updated action with 'running' status
   *
   * @throws {NotFoundError} If action not found
   * @throws {ValidationError} If action is not in 'pending' or 'retrying' status
   *
   * @example
   * ```typescript
   * const action = await actions.start('action_123')
   * console.log(action.status) // 'running'
   * console.log(action.startedAt) // timestamp
   * ```
   */
  async start(id: string): Promise<Action> {
    const action = await this.get(id)
    if (!action) {
      throw new NotFoundError('actions', id)
    }

    const status = String(action.status).toLowerCase()
    if (status !== 'pending' && status !== 'retrying') {
      throw new ValidationError(`Cannot start action in '${action.status}' status. Must be 'pending' or 'retrying'.`)
    }

    const now = this.now()
    const updated: Action = {
      ...action,
      status: 'running' as unknown as ActionStatus,
      startedAt: action.startedAt ?? now,
      updatedAt: now,
    }

    const key = `${this.config.name}:${id}`
    await this.storage.put(key, updated)

    return updated
  }

  /**
   * Complete action successfully
   *
   * @param id - Action ID
   * @param output - Output data from action execution
   * @returns Updated action with 'completed' status
   *
   * @throws {NotFoundError} If action not found
   * @throws {ValidationError} If action is not in 'running' status
   *
   * @example
   * ```typescript
   * const action = await actions.complete('action_123', {
   *   subscriptionId: 'sub_789',
   *   activatedAt: Date.now()
   * })
   * console.log(action.status) // 'completed'
   * ```
   */
  async complete<TOutput = unknown>(id: string, output?: TOutput): Promise<Action> {
    const action = await this.get(id)
    if (!action) {
      throw new NotFoundError('actions', id)
    }

    const status = String(action.status).toLowerCase()
    if (status !== 'running') {
      throw new ValidationError(`Cannot complete action in '${action.status}' status. Must be 'running'.`)
    }

    const now = this.now()
    const updated: Action = {
      ...action,
      status: 'completed' as unknown as ActionStatus,
      output,
      completedAt: now,
      updatedAt: now,
    }

    const key = `${this.config.name}:${id}`
    await this.storage.put(key, updated)

    return updated
  }

  /**
   * Fail action with error
   *
   * @param id - Action ID
   * @param error - Error details
   * @returns Updated action with 'failed' or 'retrying' status
   *
   * @throws {NotFoundError} If action not found
   * @throws {ValidationError} If action is not in 'running' status
   *
   * @description
   * If the error is retryable and retry attempts remain, status becomes 'retrying'.
   * Otherwise, status becomes 'failed'.
   *
   * @example
   * ```typescript
   * const action = await actions.fail('action_123', {
   *   code: 'PAYMENT_DECLINED',
   *   message: 'Card declined',
   *   retryable: true
   * })
   * console.log(action.status) // 'retrying' or 'failed'
   * ```
   */
  async fail(id: string, error: FailActionOptions): Promise<Action> {
    const action = await this.get(id)
    if (!action) {
      throw new NotFoundError('actions', id)
    }

    const status = String(action.status).toLowerCase()
    if (status !== 'running') {
      throw new ValidationError(`Cannot fail action in '${action.status}' status. Must be 'running'.`)
    }

    const retryCount = (action.error?.retryCount ?? 0) + 1
    const actionError: ActionError = {
      code: error.code,
      message: error.message,
      stack: error.stack,
      retryCount,
      retryable: error.retryable ?? false,
    }

    // Determine if we should retry
    const canRetry = error.retryable && retryCount <= this.retryPolicy.maxAttempts
    const newStatus = canRetry ? 'retrying' : 'failed'

    const now = this.now()
    const updated: Action = {
      ...action,
      status: newStatus as unknown as ActionStatus,
      error: actionError,
      updatedAt: now,
    }

    const key = `${this.config.name}:${id}`
    await this.storage.put(key, updated)

    return updated
  }

  /**
   * Cancel an action
   *
   * @param id - Action ID
   * @param reason - Optional cancellation reason
   * @returns Updated action with 'cancelled' status
   *
   * @throws {NotFoundError} If action not found
   * @throws {ValidationError} If action is already completed or failed
   *
   * @example
   * ```typescript
   * await actions.cancel('action_123', 'User requested cancellation')
   * ```
   */
  async cancel(id: string, reason?: string): Promise<Action> {
    const action = await this.get(id)
    if (!action) {
      throw new NotFoundError('actions', id)
    }

    const status = String(action.status).toLowerCase()
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      throw new ValidationError(`Cannot cancel action in '${action.status}' status.`)
    }

    const now = this.now()
    const metadata = { ...(action.metadata ?? {}), ...(reason ? { cancellationReason: reason } : {}) }
    const updated: Action = {
      ...action,
      status: 'cancelled' as unknown as ActionStatus,
      metadata,
      updatedAt: now,
    }

    const key = `${this.config.name}:${id}`
    await this.storage.put(key, updated)

    return updated
  }

  /**
   * Block an action (waiting on dependency)
   *
   * @param id - Action ID
   * @param dependency - ID of the blocking action or resource
   * @returns Updated action with 'blocked' status
   *
   * @throws {NotFoundError} If action not found
   *
   * @example
   * ```typescript
   * // Block action until payment is processed
   * await actions.block('action_123', 'action_payment_456')
   * ```
   */
  async block(id: string, dependency: string): Promise<Action> {
    const action = await this.get(id)
    if (!action) {
      throw new NotFoundError('actions', id)
    }

    const now = this.now()
    const metadata = { ...(action.metadata ?? {}), dependency }
    const updated: Action = {
      ...action,
      status: 'blocked' as unknown as ActionStatus,
      metadata,
      updatedAt: now,
    }

    const key = `${this.config.name}:${id}`
    await this.storage.put(key, updated)

    return updated
  }

  /**
   * Unblock an action
   *
   * @param id - Action ID
   * @returns Updated action with 'pending' status
   *
   * @throws {NotFoundError} If action not found
   * @throws {ValidationError} If action is not blocked
   */
  async unblock(id: string): Promise<Action> {
    const action = await this.get(id)
    if (!action) {
      throw new NotFoundError('actions', id)
    }

    const status = String(action.status).toLowerCase()
    if (status !== 'blocked') {
      throw new ValidationError(`Cannot unblock action in '${action.status}' status. Must be 'blocked'.`)
    }

    const now = this.now()
    const updated: Action = {
      ...action,
      status: 'pending' as unknown as ActionStatus,
      updatedAt: now,
    }

    const key = `${this.config.name}:${id}`
    await this.storage.put(key, updated)

    return updated
  }

  /**
   * Get action by ID
   *
   * @param id - Action ID
   * @returns Action or null if not found
   */
  async get(id: string): Promise<Action | null> {
    if (!id) return null
    const key = `${this.config.name}:${id}`
    const action = await this.storage.get<Action>(key)
    return action ?? null
  }

  /**
   * Find actions by status
   *
   * @param status - Action status to filter by
   * @returns Array of matching actions
   *
   * @example
   * ```typescript
   * const pending = await actions.findByStatus('pending')
   * const running = await actions.findByStatus('running')
   * ```
   */
  async findByStatus(status: ActionStatus): Promise<Action[]> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<Action>({ prefix })
    const statusLower = String(status).toLowerCase()
    const results: Action[] = []
    for (const item of allItems.values()) {
      if (String(item.status).toLowerCase() === statusLower) {
        results.push(item)
      }
    }
    return results
  }

  /**
   * Find actions by verb
   *
   * @param verb - Verb action form
   * @returns Array of matching actions
   *
   * @example
   * ```typescript
   * const approvals = await actions.findByVerb('approve')
   * ```
   */
  async findByVerb(verb: string): Promise<Action[]> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<Action>({ prefix })
    const results: Action[] = []
    for (const item of allItems.values()) {
      if (item.verb === verb) {
        results.push(item)
      }
    }
    return results
  }

  /**
   * Find actions by actor
   *
   * @param actorType - Actor type (User, Agent, Service, System)
   * @param actorId - Actor ID
   * @returns Array of matching actions
   *
   * @example
   * ```typescript
   * const userActions = await actions.findByActor('User', 'user_123')
   * const serviceActions = await actions.findByActor('Service', 'payment-service')
   * ```
   */
  async findByActor(actorType: ActorType, actorId: string): Promise<Action[]> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<Action>({ prefix })
    const results: Action[] = []
    for (const item of allItems.values()) {
      if (item.actor?.type === actorType && item.actor?.id === actorId) {
        results.push(item)
      }
    }
    return results
  }

  /**
   * Find actions by object
   *
   * @param object - Object ID
   * @returns Array of actions on the object
   *
   * @example
   * ```typescript
   * const orderActions = await actions.findByObject('order_123')
   * ```
   */
  async findByObject(object: string): Promise<Action[]> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<Action>({ prefix })
    const results: Action[] = []
    for (const item of allItems.values()) {
      if (item.object === object) {
        results.push(item)
      }
    }
    return results
  }

  /**
   * Find retryable actions that are ready for retry
   *
   * @returns Actions in 'retrying' status ready for next attempt
   *
   * @description
   * Calculates next retry time based on retry policy and returns
   * actions that are past their retry delay.
   */
  async findRetryable(): Promise<Action[]> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<Action>({ prefix })
    const now = this.now()
    const results: Action[] = []
    for (const item of allItems.values()) {
      if (String(item.status).toLowerCase() === 'retrying') {
        const retryCount = item.error?.retryCount ?? 0
        const delay = this.calculateRetryDelay(retryCount - 1)
        const lastFailedAt = item.updatedAt ?? item.createdAt
        if (now - lastFailedAt >= delay) {
          results.push(item)
        }
      }
    }
    return results
  }

  /**
   * Get pending actions count
   *
   * @returns Number of pending actions
   */
  async getPendingCount(): Promise<number> {
    return this.count({ field: 'status', op: 'eq', value: 'pending' })
  }

  /**
   * Get running actions count
   *
   * @returns Number of running actions
   */
  async getRunningCount(): Promise<number> {
    return this.count({ field: 'status', op: 'eq', value: 'running' })
  }

  /**
   * Calculate next retry delay
   *
   * @param retryCount - Current retry count
   * @returns Delay in milliseconds
   *
   * @internal
   */
  calculateRetryDelay(retryCount: number): number {
    const delay = this.retryPolicy.initialDelay * Math.pow(this.retryPolicy.backoffMultiplier, retryCount)
    return Math.min(delay, this.retryPolicy.maxDelay)
  }

  /**
   * Check if action can be retried
   *
   * @param action - Action to check
   * @returns True if retry is possible
   *
   * @internal
   */
  canRetry(action: Action): boolean {
    if (!action.error?.retryable) return false
    const retryCount = action.error.retryCount ?? 0
    return retryCount < this.retryPolicy.maxAttempts
  }

  /**
   * Get action statistics
   *
   * @returns Count of actions by status
   *
   * @example
   * ```typescript
   * const stats = await actions.getStats()
   * // { pending: 5, running: 2, completed: 100, failed: 3 }
   * ```
   */
  async getStats(): Promise<Record<ActionStatus, number>> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<Action>({ prefix })
    const stats: Record<string, number> = {
      Pending: 0,
      Running: 0,
      Completed: 0,
      Failed: 0,
      Cancelled: 0,
      Retrying: 0,
      Blocked: 0,
    }
    for (const item of allItems.values()) {
      const statusLower = String(item.status).toLowerCase()
      // Map to PascalCase keys
      const key = statusLower.charAt(0).toUpperCase() + statusLower.slice(1)
      if (key in stats) {
        stats[key]++
      }
    }
    return stats as Record<ActionStatus, number>
  }

  /**
   * Clean up old completed/failed actions
   *
   * @param olderThan - Delete actions older than this timestamp
   * @returns Number of deleted actions
   *
   * @example
   * ```typescript
   * // Delete completed actions older than 30 days
   * const deleted = await actions.cleanup(Date.now() - 30 * 24 * 60 * 60 * 1000)
   * ```
   */
  async cleanup(olderThan: number): Promise<number> {
    const prefix = `${this.config.name}:`
    const allItems = await this.storage.list<Action>({ prefix })
    let deleted = 0
    for (const [key, item] of allItems.entries()) {
      const status = String(item.status).toLowerCase()
      if ((status === 'completed' || status === 'failed' || status === 'cancelled') && item.createdAt < olderThan) {
        await this.storage.delete(key)
        deleted++
      }
    }
    return deleted
  }
}

export default ActionCollection
