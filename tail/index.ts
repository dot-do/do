/**
 * tail-do - Observability tail worker for objects.do
 *
 * Receives tail events from objects.do and sends them to the events pipeline.
 * Uses isolation pattern: NO service bindings to prevent infinite loops.
 *
 * Events follow the NS.Object.event pattern:
 * - DO.Request.received
 * - DO.Request.completed
 * - DO.Lifecycle.created
 */

import { Pipeline, TailEvent } from 'cloudflare:pipelines'

interface Env {
  // ONLY Pipeline binding - NO service bindings
  EVENTS: Pipeline
}

/**
 * Semantic event schema matching the events pipeline
 */
interface SemanticEvent {
  id: string
  timestamp: string
  namespace: string
  object: string
  event: string
  type: string
  subject_type?: string
  predicate_type?: string
  object_type?: string
  context?: string
  by?: string
  in?: string
  data: Record<string, unknown>
  metadata: Record<string, unknown>
}

/**
 * Convert TailEvent to semantic events for the pipeline
 */
function formatTailEvents(tailEvent: TailEvent): SemanticEvent[] {
  const events: SemanticEvent[] = []

  for (const trace of tailEvent.traces) {
    const baseTimestamp = trace.eventTimestamp
      ? new Date(trace.eventTimestamp).toISOString()
      : new Date().toISOString()

    // Extract DO context from request
    let doId: string | undefined
    let doContext: string | undefined
    let actor: string | undefined
    let requestId: string | undefined
    let requestData: Record<string, unknown> = {}

    if (trace.event?.request) {
      const req = trace.event.request
      requestData = {
        url: req.url,
        method: req.method,
        status: trace.event.response?.status,
        cf: req.cf,
      }

      // Extract DO identity from URL
      try {
        const url = new URL(req.url)
        const extracted = extractDOContext(url, req.headers)
        doId = extracted.doId
        doContext = extracted.doContext
      } catch {
        // Invalid URL
      }

      // Extract actor (user/agent/code)
      // Priority: authenticated user > agent header > IP
      actor = req.headers?.['x-user-id']
        || req.headers?.['x-agent-id']
        || (req.headers?.['cf-connecting-ip'] ? `ip:${req.headers['cf-connecting-ip']}` : undefined)

      // Extract request ID
      requestId = req.headers?.['cf-ray']
        || req.headers?.['x-request-id']
        || req.cf?.rayId as string
    }

    // Determine event object and action based on trace
    const { object, event: eventName } = categorizeTrace(trace)
    const eventType = `DO.${object}.${eventName}`

    // Create the semantic event
    const semanticEvent: SemanticEvent = {
      id: generateEventId(trace),
      timestamp: baseTimestamp,
      namespace: 'DO',
      object,
      event: eventName,
      type: eventType,
      context: doContext,
      by: actor,
      in: requestId,
      data: {
        doId,
        request: requestData,
        outcome: trace.outcome,
        scriptName: trace.scriptName,
        entrypoint: trace.entrypoint,
      },
      metadata: {
        dispatchNamespace: trace.dispatchNamespace,
        scriptTags: trace.scriptTags,
        logs: trace.logs.map((log) => ({
          timestamp: log.timestamp,
          level: log.level,
          message: log.message,
        })),
        exceptions: trace.exceptions.map((ex) => ({
          timestamp: ex.timestamp,
          name: ex.name,
          message: ex.message,
        })),
      },
    }

    events.push(semanticEvent)

    // If there are exceptions, emit separate exception events
    for (const exception of trace.exceptions) {
      events.push({
        id: generateEventId(trace, exception.timestamp),
        timestamp: new Date(exception.timestamp).toISOString(),
        namespace: 'DO',
        object: 'Error',
        event: 'thrown',
        type: 'DO.Error.thrown',
        context: doContext,
        by: actor,
        in: requestId,
        data: {
          doId,
          name: exception.name,
          message: exception.message,
          parentEvent: semanticEvent.id,
        },
        metadata: {
          scriptName: trace.scriptName,
          outcome: trace.outcome,
        },
      })
    }
  }

  return events
}

/**
 * Categorize a trace into object and event name
 */
function categorizeTrace(trace: TailEvent['traces'][0]): { object: string; event: string } {
  // Determine based on entrypoint and outcome
  if (trace.event?.request) {
    if (trace.outcome === 'ok') {
      return { object: 'Request', event: 'completed' }
    } else if (trace.outcome === 'exception') {
      return { object: 'Request', event: 'failed' }
    } else {
      return { object: 'Request', event: 'received' }
    }
  }

  if (trace.event?.queue) {
    return { object: 'Queue', event: trace.outcome === 'ok' ? 'processed' : 'failed' }
  }

  if (trace.event?.scheduled) {
    return { object: 'Scheduled', event: trace.outcome === 'ok' ? 'executed' : 'failed' }
  }

  if (trace.entrypoint === 'alarm') {
    return { object: 'Alarm', event: trace.outcome === 'ok' ? 'triggered' : 'failed' }
  }

  return { object: 'Lifecycle', event: trace.outcome || 'unknown' }
}

/**
 * Generate a unique event ID
 */
function generateEventId(trace: TailEvent['traces'][0], salt?: number): string {
  const base = `${trace.scriptName}-${trace.eventTimestamp}-${salt || 0}`
  // Simple hash for deterministic IDs
  let hash = 0
  for (let i = 0; i < base.length; i++) {
    const char = base.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return `evt_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`
}

/**
 * Extract DO identity from URL patterns
 */
function extractDOContext(
  url: URL,
  headers?: Record<string, string>
): { doId?: string; doContext?: string } {
  const context: { doId?: string; doContext?: string } = {}

  const hostParts = url.hostname.split('.')

  // Pattern 1: [doid].objects.do - hex DO ID as subdomain
  if (hostParts.length >= 3 && hostParts.slice(-2).join('.') === 'objects.do') {
    context.doId = hostParts[0]
  }
  // Pattern 2: objects.do/:url - $id in path
  else if (url.hostname === 'objects.do' && url.pathname.length > 1) {
    const pathId = url.pathname.slice(1).split('/')[0]
    context.doId = pathId.includes('.') ? `https://${pathId}` : pathId
  }
  // Pattern 3: Custom domain - hostname IS the $id
  else if (url.hostname !== 'objects.do') {
    context.doId = url.hostname
  }

  // Extract $context from header if present
  if (headers?.['x-do-context']) {
    context.doContext = headers['x-do-context']
  }

  return context
}

export default {
  /**
   * Tail handler - receives events from objects.do
   * ONLY sends to Pipeline, nothing else
   */
  async tail(events: TailEvent[], env: Env): Promise<void> {
    if (!events || events.length === 0) {
      return
    }

    // Transform all tail events to semantic events
    const semanticEvents: SemanticEvent[] = []
    for (const event of events) {
      semanticEvents.push(...formatTailEvents(event))
    }

    if (semanticEvents.length === 0) {
      return
    }

    // Send directly to Pipeline
    try {
      await env.EVENTS.send(semanticEvents)
    } catch (error) {
      // Log but don't throw - tail failures shouldn't affect source workers
      console.error('Pipeline send failed:', error)
    }
  },
}
