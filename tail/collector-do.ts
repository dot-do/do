/**
 * TailCollectorDO - Hibernatable Durable Object for Tail Event Buffering
 *
 * Architecture:
 * - Receives events from tail handler
 * - Buffers with importance-based thresholds
 * - Flushes to R2 on alarm or threshold
 * - Supports hibernation for cost savings
 */

interface Env {
  R2: R2Bucket
  FLUSH_INTERVAL_SECONDS: string
  BATCH_SIZE: string
}

// =============================================================================
// Buffer Configuration
// =============================================================================

interface BufferConfig {
  maxRows: number
  maxBytes: number
}

const BUFFER_THRESHOLDS: Record<number, BufferConfig> = {
  0: { maxRows: 10, maxBytes: 1_000_000 },       // CRITICAL
  1: { maxRows: 100, maxBytes: 10_000_000 },     // HIGH
  2: { maxRows: 1000, maxBytes: 50_000_000 },    // NORMAL
  3: { maxRows: 5000, maxBytes: 100_000_000 },   // LOW
}

// =============================================================================
// TailCollectorDO
// =============================================================================

export class TailCollectorDO implements DurableObject {
  private readonly sql: SqlStorage
  private readonly state: DurableObjectState
  private readonly env: Env

  // In-memory buffer for fast writes
  private buffer: Map<number, unknown[]> = new Map()
  private bufferBytes: Map<number, number> = new Map()

  // Stats
  private totalEventsReceived = 0
  private totalEventsFlushed = 0

  static options = { hibernate: true }

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.sql = state.storage.sql
    this.env = env

    this.initializeSchema()
    this.scheduleFlush()
  }

  // ===========================================================================
  // Schema
  // ===========================================================================

  private initializeSchema(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS _stats (
        key TEXT PRIMARY KEY,
        value INTEGER
      )
    `)

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS _flushes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        event_count INTEGER NOT NULL,
        bytes INTEGER NOT NULL,
        r2_key TEXT NOT NULL
      )
    `)

    // Load stats
    const stats = this.sql.exec<{ key: string; value: number }>(
      'SELECT key, value FROM _stats'
    ).toArray()

    for (const stat of stats) {
      if (stat.key === 'total_received') this.totalEventsReceived = stat.value
      if (stat.key === 'total_flushed') this.totalEventsFlushed = stat.value
    }
  }

  private scheduleFlush(): void {
    const intervalSeconds = parseInt(this.env.FLUSH_INTERVAL_SECONDS || '30', 10)
    const nextFlush = Date.now() + intervalSeconds * 1000
    this.state.storage.setAlarm(nextFlush)
  }

  // ===========================================================================
  // Request Handling
  // ===========================================================================

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/events' && request.method === 'POST') {
      return this.handleEvents(request)
    }

    if (url.pathname === '/stats') {
      return this.handleStats()
    }

    if (url.pathname === '/flush' && request.method === 'POST') {
      return this.handleFlush()
    }

    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  private async handleEvents(request: Request): Promise<Response> {
    const payload = await request.json() as {
      timestamp: number
      events: Array<{
        importance: number
        items: unknown[]
      }>
    }

    let added = 0

    for (const group of payload.events) {
      const { importance, items } = group

      // Add to buffer
      const existing = this.buffer.get(importance) || []
      existing.push(...items)
      this.buffer.set(importance, existing)

      // Track bytes (rough estimate)
      const bytes = JSON.stringify(items).length
      const existingBytes = this.bufferBytes.get(importance) || 0
      this.bufferBytes.set(importance, existingBytes + bytes)

      added += items.length

      // Check if we need to flush this importance level
      const config = BUFFER_THRESHOLDS[importance] || BUFFER_THRESHOLDS[3]
      if (existing.length >= config.maxRows || (existingBytes + bytes) >= config.maxBytes) {
        await this.flushImportance(importance)
      }
    }

    this.totalEventsReceived += added

    return Response.json({ received: added })
  }

  // ===========================================================================
  // Stats
  // ===========================================================================

  private handleStats(): Response {
    const bufferSizes: Record<number, number> = {}
    for (const [importance, items] of this.buffer) {
      bufferSizes[importance] = items.length
    }

    return Response.json({
      totalEventsReceived: this.totalEventsReceived,
      totalEventsFlushed: this.totalEventsFlushed,
      bufferSizes,
    })
  }

  // ===========================================================================
  // Flush
  // ===========================================================================

  private async handleFlush(): Promise<Response> {
    const flushed = await this.flushAll()
    return Response.json({ flushed })
  }

  private async flushImportance(importance: number): Promise<number> {
    const items = this.buffer.get(importance) || []
    if (items.length === 0) return 0

    const bytes = this.bufferBytes.get(importance) || 0

    // Generate R2 key with date partitioning
    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10)
    const timeStr = now.toISOString().slice(11, 16).replace(':', '-')
    const r2Key = `tail-events/${dateStr}/importance-${importance}/${timeStr}-${crypto.randomUUID().slice(0, 8)}.json`

    // Write to R2
    await this.env.R2.put(r2Key, JSON.stringify(items), {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: {
        importance: importance.toString(),
        eventCount: items.length.toString(),
        timestamp: now.toISOString(),
      },
    })

    // Record flush
    this.sql.exec(
      'INSERT INTO _flushes (timestamp, event_count, bytes, r2_key) VALUES (?, ?, ?, ?)',
      Date.now(),
      items.length,
      bytes,
      r2Key
    )

    // Clear buffer
    this.buffer.set(importance, [])
    this.bufferBytes.set(importance, 0)

    this.totalEventsFlushed += items.length

    // Update stats
    this.sql.exec(
      `INSERT OR REPLACE INTO _stats (key, value) VALUES ('total_received', ?), ('total_flushed', ?)`,
      this.totalEventsReceived,
      this.totalEventsFlushed
    )

    return items.length
  }

  private async flushAll(): Promise<number> {
    let total = 0
    for (const importance of [0, 1, 2, 3]) {
      total += await this.flushImportance(importance)
    }
    return total
  }

  // ===========================================================================
  // Alarm Handler
  // ===========================================================================

  async alarm(): Promise<void> {
    // Flush all buffers
    await this.flushAll()

    // Schedule next flush
    this.scheduleFlush()
  }
}
