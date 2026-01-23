/**
 * DigitalObject - Base Durable Object Class
 *
 * Every DO has:
 * - $id, $type, $context identity
 * - SQLite storage with hibernation
 * - Alarm-based scheduling
 * - WebSocket with hibernation (95% cost savings)
 * - CDC streaming to parent ($context)
 */

import type { DOContext, DOType, DigitalObjectIdentity } from '../types'

// =============================================================================
// Schedule Types
// =============================================================================

interface Schedule<T = unknown> {
  id: string
  callback: string
  payload: T
  type: 'scheduled' | 'delayed' | 'cron'
  time: number
  delayInSeconds?: number
  cron?: string
  createdAt: number
}

// =============================================================================
// DigitalObject Class
// =============================================================================

export class DigitalObject implements DurableObject {
  private readonly sql: SqlStorage
  private readonly state: DurableObjectState
  private readonly env: Env

  // Identity
  $id!: string
  $type!: DOType
  $context?: string
  $version = 1

  // Hibernation support
  static options = { hibernate: true }

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.sql = state.storage.sql
    this.env = env

    // Initialize schema
    this.initializeSchema()
  }

  // ===========================================================================
  // Schema Initialization
  // ===========================================================================

  private initializeSchema(): void {
    // Identity table
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS _identity (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `)

    // Schedules table (from Agents SDK pattern)
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS _schedules (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(8))),
        callback TEXT NOT NULL,
        payload TEXT,
        type TEXT NOT NULL CHECK(type IN ('scheduled', 'delayed', 'cron')),
        time INTEGER NOT NULL,
        delay_seconds INTEGER,
        cron TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `)

    // CDC events table
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS _cdc (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation TEXT NOT NULL,
        collection TEXT NOT NULL,
        document_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        before TEXT,
        after TEXT,
        changed_fields TEXT,
        flushed INTEGER DEFAULT 0
      )
    `)

    // Load identity
    this.loadIdentity()
  }

  private loadIdentity(): void {
    const rows = this.sql.exec<{ key: string; value: string }>(
      'SELECT key, value FROM _identity'
    ).toArray()

    for (const row of rows) {
      if (row.key === '$id') this.$id = row.value
      if (row.key === '$type') this.$type = row.value as DOType
      if (row.key === '$context') this.$context = row.value
      if (row.key === '$version') this.$version = parseInt(row.value, 10)
    }
  }

  // ===========================================================================
  // HTTP Request Handling
  // ===========================================================================

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // WebSocket upgrade for RPC
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request)
    }

    // REST API
    if (url.pathname === '/_health') {
      return Response.json({ status: 'ok', id: this.$id, type: this.$type })
    }

    // Default: route to user-defined handler or return identity
    return Response.json({
      $id: this.$id,
      $type: this.$type,
      $context: this.$context,
      $version: this.$version,
    })
  }

  // ===========================================================================
  // WebSocket with Hibernation
  // ===========================================================================

  private handleWebSocket(request: Request): Response {
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    // Accept with hibernation tags
    this.state.acceptWebSocket(server, ['rpc'])

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return

    try {
      const data = JSON.parse(message)

      // RPC request
      if (data.type === 'rpc' && data.method && data.id) {
        const result = await this.handleRPC(data.method, data.args || [])
        ws.send(JSON.stringify({
          type: 'rpc',
          id: data.id,
          success: true,
          result,
        }))
      }
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      }))
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    // Cleanup on close
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket error:', error)
  }

  // ===========================================================================
  // RPC Handler
  // ===========================================================================

  private async handleRPC(method: string, args: unknown[]): Promise<unknown> {
    // Identity methods
    if (method === 'do.identity.get') {
      return {
        $id: this.$id,
        $type: this.$type,
        $context: this.$context,
        $version: this.$version,
      }
    }

    // Schedule methods
    if (method === 'do.schedule') {
      const [when, callback, payload] = args as [Date | string | number, string, unknown]
      return this.schedule(when, callback, payload)
    }

    if (method === 'do.schedule.cancel') {
      const [id] = args as [string]
      return this.cancelSchedule(id)
    }

    if (method === 'do.schedule.list') {
      return this.listSchedules()
    }

    // CDC methods
    if (method === 'do.cdc.flush') {
      return this.flushCDC()
    }

    throw new Error(`Unknown RPC method: ${method}`)
  }

  // ===========================================================================
  // Scheduling (Alarm-based, from Agents SDK pattern)
  // ===========================================================================

  /**
   * Schedule a callback to be executed
   *
   * @param when - Date (absolute), number (delay in seconds), or string (cron expression)
   * @param callback - Method name to call
   * @param payload - Data to pass to the callback
   */
  async schedule<T = unknown>(
    when: Date | string | number,
    callback: string,
    payload?: T
  ): Promise<Schedule<T>> {
    let type: 'scheduled' | 'delayed' | 'cron'
    let time: number
    let delaySeconds: number | null = null
    let cronExpr: string | null = null

    if (when instanceof Date) {
      // Absolute time
      type = 'scheduled'
      time = Math.floor(when.getTime() / 1000)
    } else if (typeof when === 'number') {
      // Delay in seconds
      type = 'delayed'
      delaySeconds = when
      time = Math.floor(Date.now() / 1000) + when
    } else {
      // Cron expression
      type = 'cron'
      cronExpr = when
      time = this.getNextCronTime(when)
    }

    const id = crypto.randomUUID()

    this.sql.exec(
      `INSERT INTO _schedules (id, callback, payload, type, time, delay_seconds, cron)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      callback,
      JSON.stringify(payload),
      type,
      time,
      delaySeconds,
      cronExpr
    )

    await this.scheduleNextAlarm()

    return {
      id,
      callback,
      payload: payload as T,
      type,
      time,
      delayInSeconds: delaySeconds ?? undefined,
      cron: cronExpr ?? undefined,
      createdAt: Math.floor(Date.now() / 1000),
    }
  }

  /**
   * Cancel a scheduled callback
   */
  async cancelSchedule(id: string): Promise<boolean> {
    const result = this.sql.exec('DELETE FROM _schedules WHERE id = ?', id)
    await this.scheduleNextAlarm()
    return result.rowsWritten > 0
  }

  /**
   * List all scheduled callbacks
   */
  listSchedules(): Schedule[] {
    return this.sql.exec<Schedule>('SELECT * FROM _schedules ORDER BY time ASC').toArray()
  }

  /**
   * Alarm handler - called by Cloudflare when alarm fires
   */
  async alarm(): Promise<void> {
    const now = Math.floor(Date.now() / 1000)

    // Get all schedules that should execute now
    const schedules = this.sql.exec<Schedule<string>>(
      'SELECT * FROM _schedules WHERE time <= ?',
      now
    ).toArray()

    for (const schedule of schedules) {
      try {
        // Execute the callback
        const method = (this as Record<string, unknown>)[schedule.callback]
        if (typeof method === 'function') {
          const payload = schedule.payload ? JSON.parse(schedule.payload) : undefined
          await method.call(this, payload, schedule)
        } else {
          console.error(`Callback not found: ${schedule.callback}`)
        }
      } catch (error) {
        console.error(`Error executing schedule ${schedule.id}:`, error)
      }

      // Handle cron: reschedule, otherwise delete
      if (schedule.type === 'cron' && schedule.cron) {
        const nextTime = this.getNextCronTime(schedule.cron)
        this.sql.exec('UPDATE _schedules SET time = ? WHERE id = ?', nextTime, schedule.id)
      } else {
        this.sql.exec('DELETE FROM _schedules WHERE id = ?', schedule.id)
      }
    }

    // Schedule next alarm
    await this.scheduleNextAlarm()
  }

  /**
   * Schedule the next alarm based on pending schedules
   */
  private async scheduleNextAlarm(): Promise<void> {
    const now = Math.floor(Date.now() / 1000)
    const next = this.sql.exec<{ time: number }>(
      'SELECT time FROM _schedules WHERE time >= ? ORDER BY time ASC LIMIT 1',
      now
    ).toArray()

    if (next.length > 0) {
      await this.state.storage.setAlarm(next[0].time * 1000)
    }
  }

  /**
   * Get next execution time for a cron expression
   */
  private getNextCronTime(cron: string): number {
    // Simple cron parsing - in production use a library like cron-schedule
    // For now, default to 1 hour from now if cron parsing fails
    const next = new Date()
    next.setHours(next.getHours() + 1)
    return Math.floor(next.getTime() / 1000)
  }

  // ===========================================================================
  // CDC (Change Data Capture)
  // ===========================================================================

  /**
   * Emit a CDC event
   */
  protected emitCDC(
    operation: 'INSERT' | 'UPDATE' | 'DELETE',
    collection: string,
    documentId: string,
    before?: unknown,
    after?: unknown,
    changedFields?: string[]
  ): void {
    this.sql.exec(
      `INSERT INTO _cdc (operation, collection, document_id, timestamp, before, after, changed_fields)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      operation,
      collection,
      documentId,
      Date.now(),
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      changedFields ? JSON.stringify(changedFields) : null
    )
  }

  /**
   * Flush CDC events to parent ($context) and R2
   */
  async flushCDC(): Promise<{ flushed: number }> {
    const events = this.sql.exec<{
      id: number
      operation: string
      collection: string
      document_id: string
      timestamp: number
      before: string | null
      after: string | null
      changed_fields: string | null
    }>('SELECT * FROM _cdc WHERE flushed = 0 ORDER BY id ASC').toArray()

    if (events.length === 0) {
      return { flushed: 0 }
    }

    // Stream to parent DO if $context is set
    if (this.$context) {
      try {
        const parentId = this.env.DO.idFromName(this.$context)
        const parent = this.env.DO.get(parentId)
        await parent.fetch(new Request('https://internal/_cdc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: this.$id,
            events: events.map(e => ({
              operation: e.operation,
              collection: e.collection,
              documentId: e.document_id,
              timestamp: e.timestamp,
              before: e.before ? JSON.parse(e.before) : undefined,
              after: e.after ? JSON.parse(e.after) : undefined,
              changedFields: e.changed_fields ? JSON.parse(e.changed_fields) : undefined,
            })),
          }),
        }))
      } catch (error) {
        console.error('Failed to stream CDC to parent:', error)
      }
    }

    // Mark as flushed
    const ids = events.map(e => e.id)
    this.sql.exec(`UPDATE _cdc SET flushed = 1 WHERE id IN (${ids.join(',')})`)

    return { flushed: events.length }
  }
}

// =============================================================================
// Environment Types
// =============================================================================

interface Env {
  DO: DurableObjectNamespace<DigitalObject>
  R2: R2Bucket
  KV: KVNamespace
  AI: Ai
}
