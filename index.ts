/**
 * objects.do - Managed Digital Object service
 *
 * Routing patterns:
 * - [doid].objects.do      → Direct access via hex DO ID
 * - objects.do/:url        → Access via $id (e.g., objects.do/headless.ly)
 * - custom.domain.com      → Access via hostname as $id
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
    const headers = new Headers(request.headers)

    let doId: DurableObjectId
    let targetUrl = url.href

    // Pattern 1: [doid].objects.do - hex DO ID as subdomain
    const hostParts = url.hostname.split('.')
    if (hostParts.length >= 3 && hostParts.slice(-2).join('.') === 'objects.do') {
      const hexId = hostParts[0]
      try {
        doId = env.DO.idFromString(hexId)
      } catch {
        // Not a valid hex ID, treat as $id
        doId = env.DO.idFromName(url.hostname)
      }
    }
    // Pattern 2: objects.do/:url - $id in path
    else if (url.hostname === 'objects.do' && url.pathname.length > 1) {
      const pathId = url.pathname.slice(1).split('/')[0] // e.g., "headless.ly"
      const $id = pathId.includes('.') ? `https://${pathId}` : pathId
      doId = env.DO.idFromName($id)
      // Rewrite URL to use $id as origin
      targetUrl = `${$id}${url.pathname.slice(pathId.length + 1) || '/'}`
    }
    // Pattern 3: Custom domain - hostname IS the $id
    else {
      doId = env.DO.idFromName(url.hostname)
      // Derive context from subdomain structure
      if (hostParts.length > 2) {
        const parent = hostParts.slice(1).join('.')
        headers.set('X-DO-Context', `https://${parent}`)
      }
    }

    const stub = env.DO.get(doId)

    const proxiedRequest = new Request(targetUrl, {
      method: request.method,
      headers,
      body: request.body,
    })

    return stub.fetch(proxiedRequest)
  },
}
