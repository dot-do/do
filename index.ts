/**
 * objects.do - Managed Digital Object service
 *
 * Worker entry point that routes requests to DigitalObject DOs.
 */

import { DigitalObject } from '@dotdo/do'

export { DigitalObject }

interface Env {
  DO: DurableObjectNamespace
  CDC_PIPELINE?: unknown
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Route to DO based on hostname
    // Each unique hostname gets its own DO instance
    const id = env.DO.idFromName(url.hostname)
    const stub = env.DO.get(id)

    // Derive context from subdomain structure
    // e.g., crm.headless.ly -> context is headless.ly
    const headers = new Headers(request.headers)
    if (!headers.has('X-DO-Context')) {
      const parts = url.hostname.split('.')
      if (parts.length > 2) {
        // Has subdomain, parent is the rest
        const parent = parts.slice(1).join('.')
        headers.set('X-DO-Context', `https://${parent}`)
      }
    }

    const proxiedRequest = new Request(request.url, {
      method: request.method,
      headers,
      body: request.body,
    })

    return stub.fetch(proxiedRequest)
  },
}
