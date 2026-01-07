/**
 * Workflow Operations Module
 *
 * Provides workflow state management:
 * - getWorkflowState: Get workflow state
 * - saveWorkflowState: Save workflow state
 * - createWorkflowContext: Create the $ context object
 */

import {
  WorkflowContextSchema,
  WorkflowHistorySchema,
  safeJsonParse,
} from '../sqlite'

import type {
  DOContext,
  WorkflowContext,
  WorkflowState,
  WorkflowHistoryEntry,
  ScheduleInterval,
  EventHandler,
  ScheduleHandler,
} from './types'

import * as actions from './actions'
import * as events from './events'

/**
 * Get workflow state from database
 */
export async function getWorkflowState(
  ctx: DOContext,
  workflowId = 'default'
): Promise<WorkflowState> {
  ctx.initSchema()

  const results = ctx.ctx.storage.sql
    .exec('SELECT * FROM workflow_state WHERE id = ?', workflowId)
    .toArray()

  if (results.length === 0) {
    return {
      context: {},
      history: [],
    }
  }

  const row = results[0] as {
    id: string
    current: string | null
    context: string
    history: string
    updated_at: string
  }

  // Use safe JSON parsing for workflow context and history
  const context = safeJsonParse(row.context, WorkflowContextSchema)
  const history = safeJsonParse(row.history, WorkflowHistorySchema)

  // Return default state if parsing fails
  if (context === null || history === null) {
    return {
      context: {},
      history: [],
    }
  }

  return {
    current: row.current ?? undefined,
    context,
    history,
  }
}

/**
 * Save workflow state to database
 */
export async function saveWorkflowState(
  ctx: DOContext,
  state: WorkflowState,
  workflowId = 'default'
): Promise<void> {
  ctx.initSchema()

  const now = new Date().toISOString()

  // Check if state exists
  const existing = ctx.ctx.storage.sql
    .exec('SELECT id FROM workflow_state WHERE id = ?', workflowId)
    .toArray()

  if (existing.length === 0) {
    // Insert new state
    ctx.ctx.storage.sql.exec(
      'INSERT INTO workflow_state (id, current, context, history, updated_at) VALUES (?, ?, ?, ?, ?)',
      workflowId,
      state.current ?? null,
      JSON.stringify(state.context),
      JSON.stringify(state.history),
      now
    )
  } else {
    // Update existing state
    ctx.ctx.storage.sql.exec(
      'UPDATE workflow_state SET current = ?, context = ?, history = ?, updated_at = ? WHERE id = ?',
      state.current ?? null,
      JSON.stringify(state.context),
      JSON.stringify(state.history),
      now,
      workflowId
    )
  }
}

/**
 * Register a workflow handler for an event pattern
 */
export function registerWorkflowHandler<T = unknown, R = unknown>(
  ctx: DOContext,
  eventPattern: string,
  handler: EventHandler<T, R>
): void {
  ctx.workflowHandlers.set(eventPattern, handler as EventHandler)
}

/**
 * Get registered workflow handlers for an event pattern
 */
export async function getWorkflowHandlers(
  ctx: DOContext,
  eventPattern: string
): Promise<EventHandler[]> {
  const handler = ctx.workflowHandlers.get(eventPattern)
  return handler ? [handler] : []
}

/**
 * Register a schedule with a handler
 */
export function registerSchedule(
  ctx: DOContext,
  interval: ScheduleInterval,
  handler: ScheduleHandler
): void {
  ctx.workflowSchedules.push({ interval, handler })
}

/**
 * Get all registered schedules
 */
export async function getSchedules(
  ctx: DOContext
): Promise<ScheduleInterval[]> {
  return ctx.workflowSchedules.map((s) => s.interval)
}

/**
 * Create a WorkflowContext (the $ object passed to workflow handlers)
 */
