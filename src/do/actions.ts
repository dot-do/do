/**
 * Action Operations Module
 *
 * Provides durable action execution:
 * - send: Fire-and-forget action
 * - doAction: Create and start action
 * - tryAction: Action with error handling
 * - getAction: Get action by ID
 * - queryActions: Query actions with filters
 * - startAction: Start a pending action
 * - completeAction: Complete an active action
 * - failAction: Fail an active action
 * - cancelAction: Cancel a pending/active action
 * - retryAction: Retry a failed action
 * - getNextRetryDelay: Calculate retry delay
 * - resetAction: Reset action to pending
 */

import {
  ActionResultSchema,
  ActionMetadataSchema,
  safeJsonParseOptional,
} from '../sqlite'

import type {
  DOContext,
  Action,
  ActionStatus,
  CreateActionOptions,
  ActionQueryOptions,
} from './types'

/**
 * Helper to convert database row to Action object
 * Returns null if JSON parsing fails for result or metadata
 */
function rowToAction<T extends Record<string, unknown> = Record<string, unknown>>(
  row: Record<string, unknown>
): Action<T> | null {
  // Use safe JSON parsing for result and metadata fields
  const result = safeJsonParseOptional(row.result as string | null, ActionResultSchema)
  const metadata = safeJsonParseOptional(row.metadata as string | null, ActionMetadataSchema)

  // If parsing failed (returned null but input was not null/undefined), skip this row
  if (row.result && result === null) {
    return null
  }
  if (row.metadata && metadata === null) {
    return null
  }

  return {
    id: row.id as string,
    actor: row.actor as string,
    object: row.object as string,
    action: row.action as string,
    status: row.status as ActionStatus,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    startedAt: row.started_at ? new Date(row.started_at as string) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
    result: result ?? undefined,
    error: row.error as string | undefined,
    metadata: (metadata ?? undefined) as T | undefined,
  }
}

/**
 * Send an action (fire-and-forget, creates in pending state)
 */
