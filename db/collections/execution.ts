/**
 * Execution Manager - Orchestrates function execution flow
 *
 * @module collections/execution
 *
 * @description
 * Manages the execution lifecycle of functions within a Digital Object.
 * The ExecutionManager coordinates between Actions (mutable execution state)
 * and Events (immutable audit trail).
 *
 * Execution flow:
 * 1. execute(functionId, input, actor) - Creates Action with status='pending'
 * 2. start(actionId) - Transitions to 'running'
 * 3. complete(actionId, output) - Transitions to 'completed' AND emits Event
 * 4. fail(actionId, error) - Transitions to 'failed' AND emits Event
 *
 * Key principles:
 * - Actions track mutable execution state (pending -> running -> completed/failed)
 * - Events provide immutable audit trail of completions and failures
 * - Every completion/failure emits an event with correlationId linking to action
 *
 * @example
 * ```typescript
 * const executionManager = new ExecutionManager(storage)
 *
 * // Execute a function
 * const action = await executionManager.execute(
 *   'fn_process_order',
 *   { orderId: 'order_123' },
 *   { type: 'User', id: 'user_456' }
 * )
 *
 * // Start execution
 * await executionManager.start(action.$id)
 *
 * // Complete with output (also emits event)
 * await executionManager.complete(action.$id, { result: 'success' })
 * ```
 */

import type { Action, ActionError, Actor } from '../../types/collections'
import { DOStorage, NotFoundError, ValidationError } from './base'
import { ActionCollection } from './actions'
import { EventCollection } from './events'
import { VerbCollection } from './verbs'

/**
 * Error options for failing an action
 */
export interface ExecutionError {
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
}

/**
 * Execution Manager - Orchestrates function execution
 *
 * @description
 * Provides a high-level interface for executing functions with proper
 * lifecycle management and event emission.
 *
 * The ExecutionManager:
 * 1. Creates Actions to track execution state
 * 2. Manages state transitions (pending -> running -> completed/failed)
 * 3. Emits Events for completed and failed executions
 * 4. Provides query methods for finding actions
 *
 * @example
 * ```typescript
 * const executionManager = new ExecutionManager(storage)
 *
 * // Execute with full lifecycle
 * const action = await executionManager.execute('fn_send_email', { to: 'user@example.com' }, actor)
 * await executionManager.start(action.$id)
 *
 * try {
 *   const result = await sendEmail(action.input)
 *   await executionManager.complete(action.$id, result)
 * } catch (err) {
 *   await executionManager.fail(action.$id, { code: 'EMAIL_ERROR', message: err.message })
 * }
 * ```
 */
export class ExecutionManager {
  /**
   * Storage interface
   */
  protected readonly storage: DOStorage

  /**
   * Action collection for managing execution state
   */
  protected readonly actions: ActionCollection

  /**
   * Event collection for emitting completion/failure events
   */
  protected readonly events: EventCollection

  /**
   * Create a new ExecutionManager instance
   *
   * @param storage - DO storage interface
   * @param actionCollection - Optional existing ActionCollection
   * @param eventCollection - Optional existing EventCollection
   */
  constructor(storage: DOStorage, actionCollection?: ActionCollection, eventCollection?: EventCollection) {
    this.storage = storage

    // Create a minimal verb collection for actions (not used for validation in this context)
    const verbs = new VerbCollection(storage)

    this.actions = actionCollection ?? new ActionCollection(storage, verbs)
    this.events = eventCollection ?? new EventCollection(storage)
  }

  /**
   * Execute a function - creates an Action in pending status
   *
   * @description
   * Creates a new Action to track the function execution. The action starts
   * in 'pending' status and must be explicitly started with start().
   *
   * @param functionId - The function identifier (stored as verb)
   * @param input - Input data for the function
   * @param actor - Who initiated this execution
   * @returns The created Action in pending status
   *
   * @example
   * ```typescript
   * const action = await executionManager.execute(
   *   'fn_process_payment',
   *   { amount: 100, currency: 'USD' },
   *   { type: 'Service', id: 'payment-service' }
   * )
   * console.log(action.status) // 'pending'
   * console.log(action.verb) // 'fn_process_payment'
   * ```
   */
  async execute<TInput = unknown>(functionId: string, input: TInput, actor: Actor): Promise<Action<TInput>> {
    return this.actions.create({
      verb: functionId,
      input,
      actor,
    })
  }