export async function createWorkflowContext(
  ctx: DOContext,
  workflowId = 'default'
): Promise<WorkflowContext> {
  ctx.initSchema()

  // Load existing state
  const state = await getWorkflowState(ctx, workflowId)

  // Create a proxy for state that auto-saves on write
  const stateProxy = new Proxy(state.context, {
    set(target, prop, value) {
      target[prop as string] = value
      // Schedule save (will be batched)
      saveWorkflowState(ctx, state, workflowId)
      return true
    },
    get(target, prop) {
      return target[prop as string]
    },
  })

  // Internal method to add history entry
  const addHistoryEntry = (entry: WorkflowHistoryEntry) => {
    state.history.push(entry)
    saveWorkflowState(ctx, state, workflowId)
  }

  // Internal method to set current state (for state machines)
  const setCurrentState = (current: string) => {
    state.current = current
    saveWorkflowState(ctx, state, workflowId)
  }

  const $: WorkflowContext & {
    _addHistoryEntry: (entry: WorkflowHistoryEntry) => void
    _setCurrentState: (current: string) => void
  } = {
    // Fire and forget event (durable)
    send: async <T = unknown>(event: string, data: T): Promise<void> => {
      // Track the event durably
      await events.track(ctx, {
        type: event,
        source: `workflow:${workflowId}`,
        data: data as Record<string, unknown>,
      })

      // Add to history
      addHistoryEntry({
        timestamp: Date.now(),
        type: 'event',
        name: event,
        data,
      })
    },

    // Durable action - waits for result, retries on failure
    do: async <TData = unknown, TResult = unknown>(
      event: string,
      data: TData
    ): Promise<TResult> => {
      const handler = ctx.workflowHandlers.get(event)
      if (!handler) {
        throw new Error(`No handler registered for event: ${event}`)
      }

      // Create durable action record
      const action = await actions.doAction(ctx, {
        actor: `workflow:${workflowId}`,
        object: event,
        action: event,
        metadata: { data },
      })

      // Add to history
      addHistoryEntry({
        timestamp: Date.now(),
        type: 'action',
        name: event,
        data,
      })

      // Execute with retry logic
      const maxRetries = 3
      let lastError: Error | undefined

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const result = await handler(data, $)
          // Complete the action
          await actions.completeAction(ctx, action.id, result)
          return result as TResult
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
          if (attempt < maxRetries - 1) {
            // Wait before retry with exponential backoff
            await new Promise((resolve) =>
              setTimeout(resolve, Math.pow(2, attempt) * 100)
            )
          }
        }
      }

      // All retries failed
      await actions.failAction(ctx, action.id, lastError?.message ?? 'Unknown error')
      throw lastError
    },

    // Non-durable action - waits for result, no retries
    try: async <TData = unknown, TResult = unknown>(
      event: string,
      data: TData
    ): Promise<TResult> => {
      const handler = ctx.workflowHandlers.get(event)
      if (!handler) {
        throw new Error(`No handler registered for event: ${event}`)
      }

      // Add to history for debugging but don't persist action
      addHistoryEntry({
        timestamp: Date.now(),
        type: 'action',
        name: event,
        data,
      })

      // Execute without retry (non-durable)
      const result = await handler(data, $)
      return result as TResult
    },

    // Read/write context data
    state: stateProxy,

    // Get full workflow state
    getState: (): WorkflowState => {
      return {
        current: state.current,
        context: state.context,
        history: state.history,
      }
    },

    // Set a value in context
    set: <T = unknown>(key: string, value: T): void => {
      state.context[key] = value
      saveWorkflowState(ctx, state, workflowId)
    },

    // Get a value from context
    get: <T = unknown>(key: string): T | undefined => {
      return state.context[key] as T | undefined
    },

    // Log message
    log: (message: string, data?: unknown): void => {
      addHistoryEntry({
        timestamp: Date.now(),
        type: 'event', // logs are recorded as events in history
        name: message,
        data,
      })
    },

    // Access to database operations
    db: ctx as unknown as WorkflowContext['db'],

    // Internal methods for testing
    _addHistoryEntry: addHistoryEntry,
    _setCurrentState: setCurrentState,
  }

  return $
}
