/**
 * Tests for DO - Universal DO Runtime
 *
 * Uses @cloudflare/vitest-pool-workers with real bindings.
 * Each test uses a unique DO name to avoid storage isolation issues.
 */

import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import type { DODefinition } from '../src/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonResponse = any

// Unique ID per test to avoid DO storage collisions
// Must be valid domain format (contains at least one dot)
let counter = 0
const uid = () => `test-${++counter}.do`

// Helpers
const createDef = (id: string, overrides: Partial<DODefinition> = {}): DODefinition => ({
  $id: id,
  $type: 'SaaS',
  api: { ping: 'async () => "pong"', echo: 'async (msg) => msg', add: 'async (a, b) => a + b' },
  ...overrides,
})

const req = (url: string, id: string, init?: RequestInit) => {
  const h = new Headers(init?.headers)
  h.set('X-DO-Name', id)
  return new Request(url, { ...init, headers: h })
}

const stub = (id: string) => env.DO.get(env.DO.idFromName(id))
const setup = async (id: string, def: DODefinition) => env.REGISTRY.put(id, JSON.stringify({ definition: def }))

// =============================================================================
// Definition Loading
// =============================================================================

describe('DO definition loading', () => {
  it('loads definition by ID', async () => {
    const id = uid()
    await setup(id, createDef(id))
    const r = await stub(id).fetch(req('https://x/__schema', id))
    expect(r.status).toBe(200)
    expect((await r.json() as JsonResponse).$id).toBe(id)
  })

  it('handles missing definition', async () => {
    const id = uid()
    const r = await stub(id).fetch(req('https://x/rpc', id, { method: 'POST', body: '{}' }))
    expect(r.status).toBe(404)
  })

  it('validates definition schema', async () => {
    const id = uid()
    await env.REGISTRY.put(id, JSON.stringify({ definition: { invalid: true } }))
    const r = await stub(id).fetch(req('https://x/__schema', id))
    expect(r.status).toBe(400)
  })

  it('loads definition with version', async () => {
    const id = uid()
    await setup(id, createDef(id, { $version: '1.0.0' }))
    const r = await stub(id).fetch(req('https://x/__schema', id))
    expect((await r.json() as JsonResponse).$version).toBe('1.0.0')
  })
})

// =============================================================================
// RPC Handling
// =============================================================================

