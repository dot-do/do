/**
 * Analytics Forwarding
 *
 * Forwards observability events to external analytics services:
 * - Cloudflare Analytics Engine
 * - Custom HTTP endpoints
 * - Third-party services (Datadog, etc.)
 */

import type { DOObservabilityEvent } from '../types/observability'

// =============================================================================
// Configuration
// =============================================================================

export interface AnalyticsConfig {
  /** Enable analytics forwarding */
  enabled: boolean
  /** Cloudflare Analytics Engine dataset */
  analyticsEngine?: AnalyticsEngineDataset
  /** Custom HTTP endpoint for forwarding */
  customEndpoint?: string
  /** API key for custom endpoint */
  customApiKey?: string
  /** Event types to forward (empty = all) */
  eventTypes?: string[]
  /** Sample rate (0-1, 1 = all events) */
  sampleRate?: number
  /** Batch size for forwarding */
  batchSize?: number
}

// =============================================================================
// Analytics Engine Types
// =============================================================================

interface AnalyticsEngineDataset {
  writeDataPoint(event: AnalyticsEngineDataPoint): void
}

interface AnalyticsEngineDataPoint {
  blobs?: string[]
  doubles?: number[]
  indexes?: string[]
}

// =============================================================================
// Event Transformation
// =============================================================================

/**
 * Transform a DOObservabilityEvent to Analytics Engine format
 */
function toAnalyticsEnginePoint(event: DOObservabilityEvent): AnalyticsEngineDataPoint {
  const payload = event.payload as Record<string, unknown>

  // Extract numeric values for doubles
  const doubles: number[] = [
    event.timestamp,
    (payload.duration as number) || 0,
    (payload.inputTokens as number) || 0,
    (payload.outputTokens as number) || 0,
    (payload.bytes as number) || 0,
    (payload.count as number) || 0,
  ]

  // Extract string values for blobs
  const blobs: string[] = [
    event.type,
    (payload.id as string) || '',
    (payload.model as string) || '',
    (payload.provider as string) || '',
    (payload.error as string) || '',
    event.actor?.id || '',
  ]

  // Index by event namespace (e.g., "DO", "AI", "Workflow")
  const namespace = event.type.split('.')[0]

  return {
    indexes: [namespace],
    blobs,
    doubles,
  }
}

/**
 * Transform event to custom endpoint format
 */
function toCustomFormat(event: DOObservabilityEvent): Record<string, unknown> {
  return {
    type: event.type,
    timestamp: event.timestamp,
    actor: event.actor,
    request: event.request,
    payload: event.payload,
    // Add metadata
    _source: 'do-tail',
    _version: '1.0',
  }
}

// =============================================================================
// Analytics Forwarder
// =============================================================================

export class AnalyticsForwarder {
  private config: AnalyticsConfig
  private buffer: DOObservabilityEvent[] = []

  constructor(config: AnalyticsConfig) {
    this.config = {
      sampleRate: 1,
      batchSize: 100,
      ...config,
    }
  }

  /**
   * Check if an event should be forwarded
   */
  private shouldForward(event: DOObservabilityEvent): boolean {
    if (!this.config.enabled) return false

    // Check event type filter
    if (this.config.eventTypes && this.config.eventTypes.length > 0) {
      if (!this.config.eventTypes.includes(event.type)) {
        return false
      }
    }

    // Apply sampling
    if (this.config.sampleRate && this.config.sampleRate < 1) {
      if (Math.random() > this.config.sampleRate) {
        return false
      }
    }

    return true
  }

  /**
   * Forward a single event
   */
  async forward(event: DOObservabilityEvent): Promise<void> {
    if (!this.shouldForward(event)) return

    this.buffer.push(event)

    // Flush if buffer is full
    if (this.buffer.length >= (this.config.batchSize || 100)) {
      await this.flush()
    }
  }

  /**
   * Forward multiple events
   */
  async forwardBatch(events: DOObservabilityEvent[]): Promise<void> {
    for (const event of events) {
      if (this.shouldForward(event)) {
        this.buffer.push(event)
      }
    }

    // Flush if buffer is full
    if (this.buffer.length >= (this.config.batchSize || 100)) {
      await this.flush()
    }
  }

