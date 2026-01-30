/**
 * objects.do - Managed Digital Object service
 *
 * Routing patterns:
 * - objects.do/fn(args)    → Direct function call (e.g., objects.do/add(1,2))
 * - objects.do/$method     → RPC method call
 * - [doid].objects.do      → Direct access via hex DO ID
 * - objects.do/:url        → Access via $id (e.g., objects.do/headless.ly)
 * - custom.domain.com      → Access via hostname as $id
 */

import { DigitalObject } from '@dotdo/do'

export { DigitalObject }

interface CtxService {
  getContext(request: Request, apiInfo?: { name?: string; description?: string; url?: string; docs?: string; repo?: string }): {
    api: { name: string; description: string; url: string; docs?: string; repo?: string }
    user: Record<string, unknown>
  }
}

interface Env {
  DO: DurableObjectNamespace
  CTX: CtxService
  CDC_PIPELINE?: unknown
}

/**
 * Parse function arguments from URL path
 * Handles: 1,2 | "hello",3 | 'hello',3 | [1,2],{a:1}
 */
function parseArgs(argsStr: string): unknown[] {
  if (!argsStr.trim()) return []

  // Convert single quotes to double quotes for JSON parsing
  // But preserve escaped quotes and quotes inside strings
  const normalized = argsStr.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, '"$1"')

  try {
    // Try parsing as JSON array
    return JSON.parse(`[${normalized}]`)
  } catch {
    // Fallback: split by comma and parse individually
    return argsStr.split(',').map((s) => {
      const trimmed = s.trim()
      // Handle single-quoted strings
      if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
        return trimmed.slice(1, -1)
      }
      // Try to parse as number
      const num = Number(trimmed)
      if (!isNaN(num)) return num
      // Try to parse as JSON
      try {
        return JSON.parse(trimmed)
      } catch {
        return trimmed
      }
    })
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const headers = new Headers(request.headers)

    let doId: DurableObjectId
    let targetUrl = url.href

    const hostParts = url.hostname.split('.')

    // Pattern 1: [doid].objects.do - hex DO ID as subdomain
    if (hostParts.length >= 3 && hostParts.slice(-2).join('.') === 'objects.do') {
      const hexId = hostParts[0]
      try {
        doId = env.DO.idFromString(hexId)
      } catch {
        // Not a valid hex ID, treat as $id
        doId = env.DO.idFromName(url.hostname)
      }
    }
    // Pattern 2: objects.do with /$ RPC call - direct to root DO
    else if (url.hostname === 'objects.do' && url.pathname.startsWith('/$')) {
      doId = env.DO.idFromName('objects.do')
      // Keep original URL for RPC routing
    }
    // Pattern 3: objects.do/fn(args) - direct function call
    else if (url.hostname === 'objects.do' && url.pathname.match(/^\/\w+\(/)) {
      doId = env.DO.idFromName('objects.do')
      // Rewrite /add(1,2) to /$callFunction("add",[1,2])
      const match = url.pathname.match(/^\/(\w+)\((.*)\)$/)
      if (match) {
        const [, fnName, argsStr] = match
        const args = argsStr ? parseArgs(argsStr) : []
        targetUrl = `https://objects.do/$callFunction("${fnName}",${JSON.stringify(args)})`
      }
    }
    // Pattern 4: objects.do root - return API discovery response
    else if (url.hostname === 'objects.do' && url.pathname === '/') {
      return handleApiDiscovery(request, env)
    }
    // Pattern 5: objects.do/__schema - RPC schema
    else if (url.hostname === 'objects.do' && url.pathname === '/__schema') {
      doId = env.DO.idFromName('objects.do')
    }
    // Pattern 6: objects.do/:url - $id in path (e.g., objects.do/headless.ly)
    else if (url.hostname === 'objects.do' && url.pathname.length > 1) {
      const pathId = url.pathname.slice(1).split('/')[0] // e.g., "headless.ly"
      const $id = pathId.includes('.') ? `https://${pathId}` : pathId
      doId = env.DO.idFromName($id)
      // Rewrite URL to use $id as origin
      targetUrl = `${$id}${url.pathname.slice(pathId.length + 1) || '/'}`
    }
    // Pattern 7: Custom domain - hostname IS the $id
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

/**
 * API Discovery response with clickable links
 */
async function handleApiDiscovery(request: Request, env: Env): Promise<Response> {
  const baseUrl = 'https://objects.do'

  // Get user context from ctx service
  let user: Record<string, unknown> = {}
  try {
    const ctx = await env.CTX.getContext(request, {
      name: 'objects.do',
      description: 'Managed Digital Objects',
      url: baseUrl,
      docs: 'https://docs.objects.do',
      repo: 'https://github.com/dot-do/do',
    })
    user = ctx.user
  } catch (e) {
    // ctx service not available, continue without user context
    user = { error: e instanceof Error ? e.message : 'ctx service unavailable' }
  }

  const response = {
    api: {
      name: 'objects.do',
      description: 'Managed Digital Objects - Every entity IS a Durable Object',
      url: baseUrl,
      docs: 'https://docs.objects.do',
      repo: 'https://github.com/dot-do/do',
    },
    links: {
      self: `${baseUrl}/`,
      schema: `${baseUrl}/__schema`,
    },
    examples: {
      '🔢 Call Function': `${baseUrl}/add(1,2)`,
      '📦 Get Object': `${baseUrl}/headless.ly`,
      '📂 Collection': `${baseUrl}/$collection("users")`,
      '📄 Get Document': `${baseUrl}/$collection("users").get("alice")`,
      '🔍 Find Documents': `${baseUrl}/$collection("users").find({"active":true})`,
      '🔗 Relationships': `${baseUrl}/$relationships("alice")`,
      '📥 References': `${baseUrl}/$references("bob")`,
    },
    methods: {
      'collection(name)': 'Get a collection by name',
      'relate(from, predicate, to, reverse?)': 'Create a relationship',
      'unrelate(id)': 'Delete a relationship',
      'relationships(id, predicate?)': 'Get outgoing relationships',
      'references(id, predicate?)': 'Get incoming references',
    },
    rpc: {
      http: `${baseUrl}/$methodName(args)`,
      websocket: `wss://objects.do`,
      serviceBinding: 'env.DO.get(id).methodName(args)',
    },
    user,
  }

  return Response.json(response)
}
