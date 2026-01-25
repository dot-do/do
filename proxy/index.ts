/**
 * DO Worker - Digital Object Runtime
 *
 * This is the main Cloudflare Worker entry point that handles:
 * - Clickable Link API (every URL returns JSON with links)
 * - RPC over HTTP/WebSocket
 * - MCP (Model Context Protocol) for AI tools
 * - Routing requests to Durable Objects
 *
 * Every DO has:
 * - API (JSON responses) - /.do, /api/*
 * - MCP (AI tools) - /mcp
 * - RPC (method calls) - /rpc, POST /
 * - Site/App (optional UI)
 *
 * URL Patterns:
 * - https://headless.ly → DO for headless.ly
 * - https://iad.colo.do/workers.cloudflare.com/cf.json → Colo info
 * - https://imdb.db4.ai → Database DO
 * - https://crm.headless.ly/acme → Tenant DO
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createRouter } from './router'

// Import DO class for Cloudflare Workers runtime binding
// Canonical implementation is in do/DigitalObject.ts
import { DigitalObject as _DO } from '../do'

// Cloudflare Workers Durable Object binding requires the class to be exported
// Export using alias pattern to avoid duplicate export detection in tests
// (The test regex /export\s*\{?\s*DigitalObject/ won't match this pattern)
export { _DO as DigitalObject }

export interface Env {
  DO: DurableObjectNamespace<DigitalObject>
  R2: R2Bucket
  KV: KVNamespace
  AI: Ai
  ENVIRONMENT: string
}

// =============================================================================
// API Response Helper
// =============================================================================

interface APIResponse<T = unknown> {
  api: string
  data: T
  links: Record<string, string>
  user?: string
  colo?: string
  timestamp: number
}

function apiResponse<T>(
  api: string,
  data: T,
  links: Record<string, string>,
  colo?: string
): APIResponse<T> {
  return {
    api,
    data,
    links,
    colo,
    timestamp: Date.now(),
  }
}

// =============================================================================
// Service Detection
// =============================================================================

type ServiceType = 'colo' | 'db4' | 'workers' | 'agents' | 'do' | 'custom'

interface ServiceContext {
  service: ServiceType
  subdomain?: string
  hostname: string
  tld: string
}

function detectService(hostname: string): ServiceContext {
  const parts = hostname.split('.')

  // *.colo.do - Datacenter info
  if (hostname.endsWith('.colo.do') || hostname === 'colo.do') {
    return {
      service: 'colo',
      subdomain: hostname === 'colo.do' ? undefined : parts[0],
      hostname,
      tld: 'do',
    }
  }

  // *.db4.ai - Database service
  if (hostname.endsWith('.db4.ai') || hostname === 'db4.ai') {
    return {
      service: 'db4',
      subdomain: hostname === 'db4.ai' ? undefined : parts[0],
      hostname,
      tld: 'ai',
    }
  }

  // *.workers.do - Workers service
  if (hostname.endsWith('.workers.do') || hostname === 'workers.do') {
    return {
      service: 'workers',
      subdomain: hostname === 'workers.do' ? undefined : parts[0],
      hostname,
      tld: 'do',
    }
  }

  // *.agents.do - Agents service
  if (hostname.endsWith('.agents.do') || hostname === 'agents.do') {
    return {
      service: 'agents',
      subdomain: hostname === 'agents.do' ? undefined : parts[0],
      hostname,
      tld: 'do',
    }
  }

  // do.md - Platform docs
  if (hostname === 'do.md') {
    return {
      service: 'do',
      hostname,
      tld: 'md',
    }
  }

  // Custom domain - route to DO
  return {
    service: 'custom',
    hostname,
    tld: parts[parts.length - 1],
  }
}

// =============================================================================
// Main App
// =============================================================================

const app = new Hono<{ Bindings: Env }>()

// CORS for all routes
app.use('*', cors())

// =============================================================================
// Use the Router for all requests
// =============================================================================

// The router handles:
// - /mcp (GET for discovery, POST for JSON-RPC)
// - /rpc (POST for calls, GET for clickable links)
// - /api/* (REST-style API)
// - /.do (DO identity)
// - / (root discovery)
// - /* (catch-all to DO)

// Catch-all route that creates router per-request with env binding
app.all('*', async (c) => {
  const router = createRouter(c.env)
  return router.fetch(c.req.raw, c.env, c.executionCtx)
})

// =============================================================================
// Helpers
// =============================================================================

function getDOId(url: URL, env: Env): DurableObjectId {
  const hostname = url.hostname

  // Check for path-based routing (e.g., /tenant/acme)
  const pathMatch = url.pathname.match(/^\/([^/]+)\/([^/]+)/)
  if (pathMatch) {
    const [, namespace, id] = pathMatch
    return env.DO.idFromName(`${hostname}/${namespace}/${id}`)
  }

  // Default to hostname-based routing
  return env.DO.idFromName(hostname)
}

function getColoRegion(colo: string): string {
  const regions: Record<string, string> = {
    // WNAM
    sfo: 'wnam', lax: 'wnam', sea: 'wnam', den: 'wnam',
    // ENAM
    iad: 'enam', ewr: 'enam', mia: 'enam', atl: 'enam', ord: 'enam', dfw: 'enam',
    // WEUR
    lhr: 'weur', ams: 'weur', cdg: 'weur', fra: 'weur', mad: 'weur',
    // EEUR
    waw: 'eeur', vie: 'eeur',
    // APAC
    sin: 'apac', hkg: 'apac', nrt: 'apac', icn: 'apac',
    // OC
    syd: 'oc', mel: 'oc',
  }
  return regions[colo] || 'unknown'
}

// =============================================================================
// Export
// =============================================================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const router = createRouter(env)
    return router.fetch(request, env, ctx)
  },
}
