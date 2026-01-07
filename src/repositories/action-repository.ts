/**
 * ActionRepository - Mutable action storage for durable execution
 *
 * Implements the Repository Pattern for actions with:
 * - Full CRUD operations (unlike EventRepository which is append-only)
 * - Status lifecycle management (pending -> active -> completed/failed/cancelled)
 * - Filtering by actor, object, status
 * - Batch operations for efficiency
 * - Transaction support
 *
 * Actions are MUTABLE - they can be created, updated, and deleted.
 * This supports the durable execution model with status transitions.
 */

import type {
  Action,
  ActionStatus,
  CreateActionOptions,
  ActionQueryOptions,
} from '../types'

/**
 * SQL storage interface that the repository depends on
 */
export interface SqlStorage {
  exec(query: string, ...params: unknown[]): { toArray(): unknown[] }
}

/**
 * Raw action row from database
 */
interface ActionRow {
  id: string
  actor: string
  object: string
  action: string
  status: string
  metadata: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  completed_at: string | null
  result: string | null
  error: string | null
}

/**
 * Options for creating an action
 */
export interface CreateOptions {
  /** Start the action immediately (set status to 'active') */
  immediate?: boolean
}

/**
 * Options for updating an action
 */
export interface UpdateActionOptions<T extends Record<string, unknown> = Record<string, unknown>> {
  status?: ActionStatus
  startedAt?: Date
  completedAt?: Date
  result?: unknown
  error?: string
  metadata?: T
}

/**
 * Generate a unique ID for actions
 */
function generateActionId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `act_${timestamp}_${random}`
}

/**
 * Convert a database row to an Action object
 */
function rowToAction<T extends Record<string, unknown>>(row: ActionRow): Action<T> {
  return {
    id: row.id,
    actor: row.actor,
    object: row.object,
    action: row.action,
    status: row.status as ActionStatus,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    startedAt: row.started_at ? new Date(row.started_at) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    result: row.result ? JSON.parse(row.result) : undefined,
    error: row.error ?? undefined,
    metadata: row.metadata ? (JSON.parse(row.metadata) as T) : undefined,
  }
}

/**
 * Deep clone data to ensure immutability
 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

/**
 * ActionRepository - Mutable action storage
 *
 * This repository implements full CRUD operations because actions
 * represent ongoing work that changes state over time.
 */
export class ActionRepository {
  private sql: SqlStorage

  constructor(sql: SqlStorage) {
    this.sql = sql
    this.initSchema()
  }

  /**
   * Initialize the actions table schema
   */
  private initSchema(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS actions (
        id TEXT PRIMARY KEY,
        actor TEXT NOT NULL,
        object TEXT NOT NULL,
        action TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        metadata TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        result TEXT,
        error TEXT
      )
    `)
  }

  /**
   * Create a new action
   *
   * By default, creates in 'pending' status.
   * Use { immediate: true } to create in 'active' status with startedAt set.
   */
  async create<T extends Record<string, unknown>>(
    options: CreateActionOptions<T>,
    createOptions?: CreateOptions
  ): Promise<Action<T>> {
    const id = generateActionId()
    const now = new Date()
    const status: ActionStatus = createOptions?.immediate ? 'active' : (options.status ?? 'pending')
    const startedAt = createOptions?.immediate ? now : undefined
    const metadataJson = options.metadata ? JSON.stringify(options.metadata) : null

    this.sql.exec(
      `INSERT INTO actions (id, actor, object, action, status, metadata, created_at, updated_at, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      options.actor,
      options.object,
      options.action,
      status,
      metadataJson,
      now.toISOString(),
      now.toISOString(),
      startedAt?.toISOString() ?? null
    )

    return {
      id,
      actor: options.actor,
      object: options.object,
      action: options.action,
      status,
      createdAt: now,
      updatedAt: now,
      startedAt,
      metadata: options.metadata ? deepClone(options.metadata) : undefined,
    }
  }

  /**
   * Create multiple actions in a batch
   */
  async createMany<T extends Record<string, unknown>>(
    optionsArray: CreateActionOptions<T>[],
    createOptions?: CreateOptions
  ): Promise<Action<T>[]> {
    const results: Action<T>[] = []

    for (const options of optionsArray) {
      const action = await this.create(options, createOptions)
      results.push(action)
    }

    return results
  }

  /**
   * Find an action by its ID
   */
  async findById<T extends Record<string, unknown>>(id: string): Promise<Action<T> | null> {
    const results = this.sql.exec(
      `SELECT id, actor, object, action, status, metadata, created_at, updated_at, started_at, completed_at, result, error
       FROM actions WHERE id = ?`,
      id
    ).toArray() as ActionRow[]

    if (results.length === 0) {
      return null
    }

    return rowToAction<T>(results[0])
  }