  /**
   * Start action execution - transitions from pending to running
   *
   * @param actionId - The action ID to start
   * @returns The updated Action in running status
   *
   * @throws {NotFoundError} If action not found
   * @throws {ValidationError} If action is not in pending status
   *
   * @example
   * ```typescript
   * const runningAction = await executionManager.start(action.$id)
   * console.log(runningAction.status) // 'running'
   * console.log(runningAction.startedAt) // timestamp
   * ```
   */
  async start(actionId: string): Promise<Action> {
    return this.actions.start(actionId)
  }

  /**
   * Complete action execution - transitions to completed AND emits event
   *
   * @description
   * Marks the action as completed with the given output, then emits a
   * 'function.completed' event with the action ID as correlation ID.
   *
   * @param actionId - The action ID to complete
   * @param output - Output data from the function execution
   * @returns The updated Action in completed status
   *
   * @throws {NotFoundError} If action not found
   * @throws {ValidationError} If action is not in running status
   *
   * @example
   * ```typescript
   * const completedAction = await executionManager.complete(action.$id, {
   *   result: 'success',
   *   processedAt: Date.now()
   * })
   * console.log(completedAction.status) // 'completed'
   *
   * // An event was also emitted:
   * const events = await eventCollection.findByActionId(action.$id)
   * const completedEvent = events.find(e => e.type === 'function.completed')
   * ```
   */
  async complete<TOutput = unknown>(actionId: string, output?: TOutput): Promise<Action> {
    const completedAction = await this.actions.complete(actionId, output)

    // Emit function.completed event
    await this.events.emit({
      type: 'function.completed',
      payload: {
        actionId,
        functionId: completedAction.verb,
        output,
      },
      source: 'execution-manager',
      correlationId: actionId,
    })

    return completedAction
  }

  /**
   * Fail action execution - transitions to failed AND emits event
   *
   * @description
   * Marks the action as failed with the given error, then emits a
   * 'function.failed' event with the action ID as correlation ID.
   *
   * @param actionId - The action ID to fail
   * @param error - Error details
   * @returns The updated Action in failed status
   *
   * @throws {NotFoundError} If action not found
   * @throws {ValidationError} If action is not in running status
   *
   * @example
   * ```typescript
   * const failedAction = await executionManager.fail(action.$id, {
   *   code: 'TIMEOUT',
   *   message: 'Function timed out after 30s'
   * })
   * console.log(failedAction.status) // 'failed'
   *
   * // An event was also emitted:
   * const events = await eventCollection.findByActionId(action.$id)
   * const failedEvent = events.find(e => e.type === 'function.failed')
   * ```
   */
  async fail(actionId: string, error: ExecutionError): Promise<Action> {
    const failedAction = await this.actions.fail(actionId, {
      code: error.code,
      message: error.message,
      stack: error.stack,
      retryable: false,
    })

    // Emit function.failed event
    await this.events.emit({
      type: 'function.failed',
      payload: {
        actionId,
        functionId: failedAction.verb,
        error,
      },
      source: 'execution-manager',
      correlationId: actionId,
    })

    return failedAction
  }

  /**
   * Get an action by ID
   *
   * @param actionId - The action ID to retrieve
   * @returns The action or null if not found
   *
   * @example
   * ```typescript
   * const action = await executionManager.getAction('action_123')
   * if (action) {
   *   console.log(action.status, action.verb)
   * }
   * ```
   */
  async getAction(actionId: string): Promise<Action | null> {
    return this.actions.get(actionId)
  }

  /**
   * Find actions by function ID
   *
   * @description
   * Finds all actions that executed a specific function. The function ID
   * is stored in the action's verb field.
   *
   * @param functionId - The function ID to search for
   * @returns Array of actions that executed this function
   *
   * @example
   * ```typescript
   * const actions = await executionManager.findByFunction('fn_send_email')
   * const completed = actions.filter(a => a.status === 'completed')
   * const failed = actions.filter(a => a.status === 'failed')
   * ```
   */
  async findByFunction(functionId: string): Promise<Action[]> {
    return this.actions.findByVerb(functionId)
  }

  /**
   * Get the event collection for direct event queries
   *
   * @description
   * Provides access to the underlying EventCollection for advanced
   * event queries (by type, correlation ID, etc.)
   *
   * @returns The EventCollection instance
   *
   * @example
   * ```typescript
   * const events = executionManager.getEventCollection()
   * const allCompleted = await events.findByType('function.completed')
   * ```
   */
  getEventCollection(): EventCollection {
    return this.events
  }

  /**
   * Get the action collection for direct action queries
   *
   * @description
   * Provides access to the underlying ActionCollection for advanced
   * action queries (by status, actor, etc.)
   *
   * @returns The ActionCollection instance
   */
  getActionCollection(): ActionCollection {
    return this.actions
  }
}

export default ExecutionManager
