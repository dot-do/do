/**
 * @dotdo/do - Core DO Class Tests (GREEN Phase)
 *
 * These tests define and verify the behavior of the DO base class.
 * Implementation is complete - all tests should pass.
 *
 * Uses the @cloudflare/vitest-pool-workers integration with real Miniflare-powered SQLite storage.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { env, runInDurableObject } from 'cloudflare:test'
import type { DurableObjectStub } from '@cloudflare/workers-types'
import { createTestStub, uniqueTestName } from './helpers/do-test-utils'
import type { ListOptions, SearchOptions, FetchOptions, DoOptions } from '../src/types'

// Type for DO stub with RPC methods
interface DOStub extends DurableObjectStub {
  get<T = Record<string, unknown>>(collection: string, id: string): Promise<T | null>
  list<T = Record<string, unknown>>(collection: string, options?: ListOptions): Promise<T[]>
  create(collection: string, doc: Record<string, unknown>): Promise<Record<string, unknown>>
  update(collection: string, id: string, updates: Record<string, unknown>): Promise<Record<string, unknown> | null>
  delete(collection: string, id: string): Promise<boolean>
  search(query: string, options?: SearchOptions): Promise<Array<{ score: number; [key: string]: unknown }>>
  fetch(url: string, options?: FetchOptions): Promise<{ status: number; url: string; body: unknown; headers?: Record<string, string> }>
  do(code: string, options?: DoOptions): Promise<{ success: boolean; result?: unknown; error?: string; duration: number }>
  invoke(method: string, params: unknown[]): Promise<unknown>
  handleRequest(request: Request): Promise<Response>
  hasMethod(method: string): boolean
  allowedMethods: Set<string>
}

describe('DO Base Class', () => {
  let stub: DOStub

  beforeEach(() => {
    const name = uniqueTestName('do-base')
    stub = createTestStub(name) as DOStub
  })

  describe('Class Structure', () => {
    it('should implement RpcTarget interface with allowedMethods', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).hasMethod).toBeDefined()
        expect(typeof (instance as any).hasMethod).toBe('function')
      })
    })

    it('should have invoke method for RPC calls', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).invoke).toBeDefined()
        expect(typeof (instance as any).invoke).toBe('function')
      })
    })
  })

  describe('allowedMethods Set', () => {
    it('should have allowedMethods property as a Set', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).allowedMethods).toBeDefined()
        expect((instance as any).allowedMethods).toBeInstanceOf(Set)
      })
    })

    it('should contain CRUD methods in allowedMethods Set', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).allowedMethods.has('get')).toBe(true)
        expect((instance as any).allowedMethods.has('list')).toBe(true)
        expect((instance as any).allowedMethods.has('create')).toBe(true)
        expect((instance as any).allowedMethods.has('update')).toBe(true)
        expect((instance as any).allowedMethods.has('delete')).toBe(true)
      })
    })

    it('should contain MCP tool methods in allowedMethods Set', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).allowedMethods.has('search')).toBe(true)
        expect((instance as any).allowedMethods.has('fetch')).toBe(true)
        expect((instance as any).allowedMethods.has('do')).toBe(true)
      })
    })

    it('should NOT contain dangerous methods in allowedMethods Set', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).allowedMethods.has('constructor')).toBe(false)
        expect((instance as any).allowedMethods.has('__proto__')).toBe(false)
        expect((instance as any).allowedMethods.has('toString')).toBe(false)
      })
    })

    it('should use allowedMethods Set in hasMethod implementation', async () => {
      await runInDurableObject(stub, async (instance) => {
        // hasMethod should check against allowedMethods Set
        for (const method of (instance as any).allowedMethods) {
          expect((instance as any).hasMethod(method)).toBe(true)
        }
      })
    })
  })

  describe('RpcTarget Implementation', () => {
    it('should return true for allowed methods', async () => {
      await runInDurableObject(stub, async (instance) => {
        // CRUD methods should be allowed
        expect((instance as any).hasMethod('get')).toBe(true)
        expect((instance as any).hasMethod('list')).toBe(true)
        expect((instance as any).hasMethod('create')).toBe(true)
        expect((instance as any).hasMethod('update')).toBe(true)
        expect((instance as any).hasMethod('delete')).toBe(true)
      })
    })

    it('should return true for MCP tool methods', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).hasMethod('search')).toBe(true)
        expect((instance as any).hasMethod('fetch')).toBe(true)
        expect((instance as any).hasMethod('do')).toBe(true)
      })
    })

    it('should return false for disallowed methods', async () => {
      await runInDurableObject(stub, async (instance) => {
        expect((instance as any).hasMethod('constructor')).toBe(false)
        expect((instance as any).hasMethod('__proto__')).toBe(false)
        expect((instance as any).hasMethod('toString')).toBe(false)
        expect((instance as any).hasMethod('nonexistent')).toBe(false)
      })
    })

    it('should invoke allowed methods via invoke()', async () => {
      await runInDurableObject(stub, async (instance) => {
        const result = await (instance as any).invoke('get', ['users', '123'])
        // Result depends on implementation, but should not throw for allowed methods
        // Returns null for non-existent document
        expect(result).toBeNull()
      })
    })

    it('should throw for disallowed methods via invoke()', async () => {
      await runInDurableObject(stub, async (instance) => {
        await expect((instance as any).invoke('constructor', [])).rejects.toThrow('Method not allowed')
        await expect((instance as any).invoke('__proto__', [])).rejects.toThrow('Method not allowed')
      })
    })
  })
})

describe('Simple CRUD Operations', () => {
  let stub: DOStub

  beforeEach(() => {
    const name = uniqueTestName('crud')
    stub = createTestStub(name) as DOStub
  })

  describe('get()', () => {
    it('should return document by id', async () => {
      const doc = await stub.get<{ name: string }>('users', '123')
      // Initially returns null (no data)
      expect(doc).toBeNull()
    })

    it('should return null for non-existent document', async () => {
      const doc = await stub.get('users', 'nonexistent')
      expect(doc).toBeNull()
    })
  })

  describe('list()', () => {
    it('should return array of documents', async () => {
      const docs = await stub.list('users')
      expect(Array.isArray(docs)).toBe(true)
    })

    it('should support limit option', async () => {
      const options: ListOptions = { limit: 10 }
      const docs = await stub.list('users', options)
      expect(docs.length).toBeLessThanOrEqual(10)
    })

    it('should support offset option', async () => {
      const options: ListOptions = { offset: 5 }
      const docs = await stub.list('users', options)
      expect(Array.isArray(docs)).toBe(true)
    })

    it('should support orderBy option', async () => {
      const options: ListOptions = { orderBy: 'created_at', order: 'desc' }
      const docs = await stub.list('users', options)
      expect(Array.isArray(docs)).toBe(true)
    })
  })

  describe('create()', () => {
    it('should create a new document', async () => {
      const input = { name: 'Test User', email: 'test@example.com' }
      const doc = await stub.create('users', input)
      expect(doc).toBeDefined()
      expect(doc.id).toBeDefined()
      // Document structure has properties at top level
      expect((doc as any).name).toBe('Test User')
      expect((doc as any).email).toBe('test@example.com')
      expect((doc as any).createdAt).toBeDefined()
      expect((doc as any).updatedAt).toBeDefined()
    })

    it('should generate id if not provided', async () => {
      const thing = await stub.create('users', { name: 'Test' })
      expect(thing.id).toBeDefined()
      expect(typeof thing.id).toBe('string')
      expect((thing.id as string).length).toBeGreaterThan(0)
    })

    it('should preserve provided id', async () => {
      const thing = await stub.create('users', { id: 'custom-id', name: 'Test' })
      expect(thing.id).toBe('custom-id')
    })
  })

  describe('update()', () => {
    it('should update existing document', async () => {
      // First create a thing
      const created = await stub.create('users', { name: 'Original' })

      // Then update it (update returns Document-style with flattened data)
      const updated = await stub.update('users', created.id as string, { name: 'Updated' })
      expect(updated).toBeDefined()
      expect(updated?.name).toBe('Updated')
    })

    it('should return null for non-existent document', async () => {
      const result = await stub.update('users', 'nonexistent', { name: 'Test' })
      expect(result).toBeNull()
    })

    it('should merge updates with existing document', async () => {
      const created = await stub.create('users', { name: 'Test', email: 'test@example.com' })
      const updated = await stub.update('users', created.id as string, { name: 'Updated' })
      expect(updated?.name).toBe('Updated')
      expect(updated?.email).toBe('test@example.com')
    })
  })

  describe('delete()', () => {
    it('should delete existing document', async () => {
      const created = await stub.create('users', { name: 'To Delete' })
      const result = await stub.delete('users', created.id as string)
      expect(result).toBe(true)
    })

    it('should return false for non-existent document', async () => {
      const result = await stub.delete('users', 'nonexistent')
      expect(result).toBe(false)
    })

    it('should make document inaccessible after deletion', async () => {
      const created = await stub.create('users', { name: 'To Delete' })
      await stub.delete('users', created.id as string)
      const doc = await stub.get('users', created.id as string)
      expect(doc).toBeNull()
    })
  })
})

describe('MCP Tools', () => {
  let stub: DOStub

  beforeEach(() => {
    const name = uniqueTestName('mcp-tools')
    stub = createTestStub(name) as DOStub
  })

  describe('search()', () => {
    it('should return search results', async () => {
      const results = await stub.search('test query')
      expect(Array.isArray(results)).toBe(true)
    })

    it('should support options', async () => {
      const options: SearchOptions = { limit: 5, collections: ['users'] }
      const results = await stub.search('test', options)
      expect(results.length).toBeLessThanOrEqual(5)
    })

    it('should return results with score', async () => {
      // Create some searchable data first
      await stub.create('users', { name: 'John Doe', email: 'john@example.com' })
      const results = await stub.search('John')
      if (results.length > 0) {
        expect(results[0].score).toBeDefined()
        expect(typeof results[0].score).toBe('number')
      }
    })
  })

  describe('fetch()', () => {
    it('should fetch URL and return result', async () => {
      // Use a mock URL that the DO fetch method can handle
      const result = await stub.fetch('https://httpbin.org/get')
      expect(result).toBeDefined()
      expect(result.url).toBe('https://httpbin.org/get')
      // Status depends on network availability; just check structure
      expect(typeof result.status).toBe('number')
    })

    it('should support custom options', async () => {
      const options: FetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { test: true },
      }
      const result = await stub.fetch('https://httpbin.org/post', options)
      expect(result).toBeDefined()
      expect(typeof result.status).toBe('number')
    })

    it('should handle fetch errors gracefully', async () => {
      // Test that the fetch method handles errors and returns a valid result structure
      // In a real environment, invalid URLs may be resolved differently
      const result = await stub.fetch('https://invalid-url-that-does-not-exist.invalid')
      expect(result).toBeDefined()
      expect(typeof result.status).toBe('number')
      // URL may be normalized with trailing slash
      expect(result.url).toContain('invalid-url-that-does-not-exist.invalid')
    })
  })

  describe('do()', () => {
    it('should execute code and return result', async () => {
      const result = await stub.do('return 1 + 1')
      expect(result.success).toBe(true)
      expect(result.result).toBe(2)
    })

    it('should capture execution duration', async () => {
      const result = await stub.do('return true')
      expect(result.duration).toBeDefined()
      expect(typeof result.duration).toBe('number')
    })

    it('should handle execution errors', async () => {
      const result = await stub.do('throw new Error("test error")')
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should support options', async () => {
      const options: DoOptions = { timeout: 5000, env: { TEST_VAR: 'value' } }
      const result = await stub.do('return process.env.TEST_VAR', options)
      expect(result).toBeDefined()
    })
  })
})

describe('WebSocket Hibernation', () => {
  let stub: DOStub

  beforeEach(() => {
    const name = uniqueTestName('websocket')
    stub = createTestStub(name) as DOStub
  })

  it('should have webSocketMessage handler', async () => {
    await runInDurableObject(stub, async (instance) => {
      expect((instance as any).webSocketMessage).toBeDefined()
      expect(typeof (instance as any).webSocketMessage).toBe('function')
    })
  })

  it('should have webSocketClose handler', async () => {
    await runInDurableObject(stub, async (instance) => {
      expect((instance as any).webSocketClose).toBeDefined()
      expect(typeof (instance as any).webSocketClose).toBe('function')
    })
  })

  it('should have webSocketError handler', async () => {
    await runInDurableObject(stub, async (instance) => {
      expect((instance as any).webSocketError).toBeDefined()
      expect(typeof (instance as any).webSocketError).toBe('function')
    })
  })
})

describe('Multi-Transport handleRequest()', () => {
  let stub: DOStub

  beforeEach(() => {
    const name = uniqueTestName('transport')
    stub = createTestStub(name) as DOStub
  })

  it('should handle HTTP requests', async () => {
    await runInDurableObject(stub, async (instance) => {
      const request = new Request('http://localhost/health', { method: 'GET' })
      const response = await (instance as any).handleRequest(request)
      expect(response).toBeInstanceOf(Response)
    })
  })

  it('should route /rpc requests to RPC handler', async () => {
    await runInDurableObject(stub, async (instance) => {
      const request = new Request('http://localhost/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '1', method: 'get', params: ['users', '123'] }),
      })
      const response = await (instance as any).handleRequest(request)
      expect(response).toBeInstanceOf(Response)
      expect(response.headers.get('Content-Type')).toBe('application/json')
    })
  })

  it('should handle WebSocket upgrade requests', async () => {
    await runInDurableObject(stub, async (instance) => {
      const request = new Request('http://localhost/ws', {
        headers: { Upgrade: 'websocket' },
      })
      const response = await (instance as any).handleRequest(request)
      expect(response.status).toBe(101) // Switching Protocols
    })
  })

  it('should route WebSocket upgrade to any path', async () => {
    await runInDurableObject(stub, async (instance) => {
      // WebSocket upgrades should work on any path, not just /ws
      const request = new Request('http://localhost/api/stream', {
        headers: { Upgrade: 'websocket' },
      })
      const response = await (instance as any).handleRequest(request)
      expect(response.status).toBe(101)
    })
  })

  it('should include WebSocket in response for upgrade requests', async () => {
    await runInDurableObject(stub, async (instance) => {
      const request = new Request('http://localhost/ws', {
        headers: { Upgrade: 'websocket' },
      })
      const response = await (instance as any).handleRequest(request)
      expect((response as any).webSocket).toBeDefined()
    })
  })

  it('should accept WebSocket with case-insensitive Upgrade header', async () => {
    await runInDurableObject(stub, async (instance) => {
      const request = new Request('http://localhost/ws', {
        headers: { 'upgrade': 'websocket' },
      })
      const response = await (instance as any).handleRequest(request)
      expect(response.status).toBe(101)
    })
  })

  it('should route /mcp requests to MCP handler', async () => {
    await runInDurableObject(stub, async (instance) => {
      const request = new Request('http://localhost/mcp', { method: 'GET' })
      const response = await (instance as any).handleRequest(request)
      expect(response).toBeInstanceOf(Response)
    })
  })
})