  /**
   * Find all actions matching the given query options
   * Returns actions in chronological order by default
   */
  async findAll<T extends Record<string, unknown>>(
    options?: ActionQueryOptions
  ): Promise<Action<T>[]> {
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

    let query = `SELECT id, actor, object, action, status, metadata, created_at, updated_at, started_at, completed_at, result, error FROM actions`

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`
    }

    query += ' ORDER BY created_at ASC'

    if (options?.limit) {
      query += ` LIMIT ${options.limit}`
    }

    if (options?.offset) {
      query += ` OFFSET ${options.offset}`
    }

    const results = this.sql.exec(query, ...params).toArray() as ActionRow[]
    return results.map((row) => rowToAction<T>(row))
  }

  /**
   * Update an action
   *
   * Returns the updated action, or null if not found.
   * Automatically updates the updatedAt timestamp.
   * Merges metadata updates with existing metadata.
   */
  async update<T extends Record<string, unknown>>(
    id: string,
    updates: UpdateActionOptions<T>
  ): Promise<Action<T> | null> {
    // First, check if the action exists
    const existing = await this.findById<T>(id)
    if (!existing) {
      return null
    }

    const now = new Date()
    const setClauses: string[] = ['updated_at = ?']
    const params: unknown[] = [now.toISOString()]

    if (updates.status !== undefined) {
      setClauses.push('status = ?')
      params.push(updates.status)
    }

    if (updates.startedAt !== undefined) {
      setClauses.push('started_at = ?')
      params.push(updates.startedAt.toISOString())
    }

    if (updates.completedAt !== undefined) {
      setClauses.push('completed_at = ?')
      params.push(updates.completedAt.toISOString())
    }

    if (updates.result !== undefined) {
      setClauses.push('result = ?')
      params.push(JSON.stringify(updates.result))
    }

    if (updates.error !== undefined) {
      setClauses.push('error = ?')
      params.push(updates.error)
    }

    if (updates.metadata !== undefined) {
      // Merge with existing metadata
      const mergedMetadata = { ...existing.metadata, ...updates.metadata }
      setClauses.push('metadata = ?')
      params.push(JSON.stringify(mergedMetadata))
    }

    params.push(id)

    this.sql.exec(
      `UPDATE actions SET ${setClauses.join(', ')} WHERE id = ?`,
      ...params
    )

    // Return the updated action
    return this.findById<T>(id)
  }

  /**
   * Update multiple actions matching criteria
   *
   * Returns the count of updated actions.
   */
  async updateMany<T extends Record<string, unknown>>(
    criteria: ActionQueryOptions,
    updates: UpdateActionOptions<T>
  ): Promise<number> {
    const actions = await this.findAll<T>(criteria)
    let count = 0

    for (const action of actions) {
      const result = await this.update(action.id, updates)
      if (result) {
        count++
      }
    }

    return count
  }

  /**
   * Delete an action by ID
   *
   * Returns true if the action was deleted, false if not found.
   */
  async delete(id: string): Promise<boolean> {
    const existing = await this.findById(id)
    if (!existing) {
      return false
    }

    this.sql.exec(`DELETE FROM actions WHERE id = ?`, id)
    return true
  }

  /**
   * Execute operations within a transaction
   *
   * If the callback throws, changes are rolled back.
   * Note: Transaction support depends on the underlying storage adapter.
   */
  async transaction<R>(
    callback: (repo: ActionRepository) => Promise<R>
  ): Promise<R> {
    // For SQLite, we wrap in BEGIN/COMMIT/ROLLBACK
    // The transaction uses the same repository instance
    try {
      this.sql.exec('BEGIN TRANSACTION')
      const result = await callback(this)
      this.sql.exec('COMMIT')
      return result
    } catch (error) {
      this.sql.exec('ROLLBACK')
      throw error
    }
  }

  /**
   * Count actions matching the given query options
   */
  async count(options?: ActionQueryOptions): Promise<number> {
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

    let query = 'SELECT COUNT(*) as count FROM actions'

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`
    }

    const results = this.sql.exec(query, ...params).toArray() as Array<{ count: number }>
    return results[0]?.count ?? 0
  }

  // ============================================================================
  // Convenience methods for common status transitions
  // ============================================================================

  /**
   * Start an action (transition from pending to active)
   */
  async start<T extends Record<string, unknown>>(id: string): Promise<Action<T> | null> {
    return this.update<T>(id, {
      status: 'active',
      startedAt: new Date(),
    })
  }

  /**
   * Complete an action (transition from active to completed)
   */
  async complete<T extends Record<string, unknown>>(
    id: string,
    result?: unknown
  ): Promise<Action<T> | null> {
    return this.update<T>(id, {
      status: 'completed',
      completedAt: new Date(),
      result,
    })
  }

  /**
   * Fail an action (transition from active to failed)
   */
  async fail<T extends Record<string, unknown>>(
    id: string,
    error: string
  ): Promise<Action<T> | null> {
    return this.update<T>(id, {
      status: 'failed',
      completedAt: new Date(),
      error,
    })
  }

  /**
   * Cancel an action (transition to cancelled)
   */
  async cancel<T extends Record<string, unknown>>(id: string): Promise<Action<T> | null> {
    return this.update<T>(id, {
      status: 'cancelled',
      completedAt: new Date(),
    })
  }

  /**
   * Find all pending actions (ready to be started)
   */
  async findPending<T extends Record<string, unknown>>(
    options?: Omit<ActionQueryOptions, 'status'>
  ): Promise<Action<T>[]> {
    return this.findAll<T>({ ...options, status: 'pending' })
  }

  /**
   * Find all active actions (currently in progress)
   */
  async findActive<T extends Record<string, unknown>>(
    options?: Omit<ActionQueryOptions, 'status'>
  ): Promise<Action<T>[]> {
    return this.findAll<T>({ ...options, status: 'active' })
  }

  /**
   * Find all failed actions
   */
  async findFailed<T extends Record<string, unknown>>(
    options?: Omit<ActionQueryOptions, 'status'>
  ): Promise<Action<T>[]> {
    return this.findAll<T>({ ...options, status: 'failed' })
  }
}
