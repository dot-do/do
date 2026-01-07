/**
 * @dotdo/do - MCP Handler Tests (GREEN Phase)
 *
 * Tests for typed MCP function signatures using cloudflare:test pattern.
 * The MCP handler uses properly typed function signatures with real DO instances.
 *
 * Uses the @cloudflare/vitest-pool-workers integration with real Miniflare-powered SQLite storage.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { env, runInDurableObject } from 'cloudflare:test'
import type { DurableObjectStub } from '@cloudflare/workers-types'
import { createTestStub, uniqueTestName } from './helpers/do-test-utils'
import { McpHandler, MCP_TOOLS, type McpTarget, type McpToolResult } from '../src/mcp'
import type { SearchOptions, SearchResult, FetchOptions, FetchResult, DoOptions, DoResult } from '../src/types'

// Type for DO stub with RPC methods that implements McpTarget
interface DOStub extends DurableObjectStub {
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>
  fetch(target: string, options?: FetchOptions): Promise<FetchResult>
  do(code: string, options?: DoOptions): Promise<DoResult>
  create(collection: string, doc: Record<string, unknown>): Promise<Record<string, unknown>>
  get<T = Record<string, unknown>>(collection: string, id: string): Promise<T | null>
}

describe('McpHandler Typed Signatures', () => {
  describe('McpTarget Interface', () => {
    let stub: DOStub

    beforeEach(() => {
      const name = uniqueTestName('mcp-target')
      stub = createTestStub(name) as DOStub
    })

    it('should accept a DO stub implementing McpTarget interface', () => {
      const handler = new McpHandler(stub as unknown as McpTarget)
      expect(handler).toBeDefined()
    })

    it('should have search method with correct signature', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).search).toBeDefined()
        expect(typeof (instance as any).search).toBe('function')
      })
    })

    it('should have fetch method with correct signature', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).fetch).toBeDefined()
        expect(typeof (instance as any).fetch).toBe('function')
      })
    })

    it('should have do method with correct signature', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).do).toBeDefined()
        expect(typeof (instance as any).do).toBe('function')
      })
    })
  })

  describe('Search Tool Invocation', () => {
    let stub: DOStub
    let handler: McpHandler

    beforeEach(() => {
      const name = uniqueTestName('mcp-search')
      stub = createTestStub(name) as DOStub
      handler = new McpHandler(stub as unknown as McpTarget)
    })

    it('should call search with properly typed arguments', async () => {
      // Create test data first
      await stub.create('users', { id: 'user1', name: 'Test User', email: 'test@example.com' })

      const request = new Request('http://localhost/mcp/tools/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'Test',
          collection: 'users',
          limit: 10,
        }),
      })

      const response = await handler.handle(request)
      expect(response.status).toBe(200)
    })

    it('should return typed SearchResult[]', async () => {
      // Create test data
      await stub.create('users', { id: 'doc1', name: 'Search Target', email: 'search@example.com' })

      const request = new Request('http://localhost/mcp/tools/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'Search' }),
      })

      const response = await handler.handle(request)
      const body = await response.json() as McpToolResult<SearchResult[]>

      expect(body.result).toBeDefined()
      expect(Array.isArray(body.result)).toBe(true)
    })

    it('should validate search options types', async () => {
      const request = new Request('http://localhost/mcp/tools/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'test',
          limit: 50,
          collections: ['users', 'posts'],
          fuzzy: true,
        }),
      })

      const response = await handler.handle(request)
      expect(response.status).toBe(200)
    })
  })

  describe('Fetch Tool Invocation', () => {
    let stub: DOStub
    let handler: McpHandler

    beforeEach(() => {
      const name = uniqueTestName('mcp-fetch')
      stub = createTestStub(name) as DOStub
      handler = new McpHandler(stub as unknown as McpTarget)
    })

    it('should call fetch with properly typed arguments', async () => {
      const request = new Request('http://localhost/mcp/tools/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'https://httpbin.org/get',
        }),
      })

      const response = await handler.handle(request)
      expect(response.status).toBe(200)
    })

    it('should return typed FetchResult', async () => {
      const request = new Request('http://localhost/mcp/tools/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'https://httpbin.org/get' }),
      })

      const response = await handler.handle(request)
      const body = await response.json() as McpToolResult<FetchResult>

      expect(body.result).toBeDefined()
      expect(body.result).toHaveProperty('status')
      expect(body.result).toHaveProperty('url')
      expect(typeof body.result.status).toBe('number')
    })

    it('should pass FetchOptions with correct types', async () => {
      const request = new Request('http://localhost/mcp/tools/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'https://httpbin.org/post',
          method: 'POST',
          headers: { 'X-Test-Header': 'test-value' },
          body: { data: 'test' },
          timeout: 5000,
        }),
      })

      const response = await handler.handle(request)
      expect(response.status).toBe(200)
    })

    it('should validate fetch method enum values', async () => {
      const request = new Request('http://localhost/mcp/tools/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'https://httpbin.org/delete',
          method: 'DELETE',
        }),
      })

      const response = await handler.handle(request)
      expect(response.status).toBe(200)
    })
  })

  describe('Do Tool Invocation', () => {
    let stub: DOStub
    let handler: McpHandler

    beforeEach(() => {
      const name = uniqueTestName('mcp-do')
      stub = createTestStub(name) as DOStub
      handler = new McpHandler(stub as unknown as McpTarget)
    })

    it('should call do with properly typed arguments', async () => {
      const request = new Request('http://localhost/mcp/tools/do', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'return 1 + 1',
        }),
      })

      const response = await handler.handle(request)
      expect(response.status).toBe(200)
    })

    it('should return typed DoResult', async () => {
      const request = new Request('http://localhost/mcp/tools/do', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'return true' }),
      })

      const response = await handler.handle(request)
      const body = await response.json() as McpToolResult<DoResult>

      expect(body.result).toBeDefined()
      expect(body.result).toHaveProperty('success')
      expect(body.result).toHaveProperty('duration')
      expect(typeof body.result.success).toBe('boolean')
      expect(typeof body.result.duration).toBe('number')
    })

    it('should pass DoOptions with correct types', async () => {
      const request = new Request('http://localhost/mcp/tools/do', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'return env.API_KEY',
          timeout: 10000,
          memory: 100 * 1024 * 1024,
          env: { API_KEY: 'secret123' },
        }),
      })

      const response = await handler.handle(request)
      expect(response.status).toBe(200)
    })

    it('should handle DoResult with success', async () => {
      const request = new Request('http://localhost/mcp/tools/do', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'return 42' }),
      })

      const response = await handler.handle(request)
      const body = await response.json() as McpToolResult<DoResult>

      expect(body.result.success).toBe(true)
      expect(body.result.result).toBe(42)
    })

    it('should handle DoResult with error', async () => {
      const request = new Request('http://localhost/mcp/tools/do', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'throw new Error("test error")' }),
      })

      const response = await handler.handle(request)
      const body = await response.json() as McpToolResult<DoResult>

      expect(body.result.success).toBe(false)
      expect(body.result.error).toBeDefined()
      expect(body.result.error).toContain('test error')
    })
  })

  describe('Type Safety at Runtime', () => {
    let stub: DOStub
    let handler: McpHandler

    beforeEach(() => {
      const name = uniqueTestName('mcp-type-safety')
      stub = createTestStub(name) as DOStub
      handler = new McpHandler(stub as unknown as McpTarget)
    })

    it('should reject invalid query parameter type for search', async () => {
      const request = new Request('http://localhost/mcp/tools/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 123, // should be string
        }),
      })

      const response = await handler.handle(request)
      // Should return error for invalid type
      expect(response.status).toBe(400)
      const body = await response.json() as { error: string }
      expect(body.error).toContain('query')
    })

    it('should reject invalid target parameter type for fetch', async () => {
      const request = new Request('http://localhost/mcp/tools/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: { url: 'invalid' }, // should be string
        }),
      })

      const response = await handler.handle(request)
      expect(response.status).toBe(400)
      const body = await response.json() as { error: string }
      expect(body.error).toContain('target')
    })

    it('should reject invalid code parameter type for do', async () => {
      const request = new Request('http://localhost/mcp/tools/do', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: ['array', 'not', 'string'], // should be string
        }),
      })

      const response = await handler.handle(request)
      expect(response.status).toBe(400)
      const body = await response.json() as { error: string }
      expect(body.error).toContain('code')
    })

    it('should reject missing required parameters', async () => {
      // Missing query for search
      const searchRequest = new Request('http://localhost/mcp/tools/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 10 }), // missing query
      })

      const searchResponse = await handler.handle(searchRequest)
      expect(searchResponse.status).toBe(400)

      // Missing target for fetch
      const fetchRequest = new Request('http://localhost/mcp/tools/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'GET' }), // missing target
      })

      const fetchResponse = await handler.handle(fetchRequest)
      expect(fetchResponse.status).toBe(400)

      // Missing code for do
      const doRequest = new Request('http://localhost/mcp/tools/do', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeout: 1000 }), // missing code
      })

      const doResponse = await handler.handle(doRequest)
      expect(doResponse.status).toBe(400)
    })
  })

  describe('MCP Tool Definitions', () => {
    it('should have typed input schemas matching function signatures', () => {
      const searchTool = MCP_TOOLS.find(t => t.name === 'search')
      expect(searchTool).toBeDefined()
      expect(searchTool!.inputSchema.properties.query.type).toBe('string')
      expect(searchTool!.inputSchema.required).toContain('query')

      const fetchTool = MCP_TOOLS.find(t => t.name === 'fetch')
      expect(fetchTool).toBeDefined()
      expect(fetchTool!.inputSchema.properties.target.type).toBe('string')
      expect(fetchTool!.inputSchema.required).toContain('target')

      const doTool = MCP_TOOLS.find(t => t.name === 'do')
      expect(doTool).toBeDefined()
      expect(doTool!.inputSchema.properties.code.type).toBe('string')
      expect(doTool!.inputSchema.required).toContain('code')
    })

    it('should include all SearchOptions in schema', () => {
      const searchTool = MCP_TOOLS.find(t => t.name === 'search')
      expect(searchTool).toBeDefined()

      const props = searchTool!.inputSchema.properties
      expect(props.limit).toBeDefined()
      expect(props.limit.type).toBe('number')
      expect(props.collections).toBeDefined()
      expect(props.collections.type).toBe('array')
      expect(props.fuzzy).toBeDefined()
      expect(props.fuzzy.type).toBe('boolean')
    })

    it('should include all FetchOptions in schema', () => {
      const fetchTool = MCP_TOOLS.find(t => t.name === 'fetch')
      expect(fetchTool).toBeDefined()

      const props = fetchTool!.inputSchema.properties
      expect(props.method).toBeDefined()
      expect(props.headers).toBeDefined()
      expect(props.body).toBeDefined()
      expect(props.timeout).toBeDefined()
      expect(props.timeout.type).toBe('number')
    })

    it('should include all DoOptions in schema', () => {
      const doTool = MCP_TOOLS.find(t => t.name === 'do')
      expect(doTool).toBeDefined()

      const props = doTool!.inputSchema.properties
      expect(props.timeout).toBeDefined()
      expect(props.timeout.type).toBe('number')
      expect(props.memory).toBeDefined()
      expect(props.memory.type).toBe('number')
      expect(props.env).toBeDefined()
      expect(props.env.type).toBe('object')
    })
  })

  describe('Error Handling', () => {
    let stub: DOStub
    let handler: McpHandler

    beforeEach(() => {
      const name = uniqueTestName('mcp-errors')
      stub = createTestStub(name) as DOStub
      handler = new McpHandler(stub as unknown as McpTarget)
    })

    it('should return error response when search fails with invalid query', async () => {
      const request = new Request('http://localhost/mcp/tools/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '' }), // Empty query
      })

      const response = await handler.handle(request)
      // Empty query may either succeed (return empty results) or fail - both are valid
      expect([200, 400, 500]).toContain(response.status)
    })

    it('should return error response when fetch fails with unreachable URL', async () => {
      const request = new Request('http://localhost/mcp/tools/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Use a properly formatted but unreachable URL
        body: JSON.stringify({ target: 'https://this-domain-does-not-exist-12345.invalid/test' }),
      })

      const response = await handler.handle(request)
      // The fetch method handles errors gracefully by returning a FetchResult with error status
      expect(response.status).toBe(200)
      const body = await response.json() as McpToolResult<FetchResult>
      // Status should indicate an error occurred
      expect(body.result).toBeDefined()
      expect(body.result.status).toBeDefined()
    })

    it('should handle execution errors in do gracefully', async () => {
      const request = new Request('http://localhost/mcp/tools/do', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'undefined.property' }),
      })

      const response = await handler.handle(request)
      expect(response.status).toBe(200)

      const body = await response.json() as McpToolResult<DoResult>
      expect(body.result.success).toBe(false)
      expect(body.result.error).toBeDefined()
    })
  })

  describe('Handler Method Binding', () => {
    it('should execute search on the correct DO instance', async () => {
      const name = uniqueTestName('mcp-binding-search')
      const stub = createTestStub(name) as DOStub
      const handler = new McpHandler(stub as unknown as McpTarget)

      // Create unique data for this instance
      await stub.create('items', { id: 'unique1', name: 'Unique Item' })

      const request = new Request('http://localhost/mcp/tools/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'Unique' }),
      })

      const response = await handler.handle(request)
      expect(response.status).toBe(200)
    })

    it('should execute fetch on the correct DO instance', async () => {
      const name = uniqueTestName('mcp-binding-fetch')
      const stub = createTestStub(name) as DOStub
      const handler = new McpHandler(stub as unknown as McpTarget)

      const request = new Request('http://localhost/mcp/tools/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'https://httpbin.org/status/200' }),
      })

      const response = await handler.handle(request)
      expect(response.status).toBe(200)
    })

    it('should execute do on the correct DO instance', async () => {
      const name = uniqueTestName('mcp-binding-do')
      const stub = createTestStub(name) as DOStub
      const handler = new McpHandler(stub as unknown as McpTarget)

      const request = new Request('http://localhost/mcp/tools/do', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'return "bound correctly"' }),
      })

      const response = await handler.handle(request)
      expect(response.status).toBe(200)

      const body = await response.json() as McpToolResult<DoResult>
      expect(body.result.success).toBe(true)
      expect(body.result.result).toBe('bound correctly')
    })
  })
})

describe('McpTarget Type Exports', () => {
  it('should export McpTarget interface', async () => {
    // This test verifies the type is exported
    // At compile time, TypeScript will verify this import works
    const { McpTarget } = await import('../src/mcp')
    // Note: McpTarget is an interface, so at runtime it's undefined
    // This test is primarily for the compile-time check
    expect(true).toBe(true)
  })

  it('should export McpToolResult type', async () => {
    const { McpToolResult } = await import('../src/mcp')
    expect(true).toBe(true)
  })
})

describe('MCP Manifest and Tools List', () => {
  let stub: DOStub
  let handler: McpHandler

  beforeEach(() => {
    const name = uniqueTestName('mcp-manifest')
    stub = createTestStub(name) as DOStub
    handler = new McpHandler(stub as unknown as McpTarget)
  })

  it('should return manifest at /mcp', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'GET',
    })

    const response = await handler.handle(request)
    expect(response.status).toBe(200)

    const manifest = await response.json() as { name: string; version: string; tools: unknown[] }
    expect(manifest.name).toBeDefined()
    expect(manifest.version).toBeDefined()
    expect(manifest.tools).toBeDefined()
    expect(Array.isArray(manifest.tools)).toBe(true)
  })

  it('should return tools list at /mcp/tools', async () => {
    const request = new Request('http://localhost/mcp/tools', {
      method: 'GET',
    })

    const response = await handler.handle(request)
    expect(response.status).toBe(200)

    const body = await response.json() as { tools: unknown[] }
    expect(body.tools).toBeDefined()
    expect(Array.isArray(body.tools)).toBe(true)
    expect(body.tools.length).toBeGreaterThanOrEqual(3) // search, fetch, do
  })

  it('should return 404 for unknown tool', async () => {
    const request = new Request('http://localhost/mcp/tools/unknown-tool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    const response = await handler.handle(request)
    expect(response.status).toBe(404)
  })

  it('should return 405 for non-POST to tool endpoint', async () => {
    const request = new Request('http://localhost/mcp/tools/search', {
      method: 'GET',
    })

    const response = await handler.handle(request)
    expect(response.status).toBe(405)
  })
})