describe('DO RPC', () => {
  const rpcDef = (id: string) => createDef(id, {
    api: {
      ping: 'async () => "pong"',
      echo: 'async (msg) => msg',
      add: 'async (a, b) => a + b',
      users: { list: 'async () => ["alice", "bob"]', get: 'async (id) => ({ id })' },
      billing: { plans: { get: 'async (id) => ({ id, price: 99 })' } },
      throwError: 'async () => { throw new Error("intentional") }',
    },
  })

  it('executes simple methods', async () => {
    const id = uid()
    await setup(id, rpcDef(id))
    const r = await stub(id).fetch(req('https://x/rpc', id, {
      method: 'POST',
      body: JSON.stringify({ method: 'ping', params: [] }),
    }))
    expect(r.status).toBe(200)
    expect((await r.json() as JsonResponse).result).toBe('pong')
  })

  it('executes methods with parameters', async () => {
    const id = uid()
    await setup(id, rpcDef(id))
    const r = await stub(id).fetch(req('https://x/rpc', id, {
      method: 'POST',
      body: JSON.stringify({ method: 'add', params: [5, 3] }),
    }))
    expect((await r.json() as JsonResponse).result).toBe(8)
  })

  it('handles nested namespaces', async () => {
    const id = uid()
    await setup(id, rpcDef(id))
    const r = await stub(id).fetch(req('https://x/rpc', id, {
      method: 'POST',
      body: JSON.stringify({ method: 'users.list', params: [] }),
    }))
    expect((await r.json() as JsonResponse).result).toEqual(['alice', 'bob'])
  })

  it('handles deeply nested namespaces', async () => {
    const id = uid()
    await setup(id, rpcDef(id))
    const r = await stub(id).fetch(req('https://x/rpc', id, {
      method: 'POST',
      body: JSON.stringify({ method: 'billing.plans.get', params: ['pro'] }),
    }))
    expect((await r.json() as JsonResponse).result).toEqual({ id: 'pro', price: 99 })
  })

  it('returns JSON-RPC format', async () => {
    const id = uid()
    await setup(id, rpcDef(id))
    const r = await stub(id).fetch(req('https://x/rpc', id, {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: [] }),
    }))
    const body = await r.json() as JsonResponse
    expect(body.jsonrpc).toBe('2.0')
    expect(body.result).toBe('pong')
  })

  it('returns 404 for unknown methods', async () => {
    const id = uid()
    await setup(id, rpcDef(id))
    const r = await stub(id).fetch(req('https://x/rpc', id, {
      method: 'POST',
      body: JSON.stringify({ method: 'nonexistent', params: [] }),
    }))
    expect(r.status).toBe(404)
  })

  it('handles execution errors', async () => {
    const id = uid()
    await setup(id, rpcDef(id))
    const r = await stub(id).fetch(req('https://x/rpc', id, {
      method: 'POST',
      body: JSON.stringify({ method: 'throwError', params: [] }),
    }))
    expect(r.status).toBe(500)
    expect((await r.json() as JsonResponse).error.message).toMatch(/intentional/i)
  })

  it('handles invalid JSON', async () => {
    const id = uid()
    await setup(id, rpcDef(id))
    const r = await stub(id).fetch(req('https://x/rpc', id, { method: 'POST', body: 'invalid' }))
    expect(r.status).toBe(400)
  })

  it('handles REST-style /api routes', async () => {
    const id = uid()
    await setup(id, rpcDef(id))
    const r = await stub(id).fetch(req('https://x/api/users.list', id, { method: 'POST' }))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual(['alice', 'bob'])
  })

  it('supports path-based /rpc/method', async () => {
    const id = uid()
    await setup(id, rpcDef(id))
    const r = await stub(id).fetch(req('https://x/rpc/ping', id, { method: 'POST' }))
    expect((await r.json() as JsonResponse).result).toBe('pong')
  })
})

// =============================================================================
// Function Execution
// =============================================================================

describe('DO function execution', () => {
  it('executes async functions', async () => {
    const id = uid()
    await setup(id, createDef(id, {
      api: { asyncOp: 'async () => { await new Promise(r => setTimeout(r, 5)); return "done" }' },
    }))
    const r = await stub(id).fetch(req('https://x/rpc', id, {
      method: 'POST',
      body: JSON.stringify({ method: 'asyncOp', params: [] }),
    }))
    expect((await r.json() as JsonResponse).result).toBe('done')
  })

  it('injects $ context', async () => {
    const id = uid()
    await setup(id, createDef(id, { api: { getId: 'async () => $.$id' } }))
    const r = await stub(id).fetch(req('https://x/rpc', id, {
      method: 'POST',
      body: JSON.stringify({ method: 'getId', params: [] }),
    }))
    expect((await r.json() as JsonResponse).result).toBe(id)
  })

  it('blocks dangerous globals', async () => {
    const id = uid()
    await setup(id, createDef(id, { api: { bad: 'async () => process.env' } }))
    const r = await stub(id).fetch(req('https://x/rpc', id, {
      method: 'POST',
      body: JSON.stringify({ method: 'bad', params: [] }),
    }))
    expect(r.status).toBe(500)
  })
})

// =============================================================================
// Site/App Serving
// =============================================================================

describe('DO site serving', () => {
  it('serves site root', async () => {
    const id = uid()
    await setup(id, createDef(id, { site: { '/': '# Home' } }))
    const r = await stub(id).fetch(req('https://x/', id))
    expect(r.status).toBe(200)
    expect(await r.text()).toBe('# Home')
  })

  it('serves site pages', async () => {
    const id = uid()
    await setup(id, createDef(id, { site: { '/': '# Home', '/about': '# About' } }))
    const r = await stub(id).fetch(req('https://x/about', id))
    expect(await r.text()).toBe('# About')
  })

  it('serves app pages', async () => {
    const id = uid()
    await setup(id, createDef(id, { app: { '/dashboard': '# Dashboard' } }))
    const r = await stub(id).fetch(req('https://x/app/dashboard', id))
    expect(await r.text()).toBe('# Dashboard')
  })

  it('returns 404 for missing pages', async () => {
    const id = uid()
    await setup(id, createDef(id, { site: { '/': '# Home' } }))
    const r = await stub(id).fetch(req('https://x/nope', id))
    expect(r.status).toBe(404)
  })

  it('serves string site', async () => {
    const id = uid()
    await setup(id, createDef(id, { site: '# Simple' }))
    const r = await stub(id).fetch(req('https://x/', id))
    expect(await r.text()).toBe('# Simple')
  })
})

