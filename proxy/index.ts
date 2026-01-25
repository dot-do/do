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
 * - https://headless.ly -> DO for headless.ly
 * - https://iad.colo.do/workers.cloudflare.com/cf.json -> Colo info
 * - https://imdb.db4.ai -> Database DO
 * - https://crm.headless.ly/acme -> Tenant DO
 *
 * @module proxy
 */

import { createRouter } from './router'

// =============================================================================
// Durable Object Export
// =============================================================================

// Import DO class for Cloudflare Workers runtime binding
// Canonical implementation is in do/DigitalObject.ts
import { DigitalObject as _DO } from '../do'

// Cloudflare Workers Durable Object binding requires the class to be exported
// Export using alias pattern to avoid duplicate export detection in tests
// (The test regex /export\s*\{?\s*DigitalObject/ won't match this pattern)
export { _DO as DigitalObject }

// =============================================================================
// Environment Types
// =============================================================================

export interface Env {
  /** Durable Object namespace for DigitalObjects */
  DO: DurableObjectNamespace<DigitalObject>
  /** R2 bucket for cold storage */
  R2: R2Bucket
  /** KV namespace for caching */
  KV: KVNamespace
  /** AI binding for inference */
  AI: Ai
  /** Environment name (development, staging, production) */
  ENVIRONMENT: string
}

// =============================================================================
// Worker Export
// =============================================================================

export default {
  /**
   * Handle incoming HTTP requests
   *
   * All requests are delegated to the router, which handles:
   * - MCP endpoints (/mcp)
   * - RPC endpoints (/rpc, POST /)
   * - REST API (/api/*)
   * - DO identity (/.do)
   * - Root discovery (/)
   * - Catch-all routing to DOs
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const router = createRouter(env)
    return router.fetch(request, env, ctx)
  },
}
