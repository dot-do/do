/**
 * Health Check Routes
 *
 * Provides health check endpoints for monitoring and load balancers.
 */

import { Hono } from 'hono'
import type { Env, DOContext, HealthCheckResponse } from '../types'

// =============================================================================
// Constants
// =============================================================================

const VERSION = '1.0.0'

// =============================================================================
// Health Router
// =============================================================================

/**
 * Create health check router
 */
export function createHealthRoutes() {
  const router = new Hono<{ Bindings: Env; Variables: DOContext }>()

  /**
   * GET /_health - Basic health check
   * Returns 200 if service is healthy
   */
  router.get('/_health', (c) => {
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    const response: HealthCheckResponse = {
      status: 'ok',
      timestamp: Date.now(),
      colo,
      version: VERSION,
    }

    return c.json(response)
  })

  /**
   * GET /_health/ready - Readiness check
   * Checks if the service is ready to accept requests
   */
  router.get('/_health/ready', async (c) => {
    const colo = c.req.header('CF-Ray')?.split('-')[1]
    const components: HealthCheckResponse['components'] = {}

    // Check DO binding
    if (c.env.DO) {
      try {
        const id = c.env.DO.idFromName('health-check')
        const stub = c.env.DO.get(id)
        const start = Date.now()
        await stub.fetch(new Request('https://health-check/_ping'))
        components.durable_objects = {
          status: 'ok',
          latencyMs: Date.now() - start,
        }
      } catch (error) {
        components.durable_objects = {
          status: 'degraded',
          message: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    }

    // Check KV binding
    if (c.env.KV) {
      try {
        const start = Date.now()
        await c.env.KV.get('health-check')
        components.kv = {
          status: 'ok',
          latencyMs: Date.now() - start,
        }
      } catch (error) {
        components.kv = {
          status: 'degraded',
          message: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    }

    // Check R2 binding
    if (c.env.R2) {
      try {
        const start = Date.now()
        await c.env.R2.head('health-check')
        components.r2 = {
          status: 'ok',
          latencyMs: Date.now() - start,
        }
      } catch (error) {
        // R2 head returns error for missing objects, that's fine
        components.r2 = {
          status: 'ok',
          latencyMs: Date.now() - Date.now(),
        }
      }
    }

    // Check AI binding
    if (c.env.AI) {
      components.ai = { status: 'ok' }
    }

    // Determine overall status
    const statuses = Object.values(components).map(c => c.status)
    let status: 'ok' | 'degraded' | 'down' = 'ok'
    if (statuses.includes('down')) {
      status = 'down'
    } else if (statuses.includes('degraded')) {
      status = 'degraded'
    }

    const response: HealthCheckResponse = {
      status,
      timestamp: Date.now(),
      colo,
      version: VERSION,
      components,
    }

    const httpStatus = status === 'down' ? 503 : status === 'degraded' ? 200 : 200
    return c.json(response, httpStatus)
  })

  /**
   * GET /_health/live - Liveness check
   * Simple check that the service is running
   */
  router.get('/_health/live', (c) => {
    return c.text('OK', 200)
  })

  /**
   * GET /_health/version - Version info
   */
  router.get('/_health/version', (c) => {
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    return c.json({
      version: VERSION,
      environment: c.env.ENVIRONMENT || 'development',
      colo,
      runtime: 'cloudflare-workers',
      timestamp: Date.now(),
    })
  })

  /**
   * GET /_metrics - Basic metrics endpoint
   * Returns prometheus-style metrics if enabled
   */
  router.get('/_metrics', async (c) => {
    const colo = c.req.header('CF-Ray')?.split('-')[1]

    // Basic metrics (would be expanded with actual metrics collection)
    const metrics = [
      `# HELP do_info Digital Object service info`,
      `# TYPE do_info gauge`,
      `do_info{version="${VERSION}",colo="${colo || 'unknown'}"} 1`,
      ``,
      `# HELP do_requests_total Total requests (counter would be stored externally)`,
      `# TYPE do_requests_total counter`,
      `do_requests_total 0`,
    ].join('\n')

    return c.text(metrics, 200, {
      'Content-Type': 'text/plain; version=0.0.4',
    })
  })

  return router
}

// =============================================================================
// Export
// =============================================================================

export default createHealthRoutes