// =============================================================================
// Schema Generation
// =============================================================================

describe('DO schema', () => {
  it('generates schema', async () => {
    const id = uid()
    await setup(id, createDef(id))
    const r = await stub(id).fetch(req('https://x/__schema', id))
    const s = await r.json() as JsonResponse
    expect(s.$id).toBe(id)
    expect(s.methods).toContain('ping')
  })

  it('includes nested methods', async () => {
    const id = uid()
    await setup(id, createDef(id, { api: { users: { list: 'async () => []' } } }))
    const r = await stub(id).fetch(req('https://x/__schema', id))
    expect((await r.json() as JsonResponse).methods).toContain('users.list')
  })

  it('includes site/app routes', async () => {
    const id = uid()
    await setup(id, createDef(id, { site: { '/': '#' }, app: { '/dash': '#' } }))
    const r = await stub(id).fetch(req('https://x/__schema', id))
    const s = await r.json() as JsonResponse
    expect(s.site).toContain('/')
    expect(s.app).toContain('/dash')
  })
})

// =============================================================================
// Event Handling
// =============================================================================

describe('DO events', () => {
  it('handles events', async () => {
    const id = uid()
    await setup(id, createDef(id, { events: { 'user.created': 'async (d) => ({ ok: true, id: d.id })' } }))
    const r = await stub(id).fetch(req('https://x/__event', id, {
      method: 'POST',
      body: JSON.stringify({ event: 'user.created', data: { id: '123' } }),
    }))
    const body = await r.json() as JsonResponse
    expect(body.handled).toBe(true)
    expect(body.result.ok).toBe(true)
  })

  it('ignores unhandled events', async () => {
    const id = uid()
    await setup(id, createDef(id))
    const r = await stub(id).fetch(req('https://x/__event', id, {
      method: 'POST',
      body: JSON.stringify({ event: 'unknown', data: {} }),
    }))
    expect((await r.json() as JsonResponse).handled).toBe(false)
  })
})

// =============================================================================
// MCP
// =============================================================================

describe('DO MCP', () => {
  it('exposes /mcp endpoint', async () => {
    const id = uid()
    await setup(id, createDef(id))
    const r = await stub(id).fetch(req('https://x/mcp', id))
    expect((await r.json() as JsonResponse).name).toBe(id)
  })

  it('lists tools', async () => {
    const id = uid()
    await setup(id, createDef(id))
    const r = await stub(id).fetch(req('https://x/mcp', id, {
      method: 'POST',
      body: JSON.stringify({ method: 'tools/list' }),
    }))
    expect((await r.json() as JsonResponse).tools).toBeDefined()
  })

  it('calls tools', async () => {
    const id = uid()
    await setup(id, createDef(id))
    const r = await stub(id).fetch(req('https://x/mcp', id, {
      method: 'POST',
      body: JSON.stringify({ method: 'tools/call', params: { name: 'ping', arguments: {} } }),
    }))
    expect((await r.json() as JsonResponse).content[0].text).toBe('pong')
  })
})

// =============================================================================
// Definition Updates
// =============================================================================

describe('DO definition updates', () => {
  it('allows PUT with auth', async () => {
    const id = uid()
    const r = await stub(id).fetch(req('https://x/', id, {
      method: 'PUT',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify(createDef(id)),
    }))
    expect(r.status).toBe(200)
  })

  it('requires auth for PUT', async () => {
    const id = uid()
    const r = await stub(id).fetch(req('https://x/', id, {
      method: 'PUT',
      body: JSON.stringify(createDef(id)),
    }))
    expect(r.status).toBe(401)
  })
})