  /**
   * Flush buffered events to destinations
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return

    const events = this.buffer
    this.buffer = []

    const promises: Promise<void>[] = []

    // Forward to Analytics Engine
    if (this.config.analyticsEngine) {
      promises.push(this.forwardToAnalyticsEngine(events))
    }

    // Forward to custom endpoint
    if (this.config.customEndpoint) {
      promises.push(this.forwardToCustomEndpoint(events))
    }

    await Promise.allSettled(promises)
  }

  /**
   * Forward events to Cloudflare Analytics Engine
   */
  private async forwardToAnalyticsEngine(events: DOObservabilityEvent[]): Promise<void> {
    if (!this.config.analyticsEngine) return

    for (const event of events) {
      try {
        const dataPoint = toAnalyticsEnginePoint(event)
        this.config.analyticsEngine.writeDataPoint(dataPoint)
      } catch (error) {
        console.error('Analytics Engine write failed:', error)
      }
    }
  }

  /**
   * Forward events to custom HTTP endpoint
   */
  private async forwardToCustomEndpoint(events: DOObservabilityEvent[]): Promise<void> {
    if (!this.config.customEndpoint) return

    try {
      const payload = events.map(toCustomFormat)

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (this.config.customApiKey) {
        headers['Authorization'] = `Bearer ${this.config.customApiKey}`
      }

      const response = await fetch(this.config.customEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        console.error(`Custom endpoint failed: ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      console.error('Custom endpoint request failed:', error)
    }
  }
}

// =============================================================================
// Pre-built Integrations
// =============================================================================

/**
 * Create a Datadog forwarder
 */
export function createDatadogForwarder(
  apiKey: string,
  site: string = 'datadoghq.com'
): AnalyticsForwarder {
  return new AnalyticsForwarder({
    enabled: true,
    customEndpoint: `https://http-intake.logs.${site}/api/v2/logs`,
    customApiKey: apiKey,
  })
}

/**
 * Create an Analytics Engine forwarder
 */
export function createAnalyticsEngineForwarder(
  dataset: AnalyticsEngineDataset,
  options?: Partial<AnalyticsConfig>
): AnalyticsForwarder {
  return new AnalyticsForwarder({
    enabled: true,
    analyticsEngine: dataset,
    ...options,
  })
}

// =============================================================================
// Metrics Aggregation
// =============================================================================

export interface AggregatedMetrics {
  /** Event counts by type */
  eventCounts: Record<string, number>
  /** Error counts by type */
  errorCounts: Record<string, number>
  /** Total duration by event type */
  totalDuration: Record<string, number>
  /** Token usage */
  tokenUsage: {
    input: number
    output: number
  }
  /** Time window */
  startTime: number
  endTime: number
}

/**
 * Aggregate events into metrics
 */
export function aggregateEvents(events: DOObservabilityEvent[]): AggregatedMetrics {
  const metrics: AggregatedMetrics = {
    eventCounts: {},
    errorCounts: {},
    totalDuration: {},
    tokenUsage: { input: 0, output: 0 },
    startTime: Infinity,
    endTime: 0,
  }

  for (const event of events) {
    // Count events
    metrics.eventCounts[event.type] = (metrics.eventCounts[event.type] || 0) + 1

    // Track time window
    if (event.timestamp < metrics.startTime) metrics.startTime = event.timestamp
    if (event.timestamp > metrics.endTime) metrics.endTime = event.timestamp

    // Count errors
    if (event.type.includes('.failed')) {
      metrics.errorCounts[event.type] = (metrics.errorCounts[event.type] || 0) + 1
    }

    // Aggregate duration
    const payload = event.payload as Record<string, unknown>
    if (typeof payload.duration === 'number') {
      metrics.totalDuration[event.type] = (metrics.totalDuration[event.type] || 0) + payload.duration
    }

    // Aggregate token usage
    if (event.type === 'AI.Generation.completed') {
      const aiPayload = payload as { inputTokens?: number; outputTokens?: number }
      metrics.tokenUsage.input += aiPayload.inputTokens || 0
      metrics.tokenUsage.output += aiPayload.outputTokens || 0
    }
  }

  return metrics
}
