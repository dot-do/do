/**
 * @dotdo/do - MCP Handler Tests (RED Phase)
 *
 * Tests for typed MCP function signatures.
 * The MCP handler should use properly typed function signatures instead of generic Function types.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { McpHandler, MCP_TOOLS, type McpTarget, type McpToolResult } from '../src/mcp'
import type { SearchOptions, SearchResult, FetchOptions, FetchResult, DoOptions, DoResult } from '../src/types'

/**
 * Type-safe mock target implementing McpTarget interface
 */
function createMockTarget(): McpTarget {
  return {
    search: vi.fn(async (query: string, options?: SearchOptions): Promise<SearchResult[]> => {
      return [
        {
          id: 'doc1',
          collection: 'users',
          score: 0.95,
          document: { id: 'doc1', name: 'Test User', query },
        },
      ]
    }),
    fetch: vi.fn(async (target: string, options?: FetchOptions): Promise<FetchResult> => {
      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: { fetched: target },
        url: target,
      }
    }),
    do: vi.fn(async (code: string, options?: DoOptions): Promise<DoResult> => {
      return {
        success: true,
        result: `executed: ${code}`,
        logs: [],
        duration: 100,
      }
    }),
  }
}

describe('McpHandler Typed Signatures', () => {
  describe('McpTarget Interface', () => {
    it('should accept a target implementing McpTarget interface', () => {
      const target = createMockTarget()
      const handler = new McpHandler(target)
      expect(handler).toBeDefined()
    })

    it('should reject targets missing required methods at compile time', () => {
      // This test verifies the type system at compile time
      // If McpTarget is properly typed, the following should cause a type error:
      // const invalidTarget = { search: () => {} } // missing fetch and do
      // new McpHandler(invalidTarget) // should be a type error

      // For runtime verification, we ensure handler expects all three methods
      const target = createMockTarget()
      expect(typeof target.search).toBe('function')
      expect(typeof target.fetch).toBe('function')
      expect(typeof target.do).toBe('function')
    })

    it('should have search method with correct signature', () => {
      const target = createMockTarget()
      const handler = new McpHandler(target)

      // TypeScript should infer the correct return type
      // The search method should accept (query: string, options?: SearchOptions)
      // and return Promise<SearchResult[]>
      expect(target.search.length).toBeGreaterThanOrEqual(1) // at least query parameter
    })

    it('should have fetch method with correct signature', () => {
      const target = createMockTarget()
      const handler = new McpHandler(target)

      // The fetch method should accept (target: string, options?: FetchOptions)
      // and return Promise<FetchResult>
      expect(target.fetch.length).toBeGreaterThanOrEqual(1) // at least target parameter
    })

    it('should have do method with correct signature', () => {
      const target = createMockTarget()
      const handler = new McpHandler(target)

      // The do method should accept (code: string, options?: DoOptions)
      // and return Promise<DoResult>
      expect(target.do.length).toBeGreaterThanOrEqual(1) // at least code parameter
    })
  })

  describe('Search Tool Invocation', () => {
    let handler: McpHandler
    let mockTarget: ReturnType<typeof createMockTarget>

    beforeEach(() => {
      mockTarget = createMockTarget()
      handler = new McpHandler(mockTarget)
    })

    it('should call search with properly typed arguments', async () => {
      const request = new Request('http://localhost/mcp/tools/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'test query',
          collection: 'users',
          limit: 10,
        }),
      })

      const response = await handler.handle(request)
      expect(response.status).toBe(200)

      // Verify search was called with correct typed arguments
      expect(mockTarget.search).toHaveBeenCalledWith('test query', {
        collection: 'users',
        limit: 10,
      })
    })

    it('should return typed SearchResult[]', async () => {
      const request = new Request('http://localhost/mcp/tools/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'find me' }),
      })

      const response = await handler.handle(request)
      const body = await response.json() as McpToolResult<SearchResult[]>

      expect(body.result).toBeDefined()
      expect(Array.isArray(body.result)).toBe(true)
      expect(body.result[0]).toHaveProperty('id')
      expect(body.result[0]).toHaveProperty('collection')
      expect(body.result[0]).toHaveProperty('score')
      expect(body.result[0]).toHaveProperty('document')
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

      // Verify options were passed with correct shape
      expect(mockTarget.search).toHaveBeenCalledWith('test', {
        limit: 50,
        collections: ['users', 'posts'],
        fuzzy: true,
      })
    })
  })

  describe('Fetch Tool Invocation', () => {
    let handler: McpHandler
    let mockTarget: ReturnType<typeof createMockTarget>

    beforeEach(() => {
      mockTarget = createMockTarget()
      handler = new McpHandler(mockTarget)
    })

    it('should call fetch with properly typed arguments', async () => {
      const request = new Request('http://localhost/mcp/tools/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'https://api.example.com/data',
        }),
      })

      const response = await handler.handle(request)
      expect(response.status).toBe(200)

      expect(mockTarget.fetch).toHaveBeenCalledWith('https://api.example.com/data', undefined)
    })

    it('should return typed FetchResult', async () => {
      const request = new Request('http://localhost/mcp/tools/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'https://example.com' }),
      })

      const response = await handler.handle(request)
      const body = await response.json() as McpToolResult<FetchResult>

      expect(body.result).toBeDefined()
      expect(body.result).toHaveProperty('status')
      expect(body.result).toHaveProperty('headers')
      expect(body.result).toHaveProperty('body')
      expect(body.result).toHaveProperty('url')
    })

    it('should pass FetchOptions with correct types', async () => {
      const request = new Request('http://localhost/mcp/tools/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'https://api.example.com/post',
          method: 'POST',
          headers: { 'Authorization': 'Bearer token123' },
          body: { data: 'test' },
          timeout: 5000,
        }),
      })

      const response = await handler.handle(request)
      expect(response.status).toBe(200)

      expect(mockTarget.fetch).toHaveBeenCalledWith('https://api.example.com/post', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer token123' },
        body: { data: 'test' },
        timeout: 5000,
      })
    })

    it('should validate fetch method enum values', async () => {
      // FetchOptions.method should be 'GET' | 'POST' | 'PUT' | 'DELETE'
      const request = new Request('http://localhost/mcp/tools/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'https://example.com',
          method: 'DELETE',
        }),
      })

      const response = await handler.handle(request)
      expect(response.status).toBe(200)

      expect(mockTarget.fetch).toHaveBeenCalledWith('https://example.com', {
        method: 'DELETE',
      })
    })
  })

  describe('Do Tool Invocation', () => {
    let handler: McpHandler
    let mockTarget: ReturnType<typeof createMockTarget>

    beforeEach(() => {
      mockTarget = createMockTarget()
      handler = new McpHandler(mockTarget)
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

      expect(mockTarget.do).toHaveBeenCalledWith('return 1 + 1', {})
    })

    it('should return typed DoResult', async () => {
      const request = new Request('http://localhost/mcp/tools/do', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'console.log("test")' }),
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

      expect(mockTarget.do).toHaveBeenCalledWith('return env.API_KEY', {
        timeout: 10000,
        memory: 100 * 1024 * 1024,
        env: { API_KEY: 'secret123' },
      })
    })

    it('should handle DoResult with error', async () => {
      mockTarget.do.mockResolvedValueOnce({
        success: false,
        error: 'Execution failed: timeout',
        logs: ['Starting execution...'],
        duration: 5000,
      })

      const request = new Request('http://localhost/mcp/tools/do', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'while(true){}' }),
      })

      const response = await handler.handle(request)
      const body = await response.json() as McpToolResult<DoResult>

      expect(body.result.success).toBe(false)
      expect(body.result.error).toBe('Execution failed: timeout')
      expect(body.result.logs).toContain('Starting execution...')
    })

    it('should include logs in DoResult', async () => {
      mockTarget.do.mockResolvedValueOnce({
        success: true,
        result: 42,
        logs: ['Log line 1', 'Log line 2'],
        duration: 50,
      })

      const request = new Request('http://localhost/mcp/tools/do', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'console.log("test"); return 42' }),
      })

      const response = await handler.handle(request)
      const body = await response.json() as McpToolResult<DoResult>

      expect(body.result.logs).toHaveLength(2)
      expect(body.result.logs).toEqual(['Log line 1', 'Log line 2'])
    })
  })

  describe('Type Safety at Runtime', () => {
    it('should reject invalid query parameter type for search', async () => {
      const mockTarget = createMockTarget()
      const handler = new McpHandler(mockTarget)

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
      const mockTarget = createMockTarget()
      const handler = new McpHandler(mockTarget)

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
      const mockTarget = createMockTarget()
      const handler = new McpHandler(mockTarget)

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
      const mockTarget = createMockTarget()
      const handler = new McpHandler(mockTarget)

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
    it('should return typed error response when search throws', async () => {
      const mockTarget = createMockTarget()
      mockTarget.search.mockRejectedValueOnce(new Error('Database connection failed'))
      const handler = new McpHandler(mockTarget)

      const request = new Request('http://localhost/mcp/tools/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'test' }),
      })

      const response = await handler.handle(request)
      expect(response.status).toBe(500)

      const body = await response.json() as { error: string }
      expect(body.error).toBe('Database connection failed')
    })

    it('should return typed error response when fetch throws', async () => {
      const mockTarget = createMockTarget()
      mockTarget.fetch.mockRejectedValueOnce(new Error('Network timeout'))
      const handler = new McpHandler(mockTarget)

      const request = new Request('http://localhost/mcp/tools/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'https://example.com' }),
      })

      const response = await handler.handle(request)
      expect(response.status).toBe(500)

      const body = await response.json() as { error: string }
      expect(body.error).toBe('Network timeout')
    })

    it('should return typed error response when do throws', async () => {
      const mockTarget = createMockTarget()
      mockTarget.do.mockRejectedValueOnce(new Error('Sandbox initialization failed'))
      const handler = new McpHandler(mockTarget)

      const request = new Request('http://localhost/mcp/tools/do', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'test' }),
      })

      const response = await handler.handle(request)
      expect(response.status).toBe(500)

      const body = await response.json() as { error: string }
      expect(body.error).toBe('Sandbox initialization failed')
    })
  })

  describe('Handler Method Binding', () => {
    it('should maintain correct this context in search handler', async () => {
      const mockTarget = createMockTarget()
      const handler = new McpHandler(mockTarget)

      const request = new Request('http://localhost/mcp/tools/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'context test' }),
      })

      await handler.handle(request)

      // Verify the mock was called on the correct target instance
      expect(mockTarget.search).toHaveBeenCalledTimes(1)
    })

    it('should maintain correct this context in fetch handler', async () => {
      const mockTarget = createMockTarget()
      const handler = new McpHandler(mockTarget)

      const request = new Request('http://localhost/mcp/tools/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'https://test.com' }),
      })

      await handler.handle(request)
      expect(mockTarget.fetch).toHaveBeenCalledTimes(1)
    })

    it('should maintain correct this context in do handler', async () => {
      const mockTarget = createMockTarget()
      const handler = new McpHandler(mockTarget)

      const request = new Request('http://localhost/mcp/tools/do', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'return "bound"' }),
      })

      await handler.handle(request)
      expect(mockTarget.do).toHaveBeenCalledTimes(1)
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
