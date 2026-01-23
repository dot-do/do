/**
 * DO Tail Worker - Observability Collection
 *
 * Receives tail events from all DO framework workers and:
 * - Extracts DOObservabilityEvents from trace items
 * - Routes events through type-specific handlers
 * - Buffers events with importance-based flushing
 * - Stores to R2 in date-partitioned JSON format
 * - Forwards to analytics services (optional)
 * - Logs to console for development
 */

import { TailCollectorDO } from './collector-do'
import { handleEvents, type HandlerContext } from './handlers'
import { AnalyticsForwarder, type AnalyticsConfig } from './analytics'
import type { DOObservabilityEvent } from '../types/observability'

export { TailCollectorDO }

export interface Env {
  TAIL_COLLECTOR: DurableObjectNamespace<TailCollectorDO>
  R2: R2Bucket
  FLUSH_INTERVAL_SECONDS: string
  BATCH_SIZE: string
  ENVIRONMENT: string
  LOG_LEVEL?: string
  ANALYTICS_ENABLED?: string
  ANALYTICS_ENDPOINT?: string
  ANALYTICS_API_KEY?: string
  ANALYTICS_ENGINE?: AnalyticsEngineDataset
}

interface AnalyticsEngineDataset {
  writeDataPoint(event: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void
}

/**
 * Importance levels for tail events
 */
enum Importance {
  CRITICAL = 0,
  HIGH = 1,
  NORMAL = 2,
  LOW = 3,
}

/**
 * Get importance level based on TraceItem
 */
function getTraceImportance(event: TraceItem): Importance {
  // Errors are critical
  if (event.exceptions && event.exceptions.length > 0) {
    return Importance.CRITICAL
  }

  // Log errors are high priority
  if (event.logs?.some(log => log.level === 'error')) {
    return Importance.HIGH
  }

  // Warnings are normal priority
  if (event.logs?.some(log => log.level === 'warn')) {
    return Importance.NORMAL
  }

  // Everything else is low priority
  return Importance.LOW
}

/**
 * Get importance level based on DOObservabilityEvent type
 */
function getEventImportance(event: DOObservabilityEvent): Importance {
  // Failed events are critical
  if (event.type.includes('.failed')) {
    return Importance.CRITICAL
  }

  // Errors and exceptions are high priority
  if (event.type.includes('Exception') || event.type.includes('Error')) {
    return Importance.HIGH
  }

  // Completed events are normal priority
  if (event.type.includes('.completed') || event.type.includes('.ended')) {
    return Importance.NORMAL
  }

  // Everything else (started, created, etc.) is low priority
  return Importance.LOW
}

/**
 * Extract DOObservabilityEvents from TraceItem logs and diagnostics channel
 */
function extractDOEvents(item: TraceItem): DOObservabilityEvent[] {
  const events: DOObservabilityEvent[] = []

  // Extract from diagnostics channel events
  if (item.diagnosticsChannelEvents) {
    for (const diagEvent of item.diagnosticsChannelEvents) {
      if (diagEvent.channel === 'do:observability') {
        try {
          const event = diagEvent.message as DOObservabilityEvent
          if (event && event.type && event.timestamp && event.payload) {
            events.push(event)
          }
        } catch {
          // Invalid event format, skip
        }
      }
    }
  }

  // Extract from logs (fallback for events sent via console)
  if (item.logs) {
    for (const log of item.logs) {
      if (typeof log.message === 'object' && log.message !== null) {
        const msg = log.message as Record<string, unknown>
        // Check for __do_event marker
        if (msg.__do_event) {
          try {
            const event = msg.__do_event as DOObservabilityEvent
            if (event && event.type && event.timestamp && event.payload) {
              events.push(event)
            }
          } catch {
            // Invalid event format, skip
          }
        }
      } else if (typeof log.message === 'string') {
        // Try to parse JSON string
        try {
          const parsed = JSON.parse(log.message)
          if (parsed.__do_event) {
            const event = parsed.__do_event as DOObservabilityEvent
            if (event && event.type && event.timestamp && event.payload) {
              events.push(event)
            }
          }
        } catch {
          // Not JSON, skip
        }
      }
    }
  }

  return events
}

// Global analytics forwarder (initialized on first use)
let analyticsForwarder: AnalyticsForwarder | null = null

function getAnalyticsForwarder(env: Env): AnalyticsForwarder | null {
  if (analyticsForwarder) return analyticsForwarder

  const enabled = env.ANALYTICS_ENABLED === 'true'
  if (!enabled) return null

  const config: AnalyticsConfig = {
    enabled: true,
    customEndpoint: env.ANALYTICS_ENDPOINT,
    customApiKey: env.ANALYTICS_API_KEY,
    analyticsEngine: env.ANALYTICS_ENGINE,
  }

  analyticsForwarder = new AnalyticsForwarder(config)
  return analyticsForwarder
}

function getHandlerContext(env: Env): HandlerContext {
  return {
    logLevel: (env.LOG_LEVEL as HandlerContext['logLevel']) || 'info',
    analyticsEnabled: env.ANALYTICS_ENABLED === 'true',
    environment: env.ENVIRONMENT || 'development',
  }
}

export default {
  /**
   * Tail handler - receives TraceItem events from producer workers
   */
  async tail(events: TraceItem[], env: Env, ctx: ExecutionContext): Promise<void> {
    if (events.length === 0) return

    const handlerCtx = getHandlerContext(env)
    const analytics = getAnalyticsForwarder(env)

    // Extract all DO observability events from trace items
    const doEvents: DOObservabilityEvent[] = []
    for (const traceItem of events) {
      const extracted = extractDOEvents(traceItem)
      doEvents.push(...extracted)
    }

    // Process extracted DO events through handlers
    if (doEvents.length > 0) {
      handleEvents(doEvents, handlerCtx)

      // Forward to analytics if enabled
      if (analytics) {
        ctx.waitUntil(analytics.forwardBatch(doEvents))
      }
    }

    // Group trace items by importance for storage
    const byImportance = new Map<Importance, unknown[]>()

    // Add raw trace items grouped by trace importance
    for (const traceItem of events) {
      const importance = getTraceImportance(traceItem)
      const list = byImportance.get(importance) || []
      list.push({
        timestamp: traceItem.eventTimestamp,
        scriptName: traceItem.scriptName,
        outcome: traceItem.outcome,
        exceptions: traceItem.exceptions,
        logs: traceItem.logs,
        diagnosticsChannelEvents: traceItem.diagnosticsChannelEvents,
      })
      byImportance.set(importance, list)
    }

    // Also add extracted DO events grouped by event importance
    for (const doEvent of doEvents) {
      const importance = getEventImportance(doEvent)
      const list = byImportance.get(importance) || []
      list.push(doEvent)
      byImportance.set(importance, list)
    }

    // Route to collector DO
    const collectorId = env.TAIL_COLLECTOR.idFromName('main')
    const collector = env.TAIL_COLLECTOR.get(collectorId)

    // Send events with importance metadata
    const payload = {
      timestamp: Date.now(),
      events: Array.from(byImportance.entries()).map(([importance, items]) => ({
        importance,
        items,
      })),
    }

    // Fire and forget - don't wait for confirmation
    ctx.waitUntil(
      collector.fetch(new Request('https://internal/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }))
    )
  },

  /**
   * HTTP handler for manual queries and health checks
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // Health check
    if (url.pathname === '/health') {
      return Response.json({
        status: 'ok',
        service: 'do-tail',
        environment: env.ENVIRONMENT || 'development',
        analyticsEnabled: env.ANALYTICS_ENABLED === 'true',
      })
    }

    // Stats endpoint
    if (url.pathname === '/stats') {
      const collectorId = env.TAIL_COLLECTOR.idFromName('main')
      const collector = env.TAIL_COLLECTOR.get(collectorId)
      return collector.fetch(new Request('https://internal/stats'))
    }

    // Force flush
    if (url.pathname === '/flush' && request.method === 'POST') {
      const collectorId = env.TAIL_COLLECTOR.idFromName('main')
      const collector = env.TAIL_COLLECTOR.get(collectorId)
      return collector.fetch(new Request('https://internal/flush', { method: 'POST' }))
    }

    // Flush analytics buffer
    if (url.pathname === '/analytics/flush' && request.method === 'POST') {
      const analytics = getAnalyticsForwarder(env)
      if (analytics) {
        await analytics.flush()
        return Response.json({ status: 'flushed' })
      }
      return Response.json({ status: 'analytics not enabled' })
    }

    // Test endpoint (development only)
    if (url.pathname === '/test-events' && request.method === 'POST' && env.ENVIRONMENT === 'development') {
      const handlerCtx = getHandlerContext(env)

      // Generate test events
      const testEvents: DOObservabilityEvent[] = [
        {
          type: 'DO.Lifecycle.created',
          timestamp: Date.now(),
          payload: { doType: 'Agent' as const, id: 'test-123', name: 'TestAgent' },
        },
        {
          type: 'AI.Generation.completed',
          timestamp: Date.now(),
          payload: {
            id: 'gen-456',
            model: 'claude-3-opus',
            provider: 'anthropic',
            duration: 2500,
            inputTokens: 500,
            outputTokens: 1000,
            finishReason: 'stop' as const,
          },
        },
        {
          type: 'RPC.Response.sent',
          timestamp: Date.now(),
          payload: { id: 'rpc-789', method: 'getMessage', duration: 15, success: true },
        },
      ]

      // Process through handlers
      handleEvents(testEvents, handlerCtx)

      return Response.json({ status: 'ok', eventsProcessed: testEvents.length })
    }

    return Response.json({ error: 'Not found' }, { status: 404 })
  },
}

// =============================================================================
// TraceItem Types (from Cloudflare)
// =============================================================================

interface TraceItem {
  eventTimestamp: number
  scriptName?: string
  outcome: 'ok' | 'exception' | 'exceededCpu' | 'exceededMemory' | 'unknown'
  exceptions?: TraceException[]
  logs?: TraceLog[]
  diagnosticsChannelEvents?: TraceDiagnosticChannelEvent[]
}

interface TraceException {
  timestamp: number
  name: string
  message: string
  stack?: string
}

interface TraceLog {
  timestamp: number
  level: 'debug' | 'info' | 'log' | 'warn' | 'error'
  message: unknown
}

interface TraceDiagnosticChannelEvent {
  timestamp: number
  channel: string
  message: unknown
}