export async function send<T extends Record<string, unknown> = Record<string, unknown>>(
  ctx: DOContext,
  options: CreateActionOptions<T>
): Promise<Action<T>> {
  ctx.initSchema()

  const id = ctx.generateId()
  const now = new Date().toISOString()

  ctx.ctx.storage.sql.exec(
    `INSERT INTO actions (id, actor, object, action, status, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
    id,
    options.actor,
    options.object,
    options.action,
    options.metadata ? JSON.stringify(options.metadata) : null,
    now,
    now
  )

  return {
    id,
    actor: options.actor,
    object: options.object,
    action: options.action,
    status: 'pending',
    createdAt: new Date(now),
    updatedAt: new Date(now),
    metadata: options.metadata,
  }
}

/**
 * Do an action (create and immediately start, returns in active state)
 */
export async function doAction<T extends Record<string, unknown> = Record<string, unknown>>(
  ctx: DOContext,
  options: CreateActionOptions<T>
): Promise<Action<T>> {
  ctx.initSchema()

  const id = ctx.generateId()
  const now = new Date().toISOString()

  ctx.ctx.storage.sql.exec(
    `INSERT INTO actions (id, actor, object, action, status, metadata, created_at, updated_at, started_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
    id,
    options.actor,
    options.object,
    options.action,
    options.metadata ? JSON.stringify(options.metadata) : null,
    now,
    now,
    now
  )

  return {
    id,
    actor: options.actor,
    object: options.object,
    action: options.action,
    status: 'active',
    createdAt: new Date(now),
    updatedAt: new Date(now),
    startedAt: new Date(now),
    metadata: options.metadata,
  }
}

/**
 * Try an action (with built-in error handling)
 */
export async function tryAction<T extends Record<string, unknown> = Record<string, unknown>>(
  ctx: DOContext,
  options: CreateActionOptions<T>,
  fn: () => Promise<unknown>
): Promise<Action<T>> {
  // Create action in active state
  const action = await doAction(ctx, options)

  try {
    // Execute the function
    const result = await fn()

    // Complete the action with result
    return (await completeAction(ctx, action.id, result)) as Action<T>
  } catch (error) {
    // Fail the action with error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return (await failAction(ctx, action.id, errorMessage)) as Action<T>
  }
}

/**
 * Get an action by ID
 */
export async function getAction<T extends Record<string, unknown> = Record<string, unknown>>(
  ctx: DOContext,
  id: string
): Promise<Action<T> | null> {
  ctx.initSchema()

  const results = ctx.ctx.storage.sql.exec('SELECT * FROM actions WHERE id = ?', id).toArray()

  if (results.length === 0) {
    return null
  }

  return rowToAction<T>(results[0] as Record<string, unknown>)
}

/**
 * Query actions with filters
 */
export async function queryActions<T extends Record<string, unknown> = Record<string, unknown>>(
  ctx: DOContext,
  options?: ActionQueryOptions
): Promise<Action<T>[]> {
  ctx.initSchema()

  const conditions: string[] = []
  const params: unknown[] = []

  if (options?.actor) {
    conditions.push('actor = ?')
    params.push(options.actor)
  }

  if (options?.object) {
    conditions.push('object = ?')
    params.push(options.object)
  }

  if (options?.action) {
    conditions.push('action = ?')
    params.push(options.action)
  }

  if (options?.status) {
    if (Array.isArray(options.status)) {
      const placeholders = options.status.map(() => '?').join(', ')
      conditions.push(`status IN (${placeholders})`)
      params.push(...options.status)
    } else {
      conditions.push('status = ?')
      params.push(options.status)
    }
  }

  const limit = options?.limit ?? 100
  const offset = options?.offset ?? 0

  let query = 'SELECT * FROM actions'
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`
  }
  query += ` ORDER BY created_at ASC LIMIT ? OFFSET ?`
  params.push(limit, offset)

  const results = ctx.ctx.storage.sql.exec(query, ...params).toArray()

  return results
    .map((row) => rowToAction<T>(row as Record<string, unknown>))
    .filter((action): action is Action<T> => action !== null)
}

/**
 * Start a pending action (transition pending -> active)
 */
export async function startAction<T extends Record<string, unknown> = Record<string, unknown>>(
  ctx: DOContext,
  id: string
): Promise<Action<T>> {
  ctx.initSchema()

  const action = await getAction<T>(ctx, id)
  if (!action) {
    throw new Error(`Action not found: ${id}`)
  }

  if (action.status !== 'pending') {
    throw new Error(`Cannot start action in ${action.status} state`)
  }

  const now = new Date().toISOString()

  ctx.ctx.storage.sql.exec(
    'UPDATE actions SET status = ?, started_at = ?, updated_at = ? WHERE id = ?',
    'active',
    now,
    now,
    id
  )

  return {
    ...action,
    status: 'active',
    startedAt: new Date(now),
    updatedAt: new Date(now),
  }
}

/**
 * Complete an active action (transition active -> completed)
 */
export async function completeAction<T extends Record<string, unknown> = Record<string, unknown>>(
  ctx: DOContext,
  id: string,
  result?: unknown
): Promise<Action<T>> {
  ctx.initSchema()

  const action = await getAction<T>(ctx, id)
  if (!action) {
    throw new Error(`Action not found: ${id}`)
  }

  if (action.status !== 'active') {
    throw new Error(`Cannot complete action in ${action.status} state`)
  }

  const now = new Date().toISOString()

  ctx.ctx.storage.sql.exec(
    'UPDATE actions SET status = ?, result = ?, completed_at = ?, updated_at = ? WHERE id = ?',
    'completed',
    result !== undefined ? JSON.stringify(result) : null,
    now,
    now,
    id
  )

  return {
    ...action,
    status: 'completed',
    result,
    completedAt: new Date(now),
    updatedAt: new Date(now),
  }
}

/**
 * Fail an active action (transition active -> failed)
 */
export async function failAction<T extends Record<string, unknown> = Record<string, unknown>>(
  ctx: DOContext,
  id: string,
  error: string
): Promise<Action<T>> {
  ctx.initSchema()

  const action = await getAction<T>(ctx, id)
  if (!action) {
    throw new Error(`Action not found: ${id}`)
  }

  if (action.status !== 'active') {
    throw new Error(`Cannot fail action in ${action.status} state`)
  }

  const now = new Date().toISOString()

  ctx.ctx.storage.sql.exec(
    'UPDATE actions SET status = ?, error = ?, completed_at = ?, updated_at = ? WHERE id = ?',
    'failed',
    error,
    now,
    now,
    id
  )

  return {
    ...action,
    status: 'failed',
    error,
    completedAt: new Date(now),
    updatedAt: new Date(now),
  }
}

/**
 * Cancel a pending or active action
 */
export async function cancelAction<T extends Record<string, unknown> = Record<string, unknown>>(
  ctx: DOContext,
  id: string
): Promise<Action<T>> {
  ctx.initSchema()

  const action = await getAction<T>(ctx, id)
  if (!action) {
    throw new Error(`Action not found: ${id}`)
  }

  if (action.status !== 'pending' && action.status !== 'active') {
    throw new Error(`Cannot cancel action in ${action.status} state`)
  }

  const now = new Date().toISOString()

  ctx.ctx.storage.sql.exec(
    'UPDATE actions SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?',
    'cancelled',
    now,
    now,
    id
  )

  return {
    ...action,
    status: 'cancelled',
    completedAt: new Date(now),
    updatedAt: new Date(now),
  }
}

/**
 * Retry a failed action
 */
export async function retryAction<T extends Record<string, unknown> = Record<string, unknown>>(
  ctx: DOContext,
  id: string
): Promise<Action<T>> {
  ctx.initSchema()

  const action = await getAction<T>(ctx, id)
  if (!action) {
    throw new Error(`Action not found: ${id}`)
  }

  if (action.status !== 'failed') {
    throw new Error(`Cannot retry action in ${action.status} state`)
  }

  // Check max retries
  const metadata = action.metadata as Record<string, unknown> | undefined
  const maxRetries = (metadata?.maxRetries as number) ?? Infinity
  const currentRetryCount = (metadata?.retryCount as number) ?? 0

  if (currentRetryCount >= maxRetries) {
    throw new Error('Max retries exceeded')
  }

  const now = new Date().toISOString()
  const updatedMetadata = {
    ...metadata,
    retryCount: currentRetryCount + 1,
  }

  ctx.ctx.storage.sql.exec(
    'UPDATE actions SET status = ?, started_at = ?, completed_at = NULL, error = NULL, result = NULL, metadata = ?, updated_at = ? WHERE id = ?',
    'active',
    now,
    JSON.stringify(updatedMetadata),
    now,
    id
  )

  return {
    ...action,
    status: 'active',
    startedAt: new Date(now),
    completedAt: undefined,
    error: undefined,
    result: undefined,
    metadata: updatedMetadata as unknown as T,
    updatedAt: new Date(now),
  }
}

/**
 * Calculate next retry delay based on backoff configuration
 */
export async function getNextRetryDelay(
  ctx: DOContext,
  id: string
): Promise<number> {
  ctx.initSchema()

  const action = await getAction(ctx, id)
  if (!action) {
    throw new Error(`Action not found: ${id}`)
  }

  const metadata = action.metadata as Record<string, unknown> | undefined
  const backoff = metadata?.backoff as
    | {
        type: 'fixed' | 'exponential'
        delay?: number
        initialDelay?: number
        maxDelay?: number
        multiplier?: number
      }
    | undefined

  if (!backoff) {
    return 1000 // Default 1 second delay
  }

  const retryCount = (metadata?.retryCount as number) ?? 0

  if (backoff.type === 'fixed') {
    return backoff.delay ?? 1000
  }

  // Exponential backoff
  const initialDelay = backoff.initialDelay ?? 1000
  const multiplier = backoff.multiplier ?? 2
  const maxDelay = backoff.maxDelay ?? Infinity

  const delay = initialDelay * Math.pow(multiplier, retryCount)
  return Math.min(delay, maxDelay)
}

/**
 * Reset an action to pending state
 */
export async function resetAction<T extends Record<string, unknown> = Record<string, unknown>>(
  ctx: DOContext,
  id: string
): Promise<Action<T>> {
  ctx.initSchema()

  const action = await getAction<T>(ctx, id)
  if (!action) {
    throw new Error(`Action not found: ${id}`)
  }

  const now = new Date().toISOString()
  const metadata = action.metadata as Record<string, unknown> | undefined
  const resetMetadata = {
    ...metadata,
    retryCount: 0,
  }

  ctx.ctx.storage.sql.exec(
    'UPDATE actions SET status = ?, started_at = NULL, completed_at = NULL, error = NULL, result = NULL, metadata = ?, updated_at = ? WHERE id = ?',
    'pending',
    JSON.stringify(resetMetadata),
    now,
    id
  )

  return {
    ...action,
    status: 'pending',
    startedAt: undefined,
    completedAt: undefined,
    error: undefined,
    result: undefined,
    metadata: resetMetadata as unknown as T,
    updatedAt: new Date(now),
  }
}
